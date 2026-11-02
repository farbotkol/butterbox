begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7b00000-0000-4000-8000-000000000001', 'review-owner@example.test', '{}'::jsonb),
  ('a7b00000-0000-4000-8000-000000000002', 'review-foh@example.test', '{}'::jsonb),
  ('a7b00000-0000-4000-8000-000000000003', 'review-boh@example.test', '{}'::jsonb),
  ('a7b00000-0000-4000-8000-000000000004', 'review-worker@example.test', '{}'::jsonb),
  ('a7b00000-0000-4000-8000-000000000005', 'review-outside@example.test', '{}'::jsonb),
  ('a7b00000-0000-4000-8000-000000000006', 'review-general@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7b00000-0000-4000-8000-000000000001', 'Review cafe'),
  ('b7b00000-0000-4000-8000-000000000002', 'Outside review cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c7b00000-0000-4000-8000-000000000001', 'b7b00000-0000-4000-8000-000000000001', 'Harbour', 'UTC'),
  ('c7b00000-0000-4000-8000-000000000002', 'b7b00000-0000-4000-8000-000000000001', 'Other venue', 'UTC'),
  ('c7b00000-0000-4000-8000-000000000003', 'b7b00000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7b00000-0000-4000-8000-000000000001', 'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001', 'FOH'),
  ('d7b00000-0000-4000-8000-000000000002', 'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001', 'BOH'),
  ('d7b00000-0000-4000-8000-000000000003', 'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000002', 'Other'),
  ('d7b00000-0000-4000-8000-000000000004', 'b7b00000-0000-4000-8000-000000000002', 'c7b00000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7b00000-0000-4000-8000-000000000001', 'a7b00000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7b00000-0000-4000-8000-000000000001', 'a7b00000-0000-4000-8000-000000000002', 'foh_manager', 'c7b00000-0000-4000-8000-000000000001', 'd7b00000-0000-4000-8000-000000000001'),
  ('b7b00000-0000-4000-8000-000000000001', 'a7b00000-0000-4000-8000-000000000003', 'boh_manager', 'c7b00000-0000-4000-8000-000000000001', 'd7b00000-0000-4000-8000-000000000002'),
  ('b7b00000-0000-4000-8000-000000000001', 'a7b00000-0000-4000-8000-000000000004', 'employee', 'c7b00000-0000-4000-8000-000000000001', 'd7b00000-0000-4000-8000-000000000001'),
  ('b7b00000-0000-4000-8000-000000000002', 'a7b00000-0000-4000-8000-000000000005', 'owner', null, null),
  ('b7b00000-0000-4000-8000-000000000001', 'a7b00000-0000-4000-8000-000000000006', 'general_manager', 'c7b00000-0000-4000-8000-000000000001', null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7b00000-0000-4000-8000-000000000001', 'b7b00000-0000-4000-8000-000000000001',
   'c7b00000-0000-4000-8000-000000000001', 'd7b00000-0000-4000-8000-000000000001',
   'a7b00000-0000-4000-8000-000000000004', 'Review worker', 'Server');
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, break_minutes
) values
  ('f7b00000-0000-4000-8000-000000000001', 'b7b00000-0000-4000-8000-000000000001',
   'c7b00000-0000-4000-8000-000000000001', 'd7b00000-0000-4000-8000-000000000001',
   'e7b00000-0000-4000-8000-000000000001', 'Earlier direct', '2032-03-08 09:00+00', '2032-03-08 10:00+00', 0),
  ('f7b00000-0000-4000-8000-000000000002', 'b7b00000-0000-4000-8000-000000000001',
   'c7b00000-0000-4000-8000-000000000001', 'd7b00000-0000-4000-8000-000000000001',
   'e7b00000-0000-4000-8000-000000000001', 'Draft server', '2032-03-15 09:00+00', '2032-03-15 10:00+00', 0);

select extensions.is(
  (select roster_publication_mode from public.venues where id = 'c7b00000-0000-4000-8000-000000000001'),
  'direct', 'existing publication behavior is the default');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000002', true);
select extensions.is(
  public.publish_roster('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-08'),
  1, 'a scoped manager can directly publish when approval is disabled');
select extensions.throws_ok(
  $$select public.save_roster_publication_mode('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001', 'approval')$$,
  'P0001', 'Permission denied', 'a departmental manager cannot change the publication mode');
select extensions.ok(
  not has_function_privilege('authenticated', 'public.publish_roster_review_internal(uuid,uuid,uuid,date,uuid[])', 'EXECUTE'),
  'authenticated callers cannot invoke the reviewed publication helper directly');
select extensions.throws_ok(
  $$select public.publish_roster_review_internal('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15', array['f7b00000-0000-4000-8000-000000000002']::uuid[])$$,
  '42501', null, 'the internal publication helper cannot bypass review');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000005', true);
select extensions.throws_ok(
  $$select public.save_roster_publication_mode('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001', 'approval')$$,
  'P0001', 'Permission denied', 'another tenant owner cannot change this venue');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.save_roster_publication_mode('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001', 'invalid')$$,
  'P0001', 'Invalid roster publication mode', 'invalid publication modes fail explicitly');
select extensions.lives_ok(
  $$select public.save_roster_publication_mode('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001', 'approval')$$,
  'the owner enables approval for a venue');
select extensions.is(
  (select roster_publication_mode from public.venues where id = 'c7b00000-0000-4000-8000-000000000002'),
  'direct', 'changing one venue does not change another venue');
select extensions.is(
  (select count(*)::integer from public.roster_publication_mode_events where old_mode = 'direct' and new_mode = 'approval'
    and actor_id = 'a7b00000-0000-4000-8000-000000000001' and revision = 1),
  1, 'the mode change records its actor and old and new values');
select extensions.is(
  (select count(*)::integer from public.sensitive_action_audit where source_table = 'venues'
    and record_id = 'c7b00000-0000-4000-8000-000000000001'
    and old_values ->> 'roster_publication_mode' = 'direct'
    and new_values ->> 'roster_publication_mode' = 'approval'),
  1, 'the owner audit also records the mode change');
select extensions.lives_ok(
  $$select public.save_roster_publication_mode('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001', 'approval')$$,
  'saving the same mode is idempotent');
select extensions.is((select count(*)::integer from public.roster_publication_mode_events), 1,
  'a no-op mode save does not create an audit event');
select extensions.throws_ok(
  $$select public.publish_roster('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15')$$,
  'P0001', 'Roster approval is required', 'even an owner cannot bypass enabled review through direct publication');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.publish_roster('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15')$$,
  'P0001', 'Roster approval is required', 'departmental direct publication is blocked while approval is enabled');
select extensions.throws_ok(
  $$select public.submit_roster_review('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000002',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15', '17b00000-0000-4000-8000-000000000001')$$,
  'P0001', 'Venue or active department not found', 'a mismatched venue and department cannot be submitted');
select extensions.throws_ok(
  $$select public.submit_roster_review('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-16', '17b00000-0000-4000-8000-000000000001')$$,
  'P0001', 'Invalid roster review request', 'non-Monday weeks are rejected');
select extensions.throws_ok(
  $$select public.submit_roster_review('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-22', '17b00000-0000-4000-8000-000000000001')$$,
  'P0001', 'There are no draft shifts to review', 'empty review requests fail explicitly');
select set_config('test.review_one', public.submit_roster_review(
  'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
  'd7b00000-0000-4000-8000-000000000001', '2032-03-15', '17b00000-0000-4000-8000-000000000001')::text, true);
select extensions.is(
  public.submit_roster_review('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15', '17b00000-0000-4000-8000-000000000001'),
  current_setting('test.review_one')::uuid, 'repeating the submission identifier returns the same request');
select extensions.throws_ok(
  $$select public.submit_roster_review('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-22', '17b00000-0000-4000-8000-000000000001')$$,
  'P0001', 'Request identifier already used', 'a submission identifier cannot be reused for a different week');
select extensions.throws_ok(
  $$select public.submit_roster_review('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15', '17b00000-0000-4000-8000-000000000002')$$,
  'P0001', 'A roster review is already pending', 'only one review can be pending for a scope');
select extensions.is(
  (select jsonb_array_length(changes) from public.list_roster_reviews(
    'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15')),
  1, 'a manager can see the exact submitted changes');
select extensions.is(
  (select changes -> 0 ->> 'employee_name' from public.list_roster_reviews(
    'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15')),
  'Review worker', 'the reviewer sees the submitted worker');
select extensions.is(
  (select is_published from public.shifts where id = 'f7b00000-0000-4000-8000-000000000002'),
  false, 'submission does not publish the draft');
select extensions.is(
  (select count(*)::integer from public.roster_publications where week_start = '2032-03-15'),
  0, 'submission does not create a publication or send its notifications');
select extensions.throws_ok(
  $$select public.decide_roster_review(current_setting('test.review_one')::uuid, 'approved',
    '27b00000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'A different authorised reviewer is required', 'the submitter cannot approve their own request');
select extensions.throws_ok(
  $$select public.decide_roster_review(current_setting('test.review_one')::uuid, 'rejected',
    '27b00000-0000-4000-8000-000000000001', 'No')$$,
  'P0001', 'A different authorised reviewer is required', 'the submitter cannot reject their own request as reviewer');
select extensions.throws_ok(
  $$update public.roster_review_requests set week_start = '2032-03-22'
    where id = current_setting('test.review_one')::uuid$$,
  '42501', null, 'ordinary users cannot edit the request');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000003', true);
select extensions.is((select count(*)::integer from public.roster_review_requests), 0,
  'another department cannot view the request');
select extensions.is((select count(*)::integer from public.roster_review_shifts), 0,
  'another department cannot view the snapshot');
select extensions.throws_ok(
  $$select public.decide_roster_review(current_setting('test.review_one')::uuid, 'approved',
    '27b00000-0000-4000-8000-000000000002', null)$$,
  'P0001', 'Permission denied', 'another department cannot approve the request');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000004', true);
select extensions.is((select count(*)::integer from public.roster_review_requests), 0,
  'employees cannot view unpublished review snapshots');
select extensions.is((select count(*)::integer from public.roster_review_shifts), 0,
  'employees cannot read submitted shift details');
select extensions.throws_ok(
  $$select public.submit_roster_review('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15', '17b00000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'employees cannot submit a roster for review');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000005', true);
select extensions.is((select count(*)::integer from public.roster_review_requests), 0,
  'another tenant cannot view the request');
select extensions.is((select count(*)::integer from public.roster_review_shifts), 0,
  'another tenant cannot read submitted shift details');
select extensions.throws_ok(
  $$select public.decide_roster_review(current_setting('test.review_one')::uuid, 'approved',
    '27b00000-0000-4000-8000-000000000003', null)$$,
  'P0001', 'Permission denied', 'another tenant cannot approve the request');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$select public.decide_roster_review(current_setting('test.review_one')::uuid, 'rejected',
    '27b00000-0000-4000-8000-000000000004', '  ')$$,
  'P0001', 'Invalid roster review decision', 'rejection requires a reason');
select extensions.is(
  public.decide_roster_review(current_setting('test.review_one')::uuid, 'rejected',
    '27b00000-0000-4000-8000-000000000004', 'Check the coverage'),
  0, 'the owner rejects without publishing');
select extensions.is(
  public.decide_roster_review(current_setting('test.review_one')::uuid, 'rejected',
    '27b00000-0000-4000-8000-000000000004', 'Check the coverage'),
  0, 'a repeated decision identifier returns the original result');
select extensions.is(
  (select reason from public.roster_review_decisions where review_id = current_setting('test.review_one')::uuid),
  'Check the coverage', 'the rejection reason is retained');
select extensions.is(
  (select actor_id from public.roster_review_decisions where review_id = current_setting('test.review_one')::uuid),
  'a7b00000-0000-4000-8000-000000000001'::uuid, 'the rejecting actor is retained');
select extensions.is(
  (select count(*)::integer from public.sensitive_action_audit
    where source_table = 'roster_review_decisions' and reason = 'Check the coverage'),
  1, 'the scoped decision is included in the owner audit');
select extensions.throws_ok(
  $$select public.decide_roster_review(current_setting('test.review_one')::uuid, 'approved',
    '27b00000-0000-4000-8000-000000000005', null)$$,
  'P0001', 'Roster review already decided', 'a decided request cannot be approved later');
select extensions.throws_ok(
  $$update public.roster_review_decisions set reason = 'Changed' where review_id = current_setting('test.review_one')::uuid$$,
  '42501', null, 'ordinary users cannot edit a decision');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000002', true);
select extensions.is(
  (select reason from public.list_roster_reviews(
    'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15') where review_id = current_setting('test.review_one')::uuid),
  'Check the coverage', 'the submitting manager can see the decision');
select set_config('test.review_two', public.submit_roster_review(
  'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
  'd7b00000-0000-4000-8000-000000000001', '2032-03-15', '17b00000-0000-4000-8000-000000000004')::text, true);
reset role;
update public.shifts set role_title = 'Changed draft' where id = 'f7b00000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000001', true);
select extensions.ok(
  (select stale from public.list_roster_reviews(
    'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
    'd7b00000-0000-4000-8000-000000000001', '2032-03-15') where review_id = current_setting('test.review_two')::uuid),
  'a changed draft is visibly stale');
select extensions.throws_ok(
  $$select public.decide_roster_review(current_setting('test.review_two')::uuid, 'approved',
    '27b00000-0000-4000-8000-000000000006', null)$$,
  'P0001', 'Submitted roster changed; withdraw or reject and resubmit', 'stale changes cannot be approved');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000002', true);
select extensions.is(
  public.decide_roster_review(current_setting('test.review_two')::uuid, 'withdrawn',
    '27b00000-0000-4000-8000-000000000007', null),
  0, 'the requester can withdraw a stale request');
select set_config('test.review_three', public.submit_roster_review(
  'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
  'd7b00000-0000-4000-8000-000000000001', '2032-03-15', '17b00000-0000-4000-8000-000000000005')::text, true);
reset role;
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, break_minutes
) values (
  'f7b00000-0000-4000-8000-000000000003', 'b7b00000-0000-4000-8000-000000000001',
  'c7b00000-0000-4000-8000-000000000001', 'd7b00000-0000-4000-8000-000000000001',
  null, 'Later open draft', '2032-03-15 11:00+00', '2032-03-15 12:00+00', 0
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000006', true);
select extensions.is(
  public.decide_roster_review(current_setting('test.review_three')::uuid, 'approved',
    '27b00000-0000-4000-8000-000000000008', null),
  1, 'a scoped general manager approves exactly the reviewed shift');
select extensions.is(
  (select is_published from public.shifts where id = 'f7b00000-0000-4000-8000-000000000002'),
  true, 'the reviewed shift is published');
select extensions.is(
  (select is_published from public.shifts where id = 'f7b00000-0000-4000-8000-000000000003'),
  false, 'a draft added after submission is not silently published');
select extensions.is(
  (select count(*)::integer from public.roster_publications where week_start = '2032-03-15' and new_shift_count = 1),
  1, 'approval uses the existing versioned publication mechanism');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::integer from public.list_roster_notifications(
    'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001')
    where week_start = '2032-03-15'),
  1, 'approval creates one existing publication notification recipient');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000006', true);
select extensions.is(
  public.decide_roster_review(current_setting('test.review_three')::uuid, 'approved',
    '27b00000-0000-4000-8000-000000000008', null),
  1, 'approval retry returns the original count without republishing');
select extensions.is(
  (select count(*)::integer from public.roster_publications where week_start = '2032-03-15'),
  1, 'approval retry creates no duplicate publication');
select extensions.is(
  (select count(*)::integer from public.roster_review_decisions where review_id = current_setting('test.review_three')::uuid),
  1, 'approval retry creates no duplicate decision');
select extensions.throws_ok(
  $$select public.decide_roster_review(current_setting('test.review_three')::uuid, 'rejected',
    '27b00000-0000-4000-8000-000000000008', 'Changed')$$,
  'P0001', 'Request identifier already used', 'a decision identifier cannot be reused with different input');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000002', true);
select set_config('test.review_four', public.submit_roster_review(
  'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
  'd7b00000-0000-4000-8000-000000000001', '2032-03-15', '17b00000-0000-4000-8000-000000000006')::text, true);
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000001', true);
select public.save_roster_publication_mode('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001', 'direct');
select public.save_roster_publication_mode('b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001', 'approval');
select extensions.throws_ok(
  $$select public.decide_roster_review(current_setting('test.review_four')::uuid, 'approved',
    '27b00000-0000-4000-8000-000000000009', null)$$,
  'P0001', 'Roster approval settings changed', 'a mode change invalidates a prior review even after re-enabling');
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000002', true);
select extensions.is(
  public.decide_roster_review(current_setting('test.review_four')::uuid, 'withdrawn',
    '27b00000-0000-4000-8000-000000000010', null),
  0, 'the requester can withdraw a policy-stale review');
reset role;
select extensions.throws_ok(
  $$update public.venues set roster_publication_mode = 'direct'
    where id = 'c7b00000-0000-4000-8000-000000000001'$$,
  'P0001', 'Roster publication revision must advance with its mode',
  'even a privileged mode change must advance the revision');
select extensions.throws_ok(
  $$update public.venues set roster_publication_revision = roster_publication_revision + 1
    where id = 'c7b00000-0000-4000-8000-000000000001'$$,
  'P0001', 'Roster publication revision requires a mode change',
  'a revision cannot be changed independently of the mode');
insert into public.shifts (
  id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, break_minutes
) values (
  'f7b00000-0000-4000-8000-000000000004', 'b7b00000-0000-4000-8000-000000000001',
  'c7b00000-0000-4000-8000-000000000001', 'd7b00000-0000-4000-8000-000000000001',
  'e7b00000-0000-4000-8000-000000000001', 'Overlapping draft',
  '2032-03-15 09:30+00', '2032-03-15 10:30+00', 0
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000002', true);
select set_config('test.review_five', public.submit_roster_review(
  'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
  'd7b00000-0000-4000-8000-000000000001', '2032-03-15', '17b00000-0000-4000-8000-000000000007')::text, true);
select set_config('request.jwt.claim.sub', 'a7b00000-0000-4000-8000-000000000001', true);
select public.save_venue_conflict_policy(
  'b7b00000-0000-4000-8000-000000000001', 'c7b00000-0000-4000-8000-000000000001',
  false, false, true, false);
select extensions.throws_ok(
  $$select public.decide_roster_review(current_setting('test.review_five')::uuid, 'approved',
    '27b00000-0000-4000-8000-000000000011', null)$$,
  'P0001', 'Roster has overlapping shifts', 'approval rechecks the current publication conflict policy');
select extensions.is(
  (select count(*)::integer from public.roster_review_decisions where review_id = current_setting('test.review_five')::uuid),
  0, 'a blocked approval does not create a decision');
select extensions.is(
  (select is_published from public.shifts where id = 'f7b00000-0000-4000-8000-000000000004'),
  false, 'a blocked approval leaves conflicting shifts private');
reset role;
select extensions.throws_ok(
  $$delete from public.roster_review_shifts where review_id = current_setting('test.review_three')::uuid$$,
  'P0001', 'Roster review records are immutable', 'a privileged accidental snapshot deletion is blocked');
select extensions.throws_ok(
  $$delete from public.roster_review_decisions where review_id = current_setting('test.review_three')::uuid$$,
  'P0001', 'Roster review records are immutable', 'a privileged accidental decision deletion is blocked');
select * from extensions.finish();
rollback;
