alter table public.employees
  add column mobile_phone text,
  add constraint employees_mobile_phone_e164 check (
    mobile_phone is null or (
      mobile_phone ~ '^\+[1-9][0-9]{7,14}$'
      and mobile_phone !~ '^\+610'
    )
  );

create function public.normalize_employee_mobile(p_mobile_phone text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_number text;
begin
  if p_mobile_phone is null then return null; end if;
  if char_length(p_mobile_phone) > 64 then raise exception 'Invalid mobile number'; end if;
  v_number := regexp_replace(trim(p_mobile_phone), '[[:space:]]', '', 'g');
  v_number := replace(replace(replace(v_number, '(', ''), ')', ''), '-', '');
  v_number := replace(v_number, '.', '');
  if v_number = '' then return null; end if;
  if v_number ~ '^04[0-9]{8}$' then
    return '+61' || substr(v_number, 2);
  end if;
  if v_number ~ '^\+[1-9][0-9]{7,14}$' and v_number !~ '^\+610' then
    return v_number;
  end if;
  raise exception 'Invalid mobile number';
end;
$$;
revoke all on function public.normalize_employee_mobile(text) from public, anon, authenticated, service_role;

create function public.save_employee_profile_mobile_checked_v3(
  p_business_id uuid, p_department_id uuid, p_employee_id uuid, p_name text,
  p_email text, p_role_title text, p_employment_type text, p_active boolean,
  p_expected_employment_revision integer, p_expected_profile_revision bigint,
  p_lifecycle_confirmed boolean, p_mobile_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_mobile_phone text := public.normalize_employee_mobile(p_mobile_phone);
begin
  v_id := public.save_employee_profile_checked_v2(
    p_business_id, p_department_id, p_employee_id, p_name, p_email,
    p_role_title, p_employment_type, p_active, p_expected_employment_revision,
    p_expected_profile_revision, p_lifecycle_confirmed
  );
  update public.employees
  set mobile_phone = v_mobile_phone
  where id = v_id and business_id = p_business_id and department_id = p_department_id
    and mobile_phone is distinct from v_mobile_phone;
  return v_id;
end;
$$;
revoke all on function public.save_employee_profile_mobile_checked_v3(
  uuid, uuid, uuid, text, text, text, text, boolean, integer, bigint, boolean, text
) from public, anon, service_role;
grant execute on function public.save_employee_profile_mobile_checked_v3(
  uuid, uuid, uuid, text, text, text, text, boolean, integer, bigint, boolean, text
) to authenticated;

create function public.create_employee_profile_idempotent(
  p_business_id uuid, p_department_id uuid, p_name text, p_email text,
  p_role_title text, p_employment_type text, p_active boolean,
  p_mobile_phone text, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.employee_creation_requests%rowtype;
  v_hash bytea;
  v_employee_id uuid;
  v_mobile_phone text := public.normalize_employee_mobile(p_mobile_phone);
begin
  if p_request_id is null then raise exception 'Invalid employee creation request'; end if;
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  perform pg_advisory_xact_lock(hashtextextended(
    'employee-creation:' || p_business_id::text || ':' || auth.uid()::text || ':' || p_request_id::text, 0
  ));
  v_hash := extensions.digest(jsonb_build_array(
    p_department_id, trim(p_name), nullif(lower(trim(coalesce(p_email, ''))), ''),
    trim(p_role_title), p_employment_type, p_active, v_mobile_phone
  )::text, 'sha256');
  select * into v_request from public.employee_creation_requests r
  where r.business_id = p_business_id and r.actor_id = auth.uid() and r.request_id = p_request_id;
  if found then
    if v_request.request_hash is distinct from v_hash then raise exception 'Request identifier already used'; end if;
    if not exists (
      select 1 from public.employees e where e.id = v_request.employee_id
        and e.business_id = p_business_id and e.department_id = p_department_id
    ) then raise exception 'Employee unavailable or permission denied'; end if;
    return v_request.employee_id;
  end if;

  v_employee_id := public.save_employee_profile_mobile_checked_v3(
    p_business_id, p_department_id, null, p_name, p_email, p_role_title,
    p_employment_type, p_active, 0, null, false, v_mobile_phone
  );
  insert into public.employee_creation_requests (business_id, actor_id, request_id, employee_id, venue_id, request_hash)
  select p_business_id, auth.uid(), p_request_id, e.id, e.venue_id, v_hash
  from public.employees e where e.id = v_employee_id and e.business_id = p_business_id;
  if not found then raise exception 'Employee unavailable or permission denied'; end if;
  return v_employee_id;
end;
$$;
revoke all on function public.create_employee_profile_idempotent(
  uuid, uuid, text, text, text, text, boolean, text, uuid
) from public, anon, service_role;
grant execute on function public.create_employee_profile_idempotent(
  uuid, uuid, text, text, text, text, boolean, text, uuid
) to authenticated;
