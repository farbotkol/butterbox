begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select extensions.plan(32);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1000000-0000-4000-8000-000000000001', 'tenant-a-owner@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000002', 'tenant-b-owner@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000003', 'tenant-a-employee@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000004', 'tenant-a-member@example.test', '{}'::jsonb);

insert into public.businesses (id, name)
values
  ('b1000000-0000-4000-8000-000000000001', 'Tenant A'),
  ('b1000000-0000-4000-8000-000000000002', 'Tenant B');

insert into public.venues (id, business_id, name)
values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Venue A'),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'Venue B');

insert into public.departments (id, business_id, venue_id, name)
values
  ('d1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'FOH'),
  ('d1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'FOH');

insert into public.business_memberships (business_id, user_id, role, department_id)
values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner', null),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'owner', null),
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'employee', 'd1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'employee', null);

insert into public.job_roles (id, business_id, venue_id, department_id, name)
values
  ('e1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Server'),
  ('e1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Server');

insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title)
values
  ('f1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'Employee A', 'Server'),
  ('f1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', null, 'Employee B', 'Server');

insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published)
values
  ('01000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Server', '2031-06-02 09:00+00', '2031-06-02 10:00+00', true),
  ('01000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'Server', '2031-06-02 09:00+00', '2031-06-02 10:00+00', true),
  ('01000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Server', '2031-06-03 09:00+00', '2031-06-03 10:00+00', false);

select extensions.throws_ok(
  $$update public.venues set business_id = 'b1000000-0000-4000-8000-000000000002' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', 'Business association is immutable', 'a venue cannot move to another business');
select extensions.throws_ok(
  $$update public.departments set business_id = 'b1000000-0000-4000-8000-000000000002' where id = 'd1000000-0000-4000-8000-000000000001'$$,
  '23514', 'Business association is immutable', 'a department cannot move to another business');
select extensions.throws_ok(
  $$update public.business_memberships set business_id = 'b1000000-0000-4000-8000-000000000002' where user_id = 'a1000000-0000-4000-8000-000000000004'$$,
  '23514', 'Business association is immutable', 'a membership cannot move to another business');
select extensions.throws_ok(
  $$update public.job_roles set business_id = 'b1000000-0000-4000-8000-000000000002' where id = 'e1000000-0000-4000-8000-000000000001'$$,
  '23514', 'Business association is immutable', 'a job role cannot move to another business');
select extensions.throws_ok(
  $$update public.employees set business_id = 'b1000000-0000-4000-8000-000000000002' where id = 'f1000000-0000-4000-8000-000000000001'$$,
  '23514', 'Business association is immutable', 'an employee cannot move to another business');
select extensions.throws_ok(
  $$update public.shifts set business_id = 'b1000000-0000-4000-8000-000000000002' where id = '01000000-0000-4000-8000-000000000001'$$,
  '23514', 'Business association is immutable', 'a shift cannot move to another business');
select extensions.lives_ok(
  $$update public.venues set business_id = business_id where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'an unchanged business association remains valid');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select extensions.is((select count(*)::integer from public.businesses), 1, 'owner A sees one business');
select extensions.is((select count(*)::integer from public.businesses where id = 'b1000000-0000-4000-8000-000000000002'), 0, 'owner A cannot read business B');
select extensions.is((select count(*)::integer from public.venues where id = 'c1000000-0000-4000-8000-000000000002'), 0, 'owner A cannot read venue B');
select extensions.is((select count(*)::integer from public.departments where id = 'd1000000-0000-4000-8000-000000000002'), 0, 'owner A cannot read department B');
select extensions.is((select count(*)::integer from public.business_memberships where user_id = 'a1000000-0000-4000-8000-000000000002'), 0, 'owner A cannot read membership B');
select extensions.is((select count(*)::integer from public.job_roles where id = 'e1000000-0000-4000-8000-000000000002'), 0, 'owner A cannot read role B');
select extensions.is((select count(*)::integer from public.employees where id = 'f1000000-0000-4000-8000-000000000002'), 0, 'owner A cannot read employee B');
select extensions.is((select count(*)::integer from public.shifts where id = '01000000-0000-4000-8000-000000000002'), 0, 'owner A cannot read shift B');
select extensions.is((select count(*)::integer from public.shifts), 2, 'owner A can read their own draft and published shifts');

select extensions.throws_ok(
  $$insert into public.venues (business_id, name) values ('b1000000-0000-4000-8000-000000000002', 'Intruder')$$,
  '42501', 'permission denied for table venues', 'direct cross-tenant venue creation is denied');
select extensions.throws_ok(
  $$update public.shifts set role_title = 'Intruder' where id = '01000000-0000-4000-8000-000000000002'$$,
  '42501', 'permission denied for table shifts', 'direct cross-tenant shift updates are denied');
select extensions.throws_ok(
  $$delete from public.shifts where id = '01000000-0000-4000-8000-000000000002'$$,
  '42501', 'permission denied for table shifts', 'direct cross-tenant shift deletion is denied');
select extensions.throws_ok(
  $$select public.save_shift('b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', null, 'Server', '2031-06-02 09:00', '2031-06-02 10:00', 0)$$,
  'P0001', 'Permission denied', 'owner A cannot create a shift in business B');
select extensions.throws_ok(
  $$select public.publish_roster('b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', '2026-10-26')$$,
  'P0001', 'Permission denied', 'owner A cannot publish business B');
select extensions.throws_ok(
  $$select public.delete_shift('01000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Permission denied', 'owner A cannot delete a shift in business B');
select extensions.lives_ok(
  $$select public.save_shift('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', null, 'Server', '2031-06-04 09:00', '2031-06-04 10:00', 0)$$,
  'owner A can create a shift in their own business');
select extensions.lives_ok(
  $$select public.publish_roster('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', '2026-10-26')$$,
  'owner A can publish their own business');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.businesses), 1, 'owner B sees one business');
select extensions.is((select count(*)::integer from public.businesses where id = 'b1000000-0000-4000-8000-000000000001'), 0, 'owner B cannot read business A');
select extensions.is((select count(*)::integer from public.shifts where business_id = 'b1000000-0000-4000-8000-000000000001'), 0, 'owner B cannot read business A shifts');
select extensions.throws_ok(
  $$select public.delete_shift('01000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'owner B cannot delete a shift in business A');
select extensions.throws_ok(
  $$select public.save_shift('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', null, 'Server', '2031-06-02 09:00', '2031-06-02 10:00', 0)$$,
  'P0001', 'Permission denied', 'owner B cannot create a shift in business A');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.shifts), 1, 'an employee sees only their own published shift');
select extensions.is((select count(*)::integer from public.businesses where id = 'b1000000-0000-4000-8000-000000000002'), 0, 'an employee cannot read another business');
select extensions.throws_ok(
  $$select public.save_shift('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', null, 'Server', '2031-06-02 09:00', '2031-06-02 10:00', 0)$$,
  'P0001', 'Permission denied', 'an employee cannot create a shift');

select * from extensions.finish();
rollback;
