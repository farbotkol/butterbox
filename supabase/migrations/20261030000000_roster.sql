create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
set search_path = public, extensions;

create type public.access_role as enum ('owner', 'general_manager', 'department_manager', 'employee');
create type public.roster_permission as enum ('manage_roster', 'publish_roster', 'manage_employees');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
);
create table public.business_memberships (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  role public.access_role not null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
comment on table public.business_memberships is
  'An identity may join multiple businesses. Bootstrap is explicit and returns the earliest membership.';
create index business_memberships_user_created on public.business_memberships(user_id, created_at);
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  timezone text not null default 'Australia/Melbourne',
  location text not null default '',
  unique (business_id, id)
);
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  name text not null,
  foreign key (business_id, venue_id) references public.venues(business_id, id) on delete cascade,
  unique (business_id, venue_id, id),
  unique (business_id, id)
);
create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  name text not null,
  foreign key (business_id, venue_id, department_id)
    references public.departments(business_id, venue_id, id) on delete cascade,
  unique (business_id, venue_id, department_id, id)
);
create table public.venue_memberships (
  user_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  primary key (user_id, venue_id),
  foreign key (business_id, user_id) references public.business_memberships(business_id, user_id) on delete cascade,
  foreign key (business_id, venue_id) references public.venues(business_id, id) on delete cascade,
  unique (business_id, venue_id, user_id)
);
create table public.department_memberships (
  user_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  primary key (user_id, department_id),
  foreign key (business_id, venue_id, user_id)
    references public.venue_memberships(business_id, venue_id, user_id) on delete cascade,
  foreign key (business_id, venue_id, department_id)
    references public.departments(business_id, venue_id, id) on delete cascade
);
create table public.role_permissions (
  business_id uuid not null references public.businesses(id) on delete cascade,
  role public.access_role not null,
  permission public.roster_permission not null,
  primary key (business_id, role, permission)
);
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid,
  display_name text not null,
  foreign key (business_id, user_id) references public.business_memberships(business_id, user_id),
  unique (business_id, id),
  unique (business_id, user_id)
);
create table public.employee_department_roles (
  employee_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  role_id uuid not null,
  primary key (employee_id, department_id, role_id),
  foreign key (business_id, employee_id) references public.employees(business_id, id) on delete cascade,
  foreign key (business_id, venue_id, department_id, role_id)
    references public.job_roles(business_id, venue_id, department_id, id) on delete cascade,
  unique (business_id, venue_id, department_id, role_id, employee_id)
);
create table public.roster_publications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  week_start timestamptz not null,
  week_end timestamptz not null,
  published_by uuid not null,
  published_at timestamptz not null default now(),
  shift_count integer not null check (shift_count > 0),
  foreign key (business_id, venue_id, department_id)
    references public.departments(business_id, venue_id, id),
  foreign key (business_id, published_by) references public.business_memberships(business_id, user_id),
  check (week_end > week_start and week_end - week_start <= interval '8 days'),
  unique (business_id, venue_id, department_id, id)
);
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  role_id uuid not null,
  employee_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published')),
  version integer not null default 1 check (version > 0),
  publication_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, venue_id, department_id, role_id)
    references public.job_roles(business_id, venue_id, department_id, id),
  foreign key (business_id, venue_id, department_id, role_id, employee_id)
    references public.employee_department_roles(business_id, venue_id, department_id, role_id, employee_id),
  foreign key (business_id, venue_id, department_id, publication_id)
    references public.roster_publications(business_id, venue_id, department_id, id),
  check (isfinite(starts_at) and isfinite(ends_at)
    and ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  check (break_minutes between 0 and 480 and break_minutes * interval '1 minute' < ends_at - starts_at),
  check ((status = 'published') = (publication_id is not null)),
  exclude using gist (employee_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
    where (employee_id is not null)
);
create index shifts_department_start on public.shifts (business_id, department_id, starts_at);
create index employee_roles_scope on public.employee_department_roles (business_id, venue_id, department_id);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  venue_id uuid,
  department_id uuid,
  actor_id uuid not null,
  action text not null check (action in ('save_shift', 'delete_shift', 'publish_roster', 'bootstrap_demo')),
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (business_id, actor_id) references public.business_memberships(business_id, user_id),
  foreign key (business_id, venue_id) references public.venues(business_id, id),
  foreign key (business_id, venue_id, department_id)
    references public.departments(business_id, venue_id, id),
  check (department_id is null or venue_id is not null)
);

create function private.is_owner(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_memberships
    where user_id = auth.uid() and business_id = b and role = 'owner');
$$;
create function private.has_permission(b uuid, p public.roster_permission) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_memberships m
    where m.user_id = auth.uid() and m.business_id = b and m.role <> 'employee'
    and (m.role = 'owner' or exists (select 1 from public.role_permissions rp
      where rp.business_id = b and rp.role = m.role and rp.permission = p)));
$$;
create function private.in_scope(b uuid, v uuid, d uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.venues where business_id = b and id = v)
  and (d is null or exists (select 1 from public.departments
    where business_id = b and venue_id = v and id = d))
  and exists (
    select 1 from public.business_memberships m
    where m.user_id = auth.uid() and m.business_id = b
    and (m.role = 'owner' or (
      m.role in ('general_manager', 'department_manager')
      and exists (select 1 from public.venue_memberships vm
        where vm.business_id = b and vm.venue_id = v and vm.user_id = m.user_id)
      and (m.role = 'general_manager' or d is null or exists (
        select 1 from public.department_memberships dm
        where dm.business_id = b and dm.department_id = d and dm.user_id = m.user_id)))));
$$;
create function private.own_assignment(b uuid, d uuid, e uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees emp
    join public.employee_department_roles edr on edr.employee_id = emp.id
    where emp.business_id = b and emp.user_id = auth.uid()
      and edr.department_id = d and (e is null or emp.id = e));
$$;
create function private.own_employee(e uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees where id = e and user_id = auth.uid());
$$;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

alter table public.businesses enable row level security;
alter table public.user_profiles enable row level security;
alter table public.business_memberships enable row level security;
alter table public.venues enable row level security;
alter table public.departments enable row level security;
alter table public.job_roles enable row level security;
alter table public.venue_memberships enable row level security;
alter table public.department_memberships enable row level security;
alter table public.role_permissions enable row level security;
alter table public.employees enable row level security;
alter table public.employee_department_roles enable row level security;
alter table public.shifts enable row level security;
alter table public.roster_publications enable row level security;
alter table public.audit_logs enable row level security;

create policy read_business on public.businesses for select to authenticated using (
  exists (select 1 from public.business_memberships where user_id = auth.uid() and business_id = id));
create policy read_profile on public.user_profiles for select to authenticated using (id = auth.uid());
create policy read_membership on public.business_memberships for select to authenticated using (
  user_id = auth.uid() or private.is_owner(business_id));
create policy read_venue_membership on public.venue_memberships for select to authenticated using (
  user_id = auth.uid() or private.is_owner(business_id));
create policy read_department_membership on public.department_memberships for select to authenticated using (
  user_id = auth.uid() or private.is_owner(business_id));
create policy read_permissions on public.role_permissions for select to authenticated using (
  exists (select 1 from public.business_memberships m where m.user_id = auth.uid()
    and m.business_id = role_permissions.business_id));
create policy read_venues on public.venues for select to authenticated using (
  private.in_scope(business_id, id) or exists (
    select 1 from public.employee_department_roles edr where edr.venue_id = venues.id
      and private.own_employee(edr.employee_id)));
create policy read_departments on public.departments for select to authenticated using (
  private.in_scope(business_id, venue_id, id) or private.own_assignment(business_id, id));
create policy read_roles on public.job_roles for select to authenticated using (
  private.in_scope(business_id, venue_id, department_id)
  or private.own_assignment(business_id, department_id));
create policy read_employee_roles on public.employee_department_roles for select to authenticated using (
  private.in_scope(business_id, venue_id, department_id) or private.own_employee(employee_id));
create policy read_employees on public.employees for select to authenticated using (
  user_id = auth.uid() or private.is_owner(business_id) or exists (
    select 1 from public.employee_department_roles edr where edr.employee_id = employees.id
      and private.in_scope(edr.business_id, edr.venue_id, edr.department_id)));
create policy read_shifts on public.shifts for select to authenticated using (
  private.in_scope(business_id, venue_id, department_id)
  or (status = 'published' and private.own_employee(employee_id)));
create policy read_publications on public.roster_publications for select to authenticated using (
  private.in_scope(business_id, venue_id, department_id));
create policy read_audit on public.audit_logs for select to authenticated using (
  private.is_owner(business_id) or
  (venue_id is not null and private.in_scope(business_id, venue_id, department_id)));

-- No client writes, even for owners: membership/permission administration is
-- trusted provisioning only. In particular shifts can only be changed by RPC.
revoke all on public.businesses, public.user_profiles, public.business_memberships,
  public.venues, public.departments, public.job_roles, public.venue_memberships,
  public.department_memberships, public.role_permissions, public.employees,
  public.employee_department_roles, public.shifts, public.roster_publications,
  public.audit_logs from public, anon, authenticated;
grant select on public.businesses, public.user_profiles, public.business_memberships,
  public.venues, public.departments, public.job_roles, public.venue_memberships,
  public.department_memberships, public.role_permissions, public.employees,
  public.employee_department_roles, public.shifts, public.roster_publications,
  public.audit_logs to authenticated;

create function public.save_shift(p_input jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b uuid;
  s public.shifts;
  old_s public.shifts;
  editing boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Shift input must be an object' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_input) k
    where k not in ('id', 'version', 'venue_id', 'department_id', 'role_id', 'employee_id',
      'starts_at', 'ends_at', 'break_minutes')) then
    raise exception 'Unknown shift fields' using errcode = '22023';
  end if;
  if not p_input ?& array['venue_id','department_id','role_id','employee_id','starts_at','ends_at','break_minutes']
    or (p_input ? 'id') <> (p_input ? 'version') then
    raise exception 'Missing fields or edit version' using errcode = '22023';
  end if;
  s := jsonb_populate_record(null::public.shifts, p_input);
  -- Resolve the tenant from the target venue and authenticated membership,
  -- never from a caller-supplied business ID or an arbitrary first membership.
  select v.business_id into b from public.venues v
    join public.business_memberships m on m.business_id = v.business_id
    where v.id = s.venue_id and m.user_id = auth.uid();
  if b is null then raise exception 'Business membership required' using errcode = '42501'; end if;
  editing := p_input ? 'id';
  if editing and (s.id is null or s.version is null or s.version < 1) then
    raise exception 'Editing requires id and positive version' using errcode = '22023';
  end if;
  if not private.has_permission(b, 'manage_roster')
    or not private.in_scope(b, s.venue_id, s.department_id) then
    raise exception 'Roster scope or permission denied' using errcode = '42501';
  end if;
  if editing then
    select * into old_s from public.shifts where id = s.id and business_id = b;
    if not found or not private.in_scope(b, old_s.venue_id, old_s.department_id) then
      raise exception 'Shift not found in scope' using errcode = '42501';
    end if;
  end if;
  -- Serialize all draft mutations with publication, including moves between departments.
  perform 1 from public.departments where business_id = b
    and id in (s.department_id, old_s.department_id) order by id for update;
  if editing then
    update public.shifts set venue_id = s.venue_id, department_id = s.department_id,
      role_id = s.role_id, employee_id = s.employee_id, starts_at = s.starts_at,
      ends_at = s.ends_at, break_minutes = s.break_minutes, version = version + 1,
      updated_at = now()
    where id = s.id and business_id = b and department_id = old_s.department_id
      and status = 'draft' and version = s.version;
    if not found then raise exception 'Stale version or published shift' using errcode = '40001'; end if;
  else
    s.id := gen_random_uuid();
    insert into public.shifts (id, business_id, venue_id, department_id, role_id,
      employee_id, starts_at, ends_at, break_minutes)
    values (s.id, b, s.venue_id, s.department_id, s.role_id, s.employee_id,
      s.starts_at, s.ends_at, s.break_minutes);
  end if;
  insert into public.audit_logs (business_id, venue_id, department_id, actor_id, action, entity_id, details)
    values (b, s.venue_id, s.department_id, auth.uid(), 'save_shift', s.id,
      jsonb_build_object('before', to_jsonb(old_s), 'input', p_input));
exception when exclusion_violation then
  -- Do not return PostgreSQL's conflicting range detail from a hidden department.
  raise exception 'Employee already has an overlapping shift' using errcode = '23P01';
end;
$$;

create function public.delete_shift(p_id uuid, p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.shifts; b uuid;
begin
  select sh.* into s from public.shifts sh
    join public.business_memberships m on m.business_id = sh.business_id
    where sh.id = p_id and m.user_id = auth.uid();
  b := s.business_id;
  if not found or not private.has_permission(b, 'manage_roster')
    or not private.in_scope(b, s.venue_id, s.department_id) then
    raise exception 'Shift not found or permission denied' using errcode = '42501';
  end if;
  perform 1 from public.departments where id = s.department_id for update;
  delete from public.shifts where id = p_id and business_id = b and department_id = s.department_id
    and status = 'draft' and version = p_version;
  if not found then raise exception 'Stale version or published shift' using errcode = '40001'; end if;
  insert into public.audit_logs (business_id, venue_id, department_id, actor_id, action, entity_id, details)
    values (b, s.venue_id, s.department_id, auth.uid(), 'delete_shift', s.id, to_jsonb(s));
end;
$$;

create function public.publish_roster(
  p_venue_id uuid, p_department_id uuid, p_week_start timestamptz, p_week_end timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare b uuid; publication uuid := gen_random_uuid(); n integer;
begin
  select v.business_id into b from public.venues v
    join public.business_memberships m on m.business_id = v.business_id
    where v.id = p_venue_id and m.user_id = auth.uid();
  if b is null or not private.has_permission(b, 'publish_roster')
    or not private.in_scope(b, p_venue_id, p_department_id) then
    raise exception 'Publication scope or permission denied' using errcode = '42501';
  end if;
  if p_week_start is null or p_week_end is null or not isfinite(p_week_start)
    or not isfinite(p_week_end) or p_week_end <= p_week_start
    or p_week_end - p_week_start > interval '8 days' then
    raise exception 'Publication interval must be positive and at most eight days' using errcode = '22023';
  end if;
  perform 1 from public.departments where business_id = b
    and venue_id = p_venue_id and id = p_department_id for update;
  if not found then raise exception 'Department not found' using errcode = '42501'; end if;
  -- The caller supplies absolute week boundaries (using its venue timezone).
  -- Publish shifts STARTING in [week_start, week_end), including overnight ones.
  select count(*) into n from public.shifts where business_id = b
    and venue_id = p_venue_id and department_id = p_department_id and status = 'draft'
    and starts_at >= p_week_start and starts_at < p_week_end;
  if n = 0 then raise exception 'No draft shifts in interval' using errcode = '22023'; end if;
  insert into public.roster_publications
    (id, business_id, venue_id, department_id, week_start, week_end, published_by, shift_count)
    values (publication, b, p_venue_id, p_department_id, p_week_start, p_week_end, auth.uid(), n);
  update public.shifts set status = 'published', publication_id = publication,
    version = version + 1, updated_at = now()
    where business_id = b and venue_id = p_venue_id and department_id = p_department_id
      and status = 'draft' and starts_at >= p_week_start and starts_at < p_week_end;
  insert into public.audit_logs (business_id, venue_id, department_id, actor_id, action, entity_id, details)
    values (b, p_venue_id, p_department_id, auth.uid(), 'publish_roster', publication,
      jsonb_build_object('shift_count', n, 'week_start', p_week_start, 'week_end', p_week_end));
end;
$$;
revoke all on function public.save_shift(jsonb), public.delete_shift(uuid, integer),
  public.publish_roster(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.save_shift(jsonb), public.delete_shift(uuid, integer),
  public.publish_roster(uuid, uuid, timestamptz, timestamptz) to authenticated;
