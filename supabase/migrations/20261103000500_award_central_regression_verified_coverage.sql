create or replace function public.award_central_regression_draft_issues(award_version_id uuid)
returns table (issue_code text, candidate_id uuid, coverage_area text)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  current_version_hash text;
begin
  current_version_hash := public.award_central_version_content_hash(award_version_id);
  if current_version_hash is null then
    raise exception 'Regression draft report requires an existing award version';
  end if;

  return query
  with required_areas as (
    select unnest(public.award_central_regression_coverage_areas()) as area
  )
  select 'missing_coverage'::text, null::uuid, required.area
  from required_areas as required
  where not exists (
    select 1
    from public.award_central_regression_candidates as candidate
    where candidate.version_id = award_version_id
      and candidate.coverage_area = required.area
      and candidate.unresolved_reason is null
      and candidate.version_content_sha256 = current_version_hash
      and exists (
        select 1
        from public.award_central_regression_expectations as expectation
        where expectation.candidate_id = candidate.id
      )
      and 1 >= (
        select count(distinct expectation.expected_output)
        from public.award_central_regression_expectations as expectation
        where expectation.candidate_id = candidate.id
      )
  )
  union all
  select 'missing_expectation'::text, candidate.id, candidate.coverage_area
  from public.award_central_regression_candidates as candidate
  where candidate.version_id = award_version_id
    and not exists (
      select 1 from public.award_central_regression_expectations as expectation
      where expectation.candidate_id = candidate.id
    )
  union all
  select 'conflicting_expectations'::text, candidate.id, candidate.coverage_area
  from public.award_central_regression_candidates as candidate
  where candidate.version_id = award_version_id
    and (
      select count(distinct expectation.expected_output)
      from public.award_central_regression_expectations as expectation
      where expectation.candidate_id = candidate.id
    ) > 1
  union all
  select 'unresolved_case'::text, candidate.id, candidate.coverage_area
  from public.award_central_regression_candidates as candidate
  where candidate.version_id = award_version_id and candidate.unresolved_reason is not null
  union all
  select 'stale_case'::text, candidate.id, candidate.coverage_area
  from public.award_central_regression_candidates as candidate
  where candidate.version_id = award_version_id
    and candidate.version_content_sha256 is distinct from current_version_hash;
end;
$$;
