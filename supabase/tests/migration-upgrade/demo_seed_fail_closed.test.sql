begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.businesses'::regclass
      and tgname = 'businesses_prevent_delete' and not tgisinternal
  ) or exists (
    select 1 from pg_trigger
    where tgrelid = 'public.demo_seed_policy'::regclass
      and tgname = 'reject_unisolated_demo_seed_policy' and not tgisinternal
  ) then
    raise exception 'Upgrade test requires the disposable pre-safeguard schema';
  end if;
end;
$$;

select extensions.plan(16);
update public.demo_seed_policy set enabled = true where singleton;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a3100000-0000-4000-8000-000000000001', 'legacy-demo-upgrade@example.test', '{}'::jsonb),
  ('a3100000-0000-4000-8000-000000000002', 'clean-demo-upgrade@example.test', '{}'::jsonb);

select set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(public.demo_seed_enabled(), true, 'the previous operator policy was enabled');
select extensions.ok(
  set_config('test.demo_upgrade_business', public.complete_initial_setup(
    'Legacy demo', 'Legacy venue', '20 Test Street', 'UTC', true
  )::text, true) is not null,
  'the previous release created a sample workspace');
select extensions.is(
  (select count(*)::integer from public.employees
    where business_id = current_setting('test.demo_upgrade_business')::uuid),
  24, 'the legacy workspace contains the original sample employees');
select extensions.is(
  (select count(*)::integer from public.shifts
    where business_id = current_setting('test.demo_upgrade_business')::uuid),
  48, 'the legacy workspace contains the original sample shifts');

reset role;
create function pg_temp.demo_upgrade_snapshot(p_business_id uuid)
returns jsonb language sql as $$
  select jsonb_build_object(
    'business', (select to_jsonb(b) from public.businesses b where b.id = p_business_id),
    'venues', (select jsonb_agg(to_jsonb(v) order by v.id)
      from public.venues v where v.business_id = p_business_id),
    'departments', (select jsonb_agg(to_jsonb(d) order by d.id)
      from public.departments d where d.business_id = p_business_id),
    'employees', (select jsonb_agg(to_jsonb(e) order by e.id)
      from public.employees e where e.business_id = p_business_id),
    'roles', (select jsonb_agg(to_jsonb(r) order by r.id)
      from public.job_roles r where r.business_id = p_business_id),
    'shifts', (select jsonb_agg(to_jsonb(s) order by s.id)
      from public.shifts s where s.business_id = p_business_id)
  );
$$;
create temporary table demo_upgrade_before as
select pg_temp.demo_upgrade_snapshot(current_setting('test.demo_upgrade_business')::uuid) as snapshot;

-- APPLY_DEMO_SAFEGUARD_MIGRATION

select extensions.is(
  (select enabled from public.demo_seed_policy where singleton), false,
  'the upgrade disables a previously enabled policy');
select extensions.is(
  pg_temp.demo_upgrade_snapshot(current_setting('test.demo_upgrade_business')::uuid),
  (select snapshot from demo_upgrade_before),
  'the upgrade preserves all existing business, venue, department, staff, role and shift records');
select extensions.throws_ok(
  $$update public.demo_seed_policy set enabled = true where singleton$$,
  'P0001', 'Sample data is not enabled in this environment',
  'the database operator cannot re-enable sample creation');
select extensions.throws_ok(
  $$select public.handle_demo_seed_unchecked(
    current_setting('test.demo_upgrade_business')::uuid,
    (select id from public.venues where business_id = current_setting('test.demo_upgrade_business')::uuid),
    'UTC')$$,
  'P0001', 'Sample data is not enabled in this environment',
  'the historical unchecked helper cannot add to an existing business');
select extensions.throws_ok(
  $$select public.handle_demo_seed(
    current_setting('test.demo_upgrade_business')::uuid,
    (select id from public.venues where business_id = current_setting('test.demo_upgrade_business')::uuid),
    'UTC')$$,
  'P0001', 'Sample data is not enabled in this environment',
  'the guarded helper cannot add to an existing business');

select set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.complete_initial_setup('New sample', 'Venue', '10 Test Street', 'UTC', true)$$,
  'P0001', 'Sample data is not enabled in this environment',
  'new customer setup rejects sample data after the upgrade');
select extensions.is(
  (select count(*)::integer from public.business_memberships where user_id = auth.uid()), 0,
  'the rejected request leaves no owner membership');
insert into public.business_setup_drafts (user_id, business_name)
values (auth.uid(), 'Clean upgrade draft');
select extensions.is(
  (select include_sample_data from public.business_setup_drafts where user_id = auth.uid()), false,
  'a new setup draft defaults to a clean workspace');
select extensions.ok(
  public.complete_initial_setup('Clean upgrade cafe', 'Venue', '10 Test Street', 'UTC', false) is not null,
  'clean customer setup still succeeds');
select extensions.is(
  jsonb_build_object(
    'employees', (select count(*) from public.employees),
    'roles', (select count(*) from public.job_roles),
    'shifts', (select count(*) from public.shifts)
  ),
  '{"employees":0,"roles":0,"shifts":0}'::jsonb,
  'the new customer receives no legacy staff, roles or shifts');
select extensions.is(
  (select count(*)::integer from public.employees
    where business_id = current_setting('test.demo_upgrade_business')::uuid),
  0, 'the new customer cannot read the legacy tenant');
select extensions.is(
  (select to_jsonb(p) from public.get_onboarding_progress((
    select business_id from public.business_memberships where user_id = auth.uid()
  )) p),
  '{"business_ready":true,"venue_ready":true,"staff_ready":false,"shift_ready":false,"publication_ready":false}'::jsonb,
  'the new customer begins with the correct onboarding progress');

select * from extensions.finish();
rollback;
