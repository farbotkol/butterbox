begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(71);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('a4000000-0000-4000-8000-000000000001', 'invite-owner@example.test', now(), '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000002', 'invite-foh@example.test', now(), '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000003', 'invite-boh@example.test', now(), '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000004', 'invite-other-owner@example.test', now(), '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000005', 'Alice@example.test', now(), '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000006', 'bob@example.test', now(), '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000007', 'invite-employee@example.test', now(), '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000008', 'unverified@example.test', null, '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000009', 'outside@example.test', now(), '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000010', 'existing@example.test', now(), '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000011', 'inactive@example.test', now(), '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b4000000-0000-4000-8000-000000000001', 'Invitation cafe'),
  ('b4000000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'Main venue', 'UTC'),
  ('c4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001', 'Other venue', 'UTC'),
  ('c4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000002', 'Outside venue', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'Front of House'),
  ('d4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'Back of House'),
  ('d4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002', 'Other venue FOH'),
  ('d4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000003', 'Outside FOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'foh_manager',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'boh_manager',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002'),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000007', 'employee',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000010', 'general_manager',
    'c4000000-0000-4000-8000-000000000001', null),
  ('b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000004', 'owner', null, null),
  ('b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000009', 'employee',
    'c4000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000004');
insert into public.employees (id, business_id, venue_id, department_id, name, role_title, active) values
  ('e4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'Alice', 'Server', true),
  ('e4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'Bob', 'Cook', true),
  ('e4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'Duplicate', 'Server', true),
  ('e4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'Outside', 'Server', true),
  ('e4000000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'Unverified', 'Server', true),
  ('e4000000-0000-4000-8000-000000000006', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000003', 'Other venue', 'Server', true),
  ('e4000000-0000-4000-8000-000000000007', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'Existing', 'Manager', true),
  ('e4000000-0000-4000-8000-000000000008', 'b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'Archived', 'Server', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.create_staff_invitation('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001', 'invalid')$$,
  'P0001', 'Invalid invitation email', 'invalid email is rejected');
select extensions.throws_ok(
  $$select public.create_staff_invitation('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001', 'alice@example.test')$$,
  'P0001', 'Department is unavailable', 'a mismatched venue is rejected');
select extensions.throws_ok(
  $$select public.create_staff_invitation('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000008', 'archived@example.test')$$,
  'P0001', 'Employee is unavailable for invitation', 'archived staff cannot be invited');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.create_staff_invitation('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002',
    'e4000000-0000-4000-8000-000000000002', 'bob@example.test')$$,
  'P0001', 'Permission denied', 'a FOH manager cannot invite BOH staff');
select extensions.throws_ok(
  $$select public.create_staff_invitation('b4000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000004',
    'e4000000-0000-4000-8000-000000000001', 'alice@example.test')$$,
  'P0001', 'Permission denied', 'another business cannot be targeted');
select extensions.lives_ok(
  $$select set_config('test.alice', public.create_staff_invitation(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001',
    ' Alice@Example.Test ')::text, true)$$,
  'a scoped manager can invite an unlinked employee');
select extensions.is(
  (select email from public.staff_invitations where id = current_setting('test.alice')::uuid),
  'alice@example.test', 'invitation email is normalized');
select extensions.ok(
  (select expires_at between created_at + interval '7 days' - interval '1 second'
    and created_at + interval '7 days' + interval '1 second'
    from public.staff_invitations where id = current_setting('test.alice')::uuid),
  'the invitation expires after seven days');
select extensions.is(
  (select actor_id from public.staff_invitation_events
    where invitation_id = current_setting('test.alice')::uuid and event = 'created'),
  'a4000000-0000-4000-8000-000000000002'::uuid, 'creation records the actual actor');
select extensions.throws_ok(
  $$select public.create_staff_invitation('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001', 'another@example.test')$$,
  'P0001', 'An active invitation already exists', 'a second pending invitation for the employee is rejected');
select extensions.throws_ok(
  $$select public.create_staff_invitation('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000003', 'alice@example.test')$$,
  'P0001', 'An active invitation already exists', 'a second pending invitation for the email is rejected');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
select extensions.lives_ok(
  $$select set_config('test.bob', public.create_staff_invitation(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000002',
    'bob@example.test')::text, true)$$,
  'a BOH manager can invite BOH staff');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.staff_invitations where id = current_setting('test.bob')::uuid),
  0, 'a FOH manager cannot view BOH invitations');
select extensions.is(
  (select count(*)::integer from public.staff_invitation_events where invitation_id = current_setting('test.bob')::uuid),
  0, 'a FOH manager cannot view BOH invitation events');
select extensions.is(
  (select count(*)::integer from public.list_pending_staff_invitations(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  1, 'the pending list applies manager department scope');
select extensions.throws_ok(
  $$select public.revoke_staff_invitation(current_setting('test.bob')::uuid)$$,
  'P0001', 'Permission denied', 'a FOH manager cannot revoke a BOH invitation');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000007', true);
select extensions.throws_ok(
  $$select public.create_staff_invitation('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000003', 'staff@example.test')$$,
  'P0001', 'Permission denied', 'ordinary employees cannot invite staff');
select extensions.is((select count(*)::integer from public.staff_invitations), 0,
  'ordinary employees cannot list invitations');
select extensions.throws_ok(
  $$update public.staff_invitations set status = 'revoked'$$,
  '42501', 'permission denied for table staff_invitations', 'ordinary users cannot update invitation records');
select extensions.is(
  (select count(*)::integer from public.get_staff_invitation(current_setting('test.alice')::uuid)),
  0, 'a different email cannot preview an invitation');
select extensions.throws_ok(
  $$select public.accept_staff_invitation(current_setting('test.alice')::uuid)$$,
  'P0001', 'Invitation is unavailable', 'a different email cannot accept an invitation');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000005', true);
select extensions.is(
  (select business_name || ' / ' || venue_name || ' / ' || department_name || ' / ' || employee_name
    from public.get_staff_invitation(current_setting('test.alice')::uuid)),
  'Invitation cafe / Main venue / Front of House / Alice', 'the intended verified recipient can preview the scope');
select extensions.is(
  public.accept_staff_invitation(current_setting('test.alice')::uuid),
  'b4000000-0000-4000-8000-000000000001'::uuid, 'the intended recipient accepts the invitation');
select extensions.is(
  (select role || ' / ' || venue_id::text || ' / ' || department_id::text from public.business_memberships
    where user_id = auth.uid()),
  'employee / c4000000-0000-4000-8000-000000000001 / d4000000-0000-4000-8000-000000000001',
  'acceptance creates only the intended employee scope');
select extensions.is(
  (select count(*)::integer from public.business_memberships where user_id = auth.uid()),
  1, 'acceptance creates only one business membership');
select extensions.throws_ok(
  $$select public.accept_staff_invitation(current_setting('test.alice')::uuid)$$,
  'P0001', 'Invitation is unavailable', 'an accepted invitation cannot be reused');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select extensions.is(
  (select auth_user_id from public.employees where id = 'e4000000-0000-4000-8000-000000000001'),
  'a4000000-0000-4000-8000-000000000005'::uuid, 'acceptance links the intended employee profile');
select extensions.is(
  (select status from public.staff_invitations where id = current_setting('test.alice')::uuid),
  'accepted', 'acceptance is recorded');
select extensions.is(
  (select actor_id from public.staff_invitation_events
    where invitation_id = current_setting('test.alice')::uuid and event = 'accepted'),
  'a4000000-0000-4000-8000-000000000005'::uuid, 'the acceptance audit identifies the recipient');
select extensions.throws_ok(
  $$select public.revoke_staff_invitation(current_setting('test.alice')::uuid)$$,
  'P0001', 'Invitation can no longer be revoked', 'accepted invitations cannot be revoked');
select extensions.throws_ok(
  $$select public.create_staff_invitation('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001', 'alice@example.test')$$,
  'P0001', 'Employee is unavailable for invitation', 'an already linked employee cannot be invited again');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
select extensions.lives_ok(
  $$select public.revoke_staff_invitation(current_setting('test.bob')::uuid)$$,
  'the scoped manager can revoke an invitation');
select extensions.lives_ok(
  $$select public.revoke_staff_invitation(current_setting('test.bob')::uuid)$$,
  'repeated revocation is harmless');
select extensions.is(
  (select count(*)::integer from public.staff_invitation_events
    where invitation_id = current_setting('test.bob')::uuid and event = 'revoked'),
  1, 'repeated revocation creates only one audit event');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000006', true);
select extensions.is(
  (select status from public.get_staff_invitation(current_setting('test.bob')::uuid)),
  'revoked', 'the recipient can see that the invitation was revoked');
select extensions.throws_ok(
  $$select public.accept_staff_invitation(current_setting('test.bob')::uuid)$$,
  'P0001', 'Invitation is unavailable or expired', 'a revoked invitation cannot be accepted');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
select extensions.lives_ok(
  $$select set_config('test.bob_expired', public.create_staff_invitation(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000002',
    'bob@example.test')::text, true)$$,
  'a revoked invitation can be replaced');
reset role;
update public.staff_invitations set
  created_at = clock_timestamp() - interval '8 days',
  expires_at = clock_timestamp() - interval '1 minute'
where id = current_setting('test.bob_expired')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000006', true);
select extensions.is(
  (select status from public.get_staff_invitation(current_setting('test.bob_expired')::uuid)),
  'expired', 'an elapsed invitation is shown as expired');
select extensions.throws_ok(
  $$select public.accept_staff_invitation(current_setting('test.bob_expired')::uuid)$$,
  'P0001', 'Invitation is unavailable or expired', 'an expired invitation cannot be accepted');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
select extensions.is(
  (select status from public.list_pending_staff_invitations(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')
    where id = current_setting('test.bob_expired')::uuid),
  'expired', 'the manager list computes expiration using database time');
select extensions.lives_ok(
  $$select public.create_staff_invitation(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000002',
    'bob@example.test')$$,
  'an expired invitation can be replaced');
select extensions.is(
  (select status from public.staff_invitations where id = current_setting('test.bob_expired')::uuid),
  'expired', 'replacing an expired invitation records its final state');
select extensions.is(
  (select count(*)::integer from public.staff_invitation_events
    where invitation_id = current_setting('test.bob_expired')::uuid and event = 'expired'),
  1, 'expiry is recorded in invitation history');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select set_config('test.outside', public.create_staff_invitation(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000004',
    'outside@example.test')::text, true)$$,
  'an invitation can be issued to an existing account');
select extensions.lives_ok(
  $$select set_config('test.unverified', public.create_staff_invitation(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000005',
    'unverified@example.test')::text, true)$$,
  'an invitation can be issued before email confirmation');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000008', true);
select extensions.is(
  (select count(*)::integer from public.get_staff_invitation(current_setting('test.unverified')::uuid)),
  0, 'an unverified address cannot preview the invitation');
select extensions.throws_ok(
  $$select public.accept_staff_invitation(current_setting('test.unverified')::uuid)$$,
  'P0001', 'Invitation is unavailable', 'an unverified address cannot accept the invitation');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000009', true);
select extensions.is(
  public.accept_staff_invitation(current_setting('test.outside')::uuid),
  'b4000000-0000-4000-8000-000000000001'::uuid,
  'an existing member of another business can accept a scoped invitation');
select extensions.is(
  (select count(*)::integer from public.business_memberships where user_id = auth.uid()),
  2, 'cross-business acceptance adds exactly one membership');
select extensions.is(
  (select count(*)::integer from public.business_memberships
    where user_id = auth.uid() and business_id = 'b4000000-0000-4000-8000-000000000001'
      and role = 'employee' and venue_id = 'c4000000-0000-4000-8000-000000000001'
      and department_id = 'd4000000-0000-4000-8000-000000000001'),
  1, 'the new membership is an employee scoped to the invited venue and department');
select extensions.is(
  (select count(*)::integer from public.business_memberships
    where user_id = auth.uid() and business_id = 'b4000000-0000-4000-8000-000000000002'
      and role = 'employee' and venue_id = 'c4000000-0000-4000-8000-000000000003'
      and department_id = 'd4000000-0000-4000-8000-000000000004'),
  1, 'the existing other-business membership keeps its role and scope');
select extensions.is(
  (select count(*)::integer from public.employees
    where id = 'e4000000-0000-4000-8000-000000000004' and auth_user_id = auth.uid()),
  1, 'the cross-business account is linked only to the invited employee profile');
select extensions.ok(
  public.can_view_department('b4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001')
  and not public.can_view_department('b4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000002'),
  'the cross-business account gains only the invited department');
select extensions.throws_ok(
  $$select public.accept_staff_invitation(current_setting('test.outside')::uuid)$$,
  'P0001', 'Invitation is unavailable', 'a consumed cross-business invitation cannot be reused');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select set_config('test.existing', public.create_staff_invitation(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000007',
    'existing@example.test')::text, true)$$,
  'an existing member can be invited to a permitted employee profile');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000010', true);
select extensions.is(
  public.accept_staff_invitation(current_setting('test.existing')::uuid),
  'b4000000-0000-4000-8000-000000000001'::uuid, 'the existing scoped member can accept');
select extensions.is(
  (select role from public.business_memberships where user_id = auth.uid()),
  'general_manager', 'acceptance does not replace an existing role');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select extensions.is(
  (select auth_user_id from public.employees where id = 'e4000000-0000-4000-8000-000000000007'),
  'a4000000-0000-4000-8000-000000000010'::uuid, 'the existing member is linked to the employee profile');
select extensions.lives_ok(
  $$select set_config('test.other_venue', public.create_staff_invitation(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002',
    'd4000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-000000000006',
    'alice@example.test')::text, true)$$,
  'a separate venue profile can be invited');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select public.accept_staff_invitation(current_setting('test.other_venue')::uuid)$$,
  'P0001', 'Your existing membership cannot access this department',
  'an existing scoped membership is not silently broadened to another venue');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select extensions.is(
  (select auth_user_id from public.employees where id = 'e4000000-0000-4000-8000-000000000006'),
  null::uuid, 'a rejected scope change does not link the other venue profile');
select extensions.lives_ok(
  $$select set_config('test.inactive', public.create_staff_invitation(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000003',
    'inactive@example.test')::text, true)$$,
  'an invitation can be issued to an active profile');
reset role;
update public.employees set active = false where id = 'e4000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000011', true);
select extensions.throws_ok(
  $$select public.accept_staff_invitation(current_setting('test.inactive')::uuid)$$,
  'P0001', 'Invitation is unavailable', 'an archived employee profile cannot be accepted');
select extensions.is(
  (select count(*)::integer from public.business_memberships where user_id = auth.uid()),
  0, 'archiving before acceptance creates no membership');

reset role;
update auth.users set email = 'alice-former@example.test'
where id = 'a4000000-0000-4000-8000-000000000005';
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('a4000000-0000-4000-8000-000000000012', 'alice@example.test', now(), '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000012', true);
select extensions.is(
  (select count(*)::integer from public.get_staff_invitation(current_setting('test.alice')::uuid)),
  0, 'a recycled email cannot view an accepted invitation belonging to a different account');
select extensions.throws_ok(
  $$select public.accept_staff_invitation(current_setting('test.alice')::uuid)$$,
  'P0001', 'Invitation is unavailable', 'a recycled email cannot reuse an accepted invitation');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::integer from public.staff_invitations), 0,
  'an outside owner cannot list another business invitations');
select extensions.throws_ok(
  $$select public.revoke_staff_invitation(current_setting('test.alice')::uuid)$$,
  'P0001', 'Permission denied', 'an outside owner cannot revoke another business invitation');
reset role;
set local role service_role;
select extensions.throws_ok(
  $$update public.staff_invitation_events set event = 'created'$$,
  '42501', 'permission denied for table staff_invitation_events', 'the service role cannot alter invitation history');
reset role;
select extensions.throws_ok(
  $$update public.staff_invitation_events set event = 'created'
    where invitation_id = current_setting('test.alice')::uuid$$,
  'P0001', 'Invitation events are immutable', 'even privileged direct updates cannot rewrite invitation history');
select extensions.throws_ok(
  $$delete from public.staff_invitation_events
    where invitation_id = current_setting('test.alice')::uuid$$,
  'P0001', 'Invitation events are immutable', 'even privileged direct deletion cannot erase invitation history');
select * from extensions.finish();
rollback;
