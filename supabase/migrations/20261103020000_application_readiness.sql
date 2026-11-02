create function public.check_application_readiness()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select true;
$$;
revoke all on function public.check_application_readiness() from public, anon, authenticated, service_role;
grant execute on function public.check_application_readiness() to anon, authenticated;
