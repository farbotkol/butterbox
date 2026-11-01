begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(44);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a6000000-0000-4000-8000-000000000001', 'shared-owner@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000002', 'shared-first-manager@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000003', 'shared-second-manager@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000004', 'shared-worker@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000005', 'shared-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b6000000-0000-4000-8000-000000000001', 'Shared worker business'),
  ('b6000000-0000-4000-8000-000000000002', 'Other business');
insert into public.venues (id, business_id, name, timezone) values
  ('c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'First', 'UTC'),
  ('c6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', 'Second', 'UTC'),
  ('c6000000-0000-4000-8000-000000000003', 'b6000000-0000-4000-8000-000000000001', 'Third', 'UTC'),
  ('c6000000-0000-4000-8000-000000000004', 'b6000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'First FOH'),
  ('d6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 'Second BOH'),
  ('d6000000-0000-4000-8000-000000000003', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000003', 'Third FOH'),
  ('d6000000-0000-4000-8000-000000000004', 'b6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000004', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', 'foh_manager', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000003', 'boh_manager', 'c6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002'),
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000004', 'employee', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000004', 'Alex', 'Server'),
  ('e6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002', null, 'Alex', 'Cook'),
  ('e6000000-0000-4000-8000-000000000003', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000003', null, 'Different display name', 'Barista'),
  ('e6000000-0000-4000-8000-000000000004', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002', null, 'Alex', 'Cook'),
  ('e6000000-0000-4000-8000-000000000005', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', null, 'Other person', 'Server'),
  ('e6000000-0000-4000-8000-000000000006', 'b6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000004', 'd6000000-0000-4000-8000-000000000004', null, 'Alex', 'Server');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, status, is_published) values
  ('f6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'First shift', '2032-03-15 09:00+00', '2032-03-15 12:00+00', 'scheduled', true),
  ('f6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000002', 'Hidden shift', '2032-03-15 11:00+00', '2032-03-15 12:00+00', 'scheduled', false),
  ('f6000000-0000-4000-8000-000000000003', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000002', 'Adjacent shift', '2032-03-15 12:00+00', '2032-03-15 13:00+00', 'scheduled', false),
  ('f6000000-0000-4000-8000-000000000004', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000004', 'Different Alex', '2032-03-15 09:00+00', '2032-03-15 12:00+00', 'scheduled', false),
  ('f6000000-0000-4000-8000-000000000005', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'Cancelled', '2032-03-15 11:00+00', '2032-03-15 12:00+00', 'cancelled', false),
  ('f6000000-0000-4000-8000-000000000006', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', null, 'Open', '2032-03-15 11:00+00', '2032-03-15 12:00+00', 'scheduled', false),
  ('f6000000-0000-4000-8000-000000000007', 'b6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000004', 'd6000000-0000-4000-8000-000000000004', 'e6000000-0000-4000-8000-000000000006', 'Outside', '2032-03-15 09:00+00', '2032-03-15 12:00+00', 'scheduled', false),
  ('f6000000-0000-4000-8000-000000000008', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000003', 'Third shift', '2032-03-15 10:00+00', '2032-03-15 11:00+00', 'scheduled', false);

select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    array['f6000000-0000-4000-8000-000000000001'::uuid])),
  0, 'matching names alone do not link staff or report cross-venue conflicts');
select extensions.throws_ok($$select * from public.shared_workers$$, '42501', null,
  'owners cannot directly inspect shared identity storage');
select extensions.throws_ok($$select * from public.shared_worker_profiles$$, '42501', null,
  'owners cannot directly inspect shared profile mappings');
select extensions.throws_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Choose two different employee profiles', 'a profile cannot be linked to itself');
select extensions.throws_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000005')$$,
  'P0001', 'Choose a profile in another venue', 'same-venue profiles cannot be linked');
select extensions.throws_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000006')$$,
  'P0001', 'Choose a profile in another venue', 'cross-tenant profiles cannot be linked');
select extensions.throws_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Employee profile not found', 'the source venue is validated');
select extensions.lives_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000002')$$,
  'the owner can explicitly link profiles from different venues');
select extensions.is(
  (select auth_user_id from public.employees where id = 'e6000000-0000-4000-8000-000000000002'),
  null::uuid, 'linking identities does not link the other profile to an account');
select extensions.is(
  (select count(*)::integer from public.business_memberships
   where business_id = 'b6000000-0000-4000-8000-000000000001'
     and user_id = 'a6000000-0000-4000-8000-000000000004'),
  1, 'linking identities does not add another venue membership');
select extensions.is(
  (select count(*)::integer from public.shared_worker_link_events),
  1, 'an actual link is audited');
select extensions.is(
  (select actor_id from public.shared_worker_link_events limit 1),
  'a6000000-0000-4000-8000-000000000001'::uuid, 'the audit event identifies the actor');
select extensions.is(
  (select linked_employee_id from public.list_shared_worker_profiles(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')),
  'e6000000-0000-4000-8000-000000000002'::uuid, 'the owner can inspect the linked profile');
select extensions.is(
  (select linked_venue_name from public.list_shared_worker_profiles(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')),
  'Second', 'the link view identifies the other venue');
select extensions.lives_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000002')$$,
  'repeating an existing link is harmless');
select extensions.is((select count(*)::integer from public.shared_worker_link_events), 1,
  'a repeated link does not create an audit event');
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    array['f6000000-0000-4000-8000-000000000001'::uuid])),
  1, 'the local affected shift is reported after an explicit cross-venue link');
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002',
    array['f6000000-0000-4000-8000-000000000002'::uuid])),
  1, 'the other venue independently sees its affected shift');
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002',
    array['f6000000-0000-4000-8000-000000000003'::uuid, 'f6000000-0000-4000-8000-000000000004'::uuid])),
  0, 'adjacent shifts and an unrelated same-named worker are not conflicts');
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    array['f6000000-0000-4000-8000-000000000005'::uuid, 'f6000000-0000-4000-8000-000000000006'::uuid])),
  0, 'cancelled and open shifts are not reported');
select extensions.throws_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000004')$$,
  'P0001', 'A profile from this venue is already linked', 'one shared worker cannot have two profiles at one venue');
select extensions.lives_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000003')$$,
  'an owner can explicitly link a third venue even when display names differ');
select extensions.is(
  (select count(*)::integer from public.list_shared_worker_profiles(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')),
  2, 'both other venue profiles are listed');
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    array['f6000000-0000-4000-8000-000000000001'::uuid])),
  1, 'multiple hidden conflicts report the local shift only once');
select extensions.lives_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000005',
    'e6000000-0000-4000-8000-000000000004')$$,
  'another independent shared worker can be created');
select extensions.throws_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000004')$$,
  'P0001', 'Profiles belong to different shared workers', 'independent identities are never merged implicitly');

select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.link_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Permission denied', 'a scoped manager cannot link cross-venue identities');
select extensions.throws_ok(
  $$select * from public.list_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a scoped manager cannot inspect cross-venue identities');
select extensions.is((select count(*)::integer from public.shared_worker_link_events), 0,
  'scoped managers cannot inspect the owner-only link audit');
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    array['f6000000-0000-4000-8000-000000000001'::uuid, 'f6000000-0000-4000-8000-000000000002'::uuid])),
  1, 'a manager sees only their own affected shift, not the hidden shift');
select extensions.is(
  (select shift_id from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    array['f6000000-0000-4000-8000-000000000001'::uuid])),
  'f6000000-0000-4000-8000-000000000001'::uuid, 'the warning does not return the other venue shift identifier');
select extensions.throws_ok(
  $$select * from public.list_roster_overlap_conflicts('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000002', array['f6000000-0000-4000-8000-000000000002'::uuid])$$,
  'P0001', 'Permission denied', 'a manager cannot query the other venue roster');
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002',
    array['f6000000-0000-4000-8000-000000000002'::uuid])),
  1, 'the second venue manager sees their own generic warning');
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    array['f6000000-0000-4000-8000-000000000001'::uuid])),
  0, 'employees cannot probe manager-only conflict details');
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select public.unlink_shared_worker_profile('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant owner cannot unlink profiles');

select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.unlink_shared_worker_profile('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000002')$$,
  'the owner can unlink one venue profile without removing the other two');
select extensions.is(
  (select count(*)::integer from public.list_shared_worker_profiles(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')
   where employee_id = 'e6000000-0000-4000-8000-000000000001'),
  1, 'the remaining linked venue is preserved');
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002',
    array['f6000000-0000-4000-8000-000000000002'::uuid])),
  0, 'unlinking removes the unrelated cross-venue warning');
select extensions.lives_ok(
  $$select public.unlink_shared_worker_profile('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000003')$$,
  'unlinking the last pair dissolves its identity');
select extensions.is(
  (select count(*)::integer from public.list_shared_worker_profiles(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')
   where employee_id = 'e6000000-0000-4000-8000-000000000001'),
  0, 'the remaining single profile is not presented as linked');
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    array['f6000000-0000-4000-8000-000000000001'::uuid])),
  0, 'the former shared worker no longer produces cross-venue conflicts');
select extensions.is((select count(*)::integer from public.shared_worker_link_events), 5,
  'link and unlink actions remain auditable after a group is dissolved');
select extensions.throws_ok(
  $$select public.unlink_shared_worker_profile('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Shared employee profile not found', 'unlinking an unlinked profile fails explicitly');
set local role anon;
select extensions.throws_ok(
  $$select * from public.list_shared_worker_profiles('b6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous users cannot inspect shared profiles');
select * from extensions.finish();
rollback;
