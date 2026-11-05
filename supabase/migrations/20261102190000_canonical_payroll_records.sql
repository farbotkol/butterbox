-- Detailed values are captured in the same transaction as the finalisation
-- entry, while the period lock prevents attendance from changing.
create function public.lock_payroll_period_venue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
begin
  select v.timezone into v_timezone from public.venues v
  where v.id = new.venue_id and v.business_id = new.business_id
  for share;
  if not found or new.period_starts_at is distinct from (new.week_start::timestamp at time zone v_timezone)
    or new.period_ends_at is distinct from ((new.week_start + 7)::timestamp at time zone v_timezone) then
    raise exception 'Cannot snapshot payroll: the venue period changed';
  end if;
  return new;
end;
$$;
revoke all on function public.lock_payroll_period_venue() from public, anon, authenticated, service_role;
create trigger payroll_period_events_lock_venue
  before insert on public.payroll_period_events
  for each row execute function public.lock_payroll_period_venue();

alter table public.payroll_period_entries
  add constraint payroll_period_entries_canonical_scope_key unique (event_id, session_id, business_id);

create table public.payroll_canonical_details (
  event_id uuid not null,
  session_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  schema_version smallint not null default 1 check (schema_version = 1),
  venue_timezone text not null,
  work_date date not null check (isfinite(work_date)),
  clock_in_event_id uuid not null,
  clock_out_event_id uuid not null,
  clock_in_at timestamptz not null check (isfinite(clock_in_at)),
  clock_out_at timestamptz not null check (isfinite(clock_out_at)),
  elapsed_seconds numeric not null check (elapsed_seconds >= 0),
  paid_break_seconds numeric not null check (paid_break_seconds >= 0),
  unpaid_break_seconds numeric not null check (unpaid_break_seconds >= 0),
  breaks jsonb not null check (jsonb_typeof(breaks) = 'array'),
  primary key (event_id, session_id),
  foreign key (event_id, session_id, business_id)
    references public.payroll_period_entries (event_id, session_id, business_id) on delete cascade,
  check (clock_in_at <= clock_out_at),
  check (elapsed_seconds = extract(epoch from clock_out_at - clock_in_at))
);
create trigger payroll_canonical_details_immutable
  before update or delete on public.payroll_canonical_details
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.payroll_canonical_details enable row level security;
revoke all on public.payroll_canonical_details from public, anon, authenticated, service_role;

create function public.canonical_payroll_timestamp(p_at timestamptz)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;
revoke all on function public.canonical_payroll_timestamp(timestamptz)
  from public, anon, authenticated, service_role;

create function public.capture_canonical_payroll_details()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_clock_in_id uuid;
  v_clock_out_id uuid;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_period public.payroll_period_events%rowtype;
  v_break record;
  v_start timestamptz;
  v_end timestamptz;
  v_previous_end timestamptz;
  v_duration numeric;
  v_elapsed numeric;
  v_paid_break numeric := 0;
  v_unpaid_break numeric := 0;
  v_breaks jsonb := '[]'::jsonb;
begin
  select v.timezone, ci.id, co.id, public.attendance_effective_time(ci.id),
    public.attendance_effective_time(co.id)
  into v_timezone, v_clock_in_id, v_clock_out_id, v_clock_in, v_clock_out
  from public.attendance_sessions s
  join public.venues v on v.id = s.venue_id and v.business_id = s.business_id
  left join public.attendance_events ci on ci.session_id = s.id and ci.event_type = 'clock_in'
  left join public.attendance_events co on co.session_id = s.id and co.event_type = 'clock_out'
  where s.id = new.session_id and s.business_id = new.business_id and s.venue_id = new.venue_id
    and s.department_id = new.department_id and s.employee_id = new.employee_id;
  if not found or v_clock_in is null or v_clock_out is null or not isfinite(v_clock_in)
    or not isfinite(v_clock_out) or v_clock_in > v_clock_out
    or v_clock_in < '0001-01-01 00:00:00+00'::timestamptz
    or v_clock_out >= '10000-01-01 00:00:00+00'::timestamptz then
    raise exception 'Cannot snapshot payroll: attendance times are incomplete or invalid';
  end if;

  select e.* into v_period from public.payroll_period_events e
  where e.id = new.event_id and e.business_id = new.business_id and e.venue_id = new.venue_id
    and e.week_start = new.week_start and e.action = 'finalised';
  if not found or public.payroll_week_start(v_clock_in, v_timezone) <> new.week_start
    or v_period.period_starts_at <> (new.week_start::timestamp at time zone v_timezone)
    or v_period.period_ends_at <> ((new.week_start + 7)::timestamp at time zone v_timezone) then
    raise exception 'Cannot snapshot payroll: the venue period changed';
  end if;
  if public.attendance_review_revision(new.session_id) is distinct from new.revision
    or not exists (
      select 1 from public.attendance_timesheet_decisions d
      where d.id = new.decision_id and d.business_id = new.business_id
        and d.venue_id = new.venue_id and d.session_id = new.session_id
        and d.employee_id = new.employee_id and d.department_id = new.department_id
        and d.decision = 'approved' and d.revision = new.revision
        and d.id = (select latest.id from public.attendance_timesheet_decisions latest
          where latest.session_id = new.session_id order by latest.sequence desc limit 1)
    ) then
    raise exception 'Cannot snapshot payroll: attendance approval changed';
  end if;

  for v_break in
    select b.id, b.classification, started.id as start_id, ended.id as end_id,
      public.attendance_effective_time(started.id) as started_at,
      public.attendance_effective_time(ended.id) as ended_at
    from public.attendance_breaks b
    left join public.attendance_events started on started.break_id = b.id and started.event_type = 'break_start'
    left join public.attendance_events ended on ended.break_id = b.id and ended.event_type = 'break_end'
    where b.session_id = new.session_id and b.business_id = new.business_id
    order by public.attendance_effective_time(started.id) nulls first, b.id
  loop
    v_start := v_break.started_at;
    v_end := v_break.ended_at;
    if v_start is null or v_end is null or not isfinite(v_start) or not isfinite(v_end)
      or v_start < v_clock_in or v_end > v_clock_out or v_start > v_end
      or (v_start < v_end and v_previous_end is not null and v_start < v_previous_end) then
      raise exception 'Cannot snapshot payroll: breaks are incomplete or invalid';
    end if;
    if v_start < v_end then
      v_previous_end := v_end;
    end if;
    v_duration := extract(epoch from v_end - v_start);
    if v_break.classification = 'paid' then
      v_paid_break := v_paid_break + v_duration;
    else
      v_unpaid_break := v_unpaid_break + v_duration;
    end if;
    v_breaks := v_breaks || jsonb_build_array(jsonb_build_object(
      'id', v_break.id, 'classification', v_break.classification,
      'startEventId', v_break.start_id, 'endEventId', v_break.end_id,
      'startedAt', public.canonical_payroll_timestamp(v_start),
      'endedAt', public.canonical_payroll_timestamp(v_end), 'seconds', v_duration::text
    ));
  end loop;

  v_elapsed := extract(epoch from v_clock_out - v_clock_in);
  if new.worked_seconds <> v_elapsed - v_paid_break - v_unpaid_break
    or new.paid_seconds <> v_elapsed - v_unpaid_break then
    raise exception 'Cannot snapshot payroll: attendance totals are inconsistent';
  end if;

  insert into public.payroll_canonical_details (
    event_id, session_id, business_id, venue_timezone, work_date, clock_in_event_id, clock_out_event_id,
    clock_in_at, clock_out_at, elapsed_seconds, paid_break_seconds, unpaid_break_seconds, breaks
  ) values (
    new.event_id, new.session_id, new.business_id, v_timezone, (v_clock_in at time zone v_timezone)::date,
    v_clock_in_id, v_clock_out_id, v_clock_in, v_clock_out, v_elapsed, v_paid_break, v_unpaid_break, v_breaks
  );
  return new;
end;
$$;
revoke all on function public.capture_canonical_payroll_details()
  from public, anon, authenticated, service_role;
create trigger payroll_period_entries_capture_canonical
  after insert on public.payroll_period_entries
  for each row execute function public.capture_canonical_payroll_details();

-- This is a preview, not an export transaction. The caller must supply the
-- finalisation it read, so pagination cannot silently cross period versions.
create function public.list_canonical_payroll_records(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_finalisation_id uuid
)
returns table (session_id uuid, record jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.payroll_period_events%rowtype;
  v_count bigint;
  v_details bigint;
  v_worked numeric;
  v_paid numeric;
begin
  if p_finalisation_id is null then
    raise exception 'Invalid payroll record request';
  end if;
  perform 1 from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start);
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_finalise_payroll_period(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(public.payroll_period_lock_key(p_business_id, p_venue_id, p_week_start));
  v_period := public.latest_payroll_period_event(p_business_id, p_venue_id, p_week_start);
  if v_period.action is distinct from 'finalised' or v_period.id is distinct from p_finalisation_id then
    raise exception 'Payroll period changed; refresh before reviewing records';
  end if;
  select count(*), count(d.session_id), coalesce(sum(e.worked_seconds), 0), coalesce(sum(e.paid_seconds), 0)
  into v_count, v_details, v_worked, v_paid
  from public.payroll_period_entries e
  left join public.payroll_canonical_details d on d.event_id = e.event_id and d.session_id = e.session_id
  where e.event_id = v_period.id and e.business_id = p_business_id
    and e.venue_id = p_venue_id and e.week_start = p_week_start;
  if v_count <> v_period.session_count or v_details <> v_count
    or v_worked <> v_period.worked_seconds or v_paid <> v_period.paid_seconds then
    raise exception 'Finalised period lacks complete payroll details; reopen and finalise it again';
  end if;

  return query
  select e.session_id, jsonb_build_object(
    'schemaVersion', d.schema_version,
    'businessId', e.business_id,
    'sessionId', e.session_id,
    'worker', jsonb_build_object('employeeId', e.employee_id, 'providerMapping', null),
    'venue', jsonb_build_object(
      'id', e.venue_id, 'departmentId', e.department_id, 'timezone', d.venue_timezone
    ),
    'workDate', d.work_date::text,
    'period', jsonb_build_object(
      'weekStart', e.week_start::text, 'finalisationId', e.event_id, 'version', v_period.sequence::text,
      'startsAt', public.canonical_payroll_timestamp(v_period.period_starts_at),
      'endsAt', public.canonical_payroll_timestamp(v_period.period_ends_at)
    ),
    'attendance', jsonb_build_object(
      'clockInEventId', d.clock_in_event_id, 'clockOutEventId', d.clock_out_event_id,
      'clockInAt', public.canonical_payroll_timestamp(d.clock_in_at),
      'clockOutAt', public.canonical_payroll_timestamp(d.clock_out_at)
    ),
    'hours', jsonb_build_object(
      'unit', 'seconds', 'elapsed', d.elapsed_seconds::text,
      'worked', e.worked_seconds::text, 'paid', e.paid_seconds::text,
      'paidBreak', d.paid_break_seconds::text, 'unpaidBreak', d.unpaid_break_seconds::text
    ),
    'breaks', d.breaks,
    'payCodes', null,
    'approval', jsonb_build_object(
      'decisionId', e.decision_id, 'status', 'approved', 'revision', e.revision
    )
  )
  from public.payroll_period_entries e
  join public.payroll_canonical_details d on d.event_id = e.event_id and d.session_id = e.session_id
  where e.event_id = v_period.id and e.business_id = p_business_id
    and e.venue_id = p_venue_id and e.week_start = p_week_start;
end;
$$;
revoke all on function public.list_canonical_payroll_records(uuid, uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.list_canonical_payroll_records(uuid, uuid, date, uuid) to authenticated;
