create table public.employee_preferences (
  employee_id uuid primary key,
  business_id uuid not null,
  venue_id uuid not null,
  preferred_weekly_hours numeric(5, 2),
  notify_schedule_email boolean not null,
  notify_leave_email boolean not null,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id) on delete cascade,
  check (preferred_weekly_hours is null or (
    preferred_weekly_hours between 0 and 168
    and mod(preferred_weekly_hours * 4, 1) = 0
  ))
);

create table public.employee_preference_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  actor_id uuid references auth.users (id) on delete set null,
  old_values jsonb,
  new_values jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id) on delete cascade
);

create index employee_preference_events_employee_idx
  on public.employee_preference_events (employee_id, created_at desc);
create trigger employee_preferences_business_id_immutable
  before update of business_id on public.employee_preferences
  for each row execute function public.prevent_business_id_change();
create trigger employee_preference_events_business_id_immutable
  before update of business_id on public.employee_preference_events
  for each row execute function public.prevent_business_id_change();

alter table public.employee_preferences enable row level security;
alter table public.employee_preference_events enable row level security;

create policy "Eligible members can view employee preferences"
  on public.employee_preferences for select to authenticated
  using (public.can_view_employee_availability(employee_id));
create policy "Eligible members can view employee preference history"
  on public.employee_preference_events for select to authenticated
  using (public.can_view_employee_availability(employee_id));

revoke all on public.employee_preferences, public.employee_preference_events
  from public, anon, authenticated;
grant select on public.employee_preferences, public.employee_preference_events to authenticated;

create or replace function public.save_employee_preferences(
  p_business_id uuid,
  p_venue_id uuid,
  p_employee_id uuid,
  p_preferred_weekly_hours numeric,
  p_notify_schedule_email boolean,
  p_notify_leave_email boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_old_values jsonb;
  v_new_values jsonb;
begin
  select * into v_employee from public.employees
  where id = p_employee_id and business_id = p_business_id and venue_id = p_venue_id
  for update;
  if not found or auth.uid() is null
    or v_employee.auth_user_id is distinct from auth.uid()
    or not v_employee.active
    or not public.can_view_department(v_employee.business_id, v_employee.department_id) then
    raise exception 'Permission denied';
  end if;
  if p_notify_schedule_email is null or p_notify_leave_email is null
    or (p_preferred_weekly_hours is not null and (
      p_preferred_weekly_hours < 0 or p_preferred_weekly_hours > 168
    )) then
    raise exception 'Invalid employee preferences';
  end if;
  if p_preferred_weekly_hours is not null
    and mod(p_preferred_weekly_hours * 4, 1) <> 0 then
    raise exception 'Invalid employee preferences';
  end if;

  select jsonb_build_object(
    'preferred_weekly_hours', preferred_weekly_hours,
    'notify_schedule_email', notify_schedule_email,
    'notify_leave_email', notify_leave_email
  ) into v_old_values
  from public.employee_preferences
  where employee_id = v_employee.id;
  v_new_values := jsonb_build_object(
    'preferred_weekly_hours', p_preferred_weekly_hours,
    'notify_schedule_email', p_notify_schedule_email,
    'notify_leave_email', p_notify_leave_email
  );
  if v_old_values is not distinct from v_new_values then
    return;
  end if;

  insert into public.employee_preferences (
    employee_id, business_id, venue_id, preferred_weekly_hours,
    notify_schedule_email, notify_leave_email
  )
  values (
    v_employee.id, v_employee.business_id, v_employee.venue_id, p_preferred_weekly_hours,
    p_notify_schedule_email, p_notify_leave_email
  )
  on conflict (employee_id) do update set
    preferred_weekly_hours = excluded.preferred_weekly_hours,
    notify_schedule_email = excluded.notify_schedule_email,
    notify_leave_email = excluded.notify_leave_email,
    updated_at = clock_timestamp();

  insert into public.employee_preference_events (
    employee_id, business_id, venue_id, actor_id, old_values, new_values
  )
  values (
    v_employee.id, v_employee.business_id, v_employee.venue_id,
    auth.uid(), v_old_values, v_new_values
  );
end;
$$;

revoke all on function public.save_employee_preferences(uuid, uuid, uuid, numeric, boolean, boolean)
  from public, anon;
grant execute on function public.save_employee_preferences(uuid, uuid, uuid, numeric, boolean, boolean)
  to authenticated;
