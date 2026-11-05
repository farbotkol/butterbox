begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
grant execute on all functions in schema extensions to authenticated, anon, service_role;
select extensions.no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7100000-0000-4000-8000-000000000001', 'week-owner@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000002', 'week-manager@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000003', 'week-worker@example.test', '{}'::jsonb),
  ('a7100000-0000-4000-8000-000000000004', 'week-outside@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7100000-0000-4000-8000-000000000001', 'Planning cafe'),
  ('b7100000-0000-4000-8000-000000000002', 'Outside planning cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c7100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney'),
  ('c7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000001', 'Perth', 'Australia/Perth'),
  ('c7100000-0000-4000-8000-000000000003', 'b7100000-0000-4000-8000-000000000002', 'Outside', 'Australia/Brisbane'),
  ('c7100000-0000-4000-8000-000000000004', 'b7100000-0000-4000-8000-000000000001', 'Historic', 'Australia/Sydney'),
  ('c7100000-0000-4000-8000-000000000005', 'b7100000-0000-4000-8000-000000000001', 'In transition', 'Australia/Sydney'),
  ('c7100000-0000-4000-8000-000000000006', 'b7100000-0000-4000-8000-000000000001', 'Recently effective', 'Australia/Sydney');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'FOH'),
  ('d7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'c7100000-0000-4000-8000-000000000003', 'Outside');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000002', 'foh_manager', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001'),
  ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000003', 'employee', 'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001'),
  ('b7100000-0000-4000-8000-000000000002', 'a7100000-0000-4000-8000-000000000004', 'owner', null, null);
insert into public.venue_roster_week_events (
  business_id, venue_id, actor_id, request_id, revision, action, previous_weekday, weekday, effective_on
) values
  ('b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000004',
   'a7100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000090', 1,
   'scheduled', 1, 7, '2024-12-29'),
  ('b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000004',
   'a7100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000091', 2,
   'scheduled', 7, 3, '2025-01-08');
insert into public.venue_roster_week_events (
  business_id, venue_id, actor_id, request_id, revision, action, previous_weekday, weekday, effective_on
)
select 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000005',
  'a7100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000093', 1, 'scheduled',
  (extract(isodow from today)::integer % 7 + 1)::smallint, extract(isodow from today)::smallint, today - 7
from (select (now() at time zone 'Australia/Sydney')::date as today) d;
insert into public.venue_roster_week_events (
  business_id, venue_id, actor_id, request_id, revision, action, previous_weekday, weekday, effective_on
)
select 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000005',
  'a7100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000094', 2, 'scheduled',
  extract(isodow from today)::smallint, extract(isodow from today + 2)::smallint, today + 2
from (select (now() at time zone 'Australia/Sydney')::date as today) d;
select set_config('test.locked_pending', (
  select id::text from public.venue_roster_week_events
  where request_id = '97100000-0000-4000-8000-000000000094'
), true);
insert into public.venue_roster_week_events (
  business_id, venue_id, actor_id, request_id, revision, action, previous_weekday, weekday, effective_on
)
select 'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000006',
  'a7100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000089', 1, 'scheduled',
  extract(isodow from today)::smallint, extract(isodow from today - 1)::smallint, today - 1
from (select (now() at time zone 'Australia/Sydney')::date as today) d;
select set_config('test.recently_effective', (
  select id::text from public.venue_roster_week_events
  where request_id = '97100000-0000-4000-8000-000000000089'
), true);
create temporary table planning_week_matrix as
select gen_random_uuid() as venue_id, old_day, new_day,
  '2024-01-01'::date + old_day - 1 as old_start,
  '2024-01-01'::date + old_day - 1 + 7 + ((new_day - old_day + 7) % 7) as change_date
from generate_series(1, 7) old_day
cross join generate_series(1, 7) new_day
where old_day <> new_day;
grant select on planning_week_matrix to authenticated;
insert into public.venues (id, business_id, name, timezone)
select venue_id, 'b7100000-0000-4000-8000-000000000001',
  'Matrix ' || old_day || '-' || new_day, 'Australia/Sydney'
from planning_week_matrix;
insert into public.venue_roster_week_events (
  business_id, venue_id, actor_id, request_id, revision, action, previous_weekday, weekday, effective_on
)
select 'b7100000-0000-4000-8000-000000000001', venue_id,
  'a7100000-0000-4000-8000-000000000001', gen_random_uuid(), 1, 'scheduled',
  (old_day % 7 + 1)::smallint, old_day::smallint, old_start
from planning_week_matrix;
insert into public.venue_roster_week_events (
  business_id, venue_id, actor_id, request_id, revision, action, previous_weekday, weekday, effective_on
)
select 'b7100000-0000-4000-8000-000000000001', venue_id,
  'a7100000-0000-4000-8000-000000000001', gen_random_uuid(), 2, 'scheduled',
  old_day::smallint, new_day::smallint, change_date
from planning_week_matrix;
insert into public.roster_publications (
  id, business_id, venue_id, department_id, week_start, venue_timezone, version, new_shift_count, shift_count
) values (
  '17100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001',
  'c7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001',
  '2026-01-05', 'Australia/Sydney', 1, 1, 0
);
insert into public.payroll_period_events (
  id, business_id, venue_id, week_start, period_starts_at, period_ends_at,
  action, actor_id, actor_role, request_id
) values (
  '27100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001',
  'c7100000-0000-4000-8000-000000000001', '2026-01-05', '2026-01-04 13:00+00', '2026-01-11 13:00+00',
  'finalised', 'a7100000-0000-4000-8000-000000000001', 'owner', '97100000-0000-4000-8000-000000000099'
);
select set_config('test.publication', (
  select to_jsonb(p)::text from public.roster_publications p
  where p.id = '17100000-0000-4000-8000-000000000001'
), true);
select set_config('test.payroll', (
  select to_jsonb(p)::text from public.payroll_period_events p
  where p.id = '27100000-0000-4000-8000-000000000001'
), true);

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.results_eq(
  $$select current_weekday, pending_weekday, pending_effective_on, revision, venue_today
    from public.get_venue_roster_week_settings(
      'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')$$,
  $$select 1::smallint, null::smallint, null::date, 0, (now() at time zone 'Australia/Sydney')::date$$,
  'new venues default to Monday and use the venue-local date');
select extensions.results_eq(
  $$select start_on, end_on, weekday, previous_on, next_on
    from public.get_roster_planning_period(
      'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2026-01-01')$$,
  $$values ('2025-12-29'::date, '2026-01-05'::date, 1::smallint, '2025-12-28'::date, '2026-01-05'::date)$$,
  'Monday planning handles a year boundary');
select extensions.throws_ok(
  $$select * from public.venue_roster_week_state(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', current_date)$$,
  '42501', null, 'the internal unscoped state helper is not callable by clients');
select extensions.throws_ok(
  $$select * from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', null)$$,
  'P0001', 'Invalid planning date', 'a missing planning date is rejected');
select extensions.throws_ok(
  $$select * from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'infinity')$$,
  'P0001', 'Invalid planning date', 'an infinite planning date is rejected');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    8::smallint, 0, null, '97100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Invalid roster week setting', 'invalid weekdays are rejected');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    7::smallint, -1, null, '97100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Invalid roster week setting', 'invalid revisions are rejected');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    7::smallint, 0, null, null)$$,
  'P0001', 'Invalid roster week setting', 'a request identifier is required');
select extensions.is(
  public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    1::smallint, 0, null, '97100000-0000-4000-8000-000000000001'),
  null::uuid, 'saving the existing default is a no-op');
select extensions.isnt(set_config('test.first', public.save_venue_roster_week(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
  7::smallint, 0, null, '97100000-0000-4000-8000-000000000002')::text, true),
  null, 'an owner can schedule a Sunday planning week');
select set_config('test.effective', (select pending_effective_on::text
  from public.get_venue_roster_week_settings(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')), true);
select extensions.results_eq(
  $$select current_weekday, pending_weekday, revision
    from public.get_venue_roster_week_settings(
      'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')$$,
  $$values (1::smallint, 7::smallint, 1)$$,
  'the new setting is pending rather than changing the current week');
select extensions.ok(
  current_setting('test.effective')::date >=
    date_trunc('week', now() at time zone 'Australia/Sydney')::date + 7
  and extract(isodow from current_setting('test.effective')::date) = 7,
  'the new Sunday begins after the current Monday planning week');
select extensions.results_eq(
  $$select start_on, end_on, weekday
    from public.get_roster_planning_period(
      'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
      current_setting('test.effective')::date - 1)$$,
  $$select current_setting('test.effective')::date - 6, current_setting('test.effective')::date, 1::smallint$$,
  'the last Monday-based period is shortened without skipping or duplicating days');
select extensions.results_eq(
  $$select start_on, end_on, weekday, previous_on, next_on
    from public.get_roster_planning_period(
      'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
      current_setting('test.effective')::date)$$,
  $$select current_setting('test.effective')::date, current_setting('test.effective')::date + 7, 7::smallint,
    current_setting('test.effective')::date - 1, current_setting('test.effective')::date + 7$$,
  'navigation enters the new Sunday period at its effective date');
select extensions.ok((
  select bool_and(p.start_on <= days.day::date and days.day::date < p.end_on
    and p.end_on - p.start_on between 1 and 7
    and previous.end_on = p.start_on and following.start_on = p.end_on)
  from generate_series(current_setting('test.effective')::date - 30,
    current_setting('test.effective')::date + 120, '1 day'::interval) days(day)
  cross join lateral public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', days.day::date) p
  cross join lateral public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', p.previous_on) previous
  cross join lateral public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', p.next_on) following
), 'every date around the transition belongs to one contiguous navigable period');
select extensions.ok((
  select count(*) = 42 and bool_and(p.start_on = matrix.change_date
    and p.end_on = matrix.change_date + 7 and p.weekday = matrix.new_day)
  from planning_week_matrix matrix
  cross join lateral public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', matrix.venue_id, matrix.change_date) p
), 'all 42 distinct weekday changes start on the selected effective date');
select extensions.ok((
  select bool_and(p.start_on <= days.day::date and days.day::date < p.end_on
    and p.end_on - p.start_on between 1 and 7
    and previous.end_on = p.start_on and following.start_on = p.end_on)
  from planning_week_matrix matrix
  cross join lateral generate_series(matrix.old_start - 1, matrix.change_date + 7, '1 day'::interval) days(day)
  cross join lateral public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', matrix.venue_id, days.day::date) p
  cross join lateral public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', matrix.venue_id, p.previous_on) previous
  cross join lateral public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', matrix.venue_id, p.next_on) following
), 'all weekday transitions retain contiguous previous and next planning periods');
select extensions.results_eq(
  $$select start_on, end_on, weekday from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2032-12-31')$$,
  $$values ('2032-12-26'::date, '2033-01-02'::date, 7::smallint)$$,
  'Sunday planning navigates correctly across the year boundary');
select extensions.results_eq(
  $$select start_on, end_on from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2032-10-03')$$,
  $$values ('2032-10-03'::date, '2032-10-10'::date)$$,
  'planning dates remain stable across the Sydney spring clock change');
select extensions.is(
  (select extract(epoch from end_at - start_at)::integer from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2032-10-03')),
  167 * 3600, 'the server returns venue-local UTC boundaries across the spring clock change');
select extensions.is(
  (select extract(epoch from end_at - start_at)::integer from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2033-04-03')),
  169 * 3600, 'the server returns venue-local UTC boundaries across the autumn clock change');
select extensions.is(
  (select to_jsonb(p)::text from public.roster_publications p
    where p.id = '17100000-0000-4000-8000-000000000001'),
  current_setting('test.publication'), 'historical publication snapshots are unchanged');
select extensions.is(
  (select to_jsonb(p)::text from public.payroll_period_events p
    where p.id = '27100000-0000-4000-8000-000000000001'),
  current_setting('test.payroll'), 'historical payroll periods are unchanged');
select extensions.ok(exists (
  select 1 from public.sensitive_action_audit a
  where a.source_table = 'venue_roster_week_events' and a.record_id = current_setting('test.first')
    and a.actor_id = 'a7100000-0000-4000-8000-000000000001'
    and a.old_values ->> 'weekday' = '1' and a.new_values ->> 'weekday' = '7'
    and a.new_values ->> 'effective_on' = current_setting('test.effective')
), 'the audit record identifies the actor, setting, venue and effective date');
select extensions.is(
  public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    7::smallint, 0, null, '97100000-0000-4000-8000-000000000002'),
  current_setting('test.first')::uuid, 'an identical retry returns the original event');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    3::smallint, 0, null, '97100000-0000-4000-8000-000000000002')$$,
  'P0001', 'Request identifier already used', 'a request identifier cannot be reused for a different setting');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    3::smallint, 0, null, '97100000-0000-4000-8000-000000000003')$$,
  'P0001', 'Roster week setting changed; refresh before saving', 'a stale settings form cannot overwrite another change');
select extensions.throws_ok(
  $$insert into public.venue_roster_week_events (business_id, venue_id) values (
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')$$,
  '42501', null, 'owners cannot write event history directly');
select extensions.throws_ok(
  $$update public.venue_roster_week_events set weekday = 1 where id = current_setting('test.first')::uuid$$,
  '42501', null, 'owners cannot rewrite event history directly');
select extensions.throws_ok(
  $$delete from public.venue_roster_week_events where id = current_setting('test.first')::uuid$$,
  '42501', null, 'owners cannot delete event history directly');

select extensions.isnt(set_config('test.cancelled', public.save_venue_roster_week(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
  1::smallint, 1, current_setting('test.first')::uuid, '97100000-0000-4000-8000-000000000004')::text, true),
  null, 'an owner can cancel a pending change by retaining the current weekday');
select extensions.results_eq(
  $$select current_weekday, pending_weekday, pending_effective_on, revision
    from public.get_venue_roster_week_settings(
      'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')$$,
  $$values (1::smallint, null::smallint, null::date, 2)$$,
  'cancellation removes the pending change without rewriting its history');
select extensions.results_eq(
  $$select action, previous_weekday, weekday, supersedes from public.venue_roster_week_events
    where id = current_setting('test.cancelled')::uuid$$,
  $$select 'cancelled'::text, 7::smallint, 1::smallint, current_setting('test.first')::uuid$$,
  'cancellation records the previous pending choice and the event it replaces');
select extensions.is(
  public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    1::smallint, 1, current_setting('test.first')::uuid, '97100000-0000-4000-8000-000000000004'),
  current_setting('test.cancelled')::uuid, 'a repeated cancellation is idempotent');
select extensions.isnt(set_config('test.rescheduled', public.save_venue_roster_week(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
  7::smallint, 2, null, '97100000-0000-4000-8000-000000000005')::text, true),
  null, 'an owner can schedule a new pending change');
select extensions.isnt(set_config('test.replacement', public.save_venue_roster_week(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
  3::smallint, 3, current_setting('test.rescheduled')::uuid, '97100000-0000-4000-8000-000000000006')::text, true),
  null, 'an owner can replace a pending change with another weekday');
select extensions.results_eq(
  $$select current_weekday, pending_weekday, revision from public.get_venue_roster_week_settings(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')$$,
  $$values (1::smallint, 3::smallint, 4)$$,
  'replacement leaves one pending choice and advances the revision');
select extensions.is(
  public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    3::smallint, 4, current_setting('test.replacement')::uuid, '97100000-0000-4000-8000-000000000007'),
  null::uuid, 'saving the already pending choice does not create another event');
select extensions.results_eq(
  $$select current_weekday, pending_weekday, revision, venue_today
    from public.get_venue_roster_week_settings(
      'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002')$$,
  $$select 1::smallint, null::smallint, 0, (now() at time zone 'Australia/Perth')::date$$,
  'another venue retains its independent Monday default and local date');
select extensions.results_eq(
  $$select start_on, end_on, weekday from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000004', '2024-12-28')$$,
  $$values ('2024-12-23'::date, '2024-12-29'::date, 1::smallint)$$,
  'historical dates retain their original Monday setting');
select extensions.results_eq(
  $$select start_on, end_on, weekday from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000004', '2025-01-06')$$,
  $$values ('2025-01-05'::date, '2025-01-08'::date, 7::smallint)$$,
  'a later historic transition retains the previous Sunday period');
select extensions.results_eq(
  $$select start_on, end_on, weekday from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000004', '2025-01-08')$$,
  $$values ('2025-01-08'::date, '2025-01-15'::date, 3::smallint)$$,
  'the second historic setting takes effect only on its recorded date');
select extensions.isnt(public.save_venue_roster_week(
  'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000004',
  5::smallint, 2, null, '97100000-0000-4000-8000-000000000092'),
  null::uuid, 'a venue with previous effective settings can schedule a later change');
select extensions.results_eq(
  $$select current_weekday, pending_weekday, revision from public.get_venue_roster_week_settings(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000004')$$,
  $$values (3::smallint, 5::smallint, 3)$$,
  'a later change preserves the current historical setting until its own effective date');
select extensions.ok(
  (select pending_locked from public.get_venue_roster_week_settings(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000005')),
  'a pending change becomes locked when its shortened transition period begins');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000005',
    extract(isodow from now() at time zone 'Australia/Sydney')::smallint, 2,
    current_setting('test.locked_pending')::uuid, '97100000-0000-4000-8000-000000000095')$$,
  'P0001', 'Planning transition has started; wait for it to take effect',
  'a started transition cannot be cancelled and reinterpret its elapsed dates');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000005',
    extract(isodow from now() at time zone 'Australia/Sydney')::smallint, 2,
    null, '97100000-0000-4000-8000-000000000096')$$,
  'P0001', 'Roster week setting changed; refresh before saving',
  'a form with stale pending state cannot silently schedule a different change');
select extensions.is(
  public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000005',
    extract(isodow from (now() at time zone 'Australia/Sydney')::date + 2)::smallint, 2,
    current_setting('test.locked_pending')::uuid, '97100000-0000-4000-8000-000000000097'),
  null::uuid, 'reselecting the already pending choice remains a no-op during transition');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000006',
    extract(isodow from now() at time zone 'Australia/Sydney')::smallint, 1,
    current_setting('test.recently_effective')::uuid, '97100000-0000-4000-8000-000000000098')$$,
  'P0001', 'Roster week setting changed; refresh before saving',
  'a form submitted after its pending change becomes effective cannot schedule an unintended reversal');
select extensions.throws_ok(
  $$select * from public.get_venue_roster_week_settings(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000003')$$,
  'P0001', 'Permission denied', 'a mismatched business and venue are rejected');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000002', true);
select extensions.lives_ok(
  $$select * from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2032-01-01')$$,
  'a scoped manager can navigate planning periods');
select extensions.throws_ok(
  $$select * from public.get_venue_roster_week_settings(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001')$$,
  'P0001', 'Permission denied', 'a manager cannot inspect owner-only settings');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    2::smallint, 4, null, '97100000-0000-4000-8000-000000000008')$$,
  'P0001', 'Permission denied', 'a manager cannot change the venue setting');
select extensions.is(
  (select count(*)::integer from public.venue_roster_week_events), 0,
  'a manager cannot read the owner-only event history');
select extensions.throws_ok(
  $$select * from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002', '2032-01-01')$$,
  'P0001', 'Permission denied', 'a venue-scoped manager cannot navigate another venue');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000003', true);
select extensions.lives_ok(
  $$select * from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2032-01-01')$$,
  'a scoped employee can navigate planning periods');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    2::smallint, 4, null, '97100000-0000-4000-8000-000000000009')$$,
  'P0001', 'Permission denied', 'an employee cannot change the venue setting');

select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000004', true);
select extensions.is(
  (select count(*)::integer from public.venue_roster_week_events), 0,
  'an owner in another tenant cannot inspect the first tenant history');
select extensions.throws_ok(
  $$select * from public.get_roster_planning_period(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', '2032-01-01')$$,
  'P0001', 'Permission denied', 'an outside owner cannot resolve another tenant period');
select extensions.throws_ok(
  $$select public.save_venue_roster_week(
    'b7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
    2::smallint, 4, null, '97100000-0000-4000-8000-000000000010')$$,
  'P0001', 'Permission denied', 'an outside owner cannot change another tenant setting');

reset role;
select extensions.throws_ok(
  $$update public.venue_roster_week_events set weekday = 1 where id = current_setting('test.first')::uuid$$,
  'P0001', 'Roster review records are immutable', 'even privileged SQL cannot rewrite the recorded event');
select extensions.throws_ok(
  $$delete from public.venue_roster_week_events where id = current_setting('test.first')::uuid$$,
  'P0001', 'Roster review records are immutable', 'even privileged SQL cannot delete the recorded event');
select * from extensions.finish();
rollback;
