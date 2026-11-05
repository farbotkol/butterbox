create function public.assign_business_member_role_checked(
  p_business_id uuid, p_user_id uuid, p_role text, p_venue_id uuid, p_department_id uuid,
  p_expected_role text, p_expected_venue_id uuid, p_expected_department_id uuid, p_confirmed boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_membership public.business_memberships%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('membership-roles:' || p_business_id::text, 0));
  if not public.has_business_role(p_business_id, array['owner']::text[]) then
    raise exception 'Permission denied';
  end if;
  select * into v_membership from public.business_memberships m
  where m.business_id = p_business_id and m.user_id = p_user_id
  for update;
  if not found then
    raise exception 'Membership not found';
  end if;
  if p_expected_role is null then
    raise exception 'Invalid permission snapshot';
  end if;
  if v_membership.role is distinct from p_expected_role
    or v_membership.venue_id is distinct from p_expected_venue_id
    or v_membership.department_id is distinct from p_expected_department_id then
    raise exception 'Permissions changed; refresh before saving';
  end if;
  if p_confirmed is distinct from true then
    raise exception 'Confirm permission change';
  end if;
  perform public.assign_business_member_role(
    p_business_id, p_user_id, p_role, p_venue_id, p_department_id
  );
end;
$$;

revoke all on function public.assign_business_member_role_checked(uuid, uuid, text, uuid, uuid, text, uuid, uuid, boolean)
  from public, anon;
grant execute on function public.assign_business_member_role_checked(uuid, uuid, text, uuid, uuid, text, uuid, uuid, boolean)
  to authenticated;
