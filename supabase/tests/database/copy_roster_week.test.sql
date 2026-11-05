begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(47);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2000000-0000-4000-8000-000000000001', 'copy-owner@example.test', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000002', 'copy-foh@example.test', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000003', 'copy-boh@example.test', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000004', 'copy-worker@example.test', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000005', 'copy-cook@example.test', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000006', 'copy-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b2000000-0000-4000-8000-000000000001', 'Copy business'),
  ('b2000000-0000-4000-8000-000000000002', 'Outside business');
insert into public.venues (id, business_id, name, timezone) values
  ('c2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'Second', 'UTC'),
  ('c2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'FOH'),
  ('d2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'BOH'),
  ('d2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'Other venue'),
  ('d2000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'foh_manager', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'boh_manager', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004', 'employee', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000005', 'employee', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004', 'Copy worker', 'Server'),
  ('e2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000005', 'Copy cook', 'Cook'),
  ('e2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000003', null, 'Linked worker', 'Server');
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title,
  starts_at, ends_at, break_minutes, is_published, requires_acknowledgement
) values
  ('f2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', null, 'Open shift',
    '2032-03-29 12:00:31.123456+11', '2032-03-29 14:00:48.654321+11', 0, false, false),
  ('f2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Server',
    '2032-03-29 09:00+11', '2032-03-29 11:00+11', 15, true, true),
  ('f2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'Cook',
    '2032-03-29 09:00+11', '2032-03-29 11:00+11', 0, false, false);

set local role anon;
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-05', '12000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot copy a roster');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-05', '12000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot copy a roster');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000006', true);
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-05', '12000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'an outside owner cannot copy another tenant');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-05', '12000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a BOH manager cannot copy FOH');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-05', '12000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Venue or active department not found', 'an owner cannot pair another tenant venue with their department');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-30', '2032-04-05', '12000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Invalid roster weeks', 'source dates must start on Monday');
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-03-29', '12000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Invalid roster weeks', 'source and target weeks must differ');
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-05', null)$$,
  'P0001', 'Invalid roster weeks', 'copy requests require an idempotency key');
select extensions.throws_ok(
  $$select count(*) from public.roster_copy_requests$$,
  '42501', null, 'copy receipts are not directly readable by ordinary users');
select extensions.is(
  public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-05', '12000000-0000-4000-8000-000000000001'),
  2, 'the scoped manager copies both assigned and open FOH shifts');
select extensions.is(
  (select count(*)::integer from public.shifts
    where department_id = 'd2000000-0000-4000-8000-000000000001'
      and (starts_at at time zone 'Australia/Sydney')::date between '2032-04-05' and '2032-04-11'),
  2, 'the target week has exactly two copied shifts');
select extensions.is(
  (select count(*)::integer from public.shifts
    where department_id = 'd2000000-0000-4000-8000-000000000002'
      and (starts_at at time zone 'Australia/Sydney')::date between '2032-04-05' and '2032-04-11'),
  0, 'copying FOH does not copy BOH');
select extensions.ok(
  (select bool_and(not is_published and published_at is null)
    from public.shifts where department_id = 'd2000000-0000-4000-8000-000000000001'
      and (starts_at at time zone 'Australia/Sydney')::date between '2032-04-05' and '2032-04-11'),
  'all copies are private drafts, including copies of published shifts');
select extensions.ok(
  (select starts_at = timestamptz '2032-04-05 09:00+10'
    and ends_at = timestamptz '2032-04-05 11:00+10'
    and break_minutes = 15 and requires_acknowledgement
    from public.shifts where role_title = 'Server'
      and (starts_at at time zone 'Australia/Sydney')::date = '2032-04-05'),
  'local wall times, break and acknowledgement requirement survive the DST transition');
select extensions.ok(
  (select employee_id is null and not requires_acknowledgement
    from public.shifts where role_title = 'Open shift'
      and (starts_at at time zone 'Australia/Sydney')::date = '2032-04-05'),
  'an open shift remains unassigned');
select extensions.ok(
  (select starts_at = timestamptz '2032-04-05 12:00:31.123456+10'
    and ends_at = timestamptz '2032-04-05 14:00:48.654321+10'
    from public.shifts where role_title = 'Open shift'
      and (starts_at at time zone 'Australia/Sydney')::date = '2032-04-05'),
  'copying retains historical sub-minute timestamp precision');
select extensions.is(
  public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-05', '12000000-0000-4000-8000-000000000001'),
  2, 'retrying the same request returns its original result');
select extensions.is(
  (select count(*)::integer from public.shifts where department_id = 'd2000000-0000-4000-8000-000000000001'
    and (starts_at at time zone 'Australia/Sydney')::date between '2032-04-05' and '2032-04-11'),
  2, 'retry does not duplicate assigned or open shifts');
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-12', '12000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Request identifier already used', 'a request identifier cannot be reused for another target');
select extensions.is(
  (select count(*)::integer from public.roster_publications where business_id = 'b2000000-0000-4000-8000-000000000001'),
  0, 'copying does not publish a roster');
reset role;
select extensions.is(
  (select count(*)::integer from public.roster_publication_recipients r
    join public.roster_publications p on p.id = r.publication_id
    where p.business_id = 'b2000000-0000-4000-8000-000000000001'),
  0, 'copying does not notify employees');
set local role authenticated;
select set_config('test.copied_shift', (
  select id::text from public.shifts where role_title = 'Server'
    and (starts_at at time zone 'Australia/Sydney')::date = '2032-04-05'
), true);
select extensions.lives_ok(
  $$select public.update_draft_shift('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', current_setting('test.copied_shift')::uuid,
    'e2000000-0000-4000-8000-000000000001', 'Server', '2032-04-05 09:00', '2032-04-05 11:00', 20)$$,
  'a copied shift is editable before publication');
select extensions.is(
  (select break_minutes from public.shifts where id = current_setting('test.copied_shift')::uuid),
  20, 'editing a copied draft persists');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::integer from public.shifts where id = current_setting('test.copied_shift')::uuid),
  0, 'the employee cannot inspect a copied draft');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select extensions.is(
  public.publish_roster('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-04-05'),
  2, 'copied drafts can be explicitly published');
select extensions.is(
  (select count(*)::integer from public.roster_publications where business_id = 'b2000000-0000-4000-8000-000000000001'),
  1, 'publication creates a version only after the explicit action');
reset role;
select extensions.is(
  (select count(*)::integer from public.roster_publication_recipients r
    join public.roster_publications p on p.id = r.publication_id
    where p.business_id = 'b2000000-0000-4000-8000-000000000001'),
  1, 'publication then creates one employee notification');

insert into public.employee_availability_exceptions (
  id, business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status
) values (
  'f3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
  '2032-04-12', '2032-04-12', 'leave', 'approved'
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-12', '12000000-0000-4000-8000-000000000002')$$,
  'P0001', 'An employee is unavailable for a copied shift', 'approved leave is revalidated for the target dates');
select extensions.is(
  (select count(*)::integer from public.shifts where department_id = 'd2000000-0000-4000-8000-000000000001'
    and (starts_at at time zone 'Australia/Sydney')::date between '2032-04-12' and '2032-04-18'),
  0, 'a later invalid assignment rolls back earlier open-shift copies');
reset role;
insert into public.employee_availability_patterns (employee_id, business_id, venue_id) values (
  'e2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-19', '12000000-0000-4000-8000-000000000003')$$,
  'P0001', 'An employee is unavailable for a copied shift', 'recurring availability is revalidated');
reset role;
delete from public.employee_availability_patterns where employee_id = 'e2000000-0000-4000-8000-000000000001';
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at
) values (
  'f2000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001', 'Existing', '2032-04-26 10:00+10', '2032-04-26 12:00+10'
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-04-26', '12000000-0000-4000-8000-000000000004')$$,
  'P0001', 'A copied shift overlaps an existing shift', 'target-week overlap is revalidated');
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select public.link_shared_worker_profiles('b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000003')$$,
  'the owner confirms a worker profile in another venue');
reset role;
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at
) values (
  'f2000000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000003',
  'e2000000-0000-4000-8000-000000000003', 'Private cross-venue shift',
  '2032-05-02 23:30+00', '2032-05-03 01:00+00'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-05-03', '12000000-0000-4000-8000-000000000005')$$,
  'P0001', 'A copied shift overlaps an existing shift', 'linked cross-venue overlaps are blocked without revealing the other shift');
reset role;
insert into public.job_roles (business_id, venue_id, department_id, name, restrict_manual_assignment) values (
  'b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001', 'Server', true
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-05-10', '12000000-0000-4000-8000-000000000006')$$,
  'P0001', 'Employee is not qualified for this role', 'manual role eligibility is revalidated');
select extensions.is(
  public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-06-07', '2032-06-14', '12000000-0000-4000-8000-000000000007'),
  0, 'an empty source week creates no shifts');
reset role;
update public.job_roles set restrict_manual_assignment = false
where business_id = 'b2000000-0000-4000-8000-000000000001' and name = 'Server';
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at
) values (
  'f9000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
  null, 'Repeated local time', '2032-04-04 02:45+11', '2032-04-04 02:15+10'
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-05-17', '12000000-0000-4000-8000-000000000008')$$,
  'P0001', 'A source shift crosses a clock change and cannot be copied safely',
  'a shift spanning repeated wall time is not silently lengthened to an overnight shift');
select extensions.is(
  (select count(*)::integer from public.shifts where department_id = 'd2000000-0000-4000-8000-000000000001'
    and (starts_at at time zone 'Australia/Sydney')::date between '2032-05-17' and '2032-05-23'),
  0, 'a repeated-time failure rolls back copies created earlier in the request');
reset role;
delete from public.shifts where id = 'f9000000-0000-4000-8000-000000000001';
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at
) values (
  'f9000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
  null, 'Longer repeated-time shift', '2032-04-04 01:30+11', '2032-04-04 03:30+10'
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-29', '2032-05-24', '12000000-0000-4000-8000-000000000010')$$,
  'P0001', 'A source shift crosses a clock change and cannot be copied safely',
  'a fall-back source shift is rejected even when its local end is after its start');
select extensions.is(
  (select count(*)::integer from public.shifts where department_id = 'd2000000-0000-4000-8000-000000000001'
    and (starts_at at time zone 'Australia/Sydney')::date between '2032-05-24' and '2032-05-30'),
  0, 'the whole request rolls back after a longer fall-back source shift');
reset role;
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at
) values (
  'fa000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
  null, 'Spring transition', '2032-09-26 02:30+10', '2032-09-26 03:30+10'
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-09-20', '2032-09-27', '12000000-0000-4000-8000-000000000009')$$,
  'P0001', 'Start time does not exist in venue timezone',
  'a source time that falls in the spring-forward gap is rejected');
select extensions.is(
  (select count(*)::integer from public.shifts where department_id = 'd2000000-0000-4000-8000-000000000001'
    and (starts_at at time zone 'Australia/Sydney')::date between '2032-09-27' and '2032-10-03'),
  0, 'a nonexistent target time creates no shifts');
reset role;
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at
) values
  ('fa000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
    null, 'Spring source span', '2032-10-03 01:30+10', '2032-10-03 04:30+11'),
  ('fa000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
    null, 'Fall target span', '2032-03-21 01:30+11', '2032-03-21 03:30+11'),
  ('fa000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
    null, 'Spring target span', '2032-09-19 01:30+10', '2032-09-19 04:30+10');
set local role authenticated;
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-09-27', '2032-10-11', '12000000-0000-4000-8000-000000000011')$$,
  'P0001', 'A source shift crosses a clock change and cannot be copied safely',
  'a spring-forward source shift is not silently lengthened in the target week');
select extensions.is(
  (select count(*)::integer from public.shifts where department_id = 'd2000000-0000-4000-8000-000000000001'
    and (starts_at at time zone 'Australia/Sydney')::date between '2032-10-11' and '2032-10-17'),
  0, 'a spring-forward source shift creates no target drafts');
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-03-15', '2032-03-29', '12000000-0000-4000-8000-000000000012')$$,
  'P0001', 'A copied shift crosses a clock change and cannot be copied safely',
  'a shift that would span fall-back in the target week is rejected');
select extensions.is(
  (select count(*)::integer from public.shifts where role_title = 'Fall target span'
    and (starts_at at time zone 'Australia/Sydney')::date between '2032-03-29' and '2032-04-04'),
  0, 'a fall-back target span creates no draft');
select extensions.throws_ok(
  $$select public.copy_roster_week('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', '2032-09-13', '2032-09-27', '12000000-0000-4000-8000-000000000013')$$,
  'P0001', 'A copied shift crosses a clock change and cannot be copied safely',
  'a shift that would span spring-forward in the target week is rejected');
select extensions.is(
  (select count(*)::integer from public.shifts where role_title = 'Spring target span'
    and (starts_at at time zone 'Australia/Sydney')::date between '2032-09-27' and '2032-10-03'),
  0, 'a spring-forward target span creates no draft');

select * from extensions.finish();
rollback;
