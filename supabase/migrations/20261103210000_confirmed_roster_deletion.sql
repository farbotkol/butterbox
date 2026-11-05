create function public.delete_shift_if_unchanged(
  p_shift_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shifts%rowtype;
  v_business_id uuid;
  v_department_id uuid;
begin
  if p_shift_id is null or p_expected_updated_at is null then
    raise exception 'Invalid shift deletion request';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'Shift not found';
  end if;
  if auth.uid() is null or not public.can_manage_department(v_shift.business_id, v_shift.department_id) then
    raise exception 'Permission denied';
  end if;
  v_business_id := v_shift.business_id;
  v_department_id := v_shift.department_id;
  perform public.lock_scheduling_membership(v_business_id, v_department_id);

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'Shift not found';
  end if;
  if v_shift.business_id is distinct from v_business_id or
    v_shift.department_id is distinct from v_department_id then
    raise exception 'Shift changed; reload the roster';
  end if;
  if not public.can_manage_department(v_shift.business_id, v_shift.department_id) then
    raise exception 'Permission denied';
  end if;
  if v_shift.is_published then
    raise exception 'Published shifts cannot be deleted';
  end if;
  if v_shift.updated_at is distinct from p_expected_updated_at then
    raise exception 'Shift changed; reload the roster';
  end if;

  perform public.delete_shift(p_shift_id);
end;
$$;

revoke all on function public.delete_shift_if_unchanged(uuid, timestamptz) from public, anon;
grant execute on function public.delete_shift_if_unchanged(uuid, timestamptz) to authenticated;
