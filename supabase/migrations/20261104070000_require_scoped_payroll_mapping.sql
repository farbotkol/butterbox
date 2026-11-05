-- Authenticated writes must use the venue-checked, confirmed entry point.
revoke execute on function public.set_payroll_employee_mapping(uuid,uuid,uuid,integer,text,text,uuid)
  from authenticated;
