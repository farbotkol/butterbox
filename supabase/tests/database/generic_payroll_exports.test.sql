begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7500000-0000-4000-8000-000000000001', 'export-owner@example.test', '{}'::jsonb),
  ('a7500000-0000-4000-8000-000000000002', 'export-gm@example.test', '{}'::jsonb),
  ('a7500000-0000-4000-8000-000000000003', 'export-foh@example.test', '{}'::jsonb),
  ('a7500000-0000-4000-8000-000000000004', 'export-worker@example.test', '{}'::jsonb),
  ('a7500000-0000-4000-8000-000000000005', 'export-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7500000-0000-4000-8000-000000000001', 'Export cafe'),
  ('b7500000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c7500000-0000-4000-8000-000000000001', 'b7500000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7500000-0000-4000-8000-000000000001', 'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', 'FOH'),
  ('d7500000-0000-4000-8000-000000000002', 'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7500000-0000-4000-8000-000000000001', 'a7500000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7500000-0000-4000-8000-000000000001', 'a7500000-0000-4000-8000-000000000002', 'general_manager', 'c7500000-0000-4000-8000-000000000001', null),
  ('b7500000-0000-4000-8000-000000000001', 'a7500000-0000-4000-8000-000000000003', 'foh_manager', 'c7500000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000001'),
  ('b7500000-0000-4000-8000-000000000001', 'a7500000-0000-4000-8000-000000000004', 'employee', 'c7500000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000001'),
  ('b7500000-0000-4000-8000-000000000002', 'a7500000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7500000-0000-4000-8000-000000000001', 'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000001', 'a7500000-0000-4000-8000-000000000004', '=1+1', 'Server'),
  ('e7500000-0000-4000-8000-000000000002', 'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000002', null, 'Cook', 'Cook');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('27500000-0000-4000-8000-000000000001', 'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000001', 'e7500000-0000-4000-8000-000000000001', 'a7500000-0000-4000-8000-000000000004'),
  ('27500000-0000-4000-8000-000000000002', 'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000002', 'e7500000-0000-4000-8000-000000000002', 'a7500000-0000-4000-8000-000000000001');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.event_type, f.occurred_at::timestamptz
from (values
  ('47500000-0000-4000-8000-000000000001', '27500000-0000-4000-8000-000000000001', 'clock_in', '2024-01-10 09:00:00.123456+00'),
  ('47500000-0000-4000-8000-000000000002', '27500000-0000-4000-8000-000000000001', 'clock_out', '2024-01-10 11:00:00.123456+00'),
  ('47500000-0000-4000-8000-000000000003', '27500000-0000-4000-8000-000000000002', 'clock_in', '2024-01-11 09:00:00+00'),
  ('47500000-0000-4000-8000-000000000004', '27500000-0000-4000-8000-000000000002', 'clock_out', '2024-01-11 12:00:00+00')
) f(id, session_id, event_type, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;

create temporary table export_test_saved (name text primary key, id uuid, value jsonb);
grant select, insert on export_test_saved to authenticated;
create function pg_temp.export_review(p_finalisation uuid, p_week date default '2024-01-08')
returns jsonb language sql as $$
  select public.get_generic_payroll_export_review(
    'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', p_week, p_finalisation
  )
$$;
create function pg_temp.create_export(p_finalisation uuid, p_request uuid, p_week date default '2024-01-08')
returns uuid language sql as $$
  select public.create_generic_payroll_export(
    'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
    p_week, p_finalisation, p_request
  )
$$;
create function pg_temp.approve_export_session(p_session uuid, p_week date default '2024-01-08')
returns uuid language sql as $$
  select public.decide_attendance_timesheet(
    'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', p_session,
    gen_random_uuid(), w.edit_revision, 'approved', null
  ) from public.list_weekly_worked_time_for_edit(
    'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', p_week
  ) w where w.session_id = p_session
$$;
create function pg_temp.batch_entries(p_batch uuid)
returns table (session_id uuid, employee_name text, record jsonb) language sql as $$
  select * from public.list_generic_payroll_batch_entries(
    'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', p_batch
  )
$$;
create function pg_temp.history_entries(p_week date default '2024-01-08')
returns table (event_id uuid, kind text, session_id uuid, employee_name text, previous_record jsonb, current_record jsonb)
language sql as $$
  select * from public.list_generic_payroll_export_history_entries(
    'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', p_week
  )
$$;
create function pg_temp.reconcile(p_finalisation uuid, p_request uuid, p_hash text, p_reason text, p_confirmed boolean,
  p_week date default '2024-01-08')
returns uuid language sql as $$
  select public.reconcile_generic_payroll_export(
    'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
    p_week, p_finalisation, p_request, p_hash, p_reason, p_confirmed
  )
$$;

select extensions.ok(
  not has_table_privilege('authenticated', 'public.generic_payroll_export_entries', 'select')
  and not has_table_privilege('service_role', 'public.generic_payroll_export_entries', 'select')
  and not has_table_privilege('authenticated', 'public.generic_payroll_reconciliation_entries', 'insert'),
  'export and reconciliation details have no direct authenticated or service-role access');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7500000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$select pg_temp.create_export(null, gen_random_uuid())$$,
  'P0001', 'Invalid payroll export request', 'a finalisation is required');
select extensions.throws_ok($$select pg_temp.create_export(gen_random_uuid(), gen_random_uuid())$$,
  'P0001', 'Payroll period changed; refresh before exporting', 'an open week cannot be exported');
select pg_temp.approve_export_session('27500000-0000-4000-8000-000000000001');
select pg_temp.approve_export_session('27500000-0000-4000-8000-000000000002');
insert into export_test_saved (name, id)
select 'v1', public.finalise_payroll_period(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '2024-01-08', gen_random_uuid(), null
);
insert into export_test_saved (name, value)
select 'initial-review', pg_temp.export_review((select id from export_test_saved where name = 'v1'));
select extensions.is((select (value ->> 'newCount')::integer from export_test_saved where name = 'initial-review'),
  2, 'the first export includes both approved sessions');
select extensions.is((select jsonb_array_length(value -> 'changes') from export_test_saved where name = 'initial-review'),
  0, 'unexported sessions do not require reconciliation');
select extensions.throws_ok($$select pg_temp.create_export((select id from export_test_saved where name = 'v1'), null)$$,
  'P0001', 'Invalid payroll export request', 'an export request identifier is required');
reset role;
update public.employees set name = repeat(' ', 257) || '=1+1'
where id = 'e7500000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select pg_temp.create_export((select id from export_test_saved where name = 'v1'), gen_random_uuid())$$,
  'P0001', 'Employee name is too long or blank; correct the employee profile before preparing payroll',
  'an oversized employee name fails before a permanent batch is created');
reset role;
update public.employees set name = U&'\FEFF'
where id = 'e7500000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select pg_temp.create_export((select id from export_test_saved where name = 'v1'), gen_random_uuid())$$,
  'P0001', 'Employee name is too long or blank; correct the employee profile before preparing payroll',
  'a visually blank employee name fails before a permanent batch is created');
select extensions.is((select count(*) from public.list_generic_payroll_export_history(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', '2024-01-08')),
  0::bigint, 'invalid names do not consume the export version');
reset role;
update public.employees set name = '=1+1'
where id = 'e7500000-0000-4000-8000-000000000001';
create function pg_temp.change_name_during_export()
returns trigger language plpgsql as $$
begin
  update public.employees set name = repeat(' ', 257) || '=1+1'
  where id = 'e7500000-0000-4000-8000-000000000001';
  return new;
end;
$$;
create trigger test_change_name_during_export
  after insert on public.generic_payroll_export_batches
  for each row execute function pg_temp.change_name_during_export();
set local role authenticated;
select extensions.throws_ok($$select pg_temp.create_export((select id from export_test_saved where name = 'v1'), gen_random_uuid())$$,
  'P0001', 'Employee name is too long or blank; correct the employee profile before preparing payroll',
  'a name changed during batch creation cannot produce an unusable export');
select extensions.is((select count(*) from public.list_generic_payroll_export_history(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', '2024-01-08')),
  0::bigint, 'a concurrent invalid name cannot consume the export version');
reset role;
drop trigger test_change_name_during_export on public.generic_payroll_export_batches;
set local role authenticated;
insert into export_test_saved (name, id)
select 'batch1', pg_temp.create_export(
  (select id from export_test_saved where name = 'v1'), '17500000-0000-4000-8000-000000000001'
);
select extensions.is(pg_temp.create_export(
  (select id from export_test_saved where name = 'v1'), '17500000-0000-4000-8000-000000000001'
), (select id from export_test_saved where name = 'batch1'), 'an identical retry returns the original batch');
select extensions.is(pg_temp.create_export(
  (select id from export_test_saved where name = 'v1'), gen_random_uuid()
), (select id from export_test_saved where name = 'batch1'), 'a fresh request for the same version cannot create a duplicate batch');
select extensions.is((select count(*) from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))),
  2::bigint, 'the stored batch contains both approved entries');
select extensions.ok((select bool_and(record #>> '{approval,status}' = 'approved')
  from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))),
  'every exported entry retains its approved state');
select extensions.is((select employee_name from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))
  where session_id = '27500000-0000-4000-8000-000000000001'), '=1+1',
  'the immutable batch retains the original display name for CSV escaping');
select extensions.is((select record #>> '{period,finalisationId}'
  from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))
  where session_id = '27500000-0000-4000-8000-000000000001'),
  (select id::text from export_test_saved where name = 'v1'), 'each exported entry retains its exact finalisation version');
select extensions.is((select count(*) from pg_temp.history_entries()
  where kind = 'batch' and event_id = (select id from export_test_saved where name = 'batch1')),
  2::bigint, 'the audit history exposes individual batch entries to an authorised manager');
select extensions.is((select current_record #>> '{period,finalisationId}' from pg_temp.history_entries()
  where event_id = (select id from export_test_saved where name = 'batch1')
    and session_id = '27500000-0000-4000-8000-000000000001'),
  (select id::text from export_test_saved where name = 'v1'), 'historical entries retain their finalisation');
select extensions.throws_ok($$select * from public.generic_payroll_export_entries$$,
  '42501', 'permission denied for table generic_payroll_export_entries', 'direct table reads cannot bypass export scope');

select set_config('request.jwt.claim.sub', 'a7500000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))),
  2::bigint, 'a full-venue general manager may download the batch');
select set_config('request.jwt.claim.sub', 'a7500000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select * from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))$$,
  'P0001', 'Permission denied', 'a department manager cannot download whole-venue payroll');
select extensions.throws_ok($$select * from pg_temp.batch_entries(gen_random_uuid())$$,
  'P0001', 'Permission denied', 'a department manager cannot distinguish missing batches from existing ones');
select extensions.throws_ok($$select * from pg_temp.history_entries()$$,
  'P0001', 'Permission denied', 'a department manager cannot read whole-venue export history entries');
select extensions.throws_ok($$select pg_temp.create_export((select id from export_test_saved where name = 'v1'), gen_random_uuid())$$,
  'P0001', 'Permission denied', 'a department manager cannot create a payroll batch');
select set_config('request.jwt.claim.sub', 'a7500000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select * from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))$$,
  'P0001', 'Permission denied', 'an employee cannot download whole-venue payroll');
insert into export_test_saved (name, id)
select 'claim', claim_id from public.submit_attendance_offline_claim(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  'd7500000-0000-4000-8000-000000000001', 'e7500000-0000-4000-8000-000000000001',
  'a7500000-0000-4000-8000-000000000004', gen_random_uuid(), 'clock_out', '2024-01-10 11:15+00'
);
select set_config('request.jwt.claim.sub', 'a7500000-0000-4000-8000-000000000005', true);
select extensions.throws_ok($$select * from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))$$,
  'P0001', 'Permission denied', 'another tenant cannot download the batch');
select extensions.throws_ok($$select * from pg_temp.batch_entries(gen_random_uuid())$$,
  'P0001', 'Permission denied', 'another tenant cannot distinguish missing batches from existing ones');
select extensions.throws_ok($$select * from pg_temp.history_entries()$$,
  'P0001', 'Permission denied', 'another tenant cannot read export history entries');
select set_config('request.jwt.claim.sub', 'a7500000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$select * from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))$$,
  'P0001', 'Resolve outstanding payroll exceptions before exporting', 'a late employee claim blocks a batch download');
select extensions.throws_ok($$select pg_temp.create_export((select id from export_test_saved where name = 'v1'), gen_random_uuid())$$,
  'P0001', 'Resolve outstanding payroll exceptions before exporting', 'a late employee claim blocks export preparation');
select public.review_attendance_offline_claim(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  (select id from export_test_saved where name = 'claim'), gen_random_uuid(), 'rejected', null, null, 'Already checked'
);
select extensions.is((select count(*) from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))),
  2::bigint, 'a resolved claim permits the same immutable batch to be downloaded');
select public.reopen_payroll_period(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '2024-01-08', gen_random_uuid(), 'Correct approved time'
);
select extensions.throws_ok($$select * from pg_temp.batch_entries((select id from export_test_saved where name = 'batch1'))$$,
  'P0001', 'Payroll period changed; refresh before exporting', 'reopening invalidates the previously downloadable version');
select extensions.is((select count(*) from pg_temp.history_entries() where kind = 'batch'),
  2::bigint, 'reopening retains read-only historical export entries');
select public.set_attendance_edit_lock(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '27500000-0000-4000-8000-000000000001', gen_random_uuid(), false, 'Correct clock-out'
);
select public.correct_attendance_event(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '27500000-0000-4000-8000-000000000001', '47500000-0000-4000-8000-000000000002',
  gen_random_uuid(), '2024-01-10 11:00:00.123456+00', '2024-01-10 12:00:00.123456+00', 'Confirmed clock-out'
);
select pg_temp.approve_export_session('27500000-0000-4000-8000-000000000001');

reset role;
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('27500000-0000-4000-8000-000000000003', 'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', 'd7500000-0000-4000-8000-000000000002', 'e7500000-0000-4000-8000-000000000002', 'a7500000-0000-4000-8000-000000000001');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.event_type, f.occurred_at::timestamptz
from (values
  ('47500000-0000-4000-8000-000000000005', 'clock_in', '2024-01-12 09:00:00+00'),
  ('47500000-0000-4000-8000-000000000006', 'clock_out', '2024-01-12 10:00:00+00')
) f(id, event_type, occurred_at)
join public.attendance_sessions s on s.id = '27500000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7500000-0000-4000-8000-000000000001', true);
select pg_temp.approve_export_session('27500000-0000-4000-8000-000000000003');
insert into export_test_saved (name, id)
select 'v2', public.finalise_payroll_period(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '2024-01-08', gen_random_uuid(), null
);
insert into export_test_saved (name, value)
select 'changed-review', pg_temp.export_review((select id from export_test_saved where name = 'v2'));
select extensions.is((select (value ->> 'newCount')::integer from export_test_saved where name = 'changed-review'),
  1, 'a newly added approved session can be exported after reconciliation');
select extensions.is((select jsonb_array_length(value -> 'changes') from export_test_saved where name = 'changed-review'),
  1, 'an amended previously exported session requires explicit reconciliation');
select extensions.is((select (value #>> '{changes,0,previous,hours,paid}')::numeric from export_test_saved where name = 'changed-review'),
  7200::numeric, 'the reconciliation shows the previously exported paid seconds');
select extensions.is((select (value #>> '{changes,0,current,hours,paid}')::numeric from export_test_saved where name = 'changed-review'),
  10800::numeric, 'the reconciliation shows the newly approved paid seconds');
select extensions.throws_ok($$select pg_temp.create_export((select id from export_test_saved where name = 'v2'), gen_random_uuid())$$,
  'P0001', 'Previously exported time requires reconciliation', 'new exports are blocked until changed time is reviewed');
select extensions.throws_ok($$select pg_temp.reconcile(
  (select id from export_test_saved where name = 'v2'), gen_random_uuid(), repeat('0', 64), 'Handled in payroll', true
)$$, 'P0001', 'Payroll reconciliation changed; refresh and review again', 'a stale reconciliation review is rejected');
select extensions.throws_ok($$select pg_temp.reconcile(
  (select id from export_test_saved where name = 'v2'), gen_random_uuid(),
  (select value ->> 'reviewHash' from export_test_saved where name = 'changed-review'), ' ', true
)$$, 'P0001', 'Invalid payroll reconciliation request', 'manual reconciliation requires a reason');
select extensions.throws_ok($$select pg_temp.reconcile(
  (select id from export_test_saved where name = 'v2'), gen_random_uuid(),
  (select value ->> 'reviewHash' from export_test_saved where name = 'changed-review'), E' \t\n\r ', true
)$$, 'P0001', 'Invalid payroll reconciliation request', 'tabs and newlines alone are not a reconciliation reason');
select extensions.throws_ok($$select pg_temp.reconcile(
  (select id from export_test_saved where name = 'v2'), gen_random_uuid(),
  (select value ->> 'reviewHash' from export_test_saved where name = 'changed-review'), U&'\00A0\2003', true
)$$, 'P0001', 'Invalid payroll reconciliation request', 'Unicode whitespace alone is not a reconciliation reason');
select extensions.throws_ok($$select pg_temp.reconcile(
  (select id from export_test_saved where name = 'v2'), gen_random_uuid(),
  (select value ->> 'reviewHash' from export_test_saved where name = 'changed-review'), U&'\FEFF \0009\FEFF', true
)$$, 'P0001', 'Invalid payroll reconciliation request', 'a byte-order mark and whitespace are not a reconciliation reason');
select extensions.throws_ok($$select pg_temp.reconcile(
  (select id from export_test_saved where name = 'v2'), gen_random_uuid(),
  (select value ->> 'reviewHash' from export_test_saved where name = 'changed-review'), repeat(chr(128512), 251), true
)$$, 'P0001', 'Invalid payroll reconciliation request', 'a reason exceeding 500 UTF-16 code units is rejected');
select extensions.throws_ok($$select pg_temp.reconcile(
  (select id from export_test_saved where name = 'v2'), gen_random_uuid(),
  (select value ->> 'reviewHash' from export_test_saved where name = 'changed-review'), 'Handled in payroll', false
)$$, 'P0001', 'Invalid payroll reconciliation request', 'manual reconciliation requires explicit confirmation');
insert into export_test_saved (name, id)
select 'reconciliation', pg_temp.reconcile(
  (select id from export_test_saved where name = 'v2'), '17500000-0000-4000-8000-000000000002',
  (select value ->> 'reviewHash' from export_test_saved where name = 'changed-review'),
  U&'\FEFF \0009Adjusted externally\000A\FEFF', true
);
select extensions.is(pg_temp.reconcile(
  (select id from export_test_saved where name = 'v2'), '17500000-0000-4000-8000-000000000002',
  (select value ->> 'reviewHash' from export_test_saved where name = 'changed-review'), 'Adjusted externally', true
), (select id from export_test_saved where name = 'reconciliation'), 'a reconciliation retry returns the same audit event');
select extensions.is((select previous_record #>> '{hours,paid}' from pg_temp.history_entries()
  where event_id = (select id from export_test_saved where name = 'reconciliation')),
  '7200.000000', 'audit history retains the previously exported paid seconds');
select extensions.is((select current_record #>> '{hours,paid}' from pg_temp.history_entries()
  where event_id = (select id from export_test_saved where name = 'reconciliation')),
  '10800.000000', 'audit history retains the reconciled paid seconds');
select extensions.is(jsonb_array_length(pg_temp.export_review((select id from export_test_saved where name = 'v2')) -> 'changes'),
  0, 'the reviewed correction no longer blocks new sessions');
insert into export_test_saved (name, id)
select 'batch2', pg_temp.create_export((select id from export_test_saved where name = 'v2'), gen_random_uuid());
select extensions.is((select count(*) from pg_temp.batch_entries((select id from export_test_saved where name = 'batch2'))),
  1::bigint, 'the next batch contains only one newly added session');
select extensions.is((select session_id from pg_temp.batch_entries((select id from export_test_saved where name = 'batch2'))),
  '27500000-0000-4000-8000-000000000003'::uuid, 'already-exported sessions are never emitted again');
select extensions.is((select count(*) from public.list_generic_payroll_export_history(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', '2024-01-08'
) where kind = 'batch'), 2::bigint, 'both export batches are logged');
select extensions.is((select reason from public.list_generic_payroll_export_history(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', '2024-01-08'
) where kind = 'reconciliation'), 'Adjusted externally', 'manual reconciliation retains its trimmed reason');

select public.reopen_payroll_period(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '2024-01-08', gen_random_uuid(), 'Move the session to its correct week'
);
select public.set_attendance_edit_lock(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '27500000-0000-4000-8000-000000000001', gen_random_uuid(), false, 'Correct the week'
);
select public.correct_attendance_event(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '27500000-0000-4000-8000-000000000001', '47500000-0000-4000-8000-000000000002',
  gen_random_uuid(), '2024-01-10 12:00:00.123456+00', '2024-01-17 12:00:00.123456+00', 'Correct the week'
);
select public.correct_attendance_event(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '27500000-0000-4000-8000-000000000001', '47500000-0000-4000-8000-000000000001',
  gen_random_uuid(), '2024-01-10 09:00:00.123456+00', '2024-01-17 09:00:00.123456+00', 'Correct the week'
);
select pg_temp.approve_export_session('27500000-0000-4000-8000-000000000001', '2024-01-15');
insert into export_test_saved (name, id)
select 'v3-old-week', public.finalise_payroll_period(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '2024-01-08', gen_random_uuid(), null
);
insert into export_test_saved (name, id)
select 'v3-new-week', public.finalise_payroll_period(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001',
  '2024-01-15', gen_random_uuid(), null
);
insert into export_test_saved (name, value)
select 'moved-review', pg_temp.export_review((select id from export_test_saved where name = 'v3-new-week'), '2024-01-15');
select extensions.is((select (value ->> 'newCount')::integer from export_test_saved where name = 'moved-review'),
  0, 'a session moved to another week is not treated as a new export');
select extensions.is((select jsonb_array_length(value -> 'changes') from export_test_saved where name = 'moved-review'),
  1, 'a session moved to another week requires reconciliation');
select extensions.throws_ok($$select pg_temp.create_export(
  (select id from export_test_saved where name = 'v3-new-week'), gen_random_uuid(), '2024-01-15'
)$$, 'P0001', 'Previously exported time requires reconciliation', 'cross-week movement cannot create a duplicate export');
select pg_temp.reconcile(
  (select id from export_test_saved where name = 'v3-new-week'), gen_random_uuid(),
  (select value ->> 'reviewHash' from export_test_saved where name = 'moved-review'),
  'Moved ' || repeat(chr(128512), 247), true, '2024-01-15'
);
select extensions.is((select reason from public.list_generic_payroll_export_history(
  'b7500000-0000-4000-8000-000000000001', 'c7500000-0000-4000-8000-000000000001', '2024-01-15'
) where kind = 'reconciliation'), 'Moved ' || repeat(chr(128512), 247),
  'a reconciliation reason of exactly 500 UTF-16 code units is retained');
select extensions.is(jsonb_array_length(pg_temp.export_review(
  (select id from export_test_saved where name = 'v3-old-week'), '2024-01-08'
) -> 'changes'), 0, 'reconciling the destination also clears the old week baseline');
select extensions.throws_ok($$select pg_temp.create_export(
  (select id from export_test_saved where name = 'v3-new-week'), gen_random_uuid(), '2024-01-15'
)$$, 'P0001', 'No new approved sessions are available for export', 'reconciliation never re-exports the previously paid session');

reset role;
select extensions.throws_ok($$update public.generic_payroll_export_entries set employee_name = 'Changed'$$,
  'P0001', 'Original attendance records are immutable', 'a privileged update cannot alter an export entry');
select extensions.throws_ok($$delete from public.generic_payroll_reconciliations$$,
  'P0001', 'Original attendance records are immutable', 'a privileged delete cannot erase reconciliation history');
select extensions.is((select count(*) from public.generic_payroll_export_entries
  where business_id = 'b7500000-0000-4000-8000-000000000001'), 3::bigint,
  'only three distinct sessions were ever exported across all versions and weeks');
delete from public.businesses where id = 'b7500000-0000-4000-8000-000000000001';
select extensions.is((select count(*) from public.generic_payroll_export_batches), 0::bigint,
  'deleting a disposable business cascades to its export ledger');
select * from extensions.finish();
rollback;
