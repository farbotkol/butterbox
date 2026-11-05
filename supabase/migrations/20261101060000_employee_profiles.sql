create function public.save_employee_profile(
  p_business_id uuid,
  p_department_id uuid,
  p_employee_id uuid,
  p_name text,
  p_email text,
  p_role_title text,
  p_employment_type text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue_id uuid;
  v_employee public.employees%rowtype;
  v_id uuid;
begin
  if not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 100
    or length(trim(coalesce(p_role_title, ''))) not between 1 and 80
    or p_employment_type is null
    or p_employment_type not in ('full_time', 'part_time', 'casual')
    or p_active is null
    or (nullif(trim(p_email), '') is not null
        and (length(trim(p_email)) > 254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then
    raise exception 'Invalid employee details';
  end if;
  select venue_id into v_venue_id from public.departments
  where id = p_department_id and business_id = p_business_id;
  if v_venue_id is null then
    raise exception 'Department not found';
  end if;

  if p_employee_id is null then
    insert into public.employees (
      business_id, venue_id, department_id, name, email,
      role_title, employment_type, active
    ) values (
      p_business_id, v_venue_id, p_department_id, trim(p_name),
      nullif(lower(trim(p_email)), ''), trim(p_role_title), p_employment_type, p_active
    ) returning id into v_id;
  else
    select * into v_employee from public.employees
    where id = p_employee_id for update;
    if not found or v_employee.business_id <> p_business_id
      or v_employee.department_id <> p_department_id then
      raise exception 'Employee not found in this department';
    end if;
    update public.employees
    set name = trim(p_name), email = nullif(lower(trim(p_email)), ''),
        role_title = trim(p_role_title), employment_type = p_employment_type, active = p_active
    where id = p_employee_id;
    v_id := p_employee_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_employee_profile(uuid, uuid, uuid, text, text, text, text, boolean)
  from public, anon;
grant execute on function public.save_employee_profile(uuid, uuid, uuid, text, text, text, text, boolean)
  to authenticated;
