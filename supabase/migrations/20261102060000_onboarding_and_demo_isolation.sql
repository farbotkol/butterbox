create table public.demo_seed_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into public.demo_seed_policy (singleton, enabled) values (true, false);
alter table public.demo_seed_policy enable row level security;
revoke all on public.demo_seed_policy from public, anon, authenticated, service_role;

create function public.demo_seed_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.enabled from public.demo_seed_policy p where p.singleton), false);
$$;
revoke all on function public.demo_seed_enabled() from public, anon;
grant execute on function public.demo_seed_enabled() to authenticated;

alter function public.handle_demo_seed(uuid, uuid, text) rename to handle_demo_seed_unchecked;
revoke all on function public.handle_demo_seed_unchecked(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function public.handle_demo_seed(
  p_business_id uuid, p_venue_id uuid, p_timezone text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean;
begin
  select p.enabled into v_enabled from public.demo_seed_policy p
  where p.singleton for share;
  if v_enabled is distinct from true then
    raise exception 'Sample data is not enabled in this environment';
  end if;
  perform public.handle_demo_seed_unchecked(p_business_id, p_venue_id, p_timezone);
end;
$$;
revoke all on function public.handle_demo_seed(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function public.get_onboarding_progress(p_business_id uuid)
returns table (
  business_ready boolean,
  venue_ready boolean,
  staff_ready boolean,
  shift_ready boolean,
  publication_ready boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Permission denied';
  end if;

  return query select
    exists (select 1 from public.businesses b where b.id = p_business_id),
    exists (select 1 from public.venues v where v.business_id = p_business_id),
    exists (select 1 from public.employees e where e.business_id = p_business_id and e.active),
    exists (select 1 from public.shifts s where s.business_id = p_business_id and s.status = 'scheduled'),
    exists (select 1 from public.roster_publications p where p.business_id = p_business_id);
end;
$$;
revoke all on function public.get_onboarding_progress(uuid) from public, anon;
grant execute on function public.get_onboarding_progress(uuid) to authenticated;
