begin;
select plan(60);

select has_table('public', 'award_central_regression_candidates', 'central regression candidate staging exists');
select has_table('public', 'award_central_regression_expectations', 'independent expected outputs are stored separately');
select is((select relrowsecurity from pg_class where oid = 'public.award_central_regression_candidates'::regclass),
  true, 'candidate RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'public.award_central_regression_expectations'::regclass),
  true, 'expectation RLS is enabled');
select ok(not has_table_privilege('authenticated', 'public.award_central_regression_candidates', 'SELECT'),
  'customers cannot read staged regression candidates');
select ok(not has_table_privilege('authenticated', 'public.award_central_regression_expectations', 'INSERT'),
  'customers cannot create expected outputs');
select ok(not has_table_privilege('anon', 'public.award_central_regression_candidates', 'SELECT'),
  'anonymous callers cannot read regression candidates');
select ok(not has_table_privilege('anon', 'public.award_central_regression_expectations', 'SELECT'),
  'anonymous callers cannot read expected outputs');
select ok(not has_table_privilege('service_role', 'public.award_central_regression_candidates', 'INSERT'),
  'ingestion service cannot create regression candidates');
select ok(not has_table_privilege('service_role', 'public.award_central_regression_expectations', 'INSERT'),
  'AI or ingestion service cannot create expected outputs');

insert into public.award_central_source_snapshots
  (id, source_identity, source_kind, source_url, retrieved_at, content_type, content_bytes)
values
  ('a1300000-0000-4000-8000-000000000001', 'synthetic-regression-source', 'award_instrument',
   'https://www.fwc.gov.au/synthetic-regression', '2026-01-01 00:00:00+00', 'text/plain',
   convert_to('synthetic regression fixture; not an official source', 'UTF8')),
  ('a1300000-0000-4000-8000-000000000002', 'synthetic-other-source', 'award_instrument',
   'https://www.fwc.gov.au/synthetic-other', '2026-01-02 00:00:00+00', 'text/plain',
   convert_to('other synthetic fixture', 'UTF8'));
insert into public.award_central_instruments (id, instrument_code, instrument_name)
values ('a1300000-0000-4000-8000-000000000003', 'TEST-1300', 'Synthetic regression instrument');
insert into public.award_central_versions (
  id, instrument_id, version_label, effective_from, source_url, source_sha256, retrieved_at,
  source_snapshot_id, source_clause_refs, rule_proposal
) values (
  'a1300000-0000-4000-8000-000000000004', 'a1300000-0000-4000-8000-000000000003',
  'draft-v1', '2026-07-01', 'https://www.fwc.gov.au/synthetic-regression',
  encode(extensions.digest(convert_to('synthetic regression fixture; not an official source', 'UTF8'), 'sha256'), 'hex'),
  '2026-01-01 00:00:00+00', 'a1300000-0000-4000-8000-000000000001',
  '["synthetic clause"]', '{"kind":"synthetic"}'
);
select is((select count(*)::int from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004') where issue_code = 'missing_coverage'), 12,
  'a draft without cases reports every missing coverage area');
select throws_ok($$select * from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000099')$$, 'P0001',
  'Regression draft report requires an existing award version', 'a report requires a real version');

insert into public.award_central_regression_candidates (
  id, version_id, source_snapshot_id, version_content_sha256, case_key, coverage_area,
  origin, proposer_reference, model_reference, scenario_input, source_clause_refs, unresolved_reason
) values (
  'a1300000-0000-4000-8000-000000000005', 'a1300000-0000-4000-8000-000000000004',
  'a1300000-0000-4000-8000-000000000002', repeat('0', 64), 'synthetic-dst', 'dst',
  'ai', 'proposer-1', 'synthetic-model-v1', '{"hours":"synthetic"}', '["synthetic clause"]',
  'Synthetic unresolved critical case'
);
select is(length(public.award_central_version_content_hash('a1300000-0000-4000-8000-000000000004')),
  64, 'the draft content receives a SHA-256 fingerprint');
select is((select source_snapshot_id from public.award_central_regression_candidates
  where id = 'a1300000-0000-4000-8000-000000000005'),
  'a1300000-0000-4000-8000-000000000001'::uuid, 'the database captures the version source instead of trusting input');
select is((select version_content_sha256 from public.award_central_regression_candidates
  where id = 'a1300000-0000-4000-8000-000000000005'),
  public.award_central_version_content_hash('a1300000-0000-4000-8000-000000000004'),
  'the database captures the rule fingerprint instead of trusting input');
set local time zone 'Australia/Sydney';
select is((select version_content_sha256 from public.award_central_regression_candidates
  where id = 'a1300000-0000-4000-8000-000000000005'),
  public.award_central_version_content_hash('a1300000-0000-4000-8000-000000000004'),
  'version fingerprints are stable across database session time zones');
set local time zone 'UTC';
select is((select model_reference from public.award_central_regression_candidates
  where id = 'a1300000-0000-4000-8000-000000000005'), 'synthetic-model-v1',
  'AI candidate model provenance is retained');
select is((select count(*)::int from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004') where issue_code = 'missing_coverage'), 12,
  'a candidate without expected output cannot satisfy coverage');
select is((select count(*)::int from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004') where issue_code = 'missing_expectation'), 1,
  'the draft report identifies candidates with no expected output');
select is((select count(*)::int from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004') where issue_code = 'unresolved_case'), 1,
  'the draft report identifies explicitly unresolved cases');

select throws_ok($$insert into public.award_central_regression_candidates
  (version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1300000-0000-4000-8000-000000000004', 'missing-model', 'dst', 'ai', 'p', '{"x":1}', '["clause"]')$$,
  '23514', null, 'AI candidates require model provenance');
select throws_ok($$insert into public.award_central_regression_candidates
  (version_id, case_key, coverage_area, origin, proposer_reference, model_reference, scenario_input, source_clause_refs)
  values ('a1300000-0000-4000-8000-000000000004', 'human-model', 'dst', 'human', 'p', 'model', '{"x":1}', '["clause"]')$$,
  '23514', null, 'human candidates cannot masquerade as model-generated');
select throws_ok($$insert into public.award_central_regression_candidates
  (version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1300000-0000-4000-8000-000000000004', 'bad-area', 'unsupported', 'human', 'p', '{"x":1}', '["clause"]')$$,
  '23514', null, 'unsupported coverage areas are rejected');
select throws_ok($$insert into public.award_central_regression_candidates
  (version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1300000-0000-4000-8000-000000000004', 'empty-input', 'breaks', 'human', 'p', '{}', '["clause"]')$$,
  '23514', null, 'empty scenario inputs are rejected');
select throws_ok($$insert into public.award_central_regression_candidates
  (version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1300000-0000-4000-8000-000000000004', 'empty-citations', 'breaks', 'human', 'p', '{"x":1}', '[]')$$,
  '23514', null, 'scenarios require clause references');
select throws_ok($$insert into public.award_central_regression_candidates
  (version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1300000-0000-4000-8000-000000000004', 'bad-citations', 'breaks', 'human', 'p', '{"x":1}', '[12]')$$,
  '23514', null, 'clause references must be nonempty strings');
select throws_ok($$insert into public.award_central_regression_candidates
  (version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1300000-0000-4000-8000-000000000004', 'synthetic-dst', 'breaks', 'human', 'p', '{"x":1}', '["clause"]')$$,
  '23505', null, 'candidate keys are unique within a version');
select throws_ok($$insert into public.award_central_regression_candidates
  (version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1300000-0000-4000-8000-000000000099', 'missing-version', 'breaks', 'human', 'p', '{"x":1}', '["clause"]')$$,
  'P0001', 'Regression candidates require a version with an immutable source snapshot',
  'candidates require a real version and source');
insert into public.award_central_versions (
  id, instrument_id, version_label, effective_from, source_url, source_sha256, retrieved_at, source_snapshot_id
) values (
  'a1300000-0000-4000-8000-000000000009', 'a1300000-0000-4000-8000-000000000003',
  'synthetic-missing-source', '2026-07-01', 'https://www.fwc.gov.au/synthetic-regression',
  encode(extensions.digest(convert_to('synthetic regression fixture; not an official source', 'UTF8'), 'sha256'), 'hex'),
  '2026-01-01 00:00:00+00', 'a1300000-0000-4000-8000-000000000001'
);
update public.award_central_versions set source_snapshot_id = null
  where id = 'a1300000-0000-4000-8000-000000000009';
select throws_ok($$insert into public.award_central_regression_candidates
  (version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
  values ('a1300000-0000-4000-8000-000000000009', 'missing-source', 'breaks', 'human', 'p', '{"x":1}', '["clause"]')$$,
  'P0001', 'Regression candidates require a version with an immutable source snapshot',
  'versions without retained source artifacts cannot receive regression candidates');

select throws_ok($$insert into public.award_central_regression_expectations
  (candidate_id, source_snapshot_id, method, preparer_reference, reviewer_reference, source_clause_refs,
   expected_output, coverage_limitations)
  values ('a1300000-0000-4000-8000-000000000005', 'a1300000-0000-4000-8000-000000000001',
   'independent_manual', ' Proposer-1 ', 'reviewer', '["clause"]', '{"value":1}', 'synthetic only')$$,
  'P0001', 'Regression expectation preparer and reviewer must be separate from the case proposer',
  'the case proposer cannot prepare expected output');
select throws_ok($$insert into public.award_central_regression_expectations
  (candidate_id, source_snapshot_id, method, preparer_reference, reviewer_reference, source_clause_refs,
   expected_output, coverage_limitations)
  values ('a1300000-0000-4000-8000-000000000005', 'a1300000-0000-4000-8000-000000000001',
   'independent_manual', 'preparer', ' PROPOSER-1 ', '["clause"]', '{"value":1}', 'synthetic only')$$,
  'P0001', 'Regression expectation preparer and reviewer must be separate from the case proposer',
  'the case proposer cannot review expected output');
select throws_ok($$insert into public.award_central_regression_expectations
  (candidate_id, source_snapshot_id, method, preparer_reference, reviewer_reference, source_clause_refs,
   expected_output, coverage_limitations)
  values ('a1300000-0000-4000-8000-000000000005', 'a1300000-0000-4000-8000-000000000001',
   'independent_manual', 'person', ' PERSON ', '["clause"]', '{"value":1}', 'synthetic only')$$,
  '23514', null, 'preparer and reviewer references must differ');
select throws_ok($$insert into public.award_central_regression_expectations
  (candidate_id, source_snapshot_id, method, preparer_reference, reviewer_reference, source_clause_refs,
   expected_output, coverage_limitations)
  values ('a1300000-0000-4000-8000-000000000005', 'a1300000-0000-4000-8000-000000000001',
   'ai', 'preparer', 'reviewer', '["clause"]', '{"value":1}', 'synthetic only')$$,
  '23514', null, 'AI-generated expected results cannot claim independent provenance');
select throws_ok($$insert into public.award_central_regression_expectations
  (candidate_id, source_snapshot_id, method, preparer_reference, reviewer_reference, source_clause_refs,
   expected_output, coverage_limitations)
  values ('a1300000-0000-4000-8000-000000000005', 'a1300000-0000-4000-8000-000000000001',
   'independent_manual', 'preparer', 'reviewer', '["clause"]', '{}', 'synthetic only')$$,
  '23514', null, 'empty expected outputs are rejected');
select throws_ok($$insert into public.award_central_regression_expectations
  (candidate_id, source_snapshot_id, method, preparer_reference, reviewer_reference, source_clause_refs,
   expected_output, coverage_limitations)
  values ('a1300000-0000-4000-8000-000000000099', 'a1300000-0000-4000-8000-000000000001',
   'independent_manual', 'preparer', 'reviewer', '["clause"]', '{"value":1}', 'synthetic only')$$,
  'P0001', 'Regression expectation requires an existing candidate', 'expectations require a real candidate');

insert into public.award_central_regression_expectations (
  id, candidate_id, source_snapshot_id, method, preparer_reference, reviewer_reference,
  source_clause_refs, expected_output, coverage_limitations
) values
  ('a1300000-0000-4000-8000-000000000006', 'a1300000-0000-4000-8000-000000000005',
   'a1300000-0000-4000-8000-000000000001', 'independent_manual', 'preparer-1', 'reviewer-1',
   '["synthetic clause"]', '{"value":1}', 'synthetic fixture only'),
  ('a1300000-0000-4000-8000-000000000007', 'a1300000-0000-4000-8000-000000000005',
   'a1300000-0000-4000-8000-000000000001', 'independent_reference', 'preparer-2', 'reviewer-2',
   '["synthetic clause"]', '{"value":2}', 'synthetic conflicting fixture');
select is((select coverage_limitations from public.award_central_regression_expectations
  where id = 'a1300000-0000-4000-8000-000000000006'), 'synthetic fixture only',
  'expectations retain their declared coverage limitations');
select is((select count(distinct expected_output)::int from public.award_central_regression_expectations
  where candidate_id = 'a1300000-0000-4000-8000-000000000005'), 2,
  'contradictory proposed expectations are retained, not silently overwritten');
select is((select count(*)::int from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004') where issue_code = 'conflicting_expectations'), 1,
  'the draft report identifies contradictory expected outputs');
select is((select count(*)::int from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004') where issue_code = 'missing_expectation'), 0,
  'a candidate with proposed expectations is not reported as missing them');
select throws_ok($$update public.award_central_regression_candidates set case_key = 'changed'
  where id = 'a1300000-0000-4000-8000-000000000005'$$, 'P0001',
  'Award Central regression evidence is append-only', 'candidates cannot be rewritten');
select throws_ok($$delete from public.award_central_regression_candidates
  where id = 'a1300000-0000-4000-8000-000000000005'$$, 'P0001',
  'Award Central regression evidence is append-only', 'candidates cannot be deleted');
select throws_ok($$update public.award_central_regression_expectations set expected_output = '{"value":3}'
  where id = 'a1300000-0000-4000-8000-000000000006'$$, 'P0001',
  'Award Central regression evidence is append-only', 'expected outputs cannot be rewritten');
select throws_ok($$delete from public.award_central_regression_expectations
  where id = 'a1300000-0000-4000-8000-000000000006'$$, 'P0001',
  'Award Central regression evidence is append-only', 'expected outputs cannot be deleted');

update public.award_central_versions set rule_proposal = '{"kind":"changed synthetic rule"}'
  where id = 'a1300000-0000-4000-8000-000000000004';
select isnt((select version_content_sha256 from public.award_central_regression_candidates
  where id = 'a1300000-0000-4000-8000-000000000005'),
  public.award_central_version_content_hash('a1300000-0000-4000-8000-000000000004'),
  'a changed draft no longer matches earlier case evidence');
select is((select count(*)::int from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004') where issue_code = 'stale_case'), 1,
  'the draft report identifies evidence bound to an earlier rule fingerprint');
insert into public.award_central_regression_candidates
  (id, version_id, case_key, coverage_area, origin, proposer_reference, scenario_input, source_clause_refs)
values ('a1300000-0000-4000-8000-000000000008', 'a1300000-0000-4000-8000-000000000004',
  'revised-case', 'effective_dates', 'human', 'other-proposer', '{"x":2}', '["synthetic clause"]');
select is((select version_content_sha256 from public.award_central_regression_candidates
  where id = 'a1300000-0000-4000-8000-000000000008'),
  public.award_central_version_content_hash('a1300000-0000-4000-8000-000000000004'),
  'new cases capture the revised draft fingerprint');
select is((select count(*)::int from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004') where issue_code = 'missing_coverage'), 12,
  'a case without expected output cannot satisfy an additional coverage area');
select is((select count(*)::int from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004') where issue_code = 'missing_expectation'), 1,
  'the revised case is reported until expected output is independently staged');
insert into public.award_central_regression_expectations (
  candidate_id, source_snapshot_id, method, preparer_reference, reviewer_reference,
  source_clause_refs, expected_output, coverage_limitations
) values (
  'a1300000-0000-4000-8000-000000000008',
  'a1300000-0000-4000-8000-000000000001',
  'independent_manual', 'synthetic-preparer', 'synthetic-reviewer',
  '["synthetic clause"]', '{"synthetic":true}', 'Synthetic test evidence only'
);
select is((select count(*)::int from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004') where issue_code = 'missing_coverage'), 11,
  'only current, resolved cases with independent expected output satisfy coverage');
select is((select unresolved_reason from public.award_central_regression_candidates
  where id = 'a1300000-0000-4000-8000-000000000005'), 'Synthetic unresolved critical case',
  'unresolved candidate limitations are preserved');
update public.award_central_versions set status = 'pending_review'
  where id = 'a1300000-0000-4000-8000-000000000004';
select throws_ok($$update public.award_central_versions
  set status = 'active', reviewed_by = 'reviewer', reviewed_at = now(), activated_at = now()
  where id = 'a1300000-0000-4000-8000-000000000004'$$, 'P0001',
  'Award Central publication is disabled until independent validation and approval are implemented',
  'conflicting or unresolved staged evidence cannot activate a version');

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"sub":"a1300000-0000-4000-8000-000000000011","role":"authenticated"}', true);
end $$;
select throws_ok($$select * from public.award_central_regression_candidates$$, '42501', null,
  'the first authenticated identity cannot read central draft scenarios');
select throws_ok($$select * from public.award_central_regression_expectations$$, '42501', null,
  'the first authenticated identity cannot read central draft expected results');
select throws_ok($$select * from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004')$$, '42501', null,
  'authenticated users cannot read central draft reports');
do $$ begin
  perform set_config('request.jwt.claims', '{"sub":"a1300000-0000-4000-8000-000000000012","role":"authenticated"}', true);
end $$;
select throws_ok($$select * from public.award_central_regression_candidates$$, '42501', null,
  'a second authenticated identity cannot read central draft scenarios');
select throws_ok($$select * from public.award_central_regression_expectations$$, '42501', null,
  'a second authenticated identity cannot read central draft expected results');
select throws_ok($$insert into public.award_central_regression_expectations
  (candidate_id, source_snapshot_id, method, preparer_reference, reviewer_reference, source_clause_refs,
   expected_output, coverage_limitations)
  values ('a1300000-0000-4000-8000-000000000005', 'a1300000-0000-4000-8000-000000000001',
   'independent_manual', 'p', 'r', '["clause"]', '{"value":1}', 'none')$$,
  '42501', null, 'authenticated users cannot manufacture regression evidence');
reset role;
set local role service_role;
select throws_ok($$select * from public.award_central_regression_expectations$$, '42501', null,
  'the service role cannot read or manufacture expected results');
select throws_ok($$select * from public.award_central_regression_draft_issues(
  'a1300000-0000-4000-8000-000000000004')$$, '42501', null,
  'the service role cannot invoke the privileged draft report');
reset role;
set local role anon;
select throws_ok($$select * from public.award_central_regression_candidates$$, '42501', null,
  'anonymous callers cannot read candidate cases');
reset role;

select * from finish();
rollback;
