alter table public.venues
  add column block_manual_unavailability boolean not null default false,
  add column block_publish_unavailability boolean not null default false,
  add column block_publish_overlap boolean not null default false,
  add column block_publish_long_shift boolean not null default false;

create table public.venue_conflict_policy_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_type text not null,
  old_values jsonb not null,
  new_values jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id)
    references public.venues (id, business_id) on delete cascade
);

create index venue_conflict_policy_events_venue_idx
  on public.venue_conflict_policy_events (business_id, venue_id, created_at desc);
create trigger venue_conflict_policy_events_business_id_immutable
  before update of business_id on public.venue_conflict_policy_events
  for each row execute function public.prevent_business_id_change();

alter table public.venue_conflict_policy_events enable row level security;
create policy "Owners can view their venue conflict policy history"
  on public.venue_conflict_policy_events for select to authenticated
  using (public.has_business_role(business_id, array['owner']));
revoke all on public.venue_conflict_policy_events from public, anon, authenticated;
grant select on public.venue_conflict_policy_events to authenticated;

create function public.record_venue_conflict_policy_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_values jsonb;
  v_new_values jsonb;
begin
  v_new_values := jsonb_build_object(
    'manual_unavailability', new.block_manual_unavailability,
    'publish_unavailability', new.block_publish_unavailability,
    'publish_overlap', new.block_publish_overlap,
    'publish_long_shift', new.block_publish_long_shift
  );
  if tg_op = 'INSERT' then
    v_old_values := jsonb_build_object(
      'manual_unavailability', false, 'publish_unavailability', false,
      'publish_overlap', false, 'publish_long_shift', false
    );
  else
    v_old_values := jsonb_build_object(
      'manual_unavailability', old.block_manual_unavailability,
      'publish_unavailability', old.block_publish_unavailability,
      'publish_overlap', old.block_publish_overlap,
      'publish_long_shift', old.block_publish_long_shift
    );
  end if;
  if v_old_values is distinct from v_new_values then
    insert into public.venue_conflict_policy_events (
      business_id, venue_id, actor_id, actor_type, old_values, new_values
    )
    values (
      new.business_id, new.id, auth.uid(),
      case when auth.uid() is not null then 'authenticated'
        else coalesce(auth.jwt() ->> 'role', session_user::text) end,
      v_old_values, v_new_values
    );
  end if;
  return new;
end;
$$;

revoke all on function public.record_venue_conflict_policy_change()
  from public, anon, authenticated;
create trigger venues_conflict_policy_audit_insert
  after insert on public.venues
  for each row execute function public.record_venue_conflict_policy_change();
create trigger venues_conflict_policy_audit_update
  after update of block_manual_unavailability, block_publish_unavailability,
    block_publish_overlap, block_publish_long_shift on public.venues
  for each row execute function public.record_venue_conflict_policy_change();

create function public.save_venue_conflict_policy(
  p_business_id uuid,
  p_venue_id uuid,
  p_block_manual_unavailability boolean,
  p_block_publish_unavailability boolean,
  p_block_publish_overlap boolean,
  p_block_publish_long_shift boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner']) then
    raise exception 'Permission denied';
  end if;
  perform 1 from public.venues
  where id = p_venue_id and business_id = p_business_id
  for update;
  if not found then
    raise exception 'Permission denied';
  end if;
  if p_block_manual_unavailability is null or p_block_publish_unavailability is null
    or p_block_publish_overlap is null or p_block_publish_long_shift is null then
    raise exception 'Invalid conflict policy';
  end if;

  update public.venues set
    block_manual_unavailability = p_block_manual_unavailability,
    block_publish_unavailability = p_block_publish_unavailability,
    block_publish_overlap = p_block_publish_overlap,
    block_publish_long_shift = p_block_publish_long_shift
  where id = p_venue_id and business_id = p_business_id
    and (block_manual_unavailability, block_publish_unavailability,
      block_publish_overlap, block_publish_long_shift)
      is distinct from (p_block_manual_unavailability, p_block_publish_unavailability,
        p_block_publish_overlap, p_block_publish_long_shift);
end;
$$;

revoke all on function public.save_venue_conflict_policy(uuid, uuid, boolean, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.save_venue_conflict_policy(uuid, uuid, boolean, boolean, boolean, boolean)
  to authenticated;

create function public.ensure_available_shift_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_restricted boolean;
begin
  if new.employee_id is null or new.status <> 'scheduled' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'scheduled'
    and new.employee_id = old.employee_id
    and new.department_id = old.department_id
    and new.starts_at = old.starts_at and new.ends_at = old.ends_at then
    return new;
  end if;

  select v.block_manual_unavailability into v_restricted
  from public.venues v
  where v.id = new.venue_id and v.business_id = new.business_id
  for share;
  if not found then
    raise exception 'Venue not found';
  end if;
  if v_restricted then
    perform 1 from public.employees e
    where e.id = new.employee_id and e.business_id = new.business_id
      and e.venue_id = new.venue_id
    for share;
    if not found then
      raise exception 'Employee is not eligible for this department';
    end if;
    if not public.employee_available_for_shift(new.employee_id, new.starts_at, new.ends_at) then
      raise exception 'Employee is unavailable for this shift';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_available_shift_assignment() from public, anon, authenticated;
create trigger shifts_require_available_assignment
  before insert or update of employee_id, department_id, starts_at, ends_at, status on public.shifts
  for each row execute function public.ensure_available_shift_assignment();

create or replace function public.publish_roster(
  p_business_id uuid,
  p_venue_id uuid,
  p_department_id uuid,
  p_week_start date
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
  v_employee_id uuid;
  v_updated integer;
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
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
    for v_employee_id in
      select distinct s.employee_id from public.shifts s
      where s.id = any(v_shift_ids) and s.employee_id is not null
      order by s.employee_id
    loop
      -- Editors and auto-assignment can hold employee locks before venue locks.
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
    join public.shifts other on other.business_id = s.business_id
      and other.employee_id = s.employee_id and other.id <> s.id
      and other.status = 'scheduled'
      and tstzrange(other.starts_at, other.ends_at, '[)')
        && tstzrange(s.starts_at, s.ends_at, '[)')
    where s.id = any(v_shift_ids) and s.employee_id is not null
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
