begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a6a00000-0000-4000-8000-000000000001', 'history-owner@example.test', '{}'::jsonb),
  ('a6a00000-0000-4000-8000-000000000002', 'history-worker@example.test', '{}'::jsonb),
  ('a6a00000-0000-4000-8000-000000000003', 'history-colleague@example.test', '{}'::jsonb),
  ('a6a00000-0000-4000-8000-000000000004', 'history-manager@example.test', '{}'::jsonb),
  ('a6a00000-0000-4000-8000-000000000005', 'history-outsider@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b6a00000-0000-4000-8000-000000000001', 'History cafe'),
  ('b6a00000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c6a00000-0000-4000-8000-000000000001', 'b6a00000-0000-4000-8000-000000000001', 'Harbour', 'Australia/Sydney'),
  ('c6a00000-0000-4000-8000-000000000002', 'b6a00000-0000-4000-8000-000000000001', 'Other venue', 'UTC'),
  ('c6a00000-0000-4000-8000-000000000003', 'b6a00000-0000-4000-8000-000000000002', 'Outside', 'UTC');
select extensions.is(
  (select clock_geofence_enabled from public.venues where id = 'c6a00000-0000-4000-8000-000000000001'),
  false, 'clock location verification is disabled by default');
select extensions.is(
  (select count(*)::integer from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance_location_checks'
      and column_name in ('latitude', 'longitude', 'geofence_latitude', 'geofence_longitude')),
  0, 'location checks do not store raw device coordinates');
update public.venues set geofence_latitude = -33.8688, geofence_longitude = 151.2093,
  geofence_radius_meters = 100, clock_geofence_enabled = true
where id = 'c6a00000-0000-4000-8000-000000000001';
insert into public.departments (id, business_id, venue_id, name) values
  ('d6a00000-0000-4000-8000-000000000001', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'FOH'),
  ('d6a00000-0000-4000-8000-000000000002', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000002', 'Other'),
  ('d6a00000-0000-4000-8000-000000000003', 'b6a00000-0000-4000-8000-000000000002', 'c6a00000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000002', 'employee', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001'),
  ('b6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000003', 'employee', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001'),
  ('b6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000004', 'foh_manager', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001'),
  ('b6a00000-0000-4000-8000-000000000002', 'a6a00000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e6a00000-0000-4000-8000-000000000001', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000002', 'Worker', 'Server'),
  ('e6a00000-0000-4000-8000-000000000002', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000003', 'Colleague', 'Server'),
  ('e6a00000-0000-4000-8000-000000000003', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000004', 'Manager', 'Supervisor');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('16a00000-0000-4000-8000-000000000001', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'e6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000002'),
  ('16a00000-0000-4000-8000-000000000002', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'e6a00000-0000-4000-8000-000000000002', 'a6a00000-0000-4000-8000-000000000003'),
  ('16a00000-0000-4000-8000-000000000003', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'e6a00000-0000-4000-8000-000000000003', 'a6a00000-0000-4000-8000-000000000004');
insert into public.attendance_breaks (id, session_id, business_id, classification) values
  ('26a00000-0000-4000-8000-000000000001', '16a00000-0000-4000-8000-000000000001', 'b6a00000-0000-4000-8000-000000000001', 'unpaid');
select set_config('butterbox.clock_location_payload',
  '{"status":"position","latitude":-33.8688,"longitude":151.2093,"accuracy_meters":5}', true);
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id,
  event_type, break_id, occurred_at, source
) values
  ('36a00000-0000-4000-8000-000000000001', '16a00000-0000-4000-8000-000000000001', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'e6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000002', '46a00000-0000-4000-8000-000000000001', 'clock_in', null, '2024-01-01 09:05+00', 'server_clock');
select set_config('butterbox.clock_location_payload', '{"status":"permission_denied"}', true);
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id,
  event_type, break_id, occurred_at, source
) values
  ('36a00000-0000-4000-8000-000000000002', '16a00000-0000-4000-8000-000000000001', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'e6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000002', '46a00000-0000-4000-8000-000000000002', 'break_start', '26a00000-0000-4000-8000-000000000001', '2024-01-01 12:00+00', 'server_clock'),
  ('36a00000-0000-4000-8000-000000000003', '16a00000-0000-4000-8000-000000000001', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'e6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000002', '46a00000-0000-4000-8000-000000000003', 'break_end', '26a00000-0000-4000-8000-000000000001', '2024-01-01 12:30+00', 'manager_reported'),
  ('36a00000-0000-4000-8000-000000000004', '16a00000-0000-4000-8000-000000000001', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'e6a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000002', '46a00000-0000-4000-8000-000000000004', 'clock_out', null, '2024-01-01 17:00+00', 'server_clock'),
  ('36a00000-0000-4000-8000-000000000005', '16a00000-0000-4000-8000-000000000002', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'e6a00000-0000-4000-8000-000000000002', 'a6a00000-0000-4000-8000-000000000003', '46a00000-0000-4000-8000-000000000005', 'clock_in', null, '2024-01-02 09:00+00', 'server_clock'),
  ('36a00000-0000-4000-8000-000000000006', '16a00000-0000-4000-8000-000000000003', 'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001', 'd6a00000-0000-4000-8000-000000000001', 'e6a00000-0000-4000-8000-000000000003', 'a6a00000-0000-4000-8000-000000000004', '46a00000-0000-4000-8000-000000000006', 'clock_in', null, '2024-01-03 09:00+00', 'offline_claim');
insert into public.attendance_event_corrections (
  business_id, session_id, event_id, actor_id, request_id, old_at, new_at, reason
) values (
  'b6a00000-0000-4000-8000-000000000001', '16a00000-0000-4000-8000-000000000001',
  '36a00000-0000-4000-8000-000000000001', 'a6a00000-0000-4000-8000-000000000004',
  '56a00000-0000-4000-8000-000000000001', '2024-01-01 09:05+00', '2024-01-01 09:00+00', 'Clock was late'
);
insert into public.attendance_location_reviews (check_id, session_id, business_id, actor_id)
select id, session_id, business_id, 'a6a00000-0000-4000-8000-000000000004'::uuid
from public.attendance_location_checks where event_id = '36a00000-0000-4000-8000-000000000004';
set local role anon;
select extensions.throws_ok(
  $$select * from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot inspect personal attendance');
reset role;
set local role service_role;
select extensions.throws_ok(
  $$select * from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')$$,
  '42501', null, 'service-role callers cannot use a personal history without a user');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6a00000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.list_my_attendance_history(
    'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')),
  4, 'a worker sees all four of their own clock and break events, not coworkers');
select extensions.results_eq(
  $$select event_type, department_name, original_at, effective_at, has_correction, event_source
    from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')
    where event_id = '36a00000-0000-4000-8000-000000000001'$$,
  $$values ('clock_in'::text, 'FOH'::text, '2024-01-01 09:05+00'::timestamptz, '2024-01-01 09:00+00'::timestamptz, true, 'server_clock'::text)$$,
  'history shows immutable original and current corrected times');
select extensions.results_eq(
  $$select classification, event_source, location_status
    from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')
    where event_id = '36a00000-0000-4000-8000-000000000003'$$,
  $$values ('unpaid'::text, 'manager_reported'::text, null::text)$$,
  'break classification and manager-reported source are visible without a location check');
select extensions.results_eq(
  $$select location_status, location_reason, distance_meters, accuracy_meters, radius_meters
    from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')
    where event_id = '36a00000-0000-4000-8000-000000000001'$$,
  $$values ('verified'::text, 'inside'::text, 0::numeric, 5::numeric, 100::integer)$$,
  'the worker can see the derived location check actually retained');
select extensions.ok(
  (select location_status = 'review' and location_reason = 'permission_denied' and reviewed_at is not null
    from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')
    where event_id = '36a00000-0000-4000-8000-000000000004'),
  'the worker sees a location exception and its review');
select extensions.throws_ok(
  $$select * from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000002')$$,
  'P0001', 'Permission denied', 'a worker cannot inspect another venue');
select extensions.throws_ok(
  $$select * from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000002', 'c6a00000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'a worker cannot inspect another business');
select extensions.throws_ok(
  $$select * from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'a mismatched business and venue are denied');
select set_config('request.jwt.claim.sub', 'a6a00000-0000-4000-8000-000000000003', true);
select extensions.results_eq(
  $$select event_id from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')$$,
  $$values ('36a00000-0000-4000-8000-000000000005'::uuid)$$,
  'a colleague sees only their own event');
select set_config('request.jwt.claim.sub', 'a6a00000-0000-4000-8000-000000000004', true);
select extensions.results_eq(
  $$select event_id, event_source from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')$$,
  $$values ('36a00000-0000-4000-8000-000000000006'::uuid, 'offline_claim'::text)$$,
  'a manager sees only their own personal history, not every managed worker');
reset role;
update public.employees set auth_user_id = null
where id = 'e6a00000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6a00000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::integer from public.list_my_attendance_history(
    'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')),
  0, 'unlinking a manager profile removes its personal history');
select extensions.ok(
  public.can_view_attendance_session('16a00000-0000-4000-8000-000000000001'),
  'unlinking a manager profile does not remove authorised departmental access');
reset role;
update public.employees set auth_user_id = 'a6a00000-0000-4000-8000-000000000004'
where id = 'e6a00000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6a00000-0000-4000-8000-000000000001', true);
select extensions.is(
  (select count(*)::integer from public.list_my_attendance_history(
    'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')),
  0, 'an owner without their own clock events sees an empty personal history');
select set_config('request.jwt.claim.sub', 'a6a00000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select * from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant owner cannot access personal history');
reset role;
update public.employees set auth_user_id = null
where id = 'e6a00000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6a00000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.list_my_attendance_history(
    'b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')),
  0, 'unlinking the worker profile removes access to its historical events');
reset role;
update public.employees set auth_user_id = 'a6a00000-0000-4000-8000-000000000002'
where id = 'e6a00000-0000-4000-8000-000000000001';
delete from public.business_memberships
where business_id = 'b6a00000-0000-4000-8000-000000000001'
  and user_id = 'a6a00000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6a00000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select * from public.list_my_attendance_history('b6a00000-0000-4000-8000-000000000001', 'c6a00000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'membership revocation takes effect on the next history request');
reset role;
select extensions.is(
  (select occurred_at from public.attendance_events where id = '36a00000-0000-4000-8000-000000000001'),
  '2024-01-01 09:05+00'::timestamptz, 'the original timestamp remains unchanged');
select extensions.throws_ok(
  $$delete from public.attendance_events where id = '36a00000-0000-4000-8000-000000000001'$$,
  'P0001', 'Original attendance records are immutable', 'a privileged accidental event deletion is blocked');
select * from extensions.finish();
rollback;
