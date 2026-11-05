alter table public.business_memberships
  add column venue_id uuid,
  add constraint business_memberships_venue_scope_fkey
    foreign key (venue_id, business_id)
    references public.venues (id, business_id);

update public.business_memberships m
set venue_id = d.venue_id
from public.departments d
where m.department_id = d.id and m.business_id = d.business_id;

alter table public.business_memberships
  add constraint business_memberships_department_venue_scope_fkey
    foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id);

create function public.can_view_venue(p_business_id uuid, p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and (
        m.role in ('owner', 'admin')
        or m.venue_id = p_venue_id
        or (
          m.venue_id is null
          and (
            m.department_id is null
            or exists (
              select 1 from public.departments d
              where d.id = m.department_id
                and d.business_id = p_business_id
                and d.venue_id = p_venue_id
            )
          )
        )
      )
  );
$$;

create function public.can_view_department(p_business_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships m
    join public.departments d
      on d.id = p_department_id and d.business_id = m.business_id
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and (
        m.role in ('owner', 'admin')
        or (
          (m.venue_id is null or m.venue_id = d.venue_id)
          and (
            m.role = 'general_manager'
            or (m.role in ('foh_manager', 'boh_manager', 'department_manager')
                and m.department_id = d.id)
            or (m.role = 'employee'
                and (m.department_id is null or m.department_id = d.id))
          )
        )
      )
  );
$$;

create or replace function public.can_manage_department(
  p_business_id uuid,
  p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships m
    join public.departments d
      on d.id = p_department_id and d.business_id = m.business_id
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and (
        m.role in ('owner', 'admin')
        or (
          (m.venue_id is null or m.venue_id = d.venue_id)
          and (
            m.role = 'general_manager'
            or (m.role in ('foh_manager', 'boh_manager', 'department_manager')
                and m.department_id = d.id)
          )
        )
      )
  );
$$;

create function public.can_view_member_scope(p_business_id uuid, p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and (
        m.role in ('owner', 'admin')
        or (m.role = 'general_manager'
            and (m.venue_id is null or m.venue_id = p_venue_id))
      )
  );
$$;

drop policy "Users can view their memberships" on public.business_memberships;
create policy "Users can view permitted memberships"
  on public.business_memberships for select to authenticated
  using (user_id = auth.uid() or public.can_view_member_scope(business_id, venue_id));

drop policy "Business members can view venues" on public.venues;
create policy "Members can view permitted venues"
  on public.venues for select to authenticated
  using (public.can_view_venue(business_id, id));

drop policy "Business members can view departments" on public.departments;
create policy "Members can view permitted departments"
  on public.departments for select to authenticated
  using (public.can_view_department(business_id, id));

drop policy "Managers can view job roles in their department" on public.job_roles;
create policy "Members can view permitted job roles"
  on public.job_roles for select to authenticated
  using (public.can_view_department(business_id, department_id));

drop policy "Managers and employees can view eligible employees" on public.employees;
create policy "Managers and employees can view eligible employees"
  on public.employees for select to authenticated
  using (
    public.can_manage_department(business_id, department_id)
    or (auth_user_id = auth.uid() and public.can_view_department(business_id, department_id))
  );

drop policy "Managers and employees can view eligible shifts" on public.shifts;
create policy "Managers and employees can view eligible shifts"
  on public.shifts for select to authenticated
  using (
    public.can_manage_department(business_id, department_id)
    or (
      is_published
      and public.can_view_department(business_id, department_id)
      and exists (
        select 1 from public.employees e
        where e.id = shifts.employee_id and e.auth_user_id = auth.uid()
      )
    )
  );

create function public.list_business_members(p_business_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  venue_id uuid,
  department_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_business_role(p_business_id, array['owner']::text[]) then
    raise exception 'Permission denied';
  end if;
  return query
    select m.user_id, coalesce(p.email, ''), m.role, m.venue_id, m.department_id
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
    where m.business_id = p_business_id
    order by p.email, m.user_id;
end;
$$;

create function public.assign_business_member_role(
  p_business_id uuid,
  p_user_id uuid,
  p_role text,
  p_venue_id uuid,
  p_department_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_role text;
begin
  perform pg_advisory_xact_lock(hashtextextended('membership-roles:' || p_business_id::text, 0));
  if not public.has_business_role(p_business_id, array['owner']::text[]) then
    raise exception 'Permission denied';
  end if;
  if p_role is null or p_role not in ('owner', 'general_manager', 'foh_manager', 'boh_manager', 'employee') then
    raise exception 'Invalid role';
  end if;

  select m.role into v_old_role
  from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = p_user_id
  for update;
  if not found then
    raise exception 'Membership not found';
  end if;
  if v_old_role = 'owner' and p_role <> 'owner'
    and (select count(*) from public.business_memberships m
         where m.business_id = p_business_id and m.role = 'owner') = 1 then
    raise exception 'A business must retain an owner';
  end if;

  if p_role = 'owner' then
    if p_venue_id is not null or p_department_id is not null then
      raise exception 'Owners have business-wide scope';
    end if;
  else
    if p_venue_id is null or not exists (
      select 1 from public.venues v
      where v.id = p_venue_id and v.business_id = p_business_id
    ) then
      raise exception 'Invalid venue scope';
    end if;
    if p_role = 'general_manager' then
      if p_department_id is not null then
        raise exception 'General managers have venue-wide scope';
      end if;
    elsif p_department_id is null or not exists (
      select 1 from public.departments d
      where d.id = p_department_id
        and d.business_id = p_business_id
        and d.venue_id = p_venue_id
    ) then
      raise exception 'Invalid department scope';
    end if;
  end if;

  update public.business_memberships
  set role = p_role, venue_id = p_venue_id, department_id = p_department_id
  where business_id = p_business_id and user_id = p_user_id;
end;
$$;

revoke all on function public.can_view_venue(uuid, uuid) from public, anon;
revoke all on function public.can_view_department(uuid, uuid) from public, anon;
revoke all on function public.can_view_member_scope(uuid, uuid) from public, anon;
revoke all on function public.list_business_members(uuid) from public, anon;
revoke all on function public.assign_business_member_role(uuid, uuid, text, uuid, uuid)
  from public, anon;
grant execute on function public.can_view_venue(uuid, uuid) to authenticated;
grant execute on function public.can_view_department(uuid, uuid) to authenticated;
grant execute on function public.can_view_member_scope(uuid, uuid) to authenticated;
grant execute on function public.list_business_members(uuid) to authenticated;
grant execute on function public.assign_business_member_role(uuid, uuid, text, uuid, uuid)
  to authenticated;
