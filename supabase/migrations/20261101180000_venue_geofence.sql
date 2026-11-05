alter table public.venues
  add column geofence_latitude numeric(9, 6),
  add column geofence_longitude numeric(9, 6),
  add column geofence_radius_meters integer,
  add constraint venues_geofence_valid check (
    (geofence_latitude is null and geofence_longitude is null and geofence_radius_meters is null)
    or (
      geofence_latitude is not null and geofence_latitude between -90 and 90
      and geofence_longitude is not null and geofence_longitude between -180 and 180
      and geofence_radius_meters is not null and geofence_radius_meters between 1 and 10000
    )
  );

create table public.venue_geofence_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_type text not null,
  old_values jsonb not null,
  new_values jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id)
    references public.venues (id, business_id) on delete cascade
);

create index venue_geofence_events_venue_idx
  on public.venue_geofence_events (business_id, venue_id, created_at desc);
create trigger venue_geofence_events_business_id_immutable
  before update of business_id on public.venue_geofence_events
  for each row execute function public.prevent_business_id_change();

alter table public.venue_geofence_events enable row level security;
create policy "Owners can view their venue geofence history"
  on public.venue_geofence_events for select to authenticated
  using (public.has_business_role(business_id, array['owner']));
revoke all on public.venue_geofence_events from public, anon, authenticated;
grant select on public.venue_geofence_events to authenticated;

create function public.record_venue_geofence_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_values jsonb;
  v_new_values jsonb;
begin
  v_new_values := jsonb_build_object(
    'latitude', new.geofence_latitude,
    'longitude', new.geofence_longitude,
    'radius_meters', new.geofence_radius_meters
  );
  if tg_op = 'INSERT' then
    v_old_values := jsonb_build_object('latitude', null, 'longitude', null, 'radius_meters', null);
  else
    v_old_values := jsonb_build_object(
      'latitude', old.geofence_latitude,
      'longitude', old.geofence_longitude,
      'radius_meters', old.geofence_radius_meters
    );
  end if;
  if v_old_values is distinct from v_new_values then
    insert into public.venue_geofence_events (
      business_id, venue_id, actor_id, actor_type, old_values, new_values
    )
    values (
      new.business_id, new.id, auth.uid(),
      case when auth.uid() is not null then 'authenticated'
        else coalesce(auth.jwt() ->> 'role', session_user::text) end,
      v_old_values, v_new_values
    );
  end if;
  return new;
end;
$$;

revoke all on function public.record_venue_geofence_change() from public, anon, authenticated;
create trigger venues_geofence_audit_insert
  after insert on public.venues
  for each row execute function public.record_venue_geofence_change();
create trigger venues_geofence_audit_update
  after update of geofence_latitude, geofence_longitude, geofence_radius_meters on public.venues
  for each row execute function public.record_venue_geofence_change();

create function public.save_venue_geofence(
  p_business_id uuid,
  p_venue_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_radius_meters integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner']) then
    raise exception 'Permission denied';
  end if;
  perform 1 from public.venues
    where id = p_venue_id and business_id = p_business_id
    for update;
  if not found then
    raise exception 'Permission denied';
  end if;
  if not (
    (p_latitude is null and p_longitude is null and p_radius_meters is null)
    or (
      p_latitude is not null and p_latitude between -90 and 90
      and trunc(p_latitude, 6) = p_latitude
      and p_longitude is not null and p_longitude between -180 and 180
      and trunc(p_longitude, 6) = p_longitude
      and p_radius_meters is not null and p_radius_meters between 1 and 10000
    )
  ) then
    raise exception 'Invalid venue geofence';
  end if;

  update public.venues set
    geofence_latitude = p_latitude,
    geofence_longitude = p_longitude,
    geofence_radius_meters = p_radius_meters
  where id = p_venue_id
    and (geofence_latitude, geofence_longitude, geofence_radius_meters)
      is distinct from (p_latitude, p_longitude, p_radius_meters);
end;
$$;

revoke all on function public.save_venue_geofence(uuid, uuid, numeric, numeric, integer)
  from public, anon;
grant execute on function public.save_venue_geofence(uuid, uuid, numeric, numeric, integer)
  to authenticated;
