begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4000000-0000-4000-8000-000000000001', 'preservation-owner@example.test', '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000002', 'preservation-other@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b4000000-0000-4000-8000-000000000001', 'Preservation business'),
  ('b4000000-0000-4000-8000-000000000002', 'Other business'),
  ('b4000000-0000-4000-8000-000000000003', 'Empty business');
insert into public.venues (id, business_id, name, timezone) values
  ('c4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'First venue', 'UTC'),
  ('c4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000002', 'Other venue', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'FOH'),
  ('d4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000002', 'FOH');
insert into public.business_memberships (business_id, user_id, role) values
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'owner'),
  ('b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002', 'owner');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001', 'First worker', 'Server'),
  ('e4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000002', 'Other worker', 'Server');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
values ('f4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001');
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at
) values (
  'f4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001', 'clock_in', '2032-03-29 09:00+00'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$delete from public.businesses where id = 'b4000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'an owner cannot directly delete their business');
select extensions.throws_ok(
  $$delete from public.businesses where id = 'b4000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'an owner cannot directly delete another business');
select extensions.is(
  (select count(*)::integer from public.businesses where id = 'b4000000-0000-4000-8000-000000000002'),
  0, 'another tenant remains invisible to an ordinary owner');
reset role;

set local role service_role;
select extensions.throws_ok(
  $$delete from public.businesses where id = 'b4000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Business deletion is disabled while record preservation requirements remain unresolved',
  'service-role deletion cannot cascade employment records');
select extensions.throws_ok(
  $$delete from public.businesses where id = 'b4000000-0000-4000-8000-000000000003'$$,
  'P0001', 'Business deletion is disabled while record preservation requirements remain unresolved',
  'deletion remains disabled even for an apparently empty business');
reset role;

select extensions.throws_ok(
  $$delete from public.businesses where id = 'b4000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Business deletion is disabled while record preservation requirements remain unresolved',
  'a privileged SQL delete is also refused');
select extensions.throws_ok(
  $$delete from public.businesses where id in (
    'b4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000002'
  )$$,
  'P0001', 'Business deletion is disabled while record preservation requirements remain unresolved',
  'multi-business deletion is rejected atomically');
set constraints all immediate;
select extensions.throws_ok(
  $$truncate public.businesses cascade$$,
  'P0001', 'Business deletion is disabled while record preservation requirements remain unresolved',
  'truncating the business table cannot bypass preservation');
select extensions.is(
  (select count(*)::integer from public.businesses where id in (
    'b4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000002',
    'b4000000-0000-4000-8000-000000000003'
  )), 3, 'all businesses remain after rejected deletion attempts');
select extensions.is(
  (select count(*)::integer from public.employees where business_id = 'b4000000-0000-4000-8000-000000000001'),
  1, 'the first tenant employee remains');
select extensions.is(
  (select count(*)::integer from public.employees where business_id = 'b4000000-0000-4000-8000-000000000002'),
  1, 'the other tenant employee remains');
select extensions.is(
  (select count(*)::integer from public.attendance_sessions where id = 'f4000000-0000-4000-8000-000000000001'),
  1, 'the original attendance session remains');
select extensions.is(
  (select occurred_at from public.attendance_events
    where session_id = 'f4000000-0000-4000-8000-000000000001'),
  '2032-03-29 09:00+00'::timestamptz, 'the original attendance event and timestamp remain');
select extensions.ok(
  (select count(*) > 0 from public.sensitive_action_audit
    where business_id = 'b4000000-0000-4000-8000-000000000001'),
  'the tenant audit history remains');
select extensions.ok(
  (select count(*) > 0 from public.sensitive_action_audit
    where business_id = 'b4000000-0000-4000-8000-000000000002'),
  'the other tenant audit history remains');
select extensions.lives_ok(
  $$delete from public.businesses where id = 'b4000000-0000-4000-8000-000000000099'$$,
  'deleting a nonexistent business is a harmless no-op');
select extensions.throws_ok(
  $$select public.prevent_business_record_deletion()$$,
  '0A000', null, 'the trigger function cannot be called as a regular function');

select * from extensions.finish();
rollback;
