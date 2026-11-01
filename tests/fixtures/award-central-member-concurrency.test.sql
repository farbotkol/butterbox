-- Run only as a database operator on a verified disposable project after the
-- pre-gate fixture and all Award Central migrations have been applied.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1340000-0000-4000-8000-000000000001', 'award-concurrent-first@example.test', '{}'::jsonb),
  ('a1340000-0000-4000-8000-000000000002', 'award-concurrent-second@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b1340000-0000-4000-8000-000000000001', 'First synthetic concurrent business'),
  ('b1340000-0000-4000-8000-000000000002', 'Second synthetic concurrent business');
insert into public.business_memberships (business_id, user_id, role) values
  ('b1340000-0000-4000-8000-000000000001', 'a1340000-0000-4000-8000-000000000001', 'owner'),
  ('b1340000-0000-4000-8000-000000000002', 'a1340000-0000-4000-8000-000000000002', 'owner');

begin;
set local search_path = public, extensions;
set local statement_timeout = '15s';
select extensions.plan(8);

select extensions.dblink_connect_u('award_member_reader', 'dbname=postgres user=postgres application_name=award_member_reader');
select extensions.dblink_connect_u('award_member_writer', 'dbname=postgres user=postgres application_name=award_member_writer');
select extensions.dblink_exec('award_member_reader', 'begin isolation level read committed');
select extensions.dblink_exec('award_member_reader', 'set local role authenticated');
select extensions.dblink_exec('award_member_reader',
  $$set local "request.jwt.claim.sub" = 'a1340000-0000-4000-8000-000000000001'$$);
select extensions.is((select result.count from extensions.dblink('award_member_reader', $sql$
  select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'
$sql$) as result(count int)), 1, 'a concurrent reader initially sees the active shared version');

select extensions.dblink_exec('award_member_writer', 'begin');
select extensions.dblink_exec('award_member_writer', $sql$
  delete from public.business_memberships
  where business_id = 'b1340000-0000-4000-8000-000000000001'
    and user_id = 'a1340000-0000-4000-8000-000000000001'
$sql$);
select extensions.is((select result.count from extensions.dblink('award_member_reader', $sql$
  select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'
$sql$) as result(count int)), 1, 'an uncommitted revocation is not visible to another session');
select extensions.is(extensions.dblink_exec('award_member_writer', 'commit'), 'COMMIT',
  'the concurrent revocation commits');
select extensions.is((select result.count from extensions.dblink('award_member_reader', $sql$
  select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'
$sql$) as result(count int)), 0,
  'the next read-committed statement rejects the revoked identity');

select extensions.dblink_exec('award_member_reader',
  $$set local "request.jwt.claim.sub" = 'a1340000-0000-4000-8000-000000000002'$$);
select extensions.is((select result.count from extensions.dblink('award_member_reader', $sql$
  select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'
$sql$) as result(count int)), 1, 'the other business member remains authorised');
select extensions.is((select result.status from extensions.dblink('award_member_reader', $sql$
  select status from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'
$sql$) as result(status text)), 'active', 'the central version remains unchanged');

select extensions.dblink_exec('award_member_writer', $sql$
  insert into public.business_memberships (business_id, user_id, role)
  values ('b1340000-0000-4000-8000-000000000001', 'a1340000-0000-4000-8000-000000000001', 'owner')
$sql$);
select extensions.dblink_exec('award_member_reader',
  $$set local "request.jwt.claim.sub" = 'a1340000-0000-4000-8000-000000000001'$$);
select extensions.is((select result.count from extensions.dblink('award_member_reader', $sql$
  select count(*)::int from public.award_central_versions
  where id = 'a1310000-0000-4000-8000-000000000003'
$sql$) as result(count int)), 1, 'a newly committed membership restores access on the next statement');
select extensions.is(extensions.dblink_exec('award_member_reader', 'commit'), 'COMMIT',
  'the read-committed reader completes successfully');

select extensions.dblink_disconnect('award_member_reader');
select extensions.dblink_disconnect('award_member_writer');
select * from extensions.finish();
rollback;
