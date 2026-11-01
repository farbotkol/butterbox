import { validTimezone } from "./attendance.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exceptionCodes = [
  "missing_clock_in", "missing_clock_out", "invalid_clock_order",
  "incomplete_break", "invalid_break", "overlapping_breaks",
  "location_unverified", "location_review_required", "location_reviewed", "offline_claim_unverified",
] as const;
const calculationErrors: WorkTimeException[] = [
  "missing_clock_in", "missing_clock_out", "invalid_clock_order",
  "incomplete_break", "invalid_break", "overlapping_breaks",
];

export type WorkTimeException = typeof exceptionCodes[number];
export type WorkedTime = {
  session_id: string;
  employee_id: string;
  employee_name: string;
  department_id: string;
  department_name: string;
  venue_id: string;
  venue_name: string;
  venue_timezone: string;
  clocked_in_at: string | null;
  clocked_out_at: string | null;
  elapsed_seconds: number | null;
  worked_seconds: number | null;
  paid_seconds: number | null;
  paid_break_seconds: number | null;
  unpaid_break_seconds: number | null;
  exceptions: WorkTimeException[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

function isTimezone(value: unknown): value is string {
  return isText(value) && validTimezone(value);
}

function isException(value: unknown): value is WorkTimeException {
  return typeof value === "string" && exceptionCodes.some((code) => code === value);
}

function isDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseWorkedTime(value: unknown): WorkedTime[] | null {
  if (!Array.isArray(value)) return null;
  const rows: WorkedTime[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) ||
      !isUuid(row.session_id) || !isUuid(row.employee_id) || !isUuid(row.department_id) ||
      !isUuid(row.venue_id) || !isText(row.employee_name) || !isText(row.department_name) ||
      !isText(row.venue_name) || !isTimezone(row.venue_timezone) ||
      !isTimestamp(row.clocked_in_at) || !isTimestamp(row.clocked_out_at) ||
      !Array.isArray(row.exceptions) || !row.exceptions.every(isException) ||
      new Set(row.exceptions).size !== row.exceptions.length) return null;
    const exceptions: WorkTimeException[] = row.exceptions;
    const incomplete = exceptions.some((exception) => calculationErrors.includes(exception));
    if ((row.clocked_in_at === null) !== exceptions.includes("missing_clock_in") ||
      (row.clocked_out_at === null) !== exceptions.includes("missing_clock_out")) return null;
    const durations = [
      row.elapsed_seconds, row.worked_seconds, row.paid_seconds,
      row.paid_break_seconds, row.unpaid_break_seconds,
    ];
    if (incomplete ? durations.some((duration) => duration !== null) : !durations.every(isDuration)) {
      return null;
    }
    if (!incomplete && isDuration(row.elapsed_seconds) && isDuration(row.worked_seconds) &&
      isDuration(row.paid_seconds) && isDuration(row.paid_break_seconds) && isDuration(row.unpaid_break_seconds)) {
      const tolerance = Math.max(0.000001, row.elapsed_seconds * Number.EPSILON * 16);
      if (Math.abs(row.elapsed_seconds - row.worked_seconds - row.paid_break_seconds - row.unpaid_break_seconds) > tolerance ||
        Math.abs(row.paid_seconds - row.worked_seconds - row.paid_break_seconds) > tolerance) return null;
    }
    const key = row.session_id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({
      session_id: row.session_id, employee_id: row.employee_id, employee_name: row.employee_name,
      department_id: row.department_id, department_name: row.department_name,
      venue_id: row.venue_id, venue_name: row.venue_name, venue_timezone: row.venue_timezone,
      clocked_in_at: row.clocked_in_at, clocked_out_at: row.clocked_out_at,
      elapsed_seconds: isDuration(row.elapsed_seconds) ? row.elapsed_seconds : null,
      worked_seconds: isDuration(row.worked_seconds) ? row.worked_seconds : null,
      paid_seconds: isDuration(row.paid_seconds) ? row.paid_seconds : null,
      paid_break_seconds: isDuration(row.paid_break_seconds) ? row.paid_break_seconds : null,
      unpaid_break_seconds: isDuration(row.unpaid_break_seconds) ? row.unpaid_break_seconds : null,
      exceptions,
    });
  }
  return rows;
}

export function formatWorkedDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  return `${hours}h ${minutes}m ${rounded % 60}s`;
}

export const workTimeExceptionLabels: Record<WorkTimeException, string> = {
  missing_clock_in: "Clock-in missing",
  missing_clock_out: "Clock-out missing",
  invalid_clock_order: "Clock times out of order",
  incomplete_break: "Break start or end missing",
  invalid_break: "Break times invalid",
  overlapping_breaks: "Breaks overlap",
  location_unverified: "Location check unavailable",
  location_review_required: "Location review required",
  location_reviewed: "Location exception reviewed",
  offline_claim_unverified: "Unverified offline times; breaks were not captured",
};
