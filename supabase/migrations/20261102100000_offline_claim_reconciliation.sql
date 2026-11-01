alter table public.attendance_offline_claims
  add constraint attendance_offline_claims_id_business_key unique (id, business_id);

create table public.attendance_offline_claim_reviews (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  business_id uuid not null references public.businesses (id) on delete cascade,
  claim_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  decision text not null check (decision in ('matched', 'corrected', 'rejected', 'reopened')),
  session_id uuid,
  event_id uuid,
  old_at timestamptz,
  correction_id uuid references public.attendance_event_corrections (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (claim_id, business_id)
    references public.attendance_offline_claims (id, business_id) on delete cascade,
  foreign key (event_id, session_id, business_id)
    references public.attendance_events (id, session_id, business_id) on delete cascade,
  unique (business_id, actor_id, request_id),
  check (
    (decision in ('rejected', 'reopened') and session_id is null and event_id is null
      and old_at is null and correction_id is null)
    or (decision = 'matched' and session_id is not null and event_id is not null
      and old_at is not null and correction_id is null)
    or (decision = 'corrected' and session_id is not null and event_id is not null
      and old_at is not null and correction_id is not null)
  )
);
create index attendance_offline_claim_reviews_claim_idx
  on public.attendance_offline_claim_reviews (claim_id, sequence desc);
create trigger attendance_offline_claim_reviews_immutable
  before update or delete on public.attendance_offline_claim_reviews
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.attendance_offline_claim_reviews enable row level security;
revoke all on public.attendance_offline_claim_reviews from public, anon, authenticated, service_role;
create policy "Members can view scoped offline claim reviews"
  on public.attendance_offline_claim_reviews for select to authenticated
  using (public.can_view_attendance_offline_claim(claim_id));
grant select on public.attendance_offline_claim_reviews to authenticated;

create function public.review_attendance_offline_claim(
  p_business_id uuid, p_venue_id uuid, p_claim_id uuid, p_request_id uuid,
  p_decision text, p_event_id uuid, p_expected_at timestamptz, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claim public.attendance_offline_claims%rowtype;
  v_previous public.attendance_offline_claim_reviews%rowtype;
  v_latest public.attendance_offline_claim_reviews%rowtype;
  v_event public.attendance_events%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_correction_id uuid;
  v_id uuid;
begin
  if p_business_id is null or p_venue_id is null or p_claim_id is null or p_request_id is null
    or p_decision is null or p_decision not in ('matched', 'corrected', 'rejected', 'reopened')
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500
    or (p_decision in ('matched', 'corrected')
      and (p_event_id is null or p_expected_at is null or not isfinite(p_expected_at)))
    or (p_decision in ('rejected', 'reopened') and (p_event_id is not null or p_expected_at is not null)) then
    raise exception 'Invalid offline claim review';
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
    if v_previous.claim_id <> p_claim_id or v_previous.decision <> p_decision
      or v_previous.event_id is distinct from p_event_id or v_previous.old_at is distinct from p_expected_at
      or v_previous.reason <> btrim(p_reason) then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.id;
  end if;

  select r.* into v_latest from public.attendance_offline_claim_reviews r
  where r.claim_id = p_claim_id order by r.sequence desc limit 1;
  if p_decision = 'reopened' then
    if not exists (
      select 1 from public.business_memberships m where m.business_id = p_business_id
        and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'general_manager')
    ) then
      raise exception 'Only an owner or general manager can reopen a claim';
    end if;
    if v_latest.id is null or v_latest.decision = 'reopened' then
      raise exception 'Claim is already awaiting review';
    end if;
  elsif v_latest.id is not null and v_latest.decision <> 'reopened' then
    raise exception 'Claim has already been reviewed';
  end if;

  if p_decision in ('matched', 'corrected') then
    select e.* into v_event from public.attendance_events e
    join public.attendance_sessions s on s.id = e.session_id and s.business_id = e.business_id
    where e.id = p_event_id and e.business_id = p_business_id and e.venue_id = p_venue_id
      and e.department_id = v_claim.department_id and e.employee_id = v_claim.employee_id
      and e.actor_id = v_claim.actor_id and e.event_type = v_claim.event_type
      and s.started_by = v_claim.actor_id;
    if not found then
      raise exception 'Matching attendance event not found';
    end if;
    v_session := public.lock_attendance_session_for_edit(p_business_id, p_venue_id, v_event.session_id);
    if not exists (
      select 1 from public.attendance_events e
      where e.session_id = v_session.id and e.event_type = 'clock_in'
    ) or not exists (
      select 1 from public.attendance_events e
      where e.session_id = v_session.id and e.event_type = 'clock_out'
    ) then
      raise exception 'Only finished sessions can be reconciled';
    end if;
    if public.attendance_effective_time(v_event.id) is distinct from p_expected_at then
      raise exception 'Attendance changed; refresh before reconciling';
    end if;
    if p_decision = 'corrected' then
      v_correction_id := public.correct_attendance_event(
        p_business_id, p_venue_id, v_session.id, v_event.id, p_request_id,
        p_expected_at, v_claim.claimed_at, p_reason
      );
    end if;
  end if;

  insert into public.attendance_offline_claim_reviews (
    business_id, claim_id, actor_id, request_id, decision, session_id, event_id,
    old_at, correction_id, reason
  ) values (
    p_business_id, p_claim_id, auth.uid(), p_request_id, p_decision, v_session.id, p_event_id,
    p_expected_at, v_correction_id, btrim(p_reason)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.review_attendance_offline_claim(
  uuid, uuid, uuid, uuid, text, uuid, timestamptz, text
) from public, anon, service_role;
grant execute on function public.review_attendance_offline_claim(
  uuid, uuid, uuid, uuid, text, uuid, timestamptz, text
) to authenticated;

drop function public.list_attendance_offline_claims(uuid, uuid);
create function public.list_attendance_offline_claims(p_business_id uuid, p_venue_id uuid)
returns table (
  id uuid, employee_id uuid, employee_name text, department_id uuid, department_name text,
  actor_id uuid, event_type text, claimed_at timestamptz, received_at timestamptz
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
    c.event_type, c.claimed_at, c.received_at
  from public.attendance_offline_claims c
  join public.employees e on e.id = c.employee_id and e.business_id = c.business_id
  join public.departments d on d.id = c.department_id and d.business_id = c.business_id
  where c.business_id = p_business_id and c.venue_id = p_venue_id
    and public.can_view_attendance_offline_claim(c.id);
end;
$$;
revoke all on function public.list_attendance_offline_claims(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_attendance_offline_claims(uuid, uuid) to authenticated;

create function public.list_attendance_offline_claim_reviews(p_business_id uuid, p_venue_id uuid)
returns table (
  id uuid, sequence bigint, claim_id uuid, actor_id uuid, decision text, session_id uuid,
  event_id uuid, old_at timestamptz, correction_id uuid, reason text, created_at timestamptz
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
  select r.id, r.sequence, r.claim_id, r.actor_id, r.decision, r.session_id, r.event_id,
    r.old_at, r.correction_id, r.reason, r.created_at
  from public.attendance_offline_claim_reviews r
  join public.attendance_offline_claims c on c.id = r.claim_id and c.business_id = r.business_id
  where c.business_id = p_business_id and c.venue_id = p_venue_id
    and public.can_view_attendance_offline_claim(c.id);
end;
$$;
revoke all on function public.list_attendance_offline_claim_reviews(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_attendance_offline_claim_reviews(uuid, uuid) to authenticated;

create function public.list_attendance_offline_match_events(p_business_id uuid, p_venue_id uuid)
returns table (
  event_id uuid, session_id uuid, employee_id uuid, department_id uuid, actor_id uuid,
  event_type text, effective_at timestamptz, locked boolean
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
  select e.id, s.id, s.employee_id, s.department_id, s.started_by, e.event_type,
    public.attendance_effective_time(e.id), public.attendance_edits_locked(s.id)
  from public.attendance_sessions s
  join public.attendance_events e on e.session_id = s.id and e.business_id = s.business_id
  where s.business_id = p_business_id and s.venue_id = p_venue_id
    and e.event_type in ('clock_in', 'clock_out')
    and exists (select 1 from public.attendance_events ci where ci.session_id = s.id and ci.event_type = 'clock_in')
    and exists (select 1 from public.attendance_events co where co.session_id = s.id and co.event_type = 'clock_out')
    and public.can_manage_department(s.business_id, s.department_id);
end;
$$;
revoke all on function public.list_attendance_offline_match_events(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_attendance_offline_match_events(uuid, uuid) to authenticated;
