alter table public.attendance_sessions
  add constraint attendance_sessions_id_business_id_key unique (id, business_id);

create table public.attendance_breaks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  classification text not null check (classification in ('paid', 'unpaid')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (session_id, business_id)
    references public.attendance_sessions (id, business_id) on delete cascade,
  unique (id, session_id)
);
create index attendance_breaks_session_idx on public.attendance_breaks (session_id);
create trigger attendance_breaks_immutable
  before update or delete on public.attendance_breaks
  for each row execute function public.prevent_original_attendance_mutation();

alter table public.attendance_breaks enable row level security;
revoke all on public.attendance_breaks from public, anon, authenticated;
create policy "Members can view attendance breaks in their scope"
  on public.attendance_breaks for select to authenticated
  using (public.can_view_attendance_session(session_id));
grant select on public.attendance_breaks to authenticated;

alter table public.attendance_events
  drop constraint attendance_events_event_type_check,
  add column break_id uuid,
  add constraint attendance_events_type_break_check check (
    (event_type in ('clock_in', 'clock_out') and break_id is null)
    or (event_type in ('break_start', 'break_end') and break_id is not null)
  ),
  add constraint attendance_events_break_session_fkey foreign key (break_id, session_id)
    references public.attendance_breaks (id, session_id) on delete cascade;
create unique index attendance_events_break_start_idx
  on public.attendance_events (break_id) where event_type = 'break_start';
create unique index attendance_events_break_end_idx
  on public.attendance_events (break_id) where event_type = 'break_end';

create function public.lock_my_attendance_session(p_business_id uuid, p_session_id uuid)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions%rowtype;
begin
  if p_business_id is null or p_session_id is null then
    raise exception 'Invalid break request';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_attendance_membership(p_business_id);
  select s.* into v_session from public.attendance_sessions s
  where s.id = p_session_id and s.business_id = p_business_id and s.started_by = auth.uid();
  if not found then
    raise exception 'Session not found or permission denied';
  end if;
  perform public.lock_attendance_identity(p_business_id, v_session.employee_id);
  perform 1 from public.employees e
  where e.id = v_session.employee_id and e.business_id = p_business_id
    and e.venue_id = v_session.venue_id and e.auth_user_id = auth.uid()
  for share;
  if not found or not public.can_view_department(p_business_id, v_session.department_id) then
    raise exception 'Session not found or permission denied';
  end if;
  return v_session;
end;
$$;
revoke all on function public.lock_my_attendance_session(uuid, uuid) from public, anon, authenticated;

create function public.check_attendance_clock_out()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.event_type = 'clock_out' then
    if exists (
      select 1 from public.attendance_breaks b
      join public.attendance_events started on started.break_id = b.id and started.event_type = 'break_start'
      where b.session_id = new.session_id and not exists (
        select 1 from public.attendance_events ended
        where ended.break_id = b.id and ended.event_type = 'break_end'
      )
    ) then
      raise exception 'End the open break before clocking out';
    end if;
    if exists (
      select 1 from public.attendance_events e
      where e.session_id = new.session_id and e.occurred_at > new.occurred_at
    ) then
      raise exception 'Server clock is earlier than the previous attendance event';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.check_attendance_clock_out() from public, anon, authenticated;
create trigger attendance_events_check_clock_out
  before insert on public.attendance_events
  for each row execute function public.check_attendance_clock_out();

create function public.start_attendance_break(
  p_business_id uuid, p_session_id uuid, p_classification text, p_request_id uuid
)
returns table (session_id uuid, event_id uuid, occurred_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_event public.attendance_events%rowtype;
  v_break_id uuid;
  v_latest timestamptz;
  v_now timestamptz;
begin
  if p_request_id is null or p_classification is null
    or p_classification not in ('paid', 'unpaid') then
    raise exception 'Invalid break request';
  end if;
  v_session := public.lock_my_attendance_session(p_business_id, p_session_id);
  select e.* into v_event from public.attendance_events e
  where e.business_id = p_business_id and e.actor_id = auth.uid() and e.request_id = p_request_id;
  if found then
    if v_event.event_type <> 'break_start' or v_event.session_id <> p_session_id or not exists (
      select 1 from public.attendance_breaks b
      where b.id = v_event.break_id and b.classification = p_classification
    ) then
      raise exception 'Request identifier already used';
    end if;
    return query select v_event.session_id, v_event.id, v_event.occurred_at;
    return;
  end if;
  if not public.attendance_session_is_open(p_session_id) then
    raise exception 'Attendance session is not open';
  end if;
  if exists (
    select 1 from public.attendance_breaks b
    join public.attendance_events started on started.break_id = b.id and started.event_type = 'break_start'
    where b.session_id = p_session_id and not exists (
      select 1 from public.attendance_events ended
      where ended.break_id = b.id and ended.event_type = 'break_end'
    )
  ) then
    raise exception 'Already on a break';
  end if;
  select max(e.occurred_at) into v_latest from public.attendance_events e where e.session_id = p_session_id;
  v_now := clock_timestamp();
  if v_latest is null or v_now < v_latest then
    raise exception 'Server clock is earlier than the previous attendance event';
  end if;
  insert into public.attendance_breaks (session_id, business_id, classification)
  values (p_session_id, p_business_id, p_classification) returning id into v_break_id;
  insert into public.attendance_events (
    session_id, business_id, venue_id, department_id, employee_id, actor_id,
    request_id, event_type, break_id, occurred_at
  ) values (
    v_session.id, v_session.business_id, v_session.venue_id, v_session.department_id,
    v_session.employee_id, auth.uid(), p_request_id, 'break_start', v_break_id, v_now
  ) returning * into v_event;
  return query select v_event.session_id, v_event.id, v_event.occurred_at;
end;
$$;

create function public.end_attendance_break(
  p_business_id uuid, p_session_id uuid, p_break_id uuid, p_request_id uuid
)
returns table (session_id uuid, event_id uuid, occurred_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_event public.attendance_events%rowtype;
  v_latest timestamptz;
  v_now timestamptz;
begin
  if p_break_id is null or p_request_id is null then
    raise exception 'Invalid break request';
  end if;
  v_session := public.lock_my_attendance_session(p_business_id, p_session_id);
  select e.* into v_event from public.attendance_events e
  where e.business_id = p_business_id and e.actor_id = auth.uid() and e.request_id = p_request_id;
  if found then
    if v_event.event_type <> 'break_end' or v_event.session_id <> p_session_id
      or v_event.break_id <> p_break_id then
      raise exception 'Request identifier already used';
    end if;
    return query select v_event.session_id, v_event.id, v_event.occurred_at;
    return;
  end if;
  if not exists (
    select 1 from public.attendance_breaks b
    where b.id = p_break_id and b.session_id = p_session_id and b.business_id = p_business_id
  ) then
    raise exception 'Break not found or permission denied';
  end if;
  if exists (
    select 1 from public.attendance_events e where e.break_id = p_break_id and e.event_type = 'break_end'
  ) then
    raise exception 'Break already ended';
  end if;
  if not public.attendance_session_is_open(p_session_id) then
    raise exception 'Attendance session is not open';
  end if;
  if not exists (
    select 1 from public.attendance_events e where e.break_id = p_break_id and e.event_type = 'break_start'
  ) then
    raise exception 'Break start event not found';
  end if;
  select max(e.occurred_at) into v_latest from public.attendance_events e where e.session_id = p_session_id;
  v_now := clock_timestamp();
  if v_latest is null or v_now < v_latest then
    raise exception 'Server clock is earlier than the previous attendance event';
  end if;
  insert into public.attendance_events (
    session_id, business_id, venue_id, department_id, employee_id, actor_id,
    request_id, event_type, break_id, occurred_at
  ) values (
    v_session.id, v_session.business_id, v_session.venue_id, v_session.department_id,
    v_session.employee_id, auth.uid(), p_request_id, 'break_end', p_break_id, v_now
  ) returning * into v_event;
  return query select v_event.session_id, v_event.id, v_event.occurred_at;
end;
$$;

create function public.get_my_attendance_state_with_break(p_business_id uuid)
returns table (
  state text, session_id uuid, venue_id uuid, venue_name text, venue_timezone text,
  department_name text, clocked_in_at timestamptz,
  break_id uuid, break_classification text, break_started_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.state, s.session_id, s.venue_id, s.venue_name, s.venue_timezone,
    s.department_name, s.clocked_in_at, active.id, active.classification, active.started_at
  from public.get_my_attendance_state(p_business_id) s
  left join lateral (
    select b.id, b.classification, started.occurred_at as started_at
    from public.attendance_breaks b
    join public.attendance_events started on started.break_id = b.id and started.event_type = 'break_start'
    where b.session_id = s.session_id and not exists (
      select 1 from public.attendance_events ended
      where ended.break_id = b.id and ended.event_type = 'break_end'
    )
  ) active on true;
$$;

revoke all on function public.start_attendance_break(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.end_attendance_break(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.get_my_attendance_state_with_break(uuid) from public, anon;
grant execute on function public.start_attendance_break(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.end_attendance_break(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.get_my_attendance_state_with_break(uuid) to authenticated;
