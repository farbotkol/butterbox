import { isCorrectionTimestamp, type CorrectionEventType } from "./attendance-corrections.ts";
import { isLocationReviewReason, type LocationReviewReason } from "./attendance-location.ts";
import type { BreakClassification } from "./attendance.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AttendanceEventSource = "server_clock" | "offline_claim" | "manager_reported" | "employee_request";
type LocationReason = "disabled" | "inside" | LocationReviewReason;
type HistoryLocation = {
  location_status: "not_required" | "verified" | "review" | null;
  location_reason: LocationReason | null;
  distance_meters: number | null;
  accuracy_meters: number | null;
  radius_meters: number | null;
  reviewed_at: string | null;
};

export type PersonalAttendanceEvent = HistoryLocation & {
  event_id: string;
  session_id: string;
  department_name: string;
  event_type: CorrectionEventType;
  classification: BreakClassification | null;
  original_at: string;
  effective_at: string;
  has_correction: boolean;
  event_source: AttendanceEventSource;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseLocation(row: Record<string, unknown>, isBreak: boolean): HistoryLocation | null {
  const {
    location_status: status, location_reason: reason, distance_meters: distance,
    accuracy_meters: accuracy, radius_meters: radius, reviewed_at: reviewedAt,
  } = row;
  if (status === null || status === "not_required") {
    if ((status === null ? reason !== null : reason !== "disabled") ||
      distance !== null || accuracy !== null || radius !== null || reviewedAt !== null ||
      (isBreak && status !== null)) return null;
    return {
      location_status: status, location_reason: status === null ? null : "disabled",
      distance_meters: null, accuracy_meters: null, radius_meters: null, reviewed_at: null,
    };
  }
  if (isBreak || (status !== "verified" && status !== "review") ||
    typeof radius !== "number" || !Number.isInteger(radius) || radius < 1 || radius > 10000 ||
    (reviewedAt !== null && !isCorrectionTimestamp(reviewedAt))) return null;
  if (status === "verified") {
    if (reason !== "inside" || !isNonnegativeNumber(distance) ||
      !isNonnegativeNumber(accuracy) || reviewedAt !== null) return null;
    return {
      location_status: status, location_reason: reason, distance_meters: distance,
      accuracy_meters: accuracy, radius_meters: radius, reviewed_at: null,
    };
  }
  if (!isLocationReviewReason(reason)) return null;
  if (reason === "outside" || reason === "inaccurate") {
    if (!isNonnegativeNumber(distance) || !isNonnegativeNumber(accuracy)) return null;
    return {
      location_status: status, location_reason: reason, distance_meters: distance,
      accuracy_meters: accuracy, radius_meters: radius, reviewed_at: reviewedAt,
    };
  }
  if (distance !== null || accuracy !== null) return null;
  return {
    location_status: status, location_reason: reason, distance_meters: null,
    accuracy_meters: null, radius_meters: radius, reviewed_at: reviewedAt,
  };
}

export function parsePersonalAttendanceHistory(value: unknown): PersonalAttendanceEvent[] | null {
  if (!Array.isArray(value)) return null;
  const events: PersonalAttendanceEvent[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || typeof row.event_id !== "string" || !uuid.test(row.event_id) ||
      typeof row.session_id !== "string" || !uuid.test(row.session_id) ||
      typeof row.department_name !== "string" || !row.department_name.trim() ||
      (row.event_type !== "clock_in" && row.event_type !== "clock_out" &&
        row.event_type !== "break_start" && row.event_type !== "break_end") ||
      !isCorrectionTimestamp(row.original_at) || !isCorrectionTimestamp(row.effective_at) ||
      typeof row.has_correction !== "boolean" ||
      (!row.has_correction && row.original_at !== row.effective_at) ||
      (row.event_source !== "server_clock" && row.event_source !== "offline_claim" &&
        row.event_source !== "manager_reported" && row.event_source !== "employee_request")) return null;
    const isBreak = row.event_type === "break_start" || row.event_type === "break_end";
    const classification = row.classification;
    if ((classification !== null && classification !== "paid" && classification !== "unpaid") ||
      (isBreak ? classification === null : classification !== null)) return null;
    const location = parseLocation(row, isBreak);
    const key = row.event_id.toLowerCase();
    if (!location || seen.has(key)) return null;
    seen.add(key);
    events.push({
      event_id: row.event_id, session_id: row.session_id, department_name: row.department_name,
      event_type: row.event_type, classification,
      original_at: row.original_at, effective_at: row.effective_at,
      has_correction: row.has_correction, event_source: row.event_source, ...location,
    });
  }
  return events;
}

export const attendanceSourceLabels: Record<AttendanceEventSource, string> = {
  server_clock: "Server-recorded clock or break",
  offline_claim: "Unverified offline claim",
  manager_reported: "Manager-reported time",
  employee_request: "Unverified employee-requested time",
};
