create table public.roster_copy_requests (
  business_id uuid not null references public.businesses (id) on delete cascade,
  actor_id uuid not null,
  request_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  source_week date not null,
  target_week date not null,
  shift_ids uuid[] not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (business_id, actor_id, request_id),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id) on delete cascade
);
alter table public.roster_copy_requests enable row level security;
revoke all on public.roster_copy_requests from public, anon, authenticated;

create function public.copy_roster_week(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid,
  p_source_week date, p_target_week date, p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.roster_copy_requests%rowtype;
  v_timezone text;
  v_offset integer;
  v_source_ids uuid[];
  v_employee_ids uuid[];
  v_employee_id uuid;
  v_source public.shifts%rowtype;
  v_start_local timestamp;
  v_end_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_shift_id uuid;
  v_created_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if p_request_id is null or p_source_week is null or p_target_week is null
    or not isfinite(p_source_week) or not isfinite(p_target_week)
    or extract(isodow from p_source_week) <> 1
    or extract(isodow from p_target_week) <> 1 or p_source_week = p_target_week then
    raise exception 'Invalid roster weeks';
  end if;
  begin
    v_offset := p_target_week - p_source_week;
  exception when numeric_value_out_of_range or datetime_field_overflow then
    raise exception 'Invalid roster weeks';
  end;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  select v.timezone into v_timezone
  from public.venues v
  join public.departments d on d.venue_id = v.id and d.business_id = v.business_id
  where v.id = p_venue_id and v.business_id = p_business_id
    and d.id = p_department_id and d.active
  for share of v, d;
  if not found then
    raise exception 'Venue or active department not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'roster-copy:' || p_business_id::text || ':' || auth.uid()::text || ':' || p_request_id::text, 0
  ));
  select r.* into v_receipt from public.roster_copy_requests r
  where r.business_id = p_business_id and r.actor_id = auth.uid() and r.request_id = p_request_id;
  if found then
    if v_receipt.venue_id <> p_venue_id or v_receipt.department_id <> p_department_id
      or v_receipt.source_week <> p_source_week or v_receipt.target_week <> p_target_week then
      raise exception 'Request identifier already used';
    end if;
    return cardinality(v_receipt.shift_ids);
  end if;

  begin
    select coalesce(array_agg(source.id order by source.id), '{}'::uuid[]) into v_source_ids
    from (
      select s.id from public.shifts s
      where s.business_id = p_business_id and s.venue_id = p_venue_id
        and s.department_id = p_department_id and s.status = 'scheduled'
        and (s.starts_at at time zone v_timezone)::date between p_source_week and p_source_week + 6
      order by s.id for share nowait
    ) source;
  exception when lock_not_available then
    raise exception 'Roster changed while copying; please try again';
  end;

  begin
    perform r.id from public.job_roles r
    where r.business_id = p_business_id and r.venue_id = p_venue_id
      and r.department_id = p_department_id and exists (
        select 1 from public.shifts s where s.id = any(v_source_ids)
          and lower(r.name) = lower(trim(s.role_title))
      )
    order by r.id for share nowait;
  exception when lock_not_available then
    raise exception 'Roster changed while copying; please try again';
  end;

  select coalesce(array_agg(distinct s.employee_id order by s.employee_id)
    filter (where s.employee_id is not null), '{}'::uuid[]) into v_employee_ids
  from public.shifts s where s.id = any(v_source_ids);
  perform public.lock_shared_worker_groups(
    p_business_id, v_employee_ids, 'Roster changed while copying; please try again'
  );
  for v_employee_id in select unnest(v_employee_ids) order by 1
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(v_employee_id::text, 0)) then
      raise exception 'Roster changed while copying; please try again';
    end if;
    begin
      perform 1 from public.employees e
      where e.id = v_employee_id and e.business_id = p_business_id and e.venue_id = p_venue_id
      for update nowait;
    exception when lock_not_available then
      raise exception 'Roster changed while copying; please try again';
    end;
    if not found then
      raise exception 'Employee is not eligible for this department';
    end if;
  end loop;

  for v_source in select s.* from public.shifts s where s.id = any(v_source_ids) order by s.id
  loop
    if v_source.requires_acknowledgement and v_source.employee_id is null then
      raise exception 'Assign or remove the acknowledgement requirement before copying';
    end if;
    begin
      v_start_local := (v_source.starts_at at time zone v_timezone) + v_offset * interval '1 day';
      v_end_local := (v_source.ends_at at time zone v_timezone) + v_offset * interval '1 day';
    exception when datetime_field_overflow then
      raise exception 'Invalid roster weeks';
    end;
    if v_end_local <= v_start_local or
      v_end_local - v_start_local <> v_source.ends_at - v_source.starts_at then
      raise exception 'A source shift crosses a clock change and cannot be copied safely';
    end if;
    select bounds.starts_at, bounds.ends_at into v_start, v_end
    from public.shift_time_bounds(v_timezone, v_start_local, v_end_local) bounds;
    if v_end - v_start <> v_end_local - v_start_local then
      raise exception 'A copied shift crosses a clock change and cannot be copied safely';
    end if;
    if v_source.employee_id is not null then
      if public.shared_worker_has_overlap(p_business_id, v_source.employee_id, v_start, v_end, null) then
        raise exception 'A copied shift overlaps an existing shift';
      end if;
      if not public.employee_available_for_shift(v_source.employee_id, v_start, v_end) then
        raise exception 'An employee is unavailable for a copied shift';
      end if;
    end if;
    v_shift_id := public.save_shift(
      p_business_id, p_venue_id, p_department_id, v_source.employee_id, v_source.role_title,
      v_start_local, v_end_local, v_source.break_minutes
    );
    if v_source.requires_acknowledgement then
      perform public.set_shift_acknowledgement_requirement(
        p_business_id, p_venue_id, p_department_id, v_shift_id, true
      );
    end if;
    v_created_ids := array_append(v_created_ids, v_shift_id);
  end loop;

  insert into public.roster_copy_requests (
    business_id, actor_id, request_id, venue_id, department_id, source_week, target_week, shift_ids
  ) values (
    p_business_id, auth.uid(), p_request_id, p_venue_id, p_department_id,
    p_source_week, p_target_week, v_created_ids
  );
  return cardinality(v_created_ids);
end;
$$;
revoke all on function public.copy_roster_week(uuid, uuid, uuid, date, date, uuid) from public, anon;
grant execute on function public.copy_roster_week(uuid, uuid, uuid, date, date, uuid) to authenticated;
