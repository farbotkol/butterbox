begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(60);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a8000000-0000-4000-8000-000000000001', 'geofence-owner@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000002', 'geofence-manager@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000003', 'geofence-worker@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000004', 'geofence-other-owner@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000005', 'geofence-admin@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b8000000-0000-4000-8000-000000000001', 'Geofence business'),
  ('b8000000-0000-4000-8000-000000000002', 'Other geofence business');
insert into public.venues (id, business_id, name) values
  ('c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'Main'),
  ('c8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'Second'),
  ('c8000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000002', 'Other');
insert into public.departments (id, business_id, venue_id, name) values
  ('d8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'FOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002', 'general_manager', 'c8000000-0000-4000-8000-000000000001', null),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000003', 'employee', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000004', 'owner', null, null),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000005', 'admin', null, null);

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.ok((select geofence_latitude is null and geofence_longitude is null
  and geofence_radius_meters is null from public.venues
  where id = 'c8000000-0000-4000-8000-000000000001'), 'existing venues start unconfigured');
select extensions.is((select count(*)::integer from public.venue_geofence_events), 0,
  'an unconfigured venue does not create a history event');
select extensions.lives_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', -33.8688, 151.2093, 150)$$,
  'the owner can configure a venue geofence');
select extensions.is((select geofence_latitude from public.venues where id = 'c8000000-0000-4000-8000-000000000001'),
  -33.8688::numeric, 'latitude is saved');
select extensions.is((select geofence_longitude from public.venues where id = 'c8000000-0000-4000-8000-000000000001'),
  151.2093::numeric, 'longitude is saved');
select extensions.is((select geofence_radius_meters from public.venues where id = 'c8000000-0000-4000-8000-000000000001'),
  150, 'radius is saved in meters');
select extensions.is((select count(*)::integer from public.venue_geofence_events), 1,
  'configuration creates an audit event');
select extensions.is((select actor_id from public.venue_geofence_events),
  'a8000000-0000-4000-8000-000000000001'::uuid, 'the authenticated actor is recorded');
select extensions.is((select actor_type from public.venue_geofence_events), 'authenticated',
  'the actor type is recorded');
select extensions.is((select old_values from public.venue_geofence_events),
  '{"latitude": null, "longitude": null, "radius_meters": null}'::jsonb,
  'the initial event records the unconfigured previous state');
select extensions.is((select new_values from public.venue_geofence_events),
  '{"latitude": -33.8688, "longitude": 151.2093, "radius_meters": 150}'::jsonb,
  'the initial event records all new values');
select extensions.ok((select created_at between transaction_timestamp() and clock_timestamp()
  from public.venue_geofence_events), 'the audit event has its actual creation time');
select extensions.lives_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', -33.868800, 151.209300, 150)$$,
  'saving the same configuration is allowed');
select extensions.is((select count(*)::integer from public.venue_geofence_events), 1,
  'an unchanged save does not create a duplicate event');
select extensions.lives_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 90, -180, 10000)$$,
  'the outer coordinate and radius boundaries are accepted');
select extensions.ok((select geofence_latitude = 90 and geofence_longitude = -180
  and geofence_radius_meters = 10000 from public.venues
  where id = 'c8000000-0000-4000-8000-000000000001'), 'boundary values are persisted');
select extensions.is((select count(*)::integer from public.venue_geofence_events), 2,
  'an actual update creates a second event');
select extensions.is((select old_values from public.venue_geofence_events where new_values ->> 'radius_meters' = '10000'),
  '{"latitude": -33.8688, "longitude": 151.2093, "radius_meters": 150}'::jsonb,
  'the update event records its previous configuration');
select extensions.is((select new_values from public.venue_geofence_events where new_values ->> 'radius_meters' = '10000'),
  '{"latitude": 90, "longitude": -180, "radius_meters": 10000}'::jsonb,
  'the update event records its replacement configuration');
select extensions.lives_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', -90, 180, 1)$$,
  'the opposite coordinate and minimum radius boundaries are accepted');
select extensions.is((select count(*)::integer from public.venue_geofence_events), 3,
  'the boundary update is audited');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 90.000001, 0, 100)$$,
  'P0001', 'Invalid venue geofence', 'latitude above 90 is rejected');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', -90.000001, 0, 100)$$,
  'P0001', 'Invalid venue geofence', 'latitude below -90 is rejected');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 0, 180.000001, 100)$$,
  'P0001', 'Invalid venue geofence', 'longitude above 180 is rejected');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 0, -180.000001, 100)$$,
  'P0001', 'Invalid venue geofence', 'longitude below -180 is rejected');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 0, 0, 0)$$,
  'P0001', 'Invalid venue geofence', 'a zero radius is rejected');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 0, 0, 10001)$$,
  'P0001', 'Invalid venue geofence', 'a radius above 10000 meters is rejected');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 0, null, 100)$$,
  'P0001', 'Invalid venue geofence', 'partially specified configurations are rejected');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 0.1234567, 0, 100)$$,
  'P0001', 'Invalid venue geofence', 'coordinates cannot lose meaningful precision');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'NaN'::numeric, 0, 100)$$,
  'P0001', 'Invalid venue geofence', 'non-finite coordinates are rejected');
select extensions.throws_ok(
  $$update public.venues set geofence_radius_meters = 2 where id = 'c8000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'owners cannot bypass validation with direct venue writes');
select extensions.throws_ok(
  $$insert into public.venue_geofence_events (business_id, venue_id, actor_type, old_values, new_values)
    values ('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'fake', '{}', '{}')$$,
  '42501', null, 'ordinary users cannot forge history');
select extensions.throws_ok(
  $$update public.venue_geofence_events set actor_type = 'fake'$$,
  '42501', null, 'ordinary users cannot modify history');
select extensions.throws_ok(
  $$delete from public.venue_geofence_events$$,
  '42501', null, 'ordinary users cannot delete history');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000003', 0, 0, 100)$$,
  'P0001', 'Permission denied', 'a venue and business from different tenants cannot be combined');
select extensions.lives_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', null, null, null)$$,
  'an owner can clear all geofence settings');
select extensions.ok((select geofence_latitude is null and geofence_longitude is null
  and geofence_radius_meters is null from public.venues
  where id = 'c8000000-0000-4000-8000-000000000001'), 'clearing leaves all fields unconfigured');
select extensions.is((select count(*)::integer from public.venue_geofence_events), 4,
  'clearing is audited');
select extensions.is((select old_values from public.venue_geofence_events where new_values ->> 'radius_meters' is null),
  '{"latitude": -90, "longitude": 180, "radius_meters": 1}'::jsonb,
  'the clear event records the former configuration');
select extensions.is((select new_values from public.venue_geofence_events where new_values ->> 'radius_meters' is null),
  '{"latitude": null, "longitude": null, "radius_meters": null}'::jsonb,
  'the clear event records the new unconfigured state');
select extensions.lives_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', null, null, null)$$,
  'clearing an already unconfigured venue succeeds');
select extensions.is((select count(*)::integer from public.venue_geofence_events), 4,
  'a repeated clear does not duplicate history');

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.venue_geofence_events), 0,
  'a venue manager cannot read owner-only geofence history');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 0, 0, 100)$$,
  'P0001', 'Permission denied', 'a venue manager cannot change the geofence');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.venue_geofence_events), 0,
  'an employee cannot read geofence history');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 0, 0, 100)$$,
  'P0001', 'Permission denied', 'an employee cannot change the geofence');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*)::integer from public.venue_geofence_events), 0,
  'an admin cannot read owner-only geofence history');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 0, 0, 100)$$,
  'P0001', 'Permission denied', 'an admin cannot change the owner-only geofence');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.venue_geofence_events), 0,
  'another business owner cannot read this tenant history');
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 0, 0, 100)$$,
  'P0001', 'Permission denied', 'another owner cannot target this venue');
select extensions.lives_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000003', 1, 2, 100)$$,
  'the other owner can configure their own venue');
select extensions.is((select count(*)::integer from public.venue_geofence_events), 1,
  'the other owner sees only their own history');
set local role anon;
select extensions.throws_ok(
  $$select public.save_venue_geofence('b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 0, 0, 100)$$,
  '42501', null, 'anonymous users cannot change a geofence');
select extensions.throws_ok(
  $$select * from public.venue_geofence_events$$,
  '42501', null, 'anonymous users cannot read history');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select extensions.throws_ok(
  $$update public.venues set geofence_latitude = 1 where id = 'c8000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'the database constraint also rejects partial privileged updates');
select extensions.lives_ok(
  $$update public.venues set geofence_latitude = 1, geofence_longitude = 2, geofence_radius_meters = 100
    where id = 'c8000000-0000-4000-8000-000000000001'$$,
  'a privileged maintenance update succeeds');
select extensions.is((select actor_id from public.venue_geofence_events
  where venue_id = 'c8000000-0000-4000-8000-000000000001' and new_values ->> 'latitude' = '1.000000'),
  null::uuid, 'a privileged update without a user is still audited');
select extensions.is((select actor_type from public.venue_geofence_events
  where venue_id = 'c8000000-0000-4000-8000-000000000001' and new_values ->> 'latitude' = '1.000000'),
  'postgres', 'the maintenance actor type is recorded');
select extensions.lives_ok(
  $$insert into public.venues (id, business_id, name, geofence_latitude, geofence_longitude, geofence_radius_meters)
    values ('c8000000-0000-4000-8000-000000000004', 'b8000000-0000-4000-8000-000000000001', 'Preconfigured', 3, 4, 200)$$,
  'a privileged insert may create a preconfigured venue');
select extensions.is((select count(*)::integer from public.venue_geofence_events
  where venue_id = 'c8000000-0000-4000-8000-000000000004'
    and business_id = 'b8000000-0000-4000-8000-000000000001'
    and new_values = '{"latitude": 3, "longitude": 4, "radius_meters": 200}'::jsonb),
  1, 'a preconfigured venue insert is audited in the correct tenant');

select * from extensions.finish();
rollback;
