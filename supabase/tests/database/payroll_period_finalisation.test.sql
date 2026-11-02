begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7200000-0000-4000-8000-000000000001', 'payroll-owner@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000002', 'payroll-gm@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000003', 'payroll-foh@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000004', 'payroll-worker@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000005', 'payroll-outside@example.test', '{}'::jsonb),
  ('a7200000-0000-4000-8000-000000000006', 'payroll-other-gm@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7200000-0000-4000-8000-000000000001', 'Payroll cafe'),
  ('b7200000-0000-4000-8000-000000000002', 'Outside payroll cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c7200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c7200000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000002', 'Outside', 'UTC'),
  ('c7200000-0000-4000-8000-000000000003', 'b7200000-0000-4000-8000-000000000001', 'Melbourne', 'Australia/Melbourne');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'FOH'),
  ('d7200000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000002', 'general_manager', 'c7200000-0000-4000-8000-000000000001', null),
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000003', 'foh_manager', 'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001'),
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000004', 'employee', 'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001'),
  ('b7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000006', 'general_manager', 'c7200000-0000-4000-8000-000000000003', null),
  ('b7200000-0000-4000-8000-000000000002', 'a7200000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000004', 'Payroll server', 'Server'),
  ('e7200000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000002', null, 'Payroll cook', 'Cook');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
select f.id::uuid, 'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
  f.department_id::uuid, f.employee_id::uuid, f.started_by::uuid
from (values
  ('27200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000004'),
  ('27200000-0000-4000-8000-000000000002', 'd7200000-0000-4000-8000-000000000002', 'e7200000-0000-4000-8000-000000000002', 'a7200000-0000-4000-8000-000000000001'),
  ('27200000-0000-4000-8000-000000000003', 'd7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000004'),
  ('27200000-0000-4000-8000-000000000004', 'd7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000004'),
  ('27200000-0000-4000-8000-000000000005', 'd7200000-0000-4000-8000-000000000002', 'e7200000-0000-4000-8000-000000000002', 'a7200000-0000-4000-8000-000000000001')
) f(id, department_id, employee_id, started_by);
-- The BOH clock-in is recorded while location verification is on and no position is supplied.
update public.venues set geofence_latitude = -33.8688, geofence_longitude = 151.2093,
  geofence_radius_meters = 100, clock_geofence_enabled = true
where id = 'c7200000-0000-4000-8000-000000000001';
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
) select '47200000-0000-4000-8000-000000000003', s.id, s.business_id, s.venue_id, s.department_id, s.employee_id,
  s.started_by, gen_random_uuid(), 'clock_in', '2024-10-02 01:00+00', 'server_clock'
from public.attendance_sessions s where s.id = '27200000-0000-4000-8000-000000000002';
update public.venues set clock_geofence_enabled = false where id = 'c7200000-0000-4000-8000-000000000001';
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  f.event_type, f.occurred_at::timestamptz, 'server_clock'
from (values
  ('47200000-0000-4000-8000-000000000001', '27200000-0000-4000-8000-000000000001', 'clock_in', '2024-10-01 01:00+00'),
  ('47200000-0000-4000-8000-000000000002', '27200000-0000-4000-8000-000000000001', 'clock_out', '2024-10-01 02:00+00'),
  ('47200000-0000-4000-8000-000000000004', '27200000-0000-4000-8000-000000000002', 'clock_out', '2024-10-02 03:00+00'),
  ('47200000-0000-4000-8000-000000000005', '27200000-0000-4000-8000-000000000003', 'clock_in', '2024-10-03 01:00+00'),
  ('47200000-0000-4000-8000-000000000006', '27200000-0000-4000-8000-000000000004', 'clock_in', '2024-10-08 01:00+00'),
  ('47200000-0000-4000-8000-000000000007', '27200000-0000-4000-8000-000000000004', 'clock_out', '2024-10-08 02:00+00'),
  -- 00:30 on Monday 30 September in Sydney, but still Sunday in UTC.
  ('47200000-0000-4000-8000-000000000008', '27200000-0000-4000-8000-000000000005', 'clock_in', '2024-09-29 14:30+00'),
  ('47200000-0000-4000-8000-000000000009', '27200000-0000-4000-8000-000000000005', 'clock_out', '2024-09-29 15:30+00')
) f(id, session_id, event_type, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;
insert into public.attendance_offline_claims (
  id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, claimed_at,
  claim_source, request_reason
) values (
  '57200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001',
  'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001',
  'e7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000004', gen_random_uuid(),
  'clock_out', '2024-10-03 05:00+00', 'employee_request', 'I forgot to clock out'
);

create temporary table saved_events (name text primary key, id uuid);
grant select, insert on saved_events to authenticated;
create function pg_temp.rev(p_session uuid)
returns text language sql as $$
  select w.edit_revision from public.list_weekly_worked_time_for_edit(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', '2024-09-30'
  ) w where w.session_id = p_session;
$$;
create function pg_temp.approve(p_session uuid)
returns uuid language sql as $$
  select public.decide_attendance_timesheet(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', p_session,
    gen_random_uuid(), pg_temp.rev(p_session), 'approved', null
  );
$$;
create function pg_temp.finalise(p_request uuid, p_note text default null, p_week date default '2024-09-30')
returns uuid language sql as $$
  select public.finalise_payroll_period(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', p_week, p_request, p_note
  );
$$;
create function pg_temp.reopen(p_request uuid, p_reason text)
returns uuid language sql as $$
  select public.reopen_payroll_period(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', '2024-09-30', p_request, p_reason
  );
$$;
create function pg_temp.exceptions()
returns table (session_id uuid, claim_id uuid, exception_code text)
language sql as $$
  select x.session_id, x.claim_id, x.exception_code from public.list_payroll_period_exceptions(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', '2024-09-30'
  ) x;
$$;
create function pg_temp.period()
returns table (status text, can_finalise boolean, period_ended boolean, actor_role text, reason text,
  session_count integer, paid_seconds numeric)
language sql as $$
  select p.status, p.can_finalise, p.period_ended, p.actor_role, p.reason, p.session_count, p.paid_seconds
  from public.get_payroll_period(
    'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', '2024-09-30'
  ) p;
$$;
grant execute on function pg_temp.rev(uuid), pg_temp.approve(uuid), pg_temp.finalise(uuid, text, date),
  pg_temp.reopen(uuid, text), pg_temp.exceptions(), pg_temp.period() to authenticated;

set local role anon;
select extensions.throws_ok($$select public.finalise_payroll_period(
  'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', '2024-09-30',
  gen_random_uuid(), null)$$, '42501', null, 'anonymous callers cannot finalise payroll');
select extensions.throws_ok($$select * from public.payroll_period_events$$,
  '42501', null, 'anonymous callers cannot read payroll period events');
set local role authenticated;
select extensions.throws_ok($$select public.record_payroll_period_event(
  'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', '2024-09-30',
  gen_random_uuid(), 'finalised', null)$$, '42501', null, 'the internal recorder is not publicly callable');
select extensions.throws_ok($$select public.can_finalise_payroll_period(
  'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001')$$,
  '42501', null, 'the internal authority helper is not publicly callable');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'an employee cannot finalise payroll');
select extensions.throws_ok($$select * from pg_temp.exceptions()$$,
  'P0001', 'Permission denied', 'an employee cannot list payroll exceptions');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000005', true);
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant owner cannot finalise the period');
select extensions.throws_ok($$select * from pg_temp.period()$$,
  'P0001', 'Permission denied', 'another tenant owner cannot read the period status');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000003', true);
select extensions.is((select status || ':' || can_finalise from pg_temp.period()), 'open:false',
  'a department manager sees the open period without finalise authority');
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000001')$$,
  'P0001', 'Only an owner, admin or general manager with full venue access can finalise or reopen payroll',
  'a department manager cannot finalise payroll');
select extensions.is((select count(*) from pg_temp.exceptions() where session_id in (
  '27200000-0000-4000-8000-000000000002', '27200000-0000-4000-8000-000000000005')), 0::bigint,
  'a FOH manager does not see BOH exceptions');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000006', true);
select extensions.throws_ok($$select * from pg_temp.period()$$,
  'P0001', 'Permission denied', 'a general manager of another venue cannot read this venue period');
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a general manager of another venue cannot finalise this venue');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000001', true);
select extensions.is((select status || ':' || can_finalise || ':' || period_ended from pg_temp.period()),
  'open:true:true', 'the owner sees an ended open period they can finalise');
select extensions.throws_ok($$select pg_temp.finalise(null)$$,
  'P0001', 'Invalid payroll period request', 'finalising requires a request identifier');
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000001', repeat('x', 501))$$,
  'P0001', 'Invalid payroll period request', 'finalisation notes are limited to 500 characters');
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000001', null, '2024-10-01')$$,
  'P0001', 'Invalid timesheet week', 'periods must start on a Monday');
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000001', null,
  date_trunc('week', now() at time zone 'Australia/Sydney')::date)$$,
  'P0001', 'Payroll period has not ended', 'the current week cannot be finalised before it ends');
select extensions.results_eq($$select exception_code from pg_temp.exceptions() order by 1$$,
  $$values ('approval_pending'), ('approval_pending'), ('approval_pending'), ('approval_pending'),
    ('correction_request_pending'), ('incomplete_attendance'), ('location_review_required')$$,
  'outstanding approvals, incomplete attendance, location reviews and pending requests are surfaced');
select extensions.ok(exists (select 1 from pg_temp.exceptions()
  where session_id = '27200000-0000-4000-8000-000000000005'),
  'the Monday 00:30 local session belongs to the venue week, not the UTC week');
select extensions.ok(not exists (select 1 from pg_temp.exceptions()
  where session_id = '27200000-0000-4000-8000-000000000004'), 'the following week is not included');
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000001')$$,
  'P0001', 'Resolve outstanding exceptions before finalising', 'outstanding exceptions block finalisation');
select extensions.is((select count(*) from public.payroll_period_events), 0::bigint,
  'blocked finalisation records no event');

select pg_temp.approve('27200000-0000-4000-8000-000000000001');
select public.review_attendance_location_exception('b7200000-0000-4000-8000-000000000001',
  (select id from public.attendance_location_checks where event_id = '47200000-0000-4000-8000-000000000003'));
select pg_temp.approve('27200000-0000-4000-8000-000000000002');
select pg_temp.approve('27200000-0000-4000-8000-000000000005');
reset role;
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
) select '47200000-0000-4000-8000-000000000010', s.id, s.business_id, s.venue_id, s.department_id, s.employee_id,
  s.started_by, gen_random_uuid(), 'clock_out', '2024-10-03 04:00+00', 'server_clock'
from public.attendance_sessions s where s.id = '27200000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000001', true);
select extensions.is(array(select exception_code from pg_temp.exceptions() order by 1),
  array['approval_pending', 'correction_request_pending'], 'resolved exceptions disappear from the list');
select pg_temp.approve('27200000-0000-4000-8000-000000000003');
select public.review_attendance_offline_claim(
  'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
  '57200000-0000-4000-8000-000000000001', gen_random_uuid(), 'rejected', null, null, 'Clock-out already recorded');
select extensions.is((select count(*) from pg_temp.exceptions()), 0::bigint, 'all exceptions are resolved');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000002', true);
insert into saved_events select 'finalised', pg_temp.finalise('17200000-0000-4000-8000-000000000002', 'Ready for export');
select extensions.is((select status || ':' || actor_role || ':' || session_count || ':' || (paid_seconds = 25200) from pg_temp.period()),
  'finalised:general_manager:4:true', 'a venue general manager finalises the period with snapshot totals');
select extensions.is(array(select session_id from public.payroll_period_entries
  where event_id = (select id from saved_events where name = 'finalised') order by session_id), array[
    '27200000-0000-4000-8000-000000000001', '27200000-0000-4000-8000-000000000002',
    '27200000-0000-4000-8000-000000000003', '27200000-0000-4000-8000-000000000005']::uuid[],
  'the snapshot contains every approved session in the venue week');
select extensions.ok((select bool_and(e.decision_id = (select d.id from public.attendance_timesheet_decisions d
    where d.session_id = e.session_id order by d.sequence desc limit 1)
  and e.revision = pg_temp.rev(e.session_id))
  from public.payroll_period_entries e where e.event_id = (select id from saved_events where name = 'finalised')),
  'each snapshot row records the approval and attendance revision it relied on');
select extensions.is(pg_temp.finalise('17200000-0000-4000-8000-000000000002', 'Ready for export'),
  (select id from saved_events where name = 'finalised'), 'an identical retry returns the original finalisation');
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000002', 'Different')$$,
  'P0001', 'Request identifier already used', 'a retry cannot change the finalisation note');
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000003')$$,
  'P0001', 'Payroll period is already finalised', 'a finalised period cannot be finalised twice');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$select public.set_attendance_edit_lock('b7200000-0000-4000-8000-000000000001',
  'c7200000-0000-4000-8000-000000000001', '27200000-0000-4000-8000-000000000001', gen_random_uuid(),
  false, 'Late change')$$, 'P0001', 'Payroll period is finalised; reopen it before changing attendance',
  'finalised attendance cannot be unlocked');
select extensions.lives_ok($$select public.correct_attendance_event('b7200000-0000-4000-8000-000000000001',
  'c7200000-0000-4000-8000-000000000001', '27200000-0000-4000-8000-000000000004',
  '47200000-0000-4000-8000-000000000006', gen_random_uuid(), '2024-10-08 01:00+00', '2024-10-08 00:30+00',
  'Started earlier')$$, 'attendance in an open week can still be corrected');
select extensions.throws_ok($$select public.correct_attendance_event('b7200000-0000-4000-8000-000000000001',
  'c7200000-0000-4000-8000-000000000001', '27200000-0000-4000-8000-000000000004',
  '47200000-0000-4000-8000-000000000006', gen_random_uuid(), '2024-10-08 00:30+00', '2024-10-04 01:00+00',
  'Wrong week')$$, 'P0001', 'Payroll period is finalised; reopen it before changing attendance',
  'a correction cannot move attendance into a finalised week');
reset role;
select extensions.throws_ok($$insert into public.attendance_breaks (session_id, business_id, classification)
  values ('27200000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'paid')$$,
  'P0001', 'Payroll period is finalised; reopen it before changing attendance',
  'even privileged direct writes to finalised attendance are blocked');
set local role authenticated;

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000004', true);
select extensions.lives_ok($$select * from public.submit_attendance_correction_request(
  'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000001', 'e7200000-0000-4000-8000-000000000001',
  'a7200000-0000-4000-8000-000000000004', gen_random_uuid(), 'clock_in', '2024-10-01 00:45+00', 'I started earlier')$$,
  'an employee can still request a correction after finalisation');
select extensions.is((select count(*) from public.payroll_period_entries), 2::bigint,
  'an employee sees only their own finalised entries');
select extensions.throws_ok($$select * from pg_temp.period()$$,
  'P0001', 'Permission denied', 'an employee cannot read the period status');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000003', true);
select extensions.is((select status || ':' || can_finalise from pg_temp.period()), 'finalised:false',
  'a department manager sees the finalised status');
select extensions.is(array(select exception_code from pg_temp.exceptions()), array['correction_request_pending'],
  'a request received after finalisation is surfaced on the finalised period');
select extensions.throws_ok($$select pg_temp.reopen('17200000-0000-4000-8000-000000000004', 'Need change')$$,
  'P0001', 'Only an owner, admin or general manager with full venue access can finalise or reopen payroll',
  'a department manager cannot reopen payroll');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*) from public.payroll_period_events), 0::bigint,
  'another tenant cannot read period events');
select extensions.is((select count(*) from public.payroll_period_entries), 0::bigint,
  'another tenant cannot read period entries');
select extensions.throws_ok($$select pg_temp.reopen('17200000-0000-4000-8000-000000000004', 'Need change')$$,
  'P0001', 'Permission denied', 'another tenant cannot reopen the period');

select set_config('request.jwt.claim.sub', 'a7200000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$select pg_temp.reopen('17200000-0000-4000-8000-000000000004', '   ')$$,
  'P0001', 'Invalid payroll period request', 'reopening requires a reason');
select extensions.throws_ok($$select pg_temp.reopen('17200000-0000-4000-8000-000000000004', repeat('x', 501))$$,
  'P0001', 'Invalid payroll period request', 'reopen reasons are limited to 500 characters');
insert into saved_events select 'reopened', pg_temp.reopen('17200000-0000-4000-8000-000000000004',
  '  Employee start-time request  ');
select extensions.is((select status || ':' || actor_role || ':' || reason from pg_temp.period()),
  'reopened:owner:Employee start-time request', 'reopening logs the owner and trimmed reason');
select extensions.is(pg_temp.reopen('17200000-0000-4000-8000-000000000004', 'Employee start-time request'),
  (select id from saved_events where name = 'reopened'), 'an identical reopen retry returns the original event');
select extensions.throws_ok($$select pg_temp.reopen('17200000-0000-4000-8000-000000000005', 'Again')$$,
  'P0001', 'Payroll period is not finalised', 'an open period cannot be reopened');
select extensions.results_eq($$select action, actor_is_self from public.list_payroll_period_events(
  'b7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', '2024-09-30')$$,
  $$values ('reopened'::text, true), ('finalised'::text, false)$$, 'the period history keeps both events, newest first');
select extensions.is((select count(*) from public.payroll_period_entries
  where event_id = (select id from saved_events where name = 'finalised')), 4::bigint,
  'reopening preserves the original finalisation snapshot');
select extensions.lives_ok($$select public.set_attendance_edit_lock('b7200000-0000-4000-8000-000000000001',
  'c7200000-0000-4000-8000-000000000001', '27200000-0000-4000-8000-000000000001', gen_random_uuid(),
  false, 'Apply employee request')$$, 'reopened attendance can be unlocked again');
select extensions.is(array(select exception_code from pg_temp.exceptions() order by 1),
  array['approval_outdated', 'correction_request_pending'], 'the reopened period surfaces the new exceptions');
select extensions.throws_ok($$select pg_temp.finalise('17200000-0000-4000-8000-000000000006')$$,
  'P0001', 'Resolve outstanding exceptions before finalising', 'a reopened period needs exceptions resolved again');

reset role;
select extensions.throws_ok($$update public.payroll_period_events set reason = 'Changed'$$,
  'P0001', 'Original attendance records are immutable', 'period events are immutable for privileged updates');
select extensions.throws_ok($$delete from public.payroll_period_entries$$,
  'P0001', 'Original attendance records are immutable', 'period entries are immutable for privileged deletes');
delete from public.businesses where id = 'b7200000-0000-4000-8000-000000000001';
select extensions.is((select count(*) from public.payroll_period_events
  where business_id = 'b7200000-0000-4000-8000-000000000001'), 0::bigint,
  'deleting a disposable tenant cascades its payroll periods');

select * from extensions.finish();
rollback;
