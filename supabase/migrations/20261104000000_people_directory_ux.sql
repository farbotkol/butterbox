-- Scoped directory reads and optimistic concurrency for the People workflow.
alter table public.employees
  add column profile_revision bigint not null default 0
    check (profile_revision >= 0);

create function public.advance_employee_profile_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.profile_revision := old.profile_revision + 1;
  return new;
end;
$$;
revoke all on function public.advance_employee_profile_revision() from public, anon, authenticated;

create trigger employees_profile_revision
  before update on public.employees
  for each row execute function public.advance_employee_profile_revision();

create function public.list_people_directory(
  p_business_id uuid,
  p_venue_id uuid,
  p_department_id uuid,
  p_search text,
  p_role text,
  p_status text
)
returns table (
  id uuid,
  name text,
  email text,
  auth_user_id uuid,
  department_id uuid,
  department_name text,
  role_title text,
  primary_role_name text,
  employment_type text,
  active boolean,
  invitation_state text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_business_id is null or p_venue_id is null
    or p_search is null or length(p_search) > 100
    or p_role is null or length(p_role) > 80
    or p_status is null or p_status not in ('all', 'active', 'archived') then
    raise exception 'Invalid directory filters';
  end if;

  return query
  select e.id, e.name,
    case when public.can_manage_department(e.business_id, e.department_id) then e.email end,
    case when public.can_manage_department(e.business_id, e.department_id) then e.auth_user_id end,
    e.department_id, d.name,
    case when public.can_manage_department(e.business_id, e.department_id) then e.role_title end,
    primary_role.name,
    case when public.can_manage_department(e.business_id, e.department_id) then e.employment_type end,
    e.active,
    case
      when not public.can_manage_department(e.business_id, e.department_id) then 'unavailable'
      when e.auth_user_id is not null then 'linked'
      when invitation.expires_at <= statement_timestamp() then 'expired'
      when invitation.id is not null then 'pending'
      else 'not_invited'
    end
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join lateral (
    select r.name
    from public.employee_job_roles er
    join public.job_roles r on r.id = er.job_role_id
    where er.employee_id = e.id and er.is_primary
    limit 1
  ) primary_role on true
  left join lateral (
    select i.id, i.expires_at
    from public.staff_invitations i
    where i.employee_id = e.id and i.status = 'pending'
    order by i.created_at desc, i.id desc
    limit 1
  ) invitation on true
  where e.business_id = p_business_id and e.venue_id = p_venue_id
    and (p_department_id is null or exists (
      select 1 from public.employee_departments ed
      where ed.employee_id = e.id and ed.department_id = p_department_id
    ))
    and (p_status = 'all' or e.active = (p_status = 'active'))
    and (p_search = '' or
      strpos(lower(e.name), lower(p_search)) > 0 or
      (public.can_manage_department(e.business_id, e.department_id)
        and strpos(lower(coalesce(e.email, '')), lower(p_search)) > 0) or
      (public.can_manage_department(e.business_id, e.department_id)
        and strpos(lower(e.role_title), lower(p_search)) > 0) or exists (
        select 1 from public.employee_job_roles er
        join public.job_roles r on r.id = er.job_role_id
        where er.employee_id = e.id and strpos(lower(r.name), lower(p_search)) > 0
      ))
    and (p_role = '' or (public.can_manage_department(e.business_id, e.department_id)
      and e.role_title = p_role) or exists (
      select 1 from public.employee_job_roles er
      join public.job_roles r on r.id = er.job_role_id
      where er.employee_id = e.id and r.name = p_role
    ));
end;
$$;
revoke all on function public.list_people_directory(uuid, uuid, uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.list_people_directory(uuid, uuid, uuid, text, text, text)
  to authenticated;

create function public.save_employee_profile_checked_v2(
  p_business_id uuid,
  p_department_id uuid,
  p_employee_id uuid,
  p_name text,
  p_email text,
  p_role_title text,
  p_employment_type text,
  p_active boolean,
  p_expected_employment_revision integer,
  p_expected_profile_revision bigint,
  p_lifecycle_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
begin
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  if p_employee_id is not null then
    select * into v_employee from public.employees e
    where e.id = p_employee_id and e.business_id = p_business_id
      and e.department_id = p_department_id
    for update;
    if not found then
      raise exception 'Employee not found in this department';
    end if;
    if p_expected_profile_revision is null
      or v_employee.profile_revision <> p_expected_profile_revision then
      raise exception 'Employee profile changed; refresh before saving';
    end if;
    if v_employee.active is distinct from p_active and p_lifecycle_confirmed is not true then
      raise exception 'Confirm the employee status change';
    end if;
  elsif p_expected_profile_revision is not null then
    raise exception 'Invalid employee profile revision';
  end if;
  return public.save_employee_profile_checked(
    p_business_id, p_department_id, p_employee_id, p_name, p_email, p_role_title,
    p_employment_type, p_active, p_expected_employment_revision
  );
end;
$$;
revoke all on function public.save_employee_profile_checked_v2(
  uuid, uuid, uuid, text, text, text, text, boolean, integer, bigint, boolean
) from public, anon, service_role;
grant execute on function public.save_employee_profile_checked_v2(
  uuid, uuid, uuid, text, text, text, text, boolean, integer, bigint, boolean
) to authenticated;
