begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data)
select ('a9130000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'business-export-' || n || '@example.test', '{}'::jsonb from generate_series(1, 6) n;
insert into public.businesses (id, name) values
  ('b9130000-0000-4000-8000-000000000001', 'Export cafe'),
  ('b9130000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c9130000-0000-4000-8000-000000000001', 'b9130000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c9130000-0000-4000-8000-000000000002', 'b9130000-0000-4000-8000-000000000001', 'UTC', 'UTC'),
  ('c9130000-0000-4000-8000-000000000003', 'b9130000-0000-4000-8000-000000000002', 'Outside', 'UTC'),
  ('c9130000-0000-4000-8000-000000000004', 'b9130000-0000-4000-8000-000000000001', 'Capacity', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d9130000-0000-4000-8000-000000000001', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001', 'FOH'),
  ('d9130000-0000-4000-8000-000000000002', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000002', 'UTC team'),
  ('d9130000-0000-4000-8000-000000000003', 'b9130000-0000-4000-8000-000000000002', 'c9130000-0000-4000-8000-000000000003', 'Outside team'),
  ('d9130000-0000-4000-8000-000000000004', 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000004', 'Capacity team');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000002', 'foh_manager', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001'),
  ('b9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000003', 'employee', 'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001'),
  ('b9130000-0000-4000-8000-000000000002', 'a9130000-0000-4000-8000-000000000004', 'owner', null, null),
  ('b9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000005', 'admin', null, null),
  ('b9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, email, role_title) values
  ('e9130000-0000-4000-8000-000000000001', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001',
   'a9130000-0000-4000-8000-000000000003', ' =2+2', 'private@example.test', 'Server'),
  ('e9130000-0000-4000-8000-000000000002', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000002', 'd9130000-0000-4000-8000-000000000002',
   null, 'Other venue worker', 'other@example.test', 'Server'),
  ('e9130000-0000-4000-8000-000000000003', 'b9130000-0000-4000-8000-000000000002',
   'c9130000-0000-4000-8000-000000000003', 'd9130000-0000-4000-8000-000000000003',
   null, 'Outside worker', 'outside@example.test', 'Server'),
  ('e9130000-0000-4000-8000-000000000004', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000004', 'd9130000-0000-4000-8000-000000000004',
   null, 'Capacity worker', 'capacity@example.test', 'Server');

insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published, status
)
select ('19130000-0000-4000-8000-' || lpad(f.n::text, 12, '0'))::uuid,
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001',
  'd9130000-0000-4000-8000-000000000001',
  case when f.assigned then 'e9130000-0000-4000-8000-000000000001'::uuid end,
  '+Server', f.starts_at::timestamptz, f.starts_at::timestamptz + interval '1 hour', f.published, f.status
from (values
  (1, '2024-09-29 13:59:59.999999+00', true, true, 'scheduled'),
  (2, '2024-09-29 14:00:00+00', true, true, 'scheduled'),
  (3, '2024-10-01 01:00:00+00', false, false, 'scheduled'),
  (4, '2024-10-02 01:00:00+00', true, true, 'cancelled'),
  (5, '2024-10-06 12:59:59.999999+00', true, true, 'scheduled'),
  (6, '2024-10-06 13:00:00+00', true, true, 'scheduled')
) f(n, starts_at, published, assigned, status);
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published
) values
  ('19130000-0000-4000-8000-000000000007', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000002', 'd9130000-0000-4000-8000-000000000002',
   'e9130000-0000-4000-8000-000000000002', 'Server', '2024-10-01 01:00+00', '2024-10-01 02:00+00', true),
  ('19130000-0000-4000-8000-000000000008', 'b9130000-0000-4000-8000-000000000002',
   'c9130000-0000-4000-8000-000000000003', 'd9130000-0000-4000-8000-000000000003',
   'e9130000-0000-4000-8000-000000000003', 'Server', '2024-10-01 01:00+00', '2024-10-01 02:00+00', true);

insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
select ('29130000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001',
  'd9130000-0000-4000-8000-000000000001', 'e9130000-0000-4000-8000-000000000001',
  'a9130000-0000-4000-8000-000000000003' from generate_series(1, 5) n;
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by, created_at) values
  ('29130000-0000-4000-8000-000000000006', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001',
   'e9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000003', '2024-10-04 01:00+00'),
  ('29130000-0000-4000-8000-000000000007', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001',
   'e9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000003', '2024-10-03 00:00+00'),
  ('29130000-0000-4000-8000-000000000008', 'b9130000-0000-4000-8000-000000000001',
   'c9130000-0000-4000-8000-000000000002', 'd9130000-0000-4000-8000-000000000002',
   'e9130000-0000-4000-8000-000000000002', 'a9130000-0000-4000-8000-000000000001', '2024-10-01 01:00+00'),
  ('29130000-0000-4000-8000-000000000009', 'b9130000-0000-4000-8000-000000000002',
   'c9130000-0000-4000-8000-000000000003', 'd9130000-0000-4000-8000-000000000003',
   'e9130000-0000-4000-8000-000000000003', 'a9130000-0000-4000-8000-000000000004', '2024-10-01 01:00+00');
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
)
select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  t.event_type, t.occurred_at, 'server_clock'
from (values
  (1, '2024-09-29 13:59:59.999999+00', '2024-09-29 14:30:00+00'),
  (2, '2024-09-29 14:00:00+00', '2024-09-29 15:00:00+00'),
  (3, '2024-10-01 01:00:00+00', null),
  (4, '2024-10-06 12:59:59.999999+00', '2024-10-06 14:00:00+00'),
  (5, '2024-10-06 13:00:00+00', '2024-10-06 14:00:00+00')
) f(n, starts_at, ends_at)
join public.attendance_sessions s on s.id = ('29130000-0000-4000-8000-' || lpad(f.n::text, 12, '0'))::uuid
cross join lateral (values ('clock_in', f.starts_at::timestamptz), ('clock_out', f.ends_at::timestamptz)) t(event_type, occurred_at)
where t.occurred_at is not null;
insert into public.attendance_events (
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
) values (
  '29130000-0000-4000-8000-000000000007', 'b9130000-0000-4000-8000-000000000001',
  'c9130000-0000-4000-8000-000000000001', 'd9130000-0000-4000-8000-000000000001',
  'e9130000-0000-4000-8000-000000000001', 'a9130000-0000-4000-8000-000000000003',
  gen_random_uuid(), 'clock_out', '2024-10-03 01:00+00', 'server_clock'
);

create function pg_temp.export_report(
  p_type text default 'roster', p_week date default '2024-09-30',
  p_venue uuid default 'c9130000-0000-4000-8000-000000000001',
  p_business uuid default 'b9130000-0000-4000-8000-000000000001'
) returns jsonb language sql as $$
  select public.generate_business_report_export(p_business, p_venue, p_week, p_type);
$$;
create temporary table export_results (kind text primary key, payload jsonb not null);
grant all on export_results to authenticated;
grant execute on function pg_temp.export_report(text, date, uuid, uuid) to authenticated, anon, service_role;

set local role anon;
select extensions.throws_ok($$select pg_temp.export_report()$$, '42501', null, 'anonymous export is denied');
set local role service_role;
select extensions.throws_ok($$select pg_temp.export_report()$$, '42501', null, 'service API cannot bypass owner authorization');
select extensions.throws_ok($$select * from public.business_report_export_events$$, '42501', null,
  'service API cannot read export events directly');
select extensions.throws_ok($$insert into public.business_report_export_events
  (business_id, venue_id, actor_id, event_type, week_start, entry_count)
  values ('b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001',
    'a9130000-0000-4000-8000-000000000001', 'roster', '2024-09-30', 0)$$,
  '42501', null, 'service API cannot forge export events directly');
set local role authenticated;
select extensions.throws_ok($$select pg_temp.export_report()$$, 'P0001', 'Permission denied', 'missing identity is denied');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$select pg_temp.export_report()$$, 'P0001', 'Permission denied', 'department manager cannot export owner reports');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select pg_temp.export_report()$$, 'P0001', 'Permission denied', 'employee cannot export owner reports');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000005', true);
select extensions.throws_ok($$select pg_temp.export_report()$$, 'P0001', 'Permission denied', 'admin cannot export owner reports');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select pg_temp.export_report()$$, 'P0001', 'Permission denied', 'outside owner cannot export another business');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$select pg_temp.export_report(null)$$, 'P0001', 'Invalid report type', 'null report type rejected');
select extensions.throws_ok($$select pg_temp.export_report('payroll')$$, 'P0001', 'Invalid report type', 'unknown report type rejected');
select extensions.throws_ok($$select pg_temp.export_report('roster', null)$$, 'P0001', 'Invalid timesheet week', 'null week rejected');
select extensions.throws_ok($$select pg_temp.export_report('roster', 'infinity')$$, 'P0001', 'Invalid timesheet week', 'infinite week rejected');
select extensions.throws_ok($$select pg_temp.export_report('roster', '2024-10-01')$$, 'P0001', 'Invalid timesheet week', 'non-Monday week rejected');
select extensions.throws_ok($$select pg_temp.export_report('roster', '0001-01-01')$$, 'P0001', 'Invalid timesheet week',
  'week whose UTC boundary may precede year 0001 is rejected');
select extensions.throws_ok($$select pg_temp.export_report('roster', '2024-09-30', 'c9130000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'foreign venue rejected');
select extensions.throws_ok($$select pg_temp.export_report('attendance', '2024-09-30', 'c9130000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'foreign attendance venue rejected');
select extensions.throws_ok($$select pg_temp.export_report('roster', '2024-09-30', 'c9130000-0000-4000-8000-000000000099')$$,
  'P0001', 'Permission denied', 'unknown venue rejected');
select extensions.is((select count(*) from public.business_report_export_events), 0::bigint, 'denied and invalid requests do not create events');
select extensions.is((select pg_temp.export_report('roster', '0001-01-08')->>'period_start_utc'),
  '0001-01-07T13:55:08.000000Z', 'the earliest supported Sydney week has a representable UTC boundary');

insert into export_results values ('roster', pg_temp.export_report('roster'));
insert into export_results values ('attendance', pg_temp.export_report('attendance'));
select extensions.is((select (payload->>'entry_count')::integer from export_results where kind = 'roster'), 4,
  'roster includes start boundary, drafts, unassigned and cancellations before the DST-adjusted end boundary');
select extensions.is((select (payload->>'entry_count')::integer from export_results where kind = 'attendance'), 5,
  'attendance includes boundary, open and missing-event sessions but excludes adjacent weeks');
select extensions.is((select payload->'rows'->0->>'starts_at_utc' from export_results where kind = 'roster'),
  '2024-09-29T14:00:00.000000Z', 'roster boundary is explicit UTC with microseconds');
select extensions.is((select payload->'rows'->0->>'clock_in_utc' from export_results where kind = 'attendance'),
  '2024-09-29T14:00:00.000000Z', 'attendance boundary is explicit UTC with microseconds');
select extensions.is((select payload->>'period_start_utc' from export_results where kind = 'roster'),
  '2024-09-29T14:00:00.000000Z', 'period begins at local Monday midnight before DST');
select extensions.is((select payload->>'period_end_utc' from export_results where kind = 'roster'),
  '2024-10-06T13:00:00.000000Z', 'period ends at local Monday midnight after DST');
select extensions.ok((select exists (
  select 1 from jsonb_array_elements(payload->'rows') r
  where r->>'shift_id' = '19130000-0000-4000-8000-000000000003'
    and r->'employee_id' = 'null'::jsonb and r->'employee_name' = 'null'::jsonb
    and r->>'is_published' = 'false'
) from export_results where kind = 'roster'), 'unassigned draft is represented explicitly');
select extensions.ok((select exists (
  select 1 from jsonb_array_elements(payload->'rows') r where r->>'status' = 'cancelled'
) from export_results where kind = 'roster'), 'cancelled roster status is explicit');
select extensions.ok((select exists (
  select 1 from jsonb_array_elements(payload->'rows') r
  where r->>'session_id' = '29130000-0000-4000-8000-000000000003'
    and r->'clock_out_utc' = 'null'::jsonb and r->'worked_seconds' = 'null'::jsonb
    and r->>'timesheet_status' = 'pending'
) from export_results where kind = 'attendance'), 'open attendance remains incomplete and pending');
select extensions.ok((select exists (
  select 1 from jsonb_array_elements(payload->'rows') r
  where r->>'session_id' = '29130000-0000-4000-8000-000000000006'
    and r->>'period_reference_basis' = 'session_created'
    and r->>'period_reference_utc' = '2024-10-04T01:00:00.000000Z'
    and r->'clock_in_utc' = 'null'::jsonb and r->'clock_out_utc' = 'null'::jsonb
) from export_results where kind = 'attendance'), 'missing clock events use the session creation time for the week');
select extensions.ok((select exists (
  select 1 from jsonb_array_elements(payload->'rows') r
  where r->>'session_id' = '29130000-0000-4000-8000-000000000007'
    and r->>'period_reference_basis' = 'clock_out'
    and r->>'period_reference_utc' = '2024-10-03T01:00:00.000000Z'
    and r->'clock_in_utc' = 'null'::jsonb
) from export_results where kind = 'attendance'), 'a missing clock-in uses the effective clock-out for the week');
select extensions.is((select array_agg(k order by k) from export_results,
  lateral jsonb_object_keys(payload->'rows'->0) k where kind = 'roster'),
  array['break_minutes','department_id','department_name','employee_id','employee_name','ends_at_utc',
    'is_published','role_title','shift_id','starts_at_utc','status']::text[],
  'roster output contains only the explicit field allowlist');
select extensions.is((select array_agg(k order by k) from export_results,
  lateral jsonb_object_keys(payload->'rows'->0) k where kind = 'attendance'),
  array['clock_in_utc','clock_out_utc','department_id','department_name','elapsed_seconds','employee_id',
    'employee_name','has_exceptions','period_reference_basis','period_reference_utc','session_id',
    'timesheet_status','worked_seconds']::text[],
  'attendance output contains only the explicit field allowlist');
select extensions.ok((select bool_and(payload::text not like '%private@example.test%'
  and payload::text not like '%other@example.test%' and payload::text not like '%outside@example.test%')
  from export_results), 'contact details are never exported');
select extensions.ok((select bool_and(payload::text not like '%Outside worker%'
  and payload::text not like '%Other venue worker%') from export_results),
  'other businesses and venues do not appear in exports');
select extensions.is((select (pg_temp.export_report('roster', '2024-09-30',
  'c9130000-0000-4000-8000-000000000002')->>'entry_count')::integer), 1, 'second venue is explicitly selectable');
select extensions.is((select (pg_temp.export_report('attendance', '2024-09-30',
  'c9130000-0000-4000-8000-000000000002')->>'entry_count')::integer), 1,
  'attendance for the second venue is explicitly selectable without leaking other venues');
select extensions.is((select (pg_temp.export_report('roster', '2024-09-23')->>'entry_count')::integer), 1,
  'a different selected week excludes the current-week roster');
select extensions.is((select (pg_temp.export_report('attendance', '2020-01-06')->>'entry_count')::integer), 0,
  'empty attendance week produces an explicit empty report');

select extensions.is((select count(*) from public.business_report_export_events e
  join export_results r on e.id = (r.payload->>'event_id')::uuid
  where e.actor_id = 'a9130000-0000-4000-8000-000000000001'
    and e.business_id = 'b9130000-0000-4000-8000-000000000001'
    and e.venue_id = 'c9130000-0000-4000-8000-000000000001'
    and e.week_start = '2024-09-30' and e.event_type = r.kind
    and e.venue_timezone = 'Australia/Sydney'
    and e.period_starts_at = '2024-09-29 14:00:00+00'::timestamptz
    and e.period_ends_at = '2024-10-06 13:00:00+00'::timestamptz
    and e.entry_count = (r.payload->>'entry_count')::integer), 2::bigint,
  'each report records the actor, scope, type, timezone, UTC period and exact row count');
select extensions.is((select count(*) from public.sensitive_action_audit a
  join export_results r on a.record_id = r.payload->>'event_id'
  where a.source_table = 'business_report_export_events' and a.operation = 'INSERT'
    and a.actor_id = 'a9130000-0000-4000-8000-000000000001'
    and a.new_values->>'event_type' = r.kind
    and a.new_values->>'week_start' = '2024-09-30'
    and a.new_values->>'venue_timezone' = 'Australia/Sydney'
    and (a.new_values->>'period_starts_at')::timestamptz = '2024-09-29 14:00:00+00'::timestamptz
    and (a.new_values->>'period_ends_at')::timestamptz = '2024-10-06 13:00:00+00'::timestamptz), 2::bigint,
  'each generated report appears in the immutable sensitive-action audit');
select extensions.ok((select bool_and(not (a.new_values ? 'employee_name')
  and not (a.new_values ? 'email') and not (a.new_values ? 'clock_in_utc'))
  from public.sensitive_action_audit a join export_results r on a.record_id = r.payload->>'event_id'),
  'audit records metadata rather than exported personal data');
select extensions.throws_ok($$insert into public.business_report_export_events
  (business_id, venue_id, actor_id, event_type, week_start, entry_count)
  values ('b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000001',
    'a9130000-0000-4000-8000-000000000001', 'roster', '2024-09-30', 0)$$,
  '42501', null, 'authenticated callers cannot forge audit events');
select extensions.throws_ok($$update public.business_report_export_events set entry_count = 0$$,
  '42501', null, 'authenticated callers cannot edit export events');
select extensions.throws_ok($$delete from public.business_report_export_events$$,
  '42501', null, 'authenticated callers cannot delete export events');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.business_report_export_events), 0::bigint,
  'employees cannot read export event history');
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*) from public.business_report_export_events), 0::bigint,
  'another business owner cannot read export event history');

reset role;
select extensions.throws_ok($$update public.business_report_export_events set entry_count = 0$$,
  'P0001', 'Sensitive action audit records are immutable', 'privileged updates cannot rewrite export history');
select extensions.throws_ok($$delete from public.business_report_export_events$$,
  'P0001', 'Sensitive action audit records are immutable', 'privileged deletes cannot erase export history');

insert into public.shifts (business_id, venue_id, department_id, role_title, starts_at, ends_at)
select 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000004',
  'd9130000-0000-4000-8000-000000000004', 'Open', '2024-10-01 01:00+00', '2024-10-01 02:00+00'
from generate_series(1, 10000);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9130000-0000-4000-8000-000000000001', true);
select extensions.is((select (pg_temp.export_report('roster', '2024-09-30',
  'c9130000-0000-4000-8000-000000000004')->>'entry_count')::integer), 10000,
  'the exact 10000-row limit is accepted without truncation');
reset role;
insert into public.shifts (business_id, venue_id, department_id, role_title, starts_at, ends_at) values
  ('b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000004',
   'd9130000-0000-4000-8000-000000000004', 'Open', '2024-10-01 01:00+00', '2024-10-01 02:00+00');
set local role authenticated;
insert into export_results values ('before-limit', jsonb_build_object(
  'count', (select count(*) from public.business_report_export_events)
));
select extensions.throws_ok($$select pg_temp.export_report('roster', '2024-09-30',
  'c9130000-0000-4000-8000-000000000004')$$, 'P0001',
  'Report exceeds the 10000-row limit; choose another venue or week', '10001 rows fail rather than truncating');
select extensions.is((select count(*) from public.business_report_export_events),
  (select (payload->>'count')::bigint from export_results where kind = 'before-limit'),
  'over-limit failure records no generated event');
reset role;
insert into public.attendance_sessions (business_id, venue_id, department_id, employee_id, started_by, created_at)
select 'b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000004',
  'd9130000-0000-4000-8000-000000000004', 'e9130000-0000-4000-8000-000000000004',
  'a9130000-0000-4000-8000-000000000001', '2024-10-01 00:00+00'::timestamptz
from generate_series(1, 10000);
set local statement_timeout = '30s';
set local role authenticated;
select extensions.is((select (pg_temp.export_report('attendance', '2024-09-30',
  'c9130000-0000-4000-8000-000000000004')->>'entry_count')::integer), 10000,
  'the exact 10000-session attendance limit is accepted without truncation');
reset role;
insert into public.attendance_sessions (business_id, venue_id, department_id, employee_id, started_by, created_at)
values ('b9130000-0000-4000-8000-000000000001', 'c9130000-0000-4000-8000-000000000004',
  'd9130000-0000-4000-8000-000000000004', 'e9130000-0000-4000-8000-000000000004',
  'a9130000-0000-4000-8000-000000000001', '2024-10-01 00:00+00');
set local role authenticated;
insert into export_results values ('before-attendance-limit', jsonb_build_object(
  'count', (select count(*) from public.business_report_export_events)
));
select extensions.throws_ok($$select pg_temp.export_report('attendance', '2024-09-30',
  'c9130000-0000-4000-8000-000000000004')$$, 'P0001',
  'Report exceeds the 10000-row limit; choose another venue or week',
  '10001 attendance sessions fail rather than truncating');
select extensions.is((select count(*) from public.business_report_export_events),
  (select (payload->>'count')::bigint from export_results where kind = 'before-attendance-limit'),
  'over-limit attendance failure records no generated event');
reset role;
create function pg_temp.reject_report_audit() returns trigger language plpgsql as $$
begin
  raise exception 'Audit storage unavailable';
end;
$$;
create trigger reject_report_audit before insert on public.sensitive_action_audit
  for each row when (new.source_table = 'business_report_export_events')
  execute function pg_temp.reject_report_audit();
set local role authenticated;
select extensions.throws_ok($$select pg_temp.export_report()$$, 'P0001', 'Audit storage unavailable',
  'a report is not returned when audit storage fails');
select extensions.is((select count(*) from public.business_report_export_events),
  (select (payload->>'count')::bigint from export_results where kind = 'before-attendance-limit'),
  'an audit failure rolls back the generated event');
reset role;
drop trigger reject_report_audit on public.sensitive_action_audit;
delete from public.business_memberships where business_id = 'b9130000-0000-4000-8000-000000000001'
  and user_id = 'a9130000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select pg_temp.export_report()$$, 'P0001', 'Permission denied', 'revoked owner loses export access');
select * from extensions.finish();
rollback;
