create table public.attendance_timesheet_decisions (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  department_id uuid not null,
  employee_id uuid not null,
  session_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  decision text not null check (decision in ('approved', 'rejected')),
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 500),
  lock_event_id uuid references public.attendance_edit_lock_events (id),
  revision text not null check (revision ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (session_id, business_id)
    references public.attendance_sessions (id, business_id) on delete cascade,
  foreign key (venue_id, business_id) references public.venues (id, business_id),
  unique (business_id, actor_id, request_id),
  check (decision = 'approved' or reason is not null),
  check (decision = 'approved' or lock_event_id is null)
);
create index attendance_timesheet_decisions_session_idx
  on public.attendance_timesheet_decisions (session_id, sequence desc);
create index attendance_timesheet_decisions_lock_idx
  on public.attendance_timesheet_decisions (lock_event_id) where lock_event_id is not null;
create trigger attendance_timesheet_decisions_immutable
  before update or delete on public.attendance_timesheet_decisions
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.attendance_timesheet_decisions enable row level security;
revoke all on public.attendance_timesheet_decisions from public, anon, authenticated, service_role;
create policy "Members can view scoped timesheet decisions"
  on public.attendance_timesheet_decisions for select to authenticated
  using (public.can_view_attendance_session(session_id));
grant select on public.attendance_timesheet_decisions to authenticated;

-- An approval stays current only while the reviewed attendance is unchanged; any later
-- correction, unlock or review makes it outdated. A rejection followed by a change is resubmitted.
create function public.attendance_timesheet_status(p_session_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when d.id is null then 'pending'
    when d.decision = 'approved' and d.revision = public.attendance_review_revision(p_session_id) then 'approved'
    when d.decision = 'approved' then 'approval_outdated'
    when d.revision = public.attendance_review_revision(p_session_id) then 'returned'
    else 'resubmitted'
  end
  from (select 1) one
  left join lateral (
    select x.* from public.attendance_timesheet_decisions x
    where x.session_id = p_session_id order by x.sequence desc limit 1
  ) d on true;
$$;
revoke all on function public.attendance_timesheet_status(uuid) from public, anon, authenticated, service_role;

create function public.is_own_attendance_session(p_business_id uuid, p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.attendance_sessions s
    where s.id = p_session_id and s.business_id = p_business_id and (
      s.started_by = auth.uid()
      or exists (
        select 1 from public.employees e
        where e.business_id = s.business_id and e.auth_user_id = auth.uid()
          and (
            e.id = s.employee_id
            or exists (
              select 1 from public.shared_worker_profiles mine
              join public.shared_worker_profiles theirs
                on theirs.shared_worker_id = mine.shared_worker_id and theirs.business_id = mine.business_id
              where mine.employee_id = e.id and mine.business_id = s.business_id
                and theirs.employee_id = s.employee_id
            )
          )
      )
    )
  );
$$;
revoke all on function public.is_own_attendance_session(uuid, uuid) from public, anon, authenticated, service_role;

create function public.decide_attendance_timesheet(
  p_business_id uuid, p_venue_id uuid, p_session_id uuid, p_request_id uuid,
  p_expected_revision text, p_decision text, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_previous public.attendance_timesheet_decisions%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status text;
  v_worked numeric;
  v_lock_id uuid;
  v_id uuid;
begin
  if p_request_id is null or p_decision is null or p_decision not in ('approved', 'rejected')
    or p_expected_revision is null or p_expected_revision !~ '^[0-9a-f]{64}$'
    or (v_reason is not null and char_length(v_reason) > 500)
    or (p_decision = 'rejected' and v_reason is null) then
    raise exception 'Invalid timesheet decision';
  end if;
  v_session := public.lock_attendance_session_for_edit(p_business_id, p_venue_id, p_session_id);
  select d.* into v_previous from public.attendance_timesheet_decisions d
  where d.business_id = p_business_id and d.actor_id = auth.uid() and d.request_id = p_request_id;
  if found then
    if v_previous.session_id <> p_session_id or v_previous.decision <> p_decision
      or v_previous.reason is distinct from v_reason then
      raise exception 'Request identifier already used';
    end if;
    return v_previous.id;
  end if;
  if public.is_own_attendance_session(p_business_id, p_session_id)
    and not public.has_business_role(p_business_id, array['owner']) then
    raise exception 'You cannot approve or return your own attendance';
  end if;
  if public.attendance_review_revision(p_session_id) is distinct from p_expected_revision then
    raise exception 'Attendance changed; review again';
  end if;
  v_status := public.attendance_timesheet_status(p_session_id);
  if p_decision = 'approved' then
    if v_status = 'approved' then
      raise exception 'Timesheet entry is already approved';
    end if;
    select w.worked_seconds into v_worked from public.list_worked_time(p_business_id, p_venue_id) w
    where w.session_id = p_session_id;
    if v_worked is null then
      raise exception 'Incomplete or invalid attendance cannot be approved';
    end if;
    if not public.attendance_edits_locked(p_session_id) then
      insert into public.attendance_edit_lock_events (
        business_id, session_id, actor_id, request_id, locked, reason
      ) values (
        p_business_id, p_session_id, auth.uid(), gen_random_uuid(), true,
        coalesce(v_reason, 'Timesheet approved')
      ) returning id into v_lock_id;
    end if;
  else
    if v_status = 'returned' then
      raise exception 'Timesheet entry is already returned for correction';
    end if;
    if public.attendance_edits_locked(p_session_id) then
      raise exception 'Unlock attendance before returning it for correction';
    end if;
  end if;
  insert into public.attendance_timesheet_decisions (
    business_id, venue_id, department_id, employee_id, session_id, actor_id, request_id,
    decision, reason, lock_event_id, revision
  ) values (
    p_business_id, v_session.venue_id, v_session.department_id, v_session.employee_id, p_session_id,
    auth.uid(), p_request_id, p_decision, v_reason, v_lock_id,
    public.attendance_review_revision(p_session_id)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.decide_attendance_timesheet(uuid, uuid, uuid, uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.decide_attendance_timesheet(uuid, uuid, uuid, uuid, text, text, text)
  to authenticated;

create function public.list_weekly_timesheet_approvals(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_employee_id uuid default null
)
returns table (
  session_id uuid, department_id uuid, status text, decision text, reason text,
  decided_at timestamptz, actor_id uuid, self_owned boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.session_id, w.department_id, public.attendance_timesheet_status(w.session_id),
    d.decision, d.reason, d.created_at, d.actor_id,
    public.is_own_attendance_session(p_business_id, w.session_id)
      and not public.has_business_role(p_business_id, array['owner'])
  from public.list_weekly_worked_time(p_business_id, p_venue_id, p_week_start, p_employee_id) w
  left join lateral (
    select x.* from public.attendance_timesheet_decisions x
    where x.session_id = w.session_id order by x.sequence desc limit 1
  ) d on true
  where public.can_manage_department(p_business_id, w.department_id);
$$;
revoke all on function public.list_weekly_timesheet_approvals(uuid, uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.list_weekly_timesheet_approvals(uuid, uuid, date, uuid) to authenticated;

create function public.list_timesheet_decisions(p_business_id uuid, p_venue_id uuid)
returns table (
  decision_id uuid, session_id uuid, employee_name text, department_name text,
  clocked_in_at timestamptz, decision text, reason text, status text, decided_at timestamptz, actor_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.session_id, e.name, dep.name,
    (select public.attendance_effective_time(ev.id) from public.attendance_events ev
      where ev.session_id = d.session_id and ev.event_type = 'clock_in' limit 1),
    d.decision, d.reason, public.attendance_timesheet_status(d.session_id), d.created_at, d.actor_id
  from public.attendance_timesheet_decisions d
  join public.employees e on e.id = d.employee_id and e.business_id = d.business_id
  join public.departments dep on dep.id = d.department_id and dep.business_id = d.business_id
  where d.business_id = p_business_id and d.venue_id = p_venue_id
    and public.can_view_attendance_session(d.session_id)
    and d.sequence = (
      select max(x.sequence) from public.attendance_timesheet_decisions x where x.session_id = d.session_id
    );
$$;
revoke all on function public.list_timesheet_decisions(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_timesheet_decisions(uuid, uuid) to authenticated;
