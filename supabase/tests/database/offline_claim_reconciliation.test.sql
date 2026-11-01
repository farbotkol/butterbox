begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.plan(44);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a8000000-0000-4000-8000-000000000001', 'review-owner@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000002', 'review-foh@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000003', 'review-boh@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000004', 'review-worker@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000005', 'review-colleague@example.test', '{}'::jsonb),
  ('a8000000-0000-4000-8000-000000000006', 'review-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b8000000-0000-4000-8000-000000000001', 'Review cafe'),
  ('b8000000-0000-4000-8000-000000000002', 'Other cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'Main', 'UTC'),
  ('c8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000002', 'Other', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'FOH'),
  ('d8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'BOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002', 'foh_manager', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000003', 'boh_manager', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000002'),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004', 'employee', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000005', 'employee', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000006', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004', 'Worker', 'Server'),
  ('e8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000005', 'Colleague', 'Server');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('28000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004'),
  ('28000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000005'),
  ('28000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at
)
select f.id::uuid, s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by,
  gen_random_uuid(), f.event_type, f.occurred_at::timestamptz
from (values
  ('48000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000001', 'clock_in', '2024-01-10 09:00+00'),
  ('48000000-0000-4000-8000-000000000002', '28000000-0000-4000-8000-000000000001', 'clock_out', '2024-01-10 17:00+00'),
  ('48000000-0000-4000-8000-000000000003', '28000000-0000-4000-8000-000000000002', 'clock_in', '2024-01-10 09:00+00'),
  ('48000000-0000-4000-8000-000000000004', '28000000-0000-4000-8000-000000000002', 'clock_out', '2024-01-10 17:00+00'),
  ('48000000-0000-4000-8000-000000000005', '28000000-0000-4000-8000-000000000003', 'clock_in', '2024-01-11 09:00+00')
) as f(id, session_id, event_type, occurred_at)
join public.attendance_sessions s on s.id = f.session_id::uuid;
insert into public.attendance_offline_claims (
  id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, claimed_at
)
select f.id::uuid, 'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001',
  'a8000000-0000-4000-8000-000000000004', gen_random_uuid(), f.event_type, f.claimed_at::timestamptz
from (values
  ('18000000-0000-4000-8000-000000000001', 'clock_in', '2024-01-10 08:45:00.123456+00'),
  ('18000000-0000-4000-8000-000000000002', 'clock_out', '2024-01-10 17:05+00'),
  ('18000000-0000-4000-8000-000000000003', 'clock_in', '2024-01-10 08:00+00'),
  ('18000000-0000-4000-8000-000000000004', 'clock_out', '2024-01-10 17:10+00')
) as f(id, event_type, claimed_at);

create function pg_temp.review(
  p_claim uuid, p_request uuid, p_decision text, p_event uuid, p_old timestamptz, p_reason text
)
returns uuid language sql as $$
  select public.review_attendance_offline_claim(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001',
    p_claim, p_request, p_decision, p_event, p_old, p_reason
  );
$$;

set local role anon;
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'rejected', null, null, 'Duplicate')$$, '42501', null, 'anonymous callers cannot review claims');
select extensions.throws_ok(
  $$select * from public.attendance_offline_claim_reviews$$, '42501', null,
  'anonymous callers cannot read claim reviews');
select extensions.throws_ok(
  $$select * from public.list_attendance_offline_match_events(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot list match candidates');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000004', true);
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'rejected', null, null, 'Duplicate')$$, 'P0001', 'Claim not found or permission denied',
  'employees cannot review their own claims');
select extensions.throws_ok(
  $$select * from public.list_attendance_offline_match_events(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'employees cannot list management match candidates');
select extensions.throws_ok(
  $$insert into public.attendance_offline_claim_reviews
    (business_id, claim_id, actor_id, request_id, decision, reason)
    values ('b8000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001',
      auth.uid(), gen_random_uuid(), 'rejected', 'Forged')$$,
  '42501', null, 'employees cannot forge review history');

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000003', true);
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'rejected', null, null, 'Duplicate')$$, 'P0001', 'Claim not found or permission denied',
  'BOH managers cannot review FOH claims');
select extensions.is(
  (select count(*)::integer from public.list_attendance_offline_match_events(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')),
  0, 'BOH managers cannot list FOH event candidates');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000006', true);
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'rejected', null, null, 'Duplicate')$$, 'P0001', 'Permission denied',
  'another business cannot review a claim');
select extensions.throws_ok(
  $$select * from public.list_attendance_offline_claim_reviews(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'another business cannot list review history');

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.list_attendance_offline_match_events(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')),
  4, 'only finished scoped clock events are candidates');
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'corrected', '48000000-0000-4000-8000-000000000003', '2024-01-10 09:00+00', 'Wrong worker')$$,
  'P0001', 'Matching attendance event not found', 'a claim cannot be matched to another worker');
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'corrected', '48000000-0000-4000-8000-000000000002', '2024-01-10 17:00+00', 'Wrong type')$$,
  'P0001', 'Matching attendance event not found', 'a claim cannot be matched to the wrong event type');
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'matched', '48000000-0000-4000-8000-000000000005', '2024-01-11 09:00+00', 'Open')$$,
  'P0001', 'Only finished sessions can be reconciled', 'open attendance cannot be reconciled');
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'matched', '48000000-0000-4000-8000-000000000001', '2024-01-10 08:00+00', 'Stale')$$,
  'P0001', 'Attendance changed; refresh before reconciling', 'a stale match is rejected');
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'rejected', null, null, '  ')$$,
  'P0001', 'Invalid offline claim review', 'a reason is required');

select set_config('test.review_id', pg_temp.review(
  '18000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000001',
  'corrected', '48000000-0000-4000-8000-000000000001', '2024-01-10 09:00+00', '  Confirmed start  ')::text, true);
select extensions.is(
  pg_temp.review('18000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000001',
    'corrected', '48000000-0000-4000-8000-000000000001', '2024-01-10 09:00+00', 'Confirmed start')::text,
  current_setting('test.review_id'), 'identical review retries are idempotent');
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000001',
    'corrected', '48000000-0000-4000-8000-000000000001', '2024-01-10 09:00+00', 'Changed')$$,
  'P0001', 'Request identifier already used', 'a changed retry is rejected');
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'rejected', null, null, 'Again')$$,
  'P0001', 'Claim has already been reviewed', 'a reviewed claim cannot be decided twice');
select extensions.is(
  (select occurred_at from public.attendance_events where id = '48000000-0000-4000-8000-000000000001'),
  '2024-01-10 09:00+00'::timestamptz, 'the original server event remains unchanged');
select extensions.is(
  (select claimed_at from public.attendance_offline_claims where id = '18000000-0000-4000-8000-000000000001'),
  '2024-01-10 08:45:00.123456+00'::timestamptz, 'the original device claim retains microseconds');
select extensions.ok(
  (select received_at >= claimed_at from public.attendance_offline_claims where id = '18000000-0000-4000-8000-000000000001'),
  'the server receipt remains separate from the claimed time');
select extensions.is(
  (select old_at from public.attendance_offline_claim_reviews where id = current_setting('test.review_id')::uuid),
  '2024-01-10 09:00+00'::timestamptz, 'review history retains the previous effective time');
select extensions.is(
  (select actor_id from public.attendance_offline_claim_reviews where id = current_setting('test.review_id')::uuid),
  'a8000000-0000-4000-8000-000000000002'::uuid, 'review history retains the manager');
select extensions.is(
  (select reason from public.attendance_offline_claim_reviews where id = current_setting('test.review_id')::uuid),
  'Confirmed start', 'review history retains the reason');
select extensions.ok(
  (select r.correction_id = c.id and c.new_at = '2024-01-10 08:45:00.123456+00'::timestamptz
    from public.attendance_offline_claim_reviews r join public.attendance_event_corrections c on c.id = r.correction_id
    where r.id = current_setting('test.review_id')::uuid),
  'the manager decision links the exact attributed correction');
select extensions.is(
  (select worked_seconds from public.list_worked_time(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')
    where session_id = '28000000-0000-4000-8000-000000000001'),
  29699.876544::numeric, 'work time recalculates from the exact claim');

select extensions.lives_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000002', '58000000-0000-4000-8000-000000000002',
    'matched', '48000000-0000-4000-8000-000000000002', '2024-01-10 17:00+00', 'Already recorded')$$,
  'a claim can be matched without changing an event');
select extensions.is(
  (select count(*)::integer from public.attendance_event_corrections), 1,
  'matching an existing event creates no additional correction');
select extensions.lives_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000003', '58000000-0000-4000-8000-000000000003',
    'rejected', null, null, 'Duplicate')$$,
  'a manager can reject an invalid claim with a reason');
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000004',
    'reopened', null, null, 'Review again')$$,
  'P0001', 'Only an owner or general manager can reopen a claim',
  'a department manager cannot reopen a reviewed claim');
select extensions.throws_ok(
  $$update public.attendance_offline_claim_reviews set reason = 'Changed'$$,
  '42501', null, 'managers cannot update review history directly');

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
select extensions.lives_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000004',
    'reopened', null, null, 'Review again')$$,
  'an owner can reopen a claim with a reason');
select extensions.is(
  (select worked_seconds from public.list_worked_time(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')
    where session_id = '28000000-0000-4000-8000-000000000001'),
  29699.876544::numeric, 'reopening a decision does not undo its correction');
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000001', gen_random_uuid(),
    'reopened', null, null, 'Again')$$,
  'P0001', 'Claim is already awaiting review', 'a pending claim cannot be reopened again');
select extensions.lives_ok(
  $$select public.set_attendance_edit_lock(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000001', gen_random_uuid(), true, 'Reviewed')$$,
  'an owner can lock the session');
select extensions.throws_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000004', gen_random_uuid(),
    'corrected', '48000000-0000-4000-8000-000000000002', '2024-01-10 17:00+00', 'Correct end')$$,
  'P0001', 'Attendance edits are locked', 'reconciliation cannot bypass an attendance edit lock');
select extensions.lives_ok(
  $$select pg_temp.review('18000000-0000-4000-8000-000000000004', '58000000-0000-4000-8000-000000000005',
    'matched', '48000000-0000-4000-8000-000000000002', '2024-01-10 17:00+00', 'Already recorded')$$,
  'a locked event can be linked without changing its time');

select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::integer from public.list_attendance_offline_claim_reviews(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')),
  5, 'the employee can see their review history');
select extensions.is(
  (select decision from public.list_attendance_offline_claim_reviews(
    'b8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001')
    where claim_id = '18000000-0000-4000-8000-000000000001' order by sequence desc limit 1),
  'reopened', 'review history exposes the latest decision in immutable order');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000005', true);
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claim_reviews), 0,
  'a colleague cannot see another worker review history');
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.attendance_offline_claim_reviews), 0,
  'a BOH manager cannot see FOH review history');
set local role service_role;
select extensions.throws_ok(
  $$select * from public.attendance_offline_claim_reviews$$, '42501', null,
  'service role cannot read review history directly');
reset role;
select extensions.throws_ok(
  $$delete from public.attendance_offline_claim_reviews$$,
  'P0001', 'Original attendance records are immutable', 'privileged deletes cannot alter review history');
select * from extensions.finish();
rollback;
