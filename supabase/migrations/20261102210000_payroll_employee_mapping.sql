create function public.valid_payroll_mapping_text(p_value text, p_limit integer)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_value is not null and p_value !~ '[[:cntrl:]]'
    and p_value = regexp_replace(p_value, U&'^[[:space:]\FEFF]+|[[:space:]\FEFF]+$', '', 'g')
    and char_length(p_value)
      + char_length(regexp_replace(p_value, U&'[^\+010000-\+10FFFF]', '', 'g')) between 1 and p_limit;
$$;
revoke all on function public.valid_payroll_mapping_text(text, integer)
  from public, anon, authenticated, service_role;

-- These are mapping destinations, not OAuth connections or enabled adapters.
create table public.payroll_mapping_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('xero', 'myob', 'employment_hero', 'quickbooks')),
  account_id text not null check (public.valid_payroll_mapping_text(account_id, 255)),
  name text not null check (public.valid_payroll_mapping_text(name, 100)),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, business_id),
  unique (business_id, provider, account_id)
);

create table public.payroll_employee_mappings (
  connection_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  employee_id uuid not null,
  external_employee_id text check (
    external_employee_id is null or public.valid_payroll_mapping_text(external_employee_id, 255)
  ),
  revision integer not null check (revision > 0),
  primary key (connection_id, employee_id),
  foreign key (connection_id, business_id)
    references public.payroll_mapping_connections(id, business_id) on delete cascade,
  foreign key (employee_id, business_id, venue_id)
    references public.employees(id, business_id, venue_id) on delete cascade,
  unique (connection_id, external_employee_id)
);

create table public.payroll_employee_mapping_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  connection_id uuid not null,
  employee_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  previous_id text,
  external_employee_id text,
  revision integer not null check (revision > 0),
  reason text not null check (reason is not distinct from public.normalize_generic_payroll_reason(reason)),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (connection_id, business_id)
    references public.payroll_mapping_connections(id, business_id) on delete cascade,
  unique (business_id, actor_id, request_id),
  unique (connection_id, employee_id, revision)
);

create trigger payroll_mapping_connections_immutable
  before update or delete on public.payroll_mapping_connections
  for each row execute function public.prevent_original_attendance_mutation();
create trigger payroll_employee_mapping_events_immutable
  before update or delete on public.payroll_employee_mapping_events
  for each row execute function public.prevent_original_attendance_mutation();
alter table public.payroll_mapping_connections enable row level security;
alter table public.payroll_employee_mappings enable row level security;
alter table public.payroll_employee_mapping_events enable row level security;
revoke all on public.payroll_mapping_connections, public.payroll_employee_mappings,
  public.payroll_employee_mapping_events from public, anon, authenticated, service_role;

create function public.lock_payroll_mapping_management(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.lock_attendance_membership(p_business_id);
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payroll-mapping:' || p_business_id::text, 0));
end;
$$;
revoke all on function public.lock_payroll_mapping_management(uuid)
  from public, anon, authenticated, service_role;

create function public.create_payroll_mapping_connection(
  p_business_id uuid, p_connection_id uuid, p_provider text, p_account_id text, p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.payroll_mapping_connections%rowtype;
begin
  perform public.lock_payroll_mapping_management(p_business_id);
  if p_connection_id is null or p_provider is null
    or p_provider not in ('xero', 'myob', 'employment_hero', 'quickbooks')
    or not public.valid_payroll_mapping_text(p_account_id, 255)
    or not public.valid_payroll_mapping_text(p_name, 100) then
    raise exception 'Invalid payroll connection';
  end if;
  select c.* into v_existing from public.payroll_mapping_connections c
  where c.business_id = p_business_id and (
    c.id = p_connection_id or (c.provider = p_provider and c.account_id = p_account_id)
  );
  if found then
    if v_existing.provider <> p_provider or v_existing.account_id <> p_account_id
      or v_existing.name <> p_name then
      raise exception 'Payroll connection already exists with different details';
    end if;
    return v_existing.id;
  end if;
  insert into public.payroll_mapping_connections(id, business_id, provider, account_id, name, actor_id)
  values (p_connection_id, p_business_id, p_provider, p_account_id, p_name, auth.uid());
  return p_connection_id;
end;
$$;
revoke all on function public.create_payroll_mapping_connection(uuid,uuid,text,text,text)
  from public, anon, service_role;
grant execute on function public.create_payroll_mapping_connection(uuid,uuid,text,text,text) to authenticated;

create function public.set_payroll_employee_mapping(
  p_business_id uuid, p_connection_id uuid, p_employee_id uuid, p_expected_revision integer,
  p_external_employee_id text, p_reason text, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.payroll_employee_mappings%rowtype;
  v_event public.payroll_employee_mapping_events%rowtype;
  v_reason text := public.normalize_generic_payroll_reason(p_reason);
  v_id uuid;
  v_venue_id uuid;
begin
  perform public.lock_payroll_mapping_management(p_business_id);
  if p_request_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_expected_revision >= 2147483647 or v_reason is null
    or (p_external_employee_id is not null
      and not public.valid_payroll_mapping_text(p_external_employee_id, 255)) then
    raise exception 'Invalid payroll employee mapping';
  end if;
  perform 1 from public.payroll_mapping_connections c
  where c.id = p_connection_id and c.business_id = p_business_id;
  if not found then raise exception 'Payroll connection unavailable or permission denied'; end if;
  select e.venue_id into v_venue_id from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id for share;
  if not found then raise exception 'Employee unavailable or permission denied'; end if;
  select e.* into v_event from public.payroll_employee_mapping_events e
  where e.business_id = p_business_id and e.actor_id = auth.uid() and e.request_id = p_request_id;
  if found then
    if v_event.connection_id <> p_connection_id or v_event.employee_id <> p_employee_id
      or v_event.revision <> p_expected_revision + 1
      or v_event.external_employee_id is distinct from p_external_employee_id or v_event.reason <> v_reason then
      raise exception 'Request identifier already used';
    end if;
    return v_event.id;
  end if;
  select m.* into v_current from public.payroll_employee_mappings m
  where m.connection_id = p_connection_id and m.employee_id = p_employee_id;
  if coalesce(v_current.revision, 0) <> p_expected_revision then
    raise exception 'Payroll mapping changed; refresh before saving';
  end if;
  if v_current.external_employee_id is not distinct from p_external_employee_id then
    raise exception 'Payroll mapping is already in that state';
  end if;
  if p_external_employee_id is not null and exists (
    select 1 from public.payroll_employee_mappings m
    where m.connection_id = p_connection_id and m.external_employee_id = p_external_employee_id
      and m.employee_id <> p_employee_id
  ) then raise exception 'Payroll employee ID is already mapped to another employee'; end if;
  insert into public.payroll_employee_mappings(
    connection_id, business_id, venue_id, employee_id, external_employee_id, revision
  ) values (p_connection_id, p_business_id, v_venue_id, p_employee_id, p_external_employee_id, p_expected_revision + 1)
  on conflict (connection_id, employee_id) do update
    set external_employee_id = excluded.external_employee_id, revision = excluded.revision;
  insert into public.payroll_employee_mapping_events(
    business_id, connection_id, employee_id, actor_id, request_id,
    previous_id, external_employee_id, revision, reason
  ) values (
    p_business_id, p_connection_id, p_employee_id, auth.uid(), p_request_id,
    v_current.external_employee_id, p_external_employee_id, p_expected_revision + 1, v_reason
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.set_payroll_employee_mapping(uuid,uuid,uuid,integer,text,text,uuid)
  from public, anon, service_role;
grant execute on function public.set_payroll_employee_mapping(uuid,uuid,uuid,integer,text,text,uuid)
  to authenticated;

create function public.list_payroll_mapping_connections(p_business_id uuid)
returns table (id uuid, provider text, account_id text, name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.lock_payroll_mapping_management(p_business_id);
  return query select c.id, c.provider, c.account_id, c.name
  from public.payroll_mapping_connections c where c.business_id = p_business_id;
end;
$$;
revoke all on function public.list_payroll_mapping_connections(uuid) from public, anon, service_role;
grant execute on function public.list_payroll_mapping_connections(uuid) to authenticated;

create function public.list_payroll_employee_mappings(p_business_id uuid, p_connection_id uuid, p_venue_id uuid)
returns table (employee_id uuid, employee_name text, external_employee_id text, revision integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.lock_payroll_mapping_management(p_business_id);
  if not exists (select 1 from public.payroll_mapping_connections c
    where c.id = p_connection_id and c.business_id = p_business_id)
    or not exists (select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id) then
    raise exception 'Payroll connection or venue unavailable';
  end if;
  return query select e.id, e.name, m.external_employee_id, coalesce(m.revision, 0)
  from public.employees e left join public.payroll_employee_mappings m
    on m.connection_id = p_connection_id and m.employee_id = e.id and m.business_id = e.business_id
  where e.business_id = p_business_id and e.venue_id = p_venue_id;
end;
$$;
revoke all on function public.list_payroll_employee_mappings(uuid,uuid,uuid) from public, anon, service_role;
grant execute on function public.list_payroll_employee_mappings(uuid,uuid,uuid) to authenticated;

create function public.list_provider_payroll_records(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_finalisation_id uuid, p_connection_id uuid
)
returns table (session_id uuid, record jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_connection public.payroll_mapping_connections%rowtype;
begin
  perform public.lock_generic_payroll_export(p_business_id, p_venue_id, p_week_start, p_finalisation_id);
  perform pg_advisory_xact_lock_shared(hashtextextended('payroll-mapping:' || p_business_id::text, 0));
  select c.* into v_connection from public.payroll_mapping_connections c
  where c.id = p_connection_id and c.business_id = p_business_id;
  if not found then raise exception 'Payroll connection unavailable or permission denied'; end if;
  if exists (
    select 1 from public.list_canonical_payroll_records(
      p_business_id, p_venue_id, p_week_start, p_finalisation_id
    ) c left join public.payroll_employee_mappings m
      on m.connection_id = p_connection_id and m.business_id = p_business_id
      and m.employee_id = (c.record #>> '{worker,employeeId}')::uuid
    where m.external_employee_id is null
  ) then raise exception 'Missing payroll employee mappings'; end if;
  return query
  select c.session_id, jsonb_set(c.record, '{worker,providerMapping}', jsonb_build_object(
    'provider', v_connection.provider, 'connectionId', p_connection_id,
    'externalEmployeeId', m.external_employee_id
  ))
  from public.list_canonical_payroll_records(p_business_id, p_venue_id, p_week_start, p_finalisation_id) c
  join public.payroll_employee_mappings m
    on m.connection_id = p_connection_id and m.business_id = p_business_id
    and m.employee_id = (c.record #>> '{worker,employeeId}')::uuid;
end;
$$;
revoke all on function public.list_provider_payroll_records(uuid,uuid,date,uuid,uuid)
  from public, anon, service_role;
grant execute on function public.list_provider_payroll_records(uuid,uuid,date,uuid,uuid) to authenticated;
