create table public.employee_availability_patterns (
  employee_id uuid primary key,
  business_id uuid not null,
  venue_id uuid not null,
  updated_at timestamptz not null default now(),
  unique (employee_id, business_id, venue_id),
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id) on delete cascade
);

create table public.employee_availability_intervals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 0 and 1439),
  foreign key (employee_id, business_id, venue_id)
    references public.employee_availability_patterns (employee_id, business_id, venue_id)
    on delete cascade
);

create index employee_availability_intervals_employee_idx
  on public.employee_availability_intervals (employee_id, weekday, start_minute);

create trigger employee_availability_patterns_business_id_immutable
  before update of business_id on public.employee_availability_patterns
  for each row execute function public.prevent_business_id_change();
create trigger employee_availability_intervals_business_id_immutable
  before update of business_id on public.employee_availability_intervals
  for each row execute function public.prevent_business_id_change();

create function public.can_view_employee_availability(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id
      and (
        public.can_manage_employee_in_any_department(e.id)
        or (
          e.auth_user_id = auth.uid()
          and public.can_view_department(e.business_id, e.department_id)
        )
      )
  );
$$;

alter table public.employee_availability_patterns enable row level security;
alter table public.employee_availability_intervals enable row level security;

create policy "Eligible members can view employee availability patterns"
  on public.employee_availability_patterns for select to authenticated
  using (public.can_view_employee_availability(employee_id));
create policy "Eligible members can view employee availability intervals"
  on public.employee_availability_intervals for select to authenticated
  using (public.can_view_employee_availability(employee_id));

revoke all on public.employee_availability_patterns, public.employee_availability_intervals
  from public, anon, authenticated;
grant select on public.employee_availability_patterns, public.employee_availability_intervals
  to authenticated;
revoke all on function public.can_view_employee_availability(uuid) from public, anon;
grant execute on function public.can_view_employee_availability(uuid) to authenticated;

create function public.set_employee_auth_user(
  p_business_id uuid,
  p_employee_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
begin
  if not public.has_business_role(p_business_id, array['owner']::text[]) then
    raise exception 'Permission denied';
  end if;

  select * into v_employee from public.employees
  where id = p_employee_id and business_id = p_business_id
  for update;
  if not found then
    raise exception 'Employee not found';
  end if;

  if p_user_id is not null and not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = p_user_id
      and (
        m.role in ('owner', 'admin')
        or (
          (m.venue_id is null or m.venue_id = v_employee.venue_id)
          and (
            m.role = 'general_manager'
            or (
              m.role in ('foh_manager', 'boh_manager', 'department_manager')
              and m.department_id = v_employee.department_id
            )
            or (
              m.role = 'employee'
              and (m.department_id is null or m.department_id = v_employee.department_id)
            )
          )
        )
      )
  ) then
    raise exception 'Member is not eligible for this employee';
  end if;

  update public.employees set auth_user_id = p_user_id
  where id = p_employee_id;
end;
$$;

create function public.set_employee_recurring_availability(
  p_business_id uuid,
  p_employee_id uuid,
  p_intervals jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
begin
  select * into v_employee from public.employees
  where id = p_employee_id and business_id = p_business_id
  for update;
  if not found or auth.uid() is null
    or v_employee.auth_user_id is distinct from auth.uid()
    or not v_employee.active
    or not public.can_view_department(v_employee.business_id, v_employee.department_id) then
    raise exception 'Permission denied';
  end if;

  if jsonb_typeof(p_intervals) is distinct from 'array' then
    raise exception 'Invalid availability intervals';
  end if;
  if jsonb_array_length(p_intervals) > 56 or exists (
    select 1 from jsonb_array_elements(p_intervals) as entries(item)
    where jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item -> 'weekday') is distinct from 'number'
      or (item ->> 'weekday') !~ '^[1-7]$'
      or jsonb_typeof(item -> 'start') is distinct from 'string'
      or (item ->> 'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or jsonb_typeof(item -> 'end') is distinct from 'string'
      or (item ->> 'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then
    raise exception 'Invalid availability intervals';
  end if;

  insert into public.employee_availability_patterns (employee_id, business_id, venue_id)
  values (v_employee.id, v_employee.business_id, v_employee.venue_id)
  on conflict (employee_id) do update set updated_at = now();

  delete from public.employee_availability_intervals where employee_id = v_employee.id;
  insert into public.employee_availability_intervals
    (employee_id, business_id, venue_id, weekday, start_minute, end_minute)
  select v_employee.id, v_employee.business_id, v_employee.venue_id,
    (item ->> 'weekday')::smallint,
    (substring(item ->> 'start' from 1 for 2)::integer * 60
      + substring(item ->> 'start' from 4 for 2)::integer)::smallint,
    (substring(item ->> 'end' from 1 for 2)::integer * 60
      + substring(item ->> 'end' from 4 for 2)::integer)::smallint
  from jsonb_array_elements(p_intervals) as entries(item);
end;
$$;

revoke all on function public.set_employee_auth_user(uuid, uuid, uuid) from public, anon;
revoke all on function public.set_employee_recurring_availability(uuid, uuid, jsonb) from public, anon;
grant execute on function public.set_employee_auth_user(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_employee_recurring_availability(uuid, uuid, jsonb) to authenticated;
