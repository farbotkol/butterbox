create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  employee_id uuid not null,
  email text not null check (
    length(email) between 3 and 254
    and email = lower(trim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id) on delete cascade,
  foreign key (employee_id, business_id, venue_id, department_id)
    references public.employees (id, business_id, venue_id, department_id) on delete cascade,
  check (expires_at > created_at),
  check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or (status <> 'accepted' and accepted_by is null and accepted_at is null)
  )
);

create unique index staff_invitations_pending_employee_key
  on public.staff_invitations (business_id, employee_id) where status = 'pending';
create unique index staff_invitations_pending_email_key
  on public.staff_invitations (business_id, email) where status = 'pending';

create table public.staff_invitation_events (
  id bigint generated always as identity primary key,
  invitation_id uuid not null references public.staff_invitations (id) on delete cascade,
  business_id uuid not null,
  department_id uuid not null,
  actor_id uuid,
  event text not null check (event in ('created', 'accepted', 'revoked', 'expired')),
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (department_id, business_id)
    references public.departments (id, business_id) on delete cascade
);

alter table public.staff_invitations enable row level security;
alter table public.staff_invitation_events enable row level security;
revoke all on public.staff_invitations, public.staff_invitation_events
  from public, anon, authenticated, service_role;

create policy "Managers can view scoped invitations"
  on public.staff_invitations for select to authenticated
  using (public.can_manage_department(business_id, department_id));
create policy "Managers can view scoped invitation events"
  on public.staff_invitation_events for select to authenticated
  using (public.can_manage_department(business_id, department_id));
grant select on public.staff_invitations, public.staff_invitation_events to authenticated;

create function public.record_staff_invitation_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'created';
  elsif new.status is distinct from old.status then
    v_event := new.status;
  else
    return new;
  end if;

  insert into public.staff_invitation_events (
    invitation_id, business_id, department_id, actor_id, event
  ) values (new.id, new.business_id, new.department_id, auth.uid(), v_event);
  return new;
end;
$$;
revoke all on function public.record_staff_invitation_event()
  from public, anon, authenticated, service_role;

create trigger staff_invitation_event
  after insert or update on public.staff_invitations
  for each row execute function public.record_staff_invitation_event();

create function public.prevent_staff_invitation_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.businesses b where b.id = old.business_id
  ) then
    return old;
  end if;
  raise exception 'Invitation events are immutable';
end;
$$;
revoke all on function public.prevent_staff_invitation_event_mutation()
  from public, anon, authenticated, service_role;

create trigger staff_invitation_event_immutable
  before update or delete on public.staff_invitation_events
  for each row execute function public.prevent_staff_invitation_event_mutation();

create function public.create_staff_invitation(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid,
  p_employee_id uuid, p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_employee public.employees%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  perform public.lock_scheduling_membership(p_business_id, p_department_id);

  if length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid invitation email';
  end if;

  perform 1 from public.departments d
  where d.id = p_department_id and d.business_id = p_business_id
    and d.venue_id = p_venue_id and d.active
  for share;
  if not found then
    raise exception 'Department is unavailable';
  end if;

  select * into v_employee from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id
    and e.venue_id = p_venue_id and e.department_id = p_department_id
  for update;
  if not found or not v_employee.active or v_employee.auth_user_id is not null then
    raise exception 'Employee is unavailable for invitation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('staff-invite-email:' || p_business_id::text || ':' || v_email, 0)
  );
  perform 1 from public.staff_invitations i
  where i.business_id = p_business_id and i.status = 'pending'
    and i.expires_at <= clock_timestamp()
    and (i.employee_id = p_employee_id or i.email = v_email)
  order by i.id for update;
  update public.staff_invitations i set status = 'expired'
  where i.business_id = p_business_id and i.status = 'pending'
    and i.expires_at <= clock_timestamp()
    and (i.employee_id = p_employee_id or i.email = v_email);

  if exists (
    select 1 from public.staff_invitations i
    where i.business_id = p_business_id and i.status = 'pending'
      and (i.employee_id = p_employee_id or i.email = v_email)
  ) then
    raise exception 'An active invitation already exists';
  end if;

  insert into public.staff_invitations (
    business_id, venue_id, department_id, employee_id, email, invited_by, expires_at
  ) values (
    p_business_id, p_venue_id, p_department_id, p_employee_id,
    v_email, auth.uid(), clock_timestamp() + interval '7 days'
  ) returning id into v_id;
  return v_id;
end;
$$;

create function public.revoke_staff_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.staff_invitations%rowtype;
begin
  select * into v_invitation from public.staff_invitations
  where id = p_invitation_id;
  if not found or auth.uid() is null then
    raise exception 'Invitation is unavailable';
  end if;
  perform public.lock_scheduling_membership(v_invitation.business_id, v_invitation.department_id);

  select * into v_invitation from public.staff_invitations
  where id = p_invitation_id for update;
  if not found then
    raise exception 'Invitation is unavailable';
  end if;
  if v_invitation.status = 'revoked' then
    return;
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Invitation can no longer be revoked';
  end if;
  update public.staff_invitations set status = 'revoked' where id = p_invitation_id;
end;
$$;

create function public.list_pending_staff_invitations(p_business_id uuid, p_venue_id uuid)
returns table (
  id uuid,
  employee_id uuid,
  email text,
  expires_at timestamptz,
  status text
)
language sql
stable
set search_path = public, pg_temp
as $$
  select i.id, i.employee_id, i.email, i.expires_at,
    case when i.expires_at <= statement_timestamp() then 'expired' else 'pending' end
  from public.staff_invitations i
  where i.business_id = p_business_id and i.venue_id = p_venue_id and i.status = 'pending';
$$;

create function public.get_staff_invitation(p_invitation_id uuid)
returns table (
  business_name text,
  venue_name text,
  department_name text,
  employee_name text,
  status text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  return query
  select b.name, v.name, d.name, e.name,
    case when i.status = 'pending' and i.expires_at <= statement_timestamp()
      then 'expired' else i.status end,
    i.expires_at
  from public.staff_invitations i
  join auth.users u on u.id = auth.uid()
    and u.email_confirmed_at is not null and lower(trim(u.email)) = i.email
  join public.businesses b on b.id = i.business_id
  join public.venues v on v.id = i.venue_id and v.business_id = i.business_id
  join public.departments d on d.id = i.department_id and d.business_id = i.business_id
  join public.employees e on e.id = i.employee_id and e.business_id = i.business_id
  where i.id = p_invitation_id
    and (i.status <> 'accepted' or i.accepted_by = auth.uid());
end;
$$;

create function public.accept_staff_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_invitation public.staff_invitations%rowtype;
  v_employee public.employees%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select lower(trim(u.email)) into v_email from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
  select * into v_invitation from public.staff_invitations i
  where i.id = p_invitation_id and i.email = v_email;
  if not found then
    raise exception 'Invitation is unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('initial-setup:' || auth.uid()::text, 0));
  perform 1 from public.departments d
  where d.id = v_invitation.department_id and d.business_id = v_invitation.business_id
    and d.venue_id = v_invitation.venue_id and d.active
  for share;
  if not found then
    raise exception 'Invitation is unavailable';
  end if;
  select * into v_employee from public.employees e
  where e.id = v_invitation.employee_id and e.business_id = v_invitation.business_id
    and e.venue_id = v_invitation.venue_id and e.department_id = v_invitation.department_id
  for update;
  if not found or not v_employee.active or v_employee.auth_user_id is not null then
    raise exception 'Invitation is unavailable';
  end if;
  select * into v_invitation from public.staff_invitations i
  where i.id = p_invitation_id and i.email = v_email for update;
  if not found or v_invitation.status <> 'pending'
    or v_invitation.expires_at <= clock_timestamp() then
    raise exception 'Invitation is unavailable or expired';
  end if;

  if exists (
    select 1 from public.business_memberships m
    where m.user_id = auth.uid() and m.business_id <> v_invitation.business_id
  ) then
    raise exception 'Business switching is not yet available for this account';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = v_invitation.business_id and m.user_id = auth.uid()
  for share;
  if found then
    if not public.user_can_view_department(
      auth.uid(), v_invitation.business_id, v_invitation.department_id
    ) then
      raise exception 'Your existing membership cannot access this department';
    end if;
  else
    insert into public.business_memberships (business_id, user_id, role, venue_id, department_id)
    values (
      v_invitation.business_id, auth.uid(), 'employee',
      v_invitation.venue_id, v_invitation.department_id
    );
  end if;

  update public.employees set auth_user_id = auth.uid() where id = v_employee.id;
  update public.staff_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = clock_timestamp()
  where id = p_invitation_id;
  return v_invitation.business_id;
end;
$$;

revoke all on function public.create_staff_invitation(uuid, uuid, uuid, uuid, text)
  from public, anon;
revoke all on function public.revoke_staff_invitation(uuid) from public, anon;
revoke all on function public.list_pending_staff_invitations(uuid, uuid) from public, anon;
revoke all on function public.get_staff_invitation(uuid) from public, anon;
revoke all on function public.accept_staff_invitation(uuid) from public, anon;
grant execute on function public.create_staff_invitation(uuid, uuid, uuid, uuid, text)
  to authenticated;
grant execute on function public.revoke_staff_invitation(uuid) to authenticated;
grant execute on function public.list_pending_staff_invitations(uuid, uuid) to authenticated;
grant execute on function public.get_staff_invitation(uuid) to authenticated;
grant execute on function public.accept_staff_invitation(uuid) to authenticated;
