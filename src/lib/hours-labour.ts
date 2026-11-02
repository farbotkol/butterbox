import { parseTimesheetEmployeeFilter } from "./weekly-timesheet.ts";
import { validTimezone } from "./attendance.ts";

export { parseTimesheetEmployeeFilter as parseReportFilter } from "./weekly-timesheet.ts";

export type HoursLabourScope = {
  businessId: string;
  week: string;
  venueId: string | null;
  departmentId: string | null;
};
export type HoursLabourTotals = {
  scheduled_seconds: number;
  approved_worked_seconds: number;
  approved_paid_seconds: number;
  scheduled_shifts: number;
  approved_entries: number;
  excluded_entries: number;
  invalid_entries: number;
};
export type HoursLabourRow = HoursLabourTotals & {
  business_id: string;
  week_start: string;
  venue_id: string;
  venue_name: string;
  venue_timezone: string;
  department_id: string;
  department_name: string;
};

const durations = ["scheduled_seconds", "approved_worked_seconds", "approved_paid_seconds"] as const;
const counts = ["scheduled_shifts", "approved_entries", "excluded_entries", "invalid_entries"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function microseconds(value: unknown): bigint | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const result = Math.round(value * 1_000_000);
  return Number.isSafeInteger(result) ? BigInt(result) : null;
}

export function parseHoursLabour(value: unknown, scope: HoursLabourScope): HoursLabourRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: HoursLabourRow[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || row.business_id !== scope.businessId || row.week_start !== scope.week ||
      typeof row.venue_id !== "string" || typeof row.department_id !== "string" ||
      !parseTimesheetEmployeeFilter(row.venue_id) || !parseTimesheetEmployeeFilter(row.department_id) ||
      (scope.venueId !== null && row.venue_id !== scope.venueId) ||
      (scope.departmentId !== null && row.department_id !== scope.departmentId) ||
      !isText(row.venue_name) || !isText(row.department_name) ||
      typeof row.venue_timezone !== "string" || !validTimezone(row.venue_timezone) ||
      durations.some((key) => microseconds(row[key]) === null) ||
      counts.some((key) => typeof row[key] !== "number" || !Number.isSafeInteger(row[key]) || row[key] < 0)) {
      return null;
    }
    const scheduled = Number(row.scheduled_seconds);
    const worked = Number(row.approved_worked_seconds);
    const paid = Number(row.approved_paid_seconds);
    const shifts = Number(row.scheduled_shifts);
    const approved = Number(row.approved_entries);
    const excluded = Number(row.excluded_entries);
    const invalid = Number(row.invalid_entries);
    if (paid < worked || invalid > excluded || (shifts === 0 && scheduled !== 0) ||
      (approved === 0 && (worked !== 0 || paid !== 0))) return null;
    const key = `${row.venue_id.toLowerCase()}:${row.department_id.toLowerCase()}`;
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({
      business_id: row.business_id, week_start: row.week_start, venue_id: row.venue_id,
      venue_name: row.venue_name, venue_timezone: row.venue_timezone,
      department_id: row.department_id, department_name: row.department_name,
      scheduled_seconds: scheduled, approved_worked_seconds: worked, approved_paid_seconds: paid,
      scheduled_shifts: shifts, approved_entries: approved, excluded_entries: excluded, invalid_entries: invalid,
    });
  }
  return rows;
}

export function totalHoursLabour(rows: HoursLabourRow[]): HoursLabourTotals | null {
  const totals: HoursLabourTotals = {
    scheduled_seconds: 0, approved_worked_seconds: 0, approved_paid_seconds: 0,
    scheduled_shifts: 0, approved_entries: 0, excluded_entries: 0, invalid_entries: 0,
  };
  for (const key of [...durations, ...counts]) {
    const total = rows.reduce((sum, row) => sum + (durations.some((duration) => duration === key)
      ? BigInt(Math.round(row[key] * 1_000_000)) : BigInt(row[key])), BigInt(0));
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    totals[key] = Number(total) / (durations.some((duration) => duration === key) ? 1_000_000 : 1);
  }
  return totals;
}

export function parseIllustrativeRate(value: unknown): number | null | undefined {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents <= 1_000_000 ? cents : undefined;
}

export function illustrativeCostCents(seconds: number, rateCents: number): number | null {
  const duration = microseconds(seconds);
  if (duration === null || !Number.isSafeInteger(rateCents) || rateCents < 0 || rateCents > 1_000_000) return null;
  const divisor = BigInt(3_600_000_000);
  const cents = (duration * BigInt(rateCents) + divisor / BigInt(2)) / divisor;
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}
