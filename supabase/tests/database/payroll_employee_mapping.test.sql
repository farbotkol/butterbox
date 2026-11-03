begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users(id, email, raw_user_meta_data) values
  ('a7600000-0000-4000-8000-000000000001', 'mapping-owner@example.test', '{}'),
  ('a7600000-0000-4000-8000-000000000002', 'mapping-foh@example.test', '{}'),
  ('a7600000-0000-4000-8000-000000000003', 'mapping-outside@example.test', '{}');
insert into public.businesses(id, name) values
  ('b7600000-0000-4000-8000-000000000001', 'Mapping cafe'),
  ('b7600000-0000-4000-8000-000000000002', 'Outside mapping cafe');
insert into public.venues(id, business_id, name, timezone) values
  ('c7600000-0000-4000-8000-000000000001', 'b7600000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c7600000-0000-4000-8000-000000000002', 'b7600000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments(id, business_id, venue_id, name) values
  ('d7600000-0000-4000-8000-000000000001', 'b7600000-0000-4000-8000-000000000001', 'c7600000-0000-4000-8000-000000000001', 'FOH'),
  ('d7600000-0000-4000-8000-000000000002', 'b7600000-0000-4000-8000-000000000002', 'c7600000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships(business_id, user_id, role, venue_id, department_id) values
  ('b7600000-0000-4000-8000-000000000001', 'a7600000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7600000-0000-4000-8000-000000000001', 'a7600000-0000-4000-8000-000000000002', 'foh_manager', 'c7600000-0000-4000-8000-000000000001', 'd7600000-0000-4000-8000-000000000001'),
  ('b7600000-0000-4000-8000-000000000002', 'a7600000-0000-4000-8000-000000000003', 'owner', null, null);
insert into public.employees(id, business_id, venue_id, department_id, name, role_title) values
  ('e7600000-0000-4000-8000-000000000001', 'b7600000-0000-4000-8000-000000000001', 'c7600000-0000-4000-8000-000000000001', 'd7600000-0000-4000-8000-000000000001', 'Same Name', 'Server'),
  ('e7600000-0000-4000-8000-000000000002', 'b7600000-0000-4000-8000-000000000001', 'c7600000-0000-4000-8000-000000000001', 'd7600000-0000-4000-8000-000000000001', 'Same Name', 'Server'),
  ('e7600000-0000-4000-8000-000000000003', 'b7600000-0000-4000-8000-000000000002', 'c7600000-0000-4000-8000-000000000002', 'd7600000-0000-4000-8000-000000000002', 'Same Name', 'Server');
insert into public.attendance_sessions(id, business_id, venue_id, department_id, employee_id, started_by)
select ('27600000-0000-4000-8000-00000000000' || n)::uuid, e.business_id, e.venue_id, e.department_id,
  e.id, 'a7600000-0000-4000-8000-000000000001'
from generate_series(1,2) n join public.employees e
  on e.id = ('e7600000-0000-4000-8000-00000000000' || n)::uuid;
insert into public.attendance_events(
  session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at
)
select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
  f.kind, f.at::timestamptz
from public.attendance_sessions s cross join (values
  ('clock_in', '2024-01-10 01:00+00'), ('clock_out', '2024-01-10 03:00+00')
) f(kind, at) where s.business_id = 'b7600000-0000-4000-8000-000000000001';

create temporary table mapping_saved(name text primary key, id uuid);
grant select, insert on mapping_saved to authenticated;
create function pg_temp.mapping_connection(
  p_id uuid default 'f7600000-0000-4000-8000-000000000001', p_account text default 'exact-org-1'
) returns uuid language sql as $$
  select public.create_payroll_mapping_connection(
    'b7600000-0000-4000-8000-000000000001', p_id, 'xero', p_account, 'Mapping only'
  );
$$;
create function pg_temp.mapping(
  p_employee uuid, p_external text, p_revision integer default 0,
  p_request uuid default gen_random_uuid(), p_connection uuid default 'f7600000-0000-4000-8000-000000000001'
) returns uuid language sql as $$
  select public.set_payroll_employee_mapping_scoped(
    'b7600000-0000-4000-8000-000000000001', 'c7600000-0000-4000-8000-000000000001',
    p_connection, p_employee, p_revision, p_external, 'Verified against payroll account', p_request,
    true, p_external is null
  );
$$;
create function pg_temp.provider_records(p_connection uuid default 'f7600000-0000-4000-8000-000000000001')
returns table(session_id uuid, record jsonb) language sql as $$
  select * from public.list_provider_payroll_records(
    'b7600000-0000-4000-8000-000000000001', 'c7600000-0000-4000-8000-000000000001', '2024-01-08',
    (select id from mapping_saved where name = 'finalised'), p_connection
  );
$$;

select extensions.ok(not has_table_privilege('authenticated', 'public.payroll_employee_mappings', 'select')
  and not has_table_privilege('service_role', 'public.payroll_employee_mapping_events', 'insert'),
  'direct table access cannot bypass scoped RPCs');
set local role anon;
select extensions.throws_ok($$select pg_temp.mapping_connection()$$, '42501',
  'permission denied for function create_payroll_mapping_connection', 'anonymous cannot create destinations');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7600000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$select pg_temp.mapping_connection()$$, 'P0001', 'Permission denied',
  'department managers cannot configure business-wide payroll destinations');
select set_config('request.jwt.claim.sub', 'a7600000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select pg_temp.mapping_connection()$$, 'P0001', 'Permission denied',
  'outside owner cannot configure another tenant');
select set_config('request.jwt.claim.sub', 'a7600000-0000-4000-8000-000000000001', true);
select extensions.is(pg_temp.mapping_connection(), 'f7600000-0000-4000-8000-000000000001'::uuid,
  'owner registers a mapping-only payroll destination');
select extensions.is(pg_temp.mapping_connection('f7600000-0000-4000-8000-000000000002'),
  'f7600000-0000-4000-8000-000000000001'::uuid, 'same account reuses the destination');
select extensions.throws_ok($$select pg_temp.mapping_connection('f7600000-0000-4000-8000-000000000001', 'other-org')$$,
  'P0001', 'Payroll connection already exists with different details', 'destination IDs cannot be repurposed');
select extensions.is((select count(*) from public.list_payroll_employee_mappings(
  'b7600000-0000-4000-8000-000000000001', 'f7600000-0000-4000-8000-000000000001', 'c7600000-0000-4000-8000-000000000001'
) where external_employee_id is null and revision = 0), 2::bigint, 'same-name workers start explicitly unmapped');
select extensions.throws_ok($$select pg_temp.mapping('e7600000-0000-4000-8000-000000000003', 'foreign')$$,
  'P0001', 'Employee unavailable or permission denied', 'cross-tenant employee mapping is rejected');
select extensions.throws_ok($$select pg_temp.mapping('e7600000-0000-4000-8000-000000000001', ' padded ')$$,
  'P0001', 'Invalid payroll employee mapping', 'untrimmed external IDs fail explicitly');
select extensions.throws_ok($$select pg_temp.mapping('e7600000-0000-4000-8000-000000000001', repeat('x', 256))$$,
  'P0001', 'Invalid payroll employee mapping', 'overlong external IDs are rejected');
select extensions.throws_ok($$select pg_temp.mapping('e7600000-0000-4000-8000-000000000001', E'bad\nid')$$,
  'P0001', 'Invalid payroll employee mapping', 'control characters are rejected');

select public.decide_attendance_timesheet(
  'b7600000-0000-4000-8000-000000000001', 'c7600000-0000-4000-8000-000000000001', w.session_id,
  gen_random_uuid(), w.edit_revision, 'approved', null
) from public.list_weekly_worked_time_for_edit(
  'b7600000-0000-4000-8000-000000000001', 'c7600000-0000-4000-8000-000000000001', '2024-01-08'
) w;
insert into mapping_saved select 'finalised', public.finalise_payroll_period(
  'b7600000-0000-4000-8000-000000000001', 'c7600000-0000-4000-8000-000000000001', '2024-01-08', gen_random_uuid(), null
);
select extensions.throws_ok($$select * from pg_temp.provider_records()$$,
  'P0001', 'Missing payroll employee mappings', 'provider-ready records fail closed when any worker is unmapped');
insert into mapping_saved select 'request', gen_random_uuid();
insert into mapping_saved select 'event', pg_temp.mapping(
  'e7600000-0000-4000-8000-000000000001', 'Exact-Staff-1', 0,
  (select id from mapping_saved where name = 'request')
);
select extensions.is(pg_temp.mapping('e7600000-0000-4000-8000-000000000001', 'Exact-Staff-1', 0,
  (select id from mapping_saved where name = 'request')), (select id from mapping_saved where name = 'event'),
  'duplicate request returns the original audit receipt');
select extensions.throws_ok($$select pg_temp.mapping('e7600000-0000-4000-8000-000000000001', 'Different', 0,
  (select id from mapping_saved where name = 'request'))$$, 'P0001', 'Request identifier already used',
  'request IDs cannot be reused for a different mapping');
select extensions.throws_ok($$select pg_temp.mapping('e7600000-0000-4000-8000-000000000002', 'Exact-Staff-1')$$,
  'P0001', 'Payroll employee ID is already mapped to another employee', 'same-name workers cannot share an external ID');
select extensions.throws_ok($$select pg_temp.mapping('e7600000-0000-4000-8000-000000000001', 'New-Staff-1')$$,
  'P0001', 'Payroll mapping changed; refresh before saving', 'stale revisions cannot overwrite a mapping');
select extensions.throws_ok($$select * from pg_temp.provider_records()$$,
  'P0001', 'Missing payroll employee mappings', 'one mapped worker never allows partial provider records');
select pg_temp.mapping('e7600000-0000-4000-8000-000000000002', 'Exact-Staff-2');
select extensions.results_eq($$select record #>> '{worker,providerMapping,externalEmployeeId}'
  from pg_temp.provider_records() order by session_id$$,
  $$values ('Exact-Staff-1'::text), ('Exact-Staff-2'::text)$$, 'identical display names retain separately entered payroll IDs');
select extensions.is((select count(*) from public.list_canonical_payroll_records(
  'b7600000-0000-4000-8000-000000000001', 'c7600000-0000-4000-8000-000000000001', '2024-01-08',
  (select id from mapping_saved where name = 'finalised')
) where record #> '{worker,providerMapping}' = 'null'::jsonb), 2::bigint,
  'provider records do not mutate source snapshots');
select pg_temp.mapping_connection('f7600000-0000-4000-8000-000000000002', 'second-org');
select pg_temp.mapping('e7600000-0000-4000-8000-000000000001', 'Exact-Staff-2', 0,
  gen_random_uuid(), 'f7600000-0000-4000-8000-000000000002');
select extensions.throws_ok($$select * from pg_temp.provider_records('f7600000-0000-4000-8000-000000000002')$$,
  'P0001', 'Missing payroll employee mappings', 'a different connection requires its own complete mapping');
select pg_temp.mapping('e7600000-0000-4000-8000-000000000002', null, 1);
select extensions.throws_ok($$select * from pg_temp.provider_records()$$,
  'P0001', 'Missing payroll employee mappings', 'removing an ID blocks provider-ready records again');
select set_config('request.jwt.claim.sub', 'a7600000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select * from public.list_payroll_mapping_connections(
  'b7600000-0000-4000-8000-000000000001')$$, 'P0001', 'Permission denied', 'outside owner cannot enumerate destinations');
select extensions.throws_ok($$select * from pg_temp.provider_records()$$,
  'P0001', 'Permission denied', 'outside owner cannot fetch mapped payroll records');
reset role;
select extensions.is((select count(*) from public.payroll_employee_mapping_events
  where business_id = 'b7600000-0000-4000-8000-000000000001'), 4::bigint,
  'only committed mapping transitions are audited, not retries or failures');
select extensions.throws_ok($$update public.payroll_employee_mapping_events set reason = 'rewrite'$$,
  'P0001', 'Original attendance records are immutable', 'mapping audit cannot be rewritten');
select extensions.throws_ok($$update public.payroll_mapping_connections set account_id = 'other'$$,
  'P0001', 'Original attendance records are immutable', 'destination identity cannot change underneath existing mappings');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.payroll_employee_mappings'::regclass),
  'mapping storage has RLS enabled');
select extensions.throws_ok($$delete from public.businesses where id = 'b7600000-0000-4000-8000-000000000001'$$,
  'P0001', 'Business deletion is disabled while record preservation requirements remain unresolved',
  'business deletion cannot cascade mapping history');
select extensions.is((select count(*) from public.payroll_employee_mapping_events
  where business_id = 'b7600000-0000-4000-8000-000000000001'), 4::bigint,
  'mapping history remains after the rejected deletion');
select * from extensions.finish();
rollback;
