alter table public.roster_publications
  add column notifications_recorded boolean not null default false;

create table public.roster_publication_recipients (
  publication_id uuid not null references public.roster_publications (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  primary key (publication_id, employee_id)
);
create index roster_publication_recipients_employee_idx
  on public.roster_publication_recipients (employee_id, publication_id);

create table public.roster_publication_notification_reads (
  publication_id uuid not null references public.roster_publications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key (publication_id, user_id)
);

alter table public.roster_publication_recipients enable row level security;
alter table public.roster_publication_notification_reads enable row level security;
revoke all on public.roster_publication_recipients, public.roster_publication_notification_reads
  from public, anon, authenticated;

create function public.user_can_view_department(
  p_user_id uuid, p_business_id uuid, p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships m
    join public.departments d
      on d.id = p_department_id and d.business_id = m.business_id
    where m.business_id = p_business_id and m.user_id = p_user_id
      and (
        m.role in ('owner', 'admin')
        or (
          (m.venue_id is null or m.venue_id = d.venue_id)
          and (
            m.role = 'general_manager'
            or (m.role in ('foh_manager', 'boh_manager', 'department_manager')
                and m.department_id = d.id)
            or (m.role = 'employee'
                and (m.department_id is null or m.department_id = d.id))
          )
        )
      )
  );
$$;
revoke all on function public.user_can_view_department(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.can_view_department(p_business_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.user_can_view_department(auth.uid(), p_business_id, p_department_id);
$$;

create or replace function public.record_roster_publications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope record;
  v_publication_id uuid;
  v_version integer;
  v_shift_count integer;
begin
  for v_scope in
    select n.business_id, n.venue_id, n.department_id, v.timezone,
      date_trunc('week', n.starts_at at time zone v.timezone)::date as week_start,
      count(*)::integer as new_shift_count
    from new_roster_shifts n
    join old_roster_shifts o on o.id = n.id
    join public.venues v on v.id = n.venue_id and v.business_id = n.business_id
    where n.is_published and not o.is_published and n.status = 'scheduled'
    group by n.business_id, n.venue_id, n.department_id, v.timezone,
      date_trunc('week', n.starts_at at time zone v.timezone)::date
    order by n.business_id, n.venue_id, n.department_id, week_start
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'roster-publication:' || v_scope.department_id::text || ':' || v_scope.week_start::text, 0
    ));
    select coalesce(max(version), 0) + 1 into v_version
    from public.roster_publications p
    where p.business_id = v_scope.business_id and p.venue_id = v_scope.venue_id
      and p.department_id = v_scope.department_id and p.week_start = v_scope.week_start;

    insert into public.roster_publications (
      business_id, venue_id, department_id, week_start, venue_timezone, version,
      published_by, new_shift_count, shift_count, notifications_recorded
    )
    values (
      v_scope.business_id, v_scope.venue_id, v_scope.department_id, v_scope.week_start,
      v_scope.timezone, v_version, auth.uid(), v_scope.new_shift_count, 0, true
    )
    returning id into v_publication_id;

    insert into public.roster_publication_shifts (
      publication_id, shift_id, employee_id, role_title, starts_at, ends_at, break_minutes
    )
    select v_publication_id, s.id, s.employee_id, s.role_title, s.starts_at, s.ends_at, s.break_minutes
    from public.shifts s
    where s.business_id = v_scope.business_id and s.venue_id = v_scope.venue_id
      and s.department_id = v_scope.department_id and s.status = 'scheduled'
      and s.is_published
      and (s.starts_at at time zone v_scope.timezone)::date
        between v_scope.week_start and v_scope.week_start + 6;
    get diagnostics v_shift_count = row_count;
    update public.roster_publications set shift_count = v_shift_count
    where id = v_publication_id;

    insert into public.roster_publication_recipients (publication_id, employee_id)
    select distinct v_publication_id, n.employee_id
    from new_roster_shifts n
    join old_roster_shifts o on o.id = n.id
    where n.business_id = v_scope.business_id and n.venue_id = v_scope.venue_id
      and n.department_id = v_scope.department_id and n.status = 'scheduled'
      and n.is_published and not o.is_published and n.employee_id is not null
      and (n.starts_at at time zone v_scope.timezone)::date
        between v_scope.week_start and v_scope.week_start + 6;
  end loop;
  return null;
end;
$$;

create function public.list_roster_notifications(p_business_id uuid, p_venue_id uuid)
returns table (publication_id uuid, week_start date, published_at timestamptz, unread boolean)
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
  select p.id, p.week_start, p.published_at, reads.user_id is null
  from public.roster_publications p
  join public.roster_publication_recipients r on r.publication_id = p.id
  join public.employees e on e.id = r.employee_id and e.auth_user_id = auth.uid()
  left join public.roster_publication_notification_reads reads
    on reads.publication_id = p.id and reads.user_id = auth.uid()
  where p.business_id = p_business_id and p.venue_id = p_venue_id
    and public.is_own_linked_shift(p.business_id, r.employee_id, p.department_id)
  group by p.id, p.week_start, p.published_at, reads.user_id;
end;
$$;

create function public.unread_roster_notification_count(p_business_id uuid, p_venue_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.list_roster_notifications(p_business_id, p_venue_id) n
  where n.unread;
$$;

create function public.mark_roster_notification_read(p_publication_id uuid)
returns table (venue_id uuid, week_start date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_publication public.roster_publications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Permission denied';
  end if;
  select p.* into v_publication
  from public.roster_publications p
  where p.id = p_publication_id and exists (
    select 1 from public.roster_publication_recipients r
    where r.publication_id = p.id
      and public.is_own_linked_shift(p.business_id, r.employee_id, p.department_id)
  );
  if not found then
    raise exception 'Permission denied';
  end if;

  insert into public.roster_publication_notification_reads (publication_id, user_id)
  values (v_publication.id, auth.uid())
  on conflict (publication_id, user_id) do nothing;
  return query select v_publication.venue_id, v_publication.week_start;
end;
$$;

create function public.list_roster_notification_reachability(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_week_start date
)
returns table (publication_id uuid, inaccessible_count integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_manage_department(p_business_id, p_department_id)
    or not exists (
      select 1 from public.departments d
      where d.id = p_department_id and d.business_id = p_business_id and d.venue_id = p_venue_id
    ) then
    raise exception 'Permission denied';
  end if;
  if p_week_start is null or not isfinite(p_week_start)
    or extract(isodow from p_week_start) <> 1 then
    raise exception 'Roster week must start on Monday';
  end if;

  return query
  select p.id, count(r.employee_id) filter (
    where e.auth_user_id is null
      or not public.user_can_view_department(e.auth_user_id, e.business_id, e.department_id)
      or not exists (
        select 1 from public.employee_departments ed
        where ed.employee_id = e.id and ed.department_id = p.department_id
      )
  )::integer
  from public.roster_publications p
  left join public.roster_publication_recipients r on r.publication_id = p.id
  left join public.employees e on e.id = r.employee_id
  where p.business_id = p_business_id and p.venue_id = p_venue_id
    and p.department_id = p_department_id and p.week_start = p_week_start
  group by p.id;
end;
$$;

revoke all on function public.list_roster_notifications(uuid, uuid),
  public.unread_roster_notification_count(uuid, uuid),
  public.mark_roster_notification_read(uuid),
  public.list_roster_notification_reachability(uuid, uuid, uuid, date)
  from public, anon;
grant execute on function public.list_roster_notifications(uuid, uuid),
  public.unread_roster_notification_count(uuid, uuid),
  public.mark_roster_notification_read(uuid),
  public.list_roster_notification_reachability(uuid, uuid, uuid, date)
  to authenticated;
