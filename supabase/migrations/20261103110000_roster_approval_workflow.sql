alter table public.venues
  add column roster_publication_mode text not null default 'direct'
    check (roster_publication_mode in ('direct', 'approval')),
  add column roster_publication_revision bigint not null default 0
    check (roster_publication_revision >= 0);

create table public.roster_publication_mode_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  venue_id uuid not null,
  actor_id uuid,
  old_mode text not null check (old_mode in ('direct', 'approval')),
  new_mode text not null check (new_mode in ('direct', 'approval')),
  revision bigint not null check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues(id, business_id) on delete cascade
);

create table public.roster_review_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  venue_id uuid not null,
  department_id uuid not null,
  week_start date not null check (isfinite(week_start) and extract(isodow from week_start) = 1),
  venue_timezone text not null,
  policy_revision bigint not null check (policy_revision >= 0),
  requested_by uuid not null,
  request_id uuid not null,
  requested_at timestamptz not null default clock_timestamp(),
  foreign key (department_id, business_id, venue_id)
    references public.departments(id, business_id, venue_id) on delete cascade,
  unique (id, business_id),
  unique (business_id, requested_by, request_id)
);

create index roster_review_requests_scope_idx
  on public.roster_review_requests(business_id, venue_id, department_id, week_start, requested_at desc, id desc);

create table public.roster_review_shifts (
  review_id uuid not null,
  business_id uuid not null,
  shift_id uuid not null,
  employee_id uuid,
  employee_name text,
  role_title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null,
  requires_acknowledgement boolean not null,
  foreign key (review_id, business_id)
    references public.roster_review_requests(id, business_id) on delete cascade,
  primary key (review_id, shift_id),
  check ((employee_id is null) = (employee_name is null))
);

create table public.roster_review_decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  review_id uuid not null unique,
  actor_id uuid not null,
  request_id uuid not null,
  decision text not null check (decision in ('approved', 'rejected', 'withdrawn')),
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 500),
  published_count integer not null check (published_count >= 0),
  decided_at timestamptz not null default clock_timestamp(),
  foreign key (review_id, business_id)
    references public.roster_review_requests(id, business_id) on delete cascade,
  unique (business_id, actor_id, request_id),
  check (decision <> 'rejected' or reason is not null),
  check ((decision = 'approved' and published_count > 0)
    or (decision <> 'approved' and published_count = 0))
);

create function public.prevent_roster_review_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.businesses b where b.id = old.business_id
  ) then
    return old;
  end if;
  raise exception 'Roster review records are immutable';
end;
$$;
revoke all on function public.prevent_roster_review_mutation()
  from public, anon, authenticated, service_role;

create trigger roster_publication_mode_events_immutable
  before update or delete on public.roster_publication_mode_events
  for each row execute function public.prevent_roster_review_mutation();
create trigger roster_review_requests_immutable
  before update or delete on public.roster_review_requests
  for each row execute function public.prevent_roster_review_mutation();
create trigger roster_review_shifts_immutable
  before update or delete on public.roster_review_shifts
  for each row execute function public.prevent_roster_review_mutation();
create trigger roster_review_decisions_immutable
  before update or delete on public.roster_review_decisions
  for each row execute function public.prevent_roster_review_mutation();

alter table public.roster_publication_mode_events enable row level security;
alter table public.roster_review_requests enable row level security;
alter table public.roster_review_shifts enable row level security;
alter table public.roster_review_decisions enable row level security;
revoke all on public.roster_publication_mode_events, public.roster_review_requests,
  public.roster_review_shifts, public.roster_review_decisions
  from public, anon, authenticated, service_role;
grant select on public.roster_publication_mode_events, public.roster_review_requests,
  public.roster_review_shifts, public.roster_review_decisions to authenticated;

create policy "Owners can view roster publication mode history"
  on public.roster_publication_mode_events for select to authenticated
  using (public.has_business_role(business_id, array['owner']));
create policy "Managers can view scoped roster review requests"
  on public.roster_review_requests for select to authenticated
  using (public.can_manage_department(business_id, department_id));
create policy "Managers can view scoped roster review shifts"
  on public.roster_review_shifts for select to authenticated
  using (exists (
    select 1 from public.roster_review_requests r
    where r.id = review_id and r.business_id = roster_review_shifts.business_id
      and public.can_manage_department(r.business_id, r.department_id)
  ));
create policy "Managers can view scoped roster review decisions"
  on public.roster_review_decisions for select to authenticated
  using (exists (
    select 1 from public.roster_review_requests r
    where r.id = review_id and r.business_id = roster_review_decisions.business_id
      and public.can_manage_department(r.business_id, r.department_id)
  ));

create trigger sensitive_action_audit
  after insert on public.roster_review_requests
  for each row execute function public.record_sensitive_action_audit();
create trigger sensitive_action_audit
  after insert on public.roster_review_decisions
  for each row execute function public.record_sensitive_action_audit();

create function public.check_roster_publication_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.roster_publication_mode is distinct from old.roster_publication_mode then
    if new.roster_publication_revision <> old.roster_publication_revision + 1 then
      raise exception 'Roster publication revision must advance with its mode';
    end if;
  elsif new.roster_publication_revision <> old.roster_publication_revision then
    raise exception 'Roster publication revision requires a mode change';
  end if;
  return new;
end;
$$;
revoke all on function public.check_roster_publication_revision()
  from public, anon, authenticated, service_role;
create trigger venues_roster_publication_revision_check
  before update of roster_publication_mode, roster_publication_revision on public.venues
  for each row execute function public.check_roster_publication_revision();

create function public.record_roster_publication_mode_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if new.roster_publication_mode is distinct from old.roster_publication_mode then
    insert into public.roster_publication_mode_events (
      business_id, venue_id, actor_id, old_mode, new_mode, revision
    ) values (
      new.business_id, new.id, v_actor, old.roster_publication_mode,
      new.roster_publication_mode, new.roster_publication_revision
    );
    insert into public.sensitive_action_audit (
      business_id, actor_id, actor_kind, source_table, operation, record_id, old_values, new_values
    ) values (
      new.business_id, v_actor, case when v_actor is null then 'database' else 'user' end,
      'venues', 'UPDATE', new.id::text,
      jsonb_build_object('roster_publication_mode', old.roster_publication_mode,
        'roster_publication_revision', old.roster_publication_revision),
      jsonb_build_object('roster_publication_mode', new.roster_publication_mode,
        'roster_publication_revision', new.roster_publication_revision)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.record_roster_publication_mode_change()
  from public, anon, authenticated, service_role;
create trigger venues_roster_publication_mode_audit
  after update of roster_publication_mode on public.venues
  for each row execute function public.record_roster_publication_mode_change();

create function public.save_roster_publication_mode(
  p_business_id uuid, p_venue_id uuid, p_mode text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  if p_mode is null or p_mode not in ('direct', 'approval') then
    raise exception 'Invalid roster publication mode';
  end if;
  perform 1 from public.venues v
  where v.id = p_venue_id and v.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Permission denied';
  end if;
  update public.venues set
    roster_publication_mode = p_mode,
    roster_publication_revision = roster_publication_revision + 1
  where id = p_venue_id and business_id = p_business_id
    and roster_publication_mode is distinct from p_mode;
end;
$$;
revoke all on function public.save_roster_publication_mode(uuid, uuid, text)
  from public, anon, service_role;
grant execute on function public.save_roster_publication_mode(uuid, uuid, text) to authenticated;

create function public.publish_roster_review_internal(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_week_start date,
  p_reviewed_shift_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_mode text;
  v_block_unavailability boolean;
  v_block_overlap boolean;
  v_block_long_shift boolean;
  v_shift_ids uuid[];
  v_employee_ids uuid[];
  v_employee_id uuid;
  v_updated integer;
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  if p_week_start is null or not isfinite(p_week_start)
    or extract(isodow from p_week_start) <> 1 then
    raise exception 'Roster week must start on Monday';
  end if;

  select v.timezone, v.roster_publication_mode, v.block_publish_unavailability,
    v.block_publish_overlap, v.block_publish_long_shift
  into v_timezone, v_mode, v_block_unavailability, v_block_overlap, v_block_long_shift
  from public.venues v
  join public.departments d on d.venue_id = v.id and d.business_id = v.business_id
  where v.id = p_venue_id and v.business_id = p_business_id
    and d.id = p_department_id and d.active
  for share of v, d;
  if not found then
    raise exception 'Venue or active department not found';
  end if;
  if p_reviewed_shift_ids is null and v_mode <> 'direct' then
    raise exception 'Roster approval is required';
  end if;
  if p_reviewed_shift_ids is not null and v_mode <> 'approval' then
    raise exception 'Roster approval settings changed';
  end if;

  begin
    select coalesce(array_agg(draft.id order by draft.id), '{}'::uuid[]) into v_shift_ids
    from (
      select s.id from public.shifts s
      where s.business_id = p_business_id and s.venue_id = p_venue_id
        and s.department_id = p_department_id and s.status = 'scheduled'
        and not s.is_published
        and (s.starts_at at time zone v_timezone)::date between p_week_start and p_week_start + 6
        and (p_reviewed_shift_ids is null or s.id = any(p_reviewed_shift_ids))
      order by s.id
      for update nowait
    ) draft;
  exception when lock_not_available then
    raise exception 'Roster changed while publishing; please try again';
  end;
  if p_reviewed_shift_ids is not null and
    (cardinality(v_shift_ids) = 0 or v_shift_ids is distinct from p_reviewed_shift_ids) then
    raise exception 'Submitted roster changed; withdraw or reject and resubmit';
  end if;
  if cardinality(v_shift_ids) = 0 then
    return 0;
  end if;

  if v_block_unavailability or v_block_overlap then
    select coalesce(array_agg(distinct s.employee_id) filter (where s.employee_id is not null), '{}'::uuid[])
    into v_employee_ids from public.shifts s where s.id = any(v_shift_ids);
    perform public.lock_shared_worker_groups(
      p_business_id, v_employee_ids, 'Roster changed while publishing; please try again'
    );
    for v_employee_id in select unnest(v_employee_ids) order by 1
    loop
      if not pg_try_advisory_xact_lock(hashtextextended(v_employee_id::text, 0)) then
        raise exception 'Roster changed while publishing; please try again';
      end if;
      perform 1 from public.employees e
      where e.id = v_employee_id and e.business_id = p_business_id
        and e.venue_id = p_venue_id
      for share;
      if not found then
        raise exception 'Employee is not eligible for this department';
      end if;
    end loop;
  end if;
  if v_block_long_shift and exists (
    select 1 from public.shifts s
    where s.id = any(v_shift_ids) and s.ends_at - s.starts_at > interval '24 hours'
  ) then
    raise exception 'Roster has shifts longer than 24 hours';
  end if;
  if v_block_overlap and exists (
    select 1 from public.shifts s
    where s.id = any(v_shift_ids) and s.employee_id is not null
      and public.shared_worker_has_overlap(s.business_id, s.employee_id, s.starts_at, s.ends_at, s.id)
  ) then
    raise exception 'Roster has overlapping shifts';
  end if;
  if v_block_unavailability and exists (
    select 1 from public.shifts s
    where s.id = any(v_shift_ids) and s.employee_id is not null
      and case when s.ends_at - s.starts_at > interval '24 hours' then true
        else not public.employee_available_for_shift(s.employee_id, s.starts_at, s.ends_at)
      end
  ) then
    raise exception 'Roster has unavailable employees';
  end if;

  update public.shifts s set is_published = true, published_at = now()
  where s.id = any(v_shift_ids);
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function public.publish_roster_review_internal(uuid, uuid, uuid, date, uuid[])
  from public, anon, authenticated, service_role;

create or replace function public.publish_roster(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_week_start date
)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.publish_roster_review_internal(
    p_business_id, p_venue_id, p_department_id, p_week_start, null
  );
$$;
revoke all on function public.publish_roster(uuid, uuid, uuid, date)
  from public, anon, service_role;
grant execute on function public.publish_roster(uuid, uuid, uuid, date) to authenticated;

create function public.submit_roster_review(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_week_start date, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous public.roster_review_requests%rowtype;
  v_timezone text;
  v_mode text;
  v_revision bigint;
  v_shift_ids uuid[];
  v_review_id uuid;
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if p_request_id is null or p_week_start is null or not isfinite(p_week_start)
    or extract(isodow from p_week_start) <> 1 then
    raise exception 'Invalid roster review request';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  perform pg_advisory_xact_lock(hashtextextended(
    'roster-review-submission:' || auth.uid()::text || ':' || p_request_id::text, 0
  ));
  select * into v_previous from public.roster_review_requests r
  where r.business_id = p_business_id and r.requested_by = auth.uid() and r.request_id = p_request_id;
  if found then
    if (v_previous.venue_id, v_previous.department_id, v_previous.week_start)
      is distinct from (p_venue_id, p_department_id, p_week_start) then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.id;
  end if;

  select v.timezone, v.roster_publication_mode, v.roster_publication_revision
  into v_timezone, v_mode, v_revision
  from public.venues v
  join public.departments d on d.venue_id = v.id and d.business_id = v.business_id
  where v.id = p_venue_id and v.business_id = p_business_id
    and d.id = p_department_id and d.active
  for share of v, d;
  if not found then
    raise exception 'Venue or active department not found';
  end if;
  if v_mode <> 'approval' then
    raise exception 'Roster approval is not enabled';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'roster-review:' || p_department_id::text || ':' || p_week_start::text, 0
  ));
  if exists (
    select 1 from public.roster_review_requests r
    where r.business_id = p_business_id and r.venue_id = p_venue_id
      and r.department_id = p_department_id and r.week_start = p_week_start
      and not exists (select 1 from public.roster_review_decisions d where d.review_id = r.id)
  ) then
    raise exception 'A roster review is already pending';
  end if;

  begin
    select coalesce(array_agg(draft.id order by draft.id), '{}'::uuid[]) into v_shift_ids
    from (
      select s.id from public.shifts s
      where s.business_id = p_business_id and s.venue_id = p_venue_id
        and s.department_id = p_department_id and s.status = 'scheduled' and not s.is_published
        and (s.starts_at at time zone v_timezone)::date between p_week_start and p_week_start + 6
      order by s.id
      for update nowait
    ) draft;
  exception when lock_not_available then
    raise exception 'Roster changed while submitting; please try again';
  end;
  if cardinality(v_shift_ids) = 0 then
    raise exception 'There are no draft shifts to review';
  end if;
  insert into public.roster_review_requests (
    business_id, venue_id, department_id, week_start, venue_timezone, policy_revision,
    requested_by, request_id
  ) values (
    p_business_id, p_venue_id, p_department_id, p_week_start, v_timezone, v_revision,
    auth.uid(), p_request_id
  ) returning id into v_review_id;
  insert into public.roster_review_shifts (
    review_id, business_id, shift_id, employee_id, employee_name, role_title,
    starts_at, ends_at, break_minutes, requires_acknowledgement
  )
  select v_review_id, s.business_id, s.id, s.employee_id, e.name, s.role_title,
    s.starts_at, s.ends_at, s.break_minutes, s.requires_acknowledgement
  from public.shifts s left join public.employees e on e.id = s.employee_id
    and e.business_id = s.business_id and e.venue_id = s.venue_id
  where s.id = any(v_shift_ids);
  return v_review_id;
end;
$$;
revoke all on function public.submit_roster_review(uuid, uuid, uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.submit_roster_review(uuid, uuid, uuid, date, uuid) to authenticated;

create function public.decide_roster_review(
  p_review_id uuid, p_decision text, p_request_id uuid, p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review public.roster_review_requests%rowtype;
  v_previous public.roster_review_decisions%rowtype;
  v_role text;
  v_mode text;
  v_revision bigint;
  v_timezone text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_expected_ids uuid[];
  v_locked_ids uuid[];
  v_count integer := 0;
begin
  if auth.uid() is null or p_review_id is null then
    raise exception 'Permission denied';
  end if;
  if p_request_id is null or p_decision is null
    or p_decision not in ('approved', 'rejected', 'withdrawn')
    or (v_reason is not null and char_length(v_reason) > 500)
    or (p_decision = 'rejected' and v_reason is null) then
    raise exception 'Invalid roster review decision';
  end if;
  select * into v_review from public.roster_review_requests r where r.id = p_review_id;
  if not found or not public.can_manage_department(v_review.business_id, v_review.department_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || v_review.business_id::text, 0));
  perform public.lock_scheduling_membership(v_review.business_id, v_review.department_id);
  select m.role into v_role from public.business_memberships m
  where m.business_id = v_review.business_id and m.user_id = auth.uid();
  select v.roster_publication_mode, v.roster_publication_revision, v.timezone
  into v_mode, v_revision, v_timezone
  from public.venues v where v.id = v_review.venue_id and v.business_id = v_review.business_id
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'roster-review-decision:' || auth.uid()::text || ':' || p_request_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'roster-review:' || v_review.department_id::text || ':' || v_review.week_start::text, 0
  ));
  select * into v_review from public.roster_review_requests r where r.id = p_review_id for update;
  select * into v_previous from public.roster_review_decisions d
  where d.business_id = v_review.business_id and d.actor_id = auth.uid() and d.request_id = p_request_id;
  if found then
    if (v_previous.review_id, v_previous.decision, v_previous.reason)
      is distinct from (p_review_id, p_decision, v_reason) then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.published_count;
  end if;
  if exists (select 1 from public.roster_review_decisions d where d.review_id = p_review_id) then
    raise exception 'Roster review already decided';
  end if;
  if p_decision = 'withdrawn' then
    if v_review.requested_by <> auth.uid() then
      raise exception 'Permission denied';
    end if;
  elsif v_role not in ('owner', 'admin', 'general_manager') or v_review.requested_by = auth.uid() then
    raise exception 'A different authorised reviewer is required';
  end if;

  if p_decision = 'approved' then
    if v_mode <> 'approval' or v_revision <> v_review.policy_revision
      or v_timezone <> v_review.venue_timezone then
      raise exception 'Roster approval settings changed';
    end if;
    select coalesce(array_agg(s.shift_id order by s.shift_id), '{}'::uuid[]) into v_expected_ids
    from public.roster_review_shifts s where s.review_id = p_review_id;
    begin
      select coalesce(array_agg(draft.id order by draft.id), '{}'::uuid[]) into v_locked_ids
      from (
        select s.id from public.shifts s
        where s.id = any(v_expected_ids) and s.business_id = v_review.business_id
          and s.venue_id = v_review.venue_id and s.department_id = v_review.department_id
          and s.status = 'scheduled' and not s.is_published
        order by s.id
        for update nowait
      ) draft;
    exception when lock_not_available then
      raise exception 'Roster changed while publishing; please try again';
    end;
    if cardinality(v_expected_ids) = 0 or v_locked_ids is distinct from v_expected_ids or exists (
      select 1 from public.roster_review_shifts snapshot
      join public.shifts s on s.id = snapshot.shift_id
      where snapshot.review_id = p_review_id and
        (s.employee_id, s.role_title, s.starts_at, s.ends_at, s.break_minutes, s.requires_acknowledgement)
        is distinct from
        (snapshot.employee_id, snapshot.role_title, snapshot.starts_at, snapshot.ends_at,
          snapshot.break_minutes, snapshot.requires_acknowledgement)
    ) then
      raise exception 'Submitted roster changed; withdraw or reject and resubmit';
    end if;
    v_count := public.publish_roster_review_internal(
      v_review.business_id, v_review.venue_id, v_review.department_id, v_review.week_start, v_expected_ids
    );
  end if;
  insert into public.roster_review_decisions (
    business_id, review_id, actor_id, request_id, decision, reason, published_count
  ) values (
    v_review.business_id, p_review_id, auth.uid(), p_request_id, p_decision, v_reason, v_count
  );
  return v_count;
end;
$$;
revoke all on function public.decide_roster_review(uuid, text, uuid, text)
  from public, anon, service_role;
grant execute on function public.decide_roster_review(uuid, text, uuid, text) to authenticated;

create function public.list_roster_reviews(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_week_start date
)
returns table (
  review_id uuid, requested_by uuid, requested_at timestamptz,
  decision text, reason text, decided_by uuid, decided_at timestamptz,
  published_count integer, stale boolean, changes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id)
    or not exists (
      select 1 from public.departments d
      where d.id = p_department_id and d.business_id = p_business_id and d.venue_id = p_venue_id
    ) then
    raise exception 'Permission denied';
  end if;
  if p_week_start is null or not isfinite(p_week_start)
    or extract(isodow from p_week_start) <> 1 then
    raise exception 'Invalid roster week';
  end if;
  return query
  select r.id, r.requested_by, r.requested_at, d.decision, d.reason, d.actor_id, d.decided_at,
    d.published_count,
    d.id is null and (
      v.roster_publication_mode <> 'approval'
      or v.roster_publication_revision <> r.policy_revision
      or v.timezone <> r.venue_timezone
      or exists (
        select 1 from public.roster_review_shifts snapshot
        left join public.shifts s on s.id = snapshot.shift_id
        where snapshot.review_id = r.id and (
          s.id is null or s.business_id <> r.business_id or s.venue_id <> r.venue_id
          or s.department_id <> r.department_id or s.status <> 'scheduled' or s.is_published
          or (s.employee_id, s.role_title, s.starts_at, s.ends_at, s.break_minutes, s.requires_acknowledgement)
            is distinct from
            (snapshot.employee_id, snapshot.role_title, snapshot.starts_at, snapshot.ends_at,
              snapshot.break_minutes, snapshot.requires_acknowledgement)
        )
      )
    ),
    (select coalesce(jsonb_agg(jsonb_build_object(
      'shift_id', snapshot.shift_id, 'employee_id', snapshot.employee_id,
      'employee_name', snapshot.employee_name, 'role_title', snapshot.role_title,
      'starts_at', snapshot.starts_at, 'ends_at', snapshot.ends_at,
      'break_minutes', snapshot.break_minutes,
      'requires_acknowledgement', snapshot.requires_acknowledgement
    ) order by snapshot.starts_at, snapshot.shift_id), '[]'::jsonb)
    from public.roster_review_shifts snapshot where snapshot.review_id = r.id)
  from public.roster_review_requests r
  join public.venues v on v.id = r.venue_id and v.business_id = r.business_id
  left join public.roster_review_decisions d on d.review_id = r.id
  where r.business_id = p_business_id and r.venue_id = p_venue_id
    and r.department_id = p_department_id and r.week_start = p_week_start
  order by r.requested_at desc, r.id desc
  limit 10;
end;
$$;
revoke all on function public.list_roster_reviews(uuid, uuid, uuid, date)
  from public, anon, service_role;
grant execute on function public.list_roster_reviews(uuid, uuid, uuid, date) to authenticated;
