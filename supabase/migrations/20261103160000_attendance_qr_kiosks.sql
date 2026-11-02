create table public.attendance_kiosks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  signing_key bytea not null default extensions.gen_random_bytes(32),
  activation_hash bytea,
  activation_expires_at timestamptz,
  session_hash bytea,
  session_expires_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  foreign key (venue_id, business_id) references public.venues (id, business_id),
  unique (id, business_id, venue_id),
  check ((activation_hash is null) = (activation_expires_at is null)),
  check ((session_hash is null) = (session_expires_at is null))
);

create table public.attendance_kiosk_codes (
  id uuid primary key default gen_random_uuid(),
  kiosk_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_event_id uuid unique references public.attendance_events (id),
  foreign key (kiosk_id, business_id, venue_id)
    references public.attendance_kiosks (id, business_id, venue_id),
  check (expires_at > issued_at)
);

create index attendance_kiosk_codes_current_idx
  on public.attendance_kiosk_codes (kiosk_id, expires_at desc)
  where consumed_event_id is null;

create trigger attendance_kiosk_consumption_immutable
  before update or delete on public.attendance_kiosk_codes
  for each row when (old.consumed_event_id is not null)
  execute function public.prevent_original_attendance_mutation();

alter table public.attendance_kiosks enable row level security;
alter table public.attendance_kiosk_codes enable row level security;
revoke all on public.attendance_kiosks, public.attendance_kiosk_codes
  from public, anon, authenticated, service_role;

create function public.attendance_kiosk_secret_equal(p_expected bytea, p_received bytea)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_temp
as $$
declare
  v_difference integer := 0;
  v_index integer;
begin
  if octet_length(p_expected) <> 32 or octet_length(p_received) <> 32 then
    return false;
  end if;
  for v_index in 0..31 loop
    v_difference := v_difference | (get_byte(p_expected, v_index) # get_byte(p_received, v_index));
  end loop;
  return v_difference = 0;
end;
$$;
revoke all on function public.attendance_kiosk_secret_equal(bytea, bytea)
  from public, anon, authenticated, service_role;

create function public.create_attendance_kiosk(
  p_business_id uuid, p_venue_id uuid, p_name text
)
returns table (kiosk_id uuid, activation_code text, activation_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kiosk public.attendance_kiosks%rowtype;
  v_secret text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if p_business_id is null or p_venue_id is null or p_name is null
    or length(btrim(p_name)) not between 1 and 60 then
    raise exception 'Invalid kiosk request';
  end if;
  perform public.lock_attendance_membership(p_business_id);
  if not public.has_business_role(p_business_id, array['owner']) or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) then
    raise exception 'Permission denied';
  end if;
  insert into public.attendance_kiosks (
    business_id, venue_id, name, created_by, activation_hash, activation_expires_at
  ) values (
    p_business_id, p_venue_id, btrim(p_name), auth.uid(),
    extensions.digest(v_secret, 'sha256'), clock_timestamp() + interval '15 minutes'
  ) returning * into v_kiosk;
  insert into public.sensitive_action_audit (
    business_id, actor_id, actor_kind, source_table, operation, record_id, new_values
  ) values (
    p_business_id, auth.uid(), 'user', 'attendance_kiosks', 'INSERT', v_kiosk.id::text,
    jsonb_build_object('id', v_kiosk.id, 'venue_id', p_venue_id, 'name', v_kiosk.name, 'action', 'created')
  );
  return query select v_kiosk.id, v_kiosk.id::text || '.' || v_secret, v_kiosk.activation_expires_at;
end;
$$;

create function public.list_attendance_kiosks(p_business_id uuid, p_venue_id uuid)
returns table (
  kiosk_id uuid, name text, created_at timestamptz, activated_at timestamptz,
  session_expires_at timestamptz, revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner']) or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) then
    raise exception 'Permission denied';
  end if;
  return query select k.id, k.name, k.created_at, k.activated_at, k.session_expires_at, k.revoked_at
  from public.attendance_kiosks k
  where k.business_id = p_business_id and k.venue_id = p_venue_id
  order by k.created_at desc, k.id desc;
end;
$$;

create function public.revoke_attendance_kiosk(p_business_id uuid, p_venue_id uuid, p_kiosk_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kiosk public.attendance_kiosks%rowtype;
begin
  perform public.lock_attendance_membership(p_business_id);
  if not public.has_business_role(p_business_id, array['owner']) then
    raise exception 'Permission denied';
  end if;
  select k.* into v_kiosk from public.attendance_kiosks k
  where k.id = p_kiosk_id and k.business_id = p_business_id and k.venue_id = p_venue_id
  for update;
  if not found then
    raise exception 'Kiosk not found';
  end if;
  if v_kiosk.revoked_at is null then
    update public.attendance_kiosks set
      revoked_at = clock_timestamp(), activation_hash = null, activation_expires_at = null,
      session_hash = null, session_expires_at = null
    where id = v_kiosk.id;
    insert into public.sensitive_action_audit (
      business_id, actor_id, actor_kind, source_table, operation, record_id, old_values, new_values
    ) values (
      p_business_id, auth.uid(), 'user', 'attendance_kiosks', 'UPDATE', v_kiosk.id::text,
      jsonb_build_object('venue_id', p_venue_id, 'action', 'active'),
      jsonb_build_object('venue_id', p_venue_id, 'action', 'revoked')
    );
  end if;
  return v_kiosk.id;
end;
$$;

create function public.activate_attendance_kiosk(p_activation_code text)
returns table (session_code text, session_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kiosk public.attendance_kiosks%rowtype;
  v_secret text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires timestamptz;
begin
  if p_activation_code is null or p_activation_code !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][0-9a-f]{64}$' then
    raise exception 'Kiosk activation is unavailable';
  end if;
  select k.* into v_kiosk from public.attendance_kiosks k
  where k.id = split_part(p_activation_code, '.', 1)::uuid
  for update;
  if not found or v_kiosk.revoked_at is not null or v_kiosk.activation_hash is null
    or v_kiosk.activation_expires_at <= clock_timestamp()
    or not public.attendance_kiosk_secret_equal(
      v_kiosk.activation_hash, extensions.digest(split_part(p_activation_code, '.', 2), 'sha256')) then
    raise exception 'Kiosk activation is unavailable';
  end if;
  v_expires := clock_timestamp() + interval '30 days';
  update public.attendance_kiosks set
    activation_hash = null, activation_expires_at = null,
    session_hash = extensions.digest(v_secret, 'sha256'), session_expires_at = v_expires,
    activated_at = clock_timestamp()
  where id = v_kiosk.id;
  return query select v_kiosk.id::text || '.' || v_secret, v_expires;
end;
$$;

create function public.issue_attendance_kiosk_code(p_session_code text)
returns table (
  qr_code text, business_id uuid, venue_id uuid, venue_name text,
  expires_at timestamptz, server_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kiosk public.attendance_kiosks%rowtype;
  v_code public.attendance_kiosk_codes%rowtype;
  v_signature text;
  v_now timestamptz := clock_timestamp();
begin
  if p_session_code is null or p_session_code !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][0-9a-f]{64}$' then
    raise exception 'Kiosk is unavailable';
  end if;
  select k.* into v_kiosk from public.attendance_kiosks k
  where k.id = split_part(p_session_code, '.', 1)::uuid
  for update;
  if not found or v_kiosk.revoked_at is not null or v_kiosk.session_hash is null
    or v_kiosk.session_expires_at <= clock_timestamp()
    or not public.attendance_kiosk_secret_equal(
      v_kiosk.session_hash, extensions.digest(split_part(p_session_code, '.', 2), 'sha256')) then
    raise exception 'Kiosk is unavailable';
  end if;
  v_now := clock_timestamp();
  delete from public.attendance_kiosk_codes c
  where c.kiosk_id = v_kiosk.id and c.consumed_event_id is null and c.expires_at <= v_now;
  select c.* into v_code from public.attendance_kiosk_codes c
  where c.kiosk_id = v_kiosk.id and c.consumed_event_id is null
    and c.expires_at > v_now + interval '5 seconds'
  order by c.issued_at desc, c.id desc limit 1;
  if not found then
    insert into public.attendance_kiosk_codes (kiosk_id, business_id, venue_id, expires_at)
    values (v_kiosk.id, v_kiosk.business_id, v_kiosk.venue_id, date_trunc('second', v_now) + interval '45 seconds')
    returning * into v_code;
  end if;
  v_signature := encode(extensions.hmac(
    convert_to(v_code.id::text || ':' || v_code.business_id::text || ':' || v_code.venue_id::text
      || ':' || extract(epoch from v_code.expires_at)::bigint::text, 'UTF8'),
    v_kiosk.signing_key, 'sha256'
  ), 'hex');
  return query select v_code.id::text || '.' || v_signature, v_kiosk.business_id, v_kiosk.venue_id,
    v.name, v_code.expires_at, v_now from public.venues v
  where v.id = v_kiosk.venue_id and v.business_id = v_kiosk.business_id;
end;
$$;

create function public.clock_attendance_with_kiosk_code(
  p_business_id uuid, p_venue_id uuid, p_qr_code text, p_event_type text,
  p_employee_id uuid, p_department_id uuid, p_session_id uuid, p_request_id uuid,
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
  v_kiosk_id uuid;
  v_kiosk public.attendance_kiosks%rowtype;
  v_code public.attendance_kiosk_codes%rowtype;
  v_existing public.attendance_events%rowtype;
  v_employee_id uuid;
  v_signature bytea;
  v_receipt record;
begin
  if p_business_id is null or p_venue_id is null or p_request_id is null or p_qr_code is null
    or p_qr_code !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][0-9a-f]{64}$'
    or (p_event_type = 'clock_in' and (p_employee_id is null or p_department_id is null or p_session_id is not null))
    or (p_event_type = 'clock_out' and (p_employee_id is not null or p_department_id is not null or p_session_id is null))
    or p_event_type is null or p_event_type not in ('clock_in', 'clock_out') then
    raise exception 'Invalid kiosk clock request';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shared-worker-links:' || p_business_id::text, 0));
  perform public.lock_attendance_membership(p_business_id);
  if p_event_type = 'clock_in' then
    if not public.can_view_department(p_business_id, p_department_id) or not exists (
      select 1 from public.employees e where e.id = p_employee_id and e.business_id = p_business_id
        and e.venue_id = p_venue_id and e.auth_user_id = auth.uid()
    ) then
      raise exception 'Employee not found or permission denied';
    end if;
    v_employee_id := p_employee_id;
  else
    select s.employee_id into v_employee_id from public.attendance_sessions s
    where s.id = p_session_id and s.business_id = p_business_id
      and s.venue_id = p_venue_id and s.started_by = auth.uid();
    if not found then
      raise exception 'Session not found or permission denied';
    end if;
  end if;
  perform public.lock_attendance_identity(p_business_id, v_employee_id);
  select c.kiosk_id into v_kiosk_id from public.attendance_kiosk_codes c
  where c.id = split_part(p_qr_code, '.', 1)::uuid
    and c.business_id = p_business_id and c.venue_id = p_venue_id;
  if not found then
    raise exception 'Kiosk code is invalid or expired';
  end if;
  select k.* into v_kiosk from public.attendance_kiosks k where k.id = v_kiosk_id for update;
  select c.* into v_code from public.attendance_kiosk_codes c
  where c.id = split_part(p_qr_code, '.', 1)::uuid and c.kiosk_id = v_kiosk.id for update;
  if not found then
    raise exception 'Kiosk code is invalid or expired';
  end if;
  v_signature := extensions.hmac(
    convert_to(v_code.id::text || ':' || v_code.business_id::text || ':' || v_code.venue_id::text
      || ':' || extract(epoch from v_code.expires_at)::bigint::text, 'UTF8'),
    v_kiosk.signing_key, 'sha256'
  );
  if not public.attendance_kiosk_secret_equal(v_signature, decode(split_part(p_qr_code, '.', 2), 'hex')) then
    raise exception 'Kiosk code is invalid or expired';
  end if;
  if v_code.consumed_event_id is not null then
    select e.* into v_existing from public.attendance_events e where e.id = v_code.consumed_event_id;
    if not found or v_existing.actor_id <> auth.uid() or v_existing.request_id <> p_request_id
      or v_existing.event_type <> p_event_type
      or (p_event_type = 'clock_in' and
        (v_existing.employee_id <> p_employee_id or v_existing.department_id <> p_department_id))
      or (p_event_type = 'clock_out' and v_existing.session_id <> p_session_id) then
      raise exception 'Kiosk code was already used';
    end if;
  else
    if v_kiosk.revoked_at is not null or v_kiosk.session_expires_at is null
      or v_kiosk.session_expires_at <= clock_timestamp() or v_code.expires_at <= clock_timestamp() then
      raise exception 'Kiosk code is invalid or expired';
    end if;
    if exists (
      select 1 from public.attendance_events e
      where e.business_id = p_business_id and e.actor_id = auth.uid() and e.request_id = p_request_id
    ) then
      raise exception 'Request identifier already used';
    end if;
  end if;
  if p_event_type = 'clock_in' then
    select * into v_receipt from public.clock_in_attendance_with_location(
      p_business_id, p_venue_id, p_department_id, p_employee_id, p_request_id,
      p_location_status, p_latitude, p_longitude, p_accuracy_meters
    );
  else
    select * into v_receipt from public.clock_out_attendance_with_location(
      p_business_id, p_session_id, p_request_id,
      p_location_status, p_latitude, p_longitude, p_accuracy_meters
    );
  end if;
  if v_code.consumed_event_id is null then
    update public.attendance_kiosk_codes set consumed_event_id = v_receipt.event_id where id = v_code.id;
  end if;
  return query select v_receipt.session_id, v_receipt.event_id, v_receipt.occurred_at,
    v_receipt.location_status, v_receipt.location_reason;
end;
$$;

revoke all on function public.create_attendance_kiosk(uuid, uuid, text),
  public.list_attendance_kiosks(uuid, uuid),
  public.revoke_attendance_kiosk(uuid, uuid, uuid),
  public.activate_attendance_kiosk(text),
  public.issue_attendance_kiosk_code(text),
  public.clock_attendance_with_kiosk_code(uuid, uuid, text, text, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.create_attendance_kiosk(uuid, uuid, text),
  public.list_attendance_kiosks(uuid, uuid),
  public.revoke_attendance_kiosk(uuid, uuid, uuid),
  public.clock_attendance_with_kiosk_code(uuid, uuid, text, text, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric)
  to authenticated;
grant execute on function public.activate_attendance_kiosk(text), public.issue_attendance_kiosk_code(text)
  to anon, authenticated;
