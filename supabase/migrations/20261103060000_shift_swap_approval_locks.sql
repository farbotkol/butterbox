-- Coordinate swap approval with the existing roster assignment lock order.
create or replace function public.review_shift_swap(p_swap_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_swap public.shift_swap_requests%rowtype;
  v_id uuid;
  v_reason text;
  v_rows integer;
begin
  select * into v_swap from public.shift_swap_requests where id = p_swap_id;
  if not found or not public.can_manage_department(v_swap.business_id, v_swap.department_id) then
    raise exception 'Swap not found or permission denied';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'Invalid swap decision';
  end if;
  if p_decision = 'reject' then
    if length(trim(coalesce(p_reason, ''))) not between 1 and 500 then
      raise exception 'A rejection reason of up to 500 characters is required';
    end if;
    perform public.lock_scheduling_membership(v_swap.business_id, v_swap.department_id);
    select * into v_swap from public.shift_swap_requests where id = p_swap_id for update;
    if not found or not public.can_manage_department(v_swap.business_id, v_swap.department_id) then
      raise exception 'Swap not found or permission denied';
    end if;
    if v_swap.status <> 'pending_manager' then
      raise exception 'This swap is no longer awaiting manager review';
    end if;
    update public.shift_swap_requests
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = clock_timestamp(),
      review_reason = trim(p_reason)
    where id = v_swap.id;
    return;
  end if;
  if p_reason is not null and length(trim(p_reason)) > 500 then
    raise exception 'Invalid swap decision';
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended(
    'shared-worker-links:' || v_swap.business_id::text, 0
  ));
  perform public.lock_scheduling_membership(v_swap.business_id, v_swap.department_id);
  perform public.lock_shared_worker_groups(
    v_swap.business_id, array[v_swap.requester_employee_id, v_swap.recipient_employee_id],
    'Roster changed while scheduling; please try again'
  );
  for v_id in
    select distinct employee_id
    from unnest(array[v_swap.requester_employee_id, v_swap.recipient_employee_id]) employee_id
    order by employee_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  end loop;
  select * into v_swap from public.shift_swap_requests where id = p_swap_id for update;
  if not found or not public.can_manage_department(v_swap.business_id, v_swap.department_id) then
    raise exception 'Swap not found or permission denied';
  end if;
  if v_swap.status <> 'pending_manager' then
    raise exception 'This swap is no longer awaiting manager review';
  end if;
  perform 1 from public.shifts s
  where s.id in (v_swap.requester_shift_id, v_swap.recipient_shift_id)
  order by s.id for update;
  perform 1 from public.employees e
  where e.id in (v_swap.requester_employee_id, v_swap.recipient_employee_id)
  order by e.id for update;
  perform 1 from public.business_memberships m
  where m.business_id = v_swap.business_id
    and m.user_id in (v_swap.confirmed_by, v_swap.proposed_by)
  order by m.user_id for share;

  if not exists (select 1 from public.departments d
      where d.id = v_swap.department_id and d.active)
    or not public.shift_swap_employee_authorized(v_swap.requester_employee_id,
      v_swap.business_id, v_swap.venue_id, v_swap.department_id)
    or not public.shift_swap_employee_authorized(v_swap.recipient_employee_id,
      v_swap.business_id, v_swap.venue_id, v_swap.department_id)
    or public.shift_swap_same_worker(v_swap.requester_employee_id, v_swap.recipient_employee_id, v_swap.business_id)
    or not exists (select 1 from public.employees e
      where e.id = v_swap.requester_employee_id and e.auth_user_id = v_swap.requested_by
        and e.auth_user_id = v_swap.confirmed_by)
    or not exists (select 1 from public.employees e
      where e.id = v_swap.recipient_employee_id and e.auth_user_id = v_swap.proposed_by) then
    raise exception 'A participant is no longer eligible for this swap';
  end if;
  if public.shift_swap_snapshot(v_swap.requester_shift_id) is distinct from v_swap.requester_snapshot
    or public.shift_swap_snapshot(v_swap.recipient_shift_id) is distinct from v_swap.recipient_snapshot
    or exists (select 1 from public.shifts s
      where s.id in (v_swap.requester_shift_id, v_swap.recipient_shift_id)
        and s.starts_at <= clock_timestamp()) then
    raise exception 'A shift has changed or started; ask for a new swap';
  end if;
  v_reason := public.shift_swap_ineligibility(
    v_swap.requester_shift_id, v_swap.recipient_employee_id, v_swap.recipient_shift_id
  );
  if v_reason is not null then
    raise exception 'Recipient is no longer eligible for the requested shift: %',
      case when v_reason = 'availability' then 'unavailable' else v_reason end;
  end if;
  v_reason := public.shift_swap_ineligibility(
    v_swap.recipient_shift_id, v_swap.requester_employee_id, v_swap.requester_shift_id
  );
  if v_reason is not null then
    raise exception 'Requester is no longer eligible for the proposed shift: %',
      case when v_reason = 'availability' then 'unavailable' else v_reason end;
  end if;
  update public.shifts
  set employee_id = case id
    when v_swap.requester_shift_id then v_swap.recipient_employee_id
    else v_swap.requester_employee_id end
  where id in (v_swap.requester_shift_id, v_swap.recipient_shift_id);
  get diagnostics v_rows = row_count;
  if v_rows <> 2 then
    raise exception 'Both shifts must still exist';
  end if;
  update public.shift_swap_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = clock_timestamp()
  where id = v_swap.id;
  perform public.record_shift_swap_publications(v_swap.id);
end;
$$;

create function public.list_my_pending_swap_recipients(p_business_id uuid, p_venue_id uuid)
returns table (swap_id uuid, employee_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_view_venue(p_business_id, p_venue_id) then
    raise exception 'Permission denied';
  end if;
  return query
  select r.id, r.recipient_employee_id
  from public.shift_swap_requests r
  where r.business_id = p_business_id and r.venue_id = p_venue_id
    and r.status = 'pending_recipient'
    and public.shift_swap_owned_employee(
      r.recipient_employee_id, r.business_id, r.venue_id, r.department_id
    )
  order by r.id;
end;
$$;

revoke all on function public.list_my_pending_swap_recipients(uuid, uuid) from public, anon;
grant execute on function public.list_my_pending_swap_recipients(uuid, uuid) to authenticated;
