create table public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  requester_employee_id uuid not null references public.employees(id) on delete cascade,
  recipient_employee_id uuid not null references public.employees(id) on delete cascade,
  requester_shift_id uuid not null references public.shifts(id) on delete cascade,
  requester_snapshot jsonb not null,
  recipient_shift_id uuid references public.shifts(id) on delete cascade,
  recipient_snapshot jsonb,
  status text not null default 'pending_recipient' check (status in (
    'pending_recipient', 'pending_requester', 'pending_manager',
    'approved', 'rejected', 'declined', 'withdrawn'
  )),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default clock_timestamp(),
  proposed_by uuid references auth.users(id) on delete set null,
  proposed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  foreign key (department_id, business_id, venue_id)
    references public.departments(id, business_id, venue_id) on delete cascade,
  check (requester_employee_id <> recipient_employee_id),
  check ((recipient_shift_id is null) = (recipient_snapshot is null)),
  check ((recipient_shift_id is null) = (proposed_at is null)),
  check (status not in ('pending_requester', 'pending_manager', 'approved', 'rejected')
    or recipient_shift_id is not null),
  check (status not in ('pending_manager', 'approved', 'rejected') or confirmed_at is not null),
  check (status not in ('approved', 'rejected') or reviewed_at is not null),
  check (status <> 'rejected' or length(trim(coalesce(review_reason, ''))) between 1 and 500)
);

create unique index shift_swap_requests_open_shift_idx
  on public.shift_swap_requests(requester_shift_id)
  where status in ('pending_recipient', 'pending_requester', 'pending_manager');
create index shift_swap_requests_scope_idx
  on public.shift_swap_requests(business_id, venue_id, department_id, requested_at desc);
create index shift_swap_requests_recipient_idx
  on public.shift_swap_requests(recipient_employee_id, requested_at desc);

create table public.shift_swap_events (
  id bigint generated always as identity primary key,
  swap_id uuid not null references public.shift_swap_requests(id) on delete cascade,
  status text not null,
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  occurred_at timestamptz not null default clock_timestamp()
);

alter table public.shift_swap_requests enable row level security;
alter table public.shift_swap_events enable row level security;
revoke all on public.shift_swap_requests, public.shift_swap_events
  from public, anon, authenticated;

create function public.shift_swap_employee_authorized(
  p_employee_id uuid, p_business_id uuid, p_venue_id uuid, p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employees e
    join public.employee_departments ed
      on ed.employee_id = e.id and ed.business_id = e.business_id
      and ed.department_id = p_department_id
    where e.id = p_employee_id and e.business_id = p_business_id
      and e.venue_id = p_venue_id and e.active and e.auth_user_id is not null
      and public.user_can_view_department(e.auth_user_id, e.business_id, e.department_id)
  );
$$;

create function public.shift_swap_owned_employee(
  p_employee_id uuid, p_business_id uuid, p_venue_id uuid, p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (select 1 from public.employees e
      where e.id = p_employee_id and e.auth_user_id = auth.uid())
    and public.shift_swap_employee_authorized(
      p_employee_id, p_business_id, p_venue_id, p_department_id
    );
$$;

create function public.shift_swap_same_worker(p_first uuid, p_second uuid, p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employees first_employee
    join public.employees second_employee on second_employee.id = p_second
    where first_employee.id = p_first
      and first_employee.auth_user_id = second_employee.auth_user_id
      and first_employee.auth_user_id is not null
  ) or exists (
    select 1
    from public.shared_worker_profiles first_profile
    join public.shared_worker_profiles second_profile
      on second_profile.shared_worker_id = first_profile.shared_worker_id
    where first_profile.business_id = p_business_id
      and second_profile.business_id = p_business_id
      and first_profile.employee_id = p_first and second_profile.employee_id = p_second
  );
$$;

create function public.shift_swap_snapshot(p_shift_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id, 'business_id', s.business_id, 'venue_id', s.venue_id,
    'department_id', s.department_id, 'employee_id', s.employee_id,
    'role_title', s.role_title, 'starts_at', extract(epoch from s.starts_at),
    'ends_at', extract(epoch from s.ends_at), 'break_minutes', s.break_minutes,
    'status', s.status, 'is_published', s.is_published,
    'requires_acknowledgement', s.requires_acknowledgement,
    'updated_at', extract(epoch from s.updated_at)
  )
  from public.shifts s where s.id = p_shift_id;
$$;

create function public.shift_swap_ineligibility(
  p_shift_id uuid, p_employee_id uuid, p_outgoing_shift_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text;
  v_shift public.shifts%rowtype;
begin
  v_reason := public.shift_offer_ineligibility(p_shift_id, p_employee_id);
  if v_reason is not null and v_reason <> 'conflict' then
    return v_reason;
  end if;

  select * into v_shift from public.shifts where id = p_shift_id;
  if exists (
    select 1
    from public.shifts other
    where other.business_id = v_shift.business_id and other.status = 'scheduled'
      and other.employee_id is not null
      and other.id <> p_shift_id and other.id <> p_outgoing_shift_id
      and tstzrange(other.starts_at, other.ends_at, '[)')
        && tstzrange(v_shift.starts_at, v_shift.ends_at, '[)')
      and (
        other.employee_id = p_employee_id
        or public.shift_swap_same_worker(other.employee_id, p_employee_id, v_shift.business_id)
      )
  ) then
    return 'conflict';
  end if;
  return null;
end;
$$;

revoke all on function public.shift_swap_employee_authorized(uuid, uuid, uuid, uuid),
  public.shift_swap_owned_employee(uuid, uuid, uuid, uuid),
  public.shift_swap_same_worker(uuid, uuid, uuid),
  public.shift_swap_snapshot(uuid),
  public.shift_swap_ineligibility(uuid, uuid, uuid)
  from public, anon, authenticated;

create function public.record_shift_swap_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.shift_swap_events(swap_id, status, actor_id, reason)
    values (new.id, new.status, auth.uid(), new.review_reason);
  end if;
  return null;
end;
$$;
revoke all on function public.record_shift_swap_event() from public, anon, authenticated;
create trigger shift_swap_record_event
  after insert or update on public.shift_swap_requests
  for each row execute function public.record_shift_swap_event();

create function public.list_my_swap_shifts(p_business_id uuid, p_venue_id uuid)
returns table (
  shift_id uuid, employee_id uuid, department_id uuid, department_name text,
  role_title text, starts_at timestamptz, ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select s.id, s.employee_id, s.department_id, d.name, s.role_title, s.starts_at, s.ends_at
  from public.shifts s
  join public.departments d on d.id = s.department_id and d.active
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.status = 'scheduled' and s.is_published and s.starts_at > now()
    and s.ends_at - s.starts_at <= interval '24 hours'
    and public.shift_swap_owned_employee(s.employee_id, s.business_id, s.venue_id, s.department_id)
  order by s.starts_at, s.id;
end;
$$;

create function public.list_my_swap_colleagues(p_business_id uuid, p_venue_id uuid)
returns table (
  own_employee_id uuid, department_id uuid, employee_id uuid, employee_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select own.id, own_department.department_id, colleague.id, colleague.name
  from public.employees own
  join public.employee_departments own_department on own_department.employee_id = own.id
  join public.departments department on department.id = own_department.department_id and department.active
  join public.employee_departments colleague_department
    on colleague_department.department_id = own_department.department_id
    and colleague_department.business_id = own.business_id
  join public.employees colleague on colleague.id = colleague_department.employee_id
  where own.business_id = p_business_id and own.venue_id = p_venue_id
    and public.shift_swap_owned_employee(own.id, own.business_id, own.venue_id, department.id)
    and colleague.id <> own.id
    and public.shift_swap_employee_authorized(
      colleague.id, own.business_id, own.venue_id, department.id
    )
    and not public.shift_swap_same_worker(own.id, colleague.id, own.business_id)
  order by colleague.name, colleague.id;
end;
$$;

create function public.request_shift_swap(
  p_business_id uuid, p_venue_id uuid, p_shift_id uuid, p_recipient_employee_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
  v_swap_id uuid;
  v_reason text;
begin
  select * into v_shift from public.shifts
  where id = p_shift_id and business_id = p_business_id and venue_id = p_venue_id
  for update;
  if not found or not public.shift_swap_owned_employee(
    v_shift.employee_id, v_shift.business_id, v_shift.venue_id, v_shift.department_id
  ) then
    raise exception 'Shift not found or permission denied';
  end if;
  if v_shift.status <> 'scheduled' or not v_shift.is_published
    or v_shift.starts_at <= clock_timestamp()
    or v_shift.ends_at - v_shift.starts_at > interval '24 hours'
    or not exists (select 1 from public.departments d
      where d.id = v_shift.department_id and d.active) then
    raise exception 'This shift is not available for a swap';
  end if;
  if p_recipient_employee_id is null or p_recipient_employee_id = v_shift.employee_id
    or not public.shift_swap_employee_authorized(
      p_recipient_employee_id, p_business_id, p_venue_id, v_shift.department_id
    )
    or public.shift_swap_same_worker(v_shift.employee_id, p_recipient_employee_id, p_business_id) then
    raise exception 'Colleague is not eligible for this department';
  end if;
  v_reason := public.shift_offer_ineligibility(v_shift.id, p_recipient_employee_id);
  if v_reason is not null and v_reason <> 'conflict' then
    raise exception 'Colleague is not eligible for this shift: %', v_reason;
  end if;

  insert into public.shift_swap_requests (
    business_id, venue_id, department_id, requester_employee_id, recipient_employee_id,
    requester_shift_id, requester_snapshot, requested_by
  )
  values (
    p_business_id, p_venue_id, v_shift.department_id, v_shift.employee_id,
    p_recipient_employee_id, v_shift.id, public.shift_swap_snapshot(v_shift.id), auth.uid()
  )
  on conflict (requester_shift_id)
    where status in ('pending_recipient', 'pending_requester', 'pending_manager')
  do nothing
  returning id into v_swap_id;
  if v_swap_id is null then
    raise exception 'There is already an open swap for this shift';
  end if;
  return v_swap_id;
end;
$$;

create function public.respond_shift_swap(
  p_swap_id uuid, p_response text, p_recipient_shift_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_swap public.shift_swap_requests%rowtype;
  v_shift public.shifts%rowtype;
  v_reason text;
begin
  select * into v_swap from public.shift_swap_requests where id = p_swap_id for update;
  if not found or not public.shift_swap_owned_employee(
    v_swap.recipient_employee_id, v_swap.business_id, v_swap.venue_id, v_swap.department_id
  ) then
    raise exception 'Swap not found or permission denied';
  end if;
  if v_swap.status <> 'pending_recipient' then
    raise exception 'This swap is no longer awaiting your response';
  end if;
  if p_response = 'decline' and p_recipient_shift_id is null then
    update public.shift_swap_requests set status = 'declined' where id = v_swap.id;
    return;
  end if;
  if p_response is distinct from 'propose' or p_recipient_shift_id is null then
    raise exception 'Select one of your shifts or decline the request';
  end if;
  select * into v_shift from public.shifts
  where id = p_recipient_shift_id and business_id = v_swap.business_id
    and venue_id = v_swap.venue_id and department_id = v_swap.department_id
    and employee_id = v_swap.recipient_employee_id
  for update;
  if not found or v_shift.status <> 'scheduled' or not v_shift.is_published
    or v_shift.starts_at <= clock_timestamp()
    or v_shift.ends_at - v_shift.starts_at > interval '24 hours' then
    raise exception 'Select one of your upcoming published shifts in this department';
  end if;
  if public.shift_swap_snapshot(v_swap.requester_shift_id) is distinct from v_swap.requester_snapshot then
    raise exception 'The requested shift has changed; ask for a new swap';
  end if;
  v_reason := public.shift_swap_ineligibility(v_swap.requester_shift_id, v_swap.recipient_employee_id, v_shift.id);
  if v_reason is not null then
    raise exception 'You are not eligible for the requested shift: %', v_reason;
  end if;
  v_reason := public.shift_swap_ineligibility(v_shift.id, v_swap.requester_employee_id, v_swap.requester_shift_id);
  if v_reason is not null then
    raise exception 'Your colleague is not eligible for the proposed shift: %', v_reason;
  end if;
  update public.shift_swap_requests
  set recipient_shift_id = v_shift.id, recipient_snapshot = public.shift_swap_snapshot(v_shift.id),
    proposed_by = auth.uid(), proposed_at = clock_timestamp(), status = 'pending_requester'
  where id = v_swap.id;
end;
$$;

create function public.confirm_shift_swap(p_swap_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_swap public.shift_swap_requests%rowtype;
begin
  select * into v_swap from public.shift_swap_requests where id = p_swap_id for update;
  if not found or not public.shift_swap_owned_employee(
    v_swap.requester_employee_id, v_swap.business_id, v_swap.venue_id, v_swap.department_id
  ) then
    raise exception 'Swap not found or permission denied';
  end if;
  if v_swap.status <> 'pending_requester' then
    raise exception 'This swap is no longer awaiting your confirmation';
  end if;
  if p_response = 'decline' then
    update public.shift_swap_requests set status = 'declined' where id = v_swap.id;
    return;
  end if;
  if p_response is distinct from 'confirm' then
    raise exception 'Invalid swap response';
  end if;
  if public.shift_swap_snapshot(v_swap.requester_shift_id) is distinct from v_swap.requester_snapshot
    or public.shift_swap_snapshot(v_swap.recipient_shift_id) is distinct from v_swap.recipient_snapshot then
    raise exception 'A shift has changed; ask for a new swap';
  end if;
  update public.shift_swap_requests
  set status = 'pending_manager', confirmed_by = auth.uid(), confirmed_at = clock_timestamp()
  where id = v_swap.id;
end;
$$;

create function public.withdraw_shift_swap(p_swap_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_swap public.shift_swap_requests%rowtype;
begin
  select * into v_swap from public.shift_swap_requests where id = p_swap_id for update;
  if not found or not public.shift_swap_owned_employee(
    v_swap.requester_employee_id, v_swap.business_id, v_swap.venue_id, v_swap.department_id
  ) then
    raise exception 'Swap not found or permission denied';
  end if;
  if v_swap.status not in ('pending_recipient', 'pending_requester', 'pending_manager') then
    raise exception 'This swap can no longer be withdrawn';
  end if;
  update public.shift_swap_requests set status = 'withdrawn' where id = v_swap.id;
end;
$$;

revoke all on function public.list_my_swap_shifts(uuid, uuid),
  public.list_my_swap_colleagues(uuid, uuid),
  public.request_shift_swap(uuid, uuid, uuid, uuid),
  public.respond_shift_swap(uuid, text, uuid),
  public.confirm_shift_swap(uuid, text),
  public.withdraw_shift_swap(uuid)
  from public, anon;
grant execute on function public.list_my_swap_shifts(uuid, uuid),
  public.list_my_swap_colleagues(uuid, uuid),
  public.request_shift_swap(uuid, uuid, uuid, uuid),
  public.respond_shift_swap(uuid, text, uuid),
  public.confirm_shift_swap(uuid, text),
  public.withdraw_shift_swap(uuid)
  to authenticated;

alter table public.roster_publications
  add column publication_kind text not null default 'roster'
    check (publication_kind in ('roster', 'swap'));

create index shift_swap_approved_requester_idx
  on public.shift_swap_requests(requester_shift_id, reviewed_at desc)
  where status = 'approved';
create index shift_swap_approved_recipient_idx
  on public.shift_swap_requests(recipient_shift_id, reviewed_at desc)
  where status = 'approved';

create function public.record_shift_swap_publications(p_swap_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_swap public.shift_swap_requests%rowtype;
  v_scope record;
  v_publication_id uuid;
  v_version integer;
  v_shift_count integer;
begin
  select * into v_swap from public.shift_swap_requests
  where id = p_swap_id and status = 'approved';
  if not found then
    raise exception 'Approved swap not found';
  end if;
  for v_scope in
    select v.timezone, date_trunc('week', s.starts_at at time zone v.timezone)::date as week_start,
      count(*)::integer as changed_count
    from public.shifts s
    join public.venues v on v.id = s.venue_id and v.business_id = s.business_id
    where s.id in (v_swap.requester_shift_id, v_swap.recipient_shift_id)
    group by v.timezone, date_trunc('week', s.starts_at at time zone v.timezone)::date
    order by week_start
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'roster-publication:' || v_swap.department_id::text || ':' || v_scope.week_start::text, 0
    ));
    select coalesce(max(version), 0) + 1 into v_version
    from public.roster_publications p
    where p.business_id = v_swap.business_id and p.venue_id = v_swap.venue_id
      and p.department_id = v_swap.department_id and p.week_start = v_scope.week_start;
    insert into public.roster_publications (
      business_id, venue_id, department_id, week_start, venue_timezone, version,
      published_by, new_shift_count, shift_count, notifications_recorded, publication_kind
    )
    values (
      v_swap.business_id, v_swap.venue_id, v_swap.department_id, v_scope.week_start,
      v_scope.timezone, v_version, auth.uid(), v_scope.changed_count, 0, true, 'swap'
    )
    returning id into v_publication_id;
    insert into public.roster_publication_shifts (
      publication_id, shift_id, employee_id, role_title, starts_at, ends_at, break_minutes
    )
    select v_publication_id, s.id, s.employee_id, s.role_title, s.starts_at, s.ends_at, s.break_minutes
    from public.shifts s
    where s.business_id = v_swap.business_id and s.venue_id = v_swap.venue_id
      and s.department_id = v_swap.department_id and s.status = 'scheduled' and s.is_published
      and (s.starts_at at time zone v_scope.timezone)::date
        between v_scope.week_start and v_scope.week_start + 6;
    get diagnostics v_shift_count = row_count;
    update public.roster_publications set shift_count = v_shift_count
    where id = v_publication_id;
    insert into public.roster_publication_recipients(publication_id, employee_id)
    select distinct v_publication_id, s.employee_id
    from public.shifts s
    where s.id in (v_swap.requester_shift_id, v_swap.recipient_shift_id)
      and (s.starts_at at time zone v_scope.timezone)::date
        between v_scope.week_start and v_scope.week_start + 6;
  end loop;
end;
$$;
revoke all on function public.record_shift_swap_publications(uuid) from public, anon, authenticated;

create function public.review_shift_swap(p_swap_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_swap public.shift_swap_requests%rowtype;
  v_id uuid;
  v_reason text;
  v_rows integer;
begin
  select * into v_swap from public.shift_swap_requests where id = p_swap_id;
  if not found or not public.can_manage_department(v_swap.business_id, v_swap.department_id) then
    raise exception 'Swap not found or permission denied';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'Invalid swap decision';
  end if;
  if p_decision = 'reject' then
    if length(trim(coalesce(p_reason, ''))) not between 1 and 500 then
      raise exception 'A rejection reason of up to 500 characters is required';
    end if;
    perform public.lock_scheduling_membership(v_swap.business_id, v_swap.department_id);
    select * into v_swap from public.shift_swap_requests where id = p_swap_id for update;
    if not found or not public.can_manage_department(v_swap.business_id, v_swap.department_id) then
      raise exception 'Swap not found or permission denied';
    end if;
    if v_swap.status <> 'pending_manager' then
      raise exception 'This swap is no longer awaiting manager review';
    end if;
    update public.shift_swap_requests
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = clock_timestamp(),
      review_reason = trim(p_reason)
    where id = v_swap.id;
    return;
  end if;
  if p_reason is not null and length(trim(p_reason)) > 500 then
    raise exception 'Invalid swap decision';
  end if;

  perform public.lock_shared_worker_links(v_swap.business_id);
  perform public.lock_scheduling_membership(v_swap.business_id, v_swap.department_id);
  perform public.lock_shared_worker_groups(v_swap.business_id, v_swap.venue_id);
  for v_id in
    select distinct employee_id
    from unnest(array[v_swap.requester_employee_id, v_swap.recipient_employee_id]) employee_id
    order by employee_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('butterbox-schedule-employee:' || v_id::text, 0));
  end loop;
  select * into v_swap from public.shift_swap_requests where id = p_swap_id for update;
  if not found or not public.can_manage_department(v_swap.business_id, v_swap.department_id) then
    raise exception 'Swap not found or permission denied';
  end if;
  if v_swap.status <> 'pending_manager' then
    raise exception 'This swap is no longer awaiting manager review';
  end if;
  perform 1 from public.shifts s
  where s.id in (v_swap.requester_shift_id, v_swap.recipient_shift_id)
  order by s.id for update;
  perform 1 from public.employees e
  where e.id in (v_swap.requester_employee_id, v_swap.recipient_employee_id)
  order by e.id for update;
  perform 1 from public.business_memberships m
  where m.business_id = v_swap.business_id
    and m.user_id in (v_swap.confirmed_by, v_swap.proposed_by)
  order by m.user_id for share;

  if not exists (select 1 from public.departments d
      where d.id = v_swap.department_id and d.active)
    or not public.shift_swap_employee_authorized(v_swap.requester_employee_id,
      v_swap.business_id, v_swap.venue_id, v_swap.department_id)
    or not public.shift_swap_employee_authorized(v_swap.recipient_employee_id,
      v_swap.business_id, v_swap.venue_id, v_swap.department_id)
    or public.shift_swap_same_worker(v_swap.requester_employee_id, v_swap.recipient_employee_id, v_swap.business_id)
    or not exists (select 1 from public.employees e
      where e.id = v_swap.requester_employee_id and e.auth_user_id = v_swap.requested_by
        and e.auth_user_id = v_swap.confirmed_by)
    or not exists (select 1 from public.employees e
      where e.id = v_swap.recipient_employee_id and e.auth_user_id = v_swap.proposed_by) then
    raise exception 'A participant is no longer eligible for this swap';
  end if;
  if public.shift_swap_snapshot(v_swap.requester_shift_id) is distinct from v_swap.requester_snapshot
    or public.shift_swap_snapshot(v_swap.recipient_shift_id) is distinct from v_swap.recipient_snapshot
    or exists (select 1 from public.shifts s
      where s.id in (v_swap.requester_shift_id, v_swap.recipient_shift_id)
        and s.starts_at <= clock_timestamp()) then
    raise exception 'A shift has changed or started; ask for a new swap';
  end if;
  v_reason := public.shift_swap_ineligibility(
    v_swap.requester_shift_id, v_swap.recipient_employee_id, v_swap.recipient_shift_id
  );
  if v_reason is not null then
    raise exception 'Recipient is no longer eligible for the requested shift: %', v_reason;
  end if;
  v_reason := public.shift_swap_ineligibility(
    v_swap.recipient_shift_id, v_swap.requester_employee_id, v_swap.requester_shift_id
  );
  if v_reason is not null then
    raise exception 'Requester is no longer eligible for the proposed shift: %', v_reason;
  end if;
  update public.shifts
  set employee_id = case id
    when v_swap.requester_shift_id then v_swap.recipient_employee_id
    else v_swap.requester_employee_id end
  where id in (v_swap.requester_shift_id, v_swap.recipient_shift_id);
  get diagnostics v_rows = row_count;
  if v_rows <> 2 then
    raise exception 'Both shifts must still exist';
  end if;
  update public.shift_swap_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = clock_timestamp()
  where id = v_swap.id;
  perform public.record_shift_swap_publications(v_swap.id);
end;
$$;

create function public.list_shift_swaps(p_business_id uuid, p_venue_id uuid)
returns table (
  swap_id uuid, status text, department_id uuid, department_name text,
  requester_name text, recipient_name text,
  requester_shift_id uuid, requester_role text, requester_starts_at timestamptz,
  requester_ends_at timestamptz, recipient_shift_id uuid, recipient_role text,
  recipient_starts_at timestamptz, recipient_ends_at timestamptz,
  requested_at timestamptz, review_reason text, snapshots_current boolean,
  is_requester boolean, is_recipient boolean, can_manage boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select r.id, r.status, r.department_id, d.name, requester.name, recipient.name,
    r.requester_shift_id, r.requester_snapshot ->> 'role_title',
    to_timestamp((r.requester_snapshot ->> 'starts_at')::double precision),
    to_timestamp((r.requester_snapshot ->> 'ends_at')::double precision),
    r.recipient_shift_id, r.recipient_snapshot ->> 'role_title',
    to_timestamp((r.recipient_snapshot ->> 'starts_at')::double precision),
    to_timestamp((r.recipient_snapshot ->> 'ends_at')::double precision),
    r.requested_at, r.review_reason,
    public.shift_swap_snapshot(r.requester_shift_id) = r.requester_snapshot
      and (r.recipient_shift_id is null
        or public.shift_swap_snapshot(r.recipient_shift_id) = r.recipient_snapshot),
    public.shift_swap_owned_employee(r.requester_employee_id, r.business_id, r.venue_id, r.department_id),
    public.shift_swap_owned_employee(r.recipient_employee_id, r.business_id, r.venue_id, r.department_id),
    public.can_manage_department(r.business_id, r.department_id)
  from public.shift_swap_requests r
  join public.departments d on d.id = r.department_id
  join public.employees requester on requester.id = r.requester_employee_id
  join public.employees recipient on recipient.id = r.recipient_employee_id
  where r.business_id = p_business_id and r.venue_id = p_venue_id
    and (
      public.shift_swap_owned_employee(r.requester_employee_id, r.business_id, r.venue_id, r.department_id)
      or public.shift_swap_owned_employee(r.recipient_employee_id, r.business_id, r.venue_id, r.department_id)
      or public.can_manage_department(r.business_id, r.department_id)
    )
  order by r.requested_at desc, r.id;
end;
$$;
revoke all on function public.review_shift_swap(uuid, text, text),
  public.list_shift_swaps(uuid, uuid) from public, anon;
grant execute on function public.review_shift_swap(uuid, text, text),
  public.list_shift_swaps(uuid, uuid) to authenticated;

alter table public.shift_acknowledgements
  drop constraint shift_acknowledgements_shift_id_user_id_key;
alter table public.shift_acknowledgements
  add constraint shift_acknowledgements_publication_shift_user_key
  unique (publication_id, shift_id, user_id);

create function public.shift_swap_acknowledgement_cutoff(p_shift_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(r.reviewed_at)
  from public.shift_swap_requests r
  where r.status = 'approved'
    and (r.requester_shift_id = p_shift_id or r.recipient_shift_id = p_shift_id);
$$;
revoke all on function public.shift_swap_acknowledgement_cutoff(uuid) from public, anon, authenticated;

create or replace function public.list_shift_acknowledgements(
  p_business_id uuid, p_venue_id uuid, p_shift_ids uuid[]
)
returns table (shift_id uuid, acknowledged_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v
    where v.id = p_venue_id and v.business_id = p_business_id
      and public.can_view_venue(v.business_id, v.id)
  ) then
    raise exception 'Permission denied';
  end if;
  if p_shift_ids is null or cardinality(p_shift_ids) > 2000
    or coalesce(array_ndims(p_shift_ids), 1) > 1
    or array_position(p_shift_ids, null) is not null then
    raise exception 'Invalid shift list';
  end if;
  return query
  select s.id, acknowledgement.acknowledged_at
  from public.shifts s
  join public.employees e on e.id = s.employee_id
  left join lateral (
    select a.acknowledged_at
    from public.shift_acknowledgements a
    join public.roster_publications p on p.id = a.publication_id
    where a.shift_id = s.id and a.user_id = e.auth_user_id
      and p.published_at >= coalesce(public.shift_swap_acknowledgement_cutoff(s.id), '-infinity'::timestamptz)
    order by a.acknowledged_at desc
    limit 1
  ) acknowledgement on true
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.id = any(p_shift_ids) and s.status = 'scheduled'
    and s.is_published and s.requires_acknowledgement
    and (
      public.can_manage_department(s.business_id, s.department_id)
      or public.is_own_linked_shift(s.business_id, s.employee_id, s.department_id)
    );
end;
$$;

create or replace function public.acknowledge_shift(
  p_business_id uuid, p_venue_id uuid, p_shift_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
  v_publication_id uuid;
  v_acknowledged_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  select s.* into v_shift from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.status = 'scheduled' and s.is_published
  for share;
  if not found or v_shift.employee_id is null then
    raise exception 'Shift not found or permission denied';
  end if;
  perform 1 from public.employees e
  where e.id = v_shift.employee_id and e.business_id = v_shift.business_id
    and e.venue_id = v_shift.venue_id and e.auth_user_id = auth.uid()
  for share;
  if not found then
    raise exception 'Shift not found or permission denied';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = v_shift.business_id and m.user_id = auth.uid()
  for share;
  if not found then
    raise exception 'Shift not found or permission denied';
  end if;
  perform 1 from public.employee_departments ed
  where ed.employee_id = v_shift.employee_id and ed.department_id = v_shift.department_id
  for share;
  if not found or not public.is_own_linked_shift(
    v_shift.business_id, v_shift.employee_id, v_shift.department_id
  ) then
    raise exception 'Shift not found or permission denied';
  end if;
  if not v_shift.requires_acknowledgement then
    raise exception 'Shift does not require acknowledgement';
  end if;
  select snapshot.publication_id into v_publication_id
  from public.roster_publication_shifts snapshot
  join public.roster_publications publication on publication.id = snapshot.publication_id
  where snapshot.shift_id = v_shift.id
    and publication.business_id = v_shift.business_id
    and publication.venue_id = v_shift.venue_id
    and publication.department_id = v_shift.department_id
    and publication.published_at >= coalesce(
      public.shift_swap_acknowledgement_cutoff(v_shift.id), '-infinity'::timestamptz
    )
    and snapshot.employee_id = v_shift.employee_id
    and snapshot.role_title = v_shift.role_title
    and snapshot.starts_at = v_shift.starts_at and snapshot.ends_at = v_shift.ends_at
    and snapshot.break_minutes = v_shift.break_minutes and snapshot.requires_acknowledgement
  order by publication.published_at, publication.version, publication.id
  limit 1;
  if not found then
    raise exception 'Shift publication record unavailable';
  end if;
  insert into public.shift_acknowledgements (publication_id, shift_id, user_id)
  values (v_publication_id, v_shift.id, auth.uid())
  on conflict (publication_id, shift_id, user_id) do nothing;
  select a.acknowledged_at into v_acknowledged_at
  from public.shift_acknowledgements a
  where a.publication_id = v_publication_id and a.shift_id = v_shift.id and a.user_id = auth.uid();
  return v_acknowledged_at;
end;
$$;

create table public.shift_swap_notifications (
  id uuid primary key default gen_random_uuid(),
  swap_id uuid not null references public.shift_swap_requests(id) on delete cascade,
  recipient_employee_id uuid references public.employees(id) on delete cascade,
  event_type text not null check (event_type in (
    'requested', 'proposed', 'review', 'approved', 'rejected', 'declined', 'withdrawn'
  )),
  created_at timestamptz not null default clock_timestamp()
);
create unique index shift_swap_notifications_employee_event_idx
  on public.shift_swap_notifications(swap_id, recipient_employee_id, event_type)
  where recipient_employee_id is not null;
create unique index shift_swap_notifications_manager_event_idx
  on public.shift_swap_notifications(swap_id, event_type)
  where recipient_employee_id is null;
create table public.shift_swap_notification_reads (
  notification_id uuid not null references public.shift_swap_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key (notification_id, user_id)
);
alter table public.shift_swap_notifications enable row level security;
alter table public.shift_swap_notification_reads enable row level security;
revoke all on public.shift_swap_notifications, public.shift_swap_notification_reads
  from public, anon, authenticated;

create function public.record_shift_swap_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.shift_swap_notifications(swap_id, recipient_employee_id, event_type)
    values (new.id, new.recipient_employee_id, 'requested');
  elsif new.status is distinct from old.status then
    if new.status = 'pending_requester' then
      insert into public.shift_swap_notifications(swap_id, recipient_employee_id, event_type)
      values (new.id, new.requester_employee_id, 'proposed');
    elsif new.status = 'pending_manager' then
      insert into public.shift_swap_notifications(swap_id, event_type)
      values (new.id, 'review');
    elsif new.status in ('approved', 'rejected', 'declined', 'withdrawn') then
      insert into public.shift_swap_notifications(swap_id, recipient_employee_id, event_type)
      values (new.id, new.requester_employee_id, new.status),
        (new.id, new.recipient_employee_id, new.status);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.record_shift_swap_notification() from public, anon, authenticated;
create trigger shift_swap_record_notification
  after insert or update on public.shift_swap_requests
  for each row execute function public.record_shift_swap_notification();

create function public.list_shift_swap_notifications(p_business_id uuid, p_venue_id uuid)
returns table (
  notification_id uuid, swap_id uuid, event_type text, created_at timestamptz,
  unread boolean, requester_name text, recipient_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select n.id, r.id, n.event_type, n.created_at, reads.user_id is null,
    requester.name, recipient.name
  from public.shift_swap_notifications n
  join public.shift_swap_requests r on r.id = n.swap_id
  join public.employees requester on requester.id = r.requester_employee_id
  join public.employees recipient on recipient.id = r.recipient_employee_id
  left join public.shift_swap_notification_reads reads
    on reads.notification_id = n.id and reads.user_id = auth.uid()
  where r.business_id = p_business_id and r.venue_id = p_venue_id
    and (
      (n.recipient_employee_id is null and public.can_manage_department(r.business_id, r.department_id))
      or (n.recipient_employee_id is not null and public.shift_swap_owned_employee(
        n.recipient_employee_id, r.business_id, r.venue_id, r.department_id
      ))
    )
  order by n.created_at desc, n.id;
end;
$$;

create function public.mark_shift_swap_notification_read(p_notification_id uuid)
returns table (business_id uuid, venue_id uuid, swap_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification public.shift_swap_notifications%rowtype;
  v_swap public.shift_swap_requests%rowtype;
begin
  select * into v_notification from public.shift_swap_notifications where id = p_notification_id;
  if not found then
    raise exception 'Notification not found or permission denied';
  end if;
  select * into v_swap from public.shift_swap_requests where id = v_notification.swap_id;
  if not found or auth.uid() is null or not (
    (v_notification.recipient_employee_id is null
      and public.can_manage_department(v_swap.business_id, v_swap.department_id))
    or (v_notification.recipient_employee_id is not null and public.shift_swap_owned_employee(
      v_notification.recipient_employee_id, v_swap.business_id, v_swap.venue_id, v_swap.department_id
    ))
  ) then
    raise exception 'Notification not found or permission denied';
  end if;
  insert into public.shift_swap_notification_reads(notification_id, user_id)
  values (v_notification.id, auth.uid())
  on conflict (notification_id, user_id) do nothing;
  return query select v_swap.business_id, v_swap.venue_id, v_swap.id;
end;
$$;

create or replace function public.unread_roster_notification_count(p_business_id uuid, p_venue_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*)::integer from public.list_roster_notifications(p_business_id, p_venue_id) where unread)
    + (select count(*)::integer from public.list_shift_offer_notifications(p_business_id, p_venue_id) where unread)
    + (select count(*)::integer from public.list_shift_swap_notifications(p_business_id, p_venue_id) where unread);
$$;

revoke all on function public.list_shift_swap_notifications(uuid, uuid),
  public.mark_shift_swap_notification_read(uuid) from public, anon;
grant execute on function public.list_shift_swap_notifications(uuid, uuid),
  public.mark_shift_swap_notification_read(uuid) to authenticated;
