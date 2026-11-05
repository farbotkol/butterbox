create table public.venue_roster_week_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  venue_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  revision integer not null check (revision > 0),
  action text not null check (action in ('scheduled', 'cancelled')),
  previous_weekday smallint not null check (previous_weekday between 1 and 7),
  weekday smallint not null check (weekday between 1 and 7),
  effective_on date not null check (
    isfinite(effective_on) and effective_on between '1900-01-01'::date and '9999-12-24'::date
  ),
  supersedes uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues(id, business_id) on delete cascade,
  unique (id, business_id, venue_id),
  foreign key (supersedes, business_id, venue_id)
    references public.venue_roster_week_events(id, business_id, venue_id),
  unique (supersedes),
  unique (venue_id, revision),
  unique (business_id, actor_id, request_id),
  check (action <> 'cancelled' or supersedes is not null)
);

create index venue_roster_week_events_effective_idx
  on public.venue_roster_week_events(business_id, venue_id, effective_on, revision);

create trigger venue_roster_week_events_immutable
  before update or delete on public.venue_roster_week_events
  for each row execute function public.prevent_roster_review_mutation();

alter table public.venue_roster_week_events enable row level security;
revoke all on public.venue_roster_week_events from public, anon, authenticated, service_role;
grant select on public.venue_roster_week_events to authenticated;
create policy "Owners can view venue roster week history"
  on public.venue_roster_week_events for select to authenticated
  using (public.has_business_role(business_id, array['owner']));

create function public.audit_venue_roster_week_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.sensitive_action_audit (
    business_id, actor_id, actor_kind, source_table, operation, record_id, old_values, new_values
  ) values (
    new.business_id, new.actor_id, 'user', 'venue_roster_week_events', 'INSERT', new.id::text,
    jsonb_build_object('weekday', new.previous_weekday),
    jsonb_build_object('venue_id', new.venue_id, 'weekday', new.weekday,
      'action', new.action, 'effective_on', new.effective_on, 'revision', new.revision,
      'supersedes', new.supersedes)
  );
  return new;
end;
$$;
revoke all on function public.audit_venue_roster_week_event() from public, anon, authenticated, service_role;
create trigger venue_roster_week_events_audit
  after insert on public.venue_roster_week_events
  for each row execute function public.audit_venue_roster_week_event();

create function public.venue_roster_week_state(
  p_business_id uuid, p_venue_id uuid, p_date date
)
returns table (
  current_weekday smallint, pending_weekday smallint, pending_effective_on date,
  pending_id uuid, revision integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce((
      select e.weekday from public.venue_roster_week_events e
      where e.business_id = p_business_id and e.venue_id = p_venue_id
        and e.action = 'scheduled' and e.effective_on <= p_date
        and not exists (
          select 1 from public.venue_roster_week_events successor where successor.supersedes = e.id
        )
      order by e.effective_on desc, e.revision desc limit 1
    ), 1::smallint),
    pending.weekday, pending.effective_on, pending.id,
    coalesce((
      select max(e.revision) from public.venue_roster_week_events e
      where e.business_id = p_business_id and e.venue_id = p_venue_id
    ), 0)
  from (select 1) seed
  left join lateral (
    select e.id, e.weekday, e.effective_on from public.venue_roster_week_events e
    where e.business_id = p_business_id and e.venue_id = p_venue_id
      and e.action = 'scheduled' and e.effective_on > p_date
      and not exists (
        select 1 from public.venue_roster_week_events successor where successor.supersedes = e.id
      )
    order by e.effective_on, e.revision limit 1
  ) pending on true;
$$;
revoke all on function public.venue_roster_week_state(uuid, uuid, date)
  from public, anon, authenticated, service_role;

create function public.get_venue_roster_week_settings(p_business_id uuid, p_venue_id uuid)
returns table (
  current_weekday smallint, pending_weekday smallint, pending_effective_on date,
  pending_id uuid, pending_locked boolean, revision integer, venue_today date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_today date;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner']) then
    raise exception 'Permission denied';
  end if;
  select v.timezone into v_timezone from public.venues v
  where v.id = p_venue_id and v.business_id = p_business_id;
  if not found then raise exception 'Permission denied'; end if;
  v_today := (now() at time zone v_timezone)::date;
  return query
    select s.current_weekday, s.pending_weekday, s.pending_effective_on, s.pending_id,
      coalesce(s.pending_effective_on <
        (v_today - ((extract(isodow from v_today)::integer - s.current_weekday + 7) % 7) + 7), false),
      s.revision, v_today
    from public.venue_roster_week_state(p_business_id, p_venue_id, v_today) s;
end;
$$;
revoke all on function public.get_venue_roster_week_settings(uuid, uuid) from public, anon, service_role;
grant execute on function public.get_venue_roster_week_settings(uuid, uuid) to authenticated;

create function public.save_venue_roster_week(
  p_business_id uuid, p_venue_id uuid, p_weekday smallint, p_expected_revision integer,
  p_expected_pending_id uuid, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_today date;
  v_current smallint;
  v_revision integer;
  v_pending public.venue_roster_week_events%rowtype;
  v_existing public.venue_roster_week_events%rowtype;
  v_effective date;
  v_action text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Permission denied'; end if;
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  for share;
  if not found then raise exception 'Permission denied'; end if;
  if p_weekday is null or p_weekday not between 1 and 7
    or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647
    or p_request_id is null then
    raise exception 'Invalid roster week setting';
  end if;
  select v.timezone into v_timezone from public.venues v
  where v.id = p_venue_id and v.business_id = p_business_id for update;
  if not found then raise exception 'Permission denied'; end if;

  select * into v_existing from public.venue_roster_week_events e
  where e.business_id = p_business_id and e.actor_id = auth.uid() and e.request_id = p_request_id;
  if found then
    if v_existing.venue_id <> p_venue_id or v_existing.weekday <> p_weekday
      or v_existing.revision <> p_expected_revision + 1
      or v_existing.supersedes is distinct from p_expected_pending_id then
      raise exception 'Request identifier already used';
    end if;
    return v_existing.id;
  end if;

  v_today := (clock_timestamp() at time zone v_timezone)::date;
  select s.current_weekday, s.revision into v_current, v_revision
  from public.venue_roster_week_state(p_business_id, p_venue_id, v_today) s;
  if v_revision <> p_expected_revision then
    raise exception 'Roster week setting changed; refresh before saving';
  end if;
  select e.* into v_pending from public.venue_roster_week_events e
  where e.business_id = p_business_id and e.venue_id = p_venue_id
    and e.action = 'scheduled' and e.effective_on > v_today
    and not exists (
      select 1 from public.venue_roster_week_events successor where successor.supersedes = e.id
    )
  order by e.effective_on, e.revision limit 1;
  if v_pending.id is distinct from p_expected_pending_id then
    raise exception 'Roster week setting changed; refresh before saving';
  end if;
  if v_pending.id is null and p_weekday = v_current then return null; end if;
  if v_pending.id is not null and p_weekday = v_pending.weekday then return null; end if;
  if v_pending.id is not null and v_pending.effective_on <
    (v_today - ((extract(isodow from v_today)::integer - v_current + 7) % 7) + 7) then
    raise exception 'Planning transition has started; wait for it to take effect';
  end if;

  if p_weekday = v_current then
    v_action := 'cancelled';
    v_effective := v_pending.effective_on;
  else
    v_action := 'scheduled';
    v_effective := v_today - ((extract(isodow from v_today)::integer - v_current + 7) % 7) + 7;
    v_effective := v_effective + ((p_weekday - extract(isodow from v_effective)::integer + 7) % 7);
  end if;
  if v_effective > '9999-12-24'::date then raise exception 'Invalid roster week setting'; end if;

  insert into public.venue_roster_week_events (
    business_id, venue_id, actor_id, request_id, revision, action,
    previous_weekday, weekday, effective_on, supersedes
  ) values (
    p_business_id, p_venue_id, auth.uid(), p_request_id, v_revision + 1, v_action,
    coalesce(v_pending.weekday, v_current), p_weekday, v_effective, v_pending.id
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.save_venue_roster_week(uuid, uuid, smallint, integer, uuid, uuid)
  from public, anon, service_role;
grant execute on function public.save_venue_roster_week(uuid, uuid, smallint, integer, uuid, uuid) to authenticated;

create function public.get_roster_planning_period(p_business_id uuid, p_venue_id uuid, p_date date)
returns table (
  start_on date, end_on date, weekday smallint, previous_on date, next_on date,
  start_at timestamptz, end_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start date;
  v_end date;
  v_weekday smallint;
  v_next_effective date;
  v_timezone text;
begin
  if auth.uid() is null or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  select v.timezone into v_timezone from public.venues v
  where v.id = p_venue_id and v.business_id = p_business_id;
  if not found then raise exception 'Permission denied'; end if;
  if p_date is null or not isfinite(p_date)
    or p_date not between '1900-01-08'::date and '9999-12-24'::date then
    raise exception 'Invalid planning date';
  end if;
  select s.current_weekday, s.pending_effective_on into v_weekday, v_next_effective
  from public.venue_roster_week_state(p_business_id, p_venue_id, p_date) s;
  v_start := p_date - ((extract(isodow from p_date)::integer - v_weekday + 7) % 7);
  v_end := v_start + 7;
  if v_next_effective is not null and v_next_effective < v_end then
    v_end := v_next_effective;
  end if;
  return query select v_start, v_end, v_weekday, v_start - 1, v_end,
    v_start::timestamp at time zone v_timezone, v_end::timestamp at time zone v_timezone;
end;
$$;
revoke all on function public.get_roster_planning_period(uuid, uuid, date) from public, anon, service_role;
grant execute on function public.get_roster_planning_period(uuid, uuid, date) to authenticated;
