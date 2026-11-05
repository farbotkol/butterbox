const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = [
  "pending_recipient", "pending_requester", "pending_manager",
  "approved", "rejected", "declined", "withdrawn",
] as const;
const EVENTS = ["requested", "proposed", "review", "approved", "rejected", "declined", "withdrawn"] as const;

export type ShiftSwapStatus = typeof STATUSES[number];
export type ShiftSwapEvent = typeof EVENTS[number];
export type ShiftSwap = {
  swap_id: string;
  status: ShiftSwapStatus;
  department_id: string;
  department_name: string;
  requester_name: string;
  recipient_name: string;
  requester_shift_id: string;
  requester_role: string;
  requester_starts_at: string;
  requester_ends_at: string;
  recipient_shift_id: string | null;
  recipient_role: string | null;
  recipient_starts_at: string | null;
  recipient_ends_at: string | null;
  requested_at: string;
  review_reason: string | null;
  snapshots_current: boolean;
  is_requester: boolean;
  is_recipient: boolean;
  can_manage: boolean;
};
export type SwapShift = {
  shift_id: string;
  employee_id: string;
  department_id: string;
  department_name: string;
  role_title: string;
  starts_at: string;
  ends_at: string;
};
export type SwapColleague = {
  own_employee_id: string;
  department_id: string;
  employee_id: string;
  employee_name: string;
};
export type SwapRecipient = { swap_id: string; employee_id: string };
export type SwapNotification = {
  notification_id: string;
  swap_id: string;
  event_type: ShiftSwapEvent;
  created_at: string;
  unread: boolean;
  requester_name: string;
  recipient_name: string;
};

export const swapStatusLabels: Record<ShiftSwapStatus, string> = {
  pending_recipient: "Awaiting colleague response",
  pending_requester: "Awaiting requester confirmation",
  pending_manager: "Awaiting manager review",
  approved: "Approved",
  rejected: "Rejected",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export function isSwapUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.some((option) => option === value);
}

function parseRows<T>(
  data: unknown,
  parse: (value: unknown) => T | null,
  key: (value: T) => string,
): T[] | null {
  if (!Array.isArray(data)) return null;
  const rows: T[] = [];
  const seen = new Set<string>();
  for (const value of data) {
    const row = parse(value);
    if (!row || seen.has(key(row))) return null;
    seen.add(key(row));
    rows.push(row);
  }
  return rows;
}

export function parseShiftSwaps(data: unknown): ShiftSwap[] | null {
  return parseRows(data, (row) => {
    if (!isRecord(row) || !isSwapUuid(row.swap_id) || !isOneOf(row.status, STATUSES) ||
      !isSwapUuid(row.department_id) || typeof row.department_name !== "string" ||
      typeof row.requester_name !== "string" || typeof row.recipient_name !== "string" ||
      !isSwapUuid(row.requester_shift_id) || typeof row.requester_role !== "string" ||
      !isTime(row.requester_starts_at) || !isTime(row.requester_ends_at) ||
      !isTime(row.requested_at) || (row.review_reason !== null && typeof row.review_reason !== "string") ||
      typeof row.snapshots_current !== "boolean" || typeof row.is_requester !== "boolean" ||
      typeof row.is_recipient !== "boolean" || typeof row.can_manage !== "boolean") return null;

    const proposed = row.recipient_shift_id === null
      ? row.recipient_role === null && row.recipient_starts_at === null && row.recipient_ends_at === null
      : isSwapUuid(row.recipient_shift_id) && typeof row.recipient_role === "string" &&
        isTime(row.recipient_starts_at) && isTime(row.recipient_ends_at);
    if (!proposed) return null;

    return {
      swap_id: row.swap_id, status: row.status,
      department_id: row.department_id, department_name: row.department_name,
      requester_name: row.requester_name, recipient_name: row.recipient_name,
      requester_shift_id: row.requester_shift_id, requester_role: row.requester_role,
      requester_starts_at: row.requester_starts_at, requester_ends_at: row.requester_ends_at,
      recipient_shift_id: isSwapUuid(row.recipient_shift_id) ? row.recipient_shift_id : null,
      recipient_role: typeof row.recipient_role === "string" ? row.recipient_role : null,
      recipient_starts_at: isTime(row.recipient_starts_at) ? row.recipient_starts_at : null,
      recipient_ends_at: isTime(row.recipient_ends_at) ? row.recipient_ends_at : null,
      requested_at: row.requested_at, review_reason: row.review_reason,
      snapshots_current: row.snapshots_current, is_requester: row.is_requester,
      is_recipient: row.is_recipient, can_manage: row.can_manage,
    };
  }, (row) => row.swap_id);
}

export function parseSwapShifts(data: unknown): SwapShift[] | null {
  return parseRows(data, (row) => {
    if (!isRecord(row) || !isSwapUuid(row.shift_id) || !isSwapUuid(row.employee_id) ||
      !isSwapUuid(row.department_id) || typeof row.department_name !== "string" ||
      typeof row.role_title !== "string" || !isTime(row.starts_at) || !isTime(row.ends_at)) return null;
    return {
      shift_id: row.shift_id, employee_id: row.employee_id, department_id: row.department_id,
      department_name: row.department_name, role_title: row.role_title,
      starts_at: row.starts_at, ends_at: row.ends_at,
    };
  }, (row) => row.shift_id);
}

export function parseSwapColleagues(data: unknown): SwapColleague[] | null {
  return parseRows(data, (row) => {
    if (!isRecord(row) || !isSwapUuid(row.own_employee_id) || !isSwapUuid(row.department_id) ||
      !isSwapUuid(row.employee_id) || typeof row.employee_name !== "string") return null;
    return {
      own_employee_id: row.own_employee_id, department_id: row.department_id,
      employee_id: row.employee_id, employee_name: row.employee_name,
    };
  }, (row) => `${row.own_employee_id}:${row.department_id}:${row.employee_id}`);
}

export function parseSwapRecipients(data: unknown): SwapRecipient[] | null {
  return parseRows(data, (row) => {
    if (!isRecord(row) || !isSwapUuid(row.swap_id) || !isSwapUuid(row.employee_id)) return null;
    return { swap_id: row.swap_id, employee_id: row.employee_id };
  }, (row) => row.swap_id);
}

export function parseSwapNotifications(data: unknown): SwapNotification[] | null {
  return parseRows(data, (row) => {
    if (!isRecord(row) || !isSwapUuid(row.notification_id) || !isSwapUuid(row.swap_id) ||
      !isOneOf(row.event_type, EVENTS) || !isTime(row.created_at) || typeof row.unread !== "boolean" ||
      typeof row.requester_name !== "string" || typeof row.recipient_name !== "string") return null;
    return {
      notification_id: row.notification_id, swap_id: row.swap_id, event_type: row.event_type,
      created_at: row.created_at, unread: row.unread,
      requester_name: row.requester_name, recipient_name: row.recipient_name,
    };
  }, (row) => row.notification_id);
}

export function swapNotificationMessage(notice: SwapNotification): string {
  switch (notice.event_type) {
    case "requested": return `${notice.requester_name} requested a shift swap with you.`;
    case "proposed": return `${notice.recipient_name} proposed a shift for your swap.`;
    case "review": return `${notice.requester_name} and ${notice.recipient_name} confirmed a swap for review.`;
    case "approved": return "Your shift swap was approved.";
    case "rejected": return "Your shift swap was rejected.";
    case "declined": return "Your shift swap was declined.";
    case "withdrawn": return "Your shift swap was withdrawn.";
  }
}

export function swapFailureCode(message: string | undefined): string {
  if (message === "There is already an open swap for this shift") return "duplicate";
  if (message?.includes("rejection reason")) return "reason";
  if (message?.includes("not eligible") || message?.includes("no longer eligible")) return "ineligible";
  if (message?.includes("changed") || message?.includes("started") ||
    message?.includes("no longer awaiting") || message?.includes("no longer available")) return "changed";
  if (message?.includes("permission denied") || message === "Permission denied") return "permission";
  if (message?.includes("Select one of your")) return "selection";
  return "unknown";
}
