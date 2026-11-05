-- Serialize the transition with existing setup calls that lock the policy row.
insert into public.demo_seed_policy (singleton, enabled)
values (true, false)
on conflict (singleton) do update set enabled = false;

create function public.reject_unisolated_demo_seed_policy()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.enabled then
    raise exception 'Sample data is not enabled in this environment';
  end if;
  return new;
end;
$$;
revoke all on function public.reject_unisolated_demo_seed_policy()
  from public, anon, authenticated, service_role;

create trigger reject_unisolated_demo_seed_policy
before insert or update on public.demo_seed_policy
for each row execute function public.reject_unisolated_demo_seed_policy();

create or replace function public.demo_seed_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select false;
$$;

create or replace function public.handle_demo_seed(
  p_business_id uuid, p_venue_id uuid, p_timezone text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Sample data is not enabled in this environment';
end;
$$;

create or replace function public.handle_demo_seed_unchecked(
  p_business_id uuid, p_venue_id uuid, p_timezone text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Sample data is not enabled in this environment';
end;
$$;

alter table public.business_setup_drafts
  alter column include_sample_data set default false;
