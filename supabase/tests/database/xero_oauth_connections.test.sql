begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users(id, email, raw_user_meta_data) values
  ('a9910000-0000-4000-8000-000000000001', 'xero-owner@example.test', '{}'),
  ('a9910000-0000-4000-8000-000000000002', 'xero-admin@example.test', '{}'),
  ('a9910000-0000-4000-8000-000000000003', 'xero-manager@example.test', '{}'),
  ('a9910000-0000-4000-8000-000000000004', 'xero-outside@example.test', '{}');
insert into public.businesses(id, name) values
  ('b9910000-0000-4000-8000-000000000001', 'Xero connected business'),
  ('b9910000-0000-4000-8000-000000000002', 'Xero outside business');
insert into public.venues(id, business_id, name) values
  ('c9910000-0000-4000-8000-000000000001', 'b9910000-0000-4000-8000-000000000001', 'Xero venue'),
  ('c9910000-0000-4000-8000-000000000002', 'b9910000-0000-4000-8000-000000000002', 'Outside venue');
insert into public.business_memberships(business_id, user_id, role, venue_id, department_id) values
  ('b9910000-0000-4000-8000-000000000001', 'a9910000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b9910000-0000-4000-8000-000000000001', 'a9910000-0000-4000-8000-000000000002', 'admin', null, null),
  ('b9910000-0000-4000-8000-000000000001', 'a9910000-0000-4000-8000-000000000003', 'foh_manager',
    'c9910000-0000-4000-8000-000000000001', null),
  ('b9910000-0000-4000-8000-000000000002', 'a9910000-0000-4000-8000-000000000004', 'owner', null, null);

create function pg_temp.store_xero_grant(p_business uuid, p_grant uuid, p_tenant uuid)
returns uuid language sql as $$
  select public.store_xero_oauth_grant(
    p_business, p_grant, 'synthetic-encrypted-token', clock_timestamp() + interval '30 minutes',
    array['offline_access', 'payroll.timesheets'],
    jsonb_build_array(jsonb_build_object(
      'tenantId', p_tenant::text, 'tenantName', 'Synthetic AU Demo', 'tenantType', 'ORGANISATION'
    ))
  );
$$;

select extensions.ok(
  not has_table_privilege('authenticated', 'public.xero_oauth_grants', 'select')
  and not has_table_privilege('authenticated', 'public.xero_oauth_tenants', 'select')
  and not has_table_privilege('anon', 'public.xero_oauth_grants', 'select'),
  'OAuth ciphertext and organization rows are not directly readable'
);
select extensions.ok(
  not has_function_privilege('anon',
    'public.store_xero_oauth_grant(uuid,uuid,text,timestamptz,text[],jsonb)', 'execute')
  and not has_function_privilege('service_role',
    'public.store_xero_oauth_grant(uuid,uuid,text,timestamptz,text[],jsonb)', 'execute'),
  'OAuth grant storage is not exposed to anonymous or service-role callers'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9910000-0000-4000-8000-000000000001', true);
select public.store_xero_oauth_grant(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000001',
  'synthetic-encrypted-token', clock_timestamp() + interval '30 minutes',
  array['offline_access', 'payroll.timesheets'],
  jsonb_build_array(jsonb_build_object(
    'tenantId', 'e9910000-0000-4000-8000-000000000001',
    'tenantName', 'Synthetic AU Demo', 'tenantType', 'ORGANISATION'
  ))
);
select public.store_xero_oauth_grant(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000003',
  'synthetic-pending-token', clock_timestamp() + interval '30 minutes',
  array['offline_access', 'payroll.timesheets'],
  jsonb_build_array(jsonb_build_object(
    'tenantId', 'e9910000-0000-4000-8000-000000000002',
    'tenantName', 'Pending Demo', 'tenantType', 'ORGANISATION'
  ))
);
select extensions.is((select count(*) from public.claim_pending_xero_oauth_revocation(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000003',
  'f9910000-0000-4000-8000-000000000010')),
  1::bigint, 'an owner can lease an unselected authorization for revocation');
select extensions.is((select count(*) from public.claim_pending_xero_oauth_revocation(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000003',
  'f9910000-0000-4000-8000-000000000011')),
  0::bigint, 'a pending revocation lease prevents a concurrent selection or deletion');
select extensions.ok(public.finish_pending_xero_oauth_revocation(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000003',
  'f9910000-0000-4000-8000-000000000010', false),
  'a failed provider revocation releases the pending organization for retry');
select extensions.ok(public.finish_pending_xero_oauth_revocation(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000003',
  'f9910000-0000-4000-8000-000000000010', true) is false,
  'a stale revocation lease cannot remove an authorization after release');
select extensions.is((select count(*) from public.claim_pending_xero_oauth_revocation(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000003',
  'f9910000-0000-4000-8000-000000000012')),
  1::bigint, 'the owner can retry revocation after release');
select extensions.ok(public.finish_pending_xero_oauth_revocation(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000003',
  'f9910000-0000-4000-8000-000000000012', true),
  'a successfully revoked pending authorization is removed');

select extensions.throws_ok($$select public.store_xero_oauth_grant(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000002',
  'synthetic-encrypted-token', clock_timestamp() + interval '30 minutes',
  array['offline_access'],
  jsonb_build_array(jsonb_build_object(
    'tenantId', 'e9910000-0000-4000-8000-000000000002',
    'tenantName', 'Other Demo', 'tenantType', 'ORGANISATION'
  )))$$,
  'P0001', 'Invalid Xero OAuth grant', 'a grant without the required scopes is rejected');

select set_config('request.jwt.claim.sub', 'a9910000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select public.store_xero_oauth_grant(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000002',
  'synthetic-encrypted-token', clock_timestamp() + interval '30 minutes',
  array['offline_access', 'payroll.timesheets'],
  jsonb_build_array(jsonb_build_object(
    'tenantId', 'e9910000-0000-4000-8000-000000000002',
    'tenantName', 'Other Demo', 'tenantType', 'ORGANISATION'
  )))$$,
  'P0001', 'Permission denied', 'department managers cannot save Xero grants');
select set_config('request.jwt.claim.sub', 'a9910000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select * from public.list_pending_xero_oauth_tenants(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a different business owner cannot inspect available organizations');

select set_config('request.jwt.claim.sub', 'a9910000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*) from public.list_pending_xero_oauth_tenants(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000001')),
  1::bigint, 'business admins can select from the authorized organization list');
select extensions.is(public.select_xero_oauth_tenant(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000001',
  'e9910000-0000-4000-8000-000000000001'),
  'e9910000-0000-4000-8000-000000000001'::uuid, 'organization selection is linked to its business grant');
select extensions.is((select count(*) from public.list_xero_oauth_tenants(
  'b9910000-0000-4000-8000-000000000001')),
  1::bigint, 'connected Xero organization is visible only in its business');
select extensions.is((select tenant_count from public.get_xero_oauth_tenant_grant(
  'b9910000-0000-4000-8000-000000000001', 'e9910000-0000-4000-8000-000000000001')),
  1::bigint, 'server grant lookup is scoped to an existing business organization link');
select extensions.throws_ok($$select public.select_xero_oauth_tenant(
  'b9910000-0000-4000-8000-000000000002', 'd9910000-0000-4000-8000-000000000001',
  'e9910000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'cross-business organization selection is rejected');

select extensions.is((select acquired from public.claim_xero_oauth_refresh(
  'b9910000-0000-4000-8000-000000000001', 'e9910000-0000-4000-8000-000000000001',
  'f9910000-0000-4000-8000-000000000001')),
  true, 'the first authorized refresh obtains a durable lease');
select extensions.is((select acquired from public.claim_xero_oauth_refresh(
  'b9910000-0000-4000-8000-000000000001', 'e9910000-0000-4000-8000-000000000001',
  'f9910000-0000-4000-8000-000000000002')),
  false, 'a concurrent refresh cannot reuse the rotating provider token');
select extensions.ok(public.save_xero_oauth_refresh(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000001',
  'f9910000-0000-4000-8000-000000000001', 'synthetic-rotated-token',
  clock_timestamp() + interval '30 minutes', array['offline_access', 'payroll.timesheets']),
  'only the lease owner can persist the rotated refresh token');
select extensions.is((select acquired from public.claim_xero_oauth_refresh(
  'b9910000-0000-4000-8000-000000000001', 'e9910000-0000-4000-8000-000000000001',
  'f9910000-0000-4000-8000-000000000003')),
  true, 'a completed rotation releases the next refresh lease');
select extensions.ok(public.release_xero_oauth_refresh(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000001',
  'f9910000-0000-4000-8000-000000000003', true),
  'a revoked refresh marks the connection for reauthorization');
select extensions.is((select status from public.list_xero_oauth_tenants(
  'b9910000-0000-4000-8000-000000000001')
  where tenant_id = 'e9910000-0000-4000-8000-000000000001'),
  'reauthorization_required', 'revoked provider credentials are visible as reconnect-required');

select set_config('request.jwt.claim.sub', 'a9910000-0000-4000-8000-000000000001', true);
select public.store_xero_oauth_grant(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000002',
  'synthetic-reconnected-token', clock_timestamp() + interval '30 minutes',
  array['offline_access', 'payroll.timesheets'],
  jsonb_build_array(jsonb_build_object(
    'tenantId', 'e9910000-0000-4000-8000-000000000001',
    'tenantName', 'Synthetic AU Demo', 'tenantType', 'ORGANISATION'
  ))
);
select extensions.is(public.select_xero_oauth_tenant(
  'b9910000-0000-4000-8000-000000000001', 'd9910000-0000-4000-8000-000000000002',
  'e9910000-0000-4000-8000-000000000001'),
  'e9910000-0000-4000-8000-000000000001'::uuid,
  'an owner can reconnect an organization after provider revocation');
select extensions.throws_ok($$select public.disconnect_xero_oauth_tenant(
  'b9910000-0000-4000-8000-000000000001', 'e9910000-0000-4000-8000-000000000001')$$,
  'P0001', 'Xero connection unavailable',
  'the final active organization cannot be removed without first claiming revocation');
select extensions.is((select count(*) from public.claim_xero_oauth_disconnection(
  'b9910000-0000-4000-8000-000000000001', 'e9910000-0000-4000-8000-000000000001',
  'f9910000-0000-4000-8000-000000000010')),
  1::bigint, 'an owner must claim a lease before revoking the final organization');
select extensions.ok(public.finish_xero_oauth_disconnection(
  'b9910000-0000-4000-8000-000000000001', 'e9910000-0000-4000-8000-000000000001',
  'f9910000-0000-4000-8000-000000000010', false),
  'a failed provider revocation retains the organization for reauthorization');
select extensions.is((select status from public.list_xero_oauth_tenants(
  'b9910000-0000-4000-8000-000000000001')
  where tenant_id = 'e9910000-0000-4000-8000-000000000001'),
  'reauthorization_required', 'a failed revocation never leaves an unusable grant marked active');
select extensions.is((select count(*) from public.claim_xero_oauth_disconnection(
  'b9910000-0000-4000-8000-000000000001', 'e9910000-0000-4000-8000-000000000001',
  'f9910000-0000-4000-8000-000000000011')),
  1::bigint, 'an owner can retry revocation after resolving the provider failure');
select extensions.ok(public.finish_xero_oauth_disconnection(
  'b9910000-0000-4000-8000-000000000001', 'e9910000-0000-4000-8000-000000000001',
  'f9910000-0000-4000-8000-000000000011', true),
  'a successfully revoked organization is removed under its lease');
select extensions.is((select count(*) from public.list_xero_oauth_tenants(
  'b9910000-0000-4000-8000-000000000001')),
  0::bigint, 'disconnect removes the organization link and its unused grant');

reset role;
select * from extensions.finish();
rollback;
