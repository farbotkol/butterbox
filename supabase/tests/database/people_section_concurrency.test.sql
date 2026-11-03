begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7200000-0000-4000-8000-000000000001', 'sections-owner@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000002', 'sections-boh@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000003', 'sections-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7200000-0000-4000-8000-000000000001', 'Section test cafe'),
  ('b7200000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name) values
  ('c7200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'First'),
  ('c7200000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000001', 'Second'),
  ('c7200000-0000-4000-8000-000000000003', 'b7200000-0000-4000-8000-000000000001', 'Third');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'FOH'),
  ('d7200000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'BOH'),
  ('d7200000-0000-4000-8000-000000000003', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000002', 'Second FOH'),
  ('d7200000-0000-4000-8000-000000000004', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000003', 'Third FOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000002', 'boh_manager', 'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000002'),
  ('b7200000-0000-4000-8000-000000000002', 'a7200000-0000-4000-8000-000000000003', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, name, role_title) values
  ('e7200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'First worker', 'Server'),
  ('e7200000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000002', 'd7200000-0000-4000-8000-000000000003', 'Second worker', 'Server'),
  ('e7200000-0000-4000-8000-000000000003', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000003', 'd7200000-0000-4000-8000-000000000004', 'Third worker', 'Server');
insert into public.job_roles (id, business_id, venue_id, department_id, name) values
  ('f7200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'Barista'),
  ('f7200000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'Server');

select extensions.ok(not has_function_privilege('anon',
  'public.set_employee_departments_checked(uuid,uuid,uuid[],uuid[])', 'execute'),
  'anonymous callers cannot execute checked section writes');
select extensions.ok(not has_function_privilege('anon',
  'public.create_employee_profile_idempotent(uuid,uuid,text,text,text,text,boolean,uuid)', 'execute'),
  'anonymous callers cannot create idempotent employee profiles');
select extensions.ok(not has_table_privilege('authenticated', 'public.employee_creation_requests', 'select'),
  'authenticated callers cannot inspect creation requests');
select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.employee_creation_requests'::regclass
    and confrelid = 'public.employees'::regclass and contype = 'f'
    and pg_get_constraintdef(oid) like 'FOREIGN KEY (employee_id, business_id, venue_id)%'
), 'creation requests are tied to the employee business and venue');
select extensions.is((select count(*)::integer from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(array[
    'set_employee_departments_checked', 'set_employee_eligible_roles_checked',
    'set_employee_primary_role_checked', 'set_employee_auth_user_checked',
    'link_shared_worker_profiles_checked', 'unlink_shared_worker_profile_checked'
  ]) and has_function_privilege('anon', p.oid, 'execute')), 0,
  'anonymous callers cannot execute any checked section write');
select extensions.is((select count(*)::integer from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(array[
    'set_employee_departments_checked', 'set_employee_eligible_roles_checked',
    'set_employee_primary_role_checked', 'set_employee_auth_user_checked',
    'link_shared_worker_profiles_checked', 'unlink_shared_worker_profile_checked'
  ]) and has_function_privilege('authenticated', p.oid, 'execute')), 6,
  'authenticated callers can reach checked writes subject to their permissions');
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000001', true);
set local role authenticated;

select extensions.lives_ok(
  $$select public.create_employee_profile_idempotent('b7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'Twice submitted', 'staff@example.test', 'Server', 'casual', true, '17200000-0000-4000-8000-000000000001')$$,
  'an authorised creation request succeeds');
select extensions.is(
  public.create_employee_profile_idempotent('b7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'Twice submitted', 'staff@example.test', 'Server', 'casual', true, '17200000-0000-4000-8000-000000000001'),
  (select id from public.employees where business_id = 'b7200000-0000-4000-8000-000000000001' and name = 'Twice submitted'),
  'a retry returns the original employee');
select extensions.is((select count(*)::integer from public.employees
  where business_id = 'b7200000-0000-4000-8000-000000000001' and name = 'Twice submitted'), 1,
  'the same creation request creates only one employee');
select extensions.throws_ok(
  $$select public.create_employee_profile_idempotent('b7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'Different person', 'staff@example.test', 'Server', 'casual', true, '17200000-0000-4000-8000-000000000001')$$,
  'P0001', 'Request identifier already used', 'a request identifier cannot be reused with different details');
select extensions.throws_ok(
  $$select public.create_employee_profile_idempotent('b7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'Missing request', '', 'Server', 'casual', true, null)$$,
  'P0001', 'Invalid employee creation request', 'a creation request identifier is required');

select extensions.lives_ok(
  $$select public.set_employee_departments_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', array['d7200000-0000-4000-8000-000000000001','d7200000-0000-4000-8000-000000000002']::uuid[], array['d7200000-0000-4000-8000-000000000001']::uuid[])$$,
  'current department snapshot saves');
select extensions.throws_ok(
  $$select public.set_employee_departments_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', array['d7200000-0000-4000-8000-000000000001']::uuid[], array['d7200000-0000-4000-8000-000000000001']::uuid[])$$,
  'P0001', 'Employee departments changed; refresh before saving', 'stale departments cannot overwrite a newer selection');
select extensions.is((select count(*)::integer from public.employee_departments
  where employee_id = 'e7200000-0000-4000-8000-000000000001'), 2,
  'the newer department selection remains intact');

select extensions.lives_ok(
  $$select public.set_employee_eligible_roles_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', array['f7200000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[])$$,
  'current role snapshot saves');
select extensions.throws_ok(
  $$select public.set_employee_eligible_roles_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', array['f7200000-0000-4000-8000-000000000002']::uuid[], '{}'::uuid[])$$,
  'P0001', 'Employee roles changed; refresh before saving', 'stale qualifications cannot overwrite newer roles');
select extensions.is((select count(*)::integer from public.employee_job_roles
  where employee_id = 'e7200000-0000-4000-8000-000000000001'
    and job_role_id = 'f7200000-0000-4000-8000-000000000001'), 1,
  'the newer qualified role remains intact');

select extensions.lives_ok(
  $$select public.set_employee_primary_role_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'f7200000-0000-4000-8000-000000000001', 0)$$,
  'current primary-role revision saves');
select extensions.throws_ok(
  $$select public.set_employee_auth_user_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001', 0)$$,
  'P0001', 'Employee profile changed; refresh before saving', 'stale account editor cannot overwrite the profile');
select extensions.lives_ok(
  $$select public.set_employee_auth_user_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001', 1)$$,
  'current account revision saves');
select extensions.throws_ok(
  $$select public.set_employee_primary_role_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'f7200000-0000-4000-8000-000000000001', 1)$$,
  'P0001', 'Employee profile changed; refresh before saving', 'stale primary-role editor cannot overwrite the account change');

select extensions.lives_ok(
  $$select public.link_shared_worker_profiles_checked('b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000002', '{}'::uuid[])$$,
  'current shared-worker snapshot links profiles');
select extensions.throws_ok(
  $$select public.link_shared_worker_profiles_checked('b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000003', '{}'::uuid[])$$,
  'P0001', 'Shared-worker links changed; refresh before saving', 'stale shared-worker link is rejected');
select extensions.lives_ok(
  $$select public.link_shared_worker_profiles_checked('b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000003', array['e7200000-0000-4000-8000-000000000002']::uuid[])$$,
  'refreshed shared-worker snapshot can add another venue');
select extensions.throws_ok(
  $$select public.unlink_shared_worker_profile_checked('b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', array['e7200000-0000-4000-8000-000000000002']::uuid[])$$,
  'P0001', 'Shared-worker links changed; refresh before saving', 'stale unlink cannot remove an unseen link');
select extensions.is((select count(*)::integer from public.list_shared_worker_profiles(
  'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001')
  where employee_id = 'e7200000-0000-4000-8000-000000000001'), 2,
  'both newer shared-worker links remain');
select extensions.lives_ok(
  $$select public.unlink_shared_worker_profile_checked('b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', array['e7200000-0000-4000-8000-000000000003','e7200000-0000-4000-8000-000000000002']::uuid[])$$,
  'refreshed unlink accepts the same set in any order');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.create_employee_profile_idempotent('b7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'Other department', '', 'Server', 'casual', true, '17200000-0000-4000-8000-000000000002')$$,
  'P0001', 'Permission denied', 'a manager cannot create a person in another department');
select extensions.throws_ok(
  $$select public.set_employee_departments_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', '{}'::uuid[], '{}'::uuid[])$$,
  'P0001', 'Permission denied', 'department manager cannot change membership');
select extensions.throws_ok(
  $$select public.set_employee_eligible_roles_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', '{}'::uuid[], '{}'::uuid[])$$,
  'P0001', 'Permission denied', 'other department cannot change FOH qualifications');
select extensions.throws_ok(
  $$select public.set_employee_primary_role_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'f7200000-0000-4000-8000-000000000001', 2)$$,
  'P0001', 'Permission denied', 'other department cannot set the primary role');
select extensions.throws_ok(
  $$select public.set_employee_auth_user_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', null, 2)$$,
  'P0001', 'Permission denied', 'department manager cannot change account links');
select extensions.throws_ok(
  $$select public.link_shared_worker_profiles_checked('b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000002', '{}'::uuid[])$$,
  'P0001', 'Permission denied', 'department manager cannot change shared-worker links');
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.create_employee_profile_idempotent('b7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'Other business', '', 'Server', 'casual', true, '17200000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'another business cannot create a person in this business');
select extensions.throws_ok(
  $$select public.set_employee_departments_checked('b7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', '{}'::uuid[], '{}'::uuid[])$$,
  'P0001', 'Permission denied', 'another business cannot change this employee');

select * from extensions.finish();
rollback;
