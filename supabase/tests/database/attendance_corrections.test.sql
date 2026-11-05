begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(83);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-4000-8000-000000000001', 'correction-owner@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000002', 'correction-foh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000003', 'correction-boh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000004', 'correction-worker@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000005', 'correction-colleague@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000006', 'correction-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b9000000-0000-4000-8000-000000000001', 'Correction cafe'),
  ('b9000000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'Harbour', 'Australia/Sydney'),
  ('c9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'Riverside', 'UTC'),
  ('c9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'FOH'),
  ('d9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'foh_manager', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000003', 'boh_manager', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004', 'employee', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000005', 'employee', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004', 'Correction worker', 'Server'),
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000005', 'Colleague', 'Server');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('29000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004'),
  ('29000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004'),
  ('29000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004');
insert into public.attendance_breaks (id, session_id, business_id, classification) values
  ('39000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'unpaid');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id,
  request_id, event_type, break_id, occurred_at
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.event_type, f.break_id::uuid, f.occurred_at::timestamptz
from (values
  ('49000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'clock_in', null, '2024-01-10 09:00+00'),
  ('49000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-000000000001', 'break_start', '39000000-0000-4000-8000-000000000001', '2024-01-10 12:00+00'),
  ('49000000-0000-4000-8000-000000000003', '29000000-0000-4000-8000-000000000001', 'break_end', '39000000-0000-4000-8000-000000000001', '2024-01-10 12:30+00'),
  ('49000000-0000-4000-8000-000000000004', '29000000-0000-4000-8000-000000000001', 'clock_out', null, '2024-01-10 17:00+00'),
  ('49000000-0000-4000-8000-000000000005', '29000000-0000-4000-8000-000000000002', 'clock_in', null, '2024-01-10 18:00+00'),
  ('49000000-0000-4000-8000-000000000006', '29000000-0000-4000-8000-000000000002', 'clock_out', null, '2024-01-10 19:00+00'),
  ('49000000-0000-4000-8000-000000000007', '29000000-0000-4000-8000-000000000003', 'clock_in', null, '2024-01-11 09:00+00')
) as f(id, session_id, event_type, break_id, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;

create function pg_temp.correct(p_event uuid, p_request uuid, p_old timestamptz, p_new timestamptz, p_reason text)
returns uuid language sql as $$
  select public.correct_attendance_event(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001', p_event, p_request, p_old, p_new, p_reason
  );
$$;
create function pg_temp.edit_lock(p_request uuid, p_locked boolean, p_reason text)
returns uuid language sql as $$
  select public.set_attendance_edit_lock(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001', p_request, p_locked, p_reason
  );
$$;

set local role anon;
select extensions.throws_ok(
  $$select * from public.attendance_event_corrections$$, '42501', null,
  'anonymous callers cannot read corrections');
select extensions.throws_ok(
  $$select public.correct_attendance_event(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001', '49000000-0000-4000-8000-000000000001',
    '59000000-0000-4000-8000-000000000001', '2024-01-10 09:00+00', '2024-01-10 08:30+00', 'Mistake')$$,
  '42501', null, 'anonymous callers cannot correct events');
select extensions.throws_ok(
  $$select * from public.list_attendance_corrections(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot list corrections');
select extensions.throws_ok(
  $$select * from public.list_attendance_edit_lock_history(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot list edit lock history');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
    '2024-01-10 09:00+00', '2024-01-10 08:30+00', 'Mistake')$$,
  'P0001', 'Session not found or permission denied', 'employees cannot correct their own events');
select extensions.throws_ok(
  $$select * from public.list_attendance_correction_events(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot list management edit controls');
select extensions.throws_ok(
  $$select * from public.list_attendance_edit_lock_history(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot list management lock history');
select extensions.throws_ok(
  $$select public.lock_attendance_worker(
    'b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001',
    'a9000000-0000-4000-8000-000000000004')$$,
  '42501', null, 'employees cannot invoke internal attendance locking helpers');
select extensions.throws_ok(
  $$select pg_temp.edit_lock('69000000-0000-4000-8000-000000000001', true, 'Review complete')$$,
  'P0001', 'Session not found or permission denied', 'employees cannot lock corrections');
select extensions.throws_ok(
  $$insert into public.attendance_event_corrections
    (business_id, session_id, event_id, actor_id, request_id, old_at, new_at, reason)
    values ('b9000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
      '49000000-0000-4000-8000-000000000001', auth.uid(), gen_random_uuid(), now(), now(), 'Forged')$$,
  '42501', null, 'employees cannot bypass correction authorization');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
    '2024-01-10 09:00+00', '2024-01-10 08:30+00', 'Mistake')$$,
  'P0001', 'Session not found or permission denied', 'BOH managers cannot correct FOH attendance');
select extensions.is(
  (select count(*)::integer from public.list_attendance_correction_events(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')),
  0, 'BOH managers cannot see FOH edit candidates');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000006', true);
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
    '2024-01-10 09:00+00', '2024-01-10 08:30+00', 'Mistake')$$,
  'P0001', 'Permission denied', 'another tenant cannot correct the session');
select extensions.throws_ok(
  $$select * from public.list_attendance_corrections(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant cannot list corrections');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.list_attendance_correction_events(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')),
  7, 'a scoped manager can inspect the original events');
select extensions.is(
  (select finished from public.list_attendance_correction_events(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where event_id = '49000000-0000-4000-8000-000000000007'),
  false, 'an open session is identified as unfinished');
select extensions.is(
  (select worked_seconds from public.list_worked_time(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where session_id = '29000000-0000-4000-8000-000000000001'),
  27000::numeric, 'the original worked time excludes the recorded unpaid break');
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
    '2024-01-10 09:00+00', '2024-01-10 08:30+00', '   ')$$,
  'P0001', 'Invalid attendance correction', 'a correction requires a reason');
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
    '2024-01-10 09:00+00', 'infinity', 'Mistake')$$,
  'P0001', 'Invalid attendance correction', 'infinite correction times are rejected');
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
    '2024-01-10 09:00+00', now() + interval '1 day', 'Mistake')$$,
  'P0001', 'Invalid attendance correction time', 'future attendance times are rejected');
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
    '2024-01-10 09:00+00', '2024-01-10 09:00+00', 'Mistake')$$,
  'P0001', 'Invalid attendance correction time', 'a no-op is rejected');
select extensions.throws_ok(
  $$select public.correct_attendance_event(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002',
    '29000000-0000-4000-8000-000000000001', '49000000-0000-4000-8000-000000000001',
    '59000000-0000-4000-8000-000000000001', '2024-01-10 09:00+00', '2024-01-10 08:30+00', 'Mistake')$$,
  'P0001', 'Session not found or permission denied', 'a mismatched venue cannot be used to correct attendance');
select extensions.throws_ok(
  $$select public.correct_attendance_event(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000003', '49000000-0000-4000-8000-000000000007',
    '59000000-0000-4000-8000-000000000001', '2024-01-11 09:00+00', '2024-01-11 08:30+00', 'Mistake')$$,
  'P0001', 'Only finished sessions can be corrected', 'open attendance cannot be changed');

select set_config('test.correction_id', pg_temp.correct(
  '49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
  '2024-01-10 09:00+00', '2024-01-10 08:30+00', '  Forgot to clock  ')::text, true);
select extensions.is(
  (select count(*)::integer from public.attendance_event_corrections), 1,
  'the correction is stored once');
select extensions.is(
  (select old_at from public.attendance_event_corrections), '2024-01-10 09:00+00'::timestamptz,
  'the old effective time is retained');
select extensions.is(
  (select new_at from public.attendance_event_corrections), '2024-01-10 08:30+00'::timestamptz,
  'the replacement time is retained');
select extensions.is(
  (select reason from public.attendance_event_corrections), 'Forgot to clock',
  'the reason is retained');
select extensions.is(
  (select actor_id from public.attendance_event_corrections), 'a9000000-0000-4000-8000-000000000002'::uuid,
  'the correction actor is authenticated');
select extensions.ok(
  (select created_at between now() - interval '1 minute' and clock_timestamp() + interval '1 minute'
    from public.attendance_event_corrections),
  'the correction receives a server timestamp');
select extensions.is(
  (select occurred_at from public.attendance_events where id = '49000000-0000-4000-8000-000000000001'),
  '2024-01-10 09:00+00'::timestamptz, 'the original event is unchanged');
select extensions.is(
  pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
    '2024-01-10 09:00+00', '2024-01-10 08:30+00', 'Forgot to clock')::text,
  current_setting('test.correction_id'), 'identical retries return the same correction');
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
    '2024-01-10 09:00+00', '2024-01-10 08:00+00', 'Forgot to clock')$$,
  'P0001', 'Request identifier already used', 'a request identifier cannot be reused with changed values');
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000002',
    '2024-01-10 09:00+00', '2024-01-10 08:00+00', 'Stale')$$,
  'P0001', 'Attendance changed; refresh before correcting', 'stale corrections are rejected');
select extensions.is(
  (select effective_at from public.list_attendance_correction_events(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where event_id = '49000000-0000-4000-8000-000000000001'),
  '2024-01-10 08:30+00'::timestamptz, 'edit candidates show the latest effective time');
select extensions.is(
  (select worked_seconds from public.list_worked_time(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where session_id = '29000000-0000-4000-8000-000000000001'),
  28800::numeric, 'worked time recalculates from the corrected clock-in');
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000004', '59000000-0000-4000-8000-000000000002',
    '2024-01-10 17:00+00', '2024-01-10 18:30+00', 'Longer')$$,
  'P0001', 'Corrected attendance overlaps another session', 'a correction cannot overlap another session');
select extensions.lives_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000003', '59000000-0000-4000-8000-000000000003',
    '2024-01-10 12:30+00', '2024-01-10 12:45+00', 'Break ended later')$$,
  'a break time can be corrected');
select extensions.is(
  (select unpaid_break_seconds from public.list_worked_time(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where session_id = '29000000-0000-4000-8000-000000000001'),
  2700::numeric, 'corrected break time is applied');
select extensions.is(
  (select worked_seconds from public.list_worked_time(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where session_id = '29000000-0000-4000-8000-000000000001'),
  27900::numeric, 'the corrected break is deducted once');
select extensions.lives_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000004',
    '2024-01-10 12:00+00', '2024-01-10 08:00+00', 'Review required')$$,
  'a correction can be recorded even if it exposes invalid chronology');
select extensions.ok(
  (select worked_seconds is null and exceptions @> array['invalid_break']
    from public.list_worked_time(
      'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where session_id = '29000000-0000-4000-8000-000000000001'),
  'invalid corrected chronology is flagged and no total is calculated');
select extensions.throws_ok(
  $$select pg_temp.edit_lock('69000000-0000-4000-8000-000000000001', true, 'Review complete')$$,
  'P0001', 'Incomplete or invalid attendance cannot be locked', 'invalid work time cannot be locked');
select extensions.lives_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000005',
    '2024-01-10 08:00+00', '2024-01-10 12:00+00', 'Correct chronology')$$,
  'an invalid correction can be superseded');
select extensions.lives_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000004', '59000000-0000-4000-8000-000000000006',
    '2024-01-10 17:00+00', '2024-01-10 18:00+00', 'Boundary')$$,
  'adjacent attendance sessions are not treated as overlapping');
select extensions.lives_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000004', '59000000-0000-4000-8000-000000000007',
    '2024-01-10 18:00+00', '2024-01-10 17:00+00', 'Restore')$$,
  'a later correction records its previous effective value');

select set_config('test.lock_id', pg_temp.edit_lock(
  '69000000-0000-4000-8000-000000000001', true, 'Review complete')::text, true);
select extensions.is(
  pg_temp.edit_lock('69000000-0000-4000-8000-000000000001', true, 'Review complete')::text,
  current_setting('test.lock_id'), 'locking can be retried idempotently');
select extensions.is(
  (select locked from public.list_attendance_correction_events(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where event_id = '49000000-0000-4000-8000-000000000001'),
  true, 'edit candidates expose the locked state');
select extensions.is(
  (select reason from public.list_attendance_edit_lock_history(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')),
  'Review complete', 'scoped managers can read the lock reason');
select extensions.is(
  (select actor_id from public.list_attendance_edit_lock_history(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')),
  'a9000000-0000-4000-8000-000000000002'::uuid, 'scoped managers can read the lock actor');
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000008',
    '2024-01-10 08:30+00', '2024-01-10 08:45+00', 'Another mistake')$$,
  'P0001', 'Attendance edits are locked', 'a locked session cannot be corrected');
select extensions.throws_ok(
  $$select pg_temp.edit_lock('69000000-0000-4000-8000-000000000002', false, 'Reopen')$$,
  'P0001', 'Only an owner or general manager can unlock attendance edits',
  'a department manager cannot unlock a reviewed session');
select extensions.throws_ok(
  $$select pg_temp.edit_lock('69000000-0000-4000-8000-000000000003', true, 'Again')$$,
  'P0001', 'Attendance edit lock is already in that state', 'duplicate lock transitions are rejected');
select extensions.throws_ok(
  $$update public.attendance_event_corrections set reason = 'Changed'$$,
  '42501', null, 'managers cannot update correction history directly');
select extensions.throws_ok(
  $$delete from public.attendance_edit_lock_events$$,
  '42501', null, 'managers cannot delete lock history directly');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select pg_temp.edit_lock('69000000-0000-4000-8000-000000000004', false, 'Reopen after review')$$,
  'an owner can unlock with a reason');
select extensions.is(
  (select count(*)::integer from public.attendance_edit_lock_events), 2,
  'lock and unlock are both retained');
select extensions.is(
  (select reason from public.attendance_edit_lock_events where locked = false), 'Reopen after review',
  'the unlock reason is retained');
select extensions.is(
  (select actor_id from public.attendance_edit_lock_events where locked = false),
  'a9000000-0000-4000-8000-000000000001'::uuid, 'the unlock actor is retained');
select extensions.is(
  (select locked from public.list_attendance_edit_lock_history(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    order by sequence desc limit 1),
  false, 'lock history orders transitions by immutable sequence');
select extensions.is(
  (select reason from public.list_attendance_edit_lock_history(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    order by sequence desc limit 1),
  'Reopen after review', 'the latest lock history exposes the unlock reason');
select extensions.lives_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000008',
    '2024-01-10 08:30+00', '2024-01-10 08:45+00', 'Owner correction')$$,
  'a session can be corrected after authorized unlock');
select extensions.is(
  (select old_at from public.attendance_event_corrections
    where request_id = '59000000-0000-4000-8000-000000000008'),
  '2024-01-10 08:30+00'::timestamptz, 'subsequent corrections record the previous effective time');
select extensions.is(
  (select worked_seconds from public.list_worked_time(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where session_id = '29000000-0000-4000-8000-000000000001'),
  27000::numeric, 'worked time consistently uses the latest correction');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::integer from public.list_attendance_corrections(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')),
  7, 'the employee can see every correction to their own attendance');
select extensions.is(
  (select reason from public.list_attendance_corrections(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where id = current_setting('test.correction_id')::uuid),
  'Forgot to clock', 'the employee can see the correction reason');
select extensions.is(
  (select actor_id from public.list_attendance_corrections(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where id = current_setting('test.correction_id')::uuid),
  'a9000000-0000-4000-8000-000000000002'::uuid, 'the employee can see the correcting actor');
select extensions.is(
  (select original_at from public.list_attendance_corrections(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where id = current_setting('test.correction_id')::uuid),
  '2024-01-10 09:00+00'::timestamptz, 'the employee can see the original time');
select extensions.is(
  (select old_at from public.list_attendance_corrections(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    order by sequence desc limit 1),
  '2024-01-10 08:30+00'::timestamptz, 'correction history exposes the immutable audit order');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000005', true);
select extensions.is(
  (select count(*)::integer from public.attendance_event_corrections), 0,
  'a colleague cannot see another employee correction');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.attendance_event_corrections), 0,
  'a BOH manager cannot read FOH correction history');
select extensions.is(
  (select count(*)::integer from public.list_attendance_edit_lock_history(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')),
  0, 'a BOH manager cannot read FOH lock history');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000006', true);
select extensions.is(
  (select count(*)::integer from public.attendance_event_corrections), 0,
  'another business cannot read correction history');
select extensions.throws_ok(
  $$select * from public.list_attendance_edit_lock_history(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another business cannot list lock history');

reset role;
insert into public.departments (id, business_id, venue_id, name) values
  ('d9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001',
   'c9000000-0000-4000-8000-000000000002', 'Riverside FOH');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001',
   'c9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000003',
   'a9000000-0000-4000-8000-000000000005', 'Linked profile', 'Server');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('29000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001',
   'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001',
   'e9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000005'),
  ('29000000-0000-4000-8000-000000000005', 'b9000000-0000-4000-8000-000000000001',
   'c9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000003',
   'e9000000-0000-4000-8000-000000000003', 'a9000000-0000-4000-8000-000000000005');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id,
  request_id, event_type, occurred_at
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.event_type, f.occurred_at::timestamptz
from (values
  ('49000000-0000-4000-8000-000000000008', '29000000-0000-4000-8000-000000000004', 'clock_in', '2024-01-12 09:00:00.123456+00'),
  ('49000000-0000-4000-8000-000000000009', '29000000-0000-4000-8000-000000000004', 'clock_out', '2024-01-12 17:00:00+00'),
  ('49000000-0000-4000-8000-000000000010', '29000000-0000-4000-8000-000000000005', 'clock_in', '2024-01-10 17:15:00+00'),
  ('49000000-0000-4000-8000-000000000011', '29000000-0000-4000-8000-000000000005', 'clock_out', '2024-01-10 17:45:00+00')
) as f(id, session_id, event_type, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.correct_attendance_event(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000004', '49000000-0000-4000-8000-000000000008',
    '59000000-0000-4000-8000-000000000009', '2024-01-12 09:00:00.123456+00',
    '2024-01-12 08:59:59.654321+00', 'Microsecond correction')$$,
  'corrections accept microsecond precision');
select extensions.is(
  (select occurred_at from public.attendance_events where id = '49000000-0000-4000-8000-000000000008'),
  '2024-01-12 09:00:00.123456+00'::timestamptz, 'original microseconds remain unchanged');
select extensions.is(
  (select old_at from public.attendance_event_corrections where request_id = '59000000-0000-4000-8000-000000000009'),
  '2024-01-12 09:00:00.123456+00'::timestamptz, 'previous microseconds are retained in the audit');
select extensions.is(
  (select new_at from public.attendance_event_corrections where request_id = '59000000-0000-4000-8000-000000000009'),
  '2024-01-12 08:59:59.654321+00'::timestamptz, 'replacement microseconds are retained in the audit');
select extensions.is(
  (select worked_seconds from public.list_worked_time(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
    where session_id = '29000000-0000-4000-8000-000000000004'),
  28800.345679::numeric, 'worked time retains microsecond precision');
select public.link_shared_worker_profiles(
  'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
  'e9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000003');
select extensions.throws_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000004', '59000000-0000-4000-8000-000000000010',
    '2024-01-10 17:00+00', '2024-01-10 17:30+00', 'Cross-venue overlap')$$,
  'P0001', 'Corrected attendance overlaps another session',
  'a correction cannot overlap a linked worker session at another venue');
select extensions.lives_ok(
  $$select pg_temp.correct('49000000-0000-4000-8000-000000000004', '59000000-0000-4000-8000-000000000011',
    '2024-01-10 17:00+00', '2024-01-10 17:15+00', 'Cross-venue boundary')$$,
  'adjacent linked-worker sessions at different venues are allowed');

set local role service_role;
select extensions.throws_ok(
  $$select * from public.attendance_event_corrections$$, '42501', null,
  'the service role cannot read corrections directly');
reset role;
select extensions.throws_ok(
  $$update public.attendance_event_corrections set reason = 'Changed'$$,
  'P0001', 'Original attendance records are immutable', 'corrections are immutable for privileged updates');
select extensions.throws_ok(
  $$delete from public.attendance_edit_lock_events$$,
  'P0001', 'Original attendance records are immutable', 'lock history is immutable for privileged deletes');
select * from extensions.finish();
rollback;
