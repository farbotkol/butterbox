-- Run against a migrated LOCAL Supabase DB:
-- psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/roster.sql
-- Also compatible with `supabase test db`: emits TAP without requiring pgTAP.
-- Fixtures (including auth.users) are local-test-only and fully rolled back.
\set ON_ERROR_STOP on
begin;
create schema roster_test;
grant usage on schema roster_test to authenticated, anon;
create sequence roster_test.test_number;
grant usage, select on sequence roster_test.test_number to authenticated, anon;
select '1..74';
create function roster_test.assert(ok boolean, label text) returns text
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  return format('ok %s - %s', nextval('roster_test.test_number'), label);
end;
$$;
create function roster_test.rejects(statement text, expected_state text, label text) returns text
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then return roster_test.assert(true, label); end if;
    raise exception 'FAIL: %; expected %, received %: %', label, expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: %; statement succeeded', label;
end;
$$;
create function roster_test.owner_id() returns uuid language sql immutable as $$
  select md5('roster-test-owner')::uuid;
$$;
create function roster_test.id(kind text, suffix text default '') returns uuid
language sql immutable as $$
  select private.demo_uuid('demo-' || kind || '-' || roster_test.owner_id() || suffix);
$$;
create function roster_test.other_id(kind text, suffix text default '') returns uuid
language sql immutable as $$
  select private.demo_uuid('demo-' || kind || '-' || md5('roster-test-other')::uuid || suffix);
$$;
create function roster_test.input(dept integer default 1, emp integer default 1, offset_days integer default 14)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'venue_id', roster_test.id('venue'),
    'department_id', roster_test.id('department', '-' || dept),
    'role_id', roster_test.id('role', '-' || dept || '-1'),
    'employee_id', case when emp is null then null else roster_test.id('employee', '-' || emp) end,
    'starts_at', date_trunc('day', now()) + make_interval(days => offset_days, hours => 22),
    'ends_at', date_trunc('day', now()) + make_interval(days => offset_days + 1, hours => 6),
    'break_minutes', 30);
$$;
create function roster_test.other_input() returns jsonb language sql stable as $$
  select roster_test.input(1, null, 40) || jsonb_build_object(
    'venue_id', roster_test.other_id('venue'),
    'department_id', roster_test.other_id('department', '-1'),
    'role_id', roster_test.other_id('role', '-1-1'));
$$;

insert into auth.users(id) values
  (roster_test.owner_id()), (md5('roster-test-other')::uuid),
  (md5('roster-test-foh')::uuid), (md5('roster-test-boh')::uuid),
  (md5('roster-test-worker')::uuid), (md5('roster-test-gm')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub', roster_test.owner_id()::text, true);
select roster_test.assert((select count(*) = 0 from public.business_memberships
  where user_id = auth.uid()), 'signed-in user without membership can query onboarding state');
select public.bootstrap_demo_business();
select roster_test.assert((select count(*) = 1 from public.business_memberships
  where user_id = auth.uid()), 'bootstrap creates a readable own membership');
select roster_test.assert(public.bootstrap_demo_business() = roster_test.id('business'), 'bootstrap is idempotent');
select roster_test.assert((select count(*) = 24 from public.employees), '24 fictional employees');
select roster_test.assert((select count(*) = 168 from public.shifts), 'seven days of demo shifts');
select roster_test.assert((select count(*) = 4 from public.job_roles), 'four eligible job roles');
select roster_test.assert((select bool_and(id::text ~
  '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$') from public.shifts),
  'demo IDs have RFC UUID version and variant bits for z.uuid()');
select set_config('request.jwt.claim.sub', md5('roster-test-other')::uuid::text, true);
select public.bootstrap_demo_business();
select roster_test.assert((select count(*) = 1 from public.businesses), 'other owner sees only own business');
select roster_test.assert((select count(*) = 24 from public.employees), 'other owner cannot read employees');
select roster_test.assert((select count(*) = 168 from public.shifts), 'other owner cannot read shifts');
select roster_test.rejects('select public.save_shift(roster_test.input())', '42501', 'cross-tenant RPC scope denied');
select roster_test.rejects(
  format('select public.delete_shift(%L, 1)', roster_test.id('shift', '-1-0')),
  '42501', 'cross-tenant delete denied');
reset role;

insert into public.user_profiles values
  (md5('roster-test-foh')::uuid, 'FOH Manager'), (md5('roster-test-boh')::uuid, 'BOH Manager'),
  (md5('roster-test-worker')::uuid, 'Avery Brooks'), (md5('roster-test-gm')::uuid, 'Venue Manager');
insert into public.business_memberships values
  (md5('roster-test-foh')::uuid, roster_test.id('business'), 'department_manager'),
  (md5('roster-test-boh')::uuid, roster_test.id('business'), 'department_manager'),
  (md5('roster-test-worker')::uuid, roster_test.id('business'), 'employee'),
  (md5('roster-test-gm')::uuid, roster_test.id('business'), 'general_manager');
insert into public.venue_memberships
  select md5('roster-test-' || who)::uuid, roster_test.id('business'), roster_test.id('venue')
  from (values ('foh'), ('boh'), ('worker'), ('gm')) names(who);
insert into public.department_memberships values
  (md5('roster-test-foh')::uuid, roster_test.id('business'), roster_test.id('venue'), roster_test.id('department', '-1')),
  (md5('roster-test-boh')::uuid, roster_test.id('business'), roster_test.id('venue'), roster_test.id('department', '-2'));
update public.employees set user_id = md5('roster-test-worker')::uuid where id = roster_test.id('employee', '-1');
-- A deliberately cross-trained employee: overlap must still be rejected across
-- departments even though the department manager cannot see the other shift.
insert into public.employee_department_roles values (
  roster_test.id('employee', '-1'), roster_test.id('business'), roster_test.id('venue'),
  roster_test.id('department', '-2'), roster_test.id('role', '-2-1'));
insert into public.venues(id, business_id, name) values
  (md5('roster-test-second-venue')::uuid, roster_test.id('business'), 'Unassigned venue');
insert into public.departments values
  (md5('roster-test-second-dept')::uuid, roster_test.id('business'), md5('roster-test-second-venue')::uuid, 'Offsite');
insert into public.job_roles values
  (md5('roster-test-second-role')::uuid, roster_test.id('business'), md5('roster-test-second-venue')::uuid,
   md5('roster-test-second-dept')::uuid, 'Offsite role');
set local role authenticated;
select set_config('request.jwt.claim.sub', md5('roster-test-foh')::uuid::text, true);
select roster_test.assert((select count(*) = 1 from public.departments), 'FOH cannot read BOH');
select roster_test.assert((select count(*) = 84 from public.shifts), 'FOH sees only its draft roster');
select roster_test.assert((select count(*) = 12 from public.employees), 'FOH employee directory is scoped');
select roster_test.rejects('insert into public.shifts default values', '42501', 'direct shift insert denied');
select roster_test.rejects('update public.shifts set break_minutes = 0', '42501', 'direct shift update denied');
select roster_test.rejects('delete from public.shifts', '42501', 'direct shift delete denied');
select roster_test.rejects('update public.business_memberships set role = ''owner''', '42501', 'cannot escalate own role');
select roster_test.rejects('insert into public.role_permissions values (roster_test.id(''business''), ''department_manager'', ''publish_roster'')',
  '42501', 'cannot grant own publishing permission');
select roster_test.rejects('select public.save_shift(roster_test.input(2, 13))', '42501', 'FOH cannot edit BOH');
select public.save_shift(roster_test.input());
select roster_test.assert((select count(*) = 1 from public.shifts
  where starts_at = (roster_test.input()->>'starts_at')::timestamptz), 'cross-midnight shift saved');
select roster_test.rejects('select public.save_shift(roster_test.input())', '23P01', 'overlap excluded');
select roster_test.rejects('select public.save_shift(roster_test.input(1, 13))', '23503', 'employee must be role eligible');
select roster_test.rejects('select public.save_shift(roster_test.input(1, null) || jsonb_build_object(''role_id'', roster_test.id(''role'', ''-2-1'')))',
  '23503', 'role must belong to department');
select roster_test.rejects('select public.save_shift(roster_test.input(1, null) || jsonb_build_object(''ends_at'', (roster_test.input()->>''starts_at'')::timestamptz + interval ''25 hours''))',
  '23514', 'duration limited to 24h');
select roster_test.rejects('select public.save_shift(roster_test.input(1, null) || jsonb_build_object(''ends_at'', roster_test.input()->>''starts_at''))',
  '23514', 'zero duration rejected');
select roster_test.rejects('select public.save_shift(roster_test.input(1, null) || ''{"break_minutes":480}'')',
  '23514', 'break must be shorter than shift');
select roster_test.rejects('select public.save_shift(roster_test.input(1, null) || ''{"break_minutes":481}'')',
  '23514', 'break capped at 480 minutes');
select roster_test.rejects('select public.save_shift(roster_test.input(1, null) || ''{"break_minutes":-1}'')',
  '23514', 'negative break rejected');
select roster_test.rejects('select public.save_shift(roster_test.input() || ''{"version":1}'')',
  '22023', 'version requires id');
select roster_test.rejects('select public.save_shift(roster_test.input() || ''{"status":"published"}'')',
  '22023', 'client cannot supply status');
select public.save_shift(roster_test.input() || (
  select jsonb_build_object('id', id, 'version', version, 'break_minutes', 45)
  from public.shifts where starts_at = (roster_test.input()->>'starts_at')::timestamptz));
select roster_test.rejects(
  format('select public.save_shift(roster_test.input() || %L::jsonb)',
    (select jsonb_build_object('id', id, 'version', 1) from public.shifts
      where starts_at = (roster_test.input()->>'starts_at')::timestamptz)),
  '40001', 'stale edit rejected');
select roster_test.rejects(
  format('select public.delete_shift(%L, 1)', (select id from public.shifts
    where starts_at = (roster_test.input()->>'starts_at')::timestamptz)),
  '40001', 'stale delete rejected');
select roster_test.rejects(
  'select public.publish_roster(roster_test.id(''venue''), roster_test.id(''department'', ''-1''), now(), now()+interval ''7 days'')',
  '42501', 'department manager needs publish grant');

select set_config('request.jwt.claim.sub', md5('roster-test-boh')::uuid::text, true);
select roster_test.assert(not exists(select 1 from public.shifts
  where department_id = roster_test.id('department', '-1')), 'BOH cannot see FOH conflict');
select roster_test.rejects('select public.save_shift(roster_test.input(2, 1))', '23P01',
  'invisible cross-department overlap excluded');
-- Half-open ranges permit exact adjacency.
select public.save_shift(roster_test.input(2, 1) || jsonb_build_object(
  'starts_at', roster_test.input()->>'ends_at',
  'ends_at', (roster_test.input()->>'ends_at')::timestamptz + interval '4 hours'));
select set_config('request.jwt.claim.sub', md5('roster-test-gm')::uuid::text, true);
select roster_test.assert((select count(*) = 2 from public.departments), 'GM sees both departments in assigned venue');
select roster_test.assert((select count(*) = 1 from public.venues), 'GM cannot see unassigned venue');
select roster_test.rejects(
  'select public.save_shift(roster_test.input(1,null) || jsonb_build_object(''venue_id'', md5(''roster-test-second-venue'')::uuid, ''department_id'', md5(''roster-test-second-dept'')::uuid, ''role_id'', md5(''roster-test-second-role'')::uuid))',
  '42501', 'GM cannot mutate unassigned venue');
select roster_test.rejects(
  'select public.publish_roster(roster_test.id(''venue''), roster_test.id(''department'', ''-1''), now(), now()+interval ''9 days'')',
  '22023', 'publication interval capped at eight days');
select roster_test.rejects(
  'select public.publish_roster(roster_test.id(''venue''), roster_test.id(''department'', ''-1''), now(), now())',
  '22023', 'empty publication interval rejected');
select roster_test.rejects(
  'select public.publish_roster(roster_test.id(''venue''), roster_test.id(''department'', ''-2''), now()+interval ''100 days'', now()+interval ''101 days'')',
  '22023', 'empty draft publication rejected');

-- A failing audit insert must roll back both publication and shift changes.
reset role;
create function roster_test.fail_audit() returns trigger language plpgsql as $$
begin
  if new.action = 'publish_roster' then raise exception 'Simulated audit failure' using errcode = 'P0001'; end if;
  return new;
end;
$$;
create trigger roster_test_audit_failure before insert on public.audit_logs
  for each row execute function roster_test.fail_audit();
set local role authenticated;
select roster_test.rejects(
  'select public.publish_roster(roster_test.id(''venue''), roster_test.id(''department'', ''-1''), (roster_test.input()->>''starts_at'')::timestamptz, (roster_test.input()->>''starts_at'')::timestamptz + interval ''7 days'')',
  'P0001', 'publication and audit are one transaction');
select roster_test.assert((select count(*) = 0 from public.roster_publications), 'failed publication leaves no record');
select roster_test.assert((select count(*) = 0 from public.shifts where status = 'published'), 'failed publication leaves drafts intact');
reset role;
drop trigger roster_test_audit_failure on public.audit_logs;
-- Explicitly grant the department-manager role publishing for this business.
insert into public.role_permissions values (roster_test.id('business'), 'department_manager', 'publish_roster');
set local role authenticated;
select set_config('request.jwt.claim.sub', md5('roster-test-foh')::uuid::text, true);
select public.publish_roster(roster_test.id('venue'), roster_test.id('department', '-1'),
  (roster_test.input()->>'starts_at')::timestamptz,
  (roster_test.input()->>'starts_at')::timestamptz + interval '7 days');
select roster_test.assert((select shift_count = 1 from public.roster_publications), 'publication records exact draft count');
select roster_test.assert((select count(*) = 1 from public.audit_logs where action = 'publish_roster'), 'publication audit written');
select roster_test.assert((select count(*) = 1 from public.shifts where status = 'published'), 'only in-window department draft published');
select roster_test.rejects(
  format('select public.delete_shift(%L, 3)', (select id from public.shifts where status = 'published')),
  '40001', 'cannot delete published shift');
select roster_test.rejects(
  format('select public.save_shift(roster_test.input() || %L::jsonb)',
    (select jsonb_build_object('id', id, 'version', version) from public.shifts where status = 'published')),
  '40001', 'cannot edit published shift');
select roster_test.rejects(
  'select public.publish_roster(roster_test.id(''venue''), roster_test.id(''department'', ''-2''), now(), now()+interval ''7 days'')',
  '42501', 'publish grant never bypasses department scope');
select public.save_shift(roster_test.input(1, null, 30));
select public.delete_shift((select id from public.shifts
  where starts_at = (roster_test.input(1, null, 30)->>'starts_at')::timestamptz), 1);
select roster_test.assert(not exists(select 1 from public.shifts
  where starts_at = (roster_test.input(1, null, 30)->>'starts_at')::timestamptz), 'draft deletion succeeds');

select set_config('request.jwt.claim.sub', md5('roster-test-worker')::uuid::text, true);
select roster_test.assert((select count(*) = 1 from public.employees), 'employee sees only own employee record');
select roster_test.assert((select count(*) = 1 from public.shifts), 'employee sees only own published shift');
select roster_test.assert((select bool_and(status = 'published' and employee_id = roster_test.id('employee', '-1'))
  from public.shifts), 'employee cannot read other employees or drafts');
select roster_test.assert((select count(*) = 0 from public.roster_publications), 'employee cannot read publication metadata');
select roster_test.assert((select count(*) = 0 from public.audit_logs), 'employee cannot read audit');
select roster_test.rejects('select public.save_shift(roster_test.input())', '42501', 'employee cannot save');
select roster_test.rejects(
  'select public.delete_shift(roster_test.id(''shift'', ''-1-0''),1)', '42501', 'employee cannot delete');
select roster_test.rejects(
  'select public.publish_roster(roster_test.id(''venue''), roster_test.id(''department'', ''-1''), now(), now()+interval ''7 days'')',
  '42501', 'employee cannot publish');
reset role;
-- The same identity can participate in multiple businesses, with independent
-- roles and employee records. RPCs must resolve the TARGET tenant, not simply
-- select the first membership (the UI currently displays the first business).
insert into public.business_memberships(user_id, business_id, role, created_at) values
  (roster_test.owner_id(), roster_test.other_id('business'), 'employee', now() + interval '1 second'),
  (md5('roster-test-gm')::uuid, roster_test.other_id('business'), 'owner', now() + interval '1 second');
update public.employees set user_id = roster_test.owner_id()
  where id in (roster_test.id('employee', '-2'), roster_test.other_id('employee', '-1'));
set local role authenticated;
select set_config('request.jwt.claim.sub', roster_test.owner_id()::text, true);
select roster_test.assert((select count(*) = 2 from public.business_memberships where user_id = auth.uid()),
  'identity can read both own business memberships');
select roster_test.assert(public.bootstrap_demo_business() = roster_test.id('business'),
  'bootstrap returns earliest business without creating another');
select roster_test.assert((select count(*) = 2 from public.employees where user_id = auth.uid()),
  'identity can have independent employee records in two businesses');
select roster_test.rejects('select public.save_shift(roster_test.other_input())',
  '42501', 'owner role in one tenant does not grant writes in another');
select roster_test.rejects(
  'select public.delete_shift(roster_test.other_id(''shift'', ''-1-0''),1)',
  '42501', 'delete uses role in the target shift tenant');
select roster_test.rejects(
  'select public.publish_roster(roster_test.other_id(''venue''), roster_test.other_id(''department'', ''-1''), now(), now()+interval ''7 days'')',
  '42501', 'publish uses role in the target venue tenant');
select set_config('request.jwt.claim.sub', md5('roster-test-gm')::uuid::text, true);
select roster_test.assert((select count(*) = 2 from public.business_memberships where user_id = auth.uid()),
  'manager can additionally own a different business');
select public.save_shift(roster_test.other_input());
select roster_test.assert((select count(*) = 1 from public.shifts
  where business_id = roster_test.other_id('business')
    and starts_at = (roster_test.other_input()->>'starts_at')::timestamptz),
  'save resolves second membership by venue rather than first membership');
select public.delete_shift((select id from public.shifts
  where business_id = roster_test.other_id('business')
    and starts_at = (roster_test.other_input()->>'starts_at')::timestamptz), 1);
reset role;
-- Composite FKs defend trusted writes as well as RPCs.
select roster_test.rejects(
  'insert into public.venue_memberships values (md5(''roster-test-other'')::uuid, private.demo_uuid(''demo-business-'' || md5(''roster-test-other'')::uuid), roster_test.id(''venue''))',
  '23503', 'membership cannot cross tenant');
select roster_test.rejects(
  'insert into public.shifts(business_id,venue_id,department_id,role_id,employee_id,starts_at,ends_at) values (private.demo_uuid(''demo-business-'' || md5(''roster-test-other'')::uuid),roster_test.id(''venue''),roster_test.id(''department'',''-1''),roster_test.id(''role'',''-1-1''),null,now(),now()+interval ''1 hour'')',
  '23503', 'shift cannot cross tenant');
set local role anon;
select roster_test.rejects('select * from public.shifts', '42501', 'anonymous cannot read shifts');
select roster_test.rejects('select public.bootstrap_demo_business()', '42501', 'anonymous cannot bootstrap');
select roster_test.rejects('select public.save_shift(roster_test.input())', '42501', 'anonymous cannot save');
reset role;
rollback;
\echo '# Roster isolation and RPC tests completed; all fixtures rolled back.'
