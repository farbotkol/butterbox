begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data)
select ('a9120000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'report-' || n || '@example.test', '{}'::jsonb from generate_series(1, 5) n;
insert into public.businesses (id, name) values
  ('b9120000-0000-4000-8000-000000000001', 'Report cafe'),
  ('b9120000-0000-4000-8000-000000000002', 'Outside report cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c9120000-0000-4000-8000-000000000001', 'b9120000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c9120000-0000-4000-8000-000000000002', 'b9120000-0000-4000-8000-000000000001', 'UTC', 'UTC'),
  ('c9120000-0000-4000-8000-000000000003', 'b9120000-0000-4000-8000-000000000002', 'Outside', 'UTC'),
  ('c9120000-0000-4000-8000-000000000004', 'b9120000-0000-4000-8000-000000000001', 'No departments', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d9120000-0000-4000-8000-000000000001', 'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', 'FOH'),
  ('d9120000-0000-4000-8000-000000000002', 'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', 'BOH'),
  ('d9120000-0000-4000-8000-000000000003', 'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000002', 'UTC FOH'),
  ('d9120000-0000-4000-8000-000000000004', 'b9120000-0000-4000-8000-000000000002', 'c9120000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b9120000-0000-4000-8000-000000000001', 'a9120000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b9120000-0000-4000-8000-000000000001', 'a9120000-0000-4000-8000-000000000002', 'foh_manager', 'c9120000-0000-4000-8000-000000000001', 'd9120000-0000-4000-8000-000000000001'),
  ('b9120000-0000-4000-8000-000000000001', 'a9120000-0000-4000-8000-000000000003', 'employee', 'c9120000-0000-4000-8000-000000000001', 'd9120000-0000-4000-8000-000000000001'),
  ('b9120000-0000-4000-8000-000000000002', 'a9120000-0000-4000-8000-000000000004', 'owner', null, null),
  ('b9120000-0000-4000-8000-000000000001', 'a9120000-0000-4000-8000-000000000005', 'admin', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e9120000-0000-4000-8000-000000000001', 'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', 'd9120000-0000-4000-8000-000000000001', 'a9120000-0000-4000-8000-000000000003', 'Shared department worker', 'Server'),
  ('e9120000-0000-4000-8000-000000000002', 'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000002', 'd9120000-0000-4000-8000-000000000003', null, 'UTC worker', 'Server'),
  ('e9120000-0000-4000-8000-000000000003', 'b9120000-0000-4000-8000-000000000002', 'c9120000-0000-4000-8000-000000000003', 'd9120000-0000-4000-8000-000000000004', null, 'Outside worker', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b9120000-0000-4000-8000-000000000001', 'e9120000-0000-4000-8000-000000000001', 'd9120000-0000-4000-8000-000000000002');

insert into public.shifts (
  business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, break_minutes, is_published, status
)
select 'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001',
  'd9120000-0000-4000-8000-000000000001',
  case when f.assigned then 'e9120000-0000-4000-8000-000000000001'::uuid end,
  'Server', f.starts_at::timestamptz, f.ends_at::timestamptz, f.break_minutes, f.published, f.status
from (values
  ('2024-10-01 01:00+00', '2024-10-01 09:00+00', 30, true, true, 'scheduled'),
  ('2024-10-05 15:00+00', '2024-10-05 17:00+00', 0, true, true, 'scheduled'),
  ('2024-09-29 14:00+00', '2024-09-29 15:00+00', 0, true, true, 'scheduled'),
  ('2024-10-02 01:00+00', '2024-10-02 09:00+00', 0, false, true, 'scheduled'),
  ('2024-10-03 01:00+00', '2024-10-03 09:00+00', 0, true, false, 'scheduled'),
  ('2024-10-04 01:00+00', '2024-10-04 09:00+00', 0, true, true, 'cancelled'),
  ('2024-10-06 13:00+00', '2024-10-06 14:00+00', 0, true, true, 'scheduled')
) f(starts_at, ends_at, break_minutes, published, assigned, status);
insert into public.shifts (
  business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published
) values
  ('b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001',
   'd9120000-0000-4000-8000-000000000002', 'e9120000-0000-4000-8000-000000000001',
   'Kitchen', '2024-10-01 10:00+00', '2024-10-01 14:00+00', true),
  ('b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000002',
   'd9120000-0000-4000-8000-000000000003', 'e9120000-0000-4000-8000-000000000002',
   'Server', '2024-09-29 14:00+00', '2024-09-29 15:00+00', true),
  ('b9120000-0000-4000-8000-000000000002', 'c9120000-0000-4000-8000-000000000003',
   'd9120000-0000-4000-8000-000000000004', 'e9120000-0000-4000-8000-000000000003',
   'Server', '2024-10-01 01:00+00', '2024-10-01 23:00+00', true);

insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
select ('29120000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'b9120000-0000-4000-8000-000000000001',
  case when n = 9 then 'c9120000-0000-4000-8000-000000000002'::uuid else 'c9120000-0000-4000-8000-000000000001'::uuid end,
  case when n = 9 then 'd9120000-0000-4000-8000-000000000003'::uuid
    when n = 2 then 'd9120000-0000-4000-8000-000000000002'::uuid else 'd9120000-0000-4000-8000-000000000001'::uuid end,
  case when n = 9 then 'e9120000-0000-4000-8000-000000000002'::uuid else 'e9120000-0000-4000-8000-000000000001'::uuid end,
  'a9120000-0000-4000-8000-000000000003' from generate_series(1, 10) n;
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
)
select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  t.event_type, t.occurred_at, 'server_clock'
from (values
  (1, '2024-10-01 01:00+00', '2024-10-01 09:00+00'),
  (2, '2024-10-01 10:00+00', '2024-10-01 12:00+00'),
  (3, '2024-10-02 01:00+00', '2024-10-02 02:00+00'),
  (4, '2024-10-02 03:00+00', null),
  (5, '2024-10-03 01:00+00', '2024-10-03 02:00+00'),
  (6, '2024-10-04 01:00+00', '2024-10-04 02:00+00'),
  (7, '2024-10-06 13:00+00', '2024-10-06 14:00+00'),
  (8, '2024-09-29 14:00+00', '2024-09-29 15:00+00'),
  (9, '2024-09-29 14:00+00', '2024-09-29 15:00+00'),
  (10, '2024-10-05 15:00+00', '2024-10-05 17:00+00')
) f(n, starts_at, ends_at)
join public.attendance_sessions s on s.id = ('29120000-0000-4000-8000-' || lpad(f.n::text, 12, '0'))::uuid
cross join lateral (values ('clock_in', f.starts_at::timestamptz), ('clock_out', f.ends_at::timestamptz)) t(event_type, occurred_at)
where t.occurred_at is not null;
insert into public.attendance_breaks (id, session_id, business_id, classification) values
  ('39120000-0000-4000-8000-000000000001', '29120000-0000-4000-8000-000000000001', 'b9120000-0000-4000-8000-000000000001', 'paid'),
  ('39120000-0000-4000-8000-000000000002', '29120000-0000-4000-8000-000000000001', 'b9120000-0000-4000-8000-000000000001', 'unpaid');
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source, break_id
)
select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  t.event_type, t.occurred_at::timestamptz, 'server_clock', b.id
from (values
  ('39120000-0000-4000-8000-000000000001', 'break_start', '2024-10-01 03:00+00'),
  ('39120000-0000-4000-8000-000000000001', 'break_end', '2024-10-01 03:15+00'),
  ('39120000-0000-4000-8000-000000000002', 'break_start', '2024-10-01 05:00+00'),
  ('39120000-0000-4000-8000-000000000002', 'break_end', '2024-10-01 05:30+00')
) t(break_id, event_type, occurred_at)
join public.attendance_breaks b on b.id = t.break_id::uuid
join public.attendance_sessions s on s.id = b.session_id;

create function pg_temp.report(p_venue uuid default null, p_department uuid default null, p_week date default '2024-09-30')
returns jsonb language sql as $$
  select public.get_hours_labour_report('b9120000-0000-4000-8000-000000000001', p_week, p_venue, p_department);
$$;
create function pg_temp.total(p_key text)
returns numeric language sql as $$
  select coalesce(sum((r ->> p_key)::numeric), 0) from jsonb_array_elements(pg_temp.report()) r;
$$;
grant execute on function pg_temp.report(uuid, uuid, date), pg_temp.total(text) to authenticated, anon, service_role;

set local role anon;
select extensions.throws_ok($$select pg_temp.report()$$, '42501', null, 'anonymous report is denied');
set local role service_role;
select extensions.throws_ok($$select pg_temp.report()$$, '42501', null, 'service API cannot bypass owner report');
set local role authenticated;
select extensions.throws_ok($$select pg_temp.report()$$, 'P0001', null, 'missing identity is denied');
select set_config('request.jwt.claim.sub', 'a9120000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$select pg_temp.report()$$, 'P0001', null, 'FOH manager cannot view owner report');
select set_config('request.jwt.claim.sub', 'a9120000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select pg_temp.report()$$, 'P0001', null, 'employee cannot view owner report');
select set_config('request.jwt.claim.sub', 'a9120000-0000-4000-8000-000000000005', true);
select extensions.throws_ok($$select pg_temp.report()$$, 'P0001', null, 'admin cannot view owner report');
select set_config('request.jwt.claim.sub', 'a9120000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select pg_temp.report()$$, 'P0001', null, 'outside owner cannot view tenant report');
select set_config('request.jwt.claim.sub', 'a9120000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$select public.get_hours_labour_report(null, '2024-09-30')$$, 'P0001', null, 'null business denied');
select extensions.throws_ok($$select pg_temp.report(null, null, null)$$, 'P0001', 'Invalid report week', 'null week invalid');
select extensions.throws_ok($$select pg_temp.report(null, null, 'infinity')$$, 'P0001', 'Invalid report week', 'infinite week invalid');
select extensions.throws_ok($$select pg_temp.report(null, null, '2024-10-01')$$, 'P0001', 'Invalid report week', 'non-Monday invalid');
select extensions.throws_ok($$select pg_temp.report('c9120000-0000-4000-8000-000000000003')$$,
  'P0001', 'Invalid report filter', 'outside venue invalid');
select extensions.throws_ok($$select pg_temp.report(null, 'd9120000-0000-4000-8000-000000000004')$$,
  'P0001', 'Invalid report filter', 'outside department invalid');
select extensions.throws_ok($$select pg_temp.report('c9120000-0000-4000-8000-000000000002', 'd9120000-0000-4000-8000-000000000001')$$,
  'P0001', 'Invalid report filter', 'mismatched venue/department invalid');
select extensions.throws_ok($$select pg_temp.report('c9120000-0000-4000-8000-000000000099')$$,
  'P0001', 'Invalid report filter', 'unknown venue invalid');
select extensions.is(jsonb_array_length(pg_temp.report()), 3, 'all visible venue departments returned once');
select extensions.is(pg_temp.report('c9120000-0000-4000-8000-000000000004'), '[]'::jsonb, 'no-department venue is empty');
select extensions.is(pg_temp.total('approved_worked_seconds'), 0::numeric, 'unapproved sessions never become approved actual time');
select extensions.is(pg_temp.total('scheduled_seconds'), 54000::numeric, 'planned gross hours exclude drafts, cancellation, unassigned and next week');
select extensions.is((pg_temp.report(null, 'd9120000-0000-4000-8000-000000000003')->0->>'scheduled_seconds')::numeric,
  0::numeric, 'same UTC instant is outside the UTC venue week');
select extensions.is(pg_temp.total('invalid_entries'), 1::numeric, 'open clock excluded and reported incomplete');

select public.decide_attendance_timesheet(
  'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', w.session_id,
  gen_random_uuid(), w.edit_revision, 'approved', null
) from public.list_weekly_worked_time_for_edit(
  'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', '2024-09-30'
) w where w.session_id in (
  '29120000-0000-4000-8000-000000000001', '29120000-0000-4000-8000-000000000002',
  '29120000-0000-4000-8000-000000000005', '29120000-0000-4000-8000-000000000008',
  '29120000-0000-4000-8000-000000000010'
);
select public.decide_attendance_timesheet(
  'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', w.session_id,
  gen_random_uuid(), w.edit_revision, 'rejected', 'Review recorded time'
) from public.list_weekly_worked_time_for_edit(
  'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', '2024-09-30'
) w where w.session_id = '29120000-0000-4000-8000-000000000006';
reset role;
insert into public.attendance_edit_lock_events (business_id, session_id, actor_id, request_id, locked, reason) values
  ('b9120000-0000-4000-8000-000000000001', '29120000-0000-4000-8000-000000000005',
   'a9120000-0000-4000-8000-000000000001', gen_random_uuid(), false, 'Review again');
set local role authenticated;
select extensions.is(pg_temp.total('approved_worked_seconds'), 44100::numeric, 'approved worked excludes all breaks and outdated decisions');
select extensions.is(pg_temp.total('approved_paid_seconds'), 45000::numeric, 'approved paid includes paid breaks but not unpaid breaks');
select extensions.is(pg_temp.total('approved_entries'), 4::numeric, 'current approvals counted once');
select extensions.is(pg_temp.total('excluded_entries'), 4::numeric, 'pending, returned, outdated and incomplete entries excluded');
select extensions.is(pg_temp.total('invalid_entries'), 1::numeric, 'invalid is a subset of excluded entries');
select extensions.is((pg_temp.report(null, 'd9120000-0000-4000-8000-000000000001')->0->>'approved_worked_seconds')::numeric,
  36900::numeric, 'FOH filter works independently of venue filter');
select extensions.is((pg_temp.report('c9120000-0000-4000-8000-000000000001', 'd9120000-0000-4000-8000-000000000002')->0->>'approved_worked_seconds')::numeric,
  7200::numeric, 'BOH session counted under recorded department rather than home department');
select extensions.is(jsonb_array_length(pg_temp.report('c9120000-0000-4000-8000-000000000001')), 2, 'venue filter returns both venue departments');
select extensions.is(pg_temp.total('approved_worked_seconds'), (
  select sum(w.worked_seconds) from public.list_weekly_worked_time(
    'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', '2024-09-30'
  ) w join public.list_weekly_timesheet_approvals(
    'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', '2024-09-30'
  ) a using (session_id) where a.status = 'approved'
), 'actual total reconciles exactly with current approved source timesheets');
select extensions.is((select sum((r->>'approved_worked_seconds')::numeric)
  from jsonb_array_elements(pg_temp.report(null, null, '2024-10-07')) r),
  0::numeric, 'next-week unapproved entry excluded from approved totals');
select extensions.is((select sum((r->>'excluded_entries')::numeric)
  from jsonb_array_elements(pg_temp.report(null, null, '2024-10-07')) r),
  1::numeric, 'DST-adjusted next Monday starts at 13:00 UTC');
select extensions.is((select sum((r->>'approved_entries')::numeric)
  from jsonb_array_elements(pg_temp.report(null, null, '2024-09-23')) r),
  0::numeric, 'previous week does not include Sydney Monday boundary clock');

select public.decide_attendance_timesheet(
  'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', w.session_id,
  gen_random_uuid(), w.edit_revision, 'approved', 'Re-reviewed'
) from public.list_weekly_worked_time_for_edit(
  'b9120000-0000-4000-8000-000000000001', 'c9120000-0000-4000-8000-000000000001', '2024-09-30'
) w where w.session_id = '29120000-0000-4000-8000-000000000005';
select extensions.is(pg_temp.total('approved_worked_seconds'), 47700::numeric, 'fresh approval changes read-only report total');
select extensions.is(pg_temp.total('excluded_entries'), 3::numeric, 'fresh approval removes outdated entry from excluded count');
select extensions.ok(not exists (
  select 1 from jsonb_array_elements(pg_temp.report()) r where r->>'business_id' <> 'b9120000-0000-4000-8000-000000000001'
), 'report rows carry only requested tenant');
select extensions.ok(not exists (
  select 1 from jsonb_array_elements(pg_temp.report()) r where r ? 'cost' or r ? 'payroll'
), 'database does not fabricate wage or payroll values');
select extensions.is(pg_temp.report(null, null, '2020-01-06')->0->>'approved_entries', '0', 'empty week returns defined zero metrics');
reset role;
delete from public.business_memberships where business_id = 'b9120000-0000-4000-8000-000000000001'
  and user_id = 'a9120000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select pg_temp.report()$$, 'P0001', null, 'revoked owner loses report access immediately');
select * from extensions.finish();
rollback;
