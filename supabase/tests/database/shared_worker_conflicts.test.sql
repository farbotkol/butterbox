begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(26);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-4000-8000-000000000001', 'cross-owner@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000002', 'cross-manager@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000003', 'cross-outsider@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7000000-0000-4000-8000-000000000001', 'Cross-venue business'),
  ('b7000000-0000-4000-8000-000000000002', 'Other business');
insert into public.venues (id, business_id, name, timezone) values
  ('c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'First', 'UTC'),
  ('c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'Second', 'UTC'),
  ('c7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'First FOH'),
  ('d7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', 'Second BOH'),
  ('d7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', 'foh_manager', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000003', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, name, role_title) values
  ('e7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'Alex', 'Server'),
  ('e7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002', 'Alex', 'Cook'),
  ('e7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'Zoe', 'Server'),
  ('e7000000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000003', 'Alex', 'Server');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, status) values
  ('f7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'Visible draft', '2032-03-15 09:00+00', '2032-03-15 12:00+00', 'scheduled'),
  ('f7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000002', 'Private cross-venue draft', '2032-03-15 10:00+00', '2032-03-15 11:00+00', 'scheduled'),
  ('f7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000002', 'Afternoon coverage', '2032-03-15 16:00+00', '2032-03-15 17:00+00', 'scheduled'),
  ('f7000000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000004', 'Outside shift', '2032-03-15 16:00+00', '2032-03-15 17:00+00', 'scheduled');

select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.save_shift_auto_assign('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001',
    'Unlinked automatic', '2032-03-15 16:00', '2032-03-15 17:00', 0)$$,
  'same names in different venues do not imply identity during automatic assignment');
select extensions.is(
  (select employee_id from public.shifts where role_title = 'Unlinked automatic'),
  'e7000000-0000-4000-8000-000000000001'::uuid, 'the unlinked worker remains eligible');
select extensions.lives_ok(
  $$select public.delete_shift((select id from public.shifts where role_title = 'Unlinked automatic'))$$,
  'the preliminary draft can be removed');
select extensions.lives_ok(
  $$select public.link_shared_worker_profiles('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
    'e7000000-0000-4000-8000-000000000002')$$,
  'the owner explicitly links the two profiles');
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', false, false, true, false)$$,
  'the first venue enables publication overlap blocking');
select extensions.throws_ok(
  $$select public.publish_roster('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', '2032-03-15')$$,
  'P0001', 'Roster has overlapping shifts', 'configured publication blocks a linked cross-venue overlap');
select extensions.is(
  (select count(*)::integer from public.shifts where id = 'f7000000-0000-4000-8000-000000000001' and is_published),
  0, 'blocking leaves the affected shift unpublished');
select extensions.is(
  (select count(*)::integer from public.roster_publications where business_id = 'b7000000-0000-4000-8000-000000000001'),
  0, 'blocking does not create a publication or notification');
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select shift_id from public.list_roster_overlap_conflicts('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', array['f7000000-0000-4000-8000-000000000001'::uuid])),
  'f7000000-0000-4000-8000-000000000001'::uuid, 'a scoped manager sees only their affected shift');
select extensions.is(
  (select count(*)::integer from public.shifts where id = 'f7000000-0000-4000-8000-000000000002'),
  0, 'the other venue draft remains private');
select extensions.throws_ok(
  $$select public.publish_roster('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', '2032-03-15')$$,
  'P0001', 'Roster has overlapping shifts', 'the manager receives a generic blocker without hidden shift details');
select extensions.lives_ok(
  $$select public.save_shift_auto_assign('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001',
    'Choose alternative', '2032-03-15 16:00', '2032-03-15 17:00', 0)$$,
  'automatic assignment selects another eligible worker instead of a linked overlap');
select extensions.is(
  (select employee_id from public.shifts where role_title = 'Choose alternative'),
  'e7000000-0000-4000-8000-000000000003'::uuid, 'the worker with the hidden conflicting shift is skipped');
select extensions.lives_ok(
  $$select public.save_shift_auto_assign('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001',
    'Adjacent automatic', '2032-03-15 17:00', '2032-03-15 18:00', 0)$$,
  'automatic assignment accepts an adjacent shift');
select extensions.is(
  (select employee_id from public.shifts where role_title = 'Adjacent automatic'),
  'e7000000-0000-4000-8000-000000000001'::uuid, 'half-open boundaries do not produce a false conflict');
select extensions.lives_ok(
  $$select public.save_shift('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001',
    'e7000000-0000-4000-8000-000000000001', 'Manual cross-venue',
    '2032-03-15 16:00', '2032-03-15 17:00', 0)$$,
  'manual cross-venue assignment remains advisory until publication');
select extensions.is(
  (select count(*)::integer from public.list_roster_overlap_conflicts(
    'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
    array(select id from public.shifts where role_title = 'Manual cross-venue'))),
  1, 'the newly created manual cross-venue overlap is visible as a warning');
select extensions.throws_ok(
  $$select public.save_shift_without_shared_worker_lock('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001',
    'e7000000-0000-4000-8000-000000000001', 'Bypass',
    '2032-03-16 09:00', '2032-03-16 10:00', 0)$$,
  '42501', null, 'authenticated managers cannot bypass the scheduling lock');
select extensions.throws_ok(
  $$select public.shared_worker_has_overlap('b7000000-0000-4000-8000-000000000001',
    'e7000000-0000-4000-8000-000000000001', '2032-03-15 16:00+00',
    '2032-03-15 17:00+00', null)$$,
  '42501', null, 'the internal cross-venue lookup cannot be queried directly');

select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', false, false, false, false)$$,
  'the owner can choose warning-only publication');
select extensions.is(
  public.publish_roster('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', '2032-03-15'),
  4, 'warning-only publication publishes the four first-venue drafts');
select extensions.is(
  (select count(*)::integer from public.shifts where id in
    ('f7000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000003') and is_published),
  0, 'publishing one venue does not publish another venue');
select extensions.is(
  (select count(*)::integer from public.roster_publications where venue_id = 'c7000000-0000-4000-8000-000000000001'),
  1, 'warning-only publication records one version');
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000002', false, false, true, false)$$,
  'the second venue independently enables overlap blocking');
select extensions.throws_ok(
  $$select public.publish_roster('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002', '2032-03-15')$$,
  'P0001', 'Roster has overlapping shifts', 'second-venue publication detects already-published linked shifts');
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.publish_roster('b7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002', '2032-03-15')$$,
  'P0001', 'Permission denied', 'another tenant cannot publish the second venue');
select * from extensions.finish();
rollback;
