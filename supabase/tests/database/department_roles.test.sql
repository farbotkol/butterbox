begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(31);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-4000-8000-000000000001', 'org-owner@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000002', 'org-gm@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000003', 'org-foh@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000004', 'org-employee@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000005', 'org-outsider@example.test', '{}'::jsonb);

-- Criterion 1: FOH and BOH are seeded during business setup.
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.create_business('Org test business', 'Org venue', 'Australia/Sydney', false)$$,
  'owner creates a business');
select extensions.results_eq(
  $$select name from public.departments order by name$$,
  $$values ('Back of House'::text), ('Front of House'::text)$$,
  'FOH and BOH are seeded');
select extensions.ok(
  (select bool_and(active) from public.departments), 'seeded departments are active');
reset role;

create temporary table org_ids as
select b.id as business_id, v.id as venue_id,
  (select id from public.departments d where d.venue_id = v.id and d.name = 'Front of House') as foh_id,
  (select id from public.departments d where d.venue_id = v.id and d.name = 'Back of House') as boh_id
from public.businesses b join public.venues v on v.business_id = b.id
where b.name = 'Org test business';
grant select on org_ids to authenticated, anon;

insert into public.businesses (id, name) values ('b7000000-0000-4000-8000-000000000002', 'Other org business');
insert into public.venues (id, business_id, name) values
  ('c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000002', 'Other org venue');
insert into public.venues (id, business_id, name)
select 'c7000000-0000-4000-8000-000000000003', business_id, 'Second org venue' from org_ids;
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id)
select business_id, 'a7000000-0000-4000-8000-000000000002'::uuid, 'general_manager'::text, venue_id, null::uuid from org_ids
union all
select business_id, 'a7000000-0000-4000-8000-000000000003'::uuid, 'foh_manager', venue_id, foh_id from org_ids
union all
select business_id, 'a7000000-0000-4000-8000-000000000004'::uuid, 'employee', venue_id, foh_id from org_ids;
insert into public.business_memberships (business_id, user_id, role)
values ('b7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000005', 'owner');

-- Criterion 2: custom departments and roles can be created and deactivated.
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.save_department((select business_id from org_ids), (select venue_id from org_ids), null, ' Bar ', true)$$,
  'owner creates a custom department');
select extensions.is(
  (select count(*)::integer from public.departments where name = 'Bar' and active), 1,
  'custom department name is trimmed and active');
select extensions.throws_ok(
  $$select public.save_department((select business_id from org_ids), (select venue_id from org_ids), null, 'bar', true)$$,
  'P0001', 'Department name already exists', 'duplicate department name rejected case-insensitively');
select extensions.throws_ok(
  $$select public.save_department((select business_id from org_ids), (select venue_id from org_ids), null, '   ', true)$$,
  'P0001', 'Invalid department details', 'blank department name rejected');
select extensions.lives_ok(
  $$select public.save_job_role((select business_id from org_ids), (select id from public.departments where name = 'Bar'), null, 'Mixologist', true)$$,
  'owner creates a custom job role');
select extensions.throws_ok(
  $$select public.save_job_role((select business_id from org_ids), (select id from public.departments where name = 'Bar'), null, 'MIXOLOGIST', true)$$,
  'P0001', 'Job role name already exists', 'duplicate role name rejected');
select extensions.lives_ok(
  $$select public.save_employee_profile((select business_id from org_ids), (select id from public.departments where name = 'Bar'), null, 'Bar worker', '', 'Mixologist', 'casual', true)$$,
  'staff can join an active custom department');
select extensions.lives_ok(
  $$select public.save_shift((select business_id from org_ids), (select venue_id from org_ids), (select id from public.departments where name = 'Bar'), (select id from public.employees where name = 'Bar worker'), 'Mixologist', '2031-07-01 17:00', '2031-07-01 22:00', 0)$$,
  'a historical shift is created before deactivation');
select extensions.lives_ok(
  $$select public.save_job_role((select business_id from org_ids), (select id from public.departments where name = 'Bar'), (select id from public.job_roles where name = 'Mixologist'), 'Mixologist', false)$$,
  'owner deactivates a job role');
select extensions.throws_ok(
  $$select public.save_shift((select business_id from org_ids), (select venue_id from org_ids), (select id from public.departments where name = 'Bar'), null, 'mixologist', '2031-07-02 17:00', '2031-07-02 22:00', 0)$$,
  'P0001', 'Job role is inactive', 'inactive role cannot be used for new shifts');
select extensions.lives_ok(
  $$select public.save_department((select business_id from org_ids), (select venue_id from org_ids), (select id from public.departments where name = 'Bar'), 'Bar', false)$$,
  'owner deactivates a custom department');
select extensions.ok(
  not (select active from public.departments where name = 'Bar'), 'department is inactive');
select extensions.throws_ok(
  $$select public.save_shift((select business_id from org_ids), (select venue_id from org_ids), (select id from public.departments where name = 'Bar'), null, 'Bartender', '2031-07-03 17:00', '2031-07-03 22:00', 0)$$,
  'P0001', 'Department is inactive', 'inactive department cannot receive new shifts');
select extensions.throws_ok(
  $$select public.save_employee_profile((select business_id from org_ids), (select id from public.departments where name = 'Bar'), null, 'New bar worker', '', 'Bartender', 'casual', true)$$,
  'P0001', 'Department is inactive', 'inactive department cannot receive new staff');
select extensions.throws_ok(
  $$select public.save_job_role((select business_id from org_ids), (select id from public.departments where name = 'Bar'), null, 'Barback', true)$$,
  'P0001', 'Department is inactive', 'active roles cannot be added to an inactive department');

-- Criterion 3: existing shifts retain historical references.
select extensions.is(
  (select count(*)::integer from public.shifts s
   join public.departments d on d.id = s.department_id
   where d.name = 'Bar' and s.role_title = 'Mixologist'), 1,
  'existing shift keeps its department and role after deactivation');
select extensions.lives_ok(
  $$select public.save_department((select business_id from org_ids), (select venue_id from org_ids), (select id from public.departments where name = 'Bar'), 'Cocktail Bar', false)$$,
  'inactive department can be renamed');
select extensions.is(
  (select d.name from public.shifts s join public.departments d on d.id = s.department_id
   where s.role_title = 'Mixologist'), 'Cocktail Bar',
  'historical shift follows the department ID, not a copied name');
select extensions.lives_ok(
  $$select public.save_department((select business_id from org_ids), (select venue_id from org_ids), (select id from public.departments where name = 'Cocktail Bar'), 'Cocktail Bar', true)$$,
  'department can be reactivated');
select extensions.lives_ok(
  $$select public.save_shift((select business_id from org_ids), (select venue_id from org_ids), (select id from public.departments where name = 'Cocktail Bar'), null, 'Bartender', '2031-07-04 17:00', '2031-07-04 22:00', 0)$$,
  'reactivated department accepts new shifts');

-- Permissions and tenant isolation.
select extensions.throws_ok(
  $$select public.save_department('b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000002', null, 'Stolen', true)$$,
  'P0001', 'Permission denied', 'owner cannot create a department in another business');
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000002', true);
select extensions.lives_ok(
  $$select public.save_department((select business_id from org_ids), (select venue_id from org_ids), null, 'Events', true)$$,
  'general manager creates a department in their venue');
select extensions.throws_ok(
  $$select public.save_department((select business_id from org_ids), 'c7000000-0000-4000-8000-000000000003', null, 'Elsewhere', true)$$,
  'P0001', 'Permission denied', 'general manager cannot create a department in another venue');
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000003', true);
select extensions.lives_ok(
  $$select public.save_job_role((select business_id from org_ids), (select foh_id from org_ids), null, 'Host', true)$$,
  'FOH manager creates a role in their department');
select extensions.throws_ok(
  $$select public.save_job_role((select business_id from org_ids), (select boh_id from org_ids), null, 'Sous Chef', true)$$,
  'P0001', 'Permission denied', 'FOH manager cannot create a BOH role');
select extensions.throws_ok(
  $$select public.save_department((select business_id from org_ids), (select venue_id from org_ids), (select foh_id from org_ids), 'Front of House', false)$$,
  'P0001', 'Permission denied', 'department manager cannot deactivate departments');
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.save_job_role((select business_id from org_ids), (select foh_id from org_ids), null, 'Forbidden', true)$$,
  'P0001', 'Permission denied', 'employee cannot manage roles');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.save_department((select business_id from org_ids), (select venue_id from org_ids), null, 'Anon', true)$$,
  '42501', 'permission denied for function save_department', 'anonymous access denied');
reset role;
select * from extensions.finish();
rollback;
