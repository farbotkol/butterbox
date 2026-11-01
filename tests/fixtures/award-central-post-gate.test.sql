begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select is((select status from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'), 'active',
  'an existing active version remains active after the publication-block migration');
insert into auth.users (id, email, raw_user_meta_data)
values ('a1310000-0000-4000-8000-000000000005', 'award-legacy-member@example.test', '{}'::jsonb);
insert into public.businesses (id, name)
values ('b1310000-0000-4000-8000-000000000001', 'Synthetic legacy member business');
insert into public.business_memberships (business_id, user_id, role)
values ('b1310000-0000-4000-8000-000000000001', 'a1310000-0000-4000-8000-000000000005', 'owner');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1310000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'), 1,
  'a business member can still read an existing active version');
select is((select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000004'), 0,
  'authenticated users cannot read an existing pending-review version');
select throws_ok($$update public.award_central_versions set status = 'superseded'
  where id = 'a1310000-0000-4000-8000-000000000003'$$, '42501', null,
  'customers cannot supersede a pre-existing active version');
reset role;
select throws_ok($$update public.award_central_versions set rule_proposal = '{"changed":true}'
  where id = 'a1310000-0000-4000-8000-000000000003'$$, 'P0001',
  'Active Award Central version can only be superseded',
  'a pre-existing active version cannot be rewritten');
select throws_ok($$delete from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'$$, 'P0001',
  'Award Central versions cannot be deleted', 'a pre-existing active version cannot be deleted');
select throws_ok($$update public.award_central_versions
  set status = 'active', reviewed_by = 'synthetic-reviewer', reviewed_at = now(), activated_at = now()
  where id = 'a1310000-0000-4000-8000-000000000004'$$, 'P0001',
  'Award Central publication is disabled until independent validation and approval are implemented',
  'a pre-existing pending-review version cannot be newly activated');
select throws_ok($$update public.award_central_versions
  set status = 'approved', reviewed_by = 'synthetic-reviewer', reviewed_at = now()
  where id = 'a1310000-0000-4000-8000-000000000004'$$, 'P0001',
  'Award Central publication is disabled until independent validation and approval are implemented',
  'a pre-existing pending-review version cannot be newly approved');
update public.award_central_versions set status = 'superseded'
  where id = 'a1310000-0000-4000-8000-000000000003';
select is((select status from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'), 'superseded',
  'an existing active version can still be superseded');
select throws_ok($$update public.award_central_versions set status = 'active'
  where id = 'a1310000-0000-4000-8000-000000000003'$$, 'P0001',
  'Approved Award Central versions are immutable',
  'an existing superseded version remains immutable');

select * from finish();
rollback;
