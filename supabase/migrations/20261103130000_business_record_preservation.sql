create function public.prevent_business_record_deletion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Business deletion is disabled while record preservation requirements remain unresolved';
end;
$$;

revoke all on function public.prevent_business_record_deletion()
  from public, anon, authenticated, service_role;

create trigger businesses_prevent_delete
  before delete on public.businesses
  for each row execute function public.prevent_business_record_deletion();

create trigger businesses_prevent_truncate
  before truncate on public.businesses
  for each statement execute function public.prevent_business_record_deletion();
