begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data)
select ('a9150000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'demand-test-' || n || '@example.test', '{}'::jsonb from generate_series(1, 5) n;
insert into public.businesses (id, name) values
  ('b9150000-0000-4000-8000-000000000001', 'Demand cafe'),
  ('b9150000-0000-4000-8000-000000000002', 'Other cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c9150000-0000-4000-8000-000000000001', 'b9150000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c9150000-0000-4000-8000-000000000002', 'b9150000-0000-4000-8000-000000000001', 'Other venue', 'Australia/Sydney'),
  ('c9150000-0000-4000-8000-000000000003', 'b9150000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d9150000-0000-4000-8000-000000000001', 'b9150000-0000-4000-8000-000000000001', 'c9150000-0000-4000-8000-000000000001', 'FOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b9150000-0000-4000-8000-000000000001', 'a9150000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b9150000-0000-4000-8000-000000000001', 'a9150000-0000-4000-8000-000000000002', 'foh_manager',
    'c9150000-0000-4000-8000-000000000001', 'd9150000-0000-4000-8000-000000000001'),
  ('b9150000-0000-4000-8000-000000000001', 'a9150000-0000-4000-8000-000000000003', 'employee',
    'c9150000-0000-4000-8000-000000000001', 'd9150000-0000-4000-8000-000000000001'),
  ('b9150000-0000-4000-8000-000000000002', 'a9150000-0000-4000-8000-000000000004', 'owner', null, null),
  ('b9150000-0000-4000-8000-000000000001', 'a9150000-0000-4000-8000-000000000005', 'admin', null, null);

create function pg_temp.upload_demand(
  p_request uuid, p_rows jsonb, p_source text default 'POS', p_type text default 'sales',
  p_venue uuid default 'c9150000-0000-4000-8000-000000000001',
  p_timezone text default 'Australia/Sydney'
)
returns uuid language sql as $$
  select public.import_demand_history('b9150000-0000-4000-8000-000000000001',
    p_venue, p_type, p_source, p_timezone, p_request, p_rows);
$$;
grant execute on function pg_temp.upload_demand(uuid, jsonb, text, text, uuid, text) to authenticated, anon;
select set_config('test.valid_rows', '[
  {"source_record_id":"sale1","occurred_at":"2024-01-15T12:30:00+11:00","value":"00012.50"},
  {"source_record_id":"sale2","occurred_at":"2024-07-15T12:30:00+10:00","value":"0"}
]'::jsonb::text, true);

set local role anon;
select extensions.throws_ok($$select * from public.demand_history_imports$$, '42501', null,
  'anonymous cannot read import provenance');
select extensions.throws_ok($$select * from public.demand_history_records$$, '42501', null,
  'anonymous cannot read raw records');
select extensions.throws_ok($$select public.import_demand_history(
  'b9150000-0000-4000-8000-000000000001', 'c9150000-0000-4000-8000-000000000001',
  'sales', 'POS', 'Australia/Sydney', gen_random_uuid(), current_setting('test.valid_rows')::jsonb)$$,
  '42501', null, 'anonymous cannot invoke the import RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9150000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$insert into public.demand_history_imports default values$$,
  '42501', null, 'owners cannot directly forge imports');
select extensions.throws_ok($$insert into public.demand_history_records default values$$,
  '42501', null, 'owners cannot directly forge raw records');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), null)$$,
  'P0001', 'Import must contain 1 to 1000 records within the size limit', 'null rows rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), '{}'::jsonb)$$,
  'P0001', 'Import must contain 1 to 1000 records within the size limit', 'non-array rows rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), '[]'::jsonb)$$,
  'P0001', 'Import must contain 1 to 1000 records within the size limit', 'empty rows rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  (select jsonb_agg(jsonb_build_object('source_record_id', n::text,
    'occurred_at', '2024-01-15T12:30:00+11:00', 'value', '1')) from generate_series(1, 1001) n))$$,
  'P0001', 'Import must contain 1 to 1000 records within the size limit', 'over 1000 rows rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), current_setting('test.valid_rows')::jsonb, 'Customer@example.com')$$,
  'P0001', 'Invalid import details', 'source names cannot contain email punctuation');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), current_setting('test.valid_rows')::jsonb, 'POS', 'other')$$,
  'P0001', 'Invalid import details', 'unsupported history type rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), current_setting('test.valid_rows')::jsonb,
  'POS', 'sales', 'c9150000-0000-4000-8000-000000000001', 'UTC')$$,
  'P0001', 'Venue timezone changed or is invalid', 'stale venue timezone rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"s1","occurred_at":"2024-01-15T12:30:00+11:00","value":"1","customer_name":"Person"}]'::jsonb)$$,
  'P0001', 'Invalid record 1', 'unexpected customer details rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"s1","occurred_at":"2024-01-15T12:30:00+11:00"}]'::jsonb)$$,
  'P0001', 'Invalid record 1', 'missing value rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"person@example.com","occurred_at":"2024-01-15T12:30:00+11:00","value":"1"}]'::jsonb)$$,
  'P0001', 'Invalid record 1', 'email-like source record ID rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"s1","occurred_at":"2024-02-30T12:30:00+11:00","value":"1"}]'::jsonb)$$,
  'P0001', 'Invalid timestamp in record 1', 'invalid calendar date rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"s1","occurred_at":"2024-01-15T12:30:00","value":"1"}]'::jsonb)$$,
  'P0001', 'Invalid timestamp in record 1', 'timestamp without offset rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"s1","occurred_at":"2024-01-15T12:30:00+10:00","value":"1"}]'::jsonb)$$,
  'P0001', 'Timestamp timezone mismatch in record 1', 'incorrect seasonal offset rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"s1","occurred_at":"2024-10-06T02:30:00+10:00","value":"1"}]'::jsonb)$$,
  'P0001', 'Timestamp timezone mismatch in record 1', 'nonexistent daylight-saving time rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"s1","occurred_at":"2024-01-15T12:30:00+11:00","value":"1.001"}]'::jsonb)$$,
  'P0001', 'Invalid value in record 1', 'sales value cannot have three decimal places');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"s1","occurred_at":"2024-01-15T12:30:00+11:00","value":"0"}]'::jsonb, 'POS', 'bookings')$$,
  'P0001', 'Invalid value in record 1', 'zero booking guests rejected');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"s1","occurred_at":"2024-01-15T12:30:00+11:00","value":"not-a-number"}]'::jsonb, 'POS', 'bookings')$$,
  'P0001', 'Invalid value in record 1', 'invalid booking value rejected explicitly');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"s1","occurred_at":"2024-01-15T12:30:00+11:00","value":"1"},
    {"source_record_id":"s1","occurred_at":"2024-01-16T12:30:00+11:00","value":"2"}]'::jsonb)$$,
  'P0001', 'Duplicate source record IDs in file', 'duplicate IDs within one file rejected');
select extensions.is((select count(*) from public.demand_history_imports), 0::bigint,
  'invalid attempts create no imports');

select set_config('test.first_import', pg_temp.upload_demand(
  '19150000-0000-4000-8000-000000000001', current_setting('test.valid_rows')::jsonb)::text, true);
select extensions.is((select count(*) from public.demand_history_imports), 1::bigint,
  'owner can create one import');
select extensions.is((select count(*) from public.demand_history_records), 2::bigint,
  'all valid source records are retained');
select extensions.is((select original_value from public.demand_history_records where source_record_id = 'sale1'),
  '00012.50', 'the original value is preserved without reformatting');
select extensions.is((select original_occurred_at from public.demand_history_records where source_record_id = 'sale1'),
  '2024-01-15T12:30:00+11:00', 'the original timestamp and offset are retained');
select extensions.is(pg_temp.upload_demand(
  '19150000-0000-4000-8000-000000000001', current_setting('test.valid_rows')::jsonb)::text,
  current_setting('test.first_import'), 'identical request retry returns the original import');
select extensions.throws_ok($$select pg_temp.upload_demand('19150000-0000-4000-8000-000000000001',
  '[{"source_record_id":"changed","occurred_at":"2024-01-15T12:30:00+11:00","value":"1"}]'::jsonb)$$,
  'P0001', 'Request identifier already used', 'a conflicting retry cannot change the prior import');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"new","occurred_at":"2024-01-15T12:30:00+11:00","value":"8"},
    {"source_record_id":"sale1","occurred_at":"2024-01-15T12:30:00+11:00","value":"99"}]'::jsonb, 'pos')$$,
  'P0001', 'Source record IDs already imported; nothing was saved', 'existing ID is detected case-insensitively by source');
select extensions.is((select count(*) from public.demand_history_imports), 1::bigint,
  'a partially duplicate file rolls back its import metadata');
select extensions.is((select count(*) from public.demand_history_records), 2::bigint,
  'a partially duplicate file rolls back all new records');
select extensions.is((select original_value from public.demand_history_records where source_record_id = 'sale1'),
  '00012.50', 'duplicate import never overwrites original values');
select extensions.lives_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"sale1","occurred_at":"2024-01-15T12:30:00+11:00","value":"1"}]'::jsonb, 'Another POS')$$,
  'the same ID from another source has a distinct namespace');
select extensions.lives_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"sale1","occurred_at":"2024-01-15T12:30:00+11:00","value":"2"}]'::jsonb, 'POS', 'bookings')$$,
  'sales and booking IDs have distinct namespaces');
select extensions.lives_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"sale1","occurred_at":"2024-01-15T12:30:00+11:00","value":"3"}]'::jsonb,
  'POS', 'sales', 'c9150000-0000-4000-8000-000000000002')$$,
  'different venues have distinct namespaces');
select extensions.lives_ok($$select pg_temp.upload_demand(gen_random_uuid(),
  '[{"source_record_id":"fall1","occurred_at":"2024-04-07T02:30:00+11:00","value":"1"},
    {"source_record_id":"fall2","occurred_at":"2024-04-07T02:30:00+10:00","value":"1"}]'::jsonb)$$,
  'both explicitly offset occurrences during a repeated hour are valid');
select set_config('test.bulk_import', pg_temp.upload_demand(gen_random_uuid(),
  (select jsonb_agg(jsonb_build_object('source_record_id', 'bulk' || n::text,
    'occurred_at', '2024-01-15T12:30:00+11:00', 'value', '1'))
   from generate_series(1, 1000) n), 'Bulk POS')::text, true);
select extensions.is((select entry_count from public.demand_history_imports
  where id = current_setting('test.bulk_import')::uuid), 1000, 'exactly 1000 records are accepted');
select extensions.is((select count(*) from public.demand_history_records
  where import_id = current_setting('test.bulk_import')::uuid), 1000::bigint,
  'all 1000 original records are retained');

select set_config('request.jwt.claim.sub', 'a9150000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from public.demand_history_imports), 0::bigint, 'manager cannot read provenance');
select extensions.is((select count(*) from public.demand_history_records), 0::bigint, 'manager cannot read raw records');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), current_setting('test.valid_rows')::jsonb)$$,
  'P0001', 'Permission denied', 'manager cannot import');
select set_config('request.jwt.claim.sub', 'a9150000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.demand_history_imports), 0::bigint, 'employee cannot read provenance');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), current_setting('test.valid_rows')::jsonb)$$,
  'P0001', 'Permission denied', 'employee cannot import');
select set_config('request.jwt.claim.sub', 'a9150000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*) from public.demand_history_records), 0::bigint, 'admin cannot read raw records');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), current_setting('test.valid_rows')::jsonb)$$,
  'P0001', 'Permission denied', 'admin cannot import');
select set_config('request.jwt.claim.sub', 'a9150000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*) from public.demand_history_imports), 0::bigint, 'other business owner cannot read imports');
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), current_setting('test.valid_rows')::jsonb)$$,
  'P0001', 'Permission denied', 'other business owner cannot import into the first business');
select set_config('request.jwt.claim.sub', 'a9150000-0000-4000-8000-000000000001', true);
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), current_setting('test.valid_rows')::jsonb,
  'POS', 'sales', 'c9150000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'owner cannot import into a different business venue');

reset role;
update public.venues set timezone = 'Invalid/Zone'
  where id = 'c9150000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.throws_ok($$select pg_temp.upload_demand(gen_random_uuid(), current_setting('test.valid_rows')::jsonb,
  'POS', 'sales', 'c9150000-0000-4000-8000-000000000002', 'Invalid/Zone')$$,
  'P0001', 'Venue timezone changed or is invalid', 'an invalid configured venue timezone is rejected');
reset role;
select extensions.throws_ok($$update public.demand_history_imports set source_name = 'Changed'
  where id = current_setting('test.first_import')::uuid$$, 'P0001', 'Demand history is immutable', 'provenance cannot be edited');
select extensions.throws_ok($$delete from public.demand_history_imports
  where id = current_setting('test.first_import')::uuid$$, 'P0001', 'Demand history is immutable', 'imports cannot be deleted');
select extensions.throws_ok($$update public.demand_history_records set original_value = '999'
  where import_id = current_setting('test.first_import')::uuid$$, 'P0001', 'Demand history is immutable', 'original values cannot be edited');
select extensions.throws_ok($$delete from public.demand_history_records
  where import_id = current_setting('test.first_import')::uuid$$, 'P0001', 'Demand history is immutable', 'original values cannot be deleted');
select extensions.throws_ok($$truncate public.demand_history_records$$,
  'P0001', 'Demand history is immutable', 'raw records cannot be truncated');
select extensions.throws_ok($$truncate public.demand_history_imports cascade$$,
  'P0001', 'Demand history is immutable', 'imports cannot be truncated');
select extensions.is((select count(*) from public.sensitive_action_audit
  where business_id = 'b9150000-0000-4000-8000-000000000001' and source_table = 'demand_history_imports'
    and (new_values ? 'source_name' or new_values ? 'original_value' or new_values ? 'payload_hash')),
  0::bigint, 'audit metadata excludes source names, raw values and payload hashes');
select extensions.is((select count(*) from public.sensitive_action_audit
  where business_id = 'b9150000-0000-4000-8000-000000000001' and source_table = 'demand_history_imports'),
  6::bigint, 'each successful import has one audit record and retries have none');

select * from extensions.finish();
rollback;
