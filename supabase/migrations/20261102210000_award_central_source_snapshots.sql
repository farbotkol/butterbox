-- Raw official source evidence is append-only and never a payroll-ready rule.
create table public.award_central_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_identity text not null check (length(btrim(source_identity)) between 1 and 300),
  source_kind text not null
    check (source_kind in ('pay_database_api', 'award_instrument', 'variation_notice')),
  source_url text not null check (
    source_url ~* '^https://(api|developer|www)\.fwc\.gov\.au(/|[?#]|$)'
    or source_url ~* '^https://fwc\.gov\.au(/|[?#]|$)'
    or source_url ~* '^https://(www\.)?legislation\.gov\.au(/|[?#]|$)'
  ),
  retrieved_at timestamptz not null,
  effective_from date,
  effective_until date,
  source_revision text check (source_revision is null or length(btrim(source_revision)) between 1 and 120),
  content_type text not null check (content_type ~ '^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'),
  content_bytes bytea not null
    check (octet_length(content_bytes) between 1 and 26214400),
  source_sha256 text generated always as (
    encode(extensions.digest(content_bytes, 'sha256'), 'hex')
  ) stored,
  variation_references jsonb not null default '[]'::jsonb
    check (jsonb_typeof(variation_references) = 'array'),
  fields_present jsonb not null default '[]'::jsonb
    check (jsonb_typeof(fields_present) = 'array'),
  unresolved_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(unresolved_fields) = 'array'),
  status text not null default 'staged' check (status = 'staged'),
  created_at timestamptz not null default clock_timestamp(),
  unique (source_identity, source_sha256),
  check (effective_until is null or effective_from is null or effective_until >= effective_from),
  check (
    source_kind <> 'pay_database_api'
    or unresolved_fields @> '[
      "award_or_classification_applicability",
      "employee_entitlement_applicability",
      "enterprise_agreement_applicability",
      "award_variation_change_monitoring",
      "full_award_clause_interpretation"
    ]'::jsonb
  )
);

create index award_central_source_snapshots_identity
  on public.award_central_source_snapshots(source_identity, retrieved_at desc);

create function public.prevent_award_central_source_snapshot_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'Award Central source snapshots are immutable';
end;
$$;

create trigger award_central_source_snapshots_immutable
  before update or delete on public.award_central_source_snapshots
  for each row execute function public.prevent_award_central_source_snapshot_mutation();

alter table public.award_central_source_snapshots enable row level security;
revoke all on public.award_central_source_snapshots from public, anon, authenticated, service_role;
revoke all on function public.prevent_award_central_source_snapshot_mutation()
  from public, anon, authenticated, service_role;
grant select, insert on public.award_central_source_snapshots to service_role;

alter table public.award_central_versions
  add column source_snapshot_id uuid
  references public.award_central_source_snapshots(id) on delete restrict;

create function public.enforce_award_central_version_source()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  source_snapshot public.award_central_source_snapshots%rowtype;
begin
  if tg_op = 'INSERT' and new.source_snapshot_id is null then
    raise exception 'New Award Central versions require an immutable source snapshot';
  end if;
  if new.source_snapshot_id is null then
    return new;
  end if;

  select * into source_snapshot
  from public.award_central_source_snapshots
  where id = new.source_snapshot_id;
  if not found then
    raise exception 'Award Central source snapshot does not exist';
  end if;
  if new.source_url is distinct from source_snapshot.source_url
     or new.source_sha256 is distinct from source_snapshot.source_sha256
     or new.retrieved_at is distinct from source_snapshot.retrieved_at then
    raise exception 'Award Central version provenance must match its source snapshot';
  end if;
  return new;
end;
$$;

create trigger award_central_version_source_check
  before insert or update on public.award_central_versions
  for each row execute function public.enforce_award_central_version_source();
revoke all on function public.enforce_award_central_version_source()
  from public, anon, authenticated, service_role;

comment on table public.award_central_source_snapshots is
  'Immutable, service-only raw award-source evidence. Staged snapshots are not interpretations and cannot activate payroll rules.';
comment on column public.award_central_source_snapshots.unresolved_fields is
  'Fields absent from the source or not yet verified by a source-specific parser; non-empty gaps must not be silently treated as known.';
comment on column public.award_central_versions.source_snapshot_id is
  'Exact immutable source artifact used to prepare this draft version; nullable only for legacy foundation records.';
