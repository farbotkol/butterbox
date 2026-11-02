begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select extensions.plan(9);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'owner@example.test',
    '{}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'foh-manager@example.test',
    '{}'::jsonb
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'outsider@example.test',
    '{}'::jsonb
  );

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
set local role authenticated;

select extensions.lives_ok(
  $$select public.create_business(
    'Integration Sample Cafe',
    'Test Venue',
    'Australia/Sydney',
    false
  )$$,
  'an authenticated user can create a clean venue'
);

reset role;
do $$
declare
  v_business_id uuid;
  v_venue_id uuid;
begin
  select business_id into v_business_id from public.business_memberships
  where user_id = '11111111-1111-4111-8111-111111111111';
  select id into v_venue_id from public.venues where business_id = v_business_id;

  insert into public.employees (business_id, venue_id, department_id, name, role_title)
  select v_business_id, v_venue_id, d.id,
    case when n = 1 then 'Mia Chen' else format('Fixture worker %s', n) end,
    case when n <= 12 then 'Barista' else 'Cook' end
  from generate_series(1, 24) n
  join public.departments d on d.business_id = v_business_id
    and d.name = case when n <= 12 then 'Front of House' else 'Back of House' end;

  insert into public.job_roles (business_id, venue_id, department_id, name)
  select distinct business_id, venue_id, department_id, role_title
  from public.employees where business_id = v_business_id;

  insert into public.shifts (
    business_id, venue_id, department_id, employee_id, role_title, starts_at, ends_at
  )
  select e.business_id, e.venue_id, e.department_id, e.id, e.role_title,
    current_date + occurrence + time '08:00',
    current_date + occurrence + time '12:00'
  from public.employees e
  cross join generate_series(1, 2) occurrence
  where e.business_id = v_business_id;
end;
$$;
set local role authenticated;

select extensions.is(
  (select count(*)::integer from public.employees),
  24,
  'the synthetic fixture contains 24 employees'
);
select extensions.is(
  (select count(*)::integer from public.shifts),
  48,
  'the synthetic fixture contains 48 draft shifts'
);
select extensions.lives_ok(
  $$select public.save_shift(
    (select business_id from public.business_memberships where user_id = auth.uid()),
    (select id from public.venues where business_id = (
      select business_id from public.business_memberships where user_id = auth.uid()
    )),
    (select id from public.departments
      where name = 'Front of House'
        and business_id = (
          select business_id from public.business_memberships where user_id = auth.uid()
        )),
    (select id from public.employees
      where name = 'Mia Chen'
        and business_id = (
          select business_id from public.business_memberships where user_id = auth.uid()
        )),
    'Barista',
    current_date + 14 + time '08:00',
    current_date + 14 + time '10:00',
    0
  )$$,
  'an owner can create an assigned draft shift'
);
select extensions.throws_ok(
  $$select public.save_shift(
    (select business_id from public.business_memberships where user_id = auth.uid()),
    (select id from public.venues where business_id = (
      select business_id from public.business_memberships where user_id = auth.uid()
    )),
    (select id from public.departments
      where name = 'Front of House'
        and business_id = (
          select business_id from public.business_memberships where user_id = auth.uid()
        )),
    (select id from public.employees
      where name = 'Mia Chen'
        and business_id = (
          select business_id from public.business_memberships where user_id = auth.uid()
        )),
    'Barista',
    current_date + 14 + time '08:00',
    current_date + 14 + time '10:00',
    0
  )$$,
  'P0001',
  'Employee has an overlapping shift',
  'an overlapping employee shift is rejected'
);

reset role;
do $$
declare
  v_business_id uuid;
  v_department_id uuid;
begin
  select id into v_business_id
  from public.businesses
  where name = 'Integration Sample Cafe';
  select id into v_department_id
  from public.departments
  where business_id = v_business_id and name = 'Front of House';

  insert into public.business_memberships (
    business_id, user_id, role, department_id
  )
  values (
    v_business_id,
    '22222222-2222-4222-8222-222222222222',
    'foh_manager',
    v_department_id
  );
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.shifts),
  25,
  'a FOH manager sees only shifts in their department'
);
select extensions.is(
  (select count(*)::integer from public.employees),
  12,
  'a FOH manager sees only employees in their department'
);
select extensions.throws_ok(
  $$select public.publish_roster(
    (select business_id from public.business_memberships where user_id = auth.uid()),
    (select id from public.venues where business_id = (
      select business_id from public.business_memberships where user_id = auth.uid()
    )),
    (select id from public.departments
      where name = 'Back of House'
        and business_id = (
          select business_id from public.business_memberships where user_id = auth.uid()
        )),
    date_trunc('week', current_date)::date
  )$$,
  'P0001',
  'Permission denied',
  'a FOH manager cannot publish a BOH roster'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.businesses),
  0,
  'an unrelated user cannot read another tenant'
);

select * from extensions.finish();
rollback;
