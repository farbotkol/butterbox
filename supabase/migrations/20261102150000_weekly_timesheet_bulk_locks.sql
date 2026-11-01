create table public.attendance_bulk_edit_lock_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  week_start date not null,
  employee_id uuid,
  selections jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  locked_session_ids uuid[] not null,
  invalid_session_ids uuid[] not null,
  already_locked_session_ids uuid[] not null,
  lock_event_ids uuid[] not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues (id, business_id),
  unique (business_id, actor_id, request_id),
  check (jsonb_typeof(selections) = 'array'),
  check (cardinality(locked_session_ids) = cardinality(lock_event_ids))
);
create trigger attendance_bulk_edit_lock_batches_immutable
  before update or delete on public.attendance_bulk_edit_lock_batches
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.attendance_bulk_edit_lock_batches enable row level security;
revoke all on public.attendance_bulk_edit_lock_batches from public, anon, authenticated, service_role;

create function public.attendance_review_revision(p_session_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select encode(extensions.digest(convert_to(jsonb_build_array(
    s.id, v.timezone,
    coalesce((select jsonb_agg(e.id order by e.id)
      from public.attendance_events e where e.session_id = s.id), '[]'::jsonb),
    coalesce((select jsonb_agg(b.id order by b.id)
      from public.attendance_breaks b where b.session_id = s.id), '[]'::jsonb),
    coalesce((select jsonb_agg(c.id order by c.id)
      from public.attendance_event_corrections c where c.session_id = s.id), '[]'::jsonb),
    coalesce((select jsonb_agg(l.id order by l.id)
      from public.attendance_edit_lock_events l where l.session_id = s.id), '[]'::jsonb),
    coalesce((select jsonb_agg(c.id order by c.id)
      from public.attendance_location_checks c where c.session_id = s.id), '[]'::jsonb),
    coalesce((select jsonb_agg(r.id order by r.id)
      from public.attendance_location_reviews r where r.session_id = s.id), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.attendance_sessions s
  join public.venues v on v.id = s.venue_id and v.business_id = s.business_id
  where s.id = p_session_id;
$$;
revoke all on function public.attendance_review_revision(uuid)
  from public, anon, authenticated, service_role;

create function public.list_weekly_worked_time_for_edit(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_employee_id uuid default null
)
returns table (
  session_id uuid, employee_id uuid, employee_name text, department_id uuid, department_name text,
  venue_id uuid, venue_name text, venue_timezone text, clocked_in_at timestamptz,
  clocked_out_at timestamptz, elapsed_seconds numeric, worked_seconds numeric, paid_seconds numeric,
  paid_break_seconds numeric, unpaid_break_seconds numeric, exceptions text[],
  edit_revision text, edit_locked boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.*, public.attendance_review_revision(w.session_id), public.attendance_edits_locked(w.session_id)
  from public.list_weekly_worked_time(p_business_id, p_venue_id, p_week_start, p_employee_id) w;
$$;
revoke all on function public.list_weekly_worked_time_for_edit(uuid, uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.list_weekly_worked_time_for_edit(uuid, uuid, date, uuid) to authenticated;

create function public.list_weekly_timesheet_events_for_edit(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_employee_id uuid default null
)
returns table (
  event_id uuid, session_id uuid, event_type text, classification text,
  original_at timestamptz, effective_at timestamptz, finished boolean, locked boolean, source text,
  edit_revision text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.*, public.attendance_review_revision(e.session_id)
  from public.list_weekly_timesheet_events(p_business_id, p_venue_id, p_week_start, p_employee_id) e;
$$;
revoke all on function public.list_weekly_timesheet_events_for_edit(uuid, uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.list_weekly_timesheet_events_for_edit(uuid, uuid, date, uuid) to authenticated;

create function public.bulk_lock_weekly_attendance(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_employee_id uuid,
  p_request_id uuid, p_selections jsonb, p_reason text
)
returns table (batch_id uuid, locked_count integer, invalid_count integer, already_locked_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_selections jsonb;
  v_session_ids uuid[];
  v_previous public.attendance_bulk_edit_lock_batches%rowtype;
  v_key uuid;
  v_item record;
  v_event_id uuid;
  v_batch_id uuid;
  v_locked uuid[] := '{}'::uuid[];
  v_invalid uuid[] := '{}'::uuid[];
  v_already_locked uuid[] := '{}'::uuid[];
  v_lock_events uuid[] := '{}'::uuid[];
begin
  if p_business_id is null or p_venue_id is null or p_request_id is null
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500
    or p_selections is null or jsonb_typeof(p_selections) <> 'array' then
    raise exception 'Invalid bulk attendance lock request';
  end if;
  if jsonb_array_length(p_selections) not between 1 and 100 then
    raise exception 'Invalid bulk attendance lock request';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_selections) item
    where jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item -> 'session_id') is distinct from 'string'
      or jsonb_typeof(item -> 'revision') is distinct from 'string'
      or (item ->> 'session_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (item ->> 'revision') !~ '^[0-9a-f]{64}$'
      or item - 'session_id' - 'revision' <> '{}'::jsonb
  ) then
    raise exception 'Invalid bulk attendance lock request';
  end if;
  select jsonb_agg(jsonb_build_object('session_id', x.id, 'revision', x.revision) order by x.id),
    array_agg(x.id order by x.id)
  into v_selections, v_session_ids
  from (
    select (item ->> 'session_id')::uuid as id, item ->> 'revision' as revision
    from jsonb_array_elements(p_selections) item
  ) x;
  if cardinality(v_session_ids) <> (select count(distinct id) from unnest(v_session_ids) id) then
    raise exception 'Invalid bulk attendance lock request';
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_attendance_membership(p_business_id);
  begin
    perform 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id for share nowait;
  exception when lock_not_available then
    raise exception 'Attendance changed; review again';
  end;
  perform 1 from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start);
  if (select count(*) from public.attendance_sessions s
    where s.id = any(v_session_ids) and s.business_id = p_business_id and s.venue_id = p_venue_id
      and (p_employee_id is null or s.employee_id = p_employee_id)
      and public.can_manage_department(s.business_id, s.department_id)) <> cardinality(v_session_ids) then
    raise exception 'Selected attendance not found or permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'attendance-bulk-lock:' || p_business_id::text || ':' || auth.uid()::text || ':' || p_request_id::text, 0
  ));
  select b.* into v_previous from public.attendance_bulk_edit_lock_batches b
  where b.business_id = p_business_id and b.actor_id = auth.uid() and b.request_id = p_request_id;
  if found then
    if v_previous.venue_id is distinct from p_venue_id
      or v_previous.week_start is distinct from p_week_start
      or v_previous.employee_id is distinct from p_employee_id
      or v_previous.selections is distinct from v_selections
      or v_previous.reason <> btrim(p_reason) then
      raise exception 'Request identifier already used';
    end if;
    return query select v_previous.id, cardinality(v_previous.locked_session_ids),
      cardinality(v_previous.invalid_session_ids), cardinality(v_previous.already_locked_session_ids);
    return;
  end if;

  for v_key in
    select distinct p.shared_worker_id from public.attendance_sessions s
    join public.shared_worker_profiles p on p.employee_id = s.employee_id and p.business_id = s.business_id
    where s.id = any(v_session_ids) order by p.shared_worker_id
  loop
    if not pg_try_advisory_xact_lock(hashtextextended('shared-worker:' || v_key::text, 0)) then
      raise exception 'Attendance changed; review again';
    end if;
  end loop;
  for v_key in
    select distinct s.employee_id from public.attendance_sessions s
    where s.id = any(v_session_ids) order by s.employee_id
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(
      'attendance-employee:' || p_business_id::text || ':' || v_key::text, 0
    )) then
      raise exception 'Attendance changed; review again';
    end if;
  end loop;
  for v_key in
    select distinct s.started_by from public.attendance_sessions s
    where s.id = any(v_session_ids) order by s.started_by
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(
      'attendance-user:' || p_business_id::text || ':' || v_key::text, 0
    )) then
      raise exception 'Attendance changed; review again';
    end if;
  end loop;
  begin
    perform 1 from public.attendance_sessions s
      where s.id = any(v_session_ids) order by s.id for update nowait;
    perform 1 from public.attendance_location_checks c
      where c.session_id = any(v_session_ids) order by c.id for share nowait;
  exception when lock_not_available then
    raise exception 'Attendance changed; review again';
  end;

  for v_item in
    with weekly as materialized (
      select * from public.list_weekly_worked_time_for_edit(p_business_id, p_venue_id, p_week_start, p_employee_id)
    )
    select (item ->> 'session_id')::uuid as id, item ->> 'revision' as revision,
      w.session_id as visible_id, w.worked_seconds, w.edit_locked, w.edit_revision
    from jsonb_array_elements(v_selections) item
    left join weekly w on w.session_id = (item ->> 'session_id')::uuid
    order by (item ->> 'session_id')::uuid
  loop
    if v_item.visible_id is null then
      raise exception 'Selected attendance changed week or is unavailable';
    end if;
    if v_item.worked_seconds is null then
      v_invalid := array_append(v_invalid, v_item.id);
    elsif v_item.edit_locked then
      v_already_locked := array_append(v_already_locked, v_item.id);
    elsif v_item.edit_revision is distinct from v_item.revision then
      raise exception 'Attendance changed; review again';
    else
      insert into public.attendance_edit_lock_events (
        business_id, session_id, actor_id, request_id, locked, reason
      ) values (
        p_business_id, v_item.id, auth.uid(), gen_random_uuid(), true, btrim(p_reason)
      ) returning id into v_event_id;
      v_locked := array_append(v_locked, v_item.id);
      v_lock_events := array_append(v_lock_events, v_event_id);
    end if;
  end loop;
  insert into public.attendance_bulk_edit_lock_batches (
    business_id, venue_id, actor_id, request_id, week_start, employee_id, selections, reason,
    locked_session_ids, invalid_session_ids, already_locked_session_ids, lock_event_ids
  ) values (
    p_business_id, p_venue_id, auth.uid(), p_request_id, p_week_start, p_employee_id, v_selections, btrim(p_reason),
    v_locked, v_invalid, v_already_locked, v_lock_events
  ) returning id into v_batch_id;
  return query select v_batch_id, cardinality(v_locked), cardinality(v_invalid), cardinality(v_already_locked);
end;
$$;
revoke all on function public.bulk_lock_weekly_attendance(uuid, uuid, date, uuid, uuid, jsonb, text)
  from public, anon, service_role;
grant execute on function public.bulk_lock_weekly_attendance(uuid, uuid, date, uuid, uuid, jsonb, text)
  to authenticated;

create function public.get_weekly_bulk_lock_receipt(p_business_id uuid, p_venue_id uuid, p_batch_id uuid)
returns table (
  batch_id uuid, week_start date, employee_id uuid,
  locked_count integer, invalid_count integer, already_locked_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.attendance_bulk_edit_lock_batches%rowtype;
begin
  if auth.uid() is null or p_business_id is null or p_venue_id is null or p_batch_id is null then
    raise exception 'Bulk attendance receipt not found or permission denied';
  end if;
  select b.* into v_batch from public.attendance_bulk_edit_lock_batches b
  where b.id = p_batch_id and b.business_id = p_business_id and b.venue_id = p_venue_id
    and b.actor_id = auth.uid();
  if not found then
    raise exception 'Bulk attendance receipt not found or permission denied';
  end if;
  perform 1 from public.timesheet_week_bounds(p_business_id, p_venue_id, v_batch.week_start);
  if exists (
    select 1 from jsonb_array_elements(v_batch.selections) item
    left join public.attendance_sessions s on s.id = (item ->> 'session_id')::uuid
      and s.business_id = p_business_id and s.venue_id = p_venue_id
    where s.id is null or not public.can_manage_department(s.business_id, s.department_id)
  ) then
    raise exception 'Bulk attendance receipt not found or permission denied';
  end if;
  return query select v_batch.id, v_batch.week_start, v_batch.employee_id, cardinality(v_batch.locked_session_ids),
    cardinality(v_batch.invalid_session_ids), cardinality(v_batch.already_locked_session_ids);
end;
$$;
revoke all on function public.get_weekly_bulk_lock_receipt(uuid, uuid, uuid)
  from public, anon, service_role;
grant execute on function public.get_weekly_bulk_lock_receipt(uuid, uuid, uuid) to authenticated;
