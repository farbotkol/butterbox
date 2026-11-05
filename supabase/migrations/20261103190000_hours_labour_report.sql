create function public.get_hours_labour_report(
  p_business_id uuid, p_week_start date, p_venue_id uuid default null, p_department_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue record;
  v_rows jsonb := '[]'::jsonb;
  v_venue_rows jsonb;
begin
  if auth.uid() is null or p_business_id is null
    or not public.has_business_role(p_business_id, array['owner']) then
    raise exception 'Only a business owner can view the hours and labour report';
  end if;
  if p_week_start is null or not isfinite(p_week_start)
    or p_week_start < '0001-01-01'::date or p_week_start > '9998-12-24'::date
    or extract(isodow from p_week_start) <> 1 then
    raise exception 'Invalid report week';
  end if;
  if (p_venue_id is not null and not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  )) or (p_department_id is not null and not exists (
    select 1 from public.departments d where d.id = p_department_id and d.business_id = p_business_id
      and (p_venue_id is null or d.venue_id = p_venue_id)
  )) then
    raise exception 'Invalid report filter';
  end if;

  for v_venue in
    select v.id, v.name, v.timezone from public.venues v
    where v.business_id = p_business_id and (p_venue_id is null or v.id = p_venue_id)
      and (p_department_id is null or exists (
        select 1 from public.departments d where d.id = p_department_id and d.venue_id = v.id
          and d.business_id = p_business_id
      ))
    order by v.name, v.id
  loop
    with planned as materialized (
      select s.department_id, sum(s.scheduled_seconds) as scheduled_seconds, count(*) as scheduled_shifts
      from public.list_weekly_planned_shifts(p_business_id, v_venue.id, p_week_start) s
      group by s.department_id
    ), actual as materialized (
      select w.*, public.attendance_timesheet_status(w.session_id) = 'approved'
        and w.worked_seconds is not null and w.paid_seconds is not null as included
      from public.list_weekly_worked_time(p_business_id, v_venue.id, p_week_start) w
    ), totals as (
      select a.department_id,
        sum(a.worked_seconds) filter (where a.included) as approved_worked_seconds,
        sum(a.paid_seconds) filter (where a.included) as approved_paid_seconds,
        count(*) filter (where a.included) as approved_entries,
        count(*) filter (where not a.included) as excluded_entries,
        count(*) filter (where a.worked_seconds is null or a.paid_seconds is null) as invalid_entries
      from actual a group by a.department_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'business_id', p_business_id, 'week_start', p_week_start,
      'venue_id', v_venue.id, 'venue_name', v_venue.name, 'venue_timezone', v_venue.timezone,
      'department_id', d.id, 'department_name', d.name,
      'scheduled_seconds', coalesce(p.scheduled_seconds, 0),
      'scheduled_shifts', coalesce(p.scheduled_shifts, 0),
      'approved_worked_seconds', coalesce(t.approved_worked_seconds, 0),
      'approved_paid_seconds', coalesce(t.approved_paid_seconds, 0),
      'approved_entries', coalesce(t.approved_entries, 0),
      'excluded_entries', coalesce(t.excluded_entries, 0),
      'invalid_entries', coalesce(t.invalid_entries, 0)
    ) order by d.name, d.id), '[]'::jsonb)
    into v_venue_rows
    from public.departments d
    left join planned p on p.department_id = d.id
    left join totals t on t.department_id = d.id
    where d.business_id = p_business_id and d.venue_id = v_venue.id
      and (p_department_id is null or d.id = p_department_id);
    v_rows := v_rows || v_venue_rows;
  end loop;
  return v_rows;
end;
$$;

revoke all on function public.get_hours_labour_report(uuid, date, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_hours_labour_report(uuid, date, uuid, uuid) to authenticated;
