-- BB-ORG-004: staff can belong to several departments in their venue.
-- employees.department_id remains the primary (home) department.

create table public.employee_departments (
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (employee_id, department_id)
);
create index employee_departments_department_idx
  on public.employee_departments (department_id);

insert into public.employee_departments (business_id, employee_id, department_id)
select business_id, id, department_id from public.employees
on conflict do nothing;

-- Shifts may now be in any linked department, not only the primary one.
-- save_shift enforces the link; the tenant/venue association stays enforced here.
alter table public.employees
  add constraint employees_id_business_venue_key unique (id, business_id, venue_id);
alter table public.shifts
  drop constraint shifts_employee_id_business_id_venue_id_department_id_fkey;
alter table public.shifts
  add constraint shifts_employee_id_business_id_venue_id_fkey
  foreign key (employee_id, business_id, venue_id)
  references public.employees (id, business_id, venue_id) on delete restrict;

create function public.sync_primary_employee_department()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.employee_departments (business_id, employee_id, department_id)
  values (new.business_id, new.id, new.department_id)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.sync_primary_employee_department() from public, anon, authenticated;

create trigger employees_sync_primary_department
  after insert or update of department_id on public.employees
  for each row execute function public.sync_primary_employee_department();

create trigger employee_departments_business_id_immutable
  before update of business_id on public.employee_departments
  for each row execute function public.prevent_business_id_change();

alter table public.employee_departments enable row level security;
create policy "Members can view department links in their scope"
  on public.employee_departments for select to authenticated
  using (public.can_view_department(business_id, department_id));
grant select on public.employee_departments to authenticated;

create function public.can_manage_employee_in_any_department(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.employee_departments ed
    where ed.employee_id = p_employee_id
      and public.can_manage_department(ed.business_id, ed.department_id)
  );
$$;
revoke all on function public.can_manage_employee_in_any_department(uuid) from public, anon;
grant execute on function public.can_manage_employee_in_any_department(uuid) to authenticated;

drop policy "Managers and employees can view eligible employees" on public.employees;
create policy "Managers and employees can view eligible employees"
  on public.employees for select to authenticated
  using (
    public.can_manage_department(business_id, department_id)
    or public.can_manage_employee_in_any_department(id)
    or (auth_user_id = auth.uid() and public.can_view_department(business_id, department_id))
  );

create function public.set_employee_departments(
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

  delete from public.employee_departments
  where employee_id = p_employee_id and not (department_id = any(v_ids));
  insert into public.employee_departments (business_id, employee_id, department_id)
  select p_business_id, p_employee_id, requested.id from unnest(v_ids) as requested(id)
  on conflict do nothing;
end;
$$;
revoke all on function public.set_employee_departments(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_employee_departments(uuid, uuid, uuid[]) to authenticated;

create or replace function public.save_shift(
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
    join public.employee_departments ed
      on ed.employee_id = e.id and ed.department_id = p_department_id
    where e.id = p_employee_id
      and e.business_id = p_business_id
      and e.venue_id = p_venue_id
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

-- Staff can see their own published shifts in any department they are linked to.
create function public.is_own_linked_shift(
  p_business_id uuid,
  p_employee_id uuid,
  p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.employees e
    join public.employee_departments ed
      on ed.employee_id = e.id and ed.department_id = p_department_id
    where e.id = p_employee_id
      and e.business_id = p_business_id
      and e.auth_user_id = auth.uid()
  );
$$;
revoke all on function public.is_own_linked_shift(uuid, uuid, uuid) from public, anon;
grant execute on function public.is_own_linked_shift(uuid, uuid, uuid) to authenticated;

drop policy "Managers and employees can view eligible shifts" on public.shifts;
create policy "Managers and employees can view eligible shifts"
  on public.shifts for select to authenticated
  using (
    public.can_manage_department(business_id, department_id)
    or (is_published and public.is_own_linked_shift(business_id, employee_id, department_id))
  );
