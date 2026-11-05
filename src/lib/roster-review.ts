import { parseBusinessId } from "./business-selection.ts";

export type RosterPublicationMode = "direct" | "approval";
export type RosterPublicationModeEvent = {
  id: string;
  actor_id: string | null;
  old_mode: RosterPublicationMode;
  new_mode: RosterPublicationMode;
  created_at: string;
};
export type RosterReviewDecision = "approved" | "rejected" | "withdrawn";
export type RosterReviewShift = {
  shift_id: string;
  employee_id: string | null;
  employee_name: string | null;
  role_title: string;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  requires_acknowledgement: boolean;
};
export type RosterReview = {
  review_id: string;
  requested_by: string;
  requested_at: string;
  decision: RosterReviewDecision | null;
  reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  published_count: number | null;
  stale: boolean;
  changes: RosterReviewShift[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && Boolean(parseBusinessId(value));
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseRosterPublicationMode(value: unknown): RosterPublicationMode | null {
  return value === "direct" || value === "approval" ? value : null;
}

export function parseRosterPublicationModeEvents(value: unknown): RosterPublicationModeEvent[] | null {
  if (!Array.isArray(value)) return null;
  const events: RosterPublicationModeEvent[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.id) || seen.has(row.id.toLowerCase()) ||
      (row.actor_id !== null && !isUuid(row.actor_id)) || !isTime(row.created_at)) return null;
    const oldMode = parseRosterPublicationMode(row.old_mode);
    const newMode = parseRosterPublicationMode(row.new_mode);
    if (!oldMode || !newMode || oldMode === newMode) return null;
    seen.add(row.id.toLowerCase());
    events.push({
      id: row.id, actor_id: row.actor_id, old_mode: oldMode, new_mode: newMode, created_at: row.created_at,
    });
  }
  return events;
}

function parseReviewShifts(value: unknown): RosterReviewShift[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const shifts: RosterReviewShift[] = [];
  const seen = new Set<string>();
  for (const shift of value) {
    if (!isRecord(shift) || !isUuid(shift.shift_id) || seen.has(shift.shift_id.toLowerCase()) ||
      !((shift.employee_id === null && shift.employee_name === null) ||
        (isUuid(shift.employee_id) && typeof shift.employee_name === "string" && shift.employee_name.trim())) ||
      typeof shift.role_title !== "string" || !shift.role_title.trim() || shift.role_title.length > 80 ||
      !isTime(shift.starts_at) || !isTime(shift.ends_at) ||
      Date.parse(shift.ends_at) <= Date.parse(shift.starts_at) ||
      typeof shift.break_minutes !== "number" || !Number.isInteger(shift.break_minutes) ||
      shift.break_minutes < 0 || shift.break_minutes > 240 ||
      typeof shift.requires_acknowledgement !== "boolean") return null;
    seen.add(shift.shift_id.toLowerCase());
    shifts.push({
      shift_id: shift.shift_id,
      employee_id: isUuid(shift.employee_id) ? shift.employee_id : null,
      employee_name: typeof shift.employee_name === "string" ? shift.employee_name : null,
      role_title: shift.role_title,
      starts_at: shift.starts_at,
      ends_at: shift.ends_at,
      break_minutes: shift.break_minutes,
      requires_acknowledgement: shift.requires_acknowledgement,
    });
  }
  return shifts;
}

export function parseRosterReviews(value: unknown): RosterReview[] | null {
  if (!Array.isArray(value)) return null;
  const reviews: RosterReview[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.review_id) || seen.has(row.review_id.toLowerCase()) ||
      !isUuid(row.requested_by) || !isTime(row.requested_at) ||
      (row.decision !== null && row.decision !== "approved" &&
        row.decision !== "rejected" && row.decision !== "withdrawn") ||
      (row.reason !== null && (typeof row.reason !== "string" ||
        !row.reason.trim() || row.reason.length > 500)) ||
      typeof row.stale !== "boolean") return null;
    const changes = parseReviewShifts(row.changes);
    if (!changes) return null;
    if (row.decision === null) {
      if (row.reason !== null || row.decided_by !== null || row.decided_at !== null ||
        row.published_count !== null) return null;
    } else if (!isUuid(row.decided_by) || !isTime(row.decided_at) ||
      row.stale || typeof row.published_count !== "number" || !Number.isInteger(row.published_count) ||
      (row.decision === "approved" ? row.published_count !== changes.length : row.published_count !== 0) ||
      (row.decision === "rejected" && row.reason === null)) {
      return null;
    }
    seen.add(row.review_id.toLowerCase());
    reviews.push({
      review_id: row.review_id,
      requested_by: row.requested_by,
      requested_at: row.requested_at,
      decision: row.decision,
      reason: row.reason,
      decided_by: isUuid(row.decided_by) ? row.decided_by : null,
      decided_at: isTime(row.decided_at) ? row.decided_at : null,
      published_count: typeof row.published_count === "number" ? row.published_count : null,
      stale: row.stale,
      changes,
    });
  }
  return reviews;
}

export function rosterReviewFailureCode(message: string | undefined): string {
  switch (message) {
    case "Permission denied":
    case "Venue or active department not found":
    case "A different authorised reviewer is required":
      return "review-permission";
    case "Roster approval is required":
    case "Roster approval is not enabled":
    case "Roster approval settings changed":
      return "review-settings";
    case "A roster review is already pending":
      return "review-pending";
    case "There are no draft shifts to review":
      return "review-empty";
    case "Submitted roster changed; withdraw or reject and resubmit":
      return "review-stale";
    case "Roster review already decided":
    case "Request identifier already used":
      return "review-decided";
    case "Roster changed while submitting; please try again":
    case "Roster changed while publishing; please try again":
      return "publish-busy";
    case "Roster has unavailable employees":
      return "publish-unavailable";
    case "Roster has overlapping shifts":
      return "publish-overlap";
    case "Roster has shifts longer than 24 hours":
      return "publish-duration";
    case "Assign or remove the acknowledgement requirement before publication":
      return "publish-acknowledgement";
    case "Invalid roster review decision":
      return "review-reason";
    default:
      return "review";
  }
}
