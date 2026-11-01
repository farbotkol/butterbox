begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(19);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a2000000-0000-4000-8000-000000000001', 'setup-a@example.test', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000002', 'setup-b@example.test', '{}'::jsonb);

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select extensions.lives_ok(
  $$insert into public.business_setup_drafts (user_id, business_name, venue_name, venue_address, timezone, include_sample_data)
    values ('a2000000-0000-4000-8000-000000000001', 'Draft business', '', '', 'Australia/Perth', false)$$,
  'an authenticated user can save an incomplete setup draft');
select extensions.is(
  (select business_name from public.business_setup_drafts where user_id = auth.uid()),
  'Draft business', 'the saved draft can be resumed');
select extensions.lives_ok(
  $$update public.business_setup_drafts set venue_name = 'Draft venue' where user_id = auth.uid()$$,
  'a user can update their setup draft');

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.business_setup_drafts), 0,
  'another user cannot read the draft');
select extensions.throws_ok(
  $$insert into public.business_setup_drafts (user_id, business_name)
    values ('a2000000-0000-4000-8000-000000000001', 'Impersonated')$$,
  '42501', 'new row violates row-level security policy for table "business_setup_drafts"',
  'another user cannot create or replace the draft');
with updated as (
  update public.business_setup_drafts set business_name = 'Tampered' returning user_id
)
select extensions.is(
  (select count(*)::integer from updated), 0, 'another user cannot update the draft');
with deleted as (
  delete from public.business_setup_drafts returning user_id
)
select extensions.is(
  (select count(*)::integer from deleted), 0, 'another user cannot delete the draft');

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.complete_initial_setup('Cafe', 'First venue', ' ', 'Australia/Sydney', false)$$,
  'P0001', 'Venue address is required', 'a venue address is required');
select extensions.throws_ok(
  $$select public.complete_initial_setup('Cafe', 'First venue', '10 Test Street', 'Invalid/Timezone', false)$$,
  'P0001', 'Invalid timezone', 'an invalid timezone is rejected');
select extensions.is(
  (select count(*)::integer from public.business_setup_drafts), 1,
  'a failed setup leaves the draft available');
select extensions.is(
  (select count(*)::integer from public.business_memberships), 0,
  'a failed setup does not create an owner membership');

select extensions.ok(
  public.complete_initial_setup(' Cafe ', ' First venue ', ' 10 Test Street ', 'Australia/Perth', false) is not null,
  'valid setup creates a business');
select extensions.is(
  (select name from public.businesses), 'Cafe', 'business name is stored');
select extensions.is(
  (select address from public.venues), '10 Test Street', 'venue address is stored');
select extensions.is(
  (select timezone from public.venues), 'Australia/Perth', 'venue timezone is stored');
select extensions.is(
  (select role from public.business_memberships where user_id = auth.uid()), 'owner',
  'the creating user is the business owner');
select extensions.is(
  (select count(*)::integer from public.business_setup_drafts), 0,
  'completed setup removes the saved draft');
select extensions.throws_ok(
  $$select public.complete_initial_setup('Second', 'Venue', '11 Test Street', 'Australia/Sydney', false)$$,
  'P0001', 'Workspace already exists', 'a repeated initial setup is rejected');

reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.complete_initial_setup('Cafe', 'Venue', '10 Test Street', 'Australia/Sydney', false)$$,
  '42501', 'permission denied for function complete_initial_setup',
  'an anonymous user cannot create a workspace');

select * from extensions.finish();
rollback;
