begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(42);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3000000-0000-4000-8000-000000000001', 'onboarding-owner@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000002', 'onboarding-employee@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000003', 'onboarding-other-owner@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000004', 'onboarding-demo@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000005', 'onboarding-denied@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b3000000-0000-4000-8000-000000000001', 'Onboarding cafe'),
  ('b3000000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'First', 'UTC'),
  ('c3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'FOH'),
  ('d3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002', 'Other');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'employee',
    'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000003', 'owner', null, null);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000005', true);
select extensions.is(public.demo_seed_enabled(), false, 'sample data is disabled by default');
select extensions.throws_ok(
  $$select * from public.demo_seed_policy$$,
  '42501', 'permission denied for table demo_seed_policy',
  'ordinary users cannot read or modify deployment policy directly');
select extensions.throws_ok(
  $$update public.demo_seed_policy set enabled = true$$,
  '42501', 'permission denied for table demo_seed_policy',
  'ordinary users cannot enable sample data');
select extensions.throws_ok(
  $$select public.handle_demo_seed_unchecked(null, null, 'UTC')$$,
  '42501', 'permission denied for function handle_demo_seed_unchecked',
  'ordinary users cannot call the unchecked seed helper');
select extensions.throws_ok(
  $$select public.handle_demo_seed(null, null, 'UTC')$$,
  '42501', 'permission denied for function handle_demo_seed',
  'ordinary users cannot call the guarded seed helper directly');
select extensions.throws_ok(
  $$select public.create_business('Denied demo', 'Venue', 'UTC', true)$$,
  'P0001', 'Sample data is not enabled in this environment',
  'the direct workspace RPC cannot bypass the disabled sample policy');
select extensions.is(
  (select count(*)::integer from public.business_memberships where user_id = auth.uid()), 0,
  'a rejected direct seed creates no membership');
select extensions.lives_ok(
  $$insert into public.business_setup_drafts (user_id, business_name, include_sample_data)
    values (auth.uid(), 'Retained draft', true)$$,
  'an incomplete draft can be retained before the policy is checked');
select extensions.throws_ok(
  $$select public.complete_initial_setup('Denied demo', 'Venue', '10 Test Street', 'UTC', true)$$,
  'P0001', 'Sample data is not enabled in this environment',
  'the setup RPC rejects sample creation while disabled');
select extensions.is(
  (select count(*)::integer from public.business_setup_drafts where user_id = auth.uid()), 1,
  'a rejected sample setup preserves the draft');
select extensions.is(
  (select count(*)::integer from public.business_memberships where user_id = auth.uid()), 0,
  'a rejected sample setup rolls back the business');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select extensions.is(
  (select to_jsonb(p) from public.get_onboarding_progress('b3000000-0000-4000-8000-000000000001') p),
  '{"business_ready":true,"venue_ready":true,"staff_ready":false,"shift_ready":false,"publication_ready":false}'::jsonb,
  'a new owner sees business and venue complete with later steps outstanding');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select * from public.get_onboarding_progress('b3000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'an employee cannot inspect owner onboarding progress');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select * from public.get_onboarding_progress('b3000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant owner cannot inspect progress');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.demo_seed_enabled()$$,
  '42501', 'permission denied for function demo_seed_enabled',
  'anonymous callers cannot inspect the policy');
select extensions.throws_ok(
  $$select * from public.get_onboarding_progress('b3000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function get_onboarding_progress',
  'anonymous callers cannot inspect onboarding progress');
reset role;
set local role service_role;
select extensions.throws_ok(
  $$update public.demo_seed_policy set enabled = true$$,
  '42501', 'permission denied for table demo_seed_policy',
  'the API service role cannot enable sample data');
select extensions.throws_ok(
  $$select public.handle_demo_seed_unchecked(null, null, 'UTC')$$,
  '42501', 'permission denied for function handle_demo_seed_unchecked',
  'the API service role cannot call the unchecked seed helper');
reset role;
insert into public.employees (id, business_id, venue_id, department_id, name, role_title) values
  ('e3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000002', 'Outside worker', 'Server');
insert into public.shifts (business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at)
values ('b3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002',
  'd3000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002',
  'Server', '2032-03-29 09:00+00', '2032-03-29 10:00+00');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select extensions.is(
  (select to_jsonb(p) from public.get_onboarding_progress('b3000000-0000-4000-8000-000000000001') p),
  '{"business_ready":true,"venue_ready":true,"staff_ready":false,"shift_ready":false,"publication_ready":false}'::jsonb,
  'staff and shifts in another tenant do not advance the checklist');
reset role;
insert into public.employees (id, business_id, venue_id, department_id, name, role_title) values
  ('e3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Team member', 'Server');
set local role authenticated;
select extensions.is(
  (select to_jsonb(p) from public.get_onboarding_progress('b3000000-0000-4000-8000-000000000001') p),
  '{"business_ready":true,"venue_ready":true,"staff_ready":true,"shift_ready":false,"publication_ready":false}'::jsonb,
  'adding active staff advances the staff step');
reset role;
update public.employees set active = false where id = 'e3000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select staff_ready from public.get_onboarding_progress('b3000000-0000-4000-8000-000000000001')), false,
  'archived staff alone do not satisfy the staff step');
reset role;
update public.employees set active = true where id = 'e3000000-0000-4000-8000-000000000001';
insert into public.shifts (business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at)
values ('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
  'Server', '2032-03-29 09:00+00', '2032-03-29 10:00+00');
set local role authenticated;
select extensions.is(
  (select to_jsonb(p) from public.get_onboarding_progress('b3000000-0000-4000-8000-000000000001') p),
  '{"business_ready":true,"venue_ready":true,"staff_ready":true,"shift_ready":true,"publication_ready":false}'::jsonb,
  'a draft shift advances the shift step but not publication');
select extensions.is(
  public.publish_roster('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001', '2032-03-29'), 1,
  'the first roster can be published');
select extensions.is(
  (select to_jsonb(p) from public.get_onboarding_progress('b3000000-0000-4000-8000-000000000001') p),
  '{"business_ready":true,"venue_ready":true,"staff_ready":true,"shift_ready":true,"publication_ready":true}'::jsonb,
  'a recorded publication completes the checklist');

reset role;
select extensions.throws_ok(
  $$update public.demo_seed_policy set enabled = true where singleton$$,
  'P0001', 'Sample data is not enabled in this environment',
  'a database operator cannot enable the old sample policy');
select extensions.throws_ok(
  $$insert into public.demo_seed_policy (singleton, enabled) values (true, true)
    on conflict (singleton) do update set enabled = excluded.enabled$$,
  'P0001', 'Sample data is not enabled in this environment',
  'an upsert cannot enable the old sample policy');
select extensions.is(
  (select enabled from public.demo_seed_policy where singleton), false,
  'rejected operator changes leave the policy disabled');
select extensions.throws_ok(
  $$select public.handle_demo_seed(
    'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'UTC')$$,
  'P0001', 'Sample data is not enabled in this environment',
  'a database operator cannot invoke the guarded seed helper');
select extensions.throws_ok(
  $$select public.handle_demo_seed_unchecked(
    'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'UTC')$$,
  'P0001', 'Sample data is not enabled in this environment',
  'a database operator cannot invoke the historical seed helper');
select extensions.is(
  (select count(*)::integer from public.employees
    where business_id = 'b3000000-0000-4000-8000-000000000001'),
  1, 'privileged seed attempts do not add staff to an existing business');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000004', true);
select extensions.is(public.demo_seed_enabled(), false, 'sample creation remains unavailable');
select extensions.lives_ok(
  $$insert into public.business_setup_drafts (user_id, business_name)
    values (auth.uid(), 'Clean draft')$$,
  'a user can save a draft without requesting sample data');
select extensions.is(
  (select include_sample_data from public.business_setup_drafts where user_id = auth.uid()), false,
  'new setup drafts default to a clean workspace');
select extensions.throws_ok(
  $$select public.complete_initial_setup('Demo only', 'Test venue', '20 Test Street', 'UTC', true)$$,
  'P0001', 'Sample data is not enabled in this environment',
  'setup rejects a sample request after privileged enable attempts');
select extensions.is(
  (select count(*)::integer from public.business_setup_drafts where user_id = auth.uid()), 1,
  'rejected setup retains the draft');
select extensions.is(
  (select count(*)::integer from public.business_memberships where user_id = auth.uid()), 0,
  'rejected setup does not leave a business membership');
select extensions.ok(
  public.complete_initial_setup('Clean cafe', 'Test venue', '20 Test Street', 'UTC', false) is not null,
  'clean setup still creates a workspace');
select extensions.is(
  (select count(*)::integer from public.employees where business_id = (
    select business_id from public.business_memberships where user_id = auth.uid()
  )), 0, 'the clean workspace has no sample staff');
select extensions.is(
  (select count(*)::integer from public.shifts where business_id = (
    select business_id from public.business_memberships where user_id = auth.uid()
  )), 0, 'the clean workspace has no sample shifts');
select extensions.is(
  (select count(*)::integer from public.job_roles where business_id = (
    select business_id from public.business_memberships where user_id = auth.uid()
  )), 0, 'the clean workspace has no sample job roles');
select extensions.is(
  (select publication_ready from public.get_onboarding_progress((
    select business_id from public.business_memberships where user_id = auth.uid()
  ))), false, 'a clean workspace does not pretend a roster has been published');
select extensions.is(
  (select to_jsonb(p) from public.get_onboarding_progress((
    select business_id from public.business_memberships where user_id = auth.uid()
  )) p),
  '{"business_ready":true,"venue_ready":true,"staff_ready":false,"shift_ready":false,"publication_ready":false}'::jsonb,
  'the clean workspace starts at the correct onboarding step');

select * from extensions.finish();
rollback;
