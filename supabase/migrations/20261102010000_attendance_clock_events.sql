create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  department_id uuid not null,
  employee_id uuid not null,
  started_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id)
    deferrable initially deferred,
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id)
    deferrable initially deferred,
  unique (id, business_id, venue_id, department_id, employee_id, started_by)
);
create index attendance_sessions_actor_idx
  on public.attendance_sessions (business_id, started_by);
create index attendance_sessions_employee_idx
  on public.attendance_sessions (business_id, employee_id);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  employee_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  event_type text not null check (event_type in ('clock_in', 'clock_out')),
  occurred_at timestamptz not null default clock_timestamp(),
  verification_status text not null default 'unverified'
    check (verification_status = 'unverified'),
  foreign key (session_id, business_id, venue_id, department_id, employee_id, actor_id)
    references public.attendance_sessions
      (id, business_id, venue_id, department_id, employee_id, started_by)
    on delete cascade,
  unique (business_id, actor_id, request_id)
);
create unique index attendance_events_clock_in_idx
  on public.attendance_events (session_id) where event_type = 'clock_in';
create unique index attendance_events_clock_out_idx
  on public.attendance_events (session_id) where event_type = 'clock_out';

create function public.prevent_original_attendance_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.businesses b where b.id = old.business_id
  ) then
    return old;
  end if;
  raise exception 'Original attendance records are immutable';
end;
$$;
revoke all on function public.prevent_original_attendance_mutation() from public, anon, authenticated;
create trigger attendance_sessions_immutable
  before update or delete on public.attendance_sessions
  for each row execute function public.prevent_original_attendance_mutation();
create trigger attendance_events_immutable
  before update or delete on public.attendance_events
  for each row execute function public.prevent_original_attendance_mutation();

alter table public.attendance_sessions enable row level security;
alter table public.attendance_events enable row level security;
revoke all on public.attendance_sessions, public.attendance_events from public, anon, authenticated;

create function public.can_view_attendance_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.attendance_sessions s
    where s.id = p_session_id and (
      public.can_manage_department(s.business_id, s.department_id)
      or (
        s.started_by = auth.uid()
        and public.can_view_department(s.business_id, s.department_id)
        and exists (
          select 1 from public.employees e
          where e.id = s.employee_id and e.business_id = s.business_id
            and e.venue_id = s.venue_id and e.auth_user_id = auth.uid()
        )
      )
    )
  );
$$;
revoke all on function public.can_view_attendance_session(uuid) from public, anon;
grant execute on function public.can_view_attendance_session(uuid) to authenticated;

create policy "Members can view attendance in their scope"
  on public.attendance_sessions for select to authenticated
  using (public.can_view_attendance_session(id));
create policy "Members can view attendance events in their scope"
  on public.attendance_events for select to authenticated
  using (public.can_view_attendance_session(session_id));
grant select on public.attendance_sessions, public.attendance_events to authenticated;

create function public.attendance_session_is_open(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.attendance_events e
    where e.session_id = p_session_id and e.event_type = 'clock_in'
  ) and not exists (
    select 1 from public.attendance_events e
    where e.session_id = p_session_id and e.event_type = 'clock_out'
  );
$$;
revoke all on function public.attendance_session_is_open(uuid) from public, anon, authenticated;

create function public.lock_attendance_identity(p_business_id uuid, p_employee_id uuid)
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
    'attendance-user:' || p_business_id::text || ':' || auth.uid()::text, 0
  ));
end;
$$;
revoke all on function public.lock_attendance_identity(uuid, uuid) from public, anon, authenticated;

create function public.lock_attendance_membership(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid()
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
end;
$$;
revoke all on function public.lock_attendance_membership(uuid) from public, anon, authenticated;

create function public.list_my_clock_options(p_business_id uuid, p_venue_id uuid)
returns table (employee_id uuid, employee_name text, department_id uuid, department_name text)
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
  select e.id, e.name, d.id, d.name
  from public.employees e
  join public.employee_departments ed
    on ed.employee_id = e.id and ed.business_id = e.business_id
  join public.departments d
    on d.id = ed.department_id and d.business_id = e.business_id and d.venue_id = e.venue_id
  where e.business_id = p_business_id and e.venue_id = p_venue_id
    and e.auth_user_id = auth.uid() and e.active and d.active
    and public.can_view_department(e.business_id, d.id)
  order by e.id, d.id;
end;
$$;

create function public.get_my_attendance_state(p_business_id uuid)
returns table (
  state text, session_id uuid, venue_id uuid, venue_name text, venue_timezone text,
  department_name text, clocked_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid()
  ) then
    raise exception 'Permission denied';
  end if;
  select count(*) into v_count from public.attendance_sessions s
  where s.business_id = p_business_id and s.started_by = auth.uid()
    and public.attendance_session_is_open(s.id);
  if v_count = 0 then
    return query select 'clocked_out'::text, null::uuid, null::uuid,
      null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  if v_count > 1 then
    return query select 'needs_review'::text, null::uuid, null::uuid,
      null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  select s.* into v_session from public.attendance_sessions s
  where s.business_id = p_business_id and s.started_by = auth.uid()
    and public.attendance_session_is_open(s.id);
  if not public.can_view_attendance_session(v_session.id) then
    return query select 'needs_review'::text, null::uuid, null::uuid,
      null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  return query
  select 'clocked_in'::text, v_session.id, v.id, v.name, v.timezone, d.name, e.occurred_at
  from public.venues v
  join public.departments d on d.id = v_session.department_id and d.business_id = v.business_id
    and d.venue_id = v.id
  join public.attendance_events e on e.session_id = v_session.id and e.event_type = 'clock_in'
  where v.id = v_session.venue_id and v.business_id = p_business_id;
end;
$$;

create function public.clock_in_attendance(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid,
  p_employee_id uuid, p_request_id uuid
)
returns table (session_id uuid, event_id uuid, occurred_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_department public.departments%rowtype;
  v_session_id uuid;
  v_event public.attendance_events%rowtype;
begin
  if p_business_id is null or p_venue_id is null or p_department_id is null
    or p_employee_id is null or p_request_id is null then
    raise exception 'Invalid clock request';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_view_department(p_business_id, p_department_id) or not exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.business_id = p_business_id
      and e.venue_id = p_venue_id and e.auth_user_id = auth.uid()
  ) then
    raise exception 'Employee not found or permission denied';
  end if;
  perform public.lock_attendance_identity(p_business_id, p_employee_id);
  select e.* into v_employee from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id
    and e.venue_id = p_venue_id and e.auth_user_id = auth.uid()
  for share;
  if not found or not public.can_view_department(p_business_id, p_department_id) then
    raise exception 'Employee not found or permission denied';
  end if;
  select d.* into v_department from public.departments d
  where d.id = p_department_id and d.business_id = p_business_id and d.venue_id = p_venue_id
  for share;
  if not found then
    raise exception 'Employee not found or permission denied';
  end if;

  select e.* into v_event from public.attendance_events e
  where e.business_id = p_business_id and e.actor_id = auth.uid() and e.request_id = p_request_id;
  if found then
    if v_event.event_type <> 'clock_in' or v_event.venue_id <> p_venue_id
      or v_event.department_id <> p_department_id or v_event.employee_id <> p_employee_id then
      raise exception 'Request identifier already used';
    end if;
    return query select v_event.session_id, v_event.id, v_event.occurred_at;
    return;
  end if;
  if not v_employee.active or not v_department.active or not exists (
    select 1 from public.employee_departments ed
    where ed.business_id = p_business_id and ed.employee_id = p_employee_id
      and ed.department_id = p_department_id
  ) then
    raise exception 'Employee or department is unavailable';
  end if;
  if exists (
    select 1 from public.attendance_sessions s
    where s.business_id = p_business_id and public.attendance_session_is_open(s.id)
      and (
        s.started_by = auth.uid() or s.employee_id = p_employee_id
        or exists (
          select 1 from public.shared_worker_profiles own
          join public.shared_worker_profiles linked on linked.shared_worker_id = own.shared_worker_id
          where own.business_id = p_business_id and own.employee_id = p_employee_id
            and linked.employee_id = s.employee_id
        )
      )
  ) then
    raise exception 'Already clocked in';
  end if;
  insert into public.attendance_sessions (
    business_id, venue_id, department_id, employee_id, started_by
  ) values (p_business_id, p_venue_id, p_department_id, p_employee_id, auth.uid())
  returning id into v_session_id;
  insert into public.attendance_events (
    session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type
  ) values (
    v_session_id, p_business_id, p_venue_id, p_department_id, p_employee_id,
    auth.uid(), p_request_id, 'clock_in'
  ) returning * into v_event;
  return query select v_event.session_id, v_event.id, v_event.occurred_at;
end;
$$;

create function public.clock_out_attendance(
  p_business_id uuid, p_session_id uuid, p_request_id uuid
)
returns table (session_id uuid, event_id uuid, occurred_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_event public.attendance_events%rowtype;
  v_start timestamptz;
  v_now timestamptz;
begin
  if p_business_id is null or p_session_id is null or p_request_id is null then
    raise exception 'Invalid clock request';
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
  select e.* into v_event from public.attendance_events e
  where e.business_id = p_business_id and e.actor_id = auth.uid() and e.request_id = p_request_id;
  if found then
    if v_event.event_type <> 'clock_out' or v_event.session_id <> p_session_id then
      raise exception 'Request identifier already used';
    end if;
    return query select v_event.session_id, v_event.id, v_event.occurred_at;
    return;
  end if;
  select e.occurred_at into v_start from public.attendance_events e
  where e.session_id = p_session_id and e.event_type = 'clock_in';
  if not found then
    raise exception 'Clock-in event not found';
  end if;
  if exists (
    select 1 from public.attendance_events e
    where e.session_id = p_session_id and e.event_type = 'clock_out'
  ) then
    raise exception 'Already clocked out';
  end if;
  v_now := clock_timestamp();
  if v_now < v_start then
    raise exception 'Server clock is earlier than the clock-in time';
  end if;
  insert into public.attendance_events (
    session_id, business_id, venue_id, department_id, employee_id, actor_id,
    request_id, event_type, occurred_at
  ) values (
    v_session.id, v_session.business_id, v_session.venue_id, v_session.department_id,
    v_session.employee_id, auth.uid(), p_request_id, 'clock_out', v_now
  ) returning * into v_event;
  return query select v_event.session_id, v_event.id, v_event.occurred_at;
end;
$$;

alter function public.link_shared_worker_profiles(uuid, uuid, uuid, uuid)
  rename to link_shared_worker_profiles_without_attendance_check;
revoke all on function public.link_shared_worker_profiles_without_attendance_check(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
create function public.link_shared_worker_profiles(
  p_business_id uuid, p_venue_id uuid, p_employee_id uuid, p_other_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.link_shared_worker_profiles_without_attendance_check(
    p_business_id, p_venue_id, p_employee_id, p_other_employee_id
  );
  if exists (
    select 1 from public.shared_worker_profiles own
    join public.shared_worker_profiles linked on linked.shared_worker_id = own.shared_worker_id
    join public.attendance_sessions s on s.employee_id = linked.employee_id and s.business_id = own.business_id
    where own.business_id = p_business_id and own.employee_id = p_employee_id
      and public.attendance_session_is_open(s.id)
    group by own.shared_worker_id having count(*) > 1
  ) then
    raise exception 'Cannot link profiles while more than one has an open clock session';
  end if;
end;
$$;

revoke all on function public.list_my_clock_options(uuid, uuid) from public, anon;
revoke all on function public.get_my_attendance_state(uuid) from public, anon;
revoke all on function public.clock_in_attendance(uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.clock_out_attendance(uuid, uuid, uuid) from public, anon;
revoke all on function public.link_shared_worker_profiles(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.list_my_clock_options(uuid, uuid) to authenticated;
grant execute on function public.get_my_attendance_state(uuid) to authenticated;
grant execute on function public.clock_in_attendance(uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.clock_out_attendance(uuid, uuid, uuid) to authenticated;
grant execute on function public.link_shared_worker_profiles(uuid, uuid, uuid, uuid) to authenticated;
