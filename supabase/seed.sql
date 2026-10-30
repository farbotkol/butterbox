-- Deliberately no automatic tenant/auth inserts on db reset or hosted deploy.
-- Migrations install public.bootstrap_demo_business(), which an authenticated
-- caller explicitly invokes once. It creates 24 fictional employees, 168
-- draft shifts in the current Melbourne week, FOH/BOH, four roles and business
-- permission defaults. Repeated calls return the existing business unchanged.
-- SQL editor (trusted administrator) equivalent for an EXISTING signed-up user:
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claim.sub', 'REAL-AUTH-USER-UUID', true);
-- select public.bootstrap_demo_business();
-- commit;
do $$ begin
  raise notice 'Demo is opt-in: sign in, then call bootstrap_demo_business() without parameters.';
end $$;
