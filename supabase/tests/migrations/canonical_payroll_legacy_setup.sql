begin;
do $$
begin
  if to_regclass('public.payroll_canonical_details') is not null then
    raise exception 'Legacy fixture must be created before the canonical payroll migration';
  end if;
end;
$$;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a7400000-0000-4000-8000-000000000001', 'legacy-owner@example.test', '{}'::jsonb),
  ('a7400000-0000-4000-8000-000000000002', 'legacy-worker@example.test', '{}'::jsonb);
insert into public.businesses (id, name) values
  ('b7400000-0000-4000-8000-000000000001', 'Disposable legacy cafe');
insert into public.venues (id, business_id, name, timezone) values
  ('c7400000-0000-4000-8000-000000000001', 'b7400000-0000-4000-8000-000000000001', 'Sydney', 'Australia/Sydney');
insert into public.departments (id, business_id, venue_id, name) values
  ('d7400000-0000-4000-8000-000000000001', 'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', 'FOH');
insert into public.business_memberships (business_id, user_id, role, venue_id, department_id) values
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000001', 'owner', null, null),
  ('b7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'employee', 'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001');
insert into public.employees (id, business_id, venue_id, department_id, auth_user_id, name, role_title) values
  ('e7400000-0000-4000-8000-000000000001', 'b7400000-0000-4000-8000-000000000001',
   'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001',
   'a7400000-0000-4000-8000-000000000002', 'Legacy worker', 'Server');
insert into public.attendance_sessions (id, business_id, venue_id, department_id, employee_id, started_by) values
  ('27400000-0000-4000-8000-000000000001', 'b7400000-0000-4000-8000-000000000001',
   'c7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001',
   'e7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002');
insert into public.attendance_events (
  id, session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at
) values
  ('47400000-0000-4000-8000-000000000001', '27400000-0000-4000-8000-000000000001',
   'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
   'd7400000-0000-4000-8000-000000000001', 'e7400000-0000-4000-8000-000000000001',
   'a7400000-0000-4000-8000-000000000002', gen_random_uuid(), 'clock_in', '2024-01-08 10:00:00.123456+00'),
  ('47400000-0000-4000-8000-000000000002', '27400000-0000-4000-8000-000000000001',
   'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
   'd7400000-0000-4000-8000-000000000001', 'e7400000-0000-4000-8000-000000000001',
   'a7400000-0000-4000-8000-000000000002', gen_random_uuid(), 'clock_out', '2024-01-08 12:00:00.123456+00');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7400000-0000-4000-8000-000000000001', true);
select public.decide_attendance_timesheet(
  'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
  '27400000-0000-4000-8000-000000000001', gen_random_uuid(), w.edit_revision, 'approved', null
)
from public.list_weekly_worked_time_for_edit(
  'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001', '2024-01-08'
) w where w.session_id = '27400000-0000-4000-8000-000000000001';
select public.finalise_payroll_period(
  'b7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000001',
  '2024-01-08', gen_random_uuid(), 'Finalised before the migration'
);
commit;
