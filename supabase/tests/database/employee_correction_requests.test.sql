begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(53);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-4000-8000-000000000001', 'request-owner@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000002', 'request-foh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000003', 'request-boh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000004', 'request-worker@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000005', 'request-colleague@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000006', 'request-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b9000000-0000-4000-8000-000000000001', 'Request cafe'),
  ('b9000000-0000-4000-8000-000000000002', 'Other cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'Main', 'Australia/Melbourne'),
  ('c9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000002', 'Other', 'UTC');
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
  ('e9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004', 'Worker', 'Server'),
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000005', 'Colleague', 'Server');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('29000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004'),
  ('29000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.event_type, f.occurred_at::timestamptz
from (values
  ('49000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'clock_in', '2024-01-10 09:00+00'),
  ('49000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-000000000001', 'clock_out', '2024-01-10 17:00+00'),
  ('49000000-0000-4000-8000-000000000003', '29000000-0000-4000-8000-000000000002', 'clock_in', '2024-01-11 09:00+00')
) as f(id, session_id, event_type, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;

create function pg_temp.submit_request(p_id uuid, p_type text, p_time timestamptz, p_reason text)
returns uuid language sql as $$
  select claim_id from public.submit_attendance_correction_request(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001',
    'a9000000-0000-4000-8000-000000000004', p_id, p_type, p_time, p_reason
  );
$$;
create function pg_temp.review_request(
  p_claim uuid, p_id uuid, p_decision text, p_event uuid, p_old timestamptz, p_reason text
)
returns uuid language sql as $$
  select public.review_attendance_offline_claim(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    p_claim, p_id, p_decision, p_event, p_old, p_reason
  );
$$;
create function pg_temp.claim(p_request uuid)
returns uuid language sql as $$
  select id from public.attendance_offline_claims where request_id = p_request;
$$;

set local role anon;
select extensions.throws_ok(
  $$select pg_temp.submit_request(gen_random_uuid(), 'clock_in', '2024-01-10 09:00+00', 'Forgot')$$,
  '42501', null, 'anonymous users cannot submit requests');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select * from public.submit_attendance_claim(
    null, null, null, null, null, null, null, null, 'employee_request', 'Forged')$$,
  '42501', null, 'the shared claim helper is not publicly callable');
select extensions.throws_ok(
  $$select pg_temp.submit_request(gen_random_uuid(), 'clock_in', 'infinity', 'Forgot')$$,
  'P0001', 'Invalid attendance correction request', 'infinite proposed times are rejected');
select extensions.throws_ok(
  $$select pg_temp.submit_request(gen_random_uuid(), 'clock_in', clock_timestamp() + interval '1 day', 'Forgot')$$,
  'P0001', 'Invalid attendance correction request', 'future proposed times are rejected');
select extensions.throws_ok(
  $$select pg_temp.submit_request(gen_random_uuid(), 'clock_in', '2024-01-10 09:00+00', '  ')$$,
  'P0001', 'Invalid attendance correction request', 'a nonblank explanation is required');
select extensions.throws_ok(
  $$select pg_temp.submit_request(gen_random_uuid(), 'clock_in', '2024-01-10 09:00+00', repeat('x', 501))$$,
  'P0001', 'Invalid attendance correction request', 'request reasons are limited to 500 characters');
select extensions.throws_ok(
  $$select pg_temp.submit_request(gen_random_uuid(), 'break_start', '2024-01-10 09:00+00', 'Forgot')$$,
  'P0001', 'Invalid attendance correction request', 'only clock-in and clock-out may be requested');
select extensions.throws_ok(
  $$select * from public.submit_attendance_correction_request(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002',
    'a9000000-0000-4000-8000-000000000004', gen_random_uuid(), 'clock_in', '2024-01-10 09:00+00', 'Forged')$$,
  'P0001', 'Employee not found or permission denied', 'a worker cannot request changes for a colleague');
select extensions.throws_ok(
  $$select * from public.submit_attendance_correction_request(
    'b9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000002',
    'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001',
    'a9000000-0000-4000-8000-000000000004', gen_random_uuid(), 'clock_in', '2024-01-10 09:00+00', 'Forged')$$,
  'P0001', 'Permission denied', 'a worker cannot submit into another tenant');
select extensions.throws_ok(
  $$select * from public.submit_attendance_correction_request(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    'd9000000-0000-4000-8000-000000000002', 'e9000000-0000-4000-8000-000000000001',
    'a9000000-0000-4000-8000-000000000004', gen_random_uuid(), 'clock_in', '2024-01-10 09:00+00', 'Forged')$$,
  'P0001', 'Employee not found or permission denied', 'a worker cannot request another department');
select extensions.throws_ok(
  $$select * from public.submit_attendance_correction_request(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001',
    'a9000000-0000-4000-8000-000000000005', gen_random_uuid(), 'clock_in', '2024-01-10 09:00+00', 'Forged')$$,
  'P0001', 'Permission denied', 'a worker cannot impersonate another actor');

select extensions.lives_ok(
  $$select pg_temp.submit_request('19000000-0000-4000-8000-000000000001',
    'clock_in', '2024-01-10 08:55:00.123456+00', ' Forgot to clock in ')$$,
  'an employee can submit an explained proposed time');
select extensions.is(
  (select claimed_at from public.attendance_offline_claims
    where request_id = '19000000-0000-4000-8000-000000000001'),
  '2024-01-10 08:55:00.123456+00'::timestamptz, 'the proposed timestamp retains microseconds');
select extensions.is(
  (select request_reason from public.attendance_offline_claims
    where request_id = '19000000-0000-4000-8000-000000000001'),
  'Forgot to clock in', 'the employee reason is retained');
select extensions.is(
  (select claim_source from public.attendance_offline_claims
    where request_id = '19000000-0000-4000-8000-000000000001'),
  'employee_request', 'an online correction request is not represented as an offline clock');
select extensions.ok(
  (select received_at >= statement_timestamp() - interval '1 minute'
    and received_at <= clock_timestamp()
    from public.attendance_offline_claims where request_id = '19000000-0000-4000-8000-000000000001'),
  'the server records the request receipt time');
select set_config('test.correction_claim_id',
  pg_temp.claim('19000000-0000-4000-8000-000000000001')::text, true);
select extensions.is(
  pg_temp.submit_request('19000000-0000-4000-8000-000000000001',
    'clock_in', '2024-01-10 08:55:00.123456+00', 'Forgot to clock in'),
  pg_temp.claim('19000000-0000-4000-8000-000000000001'), 'identical retries return the same request');
select extensions.throws_ok(
  $$select pg_temp.submit_request('19000000-0000-4000-8000-000000000001',
    'clock_in', '2024-01-10 08:55:00.123456+00', 'Different reason')$$,
  'P0001', 'Request identifier already used', 'a retry cannot replace the original explanation');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001',
    'a9000000-0000-4000-8000-000000000004', '19000000-0000-4000-8000-000000000001',
    'clock_in', '2024-01-10 08:55:00.123456+00')$$,
  'P0001', 'Request identifier already used', 'an offline retry cannot relabel a correction request');
select extensions.is((select count(*) from public.attendance_events), 3::bigint,
  'submitting a request does not create or alter clock events');
select extensions.throws_ok(
  $$select pg_temp.review_request(pg_temp.claim('19000000-0000-4000-8000-000000000001'),
    gen_random_uuid(), 'rejected', null, null, 'No')$$,
  'P0001', 'Claim not found or permission denied', 'an employee cannot decide their own request');

select pg_temp.submit_request('19000000-0000-4000-8000-000000000002',
  'clock_out', '2024-01-11 17:00+00', 'Forgot to clock out');
select pg_temp.submit_request('19000000-0000-4000-8000-000000000003',
  'clock_out', '2024-01-10 17:05+00', 'Another proposed clock-out');
select pg_temp.submit_request('19000000-0000-4000-8000-000000000004',
  'clock_in', '2024-01-09 08:55+00', 'Missed the start');
select pg_temp.submit_request('19000000-0000-4000-8000-000000000006',
  'clock_in', '2024-01-10 08:30+00', 'Earlier start');
select pg_temp.submit_request('19000000-0000-4000-8000-000000000007',
  'clock_out', '2024-01-10 17:00+00', 'Check the recorded finish');
select * from public.submit_attendance_offline_claim(
  'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000004', '19000000-0000-4000-8000-000000000005',
  'clock_out', '2024-01-09 17:05+00');
select extensions.throws_ok(
  $$select pg_temp.submit_request('19000000-0000-4000-8000-000000000005',
    'clock_out', '2024-01-09 17:05+00', 'Later explanation')$$,
  'P0001', 'Request identifier already used', 'an existing offline clock cannot be relabelled as a request');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*) from public.attendance_offline_claims), 0::bigint,
  'another employee cannot read the requests');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.attendance_offline_claims), 0::bigint,
  'a BOH manager cannot read FOH requests');
select extensions.throws_ok(
  $$select pg_temp.review_request(current_setting('test.correction_claim_id')::uuid,
    gen_random_uuid(), 'rejected', null, null, 'No')$$,
  'P0001', 'Claim not found or permission denied', 'out-of-scope managers cannot decide requests');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000006', true);
select extensions.is((select count(*) from public.attendance_offline_claims), 0::bigint,
  'another tenant cannot read the requests');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from public.list_attendance_offline_claims(
  'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')
  where claim_source = 'employee_request'), 6::bigint, 'the scoped manager can list employee requests');
select extensions.throws_ok(
  $$select pg_temp.review_request(pg_temp.claim('19000000-0000-4000-8000-000000000001'),
    gen_random_uuid(), 'matched', '49000000-0000-4000-8000-000000000001', '2024-01-10 09:00+00', 'Approved')$$,
  'P0001', 'The event does not match the requested time',
  'a manager cannot approve a different recorded time without correcting it');
select extensions.lives_ok(
  $$select pg_temp.review_request(pg_temp.claim('19000000-0000-4000-8000-000000000001'),
    '59000000-0000-4000-8000-000000000001', 'corrected',
    '49000000-0000-4000-8000-000000000001', '2024-01-10 09:00+00', 'Confirmed with employee')$$,
  'a scoped manager can approve and apply the requested correction');
select extensions.is(
  (select occurred_at from public.attendance_events where id = '49000000-0000-4000-8000-000000000001'),
  '2024-01-10 09:00+00'::timestamptz, 'approval leaves the original event unchanged');
select extensions.is(
  (select new_at from public.attendance_event_corrections where event_id = '49000000-0000-4000-8000-000000000001'),
  '2024-01-10 08:55:00.123456+00'::timestamptz, 'approval records the requested effective time');
select extensions.is(
  (select reason from public.attendance_offline_claim_reviews
    where claim_id = pg_temp.claim('19000000-0000-4000-8000-000000000001')),
  'Confirmed with employee', 'the manager approval explanation is auditable');
select extensions.ok(
  (select exceptions @> array['employee_request_unverified']::text[]
    from public.list_worked_time('b9000000-0000-4000-8000-000000000001',
      'c9000000-0000-4000-8000-000000000001')
    where session_id = '29000000-0000-4000-8000-000000000001'),
  'an employee-requested correction is flagged in work time');
select extensions.ok(
  (select exceptions @> array['employee_request_unverified']::text[]
    from public.list_weekly_worked_time('b9000000-0000-4000-8000-000000000001',
      'c9000000-0000-4000-8000-000000000001', '2024-01-08', null)
    where session_id = '29000000-0000-4000-8000-000000000001'),
  'an employee-requested correction is flagged in weekly review');
select extensions.is(
  pg_temp.review_request(pg_temp.claim('19000000-0000-4000-8000-000000000001'),
    '59000000-0000-4000-8000-000000000001', 'corrected',
    '49000000-0000-4000-8000-000000000001', '2024-01-10 09:00+00', 'Confirmed with employee'),
  (select id from public.attendance_offline_claim_reviews
    where claim_id = pg_temp.claim('19000000-0000-4000-8000-000000000001')),
  'repeating an approval returns its original decision');
select extensions.throws_ok(
  $$select pg_temp.review_request(pg_temp.claim('19000000-0000-4000-8000-000000000006'),
    gen_random_uuid(), 'corrected', '49000000-0000-4000-8000-000000000001', '2024-01-10 09:00+00', 'Stale')$$,
  'P0001', 'Attendance changed; refresh before reconciling', 'a stale original time cannot be approved');
select extensions.lives_ok(
  $$select pg_temp.review_request(pg_temp.claim('19000000-0000-4000-8000-000000000007'),
    gen_random_uuid(), 'matched', '49000000-0000-4000-8000-000000000002', '2024-01-10 17:00+00', 'Already correct')$$,
  'a manager can approve without a correction when the time already matches');
select extensions.lives_ok(
  $$select public.correct_attendance_event(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001', '49000000-0000-4000-8000-000000000001',
    gen_random_uuid(), '2024-01-10 08:55:00.123456+00', '2024-01-10 08:50+00', 'Later manager correction')$$,
  'a later manager correction can supersede an employee-requested time');
select extensions.ok(
  (select not exceptions @> array['employee_request_unverified']::text[]
    from public.list_worked_time('b9000000-0000-4000-8000-000000000001',
      'c9000000-0000-4000-8000-000000000001')
    where session_id = '29000000-0000-4000-8000-000000000001'),
  'a superseded request is not attributed as the current effective time');
select extensions.lives_ok(
  $$select public.set_attendance_edit_lock(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001', gen_random_uuid(), true, 'Reviewed')$$,
  'a manager can lock the finished session');
select extensions.throws_ok(
  $$select pg_temp.review_request(pg_temp.claim('19000000-0000-4000-8000-000000000006'),
    gen_random_uuid(), 'corrected', '49000000-0000-4000-8000-000000000001',
    '2024-01-10 08:50+00', 'Locked')$$,
  'P0001', 'Attendance edits are locked', 'an approved request cannot bypass an edit lock');
select extensions.lives_ok(
  $$select pg_temp.review_request(pg_temp.claim('19000000-0000-4000-8000-000000000003'),
    '59000000-0000-4000-8000-000000000003', 'rejected', null, null, 'Already clocked out')$$,
  'a scoped manager can reject a request with an explanation');
select extensions.is(
  (select reason from public.attendance_offline_claim_reviews
    where claim_id = pg_temp.claim('19000000-0000-4000-8000-000000000003')),
  'Already clocked out', 'the rejection explanation is retained');

select extensions.lives_ok(
  $$select public.create_attendance_from_offline_claims(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    pg_temp.claim('19000000-0000-4000-8000-000000000004'),
    pg_temp.claim('19000000-0000-4000-8000-000000000005'),
    '59000000-0000-4000-8000-000000000004', 'Checked both times', true)$$,
  'a manager can create attendance from a request and matching offline claim');
select extensions.is(
  (select string_agg(e.source, ',' order by e.event_type)
    from public.attendance_offline_claim_sessions p
    join public.attendance_events e on e.session_id = p.session_id
    where p.request_id = '59000000-0000-4000-8000-000000000004'),
  'employee_request,offline_claim', 'each created clock preserves its own true source');
select extensions.ok(
  (select exceptions @> array['employee_request_unverified', 'offline_claim_unverified']::text[]
    from public.list_worked_time('b9000000-0000-4000-8000-000000000001',
      'c9000000-0000-4000-8000-000000000001')
    where session_id = (select session_id from public.attendance_offline_claim_sessions
      where request_id = '59000000-0000-4000-8000-000000000004')),
  'work-time calculations flag both unverified sources');
select extensions.lives_ok(
  $$select public.complete_attendance_from_offline_claim(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    pg_temp.claim('19000000-0000-4000-8000-000000000002'), '29000000-0000-4000-8000-000000000002',
    '59000000-0000-4000-8000-000000000002', 'Confirmed clock-out', true)$$,
  'a manager can complete an open session from an employee request');
select extensions.is(
  (select source from public.attendance_events
    where session_id = '29000000-0000-4000-8000-000000000002' and event_type = 'clock_out'),
  'employee_request', 'the completed clock-out is not mislabeled as offline');
select extensions.is(
  (select occurred_at from public.attendance_events where id = '49000000-0000-4000-8000-000000000003'),
  '2024-01-11 09:00+00'::timestamptz, 'completing a session preserves the original clock-in');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select decision from public.attendance_offline_claim_reviews
    where claim_id = pg_temp.claim('19000000-0000-4000-8000-000000000003')),
  'rejected', 'the employee can see the manager decision');
select extensions.is(
  (select reason from public.attendance_offline_claim_reviews
    where claim_id = pg_temp.claim('19000000-0000-4000-8000-000000000003')),
  'Already clocked out', 'the employee can see the rejection explanation');
reset role;
select extensions.throws_ok(
  $$update public.attendance_offline_claims set request_reason = 'Changed'
    where request_id = '19000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Original attendance records are immutable', 'submitted requests remain immutable');
select extensions.throws_ok(
  $$delete from public.attendance_offline_claim_reviews where request_id = '59000000-0000-4000-8000-000000000003'$$,
  'P0001', 'Original attendance records are immutable', 'manager decisions remain immutable');

select * from extensions.finish();
rollback;
