create table public.shift_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  venue_id uuid not null,
  department_id uuid not null,
  shift_id uuid not null references public.shifts (id),
  employee_id uuid not null,
  participant_user_id uuid not null,
  employee_name text not null,
  department_name text not null,
  role_title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, business_id),
  unique (shift_id, employee_id, participant_user_id, department_id),
  foreign key (venue_id, business_id) references public.venues (id, business_id),
  foreign key (department_id, business_id, venue_id)
    references public.departments (id, business_id, venue_id),
  foreign key (employee_id, business_id, venue_id)
    references public.employees (id, business_id, venue_id)
);

create table public.shift_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  sequence_id bigint generated always as identity unique,
  business_id uuid not null,
  conversation_id uuid not null,
  sender_id uuid not null,
  sender_kind text not null check (sender_kind in ('manager', 'employee')),
  request_id uuid not null,
  body text not null check (length(btrim(body, E' \t\n\r')) between 1 and 2000),
  sent_at timestamptz not null default clock_timestamp(),
  unique (business_id, sender_id, request_id),
  foreign key (conversation_id, business_id)
    references public.shift_conversations (id, business_id)
);
create index shift_conversation_messages_thread_order
  on public.shift_conversation_messages (conversation_id, sequence_id);
create index shift_conversations_scope
  on public.shift_conversations (business_id, venue_id, department_id);

alter table public.shift_conversations enable row level security;
alter table public.shift_conversation_messages enable row level security;
revoke all on public.shift_conversations, public.shift_conversation_messages
  from public, anon, authenticated, service_role;
revoke all on sequence public.shift_conversation_messages_sequence_id_seq
  from public, anon, authenticated, service_role;

create function public.protect_shift_conversation_history()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  raise exception 'Shift conversation history is immutable';
end;
$$;
create trigger shift_conversations_immutable
  before update or delete on public.shift_conversations
  for each row execute function public.protect_shift_conversation_history();
create trigger shift_conversations_no_truncate
  before truncate on public.shift_conversations
  for each statement execute function public.protect_shift_conversation_history();
create trigger shift_conversation_messages_immutable
  before update or delete on public.shift_conversation_messages
  for each row execute function public.protect_shift_conversation_history();
create trigger shift_conversation_messages_no_truncate
  before truncate on public.shift_conversation_messages
  for each statement execute function public.protect_shift_conversation_history();
create trigger sensitive_action_audit after insert on public.shift_conversations
  for each row execute function public.record_sensitive_action_audit();
create trigger sensitive_action_audit after insert on public.shift_conversation_messages
  for each row execute function public.record_sensitive_action_audit();

create function public.shift_conversation_participant_available(
  p_shift_id uuid, p_employee_id uuid, p_user_id uuid
)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.shifts s
    join public.departments d on d.id = s.department_id and d.active
    join public.employees e on e.id = p_employee_id
      and e.business_id = s.business_id and e.venue_id = s.venue_id
      and e.active and e.auth_user_id = p_user_id
    join public.employee_departments ed on ed.employee_id = e.id
      and ed.business_id = s.business_id and ed.department_id = s.department_id
    join public.business_memberships m on m.business_id = s.business_id and m.user_id = p_user_id
    where s.id = p_shift_id and s.employee_id = p_employee_id
      and s.status = 'scheduled' and s.is_published
      and public.user_can_view_department(p_user_id, s.business_id, e.department_id)
      and (
        m.role in ('owner', 'admin') or m.venue_id = s.venue_id
        or (m.venue_id is null and (
          m.department_id is null or exists (
            select 1 from public.departments md where md.id = m.department_id
              and md.business_id = m.business_id and md.venue_id = s.venue_id
          )
        ))
      )
  );
$$;

create function public.can_access_shift_conversation(p_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.shift_conversations c
    join public.employees e on e.id = c.employee_id
      and e.business_id = c.business_id and e.venue_id = c.venue_id
    where c.id = p_conversation_id and (
      public.can_manage_department(c.business_id, c.department_id)
      or (
        c.participant_user_id = auth.uid() and e.auth_user_id = auth.uid()
        and public.is_business_member(c.business_id)
        and public.can_view_venue(c.business_id, c.venue_id)
      )
    )
  );
$$;

create function public.open_shift_conversation(
  p_business_id uuid, p_venue_id uuid, p_shift_id uuid, p_conversation_id uuid
)
returns table (
  conversation_id uuid, shift_id uuid, department_id uuid, employee_id uuid, participant_user_id uuid,
  employee_name text, department_name text, role_title text,
  starts_at timestamptz, ends_at timestamptz, shift_updated_at timestamptz,
  can_reply boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_conversation public.shift_conversations%rowtype;
  v_shift public.shifts%rowtype;
  v_employee public.employees%rowtype;
  v_department_name text;
begin
  if auth.uid() is null or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  if p_conversation_id is not null then
    select c.* into v_conversation from public.shift_conversations c
    where c.id = p_conversation_id and c.business_id = p_business_id and c.venue_id = p_venue_id;
    if not found or not public.can_access_shift_conversation(v_conversation.id) then
      raise exception 'Conversation unavailable or permission denied';
    end if;
    select s.* into strict v_shift from public.shifts s where s.id = v_conversation.shift_id;
    return query select v_conversation.id, v_conversation.shift_id, v_conversation.department_id, v_conversation.employee_id,
      v_conversation.participant_user_id, v_conversation.employee_name, v_conversation.department_name,
      v_conversation.role_title, v_conversation.starts_at, v_conversation.ends_at, v_shift.updated_at,
      v_shift.department_id = v_conversation.department_id and public.shift_conversation_participant_available(
        v_conversation.shift_id, v_conversation.employee_id, v_conversation.participant_user_id
      );
    return;
  end if;
  select s.* into v_shift from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id and s.venue_id = p_venue_id
    and s.is_published and s.status = 'scheduled' and s.employee_id is not null;
  if not found then raise exception 'Conversation unavailable or permission denied'; end if;
  select e.* into strict v_employee from public.employees e where e.id = v_shift.employee_id;
  if not public.can_manage_department(p_business_id, v_shift.department_id)
    and not (
      v_employee.auth_user_id = auth.uid() and public.is_business_member(p_business_id)
      and public.is_own_linked_shift(p_business_id, v_employee.id, v_shift.department_id)
    ) then
    raise exception 'Conversation unavailable or permission denied';
  end if;
  select d.name into strict v_department_name from public.departments d where d.id = v_shift.department_id;
  select c.* into v_conversation from public.shift_conversations c
  where c.shift_id = v_shift.id and c.employee_id = v_employee.id
    and c.participant_user_id = v_employee.auth_user_id and c.department_id = v_shift.department_id;
  return query select v_conversation.id, v_shift.id, v_shift.department_id, v_employee.id, v_employee.auth_user_id,
    v_employee.name, v_department_name, v_shift.role_title, v_shift.starts_at, v_shift.ends_at,
    v_shift.updated_at,
    public.shift_conversation_participant_available(v_shift.id, v_employee.id, v_employee.auth_user_id);
end;
$$;

create function public.list_shift_conversations(p_business_id uuid, p_venue_id uuid)
returns table (
  conversation_id uuid, shift_id uuid, employee_name text, department_name text,
  role_title text, starts_at timestamptz, last_sent_at timestamptz, message_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select c.id, c.shift_id, c.employee_name, c.department_name, c.role_title,
    c.starts_at, max(m.sent_at), count(m.id)
  from public.shift_conversations c
  join public.shift_conversation_messages m on m.conversation_id = c.id
  where c.business_id = p_business_id and c.venue_id = p_venue_id
    and public.can_access_shift_conversation(c.id)
  group by c.id;
end;
$$;

create function public.list_shift_conversation_messages(
  p_business_id uuid, p_venue_id uuid, p_conversation_id uuid
)
returns table (
  message_id uuid, sequence_id bigint, sender_kind text, is_mine boolean, body text, sent_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.shift_conversations c
    where c.id = p_conversation_id and c.business_id = p_business_id and c.venue_id = p_venue_id
      and public.can_access_shift_conversation(c.id)
  ) then raise exception 'Conversation unavailable or permission denied'; end if;
  return query select m.id, m.sequence_id, m.sender_kind, m.sender_id = auth.uid(), m.body, m.sent_at
  from public.shift_conversation_messages m
  where m.business_id = p_business_id and m.conversation_id = p_conversation_id
  order by m.sequence_id;
end;
$$;

create function public.send_shift_conversation_message(
  p_business_id uuid, p_venue_id uuid, p_shift_id uuid, p_employee_id uuid,
  p_participant_user_id uuid, p_expected_shift_updated_at timestamptz, p_body text, p_request_id uuid,
  p_expected_department_id uuid
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_existing record;
  v_shift public.shifts%rowtype;
  v_employee public.employees%rowtype;
  v_conversation_id uuid;
  v_department_name text;
  v_body text := btrim(p_body, E' \t\n\r');
begin
  if p_business_id is null or p_venue_id is null or p_shift_id is null or p_employee_id is null
    or p_participant_user_id is null or p_expected_department_id is null or p_expected_shift_updated_at is null
    or not isfinite(p_expected_shift_updated_at) or p_request_id is null
    or v_body is null or length(v_body) not between 1 and 2000 then
    raise exception 'Invalid shift message';
  end if;
  perform public.lock_attendance_membership(p_business_id);
  if not public.can_view_venue(p_business_id, p_venue_id) then raise exception 'Permission denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'shift-message:' || p_business_id::text || auth.uid()::text || p_request_id::text, 0
  ));
  select m.body, c.id, c.venue_id, c.shift_id, c.department_id, c.employee_id, c.participant_user_id
  into v_existing from public.shift_conversation_messages m
  join public.shift_conversations c on c.id = m.conversation_id and c.business_id = m.business_id
  where m.business_id = p_business_id and m.sender_id = auth.uid() and m.request_id = p_request_id;
  if found then
    if not public.can_access_shift_conversation(v_existing.id) then raise exception 'Permission denied'; end if;
    if v_existing.venue_id <> p_venue_id or v_existing.shift_id <> p_shift_id
      or v_existing.department_id <> p_expected_department_id or v_existing.employee_id <> p_employee_id
      or v_existing.participant_user_id <> p_participant_user_id or v_existing.body <> v_body then
      raise exception 'Request identifier already used';
    end if;
    return v_existing.id;
  end if;
  select s.* into v_shift from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id and s.venue_id = p_venue_id
  for update;
  if not found then raise exception 'Conversation unavailable or permission denied'; end if;
  select e.* into v_employee from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id and e.venue_id = p_venue_id
  for share;
  if not found then raise exception 'Conversation unavailable or permission denied'; end if;
  if not public.can_manage_department(p_business_id, v_shift.department_id)
    and not (v_employee.auth_user_id = auth.uid()
      and public.is_own_linked_shift(p_business_id, p_employee_id, v_shift.department_id)) then
    raise exception 'Conversation unavailable or permission denied';
  end if;
  perform 1 from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = p_participant_user_id for share;
  if not found then raise exception 'Shift participant is no longer available'; end if;
  perform 1 from public.employee_departments ed
  where ed.employee_id = p_employee_id and ed.business_id = p_business_id
    and ed.department_id = v_shift.department_id for share;
  if not found then raise exception 'Shift participant is no longer available'; end if;
  select d.name into v_department_name from public.departments d
  where d.id = v_shift.department_id and d.active for share;
  if not found then raise exception 'Shift participant is no longer available'; end if;
  if v_shift.updated_at is distinct from p_expected_shift_updated_at
    or v_shift.department_id is distinct from p_expected_department_id
    or v_shift.employee_id is distinct from p_employee_id
    or v_employee.auth_user_id is distinct from p_participant_user_id then
    raise exception 'Shift or participant changed; reload the conversation';
  end if;
  if not public.shift_conversation_participant_available(p_shift_id, p_employee_id, p_participant_user_id) then
    raise exception 'Shift participant is no longer available';
  end if;
  select c.id into v_conversation_id from public.shift_conversations c
  where c.shift_id = p_shift_id and c.employee_id = p_employee_id
    and c.participant_user_id = p_participant_user_id and c.department_id = p_expected_department_id;
  if v_conversation_id is null then
    insert into public.shift_conversations (
      business_id, venue_id, department_id, shift_id, employee_id, participant_user_id,
      employee_name, department_name, role_title, starts_at, ends_at
    ) values (
      p_business_id, p_venue_id, v_shift.department_id, p_shift_id, p_employee_id, p_participant_user_id,
      v_employee.name, v_department_name, v_shift.role_title, v_shift.starts_at, v_shift.ends_at
    ) returning id into v_conversation_id;
  end if;
  insert into public.shift_conversation_messages (
    business_id, conversation_id, sender_id, sender_kind, request_id, body
  ) values (
    p_business_id, v_conversation_id, auth.uid(),
    case when auth.uid() = p_participant_user_id then 'employee' else 'manager' end,
    p_request_id, v_body
  );
  return v_conversation_id;
end;
$$;

revoke all on function public.protect_shift_conversation_history(),
  public.shift_conversation_participant_available(uuid, uuid, uuid),
  public.can_access_shift_conversation(uuid),
  public.open_shift_conversation(uuid, uuid, uuid, uuid),
  public.list_shift_conversations(uuid, uuid),
  public.list_shift_conversation_messages(uuid, uuid, uuid),
  public.send_shift_conversation_message(uuid, uuid, uuid, uuid, uuid, timestamptz, text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.open_shift_conversation(uuid, uuid, uuid, uuid),
  public.list_shift_conversations(uuid, uuid),
  public.list_shift_conversation_messages(uuid, uuid, uuid),
  public.send_shift_conversation_message(uuid, uuid, uuid, uuid, uuid, timestamptz, text, uuid, uuid)
  to authenticated;
