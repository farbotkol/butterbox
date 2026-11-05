export const payrollPeriodStatuses = ["open", "finalised", "reopened"] as const;
export type PayrollPeriodStatus = typeof payrollPeriodStatuses[number];
export type PayrollPeriodAction = "finalised" | "reopened";
export const payrollExceptionCodes = [
  "approval_pending", "approval_returned", "approval_resubmitted", "approval_outdated",
  "incomplete_attendance", "location_review_required", "offline_claim_pending", "correction_request_pending",
] as const;
export type PayrollExceptionCode = typeof payrollExceptionCodes[number];
const actorRoles = ["owner", "admin", "general_manager"] as const;
type ActorRole = typeof actorRoles[number];

export type PayrollPeriod = {
  status: PayrollPeriodStatus;
  periodStartsAt: string;
  periodEndsAt: string;
  periodEnded: boolean;
  canFinalise: boolean;
  eventId: string | null;
  actorRole: ActorRole | null;
  actorIsSelf: boolean | null;
  reason: string | null;
  sessionCount: number | null;
  workedSeconds: number | null;
  paidSeconds: number | null;
  decidedAt: string | null;
};
export type PayrollPeriodException = {
  sessionId: string | null;
  claimId: string | null;
  employeeName: string;
  departmentName: string;
  occurredAt: string | null;
  code: PayrollExceptionCode;
};
export type PayrollPeriodEvent = {
  eventId: string;
  action: PayrollPeriodAction;
  actorRole: ActorRole;
  actorIsSelf: boolean;
  reason: string | null;
  sessionCount: number;
  workedSeconds: number;
  paidSeconds: number;
  createdAt: string;
};

export const payrollPeriodStatusLabels: Record<PayrollPeriodStatus, string> = {
  open: "Open — not finalised",
  finalised: "Finalised for payroll",
  reopened: "Reopened — not finalised",
};
export const payrollExceptionLabels: Record<PayrollExceptionCode, string> = {
  approval_pending: "Awaiting department approval",
  approval_returned: "Returned for correction",
  approval_resubmitted: "Corrected after return; approve again",
  approval_outdated: "Changed after approval; approve again",
  incomplete_attendance: "Incomplete or invalid attendance",
  location_review_required: "Location exception needs review",
  offline_claim_pending: "Offline clock claim awaiting review",
  correction_request_pending: "Employee time request awaiting review",
};
const actorRoleLabels: Record<ActorRole, string> = {
  owner: "owner", admin: "admin", general_manager: "general manager",
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
function isReason(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 500;
}
function isActorRole(value: unknown): value is ActorRole {
  return typeof value === "string" && (actorRoles as readonly string[]).includes(value);
}
function toSeconds(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : null;
}
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parsePayrollPeriod(value: unknown): PayrollPeriod | null {
  const row = Array.isArray(value) && value.length === 1 ? value[0] : null;
  if (!isRecord(row) || typeof row.status !== "string" ||
    !(payrollPeriodStatuses as readonly string[]).includes(row.status) ||
    !isTimestamp(row.period_starts_at) || !isTimestamp(row.period_ends_at) ||
    Date.parse(row.period_starts_at) >= Date.parse(row.period_ends_at) ||
    typeof row.period_ended !== "boolean" || typeof row.can_finalise !== "boolean") return null;
  const status = row.status as PayrollPeriodStatus;
  const base = {
    status, periodStartsAt: row.period_starts_at, periodEndsAt: row.period_ends_at,
    periodEnded: row.period_ended, canFinalise: row.can_finalise,
  };
  if (status === "open") {
    if (row.event_id !== null || row.actor_role !== null || row.actor_is_self !== null || row.reason !== null ||
      row.session_count !== null || row.worked_seconds !== null || row.paid_seconds !== null ||
      row.decided_at !== null) return null;
    return {
      ...base, eventId: null, actorRole: null, actorIsSelf: null, reason: null, sessionCount: null,
      workedSeconds: null, paidSeconds: null, decidedAt: null,
    };
  }
  const worked = toSeconds(row.worked_seconds);
  const paid = toSeconds(row.paid_seconds);
  if (!isUuid(row.event_id) || !isActorRole(row.actor_role) || typeof row.actor_is_self !== "boolean" ||
    (row.reason !== null && !isReason(row.reason)) || (status === "reopened" && row.reason === null) ||
    !isCount(row.session_count) || worked === null || paid === null || !isTimestamp(row.decided_at) ||
    (status === "reopened" && (row.session_count !== 0 || worked !== 0 || paid !== 0))) return null;
  return {
    ...base, eventId: row.event_id, actorRole: row.actor_role, actorIsSelf: row.actor_is_self,
    reason: row.reason as string | null, sessionCount: row.session_count, workedSeconds: worked,
    paidSeconds: paid, decidedAt: row.decided_at,
  };
}

export function parsePayrollPeriodExceptions(value: unknown): PayrollPeriodException[] | null {
  if (!Array.isArray(value)) return null;
  const result: PayrollPeriodException[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.employee_name !== "string" || typeof row.department_name !== "string" ||
      typeof row.exception_code !== "string" ||
      !(payrollExceptionCodes as readonly string[]).includes(row.exception_code) ||
      (row.occurred_at !== null && !isTimestamp(row.occurred_at))) return null;
    const code = row.exception_code as PayrollExceptionCode;
    const claimCode = code === "offline_claim_pending" || code === "correction_request_pending";
    if (claimCode ? row.session_id !== null || !isUuid(row.claim_id) || row.occurred_at === null
      : row.claim_id !== null || !isUuid(row.session_id)) return null;
    result.push({
      sessionId: row.session_id as string | null, claimId: row.claim_id as string | null,
      employeeName: row.employee_name, departmentName: row.department_name,
      occurredAt: row.occurred_at as string | null, code,
    });
  }
  return result;
}

export function parsePayrollPeriodEvents(value: unknown): PayrollPeriodEvent[] | null {
  if (!Array.isArray(value)) return null;
  const result: PayrollPeriodEvent[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.event_id) || (row.action !== "finalised" && row.action !== "reopened") ||
      !isActorRole(row.actor_role) || typeof row.actor_is_self !== "boolean" ||
      (row.reason !== null && !isReason(row.reason)) || (row.action === "reopened" && row.reason === null) ||
      !isCount(row.session_count) || !isTimestamp(row.created_at)) return null;
    const worked = toSeconds(row.worked_seconds);
    const paid = toSeconds(row.paid_seconds);
    const key = row.event_id.toLowerCase();
    if (worked === null || paid === null || seen.has(key)) return null;
    seen.add(key);
    result.push({
      eventId: row.event_id, action: row.action, actorRole: row.actor_role, actorIsSelf: row.actor_is_self,
      reason: row.reason as string | null, sessionCount: row.session_count, workedSeconds: worked,
      paidSeconds: paid, createdAt: row.created_at,
    });
  }
  return result;
}

export function parsePayrollPeriodInput(
  action: unknown, reason: unknown,
): { action: PayrollPeriodAction; reason: string | null } | null {
  if ((action !== "finalised" && action !== "reopened") || (reason !== null && typeof reason !== "string")) {
    return null;
  }
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (trimmed.length > 500 || (action === "reopened" && trimmed.length === 0)) return null;
  return { action, reason: trimmed.length === 0 ? null : trimmed };
}

export function payrollActorLabel(role: ActorRole, isSelf: boolean): string {
  const label = actorRoleLabels[role];
  return isSelf ? `you (${label})` : `${/^[aeiou]/.test(label) ? "an" : "a"} ${label}`;
}

export function payrollFailureReason(message: string | undefined): string {
  switch (message) {
    case "Invalid payroll period request": return "period-invalid";
    case "Invalid timesheet week": return "period-invalid";
    case "Permission denied":
    case "Only an owner, admin or general manager with full venue access can finalise or reopen payroll":
      return "period-permission";
    case "Request identifier already used": return "period-retry";
    case "Payroll period is already finalised": return "period-stale";
    case "Payroll period is not finalised": return "period-stale";
    case "Payroll period has not ended": return "period-not-ended";
    case "Resolve outstanding exceptions before finalising": return "period-exceptions";
    default: return "period-save";
  }
}

export const payrollFinalisedMessage = "Payroll period is finalised; reopen it before changing attendance";
