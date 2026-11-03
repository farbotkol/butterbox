begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users(id, email, raw_user_meta_data) values
  ('a7700000-0000-4000-8000-000000000001', 'scoped-payroll-owner@example.test', '{}'),
  ('a7700000-0000-4000-8000-000000000002', 'scoped-payroll-admin@example.test', '{}'),
  ('a7700000-0000-4000-8000-000000000003', 'scoped-payroll-manager@example.test', '{}'),
  ('a7700000-0000-4000-8000-000000000004', 'scoped-payroll-outside@example.test', '{}');
insert into public.businesses(id, name) values
  ('b7700000-0000-4000-8000-000000000001', 'Scoped mapping cafe'),
  ('b7700000-0000-4000-8000-000000000002', 'Outside mapping cafe');
insert into public.venues(id, business_id, name) values
  ('c7700000-0000-4000-8000-000000000001', 'b7700000-0000-4000-8000-000000000001', 'First venue'),
  ('c7700000-0000-4000-8000-000000000002', 'b7700000-0000-4000-8000-000000000001', 'Second venue'),
  ('c7700000-0000-4000-8000-000000000003', 'b7700000-0000-4000-8000-000000000002', 'Outside');
insert into public.departments(id, business_id, venue_id, name) values
  ('d7700000-0000-4000-8000-000000000001', 'b7700000-0000-4000-8000-000000000001', 'c7700000-0000-4000-8000-000000000001', 'FOH'),
  ('d7700000-0000-4000-8000-000000000002', 'b7700000-0000-4000-8000-000000000001', 'c7700000-0000-4000-8000-000000000002', 'FOH'),
  ('d7700000-0000-4000-8000-000000000003', 'b7700000-0000-4000-8000-000000000002', 'c7700000-0000-4000-8000-000000000003', 'FOH');
insert into public.business_memberships(business_id, user_id, role, venue_id, department_id) values
  ('b7700000-0000-4000-8000-000000000001', 'a7700000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7700000-0000-4000-8000-000000000001', 'a7700000-0000-4000-8000-000000000002', 'admin', null, null),
  ('b7700000-0000-4000-8000-000000000001', 'a7700000-0000-4000-8000-000000000003', 'foh_manager', 'c7700000-0000-4000-8000-000000000001', 'd7700000-0000-4000-8000-000000000001'),
  ('b7700000-0000-4000-8000-000000000002', 'a7700000-0000-4000-8000-000000000004', 'owner', null, null);
insert into public.employees(id, business_id, venue_id, department_id, name, role_title) values
  ('e7700000-0000-4000-8000-000000000001', 'b7700000-0000-4000-8000-000000000001', 'c7700000-0000-4000-8000-000000000001', 'd7700000-0000-4000-8000-000000000001', 'First', 'Server'),
  ('e7700000-0000-4000-8000-000000000002', 'b7700000-0000-4000-8000-000000000001', 'c7700000-0000-4000-8000-000000000001', 'd7700000-0000-4000-8000-000000000001', 'Second', 'Server'),
  ('e7700000-0000-4000-8000-000000000003', 'b7700000-0000-4000-8000-000000000001', 'c7700000-0000-4000-8000-000000000002', 'd7700000-0000-4000-8000-000000000002', 'Other venue', 'Server'),
  ('e7700000-0000-4000-8000-000000000004', 'b7700000-0000-4000-8000-000000000002', 'c7700000-0000-4000-8000-000000000003', 'd7700000-0000-4000-8000-000000000003', 'Outside', 'Server');

create function pg_temp.scoped_mapping(
  p_employee uuid, p_external text, p_revision integer default 0,
  p_venue uuid default 'c7700000-0000-4000-8000-000000000001',
  p_connection uuid default 'f7700000-0000-4000-8000-000000000001',
  p_destination_confirmed boolean default true, p_removal_confirmed boolean default false
) returns uuid language sql as $$
  select public.set_payroll_employee_mapping_scoped(
    'b7700000-0000-4000-8000-000000000001', p_venue, p_connection, p_employee,
    p_revision, p_external, 'Verified against payroll account', gen_random_uuid(),
    p_destination_confirmed, p_removal_confirmed
  );
$$;

set local role anon;
select extensions.throws_ok($$select pg_temp.scoped_mapping('e7700000-0000-4000-8000-000000000001', 'Staff-1')$$,
  '42501', 'permission denied for function set_payroll_employee_mapping_scoped', 'anonymous cannot call the checked mapping');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000001', true);
select public.create_payroll_mapping_connection(
  'b7700000-0000-4000-8000-000000000001', 'f7700000-0000-4000-8000-000000000001', 'xero', 'org-1', 'Mapping only'
);
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000004', true);
select public.create_payroll_mapping_connection(
  'b7700000-0000-4000-8000-000000000002', 'f7700000-0000-4000-8000-000000000002', 'xero', 'outside', 'Outside'
);
select extensions.throws_ok($$select pg_temp.scoped_mapping('e7700000-0000-4000-8000-000000000001', 'Staff-1')$$,
  'P0001', 'Permission denied', 'outside owners cannot edit another business');
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select pg_temp.scoped_mapping('e7700000-0000-4000-8000-000000000001', 'Staff-1')$$,
  'P0001', 'Permission denied', 'department managers cannot edit mappings');
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$select pg_temp.scoped_mapping(
  'e7700000-0000-4000-8000-000000000001', 'Staff-1', 0,
  'c7700000-0000-4000-8000-000000000001', 'f7700000-0000-4000-8000-000000000001', false)$$,
  'P0001', 'Confirm payroll destination', 'destination confirmation is required');
select extensions.throws_ok($$select pg_temp.scoped_mapping(
  'e7700000-0000-4000-8000-000000000003', 'Staff-3')$$,
  'P0001', 'Employee unavailable or permission denied', 'another venue in the same business is rejected');
select extensions.throws_ok($$select pg_temp.scoped_mapping(
  'e7700000-0000-4000-8000-000000000004', 'Staff-4')$$,
  'P0001', 'Employee unavailable or permission denied', 'another business employee is rejected');
select extensions.throws_ok($$select pg_temp.scoped_mapping(
  'e7700000-0000-4000-8000-000000000001', 'Staff-1', 0,
  'c7700000-0000-4000-8000-000000000001', 'f7700000-0000-4000-8000-000000000002')$$,
  'P0001', 'Payroll connection unavailable or permission denied', 'another business destination is rejected');
select extensions.lives_ok($$select pg_temp.scoped_mapping('e7700000-0000-4000-8000-000000000001', 'Staff-1')$$,
  'owner saves an explicitly confirmed scoped mapping');
select extensions.throws_ok($$select public.set_payroll_employee_mapping(
  'b7700000-0000-4000-8000-000000000001', 'f7700000-0000-4000-8000-000000000001',
  'e7700000-0000-4000-8000-000000000001', 1, null, 'Unconfirmed direct removal', gen_random_uuid())$$,
  '42501', 'permission denied for function set_payroll_employee_mapping',
  'authenticated owners cannot bypass confirmation through the legacy function');
select extensions.ok(not has_function_privilege('authenticated',
  'public.set_payroll_employee_mapping(uuid,uuid,uuid,integer,text,text,uuid)', 'execute')
  and not has_function_privilege('anon',
    'public.set_payroll_employee_mapping(uuid,uuid,uuid,integer,text,text,uuid)', 'execute')
  and not has_function_privilege('service_role',
    'public.set_payroll_employee_mapping(uuid,uuid,uuid,integer,text,text,uuid)', 'execute'),
  'only the checked function can invoke the legacy mutation');
select extensions.throws_ok($$select pg_temp.scoped_mapping('e7700000-0000-4000-8000-000000000002', 'Staff-1')$$,
  'P0001', 'Payroll employee ID is already mapped to another employee', 'duplicate exact IDs are rejected');
select extensions.lives_ok($$select pg_temp.scoped_mapping('e7700000-0000-4000-8000-000000000002', 'staff-1')$$,
  'case-distinct IDs remain distinct');
select extensions.throws_ok($$select pg_temp.scoped_mapping('e7700000-0000-4000-8000-000000000001', 'Staff-2')$$,
  'P0001', 'Payroll mapping changed; refresh before saving', 'stale revisions are rejected');
select extensions.throws_ok($$select pg_temp.scoped_mapping('e7700000-0000-4000-8000-000000000001', null, 1)$$,
  'P0001', 'Confirm mapping removal', 'unmapping requires a separate confirmation');
select extensions.lives_ok($$select pg_temp.scoped_mapping(
  'e7700000-0000-4000-8000-000000000001', null, 1,
  'c7700000-0000-4000-8000-000000000001', 'f7700000-0000-4000-8000-000000000001', true, true)$$,
  'confirmed unmapping succeeds');
select extensions.is((select external_employee_id from public.list_payroll_employee_mappings(
  'b7700000-0000-4000-8000-000000000001', 'f7700000-0000-4000-8000-000000000001',
  'c7700000-0000-4000-8000-000000000001') where employee_id = 'e7700000-0000-4000-8000-000000000001'),
  null::text, 'confirmed removal persists as missing');
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000002', true);
select extensions.lives_ok($$select pg_temp.scoped_mapping(
  'e7700000-0000-4000-8000-000000000003', 'Staff-3', 0, 'c7700000-0000-4000-8000-000000000002')$$,
  'admin can edit an employee in the selected venue');
reset role;
select extensions.is((select count(*) from public.payroll_employee_mapping_events
  where business_id = 'b7700000-0000-4000-8000-000000000001'), 4::bigint,
  'only committed mapping changes create audit events');
select extensions.is((select count(*) from public.payroll_employee_mapping_events
  where business_id = 'b7700000-0000-4000-8000-000000000001'
    and employee_id = 'e7700000-0000-4000-8000-000000000001'
    and previous_id = 'Staff-1' and external_employee_id is null and revision = 2), 1::bigint,
  'unmapping retains the exact prior ID and revision in the audit history');

select * from extensions.finish();
rollback;
