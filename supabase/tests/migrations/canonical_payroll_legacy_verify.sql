begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select extensions.no_plan();

create function pg_temp.legacy_finalisation()
returns uuid language sql as $$
  select id from public.payroll_period_events
  where business_id = 'b7400000-0000-4000-8000-000000000001'
    and action = 'finalised' order by sequence limit 1
$$;
create function pg_temp.current_finalisation()
returns uuid language sql as $$
  select id from public.payroll_period_events
  where business_id = 'b7400000-0000-4000-8000-000000000001'
    and action = 'finalised' order by sequence desc limit 1
$$;
create function pg_temp.records(p_event uuid)
returns table (session_id uuid, record jsonb) language sql as $$
  select * from public.list_canonical_payroll_records(
    'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
    '2024-01-08', p_event
  )
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*) from public.payroll_period_entries where event_id = pg_temp.legacy_finalisation()),
  1::bigint, 'the previous migration retains its original finalisation entry');
select extensions.throws_ok($$select * from pg_temp.records(pg_temp.legacy_finalisation())$$,
  'P0001', 'Finalised period lacks complete payroll details; reopen and finalise it again',
  'a real pre-migration finalisation fails clearly instead of inventing details');
select public.reopen_payroll_period(
  'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
  '2024-01-08', gen_random_uuid(), 'Capture detailed payroll record'
);
select public.finalise_payroll_period(
  'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
  '2024-01-08', gen_random_uuid(), 'Re-reviewed after migration'
);
select extensions.is((select count(*) from pg_temp.records(pg_temp.current_finalisation())),
  1::bigint, 're-finalising an unchanged approved period creates one detailed record');
select extensions.is((select record #>> '{attendance,clockInAt}' from pg_temp.records(pg_temp.current_finalisation())),
  '2024-01-08T10:00:00.123456Z', 'the new record retains the original clock-in precision');
select extensions.is((select record #>> '{worker,employeeId}' from pg_temp.records(pg_temp.current_finalisation())),
  'e7400000-0000-4000-8000-000000000001', 'the new record uses the existing worker identity');
select extensions.is((select record #>> '{approval,status}' from pg_temp.records(pg_temp.current_finalisation())),
  'approved', 'the new record retains its explicit approval');
select extensions.throws_ok($$select * from pg_temp.records(pg_temp.legacy_finalisation())$$,
  'P0001', 'Payroll period changed; refresh before reviewing records', 'the legacy version cannot be reused as the current period');
reset role;
select extensions.is((select count(*) from public.payroll_period_entries
  where business_id = 'b7400000-0000-4000-8000-000000000001'), 2::bigint,
  'both the original and new finalisation entries remain present');
select extensions.is((select count(*) from public.payroll_canonical_details
  where business_id = 'b7400000-0000-4000-8000-000000000001'), 1::bigint,
  'the migration does not fabricate a detailed historical snapshot');
insert into public.businesses (id, name) values
  ('b7400000-0000-4000-8000-000000000002', 'Other disposable business');
select extensions.throws_ok($$
  insert into public.payroll_canonical_details (
    event_id, session_id, business_id, schema_version, venue_timezone, work_date,
    clock_in_event_id, clock_out_event_id, clock_in_at, clock_out_at,
    elapsed_seconds, paid_break_seconds, unpaid_break_seconds, breaks
  )
  select pg_temp.legacy_finalisation(), session_id, 'b7400000-0000-4000-8000-000000000002',
    schema_version, venue_timezone, work_date, clock_in_event_id, clock_out_event_id,
    clock_in_at, clock_out_at, elapsed_seconds, paid_break_seconds, unpaid_break_seconds, breaks
  from public.payroll_canonical_details where event_id = pg_temp.current_finalisation()
$$, '23503', null, 'a privileged insert cannot associate a legacy entry with another tenant');
select extensions.is((select occurred_at from public.attendance_events
  where id = '47400000-0000-4000-8000-000000000001'), '2024-01-08 10:00:00.123456+00'::timestamptz,
  'migration and re-finalisation do not alter original attendance');
select * from extensions.finish();
rollback;
