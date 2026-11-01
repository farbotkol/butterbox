begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(63);

insert into auth.users (id, email, raw_user_meta_data) values
  ('ab000000-0000-4000-8000-000000000001', 'break-owner@example.test', '{}'::jsonb),
  ('ab000000-0000-4000-8000-000000000002', 'break-foh@example.test', '{}'::jsonb),
  ('ab000000-0000-4000-8000-000000000003', 'break-boh@example.test', '{}'::jsonb),
  ('ab000000-0000-4000-8000-000000000004', 'break-worker@example.test', '{}'::jsonb),
  ('ab000000-0000-4000-8000-000000000005', 'break-colleague@example.test', '{}'::jsonb),
  ('ab000000-0000-4000-8000-000000000006', 'break-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('bb000000-0000-4000-8000-000000000001', 'Break cafe'),
  ('bb000000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('cb000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'Main', 'UTC'),
  ('cb000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('db000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'FOH'),
  ('db000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('bb000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('bb000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', 'foh_manager', 'cb000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000003', 'boh_manager', 'cb000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000002'),
  ('bb000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000004', 'employee', 'cb000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000005', 'employee', 'cb000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('eb000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000004', 'Worker', 'Server'),
  ('eb000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000005', 'Colleague', 'Server');

insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
select f.id::uuid, 'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
  'db000000-0000-4000-8000-000000000001', e.id, e.auth_user_id
from (values
  ('2b000000-0000-4000-8000-000000000001', 1),
  ('2b000000-0000-4000-8000-000000000002', 1),
  ('2b000000-0000-4000-8000-000000000003', 2),
  ('2b000000-0000-4000-8000-000000000004', 2),
  ('2b000000-0000-4000-8000-000000000005', 2),
  ('2b000000-0000-4000-8000-000000000006', 2),
  ('2b000000-0000-4000-8000-000000000007', 2),
  ('2b000000-0000-4000-8000-000000000008', 2)
) f(id, employee_number)
join public.employees e on e.id = case when f.employee_number = 1
  then 'eb000000-0000-4000-8000-000000000001'::uuid
  else 'eb000000-0000-4000-8000-000000000002'::uuid end;
insert into public.attendance_breaks (id, session_id, business_id, classification) values
  ('3b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'unpaid'),
  ('3b000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000001', 'paid'),
  ('3b000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000003', 'bb000000-0000-4000-8000-000000000001', 'unpaid'),
  ('3b000000-0000-4000-8000-000000000004', '2b000000-0000-4000-8000-000000000003', 'bb000000-0000-4000-8000-000000000001', 'paid'),
  ('3b000000-0000-4000-8000-000000000005', '2b000000-0000-4000-8000-000000000004', 'bb000000-0000-4000-8000-000000000001', 'unpaid'),
  ('3b000000-0000-4000-8000-000000000006', '2b000000-0000-4000-8000-000000000005', 'bb000000-0000-4000-8000-000000000001', 'unpaid'),
  ('3b000000-0000-4000-8000-000000000007', '2b000000-0000-4000-8000-000000000006', 'bb000000-0000-4000-8000-000000000001', 'unpaid'),
  ('3b000000-0000-4000-8000-000000000008', '2b000000-0000-4000-8000-000000000007', 'bb000000-0000-4000-8000-000000000001', 'unpaid');
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, break_id, occurred_at
)
select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.kind, f.break_id::uuid, f.occurred_at::timestamptz
from (values
  ('2b000000-0000-4000-8000-000000000001', 'clock_in', null, '2024-01-10 09:00+00'),
  ('2b000000-0000-4000-8000-000000000001', 'break_start', '3b000000-0000-4000-8000-000000000001', '2024-01-10 12:00+00'),
  ('2b000000-0000-4000-8000-000000000002', 'clock_in', null, '2024-01-11 09:00+00'),
  ('2b000000-0000-4000-8000-000000000002', 'break_start', '3b000000-0000-4000-8000-000000000002', '2024-01-11 12:00+00'),
  ('2b000000-0000-4000-8000-000000000003', 'clock_in', null, '2024-01-12 09:00+00'),
  ('2b000000-0000-4000-8000-000000000003', 'break_start', '3b000000-0000-4000-8000-000000000003', '2024-01-12 12:00+00'),
  ('2b000000-0000-4000-8000-000000000003', 'break_start', '3b000000-0000-4000-8000-000000000004', '2024-01-12 12:15+00'),
  ('2b000000-0000-4000-8000-000000000003', 'break_end', '3b000000-0000-4000-8000-000000000004', '2024-01-12 12:45+00'),
  ('2b000000-0000-4000-8000-000000000004', 'clock_in', null, '2024-01-13 09:00+00'),
  ('2b000000-0000-4000-8000-000000000004', 'break_start', '3b000000-0000-4000-8000-000000000005', '2024-01-13 12:00+00'),
  ('2b000000-0000-4000-8000-000000000005', 'clock_in', null, '2024-01-14 09:00+00'),
  ('2b000000-0000-4000-8000-000000000005', 'break_start', '3b000000-0000-4000-8000-000000000006', '2024-01-14 12:00+00'),
  ('2b000000-0000-4000-8000-000000000006', 'clock_in', null, '2024-01-15 09:00+00'),
  ('2b000000-0000-4000-8000-000000000006', 'break_start', '3b000000-0000-4000-8000-000000000007', '2024-01-15 08:00+00'),
  ('2b000000-0000-4000-8000-000000000007', 'clock_in', null, '2024-01-16 09:00+00'),
  ('2b000000-0000-4000-8000-000000000007', 'break_start', '3b000000-0000-4000-8000-000000000008', '2024-01-16 12:00+00'),
  ('2b000000-0000-4000-8000-000000000008', 'clock_in', null, '2024-01-16 16:00+00'),
  ('2b000000-0000-4000-8000-000000000008', 'clock_out', null, '2024-01-16 20:00+00')
) f(session_id, kind, break_id, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;
insert into public.attendance_offline_claims (
  id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, claimed_at
)
select f.id::uuid, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.kind, f.claimed_at::timestamptz
from (values
  ('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'clock_out', '2024-01-10 17:00:00.654321+00'),
  ('1b000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000002', 'clock_out', '2024-01-11 17:00+00'),
  ('1b000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000003', 'clock_out', '2024-01-12 17:00+00'),
  ('1b000000-0000-4000-8000-000000000004', '2b000000-0000-4000-8000-000000000004', 'clock_out', '2024-01-13 17:00+00'),
  ('1b000000-0000-4000-8000-000000000005', '2b000000-0000-4000-8000-000000000005', 'clock_out', '2024-01-14 17:00+00'),
  ('1b000000-0000-4000-8000-000000000006', '2b000000-0000-4000-8000-000000000006', 'clock_out', '2024-01-15 17:00+00'),
  ('1b000000-0000-4000-8000-000000000007', '2b000000-0000-4000-8000-000000000007', 'clock_out', '2024-01-16 17:00+00'),
  ('1b000000-0000-4000-8000-000000000008', '2b000000-0000-4000-8000-000000000001', 'clock_in', '2024-01-10 08:00+00'),
  ('1b000000-0000-4000-8000-000000000009', '2b000000-0000-4000-8000-000000000001', 'clock_out', '2099-01-10 17:00+00')
) f(id, session_id, kind, claimed_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;
insert into public.attendance_edit_lock_events (business_id, session_id, actor_id, request_id, locked, reason)
values ('bb000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000004',
  'ab000000-0000-4000-8000-000000000001', gen_random_uuid(), true, 'Test lock');

create function pg_temp.resolve(
  p_claim uuid, p_session uuid, p_break uuid, p_request uuid, p_end timestamptz, p_reason text, p_ack boolean
) returns uuid language sql as $$
  select public.complete_attendance_with_offline_break(
    'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
    p_claim, p_session, p_break, p_request, p_end, p_reason, p_ack
  );
$$;

set local role anon;
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 12:30+00', 'Checked', true)$$,
  '42501', null, 'anonymous callers cannot resolve breaks');
select extensions.throws_ok(
  $$select * from public.list_attendance_offline_open_breaks('bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot list open breaks');
set local role service_role;
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 12:30+00', 'Checked', true)$$,
  '42501', null, 'service role cannot bypass user authorization');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 12:30+00', 'Checked', true)$$,
  'P0001', 'Claim not found or permission denied', 'employees cannot resolve their own breaks');
select extensions.throws_ok(
  $$select * from public.list_attendance_offline_open_breaks('bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot list management candidates');
select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.list_attendance_offline_open_breaks(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')), 0,
  'other departments cannot list open break candidates');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 12:30+00', 'Checked', true)$$,
  'P0001', 'Claim not found or permission denied', 'other department managers cannot resolve breaks');
select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000006', true);
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 12:30+00', 'Checked', true)$$,
  'P0001', 'Permission denied', 'another tenant cannot resolve breaks');
select extensions.throws_ok(
  $$select * from public.list_attendance_offline_break_resolutions('bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant cannot list resolution history');

select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.list_attendance_offline_open_breaks(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')), 7,
  'a scoped manager sees open breaks but not finished breaks');
select extensions.is((select classification from public.list_attendance_offline_open_breaks(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')
  where break_id = '3b000000-0000-4000-8000-000000000002'), 'paid', 'candidate classification is preserved');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 12:30+00', 'Checked', false)$$,
  'P0001', 'Invalid offline break resolution', 'unverified time requires acknowledgement');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 12:30+00', ' ', true)$$,
  'P0001', 'Invalid offline break resolution', 'a nonempty reason is required');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), 'infinity', 'Checked', true)$$,
  'P0001', 'Invalid offline break resolution', 'infinite reported times are rejected');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000003',
    '3b000000-0000-4000-8000-000000000003', gen_random_uuid(), '2024-01-12 12:30+00', 'Checked', true)$$,
  'P0001', 'Matching open attendance session not found', 'a claim cannot complete another worker session');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000002', gen_random_uuid(), '2024-01-10 12:30+00', 'Checked', true)$$,
  'P0001', 'Matching open break not found', 'a break must belong to the selected session');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000008', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 12:30+00', 'Checked', true)$$,
  'P0001', 'Matching open attendance session not found', 'clock-in claims cannot complete attendance');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 12:00+00', 'Checked', true)$$,
  'P0001', 'Reported break time is invalid', 'a break end must follow the start');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 18:00+00', 'Checked', true)$$,
  'P0001', 'Reported break time is invalid', 'a break cannot end after the claimed clock-out');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000009', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2099-01-10 12:30+00', 'Checked', true)$$,
  'P0001', 'Reported break time is invalid', 'a reported break end cannot be in the future');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000006', '2b000000-0000-4000-8000-000000000006',
    '3b000000-0000-4000-8000-000000000007', gen_random_uuid(), '2024-01-15 12:30+00', 'Checked', true)$$,
  'P0001', 'Reported break time is invalid', 'a break start cannot precede clock-in');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000003',
    '3b000000-0000-4000-8000-000000000003', gen_random_uuid(), '2024-01-12 12:30+00', 'Checked', true)$$,
  'P0001', 'Another break is open or overlaps', 'overlapping breaks are rejected');
reset role;
insert into public.attendance_breaks (id, session_id, business_id, classification) values
  ('3b000000-0000-4000-8000-000000000009', '2b000000-0000-4000-8000-000000000003',
    'bb000000-0000-4000-8000-000000000001', 'unpaid');
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, break_id, occurred_at
)
select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  'break_start', '3b000000-0000-4000-8000-000000000009', '2024-01-12 13:00+00'
from public.attendance_sessions s where s.id = '2b000000-0000-4000-8000-000000000003';
set local role authenticated;
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000003',
    '3b000000-0000-4000-8000-000000000003', gen_random_uuid(), '2024-01-12 12:10+00', 'Checked', true)$$,
  'P0001', 'Another break is open or overlaps', 'another open break is rejected even when it begins later');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000004', '2b000000-0000-4000-8000-000000000004',
    '3b000000-0000-4000-8000-000000000005', gen_random_uuid(), '2024-01-13 12:30+00', 'Checked', true)$$,
  'P0001', 'Attendance edits are locked', 'edit locks prevent break resolution');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000007', '2b000000-0000-4000-8000-000000000007',
    '3b000000-0000-4000-8000-000000000008', gen_random_uuid(), '2024-01-16 12:30+00', 'Checked', true)$$,
  'P0001', 'Claimed attendance overlaps another session', 'overlapping attendance rejects completion');
select extensions.is((select count(*)::integer from public.attendance_events
  where break_id = '3b000000-0000-4000-8000-000000000008' and event_type = 'break_end'), 0,
  'failed clock-out rolls back the proposed break end');

select public.review_attendance_offline_claim(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
  '1b000000-0000-4000-8000-000000000005', gen_random_uuid(), 'rejected', null, null, 'Already reviewed'
);
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000005', '2b000000-0000-4000-8000-000000000005',
    '3b000000-0000-4000-8000-000000000006', gen_random_uuid(), '2024-01-14 12:30+00', 'Checked', true)$$,
  'P0001', 'Claim has already been reviewed', 'reviewed claims cannot complete attendance');
select extensions.is((select count(*)::integer from public.attendance_events
  where break_id = '3b000000-0000-4000-8000-000000000006' and event_type = 'break_end'), 0,
  'a failed review rolls back the proposed break end');
select extensions.is((select count(*)::integer from public.attendance_offline_break_resolutions), 0,
  'failed resolutions leave no audit record');

select extensions.lives_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001',
    '2024-01-10 12:30:00.123456+00', 'Confirmed with employee', true)$$,
  'a scoped manager can resolve a break and complete attendance atomically');
select extensions.is(
  pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001',
    '2024-01-10 12:30:00.123456+00', 'Confirmed with employee', true),
  (select review_id from public.attendance_offline_break_resolutions
    where break_id = '3b000000-0000-4000-8000-000000000001'),
  'an identical retry returns the original review');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001',
    '2024-01-10 12:31+00', 'Confirmed with employee', true)$$,
  'P0001', 'Request identifier already used', 'a retry cannot change the reported time');
select extensions.throws_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
    '3b000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-01-10 12:30+00', 'Again', true)$$,
  'P0001', 'Matching open attendance session not found', 'another request cannot complete the session twice');
select extensions.is((select count(*)::integer from public.attendance_events
  where session_id = '2b000000-0000-4000-8000-000000000001' and event_type in ('break_end', 'clock_out')),
  2, 'exactly one break end and one clock-out are added');
select extensions.is((select occurred_at from public.attendance_events
  where break_id = '3b000000-0000-4000-8000-000000000001' and event_type = 'break_end'),
  '2024-01-10 12:30:00.123456+00'::timestamptz, 'the reported break end retains microseconds');
select extensions.is((select source from public.attendance_events
  where break_id = '3b000000-0000-4000-8000-000000000001' and event_type = 'break_end'),
  'manager_reported', 'the break end is not presented as a server clock');
select extensions.is((select source from public.attendance_events
  where session_id = '2b000000-0000-4000-8000-000000000001' and event_type = 'clock_out'),
  'offline_claim', 'the clock-out remains an unverified offline claim');
select extensions.is((select occurred_at from public.attendance_events
  where session_id = '2b000000-0000-4000-8000-000000000001' and event_type = 'clock_out'),
  '2024-01-10 17:00:00.654321+00'::timestamptz, 'the original claimed time retains microseconds');
select extensions.is((select claimed_at from public.attendance_offline_claims
  where id = '1b000000-0000-4000-8000-000000000001'),
  '2024-01-10 17:00:00.654321+00'::timestamptz, 'the original claim is retained');
select extensions.ok((select received_at > claimed_at from public.attendance_offline_claims
  where id = '1b000000-0000-4000-8000-000000000001'), 'the independent server receipt time is retained');
select extensions.is((select actor_id from public.attendance_offline_break_resolutions
  where break_id = '3b000000-0000-4000-8000-000000000001'),
  'ab000000-0000-4000-8000-000000000002'::uuid, 'the manager is attributed in the audit record');
select extensions.is((select reason from public.attendance_offline_break_resolutions
  where break_id = '3b000000-0000-4000-8000-000000000001'),
  'Confirmed with employee', 'the manager reason is retained');
select extensions.is((select classification from public.attendance_breaks
  where id = '3b000000-0000-4000-8000-000000000001'), 'unpaid', 'unpaid classification remains unchanged');
select extensions.is((select unpaid_break_seconds from public.list_worked_time(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')
  where session_id = '2b000000-0000-4000-8000-000000000001'), 1800.123456::numeric,
  'unpaid break duration retains microseconds');
select extensions.is((select paid_seconds from public.list_worked_time(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')
  where session_id = '2b000000-0000-4000-8000-000000000001'), 27000.530865::numeric,
  'unpaid break is excluded from paid time');
select extensions.ok((select exceptions @> array['offline_claim_unverified', 'manager_reported_break']
  from public.list_worked_time('bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')
  where session_id = '2b000000-0000-4000-8000-000000000001'), 'worked time flags both unverified sources');
select extensions.is((select count(*)::integer from public.list_attendance_offline_open_breaks(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')), 7,
  'resolved breaks disappear from candidates');
select extensions.is((select reason from public.list_attendance_offline_break_resolutions(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')
  where claim_id = '1b000000-0000-4000-8000-000000000001'), 'Confirmed with employee',
  'scoped managers can read the attributed resolution');

select extensions.lives_ok(
  $$select pg_temp.resolve('1b000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000002',
    '3b000000-0000-4000-8000-000000000002', gen_random_uuid(),
    '2024-01-11 12:20:00.000123+00', 'Paid break confirmed', true)$$,
  'a paid break can be resolved without changing its classification');
select extensions.is((select paid_break_seconds from public.list_worked_time(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')
  where session_id = '2b000000-0000-4000-8000-000000000002'), 1200.000123::numeric,
  'paid break duration retains microseconds');
select extensions.is((select paid_seconds from public.list_worked_time(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')
  where session_id = '2b000000-0000-4000-8000-000000000002'), 28800::numeric,
  'paid break remains included in paid time');
select public.correct_attendance_event(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
  '2b000000-0000-4000-8000-000000000001',
  (select id from public.attendance_events where break_id = '3b000000-0000-4000-8000-000000000001' and event_type = 'break_end'),
  gen_random_uuid(), '2024-01-10 12:30:00.123456+00', '2024-01-10 12:31+00', 'Later correction'
);
select extensions.ok((select exceptions @> array['offline_claim_unverified', 'manager_reported_break']
  from public.list_worked_time('bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')
  where session_id = '2b000000-0000-4000-8000-000000000001'), 'source warnings survive later corrections');
select extensions.is((select reported_end_at from public.list_attendance_offline_break_resolutions(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')
  where claim_id = '1b000000-0000-4000-8000-000000000001'),
  '2024-01-10 12:30:00.123456+00'::timestamptz, 'the original reported end remains in history after correction');

select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.list_attendance_offline_break_resolutions(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')), 2,
  'the affected employee can see their resolution history');
select extensions.is((select count(*)::integer from public.attendance_offline_break_resolutions), 2,
  'row security permits the affected employee to read their audit records');
select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*)::integer from public.attendance_offline_break_resolutions), 0,
  'another employee cannot see the audit records');
select extensions.is((select count(*)::integer from public.list_attendance_offline_break_resolutions(
  'bb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001')), 0,
  'another employee cannot list the resolution history');
select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.attendance_offline_break_resolutions), 0,
  'other department managers cannot read resolution records');
select extensions.ok(not has_function_privilege('authenticated',
  'public.list_worked_time_without_reported_break(uuid,uuid)', 'execute'),
  'the internal worked-time wrapper is inaccessible directly');
select extensions.ok(not has_function_privilege('authenticated',
  'public.list_worked_time_without_offline_source(uuid,uuid)', 'execute'),
  'the earlier worked-time wrapper remains inaccessible directly');
reset role;
select extensions.throws_ok(
  $$update public.attendance_offline_break_resolutions set reason = 'Changed'$$,
  'P0001', 'Original attendance records are immutable', 'audit records cannot be changed');
select extensions.throws_ok(
  $$delete from public.attendance_offline_break_resolutions$$,
  'P0001', 'Original attendance records are immutable', 'audit records cannot be deleted');
select extensions.throws_ok(
  $$update public.attendance_events set source = 'server_clock' where source = 'manager_reported'$$,
  'P0001', 'Original attendance records are immutable', 'manager-reported provenance cannot be overwritten');

select * from extensions.finish();
rollback;
