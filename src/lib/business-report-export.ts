import { Temporal } from "@js-temporal/polyfill";
import { isPayrollUuid, payrollCsvCell } from "./generic-payroll-exports.ts";
import { timesheetWeek } from "./weekly-timesheet.ts";

export type BusinessReportType = "roster" | "attendance";

export type BusinessReportScope = Readonly<{
  businessId: string;
  venueId: string;
  venueName: string;
  venueTimezone: string;
  weekStart: string;
  reportType: BusinessReportType;
}>;

type ReportContext = BusinessReportScope & Readonly<{
  eventId: string;
  periodStartUtc: string;
  periodEndUtc: string;
}>;

type RosterRow = Readonly<{
  shiftId: string;
  departmentId: string;
  departmentName: string;
  employeeId: string | null;
  employeeName: string | null;
  roleTitle: string;
  startsAtUtc: string;
  endsAtUtc: string;
  breakMinutes: number;
  status: "scheduled" | "cancelled";
  isPublished: boolean;
}>;

type AttendanceRow = Readonly<{
  sessionId: string;
  departmentId: string;
  departmentName: string;
  employeeId: string;
  employeeName: string;
  clockInUtc: string | null;
  clockOutUtc: string | null;
  periodReferenceUtc: string;
  periodReferenceBasis: "clock_in" | "clock_out" | "session_created";
  elapsedSeconds: string | null;
  workedSeconds: string | null;
  timesheetStatus: "pending" | "approved" | "approval_outdated" | "returned" | "resubmitted";
  hasExceptions: boolean;
}>;

export type BusinessReport = ReportContext & (
  | Readonly<{ reportType: "roster"; rows: readonly RosterRow[] }>
  | Readonly<{ reportType: "attendance"; rows: readonly AttendanceRow[] }>
);

export class BusinessReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessReportValidationError";
  }
}

const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const secondsPattern = /^(0|[1-9]\d{0,14})(?:\.(\d{1,6}))?$/;
const reportKeys = [
  "event_id", "business_id", "venue_id", "venue_name", "venue_timezone", "week_start",
  "period_start_utc", "period_end_utc", "report_type", "entry_count", "rows",
] as const;
const rosterKeys = [
  "shift_id", "department_id", "department_name", "employee_id", "employee_name", "role_title",
  "starts_at_utc", "ends_at_utc", "break_minutes", "status", "is_published",
] as const;
const attendanceKeys = [
  "session_id", "department_id", "department_name", "employee_id", "employee_name",
  "clock_in_utc", "clock_out_utc", "period_reference_utc", "period_reference_basis",
  "elapsed_seconds", "worked_seconds", "timesheet_status", "has_exceptions",
] as const;

function invalid(path: string, message: string): never {
  throw new BusinessReportValidationError(`${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) return invalid(path, "expected an object");
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    return invalid(path, "missing or unexpected fields");
  }
  return value;
}

function identifier(value: unknown, path: string): string {
  if (!isPayrollUuid(value)) return invalid(path, "expected a UUID");
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) return invalid(path, "expected non-empty text");
  return value;
}

function instant(value: unknown, path: string): { value: string; instant: Temporal.Instant } {
  if (typeof value !== "string" || !utcPattern.test(value)) {
    return invalid(path, "expected a UTC timestamp with microseconds");
  }
  try {
    const parsed = Temporal.Instant.from(value);
    if (parsed.toString({ fractionalSecondDigits: 6 }) !== value) return invalid(path, "invalid timestamp");
    return { value, instant: parsed };
  } catch (error) {
    if (error instanceof RangeError) return invalid(path, "invalid timestamp");
    throw error;
  }
}

function nullableInstant(value: unknown, path: string): ReturnType<typeof instant> | null {
  return value === null ? null : instant(value, path);
}

function seconds(value: unknown, path: string): { value: string; micros: bigint } | null {
  if (value === null) return null;
  if (typeof value !== "string") return invalid(path, "expected exact decimal seconds or null");
  const matched = secondsPattern.exec(value);
  if (!matched) return invalid(path, "expected non-negative exact decimal seconds");
  return {
    value,
    micros: BigInt(matched[1]) * BigInt(1_000_000) + BigInt((matched[2] ?? "").padEnd(6, "0")),
  };
}

function inPeriod(value: Temporal.Instant, start: Temporal.Instant, end: Temporal.Instant): boolean {
  return Temporal.Instant.compare(value, start) >= 0 && Temporal.Instant.compare(value, end) < 0;
}

function isMidnightBoundary(value: Temporal.Instant, day: Temporal.PlainDate, timezone: string): boolean {
  const midnight = day.toPlainDateTime("00:00");
  return (["earlier", "later"] as const).some((disambiguation) =>
    Temporal.Instant.compare(value, midnight.toZonedDateTime(timezone, { disambiguation }).toInstant()) === 0);
}

function parseRosterRow(value: unknown, path: string, start: Temporal.Instant, end: Temporal.Instant): RosterRow {
  const row = object(value, path, rosterKeys);
  const shiftId = identifier(row.shift_id, `${path}.shift_id`);
  const departmentId = identifier(row.department_id, `${path}.department_id`);
  const departmentName = text(row.department_name, `${path}.department_name`);
  const employeeId = row.employee_id === null ? null : identifier(row.employee_id, `${path}.employee_id`);
  const employeeName = row.employee_name === null ? null : text(row.employee_name, `${path}.employee_name`);
  if ((employeeId === null) !== (employeeName === null)) return invalid(path, "inconsistent assignment");
  const roleTitle = text(row.role_title, `${path}.role_title`);
  const startsAt = instant(row.starts_at_utc, `${path}.starts_at_utc`);
  const endsAt = instant(row.ends_at_utc, `${path}.ends_at_utc`);
  if (!inPeriod(startsAt.instant, start, end) || Temporal.Instant.compare(endsAt.instant, startsAt.instant) <= 0) {
    return invalid(path, "shift outside the selected period or invalid duration");
  }
  if (typeof row.break_minutes !== "number" || !Number.isInteger(row.break_minutes) ||
      row.break_minutes < 0 || row.break_minutes > 240) return invalid(path, "invalid planned break");
  if (row.status !== "scheduled" && row.status !== "cancelled") return invalid(path, "invalid shift status");
  if (typeof row.is_published !== "boolean") return invalid(path, "invalid publication state");
  return {
    shiftId, departmentId, departmentName, employeeId, employeeName, roleTitle,
    startsAtUtc: startsAt.value, endsAtUtc: endsAt.value, breakMinutes: row.break_minutes,
    status: row.status, isPublished: row.is_published,
  };
}

function parseAttendanceRow(value: unknown, path: string, start: Temporal.Instant, end: Temporal.Instant): AttendanceRow {
  const row = object(value, path, attendanceKeys);
  const sessionId = identifier(row.session_id, `${path}.session_id`);
  const departmentId = identifier(row.department_id, `${path}.department_id`);
  const departmentName = text(row.department_name, `${path}.department_name`);
  const employeeId = identifier(row.employee_id, `${path}.employee_id`);
  const employeeName = text(row.employee_name, `${path}.employee_name`);
  const clockIn = nullableInstant(row.clock_in_utc, `${path}.clock_in_utc`);
  const clockOut = nullableInstant(row.clock_out_utc, `${path}.clock_out_utc`);
  const reference = instant(row.period_reference_utc, `${path}.period_reference_utc`);
  const basis = row.period_reference_basis;
  if (!inPeriod(reference.instant, start, end) ||
      (basis === "clock_in" && (!clockIn || clockIn.value !== reference.value)) ||
      (basis === "clock_out" && (clockIn !== null || !clockOut || clockOut.value !== reference.value)) ||
      (basis === "session_created" && (clockIn !== null || clockOut !== null)) ||
      (basis !== "clock_in" && basis !== "clock_out" && basis !== "session_created")) {
    return invalid(path, "inconsistent period reference");
  }
  const elapsed = seconds(row.elapsed_seconds, `${path}.elapsed_seconds`);
  const worked = seconds(row.worked_seconds, `${path}.worked_seconds`);
  if ((elapsed === null) !== (worked === null)) return invalid(path, "inconsistent calculated time");
  if (elapsed && worked) {
    if (!clockIn || !clockOut || clockOut.instant.epochNanoseconds < clockIn.instant.epochNanoseconds ||
        clockOut.instant.epochNanoseconds - clockIn.instant.epochNanoseconds !== elapsed.micros * BigInt(1000) ||
        worked.micros > elapsed.micros) return invalid(path, "calculated time does not match the clock events");
  }
  const status = row.timesheet_status;
  if (status !== "pending" && status !== "approved" && status !== "approval_outdated" &&
      status !== "returned" && status !== "resubmitted") return invalid(path, "invalid timesheet status");
  if (status === "approved" && elapsed === null) return invalid(path, "approved time is incomplete");
  if (typeof row.has_exceptions !== "boolean") return invalid(path, "invalid exception indicator");
  return {
    sessionId, departmentId, departmentName, employeeId, employeeName,
    clockInUtc: clockIn?.value ?? null, clockOutUtc: clockOut?.value ?? null,
    periodReferenceUtc: reference.value, periodReferenceBasis: basis,
    elapsedSeconds: elapsed?.value ?? null, workedSeconds: worked?.value ?? null,
    timesheetStatus: status, hasExceptions: row.has_exceptions,
  };
}

export function validateBusinessReport(value: unknown, scope: BusinessReportScope): BusinessReport {
  const report = object(value, "report", reportKeys);
  const eventId = identifier(report.event_id, "report.event_id");
  if (!isPayrollUuid(scope.businessId) || !isPayrollUuid(scope.venueId) ||
      !isPayrollUuid(report.business_id) || !isPayrollUuid(report.venue_id) ||
      report.business_id.toLowerCase() !== scope.businessId.toLowerCase() ||
      report.venue_id.toLowerCase() !== scope.venueId.toLowerCase() ||
      report.venue_name !== scope.venueName || report.venue_timezone !== scope.venueTimezone ||
      report.week_start !== scope.weekStart || report.report_type !== scope.reportType ||
      scope.weekStart < "0001-01-08" ||
      timesheetWeek(scope.weekStart, scope.venueTimezone) !== scope.weekStart) {
    return invalid("report", "scope or period does not match the request");
  }
  const start = instant(report.period_start_utc, "report.period_start_utc");
  const end = instant(report.period_end_utc, "report.period_end_utc");
  try {
    const week = Temporal.PlainDate.from(scope.weekStart);
    if (Temporal.Instant.compare(start.instant, end.instant) >= 0 ||
        !isMidnightBoundary(start.instant, week, scope.venueTimezone) ||
        !isMidnightBoundary(end.instant, week.add({ days: 7 }), scope.venueTimezone)) {
      return invalid("report", "invalid venue-local period bounds");
    }
  } catch (error) {
    if (error instanceof RangeError) return invalid("report", "invalid venue timezone or period");
    throw error;
  }
  if (typeof report.entry_count !== "number" || !Number.isInteger(report.entry_count) ||
      report.entry_count < 0 || report.entry_count > 10000 || !Array.isArray(report.rows) ||
      report.rows.length !== report.entry_count) return invalid("report", "incomplete or oversized results");
  const context = {
    ...scope, eventId, periodStartUtc: start.value, periodEndUtc: end.value,
  };
  const seen = new Set<string>();
  if (scope.reportType === "roster") {
    const rows = report.rows.map((row, index) => {
      const parsed = parseRosterRow(row, `rows[${index}]`, start.instant, end.instant);
      const key = parsed.shiftId.toLowerCase();
      if (seen.has(key)) return invalid(`rows[${index}]`, "duplicate shift");
      seen.add(key);
      return parsed;
    });
    return { ...context, reportType: "roster", rows };
  }
  const rows = report.rows.map((row, index) => {
    const parsed = parseAttendanceRow(row, `rows[${index}]`, start.instant, end.instant);
    const key = parsed.sessionId.toLowerCase();
    if (seen.has(key)) return invalid(`rows[${index}]`, "duplicate session");
    seen.add(key);
    return parsed;
  });
  return { ...context, reportType: "attendance", rows };
}

export function businessReportCsv(report: BusinessReport, simulationOnly = false): string {
  const commonHeaders = [
    ...(simulationOnly ? ["simulation_notice"] : []),
    "export_event_id", "business_id", "venue_id", "venue_name", "venue_timezone",
    "week_start", "period_start_utc", "period_end_utc",
  ];
  const common = [
    ...(simulationOnly ? ["SIMULATION ONLY - NOT FOR PAYROLL"] : []),
    report.eventId, report.businessId, report.venueId, report.venueName, report.venueTimezone,
    report.weekStart, report.periodStartUtc, report.periodEndUtc,
  ];
  const headers = report.reportType === "roster" ? [
    ...commonHeaders, "shift_id", "department_id", "department_name", "employee_id", "employee_name",
    "role_title", "starts_at_utc", "ends_at_utc", "break_minutes", "status", "is_published",
  ] : [
    ...commonHeaders, "session_id", "department_id", "department_name", "employee_id", "employee_name",
    "clock_in_utc", "clock_out_utc", "period_reference_utc", "period_reference_basis",
    "elapsed_seconds", "worked_seconds", "timesheet_status", "has_exceptions",
  ];
  const lines = report.reportType === "roster" ? report.rows.map((row) => [
    ...common, row.shiftId, row.departmentId, row.departmentName, row.employeeId ?? "", row.employeeName ?? "",
    row.roleTitle, row.startsAtUtc, row.endsAtUtc, String(row.breakMinutes), row.status, String(row.isPublished),
  ]) : report.rows.map((row) => [
    ...common, row.sessionId, row.departmentId, row.departmentName, row.employeeId, row.employeeName,
    row.clockInUtc ?? "", row.clockOutUtc ?? "", row.periodReferenceUtc, row.periodReferenceBasis,
    row.elapsedSeconds ?? "", row.workedSeconds ?? "", row.timesheetStatus, String(row.hasExceptions),
  ]);
  return `\uFEFF${[headers, ...lines].map((line) => line.map(payrollCsvCell).join(",")).join("\r\n")}\r\n`;
}
