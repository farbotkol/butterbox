create function public.normalize_generic_payroll_reason(p_reason text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  -- Match the UI's 500 UTF-16 code-unit limit for non-BMP characters.
  select case
    when char_length(value) + char_length(regexp_replace(value, U&'[^\+010000-\+10FFFF]', '', 'g'))
      between 1 and 500 then value
    else null
  end
  from (
    select nullif(regexp_replace(
      p_reason, U&'^[[:space:]\FEFF]+|[[:space:]\FEFF]+$', '', 'g'
    ), '') as value
  ) normalized;
$$;
revoke all on function public.normalize_generic_payroll_reason(text)
  from public, anon, authenticated, service_role;

create table public.generic_payroll_export_batches (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  week_start date not null,
  finalisation_id uuid not null,
  actor_id uuid not null,
  actor_role text not null check (actor_role in ('owner', 'admin', 'general_manager')),
  request_id uuid not null,
  session_count integer not null check (session_count > 0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (finalisation_id, business_id, venue_id, week_start)
    references public.payroll_period_events (id, business_id, venue_id, week_start) on delete cascade,
  unique (id, business_id, venue_id, week_start, finalisation_id),
  unique (business_id, actor_id, request_id),
  unique (business_id, venue_id, week_start, finalisation_id)
);

create table public.generic_payroll_export_entries (
  batch_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  week_start date not null,
  finalisation_id uuid not null,
  session_id uuid not null,
  employee_name text not null,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  primary key (batch_id, session_id),
  unique (business_id, session_id),
  foreign key (batch_id, business_id, venue_id, week_start, finalisation_id)
    references public.generic_payroll_export_batches (id, business_id, venue_id, week_start, finalisation_id)
    on delete cascade,
  foreign key (finalisation_id, session_id, business_id)
    references public.payroll_period_entries (event_id, session_id, business_id) on delete cascade,
  check (record ->> 'businessId' = business_id::text),
  check (record ->> 'sessionId' = session_id::text),
  check (record #>> '{venue,id}' = venue_id::text),
  check (record #>> '{period,weekStart}' = week_start::text),
  check (record #>> '{period,finalisationId}' = finalisation_id::text)
);

create table public.generic_payroll_reconciliations (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  week_start date not null,
  finalisation_id uuid not null,
  actor_id uuid not null,
  actor_role text not null check (actor_role in ('owner', 'admin', 'general_manager')),
  request_id uuid not null,
  review_hash text not null check (review_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason is not distinct from public.normalize_generic_payroll_reason(reason)),
  entry_count integer not null check (entry_count > 0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (finalisation_id, business_id, venue_id, week_start)
    references public.payroll_period_events (id, business_id, venue_id, week_start) on delete cascade,
  unique (id, business_id),
  unique (business_id, actor_id, request_id)
);

create table public.generic_payroll_reconciliation_entries (
  reconciliation_id uuid not null,
  business_id uuid not null,
  session_id uuid not null,
  previous_record jsonb,
  current_record jsonb,
  primary key (reconciliation_id, session_id),
  foreign key (reconciliation_id, business_id)
    references public.generic_payroll_reconciliations (id, business_id) on delete cascade,
  foreign key (business_id, session_id)
    references public.generic_payroll_export_entries (business_id, session_id) on delete cascade,
  check (previous_record is not null or current_record is not null),
  check (previous_record is null or jsonb_typeof(previous_record) = 'object'),
  check (current_record is null or jsonb_typeof(current_record) = 'object')
);

create index generic_payroll_export_entries_venue_idx
  on public.generic_payroll_export_entries (business_id, venue_id, session_id);
create index generic_payroll_reconciliation_entries_session_idx
  on public.generic_payroll_reconciliation_entries (business_id, session_id);

create trigger generic_payroll_export_batches_immutable
  before update or delete on public.generic_payroll_export_batches
  for each row execute function public.prevent_original_attendance_mutation();
create trigger generic_payroll_export_entries_immutable
  before update or delete on public.generic_payroll_export_entries
  for each row execute function public.prevent_original_attendance_mutation();
create trigger generic_payroll_reconciliations_immutable
  before update or delete on public.generic_payroll_reconciliations
  for each row execute function public.prevent_original_attendance_mutation();
create trigger generic_payroll_reconciliation_entries_immutable
  before update or delete on public.generic_payroll_reconciliation_entries
  for each row execute function public.prevent_original_attendance_mutation();

alter table public.generic_payroll_export_batches enable row level security;
alter table public.generic_payroll_export_entries enable row level security;
alter table public.generic_payroll_reconciliations enable row level security;
alter table public.generic_payroll_reconciliation_entries enable row level security;
revoke all on public.generic_payroll_export_batches, public.generic_payroll_export_entries,
  public.generic_payroll_reconciliations, public.generic_payroll_reconciliation_entries
  from public, anon, authenticated, service_role;

-- Claims may still be submitted or reopened after finalisation, but their
-- exception status must serialize with an export's final recheck.
create function public.lock_claim_payroll_export_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
  v_venue uuid;
  v_claimed_at timestamptz;
  v_timezone text;
  v_locked_timezone text;
begin
  if tg_table_name = 'attendance_offline_claims' then
    v_business := new.business_id;
    v_venue := new.venue_id;
    v_claimed_at := new.claimed_at;
  else
    select c.business_id, c.venue_id, c.claimed_at
      into v_business, v_venue, v_claimed_at
    from public.attendance_offline_claims c
    where c.id = new.claim_id and c.business_id = new.business_id;
  end if;
  select v.timezone into v_timezone from public.venues v
  where v.id = v_venue and v.business_id = v_business;
  if not found or v_claimed_at is null then
    raise exception 'Attendance claim venue is unavailable';
  end if;
  perform pg_advisory_xact_lock_shared(public.payroll_period_lock_key(
    v_business, v_venue, public.payroll_week_start(v_claimed_at, v_timezone)
  ));
  select v.timezone into v_locked_timezone from public.venues v
  where v.id = v_venue and v.business_id = v_business
  for share;
  if not found then
    raise exception 'Attendance claim venue is unavailable';
  end if;
  if v_locked_timezone is distinct from v_timezone then
    raise exception 'Venue timezone changed; retry attendance claim';
  end if;
  return new;
end;
$$;
revoke all on function public.lock_claim_payroll_export_period()
  from public, anon, authenticated, service_role;
create trigger attendance_claims_lock_payroll_export
  before insert on public.attendance_offline_claims
  for each row execute function public.lock_claim_payroll_export_period();
create trigger attendance_claim_reviews_lock_payroll_export
  before insert on public.attendance_offline_claim_reviews
  for each row execute function public.lock_claim_payroll_export_period();

create function public.lock_generic_payroll_export(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_finalisation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.payroll_period_events%rowtype;
  v_timezone text;
begin
  if p_finalisation_id is null then
    raise exception 'Invalid payroll export request';
  end if;
  perform 1 from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start);
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_finalise_payroll_period(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('generic-payroll-export:' || p_business_id::text, 0));
  perform pg_advisory_xact_lock(public.payroll_period_lock_key(p_business_id, p_venue_id, p_week_start));
  select v.timezone into v_timezone from public.venues v
  where v.id = p_venue_id and v.business_id = p_business_id
  for share;
  v_period := public.latest_payroll_period_event(p_business_id, p_venue_id, p_week_start);
  if not found or v_period.action is distinct from 'finalised'
    or v_period.id is distinct from p_finalisation_id then
    raise exception 'Payroll period changed; refresh before exporting';
  end if;
  if v_period.period_starts_at is distinct from (p_week_start::timestamp at time zone v_timezone)
    or v_period.period_ends_at is distinct from ((p_week_start + 7)::timestamp at time zone v_timezone) then
    raise exception 'Venue timezone changed; reopen and review payroll before exporting';
  end if;
  if exists (select 1 from public.list_payroll_period_exceptions(p_business_id, p_venue_id, p_week_start)) then
    raise exception 'Resolve outstanding payroll exceptions before exporting';
  end if;
  perform 1 from public.list_canonical_payroll_records(
    p_business_id, p_venue_id, p_week_start, p_finalisation_id
  );
end;
$$;
revoke all on function public.lock_generic_payroll_export(uuid, uuid, date, uuid)
  from public, anon, authenticated, service_role;

create function public.generic_payroll_review_locked(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_finalisation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changes jsonb;
  v_new_count integer;
  v_hash text;
begin
  with current_rows as materialized (
    select * from public.list_canonical_payroll_records(
      p_business_id, p_venue_id, p_week_start, p_finalisation_id
    )
  ), baseline as (
    select e.session_id, e.employee_name,
      case when r.found then r.current_record else e.record end as previous_record
    from public.generic_payroll_export_entries e
    left join lateral (
      select true as found, d.current_record
      from public.generic_payroll_reconciliation_entries d
      join public.generic_payroll_reconciliations h
        on h.id = d.reconciliation_id and h.business_id = d.business_id
      where d.business_id = e.business_id and d.session_id = e.session_id
      order by h.sequence desc limit 1
    ) r on true
    where e.business_id = p_business_id and e.venue_id = p_venue_id
  ), changes as (
    select b.session_id, b.employee_name, b.previous_record, c.record as current_record
    from baseline b left join current_rows c on c.session_id = b.session_id
    where (b.previous_record #>> '{period,weekStart}' = p_week_start::text or c.session_id is not null)
      and (b.previous_record - 'period' - 'approval') is distinct from (c.record - 'period' - 'approval')
  )
  select coalesce((
      select jsonb_agg(jsonb_build_object(
        'sessionId', c.session_id, 'employeeName', c.employee_name,
        'previous', c.previous_record, 'current', c.current_record
      ) order by c.session_id) from changes c
    ), '[]'::jsonb),
    (select count(*) from current_rows c
      where not exists (
        select 1 from public.generic_payroll_export_entries e
        where e.business_id = p_business_id and e.session_id = c.session_id
      ))
  into v_changes, v_new_count;
  v_hash := encode(extensions.digest(p_finalisation_id::text || ':' || v_changes::text, 'sha256'), 'hex');
  return jsonb_build_object('reviewHash', v_hash, 'newCount', v_new_count, 'changes', v_changes);
end;
$$;
revoke all on function public.generic_payroll_review_locked(uuid, uuid, date, uuid)
  from public, anon, authenticated, service_role;

create function public.get_generic_payroll_export_review(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_finalisation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.lock_generic_payroll_export(p_business_id, p_venue_id, p_week_start, p_finalisation_id);
  return public.generic_payroll_review_locked(p_business_id, p_venue_id, p_week_start, p_finalisation_id);
end;
$$;
revoke all on function public.get_generic_payroll_export_review(uuid, uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.get_generic_payroll_export_review(uuid, uuid, date, uuid) to authenticated;

create function public.reconcile_generic_payroll_export(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_finalisation_id uuid,
  p_request_id uuid, p_review_hash text, p_reason text, p_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous public.generic_payroll_reconciliations%rowtype;
  v_review jsonb;
  v_id uuid;
  v_role text;
  v_count integer;
  v_inserted integer;
  v_reason text := public.normalize_generic_payroll_reason(p_reason);
begin
  if p_request_id is null or p_review_hash is null or p_review_hash !~ '^[0-9a-f]{64}$'
    or v_reason is null or p_confirmed is distinct from true then
    raise exception 'Invalid payroll reconciliation request';
  end if;
  perform public.lock_generic_payroll_export(p_business_id, p_venue_id, p_week_start, p_finalisation_id);
  select r.* into v_previous from public.generic_payroll_reconciliations r
  where r.business_id = p_business_id and r.actor_id = auth.uid() and r.request_id = p_request_id;
  if found then
    if v_previous.venue_id <> p_venue_id or v_previous.week_start <> p_week_start
      or v_previous.finalisation_id <> p_finalisation_id or v_previous.review_hash <> p_review_hash
      or v_previous.reason <> v_reason then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.id;
  end if;
  v_review := public.generic_payroll_review_locked(p_business_id, p_venue_id, p_week_start, p_finalisation_id);
  if v_review ->> 'reviewHash' <> p_review_hash then
    raise exception 'Payroll reconciliation changed; refresh and review again';
  end if;
  v_count := jsonb_array_length(v_review -> 'changes');
  if v_count = 0 then
    raise exception 'No payroll reconciliation is required';
  end if;
  select m.role into v_role from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid()
    and m.role in ('owner', 'admin', 'general_manager')
  order by array_position(array['owner', 'admin', 'general_manager'], m.role) limit 1;
  insert into public.generic_payroll_reconciliations (
    business_id, venue_id, week_start, finalisation_id, actor_id, actor_role,
    request_id, review_hash, reason, entry_count
  ) values (
    p_business_id, p_venue_id, p_week_start, p_finalisation_id, auth.uid(), v_role,
    p_request_id, p_review_hash, v_reason, v_count
  ) returning id into v_id;
  insert into public.generic_payroll_reconciliation_entries (
    reconciliation_id, business_id, session_id, previous_record, current_record
  )
  select v_id, p_business_id, (item ->> 'sessionId')::uuid,
    nullif(item -> 'previous', 'null'::jsonb), nullif(item -> 'current', 'null'::jsonb)
  from jsonb_array_elements(v_review -> 'changes') item;
  get diagnostics v_inserted = row_count;
  if v_inserted <> v_count then
    raise exception 'Payroll reconciliation is incomplete';
  end if;
  return v_id;
end;
$$;
revoke all on function public.reconcile_generic_payroll_export(uuid, uuid, date, uuid, uuid, text, text, boolean)
  from public, anon, service_role;
grant execute on function public.reconcile_generic_payroll_export(uuid, uuid, date, uuid, uuid, text, text, boolean)
  to authenticated;

create function public.create_generic_payroll_export(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_finalisation_id uuid, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous public.generic_payroll_export_batches%rowtype;
  v_review jsonb;
  v_id uuid;
  v_role text;
  v_count integer;
  v_inserted integer;
begin
  if p_request_id is null then
    raise exception 'Invalid payroll export request';
  end if;
  perform public.lock_generic_payroll_export(p_business_id, p_venue_id, p_week_start, p_finalisation_id);
  select b.* into v_previous from public.generic_payroll_export_batches b
  where b.business_id = p_business_id and b.actor_id = auth.uid() and b.request_id = p_request_id;
  if found and (v_previous.venue_id <> p_venue_id or v_previous.week_start <> p_week_start
    or v_previous.finalisation_id <> p_finalisation_id) then
    raise exception 'Request identifier already used';
  end if;
  v_review := public.generic_payroll_review_locked(p_business_id, p_venue_id, p_week_start, p_finalisation_id);
  if jsonb_array_length(v_review -> 'changes') > 0 then
    raise exception 'Previously exported time requires reconciliation';
  end if;
  if v_previous.id is not null then
    return v_previous.id;
  end if;
  select b.* into v_previous from public.generic_payroll_export_batches b
  where b.business_id = p_business_id and b.venue_id = p_venue_id
    and b.week_start = p_week_start and b.finalisation_id = p_finalisation_id;
  if found then
    return v_previous.id;
  end if;
  v_count := (v_review ->> 'newCount')::integer;
  if v_count = 0 then
    raise exception 'No new approved sessions are available for export';
  end if;
  select m.role into v_role from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid()
    and m.role in ('owner', 'admin', 'general_manager')
  order by array_position(array['owner', 'admin', 'general_manager'], m.role) limit 1;
  insert into public.generic_payroll_export_batches (
    business_id, venue_id, week_start, finalisation_id, actor_id, actor_role, request_id, session_count
  ) values (
    p_business_id, p_venue_id, p_week_start, p_finalisation_id, auth.uid(), v_role, p_request_id, v_count
  ) returning id into v_id;
  insert into public.generic_payroll_export_entries (
    batch_id, business_id, venue_id, week_start, finalisation_id, session_id, employee_name, record
  )
  select v_id, p_business_id, p_venue_id, p_week_start, p_finalisation_id, c.session_id,
    coalesce(e.name, 'Employee ' || (c.record #>> '{worker,employeeId}')), c.record
  from public.list_canonical_payroll_records(p_business_id, p_venue_id, p_week_start, p_finalisation_id) c
  left join public.employees e on e.id = (c.record #>> '{worker,employeeId}')::uuid
    and e.business_id = p_business_id and e.venue_id = p_venue_id
  where not exists (
    select 1 from public.generic_payroll_export_entries x
    where x.business_id = p_business_id and x.session_id = c.session_id
  );
  get diagnostics v_inserted = row_count;
  if v_inserted <> v_count then
    raise exception 'Payroll export is incomplete';
  end if;
  -- Check the captured names, not an earlier profile read, before committing.
  if exists (
    select 1 from public.generic_payroll_export_entries e
    where e.batch_id = v_id and (
      char_length(e.employee_name) > 256
      or nullif(btrim(regexp_replace(e.employee_name, '[[:space:]]', '', 'g'), U&'\FEFF'), '') is null
    )
  ) then
    raise exception 'Employee name is too long or blank; correct the employee profile before preparing payroll';
  end if;
  return v_id;
end;
$$;
revoke all on function public.create_generic_payroll_export(uuid, uuid, date, uuid, uuid)
  from public, anon, service_role;
grant execute on function public.create_generic_payroll_export(uuid, uuid, date, uuid, uuid) to authenticated;

create function public.lock_generic_payroll_batch(p_business_id uuid, p_venue_id uuid, p_batch_id uuid)
returns public.generic_payroll_export_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.generic_payroll_export_batches%rowtype;
  v_review jsonb;
begin
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_finalise_payroll_period(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  select b.* into v_batch from public.generic_payroll_export_batches b
  where b.id = p_batch_id and b.business_id = p_business_id and b.venue_id = p_venue_id;
  if not found then
    raise exception 'Payroll batch unavailable or permission denied';
  end if;
  perform public.lock_generic_payroll_export(
    p_business_id, p_venue_id, v_batch.week_start, v_batch.finalisation_id
  );
  v_review := public.generic_payroll_review_locked(
    p_business_id, p_venue_id, v_batch.week_start, v_batch.finalisation_id
  );
  if jsonb_array_length(v_review -> 'changes') > 0 then
    raise exception 'Previously exported time requires reconciliation';
  end if;
  if (select count(*) from public.generic_payroll_export_entries e where e.batch_id = v_batch.id)
    <> v_batch.session_count then
    raise exception 'Payroll export is incomplete';
  end if;
  return v_batch;
end;
$$;
revoke all on function public.lock_generic_payroll_batch(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.get_generic_payroll_batch(p_business_id uuid, p_venue_id uuid, p_batch_id uuid)
returns table (batch_id uuid, week_start date, finalisation_id uuid, session_count integer, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.generic_payroll_export_batches%rowtype;
begin
  v_batch := public.lock_generic_payroll_batch(p_business_id, p_venue_id, p_batch_id);
  return query select v_batch.id, v_batch.week_start, v_batch.finalisation_id, v_batch.session_count, v_batch.created_at;
end;
$$;
revoke all on function public.get_generic_payroll_batch(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.get_generic_payroll_batch(uuid, uuid, uuid) to authenticated;

create function public.list_generic_payroll_batch_entries(p_business_id uuid, p_venue_id uuid, p_batch_id uuid)
returns table (session_id uuid, employee_name text, record jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.lock_generic_payroll_batch(p_business_id, p_venue_id, p_batch_id);
  return query select e.session_id, e.employee_name, e.record
  from public.generic_payroll_export_entries e where e.batch_id = p_batch_id;
end;
$$;
revoke all on function public.list_generic_payroll_batch_entries(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.list_generic_payroll_batch_entries(uuid, uuid, uuid) to authenticated;

create function public.list_generic_payroll_export_history(
  p_business_id uuid, p_venue_id uuid, p_week_start date
)
returns table (
  id uuid, kind text, finalisation_id uuid, actor_role text, actor_is_self boolean,
  entry_count integer, reason text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start);
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_finalise_payroll_period(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select b.id, 'batch'::text, b.finalisation_id, b.actor_role, b.actor_id = auth.uid(),
    b.session_count, null::text, b.created_at
  from public.generic_payroll_export_batches b
  where b.business_id = p_business_id and b.venue_id = p_venue_id and b.week_start = p_week_start
  union all
  select r.id, 'reconciliation'::text, r.finalisation_id, r.actor_role, r.actor_id = auth.uid(),
    r.entry_count, r.reason, r.created_at
  from public.generic_payroll_reconciliations r
  where r.business_id = p_business_id and r.venue_id = p_venue_id and r.week_start = p_week_start;
end;
$$;
revoke all on function public.list_generic_payroll_export_history(uuid, uuid, date) from public, anon, service_role;
grant execute on function public.list_generic_payroll_export_history(uuid, uuid, date) to authenticated;

create function public.list_generic_payroll_export_history_entries(
  p_business_id uuid, p_venue_id uuid, p_week_start date
)
returns table (
  event_id uuid, kind text, session_id uuid, employee_name text, previous_record jsonb, current_record jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_finalise_payroll_period(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  perform 1 from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start);
  return query
  select b.id, 'batch'::text, e.session_id, e.employee_name, null::jsonb, e.record
  from public.generic_payroll_export_batches b
  join public.generic_payroll_export_entries e on e.batch_id = b.id
  where b.business_id = p_business_id and b.venue_id = p_venue_id and b.week_start = p_week_start
  union all
  select r.id, 'reconciliation'::text, d.session_id, e.employee_name, d.previous_record, d.current_record
  from public.generic_payroll_reconciliations r
  join public.generic_payroll_reconciliation_entries d
    on d.reconciliation_id = r.id and d.business_id = r.business_id
  join public.generic_payroll_export_entries e
    on e.business_id = d.business_id and e.session_id = d.session_id
  where r.business_id = p_business_id and r.venue_id = p_venue_id and r.week_start = p_week_start;
end;
$$;
revoke all on function public.list_generic_payroll_export_history_entries(uuid, uuid, date)
  from public, anon, service_role;
grant execute on function public.list_generic_payroll_export_history_entries(uuid, uuid, date) to authenticated;
