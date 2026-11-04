create trigger demand_imports_no_truncate before truncate on public.demand_history_imports
  for each statement execute function public.prevent_demand_history_mutation();
create trigger demand_records_no_truncate before truncate on public.demand_history_records
  for each statement execute function public.prevent_demand_history_mutation();
