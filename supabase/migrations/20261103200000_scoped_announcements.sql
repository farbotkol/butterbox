create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  venue_id uuid,
  department_id uuid,
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null check (length(btrim(body)) between 1 and 4000),
  requires_acknowledgement boolean not null,
  created_by uuid not null,
  request_id uuid not null,
  published_at timestamptz not null default clock_timestamp(),
  unique (business_id, created_by, request_id),
  unique (id, business_id),
  foreign key (venue_id, business_id) references public.venues (id, business_id),
  foreign key (department_id, business_id, venue_id) references public.departments (id, business_id, venue_id),
  check (department_id is null or venue_id is not null)
);

create table public.announcement_recipients (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null,
  business_id uuid not null,
  venue_id uuid not null,
  department_id uuid not null,
  employee_id uuid not null,
  user_id uuid not null,
  employee_name text not null,
  accepted_at timestamptz,
  unique (announcement_id, employee_id),
  foreign key (announcement_id, business_id) references public.announcements (id, business_id),
  foreign key (department_id, business_id, venue_id) references public.departments (id, business_id, venue_id),
  foreign key (employee_id, business_id, venue_id) references public.employees (id, business_id, venue_id)
);
create index announcement_recipients_user_idx on public.announcement_recipients (business_id, user_id, announcement_id);
create index announcements_business_time_idx on public.announcements (business_id, published_at desc, id desc);

alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;
revoke all on public.announcements, public.announcement_recipients from public, anon, authenticated, service_role;

create function public.can_publish_announcement(p_business_id uuid, p_venue_id uuid, p_department_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select auth.uid() is not null and case
    when p_department_id is not null then p_venue_id is not null and exists (
      select 1 from public.departments d where d.id = p_department_id
        and d.business_id = p_business_id and d.venue_id = p_venue_id
        and public.can_manage_department(p_business_id, d.id)
    )
    when p_venue_id is not null then exists (
      select 1 from public.venues v where v.id = p_venue_id and v.business_id = p_business_id
        and public.can_view_member_scope(p_business_id, v.id)
    )
    else exists (
      select 1 from public.business_memberships m
      where m.business_id = p_business_id and m.user_id = auth.uid()
        and (m.role in ('owner', 'admin') or (m.role = 'general_manager' and m.venue_id is null))
    )
  end;
$$;

create function public.protect_announcement_records()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'announcement_recipients' and tg_op = 'UPDATE' then
    if old.accepted_at is null and new.accepted_at is not null
      and (to_jsonb(old) - 'accepted_at') = (to_jsonb(new) - 'accepted_at')
      and new.user_id = auth.uid() then
      return new;
    end if;
  end if;
  raise exception 'Published announcements and recipient snapshots are immutable';
end;
$$;
create trigger announcements_immutable before update or delete on public.announcements
  for each row execute function public.protect_announcement_records();
create trigger announcement_recipients_immutable before update or delete on public.announcement_recipients
  for each row execute function public.protect_announcement_records();
create trigger announcements_no_truncate before truncate on public.announcements
  for each statement execute function public.protect_announcement_records();
create trigger announcement_recipients_no_truncate before truncate on public.announcement_recipients
  for each statement execute function public.protect_announcement_records();
create trigger sensitive_action_audit after insert on public.announcements
  for each row execute function public.record_sensitive_action_audit();
create trigger sensitive_action_audit after insert or update on public.announcement_recipients
  for each row execute function public.record_sensitive_action_audit();

create function public.publish_announcement(
  p_business_id uuid, p_venue_id uuid, p_department_id uuid, p_title text, p_body text,
  p_requires_acknowledgement boolean, p_request_id uuid
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_existing public.announcements%rowtype;
  v_id uuid;
  v_recipient record;
  v_count integer := 0;
begin
  if p_business_id is null or p_request_id is null or p_title is null or p_body is null
    or length(btrim(p_title)) not between 1 and 120 or length(btrim(p_body)) not between 1 and 4000
    or p_requires_acknowledgement is null then raise exception 'Invalid announcement'; end if;
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_publish_announcement(p_business_id, p_venue_id, p_department_id) then
    raise exception 'Permission denied';
  end if;
  if p_department_id is not null then
    perform 1 from public.departments d where d.id = p_department_id
      and d.business_id = p_business_id and d.venue_id = p_venue_id and d.active for share;
    if not found then raise exception 'Announcement department is inactive'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'announcement:' || p_business_id::text || auth.uid()::text || p_request_id::text, 0));
  select * into v_existing from public.announcements a
    where a.business_id = p_business_id and a.created_by = auth.uid() and a.request_id = p_request_id;
  if found then
    if v_existing.venue_id is distinct from p_venue_id or v_existing.department_id is distinct from p_department_id
      or v_existing.title <> btrim(p_title) or v_existing.body <> btrim(p_body)
      or v_existing.requires_acknowledgement <> p_requires_acknowledgement then
      raise exception 'Request identifier already used';
    end if;
    return v_existing.id;
  end if;
  insert into public.announcements (
    business_id, venue_id, department_id, title, body, requires_acknowledgement, created_by, request_id
  ) values (
    p_business_id, p_venue_id, p_department_id, btrim(p_title), btrim(p_body),
    p_requires_acknowledgement, auth.uid(), p_request_id
  ) returning id into v_id;
  for v_recipient in
    select e.id, e.auth_user_id, e.name, e.venue_id,
      coalesce(p_department_id, e.department_id) as department_id
    from public.employees e
    join public.business_memberships m on m.business_id = e.business_id and m.user_id = e.auth_user_id
    where e.business_id = p_business_id and e.active and e.auth_user_id is not null
      and (p_venue_id is null or e.venue_id = p_venue_id)
      and (p_department_id is null or e.department_id = p_department_id or exists (
        select 1 from public.employee_departments ed where ed.employee_id = e.id and ed.department_id = p_department_id
      ))
      and (m.role in ('owner', 'admin') or (
        (m.venue_id is null or m.venue_id = e.venue_id)
        and (m.department_id is null or m.department_id = coalesce(p_department_id, e.department_id))
      ))
    order by e.id for share of e, m
  loop
    insert into public.announcement_recipients (
      announcement_id, business_id, venue_id, department_id, employee_id, user_id, employee_name
    ) values (
      v_id, p_business_id, v_recipient.venue_id, v_recipient.department_id, v_recipient.id,
      v_recipient.auth_user_id, v_recipient.name
    );
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'No linked active recipients in this audience'; end if;
  return v_id;
end;
$$;

create function public.list_my_announcements(p_business_id uuid)
returns table (
  recipient_id uuid, announcement_id uuid, title text, body text, published_at timestamptz,
  requires_acknowledgement boolean, acknowledged_at timestamptz, venue_id uuid, department_id uuid
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Permission denied'; end if;
  return query select r.id, a.id, a.title, a.body, a.published_at, a.requires_acknowledgement,
    r.accepted_at, r.venue_id, r.department_id
  from public.announcement_recipients r
  join public.announcements a on a.id = r.announcement_id and a.business_id = r.business_id
  join public.employees e on e.id = r.employee_id and e.auth_user_id = r.user_id and e.business_id = r.business_id
  where r.business_id = p_business_id and r.user_id = auth.uid()
    and public.can_view_department(r.business_id, r.department_id);
end;
$$;

create function public.list_published_announcements(p_business_id uuid)
returns table (
  announcement_id uuid, title text, body text, venue_id uuid, department_id uuid,
  published_at timestamptz, requires_acknowledgement boolean, recipient_count bigint, acknowledged_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Permission denied'; end if;
  return query select a.id, a.title, a.body, a.venue_id, a.department_id, a.published_at,
    a.requires_acknowledgement, count(r.id), count(r.accepted_at)
  from public.announcements a join public.announcement_recipients r on r.announcement_id = a.id
  where a.business_id = p_business_id and public.can_publish_announcement(a.business_id, a.venue_id, a.department_id)
  group by a.id;
end;
$$;

create function public.list_announcement_receipts(p_business_id uuid, p_announcement_id uuid)
returns table (recipient_id uuid, employee_name text, acknowledged_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.announcements a where a.id = p_announcement_id and a.business_id = p_business_id
      and public.can_publish_announcement(a.business_id, a.venue_id, a.department_id)
  ) then raise exception 'Permission denied'; end if;
  return query select r.id, r.employee_name, r.accepted_at from public.announcement_recipients r
    where r.business_id = p_business_id and r.announcement_id = p_announcement_id;
end;
$$;

create function public.acknowledge_announcement(p_business_id uuid, p_recipient_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_recipient public.announcement_recipients%rowtype;
begin
  perform public.lock_attendance_membership(p_business_id);
  select r.* into v_recipient from public.announcement_recipients r
  join public.announcements a on a.id = r.announcement_id and a.business_id = r.business_id
  join public.employees e on e.id = r.employee_id and e.auth_user_id = r.user_id and e.business_id = r.business_id
  where r.id = p_recipient_id and r.business_id = p_business_id and r.user_id = auth.uid()
    and a.requires_acknowledgement and public.can_view_department(r.business_id, r.department_id)
  for update of r for share of e;
  if not found then raise exception 'Permission denied'; end if;
  if v_recipient.accepted_at is null then
    update public.announcement_recipients set accepted_at = clock_timestamp() where id = v_recipient.id;
  end if;
  return v_recipient.announcement_id;
end;
$$;

revoke all on function public.can_publish_announcement(uuid, uuid, uuid),
  public.protect_announcement_records(), public.publish_announcement(uuid, uuid, uuid, text, text, boolean, uuid),
  public.list_my_announcements(uuid), public.list_published_announcements(uuid),
  public.list_announcement_receipts(uuid, uuid), public.acknowledge_announcement(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_publish_announcement(uuid, uuid, uuid),
  public.publish_announcement(uuid, uuid, uuid, text, text, boolean, uuid),
  public.list_my_announcements(uuid), public.list_published_announcements(uuid),
  public.list_announcement_receipts(uuid, uuid), public.acknowledge_announcement(uuid, uuid)
  to authenticated;
