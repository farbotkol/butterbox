create table public.attendance_alert_notification_reads (
  notification_event_id uuid not null references public.attendance_alert_events (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key (notification_event_id, user_id)
);

alter table public.attendance_alert_notification_reads enable row level security;
revoke all on public.attendance_alert_notification_reads from public, anon, authenticated, service_role;

create function public.mark_actor_attendance_alert_read()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.event_type in ('acknowledged', 'resolved') then
    insert into public.attendance_alert_notification_reads (notification_event_id, user_id)
    select e.id, new.actor_id from public.attendance_alert_events e
    where e.alert_id = new.alert_id and e.business_id = new.business_id
      and e.event_type in ('opened', 'signal_changed') and e.new_signal is not null
    order by e.sequence desc limit 1
    on conflict (notification_event_id, user_id) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function public.mark_actor_attendance_alert_read()
  from public, anon, authenticated, service_role;
create trigger attendance_alert_action_marks_notification_read
  after insert on public.attendance_alert_events
  for each row execute function public.mark_actor_attendance_alert_read();

create function public.list_attendance_alert_notifications(p_business_id uuid, p_venue_id uuid)
returns table (
  notification_id uuid, alert_id uuid, employee_name text, department_name text,
  signal text, status text, starts_at timestamptz, created_at timestamptz, unread boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_attendance_alert_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select notice.id, a.id, e.name, d.name, a.signal, a.status, a.starts_at, notice.created_at,
    reads.user_id is null
  from public.attendance_alerts a
  join public.employees e on e.id = a.employee_id and e.business_id = a.business_id
  join public.departments d on d.id = a.department_id and d.business_id = a.business_id
  join lateral (
    select event.id, event.created_at from public.attendance_alert_events event
    where event.alert_id = a.id and event.business_id = a.business_id
      and event.event_type in ('opened', 'signal_changed') and event.new_signal is not null
    order by event.sequence desc limit 1
  ) notice on true
  left join public.attendance_alert_notification_reads reads
    on reads.notification_event_id = notice.id and reads.user_id = auth.uid()
  where a.business_id = p_business_id and a.venue_id = p_venue_id
    and a.status <> 'resolved' and a.signal is not null
    and public.can_manage_department(a.business_id, a.department_id);
end;
$$;

create function public.mark_attendance_alert_notification_read(
  p_business_id uuid, p_venue_id uuid, p_notification_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alert_id uuid;
begin
  if p_business_id is null or p_venue_id is null or p_notification_id is null then
    raise exception 'Invalid notification request';
  end if;
  perform public.lock_attendance_membership(p_business_id);
  select a.id into v_alert_id
  from public.attendance_alert_events e
  join public.attendance_alerts a on a.id = e.alert_id and a.business_id = e.business_id
  where e.id = p_notification_id and e.event_type in ('opened', 'signal_changed')
    and e.new_signal is not null and a.business_id = p_business_id and a.venue_id = p_venue_id
    and public.can_manage_department(a.business_id, a.department_id);
  if not found then raise exception 'Notification not found or permission denied'; end if;
  insert into public.attendance_alert_notification_reads (notification_event_id, user_id)
  values (p_notification_id, auth.uid())
  on conflict (notification_event_id, user_id) do nothing;
  return v_alert_id;
end;
$$;

create or replace function public.unread_roster_notification_count(p_business_id uuid, p_venue_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*)::integer from public.list_roster_notifications(p_business_id, p_venue_id) where unread)
    + (select count(*)::integer from public.list_shift_offer_notifications(p_business_id, p_venue_id) where unread)
    + (select count(*)::integer from public.list_shift_swap_notifications(p_business_id, p_venue_id) where unread)
    + (select count(*)::integer
       from public.attendance_alerts a
       join lateral (
         select event.id from public.attendance_alert_events event
         where event.alert_id = a.id and event.business_id = a.business_id
           and event.event_type in ('opened', 'signal_changed') and event.new_signal is not null
         order by event.sequence desc limit 1
       ) notice on true
       left join public.attendance_alert_notification_reads reads
         on reads.notification_event_id = notice.id and reads.user_id = auth.uid()
       where a.business_id = p_business_id and a.venue_id = p_venue_id
         and a.status <> 'resolved' and a.signal is not null and reads.user_id is null
         and public.can_manage_department(a.business_id, a.department_id));
$$;

revoke all on function public.list_attendance_alert_notifications(uuid, uuid),
  public.mark_attendance_alert_notification_read(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_attendance_alert_notifications(uuid, uuid),
  public.mark_attendance_alert_notification_read(uuid, uuid, uuid)
  to authenticated;
