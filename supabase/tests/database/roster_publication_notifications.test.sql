begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(77);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4000000-0000-4000-8000-000000000001', 'notice-owner@example.test', '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000002', 'notice-foh@example.test', '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000003', 'notice-worker@example.test', '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000004', 'notice-unaffected@example.test', '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000005', 'notice-pending@example.test', '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000006', 'notice-outside@example.test', '{}'::jsonb),
  ('a4000000-0000-4000-8000-000000000007', 'notice-boh@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b4000000-0000-4000-8000-000000000001', 'Notification business'),
  ('b4000000-0000-4000-8000-000000000002', 'Outside notification business');
insert into public.venues (id, business_id, name, timezone) values
  ('c4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'FOH'),
  ('d4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'BOH'),
  ('d4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'foh_manager', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'employee', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', 'employee', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000005', 'employee', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000006', 'owner', null, null),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000007', 'boh_manager', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'Affected worker', 'Server'),
  ('e4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', 'Unaffected worker', 'Server'),
  ('e4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', null, 'Unlinked worker', 'Server'),
  ('e4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000006', 'Outside worker', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, break_minutes, is_published) values
  ('f4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'First assigned', '2032-03-14 22:00+00', '2032-03-14 23:00+00', 0, false),
  ('f4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'Second assigned', '2032-03-14 23:00+00', '2032-03-15 00:00+00', 0, false),
  ('f4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000003', 'Unlinked assigned', '2032-03-15 00:00+00', '2032-03-15 01:00+00', 0, false),
  ('f4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', null, 'Open coverage', '2032-03-15 01:00+00', '2032-03-15 02:00+00', 0, false),
  ('f4000000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000002', 'Legacy published', '2032-03-15 02:00+00', '2032-03-15 03:00+00', 0, true),
  ('f4000000-0000-4000-8000-000000000006', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000001', 'Secondary department', '2032-03-15 04:00+00', '2032-03-15 05:00+00', 0, false);
insert into public.roster_publications
  (id, business_id, venue_id, department_id, week_start, venue_timezone, version, new_shift_count, shift_count)
values
  ('14000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
   'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
   '2032-03-08', 'Australia/Sydney', 1, 1, 0);

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.ok(
  (select not notifications_recorded from public.roster_publications
    where id = '14000000-0000-4000-8000-000000000001'),
  'earlier publication records do not falsely claim notifications were captured');
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  0, 'drafts and pre-existing published shifts do not create notices');
select extensions.throws_ok(
  $$select * from public.roster_publication_recipients$$,
  '42501', null, 'even owners cannot directly inspect recipient records');
select extensions.throws_ok(
  $$select * from public.roster_publication_notification_reads$$,
  '42501', null, 'even owners cannot directly inspect notification read records');
select extensions.throws_ok(
  $$select public.user_can_view_department('a4000000-0000-4000-8000-000000000003',
    'b4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'clients cannot probe another user through the shared authorization helper');
select extensions.is(
  public.publish_roster('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', '2032-03-15'),
  4, 'publication atomically publishes the assigned and open drafts');
select set_config('test.first_publication',
  (select id::text from public.roster_publications where week_start = '2032-03-15'), true);
select extensions.ok(
  (select notifications_recorded from public.roster_publications
    where id = current_setting('test.first_publication')::uuid),
  'new publications explicitly record that in-app recipients were captured');
select extensions.is(
  (select inaccessible_count from public.list_roster_notification_reachability(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', '2032-03-15')),
  1, 'managers can see that the unlinked impacted profile cannot currently access its notice');
select extensions.is(
  public.publish_roster('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', '2032-03-15'),
  0, 'a repeated publication without drafts remains a no-op');
reset role;
select extensions.is((select count(*)::integer from public.roster_publication_recipients), 2,
  'two impacted profiles produce one recipient each despite multiple shifts and an open shift');
select extensions.is(
  (select count(*)::integer from public.roster_publication_recipients
    where employee_id = 'e4000000-0000-4000-8000-000000000002'),
  0, 'a worker whose old published shift was unchanged is not notified');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  1, 'the impacted employee sees one notice for multiple newly published shifts');
select extensions.ok(
  (select unread from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  'the new notice starts unread');
select extensions.is(
  public.unread_roster_notification_count('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001'),
  1, 'the unread count reflects the publication once');
select extensions.is(
  (select week_start from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  '2032-03-15'::date, 'the notice links to the venue-local roster week');
select extensions.is(
  (select venue_id from public.mark_roster_notification_read(current_setting('test.first_publication')::uuid)),
  'c4000000-0000-4000-8000-000000000001'::uuid, 'reading a notice returns its authorized venue');
select extensions.is(
  public.unread_roster_notification_count('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001'),
  0, 'marking the notice read clears its unread count');
reset role;
select set_config('test.first_read_at', (select read_at::text from public.roster_publication_notification_reads
  where publication_id = current_setting('test.first_publication')::uuid
    and user_id = 'a4000000-0000-4000-8000-000000000003'), true);
set local role authenticated;
select extensions.is(
  (select week_start from public.mark_roster_notification_read(current_setting('test.first_publication')::uuid)),
  '2032-03-15'::date, 'reading the same notice again remains successful');
reset role;
select extensions.is(
  (select read_at::text from public.roster_publication_notification_reads
    where publication_id = current_setting('test.first_publication')::uuid
      and user_id = 'a4000000-0000-4000-8000-000000000003'),
  current_setting('test.first_read_at'), 'repeated reads do not rewrite the first read time');

select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  0, 'an unaffected employee sees no notice');
select extensions.throws_ok(
  $$select * from public.mark_roster_notification_read(current_setting('test.first_publication')::uuid)$$,
  'P0001', 'Permission denied', 'an unaffected employee cannot mark another employee notice read');
select extensions.throws_ok(
  $$select * from public.list_roster_notification_reachability(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', '2032-03-15')$$,
  'P0001', 'Permission denied', 'employees cannot inspect manager notification reachability');
select extensions.throws_ok(
  $$insert into public.roster_publication_notification_reads (publication_id, user_id)
    values (current_setting('test.first_publication')::uuid, auth.uid())$$,
  '42501', null, 'employees cannot forge recipient read records');

reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  0, 'an unlinked account cannot see the pending employee notice');
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.set_employee_auth_user('b4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000005')$$,
  'an owner can link the previously unlinked impacted profile');
select extensions.is(
  (select inaccessible_count from public.list_roster_notification_reachability(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', '2032-03-15')),
  0, 'the manager warning clears once the pending profile has access');
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.is(
  public.unread_roster_notification_count('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001'),
  1, 'linking the profile exposes its original pending notice exactly once');
reset role;
delete from public.business_memberships
where business_id = 'b4000000-0000-4000-8000-000000000001'
  and user_id = 'a4000000-0000-4000-8000-000000000005';
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a linked account loses access when its membership is removed');
select extensions.throws_ok(
  $$select * from public.mark_roster_notification_read(current_setting('test.first_publication')::uuid)$$,
  'P0001', 'Permission denied', 'a removed member cannot mark a notice read');
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is(
  (select inaccessible_count from public.list_roster_notification_reachability(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', '2032-03-15')),
  1, 'the FOH manager sees a warning when a linked recipient loses membership access');
reset role;
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000005',
   'employee', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.is(
  public.unread_roster_notification_count('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001'),
  1, 'restoring membership restores the still-unread notice');

reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.save_shift('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001',
    'Later assigned', '2032-03-16 09:00', '2032-03-16 10:00', 0)$$,
  'a newly assigned draft can be added after publication');
select extensions.is(
  public.publish_roster('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', '2032-03-15'),
  1, 'a subsequent publication publishes only the new draft');
select set_config('test.second_publication', (select id::text from public.roster_publications where version = 2), true);
reset role;
select extensions.is(
  (select count(*)::integer from public.roster_publication_recipients
    where publication_id = current_setting('test.second_publication')::uuid),
  1, 'the second version notifies only the employee affected by its new shift');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  2, 'separate versions produce separate employee notices');
select extensions.is(
  public.unread_roster_notification_count('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001'),
  1, 'only the later version is unread after the first was read');
select extensions.is(
  (select week_start from public.mark_roster_notification_read(current_setting('test.second_publication')::uuid)),
  '2032-03-15'::date, 'the second notice links to its roster week');
select extensions.is(
  public.unread_roster_notification_count('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001'),
  0, 'both versions can be independently marked read');

reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(
  public.publish_roster('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000002', '2032-03-15'),
  1, 'a linked secondary department can publish its employee shift');
select set_config('test.secondary_publication',
  (select id::text from public.roster_publications where department_id = 'd4000000-0000-4000-8000-000000000002'), true);
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')
    where publication_id = current_setting('test.secondary_publication')::uuid and unread),
  1, 'an employee can see an unread notice for their linked secondary-department shift');
reset role;
delete from public.employee_departments
where employee_id = 'e4000000-0000-4000-8000-000000000001'
  and department_id = 'd4000000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')
    where publication_id = current_setting('test.secondary_publication')::uuid),
  0, 'removing the secondary-department link hides its notice immediately');
select extensions.throws_ok(
  $$select * from public.mark_roster_notification_read(current_setting('test.secondary_publication')::uuid)$$,
  'P0001', 'Permission denied', 'a removed secondary link cannot mark its notice read');
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000007', true);
set local role authenticated;
select extensions.is(
  (select inaccessible_count from public.list_roster_notification_reachability(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000002', '2032-03-15')),
  1, 'the BOH manager is warned that the secondary-department recipient lost access');
reset role;
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.is(
  public.unread_roster_notification_count('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001'),
  1, 'restoring the secondary link restores the original unread notice');

reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000007', true);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.list_roster_notification_reachability(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', '2032-03-15')$$,
  'P0001', 'Permission denied', 'BOH managers cannot inspect FOH notification reachability');
select extensions.throws_ok(
  $$select * from public.mark_roster_notification_read(current_setting('test.first_publication')::uuid)$$,
  'P0001', 'Permission denied', 'manager status does not confer access to employee notices');
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000006', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000002')),
  0, 'another tenant sees only its own notices');
select extensions.throws_ok(
  $$select * from public.list_roster_notifications('b4000000-0000-4000-8000-000000000002',
    'c4000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'even an owner cannot mix another tenant venue with its own business');
select extensions.throws_ok(
  $$select * from public.mark_roster_notification_read(current_setting('test.first_publication')::uuid)$$,
  'P0001', 'Permission denied', 'another tenant cannot mark the original notice read');

reset role;
insert into public.employee_availability_exceptions
  (business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status) values
  ('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001', '2032-03-29', '2032-03-29', 'unavailable', 'active');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.save_shift('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001',
    'Blocked shift', '2032-03-29 09:00', '2032-03-29 10:00', 0)$$,
  'an unavailable draft may exist while manual blocking is disabled');
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', false, true, false, false)$$,
  'the owner enables the unavailable-worker publication blocker');
select extensions.throws_ok(
  $$select public.publish_roster('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', '2032-03-29')$$,
  'P0001', 'Roster has unavailable employees', 'a configured blocker rejects publication');
select extensions.is(
  (select count(*)::integer from public.roster_publications where week_start = '2032-03-29'),
  0, 'the blocked publication creates no version');
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001', false, false, false, false)$$,
  'the owner can restore the advisory rule for later fixtures');
reset role;
select extensions.is(
  (select count(*)::integer from public.roster_publication_recipients r
    join public.roster_publications p on p.id = r.publication_id
    where p.week_start = '2032-03-29'),
  0, 'blocked publication cannot create a recipient or notification');

insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e4000000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Owner FOH profile', 'Server'),
  ('e4000000-0000-4000-8000-000000000006', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', null, 'Owner BOH profile', 'Cook');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000006', 'd4000000-0000-4000-8000-000000000001');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at) values
  ('f4000000-0000-4000-8000-000000000007', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000005', 'Owner first profile', '2032-03-21 22:00+00', '2032-03-21 23:00+00'),
  ('f4000000-0000-4000-8000-000000000008', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000006', 'Owner second profile', '2032-03-21 23:00+00', '2032-03-22 00:00+00');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(
  public.publish_roster('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001', '2032-03-22'),
  2, 'two affected profiles of one account can be published');
select set_config('test.multiple_profiles_publication',
  (select id::text from public.roster_publications where week_start = '2032-03-22'), true);
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  1, 'the linked profile produces one notice while the other profile is unlinked');
select extensions.is(
  public.unread_roster_notification_count('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001'),
  1, 'the notice is initially unread');
select extensions.lives_ok(
  $$select * from public.mark_roster_notification_read(current_setting('test.multiple_profiles_publication')::uuid)$$,
  'reading the notice succeeds');
select extensions.lives_ok(
  $$select public.set_employee_auth_user('b4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000006', 'a4000000-0000-4000-8000-000000000001')$$,
  'the second affected profile can later be linked to the same account');
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  1, 'late-linked profiles still deduplicate to one notice for the account');
select extensions.is(
  public.unread_roster_notification_count('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001'),
  0, 'linking another affected profile does not make an already-read notice unread again');
reset role;
select extensions.is(
  (select count(*)::integer from public.roster_publication_notification_reads
    where publication_id = current_setting('test.multiple_profiles_publication')::uuid
      and user_id = 'a4000000-0000-4000-8000-000000000001'),
  1, 'one account-scoped read record covers both affected profiles');
set local role authenticated;
select extensions.lives_ok(
  $$select public.set_employee_auth_user('b4000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000006', 'a4000000-0000-4000-8000-000000000007')$$,
  'an owner can link the second profile to another eligible account');
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000007', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')
    where publication_id = current_setting('test.multiple_profiles_publication')::uuid and unread),
  1, 'a newly linked different account gets its own unread notice');
select extensions.lives_ok(
  $$select * from public.mark_roster_notification_read(current_setting('test.multiple_profiles_publication')::uuid)$$,
  'the second account can independently read its notice');
reset role;
select extensions.is(
  (select count(*)::integer from public.roster_publication_notification_reads
    where publication_id = current_setting('test.multiple_profiles_publication')::uuid),
  2, 'distinct accounts retain separate read records for the same publication');

reset role;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('a4000000-0000-4000-8000-000000000008', 'notice-invited@example.test', now(), '{}'::jsonb);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e4000000-0000-4000-8000-000000000007', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', null, 'Invited worker', 'Server');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at) values
  ('f4000000-0000-4000-8000-000000000009', 'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000007',
   'Invited assigned', '2032-04-05 00:00+00', '2032-04-05 01:00+00');
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(
  public.publish_roster('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', '2032-04-05'),
  1, 'a roster can be published to a profile whose worker has not been invited yet');
select extensions.is(
  (select inaccessible_count from public.list_roster_notification_reachability('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', '2032-04-05')),
  1, 'managers see the uninvited impacted profile as pending');
select extensions.lives_ok(
  $$select set_config('test.invited_notice', public.create_staff_invitation(
    'b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000007', 'notice-invited@example.test')::text, true)$$,
  'the pending worker can be invited after publication');
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000008', true);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.list_roster_notifications('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'an invited account cannot read venue notices before accepting');
select extensions.is(
  public.accept_staff_invitation(current_setting('test.invited_notice')::uuid),
  'b4000000-0000-4000-8000-000000000001'::uuid, 'the invited worker accepts and is linked to the impacted profile');
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')
    where week_start = '2032-04-05' and unread),
  1, 'accepting the invitation delivers the pending roster update once, unread');
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001')),
  1, 'the invited worker sees only updates for their own published shifts');
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is(
  (select inaccessible_count from public.list_roster_notification_reachability('b4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', '2032-04-05')),
  0, 'the manager warning clears once the invitation is accepted');
reset role;

set local role anon;
select extensions.throws_ok(
  $$select * from public.list_roster_notifications('b4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous users cannot list employee notifications');
select extensions.throws_ok(
  $$select * from public.mark_roster_notification_read(current_setting('test.first_publication')::uuid)$$,
  '42501', null, 'anonymous users cannot mark notifications read');
reset role;

select * from extensions.finish();
rollback;
