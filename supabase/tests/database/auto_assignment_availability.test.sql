begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(38);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-4000-8000-000000000001', 'auto-availability-owner@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b9000000-0000-4000-8000-000000000001', 'Automatic availability');
insert into public.venues (id, business_id, name, timezone) values
  ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'UTC venue', 'UTC'),
  ('c9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'Sydney venue', 'Australia/Sydney'),
  ('c9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'Apia venue', 'Pacific/Apia');
insert into public.departments (id, business_id, venue_id, name) values
  ('d9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'UTC department'),
  ('d9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002', 'Sydney department'),
  ('d9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000003', 'Apia department');
insert into public.business_memberships (business_id, user_id, role) values
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'owner');
insert into public.employees (id, business_id, venue_id, department_id, name, role_title) values
  ('e9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'A unavailable', 'Server'),
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'B available', 'Server'),
  ('e9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'C unknown', 'Server'),
  ('e9000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000002', 'Sydney worker', 'Server'),
  ('e9000000-0000-4000-8000-000000000005', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000003', 'Apia worker', 'Server');
insert into public.employee_availability_patterns (employee_id, business_id, venue_id) values
  ('e9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001'),
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001'),
  ('e9000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002');
insert into public.employee_availability_intervals
  (employee_id, business_id, venue_id, weekday, start_minute, end_minute) values
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 1, 540, 720),
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 1, 780, 1020),
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 7, 1320, 120),
  ('e9000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002', 7, 60, 120),
  ('e9000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002', 7, 180, 240);

select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000003', '2032-03-15 09:00+00', '2032-03-15 10:00+00'),
  'an unsubmitted pattern remains unknown and eligible');
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000001', '2032-03-15 09:00+00', '2032-03-15 10:00+00'),
  'a submitted empty pattern means unavailable');
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000002', '2032-03-15 09:00+00', '2032-03-15 12:00+00'),
  'a shift fully within a submitted interval is available');
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000002', '2032-03-15 11:59:59.999999+00', '2032-03-15 12:00+00'),
  'an exclusive end exactly at the boundary remains available');
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000002', '2032-03-15 11:59:59.999999+00', '2032-03-15 12:00:00.000001+00'),
  'a one-microsecond excursion past availability is rejected');
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000002', '2032-03-15 12:00+00', '2032-03-15 13:00+00'),
  'a gap between submitted intervals is unavailable');
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000002', '2032-03-15 13:00+00', '2032-03-15 17:00+00'),
  'a second submitted interval is available');
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000002', '2032-03-15 17:00+00', '2032-03-15 17:00:00.000001+00'),
  'the end of an interval is exclusive');
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000002', '2032-03-15 08:59:59+00', '2032-03-15 09:00:01+00'),
  'a shift starting before availability is rejected');
select extensions.throws_ok(
  $$select public.employee_available_for_shift('e9000000-0000-4000-8000-000000000002', '2032-03-15 09:00+00', '2032-03-16 09:00:00.000001+00')$$,
  'P0001', 'Invalid availability comparison', 'comparisons longer than 24 hours are rejected');
select extensions.throws_ok(
  $$select public.employee_available_for_shift('e9000000-0000-4000-8000-000000000002', '2032-03-15 09:00+00', '2032-03-15 09:00+00')$$,
  'P0001', 'Invalid availability comparison', 'zero-duration comparisons are rejected');
select extensions.throws_ok(
  $$select public.employee_available_for_shift('e9000000-0000-4000-8000-000000000099', '2032-03-15 09:00+00', '2032-03-15 10:00+00')$$,
  'P0001', 'Employee venue not found', 'unknown employees cannot be compared');
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000002', '2032-03-14 22:00+00', '2032-03-15 02:00+00'),
  'an overnight interval wraps correctly across the week');
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000002', '2032-03-14 22:00+00', '2032-03-15 02:00:00.000001+00'),
  'an overnight interval does not include its end instant');

insert into public.employee_availability_exceptions
  (id, business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status) values
  ('f9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000003', '2032-03-15', '2032-03-15', 'leave', 'pending'),
  ('f9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000003', '2032-03-15', '2032-03-15', 'leave', 'rejected'),
  ('f9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000003', '2032-03-15', '2032-03-15', 'unavailable', 'cancelled');
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000003', '2032-03-15 09:00+00', '2032-03-15 10:00+00'),
  'pending, rejected and cancelled exceptions do not block');
update public.employee_availability_exceptions set status = 'approved'
where id = 'f9000000-0000-4000-8000-000000000001';
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000003', '2032-03-15 09:00+00', '2032-03-15 10:00+00'),
  'approved leave overrides an unknown pattern');
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000003', '2032-03-14 22:00+00', '2032-03-15 00:00+00'),
  'approved leave does not include the previous day or an exclusive midnight');
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000003', '2032-03-14 22:00+00', '2032-03-15 00:00:00.000001+00'),
  'crossing midnight into approved leave is rejected');
update public.employee_availability_exceptions set status = 'cancelled'
where id = 'f9000000-0000-4000-8000-000000000001';
update public.employee_availability_exceptions set status = 'active'
where id = 'f9000000-0000-4000-8000-000000000003';
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000003', '2032-03-15 09:00+00', '2032-03-15 10:00+00'),
  'an active date block overrides an unknown pattern');
update public.employee_availability_exceptions set status = 'cancelled'
where id = 'f9000000-0000-4000-8000-000000000003';
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000003', '2032-03-15 09:00+00', '2032-03-15 10:00+00'),
  'cancelling the date block restores unknown availability');
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000004', '2026-10-03 15:30+00', '2026-10-03 16:30+00'),
  'the skipped Sydney daylight-saving hour does not create a false conflict');
delete from public.employee_availability_intervals
where employee_id = 'e9000000-0000-4000-8000-000000000004';
insert into public.employee_availability_intervals
  (employee_id, business_id, venue_id, weekday, start_minute, end_minute) values
  ('e9000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002', 7, 150, 180),
  ('e9000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002', 7, 120, 135);
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000004', '2027-04-03 15:45+00', '2027-04-03 16:15+00'),
  'both occurrences of a repeated hour can be covered');
delete from public.employee_availability_intervals
where employee_id = 'e9000000-0000-4000-8000-000000000004' and start_minute = 120;
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000004', '2027-04-03 15:45+00', '2027-04-03 16:15+00'),
  'the second occurrence of a repeated hour is checked independently');
update public.venues set timezone = 'Asia/Kathmandu'
where id = 'c9000000-0000-4000-8000-000000000002';
delete from public.employee_availability_intervals
where employee_id = 'e9000000-0000-4000-8000-000000000004';
insert into public.employee_availability_intervals
  (employee_id, business_id, venue_id, weekday, start_minute, end_minute) values
  ('e9000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002', 1, 881, 882);
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000004', '1900-01-01 09:00:43.999999+00', '1900-01-01 09:00:44+00'),
  'historical second-level timezone offsets preserve an exclusive boundary');
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000004', '1900-01-01 09:00:43.999999+00', '1900-01-01 09:00:44.000001+00'),
  'a microsecond beyond a historical non-minute UTC boundary is detected');
insert into public.employee_availability_exceptions
  (id, business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status) values
  ('f9000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000003', 'e9000000-0000-4000-8000-000000000005', '2011-12-30', '2011-12-30', 'unavailable', 'active');
select extensions.ok(public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000005', '2011-12-30 09:30+00', '2011-12-30 10:30+00'),
  'an entirely skipped local date does not block the shift');
update public.employee_availability_exceptions set starts_on = '2011-12-31', ends_on = '2011-12-31'
where id = 'f9000000-0000-4000-8000-000000000004';
select extensions.ok(not public.employee_available_for_shift(
  'e9000000-0000-4000-8000-000000000005', '2011-12-30 09:30+00', '2011-12-30 10:30+00'),
  'the actual local date after a skipped date is checked');

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.employee_available_for_shift('e9000000-0000-4000-8000-000000000003', '2032-03-15 09:00+00', '2032-03-15 10:00+00')$$,
  '42501', null, 'the internal availability checker is not directly exposed');
select extensions.lives_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'First auto', '2032-03-15 09:00', '2032-03-15 10:00', 0)$$,
  'automatic assignment skips a worker with an explicitly empty pattern');
select extensions.is((select employee_id from public.shifts where role_title = 'First auto'),
  'e9000000-0000-4000-8000-000000000002'::uuid, 'the available candidate is selected');
reset role;
insert into public.employee_availability_exceptions
  (id, business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status) values
  ('f9000000-0000-4000-8000-000000000005', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', '2032-03-15', '2032-03-15', 'leave', 'approved');
set local role authenticated;
select extensions.lives_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Second auto', '2032-03-15 11:00', '2032-03-15 12:00', 0)$$,
  'automatic assignment skips approved leave');
select extensions.is((select employee_id from public.shifts where role_title = 'Second auto'),
  'e9000000-0000-4000-8000-000000000003'::uuid, 'the unknown but not blocked candidate remains eligible');
reset role;
update public.employee_availability_exceptions set status = 'active'
where id = 'f9000000-0000-4000-8000-000000000003';
set local role authenticated;
select extensions.throws_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'No candidate', '2032-03-15 15:00', '2032-03-15 16:00', 0)$$,
  'P0001', 'No eligible employee available for automatic assignment',
  'automatic assignment fails instead of assigning any unavailable worker');
select extensions.is((select count(*)::integer from public.shifts where role_title = 'No candidate'), 0,
  'failed automatic assignment does not create a shift');
select extensions.lives_ok(
  $$select public.save_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'Manual warning', '2032-03-15 15:00', '2032-03-15 16:00', 0)$$,
  'manual assignment remains advisory rather than silently changing policy');
select extensions.is((select employee_id from public.shifts where role_title = 'Manual warning'),
  'e9000000-0000-4000-8000-000000000001'::uuid, 'the manual assignment remains intact');
set local role anon;
select extensions.throws_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Unauthorised', '2032-03-15 17:00', '2032-03-15 18:00', 0)$$,
  '42501', null, 'anonymous users cannot automatically assign shifts');
select extensions.throws_ok(
  $$select public.employee_available_for_shift('e9000000-0000-4000-8000-000000000003', '2032-03-15 09:00+00', '2032-03-15 10:00+00')$$,
  '42501', null, 'anonymous users cannot inspect availability through the helper');

select * from extensions.finish();
rollback;
