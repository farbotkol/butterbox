create table public.employee_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  employee_id uuid not null,
  starts_on date not null,
  ends_on date not null,
  exception_type text not null check (exception_type in ('unavailable', 'leave')),
  status text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id) on delete cascade,
  check (isfinite(starts_on) and isfinite(ends_on) and ends_on >= starts_on
    and ends_on - starts_on <= 365),
  check (
    (exception_type = 'unavailable' and status in ('active', 'cancelled'))
    or (exception_type = 'leave' and status in ('pending', 'approved', 'rejected', 'cancelled'))
  )
);

create index employee_availability_exceptions_venue_dates_idx
  on public.employee_availability_exceptions (venue_id, starts_on, ends_on);
create index employee_availability_exceptions_employee_idx
  on public.employee_availability_exceptions (employee_id, created_at desc);
create trigger employee_availability_exceptions_business_id_immutable
  before update of business_id on public.employee_availability_exceptions
  for each row execute function public.prevent_business_id_change();

alter table public.employee_availability_exceptions enable row level security;
create policy "Eligible members can view employee availability exceptions"
  on public.employee_availability_exceptions for select to authenticated
  using (public.can_view_employee_availability(employee_id));
revoke all on public.employee_availability_exceptions from public, anon, authenticated;
grant select on public.employee_availability_exceptions to authenticated;

create function public.request_availability_exception(
  p_business_id uuid,
  p_venue_id uuid,
  p_employee_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_exception_type text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_exception_id uuid;
begin
  select * into v_employee from public.employees
  where id = p_employee_id and business_id = p_business_id and venue_id = p_venue_id
  for update;
  if not found or auth.uid() is null
    or v_employee.auth_user_id is distinct from auth.uid()
    or not v_employee.active
    or not public.can_view_department(v_employee.business_id, v_employee.department_id) then
    raise exception 'Permission denied';
  end if;
  if p_exception_type is null or p_exception_type not in ('unavailable', 'leave')
    or p_starts_on is null or p_ends_on is null
    or not isfinite(p_starts_on) or not isfinite(p_ends_on)
    or p_ends_on < p_starts_on or p_ends_on - p_starts_on > 365 then
    raise exception 'Invalid availability exception';
  end if;

  insert into public.employee_availability_exceptions (
    business_id, venue_id, employee_id, starts_on, ends_on, exception_type,
    status, created_by, updated_by
  )
  values (
    p_business_id, p_venue_id, p_employee_id, p_starts_on, p_ends_on, p_exception_type,
    case when p_exception_type = 'leave' then 'pending' else 'active' end,
    auth.uid(), auth.uid()
  )
  returning id into v_exception_id;
  return v_exception_id;
end;
$$;

create function public.cancel_availability_exception(
  p_business_id uuid,
  p_venue_id uuid,
  p_exception_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exception public.employee_availability_exceptions%rowtype;
  v_employee public.employees%rowtype;
begin
  select * into v_exception from public.employee_availability_exceptions
  where id = p_exception_id and business_id = p_business_id and venue_id = p_venue_id;
  if not found then
    raise exception 'Permission denied';
  end if;
  select * into v_employee from public.employees
  where id = v_exception.employee_id and business_id = p_business_id and venue_id = p_venue_id
  for update;
  if not found or auth.uid() is null
    or v_employee.auth_user_id is distinct from auth.uid()
    or not v_employee.active
    or not public.can_view_department(v_employee.business_id, v_employee.department_id) then
    raise exception 'Permission denied';
  end if;
  select * into v_exception from public.employee_availability_exceptions
  where id = p_exception_id and business_id = p_business_id and venue_id = p_venue_id
    and employee_id = v_employee.id
  for update;
  if not found then
    raise exception 'Permission denied';
  end if;
  if v_exception.status not in ('active', 'pending') then
    raise exception 'Availability exception can no longer be cancelled';
  end if;

  update public.employee_availability_exceptions
  set status = 'cancelled', updated_at = now(), updated_by = auth.uid()
  where id = p_exception_id;
end;
$$;

create function public.review_leave_request(
  p_business_id uuid,
  p_venue_id uuid,
  p_exception_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exception public.employee_availability_exceptions%rowtype;
begin
  select * into v_exception from public.employee_availability_exceptions
  where id = p_exception_id and business_id = p_business_id and venue_id = p_venue_id
  for update;
  if not found or not public.can_manage_employee_in_any_department(v_exception.employee_id) then
    raise exception 'Permission denied';
  end if;
  if v_exception.exception_type <> 'leave' or p_status is null or not (
    (v_exception.status = 'pending' and p_status in ('approved', 'rejected'))
    or (v_exception.status = 'approved' and p_status = 'cancelled')
  ) then
    raise exception 'Leave request can no longer be changed';
  end if;

  update public.employee_availability_exceptions
  set status = p_status, updated_at = now(), updated_by = auth.uid()
  where id = p_exception_id;
end;
$$;

revoke all on function public.request_availability_exception(uuid, uuid, uuid, date, date, text) from public, anon;
revoke all on function public.cancel_availability_exception(uuid, uuid, uuid) from public, anon;
revoke all on function public.review_leave_request(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.request_availability_exception(uuid, uuid, uuid, date, date, text) to authenticated;
grant execute on function public.cancel_availability_exception(uuid, uuid, uuid) to authenticated;
grant execute on function public.review_leave_request(uuid, uuid, uuid, text) to authenticated;
