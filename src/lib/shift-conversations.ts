import { parseBusinessId } from "./business-selection.ts";
import { parseBusinessVenueContext, singleFormString } from "./form-data.ts";

export type ShiftConversationContext = {
  conversation_id: string | null;
  shift_id: string;
  department_id: string;
  employee_id: string;
  participant_user_id: string | null;
  employee_name: string;
  department_name: string;
  role_title: string;
  starts_at: string;
  ends_at: string;
  shift_updated_at: string;
  can_reply: boolean;
};

export type ShiftConversationSummary = {
  conversation_id: string;
  shift_id: string;
  employee_name: string;
  department_name: string;
  role_title: string;
  starts_at: string;
  last_sent_at: string;
  message_count: number;
};

export type ShiftConversationMessage = {
  message_id: string;
  sequence_id: number;
  sender_kind: "manager" | "employee";
  is_mine: boolean;
  body: string;
  sent_at: string;
};

const isId = (value: unknown): value is string => typeof parseBusinessId(value) === "string";
const isTime = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function shiftConversationHref(
  businessId: string, venueId: string, target: { shiftId?: string; conversationId?: string } = {},
) {
  const params = new URLSearchParams({ business: businessId, venue: venueId });
  if (target.shiftId) params.set("shift", target.shiftId);
  if (target.conversationId) params.set("conversation", target.conversationId);
  return `/shift-conversations?${params}`;
}

export function parseConversationContext(value: unknown): ShiftConversationContext | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  if (!(row.conversation_id === null || isId(row.conversation_id)) ||
    !isId(row.shift_id) || !isId(row.department_id) || !isId(row.employee_id) ||
    !(row.participant_user_id === null || isId(row.participant_user_id)) ||
    typeof row.employee_name !== "string" || typeof row.department_name !== "string" ||
    typeof row.role_title !== "string" || !isTime(row.starts_at) || !isTime(row.ends_at) ||
    !isTime(row.shift_updated_at) || typeof row.can_reply !== "boolean" ||
    (row.can_reply && !row.participant_user_id) || (row.conversation_id && !row.participant_user_id)) return null;
  return {
    conversation_id: row.conversation_id, shift_id: row.shift_id, department_id: row.department_id,
    employee_id: row.employee_id,
    participant_user_id: row.participant_user_id, employee_name: row.employee_name,
    department_name: row.department_name, role_title: row.role_title,
    starts_at: row.starts_at, ends_at: row.ends_at, shift_updated_at: row.shift_updated_at,
    can_reply: row.can_reply,
  };
}

export function parseConversationSummaries(value: unknown): ShiftConversationSummary[] | null {
  if (!Array.isArray(value)) return null;
  const result: ShiftConversationSummary[] = [];
  const ids = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isId(row.conversation_id) || ids.has(row.conversation_id) ||
      !isId(row.shift_id) || typeof row.employee_name !== "string" ||
      typeof row.department_name !== "string" || typeof row.role_title !== "string" ||
      !isTime(row.starts_at) || !isTime(row.last_sent_at) ||
      typeof row.message_count !== "number" || !Number.isSafeInteger(row.message_count) ||
      row.message_count < 1) return null;
    ids.add(row.conversation_id);
    result.push({
      conversation_id: row.conversation_id, shift_id: row.shift_id, employee_name: row.employee_name,
      department_name: row.department_name, role_title: row.role_title, starts_at: row.starts_at,
      last_sent_at: row.last_sent_at, message_count: row.message_count,
    });
  }
  return result;
}

export function parseConversationMessages(value: unknown): ShiftConversationMessage[] | null {
  if (!Array.isArray(value)) return null;
  const result: ShiftConversationMessage[] = [];
  const ids = new Set<string>();
  let previous = 0;
  for (const row of value) {
    if (!isRecord(row) || !isId(row.message_id) || ids.has(row.message_id) ||
      typeof row.sequence_id !== "number" || !Number.isSafeInteger(row.sequence_id) ||
      row.sequence_id <= previous || (row.sender_kind !== "manager" && row.sender_kind !== "employee") ||
      typeof row.is_mine !== "boolean" || typeof row.body !== "string" ||
      !row.body || Array.from(row.body).length > 2000 || !isTime(row.sent_at)) return null;
    ids.add(row.message_id);
    previous = row.sequence_id;
    result.push({
      message_id: row.message_id, sequence_id: row.sequence_id, sender_kind: row.sender_kind,
      is_mine: row.is_mine, body: row.body, sent_at: row.sent_at,
    });
  }
  return result;
}

export function parseShiftMessageInput(formData: FormData) {
  const context = parseBusinessVenueContext(formData);
  const shiftId = parseBusinessId(singleFormString(formData, "shift_id"));
  const departmentId = parseBusinessId(singleFormString(formData, "department_id"));
  const employeeId = parseBusinessId(singleFormString(formData, "employee_id"));
  const participantId = parseBusinessId(singleFormString(formData, "participant_user_id"));
  const requestId = parseBusinessId(singleFormString(formData, "request_id"));
  const updatedAt = singleFormString(formData, "shift_updated_at");
  const rawBody = singleFormString(formData, "body");
  const body = rawBody?.trim();
  if (!context || !shiftId || !departmentId || !employeeId || !participantId || !requestId ||
    !isTime(updatedAt) || !body || Array.from(body).length > 2000) return null;
  return { ...context, shiftId, departmentId, employeeId, participantId, requestId, updatedAt, body };
}
