-- Explicit opt-in only. No auth users, passwords or hosted data are seeded.
-- Once signed in, call supabase.rpc('bootstrap_demo_business') (no parameters).
-- Every caller receives an isolated business with caller-derived deterministic IDs.
-- Normalize version and variant bits: arbitrary md5::uuid values fail z.uuid().
create function private.demo_uuid(key text) returns uuid
language sql immutable strict set search_path = '' as $$
  select overlay(overlay(md5(key) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid;
$$;
revoke all on function private.demo_uuid(text) from public;
grant execute on function private.demo_uuid(text) to authenticated;

create function public.bootstrap_demo_business() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  b uuid;
  v uuid;
  d uuid;
  r uuid;
  e uuid;
  i integer;
  day integer;
  base timestamptz := date_trunc('week', now() at time zone 'Australia/Melbourne')
    at time zone 'Australia/Melbourne';
  names text[] := array[
    'Avery Brooks','Jordan Ellis','Morgan Vale','Riley Chen','Casey Rivers','Taylor Quinn',
    'Cameron Blake','Alex Rowan','Jamie Park','Robin Hayes','Drew Bennett','Skyler Moss',
    'Samira Hart','Noah Finch','Mika Santos','Arden Clarke','Emery Stone','Sage Patel',
    'Harper Lane','Quinn Foster','Reese Okafor','Finley Reed','Rowan Kim','Charlie Wells'
  ];
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- One concurrent bootstrap per caller; do not generate a second business on retries.
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
  select business_id into b from public.business_memberships where user_id = u
    order by created_at, business_id limit 1;
  if b is not null then return b; end if;
  b := private.demo_uuid('demo-business-' || u);
  v := private.demo_uuid('demo-venue-' || u);
  insert into public.user_profiles (id, display_name) values (u, 'Demo Owner')
    on conflict (id) do nothing;
  insert into public.businesses (id, name) values (b, 'Little Wattle Café (Demo)');
  insert into public.business_memberships values (u, b, 'owner');
  insert into public.venues (id, business_id, name, location)
    values (v, b, 'Carlton', '123 Fictional Lane, Carlton VIC');
  insert into public.venue_memberships values (u, b, v);
  insert into public.role_permissions (business_id, role, permission)
    select b, roles.role::public.access_role, perms.permission::public.roster_permission
    from (values ('owner'), ('general_manager'), ('department_manager')) roles(role)
    cross join (values ('manage_roster'), ('manage_employees')) perms(permission);
  insert into public.role_permissions values
    (b, 'owner', 'publish_roster'), (b, 'general_manager', 'publish_roster');
  for i in 1..2 loop
    d := private.demo_uuid('demo-department-' || u || '-' || i);
    insert into public.departments values (d, b, v, case i when 1 then 'FOH' else 'BOH' end);
    insert into public.department_memberships values (u, b, v, d);
    insert into public.job_roles values
      (private.demo_uuid('demo-role-' || u || '-' || i || '-1'), b, v, d,
        case i when 1 then 'Server' else 'Chef' end),
      (private.demo_uuid('demo-role-' || u || '-' || i || '-2'), b, v, d,
        case i when 1 then 'Barista' else 'Kitchen Hand' end);
  end loop;
  for i in 1..24 loop
    e := private.demo_uuid('demo-employee-' || u || '-' || i);
    d := private.demo_uuid('demo-department-' || u || '-' || case when i <= 12 then 1 else 2 end);
    r := private.demo_uuid('demo-role-' || u || '-' || case when i <= 12 then 1 else 2 end
      || '-' || case when i % 2 = 1 then 1 else 2 end);
    insert into public.employees (id, business_id, display_name) values (e, b, names[i]);
    insert into public.employee_department_roles values (e, b, v, d, r);
    for day in 0..6 loop
      insert into public.shifts (id, business_id, venue_id, department_id, role_id,
        employee_id, starts_at, ends_at, break_minutes)
      values (private.demo_uuid('demo-shift-' || u || '-' || i || '-' || day),
        b, v, d, r, e, base + make_interval(days => day, hours => 9 + (i % 3)),
        base + make_interval(days => day, hours => 17 + (i % 3)), 30);
    end loop;
  end loop;
  insert into public.audit_logs (business_id, actor_id, action, entity_id)
    values (b, u, 'bootstrap_demo', b);
  return b;
end;
$$;
revoke all on function public.bootstrap_demo_business() from public, anon;
grant execute on function public.bootstrap_demo_business() to authenticated;

-- Trusted provisioning, using real users who have already signed up:
-- 1. Insert user_profiles(id,display_name) for the real auth.users UUID.
-- 2. Insert business_memberships(user_id,business_id,role).
-- 3. Insert venue_memberships(user_id,business_id,venue_id).
-- 4. For a department_manager, insert department_memberships
--    (user_id,business_id,venue_id,department_id) for FOH OR BOH.
-- FOH is private.demo_uuid('demo-department-' || OWNER_UUID || '-1'); BOH uses '-2'.
-- Both manager scopes require the venue mapping. Department managers can edit
-- only their departments and cannot publish unless their business grants the
-- department_manager role publish_roster in role_permissions.
-- An employee account also needs employees.user_id linked to its membership;
-- employee_department_roles, not department_memberships, controls eligibility.
