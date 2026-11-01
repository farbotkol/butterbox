create function public.prevent_business_id_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception using
      errcode = '23514',
      message = 'Business association is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_business_id_change() from public, anon, authenticated;

create trigger venues_business_id_immutable
  before update of business_id on public.venues
  for each row execute function public.prevent_business_id_change();
create trigger departments_business_id_immutable
  before update of business_id on public.departments
  for each row execute function public.prevent_business_id_change();
create trigger business_memberships_business_id_immutable
  before update of business_id on public.business_memberships
  for each row execute function public.prevent_business_id_change();
create trigger job_roles_business_id_immutable
  before update of business_id on public.job_roles
  for each row execute function public.prevent_business_id_change();
create trigger employees_business_id_immutable
  before update of business_id on public.employees
  for each row execute function public.prevent_business_id_change();
create trigger shifts_business_id_immutable
  before update of business_id on public.shifts
  for each row execute function public.prevent_business_id_change();
