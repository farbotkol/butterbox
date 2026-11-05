alter table public.job_roles
  add column restrict_manual_assignment boolean not null default false;

create function public.set_job_role_manual_restriction(
  p_business_id uuid,
  p_job_role_id uuid,
  p_restricted boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.job_roles%rowtype;
begin
  select * into v_role from public.job_roles
  where id = p_job_role_id and business_id = p_business_id;
  if not found or not public.can_manage_department(p_business_id, v_role.department_id) then
    raise exception 'Permission denied';
  end if;
  if p_restricted is null then
    raise exception 'Invalid restriction';
  end if;
  update public.job_roles
  set restrict_manual_assignment = p_restricted
  where id = p_job_role_id;
end;
$$;

create or replace function public.ensure_qualified_shift_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.employee_id is null or new.status <> 'scheduled' then
    return new;
  end if;
  -- Existing assignments are not invalidated when a new policy is enabled.
  if tg_op = 'UPDATE' and old.status = 'scheduled'
    and new.employee_id = old.employee_id
    and new.department_id = old.department_id
    and lower(trim(new.role_title)) = lower(trim(old.role_title)) then
    return new;
  end if;
  if exists (
    select 1 from public.job_roles r
    where r.business_id = new.business_id and r.venue_id = new.venue_id
      and r.department_id = new.department_id
      and lower(r.name) = lower(trim(new.role_title))
      and r.restrict_manual_assignment
      and not exists (
        select 1 from public.employee_job_roles er
        where er.employee_id = new.employee_id and er.job_role_id = r.id
      )
  ) then
    raise exception 'Employee is not qualified for this role';
  end if;
  return new;
end;
$$;

create trigger shifts_require_qualified_assignment
  before insert or update of employee_id, department_id, role_title, status on public.shifts
  for each row execute function public.ensure_qualified_shift_assignment();

create or replace function public.save_shift_auto_assign(
  p_business_id uuid,
  p_venue_id uuid,
  p_department_id uuid,
  p_role_title text,
  p_start_local timestamp without time zone,
  p_end_local timestamp without time zone,
  p_break_minutes integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_start timestamptz;
  v_end timestamptz;
  v_employee_id uuid;
begin
  if not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if length(trim(coalesce(p_role_title, ''))) not between 1 and 80
    or p_break_minutes is null or p_break_minutes not between 0 and 240
    or p_start_local is null or p_end_local is null then
    raise exception 'Invalid shift details';
  end if;
  select v.timezone into v_timezone
  from public.venues v
  join public.departments d on d.venue_id = v.id and d.business_id = v.business_id
  where v.id = p_venue_id and v.business_id = p_business_id
    and d.id = p_department_id and d.active
  for share of d;
  if v_timezone is null then
    raise exception 'Venue or active department not found';
  end if;

  perform 1 from public.job_roles r
  where r.department_id = p_department_id and lower(r.name) = lower(trim(p_role_title))
  for share;
  if exists (
    select 1 from public.job_roles r
    where r.department_id = p_department_id and lower(r.name) = lower(trim(p_role_title))
      and not r.active
  ) then
    raise exception 'Job role is inactive';
  end if;
  select bounds.starts_at, bounds.ends_at into v_start, v_end
  from public.shift_time_bounds(v_timezone, p_start_local, p_end_local) bounds;

  for v_employee_id in
    select e.id from public.employees e
    join public.employee_departments ed
      on ed.employee_id = e.id and ed.department_id = p_department_id
    where e.business_id = p_business_id and e.venue_id = p_venue_id and e.active
    order by lower(e.name), e.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_employee_id::text, 0));
    perform 1 from public.employees e
    where e.id = v_employee_id and e.business_id = p_business_id
      and e.venue_id = p_venue_id and e.active
    for update;
    if not found or not exists (
      select 1 from public.employee_departments ed
      where ed.employee_id = v_employee_id and ed.department_id = p_department_id
    ) then
      continue;
    end if;
    if exists (
      select 1 from public.job_roles r
      where r.department_id = p_department_id and lower(r.name) = lower(trim(p_role_title))
        and (r.restrict_auto_assignment or r.restrict_manual_assignment)
        and not exists (
          select 1 from public.employee_job_roles er
          where er.employee_id = v_employee_id and er.job_role_id = r.id
        )
    ) then
      continue;
    end if;
    if exists (
      select 1 from public.shifts s
      where s.employee_id = v_employee_id and s.status = 'scheduled'
        and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
    ) then
      continue;
    end if;
    return public.save_shift(
      p_business_id, p_venue_id, p_department_id, v_employee_id,
      p_role_title, p_start_local, p_end_local, p_break_minutes
    );
  end loop;
  raise exception 'No eligible employee available for automatic assignment';
end;
$$;

revoke all on function public.ensure_qualified_shift_assignment() from public, anon, authenticated;
revoke all on function public.set_job_role_manual_restriction(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_job_role_manual_restriction(uuid, uuid, boolean) to authenticated;
