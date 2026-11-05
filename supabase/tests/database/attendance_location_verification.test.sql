begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(71);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa000000-0000-4000-8000-000000000001', 'location-owner@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000002', 'location-foh@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000003', 'location-boh@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000004', 'location-worker@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000005', 'location-cook@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000006', 'location-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('bb000000-0000-4000-8000-000000000001', 'Location business'),
  ('bb000000-0000-4000-8000-000000000002', 'Other business');
insert into public.venues (id, business_id, name, timezone, geofence_latitude, geofence_longitude, geofence_radius_meters) values
  ('cc000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'Harbour', 'Australia/Sydney', -33.8688, 151.2093, 100),
  ('cc000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000001', 'Unconfigured', 'UTC', null, null, null),
  ('cc000000-0000-4000-8000-000000000003', 'bb000000-0000-4000-8000-000000000002', 'Outside', 'UTC', 0, 0, 100);
insert into public.departments (id, business_id, venue_id, name) values
  ('dd000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001', 'FOH'),
  ('dd000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000002', 'foh_manager', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000003', 'boh_manager', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000002'),
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'employee', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000005', 'employee', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000002'),
  ('bb000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('ee000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'Location worker', 'Server'),
  ('ee000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000005', 'Location cook', 'Cook');

select extensions.is(
  (select clock_geofence_enabled from public.venues where id = 'cc000000-0000-4000-8000-000000000001'),
  false, 'saved venue coordinates do not enable clock verification');
select extensions.is(
  (select count(*)::integer from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance_location_checks'
      and column_name in ('latitude', 'longitude', 'geofence_latitude', 'geofence_longitude')),
  0, 'location checks do not store raw device or venue coordinates');

set local role anon;
select extensions.throws_ok(
  $$select * from public.clock_in_attendance_with_location('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
    'ee000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
    'position', -33.8688, 151.2093, 10)$$,
  '42501', null, 'anonymous callers cannot clock in with location');
select extensions.throws_ok(
  $$select public.set_venue_clock_geofence('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001', true)$$,
  '42501', null, 'anonymous callers cannot change the location policy');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.set_venue_clock_geofence('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Permission denied', 'a delegated manager cannot enable verification');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000006', true);
select extensions.throws_ok(
  $$select public.set_venue_clock_geofence('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Permission denied', 'an outside owner cannot change another tenant policy');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.set_venue_clock_geofence('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000002', true)$$,
  'P0001', 'Configure a venue geofence before enabling location verification',
  'verification requires a configured venue geofence');
select extensions.throws_ok(
  $$select public.set_venue_clock_geofence('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Invalid clock location policy', 'the policy requires an explicit value');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_in_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001', 'position', -33.8688, 151.2093, 10)),
  'not_required:disabled', 'a disabled policy does not verify a submitted position');
select set_config('test.session', (
  select session_id::text from public.attendance_events where request_id = '11000000-0000-4000-8000-000000000001'
), true);
select extensions.ok(
  (select c.distance_meters is null and c.accuracy_meters is null and c.radius_meters is null
    from public.attendance_location_checks c join public.attendance_events e on e.id = c.event_id
    where e.request_id = '11000000-0000-4000-8000-000000000001'),
  'disabled verification retains no supplied position or derived measurements');
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_out_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', current_setting('test.session')::uuid,
    '11000000-0000-4000-8000-000000000002', 'not_provided', null, null, null)),
  'not_required:disabled', 'clock out remains available when verification is disabled');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.set_venue_clock_geofence('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001', true)$$,
  'the owner can enable verification');
select extensions.lives_ok(
  $$select public.set_venue_clock_geofence('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001', true)$$,
  'repeating the current policy is safe');
select extensions.is(
  (select count(*)::integer from public.venue_clock_location_events where venue_id = 'cc000000-0000-4000-8000-000000000001'),
  1, 'only a changed policy creates an audit event');
select extensions.ok(
  (select actor_id = 'aa000000-0000-4000-8000-000000000001' and not old_enabled and new_enabled
    from public.venue_clock_location_events where venue_id = 'cc000000-0000-4000-8000-000000000001'),
  'policy history retains the owner and previous and new values');
select extensions.throws_ok(
  $$select public.save_venue_geofence('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001', null, null, null)$$,
  'P0001', 'Configure a venue geofence before enabling location verification',
  'an enabled policy cannot be left without a venue geofence');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_in_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000003', 'position', -33.8688, 151.2093, 10)),
  'verified:inside', 'the server verifies a position and accuracy inside the radius');
select set_config('test.session', (
  select session_id::text from public.attendance_events where request_id = '11000000-0000-4000-8000-000000000003'
), true);
select extensions.ok(
  (select c.distance_meters = 0 and c.accuracy_meters = 10 and c.radius_meters = 100
    and e.verification_status = 'unverified' and c.verification_status = 'verified'
    from public.attendance_location_checks c join public.attendance_events e on e.id = c.event_id
    where e.request_id = '11000000-0000-4000-8000-000000000003'),
  'the derived check snapshots accuracy and radius without changing the original event');
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_in_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000003', 'permission_denied', null, null, null)),
  'verified:inside', 'a retry retains the original location result rather than re-verifying');
select extensions.is(
  (select count(*)::integer from public.attendance_location_checks c
    join public.attendance_events e on e.id = c.event_id where e.request_id = '11000000-0000-4000-8000-000000000003'),
  1, 'a retried request has exactly one location check');
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_out_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', current_setting('test.session')::uuid,
    '11000000-0000-4000-8000-000000000004', 'permission_denied', null, null, null)),
  'review:permission_denied', 'denying browser location records clock out as a reviewable exception');
select set_config('test.denied_check', (
  select c.id::text from public.attendance_location_checks c join public.attendance_events e on e.id = c.event_id
  where e.request_id = '11000000-0000-4000-8000-000000000004'
), true);
select set_config('test.verified_check', (
  select c.id::text from public.attendance_location_checks c join public.attendance_events e on e.id = c.event_id
  where e.request_id = '11000000-0000-4000-8000-000000000003'
), true);
select extensions.is(
  (select state from public.get_my_attendance_state_with_break('bb000000-0000-4000-8000-000000000001')),
  'clocked_out', 'a location failure does not discard the recorded time or leave the session open');
select extensions.is(
  (select count(*)::integer from public.attendance_events where session_id = current_setting('test.session')::uuid),
  2, 'both original time events survive a failed location check');
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_out_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', current_setting('test.session')::uuid,
    '11000000-0000-4000-8000-000000000004', 'position', -33.8688, 151.2093, 1)),
  'review:permission_denied', 'retrying a denied clock out does not replace the exception');

select extensions.is(
  (select location_status || ':' || location_reason from public.clock_in_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000005', 'position', -33.8700, 151.2093, 10)),
  'review:outside', 'a position beyond the radius creates an outside exception');
select set_config('test.session', (
  select session_id::text from public.attendance_events where request_id = '11000000-0000-4000-8000-000000000005'
), true);
select extensions.ok(
  (select c.distance_meters > 100 and c.accuracy_meters = 10 and c.radius_meters = 100
    from public.attendance_location_checks c join public.attendance_events e on e.id = c.event_id
    where e.request_id = '11000000-0000-4000-8000-000000000005'),
  'the server calculates and retains the outside distance and reported accuracy');
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_out_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', current_setting('test.session')::uuid,
    '11000000-0000-4000-8000-000000000006', 'position', -33.8688, 151.2093, 101)),
  'review:inaccurate', 'a position inside the radius is insufficient when its accuracy extends outside');
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_in_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000007', 'position', -33.8688, 151.2093, 100)),
  'verified:inside', 'accuracy exactly matching the radius at its centre is accepted');
select set_config('test.session', (
  select session_id::text from public.attendance_events where request_id = '11000000-0000-4000-8000-000000000007'
), true);
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_out_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', current_setting('test.session')::uuid,
    '11000000-0000-4000-8000-000000000008', 'position', -33.8688, 151.2093, -1)),
  'review:invalid', 'negative accuracy is flagged while still recording clock out');
select extensions.is(
  (select count(*)::integer from public.clock_in_attendance(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000009')),
  1, 'the legacy clock-in RPC still records time');
select set_config('test.session', (
  select session_id::text from public.attendance_events where request_id = '11000000-0000-4000-8000-000000000009'
), true);
select extensions.is(
  (select c.reason from public.attendance_location_checks c join public.attendance_events e on e.id = c.event_id
    where e.request_id = '11000000-0000-4000-8000-000000000009'),
  'not_provided', 'legacy callers cannot bypass the enabled policy');
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_out_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', current_setting('test.session')::uuid,
    '11000000-0000-4000-8000-000000000010', 'unavailable', null, null, null)),
  'review:unavailable', 'unavailable location records time and a reviewable reason');
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_in_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000011', 'unsupported', null, null, null)),
  'review:unsupported', 'an unsupported browser records time and a reviewable reason');
select set_config('test.session', (
  select session_id::text from public.attendance_events where request_id = '11000000-0000-4000-8000-000000000011'
), true);
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_out_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', current_setting('test.session')::uuid,
    '11000000-0000-4000-8000-000000000012', 'timeout', null, null, null)),
  'review:timeout', 'a location timeout records time and a reviewable reason');
select extensions.is(
  (select location_status || ':' || location_reason from public.clock_in_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000013', 'position', 91, 0, 10)),
  'review:invalid', 'out-of-range coordinates are reviewable rather than deleting time');
select set_config('test.session', (
  select session_id::text from public.attendance_events where request_id = '11000000-0000-4000-8000-000000000013'
), true);
select extensions.is(
  (select count(*)::integer from public.clock_out_attendance(
    'bb000000-0000-4000-8000-000000000001', current_setting('test.session')::uuid,
    '11000000-0000-4000-8000-000000000014')),
  1, 'the legacy clock-out RPC still records time');
select extensions.is(
  (select c.reason from public.attendance_location_checks c join public.attendance_events e on e.id = c.event_id
    where e.request_id = '11000000-0000-4000-8000-000000000014'),
  'not_provided', 'legacy clock out also produces an exception when verification is enabled');
select extensions.throws_ok(
  $$update public.attendance_location_checks set reason = 'inside' where id = current_setting('test.denied_check')::uuid$$,
  '42501', null, 'a worker cannot rewrite the original location check');
select extensions.throws_ok(
  $$delete from public.attendance_location_checks where id = current_setting('test.denied_check')::uuid$$,
  '42501', null, 'a worker cannot delete a location exception');
select extensions.throws_ok(
  $$select public.review_attendance_location_exception('bb000000-0000-4000-8000-000000000001',
    current_setting('test.denied_check')::uuid)$$,
  'P0001', 'Location exception not found or permission denied', 'a worker cannot review their own exception');
select extensions.is(
  (select count(*)::integer from public.list_attendance_location_exceptions(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001')),
  0, 'an employee cannot list manager exceptions');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000005', true);
select extensions.is(
  (select location_reason from public.clock_in_attendance_with_location(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000002', 'ee000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000001', 'permission_denied', null, null, null)),
  'permission_denied', 'a second department has its own location exception');
select set_config('test.boh_check', (
  select c.id::text from public.attendance_location_checks c join public.attendance_events e on e.id = c.event_id
  where e.request_id = '12000000-0000-4000-8000-000000000001'
), true);
select extensions.is(
  (select count(*)::integer from public.attendance_location_checks where id = current_setting('test.denied_check')::uuid),
  0, 'a coworker cannot read another employee location check');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.list_attendance_location_exceptions(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001')),
  10, 'the FOH manager sees all and only FOH exceptions');
select extensions.is(
  (select count(*)::integer from public.attendance_location_checks where id = current_setting('test.boh_check')::uuid),
  0, 'the FOH manager cannot read a BOH location check');
select extensions.throws_ok(
  $$select public.review_attendance_location_exception('bb000000-0000-4000-8000-000000000001',
    current_setting('test.boh_check')::uuid)$$,
  'P0001', 'Location exception not found or permission denied', 'the FOH manager cannot review BOH exceptions');
select extensions.throws_ok(
  $$select public.review_attendance_location_exception('bb000000-0000-4000-8000-000000000001',
    current_setting('test.verified_check')::uuid)$$,
  'P0001', 'This location check does not require review', 'verified checks cannot be marked as exceptions');
select set_config('test.review_id', public.review_attendance_location_exception(
  'bb000000-0000-4000-8000-000000000001', current_setting('test.denied_check')::uuid
)::text, true);
select extensions.ok(
  (select r.actor_id = 'aa000000-0000-4000-8000-000000000002' and r.created_at is not null
    from public.attendance_location_reviews r where r.id = current_setting('test.review_id')::uuid),
  'a scoped manager review is attributed and timestamped');
select extensions.is(
  public.review_attendance_location_exception('bb000000-0000-4000-8000-000000000001',
    current_setting('test.denied_check')::uuid)::text,
  current_setting('test.review_id'), 'retrying a review returns the original review');
select extensions.ok(
  (select reviewed_by = 'aa000000-0000-4000-8000-000000000002' and reviewed_at is not null
    from public.list_attendance_location_exceptions(
      'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001')
    where check_id = current_setting('test.denied_check')::uuid),
  'the manager queue exposes the review audit');
select extensions.throws_ok(
  $$update public.attendance_location_reviews set actor_id = 'aa000000-0000-4000-8000-000000000001'
    where id = current_setting('test.review_id')::uuid$$,
  '42501', null, 'a manager cannot rewrite a location review');
select extensions.throws_ok(
  $$delete from public.attendance_location_reviews where id = current_setting('test.review_id')::uuid$$,
  '42501', null, 'a manager cannot remove a location review');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.list_attendance_location_exceptions(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001')),
  1, 'the BOH manager sees only the BOH exception');
select extensions.is(
  (select count(*)::integer from public.attendance_location_reviews where id = current_setting('test.review_id')::uuid),
  0, 'the BOH manager cannot read FOH review history');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000006', true);
select extensions.is(
  (select count(*)::integer from public.attendance_location_checks), 0,
  'another tenant cannot read any location checks');
select extensions.is(
  (select count(*)::integer from public.attendance_location_reviews), 0,
  'another tenant cannot read any location reviews');
select extensions.throws_ok(
  $$select * from public.list_attendance_location_exceptions('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant cannot list venue exceptions');
select extensions.throws_ok(
  $$select public.review_attendance_location_exception('bb000000-0000-4000-8000-000000000001',
    current_setting('test.denied_check')::uuid)$$,
  'P0001', 'Permission denied', 'another tenant cannot review exceptions');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select * from public.list_attendance_location_exceptions('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'an owner cannot query a venue belonging to another tenant');
select extensions.is(
  (select count(*)::integer from public.list_attendance_location_exceptions(
    'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001')),
  11, 'the owner sees exceptions in both departments');
select extensions.is(
  (select e.verification_status from public.attendance_events e
    join public.attendance_location_checks c on c.event_id = e.id where c.id = current_setting('test.denied_check')::uuid),
  'unverified', 'review does not overwrite the original clock event');
select extensions.lives_ok(
  $$select public.set_venue_clock_geofence('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001', false)$$,
  'an owner can turn verification off again');
select extensions.is(
  (select count(*)::integer from public.venue_clock_location_events where venue_id = 'cc000000-0000-4000-8000-000000000001'),
  2, 'disabling verification is also audited');
select extensions.lives_ok(
  $$select public.save_venue_geofence('bb000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000001', null, null, null)$$,
  'the owner can remove the geofence after disabling verification');
select extensions.ok(
  (select reason = 'permission_denied' and radius_meters = 100 from public.attendance_location_checks
    where id = current_setting('test.denied_check')::uuid),
  'changing policy later does not rewrite the recorded check or its policy snapshot');

reset role;
select extensions.throws_ok(
  $$update public.attendance_location_checks set reason = 'not_provided' where id = current_setting('test.denied_check')::uuid$$,
  'P0001', 'Original attendance records are immutable', 'privileged accidental updates cannot rewrite a check');
select extensions.throws_ok(
  $$delete from public.attendance_location_checks where id = current_setting('test.denied_check')::uuid$$,
  'P0001', 'Original attendance records are immutable', 'privileged accidental deletes cannot remove a check');
select extensions.throws_ok(
  $$update public.attendance_location_reviews set actor_id = 'aa000000-0000-4000-8000-000000000001'
    where id = current_setting('test.review_id')::uuid$$,
  'P0001', 'Original attendance records are immutable', 'privileged accidental updates cannot rewrite a review');
select extensions.throws_ok(
  $$delete from public.attendance_location_reviews where id = current_setting('test.review_id')::uuid$$,
  'P0001', 'Original attendance records are immutable', 'privileged accidental deletes cannot remove a review');
delete from auth.users where id = 'aa000000-0000-4000-8000-000000000002';
select extensions.ok(
  (select actor_id = 'aa000000-0000-4000-8000-000000000002'
    from public.attendance_location_reviews where id = current_setting('test.review_id')::uuid),
  'a review retains its actor after the manager account is removed');
delete from auth.users where id = 'aa000000-0000-4000-8000-000000000004';
select extensions.ok(
  exists (select 1 from public.attendance_events where session_id = current_setting('test.session')::uuid)
    and exists (select 1 from public.attendance_location_checks where id = current_setting('test.denied_check')::uuid),
  'clock events and checks survive removal of the worker account');

select * from extensions.finish();
rollback;
