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
  event_type: OfflineEventType;
  claimed_at: string;
  received_at: string;
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
      !isUuid(row.department_id) || typeof row.employee_name !== "string" ||
      !row.employee_name.trim() || typeof row.department_name !== "string" ||
      !row.department_name.trim() || !isEventType(row.event_type) ||
      !isTimestamp(row.claimed_at) || !isTimestamp(row.received_at)) return null;
    const key = row.id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({
      id: row.id, employee_id: row.employee_id, employee_name: row.employee_name,
      department_id: row.department_id, department_name: row.department_name,
      event_type: row.event_type, claimed_at: row.claimed_at, received_at: row.received_at,
    });
  }
  return rows;
}
