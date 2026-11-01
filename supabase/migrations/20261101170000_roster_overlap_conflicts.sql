create or replace function public.list_roster_overlap_conflicts(
  p_business_id uuid,
  p_venue_id uuid,
  p_shift_ids uuid[]
)
returns table (shift_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.venues v
    where v.id = p_venue_id and v.business_id = p_business_id
  ) or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  if p_shift_ids is null or cardinality(p_shift_ids) > 1000
    or coalesce(array_ndims(p_shift_ids), 1) <> 1 then
    raise exception 'Invalid shift selection';
  end if;
  if array_position(p_shift_ids, null) is not null then
    raise exception 'Invalid shift selection';
  end if;

  return query
    select s.id
    from public.shifts s
    where s.business_id = p_business_id and s.venue_id = p_venue_id
      and s.id = any(p_shift_ids) and s.status = 'scheduled'
      and s.employee_id is not null
      and public.can_manage_department(s.business_id, s.department_id)
      and exists (
        select 1 from public.shifts other
        where other.business_id = s.business_id
          and other.employee_id = s.employee_id
          and other.id <> s.id and other.status = 'scheduled'
          and tstzrange(other.starts_at, other.ends_at, '[)')
            && tstzrange(s.starts_at, s.ends_at, '[)')
      )
    order by s.id;
end;
$$;

revoke all on function public.list_roster_overlap_conflicts(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.list_roster_overlap_conflicts(uuid, uuid, uuid[]) to authenticated;
