begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7300000-0000-4000-8000-000000000001', 'department-ux-owner@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000002', 'department-ux-foh@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000003', 'department-ux-outside@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000004', 'department-ux-gm@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000005', 'department-ux-worker@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7300000-0000-4000-8000-000000000001', 'Department UX cafe'),
  ('b7300000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name) values
  ('c7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'First'),
  ('c7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001', 'Second');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'FOH'),
  ('d7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'BOH'),
  ('d7300000-0000-4000-8000-000000000003', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002', 'Second FOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000002', 'foh_manager', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001'),
  ('b7300000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-000000000003', 'owner', null, null),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000004', 'general_manager', 'c7300000-0000-4000-8000-000000000001', null),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000005', 'employee', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001');
insert into public.job_roles (id, business_id, venue_id, department_id, name) values
  ('f7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'Barista'),
  ('f7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002', 'Cook');

select extensions.is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(array[
    'save_department_checked', 'save_job_role_checked', 'set_job_role_restriction_checked'
  ]) and has_function_privilege('anon', p.oid, 'execute')), 0,
  'anonymous callers cannot execute checked organisation writes');
select extensions.is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(array[
    'save_department_checked', 'save_job_role_checked', 'set_job_role_restriction_checked'
  ]) and has_function_privilege('authenticated', p.oid, 'execute')), 3,
  'authenticated callers can reach checked writes subject to their permissions');

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', null, 'Pastry', true, null, null, false)$$,
  'owner creates a department');
select extensions.throws_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', null, 'pAsTrY', true, null, null, false)$$,
  'P0001', 'Department name already exists', 'duplicate department names are case insensitive');
select extensions.throws_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', null, '', true, null, null, false)$$,
  'P0001', 'Invalid department details', 'blank department names are rejected');
select extensions.lives_ok(
  $$select public.save_job_role_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', null, 'Latte', true, null, null, false)$$,
  'owner creates a role');
select extensions.throws_ok(
  $$select public.save_job_role_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', null, 'lAtTe', true, null, null, false)$$,
  'P0001', 'Job role name already exists', 'duplicate role names are case insensitive');
select extensions.lives_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'Front', true, 'FOH', true, false)$$,
  'current department snapshot can be renamed');
select extensions.throws_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'Stale', true, 'FOH', true, false)$$,
  'P0001', 'Department changed; refresh before saving', 'stale department edits cannot overwrite the newer name');
select extensions.is((select name from public.departments where id = 'd7300000-0000-4000-8000-000000000001'), 'Front',
  'the newer department name remains intact');
select extensions.throws_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'Front', false, 'Front', true, false)$$,
  'P0001', 'Confirm department status change', 'department deactivation requires confirmation');
select extensions.lives_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'Front', false, 'Front', true, true)$$,
  'confirmed department deactivation succeeds');
select extensions.throws_ok(
  $$select public.save_job_role_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', null, 'Unavailable', true, null, null, false)$$,
  'P0001', 'Department is inactive', 'new active roles cannot be created in an inactive department');
select extensions.lives_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'Front', true, 'Front', false, true)$$,
  'confirmed department reactivation succeeds');

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.departments where business_id = 'b7300000-0000-4000-8000-000000000001'), 1,
  'a department manager sees only their permitted department');
select extensions.lives_ok(
  $$select public.save_job_role_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'Senior Barista', true, 'Barista', true, false)$$,
  'the scoped department manager can rename an allowed role');
select extensions.throws_ok(
  $$select public.save_job_role_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'Stale', true, 'Barista', true, false)$$,
  'P0001', 'Job role changed; refresh before saving', 'stale role details cannot overwrite a newer name');
select extensions.throws_ok(
  $$select public.save_job_role_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'Senior Barista', false, 'Senior Barista', true, false)$$,
  'P0001', 'Confirm job role status change', 'role deactivation requires confirmation');
select extensions.lives_ok(
  $$select public.save_job_role_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'Senior Barista', false, 'Senior Barista', true, true)$$,
  'confirmed role deactivation succeeds');
select extensions.lives_ok(
  $$select public.save_job_role_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'Senior Barista', true, 'Senior Barista', false, true)$$,
  'confirmed role reactivation succeeds');
select extensions.throws_ok(
  $$select public.save_job_role_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002', 'f7300000-0000-4000-8000-000000000002', 'Other', true, 'Cook', true, false)$$,
  'P0001', 'Permission denied', 'a manager cannot edit another department role');
select extensions.throws_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'Other', true, 'Front', true, false)$$,
  'P0001', 'Permission denied', 'a department manager cannot edit department details');

select extensions.lives_ok(
  $$select public.set_job_role_restriction_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'manual', true, 'Senior Barista', true, false, false)$$,
  'manual restrictions can be enabled');
select extensions.throws_ok(
  $$select public.set_job_role_restriction_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'automatic', true, 'Senior Barista', true, false, false)$$,
  'P0001', 'Role restrictions changed; refresh before saving', 'a stale automatic edit cannot ignore a newer manual restriction');
select extensions.lives_ok(
  $$select public.set_job_role_restriction_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'automatic', true, 'Senior Barista', true, false, true)$$,
  'automatic restriction can be set independently');
select extensions.lives_ok(
  $$select public.set_job_role_restriction_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'manual', false, 'Senior Barista', true, true, true)$$,
  'manual restriction can be cleared independently');
select extensions.is((select restrict_auto_assignment from public.job_roles where id = 'f7300000-0000-4000-8000-000000000001'), true,
  'clearing manual restriction preserves the automatic setting');
select extensions.is((select restrict_manual_assignment from public.job_roles where id = 'f7300000-0000-4000-8000-000000000001'), false,
  'manual restriction was cleared');
select extensions.throws_ok(
  $$select public.set_job_role_restriction_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'other', true, 'Senior Barista', true, true, false)$$,
  'P0001', 'Invalid restriction', 'unknown restriction modes are rejected');
select extensions.throws_ok(
  $$select public.set_job_role_restriction_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002', 'f7300000-0000-4000-8000-000000000002', 'manual', true, 'Cook', true, false, false)$$,
  'P0001', 'Permission denied', 'a manager cannot change another department restriction');

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'Other tenant', true, 'Front', true, false)$$,
  'P0001', 'Permission denied', 'another business cannot edit the department');
select extensions.throws_ok(
  $$select public.save_job_role_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'Other tenant', true, 'Senior Barista', true, false)$$,
  'P0001', 'Permission denied', 'another business cannot edit the role');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.save_department_checked('b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002', 'd7300000-0000-4000-8000-000000000003', 'Wrong venue', true, 'Second FOH', true, false)$$,
  'P0001', 'Permission denied', 'a venue-scoped general manager cannot edit another venue');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select public.set_job_role_restriction_checked('b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', 'manual', true, 'Senior Barista', true, true, false)$$,
  'P0001', 'Permission denied', 'employees cannot change role restrictions');

select * from extensions.finish();
rollback;
