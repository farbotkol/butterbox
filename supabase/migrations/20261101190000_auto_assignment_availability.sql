create function public.employee_available_for_shift(
  p_employee_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_has_pattern boolean;
  v_available_minutes int4multirange;
  v_exception_days int8multirange;
  v_has_conflict boolean;
begin
  if p_employee_id is null or p_starts_at is null or p_ends_at is null
    or not isfinite(p_starts_at) or not isfinite(p_ends_at)
    or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '24 hours' then
    raise exception 'Invalid availability comparison';
  end if;
  select v.timezone into v_timezone
  from public.employees e
  join public.venues v on v.id = e.venue_id and v.business_id = e.business_id
  where e.id = p_employee_id;
  if v_timezone is null then
    raise exception 'Employee venue not found';
  end if;

  select exists (
    select 1 from public.employee_availability_patterns where employee_id = p_employee_id
  ) into v_has_pattern;
  if v_has_pattern then
    with intervals as (
      select (weekday - 1) * 1440 + start_minute as starts,
        case when end_minute > start_minute then end_minute - start_minute
          else end_minute - start_minute + 1440 end as duration
      from public.employee_availability_intervals
      where employee_id = p_employee_id
    ), segments as (
      select int4range(starts, least(starts + duration, 10080), '[)') as available
      from intervals
      union all
      select int4range(0, starts + duration - 10080, '[)')
      from intervals where starts + duration > 10080
    )
    select coalesce(range_agg(available), '{}'::int4multirange)
    into v_available_minutes from segments;
  end if;

  select coalesce(range_agg(int8range(
    (starts_on - date '2000-01-01')::bigint,
    (ends_on - date '2000-01-01')::bigint + 1,
    '[)'
  )), '{}'::int8multirange)
  into v_exception_days
  from public.employee_availability_exceptions
  where employee_id = p_employee_id
    and ((exception_type = 'unavailable' and status = 'active')
      or (exception_type = 'leave' and status = 'approved'));

  if v_exception_days = '{}'::int8multirange and (
    not v_has_pattern or v_available_minutes = int4multirange(int4range(0, 10080, '[)'))
  ) then
    return true;
  end if;

  -- PostgreSQL timezone transitions have second precision; submitted intervals
  -- change only on local minute boundaries, so each sampled second is uniform.
  select exists (
    select 1
    from generate_series(
      date_trunc('second', p_starts_at),
      date_trunc('second', p_ends_at - interval '1 microsecond'),
      interval '1 second'
    ) as instants(value)
    cross join lateral (select instants.value at time zone v_timezone as local_time) local
    where v_exception_days @> ((local.local_time::date - date '2000-01-01')::bigint)
      or (v_has_pattern and not (v_available_minutes @> (
        (extract(isodow from local.local_time)::integer - 1) * 1440
        + extract(hour from local.local_time)::integer * 60
        + extract(minute from local.local_time)::integer
      )))
  ) into v_has_conflict;
  return not v_has_conflict;
end;
$$;

revoke all on function public.employee_available_for_shift(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

create or replace function public.review_leave_request(
  p_business_id uuid,
  p_venue_id uuid,
  p_exception_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exception public.employee_availability_exceptions%rowtype;
  v_employee_id uuid;
begin
  select * into v_exception from public.employee_availability_exceptions
  where id = p_exception_id and business_id = p_business_id and venue_id = p_venue_id;
  if not found or not public.can_manage_employee_in_any_department(v_exception.employee_id) then
    raise exception 'Permission denied';
  end if;
  v_employee_id := v_exception.employee_id;
  perform 1 from public.employees
  where id = v_employee_id and business_id = p_business_id and venue_id = p_venue_id
  for update;
  if not found then
    raise exception 'Permission denied';
  end if;
  select * into v_exception from public.employee_availability_exceptions
  where id = p_exception_id and business_id = p_business_id and venue_id = p_venue_id
    and employee_id = v_employee_id
  for update;
  if not found or not public.can_manage_employee_in_any_department(v_exception.employee_id) then
    raise exception 'Permission denied';
  end if;
  if v_exception.exception_type <> 'leave' or p_status is null or not (
    (v_exception.status = 'pending' and p_status in ('approved', 'rejected'))
    or (v_exception.status = 'approved' and p_status = 'cancelled')
  ) then
    raise exception 'Leave request can no longer be changed';
  end if;
  update public.employee_availability_exceptions
  set status = p_status, updated_at = now(), updated_by = auth.uid()
  where id = p_exception_id;
end;
$$;

create or replace function public.save_shift_auto_assign(
  p_business_id uuid,
  p_venue_id uuid,
  p_department_id uuid,
  p_role_title text,
  p_start_local timestamp without time zone,
  p_end_local timestamp without time zone,
  p_break_minutes integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_start timestamptz;
  v_end timestamptz;
  v_employee_id uuid;
begin
  if not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if length(trim(coalesce(p_role_title, ''))) not between 1 and 80
    or p_break_minutes is null or p_break_minutes not between 0 and 240
    or p_start_local is null or p_end_local is null then
    raise exception 'Invalid shift details';
  end if;
  select v.timezone into v_timezone
  from public.venues v
  join public.departments d on d.venue_id = v.id and d.business_id = v.business_id
  where v.id = p_venue_id and v.business_id = p_business_id
    and d.id = p_department_id and d.active
  for share of d;
  if v_timezone is null then
    raise exception 'Venue or active department not found';
  end if;

  perform 1 from public.job_roles r
  where r.department_id = p_department_id and lower(r.name) = lower(trim(p_role_title))
  for share;
  if exists (
    select 1 from public.job_roles r
    where r.department_id = p_department_id and lower(r.name) = lower(trim(p_role_title))
      and not r.active
  ) then
    raise exception 'Job role is inactive';
  end if;
  select bounds.starts_at, bounds.ends_at into v_start, v_end
  from public.shift_time_bounds(v_timezone, p_start_local, p_end_local) bounds;

  for v_employee_id in
    select e.id from public.employees e
    join public.employee_departments ed
      on ed.employee_id = e.id and ed.department_id = p_department_id
    where e.business_id = p_business_id and e.venue_id = p_venue_id and e.active
    order by lower(e.name), e.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_employee_id::text, 0));
    perform 1 from public.employees e
    where e.id = v_employee_id and e.business_id = p_business_id
      and e.venue_id = p_venue_id and e.active
    for update;
    if not found or not exists (
      select 1 from public.employee_departments ed
      where ed.employee_id = v_employee_id and ed.department_id = p_department_id
    ) then
      continue;
    end if;
    if exists (
      select 1 from public.job_roles r
      where r.department_id = p_department_id and lower(r.name) = lower(trim(p_role_title))
        and (r.restrict_auto_assignment or r.restrict_manual_assignment)
        and not exists (
          select 1 from public.employee_job_roles er
          where er.employee_id = v_employee_id and er.job_role_id = r.id
        )
    ) then
      continue;
    end if;
    if exists (
      select 1 from public.shifts s
      where s.employee_id = v_employee_id and s.status = 'scheduled'
        and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
    ) or not public.employee_available_for_shift(v_employee_id, v_start, v_end) then
      continue;
    end if;
    return public.save_shift(
      p_business_id, p_venue_id, p_department_id, v_employee_id,
      p_role_title, p_start_local, p_end_local, p_break_minutes
    );
  end loop;
  raise exception 'No eligible employee available for automatic assignment';
end;
$$;
