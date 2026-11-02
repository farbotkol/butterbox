begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5800000-0000-4000-8000-000000000001', 'swap-owner@example.test', '{}'::jsonb),
  ('a5800000-0000-4000-8000-000000000002', 'swap-foh@example.test', '{}'::jsonb),
  ('a5800000-0000-4000-8000-000000000003', 'swap-boh@example.test', '{}'::jsonb),
  ('a5800000-0000-4000-8000-000000000004', 'swap-ann@example.test', '{}'::jsonb),
  ('a5800000-0000-4000-8000-000000000005', 'swap-ben@example.test', '{}'::jsonb),
  ('a5800000-0000-4000-8000-000000000006', 'swap-cat@example.test', '{}'::jsonb),
  ('a5800000-0000-4000-8000-000000000007', 'swap-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b5800000-0000-4000-8000-000000000001', 'Swap cafe'),
  ('b5800000-0000-4000-8000-000000000002', 'Other cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c5800000-0000-4000-8000-000000000001', 'b5800000-0000-4000-8000-000000000001', 'First', 'UTC'),
  ('c5800000-0000-4000-8000-000000000002', 'b5800000-0000-4000-8000-000000000001', 'Second', 'UTC'),
  ('c5800000-0000-4000-8000-000000000003', 'b5800000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d5800000-0000-4000-8000-000000000001', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'FOH'),
  ('d5800000-0000-4000-8000-000000000002', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'BOH'),
  ('d5800000-0000-4000-8000-000000000003', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000002', 'FOH'),
  ('d5800000-0000-4000-8000-000000000004', 'b5800000-0000-4000-8000-000000000002', 'c5800000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b5800000-0000-4000-8000-000000000001', 'a5800000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b5800000-0000-4000-8000-000000000001', 'a5800000-0000-4000-8000-000000000002', 'foh_manager', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001'),
  ('b5800000-0000-4000-8000-000000000001', 'a5800000-0000-4000-8000-000000000003', 'boh_manager', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000002'),
  ('b5800000-0000-4000-8000-000000000001', 'a5800000-0000-4000-8000-000000000004', 'employee', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001'),
  ('b5800000-0000-4000-8000-000000000001', 'a5800000-0000-4000-8000-000000000005', 'employee', null, null),
  ('b5800000-0000-4000-8000-000000000001', 'a5800000-0000-4000-8000-000000000006', 'employee', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001'),
  ('b5800000-0000-4000-8000-000000000002', 'a5800000-0000-4000-8000-000000000007', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e5800000-0000-4000-8000-000000000001', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'a5800000-0000-4000-8000-000000000004', 'Ann', 'Barista'),
  ('e5800000-0000-4000-8000-000000000002', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'a5800000-0000-4000-8000-000000000005', 'Ben', 'Barista'),
  ('e5800000-0000-4000-8000-000000000003', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'a5800000-0000-4000-8000-000000000006', 'Cat', 'Barista'),
  ('e5800000-0000-4000-8000-000000000004', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000002', 'd5800000-0000-4000-8000-000000000003', 'a5800000-0000-4000-8000-000000000005', 'Ben at second venue', 'Barista');
insert into public.shared_workers (id, business_id)
values ('95800000-0000-4000-8000-000000000001', 'b5800000-0000-4000-8000-000000000001');
insert into public.shared_worker_profiles (employee_id, business_id, venue_id, shared_worker_id) values
  ('e5800000-0000-4000-8000-000000000002', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', '95800000-0000-4000-8000-000000000001'),
  ('e5800000-0000-4000-8000-000000000004', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000002', '95800000-0000-4000-8000-000000000001');
insert into public.job_roles (id, business_id, venue_id, department_id, name, restrict_manual_assignment)
values ('96800000-0000-4000-8000-000000000001', 'b5800000-0000-4000-8000-000000000001',
  'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'Barista', true);
insert into public.employee_job_roles (business_id, venue_id, department_id, employee_id, job_role_id) values
  ('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000001', '96800000-0000-4000-8000-000000000001'),
  ('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000002', '96800000-0000-4000-8000-000000000001');
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at,
  is_published, requires_acknowledgement
) values
  ('f5800000-0000-4000-8000-000000000001', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000001', 'Barista', '2032-04-05 09:00+00', '2032-04-05 13:00+00', false, true),
  ('f5800000-0000-4000-8000-000000000002', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000002', 'Barista', '2032-04-05 09:00+00', '2032-04-05 13:00+00', false, true),
  ('f5800000-0000-4000-8000-000000000003', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000001', 'Barista', '2032-04-06 09:00+00', '2032-04-06 13:00+00', false, false),
  ('f5800000-0000-4000-8000-000000000004', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000002', 'Barista', '2032-04-06 14:00+00', '2032-04-06 18:00+00', false, false),
  ('f5800000-0000-4000-8000-000000000005', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000001', 'Barista', '2032-04-07 09:00+00', '2032-04-07 13:00+00', false, false),
  ('f5800000-0000-4000-8000-000000000006', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000002', 'Barista', '2032-04-07 14:00+00', '2032-04-07 18:00+00', false, false),
  ('f5800000-0000-4000-8000-000000000007', 'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'd5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000001', 'Barista', '2032-04-08 09:00+00', '2032-04-08 13:00+00', false, false);
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000001', true);
update public.shifts set is_published = true
where business_id = 'b5800000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_my_swap_shifts('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001')),
  4, 'employees can choose only their own upcoming published shifts');
select extensions.is(
  (select count(*)::integer from public.list_my_swap_colleagues('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001') where employee_name = 'Ben'),
  1, 'same-department colleagues are discoverable');
select extensions.throws_ok(
  $$select public.request_shift_swap('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'f5800000-0000-4000-8000-000000000002', 'e5800000-0000-4000-8000-000000000001')$$,
  'P0001', 'Shift not found or permission denied', 'an employee cannot request a colleague shift');
select extensions.throws_ok(
  $$select public.request_shift_swap('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'f5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000003')$$,
  'P0001', 'Colleague is not eligible for this shift: role', 'an unqualified recipient is rejected');
select extensions.throws_ok(
  $$select public.request_shift_swap('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'f5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000004')$$,
  'P0001', 'Colleague is not eligible for this department', 'another venue profile cannot be targeted');
select extensions.isnt(set_config('test.swap', public.request_shift_swap(
  'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001',
  'f5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000002')::text, true),
  null, 'the requester proposes a swap');
select extensions.throws_ok(
  $$select public.request_shift_swap('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'f5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000002')$$,
  'P0001', 'There is already an open swap for this shift', 'duplicate active requests are rejected');
select extensions.throws_ok(
  $$update public.shift_swap_requests set status = 'approved' where id = current_setting('test.swap')::uuid$$,
  '42501', null, 'clients cannot bypass swap transitions');
select extensions.lives_ok(
  $$select public.acknowledge_shift('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'f5800000-0000-4000-8000-000000000001')$$,
  'the requester can acknowledge their original shift');
reset role;

select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000007', true);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.list_shift_swaps('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant cannot list swaps');
select extensions.throws_ok(
  $$select public.review_shift_swap(current_setting('test.swap')::uuid, 'approve', null)$$,
  'P0001', 'Swap not found or permission denied', 'another tenant cannot approve a swap');
reset role;

select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_shift_swaps('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001')),
  0, 'a BOH manager cannot list FOH swaps');
select extensions.throws_ok(
  $$select public.review_shift_swap(current_setting('test.swap')::uuid, 'approve', null)$$,
  'P0001', 'Swap not found or permission denied', 'a BOH manager cannot review FOH swaps');
reset role;

select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.review_shift_swap(current_setting('test.swap')::uuid, 'approve', null)$$,
  'P0001', 'This swap is no longer awaiting manager review', 'a manager cannot approve before both employees confirm');
reset role;

select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_shift_swap_notifications('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001')
    where swap_id = current_setting('test.swap')::uuid and event_type = 'requested' and unread),
  1, 'the recipient receives an unread swap request notification');
select extensions.lives_ok(
  $$select * from public.mark_shift_swap_notification_read((select notification_id from public.list_shift_swap_notifications(
    'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001')
    where swap_id = current_setting('test.swap')::uuid and event_type = 'requested'))$$,
  'the recipient can mark their notification read');
select extensions.is(
  (select count(*)::integer from public.list_shift_swap_notifications('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001')
    where swap_id = current_setting('test.swap')::uuid and unread),
  0, 'read state is persisted for the recipient');
select extensions.throws_ok(
  $$select public.respond_shift_swap(current_setting('test.swap')::uuid, 'propose', 'f5800000-0000-4000-8000-000000000001')$$,
  'P0001', 'Select one of your upcoming published shifts in this department', 'the recipient cannot propose another employee shift');
select extensions.lives_ok(
  $$select public.respond_shift_swap(current_setting('test.swap')::uuid, 'propose', 'f5800000-0000-4000-8000-000000000002')$$,
  'the recipient proposes their own overlapping shift as the outgoing shift');
select extensions.lives_ok(
  $$select public.acknowledge_shift('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'f5800000-0000-4000-8000-000000000002')$$,
  'the recipient can acknowledge their original shift');
reset role;

select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_shift_swap_notifications('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001')
    where swap_id = current_setting('test.swap')::uuid and event_type = 'proposed' and unread),
  1, 'the requester is notified of the reciprocal proposal');
select extensions.lives_ok(
  $$select public.confirm_shift_swap(current_setting('test.swap')::uuid, 'confirm')$$,
  'the requester explicitly confirms the reciprocal proposal');
reset role;

select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.list_shift_swap_notifications('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001')
    where swap_id = current_setting('test.swap')::uuid and event_type = 'review' and unread),
  1, 'a scoped manager is notified when both employees have confirmed');
reset role;

delete from public.employee_job_roles where employee_id = 'e5800000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.throws_ok(
  $$select public.review_shift_swap(current_setting('test.swap')::uuid, 'approve', null)$$,
  'P0001', 'Recipient is no longer eligible for the requested shift: role', 'approval rechecks current qualifications');
reset role;
insert into public.employee_job_roles (business_id, venue_id, department_id, employee_id, job_role_id)
values ('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001',
  'd5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000002', '96800000-0000-4000-8000-000000000001');
insert into public.employee_availability_exceptions (business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status)
values ('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001',
  'e5800000-0000-4000-8000-000000000002', '2032-04-05', '2032-04-05', 'unavailable', 'active');
set local role authenticated;
select extensions.throws_ok(
  $$select public.review_shift_swap(current_setting('test.swap')::uuid, 'approve', null)$$,
  'P0001', 'Recipient is no longer eligible for the requested shift: unavailable', 'approval rechecks current availability');
reset role;
delete from public.employee_availability_exceptions
where employee_id = 'e5800000-0000-4000-8000-000000000002';
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at)
values ('f5800000-0000-4000-8000-000000000008', 'b5800000-0000-4000-8000-000000000001',
  'c5800000-0000-4000-8000-000000000002', 'd5800000-0000-4000-8000-000000000003',
  'e5800000-0000-4000-8000-000000000004', 'Barista', '2032-04-05 10:00+00', '2032-04-05 11:00+00');
set local role authenticated;
select extensions.throws_ok(
  $$select public.review_shift_swap(current_setting('test.swap')::uuid, 'approve', null)$$,
  'P0001', 'Recipient is no longer eligible for the requested shift: conflict', 'approval rechecks linked-worker overlaps in another venue');
reset role;
delete from public.shifts where id = 'f5800000-0000-4000-8000-000000000008';
set local role authenticated;
select extensions.lives_ok(
  $$select public.review_shift_swap(current_setting('test.swap')::uuid, 'approve', null)$$,
  'the scoped manager approves the simultaneous exchange');
reset role;
select extensions.results_eq(
  $$select id, employee_id from public.shifts where id in ('f5800000-0000-4000-8000-000000000001', 'f5800000-0000-4000-8000-000000000002') order by id$$,
  $$values ('f5800000-0000-4000-8000-000000000001'::uuid, 'e5800000-0000-4000-8000-000000000002'::uuid),
    ('f5800000-0000-4000-8000-000000000002'::uuid, 'e5800000-0000-4000-8000-000000000001'::uuid)$$,
  'approval atomically exchanges both assignments');
select extensions.is(
  (select count(*)::integer from public.roster_publications where publication_kind = 'swap'
    and business_id = 'b5800000-0000-4000-8000-000000000001'),
  1, 'approval records a new publication snapshot for the affected week');
select extensions.is(
  (select count(*)::integer from public.shift_swap_events where swap_id = current_setting('test.swap')::uuid),
  4, 'request, proposal, confirmation and approval have audit events');
select extensions.is(
  (select count(*)::integer from public.shift_swap_notifications where swap_id = current_setting('test.swap')::uuid and event_type = 'approved'),
  2, 'both participants receive an approval notification');

select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.is(
  (select acknowledged_at from public.list_shift_acknowledgements('b5800000-0000-4000-8000-000000000001',
    'c5800000-0000-4000-8000-000000000001', array['f5800000-0000-4000-8000-000000000001']::uuid[])),
  null, 'a swapped-in employee starts with an unacknowledged shift');
select extensions.lives_ok(
  $$select public.acknowledge_shift('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'f5800000-0000-4000-8000-000000000001')$$,
  'a swapped-in employee can acknowledge the new publication');
select extensions.isnt(set_config('test.reverse', public.request_shift_swap(
  'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001',
  'f5800000-0000-4000-8000-000000000001', 'e5800000-0000-4000-8000-000000000001')::text, true),
  null, 'a later reverse exchange can be requested');
reset role;
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.respond_shift_swap(current_setting('test.reverse')::uuid, 'propose', 'f5800000-0000-4000-8000-000000000002')$$,
  'the other employee proposes the reciprocal shift again');
reset role;
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.confirm_shift_swap(current_setting('test.reverse')::uuid, 'confirm')$$,
  'the requester confirms the reverse exchange');
reset role;
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.review_shift_swap(current_setting('test.reverse')::uuid, 'approve', null)$$,
  'the manager approves the reverse exchange');
reset role;
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is(
  (select acknowledged_at from public.list_shift_acknowledgements('b5800000-0000-4000-8000-000000000001',
    'c5800000-0000-4000-8000-000000000001', array['f5800000-0000-4000-8000-000000000001']::uuid[])),
  null, 'an earlier acknowledgement does not satisfy a later reassignment back to the same person');
select extensions.lives_ok(
  $$select public.acknowledge_shift('b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001', 'f5800000-0000-4000-8000-000000000001')$$,
  'the returning employee can acknowledge the new assignment');
reset role;
select extensions.is(
  (select count(*)::integer from public.shift_acknowledgements
    where shift_id = 'f5800000-0000-4000-8000-000000000001'
      and user_id = 'a5800000-0000-4000-8000-000000000004'),
  2, 'old acknowledgement records are retained alongside the new acknowledgement');

select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.isnt(set_config('test.reject', public.request_shift_swap(
  'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001',
  'f5800000-0000-4000-8000-000000000003', 'e5800000-0000-4000-8000-000000000002')::text, true),
  null, 'another swap can be submitted for rejection');
reset role;
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.respond_shift_swap(current_setting('test.reject')::uuid, 'propose', 'f5800000-0000-4000-8000-000000000004')$$,
  'the recipient proposes a shift for the rejection scenario');
reset role;
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.confirm_shift_swap(current_setting('test.reject')::uuid, 'confirm')$$,
  'the requester confirms before manager rejection');
reset role;
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.review_shift_swap(current_setting('test.reject')::uuid, 'reject', ' ')$$,
  'P0001', 'A rejection reason of up to 500 characters is required', 'a manager must provide a rejection reason');
select extensions.lives_ok(
  $$select public.review_shift_swap(current_setting('test.reject')::uuid, 'reject', 'Coverage required')$$,
  'a scoped manager rejects the swap with a reason');
reset role;
select extensions.results_eq(
  $$select status, review_reason from public.shift_swap_requests where id = current_setting('test.reject')::uuid$$,
  $$values ('rejected'::text, 'Coverage required'::text)$$, 'the rejection reason and decision are retained');
select extensions.is(
  (select count(*)::integer from public.shift_swap_notifications where swap_id = current_setting('test.reject')::uuid and event_type = 'rejected'),
  2, 'both participants receive rejection notifications');
select extensions.is(
  (select employee_id from public.shifts where id = 'f5800000-0000-4000-8000-000000000003'),
  'e5800000-0000-4000-8000-000000000001'::uuid, 'rejection does not change assignments');

select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.isnt(set_config('test.stale', public.request_shift_swap(
  'b5800000-0000-4000-8000-000000000001', 'c5800000-0000-4000-8000-000000000001',
  'f5800000-0000-4000-8000-000000000005', 'e5800000-0000-4000-8000-000000000002')::text, true),
  null, 'a swap can be submitted before a later schedule change');
reset role;
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.respond_shift_swap(current_setting('test.stale')::uuid, 'propose', 'f5800000-0000-4000-8000-000000000006')$$,
  'the recipient proposes their shift before a schedule change');
reset role;
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.confirm_shift_swap(current_setting('test.stale')::uuid, 'confirm')$$,
  'the requester confirms before the schedule change');
reset role;
update public.shifts set starts_at = '2032-04-07 10:00+00' where id = 'f5800000-0000-4000-8000-000000000005';
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.review_shift_swap(current_setting('test.stale')::uuid, 'approve', null)$$,
  'P0001', 'A shift has changed or started; ask for a new swap', 'approval rejects stale employee consent');
reset role;
select set_config('request.jwt.claim.sub', 'a5800000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.withdraw_shift_swap(current_setting('test.stale')::uuid)$$,
  'the requester can withdraw a stale request');
reset role;

select * from extensions.finish();
rollback;
