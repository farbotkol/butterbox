create or replace function public.save_shift(
  p_business_id uuid,
  p_venue_id uuid,
  p_department_id uuid,
  p_employee_id uuid,
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
  v_shift_id uuid;
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
    and d.id = p_department_id;
  if v_timezone is null then
    raise exception 'Venue or department not found';
  end if;
  select bounds.starts_at, bounds.ends_at into v_start, v_end
  from public.shift_time_bounds(v_timezone, p_start_local, p_end_local) bounds;

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
      where s.employee_id = p_employee_id and s.status = 'scheduled'
        and tstzrange(s.starts_at, s.ends_at, '[)')
          && tstzrange(v_start, v_end, '[)')
    ) then
      raise exception 'Employee has an overlapping shift';
    end if;
  end if;

  insert into public.shifts (
    business_id, venue_id, department_id, employee_id, role_title,
    starts_at, ends_at, break_minutes, created_by
  )
  values (
    p_business_id, p_venue_id, p_department_id, p_employee_id,
    trim(p_role_title), v_start, v_end, p_break_minutes, auth.uid()
  )
  returning id into v_shift_id;
  return v_shift_id;
end;
$$;

revoke all on function public.save_shift(uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer) from public, anon;
grant execute on function public.save_shift(uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer) to authenticated;
