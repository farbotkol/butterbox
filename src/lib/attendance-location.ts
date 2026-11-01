import { parseClockReceipt } from "./attendance.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailableReasons = [
  "permission_denied", "unavailable", "timeout", "unsupported", "not_provided",
] as const;
const reviewReasons = [...unavailableReasons, "invalid", "outside", "inaccurate"] as const;

export type LocationReviewReason = typeof reviewReasons[number];
export type LocationCapture = {
  status: "position" | typeof unavailableReasons[number] | "invalid";
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
};

export type LocationException = {
  check_id: string;
  employee_name: string;
  department_name: string;
  event_type: "clock_in" | "clock_out";
  occurred_at: string;
  reason: LocationReviewReason;
  distance_meters: number | null;
  accuracy_meters: number | null;
  radius_meters: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isReviewReason(value: unknown): value is LocationReviewReason {
  return typeof value === "string" && reviewReasons.some((reason) => reason === value);
}

function isUnavailableReason(value: string): value is typeof unavailableReasons[number] {
  return unavailableReasons.some((reason) => reason === value);
}

function numericValue(value: string) {
  if (value.length > 64 || !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLocationCapture(formData: FormData): LocationCapture {
  const names = ["location_status", "location_latitude", "location_longitude", "location_accuracy_meters"];
  const fields = names.map((name) => formData.getAll(name));
  const invalid: LocationCapture = { status: "invalid", latitude: null, longitude: null, accuracyMeters: null };
  if (fields.some((values) => values.length > 1 || values.some((value) => typeof value !== "string"))) {
    return invalid;
  }
  const [status = "", latitude = "", longitude = "", accuracy = ""] = fields.map(
    (values) => typeof values[0] === "string" ? values[0].trim() : "",
  );
  const empty = { latitude: null, longitude: null, accuracyMeters: null };
  if (!status && !latitude && !longitude && !accuracy) return { status: "not_provided", ...empty };
  if (isUnavailableReason(status) && !latitude && !longitude && !accuracy) {
    return { status, ...empty };
  }
  if (status !== "position") return invalid;
  const parsedLatitude = numericValue(latitude);
  const parsedLongitude = numericValue(longitude);
  const parsedAccuracy = numericValue(accuracy);
  if (parsedLatitude === null || parsedLatitude < -90 || parsedLatitude > 90 ||
    parsedLongitude === null || parsedLongitude < -180 || parsedLongitude > 180 ||
    parsedAccuracy === null || parsedAccuracy < 0 || parsedAccuracy > 10000000) return invalid;
  return {
    status: "position", latitude: parsedLatitude,
    longitude: parsedLongitude, accuracyMeters: parsedAccuracy,
  };
}

export function parseLocationClockReceipt(value: unknown) {
  const receipt = parseClockReceipt(value);
  if (!receipt || !Array.isArray(value) || !isRecord(value[0])) return null;
  const { location_status: status, location_reason: reason } = value[0];
  if (
    (status === "not_required" && reason === "disabled") ||
    (status === "verified" && reason === "inside") ||
    (status === "historical_unverified" && reason === "historical") ||
    (status === "review" && isReviewReason(reason))
  ) return { ...receipt, locationStatus: status, locationReason: reason };
  return null;
}

export function parseLocationExceptions(value: unknown): LocationException[] | null {
  if (!Array.isArray(value)) return null;
  const result: LocationException[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || typeof row.check_id !== "string" || !uuid.test(row.check_id) ||
      typeof row.employee_name !== "string" || !row.employee_name.trim() ||
      typeof row.department_name !== "string" || !row.department_name.trim() ||
      (row.event_type !== "clock_in" && row.event_type !== "clock_out") ||
      typeof row.occurred_at !== "string" || Number.isNaN(Date.parse(row.occurred_at)) ||
      !isReviewReason(row.reason) ||
      typeof row.radius_meters !== "number" || !Number.isInteger(row.radius_meters) ||
      row.radius_meters < 1 || row.radius_meters > 10000 ||
      (row.reviewed_by !== null && (typeof row.reviewed_by !== "string" || !uuid.test(row.reviewed_by))) ||
      (row.reviewed_at !== null && (typeof row.reviewed_at !== "string" || Number.isNaN(Date.parse(row.reviewed_at)))) ||
      (row.reviewed_by === null) !== (row.reviewed_at === null)) return null;
    let distance: number | null = null;
    let accuracy: number | null = null;
    if (row.reason === "outside" || row.reason === "inaccurate") {
      if (typeof row.distance_meters !== "number" || !Number.isFinite(row.distance_meters) ||
        row.distance_meters < 0 || typeof row.accuracy_meters !== "number" ||
        !Number.isFinite(row.accuracy_meters) || row.accuracy_meters < 0) return null;
      distance = row.distance_meters;
      accuracy = row.accuracy_meters;
    } else if (row.distance_meters !== null || row.accuracy_meters !== null) return null;
    const key = row.check_id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    result.push({
      check_id: row.check_id, employee_name: row.employee_name, department_name: row.department_name,
      event_type: row.event_type, occurred_at: row.occurred_at, reason: row.reason,
      distance_meters: distance, accuracy_meters: accuracy,
      radius_meters: row.radius_meters, reviewed_by: row.reviewed_by, reviewed_at: row.reviewed_at,
    });
  }
  return result;
}

export const locationReasonLabels: Record<LocationReviewReason, string> = {
  permission_denied: "Location permission denied",
  unavailable: "Location unavailable",
  timeout: "Location request timed out",
  unsupported: "Location not supported by this browser",
  not_provided: "Location not provided",
  invalid: "Invalid location data",
  outside: "Outside the venue radius",
  inaccurate: "Location accuracy is insufficient",
};
