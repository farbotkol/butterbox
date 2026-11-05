begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(48);

insert into auth.users (id, email, raw_user_meta_data) values
  ('af000000-0000-4000-8000-000000000001', 'offline-owner@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000002', 'offline-foh@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000003', 'offline-boh@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000004', 'offline-worker@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000005', 'offline-colleague@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000006', 'offline-outside@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000007', 'offline-secondary@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('bf000000-0000-4000-8000-000000000001', 'Offline cafe'),
  ('bf000000-0000-4000-8000-000000000002', 'Outside cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('cf000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-000000000001', 'Main', 'UTC'),
  ('cf000000-0000-4000-8000-000000000002', 'bf000000-0000-4000-8000-000000000001', 'Other venue', 'UTC'),
  ('cf000000-0000-4000-8000-000000000003', 'bf000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('df000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'FOH'),
  ('df000000-0000-4000-8000-000000000002', 'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'BOH'),
  ('df000000-0000-4000-8000-000000000003', 'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000002', 'Other venue');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000002', 'foh_manager', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001'),
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000003', 'boh_manager', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000002'),
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000004', 'employee', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001'),
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000005', 'employee', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001'),
  ('bf000000-0000-4000-8000-000000000002', 'af000000-0000-4000-8000-000000000006', 'owner', null, null),
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000007', 'employee', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000002');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('ef000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000004', 'Worker', 'Server'),
  ('ef000000-0000-4000-8000-000000000002', 'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000005', 'Colleague', 'Server'),
  ('ef000000-0000-4000-8000-000000000003', 'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000007', 'Secondary', 'Cook');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('bf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000003', 'df000000-0000-4000-8000-000000000002');

set local role anon;
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'clock_in', '2020-01-01 09:00+00')$$,
  '42501', null, 'anonymous callers cannot submit offline claims');
select extensions.throws_ok(
  $$select * from public.attendance_offline_claims$$,
  '42501', null, 'anonymous callers cannot read offline claims');
select extensions.throws_ok(
  $$select * from public.list_attendance_offline_claims(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot list offline claims');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000002', 'cf000000-0000-4000-8000-000000000003',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'clock_in', '2020-01-01 09:00+00')$$,
  'P0001', 'Permission denied', 'a worker cannot submit into another business');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000005', '1f000000-0000-4000-8000-000000000001',
    'clock_in', '2020-01-01 09:00+00')$$,
  'P0001', 'Permission denied', 'a stale device cannot submit as a different signed-in user');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000002',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'clock_in', '2020-01-01 09:00+00')$$,
  'P0001', 'Employee not found or permission denied', 'a worker cannot claim for a colleague');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000002',
    'df000000-0000-4000-8000-000000000003', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'clock_in', '2020-01-01 09:00+00')$$,
  'P0001', 'Employee not found or permission denied', 'a worker cannot claim at another venue');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'clock_in', '2020-01-01 09:00+00')$$,
  'P0001', 'Employee not found or permission denied', 'a worker cannot claim in another department');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'break_start', '2020-01-01 09:00+00')$$,
  'P0001', 'Invalid offline attendance claim', 'unsupported claim types are rejected');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'clock_in', 'infinity')$$,
  'P0001', 'Invalid offline attendance claim', 'non-finite claimed times are rejected');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', null, 'clock_in', '2020-01-01 09:00+00')$$,
  'P0001', 'Invalid offline attendance claim', 'a request identifier is required');

select extensions.lives_ok(
  $$select set_config('test.offline_claim', claim_id::text, true)
    from public.submit_attendance_offline_claim(
      'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
      'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
      'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
      'clock_in', '2020-01-01 09:00+00')$$,
  'a linked employee can submit an offline clock-in claim');
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claims),
  1, 'the employee sees the recorded claim');
select extensions.is(
  (select actor_id from public.attendance_offline_claims where id = current_setting('test.offline_claim')::uuid),
  'af000000-0000-4000-8000-000000000004'::uuid, 'the authenticated actor is retained');
select extensions.is(
  (select claimed_at from public.attendance_offline_claims where id = current_setting('test.offline_claim')::uuid),
  '2020-01-01 09:00+00'::timestamptz, 'the original claimed time is retained exactly');
select extensions.ok(
  (select received_at between clock_timestamp() - interval '1 minute' and clock_timestamp() + interval '1 second'
    from public.attendance_offline_claims where id = current_setting('test.offline_claim')::uuid),
  'the confirmed time is generated by the server');
select extensions.ok(
  (select received_at > claimed_at from public.attendance_offline_claims
    where id = current_setting('test.offline_claim')::uuid),
  'a delayed submission retains both times independently');
select extensions.is(
  (select count(*)::integer from public.attendance_events),
  0, 'a claim does not silently create or change a payroll source event');
select set_config('test.offline_received', (
  select received_at::text from public.attendance_offline_claims
  where id = current_setting('test.offline_claim')::uuid
), true);
select extensions.is(
  (select claim_id::text from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'clock_in', '2020-01-01 09:00+00')),
  current_setting('test.offline_claim'), 'an identical retry returns the original claim');
select extensions.is(
  (select received_at::text from public.attendance_offline_claims
    where id = current_setting('test.offline_claim')::uuid),
  current_setting('test.offline_received'), 'a retry preserves the original server receipt time');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'clock_out', '2020-01-01 09:00+00')$$,
  'P0001', 'Request identifier already used', 'a retry cannot change the event type');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'clock_in', '2020-01-01 10:00+00')$$,
  'P0001', 'Request identifier already used', 'a retry cannot change the claimed time');
select extensions.throws_ok(
  $$insert into public.attendance_offline_claims
    (business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, claimed_at)
    values ('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
      'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
      'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000002',
      'clock_in', '2020-01-01 09:00+00')$$,
  '42501', null, 'employees cannot bypass the scoped submission function');
select extensions.throws_ok(
  $$update public.attendance_offline_claims set claimed_at = now()$$,
  '42501', null, 'employees cannot update claimed times');
select extensions.throws_ok(
  $$delete from public.attendance_offline_claims$$,
  '42501', null, 'employees cannot delete claims');
select extensions.lives_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000002',
    'clock_out', '2020-01-01 17:00+00')$$,
  'an offline clock-out can be recorded independently');
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claims),
  2, 'distinct offline events remain distinct');
select extensions.is(
  (select count(*)::integer from public.list_attendance_offline_claims(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001')),
  2, 'employees can list their own claims with scoped names');
select extensions.throws_ok(
  $$select * from public.list_attendance_offline_claims(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Permission denied', 'employees cannot list claims at another venue');

select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claims),
  2, 'the scoped FOH manager can review the claims');
select extensions.is(
  (select count(*)::integer from public.list_attendance_offline_claims(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001')),
  2, 'the manager list includes only claims in scope');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000002', '1f000000-0000-4000-8000-000000000003',
    'clock_in', '2020-01-01 09:00+00')$$,
  'P0001', 'Employee not found or permission denied', 'a manager cannot impersonate the worker');
select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claims),
  0, 'a BOH manager cannot view FOH claims');
select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000005', true);
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claims),
  0, 'a colleague cannot view another employee claim');
select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000006', true);
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claims),
  0, 'another business cannot view the claims');

select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000007', true);
select extensions.is(
  public.can_view_department('bf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001'),
  false, 'the secondary-department worker cannot view their primary department');
select extensions.lives_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000003',
    'af000000-0000-4000-8000-000000000007', '1f000000-0000-4000-8000-000000000005',
    'clock_in', '2020-01-02 09:00+00')$$,
  'a worker can submit in an authorized secondary department');
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claims),
  1, 'the worker can see their own secondary-department claim');
select extensions.is(
  (select count(*)::integer from public.list_attendance_offline_claims(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001')),
  1, 'the scoped list exposes the worker secondary-department claim');
select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claims),
  1, 'the BOH manager can see only the secondary-department claim');
select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claims),
  2, 'the FOH manager cannot see the BOH claim');
reset role;
delete from public.employee_departments
where employee_id = 'ef000000-0000-4000-8000-000000000003'
  and department_id = 'df000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000007', true);
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claims),
  0, 'a removed secondary link no longer grants employee access');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000003',
    'af000000-0000-4000-8000-000000000007', '1f000000-0000-4000-8000-000000000006',
    'clock_out', '2020-01-02 17:00+00')$$,
  'P0001', 'Employee or department is unavailable', 'new claims are rejected after a secondary link is removed');

set local role service_role;
select extensions.throws_ok(
  $$select * from public.attendance_offline_claims$$,
  '42501', null, 'the service role cannot read claims directly');
reset role;
select extensions.throws_ok(
  $$update public.attendance_offline_claims set claimed_at = now()$$,
  'P0001', 'Original attendance records are immutable', 'the original claim is immutable even for a privileged update');
select extensions.throws_ok(
  $$delete from public.attendance_offline_claims$$,
  'P0001', 'Original attendance records are immutable', 'the original claim cannot be deleted while its business exists');
update public.employees set active = false where id = 'ef000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select claim_id::text from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000001',
    'clock_in', '2020-01-01 09:00+00')),
  current_setting('test.offline_claim'), 'an already received claim can be retried after archival');
select extensions.throws_ok(
  $$select * from public.submit_attendance_offline_claim(
    'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'df000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001',
    'af000000-0000-4000-8000-000000000004', '1f000000-0000-4000-8000-000000000004',
    'clock_in', '2020-01-02 09:00+00')$$,
  'P0001', 'Employee or department is unavailable', 'an archived employee cannot submit a new claim');

select * from extensions.finish();
rollback;
