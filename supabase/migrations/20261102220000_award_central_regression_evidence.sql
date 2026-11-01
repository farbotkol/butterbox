-- Regression evidence is central, append-only staging data, not a payroll result.
create function public.award_central_valid_clause_references(references_json jsonb)
returns boolean
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(references_json) <> 'array' then false
    when jsonb_array_length(references_json) not between 1 and 50 then false
    else not exists (
      select 1 from jsonb_array_elements(references_json) as item(value)
      where jsonb_typeof(item.value) <> 'string'
        or length(btrim(item.value #>> '{}')) not between 1 and 240
    )
  end;
$$;

-- This digest identifies the precise draft content against which a case was
-- recorded. It is not a specialist signature or a publication approval.
create function public.award_central_version_content_hash(award_version_id uuid)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'instrument_id', version.instrument_id,
    'version_label', version.version_label,
    'effective_from', version.effective_from,
    'effective_until', version.effective_until,
    'source_snapshot_id', version.source_snapshot_id,
    'source_url', version.source_url,
    'source_sha256', version.source_sha256,
    'retrieved_at_epoch', extract(epoch from version.retrieved_at),
    'source_clause_refs', version.source_clause_refs,
    'rule_proposal', version.rule_proposal
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.award_central_versions as version
  where version.id = award_version_id;
$$;

create function public.award_central_regression_coverage_areas()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    'penalties', 'overtime', 'allowances', 'breaks', 'holidays',
    'classifications', 'interactions', 'dst', 'midnight',
    'minimum_engagement', 'cumulative_hours', 'effective_dates'
  ]::text[];
$$;

create table public.award_central_regression_candidates (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.award_central_versions(id) on delete restrict,
  source_snapshot_id uuid not null references public.award_central_source_snapshots(id) on delete restrict,
  version_content_sha256 text not null check (version_content_sha256 ~ '^[0-9a-f]{64}$'),
  case_key text not null check (case_key ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  coverage_area text not null check (coverage_area = any(public.award_central_regression_coverage_areas())),
  origin text not null check (origin in ('human', 'ai')),
  proposer_reference text not null check (length(btrim(proposer_reference)) between 1 and 200),
  model_reference text check (model_reference is null or length(btrim(model_reference)) between 1 and 200),
  scenario_input jsonb not null check (
    jsonb_typeof(scenario_input) = 'object'
    and scenario_input <> '{}'::jsonb
    and octet_length(scenario_input::text) <= 65536
  ),
  source_clause_refs jsonb not null check (public.award_central_valid_clause_references(source_clause_refs)),
  unresolved_reason text check (unresolved_reason is null or length(btrim(unresolved_reason)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  unique (version_id, case_key),
  check ((origin = 'human' and model_reference is null) or (origin = 'ai' and model_reference is not null))
);

create function public.capture_award_regression_candidate_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  version_row public.award_central_versions%rowtype;
begin
  select * into version_row
  from public.award_central_versions
  where id = new.version_id
  for share;

  if not found or version_row.source_snapshot_id is null then
    raise exception 'Regression candidates require a version with an immutable source snapshot';
  end if;
  if version_row.status not in ('draft', 'pending_review') then
    raise exception 'Regression candidates can only be staged against an unpublished version';
  end if;

  new.source_snapshot_id := version_row.source_snapshot_id;
  new.version_content_sha256 := public.award_central_version_content_hash(new.version_id);
  return new;
end;
$$;

create trigger award_central_regression_candidate_capture_version
  before insert on public.award_central_regression_candidates
  for each row execute function public.capture_award_regression_candidate_version();

-- Claimed human references are not authenticated specialist identities.
-- These rows are draft evidence only until a separate governed review exists.
create table public.award_central_regression_expectations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.award_central_regression_candidates(id) on delete restrict,
  source_snapshot_id uuid not null references public.award_central_source_snapshots(id) on delete restrict,
  method text not null check (method in ('independent_manual', 'independent_reference')),
  preparer_reference text not null check (length(btrim(preparer_reference)) between 1 and 200),
  reviewer_reference text not null check (length(btrim(reviewer_reference)) between 1 and 200),
  source_clause_refs jsonb not null check (public.award_central_valid_clause_references(source_clause_refs)),
  expected_output jsonb not null check (
    jsonb_typeof(expected_output) = 'object'
    and expected_output <> '{}'::jsonb
    and octet_length(expected_output::text) <= 65536
  ),
  coverage_limitations text not null check (length(btrim(coverage_limitations)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  check (lower(btrim(preparer_reference)) <> lower(btrim(reviewer_reference)))
);

create index award_central_regression_expectations_candidate
  on public.award_central_regression_expectations(candidate_id);

create function public.enforce_award_regression_expectation_separation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  proposer text;
begin
  select proposer_reference into proposer
  from public.award_central_regression_candidates
  where id = new.candidate_id;

  if not found then
    raise exception 'Regression expectation requires an existing candidate';
  end if;
  if lower(btrim(proposer)) in (lower(btrim(new.preparer_reference)), lower(btrim(new.reviewer_reference))) then
    raise exception 'Regression expectation preparer and reviewer must be separate from the case proposer';
  end if;
  return new;
end;
$$;

create trigger award_central_regression_expectation_separation
  before insert on public.award_central_regression_expectations
  for each row execute function public.enforce_award_regression_expectation_separation();

-- A draft report is not validation evidence and can never authorise publication.
create function public.award_central_regression_draft_issues(award_version_id uuid)
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
    select 1 from public.award_central_regression_candidates as candidate
    where candidate.version_id = award_version_id and candidate.coverage_area = required.area
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

create function public.prevent_award_regression_evidence_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Award Central regression evidence is append-only';
end;
$$;

create trigger award_central_regression_candidates_immutable
  before update or delete on public.award_central_regression_candidates
  for each row execute function public.prevent_award_regression_evidence_mutation();
create trigger award_central_regression_expectations_immutable
  before update or delete on public.award_central_regression_expectations
  for each row execute function public.prevent_award_regression_evidence_mutation();

alter table public.award_central_regression_candidates enable row level security;
alter table public.award_central_regression_expectations enable row level security;
revoke all on public.award_central_regression_candidates, public.award_central_regression_expectations
  from public, anon, authenticated, service_role;
revoke all on function public.award_central_valid_clause_references(jsonb),
  public.award_central_version_content_hash(uuid),
  public.award_central_regression_coverage_areas(),
  public.capture_award_regression_candidate_version(),
  public.enforce_award_regression_expectation_separation(),
  public.award_central_regression_draft_issues(uuid),
  public.prevent_award_regression_evidence_mutation()
  from public, anon, authenticated, service_role;

-- No trusted test runner, authenticated specialist signoff or complete
-- coverage gate exists yet. Even privileged operators must not activate new
-- versions through the foundation's provisional review transition.
create function public.block_unvalidated_award_publication()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status in ('draft', 'pending_review')
     and new.status in ('approved', 'active', 'superseded') then
    raise exception 'Award Central publication is disabled until independent validation and approval are implemented';
  end if;
  return new;
end;
$$;

create trigger award_central_version_publication_block
  before update of status on public.award_central_versions
  for each row execute function public.block_unvalidated_award_publication();
revoke all on function public.block_unvalidated_award_publication()
  from public, anon, authenticated, service_role;

comment on table public.award_central_regression_candidates is
  'Immutable, privileged-only draft scenarios; not validated golden cases and never customer payroll inputs.';
comment on table public.award_central_regression_expectations is
  'Immutable, separately entered draft expected outputs. Claimed identities and references are not verified specialist signoff.';
