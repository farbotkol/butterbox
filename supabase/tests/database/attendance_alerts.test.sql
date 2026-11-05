begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();
select pg_advisory_xact_lock(hashtextextended('attendance-alert-worker', 0));
update public.attendance_alert_worker_state set last_completed_at = null where singleton;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7300000-0000-4000-8000-000000000001', 'alert-owner@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000002', 'alert-foh@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000003', 'alert-boh@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000004', 'alert-worker@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000005', 'alert-draft@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000006', 'alert-kitchen@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000007', 'alert-outside@example.test', '{}'::jsonb),
  ('a7300000-0000-4000-8000-000000000008', 'alert-foh-colleague@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7300000-0000-4000-8000-000000000001', 'Alert cafe'),
  ('b7300000-0000-4000-8000-000000000002', 'Outside alert cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001',
   'Alert venue', 'Australia/Sydney'),
  ('c7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000002',
   'Outside alert venue', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001',
   'c7300000-0000-4000-8000-000000000001', 'FOH'),
  ('d7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001',
   'c7300000-0000-4000-8000-000000000001', 'BOH'),
  ('d7300000-0000-4000-8000-000000000003', 'b7300000-0000-4000-8000-000000000002',
   'c7300000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000002', 'foh_manager',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001'),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000003', 'boh_manager',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002'),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000008', 'foh_manager',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001'),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000004', 'employee',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001'),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000005', 'employee',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001'),
  ('b7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000006', 'employee',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002'),
  ('b7300000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-000000000007', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
   'a7300000-0000-4000-8000-000000000004', 'Alert worker', 'Server'),
  ('e7300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
   'a7300000-0000-4000-8000-000000000005', 'Draft worker', 'Server'),
  ('e7300000-0000-4000-8000-000000000003', 'b7300000-0000-4000-8000-000000000001',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002',
   'a7300000-0000-4000-8000-000000000006', 'Kitchen worker', 'Cook'),
  ('e7300000-0000-4000-8000-000000000004', 'b7300000-0000-4000-8000-000000000002',
   'c7300000-0000-4000-8000-000000000002', 'd7300000-0000-4000-8000-000000000003',
   'a7300000-0000-4000-8000-000000000007', 'Outside worker', 'Server');

select set_config('test.start', (clock_timestamp() + interval '1 hour')::text, true);
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published
) values
  ('17300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
   'e7300000-0000-4000-8000-000000000001', 'Server', current_setting('test.start')::timestamptz,
   current_setting('test.start')::timestamptz + interval '8 hours', true),
  ('17300000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000001',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
   'e7300000-0000-4000-8000-000000000002', 'Draft', current_setting('test.start')::timestamptz,
   current_setting('test.start')::timestamptz + interval '8 hours', false),
  ('17300000-0000-4000-8000-000000000003', 'b7300000-0000-4000-8000-000000000001',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000002',
   'e7300000-0000-4000-8000-000000000003', 'Cook', current_setting('test.start')::timestamptz,
   current_setting('test.start')::timestamptz + interval '8 hours', true),
  ('17300000-0000-4000-8000-000000000004', 'b7300000-0000-4000-8000-000000000002',
   'c7300000-0000-4000-8000-000000000002', 'd7300000-0000-4000-8000-000000000003',
   'e7300000-0000-4000-8000-000000000004', 'Outside', current_setting('test.start')::timestamptz,
   current_setting('test.start')::timestamptz + interval '8 hours', true),
  ('17300000-0000-4000-8000-000000000005', 'b7300000-0000-4000-8000-000000000001',
   'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
   null, 'Open shift', current_setting('test.start')::timestamptz,
   current_setting('test.start')::timestamptz + interval '8 hours', true);

set local role anon;
select extensions.throws_ok(
  $$select * from public.attendance_alerts$$, '42501', null,
  'anonymous callers cannot read alert records directly');
select extensions.throws_ok(
  $$select * from public.attendance_alert_notification_reads$$, '42501', null,
  'anonymous callers cannot inspect notification reads');
select extensions.throws_ok(
  $$select * from public.get_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot read alert settings');
select extensions.throws_ok(
  $$select public.scan_attendance_alerts_internal(clock_timestamp())$$,
  '42501', null, 'anonymous callers cannot run the alert worker');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select * from public.list_attendance_alerts(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot list management alerts');
select extensions.throws_ok(
  $$select * from public.get_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot inspect management settings');
select extensions.throws_ok(
  $$select * from public.list_attendance_alert_notifications(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot list management alert notifications');
select extensions.throws_ok(
  $$select public.run_attendance_alert_worker()$$,
  '42501', null, 'authenticated users cannot run the privileged worker');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select enabled::text || ':' || grace_minutes::text || ':' || no_show_minutes::text || ':' || scheduler_state
   from public.get_attendance_alert_settings(
     'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')),
  'false:10:60:disabled', 'monitoring is disabled by default with visible initial thresholds');
select extensions.throws_ok(
  $$select public.save_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', true, 10, 60)$$,
  'P0001', 'Permission denied', 'a delegated manager cannot change venue settings');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000007', true);
select extensions.throws_ok(
  $$select public.save_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', true, 10, 60)$$,
  'P0001', 'Permission denied', 'an outside owner cannot configure another tenant');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.save_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', true, 15, 15)$$,
  'P0001', 'Invalid attendance alert settings', 'no-show threshold must follow the grace period');
select extensions.throws_ok(
  $$select public.save_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', true, -1, 60)$$,
  'P0001', 'Invalid attendance alert settings', 'negative grace periods are rejected');
select extensions.throws_ok(
  $$select public.save_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', true, 10, 1441)$$,
  'P0001', 'Invalid attendance alert settings', 'no-show thresholds have a finite bound');
select extensions.is(
  public.save_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', true, 10, 60)::text,
  'c7300000-0000-4000-8000-000000000001', 'an owner enables venue-specific thresholds');
select extensions.is(
  (select scheduler_state from public.get_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')),
  'stale', 'a missing successful worker heartbeat is visible rather than silently healthy');
select extensions.is(
  public.save_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', true, 10, 60)::text,
  'c7300000-0000-4000-8000-000000000001', 'saving unchanged settings is idempotent');
reset role;
select extensions.is(
  (select count(*)::integer from public.attendance_alert_policy_events
   where venue_id = 'c7300000-0000-4000-8000-000000000001'),
  1, 'unchanged settings do not duplicate policy history');
select extensions.is(
  (select count(*)::integer from public.sensitive_action_audit
   where business_id = 'b7300000-0000-4000-8000-000000000001'
     and source_table = 'attendance_alert_policy_events' and actor_id = 'a7300000-0000-4000-8000-000000000001'),
  1, 'settings changes enter the owner audit history');
select extensions.is(
  (select count(*)::integer from cron.job where jobname = 'butterbox-attendance-alerts' and active),
  1, 'one scheduled attendance alert worker is registered');

select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '9 minutes');
select extensions.is(
  (select count(*)::integer from public.attendance_alerts
   where business_id = 'b7300000-0000-4000-8000-000000000001'),
  0, 'no alert is emitted before the configured grace boundary');
select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '10 minutes');
select extensions.is(
  (select count(*)::integer from public.attendance_alerts
   where business_id = 'b7300000-0000-4000-8000-000000000001' and signal = 'missing_clock_in'),
  2, 'missing clock-in alerts appear at the exact grace boundary');
select extensions.is(
  (select count(*)::integer from public.attendance_alerts where shift_id in (
    '17300000-0000-4000-8000-000000000002', '17300000-0000-4000-8000-000000000005')),
  0, 'draft and unassigned shifts produce no alerts');
select extensions.is(
  (select count(*)::integer from public.attendance_alerts
   where business_id = 'b7300000-0000-4000-8000-000000000002'),
  0, 'a different tenant with monitoring disabled receives no alerts');
select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '10 minutes');
select extensions.is(
  (select count(*)::integer from public.attendance_alerts
   where business_id = 'b7300000-0000-4000-8000-000000000001'),
  2, 'repeating a worker scan does not duplicate alerts');
select extensions.is(
  (select count(*)::integer from public.attendance_alert_events
   where business_id = 'b7300000-0000-4000-8000-000000000001'),
  2, 'repeating a worker scan does not duplicate alert history');
select extensions.is(
  (select count(*)::integer from public.sensitive_action_audit
   where business_id = 'b7300000-0000-4000-8000-000000000001'
     and source_table = 'attendance_alert_events' and actor_kind = 'database'),
  2, 'automatically opened alerts are attributed to the database worker');
select set_config('test.alert', (select id::text from public.attendance_alerts
  where shift_id = '17300000-0000-4000-8000-000000000001' and category = 'arrival'), true);
select set_config('test.notice', (select id::text from public.attendance_alert_events
  where alert_id = current_setting('test.alert')::uuid and event_type = 'opened'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.list_attendance_alerts(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')),
  1, 'the FOH manager sees only their department alert');
select extensions.is(
  public.unread_roster_notification_count(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001'),
  1, 'the notification count includes only open alerts in the manager scope');
select extensions.is(
  (select count(*)::integer from public.list_attendance_alert_notifications(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')
   where unread and notification_id = current_setting('test.notice')::uuid),
  1, 'the manager receives one unread notification for the current alert signal');
select extensions.throws_ok(
  $$select public.act_on_attendance_alert(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    (select alert_id from public.list_attendance_alerts(
      'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001') limit 1),
    'resolved', ' ', '27300000-0000-4000-8000-000000000001')$$,
  'P0001', 'Invalid attendance alert action', 'resolution requires a nonblank reason');
select extensions.is(
  public.act_on_attendance_alert(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    current_setting('test.alert')::uuid, 'acknowledged', null,
    '27300000-0000-4000-8000-000000000002')::text,
  current_setting('test.alert'), 'a scoped manager can acknowledge an alert');
select extensions.is(
  public.act_on_attendance_alert(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    current_setting('test.alert')::uuid, 'acknowledged', null,
    '27300000-0000-4000-8000-000000000002')::text,
  current_setting('test.alert'), 'an exact acknowledgement retry is idempotent');
select extensions.is(
  public.unread_roster_notification_count(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001'),
  0, 'acknowledging marks the notification read for the acting manager');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000008', true);
select extensions.is(
  (select status || ':' || unread::text from public.list_attendance_alert_notifications(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')
   where notification_id = current_setting('test.notice')::uuid),
  'acknowledged:true', 'another manager retains their own unread notification after team acknowledgement');
select extensions.is(
  public.mark_attendance_alert_notification_read(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    current_setting('test.notice')::uuid)::text,
  current_setting('test.alert'), 'a scoped manager can mark their own notification read');
select extensions.is(
  public.mark_attendance_alert_notification_read(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    current_setting('test.notice')::uuid)::text,
  current_setting('test.alert'), 'marking a notification read is idempotent');
select extensions.is(
  public.unread_roster_notification_count(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001'),
  0, 'only that manager read state is changed');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.act_on_attendance_alert(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    current_setting('test.alert')::uuid, 'resolved', 'Investigated',
    '27300000-0000-4000-8000-000000000002')$$,
  'P0001', 'Request identifier already used', 'a request identifier cannot be reused for another decision');
select extensions.is(
  public.act_on_attendance_alert(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    current_setting('test.alert')::uuid, 'resolved', 'Investigated',
    '27300000-0000-4000-8000-000000000003')::text,
  current_setting('test.alert'), 'a scoped manager can resolve with a reason');
select extensions.is(
  (select status || ':' || jsonb_array_length(history)::text
   from public.list_attendance_alerts(
     'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')
   where alert_id = current_setting('test.alert')::uuid),
  'resolved:3', 'acknowledgement and resolution each add one visible history event');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.mark_attendance_alert_notification_read(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    current_setting('test.notice')::uuid)$$,
  'P0001', 'Notification not found or permission denied', 'a BOH manager cannot read an FOH notification');
select extensions.throws_ok(
  $$select public.act_on_attendance_alert(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    current_setting('test.alert')::uuid, 'acknowledged', null,
    '27300000-0000-4000-8000-000000000004')$$,
  'P0001', 'Alert not found or permission denied', 'a BOH manager cannot act on an FOH alert');
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000007', true);
select extensions.throws_ok(
  $$select * from public.list_attendance_alerts(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant cannot list these alerts');
reset role;
select extensions.is(
  (select count(*)::integer from public.attendance_alert_events
   where alert_id = current_setting('test.alert')::uuid and event_type = 'acknowledged'),
  1, 'an acknowledgement retry creates no duplicate audit event');
select extensions.is(
  (select count(*)::integer from public.sensitive_action_audit
   where source_table = 'attendance_alert_events' and actor_id = 'a7300000-0000-4000-8000-000000000002'
     and reason = 'Investigated'),
  1, 'resolution reason and manager identity enter sensitive action audit');
select extensions.throws_ok(
  $$update public.attendance_alert_events set reason = 'changed'
    where alert_id = current_setting('test.alert')::uuid and event_type = 'resolved'$$,
  'P0001', 'Original attendance records are immutable', 'alert decision history is append-only');

select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '59 minutes');
select extensions.is(
  (select signal || ':' || status from public.attendance_alerts where id = current_setting('test.alert')::uuid),
  'missing_clock_in:resolved', 'a resolved alert is not reopened without a new signal');
select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '60 minutes');
select extensions.is(
  (select signal || ':' || status from public.attendance_alerts where id = current_setting('test.alert')::uuid),
  'no_show:open', 'the no-show threshold changes and reopens the existing alert');
select extensions.is(
  (select count(*)::integer from public.attendance_alerts
   where shift_id = '17300000-0000-4000-8000-000000000001' and category = 'arrival'),
  1, 'escalation reuses the original arrival alert');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000008', true);
select extensions.is(
  (select count(*)::integer from public.list_attendance_alert_notifications(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')
   where unread and alert_id = current_setting('test.alert')::uuid
     and notification_id <> current_setting('test.notice')::uuid),
  1, 'a changed signal produces one new unread notification without duplicating the alert');
select extensions.is(
  public.mark_attendance_alert_notification_read(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
    current_setting('test.notice')::uuid)::text,
  current_setting('test.alert'), 'a stale notification may be marked read safely');
select extensions.is(
  (select count(*)::integer from public.list_attendance_alert_notifications(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')
   where unread and alert_id = current_setting('test.alert')::uuid),
  1, 'reading a stale notification does not consume the newer signal');
reset role;

insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by)
values ('37300000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001',
  'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
  'e7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000004');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at
) values (
  '47300000-0000-4000-8000-000000000001', '37300000-0000-4000-8000-000000000001',
  'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
  'd7300000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000001',
  'a7300000-0000-4000-8000-000000000004', '57300000-0000-4000-8000-000000000001', 'clock_in',
  current_setting('test.start')::timestamptz + interval '20 minutes'
);
select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '61 minutes');
select extensions.is(
  (select signal || ':' || status from public.attendance_alerts where id = current_setting('test.alert')::uuid),
  'late:open', 'a recorded late arrival replaces the earlier no-show signal');
insert into public.attendance_event_corrections (
  business_id, session_id, event_id, actor_id, request_id, old_at, new_at, reason
) values (
  'b7300000-0000-4000-8000-000000000001', '37300000-0000-4000-8000-000000000001',
  '47300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000002',
  '67300000-0000-4000-8000-000000000001',
  current_setting('test.start')::timestamptz + interval '20 minutes',
  current_setting('test.start')::timestamptz + interval '5 minutes', 'Corrected arrival'
);
select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '62 minutes');
select extensions.is(
  (select coalesce(signal, 'cleared') || ':' || status
   from public.attendance_alerts where id = current_setting('test.alert')::uuid),
  'cleared:resolved', 'an effective on-time correction automatically clears the prior signal');
insert into public.attendance_event_corrections (
  business_id, session_id, event_id, actor_id, request_id, old_at, new_at, reason
) values (
  'b7300000-0000-4000-8000-000000000001', '37300000-0000-4000-8000-000000000001',
  '47300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000002',
  '67300000-0000-4000-8000-000000000002',
  current_setting('test.start')::timestamptz + interval '5 minutes',
  current_setting('test.start')::timestamptz + interval '20 minutes', 'Revised arrival'
);
select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '63 minutes');
select extensions.is(
  (select signal || ':' || status from public.attendance_alerts where id = current_setting('test.alert')::uuid),
  'late:open', 'a subsequent correction can reopen a cleared alert without duplicating it');
select extensions.is(
  (select occurred_at from public.attendance_events where id = '47300000-0000-4000-8000-000000000001'),
  current_setting('test.start')::timestamptz + interval '20 minutes',
  'alert evaluation and corrections do not overwrite the original clock');

insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published
) values (
  '17300000-0000-4000-8000-000000000006', 'b7300000-0000-4000-8000-000000000001',
  'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001',
  'e7300000-0000-4000-8000-000000000001', 'Follow-up',
  current_setting('test.start')::timestamptz + interval '8 hours 5 minutes',
  current_setting('test.start')::timestamptz + interval '10 hours', true
);
select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '8 hours 10 minutes');
select extensions.is(
  (select count(*)::integer from public.attendance_alerts
   where shift_id = '17300000-0000-4000-8000-000000000001' and category = 'departure'),
  0, 'a published adjoining shift suppresses a premature missing clock-out alert');
update public.shifts set is_published = false where id = '17300000-0000-4000-8000-000000000006';
select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '8 hours 10 minutes');
select extensions.is(
  (select signal from public.attendance_alerts
   where shift_id = '17300000-0000-4000-8000-000000000001' and category = 'departure'),
  'missing_clock_out', 'an unpublished follow-up cannot suppress a missing clock-out alert');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at
) values (
  '47300000-0000-4000-8000-000000000002', '37300000-0000-4000-8000-000000000001',
  'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
  'd7300000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000001',
  'a7300000-0000-4000-8000-000000000004', '57300000-0000-4000-8000-000000000002', 'clock_out',
  current_setting('test.start')::timestamptz + interval '8 hours 11 minutes'
);
select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '8 hours 12 minutes');
select extensions.is(
  (select coalesce(signal, 'cleared') || ':' || status from public.attendance_alerts
   where shift_id = '17300000-0000-4000-8000-000000000001' and category = 'departure'),
  'cleared:resolved', 'a later clock-out clears the departure alert with history');
update public.shifts set is_published = false where id = '17300000-0000-4000-8000-000000000001';
select public.scan_attendance_alerts_internal(current_setting('test.start')::timestamptz + interval '8 hours 13 minutes');
select extensions.is(
  (select coalesce(signal, 'cleared') || ':' || status
   from public.attendance_alerts where id = current_setting('test.alert')::uuid),
  'cleared:resolved', 'an alert is cleared if its shift is no longer published');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7300000-0000-4000-8000-000000000001', true);
select extensions.is(
  public.save_attendance_alert_settings(
    'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', false, 5, 20)::text,
  'c7300000-0000-4000-8000-000000000001', 'an owner can change thresholds and stop monitoring');
select extensions.is(
  (select enabled::text || ':' || grace_minutes::text || ':' || no_show_minutes::text || ':' || scheduler_state
   from public.get_attendance_alert_settings(
     'b7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001')),
  'false:5:20:disabled', 'disabled settings remain visible with their configured thresholds');
reset role;
select extensions.is(
  (select count(*)::integer from public.attendance_alert_policy_events
   where venue_id = 'c7300000-0000-4000-8000-000000000001'),
  2, 'both distinct policy changes remain auditable');
select extensions.throws_ok(
  $$delete from public.attendance_alert_policy_events
    where venue_id = 'c7300000-0000-4000-8000-000000000001'$$,
  'P0001', 'Original attendance records are immutable', 'policy history is append-only');
select extensions.ok(
  not has_function_privilege('service_role', 'public.scan_attendance_alerts_internal(timestamptz)', 'execute'),
  'the external service role cannot inject worker scan times');
select * from extensions.finish();
rollback;
