create or replace function public.is_own_linked_shift(
  p_business_id uuid,
  p_employee_id uuid,
  p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.employees e
    join public.employee_departments ed
      on ed.employee_id = e.id and ed.department_id = p_department_id
    where e.id = p_employee_id
      and e.business_id = p_business_id
      and e.auth_user_id = auth.uid()
      and public.can_view_department(e.business_id, e.department_id)
  );
$$;

create function public.list_own_linked_roster_departments(
  p_business_id uuid,
  p_venue_id uuid
)
returns table (employee_id uuid, department_id uuid, name text, active boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, d.id, d.name, d.active
  from public.employees e
  join public.employee_departments ed on ed.employee_id = e.id
  join public.departments d
    on d.id = ed.department_id
    and d.business_id = e.business_id
    and d.venue_id = e.venue_id
  where e.business_id = p_business_id
    and e.venue_id = p_venue_id
    and e.auth_user_id = auth.uid()
    and public.can_view_department(e.business_id, e.department_id);
$$;

revoke all on function public.list_own_linked_roster_departments(uuid, uuid) from public, anon;
grant execute on function public.list_own_linked_roster_departments(uuid, uuid) to authenticated;
