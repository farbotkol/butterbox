-- Keep connected Xero organisations and payroll mapping destinations in sync.
-- The OAuth tenant is the source of truth for the account ID. No browser-supplied ID.
-- Existing destinations are preserved (including owner-chosen names and mappings).
create function public.ensure_xero_payroll_mapping_destination()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
begin
  select g.authorized_by into v_actor
  from public.xero_oauth_grants g
  where g.id = new.grant_id and g.business_id = new.business_id;
  if v_actor is null then
    raise exception 'Xero grant not available for payroll destination';
  end if;

  insert into public.payroll_mapping_connections (
    id, business_id, provider, account_id, name, actor_id
  ) values (
    gen_random_uuid(), new.business_id, 'xero', new.xero_tenant_id::text,
    left('Xero - ' || new.tenant_name, 100), v_actor
  )
  on conflict (business_id, provider, account_id) do nothing;
  return new;
end;
$$;
revoke all on function public.ensure_xero_payroll_mapping_destination()
  from public, anon, authenticated, service_role;

create trigger xero_tenant_ensure_payroll_destination
  after insert or update of grant_id, tenant_name on public.xero_oauth_tenants
  for each row execute function public.ensure_xero_payroll_mapping_destination();

-- Backfill organisations already authorised before this migration.
insert into public.payroll_mapping_connections (
  id, business_id, provider, account_id, name, actor_id
)
select gen_random_uuid(), t.business_id, 'xero', t.xero_tenant_id::text,
  left('Xero - ' || t.tenant_name, 100), g.authorized_by
from public.xero_oauth_tenants t
join public.xero_oauth_grants g
  on g.id = t.grant_id and g.business_id = t.business_id
where g.status in ('active', 'reauthorization_required', 'revocation_pending')
on conflict (business_id, provider, account_id) do nothing;
