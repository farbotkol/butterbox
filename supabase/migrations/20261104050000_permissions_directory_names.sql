-- Preserve the existing member-list contract while allowing owners to search
-- their own business's directory by profile name as well as email.
create function public.list_business_members_for_permissions(p_business_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  venue_id uuid,
  department_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_business_role(p_business_id, array['owner']::text[]) then
    raise exception 'Permission denied';
  end if;
  return query
    select member.user_id, member.email, profile.full_name, member.role,
      member.venue_id, member.department_id
    from public.list_business_members(p_business_id) member
    join public.profiles profile on profile.id = member.user_id
    order by profile.full_name, member.email, member.user_id;
end;
$$;

revoke all on function public.list_business_members_for_permissions(uuid) from public, anon;
grant execute on function public.list_business_members_for_permissions(uuid) to authenticated;
