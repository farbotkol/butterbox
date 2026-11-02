begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3100000-0000-4000-8000-000000000001', 'delete-owner@example.test', '{}'::jsonb),
  ('a3100000-0000-4000-8000-000000000002', 'delete-foh@example.test', '{}'::jsonb),
  ('a3100000-0000-4000-8000-000000000003', 'delete-boh@example.test', '{}'::jsonb),
  ('a3100000-0000-4000-8000-000000000004', 'delete-worker@example.test', '{}'::jsonb),
  ('a3100000-0000-4000-8000-000000000005', 'delete-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b3100000-0000-4000-8000-000000000001', 'Deletion test business'),
  ('b3100000-0000-4000-8000-000000000002', 'Outside deletion business');
insert into public.venues (id, business_id, name) values
  ('c3100000-0000-4000-8000-000000000001', 'b3100000-0000-4000-8000-000000000001', 'Venue'),
  ('c3100000-0000-4000-8000-000000000002', 'b3100000-0000-4000-8000-000000000002', 'Outside');
insert into public.departments (id, business_id, venue_id, name) values
  ('d3100000-0000-4000-8000-000000000001', 'b3100000-0000-4000-8000-000000000001', 'c3100000-0000-4000-8000-000000000001', 'FOH'),
  ('d3100000-0000-4000-8000-000000000002', 'b3100000-0000-4000-8000-000000000001', 'c3100000-0000-4000-8000-000000000001', 'BOH'),
  ('d3100000-0000-4000-8000-000000000003', 'b3100000-0000-4000-8000-000000000002', 'c3100000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b3100000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b3100000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000002', 'foh_manager', 'c3100000-0000-4000-8000-000000000001', 'd3100000-0000-4000-8000-000000000001'),
  ('b3100000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000003', 'boh_manager', 'c3100000-0000-4000-8000-000000000001', 'd3100000-0000-4000-8000-000000000002'),
  ('b3100000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000004', 'employee', 'c3100000-0000-4000-8000-000000000001', 'd3100000-0000-4000-8000-000000000001'),
  ('b3100000-0000-4000-8000-000000000002', 'a3100000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.shifts (
  id, business_id, venue_id, department_id, role_title, starts_at, ends_at, is_published, updated_at
) values
  ('f3100000-0000-4000-8000-000000000001', 'b3100000-0000-4000-8000-000000000001',
    'c3100000-0000-4000-8000-000000000001', 'd3100000-0000-4000-8000-000000000001',
    'Original draft', '2032-03-29 09:00+00', '2032-03-29 11:00+00', false, '2001-01-01 00:00:00.123456+00'),
  ('f3100000-0000-4000-8000-000000000002', 'b3100000-0000-4000-8000-000000000001',
    'c3100000-0000-4000-8000-000000000001', 'd3100000-0000-4000-8000-000000000001',
    'Published shift', '2032-03-30 09:00+00', '2032-03-30 11:00+00', true, '2001-01-01 00:00:00.123456+00'),
  ('f3100000-0000-4000-8000-000000000003', 'b3100000-0000-4000-8000-000000000001',
    'c3100000-0000-4000-8000-000000000001', 'd3100000-0000-4000-8000-000000000001',
    'Another draft', '2032-03-31 09:00+00', '2032-03-31 11:00+00', false, '2001-01-01 00:00:00.123456+00'),
  ('f3100000-0000-4000-8000-000000000004', 'b3100000-0000-4000-8000-000000000002',
    'c3100000-0000-4000-8000-000000000002', 'd3100000-0000-4000-8000-000000000003',
    'Outside draft', '2032-03-31 09:00+00', '2032-03-31 11:00+00', false, '2001-01-01 00:00:00.123456+00');

select extensions.ok(has_function_privilege('authenticated', 'public.delete_shift_if_unchanged(uuid,timestamptz)', 'execute'),
  'authenticated callers can request a guarded deletion');
select extensions.ok(not has_function_privilege('anon', 'public.delete_shift_if_unchanged(uuid,timestamptz)', 'execute'),
  'anonymous callers cannot execute guarded deletion');
set local role anon;
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000001', '2001-01-01 00:00:00.123456+00')$$,
  '42501', 'permission denied for function delete_shift_if_unchanged', 'anonymous deletion is denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged(null, '2001-01-01 00:00:00.123456+00')$$,
  'P0001', 'Invalid shift deletion request', 'a missing shift ID is rejected');
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Invalid shift deletion request', 'a missing revision is rejected');
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000001', '2001-01-01 00:00:00.123455+00')$$,
  'P0001', 'Permission denied', 'employees cannot delete or probe a stale draft');
select set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000001', '2001-01-01 00:00:00.123456+00')$$,
  'P0001', 'Permission denied', 'a BOH manager cannot delete an FOH draft');
select set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000001', '2001-01-01 00:00:00.123456+00')$$,
  'P0001', 'Permission denied', 'another business cannot delete the draft');

select set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000001', '2001-01-01 00:00:00.123455+00')$$,
  'P0001', 'Shift changed; reload the roster', 'a one-microsecond revision mismatch is stale');
select extensions.is((select count(*)::integer from public.shifts where id = 'f3100000-0000-4000-8000-000000000001'),
  1, 'a stale request leaves the original draft intact');
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000002', '2001-01-01 00:00:00.123456+00')$$,
  'P0001', 'Published shifts cannot be deleted', 'published shifts cannot be deleted');
select extensions.is((select count(*)::integer from public.shifts where id = 'f3100000-0000-4000-8000-000000000002'),
  1, 'the published shift remains');
select extensions.lives_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000003', '2001-01-01 00:00:00.123456+00')$$,
  'the scoped manager can delete an unchanged draft');
select extensions.is((select count(*)::integer from public.shifts where id = 'f3100000-0000-4000-8000-000000000003'),
  0, 'successful deletion removes only the requested draft');
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000003', '2001-01-01 00:00:00.123456+00')$$,
  'P0001', 'Shift not found', 'a repeated deletion reports the missing draft');

select set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000004', '2001-01-01 00:00:00.123456+00')$$,
  'P0001', 'Permission denied', 'the first owner cannot delete another business draft');
select set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000005', true);
select extensions.lives_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000004', '2001-01-01 00:00:00.123456+00')$$,
  'the outside owner can delete their own unchanged draft');
select extensions.is((select count(*)::integer from public.shifts where id = 'f3100000-0000-4000-8000-000000000004'),
  0, 'the outside draft is removed only by its owner');

reset role;
update public.shifts set role_title = 'Changed draft' where id = 'f3100000-0000-4000-8000-000000000001';
select extensions.ok(
  (select updated_at <> '2001-01-01 00:00:00.123456+00'::timestamptz from public.shifts
    where id = 'f3100000-0000-4000-8000-000000000001'),
  'editing the draft advances its revision');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3100000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000001', '2001-01-01 00:00:00.123456+00')$$,
  'P0001', 'Shift changed; reload the roster', 'a confirmation for the previous revision is rejected');
select extensions.is((select role_title from public.shifts where id = 'f3100000-0000-4000-8000-000000000001'),
  'Changed draft', 'the newer draft remains unchanged');
select extensions.lives_ok(
  $$select public.delete_shift_if_unchanged('f3100000-0000-4000-8000-000000000001',
    (select updated_at from public.shifts where id = 'f3100000-0000-4000-8000-000000000001'))$$,
  'a fresh confirmation can delete the updated draft');
select extensions.is((select count(*)::integer from public.shifts where id = 'f3100000-0000-4000-8000-000000000001'),
  0, 'the freshly confirmed draft is removed');
select extensions.is((select count(*)::integer from public.shifts where id = 'f3100000-0000-4000-8000-000000000002'),
  1, 'the published shift remains after other deletions');

select * from extensions.finish();
rollback;
