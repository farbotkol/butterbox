export const timesheetApprovalStatuses = ["pending", "approved", "approval_outdated", "returned", "resubmitted"] as const;
export type TimesheetApprovalStatus = typeof timesheetApprovalStatuses[number];
export type TimesheetDecisionKind = "approved" | "rejected";
export type TimesheetApproval = {
  session_id: string;
  department_id: string;
  status: TimesheetApprovalStatus;
  decision: TimesheetDecisionKind | null;
  reason: string | null;
  decided_at: string | null;
  actor_id: string | null;
  self_owned: boolean;
};
export type TimesheetDecision = {
  decision_id: string;
  session_id: string;
  employee_name: string;
  department_name: string;
  clocked_in_at: string | null;
  decision: TimesheetDecisionKind;
  reason: string | null;
  status: Exclude<TimesheetApprovalStatus, "pending">;
  decided_at: string;
  actor_id: string;
};

export const timesheetApprovalLabels: Record<TimesheetApprovalStatus, string> = {
  pending: "Awaiting department approval",
  approved: "Approved by department manager",
  approval_outdated: "Changed after approval; review again",
  returned: "Returned for correction",
  resubmitted: "Corrected after return; review again",
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

function isStatus(value: unknown): value is TimesheetApprovalStatus {
  return typeof value === "string" && (timesheetApprovalStatuses as readonly string[]).includes(value);
}

function isDecision(value: unknown): value is TimesheetDecisionKind {
  return value === "approved" || value === "rejected";
}

function decisionMatchesStatus(decision: TimesheetDecisionKind | null, status: TimesheetApprovalStatus): boolean {
  if (decision === null) return status === "pending";
  if (decision === "approved") return status === "approved" || status === "approval_outdated";
  return status === "returned" || status === "resubmitted";
}

export function parseTimesheetApprovals(value: unknown): TimesheetApproval[] | null {
  if (!Array.isArray(value)) return null;
  const result: TimesheetApproval[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.session_id) || !isUuid(row.department_id) || !isStatus(row.status) ||
      typeof row.self_owned !== "boolean") return null;
    const decision = row.decision === null ? null : isDecision(row.decision) ? row.decision : undefined;
    if (decision === undefined || !decisionMatchesStatus(decision, row.status)) return null;
    if (decision === null
      ? row.reason !== null || row.decided_at !== null || row.actor_id !== null
      : !isTimestamp(row.decided_at) || !isUuid(row.actor_id) ||
        (row.reason !== null && !isReason(row.reason)) || (decision === "rejected" && row.reason === null)) {
      return null;
    }
    const key = row.session_id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    result.push({
      session_id: row.session_id, department_id: row.department_id, status: row.status, decision,
      reason: decision === null ? null : row.reason as string | null,
      decided_at: decision === null ? null : row.decided_at as string,
      actor_id: decision === null ? null : row.actor_id as string, self_owned: row.self_owned,
    });
  }
  return result;
}

export function parseTimesheetDecisions(value: unknown): TimesheetDecision[] | null {
  if (!Array.isArray(value)) return null;
  const result: TimesheetDecision[] = [];
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.decision_id) || !isUuid(row.session_id) ||
      typeof row.employee_name !== "string" || typeof row.department_name !== "string" ||
      (row.clocked_in_at !== null && !isTimestamp(row.clocked_in_at)) || !isDecision(row.decision) ||
      !isStatus(row.status) || row.status === "pending" || !decisionMatchesStatus(row.decision, row.status) ||
      (row.reason !== null && !isReason(row.reason)) || (row.decision === "rejected" && row.reason === null) ||
      !isTimestamp(row.decided_at) || !isUuid(row.actor_id)) return null;
    result.push({
      decision_id: row.decision_id, session_id: row.session_id, employee_name: row.employee_name,
      department_name: row.department_name, clocked_in_at: row.clocked_in_at as string | null,
      decision: row.decision, reason: row.reason as string | null, status: row.status,
      decided_at: row.decided_at, actor_id: row.actor_id,
    });
  }
  return result;
}

export function parseTimesheetDecisionInput(
  decision: unknown, reason: unknown,
): { decision: TimesheetDecisionKind; reason: string | null } | null {
  if (!isDecision(decision) || (reason !== null && typeof reason !== "string")) return null;
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (trimmed.length > 500 || (decision === "rejected" && trimmed.length === 0)) return null;
  return { decision, reason: trimmed.length === 0 ? null : trimmed };
}

export function timesheetApprovalsWithinSessions(
  sessions: { session_id: string; department_id: string }[], approvals: TimesheetApproval[],
): boolean {
  const departments = new Map(sessions.map((row) => [row.session_id.toLowerCase(), row.department_id.toLowerCase()]));
  return approvals.every((row) => departments.get(row.session_id.toLowerCase()) === row.department_id.toLowerCase());
}
