begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(29);

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
update public.demo_seed_policy set enabled = true where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000004', true);
select extensions.is(public.demo_seed_enabled(), true, 'an isolated operator can explicitly enable sample data');
select extensions.ok(
  public.complete_initial_setup('Demo only', 'Test venue', '20 Test Street', 'UTC', true) is not null,
  'sample setup succeeds when explicitly enabled');
select extensions.is(
  (select count(*)::integer from public.employees where business_id = (
    select business_id from public.business_memberships where user_id = auth.uid()
  )), 24, 'the isolated demo workspace receives 24 fictional staff');
select extensions.is(
  (select count(*)::integer from public.shifts where business_id = (
    select business_id from public.business_memberships where user_id = auth.uid()
  ) and not is_published), 48, 'the isolated demo workspace receives 48 private drafts');
select extensions.is(
  (select publication_ready from public.get_onboarding_progress((
    select business_id from public.business_memberships where user_id = auth.uid()
  ))), false, 'demo drafts do not pretend a roster has been published');

select * from extensions.finish();
rollback;
