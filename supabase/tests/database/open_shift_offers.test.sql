begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(68);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5700000-0000-4000-8000-000000000001', 'offer-owner@example.test', '{}'::jsonb),
  ('a5700000-0000-4000-8000-000000000002', 'offer-foh@example.test', '{}'::jsonb),
  ('a5700000-0000-4000-8000-000000000003', 'offer-boh@example.test', '{}'::jsonb),
  ('a5700000-0000-4000-8000-000000000004', 'offer-ann@example.test', '{}'::jsonb),
  ('a5700000-0000-4000-8000-000000000005', 'offer-ben@example.test', '{}'::jsonb),
  ('a5700000-0000-4000-8000-000000000006', 'offer-cat@example.test', '{}'::jsonb),
  ('a5700000-0000-4000-8000-000000000007', 'offer-dan@example.test', '{}'::jsonb),
  ('a5700000-0000-4000-8000-000000000008', 'offer-eve@example.test', '{}'::jsonb),
  ('a5700000-0000-4000-8000-000000000009', 'offer-fay@example.test', '{}'::jsonb),
  ('a5700000-0000-4000-8000-000000000010', 'offer-gus@example.test', '{}'::jsonb),
  ('a5700000-0000-4000-8000-000000000011', 'offer-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values ('b5700000-0000-4000-8000-000000000001', 'Offer business'), ('b5700000-0000-4000-8000-000000000002', 'Other business');
insert into public.venues (id, business_id, name, timezone) values
  ('c5700000-0000-4000-8000-000000000001', 'b5700000-0000-4000-8000-000000000001', 'Cafe', 'UTC'), ('c5700000-0000-4000-8000-000000000002', 'b5700000-0000-4000-8000-000000000002', 'Other', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d5700000-0000-4000-8000-000000000001', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'FOH'), ('d5700000-0000-4000-8000-000000000002', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'BOH'), ('d5700000-0000-4000-8000-000000000003', 'b5700000-0000-4000-8000-000000000002', 'c5700000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000002', 'foh_manager', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000003', 'boh_manager', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000002'),
  ('b5700000-0000-4000-8000-000000000002', 'a5700000-0000-4000-8000-000000000011', 'owner', null, null),
  ('b5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000004', 'employee', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000005', 'employee', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000006', 'employee', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000007', 'employee', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000008', 'employee', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000010', 'employee', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000009', 'employee', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000002');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e5700000-0000-4000-8000-000000000001', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000004', 'Ann', 'Barista'),
  ('e5700000-0000-4000-8000-000000000002', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000005', 'Ben', 'Barista'),
  ('e5700000-0000-4000-8000-000000000003', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000006', 'Cat', 'Barista'),
  ('e5700000-0000-4000-8000-000000000004', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000007', 'Dan', 'Barista'),
  ('e5700000-0000-4000-8000-000000000005', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000008', 'Eve', 'Barista'),
  ('e5700000-0000-4000-8000-000000000006', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000002', 'a5700000-0000-4000-8000-000000000009', 'Fay', 'Barista'),
  ('e5700000-0000-4000-8000-000000000007', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000010', 'Gus', 'Barista'),
  ('e5700000-0000-4000-8000-000000000008', 'b5700000-0000-4000-8000-000000000002', 'c5700000-0000-4000-8000-000000000002', 'd5700000-0000-4000-8000-000000000003', 'a5700000-0000-4000-8000-000000000011', 'Outside', 'Barista');
insert into public.job_roles (id, business_id, venue_id, department_id, name, restrict_manual_assignment) values
  ('97000000-0000-4000-8000-000000000001', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'Barista', true);
insert into public.employee_job_roles (business_id, venue_id, department_id, employee_id, job_role_id) values
  ('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000005', '97000000-0000-4000-8000-000000000001'),
  ('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000007', '97000000-0000-4000-8000-000000000001');
insert into public.employee_availability_exceptions (business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status) values
  ('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000003', '2032-04-05', '2032-04-05', 'unavailable', 'active');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, is_published) values
  ('f5700000-0000-4000-8000-000000000001', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', null, 'Barista', '2032-04-05 09:00+00', '2032-04-05 13:00+00', true),
  ('f5700000-0000-4000-8000-000000000002', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', null, 'Barista', '2032-04-06 09:00+00', '2032-04-06 13:00+00', false),
  ('f5700000-0000-4000-8000-000000000003', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000005', 'Server', '2032-04-05 12:00+00', '2032-04-05 16:00+00', true),
  ('f5700000-0000-4000-8000-000000000004', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000002', null, 'Cook', '2032-04-05 09:00+00', '2032-04-05 13:00+00', true),
  ('f5700000-0000-4000-8000-000000000005', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', null, 'Barista', '2032-04-07 09:00+00', '2032-04-07 13:00+00', true);
insert into public.shift_offers (id, business_id, venue_id, department_id, shift_id, created_by, created_at, expires_at) values
  ('98000000-0000-4000-8000-000000000001', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000005', 'a5700000-0000-4000-8000-000000000002', '2020-01-01 00:00+00', '2020-01-02 00:00+00');
insert into public.shift_offer_recipients (offer_id, business_id, venue_id, employee_id) values
  ('98000000-0000-4000-8000-000000000001', 'b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000001');

reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.results_eq(
  $$select employee_name, ineligibility from public.list_shift_offer_candidates('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001') order by employee_name$$,
  $$values ('Ann'::text, null::text), ('Ben', null), ('Cat', 'availability'), ('Dan', 'role'), ('Eve', 'conflict'), ('Gus', null)$$,
  'candidate eligibility checks role qualification, availability and conflicts; other departments are excluded');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000002', array['e5700000-0000-4000-8000-000000000001']::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'Only upcoming published open shifts can be offered', 'draft shifts cannot be offered');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000003', array['e5700000-0000-4000-8000-000000000001']::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'Only upcoming published open shifts can be offered', 'assigned shifts cannot be offered');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array['e5700000-0000-4000-8000-000000000004']::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'Employee is not eligible for this offer', 'unqualified employees cannot be invited');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array['e5700000-0000-4000-8000-000000000003']::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'Employee is not eligible for this offer', 'unavailable employees cannot be invited');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array['e5700000-0000-4000-8000-000000000005']::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'Employee is not eligible for this offer', 'conflicting employees cannot be invited');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array['e5700000-0000-4000-8000-000000000006']::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'Employee is not eligible for this offer', 'employees outside the department cannot be invited');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array['e5700000-0000-4000-8000-000000000008']::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'Employee is not eligible for this offer', 'employees from another tenant cannot be invited');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array[]::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'Invalid offer audience', 'an empty audience is rejected');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array['e5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000001']::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'Invalid offer audience', 'duplicate recipients are rejected');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array['e5700000-0000-4000-8000-000000000001']::uuid[], '2032-04-05 10:00+00')$$,
  'P0001', 'Offer expiry must be in the future and before the shift starts', 'expiry after shift start is rejected');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array['e5700000-0000-4000-8000-000000000001']::uuid[], '2020-01-01 00:00+00')$$,
  'P0001', 'Offer expiry must be in the future and before the shift starts', 'past expiry is rejected');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000004', array['e5700000-0000-4000-8000-000000000006']::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'Permission denied', 'FOH manager cannot offer BOH shifts');
select extensions.isnt(set_config('test.offer', (select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array['e5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000002', 'e5700000-0000-4000-8000-000000000007']::uuid[], '2032-04-04 12:00+00'))::text, true), null, 'FOH manager sends an offer to eligible staff');
select extensions.results_eq(
  $$select created_by, status, department_id from public.shift_offers where id = current_setting('test.offer')::uuid$$,
  $$values ('a5700000-0000-4000-8000-000000000002'::uuid, 'open'::text, 'd5700000-0000-4000-8000-000000000001'::uuid)$$, 'the sender, scope and status are recorded');
select extensions.results_eq(
  $$select employee_id, response, invited_at is not null from public.shift_offer_recipients where offer_id = current_setting('test.offer')::uuid order by employee_id$$,
  $$values ('e5700000-0000-4000-8000-000000000001'::uuid, 'pending'::text, true), ('e5700000-0000-4000-8000-000000000002', 'pending', true), ('e5700000-0000-4000-8000-000000000007', 'pending', true)$$,
  'the selected audience is recorded with invitation times');
select extensions.is((select employee_id from public.shifts where id = 'f5700000-0000-4000-8000-000000000001'), null, 'the shift remains open after sending the offer');
select extensions.throws_ok(
  $$select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001', array['e5700000-0000-4000-8000-000000000001']::uuid[], '2032-04-04 12:00+00')$$,
  'P0001', 'This shift already has an open offer', 'a shift has at most one open offer');
select extensions.throws_ok(
  $$update public.shift_offer_recipients set response = 'accepted' where offer_id = current_setting('test.offer')::uuid$$,
  '42501', null, 'clients cannot write offer responses directly');
select extensions.throws_ok(
  $$delete from public.shift_offers where id = current_setting('test.offer')::uuid$$,
  '42501', null, 'clients cannot delete offer history');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.list_shift_offer_candidates('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'BOH manager cannot list FOH candidates');
select extensions.is((select count(*) from public.shift_offers)::integer, 0, 'BOH manager cannot see FOH offers');
select extensions.is((select count(*) from public.shift_offer_recipients)::integer, 0, 'BOH manager cannot see FOH offer audiences');
select extensions.isnt(set_config('test.boh_offer', (select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000004', array['e5700000-0000-4000-8000-000000000006']::uuid[], '2032-04-04 12:00+00'))::text, true), null, 'BOH manager offers a BOH shift');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000011', true);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.list_shift_offer_candidates('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant cannot list candidates');
select extensions.throws_ok(
  $$select * from public.list_my_shift_offers('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant cannot list offers');
select extensions.throws_ok(
  $$select public.confirm_shift_offer_claim(current_setting('test.offer')::uuid, 'e5700000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another tenant cannot confirm claims');
select extensions.is((select count(*) from public.shift_offers)::integer, 0, 'another tenant sees no offers');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000007', true);
set local role authenticated;
select extensions.is((select count(*) from public.list_my_shift_offers('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001'))::integer, 0, 'an uninvited employee sees no offers');
select extensions.throws_ok(
  $$select public.respond_shift_offer(current_setting('test.offer')::uuid, 'accept')$$,
  'P0001', 'Shift offer not found or permission denied', 'an uninvited employee cannot respond');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*) from public.list_my_shift_offers('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001'))::integer, 0, 'an owner without a linked profile has no personal offers');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.results_eq(
  $$select shift_id, role_title, department_name, response, can_respond from public.list_my_shift_offers('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001')$$,
  $$values ('f5700000-0000-4000-8000-000000000001'::uuid, 'Barista'::text, 'FOH'::text, 'pending'::text, true)$$,
  'the invited employee sees only the open eligible published offer, not the expired one');
select extensions.throws_ok(
  $$select public.respond_shift_offer('98000000-0000-4000-8000-000000000001', 'accept')$$,
  'P0001', 'Shift offer has expired', 'expired offers cannot be accepted');
select extensions.throws_ok(
  $$select public.respond_shift_offer(current_setting('test.offer')::uuid, 'maybe')$$,
  'P0001', 'Shift offer not found or permission denied', 'invalid responses are rejected');
select extensions.throws_ok(
  $$select public.confirm_shift_offer_claim(current_setting('test.offer')::uuid, 'e5700000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot confirm claims');
select extensions.ok(public.respond_shift_offer(current_setting('test.offer')::uuid, 'accept') <= clock_timestamp(), 'the employee accepts the offer');
select extensions.ok(
  (select response = 'accepted' and responded_at is not null and responded_by = 'a5700000-0000-4000-8000-000000000004' from public.shift_offer_recipients where offer_id = current_setting('test.offer')::uuid and employee_id = 'e5700000-0000-4000-8000-000000000001'),
  'the acceptance is timestamped and attributed');
select extensions.throws_ok(
  $$select public.respond_shift_offer(current_setting('test.offer')::uuid, 'decline')$$,
  'P0001', 'Shift offer already answered', 'a response cannot be changed silently');
select extensions.is((select count(*) from public.shift_offer_recipients)::integer, 2, 'an employee sees only their own recipient rows');
select extensions.is((select employee_id from public.shifts where id = 'f5700000-0000-4000-8000-000000000001'), null, 'acceptance alone does not assign the shift');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.isnt(public.respond_shift_offer(current_setting('test.offer')::uuid, 'accept'), null, 'a second employee also claims the shift');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000010', true);
set local role authenticated;
select extensions.isnt(public.respond_shift_offer(current_setting('test.offer')::uuid, 'accept'), null, 'a third employee also claims the shift');
reset role;
insert into public.employee_availability_exceptions (business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status)
values ('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000002', '2032-04-05', '2032-04-05', 'unavailable', 'active');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.confirm_shift_offer_claim(current_setting('test.offer')::uuid, 'e5700000-0000-4000-8000-000000000004')$$,
  'P0001', 'Only an accepted claim can be confirmed', 'only accepted recipients can be confirmed');
select extensions.is(public.confirm_shift_offer_claim(current_setting('test.offer')::uuid, 'e5700000-0000-4000-8000-000000000002'), 'unavailable', 'confirmation re-checks the latest availability');
select extensions.ok(
  (select s.employee_id is null and o.status = 'open' from public.shifts s join public.shift_offers o on o.shift_id = s.id where o.id = current_setting('test.offer')::uuid),
  'an unavailable claimant is not assigned and the offer stays open');
select extensions.is(public.confirm_shift_offer_claim(current_setting('test.offer')::uuid, 'e5700000-0000-4000-8000-000000000001'), 'confirmed', 'the manager confirms one claim');
select extensions.is((select employee_id from public.shifts where id = 'f5700000-0000-4000-8000-000000000001'), 'e5700000-0000-4000-8000-000000000001'::uuid, 'the confirmed employee is assigned');
select extensions.results_eq(
  $$select status, filled_employee_id, closed_by from public.shift_offers where id = current_setting('test.offer')::uuid$$,
  $$values ('filled'::text, 'e5700000-0000-4000-8000-000000000001'::uuid, 'a5700000-0000-4000-8000-000000000002'::uuid)$$, 'the filled offer records who confirmed it');
select extensions.results_eq(
  $$select employee_id, outcome from public.shift_offer_recipients where offer_id = current_setting('test.offer')::uuid order by employee_id$$,
  $$values ('e5700000-0000-4000-8000-000000000001'::uuid, 'confirmed'::text), ('e5700000-0000-4000-8000-000000000002', 'unavailable'), ('e5700000-0000-4000-8000-000000000007', 'not_selected')$$,
  'every claimant receives a clear outcome');
select extensions.throws_ok(
  $$select public.confirm_shift_offer_claim(current_setting('test.offer')::uuid, 'e5700000-0000-4000-8000-000000000007')$$,
  'P0001', 'Shift offer has already been filled', 'a second confirmation cannot assign another employee');
select extensions.throws_ok(
  $$select public.withdraw_shift_offer(current_setting('test.offer')::uuid)$$,
  'P0001', 'Shift offer is no longer open', 'filled offers cannot be withdrawn');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000010', true);
set local role authenticated;
select extensions.results_eq(
  $$select response, outcome, can_respond from public.list_my_shift_offers('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001')$$,
  $$values ('accepted'::text, 'not_selected'::text, false)$$, 'the unsuccessful claimant sees a clear status');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.lives_ok($$select public.withdraw_shift_offer(current_setting('test.boh_offer')::uuid)$$, 'the BOH manager withdraws their offer');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000009', true);
set local role authenticated;
select extensions.results_eq(
  $$select response, outcome, can_respond from public.list_my_shift_offers('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001')$$,
  $$values ('pending'::text, 'closed'::text, false)$$, 'withdrawn offers show as closed');
select extensions.throws_ok(
  $$select public.respond_shift_offer(current_setting('test.boh_offer')::uuid, 'accept')$$,
  'P0001', 'Shift offer is no longer available', 'withdrawn offers cannot be accepted');
reset role;
select extensions.throws_ok(
  $$update public.shift_offers set expires_at = expires_at + interval '1 day' where id = current_setting('test.offer')::uuid$$,
  'P0001', 'Shift offer history is immutable', 'closed offer history cannot be changed');
select extensions.throws_ok(
  $$update public.shift_offer_recipients set responded_at = now() where offer_id = current_setting('test.offer')::uuid and employee_id = 'e5700000-0000-4000-8000-000000000001'$$,
  'P0001', 'Shift offer history is immutable', 'recorded responses cannot be changed');
select extensions.throws_ok(
  $$update public.shift_offer_recipients set outcome = 'not_selected' where offer_id = current_setting('test.offer')::uuid and employee_id = 'e5700000-0000-4000-8000-000000000001'$$,
  'P0001', 'Shift offer history is immutable', 'recorded outcomes cannot be changed');

-- Late responses: a pending recipient cannot claim a filled offer, and an
-- employee who becomes ineligible no longer sees or can accept the offer.
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.lives_ok($$select public.withdraw_shift_offer('98000000-0000-4000-8000-000000000001')$$, 'the stale expired offer is withdrawn');
select extensions.isnt(set_config('test.late_offer', (select public.create_shift_offer('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000005', array['e5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000002', 'e5700000-0000-4000-8000-000000000007']::uuid[], '2032-04-06 12:00+00'))::text, true), null, 'the manager reoffers the shift to three employees');
reset role;
insert into public.employee_availability_exceptions (business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status)
values ('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001', 'e5700000-0000-4000-8000-000000000002', '2032-04-07', '2032-04-07', 'unavailable', 'active');
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.is((select count(*) from public.list_my_shift_offers('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001') where offer_id = current_setting('test.late_offer')::uuid)::integer, 0, 'an employee who becomes ineligible no longer sees the offer');
select extensions.throws_ok(
  $$select public.respond_shift_offer(current_setting('test.late_offer')::uuid, 'accept')$$,
  'P0001', 'You are no longer eligible for this shift', 'an employee who becomes ineligible cannot accept');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000010', true);
set local role authenticated;
select extensions.isnt(public.respond_shift_offer(current_setting('test.late_offer')::uuid, 'accept'), null, 'one employee claims the reoffered shift');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is(public.confirm_shift_offer_claim(current_setting('test.late_offer')::uuid, 'e5700000-0000-4000-8000-000000000007'), 'confirmed', 'the manager fills the reoffered shift');
reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.results_eq(
  $$select offer_status, response, outcome, can_respond from public.list_my_shift_offers('b5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000001') where offer_id = current_setting('test.late_offer')::uuid$$,
  $$values ('filled'::text, 'pending'::text, 'closed'::text, false)$$, 'a recipient who had not answered sees the filled offer as closed');
select extensions.throws_ok(
  $$select public.respond_shift_offer(current_setting('test.late_offer')::uuid, 'accept')$$,
  'P0001', 'Shift offer is no longer available', 'a filled offer cannot be accepted');
select extensions.throws_ok(
  $$select public.respond_shift_offer(current_setting('test.late_offer')::uuid, 'decline')$$,
  'P0001', 'Shift offer is no longer available', 'a filled offer cannot be declined');
reset role;
select extensions.ok(
  (select r.response = 'pending' and r.responded_at is null and s.employee_id = 'e5700000-0000-4000-8000-000000000007'
   from public.shift_offer_recipients r join public.shift_offers o on o.id = r.offer_id join public.shifts s on s.id = o.shift_id
   where r.offer_id = current_setting('test.late_offer')::uuid and r.employee_id = 'e5700000-0000-4000-8000-000000000001'),
  'a refused late response leaves the recipient unanswered and the assignment unchanged');
select * from extensions.finish();
rollback;
