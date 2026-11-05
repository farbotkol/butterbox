create function public.set_payroll_employee_mapping_scoped(
  p_business_id uuid, p_venue_id uuid, p_connection_id uuid, p_employee_id uuid,
  p_expected_revision integer, p_external_employee_id text, p_reason text, p_request_id uuid,
  p_destination_confirmed boolean, p_removal_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.lock_payroll_mapping_management(p_business_id);
  if p_destination_confirmed is distinct from true then
    raise exception 'Confirm payroll destination';
  end if;
  if p_external_employee_id is null and p_removal_confirmed is distinct from true then
    raise exception 'Confirm mapping removal';
  end if;
  perform 1 from public.employees e
  where e.id = p_employee_id and e.business_id = p_business_id and e.venue_id = p_venue_id
  for share;
  if not found then
    raise exception 'Employee unavailable or permission denied';
  end if;
  return public.set_payroll_employee_mapping(
    p_business_id, p_connection_id, p_employee_id, p_expected_revision,
    p_external_employee_id, p_reason, p_request_id
  );
end;
$$;

revoke all on function public.set_payroll_employee_mapping_scoped(
  uuid, uuid, uuid, uuid, integer, text, text, uuid, boolean, boolean
) from public, anon, service_role;
grant execute on function public.set_payroll_employee_mapping_scoped(
  uuid, uuid, uuid, uuid, integer, text, text, uuid, boolean, boolean
) to authenticated;
