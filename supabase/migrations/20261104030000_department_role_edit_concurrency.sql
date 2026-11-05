create function public.save_department_checked(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid,
  p_name text, p_active boolean, p_expected_name text, p_expected_active boolean,
  p_confirm_lifecycle boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_department public.departments%rowtype;
begin
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid()
    and (m.role in ('owner', 'admin')
      or (m.role = 'general_manager' and (m.venue_id is null or m.venue_id = p_venue_id)))
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('department-names:' || p_venue_id::text, 0));
  if p_department_id is null then
    if p_expected_name is not null or p_expected_active is not null then
      raise exception 'Invalid department details';
    end if;
    return public.save_department(p_business_id, p_venue_id, null, p_name, p_active);
  end if;

  select * into v_department from public.departments d
  where d.id = p_department_id and d.business_id = p_business_id and d.venue_id = p_venue_id
  for update;
  if not found then
    raise exception 'Department not found';
  end if;
  if p_expected_name is null or p_expected_active is null or p_active is null then
    raise exception 'Invalid department details';
  end if;
  if v_department.name is distinct from p_expected_name or v_department.active is distinct from p_expected_active then
    raise exception 'Department changed; refresh before saving';
  end if;
  if p_active is distinct from v_department.active and p_confirm_lifecycle is distinct from true then
    raise exception 'Confirm department status change';
  end if;
  return public.save_department(p_business_id, p_venue_id, p_department_id, p_name, p_active);
end;
$$;

create function public.save_job_role_checked(
  p_business_id uuid, p_department_id uuid, p_job_role_id uuid,
  p_name text, p_active boolean, p_expected_name text, p_expected_active boolean,
  p_confirm_lifecycle boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.job_roles%rowtype;
begin
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  perform 1 from public.departments d
  where d.id = p_department_id and d.business_id = p_business_id
  for share;
  if not found then
    raise exception 'Department not found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('job-role-names:' || p_department_id::text, 0));
  if p_job_role_id is null then
    if p_expected_name is not null or p_expected_active is not null then
      raise exception 'Invalid job role details';
    end if;
    return public.save_job_role(p_business_id, p_department_id, null, p_name, p_active);
  end if;
  select * into v_role from public.job_roles r
  where r.id = p_job_role_id and r.business_id = p_business_id and r.department_id = p_department_id
  for update;
  if not found then
    raise exception 'Job role not found';
  end if;
  if p_expected_name is null or p_expected_active is null or p_active is null then
    raise exception 'Invalid job role details';
  end if;
  if v_role.name is distinct from p_expected_name or v_role.active is distinct from p_expected_active then
    raise exception 'Job role changed; refresh before saving';
  end if;
  if p_active is distinct from v_role.active and p_confirm_lifecycle is distinct from true then
    raise exception 'Confirm job role status change';
  end if;
  return public.save_job_role(p_business_id, p_department_id, p_job_role_id, p_name, p_active);
end;
$$;

create function public.set_job_role_restriction_checked(
  p_business_id uuid, p_department_id uuid, p_job_role_id uuid,
  p_mode text, p_restricted boolean, p_expected_name text, p_expected_active boolean,
  p_expected_auto boolean, p_expected_manual boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.job_roles%rowtype;
begin
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  select * into v_role from public.job_roles r
  where r.id = p_job_role_id and r.business_id = p_business_id and r.department_id = p_department_id
  for update;
  if not found then
    raise exception 'Job role not found';
  end if;
  if p_mode not in ('automatic', 'manual') or p_mode is null or p_restricted is null
    or p_expected_name is null or p_expected_active is null
    or p_expected_auto is null or p_expected_manual is null then
    raise exception 'Invalid restriction';
  end if;
  if v_role.name is distinct from p_expected_name or v_role.active is distinct from p_expected_active
    or v_role.restrict_auto_assignment is distinct from p_expected_auto
    or v_role.restrict_manual_assignment is distinct from p_expected_manual then
    raise exception 'Role restrictions changed; refresh before saving';
  end if;
  if p_mode = 'automatic' then
    perform public.set_job_role_auto_restriction(p_business_id, p_job_role_id, p_restricted);
  else
    perform public.set_job_role_manual_restriction(p_business_id, p_job_role_id, p_restricted);
  end if;
end;
$$;

revoke all on function public.save_department_checked(uuid, uuid, uuid, text, boolean, text, boolean, boolean)
  from public, anon;
revoke all on function public.save_job_role_checked(uuid, uuid, uuid, text, boolean, text, boolean, boolean)
  from public, anon;
revoke all on function public.set_job_role_restriction_checked(uuid, uuid, uuid, text, boolean, text, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.save_department_checked(uuid, uuid, uuid, text, boolean, text, boolean, boolean)
  to authenticated;
grant execute on function public.save_job_role_checked(uuid, uuid, uuid, text, boolean, text, boolean, boolean)
  to authenticated;
grant execute on function public.set_job_role_restriction_checked(uuid, uuid, uuid, text, boolean, text, boolean, boolean, boolean)
  to authenticated;
