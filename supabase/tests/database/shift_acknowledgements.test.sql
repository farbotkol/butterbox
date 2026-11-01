begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(59);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5000000-0000-4000-8000-000000000001', 'ack-owner@example.test', '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000002', 'ack-foh@example.test', '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000003', 'ack-worker@example.test', '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000004', 'ack-other@example.test', '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000005', 'ack-boh@example.test', '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000006', 'ack-outside@example.test', '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000007', 'ack-relinked@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b5000000-0000-4000-8000-000000000001', 'Acknowledgement business'),
  ('b5000000-0000-4000-8000-000000000002', 'Other business');
insert into public.venues (id, business_id, name, timezone) values
  ('c5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'Cafe', 'UTC'),
  ('c5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000002', 'Other', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'FOH'),
  ('d5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'BOH'),
  ('d5000000-0000-4000-8000-000000000003', 'b5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'foh_manager', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003', 'employee', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004', 'employee', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005', 'boh_manager', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002'),
  ('b5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000006', 'owner', null, null),
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000007', 'employee', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003', 'Worker', 'Server'),
  ('e5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004', 'Other worker', 'Server'),
  ('e5000000-0000-4000-8000-000000000003', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', null, 'Unlinked worker', 'Server'),
  ('e5000000-0000-4000-8000-000000000004', 'b5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000006', 'Outside worker', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published) values
  ('f5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', 'Required shift', '2032-03-15 09:00+00', '2032-03-15 10:00+00', false),
  ('f5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', 'Optional shift', '2032-03-15 10:00+00', '2032-03-15 11:00+00', false),
  ('f5000000-0000-4000-8000-000000000003', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-000000000001', 'Secondary shift', '2032-03-15 11:00+00', '2032-03-15 12:00+00', false),
  ('f5000000-0000-4000-8000-000000000004', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', null, 'Open shift', '2032-03-15 12:00+00', '2032-03-15 13:00+00', false),
  ('f5000000-0000-4000-8000-000000000005', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000003', 'Unassign later', '2032-03-15 13:00+00', '2032-03-15 14:00+00', false),
  ('f5000000-0000-4000-8000-000000000006', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', 'Legacy shift', '2032-03-15 14:00+00', '2032-03-15 15:00+00', true),
  ('f5000000-0000-4000-8000-000000000007', 'b5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000004', 'Outside shift', '2032-03-15 09:00+00', '2032-03-15 10:00+00', false);

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.ok(
  (select bool_and(not requires_acknowledgement) from public.shifts),
  'drafts and older published shifts do not require acknowledgement by default');
select extensions.throws_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000004', true)$$,
  'P0001', 'Assign an employee before requiring acknowledgement', 'open shifts cannot initially require acknowledgement');
select extensions.throws_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000006', true)$$,
  'P0001', 'Published shifts cannot be edited', 'published legacy shifts cannot be changed');
select extensions.throws_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Venue or active department not found', 'business and venue pairs are validated');
select extensions.throws_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Invalid acknowledgement requirement', 'a missing requirement value is rejected explicitly');
select extensions.lives_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', true)$$,
  'owner can require acknowledgement for an assigned draft');
select extensions.lives_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000005', true)$$,
  'an unlinked assigned employee can receive a pending requirement');
select extensions.lives_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000003', true)$$,
  'owner can require acknowledgement in a secondary department');
select extensions.lives_ok(
  $$select public.update_draft_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000005', null, 'Unassign later', '2032-03-15 13:00', '2032-03-15 14:00', 0)$$,
  'a required draft can be made open without silently losing its requirement');
select extensions.throws_ok(
  $$select public.publish_roster('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', '2032-03-15')$$,
  'P0001', 'Assign or remove the acknowledgement requirement before publication',
  'publication fails atomically when a required shift has become unassigned');
select extensions.is(
  (select count(*)::integer from public.roster_publications), 0,
  'failed publication creates no version');
select extensions.is(
  (select count(*)::integer from public.shifts where id in (
    'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002',
    'f5000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000005') and is_published),
  0, 'failed publication leaves every draft unpublished');
select extensions.lives_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000005', false)$$,
  'owner can remove a requirement from an open draft');
select extensions.is(
  public.publish_roster('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', '2032-03-15'),
  4, 'publication succeeds once the open draft is resolved');
select extensions.ok(
  (select requires_acknowledgement from public.roster_publication_shifts
   where shift_id = 'f5000000-0000-4000-8000-000000000001'),
  'publication snapshot captures the required flag');
select extensions.ok(
  (select not requires_acknowledgement from public.roster_publication_shifts
   where shift_id = 'f5000000-0000-4000-8000-000000000006'),
  'legacy shifts are not retroactively made required in snapshots');
select extensions.throws_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', false)$$,
  'P0001', 'Published shifts cannot be edited', 'the required flag cannot change after publication');
select extensions.throws_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Shift not found or permission denied', 'a manager cannot acknowledge for an employee');
select extensions.throws_ok(
  $$select * from public.shift_acknowledgements$$, '42501', null,
  'even owners cannot read acknowledgement records directly');
select extensions.throws_ok(
  $$insert into public.shift_acknowledgements (publication_id, shift_id, user_id)
    values (gen_random_uuid(), gen_random_uuid(), auth.uid())$$,
  '42501', null, 'clients cannot forge acknowledgement records');
select extensions.throws_ok(
  $$update public.shifts set requires_acknowledgement = false
    where id = 'f5000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'clients cannot directly alter published requirements');
select extensions.is(
  (select count(*)::integer from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid, 'f5000000-0000-4000-8000-000000000002'::uuid])),
  1, 'manager status lists only required published shifts');
select extensions.ok(
  (select acknowledged_at is null from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid])),
  'manager sees the required shift as pending');

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000003', false)$$,
  'P0001', 'Permission denied', 'FOH manager cannot change BOH requirements');
select extensions.is(
  (select count(*)::integer from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid, 'f5000000-0000-4000-8000-000000000003'::uuid])),
  1, 'FOH manager sees only scoped, published acknowledgement status');

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.set_shift_acknowledgement_requirement('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', false)$$,
  'P0001', 'Permission denied', 'employees cannot alter requirements');
select extensions.throws_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Shift not found or permission denied', 'employees cannot acknowledge unpublished drafts');
select extensions.is(
  (select count(*)::integer from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid, 'f5000000-0000-4000-8000-000000000003'::uuid])),
  1, 'employees can list only their own published required shifts');
select extensions.lives_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001')$$,
  'the linked employee can acknowledge the published shift');
select set_config('test.ack_time',
  public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001')::text, true);
select extensions.is(
  public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001'),
  current_setting('test.ack_time')::timestamptz, 'repeated acknowledgements retain their original time');
select extensions.is(
  (select acknowledged_at from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid])),
  current_setting('test.ack_time')::timestamptz, 'employee sees the persisted acknowledgement');
select extensions.throws_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Shift not found or permission denied', 'employees cannot acknowledge a coworker shift');
select extensions.throws_ok(
  $$select * from public.list_shift_acknowledgements('b5000000-0000-4000-8000-000000000002',
    'c5000000-0000-4000-8000-000000000002', array['f5000000-0000-4000-8000-000000000007'::uuid])$$,
  'P0001', 'Permission denied', 'another tenant is inaccessible');
select extensions.throws_ok(
  $$select * from public.list_shift_acknowledgements('b5000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001', array[null::uuid])$$,
  'P0001', 'Invalid shift list', 'invalid status requests fail explicitly');
select extensions.throws_ok(
  $$select * from public.list_shift_acknowledgements('b5000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001', array(select gen_random_uuid() from generate_series(1, 2001)))$$,
  'P0001', 'Invalid shift list', 'oversized status requests are rejected');
select extensions.throws_ok(
  $$select * from public.list_shift_acknowledgements('b5000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001',
    array[['f5000000-0000-4000-8000-000000000001'::uuid]])$$,
  'P0001', 'Invalid shift list', 'multidimensional status requests are rejected explicitly');
select extensions.throws_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Shift not found or permission denied', 'acknowledgement is bound to the requested venue');

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Shift does not require acknowledgement', 'optional published shifts cannot create acknowledgements');
select extensions.is(
  (select count(*)::integer from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid])),
  0, 'coworkers cannot inspect another employee acknowledgement');

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select extensions.is(
  (select acknowledged_at from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid])),
  current_setting('test.ack_time')::timestamptz, 'manager sees the employee acknowledgement');
select extensions.lives_ok(
  $$select public.set_employee_auth_user('b5000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000007')$$,
  'owner can relink an employee profile');
select extensions.ok(
  (select acknowledged_at is null from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid])),
  'a previous account acknowledgement is not attributed to the newly linked account');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Shift not found or permission denied', 'the formerly linked account loses access');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000007', true);
select extensions.lives_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001')$$,
  'the newly linked account can acknowledge independently');
select extensions.ok(
  (select acknowledged_at is not null from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid])),
  'the new account sees its own acknowledgement');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.set_employee_auth_user('b5000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003')$$,
  'owner can restore the original linked account');
select extensions.is(
  (select acknowledged_at from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid])),
  current_setting('test.ack_time')::timestamptz, 'restoring an account preserves its original acknowledgement');
select extensions.is(
  public.publish_roster('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002', '2032-03-15'),
  1, 'secondary department roster can be published');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000003'::uuid])),
  0, 'FOH manager cannot inspect BOH acknowledgement status');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000003', true);
select extensions.lives_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000003')$$,
  'employee can acknowledge a published shift in a linked secondary department');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true);
select extensions.ok(
  (select acknowledged_at is not null from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000003'::uuid])),
  'BOH manager sees their department acknowledgement');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.set_employee_departments('b5000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001',
    array['d5000000-0000-4000-8000-000000000001'::uuid])$$,
  'owner can revoke the secondary department link');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Shift not found or permission denied', 'a removed department link revokes acknowledgement access');
select extensions.is(
  (select count(*)::integer from public.list_shift_acknowledgements(
    'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000003'::uuid])),
  0, 'a removed department link revokes status visibility');

reset role;
select extensions.is(
  (select count(*)::integer from public.shift_acknowledgements
   where shift_id = 'f5000000-0000-4000-8000-000000000001'),
  2, 'one immutable acknowledgement is retained for each linked account');
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at,
  is_published, requires_acknowledgement
) values (
  'f5000000-0000-4000-8000-000000000008', 'b5000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001', 'Missing snapshot',
  '2032-03-16 09:00+00', '2032-03-16 10:00+00', true, true
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000008')$$,
  'P0001', 'Shift publication record unavailable', 'missing publication snapshots do not produce fabricated acknowledgements');
reset role;
select extensions.is(
  (select count(*)::integer from public.shift_acknowledgements
   where shift_id = 'f5000000-0000-4000-8000-000000000008'),
  0, 'a missing snapshot leaves no acknowledgement record');
select extensions.ok(
  (select bool_and(snapshot.requires_acknowledgement)
   from public.shift_acknowledgements a
   join public.roster_publication_shifts snapshot
     on snapshot.publication_id = a.publication_id and snapshot.shift_id = a.shift_id),
  'acknowledgements refer to required publication snapshots');
set local role anon;
select extensions.throws_ok(
  $$select public.acknowledge_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous users cannot acknowledge shifts');
select * from extensions.finish();
rollback;
