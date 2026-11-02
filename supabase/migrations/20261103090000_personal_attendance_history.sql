create function public.list_my_attendance_history(p_business_id uuid, p_venue_id uuid)
returns table (
  event_id uuid,
  session_id uuid,
  department_name text,
  event_type text,
  classification text,
  original_at timestamptz,
  effective_at timestamptz,
  has_correction boolean,
  event_source text,
  location_status text,
  location_reason text,
  distance_meters numeric,
  accuracy_meters numeric,
  radius_meters integer,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v
    where v.id = p_venue_id and v.business_id = p_business_id
  ) or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select ev.id, s.id, d.name, ev.event_type, br.classification, ev.occurred_at,
    public.attendance_effective_time(ev.id),
    exists (select 1 from public.attendance_event_corrections c where c.event_id = ev.id),
    ev.source, loc.verification_status, loc.reason, loc.distance_meters,
    loc.accuracy_meters, loc.radius_meters, review.created_at
  from public.attendance_sessions s
  join public.attendance_events ev on ev.session_id = s.id and ev.business_id = s.business_id
  join public.departments d on d.id = s.department_id and d.business_id = s.business_id
    and d.venue_id = s.venue_id
  left join public.attendance_breaks br on br.id = ev.break_id and br.session_id = s.id
  left join public.attendance_location_checks loc on loc.event_id = ev.id
    and loc.session_id = s.id and loc.business_id = s.business_id
  left join public.attendance_location_reviews review on review.check_id = loc.id
    and review.session_id = s.id and review.business_id = s.business_id
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.started_by = auth.uid() and public.can_view_attendance_session(s.id);
end;
$$;
revoke all on function public.list_my_attendance_history(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.list_my_attendance_history(uuid, uuid) to authenticated;
