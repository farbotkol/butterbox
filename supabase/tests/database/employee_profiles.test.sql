begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4000000-0000-4000-8000-000000000001', 'people-owner@example.test', '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000002', 'people-manager@example.test', '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000003', 'people-employee@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b4000000-0000-4000-8000-000000000001', 'People business'),
  ('b4000000-0000-4000-8000-000000000002', 'Other people business');
insert into public.venues (id, business_id, name) values
  ('c4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'People venue'),
  ('c4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000002', 'Other venue');
insert into public.departments (id, business_id, venue_id, name) values
  ('d4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'Front of House'),
  ('d4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'Back of House'),
  ('d4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000002', 'Front of House');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'foh_manager', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'employee', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.save_employee_profile('b4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', null, ' Test worker ', 'TEST@example.test', 'Server', 'casual', true)$$,
  'owner can create a profile');
select extensions.is((select name from public.employees), 'Test worker', 'name is trimmed');
select extensions.is((select email from public.employees), 'test@example.test', 'contact email is normalized');
select extensions.is((select employment_type from public.employees), 'casual', 'employment type persists');
select extensions.ok((select active from public.employees), 'new worker is active');
select extensions.throws_ok(
  $$select public.save_employee_profile('b4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', null, '', '', 'Server', 'casual', true)$$,
  'P0001', 'Invalid employee details', 'blank name rejected');
select extensions.throws_ok(
  $$select public.save_employee_profile('b4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', null, 'Worker', 'invalid', 'Server', 'casual', true)$$,
  'P0001', 'Invalid employee details', 'malformed email rejected');
select extensions.throws_ok(
  $$select public.save_employee_profile('b4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', null, 'Worker', '', 'Server', 'contractor', true)$$,
  'P0001', 'Invalid employee details', 'unsupported employment type rejected');
select extensions.lives_ok(
  $$select public.save_shift('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', (select id from public.employees), 'Server', '2031-06-02 09:00', '2031-06-02 10:00', 0)$$,
  'worker can have a shift before archiving');
select extensions.lives_ok(
  $$select public.save_employee_profile('b4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', (select id from public.employees), 'Updated worker', 'updated@example.test', 'Supervisor', 'full_time', false)$$,
  'owner can edit and archive');
select extensions.ok((select name = 'Updated worker' and email = 'updated@example.test' and role_title = 'Supervisor' and employment_type = 'full_time' and not active from public.employees), 'edited fields persist');
select extensions.is((select count(*)::integer from public.shifts), 1, 'archive preserves original shift history');
select extensions.throws_ok(
  $$select public.save_shift('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', (select id from public.employees), 'Server', '2031-06-03 09:00', '2031-06-03 10:00', 0)$$,
  'P0001', 'Employee is not eligible for this department', 'archived staff cannot receive new shifts');
select extensions.throws_ok(
  $$select public.save_employee_profile('b4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000003', null, 'Outside', '', 'Server', 'casual', true)$$,
  'P0001', 'Permission denied', 'cross-business profile creation denied');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.save_employee_profile('b4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', null, 'Wrong department', '', 'Cook', 'casual', true)$$,
  'P0001', 'Permission denied', 'FOH manager cannot create BOH staff');
select extensions.lives_ok(
  $$select public.save_employee_profile('b4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', (select id from public.employees), 'Reactivated', '', 'Server', 'part_time', true)$$,
  'assigned manager can reactivate profile');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.save_employee_profile('b4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', null, 'Forbidden', '', 'Server', 'casual', true)$$,
  'P0001', 'Permission denied', 'employee cannot maintain staff');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.save_employee_profile('b4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', null, 'Forbidden', '', 'Server', 'casual', true)$$,
  '42501', 'permission denied for function save_employee_profile', 'anonymous access denied');
select * from extensions.finish();
rollback;
