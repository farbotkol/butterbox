begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(45);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-4000-8000-000000000001', 'roles-owner@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000002', 'roles-foh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000003', 'roles-boh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000004', 'roles-staff@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000005', 'roles-outsider@example.test', '{}'::jsonb);

insert into public.businesses (id, name) values
  ('b9000000-0000-4000-8000-000000000001', 'Role business'),
  ('b9000000-0000-4000-8000-000000000002', 'Other role business');
insert into public.venues (id, business_id, name, timezone) values
  ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'Main', 'UTC'),
  ('c9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000002', 'Other', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'FOH'),
  ('d9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'BOH'),
  ('d9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000002', 'Other');
insert into public.job_roles (id, business_id, venue_id, department_id, name, active) values
  ('f9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Barista', true),
  ('f9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Server', true),
  ('f9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002', 'Chef', true),
  ('f9000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Old role', false);
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'foh_manager', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000003', 'boh_manager', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004', 'employee', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title, active) values
  ('e9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004', 'A Unqualified', 'Barista', true),
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'B Qualified', 'Server', true),
  ('e9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'C Archived', 'Barista', false);

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);
set local role authenticated;

-- Existing free-text titles are not assumed to be verified qualifications.
select extensions.is((select count(*)::integer from public.employee_job_roles), 0,
  'legacy job titles do not automatically grant a qualification');
select extensions.lives_ok(
  $$select public.set_job_role_auto_restriction('b9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', true)$$,
  'owner restricts automatic assignment for Barista');
select extensions.is((select restrict_auto_assignment from public.job_roles where name = 'Barista'), true,
  'restriction is persisted');
select extensions.throws_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'barista', '2032-01-05 09:00', '2032-01-05 13:00', 0)$$,
  'P0001', 'No eligible employee available for automatic assignment',
  'unqualified workers are not auto-assigned even if their free-text title matches');
select extensions.is((select count(*)::integer from public.shifts), 0,
  'failed automatic assignment does not create an open or assigned shift');
select extensions.lives_ok(
  $$select public.save_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'Barista', '2032-01-06 09:00', '2032-01-06 13:00', 0)$$,
  'existing explicit manual assignment behaviour is preserved');

select extensions.lives_ok(
  $$select public.set_employee_eligible_roles('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001',
    array['f9000000-0000-4000-8000-000000000001'::uuid, 'f9000000-0000-4000-8000-000000000002'::uuid])$$,
  'owner grants two eligible roles');
select extensions.is(
  (select count(*)::integer from public.employee_job_roles where employee_id = 'e9000000-0000-4000-8000-000000000002'), 2,
  'both roles are recorded');
select extensions.lives_ok(
  $$select public.set_employee_primary_role('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000002')$$,
  'an eligible role can be set as primary');
select extensions.is((select role_title from public.employees where id = 'e9000000-0000-4000-8000-000000000002'),
  'Server', 'primary role is reflected in the existing profile title');
select extensions.is(
  (select count(*)::integer from public.employee_job_roles where employee_id = 'e9000000-0000-4000-8000-000000000002' and is_primary), 1,
  'exactly one structured primary role is set');
select extensions.throws_ok(
  $$select public.set_employee_eligible_roles('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001',
    array['f9000000-0000-4000-8000-000000000001'::uuid])$$,
  'P0001', 'Choose another primary role before removing it', 'primary qualification cannot be removed accidentally');
select extensions.lives_ok(
  $$select public.save_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'Server', '2032-01-07 09:00', '2032-01-07 13:00', 0)$$,
  'a shift is saved before the role is renamed');
select extensions.lives_ok(
  $$select public.save_job_role('b9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 'Senior Server', true)$$,
  'the primary role can be renamed');
select extensions.is((select role_title from public.employees where id = 'e9000000-0000-4000-8000-000000000002'),
  'Senior Server', 'renaming the role updates the primary profile title');
select extensions.is((select role_title from public.shifts where starts_at = '2032-01-07 09:00+00'),
  'Server', 'renaming the role does not rewrite shift history');
select extensions.lives_ok(
  $$select public.set_employee_primary_role('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001')$$,
  'the primary role can be changed');
select extensions.is(
  (select count(*)::integer from public.employee_job_roles where employee_id = 'e9000000-0000-4000-8000-000000000002' and is_primary), 1,
  'changing primary keeps exactly one primary');
select extensions.is((select role_title from public.employees where id = 'e9000000-0000-4000-8000-000000000002'),
  'Barista', 'changing primary updates the profile title');
select extensions.lives_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'BARISTA', '2032-01-05 09:00', '2032-01-05 13:00', 0)$$,
  'qualified employee is automatically assigned');
select extensions.is((select employee_id from public.shifts where starts_at = '2032-01-05 09:00+00'),
  'e9000000-0000-4000-8000-000000000002'::uuid, 'unqualified alphabetically earlier worker is skipped');
select extensions.throws_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Barista', '2032-01-05 10:00', '2032-01-05 12:00', 0)$$,
  'P0001', 'No eligible employee available for automatic assignment',
  'overlapping and archived workers are not auto-assigned');
select extensions.throws_ok(
  $$select public.set_employee_eligible_roles('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001',
    array['f9000000-0000-4000-8000-000000000003'::uuid])$$,
  'P0001', 'Invalid or inactive job role', 'roles from another department are rejected');
select extensions.throws_ok(
  $$select public.set_employee_eligible_roles('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001',
    array['f9000000-0000-4000-8000-000000000004'::uuid])$$,
  'P0001', 'Invalid or inactive job role', 'new qualifications cannot use inactive roles');
select extensions.throws_ok(
  $$select public.set_employee_primary_role('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Choose an eligible active role', 'an unqualified role cannot become primary');
select extensions.lives_ok(
  $$select public.set_employee_departments('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002',
    array['d9000000-0000-4000-8000-000000000001'::uuid, 'd9000000-0000-4000-8000-000000000002'::uuid])$$,
  'owner links the worker to a second department');
select extensions.lives_ok(
  $$select public.set_employee_eligible_roles('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000002',
    array['f9000000-0000-4000-8000-000000000003'::uuid])$$,
  'worker can be qualified in a second department');
select extensions.lives_ok(
  $$select public.set_employee_primary_role('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000003')$$,
  'an eligible secondary-department role can be primary');
select extensions.throws_ok(
  $$select public.set_employee_departments('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002',
    array['d9000000-0000-4000-8000-000000000001'::uuid])$$,
  'P0001', 'Choose another primary role before removing its department',
  'removing the department of a primary role is rejected');
select extensions.is(
  (select count(*)::integer from public.employee_departments
    where employee_id = 'e9000000-0000-4000-8000-000000000002'), 2,
  'a rejected removal leaves department membership intact');
select extensions.lives_ok(
  $$select public.set_employee_primary_role('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001')$$,
  'owner can change the primary role before unlinking');
select extensions.lives_ok(
  $$select public.set_employee_departments('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002',
    array['d9000000-0000-4000-8000-000000000001'::uuid])$$,
  'owner removes the secondary department after changing primary');
select extensions.is(
  (select count(*)::integer from public.employee_job_roles
    where employee_id = 'e9000000-0000-4000-8000-000000000002' and department_id = 'd9000000-0000-4000-8000-000000000002'), 0,
  'qualifications in the removed department are removed');
select extensions.lives_ok(
  $$select public.save_employee_profile('b9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'B Qualified', null, 'Custom title', 'casual', true)$$,
  'existing custom profile title remains editable');
select extensions.is(
  (select count(*)::integer from public.employee_job_roles where employee_id = 'e9000000-0000-4000-8000-000000000002' and is_primary), 0,
  'changing the custom title clears a mismatching structured primary');

reset role;
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.set_employee_eligible_roles('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001',
    array['f9000000-0000-4000-8000-000000000001'::uuid])$$,
  'FOH manager can maintain FOH qualifications');
select extensions.throws_ok(
  $$select public.set_job_role_auto_restriction('b9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000003', true)$$,
  'P0001', 'Permission denied', 'FOH manager cannot restrict a BOH role');
select extensions.throws_ok(
  $$delete from public.employee_job_roles where employee_id = 'e9000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table employee_job_roles', 'direct qualification writes are denied');
reset role;

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.employee_job_roles), 0,
  'BOH manager cannot read FOH qualification rows');
select extensions.throws_ok(
  $$select public.set_employee_primary_role('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'BOH manager cannot change a FOH primary role');
reset role;

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.set_employee_eligible_roles('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', array[]::uuid[])$$,
  'P0001', 'Permission denied', 'employees cannot alter their own qualifications');
select extensions.throws_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Barista', '2032-01-08 09:00', '2032-01-08 13:00', 0)$$,
  'P0001', 'Permission denied', 'employees cannot automatically create shifts');
reset role;

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.employee_job_roles), 0,
  'another business cannot read the qualifications');
select extensions.throws_ok(
  $$select public.set_employee_eligible_roles('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001', array[]::uuid[])$$,
  'P0001', 'Permission denied', 'another business cannot modify the qualifications');
reset role;

set local role anon;
select extensions.throws_ok(
  $$select public.set_job_role_auto_restriction('b9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', false)$$,
  '42501', 'permission denied for function set_job_role_auto_restriction', 'anonymous users cannot change restrictions');
reset role;

select * from extensions.finish();
rollback;
