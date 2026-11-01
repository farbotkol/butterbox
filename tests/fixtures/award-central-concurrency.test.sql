-- Run only as a database operator on the verified disposable project after
-- award-central-pre-gate.sql and the regression-evidence migration.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
begin;
set local search_path = public, extensions;
set local statement_timeout = '15s';
select plan(9);

select extensions.dblink_connect_u('award_lock', 'dbname=postgres user=postgres application_name=award_case_lock');
select extensions.dblink_connect_u('award_insert', 'dbname=postgres user=postgres application_name=award_case_insert');
select extensions.dblink_connect_u('award_duplicate', 'dbname=postgres user=postgres application_name=award_case_duplicate');
select extensions.dblink_exec('award_lock', 'begin');
select extensions.dblink_exec('award_lock', $sql$
  update public.award_central_versions set rule_proposal = '{"synthetic":"concurrent revision"}'
  where id = 'a1310000-0000-4000-8000-000000000004'
$sql$);
select is(extensions.dblink_send_query('award_insert', $sql$
  insert into public.award_central_regression_candidates
    (id, version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1320000-0000-4000-8000-000000000001', 'a1310000-0000-4000-8000-000000000004',
    'concurrency-case', 'midnight', 'human', 'test-proposer', '{"synthetic":true}', '["test clause"]')
  returning id
$sql$), 1, 'candidate insertion starts concurrently with a version update');
do $$
begin
  for attempt in 1..100 loop
    perform pg_stat_clear_snapshot();
    exit when exists (select 1 from pg_stat_activity
      where wait_event_type = 'Lock' and application_name = 'award_case_insert');
    perform pg_sleep(0.05);
  end loop;
end;
$$;
select pg_stat_clear_snapshot();
select ok(exists (select 1 from pg_stat_activity
  where wait_event_type = 'Lock' and application_name = 'award_case_insert'),
  'candidate insertion waits for the concurrent version update');
select is(extensions.dblink_exec('award_lock', 'commit'), 'COMMIT',
  'the version update commits before candidate capture');
create temporary table award_concurrency_result (id uuid);
insert into award_concurrency_result
select * from extensions.dblink_get_result('award_insert') as result(id uuid);
select is((select count(*)::int from award_concurrency_result), 1,
  'the waiting candidate is inserted after the update');
select is((select version_content_sha256 from public.award_central_regression_candidates
  where id = 'a1320000-0000-4000-8000-000000000001'),
  public.award_central_version_content_hash('a1310000-0000-4000-8000-000000000004'),
  'the inserted candidate fingerprints the committed version, not stale content');

select extensions.dblink_exec('award_lock', 'begin');
select extensions.dblink_exec('award_lock', $sql$
  insert into public.award_central_regression_candidates
    (id, version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1320000-0000-4000-8000-000000000002', 'a1310000-0000-4000-8000-000000000004',
    'concurrent-duplicate', 'breaks', 'human', 'test-proposer', '{"synthetic":true}', '["test clause"]')
$sql$);
select is(extensions.dblink_send_query('award_duplicate', $sql$
  insert into public.award_central_regression_candidates
    (id, version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1320000-0000-4000-8000-000000000003', 'a1310000-0000-4000-8000-000000000004',
    'concurrent-duplicate', 'breaks', 'human', 'test-proposer', '{"synthetic":true}', '["test clause"]')
  returning id
$sql$), 1, 'a duplicate candidate insert starts concurrently');
do $$
begin
  for attempt in 1..100 loop
    perform pg_stat_clear_snapshot();
    exit when exists (select 1 from pg_stat_activity
      where wait_event_type = 'Lock' and application_name = 'award_case_duplicate');
    perform pg_sleep(0.05);
  end loop;
end;
$$;
select pg_stat_clear_snapshot();
select ok(exists (select 1 from pg_stat_activity
  where wait_event_type = 'Lock' and application_name = 'award_case_duplicate'),
  'the concurrent duplicate waits for the first insert');
select extensions.dblink_exec('award_lock', 'commit');
select * from extensions.dblink_get_result('award_duplicate', false) as result(id uuid);
select ok(position('duplicate key value' in extensions.dblink_error_message('award_duplicate')) > 0,
  'the concurrent duplicate is rejected rather than silently accepted');
select is((select count(*)::int from public.award_central_regression_candidates
  where version_id = 'a1310000-0000-4000-8000-000000000004' and case_key = 'concurrent-duplicate'), 1,
  'only one immutable candidate exists after concurrent duplicate insertion');

select extensions.dblink_disconnect('award_lock');
select extensions.dblink_disconnect('award_insert');
select extensions.dblink_disconnect('award_duplicate');
select * from finish();
rollback;
