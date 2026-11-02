begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7300000-0000-4000-8000-000000000001', 'canonical-owner@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000002', 'canonical-gm@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000003', 'canonical-foh@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000004', 'canonical-worker@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000005', 'canonical-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7300000-0000-4000-8000-000000000001', 'Canonical cafe'),
  ('b7300000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'FOH'),
  ('d7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000002', 'general_manager', 'c7300000-0000-4000-8000-000000000001', null),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000003', 'foh_manager', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001'),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000004', 'employee', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001'),
  ('b7300000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000004', 'Night worker', 'Server'),
  ('e7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002', null, 'Cook', 'Cook');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('27300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000004'),
  ('27300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002', 'e7300000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-000000000001');
insert into public.attendance_breaks (id, session_id, business_id, classification) values
  ('37300000-0000-4000-8000-000000000001', '27300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'paid'),
  ('37300000-0000-4000-8000-000000000002', '27300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'unpaid');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id,
  event_type, break_id, occurred_at, source
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  f.event_type, f.break_id::uuid, f.occurred_at::timestamptz, 'server_clock'
from (values
  ('47300000-0000-4000-8000-000000000001', '27300000-0000-4000-8000-000000000001', 'clock_in', null, '2024-10-05 13:10:00.123456+00'),
  ('47300000-0000-4000-8000-000000000002', '27300000-0000-4000-8000-000000000001', 'break_start', '37300000-0000-4000-8000-000000000001', '2024-10-05 14:00:00.234567+00'),
  ('47300000-0000-4000-8000-000000000003', '27300000-0000-4000-8000-000000000001', 'break_end', '37300000-0000-4000-8000-000000000001', '2024-10-05 14:15:00.234568+00'),
  ('47300000-0000-4000-8000-000000000004', '27300000-0000-4000-8000-000000000001', 'break_start', '37300000-0000-4000-8000-000000000002', '2024-10-05 15:30:00+00'),
  ('47300000-0000-4000-8000-000000000005', '27300000-0000-4000-8000-000000000001', 'break_end', '37300000-0000-4000-8000-000000000002', '2024-10-05 16:00:00+00'),
  ('47300000-0000-4000-8000-000000000006', '27300000-0000-4000-8000-000000000001', 'clock_out', null, '2024-10-05 17:15:00.123457+00'),
  ('47300000-0000-4000-8000-000000000007', '27300000-0000-4000-8000-000000000002', 'clock_in', null, '2024-10-01 01:00:00+00'),
  ('47300000-0000-4000-8000-000000000008', '27300000-0000-4000-8000-000000000002', 'clock_out', null, '2024-10-01 03:00:00+00')
) f(id, session_id, event_type, break_id, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;

create temporary table canonical_test_saved (name text primary key, id uuid, value jsonb);
grant select, insert on canonical_test_saved to authenticated;
create function pg_temp.canonical_records(p_event_id uuid, p_week date default '2024-09-30')
returns table (session_id uuid, record jsonb) language sql as $$
  select * from public.list_canonical_payroll_records(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', p_week, p_event_id
  );
$$;
create function pg_temp.approve_canonical_session(p_session uuid)
returns uuid language sql as $$
  select public.decide_attendance_timesheet(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', p_session,
    gen_random_uuid(), w.edit_revision, 'approved', null
  ) from public.list_weekly_worked_time_for_edit(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', '2024-09-30'
  ) w where w.session_id = p_session;
$$;

select extensions.ok(
  not has_table_privilege('authenticated', 'public.payroll_canonical_details', 'select')
  and not has_table_privilege('service_role', 'public.payroll_canonical_details', 'select')
  and not has_table_privilege('authenticated', 'public.payroll_canonical_details', 'insert'),
  'canonical details have no direct authenticated or service-role table access');
select extensions.ok(
  has_function_privilege('authenticated', 'public.list_canonical_payroll_records(uuid,uuid,date,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.list_canonical_payroll_records(uuid,uuid,date,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.list_canonical_payroll_records(uuid,uuid,date,uuid)', 'execute'),
  'only authenticated callers may invoke the scoped canonical record RPC');
select extensions.throws_ok($$
  insert into public.payroll_period_events (
    business_id, venue_id, week_start, period_starts_at, period_ends_at, action, actor_id, actor_role, request_id
  ) values (
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    '2024-10-14', '2024-10-14 00:00+00', '2024-10-21 00:00+00', 'finalised',
    'a7300000-0000-4000-8000-000000000001', 'owner', gen_random_uuid()
  )
$$, 'P0001', 'Cannot snapshot payroll: the venue period changed',
  'an empty period cannot be finalised with stale venue-timezone boundaries');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$select * from pg_temp.canonical_records(null)$$,
  'P0001', 'Invalid payroll record request', 'the expected finalisation is required');
select extensions.throws_ok($$select * from pg_temp.canonical_records(gen_random_uuid())$$,
  'P0001', 'Payroll period changed; refresh before reviewing records', 'an open period cannot be read as finalised');
select extensions.throws_ok($$select * from pg_temp.canonical_records(gen_random_uuid(), '2024-10-01')$$,
  'P0001', 'Invalid timesheet week', 'a non-Monday period fails clearly');
select public.correct_attendance_event(
  'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
  '27300000-0000-4000-8000-000000000001', '47300000-0000-4000-8000-000000000001',
  gen_random_uuid(), '2024-10-05 13:10:00.123456+00', '2024-10-05 13:15:00.123456+00',
  'Confirmed clock-in'
);
select pg_temp.approve_canonical_session('27300000-0000-4000-8000-000000000001');
select pg_temp.approve_canonical_session('27300000-0000-4000-8000-000000000002');
insert into canonical_test_saved (name, id)
select 'first', public.finalise_payroll_period(
  'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
  '2024-09-30', gen_random_uuid(), null
);
insert into canonical_test_saved (name, value)
select 'first-record', record from pg_temp.canonical_records((select id from canonical_test_saved where name = 'first'))
where session_id = '27300000-0000-4000-8000-000000000001';

select extensions.is((select count(*) from pg_temp.canonical_records((select id from canonical_test_saved where name = 'first'))),
  2::bigint, 'one canonical record is returned for each approved finalised session');
select extensions.is((select value ->> 'schemaVersion' from canonical_test_saved where name = 'first-record'),
  '1', 'the canonical schema version is explicit');
select extensions.is((select value #>> '{worker,employeeId}' from canonical_test_saved where name = 'first-record'),
  'e7300000-0000-4000-8000-000000000001', 'the worker is identified by its Butterbox employee ID');
select extensions.is((select value #> '{worker,providerMapping}' from canonical_test_saved where name = 'first-record'),
  'null'::jsonb, 'an external employee mapping is explicitly unassigned, not inferred');
select extensions.is((select value #>> '{venue,id}' from canonical_test_saved where name = 'first-record'),
  'c7300000-0000-4000-8000-000000000001', 'the actual venue is snapshotted');
select extensions.is((select value #>> '{venue,departmentId}' from canonical_test_saved where name = 'first-record'),
  'd7300000-0000-4000-8000-000000000001', 'the actual department is snapshotted');
select extensions.is((select value #>> '{venue,timezone}' from canonical_test_saved where name = 'first-record'),
  'Australia/Sydney', 'the venue timezone is snapshotted');
select extensions.is((select value ->> 'workDate' from canonical_test_saved where name = 'first-record'),
  '2024-10-05', 'an overnight shift retains its venue-local start date across the DST transition');
select extensions.is((select value #>> '{attendance,clockInAt}' from canonical_test_saved where name = 'first-record'),
  '2024-10-05T13:15:00.123456Z', 'the corrected clock-in is preserved at microsecond precision');
select extensions.is((select value #>> '{attendance,clockOutAt}' from canonical_test_saved where name = 'first-record'),
  '2024-10-05T17:15:00.123457Z', 'the clock-out is preserved at microsecond precision');
select extensions.is((select (value #>> '{hours,elapsed}')::numeric from canonical_test_saved where name = 'first-record'),
  14400.000001::numeric, 'elapsed seconds are exact across the DST transition');
select extensions.is((select (value #>> '{hours,worked}')::numeric from canonical_test_saved where name = 'first-record'),
  11700::numeric, 'worked seconds exclude both recorded breaks');
select extensions.is((select (value #>> '{hours,paid}')::numeric from canonical_test_saved where name = 'first-record'),
  12600.000001::numeric, 'paid seconds include the paid break');
select extensions.is((select (value #>> '{hours,paidBreak}')::numeric from canonical_test_saved where name = 'first-record'),
  900.000001::numeric, 'the paid break retains sub-second duration');
select extensions.is((select (value #>> '{hours,unpaidBreak}')::numeric from canonical_test_saved where name = 'first-record'),
  1800::numeric, 'the unpaid break is separately retained');
select extensions.is((select jsonb_array_length(value -> 'breaks') from canonical_test_saved where name = 'first-record'),
  2, 'both individual breaks are present');
select extensions.is((select value #>> '{breaks,0,classification}' from canonical_test_saved where name = 'first-record'),
  'paid', 'break classifications are explicit');
select extensions.is((select value #>> '{breaks,0,startEventId}' from canonical_test_saved where name = 'first-record'),
  '47300000-0000-4000-8000-000000000002', 'break source events remain traceable');
select extensions.is((select value #>> '{breaks,1,endedAt}' from canonical_test_saved where name = 'first-record'),
  '2024-10-05T16:00:00.000000Z', 'the DST-boundary break retains its UTC instant');
select extensions.is((select value -> 'payCodes' from canonical_test_saved where name = 'first-record'),
  'null'::jsonb, 'uninterpreted pay codes are explicitly unassigned');
select extensions.is((select value #>> '{approval,status}' from canonical_test_saved where name = 'first-record'),
  'approved', 'the record identifies the approved state');
select extensions.is((select value #>> '{period,finalisationId}' from canonical_test_saved where name = 'first-record'),
  (select id::text from canonical_test_saved where name = 'first'), 'the record identifies its finalisation version');
select extensions.matches((select value #>> '{period,version}' from canonical_test_saved where name = 'first-record'),
  '^[1-9][0-9]*$', 'the period version is a positive sequence represented without numeric precision loss');
select extensions.matches((select value #>> '{approval,revision}' from canonical_test_saved where name = 'first-record'),
  '^[0-9a-f]{64}$', 'the approved attendance revision is recorded');
select extensions.throws_ok($$select * from public.payroll_canonical_details$$,
  '42501', 'permission denied for table payroll_canonical_details', 'authenticated callers cannot bypass the scoped RPC');

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from pg_temp.canonical_records((select id from canonical_test_saved where name = 'first'))),
  2::bigint, 'a venue general manager can review the full venue records');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select * from pg_temp.canonical_records((select id from canonical_test_saved where name = 'first'))$$,
  'P0001', 'Permission denied', 'a department manager cannot access the full-venue payroll record');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select * from pg_temp.canonical_records((select id from canonical_test_saved where name = 'first'))$$,
  'P0001', 'Permission denied', 'an employee cannot access the full-venue payroll record');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000005', true);
select extensions.throws_ok($$select * from pg_temp.canonical_records((select id from canonical_test_saved where name = 'first'))$$,
  'P0001', 'Permission denied', 'another tenant cannot access the payroll record');

reset role;
select extensions.throws_ok($$update public.payroll_canonical_details set venue_timezone = 'UTC'$$,
  'P0001', 'Original attendance records are immutable', 'a privileged update cannot change the captured details');
select extensions.throws_ok($$delete from public.payroll_canonical_details$$,
  'P0001', 'Original attendance records are immutable', 'a privileged delete cannot erase the captured details');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000001', true);
select public.reopen_payroll_period(
  'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
  '2024-09-30', gen_random_uuid(), 'Correct clock-in'
);
select extensions.throws_ok($$select * from pg_temp.canonical_records((select id from canonical_test_saved where name = 'first'))$$,
  'P0001', 'Payroll period changed; refresh before reviewing records', 'reopening invalidates a stale preview');
select public.set_attendance_edit_lock(
  'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
  '27300000-0000-4000-8000-000000000001', gen_random_uuid(), false, 'Correct clock-in'
);
select public.correct_attendance_event(
  'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
  '27300000-0000-4000-8000-000000000001', '47300000-0000-4000-8000-000000000001',
  gen_random_uuid(), '2024-10-05 13:15:00.123456+00', '2024-10-05 13:20:00.123456+00', 'Confirmed later start'
);
select pg_temp.approve_canonical_session('27300000-0000-4000-8000-000000000001');
insert into canonical_test_saved (name, id)
select 'second', public.finalise_payroll_period(
  'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
  '2024-09-30', gen_random_uuid(), null
);
select extensions.throws_ok($$select * from pg_temp.canonical_records((select id from canonical_test_saved where name = 'first'))$$,
  'P0001', 'Payroll period changed; refresh before reviewing records', 'an earlier finalisation cannot be mixed into a new preview');
select extensions.is((select record #>> '{attendance,clockInAt}'
  from pg_temp.canonical_records((select id from canonical_test_saved where name = 'second'))
  where session_id = '27300000-0000-4000-8000-000000000001'),
  '2024-10-05T13:20:00.123456Z', 'a new finalisation captures the corrected time');
reset role;
select extensions.is((select public.canonical_payroll_timestamp(clock_in_at) from public.payroll_canonical_details
  where event_id = (select id from canonical_test_saved where name = 'first')
    and session_id = '27300000-0000-4000-8000-000000000001'),
  '2024-10-05T13:15:00.123456Z', 'the earlier detailed snapshot remains unchanged');
select extensions.is((select count(*) from public.payroll_canonical_details
  where session_id = '27300000-0000-4000-8000-000000000001'),
  2::bigint, 'each finalisation retains its own immutable record');

insert into public.payroll_period_events (
  id, business_id, venue_id, week_start, period_starts_at, period_ends_at, action, actor_id, actor_role,
  request_id, session_count, worked_seconds, paid_seconds
) values (
  '77300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001',
  'c7300000-0000-4000-8000-000000000001', '2024-10-07', '2024-10-06 13:00+00',
  '2024-10-13 13:00+00', 'finalised', 'a7300000-0000-4000-8000-000000000001', 'owner',
  gen_random_uuid(), 1, 0, 0
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$select * from pg_temp.canonical_records('77300000-0000-4000-8000-000000000001', '2024-10-07')$$,
  'P0001', 'Finalised period lacks complete payroll details; reopen and finalise it again',
  'a missing or incomplete legacy snapshot fails explicitly');
insert into canonical_test_saved (name, id)
select 'empty', public.finalise_payroll_period(
  'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
  '2024-10-14', gen_random_uuid(), null
);
select extensions.is((select count(*) from pg_temp.canonical_records(
  (select id from canonical_test_saved where name = 'empty'), '2024-10-14'
)), 0::bigint, 'an explicitly finalised empty week has a valid empty record set');
reset role;
delete from public.businesses where id in (
  'b7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000002'
);
select extensions.is((select count(*) from public.payroll_canonical_details
  where business_id = 'b7300000-0000-4000-8000-000000000001'), 0::bigint,
  'deleting a disposable business cascades to its canonical snapshots');
select * from extensions.finish();
rollback;
