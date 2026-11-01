-- BB-PAYRULES-002 foundation: central award catalogue, not a payroll calculator.
-- Only migration/privileged database operators may publish rules. No tenant write grants.
create table public.award_central_instruments (
  id uuid primary key default gen_random_uuid(),
  instrument_code text not null unique check (length(trim(instrument_code)) between 3 and 80),
  instrument_name text not null check (length(trim(instrument_name)) between 3 and 240),
  authority text not null default 'Fair Work Commission',
  created_at timestamptz not null default clock_timestamp()
);

create table public.award_central_versions (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.award_central_instruments(id),
  version_label text not null check (length(trim(version_label)) between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'approved', 'active', 'superseded')),
  effective_from date not null,
  effective_until date,
  source_url text not null check (source_url ~ '^https://'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  retrieved_at timestamptz not null,
  source_clause_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_clause_refs) = 'array'),
  rule_proposal jsonb not null default '{}'::jsonb
    check (jsonb_typeof(rule_proposal) = 'object'),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  reviewed_by text,
  reviewed_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (instrument_id, version_label),
  check (effective_until is null or effective_until >= effective_from),
  check (status not in ('approved', 'active', 'superseded')
    or (reviewed_by is not null and reviewed_at is not null)),
  check (status <> 'active' or activated_at is not null)
);

create index award_central_versions_active_lookup
  on public.award_central_versions(instrument_id, effective_from, effective_until)
  where status = 'active';

-- Published versions are never edited in place, even by privileged database roles.
-- Supersession is represented by an additional version and controlled status
-- transition of an existing active version only.
create function public.guard_award_central_version_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New Award Central versions must enter as drafts';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Award Central versions cannot be deleted';
  end if;
  if old.status in ('approved', 'superseded') then
    raise exception 'Approved Award Central versions are immutable';
  end if;
  if old.status = 'active' then
    if new.status <> 'superseded'
       or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'Active Award Central version can only be superseded';
    end if;
    return new;
  end if;
  if new.status in ('approved', 'active', 'superseded')
     and old.status <> 'pending_review' then
    raise exception 'Award Central publication requires review state';
  end if;
  if new.status = 'active' and old.status <> 'pending_review' then
    raise exception 'Award Central activation requires review state';
  end if;
  return new;
end;
$$;

create trigger award_central_version_guard
  before insert or update or delete on public.award_central_versions
  for each row execute function public.guard_award_central_version_mutation();

alter table public.award_central_instruments enable row level security;
alter table public.award_central_versions enable row level security;

revoke all on public.award_central_instruments, public.award_central_versions
  from public, anon, authenticated, service_role;
revoke all on function public.guard_award_central_version_mutation()
  from public, anon, authenticated, service_role;

-- Customers may read the shared catalogue, but never draft/proposed rules.
-- Neither table contains tenant data or a tenant-owned copy of an award.
create policy "Authenticated users read central instruments"
  on public.award_central_instruments for select to authenticated
  using (true);
create policy "Authenticated users read active central versions"
  on public.award_central_versions for select to authenticated
  using (status = 'active');
grant select on public.award_central_instruments, public.award_central_versions
  to authenticated;

comment on table public.award_central_versions is
  'Unverified schema foundation only. Do not activate versions or use for payroll without specialist-reviewed publication, validation, provenance and impact workflows.';
