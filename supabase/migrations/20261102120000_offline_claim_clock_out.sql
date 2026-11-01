alter table public.attendance_offline_claim_reviews
  drop constraint attendance_offline_claim_reviews_decision_check,
  drop constraint attendance_offline_claim_reviews_shape_check,
  add constraint attendance_offline_claim_reviews_decision_check
    check (decision in ('matched', 'corrected', 'rejected', 'reopened', 'created', 'completed')),
  add constraint attendance_offline_claim_reviews_shape_check check (
    (decision in ('rejected', 'reopened') and session_id is null and event_id is null
      and old_at is null and correction_id is null and offline_session_id is null)
    or (decision = 'matched' and session_id is not null and event_id is not null
      and old_at is not null and correction_id is null and offline_session_id is null)
    or (decision = 'corrected' and session_id is not null and event_id is not null
      and old_at is not null and correction_id is not null and offline_session_id is null)
    or (decision = 'created' and session_id is not null and event_id is not null
      and old_at is null and correction_id is null and offline_session_id is not null)
    or (decision = 'completed' and session_id is not null and event_id is not null
      and old_at is null and correction_id is null and offline_session_id is null)
  );

create function public.check_offline_claims_unused_for_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.attendance_offline_claim_reviews r
    where r.claim_id in (new.clock_in_claim_id, new.clock_out_claim_id)
      and r.decision in ('matched', 'corrected', 'created', 'completed')
  ) then
    raise exception 'A claim was already linked to attendance';
  end if;
  return new;
end;
$$;
revoke all on function public.check_offline_claims_unused_for_session()
  from public, anon, authenticated, service_role;
create trigger attendance_offline_claim_sessions_unused
  before insert on public.attendance_offline_claim_sessions
  for each row execute function public.check_offline_claims_unused_for_session();

create function public.list_attendance_offline_open_sessions(p_business_id uuid, p_venue_id uuid)
returns table (
  session_id uuid, employee_id uuid, department_id uuid, actor_id uuid,
  clocked_in_at timestamptz, latest_event_at timestamptz, open_break boolean, locked boolean
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
  select s.id, s.employee_id, s.department_id, s.started_by, ci.occurred_at,
    (select max(e.occurred_at) from public.attendance_events e where e.session_id = s.id),
    exists (
      select 1 from public.attendance_breaks b
      join public.attendance_events started on started.break_id = b.id and started.event_type = 'break_start'
      where b.session_id = s.id and not exists (
        select 1 from public.attendance_events ended
        where ended.break_id = b.id and ended.event_type = 'break_end'
      )
    ),
    public.attendance_edits_locked(s.id)
  from public.attendance_sessions s
  join public.attendance_events ci on ci.session_id = s.id and ci.event_type = 'clock_in'
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and not exists (
      select 1 from public.attendance_events co where co.session_id = s.id and co.event_type = 'clock_out'
    )
    and public.can_manage_department(s.business_id, s.department_id);
end;
$$;
revoke all on function public.list_attendance_offline_open_sessions(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.list_attendance_offline_open_sessions(uuid, uuid) to authenticated;

create function public.complete_attendance_from_offline_claim(
  p_business_id uuid, p_venue_id uuid, p_claim_id uuid, p_session_id uuid, p_request_id uuid,
  p_reason text, p_acknowledge_unverified boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claim public.attendance_offline_claims%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_previous public.attendance_offline_claim_reviews%rowtype;
  v_latest public.attendance_offline_claim_reviews%rowtype;
  v_start timestamptz;
  v_event_id uuid;
  v_review_id uuid;
  v_location_payload text := current_setting('butterbox.clock_location_payload', true);
begin
  if p_business_id is null or p_venue_id is null or p_claim_id is null or p_session_id is null
    or p_request_id is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500
    or p_acknowledge_unverified is distinct from true then
    raise exception 'Invalid offline clock-out review';
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
  select r.* into v_previous from public.attendance_offline_claim_reviews r
  where r.business_id = p_business_id and r.actor_id = auth.uid() and r.request_id = p_request_id;
  if found then
    if v_previous.claim_id <> p_claim_id or v_previous.decision <> 'completed'
      or v_previous.session_id <> p_session_id or v_previous.reason <> btrim(p_reason) then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.id;
  end if;
  select r.* into v_latest from public.attendance_offline_claim_reviews r
  where r.claim_id = p_claim_id order by r.sequence desc limit 1;
  if v_latest.id is not null and v_latest.decision <> 'reopened' then
    raise exception 'Claim has already been reviewed';
  end if;
  if exists (
    select 1 from public.attendance_offline_claim_reviews r
    where r.claim_id = p_claim_id and r.decision in ('matched', 'corrected', 'created', 'completed')
  ) then
    raise exception 'A claim was already linked to attendance';
  end if;
  select s.* into v_session from public.attendance_sessions s
  where s.id = p_session_id and s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.department_id = v_claim.department_id and s.employee_id = v_claim.employee_id
    and s.started_by = v_claim.actor_id
  for update;
  if not found or v_claim.event_type <> 'clock_out' then
    raise exception 'Matching open attendance session not found';
  end if;
  if public.attendance_edits_locked(v_session.id) then
    raise exception 'Attendance edits are locked';
  end if;
  select e.occurred_at into v_start from public.attendance_events e
  where e.session_id = v_session.id and e.event_type = 'clock_in';
  if v_start is null or exists (
    select 1 from public.attendance_events e where e.session_id = v_session.id and e.event_type = 'clock_out'
  ) then
    raise exception 'Matching open attendance session not found';
  end if;
  if v_claim.claimed_at <= v_start or v_claim.claimed_at > clock_timestamp() then
    raise exception 'Claimed clock-out time is invalid';
  end if;
  if exists (
    select 1 from public.attendance_sessions s
    join public.attendance_events ci on ci.session_id = s.id and ci.event_type = 'clock_in'
    left join public.attendance_events co on co.session_id = s.id and co.event_type = 'clock_out'
    where s.business_id = p_business_id and s.id <> v_session.id
      and (
        s.started_by = v_claim.actor_id or s.employee_id = v_claim.employee_id
        or exists (
          select 1 from public.shared_worker_profiles own
          join public.shared_worker_profiles linked on linked.shared_worker_id = own.shared_worker_id
          where own.business_id = p_business_id and own.employee_id = v_claim.employee_id
            and linked.employee_id = s.employee_id
        )
      )
      and public.attendance_effective_time(ci.id) < v_claim.claimed_at
      and (co.id is null or v_start < public.attendance_effective_time(co.id))
  ) then
    raise exception 'Claimed attendance overlaps another session';
  end if;
  perform set_config('butterbox.clock_location_payload', '{"status":"not_provided"}', true);
  insert into public.attendance_events (
    session_id, business_id, venue_id, department_id, employee_id, actor_id,
    request_id, event_type, occurred_at, source
  ) values (
    v_session.id, p_business_id, p_venue_id, v_claim.department_id, v_claim.employee_id,
    v_claim.actor_id, gen_random_uuid(), 'clock_out', v_claim.claimed_at, 'offline_claim'
  ) returning id into v_event_id;
  perform set_config('butterbox.clock_location_payload', coalesce(v_location_payload, ''), true);
  insert into public.attendance_offline_claim_reviews (
    business_id, claim_id, actor_id, request_id, decision, session_id, event_id, reason
  ) values (
    p_business_id, p_claim_id, auth.uid(), p_request_id, 'completed', v_session.id, v_event_id, btrim(p_reason)
  ) returning id into v_review_id;
  return v_review_id;
end;
$$;
revoke all on function public.complete_attendance_from_offline_claim(uuid, uuid, uuid, uuid, uuid, text, boolean)
  from public, anon, service_role;
grant execute on function public.complete_attendance_from_offline_claim(uuid, uuid, uuid, uuid, uuid, text, boolean)
  to authenticated;
