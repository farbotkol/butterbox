alter table public.departments
  add column active boolean not null default true;
alter table public.job_roles
  add column active boolean not null default true;

-- Departments and job roles are deactivated, never deleted, so shift and
-- employee foreign keys keep referring to the original records.
create function public.save_department(
  p_business_id uuid,
  p_venue_id uuid,
  p_department_id uuid,
  p_name text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_department public.departments%rowtype;
  v_id uuid;
begin
  if not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and (
        m.role in ('owner', 'admin')
        or (m.role = 'general_manager' and (m.venue_id is null or m.venue_id = p_venue_id))
      )
  ) then
    raise exception 'Permission denied';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 80 or p_active is null then
    raise exception 'Invalid department details';
  end if;
  if not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) then
    raise exception 'Venue not found';
  end if;
  if exists (
    select 1 from public.departments d
    where d.venue_id = p_venue_id and lower(d.name) = lower(trim(p_name))
      and d.id is distinct from p_department_id
  ) then
    raise exception 'Department name already exists';
  end if;

  if p_department_id is null then
    insert into public.departments (business_id, venue_id, name, active)
    values (p_business_id, p_venue_id, trim(p_name), p_active)
    returning id into v_id;
  else
    select * into v_department from public.departments
    where id = p_department_id for update;
    if not found or v_department.business_id <> p_business_id
      or v_department.venue_id <> p_venue_id then
      raise exception 'Department not found';
    end if;
    update public.departments set name = trim(p_name), active = p_active
    where id = p_department_id;
    v_id := p_department_id;
  end if;
  return v_id;
end;
$$;

create function public.save_job_role(
  p_business_id uuid,
  p_department_id uuid,
  p_job_role_id uuid,
  p_name text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_department public.departments%rowtype;
  v_role public.job_roles%rowtype;
  v_id uuid;
begin
  if not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 80 or p_active is null then
    raise exception 'Invalid job role details';
  end if;
  select * into v_department from public.departments
  where id = p_department_id and business_id = p_business_id;
  if not found then
    raise exception 'Department not found';
  end if;
  if p_active and not v_department.active then
    raise exception 'Department is inactive';
  end if;
  if exists (
    select 1 from public.job_roles r
    where r.department_id = p_department_id and lower(r.name) = lower(trim(p_name))
      and r.id is distinct from p_job_role_id
  ) then
    raise exception 'Job role name already exists';
  end if;

  if p_job_role_id is null then
    insert into public.job_roles (business_id, venue_id, department_id, name, active)
    values (p_business_id, v_department.venue_id, p_department_id, trim(p_name), p_active)
    returning id into v_id;
  else
    select * into v_role from public.job_roles where id = p_job_role_id for update;
    if not found or v_role.business_id <> p_business_id
      or v_role.department_id <> p_department_id then
      raise exception 'Job role not found';
    end if;
    update public.job_roles set name = trim(p_name), active = p_active
    where id = p_job_role_id;
    v_id := p_job_role_id;
  end if;
  return v_id;
end;
$$;

create function public.ensure_active_shift_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.department_id = old.department_id
    and new.role_title = old.role_title then
    return new;
  end if;
  if exists (
    select 1 from public.departments d where d.id = new.department_id and not d.active
  ) then
    raise exception 'Department is inactive';
  end if;
  if exists (
    select 1 from public.job_roles r
    where r.department_id = new.department_id
      and lower(r.name) = lower(trim(new.role_title))
      and not r.active
  ) then
    raise exception 'Job role is inactive';
  end if;
  return new;
end;
$$;

create function public.ensure_active_employee_department()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Archived staff and unchanged placements may remain in inactive departments.
  if not new.active or (tg_op = 'UPDATE' and new.department_id = old.department_id and old.active) then
    return new;
  end if;
  if exists (
    select 1 from public.departments d where d.id = new.department_id and not d.active
  ) then
    raise exception 'Department is inactive';
  end if;
  return new;
end;
$$;

create trigger shifts_require_active_department
  before insert or update of department_id, role_title on public.shifts
  for each row execute function public.ensure_active_shift_scope();
create trigger employees_require_active_department
  before insert or update of department_id, active on public.employees
  for each row execute function public.ensure_active_employee_department();

revoke all on function public.ensure_active_shift_scope()
  from public, anon, authenticated;
revoke all on function public.ensure_active_employee_department()
  from public, anon, authenticated;
revoke all on function public.save_department(uuid, uuid, uuid, text, boolean) from public, anon;
revoke all on function public.save_job_role(uuid, uuid, uuid, text, boolean) from public, anon;
grant execute on function public.save_department(uuid, uuid, uuid, text, boolean) to authenticated;
grant execute on function public.save_job_role(uuid, uuid, uuid, text, boolean) to authenticated;
