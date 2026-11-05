create function public.get_weekly_exceptions_report(
  p_business_id uuid, p_venue_id uuid, p_week_start date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  select b.starts_at, b.ends_at into v_start, v_end
  from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start) b;

  if p_week_start < '1000-01-06'::date then
    raise exception 'Unsupported exceptions report week';
  end if;

  with planned as materialized (
    select * from public.list_weekly_planned_shifts(p_business_id, p_venue_id, p_week_start)
  ), actual as materialized (
    select w.*, public.attendance_timesheet_status(w.session_id) as approval_status
    from public.list_weekly_worked_time(p_business_id, p_venue_id, p_week_start) w
  ), employee_names as materialized (
    select e.id, case
      when public.can_manage_department(e.business_id, e.department_id)
        or public.can_manage_employee_in_any_department(e.id)
        or (e.auth_user_id = auth.uid() and public.can_view_department(e.business_id, e.department_id))
      then e.name else 'Former team member' end as display_name
    from public.employees e
    where e.business_id = p_business_id and e.venue_id = p_venue_id
  ), conflicting_shifts as materialized (
    select s.id as shift_id, s.employee_id, e.display_name as employee_name,
      s.department_id, d.name as department_name, s.starts_at, s.ends_at,
      s.break_minutes, extract(epoch from s.ends_at - s.starts_at) as scheduled_seconds,
      s.is_published
    from public.shifts s
    join employee_names e on e.id = s.employee_id
    join public.departments d on d.id = s.department_id and d.business_id = s.business_id and d.venue_id = s.venue_id
    where s.business_id = p_business_id and s.venue_id = p_venue_id
      and s.status = 'scheduled' and s.employee_id is not null
      and s.starts_at >= v_start and s.starts_at < v_end
      and public.can_manage_department(s.business_id, s.department_id)
      and public.shared_worker_has_overlap(s.business_id, s.employee_id, s.starts_at, s.ends_at, s.id)
  )
  select jsonb_build_object(
    'business_id', p_business_id, 'venue_id', p_venue_id, 'week_start', p_week_start,
    'planned', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('employee_name', n.display_name)
      order by p.starts_at, p.shift_id) from planned p join employee_names n on n.id = p.employee_id), '[]'::jsonb),
    'actual', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('employee_name', n.display_name)
      order by a.clocked_in_at nulls first, a.session_id) from actual a join employee_names n on n.id = a.employee_id), '[]'::jsonb),
    'overlaps', coalesce((select jsonb_agg(to_jsonb(o) order by o.starts_at, o.shift_id) from conflicting_shifts o), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_weekly_exceptions_report(uuid, uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_weekly_exceptions_report(uuid, uuid, date) to authenticated;
