create table public.roster_quick_changes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  department_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  source_shift_id uuid not null,
  result_shift_id uuid not null,
  operation text not null check (operation in ('move', 'duplicate')),
  week_start date not null,
  target_date date not null,
  target_employee_id uuid,
  expected_updated_at timestamptz not null,
  expected_preview jsonb not null,
  before_shift jsonb not null,
  after_shift jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (business_id, actor_id, request_id),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id) on delete cascade
);

create table public.roster_quick_change_undos (
  change_id uuid primary key references public.roster_quick_changes (id) on delete cascade,
  actor_id uuid not null,
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.roster_quick_changes enable row level security;
alter table public.roster_quick_change_undos enable row level security;
revoke all on public.roster_quick_changes, public.roster_quick_change_undos
  from public, anon, authenticated, service_role;

create function public.prevent_roster_quick_change_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'roster_quick_changes' then
      if not exists (select 1 from public.businesses b where b.id = old.business_id)
        or not exists (select 1 from public.departments d where d.id = old.department_id) then
        return old;
      end if;
    elsif tg_table_name = 'roster_quick_change_undos' then
      if not exists (select 1 from public.roster_quick_changes r where r.id = old.change_id) then
        return old;
      end if;
    end if;
  end if;
  raise exception 'Roster quick change records are immutable';
end;
$$;
revoke all on function public.prevent_roster_quick_change_mutation()
  from public, anon, authenticated, service_role;
create trigger roster_quick_changes_immutable
  before update or delete on public.roster_quick_changes
  for each row execute function public.prevent_roster_quick_change_mutation();
create trigger roster_quick_change_undos_immutable
  before update or delete on public.roster_quick_change_undos
  for each row execute function public.prevent_roster_quick_change_mutation();

create function public.roster_quick_shift_snapshot(p_shift_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'employee_id', s.employee_id,
    'role_title', s.role_title,
    'starts_at', s.starts_at,
    'ends_at', s.ends_at,
    'break_minutes', s.break_minutes,
    'requires_acknowledgement', s.requires_acknowledgement,
    'status', s.status,
    'is_published', s.is_published,
    'updated_at', s.updated_at
  )
  from public.shifts s where s.id = p_shift_id;
$$;
revoke all on function public.roster_quick_shift_snapshot(uuid) from public, anon, authenticated;

create function public.preview_roster_shift_change(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_shift_id uuid,
  p_expected_updated_at timestamptz, p_week_start date, p_target_date date,
  p_target_employee_id uuid, p_operation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
  v_venue public.venues%rowtype;
  v_employee_name text;
  v_source_date date;
  v_offset integer;
  v_start_local timestamp;
  v_end_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_check_start timestamptz;
  v_check_end timestamptz;
  v_same_employee_overlap boolean := false;
  v_blocking text[] := '{}'::text[];
  v_warnings text[] := '{}'::text[];
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if p_operation is null or p_operation not in ('move', 'duplicate')
    or p_expected_updated_at is null or not isfinite(p_expected_updated_at)
    or p_week_start is null or p_target_date is null
    or not isfinite(p_week_start) or not isfinite(p_target_date)
    or extract(year from p_week_start) not between 1900 and 9999
    or extract(isodow from p_week_start) <> 1
    or p_target_date < p_week_start or p_target_date > p_week_start + 6 then
    raise exception 'Invalid roster change';
  end if;

  select v.* into v_venue from public.venues v
  join public.departments d on d.business_id = v.business_id and d.venue_id = v.id
  where v.id = p_venue_id and v.business_id = p_business_id
    and d.id = p_department_id and d.active;
  if not found then
    raise exception 'Venue or active department not found';
  end if;
  select s.* into v_shift from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id
    and s.venue_id = p_venue_id and s.department_id = p_department_id
    and s.status = 'scheduled';
  if not found then
    raise exception 'Shift not found';
  end if;
  if v_shift.updated_at is distinct from p_expected_updated_at then
    raise exception 'Shift changed; reload the roster';
  end if;
  if p_operation = 'move' and v_shift.is_published then
    raise exception 'Published shifts cannot be edited';
  end if;
  v_source_date := (v_shift.starts_at at time zone v_venue.timezone)::date;
  if v_source_date < p_week_start or v_source_date > p_week_start + 6 then
    raise exception 'Shift is not in this roster week';
  end if;

  if p_target_employee_id is not null then
    select e.name into v_employee_name from public.employees e
    join public.employee_departments ed
      on ed.employee_id = e.id and ed.business_id = e.business_id
      and ed.department_id = p_department_id
    where e.id = p_target_employee_id and e.business_id = p_business_id
      and e.venue_id = p_venue_id and e.active;
    if not found then
      raise exception 'Employee is not eligible for this department';
    end if;
  end if;

  v_offset := p_target_date - v_source_date;
  v_start_local := (v_shift.starts_at at time zone v_venue.timezone) + v_offset * interval '1 day';
  v_end_local := (v_shift.ends_at at time zone v_venue.timezone) + v_offset * interval '1 day';
  if v_offset <> 0 and (v_end_local <= v_start_local
    or v_end_local - v_start_local <> v_shift.ends_at - v_shift.starts_at) then
    raise exception 'Shift crosses a clock change and cannot be moved safely';
  end if;
  select bounds.starts_at, bounds.ends_at into v_check_start, v_check_end
  from public.shift_time_bounds(v_venue.timezone, v_start_local, v_end_local) bounds;
  if v_offset = 0 then
    v_start := v_shift.starts_at;
    v_end := v_shift.ends_at;
    if p_operation = 'duplicate'
      and (v_check_start <> v_start or v_check_end <> v_end) then
      raise exception 'Shift time cannot be duplicated safely across a clock change';
    end if;
  else
    v_start := v_check_start;
    v_end := v_check_end;
    if v_end - v_start <> v_shift.ends_at - v_shift.starts_at then
      raise exception 'Target shift crosses a clock change and cannot be moved safely';
    end if;
  end if;

  if p_operation = 'move' and v_offset = 0
    and p_target_employee_id is not distinct from v_shift.employee_id then
    v_blocking := array_append(v_blocking, 'unchanged');
  end if;
  if v_shift.requires_acknowledgement and p_target_employee_id is null then
    v_blocking := array_append(v_blocking, 'acknowledgement');
  end if;
  if p_operation = 'duplicate' and exists (
    select 1 from public.job_roles r
    where r.business_id = p_business_id and r.venue_id = p_venue_id
      and r.department_id = p_department_id
      and lower(r.name) = lower(trim(v_shift.role_title)) and not r.active
  ) then
    v_blocking := array_append(v_blocking, 'inactive-role');
  end if;
  if p_target_employee_id is not null then
    if (p_operation = 'duplicate' or p_target_employee_id is distinct from v_shift.employee_id)
      and exists (
        select 1 from public.job_roles r
        where r.business_id = p_business_id and r.venue_id = p_venue_id
          and r.department_id = p_department_id
          and lower(r.name) = lower(trim(v_shift.role_title))
          and r.restrict_manual_assignment
          and not exists (
            select 1 from public.employee_job_roles er
            where er.employee_id = p_target_employee_id and er.job_role_id = r.id
          )
      ) then
      v_blocking := array_append(v_blocking, 'qualification');
    end if;
    select exists (
      select 1 from public.shifts s
      where s.employee_id = p_target_employee_id and s.status = 'scheduled'
        and (p_operation <> 'move' or s.id <> p_shift_id)
        and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
    ) into v_same_employee_overlap;
    if v_same_employee_overlap then
      v_blocking := array_append(v_blocking, 'overlap');
    elsif public.shared_worker_has_overlap(
      p_business_id, p_target_employee_id, v_start, v_end,
      case when p_operation = 'move' then p_shift_id else null end
    ) then
      v_warnings := array_append(v_warnings, 'linked-overlap');
    end if;
    if not public.employee_available_for_shift(p_target_employee_id, v_start, v_end) then
      if v_venue.block_manual_unavailability then
        v_blocking := array_append(v_blocking, 'unavailable');
      else
        v_warnings := array_append(v_warnings, 'unavailable');
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'operation', p_operation,
    'target_date', p_target_date,
    'target_employee_id', p_target_employee_id,
    'target_employee_name', v_employee_name,
    'role_title', v_shift.role_title,
    'starts_at', v_start,
    'ends_at', v_end,
    'blocking', to_jsonb(v_blocking),
    'warnings', to_jsonb(v_warnings),
    'publish_blocks_overlap', v_venue.block_publish_overlap,
    'publish_blocks_unavailability', v_venue.block_publish_unavailability
  );
end;
$$;
revoke all on function public.preview_roster_shift_change(uuid, uuid, uuid, uuid, timestamptz, date, date, uuid, text)
  from public, anon;
grant execute on function public.preview_roster_shift_change(uuid, uuid, uuid, uuid, timestamptz, date, date, uuid, text)
  to authenticated;

create function public.apply_roster_shift_change(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_shift_id uuid,
  p_expected_updated_at timestamptz, p_week_start date, p_target_date date,
  p_target_employee_id uuid, p_operation text, p_expected_preview jsonb, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.roster_quick_changes%rowtype;
  v_shift public.shifts%rowtype;
  v_locked_shift public.shifts%rowtype;
  v_timezone text;
  v_preview jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result_id uuid;
  v_employee_id uuid;
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if p_request_id is null or p_expected_preview is null
    or jsonb_typeof(p_expected_preview) <> 'object' then
    raise exception 'Invalid roster change';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  perform pg_advisory_xact_lock(hashtextextended(
    'roster-quick-change:' || p_business_id::text || ':' || auth.uid()::text || ':' || p_request_id::text, 0
  ));
  select r.* into v_receipt from public.roster_quick_changes r
  where r.business_id = p_business_id and r.actor_id = auth.uid() and r.request_id = p_request_id;
  if found then
    if v_receipt.venue_id is distinct from p_venue_id
      or v_receipt.department_id is distinct from p_department_id
      or v_receipt.source_shift_id is distinct from p_shift_id
      or v_receipt.expected_updated_at is distinct from p_expected_updated_at
      or v_receipt.week_start is distinct from p_week_start
      or v_receipt.target_date is distinct from p_target_date
      or v_receipt.target_employee_id is distinct from p_target_employee_id
      or v_receipt.operation is distinct from p_operation
      or v_receipt.expected_preview is distinct from p_expected_preview then
      raise exception 'Request identifier already used';
    end if;
    if exists (select 1 from public.roster_quick_change_undos u where u.change_id = v_receipt.id) then
      raise exception 'Shift change was already undone';
    end if;
    return v_receipt.id;
  end if;
  select v.timezone into v_timezone from public.venues v
  join public.departments d on d.business_id = v.business_id and d.venue_id = v.id
  where v.id = p_venue_id and v.business_id = p_business_id
    and d.id = p_department_id and d.active
  for share of v, d;
  if not found then
    raise exception 'Venue or active department not found';
  end if;
  select s.* into v_shift from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id
    and s.venue_id = p_venue_id and s.department_id = p_department_id
    and s.status = 'scheduled';
  if not found then
    raise exception 'Shift not found';
  end if;
  begin
    perform r.id from public.job_roles r
    where r.business_id = p_business_id and r.venue_id = p_venue_id
      and r.department_id = p_department_id
      and lower(r.name) = lower(trim(v_shift.role_title))
    order by r.id for share nowait;
  exception when lock_not_available then
    raise exception 'Roster changed while scheduling; please try again';
  end;
  perform public.lock_shared_worker_groups(
    p_business_id, array[v_shift.employee_id, p_target_employee_id],
    'Roster changed while scheduling; please try again'
  );
  for v_employee_id in
    select distinct employee_id from unnest(array[v_shift.employee_id, p_target_employee_id]) employee_id
    where employee_id is not null order by employee_id
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(v_employee_id::text, 0)) then
      raise exception 'Roster changed while scheduling; please try again';
    end if;
    begin
      perform e.id from public.employees e where e.id = v_employee_id
        and e.business_id = p_business_id and e.venue_id = p_venue_id
      for share nowait;
    exception when lock_not_available then
      raise exception 'Roster changed while scheduling; please try again';
    end;
    if not found then
      raise exception 'Employee is not eligible for this department';
    end if;
  end loop;
  begin
    select s.* into v_locked_shift from public.shifts s
    where s.id = p_shift_id and s.business_id = p_business_id
      and s.venue_id = p_venue_id and s.department_id = p_department_id
      and s.status = 'scheduled'
    for update nowait;
  exception when lock_not_available then
    raise exception 'Roster changed while scheduling; please try again';
  end;
  if not found or v_locked_shift.employee_id is distinct from v_shift.employee_id then
    raise exception 'Roster changed while scheduling; please try again';
  end if;

  v_preview := public.preview_roster_shift_change(
    p_business_id, p_venue_id, p_department_id, p_shift_id, p_expected_updated_at,
    p_week_start, p_target_date, p_target_employee_id, p_operation
  );
  if jsonb_array_length(v_preview->'blocking') > 0 then
    raise exception 'Shift change blocked: %', v_preview->'blocking'->>0;
  end if;
  if v_preview is distinct from p_expected_preview then
    raise exception 'Shift preview changed; preview again';
  end if;
  v_before := public.roster_quick_shift_snapshot(p_shift_id);
  if p_operation = 'move' then
    perform public.update_draft_shift(
      p_business_id, p_venue_id, p_department_id, p_shift_id, p_target_employee_id,
      v_locked_shift.role_title,
      (v_preview->>'starts_at')::timestamptz at time zone v_timezone,
      (v_preview->>'ends_at')::timestamptz at time zone v_timezone,
      v_locked_shift.break_minutes
    );
    v_result_id := p_shift_id;
  else
    v_result_id := public.save_shift(
      p_business_id, p_venue_id, p_department_id, p_target_employee_id,
      v_locked_shift.role_title,
      (v_preview->>'starts_at')::timestamptz at time zone v_timezone,
      (v_preview->>'ends_at')::timestamptz at time zone v_timezone,
      v_locked_shift.break_minutes
    );
    if v_locked_shift.requires_acknowledgement then
      perform public.set_shift_acknowledgement_requirement(
        p_business_id, p_venue_id, p_department_id, v_result_id, true
      );
    end if;
  end if;
  v_after := public.roster_quick_shift_snapshot(v_result_id);
  if (v_after->>'starts_at')::timestamptz is distinct from (v_preview->>'starts_at')::timestamptz
    or (v_after->>'ends_at')::timestamptz is distinct from (v_preview->>'ends_at')::timestamptz then
    raise exception 'Shift time cannot be changed safely across a clock change';
  end if;
  insert into public.roster_quick_changes (
    business_id, venue_id, department_id, actor_id, request_id, source_shift_id,
    result_shift_id, operation, week_start, target_date, target_employee_id,
    expected_updated_at, expected_preview, before_shift, after_shift
  ) values (
    p_business_id, p_venue_id, p_department_id, auth.uid(), p_request_id, p_shift_id,
    v_result_id, p_operation, p_week_start, p_target_date, p_target_employee_id,
    p_expected_updated_at, p_expected_preview, v_before, v_after
  ) returning id into v_result_id;
  return v_result_id;
end;
$$;
revoke all on function public.apply_roster_shift_change(uuid, uuid, uuid, uuid, timestamptz, date, date, uuid, text, jsonb, uuid)
  from public, anon;
grant execute on function public.apply_roster_shift_change(uuid, uuid, uuid, uuid, timestamptz, date, date, uuid, text, jsonb, uuid)
  to authenticated;

create function public.undo_roster_shift_change(
  p_business_id uuid, p_venue_id uuid, p_change_id uuid, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.roster_quick_changes%rowtype;
  v_undo public.roster_quick_change_undos%rowtype;
  v_shift public.shifts%rowtype;
  v_original_employee_id uuid;
  v_employee_id uuid;
  v_timezone text;
  v_restored jsonb;
begin
  if auth.uid() is null or p_change_id is null or p_request_id is null then
    raise exception 'Permission denied';
  end if;
  select r.* into v_receipt from public.roster_quick_changes r
  where r.id = p_change_id and r.actor_id = auth.uid()
    and r.business_id = p_business_id and r.venue_id = p_venue_id;
  if not found or not public.can_manage_department(v_receipt.business_id, v_receipt.department_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || v_receipt.business_id::text, 0));
  perform public.lock_scheduling_membership(v_receipt.business_id, v_receipt.department_id);
  perform pg_advisory_xact_lock(hashtextextended('roster-quick-undo:' || p_change_id::text, 0));
  select u.* into v_undo from public.roster_quick_change_undos u where u.change_id = p_change_id;
  if found then
    if v_undo.actor_id = auth.uid() and v_undo.request_id = p_request_id then
      return p_change_id;
    end if;
    raise exception 'Shift change was already undone';
  end if;
  select v.timezone into v_timezone from public.venues v
  join public.departments d on d.business_id = v.business_id and d.venue_id = v.id
  where v.id = v_receipt.venue_id and v.business_id = v_receipt.business_id
    and d.id = v_receipt.department_id and d.active
  for share of v, d;
  if not found then
    raise exception 'Venue or active department not found';
  end if;
  select s.* into v_shift from public.shifts s
  where s.id = v_receipt.result_shift_id and s.business_id = v_receipt.business_id
    and s.venue_id = v_receipt.venue_id and s.department_id = v_receipt.department_id
    and s.status = 'scheduled';
  if not found then
    raise exception 'Shift changed since the quick change';
  end if;
  v_original_employee_id := (v_receipt.before_shift->>'employee_id')::uuid;
  perform public.lock_shared_worker_groups(
    v_receipt.business_id, array[v_shift.employee_id, v_original_employee_id],
    'Roster changed while scheduling; please try again'
  );
  for v_employee_id in
    select distinct employee_id from unnest(array[v_shift.employee_id, v_original_employee_id]) employee_id
    where employee_id is not null order by employee_id
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(v_employee_id::text, 0)) then
      raise exception 'Roster changed while scheduling; please try again';
    end if;
    begin
      perform e.id from public.employees e where e.id = v_employee_id
        and e.business_id = v_receipt.business_id and e.venue_id = v_receipt.venue_id
      for share nowait;
    exception when lock_not_available then
      raise exception 'Roster changed while scheduling; please try again';
    end;
    if not found then
      raise exception 'Employee is not eligible for this department';
    end if;
  end loop;
  begin
    perform s.id from public.shifts s
    where s.id = v_receipt.result_shift_id and s.business_id = v_receipt.business_id
      and s.venue_id = v_receipt.venue_id and s.department_id = v_receipt.department_id
    for update nowait;
  exception when lock_not_available then
    raise exception 'Roster changed while scheduling; please try again';
  end;
  if not found or public.roster_quick_shift_snapshot(v_receipt.result_shift_id)
    is distinct from v_receipt.after_shift then
    raise exception 'Shift changed since the quick change';
  end if;
  if v_receipt.operation = 'duplicate' then
    perform public.delete_shift(v_receipt.result_shift_id);
  else
    perform public.update_draft_shift(
      v_receipt.business_id, v_receipt.venue_id, v_receipt.department_id,
      v_receipt.result_shift_id, v_original_employee_id,
      v_receipt.before_shift->>'role_title',
      (v_receipt.before_shift->>'starts_at')::timestamptz at time zone v_timezone,
      (v_receipt.before_shift->>'ends_at')::timestamptz at time zone v_timezone,
      (v_receipt.before_shift->>'break_minutes')::integer
    );
    v_restored := public.roster_quick_shift_snapshot(v_receipt.result_shift_id);
    if (v_restored->>'starts_at')::timestamptz is distinct from
      (v_receipt.before_shift->>'starts_at')::timestamptz
      or (v_restored->>'ends_at')::timestamptz is distinct from
      (v_receipt.before_shift->>'ends_at')::timestamptz then
      raise exception 'Previous shift time cannot be restored safely across a clock change';
    end if;
  end if;
  insert into public.roster_quick_change_undos (change_id, actor_id, request_id)
  values (p_change_id, auth.uid(), p_request_id);
  return p_change_id;
end;
$$;
revoke all on function public.undo_roster_shift_change(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.undo_roster_shift_change(uuid, uuid, uuid, uuid) to authenticated;
