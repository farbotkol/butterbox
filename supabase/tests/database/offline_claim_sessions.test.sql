begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(47);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-4000-8000-000000000001', 'pair-owner@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000002', 'pair-foh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000003', 'pair-boh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000004', 'pair-worker@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000005', 'pair-colleague@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000006', 'pair-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b9000000-0000-4000-8000-000000000001', 'Offline cafe'),
  ('b9000000-0000-4000-8000-000000000002', 'Other cafe');
insert into public.venues (
  id, business_id, name, timezone, clock_geofence_enabled,
  geofence_latitude, geofence_longitude, geofence_radius_meters
) values
  ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001',
    'Main', 'UTC', true, 0, 0, 100),
  ('c9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000002',
    'Outside', 'UTC', false, null, null, null),
  ('c9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001',
    'Other venue', 'UTC', false, null, null, null);
insert into public.departments (id, business_id, venue_id, name) values
  ('d9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'FOH'),
  ('d9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'BOH'),
  ('d9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000003', 'Other venue');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'foh_manager', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000003', 'boh_manager', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004', 'employee', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000005', 'employee', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004', 'Worker', 'Server'),
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000005', 'Colleague', 'Server'),
  ('e9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000003', null, 'Linked profile', 'Server');
insert into public.shared_workers (id, business_id, created_by) values
  ('69000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001');
insert into public.shared_worker_profiles (employee_id, business_id, venue_id, shared_worker_id) values
  ('e9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', '69000000-0000-4000-8000-000000000001'),
  ('e9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000003', '69000000-0000-4000-8000-000000000001');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('29000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000003',
    'e9000000-0000-4000-8000-000000000003', 'a9000000-0000-4000-8000-000000000005');
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at
)
select '29000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001',
  'c9000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000003',
  'e9000000-0000-4000-8000-000000000003', 'a9000000-0000-4000-8000-000000000005',
  gen_random_uuid(), event_type, occurred_at::timestamptz
from (values ('clock_in', '2024-01-15 09:00+00'), ('clock_out', '2024-01-15 17:00+00')) as f(event_type, occurred_at);
insert into public.attendance_offline_claims (
  id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, claimed_at
)
select f.id::uuid, 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  case when f.colleague then 'e9000000-0000-4000-8000-000000000002'::uuid
    else 'e9000000-0000-4000-8000-000000000001'::uuid end,
  case when f.colleague then 'a9000000-0000-4000-8000-000000000005'::uuid
    else 'a9000000-0000-4000-8000-000000000004'::uuid end,
  gen_random_uuid(), f.event_type, f.claimed_at::timestamptz
from (values
  ('19000000-0000-4000-8000-000000000001', 'clock_in', '2024-01-10 09:00:00.123456+00', false),
  ('19000000-0000-4000-8000-000000000002', 'clock_out', '2024-01-10 17:00:00.654321+00', false),
  ('19000000-0000-4000-8000-000000000003', 'clock_in', '2024-01-10 08:00+00', false),
  ('19000000-0000-4000-8000-000000000004', 'clock_out', '2024-01-10 10:00+00', false),
  ('19000000-0000-4000-8000-000000000005', 'clock_in', '2024-01-11 12:00+00', false),
  ('19000000-0000-4000-8000-000000000006', 'clock_out', '2024-01-11 11:00+00', false),
  ('19000000-0000-4000-8000-000000000007', 'clock_in', '2099-01-01 09:00+00', false),
  ('19000000-0000-4000-8000-000000000008', 'clock_out', '2099-01-01 17:00+00', false),
  ('19000000-0000-4000-8000-000000000009', 'clock_out', '2024-01-12 17:00+00', true),
  ('19000000-0000-4000-8000-000000000010', 'clock_in', '2024-01-13 09:00+00', false),
  ('19000000-0000-4000-8000-000000000011', 'clock_out', '2024-01-13 17:00+00', false),
  ('19000000-0000-4000-8000-000000000012', 'clock_in', '2024-01-15 10:00+00', false),
  ('19000000-0000-4000-8000-000000000013', 'clock_out', '2024-01-15 11:00+00', false)
) as f(id, event_type, claimed_at, colleague);

create function pg_temp.pair(p_start uuid, p_end uuid, p_request uuid, p_reason text, p_ack boolean)
returns uuid language sql as $$
  select public.create_attendance_from_offline_claims(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    p_start, p_end, p_request, p_reason, p_ack
  );
$$;

set local role anon;
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002', gen_random_uuid(), 'Checked', true)$$,
  '42501', null, 'anonymous users cannot create attendance');
select extensions.throws_ok($$select * from public.attendance_offline_claim_sessions$$,
  '42501', null, 'anonymous users cannot view paired claims');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claims not found or permission denied', 'employees cannot create their own sessions');
select extensions.throws_ok(
  $$insert into public.attendance_offline_claim_sessions
    (business_id, actor_id, request_id, clock_in_claim_id, clock_out_claim_id, session_id, reason)
    values ('b9000000-0000-4000-8000-000000000001', auth.uid(), gen_random_uuid(),
      '19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002', gen_random_uuid(), 'Forged')$$,
  '42501', null, 'employees cannot forge pair history');
select extensions.throws_ok(
  $$select * from public.list_worked_time_without_offline_source(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'callers cannot bypass worked-time provenance');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claims not found or permission denied', 'other department managers cannot create attendance');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000006', true);
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Permission denied', 'other tenants cannot create attendance');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000009', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claims must belong to the same worker and department', 'different workers cannot be paired');
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000002', '19000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claims must belong to the same worker and department', 'clock event types cannot be reversed');
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000005', '19000000-0000-4000-8000-000000000006', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claimed clock times are invalid', 'clock-out must follow clock-in');
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000007', '19000000-0000-4000-8000-000000000008', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claimed clock times are invalid', 'future times are rejected');
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002', gen_random_uuid(), 'Checked', false)$$,
  'P0001', 'Invalid offline attendance pair', 'unverified times and missing breaks require acknowledgement');
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002', gen_random_uuid(), '  ', true)$$,
  'P0001', 'Invalid offline attendance pair', 'an audit reason is required');

select public.review_attendance_offline_claim(
  'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000010', gen_random_uuid(), 'rejected', null, null, 'Not confirmed'
);
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000010', '19000000-0000-4000-8000-000000000011', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'A claim has already been reviewed', 'reviewed claims cannot create attendance');

select set_config('butterbox.clock_location_payload', '{"status":"position","latitude":0,"longitude":0,"accuracy_meters":1}', true);
select extensions.lives_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002',
    '39000000-0000-4000-8000-000000000001', 'Confirmed with worker', true)$$,
  'scoped manager can create a finished session from two claims');
select extensions.is(
  pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002',
    '39000000-0000-4000-8000-000000000001', 'Confirmed with worker', true),
  (select session_id from public.attendance_offline_claim_sessions), 'an identical retry returns the original session');
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002',
    '39000000-0000-4000-8000-000000000001', 'Different reason', true)$$,
  'P0001', 'Request identifier already used', 'request identifiers cannot be reused with changed details');
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002',
    gen_random_uuid(), 'Checked again', true)$$,
  'P0001', 'A claim already created attendance', 'claims cannot create a second session');
select extensions.is((select count(*)::integer from public.attendance_offline_claim_sessions), 1, 'one pair record exists');
select extensions.is((select count(*)::integer from public.attendance_events), 2, 'exactly two clock events were created');
select extensions.is((select count(*)::integer from public.attendance_events where source = 'offline_claim'
  and verification_status = 'unverified'), 2, 'both events retain unverified offline provenance');
select extensions.is((select occurred_at from public.attendance_events where event_type = 'clock_in'),
  '2024-01-10 09:00:00.123456+00'::timestamptz, 'clock-in retains the exact device timestamp');
select extensions.is((select occurred_at from public.attendance_events where event_type = 'clock_out'),
  '2024-01-10 17:00:00.654321+00'::timestamptz, 'clock-out retains the exact device timestamp');
select extensions.is((select count(*)::integer from public.attendance_breaks), 0, 'no breaks are fabricated or deducted');
select extensions.is((select count(*)::integer from public.attendance_offline_claim_reviews where decision = 'created'),
  2, 'each claim has an attributed creation decision');
select extensions.is((select actor_id from public.attendance_offline_claim_sessions),
  'a9000000-0000-4000-8000-000000000002'::uuid, 'the manager is attributed as creator');
select extensions.is((select count(*)::integer from public.attendance_location_checks
  where verification_status = 'review' and reason = 'not_provided'), 2, 'offline events do not inherit forged location evidence');
select extensions.is(current_setting('butterbox.clock_location_payload'),
  '{"status":"position","latitude":0,"longitude":0,"accuracy_meters":1}', 'prior location context is restored');
select extensions.ok((select received_at >= claimed_at from public.attendance_offline_claims
  where id = '19000000-0000-4000-8000-000000000001'), 'server receipt and claimed time remain available');
select extensions.ok((select exceptions @> array['offline_claim_unverified'] from public.list_worked_time(
  'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')),
  'worked time prominently flags unverified offline provenance');
select extensions.is((select unpaid_break_seconds from public.list_worked_time(
  'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')),
  0::numeric, 'no unpaid break is silently deducted');
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000003', '19000000-0000-4000-8000-000000000004', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claimed attendance overlaps another session', 'overlapping attendance is rejected');
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000012', '19000000-0000-4000-8000-000000000013', gen_random_uuid(), 'Checked', true)$$,
  'P0001', 'Claimed attendance overlaps another session', 'a linked profile at another venue cannot overlap');
select extensions.lives_ok(
  $$select public.correct_attendance_event(
    'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    (select session_id from public.attendance_offline_claim_sessions),
    (select id from public.attendance_events where event_type = 'clock_in'), gen_random_uuid(),
    '2024-01-10 09:00:00.123456+00', '2024-01-10 08:50+00', 'Confirmed adjustment')$$,
  'an offline-sourced event can be corrected through the existing audit workflow');
select extensions.ok((select exceptions @> array['offline_claim_unverified'] from public.list_worked_time(
  'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001')),
  'correction does not erase the offline provenance warning');
select extensions.is((select occurred_at from public.attendance_events where event_type = 'clock_in'),
  '2024-01-10 09:00:00.123456+00'::timestamptz, 'correction does not overwrite the original claimed event time');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.attendance_offline_claim_sessions), 1,
  'the affected employee can see the pair');
select extensions.is((select count(*)::integer from public.attendance_events where source = 'offline_claim'), 2,
  'the affected employee can see event provenance');
select extensions.is((select count(*)::integer from public.attendance_offline_claim_reviews where decision = 'created'), 2,
  'the affected employee can see both creation decisions');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*)::integer from public.attendance_offline_claim_sessions), 0,
  'another employee cannot see the pair');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.attendance_offline_claim_sessions), 0,
  'another department cannot see the pair');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000006', true);
select extensions.is((select count(*)::integer from public.attendance_offline_claim_sessions), 0,
  'another tenant cannot see the pair');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);
select public.review_attendance_offline_claim(
  'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000001', gen_random_uuid(), 'reopened', null, null, 'Further review'
);
select extensions.throws_ok(
  $$select pg_temp.pair('19000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002',
    gen_random_uuid(), 'Checked again', true)$$,
  'P0001', 'A claim already created attendance', 'reopening does not allow duplicate sessions');
select extensions.is((select count(*)::integer from public.attendance_events where source = 'offline_claim'), 2,
  'reopening does not erase original events');
reset role;
select extensions.is((select count(*)::integer from public.attendance_events where source = 'server_clock'), 2,
  'existing server-clock events retain their original source');
select extensions.throws_ok(
  $$update public.attendance_offline_claim_sessions set reason = 'Altered'$$,
  'P0001', 'Original attendance records are immutable', 'pair history is immutable');
select extensions.throws_ok(
  $$update public.attendance_events set source = 'server_clock' where source = 'offline_claim'$$,
  'P0001', 'Original attendance records are immutable', 'offline source cannot be overwritten');

select * from extensions.finish();
rollback;
