alter table public.venues
  add column clock_geofence_enabled boolean not null default false,
  add constraint venues_clock_geofence_configured check (
    not clock_geofence_enabled
    or (geofence_latitude is not null and geofence_longitude is not null
      and geofence_radius_meters is not null)
  );

create table public.venue_clock_location_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_type text not null,
  old_enabled boolean not null,
  new_enabled boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues (id, business_id) on delete cascade
);
create index venue_clock_location_events_venue_idx
  on public.venue_clock_location_events (business_id, venue_id, created_at desc);
create trigger venue_clock_location_events_business_id_immutable
  before update of business_id on public.venue_clock_location_events
  for each row execute function public.prevent_business_id_change();
alter table public.venue_clock_location_events enable row level security;
revoke all on public.venue_clock_location_events from public, anon, authenticated;
create policy "Owners can view their clock location policy history"
  on public.venue_clock_location_events for select to authenticated
  using (public.has_business_role(business_id, array['owner']));
grant select on public.venue_clock_location_events to authenticated;

create function public.record_venue_clock_location_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.clock_geofence_enabled is distinct from new.clock_geofence_enabled then
    insert into public.venue_clock_location_events (
      business_id, venue_id, actor_id, actor_type, old_enabled, new_enabled
    ) values (
      new.business_id, new.id, auth.uid(),
      case when auth.uid() is not null then 'authenticated'
        else coalesce(auth.jwt() ->> 'role', session_user::text) end,
      old.clock_geofence_enabled, new.clock_geofence_enabled
    );
  end if;
  return new;
end;
$$;
revoke all on function public.record_venue_clock_location_change() from public, anon, authenticated;
create trigger venues_clock_location_audit_update
  after update of clock_geofence_enabled on public.venues
  for each row execute function public.record_venue_clock_location_change();

create function public.check_enabled_clock_geofence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.clock_geofence_enabled and (
    new.geofence_latitude is null or new.geofence_longitude is null
    or new.geofence_radius_meters is null
  ) then
    raise exception 'Configure a venue geofence before enabling location verification';
  end if;
  return new;
end;
$$;
revoke all on function public.check_enabled_clock_geofence() from public, anon, authenticated;
create trigger venues_clock_geofence_configured
  before insert or update of clock_geofence_enabled, geofence_latitude,
    geofence_longitude, geofence_radius_meters on public.venues
  for each row execute function public.check_enabled_clock_geofence();

create function public.set_venue_clock_geofence(
  p_business_id uuid, p_venue_id uuid, p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue public.venues%rowtype;
begin
  if p_enabled is null then
    raise exception 'Invalid clock location policy';
  end if;
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  select v.* into v_venue from public.venues v
  where v.id = p_venue_id and v.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Permission denied';
  end if;
  if p_enabled and (
    v_venue.geofence_latitude is null or v_venue.geofence_longitude is null
    or v_venue.geofence_radius_meters is null
  ) then
    raise exception 'Configure a venue geofence before enabling location verification';
  end if;
  update public.venues set clock_geofence_enabled = p_enabled
  where id = p_venue_id and clock_geofence_enabled is distinct from p_enabled;
end;
$$;
revoke all on function public.set_venue_clock_geofence(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_venue_clock_geofence(uuid, uuid, boolean) to authenticated;

alter table public.attendance_events
  add constraint attendance_events_id_session_business_key unique (id, session_id, business_id);
create table public.attendance_location_checks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  session_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  verification_status text not null check (verification_status in ('not_required', 'verified', 'review')),
  reason text not null check (reason in (
    'disabled', 'inside', 'outside', 'inaccurate', 'permission_denied',
    'unavailable', 'timeout', 'unsupported', 'not_provided', 'invalid'
  )),
  distance_meters numeric(12, 3),
  accuracy_meters numeric(12, 3),
  radius_meters integer,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (event_id, session_id, business_id)
    references public.attendance_events (id, session_id, business_id) on delete cascade,
  unique (id, session_id, business_id),
  check (
    (verification_status = 'not_required' and reason = 'disabled'
      and distance_meters is null and accuracy_meters is null and radius_meters is null)
    or (verification_status = 'verified' and reason = 'inside'
      and distance_meters is not null and distance_meters >= 0
      and accuracy_meters is not null and accuracy_meters >= 0
      and radius_meters is not null and radius_meters between 1 and 10000)
    or (verification_status = 'review' and radius_meters is not null
      and radius_meters between 1 and 10000 and (
      (reason in ('outside', 'inaccurate') and distance_meters is not null
        and distance_meters >= 0 and accuracy_meters is not null and accuracy_meters >= 0)
      or (reason in ('permission_denied', 'unavailable', 'timeout', 'unsupported', 'not_provided', 'invalid')
        and distance_meters is null and accuracy_meters is null)
    ))
  )
);
create index attendance_location_checks_session_idx on public.attendance_location_checks (session_id);
create index attendance_location_checks_review_business_idx
  on public.attendance_location_checks (business_id, event_id) where verification_status = 'review';
create trigger attendance_location_checks_immutable
  before update or delete on public.attendance_location_checks
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.attendance_location_checks enable row level security;
revoke all on public.attendance_location_checks from public, anon, authenticated;
create policy "Members can view attendance location checks in their scope"
  on public.attendance_location_checks for select to authenticated
  using (public.can_view_attendance_session(session_id));
grant select on public.attendance_location_checks to authenticated;

create table public.attendance_location_reviews (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null unique,
  session_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (check_id, session_id, business_id)
    references public.attendance_location_checks (id, session_id, business_id) on delete cascade
);
create trigger attendance_location_reviews_immutable
  before update or delete on public.attendance_location_reviews
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.attendance_location_reviews enable row level security;
revoke all on public.attendance_location_reviews from public, anon, authenticated;
create policy "Members can view attendance location reviews in their scope"
  on public.attendance_location_reviews for select to authenticated
  using (public.can_view_attendance_session(session_id));
grant select on public.attendance_location_reviews to authenticated;

create function public.record_attendance_location()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue public.venues%rowtype;
  v_payload jsonb := coalesce(nullif(current_setting('butterbox.clock_location_payload', true), ''), '{}')::jsonb;
  v_status text;
  v_reason text;
  v_latitude numeric;
  v_longitude numeric;
  v_accuracy numeric;
  v_distance double precision;
  v_a double precision;
begin
  select v.* into v_venue from public.venues v
  where v.id = new.venue_id and v.business_id = new.business_id
  for share;
  if not found then
    raise exception 'Attendance venue not found';
  end if;
  if not v_venue.clock_geofence_enabled then
    insert into public.attendance_location_checks (
      event_id, session_id, business_id, verification_status, reason
    ) values (new.id, new.session_id, new.business_id, 'not_required', 'disabled');
    return new;
  end if;
  v_status := v_payload ->> 'status';
  if v_status = 'position'
    and jsonb_typeof(v_payload -> 'latitude') = 'number'
    and jsonb_typeof(v_payload -> 'longitude') = 'number'
    and jsonb_typeof(v_payload -> 'accuracy_meters') = 'number' then
    v_latitude := (v_payload ->> 'latitude')::numeric;
    v_longitude := (v_payload ->> 'longitude')::numeric;
    v_accuracy := (v_payload ->> 'accuracy_meters')::numeric;
    if v_latitude between -90 and 90 and v_longitude between -180 and 180
      and v_accuracy between 0 and 10000000 then
      v_a := power(sin(radians((v_latitude - v_venue.geofence_latitude)::double precision) / 2), 2)
        + cos(radians(v_latitude::double precision)) * cos(radians(v_venue.geofence_latitude::double precision))
        * power(sin(radians((v_longitude - v_venue.geofence_longitude)::double precision) / 2), 2);
      v_distance := 2 * 6371000 * asin(sqrt(least(1.0, greatest(0.0, v_a))));
      v_reason := case
        when v_distance > v_venue.geofence_radius_meters then 'outside'
        when v_distance + v_accuracy::double precision > v_venue.geofence_radius_meters then 'inaccurate'
        else 'inside'
      end;
      insert into public.attendance_location_checks (
        event_id, session_id, business_id, verification_status, reason,
        distance_meters, accuracy_meters, radius_meters
      ) values (
        new.id, new.session_id, new.business_id,
        case when v_reason = 'inside' then 'verified' else 'review' end,
        v_reason, round(v_distance::numeric, 3), round(v_accuracy, 3),
        v_venue.geofence_radius_meters
      );
      return new;
    end if;
    v_reason := 'invalid';
  elsif v_status in ('permission_denied', 'unavailable', 'timeout', 'unsupported', 'not_provided') then
    v_reason := v_status;
  elsif v_status is null then
    v_reason := 'not_provided';
  else
    v_reason := 'invalid';
  end if;
  insert into public.attendance_location_checks (
    event_id, session_id, business_id, verification_status, reason, radius_meters
  ) values (new.id, new.session_id, new.business_id, 'review', v_reason, v_venue.geofence_radius_meters);
  return new;
end;
$$;
revoke all on function public.record_attendance_location() from public, anon, authenticated;
create trigger attendance_events_location_check
  after insert on public.attendance_events
  for each row when (new.event_type in ('clock_in', 'clock_out'))
  execute function public.record_attendance_location();

create function public.clock_in_attendance_with_location(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_employee_id uuid, p_request_id uuid,
  p_location_status text, p_latitude numeric, p_longitude numeric, p_accuracy_meters numeric
)
returns table (
  session_id uuid, event_id uuid, occurred_at timestamptz, location_status text, location_reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous text := current_setting('butterbox.clock_location_payload', true);
  v_receipt record;
  v_check public.attendance_location_checks%rowtype;
begin
  perform set_config('butterbox.clock_location_payload', jsonb_build_object(
    'status', p_location_status, 'latitude', p_latitude, 'longitude', p_longitude,
    'accuracy_meters', p_accuracy_meters
  )::text, true);
  select * into v_receipt from public.clock_in_attendance(
    p_business_id, p_venue_id, p_department_id, p_employee_id, p_request_id
  );
  perform set_config('butterbox.clock_location_payload', coalesce(v_previous, ''), true);
  select c.* into v_check from public.attendance_location_checks c where c.event_id = v_receipt.event_id;
  return query select v_receipt.session_id, v_receipt.event_id, v_receipt.occurred_at,
    coalesce(v_check.verification_status, 'historical_unverified'),
    coalesce(v_check.reason, 'historical');
end;
$$;

create function public.clock_out_attendance_with_location(
  p_business_id uuid, p_session_id uuid, p_request_id uuid,
  p_location_status text, p_latitude numeric, p_longitude numeric, p_accuracy_meters numeric
)
returns table (
  session_id uuid, event_id uuid, occurred_at timestamptz, location_status text, location_reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous text := current_setting('butterbox.clock_location_payload', true);
  v_receipt record;
  v_check public.attendance_location_checks%rowtype;
begin
  perform set_config('butterbox.clock_location_payload', jsonb_build_object(
    'status', p_location_status, 'latitude', p_latitude, 'longitude', p_longitude,
    'accuracy_meters', p_accuracy_meters
  )::text, true);
  select * into v_receipt from public.clock_out_attendance(p_business_id, p_session_id, p_request_id);
  perform set_config('butterbox.clock_location_payload', coalesce(v_previous, ''), true);
  select c.* into v_check from public.attendance_location_checks c where c.event_id = v_receipt.event_id;
  return query select v_receipt.session_id, v_receipt.event_id, v_receipt.occurred_at,
    coalesce(v_check.verification_status, 'historical_unverified'),
    coalesce(v_check.reason, 'historical');
end;
$$;
revoke all on function public.clock_in_attendance_with_location(uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric)
  from public, anon;
revoke all on function public.clock_out_attendance_with_location(uuid, uuid, uuid, text, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.clock_in_attendance_with_location(uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric)
  to authenticated;
grant execute on function public.clock_out_attendance_with_location(uuid, uuid, uuid, text, numeric, numeric, numeric)
  to authenticated;

create function public.review_attendance_location_exception(p_business_id uuid, p_check_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_check public.attendance_location_checks%rowtype;
  v_department_id uuid;
  v_review_id uuid;
begin
  if p_business_id is null or p_check_id is null then
    raise exception 'Invalid location review';
  end if;
  perform public.lock_attendance_membership(p_business_id);
  select c.* into v_check from public.attendance_location_checks c
  where c.id = p_check_id and c.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Location exception not found or permission denied';
  end if;
  select e.department_id into v_department_id from public.attendance_events e where e.id = v_check.event_id;
  if not public.can_manage_department(p_business_id, v_department_id) then
    raise exception 'Location exception not found or permission denied';
  end if;
  if v_check.verification_status <> 'review' then
    raise exception 'This location check does not require review';
  end if;
  select r.id into v_review_id from public.attendance_location_reviews r where r.check_id = p_check_id;
  if found then
    return v_review_id;
  end if;
  insert into public.attendance_location_reviews (check_id, session_id, business_id, actor_id)
  values (v_check.id, v_check.session_id, v_check.business_id, auth.uid())
  returning id into v_review_id;
  return v_review_id;
end;
$$;
revoke all on function public.review_attendance_location_exception(uuid, uuid) from public, anon;
grant execute on function public.review_attendance_location_exception(uuid, uuid) to authenticated;

create function public.list_attendance_location_exceptions(p_business_id uuid, p_venue_id uuid)
returns table (
  check_id uuid, employee_name text, department_name text, event_type text, occurred_at timestamptz,
  reason text, distance_meters numeric, accuracy_meters numeric, radius_meters integer,
  reviewed_by uuid, reviewed_at timestamptz
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
  select c.id, worker.name, d.name, e.event_type, e.occurred_at, c.reason,
    c.distance_meters, c.accuracy_meters, c.radius_meters, r.actor_id, r.created_at
  from public.attendance_location_checks c
  join public.attendance_events e on e.id = c.event_id
  join public.employees worker on worker.id = e.employee_id and worker.business_id = e.business_id
  join public.departments d on d.id = e.department_id and d.business_id = e.business_id
  left join public.attendance_location_reviews r on r.check_id = c.id
  where c.business_id = p_business_id and e.venue_id = p_venue_id
    and c.verification_status = 'review' and public.can_manage_department(c.business_id, e.department_id)
  order by e.occurred_at desc, c.id;
end;
$$;
revoke all on function public.list_attendance_location_exceptions(uuid, uuid) from public, anon;
grant execute on function public.list_attendance_location_exceptions(uuid, uuid) to authenticated;
