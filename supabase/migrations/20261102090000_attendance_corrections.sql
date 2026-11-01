create table public.attendance_event_corrections (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  business_id uuid not null references public.businesses (id) on delete cascade,
  session_id uuid not null,
  event_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  old_at timestamptz not null check (isfinite(old_at)),
  new_at timestamptz not null check (isfinite(new_at)),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (event_id, session_id, business_id)
    references public.attendance_events (id, session_id, business_id) on delete cascade,
  unique (business_id, actor_id, request_id)
);
create index attendance_event_corrections_event_idx
  on public.attendance_event_corrections (event_id, sequence desc);
create index attendance_event_corrections_session_idx
  on public.attendance_event_corrections (business_id, session_id, sequence);
create trigger attendance_event_corrections_immutable
  before update or delete on public.attendance_event_corrections
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.attendance_event_corrections enable row level security;
revoke all on public.attendance_event_corrections from public, anon, authenticated, service_role;
create policy "Members can view scoped attendance corrections"
  on public.attendance_event_corrections for select to authenticated
  using (public.can_view_attendance_session(session_id));
grant select on public.attendance_event_corrections to authenticated;

create table public.attendance_edit_lock_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  business_id uuid not null references public.businesses (id) on delete cascade,
  session_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  locked boolean not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (session_id, business_id)
    references public.attendance_sessions (id, business_id) on delete cascade,
  unique (business_id, actor_id, request_id)
);
create index attendance_edit_lock_events_session_idx
  on public.attendance_edit_lock_events (session_id, sequence desc);
create trigger attendance_edit_lock_events_immutable
  before update or delete on public.attendance_edit_lock_events
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.attendance_edit_lock_events enable row level security;
revoke all on public.attendance_edit_lock_events from public, anon, authenticated, service_role;
create policy "Members can view scoped attendance edit locks"
  on public.attendance_edit_lock_events for select to authenticated
  using (public.can_view_attendance_session(session_id));
grant select on public.attendance_edit_lock_events to authenticated;

create function public.attendance_effective_time(p_event_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.new_at from public.attendance_event_corrections c
      where c.event_id = e.id order by c.sequence desc limit 1),
    e.occurred_at
  )
  from public.attendance_events e where e.id = p_event_id;
$$;
revoke all on function public.attendance_effective_time(uuid) from public, anon, authenticated, service_role;

create function public.attendance_edits_locked(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select l.locked from public.attendance_edit_lock_events l
    where l.session_id = p_session_id order by l.sequence desc limit 1
  ), false);
$$;
revoke all on function public.attendance_edits_locked(uuid) from public, anon, authenticated, service_role;

create function public.lock_attendance_worker(p_business_id uuid, p_employee_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group uuid;
begin
  select p.shared_worker_id into v_group from public.shared_worker_profiles p
  where p.business_id = p_business_id and p.employee_id = p_employee_id;
  if v_group is not null then
    perform pg_advisory_xact_lock(hashtextextended('shared-worker:' || v_group::text, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'attendance-employee:' || p_business_id::text || ':' || p_employee_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'attendance-user:' || p_business_id::text || ':' || p_actor_id::text, 0
  ));
end;
$$;
revoke all on function public.lock_attendance_worker(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.lock_attendance_identity(p_business_id uuid, p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.lock_attendance_worker(p_business_id, p_employee_id, auth.uid());
end;
$$;

create function public.lock_attendance_session_for_edit(
  p_business_id uuid, p_venue_id uuid, p_session_id uuid
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions%rowtype;
begin
  if p_business_id is null or p_venue_id is null or p_session_id is null then
    raise exception 'Invalid attendance edit request';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_attendance_membership(p_business_id);
  select s.* into v_session from public.attendance_sessions s
  where s.id = p_session_id and s.business_id = p_business_id and s.venue_id = p_venue_id;
  if not found or not public.can_manage_department(p_business_id, v_session.department_id) then
    raise exception 'Session not found or permission denied';
  end if;
  perform public.lock_attendance_worker(p_business_id, v_session.employee_id, v_session.started_by);
  select s.* into v_session from public.attendance_sessions s
  where s.id = p_session_id and s.business_id = p_business_id and s.venue_id = p_venue_id
  for update;
  if not found or not public.can_manage_department(p_business_id, v_session.department_id) then
    raise exception 'Session not found or permission denied';
  end if;
  return v_session;
end;
$$;
revoke all on function public.lock_attendance_session_for_edit(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.correct_attendance_event(
  p_business_id uuid, p_venue_id uuid, p_session_id uuid, p_event_id uuid,
  p_request_id uuid, p_expected_at timestamptz, p_new_at timestamptz, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_event public.attendance_events%rowtype;
  v_previous public.attendance_event_corrections%rowtype;
  v_current timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
begin
  if p_event_id is null or p_request_id is null or p_expected_at is null or not isfinite(p_expected_at)
    or p_new_at is null or not isfinite(p_new_at) or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid attendance correction';
  end if;
  v_session := public.lock_attendance_session_for_edit(p_business_id, p_venue_id, p_session_id);
  select e.* into v_event from public.attendance_events e
  where e.id = p_event_id and e.business_id = p_business_id and e.session_id = p_session_id;
  if not found then
    raise exception 'Event not found or permission denied';
  end if;
  select c.* into v_previous from public.attendance_event_corrections c
  where c.business_id = p_business_id and c.actor_id = auth.uid() and c.request_id = p_request_id;
  if found then
    if v_previous.session_id <> p_session_id or v_previous.event_id <> p_event_id
      or v_previous.old_at <> p_expected_at or v_previous.new_at <> p_new_at
      or v_previous.reason <> btrim(p_reason) then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.id;
  end if;
  if public.attendance_edits_locked(p_session_id) then
    raise exception 'Attendance edits are locked';
  end if;
  if not exists (
    select 1 from public.attendance_events e
    where e.session_id = p_session_id and e.event_type = 'clock_in'
  ) or not exists (
    select 1 from public.attendance_events e
    where e.session_id = p_session_id and e.event_type = 'clock_out'
  ) then
    raise exception 'Only finished sessions can be corrected';
  end if;
  v_current := public.attendance_effective_time(p_event_id);
  if v_current is distinct from p_expected_at then
    raise exception 'Attendance changed; refresh before correcting';
  end if;
  if p_new_at = v_current or p_new_at > clock_timestamp() then
    raise exception 'Invalid attendance correction time';
  end if;

  if v_event.event_type in ('clock_in', 'clock_out') then
    select public.attendance_effective_time(e.id) into v_start
      from public.attendance_events e where e.session_id = p_session_id and e.event_type = 'clock_in';
    select public.attendance_effective_time(e.id) into v_end
      from public.attendance_events e where e.session_id = p_session_id and e.event_type = 'clock_out';
    if v_event.event_type = 'clock_in' then v_start := p_new_at; else v_end := p_new_at; end if;
    if v_start < v_end and exists (
      select 1 from public.attendance_sessions s
      join public.attendance_events ci on ci.session_id = s.id and ci.event_type = 'clock_in'
      left join public.attendance_events co on co.session_id = s.id and co.event_type = 'clock_out'
      where s.business_id = p_business_id and s.id <> p_session_id
        and (
          s.started_by = v_session.started_by or s.employee_id = v_session.employee_id
          or exists (
            select 1 from public.shared_worker_profiles own
            join public.shared_worker_profiles linked on linked.shared_worker_id = own.shared_worker_id
            where own.business_id = p_business_id and own.employee_id = v_session.employee_id
              and linked.employee_id = s.employee_id
          )
        )
        and public.attendance_effective_time(ci.id) < v_end
        and (co.id is null or v_start < public.attendance_effective_time(co.id))
    ) then
      raise exception 'Corrected attendance overlaps another session';
    end if;
  end if;
  insert into public.attendance_event_corrections (
    business_id, session_id, event_id, actor_id, request_id, old_at, new_at, reason
  ) values (
    p_business_id, p_session_id, p_event_id, auth.uid(), p_request_id, v_current, p_new_at, btrim(p_reason)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.correct_attendance_event(
  uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text
) from public, anon, service_role;
grant execute on function public.correct_attendance_event(
  uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text
) to authenticated;

create function public.list_attendance_correction_events(p_business_id uuid, p_venue_id uuid)
returns table (
  event_id uuid, session_id uuid, event_type text, classification text,
  original_at timestamptz, effective_at timestamptz, finished boolean, locked boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) or not public.can_view_venue(p_business_id, p_venue_id) or not exists (
    select 1 from public.business_memberships m where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'general_manager', 'foh_manager', 'boh_manager', 'department_manager')
  ) then
    raise exception 'Permission denied';
  end if;
  return query
  select e.id, s.id, e.event_type, b.classification, e.occurred_at,
    public.attendance_effective_time(e.id),
    exists (select 1 from public.attendance_events ci where ci.session_id = s.id and ci.event_type = 'clock_in')
      and exists (select 1 from public.attendance_events co where co.session_id = s.id and co.event_type = 'clock_out'),
    public.attendance_edits_locked(s.id)
  from public.attendance_sessions s
  join public.attendance_events e on e.session_id = s.id and e.business_id = s.business_id
  left join public.attendance_breaks b on b.id = e.break_id and b.session_id = s.id
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and public.can_manage_department(s.business_id, s.department_id);
end;
$$;
revoke all on function public.list_attendance_correction_events(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_attendance_correction_events(uuid, uuid) to authenticated;

create function public.list_attendance_corrections(p_business_id uuid, p_venue_id uuid)
returns table (
  id uuid, sequence bigint, session_id uuid, event_id uuid, event_type text, employee_name text,
  department_name text, original_at timestamptz, old_at timestamptz, new_at timestamptz,
  reason text, actor_id uuid, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select c.id, c.sequence, c.session_id, c.event_id, ev.event_type, e.name, d.name,
    ev.occurred_at, c.old_at, c.new_at, c.reason, c.actor_id, c.created_at
  from public.attendance_event_corrections c
  join public.attendance_sessions s on s.id = c.session_id and s.business_id = c.business_id
  join public.attendance_events ev on ev.id = c.event_id and ev.session_id = s.id
  join public.employees e on e.id = s.employee_id and e.business_id = s.business_id
  join public.departments d on d.id = s.department_id and d.business_id = s.business_id
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and public.can_view_attendance_session(s.id);
end;
$$;
revoke all on function public.list_attendance_corrections(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_attendance_corrections(uuid, uuid) to authenticated;

create function public.list_attendance_edit_lock_history(p_business_id uuid, p_venue_id uuid)
returns table (
  id uuid, sequence bigint, session_id uuid, locked boolean, reason text,
  actor_id uuid, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) or not public.can_view_venue(p_business_id, p_venue_id) or not exists (
    select 1 from public.business_memberships m where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'general_manager', 'foh_manager', 'boh_manager', 'department_manager')
  ) then
    raise exception 'Permission denied';
  end if;
  return query
  select l.id, l.sequence, l.session_id, l.locked, l.reason, l.actor_id, l.created_at
  from public.attendance_edit_lock_events l
  join public.attendance_sessions s on s.id = l.session_id and s.business_id = l.business_id
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and public.can_manage_department(s.business_id, s.department_id);
end;
$$;
revoke all on function public.list_attendance_edit_lock_history(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_attendance_edit_lock_history(uuid, uuid) to authenticated;

create or replace function public.list_worked_time(p_business_id uuid, p_venue_id uuid)
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
      public.attendance_effective_time(ci.id) as clock_in,
      co.id as clock_out_id, public.attendance_effective_time(co.id) as clock_out
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
        select ab.id, ab.classification,
          public.attendance_effective_time(started.id) as started_at,
          public.attendance_effective_time(ended.id) as ended_at
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

create function public.set_attendance_edit_lock(
  p_business_id uuid, p_venue_id uuid, p_session_id uuid, p_request_id uuid,
  p_locked boolean, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_previous public.attendance_edit_lock_events%rowtype;
  v_worked numeric;
  v_id uuid;
begin
  if p_request_id is null or p_locked is null or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid attendance lock request';
  end if;
  v_session := public.lock_attendance_session_for_edit(p_business_id, p_venue_id, p_session_id);
  if not p_locked and not exists (
    select 1 from public.business_memberships m where m.business_id = p_business_id
      and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'general_manager')
  ) then
    raise exception 'Only an owner or general manager can unlock attendance edits';
  end if;
  select l.* into v_previous from public.attendance_edit_lock_events l
  where l.business_id = p_business_id and l.actor_id = auth.uid() and l.request_id = p_request_id;
  if found then
    if v_previous.session_id <> p_session_id or v_previous.locked <> p_locked
      or v_previous.reason <> btrim(p_reason) then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.id;
  end if;
  if public.attendance_edits_locked(p_session_id) = p_locked then
    raise exception 'Attendance edit lock is already in that state';
  end if;
  if p_locked then
    select w.worked_seconds into v_worked from public.list_worked_time(p_business_id, p_venue_id) w
    where w.session_id = v_session.id;
    if v_worked is null then
      raise exception 'Incomplete or invalid attendance cannot be locked';
    end if;
  end if;
  insert into public.attendance_edit_lock_events (
    business_id, session_id, actor_id, request_id, locked, reason
  ) values (p_business_id, p_session_id, auth.uid(), p_request_id, p_locked, btrim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.set_attendance_edit_lock(uuid, uuid, uuid, uuid, boolean, text)
  from public, anon, service_role;
grant execute on function public.set_attendance_edit_lock(uuid, uuid, uuid, uuid, boolean, text)
  to authenticated;
