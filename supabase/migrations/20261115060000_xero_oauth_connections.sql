create table public.xero_oauth_grants (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  encrypted_tokens text not null check (char_length(encrypted_tokens) between 1 and 24000),
  expires_at timestamptz not null,
  scopes text[] not null check (
    scopes @> array['offline_access', 'payroll.timesheets']::text[]
    and cardinality(scopes) <= 20
  ),
  available_tenants jsonb not null check (
    jsonb_typeof(available_tenants) = 'array'
    and jsonb_array_length(available_tenants) between 1 and 100
  ),
  status text not null default 'pending_selection'
    check (status in ('pending_selection', 'active', 'reauthorization_required', 'revocation_pending')),
  authorized_by uuid not null,
  refresh_lock_id uuid,
  refresh_lock_expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, business_id),
  check ((refresh_lock_id is null) = (refresh_lock_expires_at is null))
);

create table public.xero_oauth_tenants (
  business_id uuid not null,
  xero_tenant_id uuid not null,
  grant_id uuid not null,
  tenant_name text not null check (
    char_length(tenant_name) between 1 and 255 and tenant_name !~ '[[:cntrl:]]'
  ),
  tenant_type text not null check (
    char_length(tenant_type) between 1 and 100 and tenant_type !~ '[[:cntrl:]]'
  ),
  connected_at timestamptz not null default clock_timestamp(),
  primary key (business_id, xero_tenant_id),
  foreign key (grant_id, business_id)
    references public.xero_oauth_grants(id, business_id) on delete cascade
);

alter table public.xero_oauth_grants enable row level security;
alter table public.xero_oauth_tenants enable row level security;
revoke all on public.xero_oauth_grants, public.xero_oauth_tenants
  from public, anon, authenticated, service_role;

create function public.store_xero_oauth_grant(
  p_business_id uuid, p_grant_id uuid, p_encrypted_tokens text, p_expires_at timestamptz,
  p_scopes text[], p_available_tenants jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_unique_count integer;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  if p_grant_id is null or p_encrypted_tokens is null
    or char_length(p_encrypted_tokens) not between 1 and 24000
    or p_expires_at is null or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '1 day'
    or p_scopes is null or not (p_scopes @> array['offline_access', 'payroll.timesheets']::text[])
    or cardinality(p_scopes) > 20 or p_available_tenants is null
    or jsonb_typeof(p_available_tenants) <> 'array'
    or jsonb_array_length(p_available_tenants) not between 1 and 100 then
    raise exception 'Invalid Xero OAuth grant';
  end if;

  select count(*), count(distinct lower(item->>'tenantId')) into v_count, v_unique_count
  from jsonb_array_elements(p_available_tenants) as tenant(item)
  where jsonb_typeof(item) = 'object'
    and (item->>'tenantId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and jsonb_typeof(item->'tenantName') = 'string'
    and char_length(btrim(item->>'tenantName')) between 1 and 255
    and (item->>'tenantName') !~ '[[:cntrl:]]'
    and jsonb_typeof(item->'tenantType') = 'string'
    and char_length(btrim(item->>'tenantType')) between 1 and 100
    and (item->>'tenantType') !~ '[[:cntrl:]]';
  if v_count <> jsonb_array_length(p_available_tenants) or v_unique_count <> v_count then
    raise exception 'Invalid Xero organization list';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('xero-oauth:' || p_business_id::text, 0));
  insert into public.xero_oauth_grants(
    id, business_id, encrypted_tokens, expires_at, scopes, available_tenants, authorized_by
  ) values (
    p_grant_id, p_business_id, p_encrypted_tokens, p_expires_at, p_scopes,
    p_available_tenants, auth.uid()
  );
  return p_grant_id;
end;
$$;
revoke all on function public.store_xero_oauth_grant(uuid, uuid, text, timestamptz, text[], jsonb)
  from public, anon, service_role;
grant execute on function public.store_xero_oauth_grant(uuid, uuid, text, timestamptz, text[], jsonb)
  to authenticated;

create function public.list_xero_oauth_tenants(p_business_id uuid)
returns table (
  tenant_id uuid, tenant_name text, tenant_type text, connected_at timestamptz, status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  return query
    select t.xero_tenant_id, t.tenant_name, t.tenant_type, t.connected_at, g.status
    from public.xero_oauth_tenants t
    join public.xero_oauth_grants g on g.id = t.grant_id and g.business_id = t.business_id
    where t.business_id = p_business_id
    order by t.tenant_name, t.xero_tenant_id;
end;
$$;
revoke all on function public.list_xero_oauth_tenants(uuid) from public, anon, service_role;
grant execute on function public.list_xero_oauth_tenants(uuid) to authenticated;

create function public.list_pending_xero_oauth_tenants(p_business_id uuid, p_grant_id uuid)
returns table (tenant_id uuid, tenant_name text, tenant_type text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  return query
    select (tenant.item->>'tenantId')::uuid, tenant.item->>'tenantName', tenant.item->>'tenantType'
    from public.xero_oauth_grants g
    cross join lateral jsonb_array_elements(g.available_tenants) as tenant(item)
    where g.id = p_grant_id and g.business_id = p_business_id
      and g.status in ('pending_selection', 'revocation_pending')
      and tenant.item->>'tenantType' = 'ORGANISATION'
    order by tenant.item->>'tenantName', tenant.item->>'tenantId';
end;
$$;
revoke all on function public.list_pending_xero_oauth_tenants(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_pending_xero_oauth_tenants(uuid, uuid) to authenticated;

create function public.claim_pending_xero_oauth_revocation(
  p_business_id uuid, p_grant_id uuid, p_lock_id uuid
)
returns table (grant_id uuid, encrypted_tokens text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  if p_lock_id is null then raise exception 'Invalid Xero revocation lock'; end if;
  return query
    update public.xero_oauth_grants g
    set status = 'revocation_pending', refresh_lock_id = p_lock_id,
      refresh_lock_expires_at = clock_timestamp() + interval '2 minutes',
      updated_at = clock_timestamp()
    where g.id = p_grant_id and g.business_id = p_business_id
      and g.status in ('pending_selection', 'revocation_pending')
      and (g.refresh_lock_id is null or g.refresh_lock_expires_at <= clock_timestamp())
      and not exists (
        select 1 from public.xero_oauth_tenants t
        where t.business_id = g.business_id and t.grant_id = g.id
      )
    returning g.id, g.encrypted_tokens;
end;
$$;
revoke all on function public.claim_pending_xero_oauth_revocation(uuid, uuid, uuid)
  from public, anon, service_role;
grant execute on function public.claim_pending_xero_oauth_revocation(uuid, uuid, uuid)
  to authenticated;

create function public.finish_pending_xero_oauth_revocation(
  p_business_id uuid, p_grant_id uuid, p_lock_id uuid, p_revoked boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  if p_lock_id is null then raise exception 'Invalid Xero revocation lock'; end if;
  if coalesce(p_revoked, false) then
    delete from public.xero_oauth_grants g
    where g.id = p_grant_id and g.business_id = p_business_id
      and g.status = 'revocation_pending' and g.refresh_lock_id = p_lock_id
      and not exists (
        select 1 from public.xero_oauth_tenants t
        where t.business_id = g.business_id and t.grant_id = g.id
      );
  else
    update public.xero_oauth_grants g
    set status = 'pending_selection', refresh_lock_id = null,
      refresh_lock_expires_at = null, updated_at = clock_timestamp()
    where g.id = p_grant_id and g.business_id = p_business_id
      and g.status = 'revocation_pending' and g.refresh_lock_id = p_lock_id;
  end if;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.finish_pending_xero_oauth_revocation(uuid, uuid, uuid, boolean)
  from public, anon, service_role;
grant execute on function public.finish_pending_xero_oauth_revocation(uuid, uuid, uuid, boolean)
  to authenticated;

create function public.select_xero_oauth_tenant(
  p_business_id uuid, p_grant_id uuid, p_tenant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grant public.xero_oauth_grants%rowtype;
  v_existing_grant uuid;
  v_existing_status text;
  v_tenant jsonb;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  if p_grant_id is null or p_tenant_id is null then raise exception 'Invalid Xero organization'; end if;
  perform pg_advisory_xact_lock(hashtextextended('xero-oauth:' || p_business_id::text, 0));

  select g.* into v_grant from public.xero_oauth_grants g
  where g.id = p_grant_id and g.business_id = p_business_id for update;
  if not found or v_grant.status not in ('pending_selection', 'active') then
    raise exception 'Xero organization selection is unavailable';
  end if;
  select tenant.item into v_tenant
  from jsonb_array_elements(v_grant.available_tenants) as tenant(item)
  where lower(tenant.item->>'tenantId') = lower(p_tenant_id::text)
    and tenant.item->>'tenantType' = 'ORGANISATION';
  if not found then raise exception 'Xero organization selection is unavailable'; end if;

  select t.grant_id, g.status into v_existing_grant, v_existing_status
  from public.xero_oauth_tenants t
  join public.xero_oauth_grants g on g.id = t.grant_id and g.business_id = t.business_id
  where t.business_id = p_business_id and t.xero_tenant_id = p_tenant_id
  for update of t, g;
  if found and v_existing_grant = p_grant_id then return p_tenant_id; end if;
  if found and v_existing_status <> 'reauthorization_required' then
    raise exception 'Xero organization is already connected';
  end if;

  if found then
    update public.xero_oauth_tenants set grant_id = p_grant_id,
      tenant_name = v_tenant->>'tenantName', tenant_type = v_tenant->>'tenantType',
      connected_at = clock_timestamp()
    where business_id = p_business_id and xero_tenant_id = p_tenant_id;
  else
    insert into public.xero_oauth_tenants(
      business_id, xero_tenant_id, grant_id, tenant_name, tenant_type
    ) values (
      p_business_id, p_tenant_id, p_grant_id, v_tenant->>'tenantName', v_tenant->>'tenantType'
    );
  end if;
  update public.xero_oauth_grants set status = 'active', updated_at = clock_timestamp()
  where id = p_grant_id and business_id = p_business_id;
  if v_existing_grant is not null and not exists (
    select 1 from public.xero_oauth_tenants t
    where t.business_id = p_business_id and t.grant_id = v_existing_grant
  ) then
    delete from public.xero_oauth_grants g
    where g.id = v_existing_grant and g.business_id = p_business_id;
  end if;
  return p_tenant_id;
end;
$$;
revoke all on function public.select_xero_oauth_tenant(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.select_xero_oauth_tenant(uuid, uuid, uuid) to authenticated;

create function public.get_xero_oauth_tenant_grant(p_business_id uuid, p_tenant_id uuid)
returns table (
  grant_id uuid, encrypted_tokens text, expires_at timestamptz, scopes text[],
  status text, tenant_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  return query
    select g.id, g.encrypted_tokens, g.expires_at, g.scopes, g.status,
      (select count(*) from public.xero_oauth_tenants count_tenants
       where count_tenants.business_id = g.business_id and count_tenants.grant_id = g.id)
    from public.xero_oauth_tenants t
    join public.xero_oauth_grants g on g.id = t.grant_id and g.business_id = t.business_id
    where t.business_id = p_business_id and t.xero_tenant_id = p_tenant_id;
end;
$$;
revoke all on function public.get_xero_oauth_tenant_grant(uuid, uuid) from public, anon, service_role;
grant execute on function public.get_xero_oauth_tenant_grant(uuid, uuid) to authenticated;

create function public.claim_xero_oauth_refresh(
  p_business_id uuid, p_tenant_id uuid, p_lock_id uuid
)
returns table (
  acquired boolean, grant_id uuid, encrypted_tokens text, expires_at timestamptz, scopes text[],
  status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grant_id uuid;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  if p_lock_id is null then raise exception 'Invalid Xero token refresh lock'; end if;
  select t.grant_id into v_grant_id from public.xero_oauth_tenants t
  where t.business_id = p_business_id and t.xero_tenant_id = p_tenant_id;
  if not found then raise exception 'Xero connection unavailable'; end if;

  return query
    update public.xero_oauth_grants g
    set refresh_lock_id = p_lock_id,
      refresh_lock_expires_at = clock_timestamp() + interval '2 minutes'
    where g.id = v_grant_id and g.business_id = p_business_id and g.status = 'active'
      and (g.refresh_lock_id is null or g.refresh_lock_expires_at <= clock_timestamp())
    returning true, g.id, g.encrypted_tokens, g.expires_at, g.scopes, g.status;
  if found then return; end if;

  return query
    select false, g.id, g.encrypted_tokens, g.expires_at, g.scopes, g.status
    from public.xero_oauth_grants g where g.id = v_grant_id and g.business_id = p_business_id;
end;
$$;
revoke all on function public.claim_xero_oauth_refresh(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.claim_xero_oauth_refresh(uuid, uuid, uuid) to authenticated;

create function public.save_xero_oauth_refresh(
  p_business_id uuid, p_grant_id uuid, p_lock_id uuid, p_encrypted_tokens text,
  p_expires_at timestamptz, p_scopes text[]
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  if p_lock_id is null or p_encrypted_tokens is null
    or char_length(p_encrypted_tokens) not between 1 and 24000
    or p_expires_at is null or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '1 day'
    or p_scopes is null or not (p_scopes @> array['offline_access', 'payroll.timesheets']::text[])
    or cardinality(p_scopes) > 20 then raise exception 'Invalid Xero token refresh'; end if;
  update public.xero_oauth_grants g
  set encrypted_tokens = p_encrypted_tokens, expires_at = p_expires_at, scopes = p_scopes,
    refresh_lock_id = null, refresh_lock_expires_at = null, updated_at = clock_timestamp()
  where g.id = p_grant_id and g.business_id = p_business_id
    and g.status = 'active' and g.refresh_lock_id = p_lock_id;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.save_xero_oauth_refresh(uuid, uuid, uuid, text, timestamptz, text[])
  from public, anon, service_role;
grant execute on function public.save_xero_oauth_refresh(uuid, uuid, uuid, text, timestamptz, text[])
  to authenticated;

create function public.release_xero_oauth_refresh(
  p_business_id uuid, p_grant_id uuid, p_lock_id uuid, p_reauthorization_required boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  if p_lock_id is null then raise exception 'Invalid Xero token refresh lock'; end if;
  update public.xero_oauth_grants g
  set status = case when coalesce(p_reauthorization_required, false)
      then 'reauthorization_required' else g.status end,
    refresh_lock_id = null, refresh_lock_expires_at = null, updated_at = clock_timestamp()
  where g.id = p_grant_id and g.business_id = p_business_id and g.refresh_lock_id = p_lock_id;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.release_xero_oauth_refresh(uuid, uuid, uuid, boolean)
  from public, anon, service_role;
grant execute on function public.release_xero_oauth_refresh(uuid, uuid, uuid, boolean)
  to authenticated;

create function public.disconnect_xero_oauth_tenant(p_business_id uuid, p_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_grant_id uuid;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  if p_tenant_id is null then raise exception 'Invalid Xero organization'; end if;
  perform pg_advisory_xact_lock(hashtextextended('xero-oauth:' || p_business_id::text, 0));
  select t.grant_id into v_grant_id
  from public.xero_oauth_tenants t
  join public.xero_oauth_grants g on g.id = t.grant_id and g.business_id = t.business_id
  where t.business_id = p_business_id and t.xero_tenant_id = p_tenant_id
    and g.status in ('active', 'reauthorization_required')
    and exists (
      select 1 from public.xero_oauth_tenants other_t
      where other_t.business_id = t.business_id and other_t.grant_id = t.grant_id
        and other_t.xero_tenant_id <> t.xero_tenant_id
    )
  for update of t, g;
  if not found then raise exception 'Xero connection unavailable'; end if;
  delete from public.xero_oauth_tenants t
  where t.business_id = p_business_id and t.xero_tenant_id = p_tenant_id;
  return true;
end;
$$;
revoke all on function public.disconnect_xero_oauth_tenant(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.disconnect_xero_oauth_tenant(uuid, uuid) to authenticated;

create function public.claim_xero_oauth_disconnection(
  p_business_id uuid, p_tenant_id uuid, p_lock_id uuid
)
returns table (grant_id uuid, encrypted_tokens text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  if p_tenant_id is null or p_lock_id is null then raise exception 'Invalid Xero disconnection lease'; end if;
  perform pg_advisory_xact_lock(hashtextextended('xero-oauth:' || p_business_id::text, 0));
  return query
    update public.xero_oauth_grants g
    set status = 'revocation_pending', refresh_lock_id = p_lock_id,
      refresh_lock_expires_at = clock_timestamp() + interval '2 minutes',
      updated_at = clock_timestamp()
    from public.xero_oauth_tenants t
    where t.business_id = p_business_id and t.xero_tenant_id = p_tenant_id
      and t.grant_id = g.id and g.business_id = p_business_id
      and g.status in ('active', 'reauthorization_required', 'revocation_pending')
      and (g.refresh_lock_id is null or g.refresh_lock_expires_at <= clock_timestamp())
      and 1 = (
        select count(*) from public.xero_oauth_tenants linked
        where linked.business_id = g.business_id and linked.grant_id = g.id
      )
    returning g.id, g.encrypted_tokens;
end;
$$;
revoke all on function public.claim_xero_oauth_disconnection(uuid, uuid, uuid)
  from public, anon, service_role;
grant execute on function public.claim_xero_oauth_disconnection(uuid, uuid, uuid) to authenticated;

create function public.finish_xero_oauth_disconnection(
  p_business_id uuid, p_tenant_id uuid, p_lock_id uuid, p_revoked boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_grant_id uuid;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'Permission denied';
  end if;
  if p_tenant_id is null or p_lock_id is null then raise exception 'Invalid Xero disconnection lease'; end if;
  perform pg_advisory_xact_lock(hashtextextended('xero-oauth:' || p_business_id::text, 0));
  if coalesce(p_revoked, false) then
    delete from public.xero_oauth_tenants t
    using public.xero_oauth_grants g
    where t.business_id = p_business_id and t.xero_tenant_id = p_tenant_id
      and g.id = t.grant_id and g.business_id = t.business_id
      and g.status = 'revocation_pending' and g.refresh_lock_id = p_lock_id
      and not exists (
        select 1 from public.xero_oauth_tenants other_t
        where other_t.business_id = g.business_id and other_t.grant_id = g.id
          and other_t.xero_tenant_id <> t.xero_tenant_id
      )
    returning t.grant_id into v_grant_id;
    get diagnostics v_count = row_count;
    if v_count = 1 then
      delete from public.xero_oauth_grants g
      where g.id = v_grant_id and g.business_id = p_business_id
        and g.status = 'revocation_pending' and g.refresh_lock_id = p_lock_id;
    end if;
  else
    update public.xero_oauth_grants g
    set status = 'reauthorization_required', refresh_lock_id = null,
      refresh_lock_expires_at = null, updated_at = clock_timestamp()
    from public.xero_oauth_tenants t
    where t.business_id = p_business_id and t.xero_tenant_id = p_tenant_id
      and t.grant_id = g.id and g.business_id = p_business_id
      and g.status = 'revocation_pending' and g.refresh_lock_id = p_lock_id;
    get diagnostics v_count = row_count;
  end if;
  return v_count = 1;
end;
$$;
revoke all on function public.finish_xero_oauth_disconnection(uuid, uuid, uuid, boolean)
  from public, anon, service_role;
grant execute on function public.finish_xero_oauth_disconnection(uuid, uuid, uuid, boolean)
  to authenticated;
