create table public.business_report_export_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  venue_id uuid not null,
  actor_id uuid not null,
  event_type text not null check (event_type in ('roster', 'attendance')),
  week_start date not null check (
    isfinite(week_start) and week_start between '0001-01-01'::date and '9998-12-24'::date
    and extract(isodow from week_start) = 1
  ),
  venue_timezone text not null,
  period_starts_at timestamptz not null,
  period_ends_at timestamptz not null,
  entry_count integer not null check (entry_count between 0 and 10000),
  occurred_at timestamptz not null default clock_timestamp(),
  check (period_starts_at < period_ends_at),
  foreign key (venue_id, business_id) references public.venues(id, business_id)
);

create index business_report_export_events_business_time_idx
  on public.business_report_export_events(business_id, occurred_at desc, id desc);

alter table public.business_report_export_events enable row level security;
revoke all on public.business_report_export_events from public, anon, authenticated, service_role;
grant select on public.business_report_export_events to authenticated;
create policy "Owners can read their business report export events"
  on public.business_report_export_events for select to authenticated
  using (public.has_business_role(business_id, array['owner']));

create trigger business_report_export_events_immutable
  before update or delete on public.business_report_export_events
  for each row execute function public.prevent_sensitive_action_audit_mutation();
create trigger sensitive_action_audit
  after insert on public.business_report_export_events
  for each row execute function public.record_sensitive_action_audit();

create function public.generate_business_report_export(
  p_business_id uuid, p_venue_id uuid, p_week_start date, p_report_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venue public.venues%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_rows jsonb;
  v_event_id uuid;
  v_count integer;
begin
  if auth.uid() is null or p_business_id is null then
    raise exception 'Permission denied';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  if p_report_type is null or p_report_type not in ('roster', 'attendance') then
    raise exception 'Invalid report type';
  end if;
  if p_week_start is not null and isfinite(p_week_start) and p_week_start < '0001-01-08'::date then
    raise exception 'Invalid timesheet week';
  end if;
  select * into v_venue from public.venues v
  where v.id = p_venue_id and v.business_id = p_business_id
  for share;
  if not found then
    raise exception 'Permission denied';
  end if;
  select b.starts_at, b.ends_at into v_start, v_end
  from public.timesheet_week_bounds(p_business_id, p_venue_id, p_week_start) b;

  if p_report_type = 'roster' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.starts_at_utc, r.shift_id), '[]'::jsonb)
    into v_rows
    from (
      select s.id as shift_id, d.id as department_id, d.name as department_name,
        s.employee_id, e.name as employee_name, s.role_title,
        to_char(s.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as starts_at_utc,
        to_char(s.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ends_at_utc,
        s.break_minutes, s.status, s.is_published
      from public.shifts s
      join public.departments d on d.id = s.department_id
        and d.business_id = s.business_id and d.venue_id = s.venue_id
      left join public.employees e on e.id = s.employee_id
        and e.business_id = s.business_id and e.venue_id = s.venue_id
      where s.business_id = p_business_id and s.venue_id = p_venue_id
        and s.starts_at >= v_start and s.starts_at < v_end
      order by s.starts_at, s.id
      limit 10001
    ) r;
  else
    select coalesce(jsonb_agg(to_jsonb(r) order by r.clock_in_utc nulls last, r.session_id), '[]'::jsonb)
    into v_rows
    from (
      select w.session_id, w.department_id, w.department_name, w.employee_id, w.employee_name,
        to_char(w.clocked_in_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as clock_in_utc,
        to_char(w.clocked_out_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as clock_out_utc,
        to_char(coalesce(w.clocked_in_at, w.clocked_out_at, s.created_at) at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as period_reference_utc,
        case when w.clocked_in_at is not null then 'clock_in'
          when w.clocked_out_at is not null then 'clock_out' else 'session_created' end as period_reference_basis,
        w.elapsed_seconds::text as elapsed_seconds, w.worked_seconds::text as worked_seconds,
        public.attendance_timesheet_status(w.session_id) as timesheet_status,
        case when w.exceptions is null then null else cardinality(w.exceptions) > 0 end as has_exceptions
      from public.list_weekly_worked_time(p_business_id, p_venue_id, p_week_start) w
      join public.attendance_sessions s on s.id = w.session_id
        and s.business_id = p_business_id and s.venue_id = p_venue_id
      order by w.clocked_in_at nulls last, w.session_id
      limit 10001
    ) r;
  end if;

  v_count := jsonb_array_length(v_rows);
  if v_count > 10000 then
    raise exception 'Report exceeds the 10000-row limit; choose another venue or week';
  end if;
  insert into public.business_report_export_events (
    business_id, venue_id, actor_id, event_type, week_start,
    venue_timezone, period_starts_at, period_ends_at, entry_count
  ) values (
    p_business_id, p_venue_id, auth.uid(), p_report_type, p_week_start,
    v_venue.timezone, v_start, v_end, v_count
  ) returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id, 'business_id', p_business_id,
    'venue_id', v_venue.id, 'venue_name', v_venue.name, 'venue_timezone', v_venue.timezone,
    'week_start', p_week_start,
    'period_start_utc', to_char(v_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'period_end_utc', to_char(v_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'report_type', p_report_type, 'entry_count', v_count, 'rows', v_rows
  );
end;
$$;

revoke all on function public.generate_business_report_export(uuid, uuid, date, text)
  from public, anon, authenticated, service_role;
grant execute on function public.generate_business_report_export(uuid, uuid, date, text) to authenticated;
