create table public.shared_workers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, business_id)
);

create table public.shared_worker_profiles (
  employee_id uuid primary key,
  business_id uuid not null,
  venue_id uuid not null,
  shared_worker_id uuid not null,
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id) on delete cascade,
  foreign key (shared_worker_id, business_id)
    references public.shared_workers (id, business_id) on delete cascade,
  unique (shared_worker_id, venue_id)
);
create index shared_worker_profiles_group_idx
  on public.shared_worker_profiles (shared_worker_id, employee_id);

create table public.shared_worker_link_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shared_worker_id uuid not null,
  employee_id uuid not null,
  related_employee_id uuid,
  operation text not null check (operation in ('link', 'unlink')),
  actor_id uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp()
);

alter table public.shared_workers enable row level security;
alter table public.shared_worker_profiles enable row level security;
alter table public.shared_worker_link_events enable row level security;
create policy "Owners can view shared worker link history"
  on public.shared_worker_link_events for select to authenticated
  using (public.has_business_role(business_id, array['owner']::text[]));
revoke all on public.shared_workers, public.shared_worker_profiles, public.shared_worker_link_events
  from public, anon, authenticated;
grant select on public.shared_worker_link_events to authenticated;

create function public.link_shared_worker_profiles(
  p_business_id uuid, p_venue_id uuid, p_employee_id uuid, p_other_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_other public.employees%rowtype;
  v_group uuid;
  v_other_group uuid;
begin
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  if p_employee_id is null or p_other_employee_id is null or p_employee_id = p_other_employee_id then
    raise exception 'Choose two different employee profiles';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  select e.* into v_employee from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id and e.venue_id = p_venue_id
  for share;
  if not found then
    raise exception 'Employee profile not found';
  end if;
  select e.* into v_other from public.employees e
  where e.id = p_other_employee_id and e.business_id = p_business_id and e.venue_id <> p_venue_id
  for share;
  if not found then
    raise exception 'Choose a profile in another venue';
  end if;
  select shared_worker_id into v_group from public.shared_worker_profiles
  where employee_id = v_employee.id;
  select shared_worker_id into v_other_group from public.shared_worker_profiles
  where employee_id = v_other.id;
  if v_group is not null and v_other_group is not null then
    if v_group = v_other_group then
      return;
    end if;
    raise exception 'Profiles belong to different shared workers';
  elsif v_group is null and v_other_group is null then
    insert into public.shared_workers (business_id, created_by)
    values (p_business_id, auth.uid()) returning id into v_group;
    insert into public.shared_worker_profiles (employee_id, business_id, venue_id, shared_worker_id)
    values (v_employee.id, p_business_id, v_employee.venue_id, v_group),
           (v_other.id, p_business_id, v_other.venue_id, v_group);
  elsif v_group is not null then
    if exists (
      select 1 from public.shared_worker_profiles p
      where p.shared_worker_id = v_group and p.venue_id = v_other.venue_id
    ) then
      raise exception 'A profile from this venue is already linked';
    end if;
    insert into public.shared_worker_profiles (employee_id, business_id, venue_id, shared_worker_id)
    values (v_other.id, p_business_id, v_other.venue_id, v_group);
  else
    v_group := v_other_group;
    if exists (
      select 1 from public.shared_worker_profiles p
      where p.shared_worker_id = v_group and p.venue_id = v_employee.venue_id
    ) then
      raise exception 'A profile from this venue is already linked';
    end if;
    insert into public.shared_worker_profiles (employee_id, business_id, venue_id, shared_worker_id)
    values (v_employee.id, p_business_id, v_employee.venue_id, v_group);
  end if;
  insert into public.shared_worker_link_events (
    business_id, shared_worker_id, employee_id, related_employee_id, operation, actor_id
  )
  values (p_business_id, v_group, v_employee.id, v_other.id, 'link', auth.uid());
end;
$$;

create function public.unlink_shared_worker_profile(
  p_business_id uuid, p_venue_id uuid, p_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group uuid;
begin
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  select p.shared_worker_id into v_group
  from public.shared_worker_profiles p
  join public.employees e on e.id = p.employee_id
  where p.employee_id = p_employee_id and p.business_id = p_business_id
    and e.venue_id = p_venue_id
  for share of e;
  if not found then
    raise exception 'Shared employee profile not found';
  end if;
  delete from public.shared_worker_profiles where employee_id = p_employee_id;
  insert into public.shared_worker_link_events (
    business_id, shared_worker_id, employee_id, operation, actor_id
  )
  values (p_business_id, v_group, p_employee_id, 'unlink', auth.uid());
  if (select count(*) from public.shared_worker_profiles where shared_worker_id = v_group) < 2 then
    delete from public.shared_workers where id = v_group and business_id = p_business_id;
  end if;
end;
$$;

create function public.list_shared_worker_profiles(p_business_id uuid, p_venue_id uuid)
returns table (
  employee_id uuid, linked_employee_id uuid, linked_name text,
  linked_venue_id uuid, linked_venue_name text, linked_active boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_business_role(p_business_id, array['owner']::text[]) or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) then
    raise exception 'Permission denied';
  end if;
  return query
  select own.employee_id, linked.employee_id, e.name, v.id, v.name, e.active
  from public.shared_worker_profiles own
  join public.shared_worker_profiles linked
    on linked.shared_worker_id = own.shared_worker_id and linked.employee_id <> own.employee_id
  join public.employees e on e.id = linked.employee_id
  join public.venues v on v.id = e.venue_id and v.business_id = e.business_id
  where own.business_id = p_business_id and own.venue_id = p_venue_id
  order by own.employee_id, linked.employee_id;
end;
$$;

create function public.shared_worker_has_overlap(
  p_business_id uuid, p_employee_id uuid, p_starts_at timestamptz,
  p_ends_at timestamptz, p_excluded_shift_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with profiles as (
    select p_employee_id as employee_id
    union
    select linked.employee_id
    from public.shared_worker_profiles own
    join public.shared_worker_profiles linked
      on linked.shared_worker_id = own.shared_worker_id
      and linked.business_id = own.business_id
    where own.business_id = p_business_id and own.employee_id = p_employee_id
  )
  select exists (
    select 1 from profiles
    join public.shifts other on other.employee_id = profiles.employee_id
    where other.business_id = p_business_id and other.status = 'scheduled'
      and (p_excluded_shift_id is null or other.id <> p_excluded_shift_id)
      and tstzrange(other.starts_at, other.ends_at, '[)')
        && tstzrange(p_starts_at, p_ends_at, '[)')
  );
$$;
revoke all on function public.shared_worker_has_overlap(uuid, uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;

create or replace function public.list_roster_overlap_conflicts(
  p_business_id uuid, p_venue_id uuid, p_shift_ids uuid[]
)
returns table (shift_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v
    where v.id = p_venue_id and v.business_id = p_business_id
  ) or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  if p_shift_ids is null or cardinality(p_shift_ids) > 1000
    or coalesce(array_ndims(p_shift_ids), 1) <> 1 then
    raise exception 'Invalid shift selection';
  end if;
  if array_position(p_shift_ids, null) is not null then
    raise exception 'Invalid shift selection';
  end if;

  return query
  select s.id
  from public.shifts s
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.id = any(p_shift_ids) and s.status = 'scheduled'
    and s.employee_id is not null
    and public.can_manage_department(s.business_id, s.department_id)
    and public.shared_worker_has_overlap(s.business_id, s.employee_id, s.starts_at, s.ends_at, s.id)
  order by s.id;
end;
$$;

-- Scheduling holds a shared business lock; link changes take the exclusive lock.
create function public.lock_shared_worker_groups(
  p_business_id uuid, p_employee_ids uuid[], p_retry_message text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group uuid;
begin
  for v_group in
    select distinct p.shared_worker_id from public.shared_worker_profiles p
    where p.business_id = p_business_id and p.employee_id = any(p_employee_ids)
    order by p.shared_worker_id
  loop
    if not pg_try_advisory_xact_lock(hashtextextended('shared-worker:' || v_group::text, 0)) then
      raise exception '%', p_retry_message;
    end if;
  end loop;
end;
$$;
revoke all on function public.lock_shared_worker_groups(uuid, uuid[], text)
  from public, anon, authenticated;

create function public.lock_scheduling_membership(p_business_id uuid, p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid()
  for share;
  if not found or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
end;
$$;
revoke all on function public.lock_scheduling_membership(uuid, uuid)
  from public, anon, authenticated;

alter function public.save_shift(uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer)
  rename to save_shift_without_shared_worker_lock;
revoke all on function public.save_shift_without_shared_worker_lock(uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer)
  from public, anon, authenticated;

create function public.save_shift(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_employee_id uuid,
  p_role_title text, p_start_local timestamp without time zone,
  p_end_local timestamp without time zone, p_break_minutes integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  perform public.lock_shared_worker_groups(
    p_business_id, array[p_employee_id], 'Roster changed while scheduling; please try again'
  );
  return public.save_shift_without_shared_worker_lock(
    p_business_id, p_venue_id, p_department_id, p_employee_id, p_role_title,
    p_start_local, p_end_local, p_break_minutes
  );
end;
$$;

alter function public.update_draft_shift(uuid, uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer)
  rename to update_draft_shift_without_shared_worker_lock;
revoke all on function public.update_draft_shift_without_shared_worker_lock(uuid, uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer)
  from public, anon, authenticated;

create function public.update_draft_shift(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_shift_id uuid,
  p_employee_id uuid, p_role_title text, p_start_local timestamp without time zone,
  p_end_local timestamp without time zone, p_break_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous_employee_id uuid;
  v_locked_employee_id uuid;
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  select s.employee_id into v_previous_employee_id from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id
    and s.venue_id = p_venue_id and s.department_id = p_department_id
    and s.status = 'scheduled';
  if not found then
    raise exception 'Shift not found';
  end if;
  perform public.lock_shared_worker_groups(
    p_business_id, array[v_previous_employee_id, p_employee_id],
    'Roster changed while scheduling; please try again'
  );
  begin
    select s.employee_id into v_locked_employee_id from public.shifts s
    where s.id = p_shift_id and s.business_id = p_business_id
      and s.venue_id = p_venue_id and s.department_id = p_department_id
      and s.status = 'scheduled'
    for update nowait;
  exception when lock_not_available then
    raise exception 'Roster changed while scheduling; please try again';
  end;
  if not found or v_locked_employee_id is distinct from v_previous_employee_id then
    raise exception 'Roster changed while scheduling; please try again';
  end if;
  perform public.update_draft_shift_without_shared_worker_lock(
    p_business_id, p_venue_id, p_department_id, p_shift_id, p_employee_id, p_role_title,
    p_start_local, p_end_local, p_break_minutes
  );
end;
$$;

create or replace function public.save_shift_auto_assign(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_role_title text,
  p_start_local timestamp without time zone, p_end_local timestamp without time zone,
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
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
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
    perform public.lock_shared_worker_groups(
      p_business_id, array[v_employee_id], 'Roster changed while scheduling; please try again'
    );
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
    if public.shared_worker_has_overlap(p_business_id, v_employee_id, v_start, v_end, null)
      or not public.employee_available_for_shift(v_employee_id, v_start, v_end) then
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

create or replace function public.publish_roster(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_week_start date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_block_unavailability boolean;
  v_block_overlap boolean;
  v_block_long_shift boolean;
  v_shift_ids uuid[];
  v_employee_ids uuid[];
  v_employee_id uuid;
  v_updated integer;
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  if p_week_start is null or not isfinite(p_week_start)
    or extract(isodow from p_week_start) <> 1 then
    raise exception 'Roster week must start on Monday';
  end if;

  select v.timezone, v.block_publish_unavailability, v.block_publish_overlap,
    v.block_publish_long_shift
  into v_timezone, v_block_unavailability, v_block_overlap, v_block_long_shift
  from public.venues v
  join public.departments d on d.venue_id = v.id and d.business_id = v.business_id
  where v.id = p_venue_id and v.business_id = p_business_id
    and d.id = p_department_id and d.active
  for share of v, d;
  if not found then
    raise exception 'Venue or active department not found';
  end if;

  begin
    select coalesce(array_agg(draft.id), '{}'::uuid[]) into v_shift_ids
    from (
      select s.id from public.shifts s
      where s.business_id = p_business_id and s.venue_id = p_venue_id
        and s.department_id = p_department_id and s.status = 'scheduled'
        and not s.is_published
        and (s.starts_at at time zone v_timezone)::date between p_week_start and p_week_start + 6
      order by s.id
      for update nowait
    ) draft;
  exception when lock_not_available then
    raise exception 'Roster changed while publishing; please try again';
  end;
  if cardinality(v_shift_ids) = 0 then
    return 0;
  end if;

  if v_block_unavailability or v_block_overlap then
    select coalesce(array_agg(distinct s.employee_id) filter (where s.employee_id is not null), '{}'::uuid[])
    into v_employee_ids from public.shifts s where s.id = any(v_shift_ids);
    perform public.lock_shared_worker_groups(
      p_business_id, v_employee_ids, 'Roster changed while publishing; please try again'
    );
    for v_employee_id in select unnest(v_employee_ids) order by 1
    loop
      if not pg_try_advisory_xact_lock(hashtextextended(v_employee_id::text, 0)) then
        raise exception 'Roster changed while publishing; please try again';
      end if;
      perform 1 from public.employees e
      where e.id = v_employee_id and e.business_id = p_business_id
        and e.venue_id = p_venue_id
      for share;
      if not found then
        raise exception 'Employee is not eligible for this department';
      end if;
    end loop;
  end if;

  if v_block_long_shift and exists (
    select 1 from public.shifts s
    where s.id = any(v_shift_ids) and s.ends_at - s.starts_at > interval '24 hours'
  ) then
    raise exception 'Roster has shifts longer than 24 hours';
  end if;
  if v_block_overlap and exists (
    select 1 from public.shifts s
    where s.id = any(v_shift_ids) and s.employee_id is not null
      and public.shared_worker_has_overlap(s.business_id, s.employee_id, s.starts_at, s.ends_at, s.id)
  ) then
    raise exception 'Roster has overlapping shifts';
  end if;
  if v_block_unavailability and exists (
    select 1 from public.shifts s
    where s.id = any(v_shift_ids) and s.employee_id is not null
      and case when s.ends_at - s.starts_at > interval '24 hours' then true
        else not public.employee_available_for_shift(s.employee_id, s.starts_at, s.ends_at)
      end
  ) then
    raise exception 'Roster has unavailable employees';
  end if;

  update public.shifts s
  set is_published = true, published_at = now()
  where s.id = any(v_shift_ids);
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.save_shift(uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer)
  from public, anon;
revoke all on function public.update_draft_shift(uuid, uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer)
  from public, anon;
grant execute on function public.save_shift(uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer)
  to authenticated;
grant execute on function public.update_draft_shift(uuid, uuid, uuid, uuid, uuid, text, timestamp, timestamp, integer)
  to authenticated;
revoke all on function public.link_shared_worker_profiles(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.unlink_shared_worker_profile(uuid, uuid, uuid) from public, anon;
revoke all on function public.list_shared_worker_profiles(uuid, uuid) from public, anon;
grant execute on function public.link_shared_worker_profiles(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.unlink_shared_worker_profile(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_shared_worker_profiles(uuid, uuid) to authenticated;
