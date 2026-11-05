begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-4000-8000-000000000001', 'conflict-owner@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000002', 'conflict-foh@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000003', 'conflict-boh@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000004', 'conflict-worker@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000005', 'conflict-outsider@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7000000-0000-4000-8000-000000000001', 'Conflict business'),
  ('b7000000-0000-4000-8000-000000000002', 'Other conflict business');
insert into public.venues (id, business_id, name, timezone) values
  ('c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'Main', 'UTC'),
  ('c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000002', 'Other', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'FOH'),
  ('d7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'BOH'),
  ('d7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000002', 'Other');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', 'foh_manager', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003', 'boh_manager', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002'),
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004', 'employee', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004', 'Shared', 'Server'),
  ('e7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000003', null, 'Other', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, status, is_published) values
  ('f7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'FOH shift', '2032-03-15 09:00+00', '2032-03-15 12:00+00', 'scheduled', true),
  ('f7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000001', 'BOH shift', '2032-03-15 11:00+00', '2032-03-15 13:00+00', 'scheduled', false),
  ('f7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'Adjacent', '2032-03-15 13:00+00', '2032-03-15 14:00+00', 'scheduled', false),
  ('f7000000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'Cancelled', '2032-03-15 09:00+00', '2032-03-15 12:00+00', 'cancelled', false),
  ('f7000000-0000-4000-8000-000000000005', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', null, 'Open', '2032-03-15 09:00+00', '2032-03-15 12:00+00', 'scheduled', false),
  ('f7000000-0000-4000-8000-000000000006', 'b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000002', 'Other', '2032-03-15 09:00+00', '2032-03-15 12:00+00', 'scheduled', false);

select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002']::uuid[])),
  2, 'owner sees both affected shifts across departments');
select extensions.ok(exists(select 1 from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000001']::uuid[])),
  'the published shift is identified even when its conflicting shift is a draft');
select extensions.ok(exists(select 1 from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000002']::uuid[])),
  'the draft shift is independently identified');
select extensions.is((select count(*)::integer from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000003', 'f7000000-0000-4000-8000-000000000004',
        'f7000000-0000-4000-8000-000000000005', 'f7000000-0000-4000-8000-000000000006']::uuid[])),
  0, 'adjacent, cancelled, open and other-tenant shifts are not reported');
select extensions.is((select count(*)::integer from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '{}'::uuid[])),
  0, 'an empty shift selection is allowed');
select extensions.throws_ok(
  $$select * from public.list_roster_overlap_conflicts('b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Invalid shift selection', 'a missing selection is rejected');
select extensions.throws_ok(
  $$select * from public.list_roster_overlap_conflicts('b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', array[null]::uuid[])$$,
  'P0001', 'Invalid shift selection', 'null shift IDs are rejected');
select extensions.throws_ok(
  $$select * from public.list_roster_overlap_conflicts('b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', array[['f7000000-0000-4000-8000-000000000001']]::uuid[])$$,
  'P0001', 'Invalid shift selection', 'multidimensional selections are rejected explicitly');
select extensions.throws_ok(
  $$select * from public.list_roster_overlap_conflicts('b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', array_fill('f7000000-0000-4000-8000-000000000001'::uuid, array[1001]))$$,
  'P0001', 'Invalid shift selection', 'a selection above the roster row limit is rejected');
select extensions.is((select count(*)::integer from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array_fill('f7000000-0000-4000-8000-000000000001'::uuid, array[1000]))),
  1, 'a maximum-size selection returns each affected shift once');
select extensions.throws_ok(
  $$select * from public.list_roster_overlap_conflicts('b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', '{}'::uuid[])$$,
  'P0001', 'Permission denied', 'a venue from another tenant cannot be queried');

select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.shifts where id = 'f7000000-0000-4000-8000-000000000002'),
  0, 'the FOH manager cannot inspect the BOH draft shift');
select extensions.is((select count(*)::integer from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002']::uuid[])),
  1, 'the FOH manager sees a warning only for their own affected shift');
select extensions.is((select shift_id from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002']::uuid[])),
  'f7000000-0000-4000-8000-000000000001'::uuid, 'the hidden conflicting shift ID is not revealed');
select extensions.is((select count(*)::integer from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000002']::uuid[])),
  0, 'requesting the hidden shift directly does not expose it');
select extensions.throws_ok(
  $$select * from public.list_roster_overlap_conflicts('b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000002', '{}'::uuid[])$$,
  'P0001', 'Permission denied', 'a scoped manager cannot query another tenant');

select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.shifts where id = 'f7000000-0000-4000-8000-000000000001'),
  0, 'the BOH manager cannot inspect the FOH published shift');
select extensions.is((select shift_id from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002']::uuid[])),
  'f7000000-0000-4000-8000-000000000002'::uuid, 'the BOH manager sees only their own affected shift');

select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002']::uuid[])),
  0, 'an employee cannot enumerate manager conflict information');
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select * from public.list_roster_overlap_conflicts('b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', array['f7000000-0000-4000-8000-000000000001']::uuid[])$$,
  'P0001', 'Permission denied', 'another tenant cannot query conflict information');

reset role;
update public.shifts set status = 'cancelled' where id = 'f7000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000001']::uuid[])),
  0, 'cancelled shifts do not create a conflict');
reset role;
update public.shifts set status = 'scheduled', starts_at = '2032-03-15 12:00+00', ends_at = '2032-03-15 13:00+00'
where id = 'f7000000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is((select count(*)::integer from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002']::uuid[])),
  0, 'touching half-open shift boundaries do not conflict');
reset role;
update public.shifts set starts_at = '2032-03-15 11:59:59.999999+00'
where id = 'f7000000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is((select count(*)::integer from public.list_roster_overlap_conflicts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
  array['f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002']::uuid[])),
  2, 'a one-microsecond overlap identifies both shifts');

reset role;
set local role anon;
select extensions.throws_ok(
  $$select * from public.list_roster_overlap_conflicts('b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '{}'::uuid[])$$,
  '42501', null, 'anonymous conflict lookup is denied');
select * from extensions.finish();
rollback;
