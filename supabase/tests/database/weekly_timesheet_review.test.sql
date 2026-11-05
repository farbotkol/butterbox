begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-4000-8000-000000000001', 'weekly-owner@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000002', 'weekly-foh@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000003', 'weekly-boh@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000004', 'weekly-worker@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000005', 'weekly-cook@example.test', '{}'::jsonb),
  ('a7000000-0000-4000-8000-000000000006', 'weekly-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7000000-0000-4000-8000-000000000001', 'Weekly cafe'),
  ('b7000000-0000-4000-8000-000000000002', 'Other cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'Perth', 'Australia/Perth'),
  ('c7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'FOH'),
  ('d7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'BOH'),
  ('d7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', 'Perth service'),
  ('d7000000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', 'foh_manager', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003', 'boh_manager', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002'),
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004', 'employee', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000005', 'employee', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002'),
  ('b7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004', 'Weekly worker', 'Server'),
  ('e7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000005', 'Weekly cook', 'Cook'),
  ('e7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000004', 'Perth worker', 'Server'),
  ('e7000000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000004', 'a7000000-0000-4000-8000-000000000006', 'Outside worker', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002');

insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title,
  starts_at, ends_at, break_minutes, status, is_published
) values
  ('f7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'Server', '2024-09-29 14:00:00+00', '2024-09-29 16:00:00.000001+00', 15, 'scheduled', true),
  ('f7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'Server', '2024-09-29 13:00+00', '2024-09-29 13:59:59+00', 0, 'scheduled', true),
  ('f7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'Server', '2024-10-05 13:30+00', '2024-10-05 17:30+00', 30, 'scheduled', true),
  ('f7000000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000001', 'Cook', '2024-10-06 12:00+00', '2024-10-06 14:00+00', 0, 'scheduled', true),
  ('f7000000-0000-4000-8000-000000000005', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'Server', '2024-10-07 02:00+00', '2024-10-07 04:00+00', 0, 'scheduled', true),
  ('f7000000-0000-4000-8000-000000000006', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'Server', '2024-10-01 01:00+00', '2024-10-01 02:00+00', 0, 'scheduled', false),
  ('f7000000-0000-4000-8000-000000000007', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'Server', '2024-10-01 03:00+00', '2024-10-01 04:00+00', 0, 'cancelled', true),
  ('f7000000-0000-4000-8000-000000000008', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', null, 'Open', '2024-10-01 05:00+00', '2024-10-01 06:00+00', 0, 'scheduled', true),
  ('f7000000-0000-4000-8000-000000000009', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000002', 'Cook', '2024-10-02 00:00+00', '2024-10-02 02:00+00', 0, 'scheduled', true),
  ('f7000000-0000-4000-8000-000000000010', 'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000003', 'Server', '2024-10-02 00:00+00', '2024-10-02 02:00+00', 0, 'scheduled', true),
  ('f7000000-0000-4000-8000-000000000011', 'b7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000004', 'e7000000-0000-4000-8000-000000000004', 'Server', '2024-10-02 00:00+00', '2024-10-02 02:00+00', 0, 'scheduled', true);

insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by, created_at)
select f.id::uuid, e.business_id, e.venue_id, f.department_id::uuid, e.id, e.auth_user_id, '2024-10-03 00:00+00'
from (values
  ('27000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002'),
  ('27000000-0000-4000-8000-000000000004', 'e7000000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000003'),
  ('27000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000004', 'd7000000-0000-4000-8000-000000000004'),
  ('27000000-0000-4000-8000-000000000006', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000007', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000008', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000009', 'e7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002')
) f(id, employee_id, department_id)
join public.employees e on e.id = f.employee_id::uuid;
insert into public.attendance_breaks (id, session_id, business_id, classification) values
  ('37000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'unpaid');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id,
  event_type, break_id, occurred_at, source
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  f.event_type, f.break_id::uuid, f.occurred_at::timestamptz, f.source
from (values
  ('47000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'clock_in', null, '2024-10-05 13:29:00.123456+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001', 'break_start', '37000000-0000-4000-8000-000000000001', '2024-10-05 15:00+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000001', 'break_end', '37000000-0000-4000-8000-000000000001', '2024-10-05 15:30+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000004', '27000000-0000-4000-8000-000000000001', 'clock_out', null, '2024-10-05 17:30:00.123456+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000005', '27000000-0000-4000-8000-000000000002', 'clock_in', null, '2024-10-01 08:00+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000006', '27000000-0000-4000-8000-000000000003', 'clock_in', null, '2024-10-06 12:00+00', 'offline_claim'),
  ('47000000-0000-4000-8000-000000000007', '27000000-0000-4000-8000-000000000003', 'clock_out', null, '2024-10-06 14:00+00', 'offline_claim'),
  ('47000000-0000-4000-8000-000000000008', '27000000-0000-4000-8000-000000000004', 'clock_in', null, '2024-10-02 00:00+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000009', '27000000-0000-4000-8000-000000000004', 'clock_out', null, '2024-10-02 02:00+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000010', '27000000-0000-4000-8000-000000000005', 'clock_in', null, '2024-10-02 00:00+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000011', '27000000-0000-4000-8000-000000000005', 'clock_out', null, '2024-10-02 02:00+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000012', '27000000-0000-4000-8000-000000000006', 'clock_out', null, '2024-10-02 08:00+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000013', '27000000-0000-4000-8000-000000000008', 'clock_in', null, '2024-10-06 12:59:59+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000014', '27000000-0000-4000-8000-000000000008', 'clock_out', null, '2024-10-06 14:00+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000015', '27000000-0000-4000-8000-000000000009', 'clock_in', null, '2024-10-02 00:00+00', 'server_clock'),
  ('47000000-0000-4000-8000-000000000016', '27000000-0000-4000-8000-000000000009', 'clock_out', null, '2024-10-02 02:00+00', 'server_clock')
) f(id, session_id, event_type, break_id, occurred_at, source)
join public.attendance_sessions s on s.id = f.session_id::uuid;
insert into public.attendance_event_corrections (
  business_id, session_id, event_id, actor_id, request_id, old_at, new_at, reason
) values
  ('b7000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '47000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-10-05 13:29:00.123456+00', '2024-10-05 13:30:00.123456+00', 'Confirmed clock in'),
  ('b7000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000008', '47000000-0000-4000-8000-000000000013', 'a7000000-0000-4000-8000-000000000001', gen_random_uuid(), '2024-10-06 12:59:59+00', '2024-10-06 13:00:00+00', 'Corrected week boundary');

set local role anon;
select extensions.throws_ok($$select * from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  '42501', null, 'anonymous callers cannot inspect planned shifts');
select extensions.throws_ok($$select * from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  '42501', null, 'anonymous callers cannot inspect worked time');
select extensions.throws_ok($$select * from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  '42501', null, 'anonymous callers cannot inspect source events');
select extensions.throws_ok($$select * from public.timesheet_week_bounds(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  '42501', null, 'internal week bounds are not callable directly');
set local role service_role;
select extensions.throws_ok($$select * from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  '42501', null, 'service role cannot bypass weekly manager checks');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select * from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  'P0001', 'Permission denied', 'employees cannot list weekly planned time');
select extensions.throws_ok($$select * from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  'P0001', 'Permission denied', 'employees cannot list weekly worked time');
select extensions.throws_ok($$select * from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  'P0001', 'Permission denied', 'employees cannot list weekly source events');
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000006', true);
select extensions.throws_ok($$select * from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  'P0001', 'Permission denied', 'another tenant owner cannot inspect planned shifts');
select extensions.throws_ok($$select * from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  'P0001', 'Permission denied', 'another tenant owner cannot inspect attendance');
select extensions.throws_ok($$select * from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  'P0001', 'Permission denied', 'another tenant owner cannot inspect source events');
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$select * from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', '2024-09-30')$$,
  'P0001', 'Permission denied', 'a venue-scoped manager cannot inspect another venue');
select extensions.throws_ok($$select * from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000003', '2024-09-30')$$,
  'P0001', 'Permission denied', 'a venue cannot be paired with another tenant');
select extensions.throws_ok($$select * from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-10-01')$$,
  'P0001', 'Invalid timesheet week', 'weekly RPCs require a Monday');
select extensions.throws_ok($$select * from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Invalid timesheet week', 'weekly RPCs reject missing periods');
select extensions.throws_ok($$select * from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'infinity')$$,
  'P0001', 'Invalid timesheet week', 'weekly RPCs reject infinite periods');

select extensions.is((select count(*) from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')), 2::bigint,
  'FOH sees its two published assigned shifts only');
select extensions.is((select count(*) from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')), 4::bigint,
  'FOH sees only its own complete and incomplete sessions');
select extensions.is((select count(*) from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')), 6::bigint,
  'FOH sees only source events in its permitted department');
select extensions.is((select count(*) from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30',
  'e7000000-0000-4000-8000-000000000002')), 0::bigint, 'employee filter cannot expand department scope');
select extensions.is((select count(*) from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30',
  'e7000000-0000-4000-8000-000000000002')), 0::bigint, 'employee filter cannot expand worked-time scope');
select extensions.is((select count(*) from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30',
  'e7000000-0000-4000-8000-000000000002')), 0::bigint, 'employee filter cannot expand source-event scope');
select extensions.is((select scheduled_seconds from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where shift_id = 'f7000000-0000-4000-8000-000000000001'), 7200.000001::numeric,
  'scheduled duration retains microseconds without deducting an unclassified break');
select extensions.is((select worked_seconds from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where session_id = '27000000-0000-4000-8000-000000000001'), 12600::numeric,
  'worked time reflects corrected clock-in and actual unpaid break');
select extensions.is((select elapsed_seconds from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where session_id = '27000000-0000-4000-8000-000000000001'), 14400::numeric,
  'elapsed duration crosses the daylight-saving transition as real time');
select extensions.ok((select 'missing_clock_out' = any(exceptions) and elapsed_seconds is null
  from public.list_weekly_worked_time(
    'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where session_id = '27000000-0000-4000-8000-000000000002'), 'open sessions are visible as invalid');
select extensions.ok((select 'missing_clock_in' = any(exceptions) and elapsed_seconds is null
  from public.list_weekly_worked_time(
    'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where session_id = '27000000-0000-4000-8000-000000000006'), 'missing clock-in uses clock-out week');
select extensions.ok((select 'missing_clock_in' = any(exceptions) and 'missing_clock_out' = any(exceptions)
  from public.list_weekly_worked_time(
    'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where session_id = '27000000-0000-4000-8000-000000000007'), 'sessions without clock events use creation week');
select extensions.is((select original_at from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where event_id = '47000000-0000-4000-8000-000000000001'), '2024-10-05 13:29:00.123456+00'::timestamptz,
  'source inspection preserves the original timestamp');
select extensions.is((select effective_at from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where event_id = '47000000-0000-4000-8000-000000000001'), '2024-10-05 13:30:00.123456+00'::timestamptz,
  'source inspection exposes corrected timestamps without losing precision');
select extensions.is((select classification from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where event_id = '47000000-0000-4000-8000-000000000002'), 'unpaid'::text,
  'source inspection identifies break classification');
select extensions.is((select count(*) from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where session_id = '27000000-0000-4000-8000-000000000008'), 0::bigint,
  'a correction moving clock-in to the next week removes the record from this week');
select extensions.is((select count(*) from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-10-07')
  where session_id = '27000000-0000-4000-8000-000000000008'), 1::bigint,
  'a correction to the DST-adjusted Monday boundary enters the next week');
select extensions.is((select count(*) from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-10-07')
  where session_id = '27000000-0000-4000-8000-000000000008'), 2::bigint,
  'source events follow the effective session week');

select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')), 2::bigint,
  'BOH sees both BOH shifts, including a multi-department employee');
select extensions.is((select count(*) from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')), 2::bigint,
  'BOH sees only BOH sessions');
select extensions.is((select count(*) from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30',
  'e7000000-0000-4000-8000-000000000001')), 1::bigint,
  'employee filter retains multi-department attribution without exposing FOH sessions');
select extensions.ok((select 'offline_claim_unverified' = any(exceptions)
  from public.list_weekly_worked_time(
    'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where session_id = '27000000-0000-4000-8000-000000000003'),
  'offline source remains visibly unverified');
select extensions.is((select source from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')
  where event_id = '47000000-0000-4000-8000-000000000006'), 'offline_claim'::text,
  'source inspection preserves offline provenance');
select extensions.is((select count(*) from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-10-07')
  where session_id = '27000000-0000-4000-8000-000000000003'), 0::bigint,
  'an overnight session is not split into the following week');

select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*) from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')), 4::bigint,
  'owner sees published assigned shifts across departments, excluding drafts, cancellations and open shifts');
select extensions.is((select count(*) from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')), 6::bigint,
  'owner sees all scoped sessions in the selected venue and week');
select extensions.is((select count(*) from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '2024-09-30')), 10::bigint,
  'owner sees source events for all scoped sessions in the week');
select extensions.is((select count(*) from public.list_weekly_planned_shifts(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', '2024-09-30')), 1::bigint,
  'venue filter selects another permitted venue');
select extensions.is((select count(*) from public.list_weekly_worked_time(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', '2024-09-30')), 1::bigint,
  'worked-time venue filter selects another permitted venue');
select extensions.throws_ok($$select * from public.list_weekly_timesheet_events(
  'b7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000003', '2024-09-30')$$,
  'P0001', 'Permission denied', 'owner cannot inspect a venue belonging to another tenant');

select * from extensions.finish();
rollback;
