create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  timezone text not null default 'Australia/Sydney',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name),
  unique (id, business_id)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (venue_id, business_id)
    references public.venues (id, business_id) on delete cascade,
  unique (venue_id, name),
  unique (id, business_id),
  unique (id, business_id, venue_id)
);

create table public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (
    role in ('owner', 'admin', 'general_manager', 'foh_manager', 'boh_manager', 'department_manager', 'employee')
  ),
  department_id uuid,
  created_at timestamptz not null default now(),
  unique (business_id, user_id),
  foreign key (department_id, business_id)
    references public.departments (id, business_id)
);

create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id) on delete cascade,
  unique (department_id, name),
  unique (id, business_id, venue_id, department_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  auth_user_id uuid references auth.users (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 100),
  email text,
  role_title text not null,
  employment_type text not null default 'casual'
    check (employment_type in ('full_time', 'part_time', 'casual')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id) on delete cascade,
  unique (id, business_id, venue_id, department_id)
);

create unique index employees_auth_user_department_key
  on public.employees (auth_user_id, department_id)
  where auth_user_id is not null;

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  employee_id uuid,
  role_title text not null check (length(trim(role_title)) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  is_published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (ends_at > starts_at),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id) on delete cascade,
  foreign key (employee_id, business_id, venue_id, department_id)
    references public.employees (id, business_id, venue_id, department_id) on delete restrict
);

create index business_memberships_user_idx
  on public.business_memberships (user_id, business_id);
create index venues_business_idx on public.venues (business_id);
create index departments_venue_idx on public.departments (venue_id, business_id);
create index employees_scope_idx
  on public.employees (business_id, venue_id, department_id) where active;
create index shifts_roster_idx
  on public.shifts (venue_id, department_id, starts_at);
create index shifts_employee_time_idx
  on public.shifts (employee_id, starts_at, ends_at) where status = 'scheduled';

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger businesses_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();
create trigger venues_updated_at before update on public.venues
  for each row execute function public.set_updated_at();
create trigger departments_updated_at before update on public.departments
  for each row execute function public.set_updated_at();
create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();
create trigger shifts_updated_at before update on public.shifts
  for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid()
  );
$$;

create function public.has_business_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

create function public.can_manage_department(
  p_business_id uuid,
  p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and (
        m.role in ('owner', 'admin', 'general_manager')
        or (
          m.role in ('foh_manager', 'boh_manager', 'department_manager')
          and m.department_id = p_department_id
        )
      )
  );
$$;

create function public.handle_demo_seed(
  p_business_id uuid,
  p_venue_id uuid,
  p_timezone text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into public.employees (
    business_id, venue_id, department_id, name, role_title, employment_type
  )
  select p_business_id, p_venue_id, d.id, seed.name, seed.role_title,
         case when seed.ordinality <= 4 then 'full_time' else 'casual' end
  from (
    select *
    from unnest(
      array[
        'Mia Chen', 'Oliver Smith', 'Amelia Brown', 'Noah Wilson',
        'Isla Martin', 'Luca Taylor', 'Ruby Thompson', 'Jack White',
        'Chloe Harris', 'Leo Walker', 'Grace Young', 'Ethan King',
        'Sophie Hall', 'Henry Scott', 'Ava Green', 'Oscar Baker',
        'Zoe Adams', 'William Nelson', 'Lily Carter', 'James Mitchell',
        'Ella Roberts', 'Charlie Turner', 'Aria Phillips', 'Harrison Campbell'
      ],
      array[
        'Barista', 'Barista', 'Shift Supervisor', 'Server',
        'Server', 'Server', 'Bartender', 'Server',
        'Barista', 'Server', 'Bartender', 'Server',
        'Head Chef', 'Chef', 'Chef', 'Cook',
        'Cook', 'Kitchen Hand', 'Kitchen Hand', 'Prep Cook',
        'Cook', 'Kitchen Hand', 'Prep Cook', 'Chef'
      ],
      array[
        'Front of House', 'Front of House', 'Front of House', 'Front of House',
        'Front of House', 'Front of House', 'Front of House', 'Front of House',
        'Front of House', 'Front of House', 'Front of House', 'Front of House',
        'Back of House', 'Back of House', 'Back of House', 'Back of House',
        'Back of House', 'Back of House', 'Back of House', 'Back of House',
        'Back of House', 'Back of House', 'Back of House', 'Back of House'
      ]
    ) with ordinality as staff(name, role_title, department_name, ordinality)
  ) as seed
  join public.departments d
    on d.business_id = p_business_id
   and d.venue_id = p_venue_id
   and d.name = seed.department_name;

  insert into public.job_roles (business_id, venue_id, department_id, name)
  select distinct e.business_id, e.venue_id, e.department_id, e.role_title
  from public.employees e
  where e.business_id = p_business_id and e.venue_id = p_venue_id
  on conflict (department_id, name) do nothing;

  insert into public.shifts (
    business_id, venue_id, department_id, employee_id, role_title,
    starts_at, ends_at, break_minutes
  )
  select
    e.business_id,
    e.venue_id,
    e.department_id,
    e.id,
    e.role_title,
    ((date_trunc('week', current_date)::date
      + ((e.ordinality - 1 + schedule.occurrence * 3) % 7)::integer)
      + (case
          when d.name = 'Front of House' then time '07:00'
          else time '08:00'
        end + ((e.ordinality % 3) * interval '1 hour')))
      at time zone p_timezone,
    ((date_trunc('week', current_date)::date
      + ((e.ordinality - 1 + schedule.occurrence * 3) % 7)::integer)
      + (case
          when d.name = 'Front of House' then time '07:00'
          else time '08:00'
        end + ((e.ordinality % 3) * interval '1 hour'))
      + interval '8 hours')
      at time zone p_timezone,
    30
  from (
    select id, business_id, venue_id, department_id, name, role_title,
           row_number() over (partition by department_id order by name) as ordinality
    from public.employees
    where business_id = p_business_id and venue_id = p_venue_id
  ) e
  join public.departments d on d.id = e.department_id
  cross join generate_series(0, 1) as schedule(occurrence);
end;
$$;

create function public.create_business(
  p_business_name text,
  p_venue_name text,
  p_timezone text default 'Australia/Sydney',
  p_include_sample_data boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_venue_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(p_business_name, ''))) not between 1 and 100
    or length(trim(coalesce(p_venue_name, ''))) not between 1 and 100 then
    raise exception 'Business and venue names are required';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid timezone';
  end if;

  insert into public.businesses (name) values (trim(p_business_name))
    returning id into v_business_id;
  insert into public.business_memberships (business_id, user_id, role)
    values (v_business_id, auth.uid(), 'owner');
  insert into public.venues (business_id, name, timezone)
    values (v_business_id, trim(p_venue_name), p_timezone)
    returning id into v_venue_id;
  insert into public.departments (business_id, venue_id, name)
    values
      (v_business_id, v_venue_id, 'Front of House'),
      (v_business_id, v_venue_id, 'Back of House');

  if p_include_sample_data then
    perform public.handle_demo_seed(v_business_id, v_venue_id, p_timezone);
  end if;

  return v_business_id;
end;
$$;

create function public.save_shift(
  p_business_id uuid,
  p_venue_id uuid,
  p_department_id uuid,
  p_employee_id uuid,
  p_role_title text,
  p_start_local timestamp without time zone,
  p_end_local timestamp without time zone,
  p_break_minutes integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_start timestamptz;
  v_end timestamptz;
  v_shift_id uuid;
begin
  if not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if length(trim(coalesce(p_role_title, ''))) not between 1 and 80
    or p_break_minutes not between 0 and 240
    or p_start_local is null
    or p_end_local is null then
    raise exception 'Invalid shift details';
  end if;

  select v.timezone into v_timezone
  from public.venues v
  join public.departments d
    on d.venue_id = v.id and d.business_id = v.business_id
  where v.id = p_venue_id
    and v.business_id = p_business_id
    and d.id = p_department_id;
  if v_timezone is null then
    raise exception 'Venue or department not found';
  end if;

  v_start := p_start_local at time zone v_timezone;
  v_end := p_end_local at time zone v_timezone;
  if p_end_local <= p_start_local then
    v_end := v_end + interval '1 day';
  end if;
  if v_end <= v_start or v_end - v_start > interval '24 hours' then
    raise exception 'Invalid shift duration';
  end if;

  if p_employee_id is not null and not exists (
    select 1 from public.employees e
    where e.id = p_employee_id
      and e.business_id = p_business_id
      and e.venue_id = p_venue_id
      and e.department_id = p_department_id
      and e.active
  ) then
    raise exception 'Employee is not eligible for this department';
  end if;

  if p_employee_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  end if;

  if p_employee_id is not null and exists (
    select 1 from public.shifts s
    where s.employee_id = p_employee_id
      and s.status = 'scheduled'
      and tstzrange(s.starts_at, s.ends_at, '[)')
          && tstzrange(v_start, v_end, '[)')
  ) then
    raise exception 'Employee has an overlapping shift';
  end if;

  insert into public.shifts (
    business_id, venue_id, department_id, employee_id, role_title,
    starts_at, ends_at, break_minutes, created_by
  )
  values (
    p_business_id, p_venue_id, p_department_id, p_employee_id,
    trim(p_role_title), v_start, v_end, p_break_minutes, auth.uid()
  )
  returning id into v_shift_id;
  return v_shift_id;
end;
$$;

create function public.delete_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
begin
  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'Shift not found';
  end if;
  if not public.can_manage_department(v_shift.business_id, v_shift.department_id) then
    raise exception 'Permission denied';
  end if;
  if v_shift.is_published then
    raise exception 'Published shifts cannot be deleted';
  end if;
  delete from public.shifts where id = p_shift_id;
end;
$$;

create function public.publish_roster(
  p_business_id uuid,
  p_venue_id uuid,
  p_department_id uuid,
  p_week_start date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_updated integer;
begin
  if not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Roster week must start on Monday';
  end if;

  select timezone into v_timezone from public.venues
  where id = p_venue_id and business_id = p_business_id;
  if v_timezone is null then
    raise exception 'Venue not found';
  end if;

  update public.shifts s
  set is_published = true, published_at = now()
  where s.business_id = p_business_id
    and s.venue_id = p_venue_id
    and s.department_id = p_department_id
    and s.status = 'scheduled'
    and not s.is_published
    and (s.starts_at at time zone v_timezone)::date between p_week_start and p_week_start + 6;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.venues enable row level security;
alter table public.departments enable row level security;
alter table public.business_memberships enable row level security;
alter table public.job_roles enable row level security;
alter table public.employees enable row level security;
alter table public.shifts enable row level security;

create policy "Profiles are visible to their user"
  on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "Business members can view their businesses"
  on public.businesses for select to authenticated
  using (public.is_business_member(id));
create policy "Users can view their memberships"
  on public.business_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_business_role(
      business_id,
      array['owner', 'admin', 'general_manager']::text[]
    )
  );
create policy "Business members can view venues"
  on public.venues for select to authenticated
  using (public.is_business_member(business_id));
create policy "Business members can view departments"
  on public.departments for select to authenticated
  using (public.is_business_member(business_id));
create policy "Managers can view job roles in their department"
  on public.job_roles for select to authenticated
  using (
    public.can_manage_department(business_id, department_id)
    or public.is_business_member(business_id)
  );
create policy "Managers and employees can view eligible employees"
  on public.employees for select to authenticated
  using (
    public.can_manage_department(business_id, department_id)
    or auth_user_id = auth.uid()
  );
create policy "Managers and employees can view eligible shifts"
  on public.shifts for select to authenticated
  using (
    public.can_manage_department(business_id, department_id)
    or (
      is_published
      and exists (
        select 1 from public.employees e
        where e.id = shifts.employee_id and e.auth_user_id = auth.uid()
      )
    )
  );

revoke all on public.profiles, public.businesses, public.venues,
  public.departments, public.business_memberships, public.job_roles,
  public.employees, public.shifts from anon, authenticated;
grant select on public.profiles, public.businesses, public.venues,
  public.departments, public.business_memberships, public.job_roles,
  public.employees, public.shifts to authenticated;

revoke all on function public.is_business_member(uuid) from public, anon;
revoke all on function public.has_business_role(uuid, text[]) from public, anon;
revoke all on function public.can_manage_department(uuid, uuid) from public, anon;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_demo_seed(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_business(text, text, text, boolean) from public, anon;
revoke all on function public.save_shift(uuid, uuid, uuid, uuid, text, timestamp without time zone, timestamp without time zone, integer) from public, anon;
revoke all on function public.delete_shift(uuid) from public, anon;
revoke all on function public.publish_roster(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, text[]) to authenticated;
grant execute on function public.can_manage_department(uuid, uuid) to authenticated;
grant execute on function public.create_business(text, text, text, boolean) to authenticated;
grant execute on function public.save_shift(uuid, uuid, uuid, uuid, text, timestamp without time zone, timestamp without time zone, integer) to authenticated;
grant execute on function public.delete_shift(uuid) to authenticated;
grant execute on function public.publish_roster(uuid, uuid, uuid, date) to authenticated;
