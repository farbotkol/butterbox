import { Temporal } from "@js-temporal/polyfill";
import { validTimezone } from "./attendance.ts";
import { addDays } from "./dates.ts";
import { timesheetApprovalStatuses, type TimesheetApprovalStatus } from "./timesheet-approvals.ts";
import {
  parseTimesheetPlannedShifts, timesheetWeek, type TimesheetPlannedShift,
} from "./weekly-timesheet.ts";
import { parseWorkedTime, type WorkedTime } from "./worked-time.ts";

export type ExceptionsReportScope = {
  businessId: string;
  venueId: string;
  venueTimezone: string;
  week: string;
};
export type ExceptionOverlap = TimesheetPlannedShift & { is_published: boolean };
export type ExceptionAttendance = WorkedTime & { approval_status: TimesheetApprovalStatus };
export type ExceptionsReport = {
  planned: TimesheetPlannedShift[];
  actual: ExceptionAttendance[];
  overlaps: ExceptionOverlap[];
};
export type HoursException = {
  employeeId: string;
  employeeName: string;
  scheduledSeconds: number;
  approvedWorkedSeconds: number;
  scheduledExceeds: boolean;
  approvedWorkedExceeds: boolean;
};
export type ExceptionSummary = {
  overlaps: ExceptionOverlap[];
  missingClockEvents: ExceptionAttendance[];
  hours: HoursException[] | null;
  excludedEntries: number;
};

export const earliestExceptionsReportWeek = "1000-01-06";

export function exceptionsReportWeek(value: unknown, timezone: string): string | null {
  const week = timesheetWeek(value, timezone);
  return week && week >= earliestExceptionsReportWeek ? week : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function microseconds(value: number): bigint | null {
  const result = Math.round(value * 1_000_000);
  return Number.isFinite(value) && value >= 0 && Number.isSafeInteger(result) ? BigInt(result) : null;
}

export function parseWeeklyHoursThreshold(value: unknown): number | null | undefined {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return hundredths > 0 && hundredths <= 100_000 ? hundredths : undefined;
}

export function parseExceptionsReport(value: unknown, scope: ExceptionsReportScope): ExceptionsReport | null {
  if (!isRecord(value) || value.business_id !== scope.businessId || value.venue_id !== scope.venueId ||
    value.week_start !== scope.week || !Array.isArray(value.planned) ||
    !Array.isArray(value.actual) || !Array.isArray(value.overlaps) || !validTimezone(scope.venueTimezone) ||
    exceptionsReportWeek(scope.week, scope.venueTimezone) !== scope.week) return null;
  const planned = parseTimesheetPlannedShifts(value.planned);
  const actual = parseWorkedTime(value.actual);
  const overlaps = parseTimesheetPlannedShifts(value.overlaps);
  if (!planned || !actual || !overlaps) return null;

  const end = addDays(scope.week, 7);
  const inWeek = (timestamp: string) => {
    try {
      const date = Temporal.Instant.from(timestamp).toZonedDateTimeISO(scope.venueTimezone).toPlainDate().toString();
      return date >= scope.week && date < end;
    } catch (error) {
      if (error instanceof RangeError) return false;
      throw error;
    }
  };
  if (planned.some((row) => !inWeek(row.starts_at)) || overlaps.some((row) => !inWeek(row.starts_at)) ||
    actual.some((row) => {
      const timestamp = row.clocked_in_at ?? row.clocked_out_at;
      return row.venue_id !== scope.venueId || row.venue_timezone !== scope.venueTimezone ||
        (timestamp !== null && !inWeek(timestamp));
    })) {
    return null;
  }

  const attendance: ExceptionAttendance[] = [];
  for (let index = 0; index < actual.length; index += 1) {
    const raw: unknown = value.actual[index];
    if (!isRecord(raw) || typeof raw.approval_status !== "string") return null;
    const status = timesheetApprovalStatuses.find((item) => item === raw.approval_status);
    if (!status || (status === "approved" && (actual[index].worked_seconds === null || actual[index].paid_seconds === null))) {
      return null;
    }
    attendance.push({ ...actual[index], approval_status: status });
  }

  const plannedById = new Map(planned.map((row) => [row.shift_id, row]));
  const conflicting: ExceptionOverlap[] = [];
  for (let index = 0; index < overlaps.length; index += 1) {
    const raw: unknown = value.overlaps[index];
    const row = overlaps[index];
    if (!isRecord(raw) || typeof raw.is_published !== "boolean") return null;
    const match = plannedById.get(row.shift_id);
    if (raw.is_published ? !match || Object.entries(row).some(([key, item]) =>
      match[key as keyof TimesheetPlannedShift] !== item) : Boolean(match)) return null;
    conflicting.push({ ...row, is_published: raw.is_published });
  }

  const names = new Map<string, string>();
  for (const row of [...planned, ...attendance, ...conflicting]) {
    const key = row.employee_id.toLowerCase();
    const existing = names.get(key);
    if (existing !== undefined && existing !== row.employee_name) return null;
    names.set(key, row.employee_name);
  }
  return { planned, actual: attendance, overlaps: conflicting };
}

export function summariseExceptions(report: ExceptionsReport, threshold: number | null): ExceptionSummary | null {
  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 1 || threshold > 100_000)) return null;
  const groups = new Map<string, {
    employeeId: string; employeeName: string; scheduled: bigint; approvedWorked: bigint;
  }>();
  const groupFor = (employeeId: string, employeeName: string) => {
    const key = employeeId.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { employeeId, employeeName, scheduled: BigInt(0), approvedWorked: BigInt(0) };
      groups.set(key, group);
    }
    return group;
  };
  for (const row of report.planned) {
    const duration = microseconds(row.scheduled_seconds);
    if (duration === null) return null;
    groupFor(row.employee_id, row.employee_name).scheduled += duration;
  }
  for (const row of report.actual) {
    if (row.approval_status !== "approved") continue;
    if (row.worked_seconds === null) return null;
    const duration = microseconds(row.worked_seconds);
    if (duration === null) return null;
    groupFor(row.employee_id, row.employee_name).approvedWorked += duration;
  }
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  if ([...groups.values()].some((group) => group.scheduled > maximum || group.approvedWorked > maximum)) return null;
  const thresholdMicroseconds = threshold === null ? null : BigInt(threshold) * BigInt(36_000_000);
  const hours = thresholdMicroseconds === null ? null : [...groups.values()].map((group) => ({
    employeeId: group.employeeId, employeeName: group.employeeName,
    scheduledSeconds: Number(group.scheduled) / 1_000_000,
    approvedWorkedSeconds: Number(group.approvedWorked) / 1_000_000,
    scheduledExceeds: group.scheduled > thresholdMicroseconds,
    approvedWorkedExceeds: group.approvedWorked > thresholdMicroseconds,
  })).filter((group) => group.scheduledExceeds || group.approvedWorkedExceeds)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.employeeId.localeCompare(b.employeeId));
  return {
    overlaps: report.overlaps,
    missingClockEvents: report.actual.filter((row) =>
      row.exceptions.includes("missing_clock_in") || row.exceptions.includes("missing_clock_out")),
    hours,
    excludedEntries: report.actual.filter((row) => row.approval_status !== "approved").length,
  };
}
