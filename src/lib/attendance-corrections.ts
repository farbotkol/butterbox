import { Temporal } from "@js-temporal/polyfill";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const localTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/;
const eventTypes = ["clock_in", "clock_out", "break_start", "break_end"] as const;

export type CorrectionEventType = typeof eventTypes[number];
export type CorrectionEvent = {
  event_id: string;
  session_id: string;
  event_type: CorrectionEventType;
  classification: "paid" | "unpaid" | null;
  original_at: string;
  effective_at: string;
  finished: boolean;
  locked: boolean;
};
export type AttendanceCorrection = {
  id: string;
  sequence: number;
  session_id: string;
  event_id: string;
  event_type: CorrectionEventType;
  employee_name: string;
  department_name: string;
  original_at: string;
  old_at: string;
  new_at: string;
  reason: string;
  actor_id: string;
  created_at: string;
};
export type AttendanceEditLock = {
  id: string;
  sequence: number;
  session_id: string;
  locked: boolean;
  reason: string;
  actor_id: string;
  created_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

export function isCorrectionTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isEventType(value: unknown): value is CorrectionEventType {
  return typeof value === "string" && eventTypes.some((type) => type === value);
}

export const correctionEventLabels: Record<CorrectionEventType, string> = {
  clock_in: "Clock in",
  clock_out: "Clock out",
  break_start: "Break start",
  break_end: "Break end",
};

export function parseCorrectionEvents(value: unknown): CorrectionEvent[] | null {
  if (!Array.isArray(value)) return null;
  const rows: CorrectionEvent[] = [];
  const seen = new Set<string>();
  const sessions = new Map<string, { finished: boolean; locked: boolean }>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.event_id) || !isUuid(row.session_id) ||
      !isEventType(row.event_type) || !isCorrectionTimestamp(row.original_at) ||
      !isCorrectionTimestamp(row.effective_at) || typeof row.finished !== "boolean" ||
      typeof row.locked !== "boolean") return null;
    const isBreak = row.event_type === "break_start" || row.event_type === "break_end";
    const classification = row.classification;
    if ((classification !== null && classification !== "paid" && classification !== "unpaid") ||
      (isBreak ? classification === null : classification !== null)) {
      return null;
    }
    const eventKey = row.event_id.toLowerCase();
    const sessionKey = row.session_id.toLowerCase();
    const previous = sessions.get(sessionKey);
    if (seen.has(eventKey) ||
      (previous && (previous.finished !== row.finished || previous.locked !== row.locked))) return null;
    seen.add(eventKey);
    sessions.set(sessionKey, { finished: row.finished, locked: row.locked });
    rows.push({
      event_id: row.event_id, session_id: row.session_id, event_type: row.event_type,
      classification, original_at: row.original_at, effective_at: row.effective_at,
      finished: row.finished, locked: row.locked,
    });
  }
  return rows;
}

export function parseAttendanceCorrections(value: unknown): AttendanceCorrection[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AttendanceCorrection[] = [];
  const seen = new Set<string>();
  const sequences = new Set<number>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.id) || !isSequence(row.sequence) ||
      !isUuid(row.session_id) || !isUuid(row.event_id) ||
      !isUuid(row.actor_id) || !isEventType(row.event_type) || !isText(row.employee_name) ||
      !isText(row.department_name) || !isText(row.reason) ||
      !isCorrectionTimestamp(row.original_at) || !isCorrectionTimestamp(row.old_at) ||
      !isCorrectionTimestamp(row.new_at) || !isCorrectionTimestamp(row.created_at)) return null;
    const key = row.id.toLowerCase();
    if (seen.has(key) || sequences.has(row.sequence)) return null;
    seen.add(key);
    sequences.add(row.sequence);
    rows.push({
      id: row.id, sequence: row.sequence, session_id: row.session_id, event_id: row.event_id, event_type: row.event_type,
      employee_name: row.employee_name, department_name: row.department_name, original_at: row.original_at,
      old_at: row.old_at, new_at: row.new_at, reason: row.reason, actor_id: row.actor_id, created_at: row.created_at,
    });
  }
  return rows.sort((a, b) => b.sequence - a.sequence);
}

export function parseAttendanceEditLocks(value: unknown): AttendanceEditLock[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AttendanceEditLock[] = [];
  const seen = new Set<string>();
  const sequences = new Set<number>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.id) || !isSequence(row.sequence) || !isUuid(row.session_id) ||
      typeof row.locked !== "boolean" || !isText(row.reason) || !isUuid(row.actor_id) ||
      !isCorrectionTimestamp(row.created_at)) return null;
    const key = row.id.toLowerCase();
    if (seen.has(key) || sequences.has(row.sequence)) return null;
    seen.add(key);
    sequences.add(row.sequence);
    rows.push({
      id: row.id, sequence: row.sequence, session_id: row.session_id, locked: row.locked,
      reason: row.reason, actor_id: row.actor_id, created_at: row.created_at,
    });
  }
  return rows.sort((a, b) => b.sequence - a.sequence);
}

export function correctionLocalWithMicroseconds(local: unknown, microseconds: unknown): string | null {
  if (typeof local !== "string" || !localTimestamp.test(local) || typeof microseconds !== "string") return null;
  if (microseconds === "") return local;
  if (!/^\d{1,3}$/.test(microseconds)) return null;
  const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(local);
  if (!parts) return null;
  return `${parts[1]}:${parts[2] ?? "00"}.${(parts[3] ?? "").padEnd(3, "0")}${microseconds.padStart(3, "0")}`;
}

export function correctionInstant(
  local: unknown, timezone: string, occurrence: unknown,
): { status: "ok"; value: string } | { status: "invalid" | "nonexistent" | "ambiguous" } {
  if (typeof local !== "string" || !localTimestamp.test(local) ||
    (occurrence !== "" && occurrence !== "earlier" && occurrence !== "later")) return { status: "invalid" };
  try {
    const date = Temporal.PlainDateTime.from(local);
    const earlier = date.toZonedDateTime(timezone, { disambiguation: "earlier" });
    const later = date.toZonedDateTime(timezone, { disambiguation: "later" });
    if (!earlier.toPlainDateTime().equals(date) || !later.toPlainDateTime().equals(date)) {
      return { status: "nonexistent" };
    }
    if (Temporal.Instant.compare(earlier.toInstant(), later.toInstant()) !== 0 && occurrence === "") {
      return { status: "ambiguous" };
    }
    return { status: "ok", value: (occurrence === "later" ? later : earlier).toInstant().toString() };
  } catch (error) {
    if (error instanceof RangeError) return { status: "invalid" };
    throw error;
  }
}
