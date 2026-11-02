begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(56);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3000000-0000-4000-8000-000000000001', 'quick-owner@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000002', 'quick-foh@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000003', 'quick-boh@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000004', 'quick-worker@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000005', 'quick-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b3000000-0000-4000-8000-000000000001', 'Quick change business'),
  ('b3000000-0000-4000-8000-000000000002', 'Another business');
insert into public.venues (id, business_id, name, timezone) values
  ('c3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001', 'Other venue', 'UTC'),
  ('c3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'FOH'),
  ('d3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'BOH'),
  ('d3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'Other');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'foh_manager', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'boh_manager', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002'),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000004', 'employee', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000004', 'Alex', 'Server'),
  ('e3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', null, 'Sam', 'Server'),
  ('e3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', null, 'Cook', 'Cook'),
  ('e3000000-0000-4000-8000-000000000004', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003', null, 'Alex elsewhere', 'Server');
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at,
  break_minutes, is_published, requires_acknowledgement, updated_at
) values
  ('f3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001', 'Server',
    '2032-03-29 09:00:31.123456+11', '2032-03-29 11:00:48.654321+11', 15, false, true, '2001-01-01+00'),
  ('f3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000002', 'Existing',
    '2032-03-30 09:30+11', '2032-03-30 12:00+11', 0, false, false, '2001-01-01+00'),
  ('f3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001', 'Published',
    '2032-03-31 13:00+11', '2032-03-31 15:00+11', 0, true, false, '2001-01-01+00'),
  ('f3000000-0000-4000-8000-000000000004', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
    null, 'Open',
    '2032-03-29 16:00+11', '2032-03-29 18:00+11', 0, false, false, '2001-01-01+00'),
  ('f3000000-0000-4000-8000-000000000005', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003',
    'e3000000-0000-4000-8000-000000000004', 'Private cross-venue shift',
    '2032-04-02 22:30+00', '2032-04-03 00:30+00', 0, false, false, '2001-01-01+00'),
  ('f3000000-0000-4000-8000-000000000006', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
    null, 'Fall target',
    '2032-03-29 01:30+11', '2032-03-29 03:30+11', 0, false, false, '2001-01-01+00'),
  ('f3000000-0000-4000-8000-000000000007', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
    null, 'Fall source',
    '2032-04-04 01:30+11', '2032-04-04 03:30+10', 0, false, false, '2001-01-01+00'),
  ('f3000000-0000-4000-8000-000000000008', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
    null, 'Repeated hour',
    '2032-03-29 02:30+11', '2032-03-29 03:30+11', 0, false, false, '2001-01-01+00'),
  ('f3000000-0000-4000-8000-000000000009', 'b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
    null, 'Spring target',
    '2032-09-27 02:30+10', '2032-09-27 04:00+10', 0, false, false, '2001-01-01+00');
insert into public.employee_availability_exceptions (
  business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status
) values (
  'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000002', '2032-04-01', '2032-04-01', 'leave', 'approved'
);

create function pg_temp.quick_preview(p_date date, p_employee uuid, p_operation text, p_shift uuid default 'f3000000-0000-4000-8000-000000000001')
returns jsonb language sql as $$
  select public.preview_roster_shift_change(
    'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001', p_shift, current_setting('test.quick_revision')::timestamptz,
    '2032-03-29', p_date, p_employee, p_operation
  );
$$;
create function pg_temp.quick_apply(p_date date, p_employee uuid, p_operation text, p_request uuid,
  p_shift uuid default 'f3000000-0000-4000-8000-000000000001', p_preview jsonb default null)
returns uuid language sql as $$
  select public.apply_roster_shift_change(
    'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001', p_shift, current_setting('test.quick_revision')::timestamptz,
    '2032-03-29', p_date, p_employee, p_operation,
    coalesce(p_preview, pg_temp.quick_preview(p_date, p_employee, p_operation, p_shift)), p_request
  );
$$;
create function pg_temp.quick_undo(p_change uuid, p_request uuid)
returns uuid language sql as $$
  select public.undo_roster_shift_change(
    'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    p_change, p_request
  );
$$;
select set_config('test.quick_revision', '2001-01-01T00:00:00+00:00', true);

set local role anon;
select extensions.throws_ok(
  $$select pg_temp.quick_preview('2032-03-31', null, 'move')$$,
  '42501', null, 'anonymous callers cannot preview a change');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select pg_temp.quick_preview('2032-03-31', null, 'move')$$,
  'P0001', 'Permission denied', 'employees cannot preview manager changes');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select pg_temp.quick_preview('2032-03-31', null, 'move')$$,
  'P0001', 'Permission denied', 'BOH managers cannot change FOH');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select pg_temp.quick_apply('2032-03-31', null, 'move', '13000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'an outside owner cannot change another tenant');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select count(*) from public.roster_quick_changes$$,
  '42501', null, 'receipts are not directly readable');
select extensions.throws_ok(
  $$select public.roster_quick_shift_snapshot('f3000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'the internal snapshot helper is not publicly callable');
select extensions.is(
  pg_temp.quick_preview('2032-03-31', 'e3000000-0000-4000-8000-000000000002', 'move')->>'target_employee_name',
  'Sam', 'preview identifies the target worker');
select extensions.is(
  pg_temp.quick_preview('2032-03-31', 'e3000000-0000-4000-8000-000000000002', 'move')->>'target_date',
  '2032-03-31', 'preview identifies the target date');
select extensions.is(
  (pg_temp.quick_preview('2032-03-31', 'e3000000-0000-4000-8000-000000000002', 'move')->>'starts_at')::timestamptz,
  '2032-03-31 09:00:31.123456+11'::timestamptz, 'preview preserves local time and microseconds');
select extensions.is(
  pg_temp.quick_preview('2032-03-30', 'e3000000-0000-4000-8000-000000000002', 'move')->'blocking',
  '["overlap"]'::jsonb, 'same-worker overlap blocks the preview');
select extensions.throws_ok(
  $$select pg_temp.quick_apply('2032-03-30', 'e3000000-0000-4000-8000-000000000002',
    'move', '13000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Shift change blocked: overlap', 'overlap is rechecked when applying');
select extensions.is(
  pg_temp.quick_preview('2032-04-01', 'e3000000-0000-4000-8000-000000000002', 'move')->'warnings',
  '["unavailable"]'::jsonb, 'approved leave warns when manual unavailability is allowed');
select extensions.is(
  pg_temp.quick_preview('2032-03-31', null, 'move')->'blocking',
  '["acknowledgement"]'::jsonb, 'acknowledgement requirements cannot silently become open shifts');
select extensions.is(
  pg_temp.quick_preview('2032-03-29', 'e3000000-0000-4000-8000-000000000001', 'move')->'blocking',
  '["unchanged"]'::jsonb, 'an unchanged move is not offered as a mutation');
select extensions.throws_ok(
  $$select pg_temp.quick_preview('2032-04-05', null, 'duplicate')$$,
  'P0001', 'Invalid roster change', 'targets outside the visible week are rejected');
select extensions.throws_ok(
  $$select pg_temp.quick_preview('2032-03-31', 'e3000000-0000-4000-8000-000000000003', 'move')$$,
  'P0001', 'Employee is not eligible for this department', 'another department is not an eligible destination');
select extensions.throws_ok(
  $$select pg_temp.quick_preview('2032-04-02', 'e3000000-0000-4000-8000-000000000001',
    'move', 'f3000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Published shifts cannot be edited', 'published shifts cannot be moved');
select extensions.throws_ok(
  $$select pg_temp.quick_preview('2032-04-04', null, 'move', 'f3000000-0000-4000-8000-000000000006')$$,
  'P0001', 'Target shift crosses a clock change and cannot be moved safely',
  'preview rejects a target spanning the autumn clock change');
select extensions.throws_ok(
  $$select public.apply_roster_shift_change(
    'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000006',
    '2001-01-01+00', '2032-03-29', '2032-04-04', null, 'move', '{}'::jsonb,
    '13000000-0000-4000-8000-000000000010')$$,
  'P0001', 'Target shift crosses a clock change and cannot be moved safely',
  'a forged preview cannot apply a target spanning the clock change');
select extensions.throws_ok(
  $$select pg_temp.quick_preview('2032-04-02', null, 'move', 'f3000000-0000-4000-8000-000000000007')$$,
  'P0001', 'Shift crosses a clock change and cannot be moved safely',
  'preview rejects moving an original shift spanning a clock change');
select extensions.is(
  (pg_temp.quick_preview('2032-04-04', null, 'duplicate',
    'f3000000-0000-4000-8000-000000000008')->>'starts_at')::timestamptz,
  '2032-04-04 02:30+10'::timestamptz,
  'an otherwise safe repeated local time uses the later occurrence');
select extensions.throws_ok(
  $$select public.preview_roster_shift_change(
    'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000009',
    '2001-01-01+00', '2032-09-27', '2032-10-03', null, 'duplicate')$$,
  'P0001', 'Start time does not exist in venue timezone',
  'preview rejects a nonexistent spring clock-change time');

reset role;
update public.venues set block_manual_unavailability = true
where id = 'c3000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  pg_temp.quick_preview('2032-04-01', 'e3000000-0000-4000-8000-000000000002', 'move')->'blocking',
  '["unavailable"]'::jsonb, 'configured manual unavailability changes the warning into a blocker');
select extensions.throws_ok(
  $$select pg_temp.quick_apply('2032-04-01', 'e3000000-0000-4000-8000-000000000002',
    'move', '13000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Shift change blocked: unavailable', 'configured unavailability is enforced by the mutation');
reset role;
update public.venues set block_manual_unavailability = false
where id = 'c3000000-0000-4000-8000-000000000001';
insert into public.job_roles (business_id, venue_id, department_id, name, restrict_manual_assignment)
values ('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001', 'Server', true);
set local role authenticated;
select extensions.is(
  pg_temp.quick_preview('2032-03-31', 'e3000000-0000-4000-8000-000000000002', 'move')->'blocking',
  '["qualification"]'::jsonb, 'restricted role qualification is previewed');
select extensions.throws_ok(
  $$select pg_temp.quick_apply('2032-03-31', 'e3000000-0000-4000-8000-000000000002',
    'move', '13000000-0000-4000-8000-000000000004')$$,
  'P0001', 'Shift change blocked: qualification', 'restricted role qualification is enforced');
reset role;
update public.job_roles set restrict_manual_assignment = false
where business_id = 'b3000000-0000-4000-8000-000000000001' and name = 'Server';
set local role authenticated;

select set_config('test.clean_preview', pg_temp.quick_preview('2032-04-02',
  'e3000000-0000-4000-8000-000000000002', 'move')::text, true);
reset role;
insert into public.employee_availability_exceptions (
  business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status
) values (
  'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000002', '2032-04-02', '2032-04-02', 'leave', 'approved'
);
set local role authenticated;
select extensions.throws_ok(
  $$select pg_temp.quick_apply('2032-04-02', 'e3000000-0000-4000-8000-000000000002',
    'move', '13000000-0000-4000-8000-000000000009',
    'f3000000-0000-4000-8000-000000000001', current_setting('test.clean_preview')::jsonb)$$,
  'P0001', 'Shift preview changed; preview again', 'new warnings require a fresh preview before applying');
select extensions.is(
  (select starts_at from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'),
  '2032-03-29 09:00:31.123456+11'::timestamptz, 'a stale preview does not move the shift');
reset role;
delete from public.employee_availability_exceptions
where employee_id = 'e3000000-0000-4000-8000-000000000002' and starts_on = '2032-04-02';
set local role authenticated;

select set_config('test.move_preview', pg_temp.quick_preview('2032-03-31',
  'e3000000-0000-4000-8000-000000000002', 'move')::text, true);
select set_config('test.move_receipt', pg_temp.quick_apply('2032-03-31',
  'e3000000-0000-4000-8000-000000000002', 'move', '13000000-0000-4000-8000-000000000005',
  'f3000000-0000-4000-8000-000000000001', current_setting('test.move_preview')::jsonb)::text, true);
select extensions.is(
  (select employee_id from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'),
  'e3000000-0000-4000-8000-000000000002'::uuid, 'move changes the assigned worker');
select extensions.is(
  (select starts_at from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'),
  '2032-03-31 09:00:31.123456+11'::timestamptz, 'move preserves exact time on the target date');
select extensions.is(
  (select requires_acknowledgement from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'),
  true, 'move preserves acknowledgement requirements');
select extensions.is(
  pg_temp.quick_apply('2032-03-31', 'e3000000-0000-4000-8000-000000000002',
    'move', '13000000-0000-4000-8000-000000000005',
    'f3000000-0000-4000-8000-000000000001', current_setting('test.move_preview')::jsonb),
  current_setting('test.move_receipt')::uuid, 'retrying an applied request returns the original receipt');
select extensions.throws_ok(
  $$select pg_temp.quick_apply('2032-04-02', 'e3000000-0000-4000-8000-000000000002',
    'move', '13000000-0000-4000-8000-000000000005',
    'f3000000-0000-4000-8000-000000000001', current_setting('test.move_preview')::jsonb)$$,
  'P0001', 'Request identifier already used', 'a request identifier cannot be reused for another target');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select pg_temp.quick_undo(current_setting('test.move_receipt')::uuid, '14000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another manager cannot undo the original actor''s change');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.undo_roster_shift_change('b3000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000003', current_setting('test.move_receipt')::uuid,
    '14000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'undo cannot cross the selected business or venue context');
select extensions.is(
  pg_temp.quick_undo(current_setting('test.move_receipt')::uuid, '14000000-0000-4000-8000-000000000001'),
  current_setting('test.move_receipt')::uuid, 'the actor can undo a move');
select extensions.is(
  (select starts_at from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'),
  '2032-03-29 09:00:31.123456+11'::timestamptz, 'undo restores the exact original instant');
select extensions.is(
  (select employee_id from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'),
  'e3000000-0000-4000-8000-000000000001'::uuid, 'undo restores the original worker');
select extensions.is(
  pg_temp.quick_undo(current_setting('test.move_receipt')::uuid, '14000000-0000-4000-8000-000000000001'),
  current_setting('test.move_receipt')::uuid, 'the same undo request is idempotent');
select extensions.throws_ok(
  $$select pg_temp.quick_apply('2032-03-31', 'e3000000-0000-4000-8000-000000000002',
    'move', '13000000-0000-4000-8000-000000000005',
    'f3000000-0000-4000-8000-000000000001', current_setting('test.move_preview')::jsonb)$$,
  'P0001', 'Shift change was already undone', 'an undone request cannot falsely report another move');
select extensions.throws_ok(
  $$select pg_temp.quick_preview('2032-04-02', 'e3000000-0000-4000-8000-000000000001', 'move')$$,
  'P0001', 'Shift changed; reload the roster', 'stale source revisions are rejected');

select set_config('test.quick_revision',
  (select updated_at::text from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'), true);
select set_config('test.duplicate_preview', pg_temp.quick_preview('2032-04-02',
  'e3000000-0000-4000-8000-000000000001', 'duplicate')::text, true);
select set_config('test.duplicate_receipt', pg_temp.quick_apply('2032-04-02',
  'e3000000-0000-4000-8000-000000000001', 'duplicate', '13000000-0000-4000-8000-000000000006',
  'f3000000-0000-4000-8000-000000000001', current_setting('test.duplicate_preview')::jsonb)::text, true);
select extensions.is(
  (select count(*)::integer from public.shifts where department_id = 'd3000000-0000-4000-8000-000000000001'
    and (starts_at at time zone 'Australia/Sydney')::date = '2032-04-02'
    and employee_id = 'e3000000-0000-4000-8000-000000000001' and not is_published and requires_acknowledgement),
  1, 'duplicate creates one private draft and retains acknowledgement');
select extensions.is(
  pg_temp.quick_apply('2032-04-02', 'e3000000-0000-4000-8000-000000000001',
    'duplicate', '13000000-0000-4000-8000-000000000006',
    'f3000000-0000-4000-8000-000000000001', current_setting('test.duplicate_preview')::jsonb),
  current_setting('test.duplicate_receipt')::uuid, 'duplicate retries do not create another draft');
select extensions.is(
  pg_temp.quick_undo(current_setting('test.duplicate_receipt')::uuid, '14000000-0000-4000-8000-000000000002'),
  current_setting('test.duplicate_receipt')::uuid, 'the actor can undo a duplicate');
select extensions.is(
  (select count(*)::integer from public.shifts where department_id = 'd3000000-0000-4000-8000-000000000001'
    and (starts_at at time zone 'Australia/Sydney')::date = '2032-04-02'),
  0, 'undo removes only the duplicated draft');
select extensions.is(
  (select count(*)::integer from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'),
  1, 'undoing a duplicate retains the original shift');

select set_config('test.quick_revision', '2001-01-01T00:00:00+00:00', true);
select set_config('test.published_copy', pg_temp.quick_apply('2032-04-02',
  'e3000000-0000-4000-8000-000000000002', 'duplicate', '13000000-0000-4000-8000-000000000007',
  'f3000000-0000-4000-8000-000000000003')::text, true);
select extensions.is(
  (select count(*)::integer from public.shifts where department_id = 'd3000000-0000-4000-8000-000000000001'
    and role_title = 'Published' and not is_published),
  1, 'a published shift can be duplicated as a draft without editing it');
select extensions.is(
  pg_temp.quick_undo(current_setting('test.published_copy')::uuid, '14000000-0000-4000-8000-000000000003'),
  current_setting('test.published_copy')::uuid, 'the draft duplicate of a published shift can be undone');
select extensions.is(
  (select is_published from public.shifts where id = 'f3000000-0000-4000-8000-000000000003'),
  true, 'the published original remains intact');

select set_config('test.quick_revision',
  (select updated_at::text from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'), true);
select set_config('test.stale_undo', pg_temp.quick_apply('2032-04-02',
  'e3000000-0000-4000-8000-000000000001', 'move', '13000000-0000-4000-8000-000000000008')::text, true);
select public.update_draft_shift(
  'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001', 'Server',
  '2032-04-02 09:00:31.123456', '2032-04-02 11:00:48.654321', 30);
select extensions.throws_ok(
  $$select pg_temp.quick_undo(current_setting('test.stale_undo')::uuid, '14000000-0000-4000-8000-000000000004')$$,
  'P0001', 'Shift changed since the quick change', 'undo does not overwrite a later edit');
select extensions.is(
  (select break_minutes from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'),
  30, 'a refused undo preserves the later edit');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select public.link_shared_worker_profiles(
  'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000004');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', true);
select set_config('test.quick_revision',
  (select updated_at::text from public.shifts where id = 'f3000000-0000-4000-8000-000000000001'), true);
select extensions.is(
  pg_temp.quick_preview('2032-04-03', 'e3000000-0000-4000-8000-000000000001', 'move')->'warnings',
  '["linked-overlap"]'::jsonb, 'a linked cross-venue overlap warns without revealing the other shift');

reset role;
select extensions.throws_ok(
  $$update public.roster_quick_changes set operation = 'duplicate' where id = current_setting('test.stale_undo')::uuid$$,
  'P0001', 'Roster quick change records are immutable', 'change receipts are immutable');
select extensions.throws_ok(
  $$delete from public.roster_quick_change_undos where change_id = current_setting('test.move_receipt')::uuid$$,
  'P0001', 'Roster quick change records are immutable', 'undo receipts are immutable');
select extensions.lives_ok(
  $$delete from public.businesses where id = 'b3000000-0000-4000-8000-000000000001'$$,
  'the existing business cascade can remove quick-change receipts');
select extensions.is(
  (select count(*)::integer from public.roster_quick_changes
    where business_id = 'b3000000-0000-4000-8000-000000000001'),
  0, 'business deletion does not leave orphaned quick-change receipts');
select * from extensions.finish();
rollback;
