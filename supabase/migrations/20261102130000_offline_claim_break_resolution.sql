alter table public.attendance_events
  drop constraint attendance_events_source_check,
  add constraint attendance_events_source_check
    check (source in ('server_clock', 'offline_claim', 'manager_reported'));

create table public.attendance_offline_break_resolutions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  session_id uuid not null,
  break_id uuid not null,
  event_id uuid not null,
  claim_id uuid not null,
  review_id uuid not null references public.attendance_offline_claim_reviews (id) on delete cascade,
  actor_id uuid not null,
  request_id uuid not null,
  reported_end_at timestamptz not null check (isfinite(reported_end_at)),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (event_id, session_id, business_id)
    references public.attendance_events (id, session_id, business_id) on delete cascade,
  foreign key (break_id, session_id)
    references public.attendance_breaks (id, session_id) on delete cascade,
  foreign key (claim_id, business_id)
    references public.attendance_offline_claims (id, business_id) on delete cascade,
  unique (business_id, actor_id, request_id),
  unique (break_id),
  unique (event_id),
  unique (review_id)
);
create trigger attendance_offline_break_resolutions_immutable
  before update or delete on public.attendance_offline_break_resolutions
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.attendance_offline_break_resolutions enable row level security;
revoke all on public.attendance_offline_break_resolutions from public, anon, authenticated, service_role;
create policy "Members can view scoped offline break resolutions"
  on public.attendance_offline_break_resolutions for select to authenticated
  using (
    public.can_view_attendance_offline_claim(claim_id)
    and public.can_view_attendance_session(session_id)
  );
grant select on public.attendance_offline_break_resolutions to authenticated;

create function public.list_attendance_offline_open_breaks(p_business_id uuid, p_venue_id uuid)
returns table (
  break_id uuid, session_id uuid, employee_id uuid, department_id uuid, actor_id uuid,
  classification text, started_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) or not public.can_view_venue(p_business_id, p_venue_id) or not exists (
    select 1 from public.business_memberships m where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'general_manager', 'foh_manager', 'boh_manager', 'department_manager')
  ) then
    raise exception 'Permission denied';
  end if;
  return query
  select b.id, s.id, s.employee_id, s.department_id, s.started_by, b.classification, started.occurred_at
  from public.attendance_sessions s
  join public.attendance_breaks b on b.session_id = s.id and b.business_id = s.business_id
  join public.attendance_events started on started.break_id = b.id and started.event_type = 'break_start'
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and not exists (
      select 1 from public.attendance_events ended
      where ended.break_id = b.id and ended.event_type = 'break_end'
    )
    and not exists (
      select 1 from public.attendance_events co where co.session_id = s.id and co.event_type = 'clock_out'
    )
    and public.can_manage_department(s.business_id, s.department_id);
end;
$$;
revoke all on function public.list_attendance_offline_open_breaks(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.list_attendance_offline_open_breaks(uuid, uuid) to authenticated;

create function public.list_attendance_offline_break_resolutions(p_business_id uuid, p_venue_id uuid)
returns table (
  id uuid, claim_id uuid, session_id uuid, actor_id uuid, classification text,
  started_at timestamptz, reported_end_at timestamptz, reason text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select r.id, r.claim_id, r.session_id, r.actor_id, b.classification, started.occurred_at,
    r.reported_end_at, r.reason, r.created_at
  from public.attendance_offline_break_resolutions r
  join public.attendance_sessions s on s.id = r.session_id and s.business_id = r.business_id
  join public.attendance_breaks b on b.id = r.break_id and b.session_id = r.session_id
  join public.attendance_events started on started.break_id = b.id and started.event_type = 'break_start'
  where r.business_id = p_business_id and s.venue_id = p_venue_id
    and public.can_view_attendance_offline_claim(r.claim_id)
    and public.can_view_attendance_session(r.session_id);
end;
$$;
revoke all on function public.list_attendance_offline_break_resolutions(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.list_attendance_offline_break_resolutions(uuid, uuid) to authenticated;

create function public.complete_attendance_with_offline_break(
  p_business_id uuid, p_venue_id uuid, p_claim_id uuid, p_session_id uuid, p_break_id uuid,
  p_request_id uuid, p_break_ended_at timestamptz, p_reason text, p_acknowledge_unverified boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claim public.attendance_offline_claims%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_previous public.attendance_offline_break_resolutions%rowtype;
  v_break_start timestamptz;
  v_clock_in timestamptz;
  v_event_id uuid;
  v_review_id uuid;
begin
  if p_business_id is null or p_venue_id is null or p_claim_id is null or p_session_id is null
    or p_break_id is null or p_request_id is null or p_break_ended_at is null
    or not isfinite(p_break_ended_at) or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500
    or p_acknowledge_unverified is distinct from true then
    raise exception 'Invalid offline break resolution';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_attendance_membership(p_business_id);
  perform pg_advisory_xact_lock(hashtextextended(
    'offline-review-request:' || p_business_id::text || ':' || auth.uid()::text || ':' || p_request_id::text, 0
  ));
  select c.* into v_claim from public.attendance_offline_claims c
  where c.id = p_claim_id and c.business_id = p_business_id and c.venue_id = p_venue_id;
  if not found or not public.can_manage_department(p_business_id, v_claim.department_id) then
    raise exception 'Claim not found or permission denied';
  end if;
  perform public.lock_attendance_worker(p_business_id, v_claim.employee_id, v_claim.actor_id);
  select c.* into v_claim from public.attendance_offline_claims c
  where c.id = p_claim_id and c.business_id = p_business_id and c.venue_id = p_venue_id
  for update;
  if not found or not public.can_manage_department(p_business_id, v_claim.department_id) then
    raise exception 'Claim not found or permission denied';
  end if;
  select r.* into v_previous from public.attendance_offline_break_resolutions r
  where r.business_id = p_business_id and r.actor_id = auth.uid() and r.request_id = p_request_id;
  if found then
    if v_previous.claim_id <> p_claim_id or v_previous.session_id <> p_session_id
      or v_previous.break_id <> p_break_id or v_previous.reported_end_at <> p_break_ended_at
      or v_previous.reason <> btrim(p_reason) then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.review_id;
  end if;
  select s.* into v_session from public.attendance_sessions s
  where s.id = p_session_id and s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.department_id = v_claim.department_id and s.employee_id = v_claim.employee_id
    and s.started_by = v_claim.actor_id
  for update;
  if not found or v_claim.event_type <> 'clock_out' or exists (
    select 1 from public.attendance_events e where e.session_id = p_session_id and e.event_type = 'clock_out'
  ) then
    raise exception 'Matching open attendance session not found';
  end if;
  if public.attendance_edits_locked(v_session.id) then
    raise exception 'Attendance edits are locked';
  end if;
  select started.occurred_at into v_break_start
  from public.attendance_breaks b
  join public.attendance_events started on started.break_id = b.id and started.event_type = 'break_start'
  where b.id = p_break_id and b.session_id = p_session_id and b.business_id = p_business_id
    and not exists (
      select 1 from public.attendance_events ended where ended.break_id = b.id and ended.event_type = 'break_end'
    );
  if not found then
    raise exception 'Matching open break not found';
  end if;
  select e.occurred_at into v_clock_in from public.attendance_events e
  where e.session_id = p_session_id and e.event_type = 'clock_in';
  if v_clock_in is null or v_break_start < v_clock_in or p_break_ended_at <= v_break_start
    or p_break_ended_at > v_claim.claimed_at or p_break_ended_at > clock_timestamp() then
    raise exception 'Reported break time is invalid';
  end if;
  if exists (
    select 1 from public.attendance_breaks other
    join public.attendance_events started on started.break_id = other.id and started.event_type = 'break_start'
    left join public.attendance_events ended on ended.break_id = other.id and ended.event_type = 'break_end'
    where other.session_id = p_session_id and other.id <> p_break_id
      and (ended.id is null or (started.occurred_at < p_break_ended_at and v_break_start < ended.occurred_at))
  ) then
    raise exception 'Another break is open or overlaps';
  end if;
  insert into public.attendance_events (
    session_id, business_id, venue_id, department_id, employee_id, actor_id,
    request_id, event_type, break_id, occurred_at, source
  ) values (
    v_session.id, p_business_id, p_venue_id, v_claim.department_id, v_claim.employee_id,
    v_claim.actor_id, gen_random_uuid(), 'break_end', p_break_id, p_break_ended_at, 'manager_reported'
  ) returning id into v_event_id;
  v_review_id := public.complete_attendance_from_offline_claim(
    p_business_id, p_venue_id, p_claim_id, p_session_id, p_request_id, p_reason, p_acknowledge_unverified
  );
  insert into public.attendance_offline_break_resolutions (
    business_id, session_id, break_id, event_id, claim_id, review_id, actor_id, request_id, reported_end_at, reason
  ) values (
    p_business_id, p_session_id, p_break_id, v_event_id, p_claim_id, v_review_id, auth.uid(),
    p_request_id, p_break_ended_at, btrim(p_reason)
  );
  return v_review_id;
end;
$$;
revoke all on function public.complete_attendance_with_offline_break(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, boolean
) from public, anon, service_role;
grant execute on function public.complete_attendance_with_offline_break(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, boolean
) to authenticated;

alter function public.list_worked_time(uuid, uuid) rename to list_worked_time_without_reported_break;
revoke all on function public.list_worked_time_without_reported_break(uuid, uuid)
  from public, anon, authenticated, service_role;
create function public.list_worked_time(p_business_id uuid, p_venue_id uuid)
returns table (
  session_id uuid, employee_id uuid, employee_name text, department_id uuid, department_name text,
  venue_id uuid, venue_name text, venue_timezone text, clocked_in_at timestamptz,
  clocked_out_at timestamptz, elapsed_seconds numeric, worked_seconds numeric, paid_seconds numeric,
  paid_break_seconds numeric, unpaid_break_seconds numeric, exceptions text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.session_id, w.employee_id, w.employee_name, w.department_id, w.department_name,
    w.venue_id, w.venue_name, w.venue_timezone, w.clocked_in_at, w.clocked_out_at,
    w.elapsed_seconds, w.worked_seconds, w.paid_seconds, w.paid_break_seconds, w.unpaid_break_seconds,
    case when exists (
      select 1 from public.attendance_events e
      where e.session_id = w.session_id and e.business_id = p_business_id and e.source = 'manager_reported'
    ) then array_append(w.exceptions, 'manager_reported_break') else w.exceptions end
  from public.list_worked_time_without_reported_break(p_business_id, p_venue_id) w;
$$;
revoke all on function public.list_worked_time(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_worked_time(uuid, uuid) to authenticated;
