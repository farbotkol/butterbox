create table public.roster_publications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  week_start date not null check (isfinite(week_start) and extract(isodow from week_start) = 1),
  venue_timezone text not null,
  version integer not null check (version > 0),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default clock_timestamp(),
  new_shift_count integer not null check (new_shift_count > 0),
  shift_count integer not null check (shift_count >= 0),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id) on delete cascade,
  unique (business_id, venue_id, department_id, week_start, version)
);

create table public.roster_publication_shifts (
  publication_id uuid not null references public.roster_publications (id) on delete cascade,
  shift_id uuid not null,
  employee_id uuid,
  role_title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null,
  primary key (publication_id, shift_id)
);

create index roster_publications_scope_idx
  on public.roster_publications (business_id, venue_id, department_id, week_start, version desc);
create trigger roster_publications_business_id_immutable
  before update of business_id on public.roster_publications
  for each row execute function public.prevent_business_id_change();

alter table public.roster_publications enable row level security;
alter table public.roster_publication_shifts enable row level security;
create policy "Managers can view their roster publication history"
  on public.roster_publications for select to authenticated
  using (public.can_manage_department(business_id, department_id));
create policy "Managers can view their roster publication snapshots"
  on public.roster_publication_shifts for select to authenticated
  using (exists (
    select 1 from public.roster_publications p
    where p.id = publication_id
      and public.can_manage_department(p.business_id, p.department_id)
  ));

revoke all on public.roster_publications, public.roster_publication_shifts
  from public, anon, authenticated;
grant select on public.roster_publications, public.roster_publication_shifts to authenticated;

create function public.record_roster_publications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope record;
  v_publication_id uuid;
  v_version integer;
  v_shift_count integer;
begin
  for v_scope in
    select n.business_id, n.venue_id, n.department_id, v.timezone,
      date_trunc('week', n.starts_at at time zone v.timezone)::date as week_start,
      count(*)::integer as new_shift_count
    from new_roster_shifts n
    join old_roster_shifts o on o.id = n.id
    join public.venues v on v.id = n.venue_id and v.business_id = n.business_id
    where n.is_published and not o.is_published and n.status = 'scheduled'
    group by n.business_id, n.venue_id, n.department_id, v.timezone,
      date_trunc('week', n.starts_at at time zone v.timezone)::date
    order by n.business_id, n.venue_id, n.department_id, week_start
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'roster-publication:' || v_scope.department_id::text || ':' || v_scope.week_start::text, 0
    ));
    select coalesce(max(version), 0) + 1 into v_version
    from public.roster_publications p
    where p.business_id = v_scope.business_id and p.venue_id = v_scope.venue_id
      and p.department_id = v_scope.department_id and p.week_start = v_scope.week_start;

    insert into public.roster_publications (
      business_id, venue_id, department_id, week_start, venue_timezone, version,
      published_by, new_shift_count, shift_count
    )
    values (
      v_scope.business_id, v_scope.venue_id, v_scope.department_id, v_scope.week_start,
      v_scope.timezone, v_version, auth.uid(), v_scope.new_shift_count, 0
    )
    returning id into v_publication_id;

    insert into public.roster_publication_shifts (
      publication_id, shift_id, employee_id, role_title, starts_at, ends_at, break_minutes
    )
    select v_publication_id, s.id, s.employee_id, s.role_title, s.starts_at, s.ends_at, s.break_minutes
    from public.shifts s
    where s.business_id = v_scope.business_id and s.venue_id = v_scope.venue_id
      and s.department_id = v_scope.department_id and s.status = 'scheduled'
      and s.is_published
      and (s.starts_at at time zone v_scope.timezone)::date
        between v_scope.week_start and v_scope.week_start + 6;
    get diagnostics v_shift_count = row_count;
    update public.roster_publications set shift_count = v_shift_count
    where id = v_publication_id;
  end loop;
  return null;
end;
$$;

revoke all on function public.record_roster_publications() from public, anon, authenticated;
create trigger shifts_record_roster_publications
  after update on public.shifts
  referencing old table as old_roster_shifts new table as new_roster_shifts
  for each statement execute function public.record_roster_publications();
