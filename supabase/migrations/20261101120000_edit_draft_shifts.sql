create or replace function public.update_draft_shift(
  p_business_id uuid,
  p_venue_id uuid,
  p_department_id uuid,
  p_shift_id uuid,
  p_employee_id uuid,
  p_role_title text,
  p_start_local timestamp without time zone,
  p_end_local timestamp without time zone,
  p_break_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
  v_timezone text;
  v_start timestamptz;
  v_end timestamptz;
  v_previous_start_local timestamp without time zone;
  v_previous_end_local timestamp without time zone;
  v_normalized_end_local timestamp without time zone;
  v_start_unchanged boolean;
begin
  if not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  select * into v_shift from public.shifts
  where id = p_shift_id and business_id = p_business_id
    and venue_id = p_venue_id and department_id = p_department_id
    and status = 'scheduled'
  for update;
  if not found then
    raise exception 'Shift not found';
  end if;
  if v_shift.is_published then
    raise exception 'Published shifts cannot be edited';
  end if;
  if length(trim(coalesce(p_role_title, ''))) not between 1 and 80
    or p_break_minutes is null or p_break_minutes not between 0 and 240
    or p_start_local is null or p_end_local is null then
    raise exception 'Invalid shift details';
  end if;

  select v.timezone into v_timezone from public.venues v
  join public.departments d on d.venue_id = v.id and d.business_id = v.business_id
  where v.id = p_venue_id and v.business_id = p_business_id
    and d.id = p_department_id and d.active;
  if v_timezone is null then
    raise exception 'Department is inactive';
  end if;

  select bounds.starts_at, bounds.ends_at into v_start, v_end
  from public.shift_time_bounds(v_timezone, p_start_local, p_end_local) bounds;
  v_previous_start_local := v_shift.starts_at at time zone v_timezone;
  v_previous_end_local := v_shift.ends_at at time zone v_timezone;
  v_normalized_end_local := case when p_end_local <= p_start_local
    then p_end_local + interval '1 day' else p_end_local end;
  -- The editor displays minutes; preserve hidden seconds and repeated-hour instants.
  v_start_unchanged := v_previous_start_local = p_start_local
    or (p_start_local = date_trunc('minute', p_start_local)
      and date_trunc('minute', v_previous_start_local) = p_start_local);
  if v_start_unchanged then
    v_start := v_shift.starts_at;
  end if;
  if v_previous_end_local = v_normalized_end_local
    or (v_normalized_end_local = date_trunc('minute', v_normalized_end_local)
      and date_trunc('minute', v_previous_end_local) = v_normalized_end_local)
    or (v_start_unchanged and (
      v_previous_end_local = p_end_local
      or (p_end_local = date_trunc('minute', p_end_local)
        and date_trunc('minute', v_previous_end_local) = p_end_local)
    )) then
    v_end := v_shift.ends_at;
  end if;
  if v_end <= v_start or v_end - v_start > interval '24 hours' then
    raise exception 'Invalid shift duration';
  end if;

  if p_employee_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
    perform e.id from public.employees e
    join public.employee_departments ed
      on ed.employee_id = e.id and ed.department_id = p_department_id
    where e.id = p_employee_id and e.business_id = p_business_id
      and e.venue_id = p_venue_id and e.active
    for share of e;
    if not found then
      raise exception 'Employee is not eligible for this department';
    end if;
    if exists (
      select 1 from public.shifts s
      where s.employee_id = p_employee_id and s.id <> p_shift_id
        and s.status = 'scheduled'
        and tstzrange(s.starts_at, s.ends_at, '[)')
          && tstzrange(v_start, v_end, '[)')
    ) then
      raise exception 'Employee has an overlapping shift';
    end if;
  end if;

  update public.shifts set
    employee_id = p_employee_id,
    role_title = trim(p_role_title),
    starts_at = v_start,
    ends_at = v_end,
    break_minutes = p_break_minutes
  where id = p_shift_id;
end;
$$;

revoke all on function public.update_draft_shift(uuid, uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer) from public, anon;
grant execute on function public.update_draft_shift(uuid, uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer) to authenticated;
