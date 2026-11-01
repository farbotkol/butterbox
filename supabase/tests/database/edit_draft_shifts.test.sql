begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(78);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-4000-8000-000000000001', 'edit-owner@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000002', 'edit-foh@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000003', 'edit-staff@example.test', '{}'::jsonb),
  ('a9000000-0000-4000-8000-000000000004', 'edit-other@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b9000000-0000-4000-8000-000000000001', 'Edit business'),
  ('b9000000-0000-4000-8000-000000000002', 'Other edit business');
insert into public.venues (id, business_id, name, timezone) values
  ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000002', 'Other', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'FOH'),
  ('d9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'BOH'),
  ('d9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000002', 'Other');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'foh_manager', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000003', 'employee', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000004', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000003', 'Shared', 'Server'),
  ('e9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002', null, 'BOH only', 'Cook'),
  ('e9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Archived', 'Server');
update public.employees set active = false where id = 'e9000000-0000-4000-8000-000000000003';
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002');
insert into public.job_roles (business_id, venue_id, department_id, name, active) values
  ('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Closed role', false);
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published, status, created_by) values
  ('f9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'Server', '2032-03-14 22:00+00', '2032-03-15 01:00+00', false, 'scheduled', 'a9000000-0000-4000-8000-000000000001'),
  ('f9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'Published', '2032-03-17 00:00+00', '2032-03-17 03:00+00', true, 'scheduled', null),
  ('f9000000-0000-4000-8000-000000000003', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002', 'e9000000-0000-4000-8000-000000000001', 'BOH shift', '2032-03-16 00:00+00', '2032-03-16 03:00+00', false, 'scheduled', null),
  ('f9000000-0000-4000-8000-000000000004', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Cancelled', '2032-03-18 00:00+00', '2032-03-18 03:00+00', false, 'cancelled', null),
  ('f9000000-0000-4000-8000-000000000005', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'First occurrence', '2026-04-04 15:30+00', '2026-04-04 18:00+00', false, 'scheduled', null),
  ('f9000000-0000-4000-8000-000000000006', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'First occurrence both', '2026-04-04 15:00+00', '2026-04-04 15:30+00', false, 'scheduled', null),
  ('f9000000-0000-4000-8000-000000000007', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Repeated equal', '2026-04-04 15:30+00', '2026-04-04 16:30+00', false, 'scheduled', null),
  ('f9000000-0000-4000-8000-000000000008', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Repeated backwards', '2026-04-04 15:50+00', '2026-04-04 16:10+00', false, 'scheduled', null),
  ('f9000000-0000-4000-8000-000000000009', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Precise', '2032-03-19 21:00:31.123456+00', '2032-03-19 22:30:48.654321+00', false, 'scheduled', null),
  ('f9000000-0000-4000-8000-000000000010', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Precise overnight', '2032-03-21 12:00:45+00', '2032-03-21 15:00:50+00', false, 'scheduled', null),
  ('f9000000-0000-4000-8000-000000000011', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Precise repeated', '2026-04-04 15:30:21.123456+00', '2026-04-04 16:30:58.654321+00', false, 'scheduled', null),
  ('f9000000-0000-4000-8000-000000000012', 'b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Precise short', '2032-03-20 23:00:10.000001+00', '2032-03-20 23:00:40.999999+00', false, 'scheduled', null);

select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'Host', '2032-03-15 10:00', '2032-03-15 13:00', 15)$$,
  'department manager edits an assigned draft');
select extensions.is((select role_title from public.shifts where id = 'f9000000-0000-4000-8000-000000000001'), 'Host', 'role is updated');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000001'), '2032-03-14 23:00+00'::timestamptz, 'start uses venue-local time');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000001'), '2032-03-15 02:00+00'::timestamptz, 'end uses venue-local time');
select extensions.is((select break_minutes from public.shifts where id = 'f9000000-0000-4000-8000-000000000001'), 15, 'break is updated');
select extensions.is((select created_by from public.shifts where id = 'f9000000-0000-4000-8000-000000000001'), 'a9000000-0000-4000-8000-000000000001'::uuid, 'creator is preserved');
select extensions.ok(not (select is_published from public.shifts where id = 'f9000000-0000-4000-8000-000000000001'), 'edited shift remains a draft');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'Host', '2032-03-15 10:00', '2032-03-15 13:00', 15)$$,
  'a draft does not conflict with itself');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'Host', '2032-03-16 11:30', '2032-03-16 12:30', 15)$$,
  'P0001', 'Employee has an overlapping shift', 'cross-department overlaps are rejected');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000001'), '2032-03-14 23:00+00'::timestamptz, 'failed edit leaves the original unchanged');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 'Host', '2032-03-15 10:00', '2032-03-15 13:00', 0)$$,
  'P0001', 'Employee is not eligible for this department', 'unlinked employee is rejected');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000003', 'Host', '2032-03-15 10:00', '2032-03-15 13:00', 0)$$,
  'P0001', 'Employee is not eligible for this department', 'archived employee is rejected');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', null, 'Changed', '2032-03-17 10:00', '2032-03-17 13:00', 0)$$,
  'P0001', 'Published shifts cannot be edited', 'published shift is protected');
select extensions.is((select role_title from public.shifts where id = 'f9000000-0000-4000-8000-000000000002'), 'Published', 'published shift remains unchanged');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000004', null, 'Changed', '2032-03-18 10:00', '2032-03-18 13:00', 0)$$,
  'P0001', 'Shift not found', 'cancelled shifts cannot be edited');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, '', '2032-03-15 10:00', '2032-03-15 13:00', 0)$$,
  'P0001', 'Invalid shift details', 'blank role is rejected');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Host', null, '2032-03-15 13:00', 0)$$,
  'P0001', 'Invalid shift details', 'missing start is rejected');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Host', '2032-03-15 10:00', '2032-03-15 13:00', null)$$,
  'P0001', 'Invalid shift details', 'missing break is rejected');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Host', '2032-03-15 10:00', '2032-03-16 11:00', 0)$$,
  'P0001', 'Invalid shift duration', 'more than 24 hours is rejected');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Closed role', '2032-03-15 10:00', '2032-03-15 13:00', 0)$$,
  'P0001', 'Job role is inactive', 'an inactive role cannot be newly assigned');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Overnight', '2026-10-03 22:00', '2026-10-03 04:00', 0)$$,
  'an edit can make a shift open and cross midnight');
select extensions.is((select employee_id from public.shifts where id = 'f9000000-0000-4000-8000-000000000001'), null::uuid, 'worker may be cleared');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000001'), '2026-10-03 17:00+00'::timestamptz, 'overnight end respects the venue daylight-saving change');
select extensions.lives_ok(
  $$select public.save_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'DST manual', '2026-10-03 22:00', '2026-10-03 04:00', 0)$$,
  'manual creation accepts an overnight spring-forward shift');
select extensions.is((select ends_at from public.shifts where role_title = 'DST manual'),
  '2026-10-03 17:00+00'::timestamptz, 'manual creation uses the same spring-forward end as editing');
select extensions.lives_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'DST automatic', '2026-10-03 22:00', '2026-10-03 04:00', 0)$$,
  'automatic creation accepts an overnight spring-forward shift');
select extensions.is((select ends_at from public.shifts where role_title = 'DST automatic'),
  '2026-10-03 17:00+00'::timestamptz, 'automatic creation uses the same spring-forward end as editing');
select extensions.lives_ok(
  $$select public.save_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'DST fall', '2026-04-04 22:00', '2026-04-04 04:00', 0)$$,
  'manual creation accepts an overnight fall-back shift');
select extensions.is((select ends_at from public.shifts where role_title = 'DST fall'),
  '2026-04-04 18:00+00'::timestamptz, 'overnight end respects the fall-back timezone change');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000005', null, 'First occurrence changed', '2026-04-05 02:30', '2026-04-05 04:00', 0)$$,
  'an edit can preserve a shift starting in the first occurrence of a repeated hour');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000005'),
  '2026-04-04 15:30+00'::timestamptz, 'an unchanged ambiguous start keeps its original instant');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000005'),
  '2026-04-04 18:00+00'::timestamptz, 'an unchanged end keeps its original instant');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000006', null, 'First occurrence both changed', '2026-04-05 02:00', '2026-04-05 02:30', 0)$$,
  'an edit can preserve two times in the first occurrence of a repeated hour');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000006'),
  '2026-04-04 15:00+00'::timestamptz, 'the first ambiguous start is preserved');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000006'),
  '2026-04-04 15:30+00'::timestamptz, 'the first ambiguous end is preserved');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000007', null, 'Repeated equal changed', '2026-04-05 02:30', '2026-04-05 02:30', 0)$$,
  'an edit preserves a shift spanning both occurrences of an equal wall time');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000007'),
  '2026-04-04 15:30+00'::timestamptz, 'equal repeated start retains its first occurrence');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000007'),
  '2026-04-04 16:30+00'::timestamptz, 'equal repeated end retains its second occurrence');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000008', null, 'Repeated backwards changed', '2026-04-05 02:50', '2026-04-05 02:10', 0)$$,
  'an edit preserves a shift whose wall clock moves backwards');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000008'),
  '2026-04-04 15:50+00'::timestamptz, 'backwards-clock start retains its original instant');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000008'),
  '2026-04-04 16:10+00'::timestamptz, 'backwards-clock end retains its original instant');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000009', null, 'Precise changed', '2032-03-20 08:00', '2032-03-20 09:30', 0)$$,
  'an edit of minute-precision form values preserves historical seconds');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000009'),
  '2032-03-19 21:00:31.123456+00'::timestamptz, 'unchanged start retains microseconds');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000009'),
  '2032-03-19 22:30:48.654321+00'::timestamptz, 'unchanged end retains microseconds');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000009', null, 'Precise changed', '2032-03-20 08:15', '2032-03-20 09:30', 0)$$,
  'changing one displayed minute preserves the other endpoint');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000009'),
  '2032-03-19 21:15:00+00'::timestamptz, 'changed start uses the submitted minute');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000009'),
  '2032-03-19 22:30:48.654321+00'::timestamptz, 'unchanged end still retains microseconds');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000009', null, 'Precise changed', '2032-03-20 08:15:12.123', '2032-03-20 09:30:37.5', 0)$$,
  'an API caller can explicitly change seconds');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000009'),
  '2032-03-19 21:15:12.123+00'::timestamptz, 'explicit seconds replace the start');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000009'),
  '2032-03-19 22:30:37.5+00'::timestamptz, 'explicit seconds replace the end');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000010', null, 'Precise overnight changed', '2032-03-21 23:00', '2032-03-21 02:00', 0)$$,
  'overnight normalization preserves unchanged precise endpoints');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000010'),
  '2032-03-21 12:00:45+00'::timestamptz, 'overnight start retains seconds');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000010'),
  '2032-03-21 15:00:50+00'::timestamptz, 'overnight end retains seconds');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000011', null, 'Precise repeated changed', '2026-04-05 02:30', '2026-04-05 02:30', 0)$$,
  'minute-precision values preserve both occurrences of a repeated hour');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000011'),
  '2026-04-04 15:30:21.123456+00'::timestamptz, 'repeated start retains its occurrence and microseconds');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000011'),
  '2026-04-04 16:30:58.654321+00'::timestamptz, 'repeated end retains its occurrence and microseconds');
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000012', null, 'Precise short changed', '2032-03-21 10:00', '2032-03-21 10:00', 0)$$,
  'a short historical shift within one displayed minute remains short');
select extensions.is((select starts_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000012'),
  '2032-03-20 23:00:10.000001+00'::timestamptz, 'short shift start retains microseconds');
select extensions.is((select ends_at from public.shifts where id = 'f9000000-0000-4000-8000-000000000012'),
  '2032-03-20 23:00:40.999999+00'::timestamptz, 'short shift end retains microseconds');
select extensions.lives_ok(
  $$select public.save_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Fall default', '2026-04-05 02:30', '2026-04-05 04:00', 0)$$,
  'a newly entered repeated local time uses the standard-time occurrence');
select extensions.is((select starts_at from public.shifts where role_title = 'Fall default'),
  '2026-04-04 16:30+00'::timestamptz, 'new ambiguous times use the later Sydney occurrence');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Invalid', '2026-10-04 02:30', '2026-10-04 04:00', 0)$$,
  'P0001', 'Start time does not exist in venue timezone', 'editing rejects a skipped spring-forward start');
select extensions.throws_ok(
  $$select public.save_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Invalid', '2026-10-04 02:30', '2026-10-04 04:00', 0)$$,
  'P0001', 'Start time does not exist in venue timezone', 'manual creation rejects a skipped spring-forward start');
select extensions.throws_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Invalid', '2026-10-04 02:30', '2026-10-04 04:00', 0)$$,
  'P0001', 'Start time does not exist in venue timezone', 'automatic creation rejects a skipped spring-forward start');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Invalid', '2026-10-04 00:30', '2026-10-04 02:30', 0)$$,
  'P0001', 'End time does not exist in venue timezone', 'editing rejects a skipped spring-forward end');
select extensions.throws_ok(
  $$select public.save_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Invalid', '2026-10-04 00:30', '2026-10-04 02:30', 0)$$,
  'P0001', 'End time does not exist in venue timezone', 'manual creation rejects a skipped spring-forward end');
select extensions.throws_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Invalid', '2026-10-04 00:30', '2026-10-04 02:30', 0)$$,
  'P0001', 'End time does not exist in venue timezone', 'automatic creation rejects a skipped spring-forward end');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Invalid', '2032-03-15 10:00', '2032-03-14 11:00', 0)$$,
  'P0001', 'End date cannot be before start date', 'editing rejects an earlier end date');
select extensions.throws_ok(
  $$select public.save_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, 'Invalid', '2032-03-15 10:00', '2032-03-14 11:00', 0)$$,
  'P0001', 'End date cannot be before start date', 'manual creation rejects an earlier end date');
select extensions.throws_ok(
  $$select public.save_shift_auto_assign('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'Invalid', '2032-03-15 10:00', '2032-03-14 11:00', 0)$$,
  'P0001', 'End date cannot be before start date', 'automatic creation rejects an earlier end date');
select extensions.throws_ok(
  $$select * from public.shift_time_bounds('UTC', '2032-03-15 10:00', '2032-03-15 11:00')$$,
  '42501', 'permission denied for function shift_time_bounds', 'the internal time helper is not directly exposed');
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Denied', '2032-03-15 10:00', '2032-03-15 13:00', 0)$$,
  'P0001', 'Shift not found', 'a mismatched venue cannot be used to edit the shift');
reset role;
update public.departments set active = false where id = 'd9000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Denied', '2032-03-15 10:00', '2032-03-15 13:00', 0)$$,
  'P0001', 'Department is inactive', 'an inactive department cannot receive edited shifts');
reset role;
update public.departments set active = true where id = 'd9000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000003', null, 'Denied', '2032-03-16 11:00', '2032-03-16 14:00', 0)$$,
  'P0001', 'Permission denied', 'department manager cannot edit another department');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Denied', '2032-03-15 10:00', '2032-03-15 13:00', 0)$$,
  'P0001', 'Permission denied', 'employee cannot edit a draft');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Denied', '2032-03-15 10:00', '2032-03-15 13:00', 0)$$,
  'P0001', 'Permission denied', 'another business owner cannot edit the shift');
select set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'Owner edit', '2032-03-15 09:00', '2032-03-15 12:00', 0)$$,
  'owner can reassign and edit the draft');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.update_draft_shift('b9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', null, 'Denied', '2032-03-15 10:00', '2032-03-15 13:00', 0)$$,
  '42501', 'permission denied for function update_draft_shift', 'anonymous editing is denied');
select * from extensions.finish();
rollback;
