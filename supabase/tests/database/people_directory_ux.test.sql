begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7100000-0000-4000-8000-000000000001', 'directory-owner@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000002', 'directory-foh@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000003', 'directory-boh@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000004', 'directory-worker@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7100000-0000-4000-8000-000000000001', 'Directory test cafe'),
  ('b7100000-0000-4000-8000-000000000002', 'Outside test cafe');
insert into public.venues (id, business_id, name) values
  ('c7100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'First'),
  ('c7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000001', 'Second'),
  ('c7100000-0000-4000-8000-000000000003', 'b7100000-0000-4000-8000-000000000002', 'Outside');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'FOH'),
  ('d7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'BOH'),
  ('d7100000-0000-4000-8000-000000000003', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002', 'Second FOH'),
  ('d7100000-0000-4000-8000-000000000004', 'b7100000-0000-4000-8000-000000000002', 'c7100000-0000-4000-8000-000000000003', 'Outside FOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000002', 'foh_manager', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001'),
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000003', 'boh_manager', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000002'),
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004', 'employee', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, email, role_title, active) values
  ('e7100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004', 'Alice Percent%', 'alice@example.test', 'Barista', true),
  ('e7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000002', null, 'Shared worker', 'shared@example.test', 'Cook', true),
  ('e7100000-0000-4000-8000-000000000003', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000002', null, 'Archived worker', 'archived@example.test', 'Cook', false),
  ('e7100000-0000-4000-8000-000000000004', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000003', null, 'Second venue worker', null, 'Server', true),
  ('e7100000-0000-4000-8000-000000000005', 'b7100000-0000-4000-8000-000000000002', 'c7100000-0000-4000-8000-000000000003', 'd7100000-0000-4000-8000-000000000004', null, 'Outside worker', null, 'Server', true);
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000001');
insert into public.job_roles (id, business_id, venue_id, department_id, name) values
  ('f7100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'Barista');
insert into public.employee_job_roles (business_id, venue_id, department_id, employee_id, job_role_id, is_primary) values
  ('b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000002', 'f7100000-0000-4000-8000-000000000001', true);

insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('17100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004');
insert into public.attendance_events (id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at) values
  ('27100000-0000-4000-8000-000000000001', '17100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004', '37100000-0000-4000-8000-000000000001', 'clock_in', '2026-10-01 09:00:00+00'),
  ('27100000-0000-4000-8000-000000000002', '17100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004', '37100000-0000-4000-8000-000000000002', 'clock_out', '2026-10-01 17:00:00+00');
insert into public.attendance_timesheet_decisions (id, business_id, venue_id, department_id, employee_id, session_id, actor_id, request_id, decision, revision) values
  ('47100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', '17100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', '37100000-0000-4000-8000-000000000003', 'approved', repeat('a', 64));

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, '', '', 'all')),
  3, 'owner directory is limited to the requested venue');
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, '', '', 'active')),
  2, 'active filter excludes archived staff');
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', '', '', 'all')),
  2, 'department filter includes a linked secondary department');
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, 'ALICE@', '', 'all')),
  1, 'contact search is case insensitive');
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, '%', '', 'all')),
  1, 'search treats wildcard characters as literal text');
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, '', 'Barista', 'all')),
  2, 'role filter includes job titles and actual qualifications');
select extensions.is((select primary_role_name from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, 'Alice', '', 'all')),
  null, 'a matching free-text job title does not invent a qualified role');
select extensions.is((select primary_role_name from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, 'Shared', '', 'all')),
  'Barista', 'a real primary qualification is displayed');
select extensions.throws_ok(
  $$select * from public.list_people_directory('b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, '', '', 'invalid')$$,
  'P0001', 'Invalid directory filters', 'invalid filters are rejected explicitly');
select extensions.throws_ok(
  $$select public.save_employee_profile_checked_v2('b7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'Alice Percent%', 'alice@example.test', 'Barista', 'casual', false, 0, 0, false)$$,
  'P0001', 'Confirm the employee status change', 'archive requires explicit confirmation');
select extensions.lives_ok(
  $$select public.save_employee_profile_checked_v2('b7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'Alice Updated', 'alice@example.test', 'Barista', 'casual', true, 0, 0, false)$$,
  'owner can save a current profile revision');
select extensions.is((select profile_revision from public.employees
  where id = 'e7100000-0000-4000-8000-000000000001'), 1::bigint,
  'a profile update advances its revision');
select extensions.throws_ok(
  $$select public.save_employee_profile_checked_v2('b7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'Stale name', 'alice@example.test', 'Barista', 'casual', true, 0, 0, false)$$,
  'P0001', 'Employee profile changed; refresh before saving', 'stale changes are rejected');
select extensions.lives_ok(
  $$select public.save_employee_profile_checked_v2('b7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'Alice Updated', 'alice@example.test', 'Barista', 'casual', false, 0, 1, true)$$,
  'confirmed archive succeeds without deleting the profile');
select extensions.ok((select not active from public.employees
  where id = 'e7100000-0000-4000-8000-000000000001'), 'archive persists');
select extensions.is((select count(*)::integer from public.attendance_events
  where session_id = '17100000-0000-4000-8000-000000000001'), 2,
  'archive preserves original attendance events');
select extensions.is((select count(*)::integer from public.attendance_timesheet_decisions
  where id = '47100000-0000-4000-8000-000000000001' and decision = 'approved'), 1,
  'archive preserves the existing timesheet decision');
select extensions.is((select count(*)::integer from public.sensitive_action_audit
  where source_table = 'attendance_timesheet_decisions' and record_id = '47100000-0000-4000-8000-000000000001'), 1,
  'archive preserves the existing timesheet audit entry');
select extensions.is((select count(*)::integer from public.sensitive_action_audit
  where source_table = 'employees' and record_id = 'e7100000-0000-4000-8000-000000000001'
    and actor_id = 'a7100000-0000-4000-8000-000000000001' and actor_kind = 'user'
    and old_values ->> 'active' = 'true' and new_values ->> 'active' = 'false'), 1,
  'archive adds an attributable employee audit entry');
select extensions.lives_ok(
  $$select public.save_employee_profile_checked_v2('b7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'Alice Updated', 'alice@example.test', 'Barista', 'casual', true, 0, 2, true)$$,
  'confirmed reactivation succeeds');
select extensions.throws_ok(
  $$select public.save_employee_profile_checked_v2('b7100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000004', 'e7100000-0000-4000-8000-000000000005', 'Outside', '', 'Server', 'casual', true, 0, 0, false)$$,
  'P0001', 'Permission denied', 'cross-business mutation is rejected');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, '', '', 'all')),
  2, 'FOH manager sees only managed primary or linked departments');
select extensions.is((select invitation_state from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, 'Shared', '', 'all')),
  'unavailable', 'hidden invitations are not incorrectly reported as absent');
select extensions.is((select email from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, 'Shared', '', 'all')),
  null, 'a secondary department manager cannot see the home department contact');
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, 'shared@example', '', 'all')),
  0, 'secondary department search cannot infer the hidden contact');
select extensions.is((select employment_type from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, 'Shared', '', 'all')),
  null, 'secondary department access does not disclose home employment details');
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002', null, '', '', 'all')),
  0, 'FOH manager cannot search a different venue');
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000002', 'c7100000-0000-4000-8000-000000000003', null, '', '', 'all')),
  0, 'FOH manager cannot search another business');
select extensions.throws_ok(
  $$select public.save_employee_profile_checked_v2('b7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000002', 'e7100000-0000-4000-8000-000000000003', 'Forbidden', '', 'Cook', 'casual', true, 0, 0, true)$$,
  'P0001', 'Permission denied', 'FOH manager cannot update BOH-only staff');
select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, '', '', 'all')),
  2, 'BOH manager sees only BOH profiles');
select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.list_people_directory(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, '', '', 'all')),
  1, 'an employee can read no other profile through the directory RPC');
select extensions.throws_ok(
  $$select public.save_employee_profile_checked_v2('b7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'Forbidden', '', 'Barista', 'casual', true, 0, 3, false)$$,
  'P0001', 'Permission denied', 'employees cannot mutate profiles');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select * from public.list_people_directory('b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null, '', '', 'all')$$,
  '42501', 'permission denied for function list_people_directory', 'anonymous directory access is denied');
select * from extensions.finish();
rollback;
