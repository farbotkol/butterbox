begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data)
select ('a9130000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'exception-' || n || '@example.test', '{}'::jsonb from generate_series(1, 5) n;
insert into public.businesses (id, name) values
  ('b9130000-0000-4000-8000-000000000001', 'Exception cafe'),
  ('b9130000-0000-4000-8000-000000000002', 'Other cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c9130000-0000-4000-8000-000000000001', 'b9130000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c9130000-0000-4000-8000-000000000002', 'b9130000-0000-4000-8000-000000000001', 'Other venue', 'UTC'),
  ('c9130000-0000-4000-8000-000000000003', 'b9130000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d9130000-0000-4000-8000-000000000001', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', 'FOH'),
  ('d9130000-0000-4000-8000-000000000002', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', 'Private BOH'),
  ('d9130000-0000-4000-8000-000000000003', 'b9130000-0000-4000-8000-000000000002', 'c9130000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000002', 'foh_manager', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001'),
  ('b9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000003', 'boh_manager', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000002'),
  ('b9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000004', 'employee', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001'),
  ('b9130000-0000-4000-8000-000000000002', 'a9130000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e9130000-0000-4000-8000-000000000001', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000004', 'Shared worker', 'Server'),
  ('e9130000-0000-4000-8000-000000000002', 'b9130000-0000-4000-8000-000000000002', 'c9130000-0000-4000-8000-000000000003', 'd9130000-0000-4000-8000-000000000003', null, 'Outside worker', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b9130000-0000-4000-8000-000000000001', 'e9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000002');
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published, status
) values
  ('f9130000-0000-4000-8000-000000000001', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001', 'e9130000-0000-4000-8000-000000000001', 'Server', '2024-10-01 01:00+00', '2024-10-01 05:00+00', true, 'scheduled'),
  ('f9130000-0000-4000-8000-000000000002', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000002', 'e9130000-0000-4000-8000-000000000001', 'Draft', '2024-10-01 03:00+00', '2024-10-01 04:00+00', false, 'scheduled'),
  ('f9130000-0000-4000-8000-000000000003', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000002', 'e9130000-0000-4000-8000-000000000001', 'Cook', '2024-10-01 06:00+00', '2024-10-01 08:00+00', true, 'scheduled'),
  ('f9130000-0000-4000-8000-000000000004', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001', 'e9130000-0000-4000-8000-000000000001', 'Adjacent', '2024-10-01 05:00+00', '2024-10-01 06:00+00', false, 'scheduled'),
  ('f9130000-0000-4000-8000-000000000005', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001', 'e9130000-0000-4000-8000-000000000001', 'Next week', '2024-10-06 13:30+00', '2024-10-06 14:30+00', true, 'scheduled'),
  ('f9130000-0000-4000-8000-000000000006', 'b9130000-0000-4000-8000-000000000002', 'c9130000-0000-4000-8000-000000000003', 'd9130000-0000-4000-8000-000000000003', 'e9130000-0000-4000-8000-000000000002', 'Outside', '2024-10-01 01:00+00', '2024-10-01 05:00+00', true, 'scheduled');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
select ('29130000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001',
  case when n in (2, 4) then 'd9130000-0000-4000-8000-000000000002'::uuid
    else 'd9130000-0000-4000-8000-000000000001'::uuid end,
  'e9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000004'
from generate_series(1, 4) n;
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
)
select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  t.event_type, t.occurred_at::timestamptz, 'server_clock'
from (values
  (1, '2024-10-01 01:00+00', '2024-10-01 05:00+00'),
  (2, '2024-10-01 06:00+00', '2024-10-01 08:00+00'),
  (3, '2024-10-02 01:00+00', null),
  (4, null, '2024-10-02 05:00+00')
) f(n, starts_at, ends_at)
join public.attendance_sessions s on s.id = ('29130000-0000-4000-8000-' || lpad(f.n::text, 12, '0'))::uuid
cross join lateral (values ('clock_in', f.starts_at), ('clock_out', f.ends_at)) t(event_type, occurred_at)
where t.occurred_at is not null;

select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.ok(public.decide_attendance_timesheet(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001',
  '29130000-0000-4000-8000-000000000001', gen_random_uuid(),
  (select edit_revision from public.list_weekly_worked_time_for_edit(
    'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')
    where session_id = '29130000-0000-4000-8000-000000000001'), 'approved', null
) is not null, 'the first complete session is approved');
select extensions.ok(public.decide_attendance_timesheet(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001',
  '29130000-0000-4000-8000-000000000002', gen_random_uuid(),
  (select edit_revision from public.list_weekly_worked_time_for_edit(
    'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')
    where session_id = '29130000-0000-4000-8000-000000000002'), 'approved', null
) is not null, 'the other-department session is approved');

select extensions.is(jsonb_array_length(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'planned'),
  2, 'owner sees published assigned shifts in the venue-local week only');
select extensions.is(jsonb_array_length(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'actual'),
  4, 'owner sees complete and incomplete sessions in both departments');
select extensions.is(jsonb_array_length(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'overlaps'),
  2, 'owner sees the published shift and the overlapping draft, not adjacent shifts');
select extensions.is((select count(*)::integer from jsonb_array_elements(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'actual') r
  where r->>'approval_status' = 'approved'), 2, 'approval status accompanies the same worked-time snapshot');
select extensions.is((select count(*)::integer from jsonb_array_elements(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'actual') r
  where r->'exceptions' ?| array['missing_clock_in', 'missing_clock_out']), 2, 'missing clock-in and clock-out are both returned');
select extensions.throws_ok($$select public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-10-01')$$,
  'P0001', 'Invalid timesheet week', 'non-Monday weeks are rejected');
select extensions.throws_ok($$select public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '0001-01-01')$$,
  'P0001', 'Unsupported exceptions report week', 'unsupported early weeks are rejected');
select extensions.lives_ok($$select public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '1000-01-06')$$,
  'the earliest supported Monday is accepted');
select extensions.throws_ok($$select public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000003', '2024-09-30')$$,
  'P0001', 'Permission denied', 'a venue from another business is rejected');

select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000002', true);
select extensions.is(jsonb_array_length(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'planned'),
  1, 'FOH manager sees only FOH planned hours');
select extensions.is(jsonb_array_length(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'actual'),
  2, 'FOH manager sees only FOH attendance');
select extensions.is(jsonb_array_length(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'overlaps'),
  1, 'FOH manager sees only their own affected shift');
select extensions.ok(position('Private BOH' in public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')::text) = 0,
  'the conflict flag does not disclose the other department');
select extensions.throws_ok($$select public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000002', '2024-09-30')$$,
  'P0001', 'Permission denied', 'FOH manager cannot access another venue');

select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000003', true);
select extensions.is(jsonb_array_length(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'overlaps'),
  1, 'BOH manager sees their affected draft only');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')$$,
  'P0001', 'Permission denied', 'employees cannot request the manager report');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000005', true);
select extensions.throws_ok($$select public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')$$,
  'P0001', 'Permission denied', 'another business owner cannot request the report');
select extensions.ok(not has_function_privilege('anon', 'public.get_weekly_exceptions_report(uuid,uuid,date)', 'execute'),
  'anonymous callers have no execute grant');
select extensions.ok(not has_function_privilege('service_role', 'public.get_weekly_exceptions_report(uuid,uuid,date)', 'execute'),
  'service role has no execute grant');

reset role;
insert into public.attendance_edit_lock_events (business_id, session_id, actor_id, request_id, locked, reason)
values ('b9130000-0000-4000-8000-000000000001', '29130000-0000-4000-8000-000000000001',
  'a9130000-0000-4000-8000-000000000001', gen_random_uuid(), false, 'Reopened for review');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is((select r->>'approval_status' from jsonb_array_elements(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'actual') r
  where r->>'session_id' = '29130000-0000-4000-8000-000000000001'),
  'approval_outdated', 'a subsequent unlock makes the formerly approved time ineligible');

reset role;
insert into public.departments (id, business_id, venue_id, name) values
  ('d9130000-0000-4000-8000-000000000004', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000002', 'Private other-venue department');
insert into public.employees (id, business_id, venue_id, department_id, name, role_title) values
  ('e9130000-0000-4000-8000-000000000003', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000002', 'd9130000-0000-4000-8000-000000000004', 'Private linked worker', 'Cook');
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published, status
) values
  ('f9130000-0000-4000-8000-000000000007', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000002', 'd9130000-0000-4000-8000-000000000004',
   'e9130000-0000-4000-8000-000000000003', 'Private linked shift',
   '2024-10-03 02:00+00', '2024-10-03 03:00+00', false, 'scheduled'),
  ('f9130000-0000-4000-8000-000000000008', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001',
   'e9130000-0000-4000-8000-000000000001', 'Visible draft',
   '2024-10-03 01:00+00', '2024-10-03 04:00+00', false, 'scheduled');
set local role authenticated;
select extensions.lives_ok($$select public.link_shared_worker_profiles(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001',
  'e9130000-0000-4000-8000-000000000001', 'e9130000-0000-4000-8000-000000000003')$$,
  'owner links worker profiles across venues');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000002', true);
select extensions.ok(exists(select 1 from jsonb_array_elements(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'overlaps') r
  where r->>'shift_id' = 'f9130000-0000-4000-8000-000000000008'),
  'a linked cross-venue conflict flags the manager-visible draft');
select extensions.ok(position('Private linked worker' in public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')::text) = 0
  and position('Private other-venue department' in public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')::text) = 0,
  'a cross-venue conflict does not expose the hidden profile or department');

reset role;
insert into public.employees (id, business_id, venue_id, department_id, name, role_title) values
  ('e9130000-0000-4000-8000-000000000004', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000002', 'Private former worker', 'Cook');
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published, status
) values
  ('f9130000-0000-4000-8000-000000000009', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001',
   'e9130000-0000-4000-8000-000000000004', 'Former published shift',
   '2024-10-04 01:00+00', '2024-10-04 04:00+00', true, 'scheduled'),
  ('f9130000-0000-4000-8000-000000000010', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001',
   'e9130000-0000-4000-8000-000000000004', 'Former draft shift',
   '2024-10-04 02:00+00', '2024-10-04 03:00+00', false, 'scheduled');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
values ('29130000-0000-4000-8000-000000000005', 'b9130000-0000-4000-8000-000000000001',
  'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001',
  'e9130000-0000-4000-8000-000000000004', 'a9130000-0000-4000-8000-000000000004');
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
) values (
  '29130000-0000-4000-8000-000000000005', 'b9130000-0000-4000-8000-000000000001',
  'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001',
  'e9130000-0000-4000-8000-000000000004', 'a9130000-0000-4000-8000-000000000004', gen_random_uuid(),
  'clock_in', '2024-10-04 01:00+00', 'server_clock'
);
set local role authenticated;
select extensions.ok(position('Private former worker' in public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')::text) = 0,
  'a manager cannot see an unavailable employee profile name in any report array');
select extensions.is((select r->>'employee_name' from jsonb_array_elements(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'planned') r
  where r->>'shift_id' = 'f9130000-0000-4000-8000-000000000009'),
  'Former team member', 'a historical planned shift uses the scoped placeholder');
select extensions.is((select r->>'employee_name' from jsonb_array_elements(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'actual') r
  where r->>'session_id' = '29130000-0000-4000-8000-000000000005'),
  'Former team member', 'a historical session uses the scoped placeholder');
select extensions.is((select r->>'employee_name' from jsonb_array_elements(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'overlaps') r
  where r->>'shift_id' = 'f9130000-0000-4000-8000-000000000010'),
  'Former team member', 'a historical overlapping draft uses the scoped placeholder');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000001', true);
select extensions.is((select r->>'employee_name' from jsonb_array_elements(public.get_weekly_exceptions_report(
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', '2024-09-30')->'planned') r
  where r->>'shift_id' = 'f9130000-0000-4000-8000-000000000009'),
  'Private former worker', 'the owner retains access to the profile name');

select * from extensions.finish();
rollback;
