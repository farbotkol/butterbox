alter table public.employee_employment_metadata_events
  add column employee_profile_id uuid,
  drop constraint employee_employment_metadata__employee_id_business_id_venu_fkey;

alter table public.employee_employment_metadata_events
  add constraint employee_employment_metadata_profile_identity_check
    check (employee_profile_id is null or employee_profile_id = employee_id),
  add constraint employee_employment_metadata_profile_fkey
    foreign key (employee_profile_id, business_id, venue_id, department_id)
    references public.employees(id, business_id, venue_id, department_id)
    on delete set null (employee_profile_id);

create function public.bind_employment_metadata_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.employee_profile_id := new.employee_id;
  return new;
end;
$$;
revoke all on function public.bind_employment_metadata_profile()
  from public, anon, authenticated, service_role;
create trigger employee_employment_metadata_bind_profile
  before insert on public.employee_employment_metadata_events
  for each row execute function public.bind_employment_metadata_profile();

create or replace function public.prevent_employment_metadata_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.businesses b where b.id = old.business_id
  ) then
    return old;
  end if;
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
    and old.employee_profile_id is not null and new.employee_profile_id is null
    and (to_jsonb(new) - 'employee_profile_id') = (to_jsonb(old) - 'employee_profile_id')
    and not exists (select 1 from public.employees e where e.id = old.employee_profile_id) then
    return new;
  end if;
  raise exception 'Employment metadata history is immutable';
end;
$$;
