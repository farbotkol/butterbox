begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(28);

insert into auth.users (id, email, raw_user_meta_data) values
  ('ab000000-0000-4000-8000-000000000001', 'roster-owner@example.test', '{}'::jsonb),
  ('ab000000-0000-4000-8000-000000000002', 'roster-manager@example.test', '{}'::jsonb),
  ('ab000000-0000-4000-8000-000000000003', 'roster-worker@example.test', '{}'::jsonb),
  ('ab000000-0000-4000-8000-000000000004', 'roster-other-worker@example.test', '{}'::jsonb),
  ('ab000000-0000-4000-8000-000000000005', 'roster-outsider@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('bc000000-0000-4000-8000-000000000001', 'Roster business'),
  ('bc000000-0000-4000-8000-000000000002', 'Other roster business');
insert into public.venues (id, business_id, name, timezone) values
  ('cd000000-0000-4000-8000-000000000001', 'bc000000-0000-4000-8000-000000000001', 'Main', 'UTC'),
  ('cd000000-0000-4000-8000-000000000002', 'bc000000-0000-4000-8000-000000000002', 'Other', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('de000000-0000-4000-8000-000000000001', 'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'FOH'),
  ('de000000-0000-4000-8000-000000000002', 'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'BOH'),
  ('de000000-0000-4000-8000-000000000003', 'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'Unlinked'),
  ('de000000-0000-4000-8000-000000000004', 'bc000000-0000-4000-8000-000000000002', 'cd000000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('bc000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('bc000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', 'foh_manager', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001'),
  ('bc000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000003', 'employee', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001'),
  ('bc000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000004', 'employee', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001'),
  ('bc000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('ef000000-0000-4000-8000-000000000001', 'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000003', 'Shared worker', 'Server'),
  ('ef000000-0000-4000-8000-000000000002', 'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000004', 'Other worker', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('bc000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002'),
  ('bc000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000002', 'de000000-0000-4000-8000-000000000002');
insert into public.shifts (business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published) values
  ('bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', 'Server', '2032-03-15 09:00+00', '2032-03-15 12:00+00', true),
  ('bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000001', 'Prep', '2032-03-16 09:00+00', '2032-03-16 12:00+00', true),
  ('bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000001', 'Draft', '2032-03-17 09:00+00', '2032-03-17 12:00+00', false),
  ('bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000002', 'Other', '2032-03-18 09:00+00', '2032-03-18 12:00+00', true);

select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.departments), 1,
  'normal department access remains limited to the primary scope');
select extensions.is((select count(*)::integer from public.list_own_linked_roster_departments(
    'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001')), 2,
  'roster lookup returns primary and secondary departments');
select extensions.ok(not exists(select 1 from public.list_own_linked_roster_departments(
    'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001') where name = 'Unlinked'),
  'roster lookup excludes unlinked departments');
select extensions.is((select count(*)::integer from public.employee_departments
    where employee_id = 'ef000000-0000-4000-8000-000000000001'), 1,
  'normal department-link access remains limited to the primary scope');
select extensions.ok(not exists(select 1 from public.employee_departments
    where employee_id = 'ef000000-0000-4000-8000-000000000002'
      and department_id = 'de000000-0000-4000-8000-000000000002'),
  'employee cannot see another worker''s secondary department link');
select extensions.ok(not exists(select 1 from public.list_own_linked_roster_departments(
    'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001')
    where employee_id <> 'ef000000-0000-4000-8000-000000000001'),
  'roster lookup cannot expose another worker''s links');
select extensions.is((select count(*)::integer from public.shifts), 2,
  'employee sees only their own published shifts in both departments');
select extensions.ok(not exists(select 1 from public.shifts where role_title = 'Draft'),
  'secondary draft shift remains hidden');
select extensions.ok(exists(select 1 from public.list_own_linked_roster_departments(
    'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001')
    where department_id = 'de000000-0000-4000-8000-000000000002' and name = 'BOH' and active),
  'roster lookup supplies the linked department name and status');
select extensions.ok(not public.is_own_linked_shift('bc000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000003'),
  'an unlinked department does not authorize an own shift');
select extensions.is((select count(*)::integer from public.list_own_linked_roster_departments(
    'bc000000-0000-4000-8000-000000000002', 'cd000000-0000-4000-8000-000000000002')), 0,
  'roster lookup cannot reveal cross-tenant departments');

select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.departments), 1,
  'manager cannot see an unrelated secondary department');
select extensions.ok(not exists(select 1 from public.shifts where department_id = 'de000000-0000-4000-8000-000000000002'),
  'manager cannot see secondary shifts without their own link');

reset role;
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title)
values ('ef000000-0000-4000-8000-000000000003', 'bc000000-0000-4000-8000-000000000001',
  'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000002', 'Manager as worker', 'Manager');
insert into public.employee_departments (business_id, employee_id, department_id)
values ('bc000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000003',
  'de000000-0000-4000-8000-000000000002');
insert into public.shifts (business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published) values
  ('bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000003', 'Manager published', '2032-03-19 09:00+00', '2032-03-19 12:00+00', true),
  ('bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000003', 'Manager draft', '2032-03-20 09:00+00', '2032-03-20 12:00+00', false);
set local role authenticated;
select extensions.is((select count(*)::integer from public.list_own_linked_roster_departments(
    'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001')), 2,
  'manager linked as a worker can load their secondary roster department');
select extensions.is((select count(*)::integer from public.departments), 1,
  'a personal link does not broaden normal manager department access');
select extensions.is((select count(*)::integer from public.shifts
    where department_id = 'de000000-0000-4000-8000-000000000002'), 1,
  'manager sees only their own published secondary shift');
select extensions.ok(not public.can_manage_department('bc000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002'),
  'a personal department link does not grant management permission');
select extensions.throws_ok(
  $$select public.save_shift('bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002', null, 'Prep', '2032-03-21 09:00'::timestamp, '2032-03-21 12:00'::timestamp, 0)$$,
  'P0001', 'Permission denied', 'a manager cannot create shifts in the personally linked department');

select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*)::integer from public.shifts), 0,
  'another business cannot view the shifts');
select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*)::integer from public.departments), 3,
  'owner retains the complete department view');

reset role;
update public.business_memberships
set department_id = 'de000000-0000-4000-8000-000000000003'
where business_id = 'bc000000-0000-4000-8000-000000000001'
  and user_id = 'ab000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.shifts), 0,
  'changing membership scope removes access to the former profile shifts');
select extensions.is((select count(*)::integer from public.list_own_linked_roster_departments(
    'bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001')), 0,
  'changing membership scope removes access to former secondary departments');
select extensions.ok(not public.is_own_linked_shift('bc000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002'),
  'changing membership scope invalidates the own-shift authorization');

reset role;
update public.business_memberships
set department_id = 'de000000-0000-4000-8000-000000000001'
where business_id = 'bc000000-0000-4000-8000-000000000001'
  and user_id = 'ab000000-0000-4000-8000-000000000003';
set local role authenticated;
select extensions.is((select count(*)::integer from public.shifts), 2,
  'restoring membership scope restores access to own published shifts');
reset role;
delete from public.business_memberships
where business_id = 'bc000000-0000-4000-8000-000000000001'
  and user_id = 'ab000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.departments), 0,
  'removing membership removes access to linked departments');
select extensions.is((select count(*)::integer from public.employee_departments), 0,
  'removing membership removes access to department links');
select extensions.is((select count(*)::integer from public.shifts), 0,
  'removing membership removes access to published shifts');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select * from public.list_own_linked_roster_departments('bc000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function list_own_linked_roster_departments', 'anonymous linked-department lookup is denied');
select * from extensions.finish();
rollback;
