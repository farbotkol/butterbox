create table public.shift_offer_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  offer_id uuid not null,
  employee_id uuid not null,
  event_type text not null check (event_type in ('offer', 'outcome')),
  outcome text check (outcome in ('confirmed', 'not_selected', 'unavailable', 'closed')),
  created_at timestamptz not null default clock_timestamp(),
  unique (offer_id, employee_id, event_type),
  foreign key (offer_id, employee_id)
    references public.shift_offer_recipients (offer_id, employee_id) on delete cascade,
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id) on delete cascade,
  check ((event_type = 'outcome') = (outcome is not null))
);
create index shift_offer_notifications_employee_idx
  on public.shift_offer_notifications (employee_id, created_at desc, id desc);

create table public.shift_offer_notification_reads (
  notification_id uuid not null references public.shift_offer_notifications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key (notification_id, user_id)
);

alter table public.shift_offer_notifications enable row level security;
alter table public.shift_offer_notification_reads enable row level security;
revoke all on public.shift_offer_notifications, public.shift_offer_notification_reads
  from public, anon, authenticated, service_role;

create function public.record_shift_offer_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.shift_offer_notifications (
      business_id, venue_id, department_id, offer_id, employee_id, event_type
    )
    select new.business_id, new.venue_id, o.department_id, new.offer_id, new.employee_id, 'offer'
    from public.shift_offers o where o.id = new.offer_id
    on conflict (offer_id, employee_id, event_type) do nothing;
  elsif old.outcome is null and new.outcome is not null then
    insert into public.shift_offer_notifications (
      business_id, venue_id, department_id, offer_id, employee_id, event_type, outcome
    )
    select new.business_id, new.venue_id, o.department_id, new.offer_id, new.employee_id,
      'outcome', new.outcome
    from public.shift_offers o where o.id = new.offer_id
    on conflict (offer_id, employee_id, event_type) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.record_shift_offer_notification() from public, anon, authenticated, service_role;

create trigger shift_offer_recipient_notification
  after insert on public.shift_offer_recipients
  for each row execute function public.record_shift_offer_notification();
create trigger shift_offer_outcome_notification
  after update of outcome on public.shift_offer_recipients
  for each row execute function public.record_shift_offer_notification();

create function public.list_shift_offer_notifications(p_business_id uuid, p_venue_id uuid)
returns table (
  notification_id uuid, event_type text, offer_id uuid, shift_id uuid,
  role_title text, department_name text, starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz, outcome text, unread boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v
    where v.id = p_venue_id and v.business_id = p_business_id
      and public.can_view_venue(v.business_id, v.id)
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  select n.id, n.event_type, o.id, s.id, s.role_title, d.name, s.starts_at, s.ends_at,
    n.created_at, n.outcome, reads.user_id is null
  from public.shift_offer_notifications n
  join public.shift_offers o on o.id = n.offer_id
  join public.shifts s on s.id = o.shift_id
  join public.departments d on d.id = o.department_id
  join public.shift_offer_recipients r on r.offer_id = n.offer_id and r.employee_id = n.employee_id
  join public.employees e on e.id = r.employee_id and e.auth_user_id = auth.uid()
  left join public.shift_offer_notification_reads reads
    on reads.notification_id = n.id and reads.user_id = auth.uid()
  where n.business_id = p_business_id and n.venue_id = p_venue_id
    and public.is_own_linked_shift(n.business_id, n.employee_id, n.department_id);
end;
$$;

create function public.mark_shift_offer_notification_read(p_notification_id uuid)
returns table (venue_id uuid, week_start date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification public.shift_offer_notifications%rowtype;
  v_week_start date;
  v_starts_at timestamptz;
  v_timezone text;
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  select n.id, n.business_id, n.venue_id, n.department_id, n.offer_id,
    n.employee_id, n.event_type, n.outcome, n.created_at
  into v_notification
  from public.shift_offer_notifications n
  join public.shift_offers o on o.id = n.offer_id
  join public.shift_offer_recipients r on r.offer_id = n.offer_id and r.employee_id = n.employee_id
  where n.id = p_notification_id and exists (
    select 1 from public.employees e
    where e.id = r.employee_id and e.auth_user_id = auth.uid()
      and public.is_own_linked_shift(n.business_id, n.employee_id, n.department_id)
  );
  if not found then
    raise exception 'Permission denied';
  end if;
  select s.starts_at, v.timezone into v_starts_at, v_timezone
  from public.shift_offers o
  join public.shifts s on s.id = o.shift_id
  join public.venues v on v.id = v_notification.venue_id
  where o.id = v_notification.offer_id and o.business_id = v_notification.business_id;
  v_week_start := date_trunc('week', v_starts_at at time zone v_timezone)::date;

  insert into public.shift_offer_notification_reads (notification_id, user_id)
  values (v_notification.id, auth.uid())
  on conflict (notification_id, user_id) do nothing;
  return query select v_notification.venue_id, v_week_start;
end;
$$;

create or replace function public.unread_roster_notification_count(p_business_id uuid, p_venue_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_roster_count integer;
  v_offer_count integer;
begin
  select count(*)::integer into v_roster_count
  from public.list_roster_notifications(p_business_id, p_venue_id) n
  where n.unread;
  select count(*)::integer into v_offer_count
  from public.list_shift_offer_notifications(p_business_id, p_venue_id) n
  where n.unread;
  return v_roster_count + v_offer_count;
end;
$$;

revoke all on function public.list_shift_offer_notifications(uuid, uuid),
  public.mark_shift_offer_notification_read(uuid),
  public.unread_roster_notification_count(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.list_shift_offer_notifications(uuid, uuid),
  public.mark_shift_offer_notification_read(uuid),
  public.unread_roster_notification_count(uuid, uuid)
  to authenticated;
