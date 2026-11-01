alter table public.attendance_offline_claims
  add column claim_source text not null default 'offline'
    check (claim_source in ('offline', 'employee_request')),
  add column request_reason text,
  add constraint attendance_claim_source_reason_check check (
    (claim_source = 'offline' and request_reason is null)
    or (claim_source = 'employee_request' and request_reason is not null
      and char_length(btrim(request_reason)) between 1 and 500)
  );

alter table public.attendance_events
  drop constraint attendance_events_source_check,
  add constraint attendance_events_source_check
    check (source in ('server_clock', 'offline_claim', 'manager_reported', 'employee_request'));

create index attendance_claim_reviews_correction_idx
  on public.attendance_offline_claim_reviews (correction_id)
  where correction_id is not null;

create function public.submit_attendance_claim(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_employee_id uuid,
  p_actor_id uuid, p_request_id uuid, p_event_type text, p_claimed_at timestamptz,
  p_claim_source text, p_reason text
)
returns table (claim_id uuid, received_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_department public.departments%rowtype;
  v_claim public.attendance_offline_claims%rowtype;
begin
  if p_business_id is null or p_venue_id is null or p_department_id is null
    or p_employee_id is null or p_actor_id is null or p_request_id is null
    or p_event_type is null or p_event_type not in ('clock_in', 'clock_out')
    or p_claimed_at is null or not isfinite(p_claimed_at)
    or p_claim_source is null or p_claim_source not in ('offline', 'employee_request')
    or (p_claim_source = 'offline' and p_reason is not null)
    or (p_claim_source = 'employee_request' and
      (p_reason is null or char_length(btrim(p_reason)) not between 1 and 500
        or p_claimed_at > clock_timestamp())) then
    if p_claim_source = 'offline' then
      raise exception 'Invalid offline attendance claim';
    end if;
    raise exception 'Invalid attendance correction request';
  end if;
  if auth.uid() is distinct from p_actor_id then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_view_department(p_business_id, p_department_id) or not exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.business_id = p_business_id
      and e.venue_id = p_venue_id and e.auth_user_id = auth.uid()
  ) then
    raise exception 'Employee not found or permission denied';
  end if;
  perform public.lock_attendance_identity(p_business_id, p_employee_id);
  select e.* into v_employee from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id
    and e.venue_id = p_venue_id and e.auth_user_id = auth.uid()
  for share;
  if not found or not public.can_view_department(p_business_id, p_department_id) then
    raise exception 'Employee not found or permission denied';
  end if;
  select d.* into v_department from public.departments d
  where d.id = p_department_id and d.business_id = p_business_id and d.venue_id = p_venue_id
  for share;
  if not found then
    raise exception 'Employee not found or permission denied';
  end if;

  select c.* into v_claim from public.attendance_offline_claims c
  where c.business_id = p_business_id and c.actor_id = auth.uid() and c.request_id = p_request_id;
  if found then
    if v_claim.venue_id <> p_venue_id or v_claim.department_id <> p_department_id
      or v_claim.employee_id <> p_employee_id or v_claim.event_type <> p_event_type
      or v_claim.claimed_at <> p_claimed_at or v_claim.claim_source <> p_claim_source
      or v_claim.request_reason is distinct from btrim(p_reason) then
      raise exception 'Request identifier already used';
    end if;
    return query select v_claim.id, v_claim.received_at;
    return;
  end if;
  perform 1 from public.employee_departments ed
  where ed.business_id = p_business_id and ed.employee_id = p_employee_id
    and ed.department_id = p_department_id
  for share;
  if not found or not v_employee.active or not v_department.active then
    raise exception 'Employee or department is unavailable';
  end if;
  insert into public.attendance_offline_claims (
    business_id, venue_id, department_id, employee_id, actor_id,
    request_id, event_type, claimed_at, claim_source, request_reason
  ) values (
    p_business_id, p_venue_id, p_department_id, p_employee_id, auth.uid(),
    p_request_id, p_event_type, p_claimed_at, p_claim_source, btrim(p_reason)
  ) returning * into v_claim;
  return query select v_claim.id, v_claim.received_at;
end;
$$;
revoke all on function public.submit_attendance_claim(
  uuid, uuid, uuid, uuid, uuid, uuid, text, timestamptz, text, text
) from public, anon, authenticated, service_role;

create or replace function public.submit_attendance_offline_claim(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_employee_id uuid,
  p_actor_id uuid, p_request_id uuid, p_event_type text, p_claimed_at timestamptz
)
returns table (claim_id uuid, received_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from public.submit_attendance_claim(
    p_business_id, p_venue_id, p_department_id, p_employee_id, p_actor_id, p_request_id,
    p_event_type, p_claimed_at, 'offline', null
  );
$$;

create function public.submit_attendance_correction_request(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_employee_id uuid,
  p_actor_id uuid, p_request_id uuid, p_event_type text, p_proposed_at timestamptz, p_reason text
)
returns table (claim_id uuid, received_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from public.submit_attendance_claim(
    p_business_id, p_venue_id, p_department_id, p_employee_id, p_actor_id, p_request_id,
    p_event_type, p_proposed_at, 'employee_request', p_reason
  );
$$;
revoke all on function public.submit_attendance_correction_request(
  uuid, uuid, uuid, uuid, uuid, uuid, text, timestamptz, text
) from public, anon, service_role;
grant execute on function public.submit_attendance_correction_request(
  uuid, uuid, uuid, uuid, uuid, uuid, text, timestamptz, text
) to authenticated;

drop function public.list_attendance_offline_claims(uuid, uuid);
create function public.list_attendance_offline_claims(p_business_id uuid, p_venue_id uuid)
returns table (
  id uuid, employee_id uuid, employee_name text, department_id uuid, department_name text,
  actor_id uuid, event_type text, claimed_at timestamptz, received_at timestamptz,
  claim_source text, request_reason text
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
  select c.id, c.employee_id, e.name, c.department_id, d.name, c.actor_id,
    c.event_type, c.claimed_at, c.received_at, c.claim_source, c.request_reason
  from public.attendance_offline_claims c
  join public.employees e on e.id = c.employee_id and e.business_id = c.business_id
  join public.departments d on d.id = c.department_id and d.business_id = c.business_id
  where c.business_id = p_business_id and c.venue_id = p_venue_id
    and public.can_view_attendance_offline_claim(c.id);
end;
$$;
revoke all on function public.list_attendance_offline_claims(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_attendance_offline_claims(uuid, uuid) to authenticated;

create function public.check_attendance_request_match()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.decision = 'matched' and exists (
    select 1 from public.attendance_offline_claims c
    where c.id = new.claim_id and c.business_id = new.business_id
      and c.claim_source = 'employee_request' and c.claimed_at is distinct from new.old_at
  ) then
    raise exception 'The event does not match the requested time';
  end if;
  return new;
end;
$$;
revoke all on function public.check_attendance_request_match()
  from public, anon, authenticated, service_role;
create trigger attendance_correction_request_match
  before insert on public.attendance_offline_claim_reviews
  for each row execute function public.check_attendance_request_match();

create or replace function public.create_attendance_from_offline_claims(
  p_business_id uuid, p_venue_id uuid, p_clock_in_claim_id uuid, p_clock_out_claim_id uuid,
  p_request_id uuid, p_reason text, p_acknowledge_unverified boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start public.attendance_offline_claims%rowtype;
  v_end public.attendance_offline_claims%rowtype;
  v_previous public.attendance_offline_claim_sessions%rowtype;
  v_session_id uuid;
  v_pair_id uuid;
  v_in_event_id uuid;
  v_out_event_id uuid;
  v_location_payload text := current_setting('butterbox.clock_location_payload', true);
begin
  if p_business_id is null or p_venue_id is null or p_clock_in_claim_id is null
    or p_clock_out_claim_id is null or p_clock_in_claim_id = p_clock_out_claim_id
    or p_request_id is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500
    or p_acknowledge_unverified is distinct from true then
    raise exception 'Invalid offline attendance pair';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_attendance_membership(p_business_id);
  perform pg_advisory_xact_lock(hashtextextended(
    'offline-pair-request:' || p_business_id::text || ':' || auth.uid()::text || ':' || p_request_id::text, 0
  ));
  select c.* into v_start from public.attendance_offline_claims c
  where c.id = p_clock_in_claim_id and c.business_id = p_business_id and c.venue_id = p_venue_id;
  select c.* into v_end from public.attendance_offline_claims c
  where c.id = p_clock_out_claim_id and c.business_id = p_business_id and c.venue_id = p_venue_id;
  if v_start.id is null or v_end.id is null
    or not public.can_manage_department(p_business_id, v_start.department_id)
    or not public.can_manage_department(p_business_id, v_end.department_id) then
    raise exception 'Claims not found or permission denied';
  end if;
  if v_start.event_type <> 'clock_in' or v_end.event_type <> 'clock_out'
    or v_start.employee_id <> v_end.employee_id or v_start.department_id <> v_end.department_id
    or v_start.actor_id <> v_end.actor_id then
    raise exception 'Claims must belong to the same worker and department';
  end if;
  perform public.lock_attendance_worker(p_business_id, v_start.employee_id, v_start.actor_id);
  perform 1 from public.attendance_offline_claims c
  where c.id in (p_clock_in_claim_id, p_clock_out_claim_id)
  order by c.id for update;
  if not public.can_manage_department(p_business_id, v_start.department_id) then
    raise exception 'Claims not found or permission denied';
  end if;
  select p.* into v_previous from public.attendance_offline_claim_sessions p
  where p.business_id = p_business_id and p.actor_id = auth.uid() and p.request_id = p_request_id;
  if found then
    if v_previous.clock_in_claim_id <> p_clock_in_claim_id
      or v_previous.clock_out_claim_id <> p_clock_out_claim_id or v_previous.reason <> btrim(p_reason) then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.session_id;
  end if;
  if exists (
    select 1 from public.attendance_offline_claim_sessions p
    where p.clock_in_claim_id = p_clock_in_claim_id or p.clock_out_claim_id = p_clock_out_claim_id
  ) then
    raise exception 'A claim already created attendance';
  end if;
  if exists (
    select 1 from (
      select distinct on (r.claim_id) r.claim_id, r.decision
      from public.attendance_offline_claim_reviews r
      where r.claim_id in (p_clock_in_claim_id, p_clock_out_claim_id)
      order by r.claim_id, r.sequence desc
    ) latest where latest.decision <> 'reopened'
  ) then
    raise exception 'A claim has already been reviewed';
  end if;
  if v_start.claimed_at >= v_end.claimed_at or v_end.claimed_at > clock_timestamp() then
    raise exception 'Claimed clock times are invalid';
  end if;
  if exists (
    select 1 from public.attendance_sessions s
    join public.attendance_events ci on ci.session_id = s.id and ci.event_type = 'clock_in'
    left join public.attendance_events co on co.session_id = s.id and co.event_type = 'clock_out'
    where s.business_id = p_business_id
      and (
        s.started_by = v_start.actor_id or s.employee_id = v_start.employee_id
        or exists (
          select 1 from public.shared_worker_profiles own
          join public.shared_worker_profiles linked on linked.shared_worker_id = own.shared_worker_id
          where own.business_id = p_business_id and own.employee_id = v_start.employee_id
            and linked.employee_id = s.employee_id
        )
      )
      and public.attendance_effective_time(ci.id) < v_end.claimed_at
      and (co.id is null or v_start.claimed_at < public.attendance_effective_time(co.id))
  ) then
    raise exception 'Claimed attendance overlaps another session';
  end if;

  insert into public.attendance_sessions (
    business_id, venue_id, department_id, employee_id, started_by
  ) values (
    p_business_id, p_venue_id, v_start.department_id, v_start.employee_id, v_start.actor_id
  ) returning id into v_session_id;
  perform set_config('butterbox.clock_location_payload', '{"status":"not_provided"}', true);
  insert into public.attendance_events (
    session_id, business_id, venue_id, department_id, employee_id, actor_id,
    request_id, event_type, occurred_at, source
  ) values (
    v_session_id, p_business_id, p_venue_id, v_start.department_id, v_start.employee_id,
    v_start.actor_id, gen_random_uuid(), 'clock_in', v_start.claimed_at,
    case when v_start.claim_source = 'employee_request' then 'employee_request' else 'offline_claim' end
  ) returning id into v_in_event_id;
  insert into public.attendance_events (
    session_id, business_id, venue_id, department_id, employee_id, actor_id,
    request_id, event_type, occurred_at, source
  ) values (
    v_session_id, p_business_id, p_venue_id, v_start.department_id, v_start.employee_id,
    v_start.actor_id, gen_random_uuid(), 'clock_out', v_end.claimed_at,
    case when v_end.claim_source = 'employee_request' then 'employee_request' else 'offline_claim' end
  ) returning id into v_out_event_id;
  perform set_config('butterbox.clock_location_payload', coalesce(v_location_payload, ''), true);
  insert into public.attendance_offline_claim_sessions (
    business_id, actor_id, request_id, clock_in_claim_id, clock_out_claim_id, session_id, reason
  ) values (
    p_business_id, auth.uid(), p_request_id, v_start.id, v_end.id, v_session_id, btrim(p_reason)
  ) returning id into v_pair_id;
  insert into public.attendance_offline_claim_reviews (
    business_id, claim_id, actor_id, request_id, decision, session_id, event_id,
    offline_session_id, reason
  ) values
    (p_business_id, v_start.id, auth.uid(), gen_random_uuid(), 'created',
      v_session_id, v_in_event_id, v_pair_id, btrim(p_reason)),
    (p_business_id, v_end.id, auth.uid(), gen_random_uuid(), 'created',
      v_session_id, v_out_event_id, v_pair_id, btrim(p_reason));
  return v_session_id;
end;
$$;

create or replace function public.complete_attendance_from_offline_claim(
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
    v_claim.actor_id, gen_random_uuid(), 'clock_out', v_claim.claimed_at,
    case when v_claim.claim_source = 'employee_request' then 'employee_request' else 'offline_claim' end
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

alter function public.list_worked_time(uuid, uuid) rename to list_worked_time_without_employee_request;
revoke all on function public.list_worked_time_without_employee_request(uuid, uuid)
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
      where e.session_id = w.session_id and e.business_id = p_business_id and (
        e.source = 'employee_request'
        or exists (
          select 1 from public.attendance_event_corrections correction
          join public.attendance_offline_claim_reviews review on review.correction_id = correction.id
          join public.attendance_offline_claims claim on claim.id = review.claim_id
            and claim.business_id = review.business_id
          where correction.id = (
            select latest.id from public.attendance_event_corrections latest
            where latest.event_id = e.id order by latest.sequence desc limit 1
          ) and claim.claim_source = 'employee_request'
        )
      )
    ) then array_append(w.exceptions, 'employee_request_unverified') else w.exceptions end
  from public.list_worked_time_without_employee_request(p_business_id, p_venue_id) w;
$$;
revoke all on function public.list_worked_time(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_worked_time(uuid, uuid) to authenticated;
