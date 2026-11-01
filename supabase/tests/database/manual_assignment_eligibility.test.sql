begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(37);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5000000-0000-4000-8000-000000000001', 'manual-owner@example.test', '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000002', 'manual-foh@example.test', '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000003', 'manual-boh@example.test', '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000004', 'manual-worker@example.test', '{}'::jsonb),
  ('a5000000-0000-4000-8000-000000000005', 'manual-outsider@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b5000000-0000-4000-8000-000000000001', 'Manual assignment business'),
  ('b5000000-0000-4000-8000-000000000002', 'Other manual business');
insert into public.venues (id, business_id, name, timezone) values
  ('c5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'Main', 'UTC'),
  ('c5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000002', 'Other', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'FOH'),
  ('d5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'BOH');
insert into public.job_roles (id, business_id, venue_id, department_id, name) values
  ('f5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'Barista'),
  ('f5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'Server');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'foh_manager', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003', 'boh_manager', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002'),
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004', 'employee', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, name, role_title, active) values
  ('e5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'A Unqualified', 'Barista', true),
  ('e5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'B Qualified', 'Server', true),
  ('e5000000-0000-4000-8000-000000000003', 'b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'C Archived', 'Barista', false);

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(
  (select restrict_manual_assignment from public.job_roles where id = 'f5000000-0000-4000-8000-000000000001'),
  false, 'manual restrictions are opt-in');
select extensions.lives_ok(
  $$select public.set_job_role_auto_restriction('b5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', true)$$,
  'owner can enable the existing automatic-only restriction');
select extensions.lives_ok(
  $$select public.save_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001', 'Barista', '2034-01-02 09:00', '2034-01-02 12:00', 0)$$,
  'automatic-only restriction does not change manual assignment');
select set_config('test.legacy_shift', (select id::text from public.shifts where starts_at = '2034-01-02 09:00+00'), true);
select extensions.lives_ok(
  $$select public.save_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    null, 'Barista', '2034-01-03 09:00', '2034-01-03 12:00', 0)$$,
  'open shifts can be created without an employee');
select set_config('test.open_shift', (select id::text from public.shifts where starts_at = '2034-01-03 09:00+00'), true);
select extensions.is((select count(*)::integer from public.shifts where employee_id is null), 1,
  'the open shift is counted');
select extensions.throws_ok(
  $$select public.set_job_role_manual_restriction('b5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Invalid restriction', 'a missing restriction setting is rejected');
select extensions.lives_ok(
  $$select public.set_job_role_manual_restriction('b5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', true)$$,
  'owner can restrict manual assignment independently');
select extensions.is(
  (select restrict_manual_assignment from public.job_roles where id = 'f5000000-0000-4000-8000-000000000001'),
  true, 'the manual setting is persisted');
select extensions.lives_ok(
  $$select public.update_draft_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    current_setting('test.legacy_shift')::uuid, 'e5000000-0000-4000-8000-000000000001', 'barista', '2034-01-02 09:00', '2034-01-02 13:00', 0)$$,
  'an existing assignment is not retroactively invalidated');
reset role;
select extensions.lives_ok(
  $$update public.shifts set status = 'cancelled' where id = current_setting('test.legacy_shift')::uuid$$,
  'an existing unqualified assignment can be cancelled');
select extensions.throws_ok(
  $$update public.shifts set status = 'scheduled' where id = current_setting('test.legacy_shift')::uuid$$,
  'P0001', 'Employee is not qualified for this role', 'reactivating a cancelled assignment checks qualifications');
select extensions.is(
  (select status from public.shifts where id = current_setting('test.legacy_shift')::uuid),
  'cancelled', 'failed reactivation preserves the cancelled status');
set local role authenticated;
select extensions.throws_ok(
  $$select public.save_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001', '  bARista  ', '2034-01-04 09:00', '2034-01-04 12:00', 0)$$,
  'P0001', 'Employee is not qualified for this role', 'manual creation rejects an unqualified employee case-insensitively');
select extensions.throws_ok(
  $$select public.update_draft_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    current_setting('test.open_shift')::uuid, 'e5000000-0000-4000-8000-000000000001', 'Barista', '2034-01-03 09:00', '2034-01-03 12:00', 0)$$,
  'P0001', 'Employee is not qualified for this role', 'an unqualified employee cannot fill a restricted open shift');
select extensions.is((select employee_id from public.shifts where id = current_setting('test.open_shift')::uuid),
  null::uuid, 'rejected assignment leaves the shift open');
select extensions.is((select count(*)::integer from public.shifts where employee_id is null), 1,
  'rejected assignment does not change the open count');
select extensions.lives_ok(
  $$select public.set_employee_eligible_roles('b5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000001',
    array['f5000000-0000-4000-8000-000000000001'::uuid])$$,
  'manager qualifies a worker for the role');
select extensions.lives_ok(
  $$select public.update_draft_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    current_setting('test.open_shift')::uuid, 'e5000000-0000-4000-8000-000000000002', 'Barista', '2034-01-03 09:00', '2034-01-03 12:00', 0)$$,
  'qualified worker can fill the open shift');
select extensions.is((select employee_id from public.shifts where id = current_setting('test.open_shift')::uuid),
  'e5000000-0000-4000-8000-000000000002'::uuid, 'assignment is saved');
select extensions.is((select count(*)::integer from public.shifts where employee_id is null), 0,
  'the open count decreases after assignment');
select extensions.throws_ok(
  $$select public.update_draft_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    current_setting('test.open_shift')::uuid, 'e5000000-0000-4000-8000-000000000001', 'Barista', '2034-01-03 09:00', '2034-01-03 12:00', 0)$$,
  'P0001', 'Employee is not qualified for this role', 'replacement assignments are also checked');
select extensions.is((select employee_id from public.shifts where id = current_setting('test.open_shift')::uuid),
  'e5000000-0000-4000-8000-000000000002'::uuid, 'a rejected replacement preserves the previous worker');
select extensions.lives_ok(
  $$select public.set_job_role_auto_restriction('b5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', false)$$,
  'automatic-only flag can remain disabled when manual restriction is enabled');
select extensions.lives_ok(
  $$select public.save_shift_auto_assign('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001', 'Barista', '2034-01-05 09:00', '2034-01-05 12:00', 0)$$,
  'automatic assignment respects the manual restriction and finds a qualified worker');
select extensions.is((select employee_id from public.shifts where starts_at = '2034-01-05 09:00+00'),
  'e5000000-0000-4000-8000-000000000002'::uuid, 'automatic selection skips the alphabetically first unqualified worker');
select extensions.throws_ok(
  $$select public.save_shift_auto_assign('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000001', 'Barista', '2034-01-05 10:00', '2034-01-05 11:00', 0)$$,
  'P0001', 'No eligible employee available for automatic assignment', 'automatic assignment does not fall back to an unqualified worker');
select extensions.lives_ok(
  $$select public.save_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001', 'Server', '2034-01-06 09:00', '2034-01-06 12:00', 0)$$,
  'unrestricted roles preserve existing manual assignment');
select extensions.lives_ok(
  $$select public.save_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    null, 'Barista', '2034-01-07 09:00', '2034-01-07 12:00', 0)$$,
  'new restricted-role shifts can still be left open');

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.set_job_role_manual_restriction('b5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', false)$$,
  'P0001', 'Permission denied', 'another department cannot change the policy');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select public.set_job_role_manual_restriction('b5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', false)$$,
  'P0001', 'Permission denied', 'another business cannot change the policy');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.set_job_role_manual_restriction('b5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', false)$$,
  'P0001', 'Permission denied', 'an employee cannot change the policy');
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000002', true);
select extensions.lives_ok(
  $$select public.set_job_role_manual_restriction('b5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', false)$$,
  'a scoped department manager can disable the policy');
select extensions.lives_ok(
  $$select public.save_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001', 'Barista', '2034-01-08 09:00', '2034-01-08 12:00', 0)$$,
  'disabling the policy restores manual assignment');
select extensions.throws_ok(
  $$select public.save_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000003', 'Barista', '2034-01-09 09:00', '2034-01-09 12:00', 0)$$,
  'P0001', 'Employee is not eligible for this department', 'archived workers remain ineligible');
select extensions.throws_ok(
  $$select public.save_shift('b5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001', 'Server', '2034-01-08 10:00', '2034-01-08 11:00', 0)$$,
  'P0001', 'Employee has an overlapping shift', 'overlap remains a blocking assignment rule');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.set_job_role_manual_restriction('b5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', false)$$,
  '42501', null, 'anonymous users cannot change the policy');
select extensions.throws_ok(
  $$select public.ensure_qualified_shift_assignment()$$,
  '42501', null, 'the trigger function cannot be called directly');
select * from extensions.finish();
rollback;
