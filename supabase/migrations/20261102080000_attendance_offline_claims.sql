create table public.attendance_offline_claims (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  department_id uuid not null,
  employee_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  event_type text not null check (event_type in ('clock_in', 'clock_out')),
  claimed_at timestamptz not null check (isfinite(claimed_at)),
  received_at timestamptz not null default clock_timestamp(),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id) on delete cascade,
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id) on delete cascade,
  unique (business_id, actor_id, request_id)
);

create index attendance_offline_claims_scope_idx
  on public.attendance_offline_claims (business_id, venue_id, department_id, received_at);

create trigger attendance_offline_claims_immutable
  before update or delete on public.attendance_offline_claims
  for each row execute function public.prevent_original_attendance_mutation();

alter table public.attendance_offline_claims enable row level security;
revoke all on public.attendance_offline_claims from public, anon, authenticated, service_role;

create function public.can_view_attendance_offline_claim(p_claim_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.attendance_offline_claims c
    where c.id = p_claim_id and (
      public.can_manage_department(c.business_id, c.department_id)
      or (
        c.actor_id = auth.uid()
        and public.can_view_department(c.business_id, c.department_id)
        and exists (
          select 1 from public.employees e
          join public.employee_departments ed
            on ed.employee_id = e.id and ed.business_id = c.business_id
              and ed.department_id = c.department_id
          where e.id = c.employee_id and e.business_id = c.business_id
            and e.venue_id = c.venue_id and e.auth_user_id = auth.uid()
        )
      )
    )
  );
$$;
revoke all on function public.can_view_attendance_offline_claim(uuid)
  from public, anon, service_role;
grant execute on function public.can_view_attendance_offline_claim(uuid) to authenticated;

create policy "Members can view scoped offline attendance claims"
  on public.attendance_offline_claims for select to authenticated
  using (public.can_view_attendance_offline_claim(id));
grant select on public.attendance_offline_claims to authenticated;

create function public.submit_attendance_offline_claim(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_employee_id uuid,
  p_actor_id uuid, p_request_id uuid, p_event_type text, p_claimed_at timestamptz
)
returns table (claim_id uuid, received_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_department public.departments%rowtype;
  v_claim public.attendance_offline_claims%rowtype;
begin
  if p_business_id is null or p_venue_id is null or p_department_id is null
    or p_employee_id is null or p_actor_id is null or p_request_id is null
    or p_event_type is null or p_event_type not in ('clock_in', 'clock_out')
    or p_claimed_at is null or not isfinite(p_claimed_at) then
    raise exception 'Invalid offline attendance claim';
  end if;
  if auth.uid() is distinct from p_actor_id then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_view_department(p_business_id, p_department_id) or not exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.business_id = p_business_id
      and e.venue_id = p_venue_id and e.auth_user_id = auth.uid()
  ) then
    raise exception 'Employee not found or permission denied';
  end if;
  perform public.lock_attendance_identity(p_business_id, p_employee_id);
  select e.* into v_employee from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id
    and e.venue_id = p_venue_id and e.auth_user_id = auth.uid()
  for share;
  if not found or not public.can_view_department(p_business_id, p_department_id) then
    raise exception 'Employee not found or permission denied';
  end if;
  select d.* into v_department from public.departments d
  where d.id = p_department_id and d.business_id = p_business_id and d.venue_id = p_venue_id
  for share;
  if not found then
    raise exception 'Employee not found or permission denied';
  end if;

  select c.* into v_claim from public.attendance_offline_claims c
  where c.business_id = p_business_id and c.actor_id = auth.uid() and c.request_id = p_request_id;
  if found then
    if v_claim.venue_id <> p_venue_id or v_claim.department_id <> p_department_id
      or v_claim.employee_id <> p_employee_id or v_claim.event_type <> p_event_type
      or v_claim.claimed_at <> p_claimed_at then
      raise exception 'Request identifier already used';
    end if;
    return query select v_claim.id, v_claim.received_at;
    return;
  end if;
  perform 1 from public.employee_departments ed
  where ed.business_id = p_business_id and ed.employee_id = p_employee_id
    and ed.department_id = p_department_id
  for share;
  if not found or not v_employee.active or not v_department.active then
    raise exception 'Employee or department is unavailable';
  end if;
  insert into public.attendance_offline_claims (
    business_id, venue_id, department_id, employee_id, actor_id,
    request_id, event_type, claimed_at
  ) values (
    p_business_id, p_venue_id, p_department_id, p_employee_id, auth.uid(),
    p_request_id, p_event_type, p_claimed_at
  ) returning * into v_claim;
  return query select v_claim.id, v_claim.received_at;
end;
$$;

revoke all on function public.submit_attendance_offline_claim(
  uuid, uuid, uuid, uuid, uuid, uuid, text, timestamptz
) from public, anon, service_role;
grant execute on function public.submit_attendance_offline_claim(
  uuid, uuid, uuid, uuid, uuid, uuid, text, timestamptz
) to authenticated;

create function public.list_attendance_offline_claims(p_business_id uuid, p_venue_id uuid)
returns table (
  id uuid, employee_id uuid, employee_name text, department_id uuid, department_name text,
  event_type text, claimed_at timestamptz, received_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select c.id, c.employee_id, e.name, c.department_id, d.name,
    c.event_type, c.claimed_at, c.received_at
  from public.attendance_offline_claims c
  join public.employees e on e.id = c.employee_id and e.business_id = c.business_id
  join public.departments d on d.id = c.department_id and d.business_id = c.business_id
  where c.business_id = p_business_id and c.venue_id = p_venue_id
    and public.can_view_attendance_offline_claim(c.id);
end;
$$;
revoke all on function public.list_attendance_offline_claims(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_attendance_offline_claims(uuid, uuid) to authenticated;
