-- A payroll period is one venue-local ISO week, matching weekly timesheet review. Finalising appends an
-- immutable event plus a per-session snapshot; reopening appends a reasoned event. The latest event wins.
create table public.payroll_period_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  period_starts_at timestamptz not null,
  period_ends_at timestamptz not null,
  action text not null check (action in ('finalised', 'reopened')),
  actor_id uuid not null,
  actor_role text not null,
  request_id uuid not null,
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 500),
  session_count integer not null default 0 check (session_count >= 0),
  worked_seconds numeric not null default 0 check (worked_seconds >= 0),
  paid_seconds numeric not null default 0 check (paid_seconds >= 0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues (id, business_id),
  unique (business_id, actor_id, request_id),
  unique (id, business_id, venue_id, week_start),
  check (period_starts_at < period_ends_at),
  check (action = 'finalised' or reason is not null),
  check (action = 'finalised' or (session_count = 0 and worked_seconds = 0 and paid_seconds = 0))
);
create index payroll_period_events_period_idx
  on public.payroll_period_events (business_id, venue_id, week_start, sequence desc);
create trigger payroll_period_events_immutable
  before update or delete on public.payroll_period_events
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.payroll_period_events enable row level security;
revoke all on public.payroll_period_events from public, anon, authenticated, service_role;
create policy "Venue managers can view payroll period events"
  on public.payroll_period_events for select to authenticated
  using (
    public.can_view_venue(business_id, venue_id)
    and public.has_business_role(business_id, array[
      'owner', 'admin', 'general_manager', 'foh_manager', 'boh_manager', 'department_manager'
    ])
  );
grant select on public.payroll_period_events to authenticated;

-- Sessions deliberately have no foreign key here, so finalising never waits on attendance row locks.
create table public.payroll_period_entries (
  event_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  week_start date not null,
  session_id uuid not null,
  employee_id uuid not null,
  department_id uuid not null,
  worked_seconds numeric not null check (worked_seconds >= 0),
  paid_seconds numeric not null check (paid_seconds >= 0),
  revision text not null check (revision ~ '^[0-9a-f]{64}$'),
  decision_id uuid not null,
  primary key (event_id, session_id),
  foreign key (event_id, business_id, venue_id, week_start)
    references public.payroll_period_events (id, business_id, venue_id, week_start) on delete cascade
);
create index payroll_period_entries_session_idx on public.payroll_period_entries (session_id);
create trigger payroll_period_entries_immutable
  before update or delete on public.payroll_period_entries
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.payroll_period_entries enable row level security;
revoke all on public.payroll_period_entries from public, anon, authenticated, service_role;
create policy "Members can view scoped payroll period entries"
  on public.payroll_period_entries for select to authenticated
  using (public.can_view_attendance_session(session_id));
grant select on public.payroll_period_entries to authenticated;

create function public.payroll_period_lock_key(p_business_id uuid, p_venue_id uuid, p_week_start date)
returns bigint
language sql
immutable
set search_path = public, pg_temp
as $$
  select hashtextextended(
    'payroll-period:' || p_business_id::text || ':' || p_venue_id::text || ':' || p_week_start::text, 0
  );
$$;
revoke all on function public.payroll_period_lock_key(uuid, uuid, date)
  from public, anon, authenticated, service_role;

create function public.latest_payroll_period_event(p_business_id uuid, p_venue_id uuid, p_week_start date)
returns public.payroll_period_events
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.* from public.payroll_period_events e
  where e.business_id = p_business_id and e.venue_id = p_venue_id and e.week_start = p_week_start
  order by e.sequence desc limit 1;
$$;
revoke all on function public.latest_payroll_period_event(uuid, uuid, date)
  from public, anon, authenticated, service_role;

create function public.payroll_week_start(p_at timestamptz, p_timezone text)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select date_trunc('week', p_at at time zone p_timezone)::date;
$$;
revoke all on function public.payroll_week_start(timestamptz, text)
  from public, anon, authenticated, service_role;

-- Mirrors list_weekly_worked_time: corrected clock-in, else clock-out, else session creation time.
create function public.attendance_session_payroll_week(p_session_id uuid)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.payroll_week_start(coalesce(
    (select public.attendance_effective_time(e.id) from public.attendance_events e
      where e.session_id = s.id and e.event_type = 'clock_in' limit 1),
    (select public.attendance_effective_time(e.id) from public.attendance_events e
      where e.session_id = s.id and e.event_type = 'clock_out' limit 1),
    s.created_at
  ), v.timezone)
  from public.attendance_sessions s
  join public.venues v on v.id = s.venue_id and v.business_id = s.business_id
  where s.id = p_session_id;
$$;
revoke all on function public.attendance_session_payroll_week(uuid)
  from public, anon, authenticated, service_role;

-- Every attendance write takes a shared period lock and re-checks finalisation, so it either commits
-- before a concurrent finalisation reads the period or fails after the finalisation commits.
create function public.guard_finalised_payroll_attendance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_session_id uuid := (v_row ->> 'session_id')::uuid;
  v_business_id uuid;
  v_venue_id uuid;
  v_timezone text;
  v_weeks date[];
  v_week date;
begin
  select s.business_id, s.venue_id, v.timezone into v_business_id, v_venue_id, v_timezone
  from public.attendance_sessions s
  join public.venues v on v.id = s.venue_id and v.business_id = s.business_id
  where s.id = v_session_id;
  if not found then
    return new;
  end if;
  v_weeks := array[public.attendance_session_payroll_week(v_session_id)];
  if v_row ? 'occurred_at' then
    v_weeks := v_weeks || public.payroll_week_start((v_row ->> 'occurred_at')::timestamptz, v_timezone);
  end if;
  if v_row ? 'new_at' then
    v_weeks := v_weeks || public.payroll_week_start((v_row ->> 'new_at')::timestamptz, v_timezone);
  end if;
  v_weeks := v_weeks || coalesce((
    select array_agg(pe.week_start) from public.payroll_period_entries pe
    where pe.session_id = v_session_id and pe.business_id = v_business_id
      and pe.event_id = (public.latest_payroll_period_event(pe.business_id, pe.venue_id, pe.week_start)).id
  ), '{}'::date[]);
  for v_week in select distinct w from unnest(v_weeks) w where w is not null order by 1 loop
    perform pg_advisory_xact_lock_shared(public.payroll_period_lock_key(v_business_id, v_venue_id, v_week));
    if (public.latest_payroll_period_event(v_business_id, v_venue_id, v_week)).action = 'finalised' then
      raise exception 'Payroll period is finalised; reopen it before changing attendance';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_finalised_payroll_attendance()
  from public, anon, authenticated, service_role;

create trigger attendance_events_payroll_guard
  before insert on public.attendance_events
  for each row execute function public.guard_finalised_payroll_attendance();
create trigger attendance_breaks_payroll_guard
  before insert on public.attendance_breaks
  for each row execute function public.guard_finalised_payroll_attendance();
create trigger attendance_event_corrections_payroll_guard
  before insert on public.attendance_event_corrections
  for each row execute function public.guard_finalised_payroll_attendance();
create trigger attendance_edit_lock_events_payroll_guard
  before insert on public.attendance_edit_lock_events
  for each row execute function public.guard_finalised_payroll_attendance();
create trigger attendance_location_checks_payroll_guard
  before insert on public.attendance_location_checks
  for each row execute function public.guard_finalised_payroll_attendance();
create trigger attendance_location_reviews_payroll_guard
  before insert on public.attendance_location_reviews
  for each row execute function public.guard_finalised_payroll_attendance();
create trigger attendance_timesheet_decisions_payroll_guard
  before insert on public.attendance_timesheet_decisions
  for each row execute function public.guard_finalised_payroll_attendance();

create function public.can_finalise_payroll_period(p_business_id uuid, p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.can_view_venue(p_business_id, p_venue_id)
    and public.has_business_role(p_business_id, array['owner', 'admin', 'general_manager'])
    and exists (select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id)
    and not exists (
      select 1 from public.departments d
      where d.business_id = p_business_id and d.venue_id = p_venue_id
        and not public.can_manage_department(p_business_id, d.id)
    );
$$;
revoke all on function public.can_finalise_payroll_period(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.list_payroll_period_exceptions(
  p_business_id uuid, p_venue_id uuid, p_week_start date
)
returns table (
  session_id uuid, claim_id uuid, employee_name text, department_name text,
  occurred_at timestamptz, exception_code text
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
  with sessions as (
    select w.*, public.attendance_timesheet_status(w.session_id) as approval_status
    from public.list_weekly_worked_time(p_business_id, p_venue_id, p_week_start, null) w
  )
  select s.session_id, null::uuid, s.employee_name, s.department_name,
    coalesce(s.clocked_in_at, s.clocked_out_at), x.code
  from sessions s
  cross join lateral (
    select case s.approval_status
      when 'pending' then 'approval_pending'
      when 'returned' then 'approval_returned'
      when 'resubmitted' then 'approval_resubmitted'
      when 'approval_outdated' then 'approval_outdated'
    end
    union all
    select 'incomplete_attendance' where s.worked_seconds is null
    union all
    select 'location_review_required' where 'location_review_required' = any (s.exceptions)
  ) x (code)
  where x.code is not null
  union all
  select null::uuid, c.id, e.name, d.name, c.claimed_at,
    case c.claim_source when 'employee_request' then 'correction_request_pending'
      else 'offline_claim_pending' end
  from public.attendance_offline_claims c
  join public.employees e on e.id = c.employee_id and e.business_id = c.business_id
  join public.departments d on d.id = c.department_id and d.business_id = c.business_id
  where c.business_id = p_business_id and c.venue_id = p_venue_id
    and c.claimed_at >= v_start and c.claimed_at < v_end
    and public.can_manage_department(c.business_id, c.department_id)
    and coalesce((
      select r.decision from public.attendance_offline_claim_reviews r
      where r.claim_id = c.id order by r.sequence desc limit 1
    ), 'reopened') = 'reopened';
end;
$$;
revoke all on function public.list_payroll_period_exceptions(uuid, uuid, date)
  from public, anon, service_role;
grant execute on function public.list_payroll_period_exceptions(uuid, uuid, date) to authenticated;

create function public.get_payroll_period(p_business_id uuid, p_venue_id uuid, p_week_start date)
returns table (
  status text, period_starts_at timestamptz, period_ends_at timestamptz, period_ended boolean,
  can_finalise boolean, event_id uuid, actor_role text, actor_is_self boolean, reason text,
  session_count integer, worked_seconds numeric, paid_seconds numeric, decided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_event public.payroll_period_events%rowtype;
begin
  select b.starts_at, b.ends_at into v_start, v_end
  from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start) b;
  v_event := public.latest_payroll_period_event(p_business_id, p_venue_id, p_week_start);
  return query select
    case when v_event.id is null then 'open' else v_event.action end,
    v_start, v_end, v_end <= clock_timestamp(),
    public.can_finalise_payroll_period(p_business_id, p_venue_id),
    v_event.id, v_event.actor_role, v_event.actor_id = auth.uid(), v_event.reason,
    v_event.session_count, v_event.worked_seconds, v_event.paid_seconds, v_event.created_at;
end;
$$;
revoke all on function public.get_payroll_period(uuid, uuid, date) from public, anon, service_role;
grant execute on function public.get_payroll_period(uuid, uuid, date) to authenticated;

create function public.list_payroll_period_events(p_business_id uuid, p_venue_id uuid, p_week_start date)
returns table (
  event_id uuid, action text, actor_role text, actor_is_self boolean, reason text,
  session_count integer, worked_seconds numeric, paid_seconds numeric, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start);
  return query
  select e.id, e.action, e.actor_role, e.actor_id = auth.uid(), e.reason,
    e.session_count, e.worked_seconds, e.paid_seconds, e.created_at
  from public.payroll_period_events e
  where e.business_id = p_business_id and e.venue_id = p_venue_id and e.week_start = p_week_start
  order by e.sequence desc;
end;
$$;
revoke all on function public.list_payroll_period_events(uuid, uuid, date) from public, anon, service_role;
grant execute on function public.list_payroll_period_events(uuid, uuid, date) to authenticated;

-- Totals are computed from the snapshot before the immutable event row is written.
create function public.record_payroll_period_event(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_request_id uuid, p_action text, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_previous public.payroll_period_events%rowtype;
  v_latest public.payroll_period_events%rowtype;
  v_role text;
  v_exceptions integer;
  v_id uuid := gen_random_uuid();
  v_rows jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_worked numeric := 0;
  v_paid numeric := 0;
begin
  if p_request_id is null or p_action is null or p_action not in ('finalised', 'reopened')
    or (v_reason is not null and char_length(v_reason) > 500)
    or (p_action = 'reopened' and v_reason is null) then
    raise exception 'Invalid payroll period request';
  end if;
  select b.starts_at, b.ends_at into v_start, v_end
  from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start) b;
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_finalise_payroll_period(p_business_id, p_venue_id) then
    raise exception 'Only an owner, admin or general manager with full venue access can finalise or reopen payroll';
  end if;
  perform pg_advisory_xact_lock(public.payroll_period_lock_key(p_business_id, p_venue_id, p_week_start));
  select e.* into v_previous from public.payroll_period_events e
  where e.business_id = p_business_id and e.actor_id = auth.uid() and e.request_id = p_request_id;
  if found then
    if v_previous.venue_id <> p_venue_id or v_previous.week_start <> p_week_start
      or v_previous.action <> p_action or v_previous.reason is distinct from v_reason then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.id;
  end if;
  v_latest := public.latest_payroll_period_event(p_business_id, p_venue_id, p_week_start);
  if p_action = 'reopened' then
    if v_latest.action is distinct from 'finalised' then
      raise exception 'Payroll period is not finalised';
    end if;
  else
    if v_latest.action = 'finalised' then
      raise exception 'Payroll period is already finalised';
    end if;
    if v_end > clock_timestamp() then
      raise exception 'Payroll period has not ended';
    end if;
    select count(*) into v_exceptions
    from public.list_payroll_period_exceptions(p_business_id, p_venue_id, p_week_start);
    if v_exceptions > 0 then
      raise exception 'Resolve outstanding exceptions before finalising';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'session_id', w.session_id, 'employee_id', w.employee_id, 'department_id', w.department_id,
        'worked_seconds', w.worked_seconds, 'paid_seconds', w.paid_seconds,
        'revision', public.attendance_review_revision(w.session_id), 'decision_id', d.id
      )), '[]'::jsonb), count(*), coalesce(sum(w.worked_seconds), 0), coalesce(sum(w.paid_seconds), 0)
    into v_rows, v_count, v_worked, v_paid
    from public.list_weekly_worked_time(p_business_id, p_venue_id, p_week_start, null) w
    join lateral (
      select x.id from public.attendance_timesheet_decisions x
      where x.session_id = w.session_id order by x.sequence desc limit 1
    ) d on true;
  end if;
  select m.role into v_role from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid()
    and m.role in ('owner', 'admin', 'general_manager')
  order by array_position(array['owner', 'admin', 'general_manager'], m.role) limit 1;
  insert into public.payroll_period_events (
    id, business_id, venue_id, week_start, period_starts_at, period_ends_at, action, actor_id, actor_role,
    request_id, reason, session_count, worked_seconds, paid_seconds
  ) values (
    v_id, p_business_id, p_venue_id, p_week_start, v_start, v_end, p_action, auth.uid(), v_role,
    p_request_id, v_reason, v_count, v_worked, v_paid
  );
  insert into public.payroll_period_entries (
    event_id, business_id, venue_id, week_start, session_id, employee_id, department_id,
    worked_seconds, paid_seconds, revision, decision_id
  )
  select v_id, p_business_id, p_venue_id, p_week_start, (r ->> 'session_id')::uuid,
    (r ->> 'employee_id')::uuid, (r ->> 'department_id')::uuid, (r ->> 'worked_seconds')::numeric,
    (r ->> 'paid_seconds')::numeric, r ->> 'revision', (r ->> 'decision_id')::uuid
  from jsonb_array_elements(v_rows) r;
  return v_id;
end;
$$;
revoke all on function public.record_payroll_period_event(uuid, uuid, date, uuid, text, text)
  from public, anon, authenticated, service_role;

create function public.finalise_payroll_period(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_request_id uuid, p_note text default null
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.record_payroll_period_event(
    p_business_id, p_venue_id, p_week_start, p_request_id, 'finalised', p_note
  );
$$;
revoke all on function public.finalise_payroll_period(uuid, uuid, date, uuid, text) from public, anon, service_role;
grant execute on function public.finalise_payroll_period(uuid, uuid, date, uuid, text) to authenticated;

create function public.reopen_payroll_period(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_request_id uuid, p_reason text
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.record_payroll_period_event(
    p_business_id, p_venue_id, p_week_start, p_request_id, 'reopened', p_reason
  );
$$;
revoke all on function public.reopen_payroll_period(uuid, uuid, date, uuid, text) from public, anon, service_role;
grant execute on function public.reopen_payroll_period(uuid, uuid, date, uuid, text) to authenticated;
