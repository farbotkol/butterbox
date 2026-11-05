create table public.demand_history_imports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  venue_id uuid not null,
  event_type text not null check (event_type in ('sales', 'bookings')),
  source_name text not null check (
    source_name = btrim(source_name) and source_name ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$'
  ),
  source_key text generated always as (lower(source_name)) stored,
  venue_timezone text not null,
  actor_id uuid not null,
  request_id uuid not null,
  payload_hash text not null,
  entry_count integer not null check (entry_count between 1 and 1000),
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues(id, business_id),
  unique (business_id, actor_id, request_id),
  unique (id, business_id, venue_id, event_type, source_key)
);

create index demand_history_imports_venue_time_idx
  on public.demand_history_imports(business_id, venue_id, occurred_at desc, id desc);

create table public.demand_history_records (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  event_type text not null,
  source_key text not null,
  source_record_id text not null,
  original_occurred_at text not null,
  occurred_at timestamptz not null,
  original_value text not null,
  numeric_value numeric(11,2) not null,
  foreign key (import_id, business_id, venue_id, event_type, source_key)
    references public.demand_history_imports(id, business_id, venue_id, event_type, source_key)
    on delete cascade,
  unique (business_id, venue_id, event_type, source_key, source_record_id)
);

create index demand_history_records_import_idx
  on public.demand_history_records(import_id, source_record_id, id);

alter table public.demand_history_imports enable row level security;
alter table public.demand_history_records enable row level security;
revoke all on public.demand_history_imports, public.demand_history_records
  from public, anon, authenticated, service_role;
grant select on public.demand_history_imports, public.demand_history_records to authenticated;
create policy "Owners can read demand imports"
  on public.demand_history_imports for select to authenticated
  using (public.has_business_role(business_id, array['owner']));
create policy "Owners can read demand records"
  on public.demand_history_records for select to authenticated
  using (public.has_business_role(business_id, array['owner']));

create function public.prevent_demand_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1
    and not exists (select 1 from public.businesses b where b.id = old.business_id) then
    return old;
  end if;
  raise exception 'Demand history is immutable';
end;
$$;
revoke all on function public.prevent_demand_history_mutation()
  from public, anon, authenticated, service_role;
create trigger demand_imports_immutable before update or delete on public.demand_history_imports
  for each row execute function public.prevent_demand_history_mutation();
create trigger demand_records_immutable before update or delete on public.demand_history_records
  for each row execute function public.prevent_demand_history_mutation();
create trigger sensitive_action_audit after insert on public.demand_history_imports
  for each row execute function public.record_sensitive_action_audit();

create function public.import_demand_history(
  p_business_id uuid, p_venue_id uuid, p_event_type text, p_source_name text,
  p_venue_timezone text, p_request_id uuid, p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue public.venues%rowtype;
  v_existing public.demand_history_imports%rowtype;
  v_row jsonb;
  v_row_number bigint;
  v_key_count integer;
  v_original_time text;
  v_local_time timestamp;
  v_instant timestamptz;
  v_original_value text;
  v_hash text;
  v_import_id uuid;
begin
  if auth.uid() is null or p_business_id is null or p_venue_id is null then
    raise exception 'Permission denied';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  select * into v_venue from public.venues v
  where v.id = p_venue_id and v.business_id = p_business_id
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  if p_event_type is null or p_event_type not in ('sales', 'bookings')
    or p_source_name is null or p_source_name <> btrim(p_source_name)
    or p_source_name !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$'
    or p_venue_timezone is null or p_request_id is null then
    raise exception 'Invalid import details';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Import must contain 1 to 1000 records within the size limit';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text) > 600000 then
    raise exception 'Import must contain 1 to 1000 records within the size limit';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'venue_id', p_venue_id, 'event_type', p_event_type, 'source_name', p_source_name,
    'venue_timezone', p_venue_timezone, 'rows', p_rows
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_existing from public.demand_history_imports i
  where i.business_id = p_business_id and i.actor_id = auth.uid() and i.request_id = p_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then
      raise exception 'Request identifier already used';
    end if;
    return v_existing.id;
  end if;
  if p_venue_timezone <> v_venue.timezone
    or not exists (select 1 from pg_timezone_names t where t.name = p_venue_timezone) then
    raise exception 'Venue timezone changed or is invalid';
  end if;

  for v_row, v_row_number in
    select value, ordinality from jsonb_array_elements(p_rows) with ordinality
  loop
    if jsonb_typeof(v_row) is distinct from 'object' then
      raise exception 'Invalid record %', v_row_number;
    end if;
    select count(*) into v_key_count from jsonb_object_keys(v_row);
    if v_key_count <> 3 or jsonb_typeof(v_row -> 'source_record_id') is distinct from 'string'
      or jsonb_typeof(v_row -> 'occurred_at') is distinct from 'string'
      or jsonb_typeof(v_row -> 'value') is distinct from 'string'
      or (v_row ->> 'source_record_id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
      raise exception 'Invalid record %', v_row_number;
    end if;
    v_original_time := v_row ->> 'occurred_at';
    if v_original_time !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
      or substring(v_original_time, 1, 4) not between '0001' and '9998' then
      raise exception 'Invalid timestamp in record %', v_row_number;
    end if;
    begin
      v_instant := v_original_time::timestamptz;
      v_local_time := regexp_replace(v_original_time, '(Z|[+-][0-9]{2}:[0-9]{2})$', '')::timestamp;
    exception when invalid_datetime_format or datetime_field_overflow or invalid_parameter_value then
      raise exception 'Invalid timestamp in record %', v_row_number;
    end;
    if v_instant at time zone p_venue_timezone <> v_local_time then
      raise exception 'Timestamp timezone mismatch in record %', v_row_number;
    end if;
    v_original_value := v_row ->> 'value';
    if (p_event_type = 'sales' and v_original_value !~ '^[0-9]{1,9}([.][0-9]{1,2})?$')
      or (p_event_type = 'bookings' and v_original_value !~ '^[0-9]{1,6}$') then
      raise exception 'Invalid value in record %', v_row_number;
    end if;
    if p_event_type = 'bookings' and v_original_value::numeric < 1 then
      raise exception 'Invalid value in record %', v_row_number;
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    group by r ->> 'source_record_id' having count(*) > 1
  ) then
    raise exception 'Duplicate source record IDs in file';
  end if;

  insert into public.demand_history_imports (
    business_id, venue_id, event_type, source_name, venue_timezone, actor_id, request_id, payload_hash, entry_count
  ) values (
    p_business_id, p_venue_id, p_event_type, p_source_name, p_venue_timezone,
    auth.uid(), p_request_id, v_hash, jsonb_array_length(p_rows)
  ) on conflict (business_id, actor_id, request_id) do nothing returning id into v_import_id;
  if v_import_id is null then
    select * into strict v_existing from public.demand_history_imports i
    where i.business_id = p_business_id and i.actor_id = auth.uid() and i.request_id = p_request_id;
    if v_existing.payload_hash <> v_hash then
      raise exception 'Request identifier already used';
    end if;
    return v_existing.id;
  end if;

  begin
    insert into public.demand_history_records (
      import_id, business_id, venue_id, event_type, source_key, source_record_id,
      original_occurred_at, occurred_at, original_value, numeric_value
    )
    select v_import_id, p_business_id, p_venue_id, p_event_type, lower(p_source_name),
      r ->> 'source_record_id', r ->> 'occurred_at', (r ->> 'occurred_at')::timestamptz,
      r ->> 'value', (r ->> 'value')::numeric
    from jsonb_array_elements(p_rows) r
    order by r ->> 'source_record_id' collate "C";
  exception when unique_violation then
    raise exception 'Source record IDs already imported; nothing was saved';
  end;
  return v_import_id;
end;
$$;
revoke all on function public.import_demand_history(uuid, uuid, text, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_demand_history(uuid, uuid, text, text, text, uuid, jsonb)
  to authenticated;
