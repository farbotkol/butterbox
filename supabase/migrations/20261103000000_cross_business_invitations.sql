-- BB-FOUND-005: a verified account that already belongs to another business
-- can accept a scoped invitation. It receives only an employee membership for
-- the invited venue and department; its other memberships are unchanged.
create or replace function public.accept_staff_invitation(p_invitation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_invitation public.staff_invitations%rowtype;
  v_employee public.employees%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select lower(trim(u.email)) into v_email from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
  select * into v_invitation from public.staff_invitations i
  where i.id = p_invitation_id and i.email = v_email;
  if not found then
    raise exception 'Invitation is unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('initial-setup:' || auth.uid()::text, 0));
  perform 1 from public.departments d
  where d.id = v_invitation.department_id and d.business_id = v_invitation.business_id
    and d.venue_id = v_invitation.venue_id and d.active
  for share;
  if not found then
    raise exception 'Invitation is unavailable';
  end if;
  select * into v_employee from public.employees e
  where e.id = v_invitation.employee_id and e.business_id = v_invitation.business_id
    and e.venue_id = v_invitation.venue_id and e.department_id = v_invitation.department_id
  for update;
  if not found or not v_employee.active or v_employee.auth_user_id is not null then
    raise exception 'Invitation is unavailable';
  end if;
  select * into v_invitation from public.staff_invitations i
  where i.id = p_invitation_id and i.email = v_email for update;
  if not found or v_invitation.status <> 'pending'
    or v_invitation.expires_at <= clock_timestamp() then
    raise exception 'Invitation is unavailable or expired';
  end if;

  -- Memberships elsewhere are unaffected: per-request business selection
  -- (BB-FOUND-006) keeps each business's role and scope independent.
  perform 1 from public.business_memberships m
  where m.business_id = v_invitation.business_id and m.user_id = auth.uid()
  for share;
  if found then
    if not public.user_can_view_department(
      auth.uid(), v_invitation.business_id, v_invitation.department_id
    ) then
      raise exception 'Your existing membership cannot access this department';
    end if;
  else
    insert into public.business_memberships (business_id, user_id, role, venue_id, department_id)
    values (
      v_invitation.business_id, auth.uid(), 'employee',
      v_invitation.venue_id, v_invitation.department_id
    );
  end if;

  update public.employees set auth_user_id = auth.uid() where id = v_employee.id;
  update public.staff_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = clock_timestamp()
  where id = p_invitation_id;
  return v_invitation.business_id;
end;
$function$;
