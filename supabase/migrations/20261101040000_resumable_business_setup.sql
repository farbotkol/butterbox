alter table public.venues
  add column address text
  check (address is null or length(trim(address)) between 1 and 200);

create table public.business_setup_drafts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  business_name text not null default '' check (length(business_name) <= 100),
  venue_name text not null default '' check (length(venue_name) <= 100),
  venue_address text not null default '' check (length(venue_address) <= 200),
  timezone text not null default 'Australia/Sydney' check (length(timezone) <= 64),
  include_sample_data boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger business_setup_drafts_updated_at
  before update on public.business_setup_drafts
  for each row execute function public.set_updated_at();

alter table public.business_setup_drafts enable row level security;

create policy "Users can view their setup draft"
  on public.business_setup_drafts for select to authenticated
  using (user_id = auth.uid());
create policy "Users can create their setup draft"
  on public.business_setup_drafts for insert to authenticated
  with check (user_id = auth.uid());
create policy "Users can update their setup draft"
  on public.business_setup_drafts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "Users can delete their setup draft"
  on public.business_setup_drafts for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.business_setup_drafts from anon, authenticated;
grant select, insert, update, delete on public.business_setup_drafts to authenticated;

create function public.complete_initial_setup(
  p_business_name text,
  p_venue_name text,
  p_venue_address text,
  p_timezone text,
  p_include_sample_data boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(p_venue_address, ''))) not between 1 and 200 then
    raise exception 'Venue address is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('initial-setup:' || auth.uid()::text, 0));
  if exists (select 1 from public.business_memberships where user_id = auth.uid()) then
    raise exception 'Workspace already exists';
  end if;

  v_business_id := public.create_business(
    p_business_name, p_venue_name, p_timezone, p_include_sample_data
  );
  update public.venues
    set address = trim(p_venue_address)
    where business_id = v_business_id;
  delete from public.business_setup_drafts where user_id = auth.uid();
  return v_business_id;
end;
$$;

revoke all on function public.complete_initial_setup(text, text, text, text, boolean)
  from public, anon;
grant execute on function public.complete_initial_setup(text, text, text, text, boolean)
  to authenticated;
