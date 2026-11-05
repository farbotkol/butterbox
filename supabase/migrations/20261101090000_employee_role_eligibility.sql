alter table public.job_roles
  add column restrict_auto_assignment boolean not null default false;

create table public.employee_job_roles (
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  employee_id uuid not null,
  job_role_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (employee_id, job_role_id),
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id) on delete cascade,
  foreign key (job_role_id, business_id, venue_id, department_id)
    references public.job_roles (id, business_id, venue_id, department_id) on delete cascade,
  foreign key (employee_id, department_id)
    references public.employee_departments (employee_id, department_id) on delete cascade
);
create unique index employee_job_roles_one_primary
  on public.employee_job_roles (employee_id) where is_primary;
create index employee_job_roles_role_idx on public.employee_job_roles (job_role_id);
create trigger employee_job_roles_business_id_immutable
  before update of business_id on public.employee_job_roles
  for each row execute function public.prevent_business_id_change();

alter table public.employee_job_roles enable row level security;
create policy "Managers can view eligible roles in their department"
  on public.employee_job_roles for select to authenticated
  using (public.can_manage_department(business_id, department_id));
revoke all on public.employee_job_roles from public, anon, authenticated;
grant select on public.employee_job_roles to authenticated;

create function public.set_job_role_auto_restriction(
  p_business_id uuid,
  p_job_role_id uuid,
  p_restricted boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.job_roles%rowtype;
begin
  select * into v_role from public.job_roles
  where id = p_job_role_id and business_id = p_business_id;
  if not found or not public.can_manage_department(p_business_id, v_role.department_id) then
    raise exception 'Permission denied';
  end if;
  if p_restricted is null then
    raise exception 'Invalid restriction';
  end if;
  update public.job_roles
  set restrict_auto_assignment = p_restricted
  where id = p_job_role_id;
end;
$$;

create function public.set_employee_eligible_roles(
  p_business_id uuid,
  p_employee_id uuid,
  p_department_id uuid,
  p_job_role_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_ids uuid[] := array(select distinct unnest(coalesce(p_job_role_ids, '{}'::uuid[])));
begin
  if not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  select * into v_employee from public.employees
  where id = p_employee_id and business_id = p_business_id
  for update;
  if not found or not exists (
    select 1 from public.employee_departments ed
    where ed.employee_id = p_employee_id and ed.business_id = p_business_id
      and ed.department_id = p_department_id
  ) then
    raise exception 'Employee is not eligible for this department';
  end if;
  if cardinality(v_ids) > 200 or array_position(v_ids, null) is not null
    or exists (
      select 1 from unnest(v_ids) as requested(id)
      left join public.job_roles r
        on r.id = requested.id and r.business_id = p_business_id
          and r.venue_id = v_employee.venue_id and r.department_id = p_department_id
      left join public.departments d on d.id = r.department_id
      where r.id is null
        or ((not r.active or not d.active) and not exists (
          select 1 from public.employee_job_roles er
          where er.employee_id = p_employee_id and er.job_role_id = r.id
        ))
    ) then
    raise exception 'Invalid or inactive job role';
  end if;
  if exists (
    select 1 from public.employee_job_roles er
    where er.employee_id = p_employee_id and er.department_id = p_department_id
      and er.is_primary and not (er.job_role_id = any(v_ids))
  ) then
    raise exception 'Choose another primary role before removing it';
  end if;

  delete from public.employee_job_roles
  where employee_id = p_employee_id and department_id = p_department_id
    and not (job_role_id = any(v_ids));
  insert into public.employee_job_roles
    (business_id, venue_id, department_id, employee_id, job_role_id)
  select p_business_id, v_employee.venue_id, p_department_id, p_employee_id, requested.id
  from unnest(v_ids) as requested(id)
  on conflict (employee_id, job_role_id) do nothing;
end;
$$;

create function public.set_employee_primary_role(
  p_business_id uuid,
  p_employee_id uuid,
  p_job_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_role public.job_roles%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  select * into v_employee from public.employees
  where id = p_employee_id and business_id = p_business_id
  for update;
  if not found or not public.can_manage_department(p_business_id, v_employee.department_id) then
    raise exception 'Permission denied';
  end if;
  select r.* into v_role
  from public.job_roles r
  join public.employee_job_roles er
    on er.job_role_id = r.id and er.employee_id = p_employee_id
  join public.departments d on d.id = r.department_id
  where r.id = p_job_role_id and r.business_id = p_business_id
    and r.active and d.active;
  if not found or not public.can_manage_department(p_business_id, v_role.department_id) then
    raise exception 'Choose an eligible active role';
  end if;
  update public.employee_job_roles set is_primary = false
  where employee_id = p_employee_id and is_primary;
  update public.employee_job_roles set is_primary = true
  where employee_id = p_employee_id and job_role_id = p_job_role_id;
  update public.employees set role_title = v_role.name where id = p_employee_id;
end;
$$;

-- A custom title remains supported; changing it clears a mismatching structured primary.
create function public.clear_changed_primary_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role_title is distinct from old.role_title then
    update public.employee_job_roles er set is_primary = false
    from public.job_roles r
    where er.employee_id = new.id and er.is_primary and r.id = er.job_role_id
      and lower(trim(r.name)) <> lower(trim(new.role_title));
  end if;
  return new;
end;
$$;

create trigger employees_clear_changed_primary_role
  after update of role_title on public.employees
  for each row execute function public.clear_changed_primary_role();

-- Renaming a primary role updates profiles, but not historical shift titles.
create function public.rename_primary_employee_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.name is distinct from old.name then
    update public.employees e set role_title = new.name
    from public.employee_job_roles er
    where er.job_role_id = new.id and er.is_primary and er.employee_id = e.id;
  end if;
  return new;
end;
$$;

create trigger job_roles_rename_primary_employee_roles
  after update of name on public.job_roles
  for each row execute function public.rename_primary_employee_roles();

create or replace function public.set_employee_departments(
  p_business_id uuid,
  p_employee_id uuid,
  p_department_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_ids uuid[] := array(select distinct unnest(coalesce(p_department_ids, '{}'::uuid[])));
begin
  select * into v_employee from public.employees
  where id = p_employee_id and business_id = p_business_id
  for update;
  if not found then
    raise exception 'Permission denied';
  end if;
  if not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and (m.role in ('owner', 'admin')
        or (m.role = 'general_manager' and (m.venue_id is null or m.venue_id = v_employee.venue_id)))
  ) then
    raise exception 'Permission denied';
  end if;
  if cardinality(v_ids) > 200 or array_position(v_ids, null) is not null then
    raise exception 'Department not found';
  end if;
  if not (v_employee.department_id = any(v_ids)) then
    v_ids := v_ids || v_employee.department_id;
  end if;
  if exists (
    select 1 from unnest(v_ids) as requested(id)
    left join public.departments d
      on d.id = requested.id and d.business_id = p_business_id and d.venue_id = v_employee.venue_id
    where d.id is null
  ) then
    raise exception 'Department not found';
  end if;
  if exists (
    select 1 from unnest(v_ids) as requested(id)
    join public.departments d on d.id = requested.id
    where not d.active
      and not exists (
        select 1 from public.employee_departments ed
        where ed.employee_id = p_employee_id and ed.department_id = d.id
      )
  ) then
    raise exception 'Department is inactive';
  end if;
  if exists (
    select 1 from public.employee_job_roles er
    where er.employee_id = p_employee_id and er.is_primary
      and not (er.department_id = any(v_ids))
  ) then
    raise exception 'Choose another primary role before removing its department';
  end if;
  delete from public.employee_departments
  where employee_id = p_employee_id and not (department_id = any(v_ids));
  insert into public.employee_departments (business_id, employee_id, department_id)
  select p_business_id, p_employee_id, requested.id from unnest(v_ids) as requested(id)
  on conflict do nothing;
end;
$$;

create function public.shift_time_bounds(
  p_timezone text,
  p_start_local timestamp without time zone,
  p_end_local timestamp without time zone
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_end_local timestamp without time zone;
begin
  if p_start_local is null or p_end_local is null then
    raise exception 'Invalid shift details';
  end if;
  if p_end_local::date < p_start_local::date then
    raise exception 'End date cannot be before start date';
  end if;
  v_end_local := case when p_end_local <= p_start_local
    then p_end_local + interval '1 day' else p_end_local end;
  starts_at := p_start_local at time zone p_timezone;
  ends_at := v_end_local at time zone p_timezone;
  if (starts_at at time zone p_timezone) <> p_start_local then
    raise exception 'Start time does not exist in venue timezone';
  end if;
  if (ends_at at time zone p_timezone) <> v_end_local then
    raise exception 'End time does not exist in venue timezone';
  end if;
  if ends_at <= starts_at or ends_at - starts_at > interval '24 hours' then
    raise exception 'Invalid shift duration';
  end if;
  return next;
end;
$$;
revoke all on function public.shift_time_bounds(text, timestamp, timestamp) from public, anon, authenticated;

create function public.save_shift_auto_assign(
  p_business_id uuid,
  p_venue_id uuid,
  p_department_id uuid,
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
  v_employee_id uuid;
begin
  if not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if length(trim(coalesce(p_role_title, ''))) not between 1 and 80
    or p_break_minutes is null or p_break_minutes not between 0 and 240
    or p_start_local is null or p_end_local is null then
    raise exception 'Invalid shift details';
  end if;
  select v.timezone into v_timezone
  from public.venues v
  join public.departments d on d.venue_id = v.id and d.business_id = v.business_id
  where v.id = p_venue_id and v.business_id = p_business_id
    and d.id = p_department_id and d.active
  for share of d;
  if v_timezone is null then
    raise exception 'Venue or active department not found';
  end if;

  -- Keep the role policy stable until the selected shift has been inserted.
  perform 1 from public.job_roles r
  where r.department_id = p_department_id and lower(r.name) = lower(trim(p_role_title))
  for share;
  if exists (
    select 1 from public.job_roles r
    where r.department_id = p_department_id and lower(r.name) = lower(trim(p_role_title))
      and not r.active
  ) then
    raise exception 'Job role is inactive';
  end if;
  select bounds.starts_at, bounds.ends_at into v_start, v_end
  from public.shift_time_bounds(v_timezone, p_start_local, p_end_local) bounds;

  for v_employee_id in
    select e.id from public.employees e
    join public.employee_departments ed
      on ed.employee_id = e.id and ed.department_id = p_department_id
    where e.business_id = p_business_id and e.venue_id = p_venue_id and e.active
    order by lower(e.name), e.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_employee_id::text, 0));
    -- Other membership/profile changes lock this same employee row.
    perform 1 from public.employees e
    where e.id = v_employee_id and e.business_id = p_business_id
      and e.venue_id = p_venue_id and e.active
    for update;
    if not found or not exists (
      select 1 from public.employee_departments ed
      where ed.employee_id = v_employee_id and ed.department_id = p_department_id
    ) then
      continue;
    end if;
    if exists (
      select 1 from public.job_roles r
      where r.department_id = p_department_id and lower(r.name) = lower(trim(p_role_title))
        and r.restrict_auto_assignment
        and not exists (
          select 1 from public.employee_job_roles er
          where er.employee_id = v_employee_id and er.job_role_id = r.id
        )
    ) then
      continue;
    end if;
    if exists (
      select 1 from public.shifts s
      where s.employee_id = v_employee_id and s.status = 'scheduled'
        and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
    ) then
      continue;
    end if;
    return public.save_shift(
      p_business_id, p_venue_id, p_department_id, v_employee_id,
      p_role_title, p_start_local, p_end_local, p_break_minutes
    );
  end loop;
  raise exception 'No eligible employee available for automatic assignment';
end;
$$;

revoke all on function public.clear_changed_primary_role() from public, anon, authenticated;
revoke all on function public.rename_primary_employee_roles() from public, anon, authenticated;
revoke all on function public.set_job_role_auto_restriction(uuid, uuid, boolean) from public, anon;
revoke all on function public.set_employee_eligible_roles(uuid, uuid, uuid, uuid[]) from public, anon;
revoke all on function public.set_employee_primary_role(uuid, uuid, uuid) from public, anon;
revoke all on function public.save_shift_auto_assign(uuid, uuid, uuid, text, timestamp without time zone, timestamp without time zone, integer) from public, anon;
grant execute on function public.set_job_role_auto_restriction(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_employee_eligible_roles(uuid, uuid, uuid, uuid[]) to authenticated;
grant execute on function public.set_employee_primary_role(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_shift_auto_assign(uuid, uuid, uuid, text, timestamp without time zone, timestamp without time zone, integer) to authenticated;
