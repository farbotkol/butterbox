begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(25);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a8000000-0000-4000-8000-000000000001', 'md-owner@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000002', 'md-gm@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000003', 'md-foh@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000004', 'md-boh@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000005', 'md-staff@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000006', 'md-outsider@example.test', '{}'::jsonb);

insert into public.businesses (id, name) values
  ('b8000000-0000-4000-8000-000000000001', 'Multi dept business'),
  ('b8000000-0000-4000-8000-000000000002', 'Other multi dept business');
insert into public.venues (id, business_id, name, timezone) values
  ('c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'Main venue', 'UTC'),
  ('c8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'Second venue', 'UTC');
insert into public.departments (id, business_id, venue_id, name, active) values
  ('d8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Front of House', true),
  ('d8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Back of House', true),
  ('d8000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000002', 'Other venue FOH', true),
  ('d8000000-0000-4000-8000-000000000004', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Closed bar', false);
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002', 'general_manager', 'c8000000-0000-4000-8000-000000000001', null),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000003', 'foh_manager', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004', 'boh_manager', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000002'),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000005', 'employee', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, name, role_title, auth_user_id) values
  ('e8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'Shared worker', 'Server', 'a8000000-0000-4000-8000-000000000005'),
  ('e8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'FOH only worker', 'Server', null);

-- Criterion 3: staff can belong to multiple departments.
select extensions.is(
  (select count(*)::integer from public.employee_departments where business_id = 'b8000000-0000-4000-8000-000000000001'::uuid),
  2, 'new employees are linked to their primary department');

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.employees where id = 'e8000000-0000-4000-8000-000000000001'::uuid), 0,
  'BOH manager cannot see a FOH-only worker');
select extensions.throws_ok($$select public.save_shift('b8000000-0000-4000-8000-000000000001'::uuid, 'c8000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000002'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, 'Runner', '2031-07-01 09:00', '2031-07-01 13:00', 0)$$, 'P0001',
  'Employee is not eligible for this department', 'BOH manager cannot roster an unlinked FOH worker');
reset role;

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.set_employee_departments('b8000000-0000-4000-8000-000000000001'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, array['d8000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000002'::uuid])$$, 'P0001',
  'Permission denied', 'department managers cannot change department membership');
reset role;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000006', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.set_employee_departments('b8000000-0000-4000-8000-000000000001'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, array['d8000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000002'::uuid])$$, 'P0001',
  'Permission denied', 'another business owner cannot change department membership');
reset role;

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.set_employee_departments('b8000000-0000-4000-8000-000000000001'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, array['d8000000-0000-4000-8000-000000000003'::uuid])$$, 'P0001',
  'Department not found', 'departments must belong to the employee venue');
select extensions.throws_ok(
  $$select public.set_employee_departments('b8000000-0000-4000-8000-000000000001'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, array['d8000000-0000-4000-8000-000000000004'::uuid])$$, 'P0001',
  'Department is inactive', 'inactive departments cannot be newly linked');
select extensions.lives_ok(
  $$select public.set_employee_departments('b8000000-0000-4000-8000-000000000001'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, array['d8000000-0000-4000-8000-000000000002'::uuid])$$,
  'owner links a worker to BOH');
select extensions.results_eq(
  $$select department_id from public.employee_departments where employee_id = 'e8000000-0000-4000-8000-000000000001'::uuid order by department_id$$,
  $$values ('d8000000-0000-4000-8000-000000000001'::uuid), ('d8000000-0000-4000-8000-000000000002'::uuid)$$,
  'the primary department is always retained');
reset role;

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.employees where id = 'e8000000-0000-4000-8000-000000000001'::uuid), 1,
  'BOH manager can see a linked worker');
select extensions.is(
  (select count(*)::integer from public.employees where id = 'e8000000-0000-4000-8000-000000000002'::uuid), 0,
  'BOH manager still cannot see unlinked FOH staff');
select extensions.lives_ok($$select public.save_shift('b8000000-0000-4000-8000-000000000001'::uuid, 'c8000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000002'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, 'Runner', '2031-07-01 09:00', '2031-07-01 13:00', 0)$$, 'BOH manager rosters the linked worker in BOH');
select extensions.throws_ok($$select public.save_shift('b8000000-0000-4000-8000-000000000001'::uuid, 'c8000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000002'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, 'Runner', '2031-07-01 10:00', '2031-07-01 13:00', 0)$$, 'P0001',
  'Employee has an overlapping shift', 'overlaps are detected across departments');
reset role;

-- Criterion 1: managers edit only their assigned departments.
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.lives_ok($$select public.save_shift('b8000000-0000-4000-8000-000000000001'::uuid, 'c8000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000001'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, 'Runner', '2031-07-02 09:00', '2031-07-02 13:00', 0)$$, 'FOH manager rosters the worker in FOH');
select extensions.throws_ok($$select public.save_shift('b8000000-0000-4000-8000-000000000001'::uuid, 'c8000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000002'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, 'Runner', '2031-07-03 09:00', '2031-07-03 13:00', 0)$$, 'P0001',
  'Permission denied', 'FOH manager cannot add BOH shifts');
select extensions.throws_ok(
  $$select public.publish_roster('b8000000-0000-4000-8000-000000000001'::uuid, 'c8000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000002'::uuid, '2031-06-30')$$, 'P0001',
  'Permission denied', 'FOH manager cannot publish the BOH roster');
select extensions.is(
  (select count(*)::integer from public.shifts where business_id = 'b8000000-0000-4000-8000-000000000001'::uuid), 1,
  'FOH manager sees only FOH shifts');
reset role;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.publish_roster('b8000000-0000-4000-8000-000000000001'::uuid, 'c8000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000002'::uuid, '2031-06-30')$$, 'BOH manager publishes BOH');
select extensions.is(
  (select count(*)::integer from public.shifts where business_id = 'b8000000-0000-4000-8000-000000000001'::uuid), 1,
  'BOH manager sees only BOH shifts');
reset role;

-- Criterion 2: owner and venue GM have a consolidated view.
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.results_eq(
  $$select d.name from public.shifts s join public.departments d on d.id = s.department_id
    where s.business_id = 'b8000000-0000-4000-8000-000000000001'::uuid order by d.name$$,
  $$values ('Back of House'::text), ('Front of House'::text)$$,
  'owner sees shifts across every department');
reset role;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.shifts where business_id = 'b8000000-0000-4000-8000-000000000001'::uuid), 2,
  'general manager sees both departments in the venue');
select extensions.lives_ok(
  $$select public.set_employee_departments('b8000000-0000-4000-8000-000000000001'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, array['d8000000-0000-4000-8000-000000000001'::uuid])$$,
  'general manager removes the BOH link');
reset role;

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.shifts where business_id = 'b8000000-0000-4000-8000-000000000001'::uuid), 0,
  'worker cannot see their published BOH shift after being unlinked');
reset role;
select extensions.is(
  (select count(*)::integer from public.shifts where business_id = 'b8000000-0000-4000-8000-000000000001'::uuid and department_id = 'd8000000-0000-4000-8000-000000000002'::uuid), 1,
  'existing BOH shift history is retained after unlinking');
insert into public.employee_departments (business_id, employee_id, department_id) values ('b8000000-0000-4000-8000-000000000001'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000002'::uuid);
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.shifts where business_id = 'b8000000-0000-4000-8000-000000000001'::uuid), 1,
  'linked worker sees their own published shift in a secondary department');
reset role;

select * from extensions.finish();
rollback;
