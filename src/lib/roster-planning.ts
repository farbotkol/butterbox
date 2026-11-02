import { parseBusinessId } from "./business-selection.ts";
import { addDays } from "./dates.ts";
import { isEmploymentEffectiveDate } from "./employment-rule-metadata.ts";

export const rosterWeekdays = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

export type RosterWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type RosterWeekSettings = {
  current_weekday: RosterWeekday;
  pending_weekday: RosterWeekday | null;
  pending_effective_on: string | null;
  pending_id: string | null;
  pending_locked: boolean;
  revision: number;
  venue_today: string;
};
export type RosterWeekEvent = {
  id: string;
  actor_id: string;
  revision: number;
  action: "scheduled" | "cancelled";
  previous_weekday: RosterWeekday;
  weekday: RosterWeekday;
  effective_on: string;
  supersedes: string | null;
  recorded_at: string;
};
export type RosterPlanningPeriod = {
  start_on: string;
  end_on: string;
  weekday: RosterWeekday;
  previous_on: string;
  next_on: string;
  start_at: string;
  end_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && Boolean(parseBusinessId(value));
}

function isWeekday(value: unknown): value is RosterWeekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;
}

export function isRosterPlanningDate(value: unknown): value is string {
  return isEmploymentEffectiveDate(value) && value >= "1900-01-08" && value <= "9999-12-24";
}

export function parseRosterWeekInput(formData: FormData) {
  const weekdays = formData.getAll("weekday");
  const revisions = formData.getAll("revision");
  const pendingIds = formData.getAll("pending_id");
  const requestIds = formData.getAll("request_id");
  if (weekdays.length !== 1 || typeof weekdays[0] !== "string" || !/^[1-7]$/.test(weekdays[0]) ||
    revisions.length !== 1 || typeof revisions[0] !== "string" || !/^(0|[1-9]\d*)$/.test(revisions[0]) ||
    pendingIds.length !== 1 || (pendingIds[0] !== "" && !isUuid(pendingIds[0])) ||
    requestIds.length !== 1 || !isUuid(requestIds[0])) return null;
  const weekday = Number(weekdays[0]);
  const revision = Number(revisions[0]);
  if (!isWeekday(weekday) || !isRevision(revision) || revision >= 2147483647) return null;
  return { weekday, revision, pendingId: pendingIds[0] === "" ? null : pendingIds[0], requestId: requestIds[0] };
}

export function parseRosterWeekSettings(value: unknown): RosterWeekSettings | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row: unknown = value[0];
  if (!isRecord(row) || !isWeekday(row.current_weekday) || !isRevision(row.revision) ||
    !isEmploymentEffectiveDate(row.venue_today) || typeof row.pending_locked !== "boolean") return null;
  if (row.pending_weekday === null && row.pending_effective_on === null &&
    row.pending_id === null && !row.pending_locked) {
    return {
      current_weekday: row.current_weekday, pending_weekday: null, pending_effective_on: null,
      pending_id: null, pending_locked: false, revision: row.revision, venue_today: row.venue_today,
    };
  }
  if (!isWeekday(row.pending_weekday) || !isRosterPlanningDate(row.pending_effective_on) ||
    !isUuid(row.pending_id) || row.pending_effective_on <= row.venue_today ||
    row.pending_weekday === row.current_weekday) return null;
  const todayWeekday = new Date(`${row.venue_today}T00:00:00Z`).getUTCDay() || 7;
  const currentEnd = addDays(row.venue_today, 7 - ((todayWeekday - row.current_weekday + 7) % 7));
  if (row.pending_locked !== (row.pending_effective_on < currentEnd)) return null;
  return {
    current_weekday: row.current_weekday, pending_weekday: row.pending_weekday,
    pending_effective_on: row.pending_effective_on, pending_id: row.pending_id,
    pending_locked: row.pending_locked, revision: row.revision, venue_today: row.venue_today,
  };
}

export function parseRosterWeekEvents(value: unknown): RosterWeekEvent[] | null {
  if (!Array.isArray(value)) return null;
  const result: RosterWeekEvent[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.id) || seen.has(row.id.toLowerCase()) ||
      !isUuid(row.actor_id) || !isRevision(row.revision) || row.revision === 0 ||
      (row.action !== "scheduled" && row.action !== "cancelled") ||
      !isWeekday(row.previous_weekday) || !isWeekday(row.weekday) ||
      row.previous_weekday === row.weekday || !isRosterPlanningDate(row.effective_on) ||
      (row.supersedes !== null && !isUuid(row.supersedes)) ||
      (row.action === "cancelled" && row.supersedes === null) ||
      typeof row.recorded_at !== "string" || !Number.isFinite(Date.parse(row.recorded_at))) return null;
    seen.add(row.id.toLowerCase());
    result.push({
      id: row.id, actor_id: row.actor_id, revision: row.revision, action: row.action,
      previous_weekday: row.previous_weekday, weekday: row.weekday, effective_on: row.effective_on,
      supersedes: row.supersedes, recorded_at: row.recorded_at,
    });
  }
  return result;
}

export function parseRosterPlanningPeriod(value: unknown, date: string): RosterPlanningPeriod | null {
  if (!isRosterPlanningDate(date) || !Array.isArray(value) || value.length !== 1) return null;
  const row: unknown = value[0];
  if (!isRecord(row) || !isEmploymentEffectiveDate(row.start_on) ||
    !isEmploymentEffectiveDate(row.end_on) || !isEmploymentEffectiveDate(row.previous_on) ||
    !isEmploymentEffectiveDate(row.next_on) || !isWeekday(row.weekday) ||
    typeof row.start_at !== "string" || !Number.isFinite(Date.parse(row.start_at)) ||
    typeof row.end_at !== "string" || !Number.isFinite(Date.parse(row.end_at)) ||
    Date.parse(row.end_at) <= Date.parse(row.start_at) ||
    row.start_on > date || date >= row.end_on || row.next_on !== row.end_on ||
    row.previous_on !== addDays(row.start_on, -1)) return null;
  const length = (Date.parse(`${row.end_on}T00:00:00Z`) - Date.parse(`${row.start_on}T00:00:00Z`)) / 86400000;
  const startDay = new Date(`${row.start_on}T00:00:00Z`).getUTCDay() || 7;
  if (!Number.isInteger(length) || length < 1 || length > 7 || startDay !== row.weekday) return null;
  return {
    start_on: row.start_on, end_on: row.end_on, weekday: row.weekday,
    previous_on: row.previous_on, next_on: row.next_on, start_at: row.start_at, end_at: row.end_at,
  };
}
