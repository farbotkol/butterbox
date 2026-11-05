begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a6900000-0000-4000-8000-000000000001', 'rules-owner@example.test', '{}'::jsonb),
  ('a6900000-0000-4000-8000-000000000002', 'rules-foh@example.test', '{}'::jsonb),
  ('a6900000-0000-4000-8000-000000000003', 'rules-boh@example.test', '{}'::jsonb),
  ('a6900000-0000-4000-8000-000000000004', 'rules-worker@example.test', '{}'::jsonb),
  ('a6900000-0000-4000-8000-000000000005', 'rules-other-worker@example.test', '{}'::jsonb),
  ('a6900000-0000-4000-8000-000000000006', 'rules-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b6900000-0000-4000-8000-000000000001', 'Rules cafe'),
  ('b6900000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c6900000-0000-4000-8000-000000000001', 'b6900000-0000-4000-8000-000000000001', 'First', 'Australia/Sydney'),
  ('c6900000-0000-4000-8000-000000000002', 'b6900000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d6900000-0000-4000-8000-000000000001', 'b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001', 'FOH'),
  ('d6900000-0000-4000-8000-000000000002', 'b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001', 'BOH'),
  ('d6900000-0000-4000-8000-000000000003', 'b6900000-0000-4000-8000-000000000002', 'c6900000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b6900000-0000-4000-8000-000000000001', 'a6900000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b6900000-0000-4000-8000-000000000001', 'a6900000-0000-4000-8000-000000000002', 'foh_manager', 'c6900000-0000-4000-8000-000000000001', 'd6900000-0000-4000-8000-000000000001'),
  ('b6900000-0000-4000-8000-000000000001', 'a6900000-0000-4000-8000-000000000003', 'boh_manager', 'c6900000-0000-4000-8000-000000000001', 'd6900000-0000-4000-8000-000000000002'),
  ('b6900000-0000-4000-8000-000000000001', 'a6900000-0000-4000-8000-000000000004', 'employee', 'c6900000-0000-4000-8000-000000000001', 'd6900000-0000-4000-8000-000000000001'),
  ('b6900000-0000-4000-8000-000000000001', 'a6900000-0000-4000-8000-000000000005', 'employee', 'c6900000-0000-4000-8000-000000000001', 'd6900000-0000-4000-8000-000000000002'),
  ('b6900000-0000-4000-8000-000000000002', 'a6900000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title, employment_type) values
  ('e6900000-0000-4000-8000-000000000001', 'b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001', 'd6900000-0000-4000-8000-000000000001', 'a6900000-0000-4000-8000-000000000004', 'First worker', 'Server', 'casual'),
  ('e6900000-0000-4000-8000-000000000002', 'b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001', 'd6900000-0000-4000-8000-000000000002', 'a6900000-0000-4000-8000-000000000005', 'Second worker', 'Cook', 'part_time'),
  ('e6900000-0000-4000-8000-000000000003', 'b6900000-0000-4000-8000-000000000002', 'c6900000-0000-4000-8000-000000000002', 'd6900000-0000-4000-8000-000000000003', null, 'Outside worker', 'Server', 'casual');

select set_config('request.jwt.claim.sub', 'a6900000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.results_eq(
  $$select employment_basis, effective_on, revision
    from public.list_current_employee_employment_metadata('b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001')
    where employee_id = 'e6900000-0000-4000-8000-000000000001'$$,
  $$values (null::text, null::date, 0::integer)$$,
  'an existing legacy type does not invent effective-dated metadata or classification');
select extensions.is(
  (select count(*)::integer from public.list_current_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001')),
  1, 'a department manager sees only workers in the managed primary department');
select extensions.isnt(set_config('test.first', public.save_employee_employment_metadata(
  'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
  '2020-01-01', 'part_time', null, 'Award reference', 'Contract reference', 0,
  '96900000-0000-4000-8000-000000000001')::text, true),
  null, 'a scoped manager can record a dated basis and both references with unknown classification');
select extensions.results_eq(
  $$select employment_basis, classification, award_reference, contract_reference, revision, source
    from public.employee_employment_metadata_events where id = current_setting('test.first')::uuid$$,
  $$values ('part_time'::text, null::text, 'Award reference'::text, 'Contract reference'::text, 1::integer, 'dated_editor'::text)$$,
  'unknown classification remains null and both references are retained');
select extensions.is(
  (select employment_type from public.employees where id = 'e6900000-0000-4000-8000-000000000001'),
  'part_time', 'a currently effective basis updates the legacy profile type');
select extensions.is(
  public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2020-01-01', 'part_time', null, 'Award reference', 'Contract reference', 0,
    '96900000-0000-4000-8000-000000000001'),
  current_setting('test.first')::uuid, 'an identical retry returns the original event');
select extensions.is(
  (select count(*)::integer from public.employee_employment_metadata_events),
  1, 'an identical retry does not duplicate history');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2020-01-01', 'casual', null, 'Award reference', 'Contract reference', 0,
    '96900000-0000-4000-8000-000000000001')$$,
  'P0001', 'Request identifier already used', 'a request identifier cannot be reused for different details');
select extensions.isnt(set_config('test.second', public.save_employee_employment_metadata(
  'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
  '2021-01-01', 'full_time', 'Level 2', 'Award reference', 'Contract reference', 1,
  '96900000-0000-4000-8000-000000000002')::text, true),
  null, 'a later dated classification and basis can be recorded');
select extensions.isnt(set_config('test.future', public.save_employee_employment_metadata(
  'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
  (now() at time zone 'Australia/Sydney')::date + 30, 'casual', 'Level 3',
  'Future award', null, 2, '96900000-0000-4000-8000-000000000003')::text, true),
  null, 'future-dated employment changes can be recorded');
select extensions.results_eq(
  $$select employment_basis, effective_on, revision
    from public.list_current_employee_employment_metadata('b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001')
    where employee_id = 'e6900000-0000-4000-8000-000000000001'$$,
  $$values ('full_time'::text, '2021-01-01'::date, 3::integer)$$,
  'a future change does not replace the current basis but advances the revision');
select extensions.is(
  (select employment_type from public.employees where id = 'e6900000-0000-4000-8000-000000000001'),
  'full_time', 'a future change does not prematurely update the legacy profile');
select extensions.isnt(set_config('test.correction', public.save_employee_employment_metadata(
  'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
  '2021-01-01', 'part_time', 'Level 2 corrected', 'Award reference', 'Contract reference', 3,
  '96900000-0000-4000-8000-000000000004')::text, true),
  null, 'a correction can be appended for the same effective date');
select extensions.results_eq(
  $$select employment_basis, effective_on, revision
    from public.list_current_employee_employment_metadata('b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001')
    where employee_id = 'e6900000-0000-4000-8000-000000000001'$$,
  $$values ('part_time'::text, '2021-01-01'::date, 4::integer)$$,
  'the latest revision wins for the same effective date without replacing a future event');
select extensions.is(
  (select count(*)::integer from public.employee_employment_metadata_events),
  4, 'earlier entries and future entries remain in the history');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2022-01-01', 'casual', null, null, null, 3,
    '96900000-0000-4000-8000-000000000005')$$,
  'P0001', 'Employment metadata changed; refresh before saving', 'a stale metadata form cannot overwrite a newer revision');
select extensions.lives_ok(
  $$select public.save_employee_profile_checked(
    'b6900000-0000-4000-8000-000000000001', 'd6900000-0000-4000-8000-000000000001',
    'e6900000-0000-4000-8000-000000000001', 'First worker', '', 'Server', 'full_time', true, 4)$$,
  'an existing profile edit can still change employment type');
select extensions.results_eq(
  $$select effective_on, employment_basis, classification, award_reference, contract_reference, revision, source
    from public.employee_employment_metadata_events where employee_id = 'e6900000-0000-4000-8000-000000000001'
    order by revision desc limit 1$$,
  $$select (now() at time zone 'Australia/Sydney')::date, 'full_time'::text, 'Level 2 corrected'::text,
    'Award reference'::text, 'Contract reference'::text, 5::integer, 'profile_edit'::text$$,
  'a profile type change records a venue-local effective date and retains current references');
select extensions.is(
  (select employment_type from public.employees where id = 'e6900000-0000-4000-8000-000000000001'),
  'full_time', 'the profile continues to expose the changed employment type');
select extensions.throws_ok(
  $$select public.save_employee_profile_checked(
    'b6900000-0000-4000-8000-000000000001', 'd6900000-0000-4000-8000-000000000001',
    'e6900000-0000-4000-8000-000000000001', 'Stale name', '', 'Server', 'part_time', true, 4)$$,
  'P0001', 'Employment metadata changed; refresh before saving', 'a stale profile form cannot undo a metadata change');
select extensions.is(
  (select name from public.employees where id = 'e6900000-0000-4000-8000-000000000001'),
  'First worker', 'a rejected stale profile form changes no fields');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    'infinity', 'casual', null, null, null, 5, '96900000-0000-4000-8000-000000000006')$$,
  'P0001', 'Invalid employment metadata', 'infinite effective dates are rejected');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2022-01-01', 'contractor', null, null, null, 5, '96900000-0000-4000-8000-000000000006')$$,
  'P0001', 'Invalid employment metadata', 'unsupported employment bases are rejected');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2022-01-01', 'casual', '  ', null, null, 5, '96900000-0000-4000-8000-000000000006')$$,
  'P0001', 'Invalid employment metadata', 'blank classification text cannot masquerade as a known value');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2022-01-01', 'casual', null, 'Bad' || chr(10) || 'reference', null, 5,
    '96900000-0000-4000-8000-000000000006')$$,
  'P0001', 'Invalid employment metadata', 'control characters in references are rejected');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2022-01-01', 'casual', repeat('x', 101), null, null, 5,
    '96900000-0000-4000-8000-000000000006')$$,
  'P0001', 'Invalid employment metadata', 'overlong classifications are rejected');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2022-01-01', 'casual', null, null, null, -1, '96900000-0000-4000-8000-000000000006')$$,
  'P0001', 'Invalid employment metadata', 'negative revisions are rejected');
select extensions.throws_ok(
  $$insert into public.employee_employment_metadata_events (
    business_id, venue_id, department_id, employee_id, effective_on, employment_basis, revision, source, actor_id, request_id
  ) values ('b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001',
    'd6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2023-01-01', 'casual', 6, 'dated_editor', 'a6900000-0000-4000-8000-000000000002',
    '96900000-0000-4000-8000-000000000006')$$,
  '42501', null, 'clients cannot insert history directly');
select extensions.throws_ok(
  $$update public.employee_employment_metadata_events set classification = 'Overwritten'
    where id = current_setting('test.first')::uuid$$,
  '42501', null, 'clients cannot update historical events directly');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000002',
    '2022-01-01', 'casual', null, null, null, 0, '96900000-0000-4000-8000-000000000007')$$,
  'P0001', 'Permission denied', 'a FOH manager cannot change BOH employment metadata');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000002', 'e6900000-0000-4000-8000-000000000003',
    '2022-01-01', 'casual', null, null, null, 0, '96900000-0000-4000-8000-000000000007')$$,
  'P0001', 'Permission denied', 'cross-tenant metadata changes are denied');

select set_config('request.jwt.claim.sub', 'a6900000-0000-4000-8000-000000000001', true);
select extensions.isnt(set_config('test.unknown', public.save_employee_employment_metadata(
  'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000002',
  '2020-01-01', 'unknown', null, null, null, 0, '96900000-0000-4000-8000-000000000008')::text, true),
  null, 'an owner can explicitly record unknown employment details');
select extensions.results_eq(
  $$select employment_basis, classification, award_reference, contract_reference
    from public.employee_employment_metadata_events where id = current_setting('test.unknown')::uuid$$,
  $$values ('unknown'::text, null::text, null::text, null::text)$$,
  'unknown values do not fall back to a role title or a legacy employment type');
select extensions.is(
  (select employment_type from public.employees where id = 'e6900000-0000-4000-8000-000000000002'),
  'unknown', 'the legacy profile can explicitly represent an unknown current basis');
select extensions.is(
  (select count(*)::integer from public.sensitive_action_audit
    where source_table = 'employee_employment_metadata_events'
      and record_id = current_setting('test.first')),
  1, 'metadata changes create an owner-visible sensitive-action audit record');
select extensions.ok(
  (select not (new_values ? 'award_reference') and not (new_values ? 'contract_reference')
    from public.sensitive_action_audit where source_table = 'employee_employment_metadata_events'
      and record_id = current_setting('test.first')),
  'the generic audit record does not copy contract or award reference text');
select set_config('request.jwt.claim.sub', 'a6900000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.employee_employment_metadata_events
    where employee_id = 'e6900000-0000-4000-8000-000000000002'),
  0, 'a FOH manager cannot read BOH metadata');
select set_config('request.jwt.claim.sub', 'a6900000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::integer from public.employee_employment_metadata_events),
  5, 'a worker can read their own employment metadata history');
select extensions.is(
  (select count(*)::integer from public.employee_employment_metadata_events
    where employee_id = 'e6900000-0000-4000-8000-000000000002'),
  0, 'a worker cannot read another employee employment history');
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2022-01-01', 'casual', null, null, null, 5, '96900000-0000-4000-8000-000000000009')$$,
  'P0001', 'Permission denied', 'workers cannot edit their own employment metadata');
select set_config('request.jwt.claim.sub', 'a6900000-0000-4000-8000-000000000006', true);
select extensions.is(
  (select count(*)::integer from public.employee_employment_metadata_events),
  0, 'another tenant cannot read this business employment history');
select extensions.is(
  (select count(*)::integer from public.list_current_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001')),
  0, 'another tenant cannot list current employment metadata');
reset role;
select extensions.lives_ok(
  $$delete from public.employees where id = 'e6900000-0000-4000-8000-000000000002'$$,
  'deleting a profile does not fail because it has employment metadata');
select extensions.results_eq(
  $$select employee_id, employee_profile_id, employment_basis, classification
    from public.employee_employment_metadata_events where id = current_setting('test.unknown')::uuid$$,
  $$values ('e6900000-0000-4000-8000-000000000002'::uuid, null::uuid, 'unknown'::text, null::text)$$,
  'the immutable history retains the original employee identifier and details after profile deletion');
set local role service_role;
select extensions.throws_ok(
  $$delete from public.employee_employment_metadata_events where id = current_setting('test.first')::uuid$$,
  '42501', null, 'the service role cannot delete employment metadata history');
reset role;
select extensions.throws_ok(
  $$update public.employee_employment_metadata_events set classification = 'Overwritten'
    where id = current_setting('test.first')::uuid$$,
  'P0001', 'Employment metadata history is immutable', 'the database prevents overwriting history');
select extensions.throws_ok(
  $$delete from public.employee_employment_metadata_events where id = current_setting('test.first')::uuid$$,
  'P0001', 'Employment metadata history is immutable', 'the database prevents deleting history');
set local role anon;
select extensions.throws_ok(
  $$select public.save_employee_employment_metadata(
    'b6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001',
    '2022-01-01', 'casual', null, null, null, 5, '96900000-0000-4000-8000-000000000009')$$,
  '42501', 'permission denied for function save_employee_employment_metadata', 'anonymous metadata writes are denied');
select extensions.throws_ok(
  $$select * from public.employee_employment_metadata_events$$,
  '42501', 'permission denied for table employee_employment_metadata_events', 'anonymous metadata reads are denied');
reset role;

select * from extensions.finish();
rollback;
