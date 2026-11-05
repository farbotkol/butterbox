alter table public.attendance_events
  add column source text not null default 'server_clock'
    check (source in ('server_clock', 'offline_claim'));

create table public.attendance_offline_claim_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  actor_id uuid not null,
  request_id uuid not null,
  clock_in_claim_id uuid not null,
  clock_out_claim_id uuid not null,
  session_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (clock_in_claim_id, business_id)
    references public.attendance_offline_claims (id, business_id) on delete cascade,
  foreign key (clock_out_claim_id, business_id)
    references public.attendance_offline_claims (id, business_id) on delete cascade,
  foreign key (session_id, business_id)
    references public.attendance_sessions (id, business_id) on delete cascade,
  unique (business_id, actor_id, request_id),
  unique (clock_in_claim_id),
  unique (clock_out_claim_id),
  unique (session_id)
);
create trigger attendance_offline_claim_sessions_immutable
  before update or delete on public.attendance_offline_claim_sessions
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.attendance_offline_claim_sessions enable row level security;
revoke all on public.attendance_offline_claim_sessions from public, anon, authenticated, service_role;
create policy "Members can view scoped offline claim sessions"
  on public.attendance_offline_claim_sessions for select to authenticated
  using (
    public.can_view_attendance_offline_claim(clock_in_claim_id)
    and public.can_view_attendance_offline_claim(clock_out_claim_id)
  );
grant select on public.attendance_offline_claim_sessions to authenticated;

alter table public.attendance_offline_claim_reviews
  add column offline_session_id uuid references public.attendance_offline_claim_sessions (id) on delete cascade,
  drop constraint attendance_offline_claim_reviews_decision_check,
  drop constraint attendance_offline_claim_reviews_check,
  add constraint attendance_offline_claim_reviews_decision_check
    check (decision in ('matched', 'corrected', 'rejected', 'reopened', 'created')),
  add constraint attendance_offline_claim_reviews_shape_check check (
    (decision in ('rejected', 'reopened') and session_id is null and event_id is null
      and old_at is null and correction_id is null and offline_session_id is null)
    or (decision = 'matched' and session_id is not null and event_id is not null
      and old_at is not null and correction_id is null and offline_session_id is null)
    or (decision = 'corrected' and session_id is not null and event_id is not null
      and old_at is not null and correction_id is not null and offline_session_id is null)
    or (decision = 'created' and session_id is not null and event_id is not null
      and old_at is null and correction_id is null and offline_session_id is not null)
  );

create function public.create_attendance_from_offline_claims(
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
    v_start.actor_id, gen_random_uuid(), 'clock_in', v_start.claimed_at, 'offline_claim'
  ) returning id into v_in_event_id;
  insert into public.attendance_events (
    session_id, business_id, venue_id, department_id, employee_id, actor_id,
    request_id, event_type, occurred_at, source
  ) values (
    v_session_id, p_business_id, p_venue_id, v_start.department_id, v_start.employee_id,
    v_start.actor_id, gen_random_uuid(), 'clock_out', v_end.claimed_at, 'offline_claim'
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
revoke all on function public.create_attendance_from_offline_claims(uuid, uuid, uuid, uuid, uuid, text, boolean)
  from public, anon, service_role;
grant execute on function public.create_attendance_from_offline_claims(uuid, uuid, uuid, uuid, uuid, text, boolean)
  to authenticated;

alter function public.list_worked_time(uuid, uuid) rename to list_worked_time_without_offline_source;
revoke all on function public.list_worked_time_without_offline_source(uuid, uuid)
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
      where e.session_id = w.session_id and e.business_id = p_business_id and e.source = 'offline_claim'
    ) then array_append(w.exceptions, 'offline_claim_unverified') else w.exceptions end
  from public.list_worked_time_without_offline_source(p_business_id, p_venue_id) w;
$$;
revoke all on function public.list_worked_time(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_worked_time(uuid, uuid) to authenticated;
