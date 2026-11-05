begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7400000-0000-4000-8000-000000000001', 'notice-owner@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000002', 'notice-manager@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000003', 'notice-employee@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000004', 'notice-boh@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000005', 'notice-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7400000-0000-4000-8000-000000000001', 'Notice cafe'),
  ('b7400000-0000-4000-8000-000000000002', 'Outside notice cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c7400000-0000-4000-8000-000000000001', 'b7400000-0000-4000-8000-000000000001', 'Notice venue', 'Australia/Sydney'),
  ('c7400000-0000-4000-8000-000000000002', 'b7400000-0000-4000-8000-000000000002', 'Outside venue', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7400000-0000-4000-8000-000000000001', 'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', 'FOH'),
  ('d7400000-0000-4000-8000-000000000002', 'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', 'BOH'),
  ('d7400000-0000-4000-8000-000000000003', 'b7400000-0000-4000-8000-000000000002', 'c7400000-0000-4000-8000-000000000002', 'Outside'),
  ('d7400000-0000-4000-8000-000000000004', 'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', 'Empty');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'foh_manager', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001'),
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000003', 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001'),
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000004', 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000002'),
  ('b7400000-0000-4000-8000-000000000002', 'a7400000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7400000-0000-4000-8000-000000000001', 'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000003', 'Notice worker', 'Server'),
  ('e7400000-0000-4000-8000-000000000002', 'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000002', 'a7400000-0000-4000-8000-000000000004', 'Kitchen worker', 'Cook'),
  ('e7400000-0000-4000-8000-000000000003', 'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', null, 'Unlinked worker', 'Server');

set local role anon;
select extensions.throws_ok($$select * from public.announcements$$, '42501', null, 'anonymous cannot read notices');
select extensions.throws_ok($$select public.list_my_announcements('b7400000-0000-4000-8000-000000000001')$$, '42501', null, 'anonymous cannot list notices');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000002', true);
select extensions.ok(public.can_publish_announcement('b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001'), 'FOH can publish own department');
select extensions.ok(not public.can_publish_announcement('b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', null), 'FOH cannot publish whole venue');
select extensions.ok(not public.can_publish_announcement('b7400000-0000-4000-8000-000000000001', null, null), 'FOH cannot publish whole business');
select extensions.ok(not public.can_publish_announcement('b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000002'), 'FOH cannot publish BOH');
select extensions.ok(not public.can_publish_announcement('b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000002', 'd7400000-0000-4000-8000-000000000001'), 'mismatched venue fails closed');
select set_config('test.notice', public.publish_announcement(
  'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
  'd7400000-0000-4000-8000-000000000001', ' Team briefing ', ' Plain text only <script>test</script> ',
  true, '17400000-0000-4000-8000-000000000001')::text, true);
select extensions.is((select recipient_count from public.list_published_announcements('b7400000-0000-4000-8000-000000000001')), 1::bigint, 'only linked active authorized recipient snapshotted');
select extensions.is(public.publish_announcement(
  'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
  'd7400000-0000-4000-8000-000000000001', 'Team briefing', 'Plain text only <script>test</script>',
  true, '17400000-0000-4000-8000-000000000001'), current_setting('test.notice')::uuid, 'identical retry returns same publication');
select extensions.throws_ok($$select public.publish_announcement(
  'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
  'd7400000-0000-4000-8000-000000000001', 'Changed', 'Different body', true,
  '17400000-0000-4000-8000-000000000001')$$, 'P0001', 'Request identifier already used', 'changed retry denied');
select extensions.throws_ok($$select public.publish_announcement(
  'b7400000-0000-4000-8000-000000000001', null, null, 'Unscoped', 'Body', false,
  gen_random_uuid())$$, 'P0001', 'Permission denied', 'unscoped manager request denied by RPC');
select extensions.throws_ok($$select public.publish_announcement(
  'b7400000-0000-4000-8000-000000000001', null, null, ' ', 'Body', false,
  gen_random_uuid())$$, 'P0001', 'Invalid announcement', 'blank title rejected');
select extensions.throws_ok($$select * from public.announcement_recipients$$, '42501', null, 'authenticated cannot bypass receipt API');
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000001', true);
select set_config('test.venue_notice', public.publish_announcement(
  'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
  null, 'Venue briefing', 'Venue body', true, '17400000-0000-4000-8000-000000000002')::text, true);
select set_config('test.optional', public.publish_announcement(
  'b7400000-0000-4000-8000-000000000001', null, null, 'Business news', 'Optional body',
  false, '17400000-0000-4000-8000-000000000003')::text, true);
select extensions.is((select recipient_count from public.list_published_announcements('b7400000-0000-4000-8000-000000000001') where announcement_id = current_setting('test.venue_notice')::uuid), 2::bigint, 'owner venue audience includes both departments');
select extensions.throws_ok($$select public.publish_announcement(
  'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
  'd7400000-0000-4000-8000-000000000004', 'Empty', 'No recipients', false,
  gen_random_uuid())$$, 'P0001', 'No linked active recipients in this audience', 'empty publication rolled back explicitly');
select extensions.is((select count(*) from public.sensitive_action_audit where business_id = 'b7400000-0000-4000-8000-000000000001' and source_table = 'announcements'), 3::bigint, 'exactly three immutable publications audited');

select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.list_my_announcements('b7400000-0000-4000-8000-000000000001')), 3::bigint, 'employee views own notice history');
select set_config('test.recipient', (select recipient_id::text from public.list_my_announcements('b7400000-0000-4000-8000-000000000001') where announcement_id = current_setting('test.notice')::uuid), true);
select extensions.is(public.acknowledge_announcement('b7400000-0000-4000-8000-000000000001', current_setting('test.recipient')::uuid), current_setting('test.notice')::uuid, 'employee explicitly acknowledges required notice');
select set_config('test.ack', (select acknowledged_at::text from public.list_my_announcements('b7400000-0000-4000-8000-000000000001') where recipient_id = current_setting('test.recipient')::uuid), true);
select extensions.lives_ok($$select public.acknowledge_announcement('b7400000-0000-4000-8000-000000000001', current_setting('test.recipient')::uuid)$$, 'repeated acknowledgement is idempotent');
select extensions.is((select acknowledged_at::text from public.list_my_announcements('b7400000-0000-4000-8000-000000000001') where recipient_id = current_setting('test.recipient')::uuid), current_setting('test.ack'), 'original acknowledgement time retained');
select extensions.throws_ok($$select public.acknowledge_announcement('b7400000-0000-4000-8000-000000000001',
  (select recipient_id from public.list_my_announcements('b7400000-0000-4000-8000-000000000001') where announcement_id = current_setting('test.optional')::uuid))$$, 'P0001', 'Permission denied', 'optional notices are not misrepresented as acknowledged');
select extensions.is((select count(*) from public.list_published_announcements('b7400000-0000-4000-8000-000000000001')), 0::bigint, 'employee cannot view manager publication tracking');
select extensions.throws_ok($$select * from public.list_announcement_receipts('b7400000-0000-4000-8000-000000000001', current_setting('test.notice')::uuid)$$, 'P0001', 'Permission denied', 'employee cannot enumerate recipients');
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*) from public.list_my_announcements('b7400000-0000-4000-8000-000000000001')), 2::bigint, 'BOH employee does not see FOH notice');
select extensions.throws_ok($$select public.acknowledge_announcement('b7400000-0000-4000-8000-000000000001', current_setting('test.recipient')::uuid)$$, 'P0001', 'Permission denied', 'cannot acknowledge another worker receipt');
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000005', true);
select extensions.throws_ok($$select * from public.list_my_announcements('b7400000-0000-4000-8000-000000000001')$$, 'P0001', 'Permission denied', 'outside tenant cannot list history');
select extensions.throws_ok($$select * from public.list_announcement_receipts('b7400000-0000-4000-8000-000000000001', current_setting('test.notice')::uuid)$$, 'P0001', 'Permission denied', 'outside tenant cannot enumerate recipients');
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000002', true);
select extensions.is((select acknowledged_count from public.list_published_announcements('b7400000-0000-4000-8000-000000000001')), 1::bigint, 'manager sees required acknowledgement progress in own scope only');
select extensions.is((select employee_name from public.list_announcement_receipts('b7400000-0000-4000-8000-000000000001', current_setting('test.notice')::uuid)), 'Notice worker', 'manager can inspect own frozen recipient receipt');

reset role;
select extensions.throws_ok($$update public.announcements set title = 'Overwrite' where id = current_setting('test.notice')::uuid$$, 'P0001', 'Published announcements and recipient snapshots are immutable', 'publication cannot be overwritten');
select extensions.throws_ok($$delete from public.announcements where id = current_setting('test.notice')::uuid$$, 'P0001', 'Published announcements and recipient snapshots are immutable', 'publication cannot be deleted');
select extensions.throws_ok($$update public.announcement_recipients set employee_name = 'Overwrite' where id = current_setting('test.recipient')::uuid$$, 'P0001', 'Published announcements and recipient snapshots are immutable', 'recipient snapshot cannot be overwritten');
select extensions.throws_ok($$truncate public.announcement_recipients$$, 'P0001', 'Published announcements and recipient snapshots are immutable', 'recipient history cannot be truncated');
select extensions.is((select count(*) from public.sensitive_action_audit where business_id = 'b7400000-0000-4000-8000-000000000001' and source_table = 'announcement_recipients' and operation = 'UPDATE'), 1::bigint, 'idempotent acknowledgement has exactly one audited actor transition');
update public.employees set active = false, name = 'Renamed worker' where id = 'e7400000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*) from public.list_my_announcements('b7400000-0000-4000-8000-000000000001')), 3::bigint, 'archiving does not remove authorized historic notices');
reset role;
delete from public.business_memberships where user_id = 'a7400000-0000-4000-8000-000000000003' and business_id = 'b7400000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.acknowledge_announcement('b7400000-0000-4000-8000-000000000001', current_setting('test.recipient')::uuid)$$, 'P0001', 'Permission denied', 'revoked membership cannot retry acknowledgement');
select * from extensions.finish();
rollback;
