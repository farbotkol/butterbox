begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(5);

set local role anon;
select extensions.is(public.check_application_readiness(), true, 'anonymous readiness verifies a live database query');
reset role;
set local role authenticated;
select extensions.is(public.check_application_readiness(), true, 'authenticated readiness needs no tenant or user data');
reset role;
select extensions.ok(not (select prosecdef from pg_proc
  where oid = 'public.check_application_readiness()'::regprocedure), 'readiness does not elevate privileges');
select extensions.is((select count(*)::integer from information_schema.parameters
  where specific_schema = 'public' and specific_name = (
    select specific_name from information_schema.routines
    where routine_schema = 'public' and routine_name = 'check_application_readiness'
  )), 0, 'readiness accepts no user-supplied query or identifiers');
select extensions.ok(not has_table_privilege('anon', 'public.sensitive_action_audit', 'SELECT'),
  'readiness does not grant anonymous access to sensitive tables');

select * from extensions.finish();
rollback;
