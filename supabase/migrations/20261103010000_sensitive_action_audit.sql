create table public.sensitive_action_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'database')),
  source_table text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  record_id text not null,
  old_values jsonb,
  new_values jsonb,
  reason text,
  occurred_at timestamptz not null default clock_timestamp(),
  check ((actor_kind = 'user') = (actor_id is not null)),
  check (old_values is not null or new_values is not null)
);

create index sensitive_action_audit_business_time_idx
  on public.sensitive_action_audit(business_id, occurred_at desc, id desc);
create index sensitive_action_audit_source_time_idx
  on public.sensitive_action_audit(business_id, source_table, occurred_at desc, id desc);
create index sensitive_action_audit_actor_time_idx
  on public.sensitive_action_audit(business_id, actor_id, occurred_at desc, id desc);

alter table public.sensitive_action_audit enable row level security;
revoke all on public.sensitive_action_audit from public, anon, authenticated, service_role;
grant select on public.sensitive_action_audit to authenticated;
create policy "Owners can read their business audit"
  on public.sensitive_action_audit for select to authenticated
  using (public.has_business_role(business_id, array['owner']));

create function public.prevent_sensitive_action_audit_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1
    and not exists (select 1 from public.businesses b where b.id = old.business_id) then
    return old;
  end if;
  raise exception 'Sensitive action audit records are immutable';
end;
$$;
revoke all on function public.prevent_sensitive_action_audit_mutation()
  from public, anon, authenticated, service_role;
create trigger sensitive_action_audit_immutable
  before update or delete on public.sensitive_action_audit
  for each row execute function public.prevent_sensitive_action_audit_mutation();

create function public.record_sensitive_action_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Deliberate scalar allowlist: never copy credentials, email, GPS captures or arbitrary metadata.
  v_fields text[] := array[
    'id', 'business_id', 'venue_id', 'department_id', 'employee_id', 'user_id', 'auth_user_id',
    'job_role_id', 'session_id', 'event_id', 'break_id', 'check_id', 'claim_id',
    'invitation_id', 'publication_id', 'connection_id', 'finalisation_id', 'decision_id',
    'shared_worker_id', 'related_employee_id', 'clock_in_claim_id', 'clock_out_claim_id',
    'review_id', 'correction_id', 'offline_session_id', 'lock_event_id',
    'name', 'timezone', 'role', 'role_title', 'employment_type', 'active', 'is_primary',
    'starts_at', 'ends_at', 'break_minutes', 'status', 'is_published', 'published_at',
    'requires_acknowledgement', 'acknowledgement_required', 'week_start', 'version',
    'event_type', 'occurred_at', 'classification', 'verification_status', 'source',
    'old_at', 'new_at', 'locked', 'decision', 'reason', 'request_reason', 'claimed_at',
    'claim_source', 'reported_end_at', 'operation', 'event', 'revision',
    'preferred_weekly_hours', 'notify_schedule_email', 'notify_leave_email',
    'starts_on', 'ends_on', 'exception_type', 'weekday', 'start_minute', 'end_minute',
    'geofence_latitude', 'geofence_longitude', 'geofence_radius_meters', 'clock_geofence_enabled',
    'provider', 'account_id', 'external_employee_id', 'previous_id',
    'period_starts_at', 'period_ends_at', 'action', 'session_count', 'worked_seconds',
    'paid_seconds', 'entry_count', 'shift_count', 'new_shift_count', 'venue_timezone',
    'notifications_recorded', 'expires_at', 'accepted_at', 'accepted_by',
    'block_manual_unavailability', 'block_publish_unavailability',
    'block_publish_overlap', 'block_publish_long_shift'
  ];
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_business uuid;
  v_actor uuid := auth.uid();
begin
  if tg_op <> 'INSERT' then
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_old
    from jsonb_each(to_jsonb(old)) e(k, v)
    where k = any(v_fields) and jsonb_typeof(v) not in ('object', 'array');
  end if;
  if tg_op <> 'DELETE' then
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_new
    from jsonb_each(to_jsonb(new)) e(k, v)
    where k = any(v_fields) and jsonb_typeof(v) not in ('object', 'array');
  end if;
  if tg_op = 'UPDATE' and v_old is not distinct from v_new then
    return null;
  end if;
  v_row := coalesce(v_new, v_old);
  v_business := case when tg_table_name = 'businesses'
    then (v_row ->> 'id')::uuid else (v_row ->> 'business_id')::uuid end;
  -- Tenant deletion follows the existing cascade lifecycle; do not recreate child records.
  if not exists (select 1 from public.businesses b where b.id = v_business) then
    return null;
  end if;
  insert into public.sensitive_action_audit (
    business_id, actor_id, actor_kind, source_table, operation, record_id, old_values, new_values, reason
  ) values (
    v_business, v_actor, case when v_actor is null then 'database' else 'user' end,
    tg_table_name, tg_op,
    coalesce(v_row ->> 'id', concat_ws(':', v_row ->> 'employee_id',
      v_row ->> 'connection_id', v_row ->> 'department_id', v_row ->> 'job_role_id')),
    v_old, v_new, coalesce(v_row ->> 'reason', v_row ->> 'request_reason')
  );
  return null;
end;
$$;
revoke all on function public.record_sensitive_action_audit()
  from public, anon, authenticated, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'businesses', 'venues', 'departments', 'job_roles', 'business_memberships',
    'employees', 'employee_departments', 'employee_job_roles',
    'employee_availability_patterns', 'employee_availability_intervals',
    'employee_availability_exceptions', 'employee_preferences', 'shifts',
    'staff_invitations', 'shared_worker_link_events', 'roster_publications',
    'attendance_sessions', 'attendance_events', 'attendance_breaks',
    'attendance_event_corrections', 'attendance_edit_lock_events',
    'attendance_location_reviews', 'attendance_offline_claims',
    'attendance_offline_claim_reviews', 'attendance_offline_claim_sessions',
    'attendance_offline_break_resolutions', 'attendance_timesheet_decisions',
    'attendance_bulk_edit_lock_batches', 'payroll_period_events',
    'generic_payroll_export_batches', 'generic_payroll_reconciliations',
    'payroll_mapping_connections', 'payroll_employee_mapping_events'
  ] loop
    execute format(
      'create trigger sensitive_action_audit after insert or update or delete on public.%I '
      'for each row execute function public.record_sensitive_action_audit()', v_table
    );
  end loop;
end;
$$;
