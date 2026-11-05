begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(53);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa000000-0000-4000-8000-000000000001', 'availability-owner@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000002', 'availability-foh@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000003', 'availability-boh@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000004', 'availability-worker@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000005', 'availability-other-worker@example.test', '{}'::jsonb),
  ('aa000000-0000-4000-8000-000000000006', 'availability-outsider@example.test', '{}'::jsonb);

insert into public.businesses (id, name) values
  ('bb000000-0000-4000-8000-000000000001', 'Availability business'),
  ('bb000000-0000-4000-8000-000000000002', 'Other availability business');
insert into public.venues (id, business_id, name, timezone) values
  ('cc000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'Main', 'Australia/Sydney'),
  ('cc000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000002', 'Other', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('dd000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001', 'FOH'),
  ('dd000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001', 'BOH'),
  ('dd000000-0000-4000-8000-000000000003', 'bb000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000002', 'Other');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000002', 'foh_manager', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000003', 'boh_manager', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000002'),
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'employee', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000005', 'employee', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000002'),
  ('bb000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, name, role_title) values
  ('ee000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 'FOH worker', 'Server'),
  ('ee000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000002', 'BOH worker', 'Chef'),
  ('ee000000-0000-4000-8000-000000000003', 'bb000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000003', 'Outside worker', 'Server');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.set_employee_auth_user('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004')$$,
  'owner links a matching member to the employee');
select extensions.is(
  (select auth_user_id from public.employees where id = 'ee000000-0000-4000-8000-000000000001'),
  'aa000000-0000-4000-8000-000000000004'::uuid, 'employee association is stored');
select extensions.lives_ok(
  $$select public.set_employee_auth_user('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000005')$$,
  'owner links a second employee');
select extensions.throws_ok(
  $$select public.set_employee_auth_user('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000005')$$,
  'P0001', 'Member is not eligible for this employee', 'member with another department is rejected');
select extensions.throws_ok(
  $$select public.set_employee_auth_user('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000006')$$,
  'P0001', 'Member is not eligible for this employee', 'cross-tenant member is rejected');
select extensions.throws_ok(
  $$select public.set_employee_auth_user('bb000000-0000-4000-8000-000000000002', 'ee000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000006')$$,
  'P0001', 'Permission denied', 'owner cannot link an employee in another business');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[]')$$,
  'P0001', 'Permission denied', 'owner cannot change another employee availability');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 0,
  'an unsubmitted pattern is not treated as an empty pattern');
select extensions.lives_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    '[{"weekday":1,"start":"09:00","end":"12:00"},{"weekday":1,"start":"13:00","end":"17:00"},{"weekday":7,"start":"22:00","end":"02:00"}]')$$,
  'employee saves multiple intervals and an overnight interval');
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 1,
  'a submitted pattern is recorded');
select extensions.is((select count(*)::integer from public.employee_availability_intervals), 3,
  'all intervals are saved');
select extensions.ok(
  exists(select 1 from public.employee_availability_intervals where weekday = 7 and start_minute = 1320 and end_minute = 120),
  'overnight start and next-day end are stored in venue-local minutes');
select extensions.ok(
  exists(select 1 from public.employee_availability_intervals where weekday = 1 and start_minute = 780 and end_minute = 1020),
  'a second interval on the same day is preserved');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000002', '[]')$$,
  'P0001', 'Permission denied', 'employee cannot change another worker');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000002', 'ee000000-0000-4000-8000-000000000001', '[]')$$,
  'P0001', 'Permission denied', 'employee cannot write with a different business');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '{}')$$,
  'P0001', 'Invalid availability intervals', 'non-array pattern is rejected');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Invalid availability intervals', 'null pattern is rejected');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[null]')$$,
  'P0001', 'Invalid availability intervals', 'null interval is rejected');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[{"weekday":1,"start":"09:00"}]')$$,
  'P0001', 'Invalid availability intervals', 'missing end is rejected');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[{"weekday":8,"start":"09:00","end":"10:00"}]')$$,
  'P0001', 'Invalid availability intervals', 'invalid weekday is rejected');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[{"weekday":1,"start":"24:00","end":"10:00"}]')$$,
  'P0001', 'Invalid availability intervals', 'invalid time is rejected');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[{"weekday":"1","start":"09:00","end":"10:00"}]')$$,
  'P0001', 'Invalid availability intervals', 'weekday must be a number');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    (select jsonb_agg('{"weekday":1,"start":"09:00","end":"10:00"}'::jsonb) from generate_series(1,57)))$$,
  'P0001', 'Invalid availability intervals', 'oversized patterns are rejected');
select extensions.is((select count(*)::integer from public.employee_availability_intervals), 3,
  'failed validation leaves the previous pattern unchanged');
select extensions.throws_ok(
  $$delete from public.employee_availability_intervals$$,
  '42501', 'permission denied for table employee_availability_intervals', 'direct interval writes are denied');
select extensions.throws_ok(
  $$delete from public.employee_availability_patterns$$,
  '42501', 'permission denied for table employee_availability_patterns', 'direct pattern writes are denied');
select extensions.lives_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[]')$$,
  'employee can submit an explicitly unavailable week');
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 1,
  'empty submitted pattern remains distinct from no submission');
select extensions.is((select count(*)::integer from public.employee_availability_intervals), 0,
  'empty submitted pattern contains no available intervals');
select extensions.lives_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[{"weekday":1,"start":"00:00","end":"00:00"}]')$$,
  'equal start and end represent 24 hours');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000005', true);
select extensions.lives_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000002', '[{"weekday":2,"start":"08:00","end":"16:00"}]')$$,
  'second employee saves a pattern');
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 1,
  'employee sees only their own pattern');
select extensions.is((select count(*)::integer from public.employee_availability_intervals), 1,
  'employee sees only their own intervals');

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 1,
  'FOH manager sees only FOH pattern');
select extensions.throws_ok(
  $$select public.set_employee_auth_user('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Permission denied', 'department manager cannot relink employees');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[]')$$,
  'P0001', 'Permission denied', 'manager cannot edit staff self-reported availability');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 1,
  'BOH manager sees only BOH pattern');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000006', true);
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 0,
  'another business cannot see patterns');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 2,
  'owner can see both departments');
select extensions.lives_ok(
  $$select public.set_employee_departments('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    array['dd000000-0000-4000-8000-000000000001'::uuid, 'dd000000-0000-4000-8000-000000000002'::uuid])$$,
  'owner links the FOH worker to BOH as well');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 2,
  'secondary-department manager sees the shared worker availability');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.set_employee_departments('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
    array['dd000000-0000-4000-8000-000000000001'::uuid])$$,
  'owner removes the secondary department');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 1,
  'former secondary-department manager loses access to the shared worker');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.save_employee_profile('bb000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
    'ee000000-0000-4000-8000-000000000001', 'FOH worker', '', 'Server', 'casual', false)$$,
  'owner archives the employee');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[]')$$,
  'P0001', 'Permission denied', 'archived employee cannot change availability');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.save_employee_profile('bb000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
    'ee000000-0000-4000-8000-000000000001', 'FOH worker', '', 'Server', 'casual', true)$$,
  'owner reactivates the employee');
reset role;
update public.business_memberships set department_id = 'dd000000-0000-4000-8000-000000000002'
where user_id = 'aa000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 0,
  'a scope change removes access even if the old employee association remains');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[]')$$,
  'P0001', 'Permission denied', 'a user outside the employee scope cannot edit');
reset role;
update public.business_memberships set department_id = 'dd000000-0000-4000-8000-000000000001'
where user_id = 'aa000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 1,
  'restoring the member scope restores access to their own pattern');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.set_employee_auth_user('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', null)$$,
  'owner can unlink an employee');
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.employee_availability_patterns), 0,
  'former linked user loses access after unlinking');
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[]')$$,
  'P0001', 'Permission denied', 'former linked user cannot edit after unlinking');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.set_employee_recurring_availability('bb000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', '[]')$$,
  '42501', 'permission denied for function set_employee_recurring_availability', 'anonymous availability writes are denied');
select * from extensions.finish();
rollback;
