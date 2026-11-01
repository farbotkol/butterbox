begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(50);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a3000000-0000-4000-8000-000000000001', 'permissions-owner@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000002', 'permissions-other-owner@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000003', 'permissions-gm@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000004', 'permissions-foh@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000005', 'permissions-boh@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000006', 'permissions-employee@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000007', 'permissions-target@example.test', '{}'::jsonb);

insert into public.businesses (id, name)
values
  ('b3000000-0000-4000-8000-000000000001', 'Permissions business'),
  ('b3000000-0000-4000-8000-000000000002', 'Other business');
insert into public.venues (id, business_id, name)
values
  ('c3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Venue one'),
  ('c3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001', 'Venue two'),
  ('c3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000002', 'Other venue');
insert into public.departments (id, business_id, venue_id, name)
values
  ('d3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'Front of House'),
  ('d3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'Back of House'),
  ('d3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'Front of House'),
  ('d3000000-0000-4000-8000-000000000004', 'b3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000003', 'Front of House');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id)
values
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'owner', null, null),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'general_manager', 'c3000000-0000-4000-8000-000000000001', null),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000004', 'foh_manager', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000005', 'boh_manager', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002'),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000006', 'employee', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000007', 'employee', 'c3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003');
insert into public.job_roles (business_id, venue_id, department_id, name)
values
  ('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Server'),
  ('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', 'Cook'),
  ('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003', 'Barista'),
  ('b3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000004', 'Server');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title)
values
  ('e3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000006', 'Test employee', 'Server');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published)
values
  ('f3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'Server', '2031-06-02 09:00+00', '2031-06-02 10:00+00', true),
  ('f3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', null, 'Cook', '2031-06-02 09:00+00', '2031-06-02 10:00+00', false),
  ('f3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003', null, 'Barista', '2031-06-02 09:00+00', '2031-06-02 10:00+00', false),
  ('f3000000-0000-4000-8000-000000000004', 'b3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000004', null, 'Server', '2031-06-02 09:00+00', '2031-06-02 10:00+00', false);

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select extensions.is((select count(*)::integer from public.venues), 2, 'owner sees both business venues');
select extensions.is((select count(*)::integer from public.departments), 3, 'owner sees all business departments');
select extensions.is((select count(*)::integer from public.shifts), 3, 'owner sees all business shifts');
select extensions.is((select count(*)::integer from public.list_business_members('b3000000-0000-4000-8000-000000000001')), 6, 'owner can list business members');
select extensions.throws_ok(
  $$update public.business_memberships set role = 'owner' where user_id = 'a3000000-0000-4000-8000-000000000007'$$,
  '42501', 'permission denied for table business_memberships', 'direct membership updates are denied');
select extensions.throws_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'employee', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001')$$,
  'P0001', 'A business must retain an owner', 'the last owner cannot be demoted');
select extensions.throws_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000007', 'admin', null, null)$$,
  'P0001', 'Invalid role', 'unsupported roles cannot be assigned');
select extensions.throws_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000007', 'general_manager', 'c3000000-0000-4000-8000-000000000003', null)$$,
  'P0001', 'Invalid venue scope', 'another business venue cannot be assigned');
select extensions.throws_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000007', 'foh_manager', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Invalid department scope', 'a department must belong to the assigned venue');
select extensions.throws_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'owner', null, null)$$,
  'P0001', 'Membership not found', 'a nonmember cannot be assigned a business role');
select extensions.lives_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000007', 'foh_manager', 'c3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003')$$,
  'owner can assign a scoped FOH manager');
select extensions.is((select role from public.business_memberships where user_id = 'a3000000-0000-4000-8000-000000000007'), 'foh_manager', 'assigned role is stored');
select extensions.is((select venue_id from public.business_memberships where user_id = 'a3000000-0000-4000-8000-000000000007'), 'c3000000-0000-4000-8000-000000000002'::uuid, 'assigned venue is stored');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.venues), 1, 'general manager sees only assigned venue');
select extensions.is((select count(*)::integer from public.departments), 2, 'general manager sees assigned venue departments');
select extensions.is((select count(*)::integer from public.job_roles), 2, 'general manager sees assigned venue roles');
select extensions.is((select count(*)::integer from public.shifts), 2, 'general manager sees assigned venue shifts');
select extensions.ok(public.can_manage_department('b3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'), 'general manager can manage assigned venue');
select extensions.ok(not public.can_manage_department('b3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003'), 'general manager cannot manage another venue');
select extensions.lives_ok(
  $$select public.save_shift('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', null, 'Server', '2031-06-03 09:00', '2031-06-03 10:00', 0)$$,
  'general manager can create a shift in the assigned venue');
select extensions.throws_ok(
  $$select public.save_shift('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003', null, 'Server', '2031-06-03 09:00', '2031-06-03 10:00', 0)$$,
  'P0001', 'Permission denied', 'general manager cannot create a shift in another venue');
select extensions.throws_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000006', 'owner', null, null)$$,
  'P0001', 'Permission denied', 'general manager cannot assign roles');
select extensions.throws_ok(
  $$select public.list_business_members('b3000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'general manager cannot use the owner member-list RPC');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.venues), 1, 'FOH manager sees only assigned venue');
select extensions.is((select count(*)::integer from public.departments), 1, 'FOH manager sees only assigned department');
select extensions.is((select count(*)::integer from public.job_roles), 1, 'FOH manager sees only assigned department roles');
select extensions.is((select count(*)::integer from public.shifts where department_id <> 'd3000000-0000-4000-8000-000000000001'), 0, 'FOH manager cannot read other department shifts');
select extensions.ok(public.can_manage_department('b3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'), 'FOH manager can manage FOH');
select extensions.ok(not public.can_manage_department('b3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002'), 'FOH manager cannot manage BOH');
select extensions.throws_ok(
  $$select public.publish_roster('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', '2031-06-02')$$,
  'P0001', 'Permission denied', 'FOH manager cannot publish BOH');
select extensions.throws_ok(
  $$update public.business_memberships set role = 'owner' where user_id = auth.uid()$$,
  '42501', 'permission denied for table business_memberships', 'FOH manager cannot self-promote');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*)::integer from public.departments), 1, 'BOH manager sees only assigned department');
select extensions.ok(public.can_manage_department('b3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002'), 'BOH manager can manage BOH');
select extensions.ok(not public.can_manage_department('b3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'), 'BOH manager cannot manage FOH');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000006', true);
select extensions.is((select count(*)::integer from public.venues), 1, 'employee sees only assigned venue');
select extensions.is((select count(*)::integer from public.departments), 1, 'employee sees only assigned department');
select extensions.is((select count(*)::integer from public.shifts), 1, 'employee sees their published shift only');
select extensions.is((select count(*)::integer from public.shifts where is_published = false), 0, 'employee cannot read drafts');
select extensions.throws_ok(
  $$select public.save_shift('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', null, 'Server', '2031-06-04 09:00', '2031-06-04 10:00', 0)$$,
  'P0001', 'Permission denied', 'employee cannot create shifts');
select extensions.throws_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000006', 'owner', null, null)$$,
  'P0001', 'Permission denied', 'employee cannot assign roles');
select extensions.throws_ok(
  $$select public.list_business_members('b3000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employee cannot list business members');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000007', 'owner', null, null)$$,
  'owner can assign another owner');
select extensions.is((select count(*)::integer from public.business_memberships where role = 'owner'), 2, 'both owner memberships exist');
select extensions.lives_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'general_manager', 'c3000000-0000-4000-8000-000000000001', null)$$,
  'an owner can be demoted when another owner remains');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000007', true);
select extensions.is((select count(*)::integer from public.venues), 2, 'new owner has business-wide venue access');
select extensions.throws_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000007', 'employee', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001')$$,
  'P0001', 'A business must retain an owner', 'new last owner cannot be demoted');
select extensions.throws_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'owner', null, null)$$,
  'P0001', 'Membership not found', 'new owner cannot assign an outside user');
select extensions.throws_ok(
  $$select public.list_business_members('b3000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Permission denied', 'owner cannot list another business members');

reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.list_business_members('b3000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function list_business_members', 'anonymous users cannot list members');
select extensions.throws_ok(
  $$select public.assign_business_member_role('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000006', 'owner', null, null)$$,
  '42501', 'permission denied for function assign_business_member_role', 'anonymous users cannot assign roles');

select * from extensions.finish();
rollback;
