begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a6000000-0000-4000-8000-000000000001', 'bulk-owner@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000002', 'bulk-foh@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000003', 'bulk-boh@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000004', 'bulk-worker@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000005', 'bulk-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b6000000-0000-4000-8000-000000000001', 'Bulk cafe'),
  ('b6000000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'FOH'),
  ('d6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', 'foh_manager', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000003', 'boh_manager', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002'),
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000004', 'employee', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000004', 'Bulk worker', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
select f.id::uuid, 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  f.department_id::uuid, 'e6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000004'
from (values
  ('26000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001'),
  ('26000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000001'),
  ('26000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000001'),
  ('26000000-0000-4000-8000-000000000004', 'd6000000-0000-4000-8000-000000000002'),
  ('26000000-0000-4000-8000-000000000005', 'd6000000-0000-4000-8000-000000000001'),
  ('26000000-0000-4000-8000-000000000006', 'd6000000-0000-4000-8000-000000000001'),
  ('26000000-0000-4000-8000-000000000007', 'd6000000-0000-4000-8000-000000000001'),
  ('26000000-0000-4000-8000-000000000008', 'd6000000-0000-4000-8000-000000000001')
) f(id, department_id);
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  f.event_type, f.occurred_at::timestamptz,
  case when s.id = '26000000-0000-4000-8000-000000000007'::uuid then 'offline_claim' else 'server_clock' end
from (values
  ('46000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'clock_in', '2024-10-01 01:00+00'),
  ('46000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001', 'clock_out', '2024-10-01 02:00+00'),
  ('46000000-0000-4000-8000-000000000003', '26000000-0000-4000-8000-000000000002', 'clock_in', '2024-10-01 03:00+00'),
  ('46000000-0000-4000-8000-000000000004', '26000000-0000-4000-8000-000000000002', 'clock_out', '2024-10-01 04:00+00'),
  ('46000000-0000-4000-8000-000000000005', '26000000-0000-4000-8000-000000000003', 'clock_in', '2024-10-06 10:00+00'),
  ('46000000-0000-4000-8000-000000000006', '26000000-0000-4000-8000-000000000004', 'clock_in', '2024-10-01 05:00+00'),
  ('46000000-0000-4000-8000-000000000007', '26000000-0000-4000-8000-000000000004', 'clock_out', '2024-10-01 06:00+00'),
  ('46000000-0000-4000-8000-000000000008', '26000000-0000-4000-8000-000000000005', 'clock_in', '2024-10-02 01:00+00'),
  ('46000000-0000-4000-8000-000000000009', '26000000-0000-4000-8000-000000000005', 'clock_out', '2024-10-02 02:00+00'),
  ('46000000-0000-4000-8000-000000000010', '26000000-0000-4000-8000-000000000006', 'clock_in', '2024-10-02 03:00+00'),
  ('46000000-0000-4000-8000-000000000011', '26000000-0000-4000-8000-000000000006', 'clock_out', '2024-10-02 04:00+00'),
  ('46000000-0000-4000-8000-000000000012', '26000000-0000-4000-8000-000000000007', 'clock_in', '2024-10-03 01:00+00'),
  ('46000000-0000-4000-8000-000000000013', '26000000-0000-4000-8000-000000000007', 'clock_out', '2024-10-03 02:00+00'),
  ('46000000-0000-4000-8000-000000000014', '26000000-0000-4000-8000-000000000008', 'clock_in', '2024-10-03 03:00+00'),
  ('46000000-0000-4000-8000-000000000015', '26000000-0000-4000-8000-000000000008', 'clock_out', '2024-10-03 04:00+00')
) f(id, session_id, event_type, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;

create temporary table saved_selections (name text primary key, selection jsonb);
create temporary table saved_receipts (name text primary key, batch_id uuid, locked_count integer, invalid_count integer, already_locked_count integer);
grant select, insert on saved_selections, saved_receipts to authenticated;
create function pg_temp.selections(p_ids uuid[])
returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('session_id', w.session_id, 'revision', w.edit_revision) order by w.session_id)
  from public.list_weekly_worked_time_for_edit(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-09-30'
  ) w where w.session_id = any(p_ids);
$$;
create function pg_temp.bulk(p_request uuid, p_selection jsonb, p_reason text default 'Reviewed attendance')
returns table (batch_id uuid, locked_count integer, invalid_count integer, already_locked_count integer)
language sql as $$
  select * from public.bulk_lock_weekly_attendance(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    '2024-09-30', null, p_request, p_selection, p_reason
  );
$$;

set local role anon;
select extensions.throws_ok($$select * from public.list_weekly_worked_time_for_edit(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  '42501', null, 'anonymous callers cannot inspect edit revisions');
select extensions.throws_ok($$select * from public.list_weekly_timesheet_events_for_edit(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  '42501', null, 'anonymous callers cannot inspect source revisions');
select extensions.throws_ok($$select * from public.bulk_lock_weekly_attendance(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-09-30', null,
  '16000000-0000-4000-8000-000000000001', '[]', 'Reviewed')$$,
  '42501', null, 'anonymous callers cannot perform bulk edits');
select extensions.throws_ok($$select * from public.attendance_bulk_edit_lock_batches$$,
  '42501', null, 'bulk audit batches are not directly readable anonymously');
set local role service_role;
select extensions.throws_ok($$select * from public.attendance_bulk_edit_lock_batches$$,
  '42501', null, 'service role cannot directly inspect protected bulk batches');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select * from public.list_weekly_worked_time_for_edit(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-09-30')$$,
  'P0001', 'Permission denied', 'employees cannot inspect manager edit revisions');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001',
  '[{"session_id":"26000000-0000-4000-8000-000000000001","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]')$$,
  'P0001', 'Permission denied', 'employees cannot bulk lock their own attendance');
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000005', true);
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001',
  '[{"session_id":"26000000-0000-4000-8000-000000000001","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]')$$,
  'P0001', 'Permission denied', 'another tenant owner cannot bulk lock attendance');
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$select * from public.attendance_bulk_edit_lock_batches$$,
  '42501', null, 'managers cannot directly read bulk audit batches');
select extensions.throws_ok($$select * from public.attendance_review_revision('26000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'internal revisions cannot be requested without scope');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001', '[]')$$,
  'P0001', 'Invalid bulk attendance lock request', 'empty selections are rejected');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001', '{}')$$,
  'P0001', 'Invalid bulk attendance lock request', 'non-array selections are rejected');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001',
  (select jsonb_agg(jsonb_build_object('session_id', gen_random_uuid(), 'revision', repeat('a', 64)))
    from generate_series(1, 101)))$$,
  'P0001', 'Invalid bulk attendance lock request', 'selections exceeding the batch limit are rejected');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001',
  '[{"session_id":"not-a-uuid","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]')$$,
  'P0001', 'Invalid bulk attendance lock request', 'invalid session IDs are rejected');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001',
  '[{"session_id":"26000000-0000-4000-8000-000000000001","revision":"bad"}]')$$,
  'P0001', 'Invalid bulk attendance lock request', 'malformed revisions are rejected');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001',
  '[{"session_id":"26000000-0000-4000-8000-000000000001","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","extra":true}]')$$,
  'P0001', 'Invalid bulk attendance lock request', 'unexpected selection fields are rejected');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001',
  '[{"session_id":"26000000-0000-4000-8000-000000000001","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    {"session_id":"26000000-0000-4000-8000-000000000001","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]')$$,
  'P0001', 'Invalid bulk attendance lock request', 'duplicate session IDs are rejected');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001',
  '[{"session_id":"26000000-0000-4000-8000-000000000001","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]', ' ')$$,
  'P0001', 'Invalid bulk attendance lock request', 'a reason is required');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001',
  '[{"session_id":"26000000-0000-4000-8000-000000000004","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]')$$,
  'P0001', 'Selected attendance not found or permission denied', 'FOH cannot select a BOH session');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000001',
  '[{"session_id":"26000000-0000-4000-8000-000000000001","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    {"session_id":"26000000-0000-4000-8000-000000000004","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]')$$,
  'P0001', 'Selected attendance not found or permission denied', 'mixed authorized and forbidden selections fail atomically');
select extensions.throws_ok($$select * from public.bulk_lock_weekly_attendance(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-09-30',
  'e6000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000001',
  pg_temp.selections(array['26000000-0000-4000-8000-000000000001'::uuid]), 'Reviewed')$$,
  'P0001', 'Selected attendance not found or permission denied', 'selected sessions must match the employee filter');
select extensions.throws_ok($$select * from public.bulk_lock_weekly_attendance(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-10-01', null,
  '16000000-0000-4000-8000-000000000001',
  pg_temp.selections(array['26000000-0000-4000-8000-000000000001'::uuid]), 'Reviewed')$$,
  'P0001', 'Invalid timesheet week', 'bulk requests require a valid Monday week');
select extensions.throws_ok($$select * from public.bulk_lock_weekly_attendance(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-10-07', null,
  '16000000-0000-4000-8000-000000000001',
  pg_temp.selections(array['26000000-0000-4000-8000-000000000001'::uuid]), 'Reviewed')$$,
  'P0001', 'Selected attendance changed week or is unavailable', 'selected sessions must belong to the requested week');
select extensions.is((select count(*) from public.list_weekly_timesheet_events_for_edit(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-09-30') e
  join public.list_weekly_worked_time_for_edit(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-09-30') w
    on w.session_id = e.session_id
  where e.edit_revision <> w.edit_revision or e.locked <> w.edit_locked), 0::bigint,
  'source-event and calculated-time revisions agree for the same snapshot');

select public.set_attendance_edit_lock(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000002', true, 'Already reviewed'
);
insert into saved_selections select 'initial', pg_temp.selections(array[
  '26000000-0000-4000-8000-000000000001'::uuid, '26000000-0000-4000-8000-000000000002'::uuid,
  '26000000-0000-4000-8000-000000000003'::uuid
]);
insert into saved_receipts select 'initial', r.*
from pg_temp.bulk('16000000-0000-4000-8000-000000000003',
  (select selection from saved_selections where name = 'initial')) r;
select extensions.is((select locked_count from saved_receipts where name = 'initial'), 1,
  'bulk action locks only the complete unlocked session');
select extensions.is((select invalid_count from saved_receipts where name = 'initial'), 1,
  'bulk action excludes an invalid open session on the server');
select extensions.is((select already_locked_count from saved_receipts where name = 'initial'), 1,
  'bulk action skips a session already locked');
select extensions.is((select count(*) from public.list_attendance_edit_lock_history(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')
  where session_id = '26000000-0000-4000-8000-000000000001' and locked and reason = 'Reviewed attendance'), 1::bigint,
  'bulk lock adds an attributed lock event with the supplied reason');
select extensions.is((select count(*) from public.list_attendance_edit_lock_history(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')
  where session_id = '26000000-0000-4000-8000-000000000003'), 0::bigint,
  'invalid attendance has no edit-lock event');
select extensions.is((select batch_id from pg_temp.bulk('16000000-0000-4000-8000-000000000003',
  (select selection from saved_selections where name = 'initial'))),
  (select batch_id from saved_receipts where name = 'initial'), 'identical retries return the same receipt');
select extensions.is((select count(*) from public.list_attendance_edit_lock_history(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')
  where session_id = '26000000-0000-4000-8000-000000000001'), 1::bigint,
  'identical retries never duplicate lock events');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000003',
  (select selection from saved_selections where name = 'initial'), 'Changed reason')$$,
  'P0001', 'Request identifier already used', 'a retry cannot change the reason');
select extensions.is((select invalid_count from public.get_weekly_bulk_lock_receipt(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  (select batch_id from saved_receipts where name = 'initial'))), 1, 'the actor can retrieve the actual receipt');
select extensions.is((select week_start from public.get_weekly_bulk_lock_receipt(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  (select batch_id from saved_receipts where name = 'initial'))), '2024-09-30'::date,
  'the stored receipt identifies its actual week');
select extensions.is((select employee_id from public.get_weekly_bulk_lock_receipt(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  (select batch_id from saved_receipts where name = 'initial'))), null::uuid,
  'the stored receipt identifies its actual employee filter');
select extensions.throws_ok($$select public.correct_attendance_event(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001', '46000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000004', '2024-10-01 01:00+00', '2024-10-01 01:01+00', 'Correct')$$,
  'P0001', 'Attendance edits are locked', 'bulk lock protects subsequent corrections');
select extensions.is((select original_at from public.list_weekly_timesheet_events(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-09-30')
  where event_id = '46000000-0000-4000-8000-000000000001'), '2024-10-01 01:00+00'::timestamptz,
  'bulk lock does not alter original attendance');

insert into saved_selections select 'stale', pg_temp.selections(array[
  '26000000-0000-4000-8000-000000000005'::uuid, '26000000-0000-4000-8000-000000000006'::uuid
]);
reset role;
update public.venues set timezone = 'Australia/Perth' where id = 'c6000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000009',
  (select selection from saved_selections where name = 'stale'))$$,
  'P0001', 'Attendance changed; review again', 'venue timezone changes invalidate reviewed revisions');
reset role;
update public.venues set timezone = 'Australia/Sydney' where id = 'c6000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.correct_attendance_event(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000006', '46000000-0000-4000-8000-000000000010',
  '16000000-0000-4000-8000-000000000005', '2024-10-02 03:00+00', '2024-10-02 03:01+00', 'Corrected after review'
);
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000006',
  (select selection from saved_selections where name = 'stale'))$$,
  'P0001', 'Attendance changed; review again', 'changed valid attendance rejects a stale batch');
select extensions.is((select count(*) from public.list_attendance_edit_lock_history(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')
  where session_id = '26000000-0000-4000-8000-000000000005'), 0::bigint,
  'a stale item rolls back every lock in the batch');

insert into saved_selections select 'became-invalid', pg_temp.selections(array[
  '26000000-0000-4000-8000-000000000007'::uuid, '26000000-0000-4000-8000-000000000008'::uuid
]);
select extensions.ok((select 'offline_claim_unverified' = any(exceptions)
  from public.list_weekly_worked_time_for_edit(
    'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '2024-09-30')
  where session_id = '26000000-0000-4000-8000-000000000007'),
  'nonfatal provenance warnings remain visible before locking');
select public.correct_attendance_event(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000008', '46000000-0000-4000-8000-000000000015',
  '16000000-0000-4000-8000-000000000007', '2024-10-03 04:00+00', '2024-10-03 02:59+00', 'Invalid chronology'
);
insert into saved_receipts select 'became-invalid', r.*
from pg_temp.bulk('16000000-0000-4000-8000-000000000008',
  (select selection from saved_selections where name = 'became-invalid')) r;
select extensions.is((select locked_count from saved_receipts where name = 'became-invalid'), 1,
  'a still-valid selected session can be locked');
select extensions.is((select invalid_count from saved_receipts where name = 'became-invalid'), 1,
  'attendance that became invalid after display is excluded server-side');
select extensions.is((select count(*) from public.list_attendance_edit_lock_history(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')
  where session_id = '26000000-0000-4000-8000-000000000008'), 0::bigint,
  'newly invalid attendance receives no lock event');
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select * from public.get_weekly_bulk_lock_receipt(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  (select batch_id from saved_receipts where name = 'initial'))$$,
  'P0001', 'Bulk attendance receipt not found or permission denied', 'another manager cannot inspect the actor receipt');
reset role;
select extensions.is((select cardinality(invalid_session_ids) from public.attendance_bulk_edit_lock_batches
  where id = (select batch_id from saved_receipts where name = 'initial')), 1,
  'protected batch audit retains excluded session identifiers');
select extensions.throws_ok($$update public.attendance_bulk_edit_lock_batches set reason = 'Changed'$$,
  'P0001', 'Original attendance records are immutable', 'bulk audit batches are immutable');
select extensions.is((select count(*) from public.attendance_events
  where session_id = '26000000-0000-4000-8000-000000000001'), 2::bigint,
  'bulk locking does not add or remove original clock events');
update public.business_memberships set department_id = 'd6000000-0000-4000-8000-000000000002'
where business_id = 'b6000000-0000-4000-8000-000000000001' and user_id = 'a6000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$select * from public.get_weekly_bulk_lock_receipt(
  'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  (select batch_id from saved_receipts where name = 'initial'))$$,
  'P0001', 'Bulk attendance receipt not found or permission denied', 'receipt access respects changed department scope');
select extensions.throws_ok($$select * from pg_temp.bulk('16000000-0000-4000-8000-000000000003',
  (select selection from saved_selections where name = 'initial'))$$,
  'P0001', 'Selected attendance not found or permission denied', 'idempotent retries respect changed department scope');
reset role;
select set_config('test.preserved_lock_batch_count', (select count(*)::text from public.attendance_bulk_edit_lock_batches
  where business_id = 'b6000000-0000-4000-8000-000000000001'), true);
select extensions.throws_ok($$delete from public.businesses where id = 'b6000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Business deletion is disabled while record preservation requirements remain unresolved',
  'business deletion cannot cascade immutable audit batches');
select extensions.ok((select count(*) > 0 and count(*) = current_setting('test.preserved_lock_batch_count')::bigint
  from public.attendance_bulk_edit_lock_batches
  where business_id = 'b6000000-0000-4000-8000-000000000001'),
  'all immutable audit batches remain after the rejected deletion');

select * from extensions.finish();
rollback;
