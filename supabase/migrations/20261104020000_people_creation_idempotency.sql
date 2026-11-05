create table public.employee_creation_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid not null,
  request_id uuid not null,
  employee_id uuid not null,
  venue_id uuid not null,
  request_hash bytea not null check (length(request_hash) = 32),
  created_at timestamptz not null default clock_timestamp(),
  primary key (business_id, actor_id, request_id),
  foreign key (employee_id, business_id, venue_id)
    references public.employees(id, business_id, venue_id) on delete cascade
);

alter table public.employee_creation_requests enable row level security;
revoke all on public.employee_creation_requests from public, anon, authenticated, service_role;

create function public.create_employee_profile_idempotent(
  p_business_id uuid, p_department_id uuid, p_name text, p_email text,
  p_role_title text, p_employment_type text, p_active boolean, p_request_id uuid
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
begin
  if p_request_id is null then raise exception 'Invalid employee creation request'; end if;
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  perform pg_advisory_xact_lock(hashtextextended(
    'employee-creation:' || p_business_id::text || ':' || auth.uid()::text || ':' || p_request_id::text, 0
  ));
  v_hash := extensions.digest(jsonb_build_array(
    p_department_id, trim(p_name), nullif(lower(trim(coalesce(p_email, ''))), ''),
    trim(p_role_title), p_employment_type, p_active
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

  v_employee_id := public.save_employee_profile_checked_v2(
    p_business_id, p_department_id, null, p_name, p_email, p_role_title,
    p_employment_type, p_active, 0, null, false
  );
  insert into public.employee_creation_requests (business_id, actor_id, request_id, employee_id, venue_id, request_hash)
  select p_business_id, auth.uid(), p_request_id, e.id, e.venue_id, v_hash
  from public.employees e where e.id = v_employee_id and e.business_id = p_business_id;
  if not found then raise exception 'Employee unavailable or permission denied'; end if;
  return v_employee_id;
end;
$$;
revoke all on function public.create_employee_profile_idempotent(uuid,uuid,text,text,text,text,boolean,uuid)
  from public, anon, service_role;
grant execute on function public.create_employee_profile_idempotent(uuid,uuid,text,text,text,text,boolean,uuid)
  to authenticated;
