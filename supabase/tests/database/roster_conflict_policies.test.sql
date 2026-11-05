begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(53);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2000000-0000-4000-8000-000000000001', 'policy-owner@example.test', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000002', 'policy-foh@example.test', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000003', 'policy-worker@example.test', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000004', 'policy-outsider@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b2000000-0000-4000-8000-000000000001', 'Policy business'),
  ('b2000000-0000-4000-8000-000000000002', 'Other policy business');
insert into public.venues (id, business_id, name, timezone) values
  ('c2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Main', 'UTC'),
  ('c2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'Second', 'UTC'),
  ('c2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'FOH'),
  ('d2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'BOH'),
  ('d2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'Second FOH'),
  ('d2000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', 'Outside FOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'foh_manager', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'employee', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000004', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'Available Monday', 'Server'),
  ('e2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', null, 'Unknown pattern', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002');
insert into public.employee_availability_patterns (employee_id, business_id, venue_id) values
  ('e2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001');
insert into public.employee_availability_intervals
  (employee_id, business_id, venue_id, weekday, start_minute, end_minute) values
  ('e2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 1, 540, 1020);
insert into public.employee_availability_exceptions
  (business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status) values
  ('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', '2032-03-17', '2032-03-17', 'unavailable', 'active'),
  ('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', '2032-03-18', '2032-03-18', 'leave', 'approved'),
  ('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', '2032-03-19', '2032-03-19', 'leave', 'pending');

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.venues where id = 'c2000000-0000-4000-8000-000000000001'
    and not block_manual_unavailability and not block_publish_unavailability
    and not block_publish_overlap and not block_publish_long_shift),
  1, 'existing venues default to advisory policies');
select extensions.is((select count(*)::integer from public.venue_conflict_policy_events), 0,
  'default policy creation does not produce a misleading change');
select extensions.lives_ok(
  $$select public.save_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
    'Previously allowed', '2032-03-15 18:00', '2032-03-15 19:00', 0)$$,
  'manual assignment remains advisory by default');
select extensions.lives_ok(
  $$select public.save_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', null,
    'Open Monday', '2032-03-15 10:00', '2032-03-15 11:00', 0)$$,
  'open shifts remain valid by default');
select extensions.throws_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', null, true, true, true)$$,
  'P0001', 'Invalid conflict policy', 'null policy settings are rejected');
select extensions.throws_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000003', true, true, true, true)$$,
  'P0001', 'Permission denied', 'a venue from another business cannot be configured');
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', true, true, true, true)$$,
  'an owner configures all four conflict rules');
select extensions.is(
  (select count(*)::integer from public.venues where id = 'c2000000-0000-4000-8000-000000000001'
    and block_manual_unavailability and block_publish_unavailability
    and block_publish_overlap and block_publish_long_shift),
  1, 'the selected venue stores all four rules');
select extensions.is(
  (select count(*)::integer from public.venues where id = 'c2000000-0000-4000-8000-000000000002'
    and not block_manual_unavailability and not block_publish_unavailability
    and not block_publish_overlap and not block_publish_long_shift),
  1, 'another venue keeps its own defaults');
select extensions.is(
  (select count(*)::integer from public.venue_conflict_policy_events
    where actor_id = 'a2000000-0000-4000-8000-000000000001'
      and old_values ->> 'manual_unavailability' = 'false'
      and new_values ->> 'manual_unavailability' = 'true'),
  1, 'policy history records the actor and old/new values');
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', true, true, true, true)$$,
  'saving an unchanged policy succeeds');
select extensions.is((select count(*)::integer from public.venue_conflict_policy_events), 1,
  'unchanged policy does not create an audit event');
select extensions.throws_ok(
  $$update public.venue_conflict_policy_events set actor_type = 'fake'$$,
  '42501', null, 'owners cannot directly alter policy history');
select extensions.throws_ok(
  $$update public.venues set block_publish_overlap = false
    where id = 'c2000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'owners cannot bypass the policy RPC with direct writes');

reset role;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', false, false, false, false)$$,
  'P0001', 'Permission denied', 'a department manager cannot configure venue rules');
select extensions.is((select count(*)::integer from public.venue_conflict_policy_events), 0,
  'a department manager cannot inspect policy history');
reset role;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', false, false, false, false)$$,
  'P0001', 'Permission denied', 'another business owner cannot configure these rules');
select extensions.is((select count(*)::integer from public.venue_conflict_policy_events), 0,
  'another business owner cannot read policy history');
reset role;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', false, false, false, false)$$,
  'P0001', 'Permission denied', 'an employee cannot configure venue rules');
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '2032-03-15')$$,
  'P0001', 'Permission denied', 'an employee cannot publish a roster');

reset role;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.save_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
    'Outside recurring hours', '2032-03-15 20:00', '2032-03-15 21:00', 0)$$,
  'P0001', 'Employee is unavailable for this shift', 'strict assignment rejects recurring unavailability');
select extensions.throws_ok(
  $$select public.save_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002',
    'Blocked date', '2032-03-17 09:00', '2032-03-17 10:00', 0)$$,
  'P0001', 'Employee is unavailable for this shift', 'strict assignment rejects date blocks');
select extensions.throws_ok(
  $$select public.save_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002',
    'Approved leave', '2032-03-18 09:00', '2032-03-18 10:00', 0)$$,
  'P0001', 'Employee is unavailable for this shift', 'strict assignment rejects approved leave');
select extensions.lives_ok(
  $$select public.save_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002',
    'Pending leave', '2032-03-19 09:00', '2032-03-19 10:00', 0)$$,
  'pending leave does not block a worker with unknown availability');
select extensions.lives_ok(
  $$select public.save_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
    'Within availability', '2032-03-15 09:00', '2032-03-15 10:00', 0)$$,
  'strict assignment accepts a worker within submitted availability');
select extensions.lives_ok(
  $$select public.save_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002',
    'Unknown availability', '2032-03-15 12:00', '2032-03-15 13:00', 0)$$,
  'unsubmitted availability remains unknown, not unavailable');
select extensions.lives_ok(
  $$select public.save_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', null,
    'Open blocked date', '2032-03-17 09:00', '2032-03-17 10:00', 0)$$,
  'strict assignment still allows unassigned shifts');
select extensions.throws_ok(
  $$select public.update_draft_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', (select id from public.shifts where role_title = 'Open blocked date'),
    'e2000000-0000-4000-8000-000000000002', 'Open blocked date',
    '2032-03-17 09:00', '2032-03-17 10:00', 0)$$,
  'P0001', 'Employee is unavailable for this shift', 'filling an open shift rechecks availability');
select extensions.is(
  (select count(*)::integer from public.shifts where role_title = 'Open blocked date' and employee_id is null),
  1, 'a rejected assignment leaves the shift open');
select extensions.lives_ok(
  $$select public.update_draft_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', (select id from public.shifts where role_title = 'Previously allowed'),
    'e2000000-0000-4000-8000-000000000001', 'Grandfathered',
    '2032-03-15 18:00', '2032-03-15 19:00', 5)$$,
  'unchanged existing assignment can still be edited after enabling the policy');
select extensions.throws_ok(
  $$select public.update_draft_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', (select id from public.shifts where role_title = 'Grandfathered'),
    'e2000000-0000-4000-8000-000000000001', 'Grandfathered',
    '2032-03-15 20:00', '2032-03-15 21:00', 5)$$,
  'P0001', 'Employee is unavailable for this shift', 'changing a grandfathered time requires revalidation');
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-15')$$,
  'P0001', 'Roster has unavailable employees', 'the publication rule blocks an existing unavailable assignment');
select extensions.is(
  (select count(*)::integer from public.shifts where business_id = 'b2000000-0000-4000-8000-000000000001' and is_published),
  0, 'a blocked publication changes no shifts');
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', true, false, true, true)$$,
  'publication availability can be changed independently of manual assignment');
select extensions.is(
  public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-15'),
  6, 'all six eligible drafts are published when the advisory rule is disabled');
select extensions.is(
  public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-15'),
  0, 'repeating publication without drafts is a no-op');
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Roster week must start on Monday', 'a missing week is rejected');
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-16')$$,
  'P0001', 'Roster week must start on Monday', 'a non-Monday week is rejected');
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000001', '2032-03-15')$$,
  'P0001', 'Venue or active department not found', 'a department cannot be published under another venue');

reset role;
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at) values
  ('f2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'FOH overlapping', '2032-03-22 09:00+00', '2032-03-22 12:00+00'),
  ('f2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'Private BOH overlapping', '2032-03-22 11:00+00', '2032-03-22 13:00+00');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-22')$$,
  'P0001', 'Roster has overlapping shifts', 'a manager cannot publish a conflict with another department');
select extensions.is(
  (select count(*)::integer from public.shifts where id = 'f2000000-0000-4000-8000-000000000002'),
  0, 'a generic publication error does not reveal the hidden shift');
select extensions.is(
  (select count(*)::integer from public.shifts where id = 'f2000000-0000-4000-8000-000000000001' and not is_published),
  1, 'the overlapping draft remains private');
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002', '2032-03-22')$$,
  'P0001', 'Permission denied', 'a manager cannot publish a different department');
reset role;
update public.shifts set status = 'cancelled'
where id = 'f2000000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is(
  public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-22'),
  1, 'cancelling the other shift resolves the publication blocker');

reset role;
insert into public.shifts (business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at) values
  ('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', null, 'Legacy open long shift', '2032-03-29 09:00+00', '2032-03-30 10:00+00');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29')$$,
  'P0001', 'Roster has shifts longer than 24 hours', 'long open shifts are covered by the duration rule');
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', false, true, false, false)$$,
  'availability checking can be enabled separately from the duration rule');
reset role;
insert into public.shifts (business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at) values
  ('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'Legacy assigned long shift', '2032-03-30 12:00+00', '2032-03-31 13:00+00');
set local role authenticated;
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29')$$,
  'P0001', 'Roster has unavailable employees', 'availability verification fails closed for legacy long assigned shifts');
select extensions.is(
  (select count(*)::integer from public.shifts where role_title like 'Legacy % long shift' and is_published),
  0, 'neither long shift was partially published');
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', false, false, false, false)$$,
  'an owner can restore advisory rules');
select extensions.is(
  public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29'),
  2, 'advisory configuration preserves publication of legacy shifts');
reset role;
update public.departments set active = false where id = 'd2000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29')$$,
  'P0001', 'Venue or active department not found', 'inactive departments cannot be published through the API');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.save_venue_conflict_policy('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', false, false, false, false)$$,
  '42501', null, 'anonymous users cannot configure conflict policy');
select extensions.throws_ok(
  $$select public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29')$$,
  '42501', null, 'anonymous users cannot publish a roster');
reset role;

select * from extensions.finish();
rollback;
