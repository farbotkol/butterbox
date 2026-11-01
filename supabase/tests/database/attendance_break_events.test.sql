begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(79);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-4000-8000-000000000001', 'break-owner@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000002', 'break-foh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000003', 'break-boh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000004', 'break-worker@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000005', 'break-coworker@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000006', 'break-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b9000000-0000-4000-8000-000000000001', 'Break business'),
  ('b9000000-0000-4000-8000-000000000002', 'Outside business');
insert into public.venues (id, business_id, name, timezone) values
  ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'Harbour', 'Australia/Sydney'),
  ('c9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'FOH'),
  ('d9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'BOH'),
  ('d9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'foh_manager', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000003', 'boh_manager', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004', 'employee', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000005', 'employee', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004', 'Break worker', 'Server'),
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000005', 'Coworker', 'Server');

set local role anon;
select extensions.throws_ok(
  $$select * from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot inspect break state');
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001', 'paid', '19000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'anonymous callers cannot start breaks');
select extensions.throws_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'anonymous callers cannot end breaks');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select state from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')),
  'clocked_out', 'a worker initially sees clocked-out state');
select extensions.ok(
  (select break_id is null and break_classification is null and break_started_at is null
    from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')),
  'clocked-out state has no assumed break');
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001', 'paid', '19000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Session not found or permission denied', 'a break cannot start without an attendance session');
select extensions.lives_ok(
  $$select * from public.clock_in_attendance('b9000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001',
    'e9000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000001')$$,
  'the worker can clock in before taking a break');
select set_config('test.break_session', (
  select session_id::text from public.attendance_events
  where request_id = '19000000-0000-4000-8000-000000000001'
), true);
select extensions.ok(
  (select state = 'clocked_in' and break_id is null and break_classification is null
    and break_started_at is null
    from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')),
  'a newly clocked-in worker is not implicitly on a break');
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, null, '19000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Invalid break request', 'classification must be explicit');
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, 'Paid', '19000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Invalid break request', 'unknown classification is rejected');
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, 'paid', null)$$,
  'P0001', 'Invalid break request', 'break starts require an idempotency key');
select extensions.throws_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, null, '19000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Invalid break request', 'break ends require a break identifier');
select extensions.throws_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, '39000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Break not found or permission denied', 'an unstarted break cannot be ended');

select set_config('test.before_break', clock_timestamp()::text, true);
select extensions.lives_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, 'paid', '19000000-0000-4000-8000-000000000002')$$,
  'the worker can explicitly start a paid break');
select set_config('test.paid_break', (
  select break_id::text from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')
), true);
select extensions.ok(
  (select state = 'clocked_in' and break_id = current_setting('test.paid_break')::uuid
    and break_classification = 'paid' and break_started_at is not null
    from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')),
  'the current state exposes the active paid break');
select extensions.ok(
  (select occurred_at >= current_setting('test.before_break')::timestamptz and occurred_at <= clock_timestamp()
    from public.attendance_events where request_id = '19000000-0000-4000-8000-000000000002'),
  'the server assigns the canonical break-start timestamp');
select extensions.is(
  (select classification from public.attendance_breaks where id = current_setting('test.paid_break')::uuid),
  'paid', 'the paid classification is retained in the immutable break');
select extensions.ok(
  (select venue_id = 'c9000000-0000-4000-8000-000000000001'::uuid
    and department_id = 'd9000000-0000-4000-8000-000000000001'::uuid
    and employee_id = 'e9000000-0000-4000-8000-000000000001'::uuid
    and actor_id = 'a9000000-0000-4000-8000-000000000004'::uuid
    and verification_status = 'unverified'
    from public.attendance_events where request_id = '19000000-0000-4000-8000-000000000002'),
  'the original break event retains the session attribution and unverified status');
select extensions.is(
  (select event_id from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, 'paid', '19000000-0000-4000-8000-000000000002')),
  (select id from public.attendance_events where request_id = '19000000-0000-4000-8000-000000000002'),
  'repeating a break start returns the original event');
select extensions.is(
  (select count(*)::integer from public.attendance_events where event_type = 'break_start'),
  1, 'a retried break start creates no duplicate event');
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, 'unpaid', '19000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Request identifier already used', 'a replay cannot change the paid classification');
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, 'paid', '19000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Request identifier already used', 'a clock-in request key cannot be reused for a break');
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, 'unpaid', '19000000-0000-4000-8000-000000000004')$$,
  'P0001', 'Already on a break', 'another break cannot start until the current break ends');
select extensions.throws_ok(
  $$select * from public.clock_out_attendance('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, '19000000-0000-4000-8000-000000000005')$$,
  'P0001', 'End the open break before clocking out', 'clock-out cannot silently end an open break');
select extensions.is(
  (select count(*)::integer from public.attendance_events where event_type = 'clock_out'),
  0, 'a rejected clock-out does not create an event');
select extensions.throws_ok(
  $$update public.attendance_breaks set classification = 'unpaid'$$,
  '42501', null, 'workers cannot change a break classification directly');
select extensions.throws_ok(
  $$delete from public.attendance_breaks$$,
  '42501', null, 'workers cannot delete original breaks');
select extensions.throws_ok(
  $$insert into public.attendance_breaks (session_id, business_id, classification)
    values (current_setting('test.break_session')::uuid, 'b9000000-0000-4000-8000-000000000001', 'paid')$$,
  '42501', null, 'workers cannot insert breaks directly');
select extensions.throws_ok(
  $$update public.attendance_events set occurred_at = '2000-01-01' where event_type = 'break_start'$$,
  '42501', null, 'workers cannot overwrite original break times');

reset role;
select extensions.throws_ok(
  $$update public.attendance_breaks set classification = 'unpaid' where id = current_setting('test.paid_break')::uuid$$,
  'P0001', 'Original attendance records are immutable', 'privileged accidental classification changes are denied');
select extensions.throws_ok(
  $$delete from public.attendance_breaks where id = current_setting('test.paid_break')::uuid$$,
  'P0001', 'Original attendance records are immutable', 'privileged accidental break deletion is denied');
select extensions.throws_ok(
  $$insert into public.attendance_breaks (session_id, business_id, classification)
    values (current_setting('test.break_session')::uuid, 'b9000000-0000-4000-8000-000000000002', 'paid')$$,
  '23503', null, 'breaks cannot reference a session from another business');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.attendance_breaks), 1,
  'the FOH manager can view the managed department break');
select extensions.throws_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, current_setting('test.paid_break')::uuid,
    '19000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Session not found or permission denied', 'a manager cannot impersonate the worker to end a break');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.attendance_breaks), 0,
  'the BOH manager cannot see FOH breaks');
select extensions.is((select count(*)::integer from public.attendance_events), 0,
  'the BOH manager cannot see FOH break events');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*)::integer from public.attendance_breaks), 0,
  'a coworker cannot see another employee break');
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, 'paid', '19000000-0000-4000-8000-000000000004')$$,
  'P0001', 'Session not found or permission denied', 'a coworker cannot start a break for another employee');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000006', true);
select extensions.is((select count(*)::integer from public.attendance_breaks), 0,
  'another business cannot see breaks');
select extensions.throws_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, current_setting('test.paid_break')::uuid,
    '19000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'another business cannot end the break');

reset role;
update public.employees set auth_user_id = null where id = 'e9000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
select extensions.ok(
  (select state = 'needs_review' and break_id is null and break_classification is null
    and break_started_at is null
    from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')),
  'unlinking the account hides the open break and shows review state');
select extensions.is((select count(*)::integer from public.attendance_breaks), 0,
  'an unlinked account cannot inspect its old break');
select extensions.throws_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, current_setting('test.paid_break')::uuid,
    '19000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Session not found or permission denied', 'an unlinked account cannot end a break');
reset role;
update public.employees set auth_user_id = 'a9000000-0000-4000-8000-000000000004'
where id = 'e9000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select break_id from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')),
  current_setting('test.paid_break')::uuid, 'relinking restores the same open break');

select set_config('test.before_break_end', clock_timestamp()::text, true);
select extensions.lives_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, current_setting('test.paid_break')::uuid,
    '19000000-0000-4000-8000-000000000003')$$,
  'the worker can end the paid break');
select extensions.ok(
  (select occurred_at >= current_setting('test.before_break_end')::timestamptz and occurred_at <= clock_timestamp()
    from public.attendance_events where request_id = '19000000-0000-4000-8000-000000000003'),
  'the server assigns the canonical break-end timestamp');
select extensions.ok(
  (select ended.occurred_at >= started.occurred_at
    from public.attendance_events started join public.attendance_events ended on ended.break_id = started.break_id
    where started.break_id = current_setting('test.paid_break')::uuid
      and started.event_type = 'break_start' and ended.event_type = 'break_end'),
  'the break end is not earlier than its start');
select extensions.ok(
  (select state = 'clocked_in' and break_id is null and break_classification is null and break_started_at is null
    from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')),
  'the worker is clocked in but no longer on break');
select extensions.is(
  (select event_id from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, current_setting('test.paid_break')::uuid,
    '19000000-0000-4000-8000-000000000003')),
  (select id from public.attendance_events where request_id = '19000000-0000-4000-8000-000000000003'),
  'repeating a break end returns the original event');
select extensions.is(
  (select count(*)::integer from public.attendance_events where event_type = 'break_end'),
  1, 'a retried break end creates no duplicate event');
select extensions.throws_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, current_setting('test.paid_break')::uuid,
    '19000000-0000-4000-8000-000000000006')$$,
  'P0001', 'Break already ended', 'an already-ended break cannot be ended with a new request');
select extensions.throws_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, current_setting('test.paid_break')::uuid,
    '19000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Request identifier already used', 'a start key cannot be reused to end a break');
select extensions.lives_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, 'unpaid', '19000000-0000-4000-8000-000000000007')$$,
  'a second unpaid break can start in the same session');
select set_config('test.unpaid_break', (
  select break_id::text from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')
), true);
select extensions.is(
  (select count(*)::integer from public.attendance_breaks), 2,
  'multiple breaks are retained in the same session');
select extensions.is(
  (select array_agg(classification order by classification) from public.attendance_breaks),
  array['paid', 'unpaid']::text[], 'paid and unpaid classifications are retained separately');
select extensions.ok(
  (select break_id = current_setting('test.unpaid_break')::uuid and break_classification = 'unpaid'
    from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')),
  'the second break is shown as unpaid');
select extensions.throws_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, current_setting('test.unpaid_break')::uuid,
    '19000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Request identifier already used', 'an end retry cannot target a different break');
reset role;
update public.employees set active = false where id = 'e9000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.lives_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, current_setting('test.unpaid_break')::uuid,
    '19000000-0000-4000-8000-000000000008')$$,
  'an archived employee can finish an already-open break');
select extensions.lives_ok(
  $$select * from public.clock_out_attendance('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, '19000000-0000-4000-8000-000000000005')$$,
  'clock-out succeeds after all breaks end');
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, 'paid', '19000000-0000-4000-8000-000000000009')$$,
  'P0001', 'Attendance session is not open', 'a break cannot start after clock-out');
select extensions.lives_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.break_session')::uuid, current_setting('test.unpaid_break')::uuid,
    '19000000-0000-4000-8000-000000000008')$$,
  'an exact break-end replay remains idempotent after clock-out');
select extensions.is(
  (select count(*)::integer from public.attendance_events where session_id = current_setting('test.break_session')::uuid),
  6, 'two breaks produce exactly two start/end pairs plus clock-in/out');
select extensions.is(
  (select state from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')),
  'clocked_out', 'the final state is clocked out');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000005', true);
select extensions.lives_ok(
  $$select * from public.clock_in_attendance('b9000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001',
    'e9000000-0000-4000-8000-000000000002', '19000000-0000-4000-8000-000000000010')$$,
  'a coworker can clock in without taking a break');
select set_config('test.no_break_session', (
  select session_id::text from public.attendance_events
  where request_id = '19000000-0000-4000-8000-000000000010'
), true);
select extensions.lives_ok(
  $$select * from public.clock_out_attendance('b9000000-0000-4000-8000-000000000001',
    current_setting('test.no_break_session')::uuid, '19000000-0000-4000-8000-000000000011')$$,
  'a worker can clock out without recording any break');
select extensions.is(
  (select array_agg(event_type order by event_type) from public.attendance_events
    where session_id = current_setting('test.no_break_session')::uuid),
  array['clock_in', 'clock_out']::text[], 'no assumed break is silently inserted');
select extensions.is(
  (select count(*)::integer from public.attendance_breaks
    where session_id = current_setting('test.no_break_session')::uuid),
  0, 'a break-free session has no hidden break or classification');

select extensions.lives_ok(
  $$select * from public.clock_in_attendance('b9000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001',
    'e9000000-0000-4000-8000-000000000002', '19000000-0000-4000-8000-000000000012')$$,
  'another session can start before testing clock rollback');
select set_config('test.future_session', (
  select session_id::text from public.attendance_events
  where request_id = '19000000-0000-4000-8000-000000000012'
), true);
reset role;
insert into public.attendance_breaks (id, session_id, business_id, classification)
values ('39000000-0000-4000-8000-000000000009', current_setting('test.future_session')::uuid,
  'b9000000-0000-4000-8000-000000000001', 'paid');
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id,
  request_id, event_type, break_id, occurred_at
) values
  (current_setting('test.future_session')::uuid, 'b9000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001',
    'e9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000005',
    '19000000-0000-4000-8000-000000000013', 'break_start',
    '39000000-0000-4000-8000-000000000009', clock_timestamp() + interval '1 hour');
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.end_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.future_session')::uuid, '39000000-0000-4000-8000-000000000009',
    '19000000-0000-4000-8000-000000000017')$$,
  'P0001', 'Server clock is earlier than the previous attendance event',
  'a break end is not recorded earlier than its start if the server clock moves backwards');
select extensions.is(
  (select count(*)::integer from public.attendance_events
    where break_id = '39000000-0000-4000-8000-000000000009' and event_type = 'break_end'),
  0, 'a rejected clock-rollback request does not end the break');
reset role;
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id,
  request_id, event_type, break_id, occurred_at
) values
  (current_setting('test.future_session')::uuid, 'b9000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001',
    'e9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000005',
    '19000000-0000-4000-8000-000000000014', 'break_end',
    '39000000-0000-4000-8000-000000000009', clock_timestamp() + interval '2 hours');
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.start_attendance_break('b9000000-0000-4000-8000-000000000001',
    current_setting('test.future_session')::uuid, 'unpaid', '19000000-0000-4000-8000-000000000015')$$,
  'P0001', 'Server clock is earlier than the previous attendance event',
  'a break is not recorded earlier than the previous event if the server clock moves backwards');
select extensions.throws_ok(
  $$select * from public.clock_out_attendance('b9000000-0000-4000-8000-000000000001',
    current_setting('test.future_session')::uuid, '19000000-0000-4000-8000-000000000016')$$,
  'P0001', 'Server clock is earlier than the previous attendance event',
  'clock-out is not recorded earlier than a completed break');
select extensions.is(
  (select state from public.get_my_attendance_state_with_break('b9000000-0000-4000-8000-000000000001')),
  'clocked_in', 'a clock rollback leaves the attendance session open');
select extensions.is(
  (select count(*)::integer from public.attendance_breaks
    where session_id = current_setting('test.future_session')::uuid),
  1, 'a rejected clock-rollback request adds no break');

reset role;
select extensions.lives_ok(
  $$delete from auth.users where id = 'a9000000-0000-4000-8000-000000000004'$$,
  'removing an account does not remove original break records');
select extensions.is(
  (select count(*)::integer from public.attendance_breaks
    where session_id = current_setting('test.break_session')::uuid),
  2, 'both original break classifications survive account removal');
select extensions.is(
  (select count(*)::integer from public.attendance_events
    where session_id = current_setting('test.break_session')::uuid
      and actor_id = 'a9000000-0000-4000-8000-000000000004'),
  6, 'original break and clock events retain the actor identifier');
select extensions.lives_ok(
  $$delete from public.businesses where id = 'b9000000-0000-4000-8000-000000000001'$$,
  'removing the entire disposable business cascades immutable break records');
select extensions.is(
  (select count(*)::integer from public.attendance_breaks
    where business_id = 'b9000000-0000-4000-8000-000000000001'),
  0, 'business removal cascades its breaks');

select * from extensions.finish();
rollback;
