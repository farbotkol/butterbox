begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7400000-0000-4000-8000-000000000001', 'permissions-ux-owner@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000002', 'permissions-ux-target@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000003', 'permissions-ux-manager@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000004', 'permissions-ux-admin@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000005', 'permissions-ux-outside@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000006', 'permissions-ux-department-manager@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000007', 'permissions-ux-employee@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7400000-0000-4000-8000-000000000001', 'Permissions UX cafe'),
  ('b7400000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name) values
  ('c7400000-0000-4000-8000-000000000001', 'b7400000-0000-4000-8000-000000000001', 'First'),
  ('c7400000-0000-4000-8000-000000000002', 'b7400000-0000-4000-8000-000000000001', 'Second'),
  ('c7400000-0000-4000-8000-000000000003', 'b7400000-0000-4000-8000-000000000002', 'Outside');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7400000-0000-4000-8000-000000000001', 'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', 'FOH'),
  ('d7400000-0000-4000-8000-000000000002', 'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000002', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001'),
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000003', 'general_manager', 'c7400000-0000-4000-8000-000000000001', null),
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000004', 'admin', null, null),
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000006', 'department_manager', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001'),
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000007', 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001'),
  ('b7400000-0000-4000-8000-000000000002', 'a7400000-0000-4000-8000-000000000005', 'owner', null, null);

select extensions.ok(
  not has_function_privilege('anon', 'public.assign_business_member_role_checked(uuid,uuid,text,uuid,uuid,text,uuid,uuid,boolean)', 'execute'),
  'anonymous callers cannot execute checked permission writes'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.assign_business_member_role_checked(uuid,uuid,text,uuid,uuid,text,uuid,uuid,boolean)', 'execute'),
  'authenticated callers reach the checked write subject to authorization'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.list_business_members_for_permissions(uuid)', 'execute'),
  'anonymous callers cannot inspect the permission directory'
);

select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_business_members_for_permissions('b7400000-0000-4000-8000-000000000001')),
  6, 'an owner sees the complete membership for their business'
);
select extensions.is(
  (select full_name from public.list_business_members_for_permissions('b7400000-0000-4000-8000-000000000001')
   where user_id = 'a7400000-0000-4000-8000-000000000002'),
  'permissions-ux-target', 'the owner-only directory exposes the member profile name'
);
select extensions.throws_ok(
  $$select * from public.list_business_members_for_permissions('b7400000-0000-4000-8000-000000000002')$$,
  'P0001', 'Permission denied', 'an owner cannot inspect another business directory'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'general_manager', 'c7400000-0000-4000-8000-000000000001', null, 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', false)$$,
  'P0001', 'Confirm permission change', 'permission changes require explicit confirmation'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'general_manager', 'c7400000-0000-4000-8000-000000000001', null, 'employee', null, 'd7400000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Permissions changed; refresh before saving', 'a stale venue snapshot is rejected'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'general_manager', 'c7400000-0000-4000-8000-000000000001', null, null, 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Invalid permission snapshot', 'an absent expected role is rejected'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'foh_manager', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000002', 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Invalid department scope', 'the authoritative mutation rejects a department from another venue'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'general_manager', 'c7400000-0000-4000-8000-000000000003', null, 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Invalid venue scope', 'another business venue cannot be assigned'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000004', 'admin', null, null, 'admin', null, null, true)$$,
  'P0001', 'Invalid role', 'a legacy administrator role is not silently rewritten or newly assigned'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000005', 'owner', null, null, 'owner', null, null, true)$$,
  'P0001', 'Membership not found', 'a member of another business cannot be edited'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000001', 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', 'owner', null, null, true)$$,
  'P0001', 'A business must retain an owner', 'the last-owner safeguard still applies'
);
select extensions.lives_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'general_manager', 'c7400000-0000-4000-8000-000000000001', null, 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', true)$$,
  'an owner can confirm a current scoped change'
);
select extensions.is(
  (select role from public.business_memberships where user_id = 'a7400000-0000-4000-8000-000000000002'),
  'general_manager', 'the changed role is persisted'
);
select extensions.is(
  (select count(*)::integer from public.sensitive_action_audit
   where business_id = 'b7400000-0000-4000-8000-000000000001'
     and source_table = 'business_memberships' and operation = 'UPDATE'
     and actor_id = 'a7400000-0000-4000-8000-000000000001'
     and old_values ->> 'role' = 'employee' and new_values ->> 'role' = 'general_manager'
     and new_values ->> 'user_id' = 'a7400000-0000-4000-8000-000000000002'),
  1, 'the existing audit records the actor and old/new membership'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Permissions changed; refresh before saving', 'a stale role and department snapshot cannot overwrite the change'
);
select extensions.is(
  (select role from public.business_memberships where user_id = 'a7400000-0000-4000-8000-000000000002'),
  'general_manager', 'the newer permission change remains intact'
);

select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select * from public.list_business_members_for_permissions('b7400000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a general manager cannot inspect member identities'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000003', 'owner', null, null, 'general_manager', 'c7400000-0000-4000-8000-000000000001', null, true)$$,
  'P0001', 'Permission denied', 'a general manager cannot escalate permissions'
);
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select * from public.list_business_members_for_permissions('b7400000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a legacy administrator cannot inspect member identities'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000004', 'owner', null, null, 'admin', null, null, true)$$,
  'P0001', 'Permission denied', 'a legacy administrator cannot escalate permissions'
);
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000006', true);
select extensions.throws_ok(
  $$select * from public.list_business_members_for_permissions('b7400000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a department manager cannot inspect member identities'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000006', 'owner', null, null, 'department_manager', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Permission denied', 'a department manager cannot escalate permissions'
);
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000007', true);
select extensions.throws_ok(
  $$select * from public.list_business_members_for_permissions('b7400000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'an employee cannot inspect member identities'
);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000007', 'owner', null, null, 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'Permission denied', 'an employee cannot escalate permissions'
);
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select public.assign_business_member_role_checked('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'owner', null, null, 'general_manager', 'c7400000-0000-4000-8000-000000000001', null, true)$$,
  'P0001', 'Permission denied', 'an owner of another business cannot edit this membership'
);

select * from extensions.finish();
rollback;
