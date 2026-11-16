begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7300000-0000-4000-8000-000000000001', 'mobile-owner@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000002', 'mobile-manager@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000003', 'mobile-worker@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000004', 'outside-owner@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7300000-0000-4000-8000-000000000001', 'Mobile test business'),
  ('b7300000-0000-4000-8000-000000000002', 'Outside business');
insert into public.venues (id, business_id, name) values
  ('c7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'Mobile venue'),
  ('c7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000002', 'Outside venue');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'FOH'),
  ('d7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'BOH'),
  ('d7300000-0000-4000-8000-000000000003', 'b7300000-0000-4000-8000-000000000002', 'c7300000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000002', 'foh_manager', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001'),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000003', 'employee', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001'),
  ('b7300000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-000000000004', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title, mobile_phone) values
  ('e7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000003', 'Linked worker', 'Server', '+61400000000'),
  ('e7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002', null, 'BOH worker', 'Cook', null);

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.create_employee_profile_idempotent(
    'b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
    'New worker', '', 'Server', 'casual', true, '04 1234 5678',
    '17300000-0000-4000-8000-000000000001'
  )$$,
  'creation saves the original employee');
select extensions.is((select mobile_phone from public.employees where name = 'New worker'),
  '+61412345678', 'Australian mobile is normalized before persistence');
select extensions.is(
  public.create_employee_profile_idempotent(
    'b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
    'New worker', '', 'Server', 'casual', true, '0412345678',
    '17300000-0000-4000-8000-000000000001'
  ),
  (select id from public.employees where name = 'New worker'),
  'normalized retry returns the original employee');
select extensions.throws_ok(
  $$select public.create_employee_profile_idempotent(
    'b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
    'New worker', '', 'Server', 'casual', true, '+14155552671',
    '17300000-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'Request identifier already used', 'a creation retry cannot change its mobile number');
select extensions.throws_ok(
  $$select public.save_employee_profile_mobile_checked_v3(
    'b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
    (select id from public.employees where name = 'New worker'), 'New worker', '',
    'Server', 'casual', true, 0,
    (select profile_revision from public.employees where name = 'New worker'), false,
    '041234567'
  )$$,
  'P0001', 'Invalid mobile number', 'malformed numbers are rejected server-side');
select extensions.lives_ok(
  $$select public.save_employee_profile_mobile_checked_v3(
    'b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
    (select id from public.employees where name = 'New worker'), 'New worker', '',
    'Server', 'casual', true, 0,
    (select profile_revision from public.employees where name = 'New worker'), false,
    '+14155552671'
  )$$,
  'an authorized manager can save an international number');
select extensions.is((select mobile_phone from public.employees where name = 'New worker'),
  '+14155552671', 'international number persists in E.164 form');
select extensions.lives_ok(
  $$select public.save_employee_profile_mobile_checked_v3(
    'b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
    (select id from public.employees where name = 'New worker'), 'New worker', '',
    'Server', 'casual', true, 0,
    (select profile_revision from public.employees where name = 'New worker'), false, ''
  )$$,
  'an empty number clears the stored contact');
select extensions.is((select mobile_phone from public.employees where name = 'New worker'),
  null, 'clearing a number stores null');
select extensions.is((select count(*)::integer from public.sensitive_action_audit
  where source_table = 'employees' and record_id = (select id::text from public.employees where name = 'New worker')
    and (old_values ? 'mobile_phone' or new_values ? 'mobile_phone')), 0,
  'employee audit entries do not contain mobile numbers');
select extensions.is((select mobile_phone from public.employees
  where id = 'e7300000-0000-4000-8000-000000000001'), '+61400000000',
  'owner can read employee contact data in their business');
select extensions.throws_ok(
  $$select public.save_employee_profile_mobile_checked_v3(
    'b7300000-0000-4000-8000-000000000002', 'd7300000-0000-4000-8000-000000000003',
    'e7300000-0000-4000-8000-000000000002', 'Outside', '', 'Cook',
    'casual', true, 0, 0, false, '+14155552671'
  )$$,
  'P0001', 'Permission denied', 'cross-business updates are denied');

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.save_employee_profile_mobile_checked_v3(
    'b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002',
    'e7300000-0000-4000-8000-000000000002', 'BOH worker', '', 'Cook',
    'casual', true, 0, 0, false, '+14155552671'
  )$$,
  'P0001', 'Permission denied', 'an out-of-scope manager cannot update phone data');
select extensions.is((select count(*)::integer from public.employees
  where id = 'e7300000-0000-4000-8000-000000000002'), 0,
  'an out-of-scope manager cannot read the employee contact row');

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000003', true);
select extensions.is((select mobile_phone from public.employees
  where id = 'e7300000-0000-4000-8000-000000000001'), '+61400000000',
  'a linked employee can read their own mobile number');
select extensions.is((select count(*)::integer from public.employees
  where id = 'e7300000-0000-4000-8000-000000000002'), 0,
  'a linked employee cannot read another employee mobile number');

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.employees
  where id = 'e7300000-0000-4000-8000-000000000001'), 0,
  'another business cannot read the mobile number');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.create_employee_profile_idempotent(
    'b7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
    'Anonymous worker', '', 'Server', 'casual', true, '', '17300000-0000-4000-8000-000000000002'
  )$$,
  '42501', 'permission denied for function create_employee_profile_idempotent',
  'anonymous callers cannot create employee contact data');

select * from extensions.finish();
rollback;
