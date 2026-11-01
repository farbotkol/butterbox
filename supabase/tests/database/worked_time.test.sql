begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(35);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-000000000001', 'time-owner@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000002', 'time-foh@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000003', 'time-boh@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000004', 'time-worker@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000005', 'time-cook@example.test', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000006', 'time-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b1000000-0000-4000-8000-000000000001', 'Time business'),
  ('b1000000-0000-4000-8000-000000000002', 'Outside business');
insert into public.venues (id, business_id, name, timezone, geofence_latitude, geofence_longitude, geofence_radius_meters) values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Harbour', 'Australia/Sydney', -33.8688, 151.2093, 100),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'Riverside', 'Australia/Perth', null, null, null),
  ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000002', 'Outside', 'UTC', null, null, null);
insert into public.departments (id, business_id, venue_id, name) values
  ('d1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'FOH'),
  ('d1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'BOH'),
  ('d1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'Riverside'),
  ('d1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'foh_manager', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'boh_manager', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002'),
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'employee', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'employee', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002'),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'Time worker', 'Server'),
  ('e1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000005', 'Time cook', 'Cook'),
  ('e1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000004', 'Riverside worker', 'Server'),
  ('e1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000006', 'Outside worker', 'Server');

insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
select f.id::uuid, e.business_id, e.venue_id, e.department_id, e.id, e.auth_user_id
from (values
  ('21000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002'),
  ('21000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000005', 'e1000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000006', 'e1000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000008', 'e1000000-0000-4000-8000-000000000003'),
  ('21000000-0000-4000-8000-000000000009', 'e1000000-0000-4000-8000-000000000004'),
  ('21000000-0000-4000-8000-000000000010', 'e1000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000011', 'e1000000-0000-4000-8000-000000000001')
) as f(id, employee_id)
join public.employees e on e.id = f.employee_id::uuid;

insert into public.attendance_breaks (id, session_id, business_id, classification)
select f.id::uuid, s.id, s.business_id, f.classification
from (values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'paid'),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', 'unpaid'),
  ('31000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000003', 'unpaid'),
  ('31000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000004', 'paid'),
  ('31000000-0000-4000-8000-000000000006', '21000000-0000-4000-8000-000000000006', 'paid'),
  ('31000000-0000-4000-8000-000000000007', '21000000-0000-4000-8000-000000000007', 'paid'),
  ('31000000-0000-4000-8000-000000000008', '21000000-0000-4000-8000-000000000007', 'unpaid'),
  ('31000000-0000-4000-8000-000000000009', '21000000-0000-4000-8000-000000000011', 'paid')
) as f(id, session_id, classification)
join public.attendance_sessions s on s.id = f.session_id::uuid;

insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id,
  request_id, event_type, break_id, occurred_at
)
select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.event_type, f.break_id::uuid, f.occurred_at::timestamptz
from (values
  (1, '21000000-0000-4000-8000-000000000001', 'clock_in', null, '2024-10-05 13:30:00+00'),
  (2, '21000000-0000-4000-8000-000000000001', 'break_start', '31000000-0000-4000-8000-000000000001', '2024-10-05 14:15:00+00'),
  (3, '21000000-0000-4000-8000-000000000001', 'break_end', '31000000-0000-4000-8000-000000000001', '2024-10-05 14:30:00+00'),
  (4, '21000000-0000-4000-8000-000000000001', 'break_start', '31000000-0000-4000-8000-000000000002', '2024-10-05 15:45:00+00'),
  (5, '21000000-0000-4000-8000-000000000001', 'break_end', '31000000-0000-4000-8000-000000000002', '2024-10-05 16:15:00+00'),
  (6, '21000000-0000-4000-8000-000000000001', 'clock_out', null, '2024-10-05 17:30:00+00'),
  (7, '21000000-0000-4000-8000-000000000002', 'clock_in', null, '2024-04-06 15:30:00+00'),
  (8, '21000000-0000-4000-8000-000000000002', 'clock_out', null, '2024-04-06 16:30:00+00'),
  (9, '21000000-0000-4000-8000-000000000003', 'clock_in', null, '2024-01-15 09:00:00.123456+00'),
  (10, '21000000-0000-4000-8000-000000000003', 'break_start', '31000000-0000-4000-8000-000000000003', '2024-01-15 09:00:01.100001+00'),
  (11, '21000000-0000-4000-8000-000000000003', 'break_end', '31000000-0000-4000-8000-000000000003', '2024-01-15 09:00:02.200002+00'),
  (12, '21000000-0000-4000-8000-000000000003', 'clock_out', null, '2024-01-15 09:00:10.654321+00'),
  (13, '21000000-0000-4000-8000-000000000004', 'clock_in', null, '2024-01-15 09:00:00+00'),
  (14, '21000000-0000-4000-8000-000000000004', 'break_start', '31000000-0000-4000-8000-000000000004', '2024-01-15 09:30:00+00'),
  (15, '21000000-0000-4000-8000-000000000006', 'clock_in', null, '2024-01-15 08:00:00+00'),
  (16, '21000000-0000-4000-8000-000000000006', 'break_start', '31000000-0000-4000-8000-000000000006', '2024-01-15 09:00:00+00'),
  (17, '21000000-0000-4000-8000-000000000006', 'break_end', '31000000-0000-4000-8000-000000000006', '2024-01-15 08:30:00+00'),
  (18, '21000000-0000-4000-8000-000000000006', 'clock_out', null, '2024-01-15 10:00:00+00'),
  (19, '21000000-0000-4000-8000-000000000007', 'clock_in', null, '2024-01-15 08:00:00+00'),
  (20, '21000000-0000-4000-8000-000000000007', 'break_start', '31000000-0000-4000-8000-000000000007', '2024-01-15 08:30:00+00'),
  (21, '21000000-0000-4000-8000-000000000007', 'break_start', '31000000-0000-4000-8000-000000000008', '2024-01-15 09:00:00+00'),
  (22, '21000000-0000-4000-8000-000000000007', 'break_end', '31000000-0000-4000-8000-000000000007', '2024-01-15 09:30:00+00'),
  (23, '21000000-0000-4000-8000-000000000007', 'break_end', '31000000-0000-4000-8000-000000000008', '2024-01-15 09:45:00+00'),
  (24, '21000000-0000-4000-8000-000000000007', 'clock_out', null, '2024-01-15 10:00:00+00'),
  (25, '21000000-0000-4000-8000-000000000008', 'clock_in', null, '2024-01-15 08:00:00+00'),
  (26, '21000000-0000-4000-8000-000000000008', 'clock_out', null, '2024-01-15 10:00:00+00'),
  (27, '21000000-0000-4000-8000-000000000009', 'clock_in', null, '2024-01-15 08:00:00+00'),
  (28, '21000000-0000-4000-8000-000000000009', 'clock_out', null, '2024-01-15 10:00:00+00'),
  (29, '21000000-0000-4000-8000-000000000011', 'clock_in', null, '2024-01-15 08:00:00+00'),
  (30, '21000000-0000-4000-8000-000000000011', 'break_start', '31000000-0000-4000-8000-000000000009', '2024-01-15 07:30:00+00'),
  (31, '21000000-0000-4000-8000-000000000011', 'break_end', '31000000-0000-4000-8000-000000000009', '2024-01-15 08:30:00+00'),
  (32, '21000000-0000-4000-8000-000000000011', 'clock_out', null, '2024-01-15 10:00:00+00')
) as f(sequence, session_id, event_type, break_id, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid
order by f.sequence;

update public.venues set clock_geofence_enabled = true
where id = 'c1000000-0000-4000-8000-000000000001';
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id,
  request_id, event_type, occurred_at
)
select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.event_type, f.occurred_at::timestamptz
from public.attendance_sessions s
cross join (values
  (1, 'clock_in', '2024-01-15 08:00:00+00'),
  (2, 'clock_out', '2024-01-15 10:00:00+00')
) as f(sequence, event_type, occurred_at)
where s.id = '21000000-0000-4000-8000-000000000010'
order by f.sequence;

set local role anon;
select extensions.throws_ok(
  $$select * from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot inspect worked time');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select * from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot inspect manager work-time calculations');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000006', true);
select extensions.throws_ok(
  $$select * from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'an outside owner cannot inspect another tenant');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select * from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'even an owner cannot pair their business with another tenant venue');
select extensions.throws_ok(
  $$select * from public.list_worked_time(null, 'c1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a null business is rejected');
select extensions.is(
  (select count(*)::integer from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001')),
  9, 'the owner sees only sessions in the selected venue');
select extensions.ok(
  (select venue_id = 'c1000000-0000-4000-8000-000000000001' and venue_name = 'Harbour'
    and venue_timezone = 'Australia/Sydney'
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001')
    where session_id = '21000000-0000-4000-8000-000000000001'),
  'calculations retain their actual venue and timezone');
select extensions.is(
  (select elapsed_seconds from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000001'),
  14400::numeric, 'a cross-midnight spring-forward shift uses four actual hours, not five wall-clock hours');
select extensions.ok(
  (select (clocked_in_at at time zone venue_timezone)::date = date '2024-10-05'
    and (clocked_out_at at time zone venue_timezone)::date = date '2024-10-06'
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000001'),
  'the spring-forward shift crosses local midnight');
select extensions.is(
  (select paid_break_seconds from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000001'),
  900::numeric, 'the actual paid break is counted separately');
select extensions.is(
  (select unpaid_break_seconds from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000001'),
  1800::numeric, 'the actual unpaid break is counted separately');
select extensions.is(
  (select worked_seconds from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000001'),
  11700::numeric, 'worked time excludes both paid and unpaid breaks');
select extensions.is(
  (select paid_seconds from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000001'),
  12600::numeric, 'paid time includes the actual paid break and excludes the unpaid break');
select extensions.is(
  (select cardinality(exceptions) from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000001'),
  0, 'a complete session with disabled location verification has no exception');
select extensions.is(
  (select elapsed_seconds from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000002'),
  3600::numeric, 'repeated fall-back wall time still represents one actual hour');
select extensions.ok(
  (select clocked_in_at at time zone venue_timezone = clocked_out_at at time zone venue_timezone
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000002'),
  'the fall-back fixture really has identical local clock times');
select extensions.is(
  (select paid_break_seconds + unpaid_break_seconds
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000002'),
  0::numeric, 'no break is assumed when none was recorded');
select extensions.is(
  (select elapsed_seconds from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000003'),
  10.530865::numeric, 'elapsed duration preserves microseconds without payroll rounding');
select extensions.is(
  (select unpaid_break_seconds from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000003'),
  1.100001::numeric, 'break duration preserves microseconds');
select extensions.is(
  (select worked_seconds from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000003'),
  9.430864::numeric, 'net duration remains exact after subtracting the break');
select extensions.ok(
  (select clocked_in_at = timestamptz '2024-01-15 09:00:00.123456+00'
    and clocked_out_at = timestamptz '2024-01-15 09:00:10.654321+00'
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000003'),
  'calculating and displaying durations does not alter source event instants');
select extensions.ok(
  (select exceptions @> array['missing_clock_out', 'incomplete_break']
    and elapsed_seconds is null and worked_seconds is null and paid_seconds is null
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000004'),
  'an open session and unfinished break are flagged without inventing totals');
select extensions.ok(
  (select exceptions @> array['missing_clock_in', 'missing_clock_out']
    and elapsed_seconds is null and paid_break_seconds is null
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000005'),
  'missing original clock events are flagged rather than calculated');
select extensions.ok(
  (select exceptions @> array['invalid_break'] and worked_seconds is null
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000006'),
  'an invalid break order is flagged and does not produce totals');
select extensions.ok(
  (select exceptions @> array['overlapping_breaks'] and worked_seconds is null
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000007'),
  'overlapping breaks are flagged instead of being subtracted twice');
select extensions.ok(
  (select exceptions @> array['invalid_break'] and paid_seconds is null
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000011'),
  'a break outside the clocked session is flagged instead of changing totals');
select extensions.ok(
  (select exceptions @> array['location_review_required'] and worked_seconds = 7200
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000010'),
  'a location exception remains visible without discarding actual worked time');
select public.review_attendance_location_exception('b1000000-0000-4000-8000-000000000001', (
  select c.id from public.attendance_location_checks c join public.attendance_events e on e.id = c.event_id
  where e.session_id = '21000000-0000-4000-8000-000000000010' and e.event_type = 'clock_in'
));
select extensions.ok(
  (select exceptions @> array['location_review_required', 'location_reviewed']
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000010'),
  'a reviewed check and a separate pending check are both flagged');
select public.review_attendance_location_exception('b1000000-0000-4000-8000-000000000001', (
  select c.id from public.attendance_location_checks c join public.attendance_events e on e.id = c.event_id
  where e.session_id = '21000000-0000-4000-8000-000000000010' and e.event_type = 'clock_out'
));
select extensions.ok(
  (select exceptions @> array['location_reviewed'] and not exceptions @> array['location_review_required']
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000010'),
  'reviewed location exceptions remain visible after all pending checks are reviewed');
select extensions.ok(
  (select venue_id = 'c1000000-0000-4000-8000-000000000002' and venue_timezone = 'Australia/Perth'
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000002') where session_id = '21000000-0000-4000-8000-000000000008'),
  'a second venue retains its actual attribution and timezone');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001')),
  8, 'the FOH manager sees only FOH sessions');
select extensions.throws_ok(
  $$select * from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Permission denied', 'a venue-scoped manager cannot query another venue');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001')),
  1, 'the BOH manager sees only the BOH session');
reset role;
update public.venues set timezone = 'UTC' where id = 'c1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select extensions.ok(
  (select venue_timezone = 'UTC' and elapsed_seconds = 14400 and worked_seconds = 11700
    from public.list_worked_time('b1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001') where session_id = '21000000-0000-4000-8000-000000000001'),
  'changing the display timezone does not change absolute worked duration');
select extensions.throws_ok(
  $$update public.attendance_events set occurred_at = occurred_at + interval '1 minute'
    where session_id = '21000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'the calculation grants no permission to alter original events');

select * from extensions.finish();
rollback;
