create table public.workspace_demo_environment_approval (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  environment text not null check (environment = 'development'),
  project_ref text not null check (project_ref ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  jwt_issuer text not null check (jwt_issuer ~ '^https?://(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+)(:[0-9]+)?/auth/v1$'),
  approved_at timestamptz not null default clock_timestamp()
);
alter table public.workspace_demo_environment_approval enable row level security;
revoke all on public.workspace_demo_environment_approval from public, anon, authenticated, service_role;

create table public.workspace_demo_data_loads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  fixture_version text not null check (fixture_version = 'v1'),
  created_by uuid not null references auth.users (id) on delete restrict,
  record_counts jsonb not null check (jsonb_typeof(record_counts) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues (id, business_id) on delete cascade,
  unique (business_id, venue_id, fixture_version)
);
alter table public.workspace_demo_data_loads enable row level security;
revoke all on public.workspace_demo_data_loads from public, anon, authenticated, service_role;

create table public.workspace_demo_data_events (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.workspace_demo_data_loads (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action = 'load'),
  record_counts jsonb not null check (jsonb_typeof(record_counts) = 'object'),
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues (id, business_id) on delete cascade
);
alter table public.workspace_demo_data_events enable row level security;
revoke all on public.workspace_demo_data_events from public, anon, authenticated, service_role;
create policy "Owners can view their demo-data audit"
  on public.workspace_demo_data_events for select to authenticated
  using (public.has_business_role(business_id, array['owner']));
grant select on public.workspace_demo_data_events to authenticated;

create trigger workspace_demo_data_events_immutable
  before update or delete on public.workspace_demo_data_events
  for each row execute function public.prevent_original_attendance_mutation();

create table public.workspace_demo_data_record_tags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  record_type text not null check (record_type in (
    'department', 'job_role', 'employee', 'employee_department', 'employee_job_role',
    'availability_pattern', 'availability_interval', 'shift', 'roster_publication',
    'roster_publication_shift', 'attendance_session', 'attendance_event', 'attendance_break',
    'attendance_correction', 'payroll_preparation_example'
  )),
  record_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues (id, business_id) on delete cascade,
  unique (business_id, venue_id, record_type, record_id)
);
alter table public.workspace_demo_data_record_tags enable row level security;
revoke all on public.workspace_demo_data_record_tags from public, anon, authenticated, service_role;
create policy "Owners can view their demo-data provenance"
  on public.workspace_demo_data_record_tags for select to authenticated
  using (public.has_business_role(business_id, array['owner']));
grant select on public.workspace_demo_data_record_tags to authenticated;

create function public.prevent_demo_employee_account_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.auth_user_id is not null and exists (
    select 1 from public.workspace_demo_data_record_tags t
    where t.business_id = new.business_id and t.venue_id = new.venue_id
      and t.record_type = 'employee' and t.record_id = new.id
  ) then
    raise exception 'Simulation-only employees cannot be linked to user accounts';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_demo_employee_account_link()
  from public, anon, authenticated, service_role;
create trigger employees_block_demo_employee_account_link
  before update of auth_user_id on public.employees
  for each row execute function public.prevent_demo_employee_account_link();

create function public.prevent_demo_employee_external_effect()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.workspace_demo_data_record_tags t
    where t.business_id = new.business_id and t.venue_id = new.venue_id
      and t.record_type = 'employee' and t.record_id = new.employee_id
  ) then
    raise exception 'Simulation-only employees cannot be invited or mapped to payroll';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_demo_employee_external_effect()
  from public, anon, authenticated, service_role;
create trigger staff_invitations_block_demo_employees
  before insert or update of employee_id on public.staff_invitations
  for each row execute function public.prevent_demo_employee_external_effect();
create trigger payroll_mappings_block_demo_employees
  before insert or update of employee_id on public.payroll_employee_mappings
  for each row execute function public.prevent_demo_employee_external_effect();

create table public.workspace_demo_payroll_preparation_examples (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id uuid not null,
  employee_id uuid not null,
  session_id uuid not null references public.attendance_sessions (id) on delete restrict,
  period_start date not null,
  hours_to_review numeric(6, 2) not null check (hours_to_review between 0 and 24),
  status text not null default 'example_only' check (status = 'example_only'),
  note text not null check (note like 'SIMULATION ONLY%'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (venue_id, business_id) references public.venues (id, business_id) on delete cascade,
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id) on delete restrict,
  unique (business_id, venue_id, employee_id, session_id)
);
alter table public.workspace_demo_payroll_preparation_examples enable row level security;
revoke all on public.workspace_demo_payroll_preparation_examples from public, anon, authenticated, service_role;

create function public.prevent_workspace_demo_data_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1
    and not exists (select 1 from public.businesses b where b.id = old.business_id) then
    return old;
  end if;
  raise exception 'Demo data records are immutable';
end;
$$;
revoke all on function public.prevent_workspace_demo_data_mutation()
  from public, anon, authenticated, service_role;
create trigger workspace_demo_data_loads_immutable
  before update or delete on public.workspace_demo_data_loads
  for each row execute function public.prevent_workspace_demo_data_mutation();
create trigger workspace_demo_data_tags_immutable
  before update or delete on public.workspace_demo_data_record_tags
  for each row execute function public.prevent_workspace_demo_data_mutation();
create trigger workspace_demo_payroll_examples_immutable
  before update or delete on public.workspace_demo_payroll_preparation_examples
  for each row execute function public.prevent_workspace_demo_data_mutation();

create function public.workspace_demo_environment_approved()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.workspace_demo_environment_approval a
    where a.singleton and a.enabled and a.environment = 'development'
      and a.jwt_issuer = (auth.jwt() ->> 'iss')
      and (
        a.jwt_issuer = 'https://' || a.project_ref || '.supabase.co/auth/v1'
        or (
          a.project_ref = 'butterbox'
          and a.jwt_issuer in (
            'http://127.0.0.1:54321/auth/v1',
            'http://localhost:54321/auth/v1',
            'http://[::1]:54321/auth/v1'
          )
        )
        or (
          a.project_ref = 'butterbox-citest'
          and a.jwt_issuer in (
            'http://127.0.0.1:59421/auth/v1',
            'http://localhost:59421/auth/v1',
            'http://[::1]:59421/auth/v1'
          )
        )
      )
  );
$$;
revoke all on function public.workspace_demo_environment_approved()
  from public, anon, authenticated, service_role;

create function public.workspace_demo_data_environment_enabled(p_project_ref text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.workspace_demo_environment_approved() and exists (
    select 1 from public.workspace_demo_environment_approval a
    where a.singleton and a.project_ref = p_project_ref
  );
$$;
revoke all on function public.workspace_demo_data_environment_enabled(text) from public, anon;
grant execute on function public.workspace_demo_data_environment_enabled(text) to authenticated;

create or replace function public.list_weekly_worked_time(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_employee_id uuid default null
)
returns table (
  session_id uuid, employee_id uuid, employee_name text, department_id uuid, department_name text,
  venue_id uuid, venue_name text, venue_timezone text, clocked_in_at timestamptz,
  clocked_out_at timestamptz, elapsed_seconds numeric, worked_seconds numeric, paid_seconds numeric,
  paid_break_seconds numeric, unpaid_break_seconds numeric, exceptions text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  select b.starts_at, b.ends_at into v_start, v_end
  from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start) b;
  return query
  select w.session_id, w.employee_id, w.employee_name, w.department_id, w.department_name,
    w.venue_id, w.venue_name, w.venue_timezone, w.clocked_in_at, w.clocked_out_at,
    w.elapsed_seconds, w.worked_seconds, w.paid_seconds, w.paid_break_seconds, w.unpaid_break_seconds,
    w.exceptions
  from public.list_worked_time(p_business_id, p_venue_id) w
  join public.attendance_sessions s on s.id = w.session_id and s.business_id = p_business_id
  where coalesce(w.clocked_in_at, w.clocked_out_at, s.created_at) >= v_start
    and coalesce(w.clocked_in_at, w.clocked_out_at, s.created_at) < v_end
    and (p_employee_id is null or w.employee_id = p_employee_id)
    and not exists (
      select 1 from public.workspace_demo_data_record_tags t
      where t.business_id = p_business_id and t.venue_id = p_venue_id
        and t.record_type = 'attendance_session' and t.record_id = s.id
    );
end;
$$;
revoke all on function public.list_weekly_worked_time(uuid, uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.list_weekly_worked_time(uuid, uuid, date, uuid) to authenticated;

create or replace function public.lock_generic_payroll_export(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_finalisation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.payroll_period_events%rowtype;
  v_timezone text;
begin
  if p_finalisation_id is null then
    raise exception 'Invalid payroll export request';
  end if;
  perform 1 from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start);
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_finalise_payroll_period(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('generic-payroll-export:' || p_business_id::text, 0));
  perform pg_advisory_xact_lock(public.payroll_period_lock_key(p_business_id, p_venue_id, p_week_start));
  select v.timezone into v_timezone from public.venues v
  where v.id = p_venue_id and v.business_id = p_business_id
  for share;
  v_period := public.latest_payroll_period_event(p_business_id, p_venue_id, p_week_start);
  if not found or v_period.action is distinct from 'finalised'
    or v_period.id is distinct from p_finalisation_id then
    raise exception 'Payroll period changed; refresh before exporting';
  end if;
  if v_period.period_starts_at is distinct from (p_week_start::timestamp at time zone v_timezone)
    or v_period.period_ends_at is distinct from ((p_week_start + 7)::timestamp at time zone v_timezone) then
    raise exception 'Venue timezone changed; reopen and review payroll before exporting';
  end if;
  if exists (select 1 from public.list_payroll_period_exceptions(p_business_id, p_venue_id, p_week_start)) then
    raise exception 'Resolve outstanding payroll exceptions before exporting';
  end if;
  if exists (
    select 1 from public.payroll_period_entries e
    join public.workspace_demo_data_record_tags t
      on t.business_id = e.business_id and t.record_type = 'attendance_session'
        and t.record_id = e.session_id
    where e.business_id = p_business_id and e.venue_id = p_venue_id
      and e.week_start = p_week_start and e.event_id = p_finalisation_id
  ) then
    raise exception 'Simulation-only attendance cannot be exported as payroll';
  end if;
  perform 1 from public.list_canonical_payroll_records(
    p_business_id, p_venue_id, p_week_start, p_finalisation_id
  );
end;
$$;
revoke all on function public.lock_generic_payroll_export(uuid, uuid, date, uuid)
  from public, anon, authenticated, service_role;

create function public.get_workspace_demo_data_status(p_business_id uuid, p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_load public.workspace_demo_data_loads%rowtype;
  v_examples jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  ) or not exists (
    select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
  ) then
    raise exception 'Permission denied';
  end if;

  select * into v_load from public.workspace_demo_data_loads l
  where l.business_id = p_business_id and l.venue_id = p_venue_id and l.fixture_version = 'v1';
  if found then
    select coalesce(jsonb_agg(jsonb_build_object(
      'employee_name', e.name,
      'period_start', x.period_start,
      'hours_to_review', x.hours_to_review,
      'note', x.note
    ) order by e.name), '[]'::jsonb)
    into v_examples
    from public.workspace_demo_payroll_preparation_examples x
    join public.employees e on e.id = x.employee_id and e.business_id = x.business_id
    where x.business_id = p_business_id and x.venue_id = p_venue_id;
  end if;

  return jsonb_build_object(
    'loaded', v_load.id is not null,
    'loaded_at', v_load.created_at,
    'counts', coalesce(v_load.record_counts, jsonb_build_object(
      'employees', 0,
      'departments', 0,
      'shifts', 0,
      'availability_intervals', 0,
      'attendance_sessions', 0,
      'corrections', 0,
      'payroll_examples', 0
    )),
    'payroll_examples', coalesce(v_examples, '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_workspace_demo_data_status(uuid, uuid) from public, anon;
grant execute on function public.get_workspace_demo_data_status(uuid, uuid) to authenticated;

create function public.load_workspace_demo_data_seed(
  p_business_id uuid, p_venue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_roster_publication_mode text;
  v_load public.workspace_demo_data_loads%rowtype;
  v_department_ids uuid[] := '{}'::uuid[];
  v_role_ids uuid[] := '{}'::uuid[];
  v_employee_ids uuid[] := '{}'::uuid[];
  v_shift_ids uuid[] := '{}'::uuid[];
  v_session_ids uuid[] := '{}'::uuid[];
  v_counts jsonb;
  v_week_start date;
  v_shift_date date;
  v_shift_start timestamptz;
  v_session_id uuid;
  v_break_id uuid;
  v_clock_in_id uuid;
  v_correction_id uuid;
  v_department_id uuid;
  v_role_id uuid;
  v_employee_id uuid;
  v_shift_id uuid;
  v_publication_id uuid;
  v_publication_count integer := 0;
  v_example_id uuid;
  v_index integer;
  v_occurrence integer;
  v_weekday integer;
  v_employee_names text[] := array[
    'Mia Chen', 'Luca Taylor', 'Avery Ng', 'Noah Wilson', 'Ruby Thompson', 'Kai Morgan'
  ];
  v_role_names text[] := array[
    'Barista', 'Server', 'Shift Supervisor', 'Chef', 'Cook', 'Kitchen Hand'
  ];
begin
  if not public.workspace_demo_environment_approved() then
    raise exception 'Demo data is not enabled for this database';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  for share;
  if auth.uid() is null or not found then
    raise exception 'Permission denied';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'workspace-demo-data:' || p_business_id::text || ':' || p_venue_id::text || ':v1', 0
  ));

  select v.timezone, v.roster_publication_mode
  into v_timezone, v_roster_publication_mode
  from public.venues v
  join public.businesses b on b.id = v.business_id
  where v.id = p_venue_id and v.business_id = p_business_id
  for share of v, b;
  if not found then
    raise exception 'Permission denied';
  end if;
  if v_roster_publication_mode <> 'direct' then
    raise exception 'Demo loading requires direct roster publication in this venue';
  end if;

  select * into v_load from public.workspace_demo_data_loads l
  where l.business_id = p_business_id and l.venue_id = p_venue_id and l.fixture_version = 'v1';
  if found then
    return jsonb_build_object('loaded', true, 'already_loaded', true, 'counts', v_load.record_counts);
  end if;

  if exists (
    select 1 from public.employees e where e.business_id = p_business_id and e.venue_id = p_venue_id
  ) or exists (
    select 1 from public.shifts s where s.business_id = p_business_id and s.venue_id = p_venue_id
  ) or exists (
    select 1 from public.attendance_sessions s where s.business_id = p_business_id and s.venue_id = p_venue_id
  ) or exists (
    select 1 from public.roster_publications p where p.business_id = p_business_id and p.venue_id = p_venue_id
  ) or exists (
    select 1 from public.staff_invitations i where i.business_id = p_business_id and i.venue_id = p_venue_id
  ) or exists (
    select 1 from public.payroll_period_events p where p.business_id = p_business_id and p.venue_id = p_venue_id
  ) or exists (
    select 1 from public.payroll_mapping_connections c where c.business_id = p_business_id
  ) or exists (
    select 1 from public.xero_oauth_tenants t where t.business_id = p_business_id
  ) then
    raise exception 'Demo data can only be loaded into a clean venue without payroll integrations';
  end if;

  if exists (
    select 1 from public.departments d
    where d.business_id = p_business_id and d.venue_id = p_venue_id
      and d.name in ('SIMULATION ONLY - FOH', 'SIMULATION ONLY - BOH')
  ) or exists (
    select 1 from public.job_roles r
    where r.business_id = p_business_id and r.venue_id = p_venue_id
      and r.name in (
        'SIMULATION ONLY - Barista', 'SIMULATION ONLY - Server',
        'SIMULATION ONLY - Shift Supervisor', 'SIMULATION ONLY - Chef',
        'SIMULATION ONLY - Cook', 'SIMULATION ONLY - Kitchen Hand'
      )
  ) then
    raise exception 'Unlabelled demo-like records require operator review';
  end if;

  insert into public.departments (business_id, venue_id, name)
  values (p_business_id, p_venue_id, 'SIMULATION ONLY - FOH')
  returning id into v_department_id;
  v_department_ids := array_append(v_department_ids, v_department_id);
  insert into public.departments (business_id, venue_id, name)
  values (p_business_id, p_venue_id, 'SIMULATION ONLY - BOH')
  returning id into v_department_id;
  v_department_ids := array_append(v_department_ids, v_department_id);

  insert into public.workspace_demo_data_record_tags
    (business_id, venue_id, record_type, record_id)
  select p_business_id, p_venue_id, 'department', unnest(v_department_ids);

  for v_index in 1..6 loop
    v_department_id := v_department_ids[case when v_index <= 3 then 1 else 2 end];
    insert into public.job_roles (business_id, venue_id, department_id, name)
    values (
      p_business_id, p_venue_id, v_department_id,
      'SIMULATION ONLY - ' || v_role_names[v_index]
    )
    returning id into v_role_id;
    v_role_ids := array_append(v_role_ids, v_role_id);
    insert into public.workspace_demo_data_record_tags
      (business_id, venue_id, record_type, record_id)
    values (p_business_id, p_venue_id, 'job_role', v_role_id);
  end loop;

  for v_index in 1..6 loop
    v_department_id := v_department_ids[case when v_index <= 3 then 1 else 2 end];
    v_role_id := v_role_ids[v_index];
    insert into public.employees (
      business_id, venue_id, department_id, auth_user_id, name, email, role_title, employment_type
    )
    values (
      p_business_id, p_venue_id, v_department_id, null,
      'SIMULATION ONLY - ' || v_employee_names[v_index], null,
      'SIMULATION ONLY - ' || v_role_names[v_index],
      case when v_index in (1, 4) then 'part_time' else 'casual' end
    )
    returning id into v_employee_id;
    v_employee_ids := array_append(v_employee_ids, v_employee_id);
    insert into public.employee_job_roles (
      business_id, venue_id, department_id, employee_id, job_role_id, is_primary
    ) values (p_business_id, p_venue_id, v_department_id, v_employee_id, v_role_id, true);
    insert into public.workspace_demo_data_record_tags
      (business_id, venue_id, record_type, record_id)
    values
      (p_business_id, p_venue_id, 'employee_department', v_employee_id),
      (p_business_id, p_venue_id, 'employee_job_role', v_employee_id);
    insert into public.employee_availability_patterns (employee_id, business_id, venue_id)
    values (v_employee_id, p_business_id, p_venue_id);
    insert into public.workspace_demo_data_record_tags
      (business_id, venue_id, record_type, record_id)
    values
      (p_business_id, p_venue_id, 'employee', v_employee_id),
      (p_business_id, p_venue_id, 'availability_pattern', v_employee_id);

    for v_weekday in 1..5 loop
      insert into public.employee_availability_intervals
        (employee_id, business_id, venue_id, weekday, start_minute, end_minute)
      values (v_employee_id, p_business_id, p_venue_id, v_weekday, 480, 1020)
      returning id into v_example_id;
      insert into public.workspace_demo_data_record_tags
        (business_id, venue_id, record_type, record_id)
      values (p_business_id, p_venue_id, 'availability_interval', v_example_id);
    end loop;
  end loop;

  v_week_start := date_trunc('week', clock_timestamp() at time zone v_timezone)::date;
  for v_index in 1..6 loop
    v_department_id := v_department_ids[case when v_index <= 3 then 1 else 2 end];
    v_employee_id := v_employee_ids[v_index];
    for v_occurrence in 0..1 loop
      v_shift_date := case when v_occurrence = 0
        then v_week_start - 7 + ((v_index - 1) % 5)
        else v_week_start + ((v_index - 1) % 5)
      end;
      v_shift_start := (v_shift_date + time '08:00' + ((v_index % 3) * interval '1 hour'))
        at time zone v_timezone;
      insert into public.shifts (
        business_id, venue_id, department_id, employee_id, role_title,
        starts_at, ends_at, break_minutes, is_published, created_by
      )
      values (
        p_business_id, p_venue_id, v_department_id, v_employee_id,
        'SIMULATION ONLY - ' || v_role_names[v_index],
        v_shift_start, v_shift_start + interval '6 hours', 30, false, auth.uid()
      )
      returning id into v_shift_id;
      v_shift_ids := array_append(v_shift_ids, v_shift_id);
      insert into public.workspace_demo_data_record_tags
        (business_id, venue_id, record_type, record_id)
      values (p_business_id, p_venue_id, 'shift', v_shift_id);

      if v_occurrence = 0 and v_index in (1, 2, 4, 5) then
        v_session_id := gen_random_uuid();
        v_break_id := gen_random_uuid();
        v_clock_in_id := gen_random_uuid();
        insert into public.attendance_sessions (
          id, business_id, venue_id, department_id, employee_id, started_by
        ) values (
          v_session_id, p_business_id, p_venue_id, v_department_id, v_employee_id, auth.uid()
        );
        insert into public.attendance_breaks (id, session_id, business_id, classification)
        values (v_break_id, v_session_id, p_business_id, 'unpaid');
        insert into public.attendance_events (
          id, session_id, business_id, venue_id, department_id, employee_id, actor_id,
          request_id, event_type, occurred_at, source
        ) values (
          v_clock_in_id, v_session_id, p_business_id, p_venue_id, v_department_id, v_employee_id,
          auth.uid(), gen_random_uuid(), 'clock_in', v_shift_start + interval '5 minutes', 'server_clock'
        );
        insert into public.attendance_events (
          session_id, business_id, venue_id, department_id, employee_id, actor_id,
          request_id, event_type, occurred_at, source, break_id
        ) values
          (v_session_id, p_business_id, p_venue_id, v_department_id, v_employee_id, auth.uid(),
            gen_random_uuid(), 'break_start', v_shift_start + interval '3 hours', 'server_clock', v_break_id),
          (v_session_id, p_business_id, p_venue_id, v_department_id, v_employee_id, auth.uid(),
            gen_random_uuid(), 'break_end', v_shift_start + interval '3 hours 30 minutes', 'server_clock', v_break_id),
          (v_session_id, p_business_id, p_venue_id, v_department_id, v_employee_id, auth.uid(),
            gen_random_uuid(), 'clock_out', v_shift_start + interval '6 hours', 'server_clock', null);

        v_session_ids := array_append(v_session_ids, v_session_id);
        insert into public.workspace_demo_data_record_tags
          (business_id, venue_id, record_type, record_id)
        values
          (p_business_id, p_venue_id, 'attendance_session', v_session_id),
          (p_business_id, p_venue_id, 'attendance_break', v_break_id);
        insert into public.workspace_demo_data_record_tags
          (business_id, venue_id, record_type, record_id)
        select p_business_id, p_venue_id, 'attendance_event', e.id
        from public.attendance_events e
        where e.session_id = v_session_id and e.business_id = p_business_id;

        if v_index = 1 then
          v_correction_id := public.correct_attendance_event(
            p_business_id, p_venue_id, v_session_id, v_clock_in_id, gen_random_uuid(),
            v_shift_start + interval '5 minutes', v_shift_start,
            'SIMULATION ONLY: fictional missed clock-in corrected for example review.'
          );
          insert into public.workspace_demo_data_record_tags
            (business_id, venue_id, record_type, record_id)
          values (p_business_id, p_venue_id, 'attendance_correction', v_correction_id);
        end if;
      end if;
    end loop;
  end loop;

  foreach v_department_id in array v_department_ids loop
    perform public.publish_roster_review_internal(
      p_business_id, p_venue_id, v_department_id, v_week_start - 7, null
    );
    perform public.publish_roster_review_internal(
      p_business_id, p_venue_id, v_department_id, v_week_start, null
    );
  end loop;

  for v_index in 1..cardinality(v_session_ids) loop
    select s.employee_id, s.department_id, e.occurred_at
    into v_employee_id, v_department_id, v_shift_start
    from public.attendance_sessions s
    join public.attendance_events e
      on e.session_id = s.id and e.event_type = 'clock_in'
    where s.id = v_session_ids[v_index];
    insert into public.workspace_demo_payroll_preparation_examples (
      business_id, venue_id, employee_id, session_id, period_start,
      hours_to_review, note, created_by
    ) values (
      p_business_id, p_venue_id, v_employee_id, v_session_ids[v_index],
      (v_shift_start at time zone v_timezone)::date,
      5.50,
      'SIMULATION ONLY - illustrative recorded hours for review; not a pay or award calculation.',
      auth.uid()
    )
    returning id into v_example_id;
    insert into public.workspace_demo_data_record_tags
      (business_id, venue_id, record_type, record_id)
    values (p_business_id, p_venue_id, 'payroll_preparation_example', v_example_id);
  end loop;

  select coalesce(jsonb_agg(to_jsonb(p.id) order by p.week_start, p.department_id), '[]'::jsonb)
  into v_counts
  from public.roster_publications p
  where p.business_id = p_business_id and p.venue_id = p_venue_id
    and p.published_by = auth.uid()
    and p.week_start in (v_week_start - 7, v_week_start);
  for v_publication_id in select jsonb_array_elements_text(v_counts)::uuid loop
    v_publication_count := v_publication_count + 1;
    insert into public.workspace_demo_data_record_tags
      (business_id, venue_id, record_type, record_id)
    values (p_business_id, p_venue_id, 'roster_publication', v_publication_id);
    insert into public.workspace_demo_data_record_tags
      (business_id, venue_id, record_type, record_id)
    select p_business_id, p_venue_id, 'roster_publication_shift', s.shift_id
    from public.roster_publication_shifts s where s.publication_id = v_publication_id;
  end loop;

  v_counts := jsonb_build_object(
    'departments', cardinality(v_department_ids),
    'employees', cardinality(v_employee_ids),
    'shifts', cardinality(v_shift_ids),
    'roster_publications', v_publication_count,
    'availability_intervals', cardinality(v_employee_ids) * 5,
    'attendance_sessions', cardinality(v_session_ids),
    'corrections', (select count(*) from public.workspace_demo_data_record_tags t
      where t.business_id = p_business_id and t.venue_id = p_venue_id
        and t.record_type = 'attendance_correction'),
    'payroll_examples', cardinality(v_session_ids)
  );

  insert into public.workspace_demo_data_loads (
    business_id, venue_id, fixture_version, created_by, record_counts
  ) values (p_business_id, p_venue_id, 'v1', auth.uid(), v_counts)
  returning * into v_load;
  insert into public.workspace_demo_data_events (
    load_id, business_id, venue_id, actor_id, action, record_counts
  ) values (v_load.id, p_business_id, p_venue_id, auth.uid(), 'load', v_counts);
  insert into public.sensitive_action_audit (
    business_id, actor_id, actor_kind, source_table, operation, record_id,
    old_values, new_values, reason
  ) values (
    p_business_id, auth.uid(), 'user', 'workspace_demo_data_loads', 'INSERT',
    v_load.id::text, null, jsonb_build_object('venue_id', p_venue_id, 'record_counts', v_counts),
    'SIMULATION ONLY - owner loaded tagged fictional development data.'
  );

  return jsonb_build_object('loaded', true, 'already_loaded', false, 'counts', v_counts);
end;
$$;
revoke all on function public.load_workspace_demo_data_seed(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.load_workspace_demo_data(
  p_business_id uuid, p_venue_id uuid, p_project_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.workspace_demo_data_environment_enabled(p_project_ref) then
    raise exception 'Demo data is not enabled for this database';
  end if;
  if auth.uid() is null or not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Permission denied';
  end if;
  return public.load_workspace_demo_data_seed(p_business_id, p_venue_id);
end;
$$;
revoke all on function public.load_workspace_demo_data(uuid, uuid, text) from public, anon;
grant execute on function public.load_workspace_demo_data(uuid, uuid, text) to authenticated;

create or replace function public.create_business(
  p_business_name text,
  p_venue_name text,
  p_timezone text default 'Australia/Sydney',
  p_include_sample_data boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_venue_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(p_business_name, ''))) not between 1 and 100
    or length(trim(coalesce(p_venue_name, ''))) not between 1 and 100 then
    raise exception 'Business and venue names are required';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid timezone';
  end if;
  if p_include_sample_data and not public.workspace_demo_environment_approved() then
    raise exception 'Sample data is not enabled in this environment';
  end if;

  insert into public.businesses (name) values (trim(p_business_name))
    returning id into v_business_id;
  insert into public.business_memberships (business_id, user_id, role)
    values (v_business_id, auth.uid(), 'owner');
  insert into public.venues (business_id, name, timezone)
    values (v_business_id, trim(p_venue_name), p_timezone)
    returning id into v_venue_id;

  if p_include_sample_data then
    perform public.load_workspace_demo_data_seed(v_business_id, v_venue_id);
  else
    insert into public.departments (business_id, venue_id, name)
      values
        (v_business_id, v_venue_id, 'Front of House'),
        (v_business_id, v_venue_id, 'Back of House');
  end if;

  return v_business_id;
end;
$$;
