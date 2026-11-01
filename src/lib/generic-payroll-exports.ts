import { Temporal } from "@js-temporal/polyfill";
import {
  PayrollRecordValidationError, validateCanonicalPayrollRecord, validateCanonicalPayrollRows,
  type CanonicalPayrollRecord, type CanonicalPayrollScope,
} from "./canonical-payroll.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const secondsPattern = /^(0|[1-9]\d{0,14})(?:\.(\d{1,6}))?$/;
const formulaPrefix = /^(?:[\s\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]*[=+\-@]|[\t\r\n])/u;

export type GenericPayrollBatch = Readonly<{
  id: string;
  weekStart: string;
  finalisationId: string;
  sessionCount: number;
  createdAt: string;
}>;

export type GenericPayrollEntry = Readonly<{
  employeeName: string;
  record: CanonicalPayrollRecord;
}>;

export type GenericPayrollReview = Readonly<{
  reviewHash: string;
  newCount: number;
  changes: readonly Readonly<{
    sessionId: string;
    employeeName: string;
    previous: CanonicalPayrollRecord | null;
    current: CanonicalPayrollRecord | null;
  }>[];
}>;

export type GenericPayrollHistoryEvent = Readonly<{
  id: string;
  kind: "batch" | "reconciliation";
  finalisationId: string;
  actorRole: "owner" | "admin" | "general_manager";
  actorIsSelf: boolean;
  entryCount: number;
  reason: string | null;
  createdAt: string;
}>;

export type GenericPayrollHistoryEntry = Readonly<{
  eventId: string;
  kind: "batch" | "reconciliation";
  sessionId: string;
  employeeName: string;
  previous: CanonicalPayrollRecord | null;
  current: CanonicalPayrollRecord | null;
}>;

function invalid(path: string, message: string): never {
  throw new PayrollRecordValidationError(`${path}: ${message}`);
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid(path, "expected an object");
  }
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key))) {
    return invalid(path, "missing or unexpected fields");
  }
  return row;
}

export function isPayrollUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

function identifier(value: unknown, path: string): string {
  return isPayrollUuid(value) ? value : invalid(path, "expected a UUID");
}

function count(value: unknown, path: string, minimum: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
    ? value : invalid(path, "expected a valid count");
}

function name(value: unknown, path: string): string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512
    ? value : invalid(path, "expected an employee name");
}

function instant(value: unknown, path: string): string {
  if (typeof value !== "string") return invalid(path, "expected an instant");
  try {
    Temporal.Instant.from(value);
    return value;
  } catch (error) {
    if (error instanceof RangeError) return invalid(path, "expected an instant");
    throw error;
  }
}

function monday(value: unknown, path: string): string {
  if (typeof value !== "string" || !datePattern.test(value) || value.startsWith("0000-")) {
    return invalid(path, "expected a Monday date");
  }
  try {
    if (Temporal.PlainDate.from(value, { overflow: "reject" }).dayOfWeek !== 1) {
      return invalid(path, "expected a Monday date");
    }
    return value;
  } catch (error) {
    if (error instanceof RangeError) return invalid(path, "expected a Monday date");
    throw error;
  }
}

function samePayrollFacts(first: CanonicalPayrollRecord, second: CanonicalPayrollRecord): boolean {
  return JSON.stringify({ ...first, period: null, approval: null }) ===
    JSON.stringify({ ...second, period: null, approval: null });
}

export function validateGenericPayrollBatch(value: unknown, batchId: string): GenericPayrollBatch {
  if (!Array.isArray(value) || value.length !== 1) return invalid("batch", "expected one batch");
  const row = object(value[0], "batch", [
    "batch_id", "week_start", "finalisation_id", "session_count", "created_at",
  ]);
  const id = identifier(row.batch_id, "batch.batch_id");
  if (!isPayrollUuid(batchId) || id.toLowerCase() !== batchId.toLowerCase()) {
    return invalid("batch.batch_id", "batch identity does not match");
  }
  return {
    id, weekStart: monday(row.week_start, "batch.week_start"),
    finalisationId: identifier(row.finalisation_id, "batch.finalisation_id"),
    sessionCount: count(row.session_count, "batch.session_count", 1),
    createdAt: instant(row.created_at, "batch.created_at"),
  };
}

export function validateGenericPayrollEntries(
  value: unknown, scope: CanonicalPayrollScope,
): readonly GenericPayrollEntry[] {
  if (!Array.isArray(value)) return invalid("entries", "expected an array");
  const rows = value.map((item, index) => {
    const row = object(item, `entries[${index}]`, ["session_id", "employee_name", "record"]);
    return {
      sessionId: identifier(row.session_id, `entries[${index}].session_id`),
      employeeName: name(row.employee_name, `entries[${index}].employee_name`),
      record: row.record,
    };
  });
  const records = validateCanonicalPayrollRows(rows.map((row) => ({
    session_id: row.sessionId, record: row.record,
  })), scope);
  return rows.map((row, index) => ({ employeeName: row.employeeName, record: records[index] }));
}

export function validateGenericPayrollReview(
  value: unknown, scope: CanonicalPayrollScope, currentRecords: readonly CanonicalPayrollRecord[],
): GenericPayrollReview {
  const row = object(value, "review", ["reviewHash", "newCount", "changes"]);
  if (typeof row.reviewHash !== "string" || !/^[0-9a-f]{64}$/.test(row.reviewHash)) {
    return invalid("review.reviewHash", "expected a review hash");
  }
  const newCount = count(row.newCount, "review.newCount", 0);
  if (newCount > scope.sessionCount || !Array.isArray(row.changes)) {
    return invalid("review", "invalid entry counts");
  }
  const currentBySession = new Map(currentRecords.map((record) => [record.sessionId.toLowerCase(), record]));
  if (currentRecords.length !== scope.sessionCount || currentBySession.size !== currentRecords.length) {
    return invalid("review", "the current finalisation is incomplete");
  }
  const seen = new Set<string>();
  const changes = row.changes.map((item, index) => {
    const path = `review.changes[${index}]`;
    const change = object(item, path, ["sessionId", "employeeName", "previous", "current"]);
    const sessionId = identifier(change.sessionId, `${path}.sessionId`);
    const key = sessionId.toLowerCase();
    if (seen.has(key)) return invalid(path, "duplicate session");
    seen.add(key);
    const previous = change.previous === null ? null : validateCanonicalPayrollRecord(change.previous);
    const current = change.current === null ? null : validateCanonicalPayrollRecord(change.current);
    if (!previous && !current) return invalid(path, "both records are missing");
    for (const record of [previous, current]) {
      if (record && (record.sessionId.toLowerCase() !== key ||
        record.businessId.toLowerCase() !== scope.businessId.toLowerCase() ||
        record.venue.id.toLowerCase() !== scope.venueId.toLowerCase())) {
        return invalid(path, "record identity or scope is inconsistent");
      }
    }
    if (current && (current.period.weekStart !== scope.weekStart ||
      current.period.finalisationId.toLowerCase() !== scope.finalisationId.toLowerCase())) {
      return invalid(path, "current record belongs to a different finalisation");
    }
    if (current && JSON.stringify(current) !== JSON.stringify(currentBySession.get(key))) {
      return invalid(path, "current record does not match the finalised snapshot");
    }
    if (!current && previous?.period.weekStart !== scope.weekStart) {
      return invalid(path, "removed record belongs to a different week");
    }
    if (previous && current && samePayrollFacts(previous, current)) {
      return invalid(path, "payroll facts have not changed");
    }
    return { sessionId, employeeName: name(change.employeeName, `${path}.employeeName`), previous, current };
  });
  if (newCount + changes.filter((change) => change.current !== null).length > scope.sessionCount) {
    return invalid("review", "invalid entry counts");
  }
  return { reviewHash: row.reviewHash, newCount, changes };
}

export function validateGenericPayrollHistory(value: unknown): readonly GenericPayrollHistoryEvent[] {
  if (!Array.isArray(value)) return invalid("history", "expected an array");
  const seen = new Set<string>();
  return value.map((item, index) => {
    const path = `history[${index}]`;
    const row = object(item, path, [
      "id", "kind", "finalisation_id", "actor_role", "actor_is_self", "entry_count", "reason", "created_at",
    ]);
    const id = identifier(row.id, `${path}.id`);
    if (seen.has(id.toLowerCase())) return invalid(path, "duplicate event");
    seen.add(id.toLowerCase());
    if ((row.kind !== "batch" && row.kind !== "reconciliation") ||
      (row.actor_role !== "owner" && row.actor_role !== "admin" && row.actor_role !== "general_manager") ||
      typeof row.actor_is_self !== "boolean" ||
      (row.kind === "batch" ? row.reason !== null
        : typeof row.reason !== "string" || row.reason.trim().length === 0 || row.reason.length > 500)) {
      return invalid(path, "invalid audit event");
    }
    return {
      id, kind: row.kind, finalisationId: identifier(row.finalisation_id, `${path}.finalisation_id`),
      actorRole: row.actor_role, actorIsSelf: row.actor_is_self,
      entryCount: count(row.entry_count, `${path}.entry_count`, 1),
      reason: row.reason as string | null, createdAt: instant(row.created_at, `${path}.created_at`),
    };
  });
}

export function validateGenericPayrollHistoryEntries(
  value: unknown, events: readonly GenericPayrollHistoryEvent[],
  scope: Pick<CanonicalPayrollScope, "businessId" | "venueId" | "weekStart">,
): readonly GenericPayrollHistoryEntry[] {
  if (!Array.isArray(value)) return invalid("historyEntries", "expected an array");
  monday(scope.weekStart, "historyEntries.weekStart");
  const byId = new Map(events.map((event) => [event.id.toLowerCase(), event]));
  if (byId.size !== events.length) return invalid("historyEntries", "duplicate history event");
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const entries = value.map((item, index) => {
    const path = `historyEntries[${index}]`;
    const row = object(item, path, [
      "event_id", "kind", "session_id", "employee_name", "previous_record", "current_record",
    ]);
    const eventId = identifier(row.event_id, `${path}.event_id`);
    const sessionId = identifier(row.session_id, `${path}.session_id`);
    const eventKey = eventId.toLowerCase();
    const event = byId.get(eventKey);
    const key = `${eventKey}:${sessionId.toLowerCase()}`;
    if (!event || row.kind !== event.kind || seen.has(key)) {
      return invalid(path, "event identity, kind or session is inconsistent");
    }
    seen.add(key);
    counts.set(eventKey, (counts.get(eventKey) ?? 0) + 1);
    const previous = row.previous_record === null ? null : validateCanonicalPayrollRecord(row.previous_record);
    const current = row.current_record === null ? null : validateCanonicalPayrollRecord(row.current_record);
    if ((!previous && !current) || (event.kind === "batch" && (previous !== null || current === null))) {
      return invalid(path, "audit records are incomplete");
    }
    for (const record of [previous, current]) {
      if (record && (record.sessionId.toLowerCase() !== sessionId.toLowerCase() ||
        record.businessId.toLowerCase() !== scope.businessId.toLowerCase() ||
        record.venue.id.toLowerCase() !== scope.venueId.toLowerCase())) {
        return invalid(path, "record identity or scope is inconsistent");
      }
    }
    if (current && (current.period.weekStart !== scope.weekStart ||
      current.period.finalisationId.toLowerCase() !== event.finalisationId.toLowerCase())) {
      return invalid(path, "record belongs to a different finalisation");
    }
    if (!current && previous?.period.weekStart !== scope.weekStart) {
      return invalid(path, "removed record belongs to a different week");
    }
    if (previous && current && samePayrollFacts(previous, current)) {
      return invalid(path, "payroll facts have not changed");
    }
    return {
      eventId, kind: event.kind, sessionId, employeeName: name(row.employee_name, `${path}.employee_name`),
      previous, current,
    };
  });
  if (events.some((event) => counts.get(event.id.toLowerCase()) !== event.entryCount)) {
    return invalid("historyEntries", "audit entry counts do not match history");
  }
  return entries;
}

export function decimalHours(seconds: string): string {
  const matched = secondsPattern.exec(seconds);
  if (!matched) return invalid("seconds", "expected non-negative exact decimal seconds");
  const micros = BigInt(matched[1]) * BigInt(1_000_000) + BigInt((matched[2] ?? "").padEnd(6, "0"));
  const millionths = (micros + BigInt(1800)) / BigInt(3600);
  return `${millionths / BigInt(1_000_000)}.${String(millionths % BigInt(1_000_000)).padStart(6, "0")}`;
}

export function payrollCsvCell(value: string): string {
  const safe = formulaPrefix.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function genericPayrollCsv(batchId: string, entries: readonly GenericPayrollEntry[]): string {
  identifier(batchId, "batchId");
  const headers = [
    "batch_id", "finalisation_id", "payroll_version", "business_id", "venue_id", "department_id",
    "employee_id", "employee_name", "session_id", "work_date", "venue_timezone", "clock_in_utc", "clock_out_utc",
    "elapsed_seconds", "worked_seconds", "paid_seconds", "paid_break_seconds", "unpaid_break_seconds",
    "worked_hours", "paid_hours", "approval_id", "approval_revision",
  ];
  const lines = entries.map(({ employeeName, record }) => [
    batchId, record.period.finalisationId, record.period.version, record.businessId, record.venue.id,
    record.venue.departmentId, record.worker.employeeId, employeeName, record.sessionId, record.workDate,
    record.venue.timezone, record.attendance.clockInAt, record.attendance.clockOutAt, record.hours.elapsed,
    record.hours.worked, record.hours.paid, record.hours.paidBreak, record.hours.unpaidBreak,
    decimalHours(record.hours.worked), decimalHours(record.hours.paid), record.approval.decisionId,
    record.approval.revision,
  ].map(payrollCsvCell).join(","));
  return `\uFEFF${[headers.map(payrollCsvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
