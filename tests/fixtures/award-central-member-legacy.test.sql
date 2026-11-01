-- Run only against the verified disposable database after the pre-gate fixture
-- and the publication-block and member-read migrations have been applied.
begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1330000-0000-4000-8000-000000000001', 'award-legacy-first@example.test', '{}'::jsonb),
  ('a1330000-0000-4000-8000-000000000002', 'award-legacy-second@example.test', '{}'::jsonb),
  ('a1330000-0000-4000-8000-000000000003', 'award-legacy-outsider@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b1330000-0000-4000-8000-000000000001', 'First synthetic legacy business'),
  ('b1330000-0000-4000-8000-000000000002', 'Second synthetic legacy business');
insert into public.business_memberships (business_id, user_id, role) values
  ('b1330000-0000-4000-8000-000000000001', 'a1330000-0000-4000-8000-000000000001', 'owner'),
  ('b1330000-0000-4000-8000-000000000002', 'a1330000-0000-4000-8000-000000000002', 'employee');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1330000-0000-4000-8000-000000000001', true);
select extensions.is((select id from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'),
  'a1310000-0000-4000-8000-000000000003'::uuid,
  'a business owner can read the previously active shared version');
select extensions.is((select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000004'), 0,
  'a business owner cannot read the existing pending-review version');
select extensions.throws_ok($$update public.award_central_versions set status = 'superseded'
  where id = 'a1310000-0000-4000-8000-000000000003'$$, '42501', null,
  'a business owner cannot supersede the shared version');
select extensions.throws_ok($$delete from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'$$, '42501', null,
  'a business owner cannot delete the shared version');

select set_config('request.jwt.claim.sub', 'a1330000-0000-4000-8000-000000000002', true);
select extensions.is((select id from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'),
  'a1310000-0000-4000-8000-000000000003'::uuid,
  'a member of another business reads the same active version');
select extensions.is((select instrument_id from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'),
  'a1310000-0000-4000-8000-000000000002'::uuid,
  'the active version still refers to the same shared instrument');
select extensions.is((select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000004'), 0,
  'another business member cannot read the pending-review version');

select set_config('request.jwt.claim.sub', 'a1330000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::int from public.award_central_instruments
  where id = 'a1310000-0000-4000-8000-000000000002'), 0,
  'a nonmember cannot read the existing central instrument');
select extensions.is((select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'), 0,
  'a nonmember cannot read the existing active version');

reset role;
set local role anon;
select extensions.throws_ok($$select * from public.award_central_versions$$, '42501', null,
  'anonymous users cannot read an existing active version');
reset role;
delete from public.business_memberships
where business_id = 'b1330000-0000-4000-8000-000000000001'
  and user_id = 'a1330000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1330000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'), 0,
  'revocation hides the active version from the existing identity');
select set_config('request.jwt.claim.sub', 'a1330000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'), 1,
  'revocation leaves the other business member authorised');
reset role;
delete from public.business_memberships
where business_id = 'b1330000-0000-4000-8000-000000000002'
  and user_id = 'a1330000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is((select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'), 0,
  'the second user loses access after their last membership is removed');
reset role;
select extensions.is((select status from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'), 'active',
  'membership changes do not alter the published version');

select * from extensions.finish();
rollback;
