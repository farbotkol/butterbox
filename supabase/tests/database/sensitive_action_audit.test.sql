begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(31);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a8800000-0000-4000-8000-000000000001', 'audit-owner@example.test', '{}'::jsonb),
  ('a8800000-0000-4000-8000-000000000002', 'audit-manager@example.test', '{}'::jsonb),
  ('a8800000-0000-4000-8000-000000000003', 'audit-worker@example.test', '{}'::jsonb),
  ('a8800000-0000-4000-8000-000000000004', 'audit-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b8800000-0000-4000-8000-000000000001', 'Audit cafe'),
  ('b8800000-0000-4000-8000-000000000002', 'Outside audit cafe');
insert into public.venues (id, business_id, name) values
  ('c8800000-0000-4000-8000-000000000001', 'b8800000-0000-4000-8000-000000000001', 'Audit venue');
insert into public.departments (id, business_id, venue_id, name) values
  ('d8800000-0000-4000-8000-000000000001', 'b8800000-0000-4000-8000-000000000001',
   'c8800000-0000-4000-8000-000000000001', 'FOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b8800000-0000-4000-8000-000000000001', 'a8800000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b8800000-0000-4000-8000-000000000001', 'a8800000-0000-4000-8000-000000000002', 'foh_manager',
   'c8800000-0000-4000-8000-000000000001', 'd8800000-0000-4000-8000-000000000001'),
  ('b8800000-0000-4000-8000-000000000001', 'a8800000-0000-4000-8000-000000000003', 'employee',
   'c8800000-0000-4000-8000-000000000001', 'd8800000-0000-4000-8000-000000000001'),
  ('b8800000-0000-4000-8000-000000000002', 'a8800000-0000-4000-8000-000000000004', 'owner', null, null);

select extensions.ok((select count(*) > 0 from public.sensitive_action_audit
  where actor_kind = 'database' and actor_id is null), 'database changes are explicitly unattributed to users');
select set_config('request.jwt.claim.sub', 'a8800000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.save_employee_profile('b8800000-0000-4000-8000-000000000001', 'd8800000-0000-4000-8000-000000000001',
    null, 'Before worker', 'private@example.test', 'Server', 'casual', true)$$, 'owner creates staff through real RPC');
select extensions.is((select count(*)::integer from public.sensitive_action_audit where source_table = 'employees'), 1,
  'profile creation creates exactly one record');
select extensions.ok((select actor_id = auth.uid() and actor_kind = 'user' and old_values is null
  and new_values ->> 'name' = 'Before worker' and occurred_at <= clock_timestamp()
  from public.sensitive_action_audit where source_table = 'employees'), 'actor, time and new values recorded');
select extensions.ok((select not new_values ? 'email' from public.sensitive_action_audit
  where source_table = 'employees'), 'contact email is excluded');
select extensions.lives_ok(
  $$select public.save_employee_profile('b8800000-0000-4000-8000-000000000001', 'd8800000-0000-4000-8000-000000000001',
    (select id from public.employees), 'After worker', '', 'Supervisor', 'part_time', false)$$, 'owner edits staff');
select extensions.ok((select old_values ->> 'name' = 'Before worker' and new_values ->> 'name' = 'After worker'
  and old_values ->> 'active' = 'true' and new_values ->> 'active' = 'false'
  from public.sensitive_action_audit where source_table = 'employees' and operation = 'UPDATE'),
  'old and new staffing values are preserved');
select extensions.lives_ok(
  $$select public.save_employee_profile('b8800000-0000-4000-8000-000000000001', 'd8800000-0000-4000-8000-000000000001',
    (select id from public.employees), 'After worker', '', 'Supervisor', 'part_time', false)$$, 'unchanged retry succeeds');
select extensions.is((select count(*)::integer from public.sensitive_action_audit where source_table = 'employees'), 2,
  'unchanged save does not duplicate audit records');
select extensions.throws_ok(
  $$select public.save_employee_profile('b8800000-0000-4000-8000-000000000001', 'd8800000-0000-4000-8000-000000000001',
    null, '', '', 'Server', 'casual', true)$$, 'P0001', 'Invalid employee details', 'invalid mutation fails');
select extensions.is((select count(*)::integer from public.sensitive_action_audit where source_table = 'employees'), 2,
  'failed mutation creates no success audit');
select extensions.is((select count(*)::integer from public.sensitive_action_audit
  where business_id = 'b8800000-0000-4000-8000-000000000002'), 0, 'owner cannot read another tenant audit');
select extensions.throws_ok($$insert into public.sensitive_action_audit (
  business_id, actor_kind, source_table, operation, record_id, new_values
) values ('b8800000-0000-4000-8000-000000000001', 'database', 'employees', 'INSERT', 'forged', '{}')$$,
  '42501', 'permission denied for table sensitive_action_audit', 'owner cannot forge audit records');
select extensions.throws_ok($$update public.sensitive_action_audit set reason = 'rewrite'$$,
  '42501', 'permission denied for table sensitive_action_audit', 'owner cannot rewrite audit');
select extensions.throws_ok($$delete from public.sensitive_action_audit$$,
  '42501', 'permission denied for table sensitive_action_audit', 'owner cannot delete audit');
select extensions.lives_ok(
  $$select public.finalise_payroll_period('b8800000-0000-4000-8000-000000000001',
    'c8800000-0000-4000-8000-000000000001', '2024-01-08', gen_random_uuid(), 'Week checked')$$,
  'finalisation records an audit event atomically');
select extensions.lives_ok(
  $$select public.reopen_payroll_period('b8800000-0000-4000-8000-000000000001',
    'c8800000-0000-4000-8000-000000000001', '2024-01-08', gen_random_uuid(), 'Late correction')$$,
  'reopening records an audit event atomically');
select extensions.ok((select reason = 'Late correction' and new_values ->> 'action' = 'reopened'
  from public.sensitive_action_audit where source_table = 'payroll_period_events' and reason = 'Late correction'),
  'required payroll reopening reason is preserved');
select extensions.is((select count(*)::integer from public.sensitive_action_audit
  where source_table = 'payroll_period_events' and actor_id = auth.uid()), 2, 'owner filters category and actor');
select set_config('request.jwt.claim.sub', 'a8800000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.sensitive_action_audit), 0, 'department manager cannot read audit');
select set_config('request.jwt.claim.sub', 'a8800000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.sensitive_action_audit), 0, 'employee cannot read audit');
select set_config('request.jwt.claim.sub', 'a8800000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.sensitive_action_audit where source_table = 'employees'), 0,
  'other owner cannot use filters to bypass tenant isolation');
reset role;
set local role anon;
select extensions.throws_ok($$select * from public.sensitive_action_audit$$, '42501',
  'permission denied for table sensitive_action_audit', 'anonymous cannot read audit');
reset role;
select extensions.throws_ok($$update public.sensitive_action_audit set reason = 'privileged rewrite'$$, 'P0001',
  'Sensitive action audit records are immutable', 'immutability also guards privileged updates');
select extensions.throws_ok($$delete from public.sensitive_action_audit$$, 'P0001',
  'Sensitive action audit records are immutable', 'privileged direct deletes are refused');
alter table public.employees add column audit_test_private text;
update public.employees set name = 'Projected worker', audit_test_private = 'fixture-only-not-for-audit'
  where business_id = 'b8800000-0000-4000-8000-000000000001';
select extensions.ok((select bool_and(not new_values ? 'audit_test_private') from public.sensitive_action_audit
  where source_table = 'employees' and new_values is not null), 'future unapproved columns are not copied');
delete from public.employees where business_id = 'b8800000-0000-4000-8000-000000000001';
select extensions.ok((select old_values ->> 'name' = 'Projected worker' and new_values is null
  from public.sensitive_action_audit where business_id = 'b8800000-0000-4000-8000-000000000001'
    and source_table = 'employees' and operation = 'DELETE'),
  'source deletion keeps its old values in audit');
delete from public.business_memberships where user_id = 'a8800000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', 'a8800000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.sensitive_action_audit), 0,
  'revoked owner loses audit access immediately');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('test.preserved_audit_count', (select count(*)::text from public.sensitive_action_audit
  where business_id = 'b8800000-0000-4000-8000-000000000001'), true);
select set_config('test.preserved_other_audit_count', (select count(*)::text from public.sensitive_action_audit
  where business_id = 'b8800000-0000-4000-8000-000000000002'), true);
select extensions.throws_ok($$delete from public.businesses where id = 'b8800000-0000-4000-8000-000000000001'$$,
  'P0001', 'Business deletion is disabled while record preservation requirements remain unresolved',
  'business deletion cannot cascade audit history');
select extensions.ok((select count(*) > 0 and count(*) = current_setting('test.preserved_audit_count')::bigint
  from public.sensitive_action_audit where business_id = 'b8800000-0000-4000-8000-000000000001'),
  'the tenant audit remains intact');
select extensions.ok((select count(*) > 0 and count(*) = current_setting('test.preserved_other_audit_count')::bigint
  from public.sensitive_action_audit where business_id = 'b8800000-0000-4000-8000-000000000002'),
  'the other tenant audit remains intact');
select * from extensions.finish();
rollback;
