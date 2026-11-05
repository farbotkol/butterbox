begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(40);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa000000-0000-4000-8000-000000000001', 'mixed-owner@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000002', 'mixed-foh@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000003', 'mixed-boh@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000004', 'mixed-worker@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000005', 'mixed-colleague@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000006', 'mixed-outside@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000007', 'mixed-linked@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('ba000000-0000-4000-8000-000000000001', 'Mixed cafe'),
  ('ba000000-0000-4000-8000-000000000002', 'Other cafe');
insert into public.venues (
  id, business_id, name, timezone, clock_geofence_enabled,
  geofence_latitude, geofence_longitude, geofence_radius_meters
) values
  ('ca000000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-000000000001',
    'Main', 'UTC', true, 0, 0, 100),
  ('ca000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000002',
    'Outside', 'UTC', false, null, null, null),
  ('ca000000-0000-4000-8000-000000000003', 'ba000000-0000-4000-8000-000000000001',
    'Other venue', 'UTC', false, null, null, null);
insert into public.departments (id, business_id, venue_id, name) values
  ('da000000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'FOH'),
  ('da000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'BOH'),
  ('da000000-0000-4000-8000-000000000003', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000003', 'Other venue');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('ba000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('ba000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000002', 'foh_manager', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001'),
  ('ba000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000003', 'boh_manager', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000002'),
  ('ba000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'employee', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001'),
  ('ba000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000005', 'employee', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001'),
  ('ba000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000007', 'employee', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001'),
  ('ba000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('ea000000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'Worker', 'Server'),
  ('ea000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000005', 'Colleague', 'Server'),
  ('ea000000-0000-4000-8000-000000000003', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000007', 'Linked', 'Server'),
  ('ea000000-0000-4000-8000-000000000004', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000003', 'da000000-0000-4000-8000-000000000003', null, 'Linked elsewhere', 'Server');
insert into public.shared_workers (id, business_id, created_by) values
  ('6a000000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001');
insert into public.shared_worker_profiles (employee_id, business_id, venue_id, shared_worker_id) values
  ('ea000000-0000-4000-8000-000000000003', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001'),
  ('ea000000-0000-4000-8000-000000000004', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000003', '6a000000-0000-4000-8000-000000000001');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('2a000000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004'),
  ('2a000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000005'),
  ('2a000000-0000-4000-8000-000000000003', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000007'),
  ('2a000000-0000-4000-8000-000000000004', 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000003', 'da000000-0000-4000-8000-000000000003', 'ea000000-0000-4000-8000-000000000004', 'aa000000-0000-4000-8000-000000000005');
insert into public.attendance_breaks (id, session_id, business_id, classification) values
  ('3a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-000000000001', 'unpaid'),
  ('3a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000001', 'paid');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, break_id, occurred_at
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.event_type, f.break_id::uuid, f.occurred_at::timestamptz
from (values
  ('4a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'clock_in', null, '2024-01-10 09:00+00'),
  ('4a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000001', 'break_start', '3a000000-0000-4000-8000-000000000001', '2024-01-10 12:00+00'),
  ('4a000000-0000-4000-8000-000000000003', '2a000000-0000-4000-8000-000000000001', 'break_end', '3a000000-0000-4000-8000-000000000001', '2024-01-10 12:30+00'),
  ('4a000000-0000-4000-8000-000000000004', '2a000000-0000-4000-8000-000000000002', 'clock_in', null, '2024-01-10 09:00+00'),
  ('4a000000-0000-4000-8000-000000000005', '2a000000-0000-4000-8000-000000000002', 'break_start', '3a000000-0000-4000-8000-000000000002', '2024-01-10 12:00+00'),
  ('4a000000-0000-4000-8000-000000000006', '2a000000-0000-4000-8000-000000000003', 'clock_in', null, '2024-01-20 09:00+00'),
  ('4a000000-0000-4000-8000-000000000007', '2a000000-0000-4000-8000-000000000004', 'clock_in', null, '2024-01-20 10:00+00'),
  ('4a000000-0000-4000-8000-000000000008', '2a000000-0000-4000-8000-000000000004', 'clock_out', null, '2024-01-20 14:00+00')
) as f(id, session_id, event_type, break_id, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;
insert into public.attendance_offline_claims (
  id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, claimed_at
)
select f.id::uuid, 'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001', f.employee_id::uuid, f.actor_id::uuid,
  gen_random_uuid(), f.event_type, f.claimed_at::timestamptz
from (values
  ('1a000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'clock_out', '2024-01-10 17:00:00.654321+00'),
  ('1a000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'clock_out', '2024-01-10 11:00+00'),
  ('1a000000-0000-4000-8000-000000000003', 'ea000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'clock_out', '2024-01-10 09:00+00'),
  ('1a000000-0000-4000-8000-000000000004', 'ea000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'clock_out', '2099-01-10 17:00+00'),
  ('1a000000-0000-4000-8000-000000000005', 'ea000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'clock_in', '2024-01-10 08:00+00'),
  ('1a000000-0000-4000-8000-000000000006', 'ea000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000005', 'clock_out', '2024-01-10 17:00+00'),
  ('1a000000-0000-4000-8000-000000000007', 'ea000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000007', 'clock_out', '2024-01-20 17:00+00'),
  ('1a000000-0000-4000-8000-000000000008', 'ea000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'clock_in', '2024-01-12 09:00+00'),
  ('1a000000-0000-4000-8000-000000000009', 'ea000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'clock_out', '2024-01-12 17:00+00')
) as f(id, employee_id, actor_id, event_type, claimed_at);

create function pg_temp.complete(p_claim uuid, p_session uuid, p_request uuid, p_reason text, p_ack boolean)
returns uuid language sql as $$
  select public.complete_attendance_from_offline_claim(
    'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001',
    p_claim, p_session, p_request, p_reason, p_ack
  );
$$;

set local role anon;
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  '42501', null, 'anonymous users cannot complete attendance');
select extensions.throws_ok(
  $$select * from public.list_attendance_offline_open_sessions('ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous users cannot list open sessions');
set local role service_role;
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  '42501', null, 'service role cannot bypass user authorization');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claim not found or permission denied', 'employees cannot complete their own attendance');
select extensions.throws_ok(
  $$select * from public.list_attendance_offline_open_sessions('ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot list management candidates');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claim not found or permission denied', 'other department managers cannot complete attendance');
select extensions.is((select count(*)::integer from public.list_attendance_offline_open_sessions(
  'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001')), 0,
  'open-session candidates respect department scope');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000006', true);
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Permission denied', 'other tenants cannot complete attendance');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.list_attendance_offline_open_sessions(
  'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001')), 3,
  'manager sees only scoped open sessions');
select extensions.ok((select open_break from public.list_attendance_offline_open_sessions(
  'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001')
  where session_id = '2a000000-0000-4000-8000-000000000002'), 'open breaks are visible on candidates');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000002', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Matching open attendance session not found', 'claims cannot close another employee session');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000005', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Matching open attendance session not found', 'clock-in claims cannot close a session');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000003', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claimed clock-out time is invalid', 'clock-out must follow clock-in');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000004', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claimed clock-out time is invalid', 'future device time is rejected');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Server clock is earlier than the previous attendance event', 'clock-out cannot precede recorded break events');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000006', '2a000000-0000-4000-8000-000000000002', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'End the open break before clocking out', 'an open break cannot be silently closed');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000007', '2a000000-0000-4000-8000-000000000003', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claimed attendance overlaps another session', 'linked profiles at another venue cannot overlap');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', false)$$,
  'P0001', 'Invalid offline clock-out review', 'unverified time requires acknowledgement');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), ' ', true)$$,
  'P0001', 'Invalid offline clock-out review', 'an audit reason is required');

reset role;
insert into public.attendance_edit_lock_events (business_id, session_id, actor_id, request_id, locked, reason)
values ('ba000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001', gen_random_uuid(), true, 'Test lock');
set local role authenticated;
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Attendance edits are locked', 'edit locks prevent completing attendance');
reset role;
insert into public.attendance_edit_lock_events (business_id, session_id, actor_id, request_id, locked, reason)
values ('ba000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001', gen_random_uuid(), false, 'Test unlock');
set local role authenticated;
select set_config('butterbox.clock_location_payload', '{"status":"position","latitude":0,"longitude":0,"accuracy_meters":1}', true);
select extensions.lives_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
    '5a000000-0000-4000-8000-000000000001', 'Confirmed with worker', true)$$,
  'a scoped manager can complete the matching open session');
select extensions.is(
  pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
    '5a000000-0000-4000-8000-000000000001', 'Confirmed with worker', true),
  (select id from public.attendance_offline_claim_reviews where decision = 'completed'),
  'an identical retry returns the original review');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
    '5a000000-0000-4000-8000-000000000001', 'Different reason', true)$$,
  'P0001', 'Request identifier already used', 'a request cannot be reused with changed details');
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
    gen_random_uuid(), 'Again', true)$$,
  'P0001', 'Claim has already been reviewed', 'a claim cannot be completed twice');
select extensions.is((select occurred_at from public.attendance_events
  where session_id = '2a000000-0000-4000-8000-000000000001' and event_type = 'clock_out'),
  '2024-01-10 17:00:00.654321+00'::timestamptz, 'the exact device time is preserved');
select extensions.is((select source from public.attendance_events
  where session_id = '2a000000-0000-4000-8000-000000000001' and event_type = 'clock_in'),
  'server_clock', 'the original server clock-in remains unchanged');
select extensions.is((select source from public.attendance_events
  where session_id = '2a000000-0000-4000-8000-000000000001' and event_type = 'clock_out'),
  'offline_claim', 'the added clock-out retains offline provenance');
select extensions.is((select count(*)::integer from public.attendance_breaks
  where session_id = '2a000000-0000-4000-8000-000000000001' and classification = 'unpaid'),
  1, 'existing break classification remains unchanged');
select extensions.is((select unpaid_break_seconds from public.list_worked_time(
  'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001')
  where session_id = '2a000000-0000-4000-8000-000000000001'), 1800::numeric,
  'worked time retains the recorded unpaid break');
select extensions.ok((select exceptions @> array['offline_claim_unverified'] from public.list_worked_time(
  'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001')
  where session_id = '2a000000-0000-4000-8000-000000000001'), 'worked time flags the unverified clock-out');
select extensions.is((select reason from public.attendance_location_checks
  where event_id = (select event_id from public.attendance_offline_claim_reviews where decision = 'completed')),
  'not_provided', 'offline clock-out cannot inherit forged location evidence');
select extensions.is(current_setting('butterbox.clock_location_payload'),
  '{"status":"position","latitude":0,"longitude":0,"accuracy_meters":1}', 'prior location context is restored');
select extensions.is((select count(*)::integer from public.list_attendance_offline_open_sessions(
  'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001')), 2,
  'completed sessions disappear from open candidates');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.attendance_offline_claim_reviews where decision = 'completed'),
  1, 'the affected employee can see the attributed completion');
select extensions.is((select count(*)::integer from public.attendance_events
  where source = 'offline_claim' and event_type = 'clock_out'), 1, 'the employee can see offline provenance');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*)::integer from public.attendance_offline_claim_reviews where decision = 'completed'),
  0, 'another employee cannot see the completion');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
select public.review_attendance_offline_claim(
  'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'reopened', null, null, 'Recheck'
);
select extensions.throws_ok(
  $$select pg_temp.complete('1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
    gen_random_uuid(), 'Again', true)$$,
  'P0001', 'A claim was already linked to attendance', 'reopening cannot create another clock event');
select public.review_attendance_offline_claim(
  'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000009', gen_random_uuid(), 'matched',
  (select id from public.attendance_events where session_id = '2a000000-0000-4000-8000-000000000001' and event_type = 'clock_out'),
  '2024-01-10 17:00:00.654321+00', 'Previously linked'
);
select public.review_attendance_offline_claim(
  'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000009', gen_random_uuid(), 'reopened', null, null, 'Recheck'
);
select extensions.throws_ok(
  $$select public.create_attendance_from_offline_claims(
    'ba000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001',
    '1a000000-0000-4000-8000-000000000008', '1a000000-0000-4000-8000-000000000009',
    gen_random_uuid(), 'Create another session', true)$$,
  'P0001', 'A claim was already linked to attendance', 'reopening a matched claim cannot create duplicate attendance');
select extensions.is((select count(*)::integer from public.attendance_events
  where employee_id = 'ea000000-0000-4000-8000-000000000001' and event_type = 'clock_out'),
  1, 'a rejected duplicate leaves the original attendance unchanged');
reset role;
select extensions.throws_ok(
  $$update public.attendance_events set source = 'server_clock' where source = 'offline_claim'$$,
  'P0001', 'Original attendance records are immutable', 'offline clock-out provenance is immutable');

select * from extensions.finish();
rollback;
