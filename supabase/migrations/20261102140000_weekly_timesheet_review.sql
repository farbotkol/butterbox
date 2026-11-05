create function public.timesheet_week_bounds(p_business_id uuid, p_venue_id uuid, p_week_start date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
begin
  if p_business_id is null or p_venue_id is null or p_week_start is null
    or not isfinite(p_week_start) or extract(isodow from p_week_start) <> 1
    or p_week_start < '0001-01-01'::date or p_week_start > '9998-12-24'::date then
    raise exception 'Invalid timesheet week';
  end if;
  select v.timezone into v_timezone from public.venues v
  where v.id = p_venue_id and v.business_id = p_business_id;
  if auth.uid() is null or not found or not public.can_view_venue(p_business_id, p_venue_id)
    or not exists (
      select 1 from public.business_memberships m
      where m.business_id = p_business_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'general_manager', 'foh_manager', 'boh_manager', 'department_manager')
    ) then
    raise exception 'Permission denied';
  end if;
  return query select p_week_start::timestamp at time zone v_timezone,
    (p_week_start + 7)::timestamp at time zone v_timezone;
end;
$$;
revoke all on function public.timesheet_week_bounds(uuid, uuid, date)
  from public, anon, authenticated, service_role;

create function public.list_weekly_planned_shifts(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_employee_id uuid default null
)
returns table (
  shift_id uuid, employee_id uuid, employee_name text, department_id uuid, department_name text,
  starts_at timestamptz, ends_at timestamptz, break_minutes integer, scheduled_seconds numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  select b.starts_at, b.ends_at into v_start, v_end
  from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start) b;
  return query
  select s.id, s.employee_id, e.name, s.department_id, d.name,
    s.starts_at, s.ends_at, s.break_minutes, extract(epoch from s.ends_at - s.starts_at)
  from public.shifts s
  join public.employees e on e.id = s.employee_id and e.business_id = s.business_id and e.venue_id = s.venue_id
  join public.departments d on d.id = s.department_id and d.business_id = s.business_id and d.venue_id = s.venue_id
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.is_published and s.status = 'scheduled'
    and s.starts_at >= v_start and s.starts_at < v_end
    and (p_employee_id is null or s.employee_id = p_employee_id)
    and public.can_manage_department(s.business_id, s.department_id);
end;
$$;
revoke all on function public.list_weekly_planned_shifts(uuid, uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.list_weekly_planned_shifts(uuid, uuid, date, uuid) to authenticated;

create function public.list_weekly_worked_time(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_employee_id uuid default null
)
returns table (
  session_id uuid, employee_id uuid, employee_name text, department_id uuid, department_name text,
  venue_id uuid, venue_name text, venue_timezone text, clocked_in_at timestamptz,
  clocked_out_at timestamptz, elapsed_seconds numeric, worked_seconds numeric, paid_seconds numeric,
  paid_break_seconds numeric, unpaid_break_seconds numeric, exceptions text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  select b.starts_at, b.ends_at into v_start, v_end
  from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start) b;
  return query
  select w.session_id, w.employee_id, w.employee_name, w.department_id, w.department_name,
    w.venue_id, w.venue_name, w.venue_timezone, w.clocked_in_at, w.clocked_out_at,
    w.elapsed_seconds, w.worked_seconds, w.paid_seconds, w.paid_break_seconds, w.unpaid_break_seconds, w.exceptions
  from public.list_worked_time(p_business_id, p_venue_id) w
  join public.attendance_sessions s on s.id = w.session_id and s.business_id = p_business_id
  where coalesce(w.clocked_in_at, w.clocked_out_at, s.created_at) >= v_start
    and coalesce(w.clocked_in_at, w.clocked_out_at, s.created_at) < v_end
    and (p_employee_id is null or w.employee_id = p_employee_id);
end;
$$;
revoke all on function public.list_weekly_worked_time(uuid, uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.list_weekly_worked_time(uuid, uuid, date, uuid) to authenticated;

create function public.list_weekly_timesheet_events(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_employee_id uuid default null
)
returns table (
  event_id uuid, session_id uuid, event_type text, classification text,
  original_at timestamptz, effective_at timestamptz, finished boolean, locked boolean, source text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start);
  return query
  select e.event_id, e.session_id, e.event_type, e.classification, e.original_at,
    e.effective_at, e.finished, e.locked, original.source
  from public.list_attendance_correction_events(p_business_id, p_venue_id) e
  join public.list_weekly_worked_time(p_business_id, p_venue_id, p_week_start, p_employee_id) w
    on w.session_id = e.session_id
  join public.attendance_events original on original.id = e.event_id and original.business_id = p_business_id;
end;
$$;
revoke all on function public.list_weekly_timesheet_events(uuid, uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.list_weekly_timesheet_events(uuid, uuid, date, uuid) to authenticated;
