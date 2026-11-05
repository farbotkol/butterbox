begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a8100000-0000-4000-8000-000000000001', 'conversation-owner@example.test', '{}'::jsonb),
  ('a8100000-0000-4000-8000-000000000002', 'conversation-foh@example.test', '{}'::jsonb),
  ('a8100000-0000-4000-8000-000000000003', 'conversation-first@example.test', '{}'::jsonb),
  ('a8100000-0000-4000-8000-000000000004', 'conversation-second@example.test', '{}'::jsonb),
  ('a8100000-0000-4000-8000-000000000005', 'conversation-boh@example.test', '{}'::jsonb),
  ('a8100000-0000-4000-8000-000000000006', 'conversation-outside@example.test', '{}'::jsonb),
  ('a8100000-0000-4000-8000-000000000007', 'conversation-relinked@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b8100000-0000-4000-8000-000000000001', 'Conversation cafe'),
  ('b8100000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c8100000-0000-4000-8000-000000000001', 'b8100000-0000-4000-8000-000000000001', 'Cafe', 'Australia/Sydney'),
  ('c8100000-0000-4000-8000-000000000002', 'b8100000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d8100000-0000-4000-8000-000000000001', 'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001', 'FOH'),
  ('d8100000-0000-4000-8000-000000000002', 'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001', 'BOH'),
  ('d8100000-0000-4000-8000-000000000003', 'b8100000-0000-4000-8000-000000000002', 'c8100000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b8100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b8100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000002', 'foh_manager', 'c8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001'),
  ('b8100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000003', 'employee', 'c8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001'),
  ('b8100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000004', 'employee', 'c8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001'),
  ('b8100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000005', 'boh_manager', 'c8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000002'),
  ('b8100000-0000-4000-8000-000000000002', 'a8100000-0000-4000-8000-000000000006', 'owner', null, null),
  ('b8100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000007', 'employee', 'c8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e8100000-0000-4000-8000-000000000001', 'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000003', 'First worker', 'Server'),
  ('e8100000-0000-4000-8000-000000000002', 'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000004', 'Second worker', 'Server');
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published
) values (
  'f8100000-0000-4000-8000-000000000001', 'b8100000-0000-4000-8000-000000000001',
  'c8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001',
  'e8100000-0000-4000-8000-000000000001', 'Server', now() + interval '7 days',
  now() + interval '7 days 4 hours', true
), (
  'f8100000-0000-4000-8000-000000000002', 'b8100000-0000-4000-8000-000000000001',
  'c8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001',
  'e8100000-0000-4000-8000-000000000001', 'Server', now() + interval '9 days',
  now() + interval '9 days 4 hours', false
);
select set_config('test.shift_revision',
  (select updated_at::text from public.shifts where id = 'f8100000-0000-4000-8000-000000000001'), true);

set local role anon;
select extensions.throws_ok($$select * from public.shift_conversations$$, '42501', null, 'anonymous cannot read conversation tables');
select extensions.throws_ok($$select * from public.list_shift_conversations(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous cannot list conversation metadata');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000002', true);
select extensions.is((select employee_name from public.open_shift_conversation(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', null)), 'First worker', 'FOH manager opens the assigned published shift');
select extensions.throws_ok($$select * from public.open_shift_conversation(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000002', null)$$,
  'P0001', 'Conversation unavailable or permission denied', 'draft shift is not available');
select extensions.throws_ok($$select * from public.shift_conversation_messages$$,
  '42501', null, 'authenticated cannot read message table directly');
select extensions.throws_ok($$insert into public.shift_conversation_messages
  (business_id, conversation_id, sender_id, sender_kind, request_id, body)
  values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'manager', gen_random_uuid(), 'forged')$$,
  '42501', null, 'authenticated cannot forge message rows');
select extensions.throws_ok($$select public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.shift_revision')::timestamptz,
  E' \n\t ', '18100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Invalid shift message', 'blank message rejected');
select extensions.throws_ok($$select public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.shift_revision')::timestamptz,
  repeat('x', 2001), '18100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Invalid shift message', 'oversized message rejected');
select extensions.throws_ok($$select public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', '2000-01-01'::timestamptz,
  'Stale', '18100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Shift or participant changed; reload the conversation', 'stale shift snapshot rejected');
select set_config('test.first_thread', public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.shift_revision')::timestamptz,
  ' Private first message <script>example</script> ', '18100000-0000-4000-8000-000000000001',
  'd8100000-0000-4000-8000-000000000001')::text, true);
select extensions.is(public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.shift_revision')::timestamptz,
  'Private first message <script>example</script>', '18100000-0000-4000-8000-000000000001',
  'd8100000-0000-4000-8000-000000000001'),
  current_setting('test.first_thread')::uuid, 'identical retry returns the original thread');
select extensions.throws_ok($$select public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.shift_revision')::timestamptz,
  'Changed retry', '18100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Request identifier already used', 'changed retry cannot create a duplicate');
select extensions.is((select message_count from public.list_shift_conversations(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001')),
  1::bigint, 'one message after idempotent retry');

select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000003', true);
select extensions.is((select body from public.list_shift_conversation_messages(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  current_setting('test.first_thread')::uuid)), 'Private first message <script>example</script>',
  'assigned employee reads the plain-text message');
select extensions.is(public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.shift_revision')::timestamptz,
  'Employee reply', '18100000-0000-4000-8000-000000000002', 'd8100000-0000-4000-8000-000000000001'),
  current_setting('test.first_thread')::uuid, 'assigned employee can reply');
select extensions.results_eq(
  $$select sender_kind, body, is_mine from public.list_shift_conversation_messages(
    'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
    current_setting('test.first_thread')::uuid)$$,
  $$values ('manager'::text, 'Private first message <script>example</script>'::text, false),
    ('employee'::text, 'Employee reply'::text, true)$$,
  'messages are deterministically ordered and attributed');

select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*) from public.list_shift_conversations(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001')),
  0::bigint, 'another employee in the same department cannot list the thread');
select extensions.throws_ok($$select * from public.list_shift_conversation_messages(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  current_setting('test.first_thread')::uuid)$$,
  'P0001', 'Conversation unavailable or permission denied', 'another employee cannot read message body');
select extensions.throws_ok($$select * from public.open_shift_conversation(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Conversation unavailable or permission denied', 'another employee cannot open the shift');
select extensions.throws_ok($$select public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.shift_revision')::timestamptz,
  'Intrusion', '18100000-0000-4000-8000-000000000003', 'd8100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Conversation unavailable or permission denied', 'another employee cannot send');
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*) from public.list_shift_conversations(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001')),
  0::bigint, 'BOH manager cannot list FOH conversations');
select extensions.throws_ok($$select * from public.open_shift_conversation(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  null, current_setting('test.first_thread')::uuid)$$,
  'P0001', 'Conversation unavailable or permission denied', 'BOH manager cannot open FOH history');
select extensions.throws_ok($$select public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.shift_revision')::timestamptz,
  'Wrong department', '18100000-0000-4000-8000-000000000006', 'd8100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Conversation unavailable or permission denied', 'BOH manager cannot send to FOH');
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000006', true);
select extensions.throws_ok($$select * from public.list_shift_conversations(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'outside-business owner cannot list conversations');
select extensions.throws_ok($$select * from public.list_shift_conversation_messages(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  current_setting('test.first_thread')::uuid)$$,
  'P0001', 'Conversation unavailable or permission denied', 'outside-business owner cannot read messages');

reset role;
update public.shifts set employee_id = 'e8100000-0000-4000-8000-000000000002'
where id = 'f8100000-0000-4000-8000-000000000001';
select set_config('test.new_revision',
  (select updated_at::text from public.shifts where id = 'f8100000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000003', true);
select extensions.is((select can_reply from public.open_shift_conversation(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  null, current_setting('test.first_thread')::uuid)), false, 'former participant retains read-only history');
select extensions.throws_ok($$select public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.shift_revision')::timestamptz,
  'Late message', '18100000-0000-4000-8000-000000000004', 'd8100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Shift or participant changed; reload the conversation', 'reassignment rejects an in-flight stale reply');
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*) from public.list_shift_conversations(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001')),
  0::bigint, 'replacement cannot see the previous participant thread');
select extensions.throws_ok($$select * from public.open_shift_conversation(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  null, current_setting('test.first_thread')::uuid)$$,
  'P0001', 'Conversation unavailable or permission denied', 'replacement cannot open prior history');
select set_config('test.second_thread', public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000002',
  'a8100000-0000-4000-8000-000000000004', current_setting('test.new_revision')::timestamptz,
  'Replacement conversation', '18100000-0000-4000-8000-000000000005',
  'd8100000-0000-4000-8000-000000000001')::text, true);
select extensions.isnt(current_setting('test.second_thread'), current_setting('test.first_thread'),
  'replacement has a distinct thread');
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select * from public.list_shift_conversation_messages(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  current_setting('test.second_thread')::uuid)$$,
  'P0001', 'Conversation unavailable or permission denied', 'former participant cannot read replacement thread');
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*) from public.list_shift_conversations(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001')),
  2::bigint, 'owner can audit both scoped participant threads');

reset role;
select extensions.throws_ok($$delete from public.shift_conversation_messages
  where conversation_id = current_setting('test.first_thread')::uuid$$,
  'P0001', 'Shift conversation history is immutable', 'message history cannot be deleted');
select extensions.throws_ok($$update public.shift_conversation_messages set body = 'Altered'
  where conversation_id = current_setting('test.first_thread')::uuid$$,
  'P0001', 'Shift conversation history is immutable', 'message history cannot be edited');
select extensions.throws_ok($$truncate public.shift_conversation_messages$$,
  'P0001', 'Shift conversation history is immutable', 'message history cannot be truncated');
select extensions.is((select count(*) from public.sensitive_action_audit
  where source_table = 'shift_conversation_messages' and business_id = 'b8100000-0000-4000-8000-000000000001'
    and (new_values::text like '%Private first message%' or new_values::text like '%Employee reply%')),
  0::bigint, 'audit metadata excludes private message bodies');
select extensions.is((select count(*) from public.shift_offer_notifications
  where business_id = 'b8100000-0000-4000-8000-000000000001'), 0::bigint, 'messages create no offer notification previews');
select extensions.is((select count(*) from public.shift_swap_notifications n
  join public.shift_swap_requests r on r.id = n.swap_id
  where r.business_id = 'b8100000-0000-4000-8000-000000000001'), 0::bigint, 'messages create no swap notification previews');

update public.employees set auth_user_id = 'a8100000-0000-4000-8000-000000000007'
where id = 'e8100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$select public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000002',
  'a8100000-0000-4000-8000-000000000004', current_setting('test.new_revision')::timestamptz,
  'Stale recipient', '18100000-0000-4000-8000-000000000007', 'd8100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Shift or participant changed; reload the conversation', 'relinking rejects a stale manager message');
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000007', true);
select extensions.throws_ok($$select * from public.list_shift_conversation_messages(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  current_setting('test.second_thread')::uuid)$$,
  'P0001', 'Conversation unavailable or permission denied', 'relinked account cannot inherit prior private history');
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000004', true);
select extensions.throws_ok($$select * from public.list_shift_conversation_messages(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  current_setting('test.second_thread')::uuid)$$,
  'P0001', 'Conversation unavailable or permission denied', 'unlinked account loses thread access');
reset role;
delete from public.business_memberships
where business_id = 'b8100000-0000-4000-8000-000000000001'
  and user_id = 'a8100000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000003', true);
select extensions.throws_ok($$select * from public.list_shift_conversation_messages(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  current_setting('test.first_thread')::uuid)$$,
  'P0001', 'Conversation unavailable or permission denied', 'revoked business membership loses message access');

reset role;
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values (
  'b8100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000003', 'employee',
  'c8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001'
);
insert into public.employee_departments (business_id, employee_id, department_id) values (
  'b8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'd8100000-0000-4000-8000-000000000002'
);
update public.shifts set employee_id = 'e8100000-0000-4000-8000-000000000001',
  department_id = 'd8100000-0000-4000-8000-000000000002'
where id = 'f8100000-0000-4000-8000-000000000001';
select set_config('test.moved_revision',
  (select updated_at::text from public.shifts where id = 'f8100000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000003', true);
select extensions.is((select can_reply from public.open_shift_conversation(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  null, current_setting('test.first_thread')::uuid)), false, 'previous-department history is read-only');
select extensions.throws_ok($$select public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.shift_revision')::timestamptz,
  'Old department reply', '18100000-0000-4000-8000-000000000009',
  'd8100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Shift or participant changed; reload the conversation', 'stale department is rejected even with the same revision');
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000005', true);
select extensions.is((select conversation_id from public.open_shift_conversation(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', null)), null::uuid, 'new department cannot inherit old thread');
select set_config('test.moved_thread', public.send_shift_conversation_message(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000003', current_setting('test.moved_revision')::timestamptz,
  'New department message', '18100000-0000-4000-8000-000000000008',
  'd8100000-0000-4000-8000-000000000002')::text, true);
select extensions.isnt(current_setting('test.moved_thread'), current_setting('test.first_thread'),
  'new department messages use a distinct thread');
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000002', true);
select extensions.throws_ok($$select * from public.list_shift_conversation_messages(
  'b8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  current_setting('test.moved_thread')::uuid)$$,
  'P0001', 'Conversation unavailable or permission denied', 'former-department manager cannot read new messages');

select * from extensions.finish();
rollback;
