const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OfflineEventType = "clock_in" | "clock_out";
export type OfflineAttendanceClaim = {
  requestId: string;
  actorId: string;
  businessId: string;
  venueId: string;
  departmentId: string;
  employeeId: string;
  eventType: OfflineEventType;
  claimedAt: string;
};
export type SubmittedOfflineClaim = {
  id: string;
  employee_id: string;
  employee_name: string;
  department_id: string;
  department_name: string;
  actor_id: string;
  event_type: OfflineEventType;
  claimed_at: string;
  received_at: string;
};
export type OfflineClaimReview = {
  id: string;
  sequence: number;
  claim_id: string;
  actor_id: string;
  decision: "matched" | "corrected" | "rejected" | "reopened" | "created";
  session_id: string | null;
  event_id: string | null;
  old_at: string | null;
  correction_id: string | null;
  reason: string;
  created_at: string;
};
export type OfflineMatchEvent = {
  event_id: string;
  session_id: string;
  employee_id: string;
  department_id: string;
  actor_id: string;
  event_type: OfflineEventType;
  effective_at: string;
  locked: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isEventType(value: unknown): value is OfflineEventType {
  return value === "clock_in" || value === "clock_out";
}

export function parseOfflineAttendanceClaim(value: unknown): OfflineAttendanceClaim | null {
  if (!isRecord(value) || !isUuid(value.requestId) || !isUuid(value.actorId) ||
    !isUuid(value.businessId) || !isUuid(value.venueId) || !isUuid(value.departmentId) ||
    !isUuid(value.employeeId) || !isEventType(value.eventType) || !isTimestamp(value.claimedAt)) {
    return null;
  }
  return {
    requestId: value.requestId, actorId: value.actorId, businessId: value.businessId,
    venueId: value.venueId, departmentId: value.departmentId, employeeId: value.employeeId,
    eventType: value.eventType, claimedAt: value.claimedAt,
  };
}

export function parseOfflineClaimReceipt(value: unknown): { id: string; receivedAt: string } | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0]) ||
    !isUuid(value[0].claim_id) || !isTimestamp(value[0].received_at)) return null;
  return { id: value[0].claim_id, receivedAt: value[0].received_at };
}

export function parseSubmittedOfflineClaims(value: unknown): SubmittedOfflineClaim[] | null {
  if (!Array.isArray(value)) return null;
  const rows: SubmittedOfflineClaim[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.id) || !isUuid(row.employee_id) ||
      !isUuid(row.department_id) || !isUuid(row.actor_id) || typeof row.employee_name !== "string" ||
      !row.employee_name.trim() || typeof row.department_name !== "string" ||
      !row.department_name.trim() || !isEventType(row.event_type) ||
      !isTimestamp(row.claimed_at) || !isTimestamp(row.received_at)) return null;
    const key = row.id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({
      id: row.id, employee_id: row.employee_id, employee_name: row.employee_name,
      department_id: row.department_id, department_name: row.department_name,
      actor_id: row.actor_id, event_type: row.event_type, claimed_at: row.claimed_at, received_at: row.received_at,
    });
  }
  return rows;
}

export function parseOfflineClaimReviews(value: unknown): OfflineClaimReview[] | null {
  if (!Array.isArray(value)) return null;
  const rows: OfflineClaimReview[] = [];
  const seen = new Set<string>();
  const sequences = new Set<number>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.id) || !isUuid(row.claim_id) || !isUuid(row.actor_id) ||
      typeof row.sequence !== "number" || !Number.isSafeInteger(row.sequence) || row.sequence < 1 ||
      (row.decision !== "matched" && row.decision !== "corrected" &&
        row.decision !== "rejected" && row.decision !== "reopened" && row.decision !== "created") ||
      typeof row.reason !== "string" || !row.reason.trim() || !isTimestamp(row.created_at)) return null;
    if (row.correction_id !== null && !isUuid(row.correction_id)) return null;
    if (row.decision === "matched" || row.decision === "corrected") {
      if (!isUuid(row.session_id) || !isUuid(row.event_id) || !isTimestamp(row.old_at) ||
        (row.decision === "matched" ? row.correction_id !== null : row.correction_id === null)) return null;
    } else if (row.decision === "created") {
      if (!isUuid(row.session_id) || !isUuid(row.event_id) || row.old_at !== null ||
        row.correction_id !== null) return null;
    } else if (row.session_id !== null || row.event_id !== null || row.old_at !== null ||
      row.correction_id !== null) return null;
    const key = row.id.toLowerCase();
    if (seen.has(key) || sequences.has(row.sequence)) return null;
    seen.add(key);
    sequences.add(row.sequence);
    rows.push({
      id: row.id, sequence: row.sequence, claim_id: row.claim_id, actor_id: row.actor_id,
      decision: row.decision, session_id: row.session_id, event_id: row.event_id,
      old_at: row.old_at, correction_id: row.correction_id, reason: row.reason, created_at: row.created_at,
    });
  }
  return rows.sort((a, b) => b.sequence - a.sequence);
}

export function parseOfflineMatchEvents(value: unknown): OfflineMatchEvent[] | null {
  if (!Array.isArray(value)) return null;
  const rows: OfflineMatchEvent[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.event_id) || !isUuid(row.session_id) || !isUuid(row.employee_id) ||
      !isUuid(row.department_id) || !isUuid(row.actor_id) || !isEventType(row.event_type) ||
      !isTimestamp(row.effective_at) || typeof row.locked !== "boolean") return null;
    const key = row.event_id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({
      event_id: row.event_id, session_id: row.session_id, employee_id: row.employee_id,
      department_id: row.department_id, actor_id: row.actor_id, event_type: row.event_type,
      effective_at: row.effective_at, locked: row.locked,
    });
  }
  return rows;
}

export function parseOfflineMatchOption(value: unknown): { eventId: string; expectedAt: string } | null {
  if (typeof value !== "string") return null;
  const parts = value.split("|");
  if (parts.length !== 2 || !isUuid(parts[0]) || !isTimestamp(parts[1])) return null;
  return { eventId: parts[0], expectedAt: parts[1] };
}

export function offlineWorkerKey(value: {
  employee_id: string; department_id: string; actor_id: string;
}): string {
  return `${value.employee_id}:${value.department_id}:${value.actor_id}`.toLowerCase();
}

export function offlineMatchKey(value: {
  employee_id: string; department_id: string; actor_id: string; event_type: OfflineEventType;
}): string {
  return `${offlineWorkerKey(value)}:${value.event_type}`;
}
