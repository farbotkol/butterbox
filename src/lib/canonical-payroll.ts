import { Temporal } from "@js-temporal/polyfill";
import { validTimezone } from "./attendance.ts";

type ProviderMapping = Readonly<{
  provider: string;
  connectionId: string;
  externalEmployeeId: string;
}>;

type PayrollCode = Readonly<{ code: string; seconds: string }>;

type CanonicalBreak = Readonly<{
  id: string;
  classification: "paid" | "unpaid";
  startEventId: string;
  endEventId: string;
  startedAt: string;
  endedAt: string;
  seconds: string;
}>;

export type CanonicalPayrollRecord = Readonly<{
  schemaVersion: 1;
  businessId: string;
  sessionId: string;
  worker: Readonly<{ employeeId: string; providerMapping: ProviderMapping | null }>;
  venue: Readonly<{ id: string; departmentId: string; timezone: string }>;
  workDate: string;
  period: Readonly<{
    weekStart: string;
    finalisationId: string;
    version: string;
    startsAt: string;
    endsAt: string;
  }>;
  attendance: Readonly<{
    clockInEventId: string;
    clockOutEventId: string;
    clockInAt: string;
    clockOutAt: string;
  }>;
  hours: Readonly<{
    unit: "seconds";
    elapsed: string;
    worked: string;
    paid: string;
    paidBreak: string;
    unpaidBreak: string;
  }>;
  breaks: readonly CanonicalBreak[];
  payCodes: readonly PayrollCode[] | null;
  approval: Readonly<{ decisionId: string; status: "approved"; revision: string }>;
}>;

export type CanonicalPayrollScope = Readonly<{
  businessId: string;
  venueId: string;
  weekStart: string;
  finalisationId: string;
  sessionCount: number;
}>;

export class PayrollRecordValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollRecordValidationError";
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const secondsPattern = /^(0|[1-9]\d{0,14})(?:\.(\d{1,6}))?$/;
const controlCharacters = /[\u0000-\u001f\u007f]/;

function invalid(path: string, message: string): never {
  throw new PayrollRecordValidationError(`${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) {
    return invalid(path, "expected an object");
  }
  const row = value;
  const actualKeys = Object.keys(row);
  if (actualKeys.length !== keys.length || keys.some((key) => !Object.hasOwn(row, key))) {
    return invalid(path, "missing or unexpected fields");
  }
  return row;
}

function identifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !uuid.test(value)) return invalid(path, "expected a UUID");
  return value;
}

function text(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength ||
    value !== value.trim() || controlCharacters.test(value)) {
    return invalid(path, "expected non-empty text without surrounding whitespace or control characters");
  }
  return value;
}

function date(value: unknown, path: string): { value: string; date: Temporal.PlainDate } {
  if (typeof value !== "string" || !datePattern.test(value) || value.startsWith("0000-")) {
    return invalid(path, "expected a date in YYYY-MM-DD format");
  }
  try {
    return { value, date: Temporal.PlainDate.from(value, { overflow: "reject" }) };
  } catch (error) {
    if (error instanceof RangeError) return invalid(path, "invalid calendar date");
    throw error;
  }
}

function instant(value: unknown, path: string): { value: string; micros: bigint; instant: Temporal.Instant } {
  if (typeof value !== "string" || !instantPattern.test(value) || value.startsWith("0000-")) {
    return invalid(path, "expected a UTC instant with six fractional digits");
  }
  try {
    const parsed = Temporal.Instant.from(value);
    return { value, micros: parsed.epochNanoseconds / BigInt(1000), instant: parsed };
  } catch (error) {
    if (error instanceof RangeError) return invalid(path, "invalid UTC instant");
    throw error;
  }
}

function seconds(value: unknown, path: string): { value: string; micros: bigint } {
  if (typeof value !== "string") return invalid(path, "expected exact decimal seconds as text");
  const matched = secondsPattern.exec(value);
  if (!matched) return invalid(path, "expected non-negative seconds with at most six decimal places");
  return { value, micros: BigInt(matched[1]) * BigInt(1_000_000) + BigInt((matched[2] ?? "").padEnd(6, "0")) };
}

function providerMapping(value: unknown, path: string): ProviderMapping | null {
  if (value === null) return null;
  const row = object(value, path, ["provider", "connectionId", "externalEmployeeId"]);
  return Object.freeze({
    provider: text(row.provider, `${path}.provider`, 100),
    connectionId: identifier(row.connectionId, `${path}.connectionId`),
    externalEmployeeId: text(row.externalEmployeeId, `${path}.externalEmployeeId`, 255),
  });
}

function payrollCodes(value: unknown, paidMicros: bigint, path: string): readonly PayrollCode[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) return invalid(path, "expected an array or null");
  const seen = new Set<string>();
  let total = BigInt(0);
  const codes = value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const row = object(item, itemPath, ["code", "seconds"]);
    const code = text(row.code, `${itemPath}.code`, 255);
    const duration = seconds(row.seconds, `${itemPath}.seconds`);
    if (seen.has(code)) return invalid(itemPath, "duplicate pay code");
    if (duration.micros <= BigInt(0)) return invalid(itemPath, "pay code duration must be positive");
    seen.add(code);
    total += duration.micros;
    return Object.freeze({ code, seconds: duration.value });
  });
  if (total !== paidMicros) return invalid(path, "pay code durations do not match paid time");
  return Object.freeze(codes);
}

export function validateCanonicalPayrollRecord(value: unknown): CanonicalPayrollRecord {
  const row = object(value, "record", [
    "schemaVersion", "businessId", "sessionId", "worker", "venue", "workDate", "period",
    "attendance", "hours", "breaks", "payCodes", "approval",
  ]);
  if (row.schemaVersion !== 1) return invalid("record.schemaVersion", "unsupported schema version");
  const businessId = identifier(row.businessId, "record.businessId");
  const sessionId = identifier(row.sessionId, "record.sessionId");
  const worker = object(row.worker, "record.worker", ["employeeId", "providerMapping"]);
  const venue = object(row.venue, "record.venue", ["id", "departmentId", "timezone"]);
  const period = object(row.period, "record.period", ["weekStart", "finalisationId", "version", "startsAt", "endsAt"]);
  const attendance = object(row.attendance, "record.attendance", [
    "clockInEventId", "clockOutEventId", "clockInAt", "clockOutAt",
  ]);
  const hours = object(row.hours, "record.hours", ["unit", "elapsed", "worked", "paid", "paidBreak", "unpaidBreak"]);
  const approval = object(row.approval, "record.approval", ["decisionId", "status", "revision"]);

  const employeeId = identifier(worker.employeeId, "record.worker.employeeId");
  const mapping = providerMapping(worker.providerMapping, "record.worker.providerMapping");
  const venueId = identifier(venue.id, "record.venue.id");
  const departmentId = identifier(venue.departmentId, "record.venue.departmentId");
  const timezone = text(venue.timezone, "record.venue.timezone", 255);
  if (!validTimezone(timezone)) return invalid("record.venue.timezone", "invalid timezone");
  const workDate = date(row.workDate, "record.workDate");
  const weekStart = date(period.weekStart, "record.period.weekStart");
  if (weekStart.date.dayOfWeek !== 1 || Temporal.PlainDate.compare(workDate.date, weekStart.date) < 0 ||
    Temporal.PlainDate.compare(workDate.date, weekStart.date.add({ days: 7 })) >= 0) {
    return invalid("record.workDate", "must be in the Monday-start venue week");
  }
  const finalisationId = identifier(period.finalisationId, "record.period.finalisationId");
  if (typeof period.version !== "string" || !/^[1-9]\d{0,18}$/.test(period.version) ||
    BigInt(period.version) > BigInt("9223372036854775807")) {
    return invalid("record.period.version", "expected a positive database sequence as text");
  }
  const periodStart = instant(period.startsAt, "record.period.startsAt");
  const periodEnd = instant(period.endsAt, "record.period.endsAt");
  const boundary = (day: Temporal.PlainDate): bigint => {
    try {
      return Temporal.ZonedDateTime.from({
        timeZone: timezone, year: day.year, month: day.month, day: day.day,
        hour: 0, minute: 0, second: 0,
      }, { disambiguation: "later" }).epochNanoseconds / BigInt(1000);
    } catch (error) {
      if (error instanceof RangeError) return invalid("record.period", "cannot resolve the venue-local week");
      throw error;
    }
  };
  if (periodStart.micros !== boundary(weekStart.date) ||
    periodEnd.micros !== boundary(weekStart.date.add({ days: 7 }))) {
    return invalid("record.period", "week boundaries do not match the venue timezone");
  }
  const clockInId = identifier(attendance.clockInEventId, "record.attendance.clockInEventId");
  const clockOutId = identifier(attendance.clockOutEventId, "record.attendance.clockOutEventId");
  if (clockInId.toLowerCase() === clockOutId.toLowerCase()) {
    return invalid("record.attendance", "clock-in and clock-out events must differ");
  }
  const clockIn = instant(attendance.clockInAt, "record.attendance.clockInAt");
  const clockOut = instant(attendance.clockOutAt, "record.attendance.clockOutAt");
  if (periodStart.micros >= periodEnd.micros || clockIn.micros < periodStart.micros ||
    clockIn.micros >= periodEnd.micros || clockIn.micros > clockOut.micros) {
    return invalid("record.attendance", "attendance is outside its finalised period or is out of order");
  }
  let calculatedDate: string;
  try {
    calculatedDate = clockIn.instant.toZonedDateTimeISO(timezone).toPlainDate().toString();
  } catch (error) {
    if (error instanceof RangeError) return invalid("record.workDate", "cannot resolve the venue-local date");
    throw error;
  }
  if (calculatedDate !== workDate.value) return invalid("record.workDate", "does not match the venue-local clock-in");

  if (hours.unit !== "seconds") return invalid("record.hours.unit", "expected seconds");
  const elapsed = seconds(hours.elapsed, "record.hours.elapsed");
  const worked = seconds(hours.worked, "record.hours.worked");
  const paid = seconds(hours.paid, "record.hours.paid");
  const paidBreak = seconds(hours.paidBreak, "record.hours.paidBreak");
  const unpaidBreak = seconds(hours.unpaidBreak, "record.hours.unpaidBreak");
  if (elapsed.micros !== clockOut.micros - clockIn.micros ||
    worked.micros + paidBreak.micros + unpaidBreak.micros !== elapsed.micros ||
    paid.micros !== worked.micros + paidBreak.micros) {
    return invalid("record.hours", "elapsed, worked, paid and break durations are inconsistent");
  }
  if (!Array.isArray(row.breaks)) return invalid("record.breaks", "expected an array");
  const seenBreaks = new Set<string>();
  const seenEvents = new Set([clockInId.toLowerCase(), clockOutId.toLowerCase()]);
  let paidBreakTotal = BigInt(0);
  let unpaidBreakTotal = BigInt(0);
  let previousStart: bigint | null = null;
  let previousEnd: bigint | null = null;
  const breaks = row.breaks.map((item, index): CanonicalBreak => {
    const path = `record.breaks[${index}]`;
    const entry = object(item, path, ["id", "classification", "startEventId", "endEventId", "startedAt", "endedAt", "seconds"]);
    const id = identifier(entry.id, `${path}.id`);
    const startEventId = identifier(entry.startEventId, `${path}.startEventId`);
    const endEventId = identifier(entry.endEventId, `${path}.endEventId`);
    if (seenBreaks.has(id.toLowerCase()) || seenEvents.has(startEventId.toLowerCase()) ||
      seenEvents.has(endEventId.toLowerCase()) || startEventId.toLowerCase() === endEventId.toLowerCase()) {
      return invalid(path, "duplicate break or event identifier");
    }
    if (entry.classification !== "paid" && entry.classification !== "unpaid") {
      return invalid(`${path}.classification`, "expected paid or unpaid");
    }
    const started = instant(entry.startedAt, `${path}.startedAt`);
    const ended = instant(entry.endedAt, `${path}.endedAt`);
    const duration = seconds(entry.seconds, `${path}.seconds`);
    if (started.micros < clockIn.micros || ended.micros > clockOut.micros || started.micros > ended.micros ||
      duration.micros !== ended.micros - started.micros ||
      (previousStart !== null && started.micros < previousStart) ||
      (started.micros < ended.micros && previousEnd !== null && started.micros < previousEnd)) {
      return invalid(path, "break times are invalid, unordered or overlapping");
    }
    if (started.micros < ended.micros) previousEnd = ended.micros;
    previousStart = started.micros;
    seenBreaks.add(id.toLowerCase());
    seenEvents.add(startEventId.toLowerCase());
    seenEvents.add(endEventId.toLowerCase());
    if (entry.classification === "paid") paidBreakTotal += duration.micros;
    else unpaidBreakTotal += duration.micros;
    return Object.freeze({
      id, classification: entry.classification, startEventId, endEventId,
      startedAt: started.value, endedAt: ended.value, seconds: duration.value,
    });
  });
  if (paidBreakTotal !== paidBreak.micros || unpaidBreakTotal !== unpaidBreak.micros) {
    return invalid("record.breaks", "individual breaks do not match the totals");
  }
  const payCodes = payrollCodes(row.payCodes, paid.micros, "record.payCodes");
  if (approval.status !== "approved" || typeof approval.revision !== "string" ||
    !/^[0-9a-f]{64}$/.test(approval.revision)) {
    return invalid("record.approval", "expected an approved attendance revision");
  }
  const decisionId = identifier(approval.decisionId, "record.approval.decisionId");

  return Object.freeze({
    schemaVersion: 1,
    businessId,
    sessionId,
    worker: Object.freeze({ employeeId, providerMapping: mapping }),
    venue: Object.freeze({ id: venueId, departmentId, timezone }),
    workDate: workDate.value,
    period: Object.freeze({
      weekStart: weekStart.value, finalisationId, version: period.version,
      startsAt: periodStart.value, endsAt: periodEnd.value,
    }),
    attendance: Object.freeze({
      clockInEventId: clockInId, clockOutEventId: clockOutId,
      clockInAt: clockIn.value, clockOutAt: clockOut.value,
    }),
    hours: Object.freeze({
      unit: "seconds", elapsed: elapsed.value, worked: worked.value, paid: paid.value,
      paidBreak: paidBreak.value, unpaidBreak: unpaidBreak.value,
    }),
    breaks: Object.freeze(breaks),
    payCodes,
    approval: Object.freeze({ decisionId, status: "approved", revision: approval.revision }),
  });
}

export function validateCanonicalPayrollRows(value: unknown, scope: CanonicalPayrollScope): readonly CanonicalPayrollRecord[] {
  if (!Array.isArray(value)) return invalid("records", "expected an array");
  if (!Number.isSafeInteger(scope.sessionCount) || scope.sessionCount < 0 || value.length !== scope.sessionCount) {
    return invalid("records", "the finalisation record count does not match");
  }
  const seen = new Set<string>();
  let period: { version: string; timezone: string; startsAt: string; endsAt: string } | null = null;
  const records = value.map((item, index) => {
    const row = object(item, `records[${index}]`, ["session_id", "record"]);
    const sessionId = identifier(row.session_id, `records[${index}].session_id`);
    const record = validateCanonicalPayrollRecord(row.record);
    if (record.sessionId.toLowerCase() !== sessionId.toLowerCase() ||
      record.businessId.toLowerCase() !== scope.businessId.toLowerCase() ||
      record.venue.id.toLowerCase() !== scope.venueId.toLowerCase() ||
      record.period.weekStart !== scope.weekStart ||
      record.period.finalisationId.toLowerCase() !== scope.finalisationId.toLowerCase() ||
      seen.has(sessionId.toLowerCase())) {
      return invalid(`records[${index}]`, "record identity, scope or version is inconsistent");
    }
    if (period && (record.period.version !== period.version || record.venue.timezone !== period.timezone ||
      record.period.startsAt !== period.startsAt || record.period.endsAt !== period.endsAt)) {
      return invalid(`records[${index}]`, "records disagree about the finalised period");
    }
    period = {
      version: record.period.version, timezone: record.venue.timezone,
      startsAt: record.period.startsAt, endsAt: record.period.endsAt,
    };
    seen.add(sessionId.toLowerCase());
    return record;
  });
  return Object.freeze(records);
}

export function prepareCanonicalPayrollForProvider(value: unknown, assignment: unknown): CanonicalPayrollRecord {
  const record = validateCanonicalPayrollRecord(value);
  if (record.worker.providerMapping !== null || record.payCodes !== null) {
    return invalid("record", "provider mapping or pay codes are already assigned");
  }
  const row = object(assignment, "assignment", [
    "businessId", "employeeId", "provider", "connectionId", "externalEmployeeId", "payCodes",
  ]);
  const businessId = identifier(row.businessId, "assignment.businessId");
  const employeeId = identifier(row.employeeId, "assignment.employeeId");
  if (businessId.toLowerCase() !== record.businessId.toLowerCase() ||
    employeeId.toLowerCase() !== record.worker.employeeId.toLowerCase()) {
    return invalid("assignment", "the worker mapping belongs to a different business or employee");
  }
  if (row.payCodes === null || !Array.isArray(row.payCodes)) {
    return invalid("assignment.payCodes", "explicitly assigned pay codes are required");
  }
  return validateCanonicalPayrollRecord({
    ...record,
    worker: {
      ...record.worker,
      providerMapping: {
        provider: row.provider, connectionId: row.connectionId, externalEmployeeId: row.externalEmployeeId,
      },
    },
    payCodes: row.payCodes,
  });
}
