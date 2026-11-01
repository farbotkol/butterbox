begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select extensions.plan(47);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3000000-0000-4000-8000-000000000001', 'versions-owner@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000002', 'versions-foh@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000003', 'versions-boh@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000004', 'versions-worker@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000005', 'versions-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b3000000-0000-4000-8000-000000000001', 'Version business'),
  ('b3000000-0000-4000-8000-000000000002', 'Outside version business');
insert into public.venues (id, business_id, name, timezone) values
  ('c3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000002', 'Outside', 'UTC');
insert into public.departments (id, business_id, venue_id, name) values
  ('d3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'FOH'),
  ('d3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'BOH'),
  ('d3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'foh_manager', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'boh_manager', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002'),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000004', 'employee', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000005', 'owner', null, null);
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000004', 'Shared worker', 'Server');
insert into public.employee_departments (business_id, employee_id, department_id) values
  ('b3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002');
insert into public.shifts (id, business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at, break_minutes, is_published) values
  ('f3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'Legacy published', '2032-03-14 20:00+00', '2032-03-14 21:00+00', 0, true),
  ('f3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'First assigned', '2032-03-14 22:00+00', '2032-03-14 23:00+00', 15, false),
  ('f3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', null, 'Open coverage', '2032-03-14 23:00+00', '2032-03-15 00:00+00', 0, false),
  ('f3000000-0000-4000-8000-000000000004', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000001', 'Private BOH', '2032-03-15 01:00+00', '2032-03-15 02:00+00', 0, false),
  ('f3000000-0000-4000-8000-000000000005', 'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'Next week', '2032-03-21 22:00+00', '2032-03-21 23:00+00', 0, false),
  ('f3000000-0000-4000-8000-000000000006', 'b3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003', null, 'Outside draft', '2032-03-15 09:00+00', '2032-03-15 10:00+00', 0, false);

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.roster_publications), 0,
  'pre-existing published shifts and drafts do not fabricate historical versions');
select extensions.is(
  public.publish_roster('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001', '2032-03-15'),
  2, 'the first publication publishes two FOH drafts');
select extensions.is((select count(*)::integer from public.roster_publications), 1,
  'the first publication records exactly one version');
select set_config('test.first_publication', (select id::text from public.roster_publications), true);
select extensions.is((select version from public.roster_publications), 1, 'the first version is numbered one');
select extensions.is((select week_start from public.roster_publications), '2032-03-15'::date,
  'the version uses the venue-local Monday even when the shift starts on Sunday UTC');
select extensions.is((select venue_timezone from public.roster_publications), 'Australia/Sydney',
  'the version records the timezone used to determine the roster week');
select extensions.is((select published_by from public.roster_publications),
  'a3000000-0000-4000-8000-000000000001'::uuid, 'the publishing actor is recorded');
select extensions.ok((select published_at is not null from public.roster_publications),
  'the publication time is recorded');
select extensions.is((select new_shift_count from public.roster_publications), 2,
  'the version records the number of newly published shifts');
select extensions.is((select shift_count from public.roster_publications), 3,
  'the version includes previously published shifts in the same roster');
select extensions.is((select count(*)::integer from public.roster_publication_shifts), 3,
  'the full published roster is snapshotted');
select extensions.is(
  (select count(*)::integer from public.roster_publication_shifts
    where shift_id = 'f3000000-0000-4000-8000-000000000002'
      and employee_id = 'e3000000-0000-4000-8000-000000000001'
      and role_title = 'First assigned' and starts_at = '2032-03-14 22:00+00'
      and ends_at = '2032-03-14 23:00+00' and break_minutes = 15),
  1, 'the snapshot preserves the assigned worker, role, exact times and break');
select extensions.is(
  (select count(*)::integer from public.roster_publication_shifts
    where shift_id = 'f3000000-0000-4000-8000-000000000003' and employee_id is null),
  1, 'the published snapshot preserves open shifts');
select extensions.is(
  (select count(*)::integer from public.roster_publication_shifts
    where shift_id in ('f3000000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000005')),
  0, 'another department and week are not included');
select extensions.is(
  public.publish_roster('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001', '2032-03-15'),
  0, 'repeating publication without drafts remains a no-op');
select extensions.is((select count(*)::integer from public.roster_publications), 1,
  'a no-op publication does not create another version');
select extensions.throws_ok(
  $$update public.roster_publications set version = 99$$,
  '42501', null, 'owners cannot directly change publication history');
select extensions.throws_ok(
  $$delete from public.roster_publication_shifts$$,
  '42501', null, 'owners cannot directly delete snapshot records');

reset role;
update public.shifts set role_title = 'Legacy changed later'
where id = 'f3000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select role_title from public.roster_publication_shifts
    where publication_id = current_setting('test.first_publication')::uuid
      and shift_id = 'f3000000-0000-4000-8000-000000000001'),
  'Legacy published', 'the original snapshot does not change when a source shift changes');
select extensions.is((select count(*)::integer from public.roster_publications), 1,
  'an ordinary shift update does not create a publication version');
select extensions.lives_ok(
  $$select public.save_shift('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
    'Second publication', '2032-03-16 09:00', '2032-03-16 10:00', 5)$$,
  'a new draft can be added after publication');
select extensions.is(
  public.publish_roster('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001', '2032-03-15'),
  1, 'only the newly added draft is published');
select extensions.is((select count(*)::integer from public.roster_publications), 2,
  'a later publication records a second version');
select extensions.is(
  (select count(*)::integer from public.roster_publications where version = 2 and new_shift_count = 1 and shift_count = 4),
  1, 'the second version contains the complete four-shift roster and one new shift');
select extensions.is(
  (select count(*)::integer from public.roster_publication_shifts
    where publication_id = current_setting('test.first_publication')::uuid),
  3, 'the first version keeps its original snapshot');
select extensions.is(
  (select count(*)::integer from public.roster_publication_shifts s
    join public.roster_publications p on p.id = s.publication_id
    where p.version = 2 and s.role_title = 'Legacy changed later'),
  1, 'a later version records the later source state without rewriting history');
select extensions.is(
  public.publish_roster('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000002', '2032-03-15'),
  1, 'the other department can publish separately');
select extensions.is(
  (select version from public.roster_publications where department_id = 'd3000000-0000-4000-8000-000000000002'),
  1, 'versions are numbered independently per department and week');

reset role;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.roster_publications), 2,
  'the FOH manager sees only their own department versions');
select extensions.is((select count(*)::integer from public.roster_publication_shifts), 7,
  'the FOH manager can read their two complete snapshots');
select extensions.is(
  (select count(*)::integer from public.roster_publication_shifts where role_title = 'Private BOH'),
  0, 'the FOH manager cannot read a hidden department snapshot');
select extensions.throws_ok(
  $$select public.publish_roster('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000002', '2032-03-15')$$,
  'P0001', 'Permission denied', 'a manager cannot publish another department');
reset role;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.roster_publications), 1,
  'the BOH manager sees only the BOH publication');
select extensions.is((select count(*)::integer from public.roster_publication_shifts), 1,
  'the BOH manager sees only the BOH snapshot');
reset role;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.roster_publications), 0,
  'employees cannot read manager publication history');
select extensions.is((select count(*)::integer from public.roster_publication_shifts), 0,
  'employees cannot read snapshots containing coworkers');
reset role;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.roster_publications), 0,
  'another business cannot read these versions');
select extensions.is((select count(*)::integer from public.roster_publication_shifts), 0,
  'another business cannot read these snapshots');
select extensions.is(
  public.publish_roster('b3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002',
    'd3000000-0000-4000-8000-000000000003', '2032-03-15'),
  1, 'another tenant can publish its own draft');
select extensions.is((select count(*)::integer from public.roster_publications), 1,
  'another tenant sees only its own version');
select extensions.is((select count(*)::integer from public.roster_publication_shifts), 1,
  'another tenant sees only its own snapshot');

reset role;
insert into public.employee_availability_exceptions
  (business_id, venue_id, employee_id, starts_on, ends_on, exception_type, status) values
  ('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001', '2032-03-22', '2032-03-22', 'unavailable', 'active');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.save_venue_conflict_policy('b3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', false, true, false, false)$$,
  'the owner enables the unavailable-worker publication blocker');
select extensions.throws_ok(
  $$select public.publish_roster('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001', '2032-03-22')$$,
  'P0001', 'Roster has unavailable employees', 'a configured blocker rejects publication');
select extensions.is(
  (select count(*)::integer from public.roster_publications where week_start = '2032-03-22'),
  0, 'a blocked publication leaves no version or snapshot');
select extensions.is(
  (select count(*)::integer from public.shifts where id = 'f3000000-0000-4000-8000-000000000005' and not is_published),
  1, 'a blocked publication leaves its shift in draft');
reset role;
set local role anon;
select extensions.throws_ok(
  $$select * from public.roster_publications$$,
  '42501', null, 'anonymous users cannot read publication history');
select extensions.throws_ok(
  $$select public.record_roster_publications()$$,
  '42501', null, 'anonymous users cannot invoke the publication trigger');
reset role;

select * from extensions.finish();
rollback;
