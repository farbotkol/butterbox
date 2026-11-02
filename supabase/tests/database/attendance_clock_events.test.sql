begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(72);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a8000000-0000-4000-8000-000000000001', 'clock-owner@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000002', 'clock-foh@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000003', 'clock-boh@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000004', 'clock-first@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000005', 'clock-second@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000006', 'clock-coworker@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000007', 'clock-outside@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000008', 'clock-unlinked@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b8000000-0000-4000-8000-000000000001', 'Clock business'),
  ('b8000000-0000-4000-8000-000000000002', 'Outside business');
insert into public.venues (id, business_id, name, timezone) values
  ('c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'Perth', 'Australia/Perth'),
  ('c8000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'FOH'),
  ('d8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'BOH'),
  ('d8000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000002', 'Perth'),
  ('d8000000-0000-4000-8000-000000000004', 'b8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002', 'foh_manager', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000003', 'boh_manager', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000002'),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004', 'employee', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000005', 'employee', 'c8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000003'),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000006', 'employee', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000007', 'owner', null, null),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000008', 'employee', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004', 'Clock worker', 'Server'),
  ('e8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000003', 'a8000000-0000-4000-8000-000000000005', 'Other venue profile', 'Cook'),
  ('e8000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000006', 'Coworker', 'Server'),
  ('e8000000-0000-4000-8000-000000000004', 'b8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000004', 'a8000000-0000-4000-8000-000000000007', 'Outside worker', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000002');

set local role anon;
select extensions.throws_ok(
  $$select * from public.get_my_attendance_state('b8000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot inspect attendance state');
select extensions.throws_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot create clock events');

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is(
  (select state from public.get_my_attendance_state('b8000000-0000-4000-8000-000000000001')),
  'clocked_out', 'a linked employee initially sees clocked-out state');
select extensions.is(
  (select count(*)::integer from public.list_my_clock_options(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')),
  1, 'clock options include only the employee and department within their membership scope');
select extensions.throws_ok(
  $$select * from public.get_my_attendance_state('b8000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Permission denied', 'a worker cannot inspect another business state');
select extensions.throws_ok(
  $$select * from public.list_my_clock_options('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Permission denied', 'a worker cannot inspect another venue options');
select extensions.throws_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000003', '18000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Employee not found or permission denied', 'a worker cannot clock a coworker in');
select extensions.throws_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000003',
    'e8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Employee not found or permission denied', 'a profile cannot be clocked into the wrong venue');
select extensions.throws_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000002',
    'e8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Employee not found or permission denied', 'a linked department outside membership scope is denied');
select extensions.throws_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Invalid clock request', 'clock requests require an idempotency key');
select extensions.throws_ok(
  $$select * from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Session not found or permission denied', 'clocking out without a session is rejected');

select set_config('test.before_clock_in', clock_timestamp()::text, true);
select extensions.lives_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001')$$,
  'a linked employee clocks in');
select set_config('test.first_session', (
  select session_id::text from public.attendance_events
  where request_id = '18000000-0000-4000-8000-000000000001'
), true);
select extensions.is(
  (select count(*)::integer from public.attendance_events), 1,
  'clock-in adds exactly one original event');
select extensions.ok(
  (select occurred_at >= current_setting('test.before_clock_in')::timestamptz
    and occurred_at <= clock_timestamp()
    from public.attendance_events where request_id = '18000000-0000-4000-8000-000000000001'),
  'the server records the canonical clock-in timestamp');
select extensions.is(
  (select event_type || ':' || verification_status from public.attendance_events),
  'clock_in:unverified', 'clock events are explicitly unverified until verification is implemented');
select extensions.is(
  (select venue_id from public.attendance_events), 'c8000000-0000-4000-8000-000000000001'::uuid,
  'the original event retains the actual venue');
select extensions.is(
  (select department_id from public.attendance_events), 'd8000000-0000-4000-8000-000000000001'::uuid,
  'the original event retains the actual department');
select extensions.is(
  (select state from public.get_my_attendance_state('b8000000-0000-4000-8000-000000000001')),
  'clocked_in', 'the employee sees clocked-in state');
select extensions.is(
  (select session_id from public.get_my_attendance_state('b8000000-0000-4000-8000-000000000001')),
  current_setting('test.first_session')::uuid, 'the current state identifies the open session');
select extensions.is(
  (select venue_name || ':' || venue_timezone || ':' || department_name
    from public.get_my_attendance_state('b8000000-0000-4000-8000-000000000001')),
  'Sydney:Australia/Sydney:FOH', 'current state includes the actual venue and timezone');
select extensions.is(
  (select event_id from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001')),
  (select id from public.attendance_events where event_type = 'clock_in'),
  'repeating the same clock-in request returns the original event');
select extensions.is(
  (select count(*)::integer from public.attendance_events), 1,
  'repeating a clock-in does not add another event');
select extensions.throws_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Already clocked in', 'a new clock-in cannot start while already clocked in');
select extensions.throws_ok(
  $$select * from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    current_setting('test.first_session')::uuid, '18000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Request identifier already used', 'a clock-in request key cannot be reused for clock-out');
select extensions.throws_ok(
  $$insert into public.attendance_sessions (business_id, venue_id, department_id, employee_id, started_by)
    values ('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001',
    'd8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001',
    'a8000000-0000-4000-8000-000000000004')$$,
  '42501', null, 'employees cannot insert sessions directly');
select extensions.throws_ok(
  $$update public.attendance_events set occurred_at = '2000-01-01'$$,
  '42501', null, 'employees cannot overwrite original timestamps');
select extensions.throws_ok(
  $$delete from public.attendance_events$$,
  '42501', null, 'employees cannot delete original events');

reset role;
select extensions.throws_ok(
  $$update public.attendance_events set occurred_at = '2000-01-01'
    where request_id = '18000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Original attendance records are immutable',
  'privileged accidental updates cannot overwrite original timestamps');
select extensions.throws_ok(
  $$delete from public.attendance_events where request_id = '18000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Original attendance records are immutable',
  'privileged accidental deletes cannot remove original events');
select extensions.throws_ok(
  $$update public.attendance_sessions set department_id = 'd8000000-0000-4000-8000-000000000002'
    where id = current_setting('test.first_session')::uuid$$,
  'P0001', 'Original attendance records are immutable',
  'original session attribution cannot be overwritten');
select extensions.throws_ok(
  $$delete from public.attendance_sessions where id = current_setting('test.first_session')::uuid$$,
  'P0001', 'Original attendance records are immutable',
  'original sessions cannot be deleted while their business exists');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.attendance_events), 1,
  'a FOH manager sees attendance in the managed department');
select extensions.throws_ok(
  $$select * from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    current_setting('test.first_session')::uuid, '18000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Session not found or permission denied', 'a manager cannot impersonate the worker to clock out');
select extensions.throws_ok(
  $$update public.attendance_events set occurred_at = '2000-01-01'$$,
  '42501', null, 'managers cannot overwrite original events');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.attendance_events), 0,
  'a BOH manager cannot inspect FOH attendance');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000006', true);
select extensions.is((select count(*)::integer from public.attendance_events), 0,
  'a coworker cannot inspect another employee attendance');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000007', true);
select extensions.is((select count(*)::integer from public.attendance_events), 0,
  'another business cannot inspect attendance');
select extensions.throws_ok(
  $$select * from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    current_setting('test.first_session')::uuid, '18000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'another business cannot modify the session');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000008', true);
select extensions.is(
  (select count(*)::integer from public.list_my_clock_options(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')),
  0, 'an unlinked member has no clock-in options');

reset role;
update public.employees set active = false where id = 'e8000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is(
  (select event_id from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001')),
  (select id from public.attendance_events where event_type = 'clock_in'),
  'a replay remains idempotent when the profile has since been archived');
select set_config('test.before_clock_out', clock_timestamp()::text, true);
select extensions.lives_ok(
  $$select * from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    current_setting('test.first_session')::uuid, '18000000-0000-4000-8000-000000000003')$$,
  'an archived employee can finish an already-open session');
select extensions.ok(
  (select occurred_at >= current_setting('test.before_clock_out')::timestamptz
    and occurred_at <= clock_timestamp() from public.attendance_events where event_type = 'clock_out'),
  'the server records the canonical clock-out timestamp');
select extensions.ok(
  (select max(occurred_at) filter (where event_type = 'clock_out')
    >= max(occurred_at) filter (where event_type = 'clock_in') from public.attendance_events),
  'clock-out is not earlier than clock-in');
select extensions.is(
  (select state from public.get_my_attendance_state('b8000000-0000-4000-8000-000000000001')),
  'clocked_out', 'the employee sees clocked-out state after finishing');
select extensions.is(
  (select event_id from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    current_setting('test.first_session')::uuid, '18000000-0000-4000-8000-000000000003')),
  (select id from public.attendance_events where event_type = 'clock_out'),
  'repeating the same clock-out request returns the original event');
select extensions.is((select count(*)::integer from public.attendance_events), 2,
  'repeating clock-out does not add another event');
select extensions.throws_ok(
  $$select * from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    current_setting('test.first_session')::uuid, '18000000-0000-4000-8000-000000000004')$$,
  'P0001', 'Already clocked out', 'a new clock-out cannot finish an already-closed session');
select extensions.throws_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000005')$$,
  'P0001', 'Employee or department is unavailable', 'an archived employee cannot start a new session');

reset role;
update public.employees set active = true where id = 'e8000000-0000-4000-8000-000000000001';
update public.business_memberships set role = 'general_manager', department_id = null
where business_id = 'b8000000-0000-4000-8000-000000000001'
  and user_id = 'a8000000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_my_clock_options(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')),
  2, 'a venue-wide worker can choose either linked department');
select extensions.lives_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000002',
    'e8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000010')$$,
  'a linked secondary department can be selected explicitly');
select extensions.is(
  (select department_id from public.attendance_events
    where request_id = '18000000-0000-4000-8000-000000000010'),
  'd8000000-0000-4000-8000-000000000002'::uuid, 'the selected secondary department is preserved');
select extensions.lives_ok(
  $$select * from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    (select session_id from public.attendance_events
      where request_id = '18000000-0000-4000-8000-000000000010'),
    '18000000-0000-4000-8000-000000000011')$$,
  'the explicitly selected secondary-department session can be finished');
reset role;
update public.business_memberships set role = 'employee',
  department_id = 'd8000000-0000-4000-8000-000000000001'
where business_id = 'b8000000-0000-4000-8000-000000000001'
  and user_id = 'a8000000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.lives_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000005')$$,
  'a new session can start after the previous session finishes');
select set_config('test.second_session', (
  select session_id::text from public.attendance_events
  where request_id = '18000000-0000-4000-8000-000000000005'
), true);
reset role;
update public.employees set auth_user_id = null where id = 'e8000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select state from public.get_my_attendance_state('b8000000-0000-4000-8000-000000000001')),
  'needs_review', 'an unlinked open session is surfaced without disclosing inaccessible details');
select extensions.is((select count(*)::integer from public.attendance_events), 0,
  'unlinking the account removes direct access to its old attendance events');
select extensions.throws_ok(
  $$select * from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    current_setting('test.second_session')::uuid, '18000000-0000-4000-8000-000000000006')$$,
  'P0001', 'Session not found or permission denied', 'an unlinked account cannot append clock-out');
reset role;
update public.employees set auth_user_id = 'a8000000-0000-4000-8000-000000000004'
where id = 'e8000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select state from public.get_my_attendance_state('b8000000-0000-4000-8000-000000000001')),
  'clocked_in', 'relinking the same account restores its open state');

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000005', true);
select extensions.lives_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000003',
    'e8000000-0000-4000-8000-000000000002', '18000000-0000-4000-8000-000000000007')$$,
  'unlinked profiles can independently clock in before identity is confirmed');
select set_config('test.other_session', (
  select session_id::text from public.attendance_events
  where request_id = '18000000-0000-4000-8000-000000000007'
), true);
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.link_shared_worker_profiles('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Cannot link profiles while more than one has an open clock session',
  'a link cannot combine two already-open clock sessions');
select extensions.is(
  (select count(*)::integer from public.list_shared_worker_profiles(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')),
  0, 'a rejected link leaves no identity mapping');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000005', true);
select extensions.lives_ok(
  $$select * from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    current_setting('test.other_session')::uuid, '18000000-0000-4000-8000-000000000008')$$,
  'the second profile can close its session before linking');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.link_shared_worker_profiles('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001',
    'e8000000-0000-4000-8000-000000000002')$$,
  'the owner can link profiles once at most one session remains open');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000003',
    'e8000000-0000-4000-8000-000000000002', '18000000-0000-4000-8000-000000000009')$$,
  'P0001', 'Already clocked in', 'a linked profile cannot start a second cross-venue session');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000004', true);
select extensions.lives_ok(
  $$select * from public.clock_out_attendance('b8000000-0000-4000-8000-000000000001',
    current_setting('test.second_session')::uuid, '18000000-0000-4000-8000-000000000006')$$,
  'the original worker can finish after profiles are linked');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000005', true);
select extensions.lives_ok(
  $$select * from public.clock_in_attendance('b8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000003',
    'e8000000-0000-4000-8000-000000000002', '18000000-0000-4000-8000-000000000009')$$,
  'the linked worker can start at the other venue after finishing');
select extensions.is(
  (select venue_id from public.attendance_events
    where request_id = '18000000-0000-4000-8000-000000000009'),
  'c8000000-0000-4000-8000-000000000002'::uuid,
  'the later original event retains the second actual venue');
select extensions.is(
  (select department_id from public.attendance_events
    where request_id = '18000000-0000-4000-8000-000000000009'),
  'd8000000-0000-4000-8000-000000000003'::uuid,
  'the later original event retains the second actual department');

reset role;
select extensions.lives_ok(
  $$delete from auth.users where id = 'a8000000-0000-4000-8000-000000000005'$$,
  'an account can be removed without deleting original attendance');
select extensions.is(
  (select count(*)::integer from public.attendance_events
    where actor_id = 'a8000000-0000-4000-8000-000000000005'),
  3, 'original events retain their actor identifier after account removal');
select extensions.is(
  (select count(*)::integer from public.attendance_sessions
    where started_by = 'a8000000-0000-4000-8000-000000000005'),
  2, 'original sessions retain their actor identifier after account removal');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.attendance_events
    where actor_id = 'a8000000-0000-4000-8000-000000000005'),
  3, 'the owner retains scoped access to the former account original events');
reset role;
select extensions.throws_ok(
  $$delete from public.businesses where id = 'b8000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Business deletion is disabled while record preservation requirements remain unresolved',
  'business removal cannot cascade original attendance records');
select * from extensions.finish();
rollback;
