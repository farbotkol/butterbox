begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7300000-0000-4000-8000-000000000001', 'demo-owner@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000002', 'demo-manager@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000003', 'demo-other-owner@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000004', 'demo-setup-owner@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7300000-0000-4000-8000-000000000001', 'Demo workspace'),
  ('b7300000-0000-4000-8000-000000000002', 'Other workspace');
insert into public.venues (id, business_id, name, timezone) values
  ('c7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'Clean venue', 'Australia/Sydney'),
  ('c7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000002', 'Other venue', 'UTC'),
  ('c7300000-0000-4000-8000-000000000003', 'b7300000-0000-4000-8000-000000000001', 'Real venue', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'Existing FOH'),
  ('d7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000002', 'c7300000-0000-4000-8000-000000000002', 'Other department'),
  ('d7300000-0000-4000-8000-000000000003', 'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000003', 'Real department');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000002', 'foh_manager',
    'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001'),
  ('b7300000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-000000000003', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, name, role_title)
values ('e7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001',
  'c7300000-0000-4000-8000-000000000003', 'd7300000-0000-4000-8000-000000000003',
  'Real employee', 'Server');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at)
values ('f7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001',
  'c7300000-0000-4000-8000-000000000003', 'd7300000-0000-4000-8000-000000000003',
  'e7300000-0000-4000-8000-000000000001', 'Server', '2032-03-29 09:00+00', '2032-03-29 10:00+00');

insert into public.workspace_demo_environment_approval (
  singleton, enabled, environment, project_ref, jwt_issuer
) values (true, false, 'development', 'butterbox-citest', 'http://127.0.0.1:59421/auth/v1');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims',
  '{"sub":"a7300000-0000-4000-8000-000000000004","iss":"http://127.0.0.1:59421/auth/v1","role":"authenticated"}',
  true);
select extensions.is(public.workspace_demo_data_environment_enabled('butterbox-citest'), false,
  'demo data is disabled until an operator approves this project');
select extensions.is(public.workspace_demo_data_environment_enabled('another-project'), false,
  'a different project ref cannot use this approval');
select extensions.throws_ok(
  $$select public.load_workspace_demo_data('b7300000-0000-4000-8000-000000000001',
    'c7300000-0000-4000-8000-000000000001', 'butterbox-citest')$$,
  'P0001', 'Demo data is not enabled for this database', 'the direct loader fails closed by default');
select extensions.throws_ok(
  $$select public.complete_initial_setup('Disabled', 'Venue', '10 Test Street', 'UTC', true)$$,
  'P0001', 'Sample data is not enabled in this environment',
  'direct onboarding cannot seed while the database approval is disabled');
select extensions.throws_ok(
  $$update public.workspace_demo_environment_approval set enabled = true where singleton$$,
  '42501', 'permission denied for table workspace_demo_environment_approval',
  'authenticated owners cannot enable the database policy');
reset role;

update public.workspace_demo_environment_approval set enabled = true where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims',
  '{"sub":"a7300000-0000-4000-8000-000000000002","iss":"http://127.0.0.1:59421/auth/v1","role":"authenticated"}',
  true);
select extensions.is(public.workspace_demo_data_environment_enabled('butterbox-citest'), true,
  'the explicitly approved project is recognized');
select extensions.throws_ok(
  $$select public.load_workspace_demo_data('b7300000-0000-4000-8000-000000000001',
    'c7300000-0000-4000-8000-000000000001', 'butterbox-citest')$$,
  'P0001', 'Permission denied', 'a scoped manager cannot load demo data');

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims',
  '{"sub":"a7300000-0000-4000-8000-000000000003","iss":"http://127.0.0.1:59421/auth/v1","role":"authenticated"}',
  true);
select extensions.throws_ok(
  $$select public.load_workspace_demo_data('b7300000-0000-4000-8000-000000000001',
    'c7300000-0000-4000-8000-000000000001', 'butterbox-citest')$$,
  'P0001', 'Permission denied', 'another tenant owner cannot load demo data');

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"a7300000-0000-4000-8000-000000000001","iss":"http://127.0.0.1:59421/auth/v1","role":"authenticated"}',
  true);
select extensions.is(public.workspace_demo_data_environment_enabled('butterbox-citest'), true,
  'the explicitly approved isolated test project is enabled');
select set_config('request.jwt.claims',
  '{"sub":"a7300000-0000-4000-8000-000000000001","iss":"https://production-project.supabase.co/auth/v1","role":"authenticated"}',
  true);
select extensions.is(public.workspace_demo_data_environment_enabled('butterbox-citest'), false,
  'a production or unidentified project issuer cannot use the test approval');
select extensions.throws_ok(
  $$select public.load_workspace_demo_data('b7300000-0000-4000-8000-000000000001',
    'c7300000-0000-4000-8000-000000000001', 'butterbox-citest')$$,
  'P0001', 'Demo data is not enabled for this database',
  'a direct API request from another environment is rejected');
select set_config('request.jwt.claims',
  '{"sub":"a7300000-0000-4000-8000-000000000001","iss":"http://127.0.0.1:59421/auth/v1","role":"authenticated"}',
  true);
select extensions.throws_ok(
  $$select public.load_workspace_demo_data('b7300000-0000-4000-8000-000000000001',
    'c7300000-0000-4000-8000-000000000003', 'butterbox-citest')$$,
  'P0001', 'Demo data can only be loaded into a clean venue without payroll integrations',
  'a venue with real employees is refused without modifying its records');
select extensions.is((select count(*)::integer from public.employees
  where id = 'e7300000-0000-4000-8000-000000000001'), 1,
  'the existing real employee remains unchanged');
select extensions.is((select count(*)::integer from public.shifts
  where id = 'f7300000-0000-4000-8000-000000000001'), 1,
  'the existing real shift remains unchanged');

select extensions.throws_ok(
  $$select public.load_workspace_demo_data('b7300000-0000-4000-8000-000000000001',
    'c7300000-0000-4000-8000-000000000001', 'wrong-project')$$,
  'P0001', 'Demo data is not enabled for this database',
  'the direct API rejects a project-ref mismatch');
select extensions.is(
  (select count(*)::integer from public.employees
    where business_id = 'b7300000-0000-4000-8000-000000000001' and venue_id = 'c7300000-0000-4000-8000-000000000001'),
  0, 'failed authorization leaves the clean venue unchanged');

select extensions.is(
  (public.load_workspace_demo_data(
    'b7300000-0000-4000-8000-000000000001',
    'c7300000-0000-4000-8000-000000000001',
    'butterbox-citest'
  ) ->> 'already_loaded')::boolean,
  false, 'an owner can load fictional records into an existing clean development venue');
select extensions.is((select count(*)::integer from public.employees
  where business_id = 'b7300000-0000-4000-8000-000000000001'
    and venue_id = 'c7300000-0000-4000-8000-000000000001'), 6,
  'the existing venue receives the fictional team');
select extensions.is((select count(*)::integer from public.employees
  where id = 'e7300000-0000-4000-8000-000000000001' and name = 'Real employee'), 1,
  'existing real employees in another venue remain unchanged');
select extensions.is((public.get_workspace_demo_data_status(
  'b7300000-0000-4000-8000-000000000001',
  'c7300000-0000-4000-8000-000000000001'
) -> 'counts' ->> 'employees')::integer, 6, 'existing-venue counts are available to the owner');
select extensions.throws_ok(
  $$select public.set_employee_auth_user(
    'b7300000-0000-4000-8000-000000000001',
    (select id from public.employees where venue_id = 'c7300000-0000-4000-8000-000000000001' limit 1),
    'a7300000-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'Simulation-only employees cannot be linked to user accounts',
  'fictional staff cannot be linked to employee accounts');
select extensions.throws_ok(
  $$select public.create_staff_invitation(
    'b7300000-0000-4000-8000-000000000001',
    'c7300000-0000-4000-8000-000000000001',
    (select department_id from public.employees
      where venue_id = 'c7300000-0000-4000-8000-000000000001'
      order by id limit 1),
    (select id from public.employees
      where venue_id = 'c7300000-0000-4000-8000-000000000001'
      order by id limit 1),
    'fictional@example.test'
  )$$,
  'P0001', 'Simulation-only employees cannot be invited or mapped to payroll',
  'fictional staff cannot trigger invitations');
select public.create_payroll_mapping_connection(
  'b7300000-0000-4000-8000-000000000001',
  'd7300000-0000-4000-8000-000000000099',
  'myob',
  'simulation-test-destination',
  'Simulation-only test destination'
);
select extensions.throws_ok(
  $$select public.set_payroll_employee_mapping_scoped(
    'b7300000-0000-4000-8000-000000000001',
    'c7300000-0000-4000-8000-000000000001',
    'd7300000-0000-4000-8000-000000000099',
    (select id from public.employees where venue_id = 'c7300000-0000-4000-8000-000000000001' limit 1),
    0, 'fictional-payroll-id', 'Simulation mapping guard test',
    'd7300000-0000-4000-8000-000000000098', true, false
  )$$,
  'P0001', 'Simulation-only employees cannot be invited or mapped to payroll',
  'fictional staff cannot be mapped to payroll providers');
select extensions.is((select count(*)::integer from public.staff_invitations
  where business_id = 'b7300000-0000-4000-8000-000000000001'), 0,
  'demo loading and rejected invitations create no invitation records');
select extensions.is((select count(*)::integer from public.list_payroll_employee_mappings(
  'b7300000-0000-4000-8000-000000000001',
  'd7300000-0000-4000-8000-000000000099',
  'c7300000-0000-4000-8000-000000000001'
  ) where external_employee_id is not null), 0,
  'rejected mappings create no payroll mapping records');

select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims',
  '{"sub":"a7300000-0000-4000-8000-000000000004","iss":"http://127.0.0.1:59421/auth/v1","role":"authenticated"}',
  true);
select extensions.ok(
  public.complete_initial_setup('Sample cafe', 'New venue', '11 Test Street', 'Australia/Sydney', true) is not null,
  'approved development owners can choose the sample team during onboarding');
select extensions.is((select count(*)::integer from public.employees e
  join public.business_memberships m on m.business_id = e.business_id
  where m.user_id = auth.uid()), 6, 'onboarding creates six fictional employees');
select extensions.is((select count(*)::integer from public.shifts s
  join public.business_memberships m on m.business_id = s.business_id
  where m.user_id = auth.uid() and s.is_published and s.status = 'scheduled'), 12,
  'onboarding creates twelve published shifts');
select extensions.is((select count(*)::integer from public.roster_publications p
  join public.business_memberships m on m.business_id = p.business_id
  where m.user_id = auth.uid()), 4, 'both weeks and departments have published roster snapshots');
select extensions.is((select count(*)::integer from public.attendance_sessions s
  join public.business_memberships m on m.business_id = s.business_id
  where m.user_id = auth.uid()), 4, 'onboarding creates completed sample attendance');
select extensions.is((select count(*)::integer from public.attendance_event_corrections c
  join public.business_memberships m on m.business_id = c.business_id
  where m.user_id = auth.uid()), 1, 'sample attendance includes an attributed correction');
select extensions.is((public.get_workspace_demo_data_status(
  (select business_id from public.business_memberships where user_id = auth.uid()),
  (select id from public.venues where business_id = (
    select business_id from public.business_memberships where user_id = auth.uid()
  ) limit 1)
) -> 'counts' ->> 'payroll_examples')::integer, 4,
  'the preparation examples are counted separately from payroll exports');
select extensions.is((select count(*)::integer from public.staff_invitations i
  join public.business_memberships m on m.business_id = i.business_id
  where m.user_id = auth.uid()), 0, 'the sample load creates no staff invitations');
select extensions.is((select count(*)::integer from public.list_payroll_mapping_connections(
  (select business_id from public.business_memberships where user_id = auth.uid())
)), 0, 'the sample load creates no external payroll mappings');
select extensions.ok(exists (
  select 1 from public.sensitive_action_audit a
  join public.business_memberships m on m.business_id = a.business_id
  where m.user_id = auth.uid() and a.source_table = 'workspace_demo_data_loads'
), 'the owner load is audited');
select extensions.ok((select bool_and(e.auth_user_id is null and e.email is null)
  from public.employees e
  join public.business_memberships m on m.business_id = e.business_id
  where m.user_id = auth.uid()), 'fictional employees have no accounts or invitation addresses');
select extensions.is((select count(*)::integer from public.workspace_demo_data_record_tags t
  join public.business_memberships m on m.business_id = t.business_id
  where m.user_id = auth.uid()), 119, 'all synthetic records have provenance tags');
select extensions.is((select count(*)::integer from public.list_weekly_worked_time(
  (select business_id from public.business_memberships where user_id = auth.uid()),
  (select id from public.venues where business_id = (
    select business_id from public.business_memberships where user_id = auth.uid()
  ) limit 1),
  date_trunc('week', clock_timestamp() at time zone 'Australia/Sydney')::date - 7
)), 0, 'synthetic attendance is excluded from payroll preparation and export inputs');

select extensions.is(
  (public.load_workspace_demo_data(
    (select business_id from public.business_memberships where user_id = auth.uid()),
    (select id from public.venues where business_id = (
      select business_id from public.business_memberships where user_id = auth.uid()
    ) limit 1),
    'butterbox-citest'
  ) ->> 'already_loaded')::boolean,
  true, 'a repeated load is idempotent');
select extensions.is((select count(*)::integer from public.employees e
  join public.business_memberships m on m.business_id = e.business_id
  where m.user_id = auth.uid()), 6, 'a repeated load creates no duplicate employees');
select extensions.throws_ok(
  $$delete from public.workspace_demo_data_record_tags$$,
  '42501', null, 'authenticated users cannot delete provenance tags');

reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.load_workspace_demo_data('b7300000-0000-4000-8000-000000000001',
    'c7300000-0000-4000-8000-000000000001', 'butterbox-citest')$$,
  '42501', null, 'anonymous callers cannot invoke the demo-data loader');
reset role;

-- Service-role updates to ordinary employees must still work even though provenance
-- is not directly readable by service_role. The trigger's protected lookup must
-- also continue denying account links for tagged demo employees.
set local role service_role;
select extensions.lives_ok(
  $update public.employees set auth_user_id = null
    where id = 'e7300000-0000-4000-8000-000000000001'$,
  'service_role can update an untagged real employee despite restricted demo provenance');
select extensions.throws_ok(
  $update public.employees set auth_user_id = 'a7300000-0000-4000-8000-000000000001'
    where id = (select id from public.employees
      where business_id = 'b7300000-0000-4000-8000-000000000001'
        and venue_id = 'c7300000-0000-4000-8000-000000000001'
      order by id limit 1)$,
  'P0001', 'Simulation-only employees cannot be linked to user accounts',
  'service_role cannot link a synthetic employee to a real user account');
reset role;

select * from extensions.finish();
rollback;
