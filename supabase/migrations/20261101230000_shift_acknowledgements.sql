alter table public.shifts
  add column requires_acknowledgement boolean not null default false;

alter table public.roster_publication_shifts
  add column requires_acknowledgement boolean not null default false;

create index roster_publication_shifts_required_idx
  on public.roster_publication_shifts (shift_id, publication_id)
  where requires_acknowledgement;

create table public.shift_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null,
  shift_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz not null default clock_timestamp(),
  unique (shift_id, user_id),
  foreign key (publication_id, shift_id)
    references public.roster_publication_shifts (publication_id, shift_id) on delete cascade
);

alter table public.shift_acknowledgements enable row level security;
revoke all on public.shift_acknowledgements from public, anon, authenticated;

create function public.capture_shift_acknowledgement_requirement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select s.requires_acknowledgement into new.requires_acknowledgement
  from public.shifts s where s.id = new.shift_id;
  if not found then
    raise exception 'Snapshot shift not found';
  end if;
  return new;
end;
$$;
revoke all on function public.capture_shift_acknowledgement_requirement()
  from public, anon, authenticated;
create trigger roster_snapshot_capture_acknowledgement
  before insert on public.roster_publication_shifts
  for each row execute function public.capture_shift_acknowledgement_requirement();

create function public.check_published_shift_acknowledgement()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_published and new.status = 'scheduled'
    and new.requires_acknowledgement and new.employee_id is null then
    raise exception 'Assign or remove the acknowledgement requirement before publication';
  end if;
  return new;
end;
$$;
revoke all on function public.check_published_shift_acknowledgement()
  from public, anon, authenticated;
create trigger shifts_check_published_acknowledgement
  before insert or update of is_published, status, employee_id, requires_acknowledgement
  on public.shifts
  for each row execute function public.check_published_shift_acknowledgement();

create function public.set_shift_acknowledgement_requirement(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid,
  p_shift_id uuid, p_required boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  if p_required is null then
    raise exception 'Invalid acknowledgement requirement';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid()
  for share;
  if not found or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  perform 1 from public.departments d
  where d.id = p_department_id and d.business_id = p_business_id
    and d.venue_id = p_venue_id and d.active
  for share;
  if not found then
    raise exception 'Venue or active department not found';
  end if;
  select s.* into v_shift from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id
    and s.venue_id = p_venue_id and s.department_id = p_department_id
    and s.status = 'scheduled'
  for update;
  if not found then
    raise exception 'Shift not found';
  end if;
  if v_shift.is_published then
    raise exception 'Published shifts cannot be edited';
  end if;
  if p_required and v_shift.employee_id is null then
    raise exception 'Assign an employee before requiring acknowledgement';
  end if;
  update public.shifts set requires_acknowledgement = p_required
  where id = v_shift.id and requires_acknowledgement is distinct from p_required;
end;
$$;

create function public.list_shift_acknowledgements(
  p_business_id uuid, p_venue_id uuid, p_shift_ids uuid[]
)
returns table (shift_id uuid, acknowledged_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v
    where v.id = p_venue_id and v.business_id = p_business_id
      and public.can_view_venue(v.business_id, v.id)
  ) then
    raise exception 'Permission denied';
  end if;
  if p_shift_ids is null or cardinality(p_shift_ids) > 2000
    or coalesce(array_ndims(p_shift_ids), 1) > 1 then
    raise exception 'Invalid shift list';
  end if;
  if array_position(p_shift_ids, null) is not null then
    raise exception 'Invalid shift list';
  end if;
  return query
  select s.id, a.acknowledged_at
  from public.shifts s
  join public.employees e on e.id = s.employee_id
  left join public.shift_acknowledgements a
    on a.shift_id = s.id and a.user_id = e.auth_user_id
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.id = any(p_shift_ids) and s.status = 'scheduled'
    and s.is_published and s.requires_acknowledgement
    and (
      public.can_manage_department(s.business_id, s.department_id)
      or public.is_own_linked_shift(s.business_id, s.employee_id, s.department_id)
    );
end;
$$;

create function public.acknowledge_shift(
  p_business_id uuid, p_venue_id uuid, p_shift_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
  v_publication_id uuid;
  v_acknowledged_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  select s.* into v_shift from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.status = 'scheduled' and s.is_published
  for share;
  if not found or v_shift.employee_id is null then
    raise exception 'Shift not found or permission denied';
  end if;
  perform 1 from public.employees e
  where e.id = v_shift.employee_id and e.business_id = v_shift.business_id
    and e.venue_id = v_shift.venue_id and e.auth_user_id = auth.uid()
  for share;
  if not found then
    raise exception 'Shift not found or permission denied';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = v_shift.business_id and m.user_id = auth.uid()
  for share;
  if not found then
    raise exception 'Shift not found or permission denied';
  end if;
  perform 1 from public.employee_departments ed
  where ed.employee_id = v_shift.employee_id and ed.department_id = v_shift.department_id
  for share;
  if not found or not public.is_own_linked_shift(
    v_shift.business_id, v_shift.employee_id, v_shift.department_id
  ) then
    raise exception 'Shift not found or permission denied';
  end if;
  if not v_shift.requires_acknowledgement then
    raise exception 'Shift does not require acknowledgement';
  end if;

  select snapshot.publication_id into v_publication_id
  from public.roster_publication_shifts snapshot
  join public.roster_publications publication on publication.id = snapshot.publication_id
  where snapshot.shift_id = v_shift.id
    and publication.business_id = v_shift.business_id
    and publication.venue_id = v_shift.venue_id
    and publication.department_id = v_shift.department_id
    and snapshot.employee_id = v_shift.employee_id
    and snapshot.role_title = v_shift.role_title
    and snapshot.starts_at = v_shift.starts_at and snapshot.ends_at = v_shift.ends_at
    and snapshot.break_minutes = v_shift.break_minutes
    and snapshot.requires_acknowledgement
  order by publication.published_at, publication.version, publication.id
  limit 1;
  if not found then
    raise exception 'Shift publication record unavailable';
  end if;

  insert into public.shift_acknowledgements (publication_id, shift_id, user_id)
  values (v_publication_id, v_shift.id, auth.uid())
  on conflict (shift_id, user_id) do nothing;
  select a.acknowledged_at into v_acknowledged_at
  from public.shift_acknowledgements a
  where a.shift_id = v_shift.id and a.user_id = auth.uid();
  return v_acknowledged_at;
end;
$$;

revoke all on function public.set_shift_acknowledgement_requirement(uuid, uuid, uuid, uuid, boolean)
  from public, anon;
revoke all on function public.list_shift_acknowledgements(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.acknowledge_shift(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_shift_acknowledgement_requirement(uuid, uuid, uuid, uuid, boolean)
  to authenticated;
grant execute on function public.list_shift_acknowledgements(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.acknowledge_shift(uuid, uuid, uuid) to authenticated;
