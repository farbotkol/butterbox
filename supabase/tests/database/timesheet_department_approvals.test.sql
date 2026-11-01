begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7100000-0000-4000-8000-000000000001', 'approve-owner@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000002', 'approve-foh@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000003', 'approve-boh@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000004', 'approve-worker@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000005', 'approve-outside@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000006', 'approve-foh-worker@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7100000-0000-4000-8000-000000000001', 'Approval cafe'),
  ('b7100000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c7100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'FOH'),
  ('d7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000002', 'foh_manager', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001'),
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000003', 'boh_manager', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000002'),
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004', 'employee', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001'),
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000006', 'foh_manager', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001'),
  ('b7100000-0000-4000-8000-000000000002', 'a7100000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004', 'Split worker', 'Server'),
  ('e7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000006', 'Working manager', 'Supervisor');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000002');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
select f.id::uuid, 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
  f.department_id::uuid, f.employee_id::uuid, f.started_by::uuid
from (values
  ('27100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004'),
  ('27100000-0000-4000-8000-000000000002', 'd7100000-0000-4000-8000-000000000002', 'e7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004'),
  ('27100000-0000-4000-8000-000000000003', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004'),
  ('27100000-0000-4000-8000-000000000004', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000004'),
  ('27100000-0000-4000-8000-000000000005', 'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000002', 'a7100000-0000-4000-8000-000000000006')
) f(id, department_id, employee_id, started_by);
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  f.event_type, f.occurred_at::timestamptz, 'server_clock'
from (values
  ('47100000-0000-4000-8000-000000000001', '27100000-0000-4000-8000-000000000001', 'clock_in', '2024-10-01 01:00+00'),
  ('47100000-0000-4000-8000-000000000002', '27100000-0000-4000-8000-000000000001', 'clock_out', '2024-10-01 02:00+00'),
  ('47100000-0000-4000-8000-000000000003', '27100000-0000-4000-8000-000000000002', 'clock_in', '2024-10-01 03:00+00'),
  ('47100000-0000-4000-8000-000000000004', '27100000-0000-4000-8000-000000000002', 'clock_out', '2024-10-01 05:00+00'),
  ('47100000-0000-4000-8000-000000000005', '27100000-0000-4000-8000-000000000003', 'clock_in', '2024-10-04 01:00+00'),
  ('47100000-0000-4000-8000-000000000006', '27100000-0000-4000-8000-000000000004', 'clock_in', '2024-10-03 01:00+00'),
  ('47100000-0000-4000-8000-000000000007', '27100000-0000-4000-8000-000000000004', 'clock_out', '2024-10-03 02:00+00'),
  ('47100000-0000-4000-8000-000000000008', '27100000-0000-4000-8000-000000000005', 'clock_in', '2024-10-03 03:00+00'),
  ('47100000-0000-4000-8000-000000000009', '27100000-0000-4000-8000-000000000005', 'clock_out', '2024-10-03 04:00+00')
) f(id, session_id, event_type, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;

create temporary table saved_decisions (name text primary key, id uuid);
grant select, insert on saved_decisions to authenticated;
create function pg_temp.rev(p_session uuid)
returns text language sql as $$
  select w.edit_revision from public.list_weekly_worked_time_for_edit(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2024-09-30'
  ) w where w.session_id = p_session;
$$;
create function pg_temp.decide(
  p_session uuid, p_request uuid, p_decision text, p_reason text default null, p_revision text default null
)
returns uuid language sql as $$
  select public.decide_attendance_timesheet(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', p_session, p_request,
    coalesce(p_revision, pg_temp.rev(p_session), repeat('a', 64)), p_decision, p_reason
  );
$$;
create function pg_temp.approvals()
returns table (session_id uuid, department_id uuid, status text, decision text, reason text, self_owned boolean)
language sql as $$
  select a.session_id, a.department_id, a.status, a.decision, a.reason, a.self_owned
  from public.list_weekly_timesheet_approvals(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2024-09-30'
  ) a;
$$;
grant execute on function pg_temp.rev(uuid), pg_temp.decide(uuid, uuid, text, text, text), pg_temp.approvals()
  to authenticated;

set local role anon;
select extensions.throws_ok($$select public.decide_attendance_timesheet(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
  '27100000-0000-4000-8000-000000000001', gen_random_uuid(), repeat('a', 64), 'approved', null)$$,
  '42501', null, 'anonymous callers cannot decide timesheets');
select extensions.throws_ok($$select * from public.attendance_timesheet_decisions$$,
  '42501', null, 'anonymous callers cannot read timesheet decisions');
set local role authenticated;
select extensions.throws_ok($$select public.attendance_timesheet_status('27100000-0000-4000-8000-000000000001')$$,
  '42501', null, 'the internal status helper is not publicly callable');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000001', 'approved', null, repeat('a', 64))$$,
  'P0001', 'Session not found or permission denied', 'an employee cannot approve their own time');
select extensions.throws_ok($$select * from public.list_weekly_timesheet_approvals(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2024-09-30')$$,
  'P0001', 'Permission denied', 'an employee cannot list department approvals');
select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000005', true);
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000001', 'approved', null, repeat('a', 64))$$,
  'P0001', 'Permission denied', 'another tenant owner cannot approve the time');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000002',
  '17100000-0000-4000-8000-000000000001', 'approved', null, repeat('a', 64))$$,
  'P0001', 'Session not found or permission denied', 'a FOH manager cannot approve BOH time for a shared worker');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000001', 'paid')$$,
  'P0001', 'Invalid timesheet decision', 'unknown decisions are rejected');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000001', 'rejected', '   ')$$,
  'P0001', 'Invalid timesheet decision', 'returning time requires an explanation');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000001', 'approved', repeat('x', 501))$$,
  'P0001', 'Invalid timesheet decision', 'explanations are limited to 500 characters');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000001', 'approved', null, 'stale')$$,
  'P0001', 'Invalid timesheet decision', 'malformed revisions are rejected');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000001', 'approved', null, repeat('b', 64))$$,
  'P0001', 'Attendance changed; review again', 'stale reviews cannot be approved');
select extensions.is((select count(*) from pg_temp.approvals() where status = 'pending'), 4::bigint,
  'FOH sees four pending FOH entries before approval');

insert into saved_decisions select 'foh-approval', pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000001', 'approved', 'Matches roster');
select extensions.is((select status from pg_temp.approvals() where session_id = '27100000-0000-4000-8000-000000000001'),
  'approved', 'the FOH manager approves FOH time');
select extensions.is((select department_id from public.attendance_timesheet_decisions
  where id = (select id from saved_decisions where name = 'foh-approval')),
  'd7100000-0000-4000-8000-000000000001'::uuid, 'the approval is attributed to the session department');
select extensions.ok((select lock_event_id is not null and actor_id = 'a7100000-0000-4000-8000-000000000002'
  from public.attendance_timesheet_decisions where id = (select id from saved_decisions where name = 'foh-approval')),
  'the approval records the actor and its edit lock');
select extensions.is((select edit_locked from public.list_weekly_worked_time_for_edit(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2024-09-30')
  where session_id = '27100000-0000-4000-8000-000000000001'), true, 'approved time is locked against corrections');
select extensions.is(pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000001', 'approved', 'Matches roster'),
  (select id from saved_decisions where name = 'foh-approval'), 'an identical retry returns the original approval');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000001', 'approved', 'Different')$$,
  'P0001', 'Request identifier already used', 'a retry cannot change the approval explanation');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000002', 'approved')$$,
  'P0001', 'Timesheet entry is already approved', 'current approvals cannot be duplicated');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000003', 'rejected', 'Wrong time')$$,
  'P0001', 'Unlock attendance before returning it for correction', 'approved locked time cannot be returned silently');
select extensions.throws_ok($$select public.correct_attendance_event(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
  '27100000-0000-4000-8000-000000000001', '47100000-0000-4000-8000-000000000002', gen_random_uuid(),
  '2024-10-01 02:00+00', '2024-10-01 02:30+00', 'Late change')$$,
  'P0001', 'Attendance edits are locked', 'approved time cannot be corrected without an unlock');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000003',
  '17100000-0000-4000-8000-000000000004', 'approved')$$,
  'P0001', 'Incomplete or invalid attendance cannot be approved', 'incomplete time cannot be approved');
select extensions.lives_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000003',
  '17100000-0000-4000-8000-000000000005', 'rejected', 'Missing clock-out; please request it')$$,
  'incomplete time can be returned for correction');
insert into saved_decisions select 'return', pg_temp.decide('27100000-0000-4000-8000-000000000004',
  '17100000-0000-4000-8000-000000000006', 'rejected', 'Finish time looks early');
select extensions.is((select status from pg_temp.approvals() where session_id = '27100000-0000-4000-8000-000000000004'),
  'returned', 'rejected time is returned for correction');
select extensions.is((select edit_locked from public.list_weekly_worked_time_for_edit(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2024-09-30')
  where session_id = '27100000-0000-4000-8000-000000000004'), false, 'returned time remains correctable');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000004',
  '17100000-0000-4000-8000-000000000007', 'rejected', 'Again')$$,
  'P0001', 'Timesheet entry is already returned for correction', 'unchanged returned time cannot be returned twice');
select extensions.is((select self_owned from pg_temp.approvals() where session_id = '27100000-0000-4000-8000-000000000005'),
  false, 'another manager''s attendance is not marked as self-owned');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000004', true);
select extensions.is((select status || ':' || reason from public.list_timesheet_decisions(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')
  where session_id = '27100000-0000-4000-8000-000000000004'), 'returned:Finish time looks early',
  'the employee sees the returned entry and explanation');
select extensions.is((select count(*) from public.list_timesheet_decisions(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')), 3::bigint,
  'the employee sees decisions for their own attendance');
select extensions.throws_ok($$insert into public.attendance_timesheet_decisions (
  business_id, venue_id, department_id, employee_id, session_id, actor_id, request_id, decision, revision)
  values ('b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
  'd7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001',
  '27100000-0000-4000-8000-000000000004', 'a7100000-0000-4000-8000-000000000004', gen_random_uuid(),
  'approved', repeat('a', 64))$$, '42501', null, 'decisions cannot be inserted directly');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000002', true);
select public.correct_attendance_event(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
  '27100000-0000-4000-8000-000000000004', '47100000-0000-4000-8000-000000000007', gen_random_uuid(),
  '2024-10-03 02:00+00', '2024-10-03 02:45+00', 'Employee confirmed later finish');
select extensions.is((select status from pg_temp.approvals() where session_id = '27100000-0000-4000-8000-000000000004'),
  'resubmitted', 'corrected returned time is ready for review again');
select extensions.lives_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000004',
  '17100000-0000-4000-8000-000000000008', 'approved')$$, 'corrected time can then be approved');
select extensions.is((select status from pg_temp.approvals() where session_id = '27100000-0000-4000-8000-000000000004'),
  'approved', 'the corrected entry is approved');
select extensions.is((select reason from public.attendance_timesheet_decisions
  where id = (select id from saved_decisions where name = 'return')), 'Finish time looks early',
  'the earlier return remains in the history');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000006', true);
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000005',
  '17100000-0000-4000-8000-000000000009', 'approved')$$,
  'P0001', 'You cannot approve or return your own attendance', 'a manager cannot approve their own attendance');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000005',
  '17100000-0000-4000-8000-000000000009', 'rejected', 'Mine')$$,
  'P0001', 'You cannot approve or return your own attendance', 'a manager cannot return their own attendance');
select extensions.is((select self_owned from pg_temp.approvals() where session_id = '27100000-0000-4000-8000-000000000005'),
  true, 'the manager''s own attendance is marked as self-owned');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000003', true);
select extensions.is(array(select session_id from pg_temp.approvals()),
  array['27100000-0000-4000-8000-000000000002'::uuid], 'BOH sees only BOH time for the shared worker');
select extensions.throws_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000010', 'rejected', 'Not mine')$$,
  'P0001', 'Session not found or permission denied', 'a BOH manager cannot return FOH time');
select extensions.is((select count(*) from public.list_timesheet_decisions(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')), 0::bigint,
  'BOH cannot read FOH decisions');
insert into saved_decisions select 'boh-approval', pg_temp.decide('27100000-0000-4000-8000-000000000002',
  '17100000-0000-4000-8000-000000000011', 'approved');
select extensions.is((select department_id from public.attendance_timesheet_decisions
  where id = (select id from saved_decisions where name = 'boh-approval')),
  'd7100000-0000-4000-8000-000000000002'::uuid, 'BOH approval is attributed to BOH for the same worker');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*) from public.list_timesheet_decisions(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')), 0::bigint,
  'another tenant cannot read decisions');
select extensions.is((select count(*) from public.attendance_timesheet_decisions), 0::bigint,
  'another tenant cannot read decisions directly');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000001', true);
select public.set_attendance_edit_lock('b7100000-0000-4000-8000-000000000001',
  'c7100000-0000-4000-8000-000000000001', '27100000-0000-4000-8000-000000000001', gen_random_uuid(),
  false, 'Reopen for late correction');
select extensions.is((select status from pg_temp.approvals() where session_id = '27100000-0000-4000-8000-000000000001'),
  'approval_outdated', 'unlocking approved time makes the approval outdated');
select extensions.lives_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000005',
  '17100000-0000-4000-8000-000000000012', 'approved')$$, 'an owner can approve another manager''s attendance');
select extensions.lives_ok($$select pg_temp.decide('27100000-0000-4000-8000-000000000001',
  '17100000-0000-4000-8000-000000000013', 'rejected', 'Please confirm finish')$$,
  'unlocked outdated time can be returned for correction');

reset role;
select extensions.throws_ok($$update public.attendance_timesheet_decisions set reason = 'Changed'$$,
  'P0001', 'Original attendance records are immutable', 'decisions are immutable for privileged updates');
select extensions.throws_ok($$delete from public.attendance_timesheet_decisions$$,
  'P0001', 'Original attendance records are immutable', 'decisions are immutable for privileged deletes');
delete from public.businesses where id = 'b7100000-0000-4000-8000-000000000001';
select extensions.is((select count(*) from public.attendance_timesheet_decisions
  where business_id = 'b7100000-0000-4000-8000-000000000001'), 0::bigint,
  'deleting a disposable tenant cascades its decisions');

select * from extensions.finish();
rollback;
