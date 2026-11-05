-- Open-shift offers (BB-SHIFTS-001/002/003). An offer and its recipients are an
-- append-only audit record (actor ids are kept even if an account is removed):
-- the shift stays open until a manager confirms one
-- accepted claim, which re-checks the latest eligibility under row locks.
create table public.shift_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'filled', 'withdrawn')),
  closed_by uuid,
  closed_at timestamptz,
  filled_employee_id uuid,
  check (expires_at > created_at),
  check ((status = 'open') = (closed_at is null and closed_by is null)),
  check ((status = 'filled') = (filled_employee_id is not null)),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id) on delete cascade
);

create unique index shift_offers_one_open_per_shift
  on public.shift_offers (shift_id) where status = 'open';
create index shift_offers_scope_idx
  on public.shift_offers (business_id, venue_id, department_id, created_at desc);

create table public.shift_offer_recipients (
  offer_id uuid not null references public.shift_offers (id) on delete cascade,
  business_id uuid not null,
  venue_id uuid not null,
  employee_id uuid not null,
  invited_at timestamptz not null default clock_timestamp(),
  response text not null default 'pending' check (response in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  responded_by uuid,
  outcome text check (outcome in ('confirmed', 'not_selected', 'unavailable', 'closed')),
  outcome_at timestamptz,
  primary key (offer_id, employee_id),
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id) on delete cascade,
  check ((response = 'pending') = (responded_at is null and responded_by is null)),
  check ((outcome is null) = (outcome_at is null)),
  check (outcome is distinct from 'confirmed' or response = 'accepted')
);

create index shift_offer_recipients_employee_idx
  on public.shift_offer_recipients (employee_id, offer_id);

create function public.protect_shift_offer_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'shift_offers' then
    if new.id <> old.id or new.business_id <> old.business_id or new.venue_id <> old.venue_id
      or new.department_id <> old.department_id or new.shift_id <> old.shift_id
      or new.created_by <> old.created_by or new.created_at <> old.created_at
      or new.expires_at <> old.expires_at or old.status <> 'open' then
      raise exception 'Shift offer history is immutable';
    end if;
  else
    if new.offer_id <> old.offer_id or new.business_id <> old.business_id
      or new.venue_id <> old.venue_id or new.employee_id <> old.employee_id
      or new.invited_at <> old.invited_at
      or (old.response <> 'pending' and (new.response, new.responded_at, new.responded_by)
        is distinct from (old.response, old.responded_at, old.responded_by))
      or (old.outcome is not null and (new.outcome, new.outcome_at)
        is distinct from (old.outcome, old.outcome_at)) then
      raise exception 'Shift offer history is immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_shift_offer_history() from public, anon, authenticated;
create trigger shift_offers_protect_history
  before update on public.shift_offers
  for each row execute function public.protect_shift_offer_history();
create trigger shift_offer_recipients_protect_history
  before update on public.shift_offer_recipients
  for each row execute function public.protect_shift_offer_history();

alter table public.shift_offers enable row level security;
alter table public.shift_offer_recipients enable row level security;
create policy "Managers can view shift offers"
  on public.shift_offers for select to authenticated
  using (public.can_manage_department(business_id, department_id));
create policy "Managers and recipients can view shift offer recipients"
  on public.shift_offer_recipients for select to authenticated
  using (
    exists (
      select 1 from public.shift_offers o
      where o.id = shift_offer_recipients.offer_id
        and public.can_manage_department(o.business_id, o.department_id)
    )
    or exists (
      select 1 from public.employees e
      join public.business_memberships m
        on m.business_id = e.business_id and m.user_id = auth.uid()
      where e.id = shift_offer_recipients.employee_id
        and e.business_id = shift_offer_recipients.business_id
        and e.auth_user_id = auth.uid()
    )
  );
revoke all on public.shift_offers, public.shift_offer_recipients from public, anon, authenticated;
grant select on public.shift_offers, public.shift_offer_recipients to authenticated;

-- Returns null when eligible, otherwise a stable reason code.
create function public.shift_offer_ineligibility(p_shift_id uuid, p_employee_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
begin
  select * into v_shift from public.shifts where id = p_shift_id;
  if not found then
    return 'shift_unavailable';
  end if;
  if not exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.business_id = v_shift.business_id
      and e.venue_id = v_shift.venue_id and e.active
  ) then
    return 'venue';
  end if;
  if not exists (
    select 1 from public.employee_departments ed
    where ed.employee_id = p_employee_id and ed.department_id = v_shift.department_id
  ) then
    return 'department';
  end if;
  if exists (
    select 1 from public.job_roles r
    where r.business_id = v_shift.business_id and r.venue_id = v_shift.venue_id
      and r.department_id = v_shift.department_id
      and lower(r.name) = lower(trim(v_shift.role_title))
      and (not r.active or ((r.restrict_manual_assignment or r.restrict_auto_assignment)
        and not exists (
          select 1 from public.employee_job_roles er
          where er.employee_id = p_employee_id and er.job_role_id = r.id
        )))
  ) then
    return 'role';
  end if;
  if not public.employee_available_for_shift(p_employee_id, v_shift.starts_at, v_shift.ends_at) then
    return 'availability';
  end if;
  if public.shared_worker_has_overlap(
    v_shift.business_id, p_employee_id, v_shift.starts_at, v_shift.ends_at, v_shift.id
  ) then
    return 'conflict';
  end if;
  return null;
end;
$$;
revoke all on function public.shift_offer_ineligibility(uuid, uuid) from public, anon, authenticated;

create function public.list_shift_offer_candidates(
  p_business_id uuid, p_venue_id uuid, p_shift_id uuid
)
returns table (employee_id uuid, employee_name text, ineligibility text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
begin
  select * into v_shift from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id and s.venue_id = p_venue_id;
  if auth.uid() is null or not found
    or not public.can_manage_department(v_shift.business_id, v_shift.department_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select e.id, e.name, public.shift_offer_ineligibility(v_shift.id, e.id)
  from public.employees e
  join public.employee_departments ed
    on ed.employee_id = e.id and ed.department_id = v_shift.department_id
  where e.business_id = v_shift.business_id and e.venue_id = v_shift.venue_id and e.active
  order by lower(e.name), e.id;
end;
$$;

create function public.create_shift_offer(
  p_business_id uuid, p_venue_id uuid, p_shift_id uuid,
  p_employee_ids uuid[], p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
  v_offer_id uuid;
  v_employee_id uuid;
begin
  select * into v_shift from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id and s.venue_id = p_venue_id;
  if auth.uid() is null or not found
    or not public.can_manage_department(v_shift.business_id, v_shift.department_id) then
    raise exception 'Permission denied';
  end if;
  perform public.lock_scheduling_membership(v_shift.business_id, v_shift.department_id);
  if p_employee_ids is null or coalesce(array_ndims(p_employee_ids), 0) <> 1
    or cardinality(p_employee_ids) not between 1 and 200
    or array_position(p_employee_ids, null) is not null
    or (select count(distinct id) from unnest(p_employee_ids) id) <> cardinality(p_employee_ids) then
    raise exception 'Invalid offer audience';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if v_shift.status <> 'scheduled' or not v_shift.is_published
    or v_shift.employee_id is not null or v_shift.starts_at <= clock_timestamp() then
    raise exception 'Only upcoming published open shifts can be offered';
  end if;
  if p_expires_at is null or not isfinite(p_expires_at)
    or p_expires_at <= clock_timestamp() or p_expires_at > v_shift.starts_at then
    raise exception 'Offer expiry must be in the future and before the shift starts';
  end if;
  if exists (select 1 from public.shift_offers o where o.shift_id = v_shift.id and o.status = 'open') then
    raise exception 'This shift already has an open offer';
  end if;

  foreach v_employee_id in array p_employee_ids loop
    if public.shift_offer_ineligibility(v_shift.id, v_employee_id) is not null then
      raise exception 'Employee is not eligible for this offer';
    end if;
  end loop;

  insert into public.shift_offers (
    business_id, venue_id, department_id, shift_id, created_by, expires_at
  )
  values (
    v_shift.business_id, v_shift.venue_id, v_shift.department_id, v_shift.id,
    auth.uid(), p_expires_at
  )
  returning id into v_offer_id;
  insert into public.shift_offer_recipients (offer_id, business_id, venue_id, employee_id)
  select v_offer_id, v_shift.business_id, v_shift.venue_id, id
  from unnest(p_employee_ids) id;
  return v_offer_id;
end;
$$;

create function public.withdraw_shift_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.shift_offers%rowtype;
begin
  select * into v_offer from public.shift_offers where id = p_offer_id;
  if auth.uid() is null or not found
    or not public.can_manage_department(v_offer.business_id, v_offer.department_id) then
    raise exception 'Permission denied';
  end if;
  perform public.lock_scheduling_membership(v_offer.business_id, v_offer.department_id);
  select * into v_offer from public.shift_offers where id = p_offer_id for update;
  if v_offer.status <> 'open' then
    raise exception 'Shift offer is no longer open';
  end if;
  update public.shift_offers
  set status = 'withdrawn', closed_by = auth.uid(), closed_at = clock_timestamp()
  where id = p_offer_id;
  update public.shift_offer_recipients
  set outcome = 'closed', outcome_at = clock_timestamp()
  where offer_id = p_offer_id and outcome is null;
end;
$$;

-- Employees see offers addressed to their own linked profile that are still
-- open, unexpired and eligible, plus any offer they have already answered.
create function public.list_my_shift_offers(p_business_id uuid, p_venue_id uuid)
returns table (
  offer_id uuid, shift_id uuid, department_name text, role_title text,
  starts_at timestamptz, ends_at timestamptz, break_minutes integer,
  expires_at timestamptz, offer_status text, response text,
  responded_at timestamptz, outcome text, can_respond boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid()
  ) then
    raise exception 'Permission denied';
  end if;
  return query
  select o.id, s.id, d.name, s.role_title, s.starts_at, s.ends_at, s.break_minutes,
    o.expires_at, o.status, r.response, r.responded_at, r.outcome,
    (o.status = 'open' and r.response = 'pending' and o.expires_at > clock_timestamp())
  from public.shift_offer_recipients r
  join public.employees e
    on e.id = r.employee_id and e.business_id = r.business_id and e.venue_id = r.venue_id
  join public.shift_offers o on o.id = r.offer_id
  join public.shifts s on s.id = o.shift_id
  join public.departments d on d.id = o.department_id
  where r.business_id = p_business_id and r.venue_id = p_venue_id
    and e.auth_user_id = auth.uid() and e.active
    and (
      r.response <> 'pending' or r.outcome is not null
      or (o.status = 'open' and o.expires_at > clock_timestamp()
        and s.status = 'scheduled' and s.is_published and s.employee_id is null
        and public.shift_offer_ineligibility(s.id, r.employee_id) is null)
    )
  order by s.starts_at, o.id;
end;
$$;

create function public.respond_shift_offer(p_offer_id uuid, p_response text)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.shift_offers%rowtype;
  v_shift public.shifts%rowtype;
  v_employee_id uuid;
  v_response text;
  v_at timestamptz;
begin
  if auth.uid() is null or p_response not in ('accept', 'decline') then
    raise exception 'Shift offer not found or permission denied';
  end if;
  select * into v_offer from public.shift_offers where id = p_offer_id for share;
  if not found then
    raise exception 'Shift offer not found or permission denied';
  end if;
  select r.employee_id, r.response into v_employee_id, v_response
  from public.shift_offer_recipients r
  join public.employees e
    on e.id = r.employee_id and e.business_id = r.business_id and e.venue_id = r.venue_id
  join public.business_memberships m
    on m.business_id = r.business_id and m.user_id = auth.uid()
  where r.offer_id = v_offer.id and e.auth_user_id = auth.uid() and e.active
  for update of r;
  if not found then
    raise exception 'Shift offer not found or permission denied';
  end if;
  if v_response <> 'pending' then
    raise exception 'Shift offer already answered';
  end if;
  v_at := clock_timestamp();
  if v_offer.status <> 'open' then
    raise exception 'Shift offer is no longer available';
  end if;
  if v_offer.expires_at <= v_at then
    raise exception 'Shift offer has expired';
  end if;
  select * into v_shift from public.shifts where id = v_offer.shift_id;
  if v_shift.status <> 'scheduled' or not v_shift.is_published or v_shift.employee_id is not null then
    raise exception 'Shift offer is no longer available';
  end if;
  if p_response = 'accept' and public.shift_offer_ineligibility(v_shift.id, v_employee_id) is not null then
    raise exception 'You are no longer eligible for this shift';
  end if;
  update public.shift_offer_recipients
  set response = case p_response when 'accept' then 'accepted' else 'declined' end,
    responded_at = v_at, responded_by = auth.uid()
  where offer_id = v_offer.id and employee_id = v_employee_id;
  return v_at;
end;
$$;

-- Returns 'confirmed', or 'unavailable' when the latest eligibility check fails
-- (the claimant's outcome is recorded and the shift stays open).
create function public.confirm_shift_offer_claim(p_offer_id uuid, p_employee_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.shift_offers%rowtype;
  v_shift public.shifts%rowtype;
  v_at timestamptz;
begin
  select * into v_offer from public.shift_offers where id = p_offer_id;
  if auth.uid() is null or not found
    or not public.can_manage_department(v_offer.business_id, v_offer.department_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || v_offer.business_id::text, 0));
  perform public.lock_scheduling_membership(v_offer.business_id, v_offer.department_id);
  perform public.lock_shared_worker_groups(
    v_offer.business_id, array[p_employee_id], 'Roster changed while scheduling; please try again'
  );
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  select * into v_offer from public.shift_offers where id = p_offer_id for update;
  if v_offer.status = 'filled' then
    raise exception 'Shift offer has already been filled';
  end if;
  if v_offer.status <> 'open' then
    raise exception 'Shift offer is no longer open';
  end if;
  perform 1 from public.shift_offer_recipients r
  where r.offer_id = v_offer.id and r.employee_id = p_employee_id
    and r.response = 'accepted' and r.outcome is null
  for update;
  if not found then
    raise exception 'Only an accepted claim can be confirmed';
  end if;
  select * into v_shift from public.shifts where id = v_offer.shift_id for update;
  if v_shift.status <> 'scheduled' or not v_shift.is_published or v_shift.employee_id is not null then
    raise exception 'Shift is no longer open';
  end if;
  v_at := clock_timestamp();
  if v_shift.starts_at <= v_at then
    raise exception 'Shift has already started';
  end if;

  perform 1 from public.employees where id = p_employee_id for update;
  if public.shift_offer_ineligibility(v_shift.id, p_employee_id) is not null then
    update public.shift_offer_recipients set outcome = 'unavailable', outcome_at = v_at
    where offer_id = v_offer.id and employee_id = p_employee_id;
    return 'unavailable';
  end if;

  update public.shifts set employee_id = p_employee_id where id = v_shift.id;
  update public.shift_offers
  set status = 'filled', filled_employee_id = p_employee_id,
    closed_by = auth.uid(), closed_at = v_at
  where id = v_offer.id;
  update public.shift_offer_recipients
  set outcome = case
      when employee_id = p_employee_id then 'confirmed'
      when response = 'accepted' then 'not_selected'
      else 'closed' end,
    outcome_at = v_at
  where offer_id = v_offer.id and outcome is null;
  return 'confirmed';
end;
$$;

revoke all on function public.list_shift_offer_candidates(uuid, uuid, uuid),
  public.create_shift_offer(uuid, uuid, uuid, uuid[], timestamptz),
  public.withdraw_shift_offer(uuid),
  public.list_my_shift_offers(uuid, uuid),
  public.respond_shift_offer(uuid, text),
  public.confirm_shift_offer_claim(uuid, uuid)
  from public, anon;
grant execute on function public.list_shift_offer_candidates(uuid, uuid, uuid),
  public.create_shift_offer(uuid, uuid, uuid, uuid[], timestamptz),
  public.withdraw_shift_offer(uuid),
  public.list_my_shift_offers(uuid, uuid),
  public.respond_shift_offer(uuid, text),
  public.confirm_shift_offer_claim(uuid, uuid)
  to authenticated;
