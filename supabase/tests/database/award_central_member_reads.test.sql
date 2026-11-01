begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(19);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1320000-0000-4000-8000-000000000001', 'award-owner@example.test', '{}'::jsonb),
  ('a1320000-0000-4000-8000-000000000002', 'award-worker@example.test', '{}'::jsonb),
  ('a1320000-0000-4000-8000-000000000003', 'award-manager@example.test', '{}'::jsonb),
  ('a1320000-0000-4000-8000-000000000004', 'award-nonmember@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b1320000-0000-4000-8000-000000000001', 'First synthetic business'),
  ('b1320000-0000-4000-8000-000000000002', 'Second synthetic business');
insert into public.venues (id, business_id, name) values
  ('c1320000-0000-4000-8000-000000000001', 'b1320000-0000-4000-8000-000000000001', 'First venue'),
  ('c1320000-0000-4000-8000-000000000002', 'b1320000-0000-4000-8000-000000000002', 'Second venue');
insert into public.departments (id, business_id, venue_id, name) values
  ('d1320000-0000-4000-8000-000000000001', 'b1320000-0000-4000-8000-000000000001',
   'c1320000-0000-4000-8000-000000000001', 'FOH'),
  ('d1320000-0000-4000-8000-000000000002', 'b1320000-0000-4000-8000-000000000002',
   'c1320000-0000-4000-8000-000000000002', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b1320000-0000-4000-8000-000000000001', 'a1320000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b1320000-0000-4000-8000-000000000002', 'a1320000-0000-4000-8000-000000000001', 'admin', null, null),
  ('b1320000-0000-4000-8000-000000000002', 'a1320000-0000-4000-8000-000000000002', 'employee',
   'c1320000-0000-4000-8000-000000000002', 'd1320000-0000-4000-8000-000000000002'),
  ('b1320000-0000-4000-8000-000000000001', 'a1320000-0000-4000-8000-000000000003', 'foh_manager',
   'c1320000-0000-4000-8000-000000000001', 'd1320000-0000-4000-8000-000000000001');
insert into public.award_central_instruments (id, instrument_code, instrument_name)
values ('e1320000-0000-4000-8000-000000000001', 'TEST-1320', 'Synthetic shared instrument');
insert into public.award_central_source_snapshots
  (id, source_identity, source_kind, source_url, retrieved_at, content_type, content_bytes)
values ('e1320000-0000-4000-8000-000000000002', 'synthetic-member-read-source', 'award_instrument',
  'https://www.fwc.gov.au/synthetic-member-read', '2026-01-01 00:00:00+00', 'text/plain',
  convert_to('synthetic member-read fixture; not an official source', 'UTF8'));
insert into public.award_central_versions (
  id, instrument_id, version_label, effective_from, source_url, source_sha256, retrieved_at, source_snapshot_id
) values (
  'e1320000-0000-4000-8000-000000000003', 'e1320000-0000-4000-8000-000000000001',
  'synthetic-draft', '2026-01-01', 'https://www.fwc.gov.au/synthetic-member-read',
  encode(extensions.digest(convert_to('synthetic member-read fixture; not an official source', 'UTF8'), 'sha256'), 'hex'),
  '2026-01-01 00:00:00+00', 'e1320000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1320000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*)::int from public.award_central_instruments
  where id = 'e1320000-0000-4000-8000-000000000001'), 1,
  'an owner can read the shared central instrument');
select extensions.is((select count(*)::int from public.award_central_versions
  where id = 'e1320000-0000-4000-8000-000000000003'), 0,
  'a business member cannot read draft versions');
select extensions.throws_ok($$update public.award_central_instruments set instrument_name = 'Changed'
  where id = 'e1320000-0000-4000-8000-000000000001'$$, '42501', null,
  'a customer cannot edit the central instrument');
select extensions.throws_ok($$delete from public.award_central_versions
  where id = 'e1320000-0000-4000-8000-000000000003'$$, '42501', null,
  'a customer cannot delete central versions');
select extensions.throws_ok($$select * from public.award_central_source_snapshots$$, '42501', null,
  'a customer cannot read centrally staged source documents');

select set_config('request.jwt.claim.sub', 'a1320000-0000-4000-8000-000000000002', true);
select extensions.is((select id from public.award_central_instruments
  where id = 'e1320000-0000-4000-8000-000000000001'),
  'e1320000-0000-4000-8000-000000000001'::uuid,
  'an employee at another business reads the same central instrument');
select extensions.is((select count(*)::int from public.award_central_versions
  where id = 'e1320000-0000-4000-8000-000000000003'), 0,
  'a worker at another business cannot read the draft');
select extensions.is((select count(*)::int from public.business_memberships
  where business_id = 'b1320000-0000-4000-8000-000000000001'), 0,
  'the shared catalogue does not expose another business membership');

select set_config('request.jwt.claim.sub', 'a1320000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::int from public.award_central_instruments
  where id = 'e1320000-0000-4000-8000-000000000001'), 1,
  'a department-scoped FOH manager can read the central instrument');

select set_config('request.jwt.claim.sub', 'a1320000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::int from public.award_central_instruments
  where id = 'e1320000-0000-4000-8000-000000000001'), 0,
  'an authenticated account without a business membership sees no instrument');
select extensions.is((select count(*)::int from public.award_central_versions), 0,
  'an authenticated account without a business membership sees no versions');
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select extensions.is((select count(*)::int from public.award_central_instruments), 0,
  'an authenticated role without a user identity sees no instrument');

reset role;
set local role anon;
select extensions.throws_ok($$select * from public.award_central_instruments$$, '42501', null,
  'anonymous callers cannot read the central instrument table');
reset role;
set local role service_role;
select extensions.throws_ok($$select * from public.award_central_versions$$, '42501', null,
  'the ingestion service role cannot read central versions');

reset role;
delete from public.business_memberships
where business_id = 'b1320000-0000-4000-8000-000000000001'
  and user_id = 'a1320000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1320000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*)::int from public.award_central_instruments
  where id = 'e1320000-0000-4000-8000-000000000001'), 1,
  'a user remains authorised while a different business membership exists');
reset role;
delete from public.business_memberships
where business_id = 'b1320000-0000-4000-8000-000000000002'
  and user_id = 'a1320000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is((select count(*)::int from public.award_central_instruments
  where id = 'e1320000-0000-4000-8000-000000000001'), 0,
  'removing the final membership revokes access for the existing identity');
select set_config('request.jwt.claim.sub', 'a1320000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::int from public.award_central_instruments
  where id = 'e1320000-0000-4000-8000-000000000001'), 1,
  'revocation does not affect a member of another business');
reset role;
insert into public.business_memberships (business_id, user_id, role)
values ('b1320000-0000-4000-8000-000000000001', 'a1320000-0000-4000-8000-000000000001', 'owner');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1320000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*)::int from public.award_central_instruments
  where id = 'e1320000-0000-4000-8000-000000000001'), 1,
  'a new membership restores access without changing the central library');
select extensions.is((select count(*)::int from public.award_central_versions
  where id = 'e1320000-0000-4000-8000-000000000003'), 0,
  'restoring membership does not expose unpublished versions');

select * from extensions.finish();
rollback;
