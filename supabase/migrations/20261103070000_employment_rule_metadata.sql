alter table public.employees drop constraint employees_employment_type_check;
alter table public.employees add constraint employees_employment_type_check
  check (employment_type in ('unknown', 'full_time', 'part_time', 'casual'));

create table public.employee_employment_metadata_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  venue_id uuid not null,
  department_id uuid not null,
  employee_id uuid not null,
  effective_on date not null check (
    isfinite(effective_on) and effective_on between '1900-01-01'::date and '9999-12-31'::date
  ),
  employment_basis text not null check (employment_basis in ('unknown', 'full_time', 'part_time', 'casual')),
  classification text check (classification is null or public.valid_payroll_mapping_text(classification, 100)),
  award_reference text check (award_reference is null or public.valid_payroll_mapping_text(award_reference, 255)),
  contract_reference text check (contract_reference is null or public.valid_payroll_mapping_text(contract_reference, 255)),
  revision integer not null check (revision > 0),
  source text not null check (source in ('dated_editor', 'profile_edit')),
  actor_id uuid not null,
  request_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (employee_id, business_id, venue_id, department_id)
    references public.employees(id, business_id, venue_id, department_id) on delete cascade,
  unique (employee_id, revision),
  unique (business_id, actor_id, request_id)
);

create index employee_employment_metadata_effective_idx
  on public.employee_employment_metadata_events(employee_id, effective_on desc, revision desc);
create index employee_employment_metadata_scope_idx
  on public.employee_employment_metadata_events(business_id, venue_id, employee_id);

create function public.prevent_employment_metadata_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.businesses b where b.id = old.business_id
  ) then
    return old;
  end if;
  raise exception 'Employment metadata history is immutable';
end;
$$;
revoke all on function public.prevent_employment_metadata_mutation()
  from public, anon, authenticated, service_role;

create trigger employee_employment_metadata_immutable
  before update or delete on public.employee_employment_metadata_events
  for each row execute function public.prevent_employment_metadata_mutation();
create trigger sensitive_action_audit
  after insert on public.employee_employment_metadata_events
  for each row execute function public.record_sensitive_action_audit();

alter table public.employee_employment_metadata_events enable row level security;
revoke all on public.employee_employment_metadata_events from public, anon, authenticated, service_role;
grant select on public.employee_employment_metadata_events to authenticated;
create policy "Managers and employees can view scoped employment metadata"
  on public.employee_employment_metadata_events for select to authenticated
  using (
    public.can_manage_department(business_id, department_id)
    or exists (
      select 1 from public.employees e
      where e.id = employee_employment_metadata_events.employee_id
        and e.business_id = employee_employment_metadata_events.business_id
        and e.auth_user_id = auth.uid()
        and public.can_view_department(e.business_id, e.department_id)
    )
  );

create function public.append_employee_employment_metadata(
  p_business_id uuid, p_employee_id uuid, p_effective_on date, p_employment_basis text,
  p_classification text, p_award_reference text, p_contract_reference text,
  p_expected_revision integer, p_request_id uuid, p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_existing public.employee_employment_metadata_events%rowtype;
  v_revision integer;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Permission denied'; end if;
  if p_employee_id is null or p_effective_on is null or not isfinite(p_effective_on)
    or p_effective_on not between '1900-01-01'::date and '9999-12-31'::date
    or p_employment_basis is null or p_employment_basis not in ('unknown', 'full_time', 'part_time', 'casual')
    or (p_classification is not null and not public.valid_payroll_mapping_text(p_classification, 100))
    or (p_award_reference is not null and not public.valid_payroll_mapping_text(p_award_reference, 255))
    or (p_contract_reference is not null and not public.valid_payroll_mapping_text(p_contract_reference, 255))
    or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647
    or p_request_id is null or p_source is null or p_source not in ('dated_editor', 'profile_edit') then
    raise exception 'Invalid employment metadata';
  end if;

  select * into v_employee from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id;
  if not found then raise exception 'Employee unavailable or permission denied'; end if;
  perform public.lock_scheduling_membership(p_business_id, v_employee.department_id);
  select * into v_employee from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id for update;
  if not found or not public.can_manage_department(p_business_id, v_employee.department_id) then
    raise exception 'Employee unavailable or permission denied';
  end if;

  select * into v_existing from public.employee_employment_metadata_events m
  where m.business_id = p_business_id and m.actor_id = auth.uid() and m.request_id = p_request_id;
  if found then
    if v_existing.employee_id <> p_employee_id or v_existing.revision <> p_expected_revision + 1
      or v_existing.effective_on <> p_effective_on or v_existing.employment_basis <> p_employment_basis
      or v_existing.classification is distinct from p_classification
      or v_existing.award_reference is distinct from p_award_reference
      or v_existing.contract_reference is distinct from p_contract_reference
      or v_existing.source <> p_source then
      raise exception 'Request identifier already used';
    end if;
    return v_existing.id;
  end if;

  select coalesce(max(m.revision), 0) into v_revision
  from public.employee_employment_metadata_events m where m.employee_id = p_employee_id;
  if v_revision <> p_expected_revision then
    raise exception 'Employment metadata changed; refresh before saving';
  end if;
  insert into public.employee_employment_metadata_events (
    business_id, venue_id, department_id, employee_id, effective_on, employment_basis,
    classification, award_reference, contract_reference, revision, source, actor_id, request_id
  ) values (
    v_employee.business_id, v_employee.venue_id, v_employee.department_id, v_employee.id,
    p_effective_on, p_employment_basis, p_classification, p_award_reference, p_contract_reference,
    v_revision + 1, p_source, auth.uid(), p_request_id
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.append_employee_employment_metadata(uuid,uuid,date,text,text,text,text,integer,uuid,text)
  from public, anon, authenticated, service_role;

create function public.save_employee_employment_metadata(
  p_business_id uuid, p_employee_id uuid, p_effective_on date, p_employment_basis text,
  p_classification text, p_award_reference text, p_contract_reference text,
  p_expected_revision integer, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_current_basis text;
begin
  v_id := public.append_employee_employment_metadata(
    p_business_id, p_employee_id, p_effective_on, p_employment_basis,
    p_classification, p_award_reference, p_contract_reference,
    p_expected_revision, p_request_id, 'dated_editor'
  );
  select m.employment_basis into v_current_basis
  from public.employee_employment_metadata_events m
  join public.venues v on v.id = m.venue_id and v.business_id = m.business_id
  where m.employee_id = p_employee_id and m.business_id = p_business_id
    and m.effective_on <= (now() at time zone v.timezone)::date
  order by m.effective_on desc, m.revision desc limit 1;
  if found then
    update public.employees e set employment_type = v_current_basis
    where e.id = p_employee_id and e.business_id = p_business_id
      and e.employment_type is distinct from v_current_basis;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_employee_employment_metadata(uuid,uuid,date,text,text,text,text,integer,uuid)
  from public, anon, service_role;
grant execute on function public.save_employee_employment_metadata(uuid,uuid,date,text,text,text,text,integer,uuid)
  to authenticated;

create function public.list_current_employee_employment_metadata(p_business_id uuid, p_venue_id uuid)
returns table (employee_id uuid, employment_basis text, effective_on date, revision integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, current_metadata.employment_basis, current_metadata.effective_on,
    coalesce(latest.revision, 0)::integer
  from public.employees e
  join public.venues v on v.id = e.venue_id and v.business_id = e.business_id
  left join lateral (
    select m.employment_basis, m.effective_on
    from public.employee_employment_metadata_events m
    where m.employee_id = e.id and m.effective_on <= (now() at time zone v.timezone)::date
    order by m.effective_on desc, m.revision desc limit 1
  ) current_metadata on true
  left join lateral (
    select max(m.revision) as revision
    from public.employee_employment_metadata_events m where m.employee_id = e.id
  ) latest on true
  where e.business_id = p_business_id and e.venue_id = p_venue_id
    and public.can_manage_department(e.business_id, e.department_id);
$$;
revoke all on function public.list_current_employee_employment_metadata(uuid,uuid)
  from public, anon, service_role;
grant execute on function public.list_current_employee_employment_metadata(uuid,uuid) to authenticated;

create or replace function public.save_employee_profile(
  p_business_id uuid, p_department_id uuid, p_employee_id uuid, p_name text,
  p_email text, p_role_title text, p_employment_type text, p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue_id uuid;
  v_timezone text;
  v_employee public.employees%rowtype;
  v_current public.employee_employment_metadata_events%rowtype;
  v_revision integer;
  v_id uuid;
begin
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  if length(trim(coalesce(p_name, ''))) not between 1 and 100
    or length(trim(coalesce(p_role_title, ''))) not between 1 and 80
    or p_employment_type is null
    or p_employment_type not in ('unknown', 'full_time', 'part_time', 'casual')
    or p_active is null
    or (nullif(trim(p_email), '') is not null
        and (length(trim(p_email)) > 254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then
    raise exception 'Invalid employee details';
  end if;
  select d.venue_id, v.timezone into v_venue_id, v_timezone
  from public.departments d join public.venues v on v.id = d.venue_id and v.business_id = d.business_id
  where d.id = p_department_id and d.business_id = p_business_id;
  if v_venue_id is null then raise exception 'Department not found'; end if;

  if p_employee_id is null then
    insert into public.employees (
      business_id, venue_id, department_id, name, email, role_title, employment_type, active
    ) values (
      p_business_id, v_venue_id, p_department_id, trim(p_name),
      nullif(lower(trim(p_email)), ''), trim(p_role_title), p_employment_type, p_active
    ) returning id into v_id;
  else
    select * into v_employee from public.employees e where e.id = p_employee_id for update;
    if not found or v_employee.business_id <> p_business_id
      or v_employee.department_id <> p_department_id then
      raise exception 'Employee not found in this department';
    end if;
    select * into v_current from public.employee_employment_metadata_events m
    where m.employee_id = p_employee_id and m.effective_on <= (now() at time zone v_timezone)::date
    order by m.effective_on desc, m.revision desc limit 1;
    if (v_current.id is null and p_employment_type is distinct from v_employee.employment_type)
      or (v_current.id is not null and p_employment_type is distinct from v_current.employment_basis) then
      select coalesce(max(m.revision), 0) into v_revision
      from public.employee_employment_metadata_events m where m.employee_id = p_employee_id;
      perform public.append_employee_employment_metadata(
        p_business_id, p_employee_id, (now() at time zone v_timezone)::date, p_employment_type,
        v_current.classification, v_current.award_reference, v_current.contract_reference,
        v_revision, gen_random_uuid(), 'profile_edit'
      );
    end if;
    update public.employees
    set name = trim(p_name), email = nullif(lower(trim(p_email)), ''),
        role_title = trim(p_role_title), employment_type = p_employment_type, active = p_active
    where id = p_employee_id;
    v_id := p_employee_id;
  end if;
  return v_id;
end;
$$;

create function public.save_employee_profile_checked(
  p_business_id uuid, p_department_id uuid, p_employee_id uuid, p_name text,
  p_email text, p_role_title text, p_employment_type text, p_active boolean,
  p_expected_employment_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision integer;
begin
  if p_expected_employment_revision is null or p_expected_employment_revision < 0
    or p_expected_employment_revision >= 2147483647 then
    raise exception 'Invalid employment metadata';
  end if;
  perform public.lock_scheduling_membership(p_business_id, p_department_id);
  if p_employee_id is not null then
    perform 1 from public.employees e
    where e.id = p_employee_id and e.business_id = p_business_id and e.department_id = p_department_id
    for update;
    if not found then raise exception 'Employee not found in this department'; end if;
    select coalesce(max(m.revision), 0) into v_revision
    from public.employee_employment_metadata_events m where m.employee_id = p_employee_id;
    if v_revision <> p_expected_employment_revision then
      raise exception 'Employment metadata changed; refresh before saving';
    end if;
  elsif p_expected_employment_revision <> 0 then
    raise exception 'Invalid employment metadata';
  end if;
  return public.save_employee_profile(
    p_business_id, p_department_id, p_employee_id, p_name, p_email,
    p_role_title, p_employment_type, p_active
  );
end;
$$;
revoke all on function public.save_employee_profile_checked(uuid,uuid,uuid,text,text,text,text,boolean,integer)
  from public, anon, service_role;
grant execute on function public.save_employee_profile_checked(uuid,uuid,uuid,text,text,text,text,boolean,integer)
  to authenticated;
