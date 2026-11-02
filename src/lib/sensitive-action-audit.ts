import { parseBusinessId } from "./business-selection.ts";
import { parsePageNumber } from "./paginated-rows.ts";

export const auditSources = {
  businesses: "Businesses",
  venues: "Venues and clock/roster settings",
  departments: "Departments",
  job_roles: "Job roles",
  business_memberships: "Permissions",
  employees: "Employee profiles",
  employee_employment_metadata_events: "Employment metadata",
  employee_departments: "Employee departments",
  employee_job_roles: "Employee role eligibility",
  employee_availability_patterns: "Availability patterns",
  employee_availability_intervals: "Availability intervals",
  employee_availability_exceptions: "Leave and date exceptions",
  employee_preferences: "Employee preferences",
  shifts: "Shifts",
  staff_invitations: "Staff invitations",
  shared_worker_link_events: "Shared-worker links",
  roster_publications: "Roster publications",
  roster_review_requests: "Roster review submissions",
  roster_review_decisions: "Roster review decisions",
  venue_roster_week_events: "Venue planning week changes",
  attendance_kiosks: "Attendance kiosk devices",
  attendance_sessions: "Attendance sessions",
  attendance_events: "Clock and break events",
  attendance_breaks: "Break classifications",
  attendance_event_corrections: "Time corrections",
  attendance_edit_lock_events: "Attendance edit locks",
  attendance_location_reviews: "Location reviews",
  attendance_offline_claims: "Offline claims and employee requests",
  attendance_offline_claim_reviews: "Claim decisions",
  attendance_offline_claim_sessions: "Offline session confirmations",
  attendance_offline_break_resolutions: "Reported break ends",
  attendance_timesheet_decisions: "Timesheet approvals and returns",
  attendance_bulk_edit_lock_batches: "Bulk attendance locks",
  payroll_period_events: "Payroll finalisation and reopening",
  generic_payroll_export_batches: "Payroll CSV exports",
  generic_payroll_reconciliations: "Payroll export reconciliation",
  payroll_mapping_connections: "Payroll mapping destinations",
  payroll_employee_mapping_events: "Payroll employee mapping changes",
} as const;

export type AuditSource = keyof typeof auditSources;
export const auditOperations = ["INSERT", "UPDATE", "DELETE"] as const;
export type AuditOperation = typeof auditOperations[number];
export type AuditValues = Record<string, string | number | boolean | null>;
export type SensitiveActionAudit = {
  id: string;
  business_id: string;
  actor_id: string | null;
  actor_kind: "user" | "database";
  source_table: AuditSource;
  operation: AuditOperation;
  record_id: string;
  old_values: AuditValues | null;
  new_values: AuditValues | null;
  reason: string | null;
  occurred_at: string;
};

function isSource(value: string): value is AuditSource {
  return Object.hasOwn(auditSources, value);
}

function isOperation(value: unknown): value is AuditOperation {
  return typeof value === "string" && auditOperations.some((operation) => operation === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utcDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? null : date.toISOString();
}

export function parseAuditFilters(input: {
  source?: string; operation?: string; actor?: string; from?: string; to?: string; page?: string;
}) {
  if (Object.values(input).some((value) => value !== undefined && typeof value !== "string")) return null;
  if (input.source && !isSource(input.source)) return null;
  if (input.operation && !isOperation(input.operation)) return null;
  const actor = parseBusinessId(input.actor);
  if (actor === null) return null;
  const from = input.from ? utcDay(input.from) : undefined;
  const through = input.to ? utcDay(input.to) : undefined;
  if (from === null || through === null || (from && through && from > through)) return null;
  const to = through ? new Date(Date.parse(through) + 86_400_000).toISOString() : undefined;
  const page = parsePageNumber(input.page);
  if (page === null) return null;
  return { source: input.source || undefined, operation: input.operation || undefined, actor, from, to, page };
}

function isValues(value: unknown): value is AuditValues {
  return isRecord(value) &&
    Object.values(value).every((item) => item === null || typeof item === "string" ||
      typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)));
}

export function parseAuditRows(value: unknown, businessId: string): SensitiveActionAudit[] | null {
  if (!Array.isArray(value)) return null;
  const result: SensitiveActionAudit[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) ||
      typeof row.id !== "string" || !parseBusinessId(row.id) || seen.has(row.id) ||
      row.business_id !== businessId || (row.actor_kind !== "user" && row.actor_kind !== "database") ||
      (row.actor_id !== null && typeof row.actor_id !== "string") ||
      (row.actor_kind === "user" ? typeof row.actor_id !== "string" || !parseBusinessId(row.actor_id)
        : row.actor_id !== null) ||
      typeof row.source_table !== "string" || !isSource(row.source_table) ||
      !isOperation(row.operation) ||
      typeof row.record_id !== "string" || !row.record_id ||
      (row.old_values !== null && !isValues(row.old_values)) ||
      (row.new_values !== null && !isValues(row.new_values)) ||
      (row.old_values === null && row.new_values === null) ||
      (row.reason !== null && typeof row.reason !== "string") ||
      typeof row.occurred_at !== "string" || !Number.isFinite(Date.parse(row.occurred_at))) return null;
    seen.add(row.id);
    result.push({
      id: row.id, business_id: businessId, actor_id: row.actor_id, actor_kind: row.actor_kind,
      source_table: row.source_table, operation: row.operation, record_id: row.record_id,
      old_values: row.old_values, new_values: row.new_values, reason: row.reason, occurred_at: row.occurred_at,
    });
  }
  return result;
}
