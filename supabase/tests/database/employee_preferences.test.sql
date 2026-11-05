begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(57);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a6000000-0000-4000-8000-000000000001', 'preferences-owner@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000002', 'preferences-foh@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000003', 'preferences-boh@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000004', 'preferences-worker@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000005', 'preferences-other-worker@example.test', '{}'::jsonb),
  ('a6000000-0000-4000-8000-000000000006', 'preferences-outsider@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b6000000-0000-4000-8000-000000000001', 'Preference business'),
  ('b6000000-0000-4000-8000-000000000002', 'Other preference business');
insert into public.venues (id, business_id, name) values
  ('c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'Main'),
  ('c6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000002', 'Other');
insert into public.departments (id, business_id, venue_id, name) values
  ('d6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'FOH'),
  ('d6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'BOH'),
  ('d6000000-0000-4000-8000-000000000003', 'b6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000002', 'Other');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', 'foh_manager', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000003', 'boh_manager', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002'),
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000004', 'employee', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000005', 'employee', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002'),
  ('b6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title, employment_type) values
  ('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000004', 'FOH worker', 'Server', 'part_time'),
  ('e6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000005', 'BOH worker', 'Chef', 'casual'),
  ('e6000000-0000-4000-8000-000000000003', 'b6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000003', 'a6000000-0000-4000-8000-000000000006', 'Outside worker', 'Server', 'casual');

select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.employee_preferences), 0,
  'preferences are not assumed before submission');
select extensions.lives_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 24.5, true, false)$$,
  'a linked employee can submit preferences');
select extensions.is((select preferred_weekly_hours from public.employee_preferences), 24.5::numeric,
  'preferred weekly hours are saved');
select extensions.is((select notify_schedule_email from public.employee_preferences), true,
  'the schedule email choice is saved');
select extensions.is((select notify_leave_email from public.employee_preferences), false,
  'the leave email choice is saved independently');
select extensions.is((select employment_type from public.employees where id = 'e6000000-0000-4000-8000-000000000001'),
  'part_time', 'preferences do not change contractual employment details');
select extensions.is((select count(*)::integer from public.employee_preference_events), 1,
  'the first submission creates one history event');
select extensions.is((select actor_id from public.employee_preference_events),
  'a6000000-0000-4000-8000-000000000004'::uuid, 'the event records the authenticated actor');
select extensions.ok((select old_values is null from public.employee_preference_events),
  'the first event has no previous preferences');
select extensions.is((select new_values from public.employee_preference_events),
  '{"preferred_weekly_hours": 24.5, "notify_schedule_email": true, "notify_leave_email": false}'::jsonb,
  'the event records the submitted values');
select extensions.lives_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 24.50, true, false)$$,
  'saving the same preferences again succeeds');
select extensions.is((select count(*)::integer from public.employee_preference_events), 1,
  'an unchanged save does not create a duplicate event');
select extensions.lives_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', null, false, true)$$,
  'an employee can clear preferred hours and change notification choices');
select extensions.is((select preferred_weekly_hours from public.employee_preferences), null::numeric,
  'cleared hours remain unspecified rather than becoming zero');
select extensions.is((select count(*)::integer from public.employee_preference_events), 2,
  'a changed submission creates another event');
select extensions.is(
  (select old_values from public.employee_preference_events where old_values is not null),
  '{"preferred_weekly_hours": 24.5, "notify_schedule_email": true, "notify_leave_email": false}'::jsonb,
  'the change event retains the previous values');
select extensions.is(
  (select new_values from public.employee_preference_events where old_values is not null),
  '{"preferred_weekly_hours": null, "notify_schedule_email": false, "notify_leave_email": true}'::jsonb,
  'the change event retains the new values');
select extensions.lives_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 168, false, false)$$,
  'the upper weekly-hours boundary is accepted');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', -0.25, true, true)$$,
  'P0001', 'Invalid employee preferences', 'negative hours are rejected');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 168.25, true, true)$$,
  'P0001', 'Invalid employee preferences', 'more than 168 hours are rejected');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 0.1, true, true)$$,
  'P0001', 'Invalid employee preferences', 'hours must use quarter-hour increments');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'NaN'::numeric, true, true)$$,
  'P0001', 'Invalid employee preferences', 'not-a-number hours are rejected');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'Infinity'::numeric, true, true)$$,
  'P0001', 'Invalid employee preferences', 'infinite hours are rejected');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 8, null, true)$$,
  'P0001', 'Invalid employee preferences', 'the schedule notification choice must be explicit');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 8, true, null)$$,
  'P0001', 'Invalid employee preferences', 'the leave notification choice must be explicit');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002', 8, true, true)$$,
  'P0001', 'Permission denied', 'an employee cannot change another employee''s preferences');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000001', 8, true, true)$$,
  'P0001', 'Permission denied', 'a forged venue is rejected');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 8, true, true)$$,
  'P0001', 'Permission denied', 'a forged tenant is rejected');
select extensions.is((select count(*)::integer from public.employee_preference_events), 3,
  'invalid submissions do not add history events');
select extensions.is((select count(distinct created_at)::integer from public.employee_preference_events), 3,
  'history records the actual change times rather than the shared transaction start time');
select extensions.is((select preferred_weekly_hours from public.employee_preferences), 168::numeric,
  'invalid submissions do not change saved preferences');
select extensions.throws_ok(
  $$insert into public.employee_preferences
    (employee_id, business_id, venue_id, notify_schedule_email, notify_leave_email)
    values ('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', true, true)$$,
  '42501', null, 'direct preference insertion is denied');
select extensions.throws_ok(
  $$update public.employee_preferences set notify_schedule_email = true$$,
  '42501', null, 'direct preference updates are denied');
select extensions.throws_ok(
  $$delete from public.employee_preferences$$,
  '42501', null, 'direct preference deletion is denied');
select extensions.throws_ok(
  $$insert into public.employee_preference_events (employee_id, business_id, venue_id, new_values)
    values ('e6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', '{}'::jsonb)$$,
  '42501', null, 'direct history insertion is denied');
select extensions.throws_ok(
  $$update public.employee_preference_events set new_values = '{}'::jsonb$$,
  '42501', null, 'history events cannot be modified by ordinary users');
select extensions.throws_ok(
  $$delete from public.employee_preference_events$$,
  '42501', null, 'history events cannot be deleted by ordinary users');

select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*)::integer from public.employee_preferences), 0,
  'another employee cannot read the worker''s preferences');
select extensions.is((select count(*)::integer from public.employee_preference_events), 0,
  'another employee cannot read the worker''s history');
select extensions.lives_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002', 0, false, false)$$,
  'another employee can save their own zero-hour preference');

select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.employee_preferences), 1,
  'the FOH manager can view only their eligible worker''s preferences');
select extensions.is((select count(*)::integer from public.employee_preference_events), 3,
  'the eligible manager can view preference history');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 8, true, true)$$,
  'P0001', 'Permission denied', 'a manager cannot overwrite the employee''s choices');

select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.employee_preferences), 1,
  'the BOH manager cannot view an unrelated FOH worker');
reset role;
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002');
set local role authenticated;
select extensions.is((select count(*)::integer from public.employee_preferences), 2,
  'a manager can view preferences for a worker linked to their department');
select extensions.is((select count(*)::integer from public.employee_preference_events), 4,
  'a manager can view that shared worker''s history');

select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000006', true);
select extensions.lives_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000003', 12, true, true)$$,
  'a worker in another tenant can save their own preferences');
select extensions.is((select count(*)::integer from public.employee_preferences), 1,
  'another tenant sees only its own preferences');
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*)::integer from public.employee_preferences), 2,
  'the owner sees their tenant''s preferences but not another tenant''s');
select extensions.is((select count(*)::integer from public.employee_preference_events), 4,
  'the owner sees their tenant''s history but not another tenant''s');

reset role;
select extensions.throws_ok(
  $$update public.employee_preferences set business_id = 'b6000000-0000-4000-8000-000000000002'
    where employee_id = 'e6000000-0000-4000-8000-000000000001'$$,
  '23514', 'Business association is immutable', 'a preference cannot move between tenants');
select extensions.throws_ok(
  $$update public.employee_preference_events set business_id = 'b6000000-0000-4000-8000-000000000002'
    where employee_id = 'e6000000-0000-4000-8000-000000000001'$$,
  '23514', 'Business association is immutable', 'a history event cannot move between tenants');
update public.employees set active = false where id = 'e6000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 8, true, true)$$,
  'P0001', 'Permission denied', 'archived employees cannot update preferences');

reset role;
update public.employees set active = true where id = 'e6000000-0000-4000-8000-000000000001';
delete from public.business_memberships
  where business_id = 'b6000000-0000-4000-8000-000000000001'
    and user_id = 'a6000000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.is((select count(*)::integer from public.employee_preferences), 0,
  'a removed member cannot read their former preferences');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 8, true, true)$$,
  'P0001', 'Permission denied', 'a removed member cannot update their former preferences');

reset role;
set local role anon;
select extensions.throws_ok(
  $$select * from public.employee_preferences$$,
  '42501', null, 'anonymous preference reads are denied');
select extensions.throws_ok(
  $$select public.save_employee_preferences('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 8, true, true)$$,
  '42501', null, 'anonymous preference updates are denied');

select * from extensions.finish();
rollback;
