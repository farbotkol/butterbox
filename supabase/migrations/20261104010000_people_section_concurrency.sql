-- Compare the state displayed by each focused editor while holding the same
-- locks used by the existing mutations. The original RPCs remain authoritative.
create or replace function public.people_uuid_set(p_ids uuid[])
returns uuid[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
  from unnest(p_ids) as items(id);
$$;
revoke all on function public.people_uuid_set(uuid[]) from public, anon, authenticated, service_role;

create or replace function public.set_employee_departments_checked(
  p_business_id uuid, p_employee_id uuid, p_department_ids uuid[], p_expected_department_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_current uuid[];
begin
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid()
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  select * into v_employee from public.employees
  where id = p_employee_id and business_id = p_business_id
  for update;
  if not found or not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and (m.role in ('owner', 'admin')
        or (m.role = 'general_manager' and (m.venue_id is null or m.venue_id = v_employee.venue_id)))
  ) then
    raise exception 'Permission denied';
  end if;
  if p_expected_department_ids is null or cardinality(p_expected_department_ids) > 200
    or array_position(p_expected_department_ids, null) is not null then
    raise exception 'Invalid department snapshot';
  end if;
  select coalesce(array_agg(ed.department_id order by ed.department_id), '{}'::uuid[])
  into v_current from public.employee_departments ed
  where ed.business_id = p_business_id and ed.employee_id = p_employee_id;
  if v_current is distinct from public.people_uuid_set(p_expected_department_ids) then
    raise exception 'Employee departments changed; refresh before saving';
  end if;
  perform public.set_employee_departments(p_business_id, p_employee_id, p_department_ids);
end;
$$;

create or replace function public.set_employee_eligible_roles_checked(
  p_business_id uuid, p_employee_id uuid, p_department_id uuid,
  p_job_role_ids uuid[], p_expected_job_role_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current uuid[];
begin
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  perform 1 from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id
  for update;
  if not found or not exists (
    select 1 from public.employee_departments ed
    where ed.employee_id = p_employee_id and ed.business_id = p_business_id
      and ed.department_id = p_department_id
  ) then
    raise exception 'Employee is not eligible for this department';
  end if;
  if p_expected_job_role_ids is null or cardinality(p_expected_job_role_ids) > 200
    or array_position(p_expected_job_role_ids, null) is not null then
    raise exception 'Invalid role snapshot';
  end if;
  select coalesce(array_agg(er.job_role_id order by er.job_role_id), '{}'::uuid[])
  into v_current from public.employee_job_roles er
  where er.business_id = p_business_id and er.employee_id = p_employee_id
    and er.department_id = p_department_id;
  if v_current is distinct from public.people_uuid_set(p_expected_job_role_ids) then
    raise exception 'Employee roles changed; refresh before saving';
  end if;
  perform public.set_employee_eligible_roles(p_business_id, p_employee_id, p_department_id, p_job_role_ids);
end;
$$;

create or replace function public.set_employee_primary_role_checked(
  p_business_id uuid, p_employee_id uuid, p_job_role_id uuid, p_expected_profile_revision bigint
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
begin
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid()
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  select * into v_employee from public.employees
  where id = p_employee_id and business_id = p_business_id
  for update;
  if not found or not public.can_manage_department(p_business_id, v_employee.department_id) then
    raise exception 'Permission denied';
  end if;
  if p_expected_profile_revision is null or v_employee.profile_revision <> p_expected_profile_revision then
    raise exception 'Employee profile changed; refresh before saving';
  end if;
  perform public.set_employee_primary_role(p_business_id, p_employee_id, p_job_role_id);
end;
$$;

create or replace function public.set_employee_auth_user_checked(
  p_business_id uuid, p_employee_id uuid, p_user_id uuid, p_expected_profile_revision bigint
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision bigint;
begin
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  select e.profile_revision into v_revision from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Employee not found';
  end if;
  if p_expected_profile_revision is null or v_revision <> p_expected_profile_revision then
    raise exception 'Employee profile changed; refresh before saving';
  end if;
  perform public.set_employee_auth_user(p_business_id, p_employee_id, p_user_id);
end;
$$;

create or replace function public.check_shared_worker_snapshot(
  p_business_id uuid, p_venue_id uuid, p_employee_id uuid, p_expected_linked_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current uuid[];
begin
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform 1 from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id and e.venue_id = p_venue_id
  for share;
  if not found then
    raise exception 'Employee profile not found';
  end if;
  if p_expected_linked_ids is null or cardinality(p_expected_linked_ids) > 1000
    or array_position(p_expected_linked_ids, null) is not null then
    raise exception 'Invalid shared-worker snapshot';
  end if;
  select coalesce(array_agg(linked.employee_id order by linked.employee_id), '{}'::uuid[])
  into v_current
  from public.shared_worker_profiles own
  join public.shared_worker_profiles linked on linked.shared_worker_id = own.shared_worker_id
    and linked.employee_id <> own.employee_id
  where own.business_id = p_business_id and own.employee_id = p_employee_id;
  if v_current is distinct from public.people_uuid_set(p_expected_linked_ids) then
    raise exception 'Shared-worker links changed; refresh before saving';
  end if;
end;
$$;
revoke all on function public.check_shared_worker_snapshot(uuid, uuid, uuid, uuid[])
  from public, anon, authenticated, service_role;

create or replace function public.link_shared_worker_profiles_checked(
  p_business_id uuid, p_venue_id uuid, p_employee_id uuid, p_other_employee_id uuid, p_expected_linked_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.check_shared_worker_snapshot(p_business_id, p_venue_id, p_employee_id, p_expected_linked_ids);
  perform public.link_shared_worker_profiles(p_business_id, p_venue_id, p_employee_id, p_other_employee_id);
end;
$$;

create or replace function public.unlink_shared_worker_profile_checked(
  p_business_id uuid, p_venue_id uuid, p_employee_id uuid, p_expected_linked_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.check_shared_worker_snapshot(p_business_id, p_venue_id, p_employee_id, p_expected_linked_ids);
  perform public.unlink_shared_worker_profile(p_business_id, p_venue_id, p_employee_id);
end;
$$;

revoke all on function public.set_employee_departments_checked(uuid, uuid, uuid[], uuid[]),
  public.set_employee_eligible_roles_checked(uuid, uuid, uuid, uuid[], uuid[]),
  public.set_employee_primary_role_checked(uuid, uuid, uuid, bigint),
  public.set_employee_auth_user_checked(uuid, uuid, uuid, bigint),
  public.link_shared_worker_profiles_checked(uuid, uuid, uuid, uuid, uuid[]),
  public.unlink_shared_worker_profile_checked(uuid, uuid, uuid, uuid[])
from public, anon, authenticated, service_role;
grant execute on function public.set_employee_departments_checked(uuid, uuid, uuid[], uuid[]),
  public.set_employee_eligible_roles_checked(uuid, uuid, uuid, uuid[], uuid[]),
  public.set_employee_primary_role_checked(uuid, uuid, uuid, bigint),
  public.set_employee_auth_user_checked(uuid, uuid, uuid, bigint),
  public.link_shared_worker_profiles_checked(uuid, uuid, uuid, uuid, uuid[]),
  public.unlink_shared_worker_profile_checked(uuid, uuid, uuid, uuid[])
to authenticated;
