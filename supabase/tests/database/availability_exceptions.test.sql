begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(44);

insert into auth.users (id, email, raw_user_meta_data) values
  ('af000000-0000-4000-8000-000000000001', 'exceptions-owner@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000002', 'exceptions-foh@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000003', 'exceptions-boh@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000004', 'exceptions-worker@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000005', 'exceptions-other-worker@example.test', '{}'::jsonb),
  ('af000000-0000-4000-8000-000000000006', 'exceptions-outsider@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('bf000000-0000-4000-8000-000000000001', 'Exceptions business'),
  ('bf000000-0000-4000-8000-000000000002', 'Other exceptions business');
insert into public.venues (id, business_id, name, timezone) values
  ('cf000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-000000000001', 'Main', 'Australia/Sydney'),
  ('cf000000-0000-4000-8000-000000000002', 'bf000000-0000-4000-8000-000000000002', 'Other', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('df000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'FOH'),
  ('df000000-0000-4000-8000-000000000002', 'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'BOH'),
  ('df000000-0000-4000-8000-000000000003', 'bf000000-0000-4000-8000-000000000002', 'cf000000-0000-4000-8000-000000000002', 'Other');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000002', 'foh_manager', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001'),
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000003', 'boh_manager', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000002'),
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000004', 'employee', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001'),
  ('bf000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000005', 'employee', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000002'),
  ('bf000000-0000-4000-8000-000000000002', 'af000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('ef000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000004', 'FOH worker', 'Server'),
  ('ef000000-0000-4000-8000-000000000002', 'bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'df000000-0000-4000-8000-000000000002', 'af000000-0000-4000-8000-000000000005', 'BOH worker', 'Chef'),
  ('ef000000-0000-4000-8000-000000000003', 'bf000000-0000-4000-8000-000000000002', 'cf000000-0000-4000-8000-000000000002', 'df000000-0000-4000-8000-000000000003', null, 'Outside worker', 'Server');

select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '2032-03-15', '2032-03-16', 'unavailable')$$,
  'employee can block a local date range');
select extensions.is(
  (select status from public.employee_availability_exceptions where exception_type = 'unavailable'),
  'active', 'a date block is effective immediately');
select extensions.lives_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '2032-03-17', '2032-03-18', 'leave')$$,
  'employee can request leave');
select extensions.is(
  (select status from public.employee_availability_exceptions where starts_on = '2032-03-17'),
  'pending', 'leave begins pending');
select extensions.is(
  (select created_by from public.employee_availability_exceptions where starts_on = '2032-03-17'),
  'af000000-0000-4000-8000-000000000004'::uuid, 'request creator is recorded');
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '2032-03-18', '2032-03-17', 'leave')$$,
  'P0001', 'Invalid availability exception', 'an end before the start is rejected');
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '2032-01-01', '2033-01-02', 'leave')$$,
  'P0001', 'Invalid availability exception', 'ranges longer than 366 inclusive days are rejected');
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '-infinity', 'infinity', 'leave')$$,
  'P0001', 'Invalid availability exception', 'infinite dates are rejected');
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', null, '2032-03-17', 'leave')$$,
  'P0001', 'Invalid availability exception', 'missing dates are rejected');
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '2032-03-17', '2032-03-17', 'approved')$$,
  'P0001', 'Invalid availability exception', 'a caller cannot choose an approval status');
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000002', '2032-03-17', '2032-03-17', 'leave')$$,
  'P0001', 'Permission denied', 'employee cannot request for another worker');
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000001', '2032-03-17', '2032-03-17', 'leave')$$,
  'P0001', 'Permission denied', 'employee cannot forge the venue');
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000002', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '2032-03-17', '2032-03-17', 'leave')$$,
  'P0001', 'Permission denied', 'employee cannot forge the business');
select extensions.throws_ok(
  $$update public.employee_availability_exceptions set status = 'approved'$$,
  '42501', null, 'direct writes are denied');
select extensions.throws_ok(
  $$select public.review_leave_request('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where starts_on = '2032-03-17'), 'approved')$$,
  'P0001', 'Permission denied', 'an employee cannot approve their own request');
select extensions.lives_ok(
  $$select public.cancel_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where starts_on = '2032-03-17'))$$,
  'employee can cancel a pending request');
select extensions.is(
  (select status from public.employee_availability_exceptions where starts_on = '2032-03-17'),
  'cancelled', 'cancelled request remains visible');
select extensions.throws_ok(
  $$select public.cancel_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where starts_on = '2032-03-17'))$$,
  'P0001', 'Availability exception can no longer be cancelled', 'repeated cancellation is rejected');
select extensions.lives_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '2032-03-19', '2032-03-20', 'leave')$$,
  'employee can submit another request');
select set_config('test.leave_request', (select id::text from public.employee_availability_exceptions
  where starts_on = '2032-03-19'), true);

select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.employee_availability_exceptions), 0,
  'another department cannot view the exceptions');
select extensions.throws_ok(
  $$select public.review_leave_request('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    current_setting('test.leave_request')::uuid, 'approved')$$,
  'P0001', 'Permission denied', 'a manager cannot review an inaccessible request');
select extensions.throws_ok(
  $$select public.cancel_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    current_setting('test.leave_request')::uuid)$$,
  'P0001', 'Permission denied', 'another department cannot cancel the actual request');

select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.employee_availability_exceptions), 3,
  'a scoped manager can view the employee exceptions');
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '2032-03-21', '2032-03-21', 'leave')$$,
  'P0001', 'Permission denied', 'a manager cannot submit as the employee');
select extensions.throws_ok(
  $$select public.review_leave_request('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where exception_type = 'unavailable'), 'approved')$$,
  'P0001', 'Leave request can no longer be changed', 'a date block is not a leave request');
select extensions.throws_ok(
  $$select public.review_leave_request('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where starts_on = '2032-03-17'), 'approved')$$,
  'P0001', 'Leave request can no longer be changed', 'a cancelled request cannot be approved');
select extensions.throws_ok(
  $$select public.review_leave_request('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    current_setting('test.leave_request')::uuid, 'pending')$$,
  'P0001', 'Leave request can no longer be changed', 'a manager cannot forge a transition');
select extensions.lives_ok(
  $$select public.review_leave_request('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where starts_on = '2032-03-19'), 'approved')$$,
  'scoped manager approves a pending request');
select extensions.is(
  (select status from public.employee_availability_exceptions where starts_on = '2032-03-19'),
  'approved', 'approved status is stored');
select extensions.is(
  (select updated_by from public.employee_availability_exceptions where starts_on = '2032-03-19'),
  'af000000-0000-4000-8000-000000000002'::uuid, 'reviewer is recorded');
select extensions.throws_ok(
  $$select public.review_leave_request('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where starts_on = '2032-03-19'), 'rejected')$$,
  'P0001', 'Leave request can no longer be changed', 'a resolved request cannot be decided again');

select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select status from public.employee_availability_exceptions where starts_on = '2032-03-19'),
  'approved', 'employee sees the approved status');
select extensions.throws_ok(
  $$select public.cancel_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where starts_on = '2032-03-19'))$$,
  'P0001', 'Availability exception can no longer be cancelled', 'employee cannot unilaterally cancel approved leave');
select extensions.lives_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '2032-03-22', '2032-03-22', 'leave')$$,
  'employee can submit a request to be rejected');
select extensions.lives_ok(
  $$select public.cancel_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where exception_type = 'unavailable'))$$,
  'employee can remove a date block');

select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000002', true);
select extensions.lives_ok(
  $$select public.review_leave_request('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where starts_on = '2032-03-22'), 'rejected')$$,
  'scoped manager rejects a pending request');
select extensions.lives_ok(
  $$select public.review_leave_request('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    (select id from public.employee_availability_exceptions where starts_on = '2032-03-19'), 'cancelled')$$,
  'manager can cancel approved leave explicitly');
select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select status from public.employee_availability_exceptions where starts_on = '2032-03-22'),
  'rejected', 'employee sees the rejected status');
select extensions.is(
  (select status from public.employee_availability_exceptions where starts_on = '2032-03-19'),
  'cancelled', 'employee sees cancellation of approved leave');

select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000006', true);
select extensions.is((select count(*)::integer from public.employee_availability_exceptions), 0,
  'another business cannot view any exception');
select extensions.throws_ok(
  $$select public.review_leave_request('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    current_setting('test.leave_request')::uuid, 'approved')$$,
  'P0001', 'Permission denied', 'another business cannot review a request');
select extensions.throws_ok(
  $$select public.cancel_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    current_setting('test.leave_request')::uuid)$$,
  'P0001', 'Permission denied', 'another business cannot cancel the actual request');
reset role;
update public.employees set active = false where id = 'ef000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', 'af000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001',
    'ef000000-0000-4000-8000-000000000001', '2032-03-17', '2032-03-17', 'leave')$$,
  'P0001', 'Permission denied', 'an archived employee cannot submit exceptions');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.request_availability_exception('bf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000001', '2032-03-17', '2032-03-17', 'leave')$$,
  '42501', null, 'anonymous users cannot invoke the request RPC');
select * from extensions.finish();
rollback;
