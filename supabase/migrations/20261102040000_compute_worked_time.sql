create index attendance_sessions_venue_idx
  on public.attendance_sessions (business_id, venue_id, id);

create function public.list_worked_time(p_business_id uuid, p_venue_id uuid)
returns table (
  session_id uuid,
  employee_id uuid,
  employee_name text,
  department_id uuid,
  department_name text,
  venue_id uuid,
  venue_name text,
  venue_timezone text,
  clocked_in_at timestamptz,
  clocked_out_at timestamptz,
  elapsed_seconds numeric,
  worked_seconds numeric,
  paid_seconds numeric,
  paid_break_seconds numeric,
  unpaid_break_seconds numeric,
  exceptions text[]
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
  ) or not public.can_view_venue(p_business_id, p_venue_id) or not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'general_manager', 'foh_manager', 'boh_manager', 'department_manager')
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  with sessions as (
    select s.id, s.employee_id, e.name as employee_name, s.department_id,
      d.name as department_name, s.venue_id, v.name as venue_name,
      v.timezone as venue_timezone, ci.id as clock_in_id,
      ci.occurred_at as clock_in, co.id as clock_out_id, co.occurred_at as clock_out
    from public.attendance_sessions s
    join public.employees e on e.id = s.employee_id and e.business_id = s.business_id
    join public.departments d on d.id = s.department_id and d.business_id = s.business_id
    join public.venues v on v.id = s.venue_id and v.business_id = s.business_id
    left join public.attendance_events ci on ci.session_id = s.id and ci.event_type = 'clock_in'
    left join public.attendance_events co on co.session_id = s.id and co.event_type = 'clock_out'
    where s.business_id = p_business_id and s.venue_id = p_venue_id
      and public.can_manage_department(s.business_id, s.department_id)
  ), details as (
    select s.*, b.paid_break, b.unpaid_break, b.incomplete_break,
      b.invalid_break, b.overlapping_breaks, l.unchecked, l.pending_review, l.reviewed
    from sessions s
    cross join lateral (
      with spans as (
        select ab.id, ab.classification, started.occurred_at as started_at,
          ended.occurred_at as ended_at
        from public.attendance_breaks ab
        left join public.attendance_events started
          on started.break_id = ab.id and started.event_type = 'break_start'
        left join public.attendance_events ended
          on ended.break_id = ab.id and ended.event_type = 'break_end'
        where ab.session_id = s.id
      )
      select
        coalesce(sum(extract(epoch from sp.ended_at - sp.started_at))
          filter (where sp.classification = 'paid'), 0) as paid_break,
        coalesce(sum(extract(epoch from sp.ended_at - sp.started_at))
          filter (where sp.classification = 'unpaid'), 0) as unpaid_break,
        count(*) filter (where sp.started_at is null or sp.ended_at is null) > 0 as incomplete_break,
        count(*) filter (
          where sp.started_at is not null and sp.ended_at is not null
            and (sp.ended_at < sp.started_at
              or (s.clock_in is not null and sp.started_at < s.clock_in)
              or (s.clock_out is not null and sp.ended_at > s.clock_out))
        ) > 0 as invalid_break,
        exists (
          select 1 from spans a join spans z on a.id < z.id
          where a.started_at < a.ended_at and z.started_at < z.ended_at
            and a.started_at < z.ended_at and z.started_at < a.ended_at
        ) as overlapping_breaks
      from spans sp
    ) b
    cross join lateral (
      select
        coalesce(bool_or(c.id is null), false) as unchecked,
        coalesce(bool_or(c.verification_status = 'review' and r.id is null), false) as pending_review,
        coalesce(bool_or(c.verification_status = 'review' and r.id is not null), false) as reviewed
      from public.attendance_events ev
      left join public.attendance_location_checks c on c.event_id = ev.id
      left join public.attendance_location_reviews r on r.check_id = c.id
      where ev.session_id = s.id and ev.event_type in ('clock_in', 'clock_out')
    ) l
  ), flagged as (
    select d.*,
      array_remove(array[
        case when d.clock_in_id is null then 'missing_clock_in' end,
        case when d.clock_out_id is null then 'missing_clock_out' end,
        case when d.clock_in > d.clock_out then 'invalid_clock_order' end,
        case when d.incomplete_break then 'incomplete_break' end,
        case when d.invalid_break then 'invalid_break' end,
        case when d.overlapping_breaks then 'overlapping_breaks' end,
        case when d.unchecked then 'location_unverified' end,
        case when d.pending_review then 'location_review_required' end,
        case when d.reviewed then 'location_reviewed' end
      ], null)::text[] as flags,
      d.clock_in_id is not null and d.clock_out_id is not null
        and d.clock_in <= d.clock_out and not d.incomplete_break
        and not d.invalid_break and not d.overlapping_breaks as can_calculate
    from details d
  )
  select f.id, f.employee_id, f.employee_name, f.department_id, f.department_name,
    f.venue_id, f.venue_name, f.venue_timezone, f.clock_in, f.clock_out,
    case when f.can_calculate then extract(epoch from f.clock_out - f.clock_in) end,
    case when f.can_calculate then extract(epoch from f.clock_out - f.clock_in) - f.paid_break - f.unpaid_break end,
    case when f.can_calculate then extract(epoch from f.clock_out - f.clock_in) - f.unpaid_break end,
    case when f.can_calculate then f.paid_break end,
    case when f.can_calculate then f.unpaid_break end,
    f.flags
  from flagged f;
end;
$$;

revoke all on function public.list_worked_time(uuid, uuid) from public, anon;
grant execute on function public.list_worked_time(uuid, uuid) to authenticated;
