begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7200000-0000-4000-8000-000000000001', 'qr-owner@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000002', 'qr-manager@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000003', 'qr-worker@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000004', 'qr-coworker@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000005', 'qr-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7200000-0000-4000-8000-000000000001', 'QR business'),
  ('b7200000-0000-4000-8000-000000000002', 'Outside QR business');
insert into public.venues (
  id, business_id, name, timezone, geofence_latitude, geofence_longitude, geofence_radius_meters
) values
  ('c7200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001',
   'QR venue', 'Australia/Sydney', -33.8688, 151.2093, 100),
  ('c7200000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000001',
   'Other venue', 'Australia/Perth', null, null, null),
  ('c7200000-0000-4000-8000-000000000003', 'b7200000-0000-4000-8000-000000000002',
   'Outside', 'UTC', null, null, null);
insert into public.departments (id, business_id, venue_id, name) values
  ('d7200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001',
   'c7200000-0000-4000-8000-000000000001', 'FOH'),
  ('d7200000-0000-4000-8000-000000000003', 'b7200000-0000-4000-8000-000000000001',
   'c7200000-0000-4000-8000-000000000002', 'Other venue'),
  ('d7200000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000002',
   'c7200000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000002', 'foh_manager',
   'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001'),
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000003', 'employee',
   'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001'),
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000004', 'employee',
   'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001'),
  ('b7200000-0000-4000-8000-000000000002', 'a7200000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001',
   'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
   'a7200000-0000-4000-8000-000000000003', 'QR worker', 'Server'),
  ('e7200000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000001',
   'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
   'a7200000-0000-4000-8000-000000000004', 'QR coworker', 'Server'),
  ('e7200000-0000-4000-8000-000000000003', 'b7200000-0000-4000-8000-000000000002',
   'c7200000-0000-4000-8000-000000000003', 'd7200000-0000-4000-8000-000000000002',
   'a7200000-0000-4000-8000-000000000005', 'Outside worker', 'Server'),
  ('e7200000-0000-4000-8000-000000000004', 'b7200000-0000-4000-8000-000000000001',
   'c7200000-0000-4000-8000-000000000002', 'd7200000-0000-4000-8000-000000000003',
   'a7200000-0000-4000-8000-000000000001', 'Owner at other venue', 'Owner');

set local role anon;
select extensions.throws_ok(
  $$select * from public.create_attendance_kiosk('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000001', 'Test')$$,
  '42501', null, 'anonymous callers cannot create kiosks');
select extensions.throws_ok(
  $$select * from public.list_attendance_kiosks('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot list kiosks');
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    'invalid', 'clock_in', 'e7200000-0000-4000-8000-000000000001',
    'd7200000-0000-4000-8000-000000000001', null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  '42501', null, 'anonymous callers cannot submit QR clocks');
select extensions.throws_ok($$select * from public.activate_attendance_kiosk('invalid')$$,
  'P0001', 'Kiosk activation is unavailable', 'activation rejects malformed credentials');
select extensions.throws_ok($$select * from public.issue_attendance_kiosk_code('invalid')$$,
  'P0001', 'Kiosk is unavailable', 'display rejects malformed device credentials');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select * from public.create_attendance_kiosk('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000001', 'Manager kiosk')$$,
  'P0001', 'Permission denied', 'a delegated manager cannot create a device');
select extensions.throws_ok(
  $$select * from public.list_attendance_kiosks('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a delegated manager cannot list device credentials');
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select * from public.create_attendance_kiosk('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000001', 'Outside kiosk')$$,
  'P0001', 'Permission denied', 'an outside owner cannot create another tenant device');
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select * from public.create_attendance_kiosk('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000003', 'Wrong venue')$$,
  'P0001', 'Permission denied', 'owners cannot assign devices to another tenant venue');
select extensions.throws_ok(
  $$select * from public.create_attendance_kiosk('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000001', '   ')$$,
  'P0001', 'Invalid kiosk request', 'a device requires a nonempty name');
select extensions.lives_ok(
  $$select public.set_venue_clock_geofence('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000001', true)$$,
  'an owner enables the existing geofence for the QR clock tests');
do $$
declare v record;
begin
  select * into v from public.create_attendance_kiosk(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'Front counter');
  perform set_config('test.kiosk', v.kiosk_id::text, true);
  perform set_config('test.activation', v.activation_code, true);
  perform set_config('test.activation_expiry', v.activation_expires_at::text, true);
end;
$$;
select extensions.ok(current_setting('test.activation') ~
  '^[0-9a-f-]{36}[.][0-9a-f]{64}$', 'an owner receives one high-entropy activation credential');
select extensions.ok(current_setting('test.activation_expiry')::timestamptz > clock_timestamp()
  and current_setting('test.activation_expiry')::timestamptz <= clock_timestamp() + interval '15 minutes',
  'activation expires within fifteen minutes');
select extensions.is(
  (select count(*)::integer from public.list_attendance_kiosks(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001')),
  1, 'an owner can list their venue devices');
select extensions.is(
  (select count(*)::integer from public.list_attendance_kiosks(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000002')),
  0, 'the device list is restricted to the requested venue');
select extensions.throws_ok($$select * from public.attendance_kiosks$$,
  '42501', null, 'even an owner cannot read signing keys or device hashes directly');
select extensions.throws_ok($$select * from public.attendance_kiosk_codes$$,
  '42501', null, 'even an owner cannot directly read code records');
select extensions.throws_ok(
  $$select public.revoke_attendance_kiosk('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000002', current_setting('test.kiosk')::uuid)$$,
  'P0001', 'Kiosk not found', 'a venue filter cannot revoke a different venue device');
do $$
declare v record;
begin
  select * into v from public.create_attendance_kiosk(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'Expired setup');
  perform set_config('test.expired_activation', v.activation_code, true);
  perform set_config('test.expired_kiosk', v.kiosk_id::text, true);
end;
$$;
reset role;
update public.attendance_kiosks set activation_expires_at = clock_timestamp() - interval '1 second'
where id = current_setting('test.expired_kiosk')::uuid;
set local role service_role;
select extensions.throws_ok($$select * from public.attendance_kiosks$$,
  '42501', null, 'service-role clients cannot directly read kiosk signing keys');

set local role anon;
select extensions.throws_ok($$select * from public.activate_attendance_kiosk(current_setting('test.expired_activation'))$$,
  'P0001', 'Kiosk activation is unavailable', 'an expired activation credential cannot enroll a device');
select extensions.throws_ok(
  $$select * from public.activate_attendance_kiosk(
    left(current_setting('test.activation'), 100) || case right(current_setting('test.activation'), 1)
      when '0' then '1' else '0' end)$$,
  'P0001', 'Kiosk activation is unavailable', 'a forged activation secret is denied');
do $$
declare v record;
begin
  select * into v from public.activate_attendance_kiosk(current_setting('test.activation'));
  perform set_config('test.session', v.session_code, true);
  perform set_config('test.session_expiry', v.session_expires_at::text, true);
end;
$$;
select extensions.ok(current_setting('test.session') ~
  '^[0-9a-f-]{36}[.][0-9a-f]{64}$', 'the device receives a separate high-entropy session credential');
select extensions.ok(current_setting('test.session_expiry')::timestamptz > clock_timestamp()
  and current_setting('test.session_expiry')::timestamptz <= clock_timestamp() + interval '30 days',
  'device access has a finite lifetime');
select extensions.throws_ok($$select * from public.activate_attendance_kiosk(current_setting('test.activation'))$$,
  'P0001', 'Kiosk activation is unavailable', 'an activation credential cannot be replayed');
select extensions.throws_ok(
  $$select * from public.issue_attendance_kiosk_code(
    left(current_setting('test.session'), 37) || repeat('0', 64))$$,
  'P0001', 'Kiosk is unavailable', 'a device session with a forged secret is denied');
do $$
declare v record;
begin
  select * into v from public.issue_attendance_kiosk_code(current_setting('test.session'));
  perform set_config('test.qr', v.qr_code, true);
  perform set_config('test.qr_expiry', v.expires_at::text, true);
end;
$$;
select extensions.ok(current_setting('test.qr') ~ '^[0-9a-f-]{36}[.][0-9a-f]{64}$',
  'the displayed code includes a server-generated signature');
select extensions.ok(current_setting('test.qr_expiry')::timestamptz > clock_timestamp()
  and current_setting('test.qr_expiry')::timestamptz <= clock_timestamp() + interval '45 seconds',
  'displayed codes expire within 45 seconds');
select extensions.ok(
  (select qr_code = current_setting('test.qr')
    from public.issue_attendance_kiosk_code(current_setting('test.session'))),
  'refreshing the device reuses its still-valid unused code');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000002',
    current_setting('test.qr'), 'clock_in',
    'e7200000-0000-4000-8000-000000000004', 'd7200000-0000-4000-8000-000000000003',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Kiosk code is invalid or expired', 'a signed code cannot be used at another venue in the same tenant');
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    left(current_setting('test.qr'), 101) || 'x', 'clock_in',
    'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Invalid kiosk clock request', 'malformed QR signatures are rejected');
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    left(current_setting('test.qr'), 100) || case right(current_setting('test.qr'), 1)
      when '0' then '1' else '0' end, 'clock_in',
    'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Kiosk code is invalid or expired', 'a modified signature is rejected server-side');
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr'), 'clock_in',
    'e7200000-0000-4000-8000-000000000002', 'd7200000-0000-4000-8000-000000000001',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Employee not found or permission denied', 'a worker cannot clock another employee');
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000002', 'c7200000-0000-4000-8000-000000000003',
    current_setting('test.qr'), 'clock_in',
    'e7200000-0000-4000-8000-000000000003', 'd7200000-0000-4000-8000-000000000002',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Kiosk code is invalid or expired', 'a signed code cannot be used in another tenant or venue');
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000003', true);
do $$
declare v record;
begin
  select * into v from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr'), 'clock_in',
    'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
    null, '17200000-0000-4000-8000-000000000001', 'permission_denied', null, null, null);
  perform set_config('test.clock_session', v.session_id::text, true);
  perform set_config('test.clock_event', v.event_id::text, true);
  perform set_config('test.clock_time', v.occurred_at::text, true);
  perform set_config('test.location', v.location_status || ':' || v.location_reason, true);
end;
$$;
select extensions.is(current_setting('test.location'), 'review:permission_denied',
  'QR clocks preserve geofence review when location permission is denied');
select extensions.ok(current_setting('test.clock_time')::timestamptz between now() and clock_timestamp(),
  'the server assigns the original QR clock timestamp');
select extensions.is(
  (select event_id::text from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr'), 'clock_in',
    'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
    null, '17200000-0000-4000-8000-000000000001', 'not_provided', null, null, null)),
  current_setting('test.clock_event'), 'an exact retry returns the original event without duplicating it');
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr'), 'clock_in',
    'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Kiosk code was already used', 'a consumed code rejects a new request by the same worker');
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr'), 'clock_in',
    'e7200000-0000-4000-8000-000000000002', 'd7200000-0000-4000-8000-000000000001',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Kiosk code was already used', 'a consumed code rejects a different worker');
set local role anon;
do $$
begin
  perform set_config('test.qr2', (select qr_code from public.issue_attendance_kiosk_code(
    current_setting('test.session'))), true);
end;
$$;
select extensions.ok(current_setting('test.qr2') <> current_setting('test.qr'),
  'the device rotates immediately after a code is consumed');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr2'), 'clock_in',
    'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Already clocked in', 'the canonical attendance state machine still rejects a second clock-in');
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr2'), 'clock_out', null, null, current_setting('test.clock_session')::uuid,
    '17200000-0000-4000-8000-000000000001', 'not_provided', null, null, null)$$,
  'P0001', 'Request identifier already used', 'a fresh code cannot reuse an earlier attendance request');
select extensions.lives_ok(
  $$select * from public.start_attendance_break('b7200000-0000-4000-8000-000000000001',
    current_setting('test.clock_session')::uuid, 'paid', '17200000-0000-4000-8000-000000000003')$$,
  'the existing break workflow remains available during a QR-clocked session');
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr2'), 'clock_out', null, null, current_setting('test.clock_session')::uuid,
    '17200000-0000-4000-8000-000000000004', 'not_provided', null, null, null)$$,
  'P0001', 'End the open break before clocking out', 'a QR code does not bypass an open break');
select extensions.lives_ok(
  $$select * from public.end_attendance_break('b7200000-0000-4000-8000-000000000001',
    current_setting('test.clock_session')::uuid,
    (select break_id from public.attendance_events
      where request_id = '17200000-0000-4000-8000-000000000003'),
    '17200000-0000-4000-8000-000000000005')$$,
  'a worker can end their break before using the still-unconsumed code');
select extensions.lives_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr2'), 'clock_out', null, null, current_setting('test.clock_session')::uuid,
    '17200000-0000-4000-8000-000000000002', 'position', -33.8688, 151.2093, 10)$$,
  'a failed attempt leaves the code available for a valid clock-out');
select extensions.is(
  (select count(*)::integer from public.attendance_events
    where session_id = current_setting('test.clock_session')::uuid and event_type in ('clock_in', 'clock_out')),
  2, 'successful QR clock-in and clock-out create exactly two immutable events');
select extensions.is(
  (select count(*)::integer from public.attendance_events
    where session_id = current_setting('test.clock_session')::uuid and event_type in ('break_start', 'break_end')),
  2, 'the original break events remain in the session');
select extensions.is(
  (select verification_status || ':' || reason from public.attendance_location_checks
    where event_id = (select id from public.attendance_events
      where request_id = '17200000-0000-4000-8000-000000000002')),
  'verified:inside', 'QR clock-out still verifies the actual geofence');
reset role;
select extensions.throws_ok(
  $$delete from public.attendance_kiosk_codes where id = split_part(current_setting('test.qr'), '.', 1)::uuid$$,
  'P0001', 'Original attendance records are immutable', 'a consumed code cannot be deleted even by privileged SQL');
select extensions.throws_ok(
  $$update public.attendance_kiosk_codes set consumed_event_id = null
    where id = split_part(current_setting('test.qr'), '.', 1)::uuid$$,
  'P0001', 'Original attendance records are immutable', 'a consumed code cannot be made reusable');

set local role anon;
do $$
begin
  perform set_config('test.qr3', (select qr_code from public.issue_attendance_kiosk_code(
    current_setting('test.session'))), true);
end;
$$;
reset role;
update public.attendance_kiosk_codes set issued_at = clock_timestamp() - interval '2 minutes',
  expires_at = date_trunc('second', clock_timestamp()) - interval '1 minute'
where id = split_part(current_setting('test.qr3'), '.', 1)::uuid;
do $$
declare v_code public.attendance_kiosk_codes%rowtype;
declare v_key bytea;
begin
  select * into v_code from public.attendance_kiosk_codes
  where id = split_part(current_setting('test.qr3'), '.', 1)::uuid;
  select signing_key into v_key from public.attendance_kiosks where id = v_code.kiosk_id;
  perform set_config('test.expired_qr', v_code.id::text || '.' || encode(extensions.hmac(
    convert_to(v_code.id::text || ':' || v_code.business_id::text || ':' || v_code.venue_id::text
      || ':' || extract(epoch from v_code.expires_at)::bigint::text, 'UTF8'), v_key, 'sha256'), 'hex'), true);
end;
$$;
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.expired_qr'), 'clock_in',
    'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Kiosk code is invalid or expired', 'a correctly signed but expired code is denied');
set local role anon;
do $$
begin
  perform set_config('test.qr4', (select qr_code from public.issue_attendance_kiosk_code(
    current_setting('test.session'))), true);
end;
$$;
select extensions.ok(current_setting('test.qr4') <> current_setting('test.qr3'),
  'the display replaces an expired code');
reset role;
update public.attendance_kiosks set session_expires_at = clock_timestamp() - interval '1 second'
where id = current_setting('test.kiosk')::uuid;
set local role anon;
select extensions.throws_ok($$select * from public.issue_attendance_kiosk_code(current_setting('test.session'))$$,
  'P0001', 'Kiosk is unavailable', 'an expired device session cannot issue codes');
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr4'), 'clock_in',
    'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Kiosk code is invalid or expired', 'device-session expiry invalidates an unconsumed code');
reset role;
update public.attendance_kiosks set session_expires_at = current_setting('test.session_expiry')::timestamptz
where id = current_setting('test.kiosk')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.revoke_attendance_kiosk('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000001', current_setting('test.kiosk')::uuid)$$,
  'P0001', 'Permission denied', 'a delegated manager cannot revoke a kiosk');
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000001', true);
select extensions.is(
  public.revoke_attendance_kiosk('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000001', current_setting('test.kiosk')::uuid)::text,
  current_setting('test.kiosk'), 'an owner can revoke a device');
select extensions.is(
  public.revoke_attendance_kiosk('b7200000-0000-4000-8000-000000000001',
    'c7200000-0000-4000-8000-000000000001', current_setting('test.kiosk')::uuid)::text,
  current_setting('test.kiosk'), 'repeating revocation is idempotent');
set local role anon;
select extensions.throws_ok($$select * from public.issue_attendance_kiosk_code(current_setting('test.session'))$$,
  'P0001', 'Kiosk is unavailable', 'a revoked device cannot issue new codes');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select * from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr4'), 'clock_in',
    'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
    null, gen_random_uuid(), 'not_provided', null, null, null)$$,
  'P0001', 'Kiosk code is invalid or expired', 'revocation immediately invalidates an unconsumed code');
select extensions.is(
  (select event_id::text from public.clock_attendance_with_kiosk_code(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
    current_setting('test.qr'), 'clock_in',
    'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
    null, '17200000-0000-4000-8000-000000000001', 'not_provided', null, null, null)),
  current_setting('test.clock_event'), 'an exact retry still returns the prior receipt after device revocation');
reset role;
select extensions.is(
  (select count(*)::integer from public.sensitive_action_audit
    where business_id = 'b7200000-0000-4000-8000-000000000001'
      and source_table = 'attendance_kiosks' and record_id = current_setting('test.kiosk')),
  2, 'device creation and revocation are audited once each');
select extensions.ok(
  not exists (select 1 from public.sensitive_action_audit
    where source_table = 'attendance_kiosks' and record_id = current_setting('test.kiosk')
      and (coalesce(old_values::text, '') || coalesce(new_values::text, '')) ~
        '(signing_key|activation_hash|session_hash|[0-9a-f]{64})'),
  'device audit values do not contain credentials or signing keys');
select * from extensions.finish();
rollback;
