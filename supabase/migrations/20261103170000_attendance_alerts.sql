create extension if not exists pg_cron;

create table public.venue_attendance_alert_policies (
  business_id uuid not null,
  venue_id uuid primary key,
  enabled boolean not null default false,
  grace_minutes integer not null default 10 check (grace_minutes between 0 and 240),
  no_show_minutes integer not null default 60 check (no_show_minutes between 1 and 1440),
  enabled_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues (id, business_id),
  check (no_show_minutes > grace_minutes),
  check (enabled = (enabled_at is not null))
);

create table public.attendance_alert_policy_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  actor_id uuid not null,
  enabled boolean not null,
  grace_minutes integer not null,
  no_show_minutes integer not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues (id, business_id)
);

create table public.attendance_alerts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  employee_id uuid not null,
  shift_id uuid not null references public.shifts (id),
  category text not null check (category in ('arrival', 'departure')),
  signal text check (signal in ('missing_clock_in', 'late', 'no_show', 'missing_clock_out')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id),
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id),
  unique (id, business_id),
  unique (shift_id, employee_id, category),
  check (ends_at > starts_at),
  check (status = 'resolved' or signal is not null),
  check (signal is null
    or (category = 'arrival' and signal in ('missing_clock_in', 'late', 'no_show'))
    or (category = 'departure' and signal = 'missing_clock_out'))
);

create index attendance_alerts_scope_idx
  on public.attendance_alerts (business_id, venue_id, department_id, updated_at desc, id desc);
create index attendance_alerts_open_idx
  on public.attendance_alerts (business_id, venue_id, department_id)
  where status = 'open';
create index shifts_attendance_alert_scan_idx
  on public.shifts (business_id, venue_id, starts_at, id)
  where is_published and status = 'scheduled' and employee_id is not null;

create table public.attendance_alert_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  business_id uuid not null,
  alert_id uuid not null,
  event_type text not null check (event_type in (
    'opened', 'signal_changed', 'auto_resolved', 'acknowledged', 'resolved'
  )),
  actor_id uuid,
  request_id uuid,
  old_signal text,
  new_signal text,
  reason text check (reason is null or length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (alert_id, business_id) references public.attendance_alerts (id, business_id),
  unique (business_id, actor_id, request_id),
  check ((event_type in ('acknowledged', 'resolved') and actor_id is not null and request_id is not null)
    or (event_type not in ('acknowledged', 'resolved') and actor_id is null and request_id is null)),
  check ((event_type = 'resolved') = (reason is not null))
);
create index attendance_alert_events_alert_idx
  on public.attendance_alert_events (alert_id, sequence);

create table public.attendance_alert_worker_state (
  singleton boolean primary key default true check (singleton),
  last_completed_at timestamptz
);
insert into public.attendance_alert_worker_state (singleton) values (true);

create trigger attendance_alert_policy_events_immutable
  before update or delete on public.attendance_alert_policy_events
  for each row execute function public.prevent_original_attendance_mutation();
create trigger attendance_alert_events_immutable
  before update or delete on public.attendance_alert_events
  for each row execute function public.prevent_original_attendance_mutation();

alter table public.venue_attendance_alert_policies enable row level security;
alter table public.attendance_alert_policy_events enable row level security;
alter table public.attendance_alerts enable row level security;
alter table public.attendance_alert_events enable row level security;
alter table public.attendance_alert_worker_state enable row level security;
revoke all on public.venue_attendance_alert_policies, public.attendance_alert_policy_events,
  public.attendance_alerts, public.attendance_alert_events, public.attendance_alert_worker_state
  from public, anon, authenticated, service_role;

create function public.can_manage_attendance_alert_venue(p_business_id uuid, p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.venues v
    where v.id = p_venue_id and v.business_id = p_business_id
      and (
        public.has_business_role(p_business_id, array['owner', 'admin'])
        or exists (
          select 1 from public.departments d
          where d.business_id = v.business_id and d.venue_id = v.id
            and public.can_manage_department(d.business_id, d.id)
        )
      )
  );
$$;
revoke all on function public.can_manage_attendance_alert_venue(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.get_attendance_alert_settings(p_business_id uuid, p_venue_id uuid)
returns table (
  enabled boolean, grace_minutes integer, no_show_minutes integer,
  scheduler_state text, last_completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_attendance_alert_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select coalesce(p.enabled, false), coalesce(p.grace_minutes, 10), coalesce(p.no_show_minutes, 60),
    case when not coalesce(p.enabled, false) then 'disabled'
      when w.last_completed_at is null or w.last_completed_at < clock_timestamp() - interval '5 minutes'
        then 'stale'
      else 'running' end,
    w.last_completed_at
  from public.attendance_alert_worker_state w
  left join public.venue_attendance_alert_policies p
    on p.business_id = p_business_id and p.venue_id = p_venue_id
  where w.singleton;
end;
$$;

create function public.save_attendance_alert_settings(
  p_business_id uuid, p_venue_id uuid, p_enabled boolean,
  p_grace_minutes integer, p_no_show_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.venue_attendance_alert_policies%rowtype;
  v_event_id uuid;
begin
  if p_business_id is null or p_venue_id is null or p_enabled is null
    or p_grace_minutes is null or p_grace_minutes not between 0 and 240
    or p_no_show_minutes is null or p_no_show_minutes not between 1 and 1440
    or p_no_show_minutes <= p_grace_minutes then
    raise exception 'Invalid attendance alert settings';
  end if;
  perform public.lock_attendance_membership(p_business_id);
  if not public.has_business_role(p_business_id, array['owner']) or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('attendance-alert-policy:' || p_venue_id::text, 0));
  select * into v_old from public.venue_attendance_alert_policies p
  where p.business_id = p_business_id and p.venue_id = p_venue_id for update;
  if found and (v_old.enabled, v_old.grace_minutes, v_old.no_show_minutes)
    is not distinct from (p_enabled, p_grace_minutes, p_no_show_minutes) then
    return p_venue_id;
  end if;
  insert into public.venue_attendance_alert_policies (
    business_id, venue_id, enabled, grace_minutes, no_show_minutes, enabled_at
  ) values (
    p_business_id, p_venue_id, p_enabled, p_grace_minutes, p_no_show_minutes,
    case when p_enabled then clock_timestamp() else null end
  )
  on conflict (venue_id) do update set
    enabled = excluded.enabled, grace_minutes = excluded.grace_minutes,
    no_show_minutes = excluded.no_show_minutes,
    enabled_at = case
      when not excluded.enabled then null
      when public.venue_attendance_alert_policies.enabled
        then public.venue_attendance_alert_policies.enabled_at
      else clock_timestamp() end,
    updated_at = clock_timestamp();
  insert into public.attendance_alert_policy_events (
    business_id, venue_id, actor_id, enabled, grace_minutes, no_show_minutes
  ) values (p_business_id, p_venue_id, auth.uid(), p_enabled, p_grace_minutes, p_no_show_minutes)
  returning id into v_event_id;
  insert into public.sensitive_action_audit (
    business_id, actor_id, actor_kind, source_table, operation, record_id, old_values, new_values
  ) values (
    p_business_id, auth.uid(), 'user', 'attendance_alert_policy_events', 'INSERT', v_event_id::text,
    case when v_old.venue_id is null then null else jsonb_build_object(
      'enabled', v_old.enabled, 'grace_minutes', v_old.grace_minutes, 'no_show_minutes', v_old.no_show_minutes
    ) end,
    jsonb_build_object('venue_id', p_venue_id, 'enabled', p_enabled,
      'grace_minutes', p_grace_minutes, 'no_show_minutes', p_no_show_minutes)
  );
  return p_venue_id;
end;
$$;

create function public.record_attendance_alert_event(
  p_business_id uuid, p_alert_id uuid, p_event_type text,
  p_old_signal text, p_new_signal text, p_reason text, p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_actor uuid := case when p_event_type in ('acknowledged', 'resolved') then auth.uid() else null end;
begin
  insert into public.attendance_alert_events (
    business_id, alert_id, event_type, actor_id, request_id, old_signal, new_signal, reason
  ) values (
    p_business_id, p_alert_id, p_event_type, v_actor, p_request_id, p_old_signal, p_new_signal, p_reason
  ) returning id into v_event_id;
  insert into public.sensitive_action_audit (
    business_id, actor_id, actor_kind, source_table, operation, record_id, new_values, reason
  ) values (
    p_business_id, v_actor, case when v_actor is null then 'database' else 'user' end,
    'attendance_alert_events', 'INSERT', v_event_id::text,
    jsonb_build_object('alert_id', p_alert_id, 'action', p_event_type,
      'old_signal', p_old_signal, 'new_signal', p_new_signal), p_reason
  );
end;
$$;
revoke all on function public.record_attendance_alert_event(uuid, uuid, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;

create function public.apply_attendance_alert_signal(
  p_shift_id uuid, p_employee_id uuid, p_category text, p_signal text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alert public.attendance_alerts%rowtype;
  v_shift public.shifts%rowtype;
begin
  select * into v_alert from public.attendance_alerts a
  where a.shift_id = p_shift_id and a.employee_id = p_employee_id and a.category = p_category
  for update;
  if not found then
    if p_signal is null then return; end if;
    select * into v_shift from public.shifts s where s.id = p_shift_id;
    if not found or v_shift.employee_id is distinct from p_employee_id
      or not v_shift.is_published or v_shift.status <> 'scheduled' then
      raise exception 'Published shift is unavailable';
    end if;
    insert into public.attendance_alerts (
      business_id, venue_id, department_id, employee_id, shift_id, category,
      signal, starts_at, ends_at
    ) values (
      v_shift.business_id, v_shift.venue_id, v_shift.department_id, p_employee_id,
      p_shift_id, p_category, p_signal, v_shift.starts_at, v_shift.ends_at
    ) returning * into v_alert;
    perform public.record_attendance_alert_event(
      v_alert.business_id, v_alert.id, 'opened', null, p_signal, null, null
    );
  elsif p_signal is null and v_alert.signal is not null then
    update public.attendance_alerts set signal = null, status = 'resolved', updated_at = clock_timestamp()
    where id = v_alert.id;
    perform public.record_attendance_alert_event(
      v_alert.business_id, v_alert.id, 'auto_resolved', v_alert.signal, null, null, null
    );
  elsif p_signal is not null and p_signal is distinct from v_alert.signal then
    update public.attendance_alerts set signal = p_signal, status = 'open', updated_at = clock_timestamp()
    where id = v_alert.id;
    perform public.record_attendance_alert_event(
      v_alert.business_id, v_alert.id, 'signal_changed', v_alert.signal, p_signal, null, null
    );
  end if;
end;
$$;
revoke all on function public.apply_attendance_alert_signal(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

create function public.scan_attendance_alerts_internal(p_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last_completed timestamptz;
  v_scan_from timestamptz;
  v_shift record;
  v_alert record;
  v_first_clock timestamptz;
  v_open_session boolean;
  v_arrival_signal text;
  v_departure_signal text;
  v_count integer := 0;
begin
  if p_at is null or not isfinite(p_at) then raise exception 'Invalid alert scan time'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('attendance-alert-worker', 0)) then
    return 0;
  end if;
  select w.last_completed_at into v_last_completed
  from public.attendance_alert_worker_state w where w.singleton for update;
  if not found then raise exception 'Attendance alert worker state is unavailable'; end if;
  v_scan_from := coalesce(v_last_completed, p_at) - interval '48 hours';

  for v_alert in
    select a.shift_id, a.employee_id, a.category
    from public.attendance_alerts a
    join public.shifts s on s.id = a.shift_id
    join public.venue_attendance_alert_policies p
      on p.business_id = a.business_id and p.venue_id = a.venue_id and p.enabled
    where a.signal is not null
      and (not s.is_published or s.status <> 'scheduled' or s.employee_id is distinct from a.employee_id)
    order by a.shift_id, a.employee_id, a.category
    for share of s, p
  loop
    perform public.apply_attendance_alert_signal(v_alert.shift_id, v_alert.employee_id, v_alert.category, null);
  end loop;

  for v_shift in
    select s.id, s.business_id, s.venue_id, s.employee_id, s.starts_at, s.ends_at,
      p.grace_minutes, p.no_show_minutes
    from public.venue_attendance_alert_policies p
    join public.shifts s on s.business_id = p.business_id and s.venue_id = p.venue_id
    where p.enabled and s.is_published and s.status = 'scheduled' and s.employee_id is not null
      and s.starts_at <= p_at
      and s.ends_at + make_interval(mins => p.grace_minutes) >= p.enabled_at
      and (s.ends_at >= v_scan_from or exists (
        select 1 from public.attendance_alerts a
        where a.shift_id = s.id and a.employee_id = s.employee_id and a.status <> 'resolved'
      ))
    order by s.starts_at, s.id
    for share of s, p
  loop
    select min(public.attendance_effective_time(ci.id)),
      coalesce(bool_or(co.id is null or public.attendance_effective_time(co.id) > p_at), false)
    into v_first_clock, v_open_session
    from public.attendance_sessions session
    join public.attendance_events ci on ci.session_id = session.id and ci.event_type = 'clock_in'
    left join public.attendance_events co on co.session_id = session.id and co.event_type = 'clock_out'
    where session.business_id = v_shift.business_id and session.venue_id = v_shift.venue_id
      and (session.employee_id = v_shift.employee_id
        or public.shift_swap_same_worker(session.employee_id, v_shift.employee_id, v_shift.business_id))
      and public.attendance_effective_time(ci.id) <= p_at
      and public.attendance_effective_time(ci.id) < v_shift.ends_at
      and (co.id is null or public.attendance_effective_time(co.id) > v_shift.starts_at);

    v_arrival_signal := null;
    if p_at >= v_shift.starts_at + make_interval(mins => v_shift.grace_minutes) then
      if v_first_clock is not null then
        if v_first_clock > v_shift.starts_at + make_interval(mins => v_shift.grace_minutes) then
          v_arrival_signal := 'late';
        end if;
      elsif p_at >= v_shift.starts_at + make_interval(mins => v_shift.no_show_minutes) then
        v_arrival_signal := 'no_show';
      else
        v_arrival_signal := 'missing_clock_in';
      end if;
    end if;
    perform public.apply_attendance_alert_signal(
      v_shift.id, v_shift.employee_id, 'arrival', v_arrival_signal
    );

    v_departure_signal := null;
    if p_at >= v_shift.ends_at + make_interval(mins => v_shift.grace_minutes) and v_open_session
      and not exists (
        select 1 from public.shifts next_shift
        where next_shift.business_id = v_shift.business_id and next_shift.venue_id = v_shift.venue_id
          and next_shift.id <> v_shift.id and next_shift.status = 'scheduled' and next_shift.is_published
          and next_shift.employee_id is not null
          and (next_shift.employee_id = v_shift.employee_id or public.shift_swap_same_worker(
            next_shift.employee_id, v_shift.employee_id, v_shift.business_id
          ))
          and next_shift.starts_at <= v_shift.ends_at + make_interval(mins => v_shift.grace_minutes)
          and next_shift.ends_at > v_shift.ends_at
      ) then
      v_departure_signal := 'missing_clock_out';
    end if;
    perform public.apply_attendance_alert_signal(
      v_shift.id, v_shift.employee_id, 'departure', v_departure_signal
    );
    v_count := v_count + 1;
  end loop;
  update public.attendance_alert_worker_state set last_completed_at = p_at where singleton;
  return v_count;
end;
$$;
revoke all on function public.scan_attendance_alerts_internal(timestamptz)
  from public, anon, authenticated, service_role;

create function public.run_attendance_alert_worker()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.scan_attendance_alerts_internal(clock_timestamp());
$$;
revoke all on function public.run_attendance_alert_worker()
  from public, anon, authenticated, service_role;

create function public.list_attendance_alerts(p_business_id uuid, p_venue_id uuid)
returns table (
  alert_id uuid, shift_id uuid, employee_id uuid, employee_name text, department_name text,
  category text, signal text, status text, starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz, updated_at timestamptz, history jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_attendance_alert_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select a.id, a.shift_id, a.employee_id, e.name, d.name, a.category, a.signal, a.status,
    a.starts_at, a.ends_at, a.created_at, a.updated_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ev.id, 'event_type', ev.event_type, 'actor_id', ev.actor_id,
        'old_signal', ev.old_signal, 'new_signal', ev.new_signal,
        'reason', ev.reason, 'created_at', ev.created_at
      ) order by ev.sequence)
      from public.attendance_alert_events ev
      where ev.alert_id = a.id and ev.business_id = a.business_id
    ), '[]'::jsonb)
  from public.attendance_alerts a
  join public.employees e on e.id = a.employee_id and e.business_id = a.business_id
  join public.departments d on d.id = a.department_id and d.business_id = a.business_id
  where a.business_id = p_business_id and a.venue_id = p_venue_id
    and public.can_manage_department(a.business_id, a.department_id);
end;
$$;

create function public.act_on_attendance_alert(
  p_business_id uuid, p_venue_id uuid, p_alert_id uuid, p_action text, p_reason text, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alert public.attendance_alerts%rowtype;
  v_existing public.attendance_alert_events%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_business_id is null or p_venue_id is null or p_alert_id is null or p_request_id is null
    or p_action is null or p_action not in ('acknowledged', 'resolved')
    or (p_action = 'acknowledged' and v_reason is not null)
    or (p_action = 'resolved' and (v_reason is null or length(v_reason) > 500)) then
    raise exception 'Invalid attendance alert action';
  end if;
  perform public.lock_attendance_membership(p_business_id);
  select * into v_alert from public.attendance_alerts a
  where a.id = p_alert_id and a.business_id = p_business_id and a.venue_id = p_venue_id
  for update;
  if not found or not public.can_manage_department(v_alert.business_id, v_alert.department_id) then
    raise exception 'Alert not found or permission denied';
  end if;
  select * into v_existing from public.attendance_alert_events e
  where e.business_id = p_business_id and e.actor_id = auth.uid() and e.request_id = p_request_id;
  if found then
    if v_existing.alert_id <> p_alert_id or v_existing.event_type <> p_action
      or v_existing.reason is distinct from v_reason then
      raise exception 'Request identifier already used';
    end if;
    return p_alert_id;
  end if;
  if v_alert.status = 'resolved' then raise exception 'Alert is already resolved'; end if;
  if p_action = 'acknowledged' and v_alert.status = 'acknowledged' then
    raise exception 'Alert is already acknowledged';
  end if;
  update public.attendance_alerts set status = p_action, updated_at = clock_timestamp()
  where id = p_alert_id;
  perform public.record_attendance_alert_event(
    p_business_id, p_alert_id, p_action, v_alert.signal, v_alert.signal, v_reason, p_request_id
  );
  return p_alert_id;
end;
$$;

revoke all on function public.get_attendance_alert_settings(uuid, uuid),
  public.save_attendance_alert_settings(uuid, uuid, boolean, integer, integer),
  public.list_attendance_alerts(uuid, uuid),
  public.act_on_attendance_alert(uuid, uuid, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_attendance_alert_settings(uuid, uuid),
  public.save_attendance_alert_settings(uuid, uuid, boolean, integer, integer),
  public.list_attendance_alerts(uuid, uuid),
  public.act_on_attendance_alert(uuid, uuid, uuid, text, text, uuid)
  to authenticated;

create or replace function public.unread_roster_notification_count(p_business_id uuid, p_venue_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*)::integer from public.list_roster_notifications(p_business_id, p_venue_id) where unread)
    + (select count(*)::integer from public.list_shift_offer_notifications(p_business_id, p_venue_id) where unread)
    + (select count(*)::integer from public.list_shift_swap_notifications(p_business_id, p_venue_id) where unread)
    + (select count(*)::integer from public.attendance_alerts a
       where a.business_id = p_business_id and a.venue_id = p_venue_id and a.status = 'open'
         and public.can_manage_department(a.business_id, a.department_id));
$$;

select cron.schedule(
  'butterbox-attendance-alerts', '* * * * *', 'select public.run_attendance_alert_worker();'
);
