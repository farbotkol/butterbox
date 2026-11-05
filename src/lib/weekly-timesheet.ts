import { Temporal } from "@js-temporal/polyfill";
import { parseCorrectionEvents, type CorrectionEvent } from "./attendance-corrections.ts";
import { getWeekStart } from "./dates.ts";
import { parseWorkedTime, type WorkedTime } from "./worked-time.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TimesheetEmployee = { id: string; name: string };
export type TimesheetPlannedShift = {
  shift_id: string;
  employee_id: string;
  employee_name: string;
  department_id: string;
  department_name: string;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  scheduled_seconds: number;
};
export type TimesheetSourceEvent = CorrectionEvent & {
  source: "server_clock" | "offline_claim" | "manager_reported" | "employee_request";
};
export type TimesheetEditTime = WorkedTime & { edit_revision: string; edit_locked: boolean };
export type TimesheetEditEvent = TimesheetSourceEvent & { edit_revision: string };
export type BulkLockSelection = { session_id: string; revision: string };
export type BulkLockReceipt = {
  batchId: string;
  lockedCount: number;
  invalidCount: number;
  alreadyLockedCount: number;
};
export type StoredBulkLockReceipt = BulkLockReceipt & { weekStart: string; employeeId: string | null };
export type WeeklyTimesheetGroup<T extends WorkedTime = WorkedTime> = {
  employeeId: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  planned: TimesheetPlannedShift[];
  actual: T[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

function isEditRevision(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function exactMicroseconds(value: number): bigint | null {
  const microseconds = Math.round(value * 1_000_000);
  return Number.isSafeInteger(microseconds) && microseconds >= 0 ? BigInt(microseconds) : null;
}

export function timesheetWeek(value: unknown, timezone: string): string | null {
  if (value === undefined || value === "") return getWeekStart(undefined, timezone);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "0001-01-01" || value > "9998-12-24") return null;
  const candidate = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(candidate.valueOf()) || candidate.toISOString().slice(0, 10) !== value) return null;
  const week = getWeekStart(value, timezone);
  return week >= "0001-01-01" && week <= "9998-12-24" ? week : null;
}

export function parseTimesheetEmployeeFilter(value: unknown): string | null | undefined {
  if (value === undefined || value === "") return null;
  return isUuid(value) ? value : undefined;
}

export function parseTimesheetEmployees(value: unknown): TimesheetEmployee[] | null {
  if (!Array.isArray(value)) return null;
  const rows: TimesheetEmployee[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.id) || !isText(row.name)) return null;
    const key = row.id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({ id: row.id, name: row.name });
  }
  return rows;
}

export function timesheetEmployeeOptions(
  current: TimesheetEmployee[], planned: TimesheetPlannedShift[], actual: WorkedTime[],
): TimesheetEmployee[] | null {
  const employees = new Map<string, TimesheetEmployee>();
  const candidates = [
    ...current,
    ...planned.map((row) => ({ id: row.employee_id, name: row.employee_name })),
    ...actual.map((row) => ({ id: row.employee_id, name: row.employee_name })),
  ];
  for (const candidate of candidates) {
    const key = candidate.id.toLowerCase();
    const previous = employees.get(key);
    if (previous && previous.name !== candidate.name) return null;
    employees.set(key, candidate);
  }
  return [...employees.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function parseTimesheetPlannedShifts(value: unknown): TimesheetPlannedShift[] | null {
  if (!Array.isArray(value)) return null;
  const rows: TimesheetPlannedShift[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isUuid(row.shift_id) || !isUuid(row.employee_id) ||
      !isUuid(row.department_id) || !isText(row.employee_name) || !isText(row.department_name) ||
      typeof row.starts_at !== "string" || typeof row.ends_at !== "string" ||
      typeof row.break_minutes !== "number" || !Number.isInteger(row.break_minutes) ||
      row.break_minutes < 0 || row.break_minutes > 240 ||
      typeof row.scheduled_seconds !== "number" || !Number.isFinite(row.scheduled_seconds) ||
      row.scheduled_seconds <= 0) return null;
    const duration = exactMicroseconds(row.scheduled_seconds);
    if (duration === null) return null;
    try {
      const start = Temporal.Instant.from(row.starts_at);
      const end = Temporal.Instant.from(row.ends_at);
      const nanoseconds = end.epochNanoseconds - start.epochNanoseconds;
      const thousand = BigInt(1000);
      if (nanoseconds <= BigInt(0) || nanoseconds % thousand !== BigInt(0) ||
        nanoseconds / thousand !== duration) return null;
    } catch (error) {
      if (error instanceof RangeError) return null;
      throw error;
    }
    const key = row.shift_id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({
      shift_id: row.shift_id, employee_id: row.employee_id, employee_name: row.employee_name,
      department_id: row.department_id, department_name: row.department_name,
      starts_at: row.starts_at, ends_at: row.ends_at,
      break_minutes: row.break_minutes, scheduled_seconds: row.scheduled_seconds,
    });
  }
  return rows;
}

export function parseTimesheetSourceEvents(value: unknown): TimesheetSourceEvent[] | null {
  const events = parseCorrectionEvents(value);
  if (!events || !Array.isArray(value)) return null;
  const rows: TimesheetSourceEvent[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const raw: unknown = value[index];
    if (!isRecord(raw) ||
      (raw.source !== "server_clock" && raw.source !== "offline_claim" && raw.source !== "manager_reported" &&
        raw.source !== "employee_request")) {
      return null;
    }
    rows.push({ ...events[index], source: raw.source });
  }
  return rows;
}

export function parseTimesheetEditTime(value: unknown): TimesheetEditTime[] | null {
  const rows = parseWorkedTime(value);
  if (!rows || !Array.isArray(value)) return null;
  const result: TimesheetEditTime[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const raw: unknown = value[index];
    if (!isRecord(raw) || !isEditRevision(raw.edit_revision) || typeof raw.edit_locked !== "boolean") return null;
    result.push({ ...rows[index], edit_revision: raw.edit_revision, edit_locked: raw.edit_locked });
  }
  return result;
}

export function parseTimesheetEditEvents(value: unknown): TimesheetEditEvent[] | null {
  const events = parseTimesheetSourceEvents(value);
  if (!events || !Array.isArray(value)) return null;
  const result: TimesheetEditEvent[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const raw: unknown = value[index];
    if (!isRecord(raw) || !isEditRevision(raw.edit_revision)) return null;
    result.push({ ...events[index], edit_revision: raw.edit_revision });
  }
  return result;
}

export function parseBulkLockSelections(value: unknown): BulkLockSelection[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const selections: BulkLockSelection[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const parts = entry.split(":");
    if (parts.length !== 2 || !isUuid(parts[0]) || !isEditRevision(parts[1])) return null;
    const sessionId = parts[0].toLowerCase();
    if (seen.has(sessionId)) return null;
    seen.add(sessionId);
    selections.push({ session_id: sessionId, revision: parts[1] });
  }
  return selections;
}

export function parseBulkLockReceipt(value: unknown): BulkLockReceipt | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  if (!isUuid(row.batch_id) ||
    typeof row.locked_count !== "number" || !Number.isInteger(row.locked_count) || row.locked_count < 0 ||
    typeof row.invalid_count !== "number" || !Number.isInteger(row.invalid_count) || row.invalid_count < 0 ||
    typeof row.already_locked_count !== "number" || !Number.isInteger(row.already_locked_count) ||
    row.already_locked_count < 0) return null;
  const count = row.locked_count + row.invalid_count + row.already_locked_count;
  if (count < 1 || count > 100) return null;
  return {
    batchId: row.batch_id, lockedCount: row.locked_count, invalidCount: row.invalid_count,
    alreadyLockedCount: row.already_locked_count,
  };
}

export function parseStoredBulkLockReceipt(value: unknown): StoredBulkLockReceipt | null {
  const receipt = parseBulkLockReceipt(value);
  if (!receipt || !Array.isArray(value) || !isRecord(value[0])) return null;
  const row = value[0];
  if (typeof row.week_start !== "string" || timesheetWeek(row.week_start, "UTC") !== row.week_start ||
    (row.employee_id !== null && !isUuid(row.employee_id))) return null;
  return { ...receipt, weekStart: row.week_start, employeeId: row.employee_id };
}

export function timesheetSourcesMatch(actual: WorkedTime[], events: TimesheetSourceEvent[]): boolean {
  const bySession = new Map(actual.map((row) => [row.session_id.toLowerCase(), row]));
  const clocks = new Map<string, { clock_in?: string; clock_out?: string }>();
  for (const event of events) {
    const sessionId = event.session_id.toLowerCase();
    const row = bySession.get(sessionId);
    if (!row || event.finished !== (row.clocked_in_at !== null && row.clocked_out_at !== null)) return false;
    if (event.event_type === "clock_in" || event.event_type === "clock_out") {
      const sessionClocks = clocks.get(sessionId) ?? {};
      if (sessionClocks[event.event_type] !== undefined) return false;
      sessionClocks[event.event_type] = event.effective_at;
      clocks.set(sessionId, sessionClocks);
    }
  }
  try {
    for (const row of actual) {
      const sessionClocks = clocks.get(row.session_id.toLowerCase());
      const timePairs: [string | null, string | undefined][] = [
        [row.clocked_in_at, sessionClocks?.clock_in],
        [row.clocked_out_at, sessionClocks?.clock_out],
      ];
      for (const [actualTime, eventTime] of timePairs) {
        if (actualTime === null ? eventTime !== undefined :
          eventTime === undefined || Temporal.Instant.compare(actualTime, eventTime) !== 0) return false;
      }
    }
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
  return true;
}

export function timesheetEditSourcesMatch(actual: TimesheetEditTime[], events: TimesheetEditEvent[]): boolean {
  if (!timesheetSourcesMatch(actual, events)) return false;
  const bySession = new Map(actual.map((row) => [row.session_id.toLowerCase(), row]));
  return events.every((event) => {
    const row = bySession.get(event.session_id.toLowerCase());
    return row && row.edit_revision === event.edit_revision && row.edit_locked === event.locked;
  });
}

export function groupWeeklyTimesheets<T extends WorkedTime>(
  planned: TimesheetPlannedShift[], actual: T[],
): WeeklyTimesheetGroup<T>[] | null {
  const groups = new Map<string, WeeklyTimesheetGroup<T>>();
  function groupFor(row: TimesheetPlannedShift | T): WeeklyTimesheetGroup<T> | null {
    const key = `${row.employee_id}:${row.department_id}`.toLowerCase();
    const existing = groups.get(key);
    if (existing && (existing.employeeName !== row.employee_name || existing.departmentName !== row.department_name)) {
      return null;
    }
    const group: WeeklyTimesheetGroup<T> = existing ?? {
      employeeId: row.employee_id, employeeName: row.employee_name,
      departmentId: row.department_id, departmentName: row.department_name, planned: [], actual: [],
    };
    groups.set(key, group);
    return group;
  }
  for (const row of planned) {
    const group = groupFor(row);
    if (!group) return null;
    group.planned.push(row);
  }
  for (const row of actual) {
    const group = groupFor(row);
    if (!group) return null;
    group.actual.push(row);
  }
  return [...groups.values()].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName) || a.departmentName.localeCompare(b.departmentName) ||
    a.employeeId.localeCompare(b.employeeId) || a.departmentId.localeCompare(b.departmentId));
}

export function weeklyTimesheetNotices(group: WeeklyTimesheetGroup): string[] {
  const notices: string[] = [];
  if (!group.planned.length) notices.push("No published shifts start in this week.");
  if (!group.actual.length) notices.push("No attendance sessions are attributed to this week.");
  if (group.actual.some((row) => row.elapsed_seconds === null)) {
    notices.push("Incomplete or invalid attendance is excluded from recorded totals.");
  }
  if (group.planned.length && group.actual.length && group.planned.length !== group.actual.length) {
    notices.push("The number of shifts and sessions differs; review individual records.");
  }
  const complete = group.actual.filter((row) => row.elapsed_seconds !== null);
  if (group.planned.length && complete.length) {
    const planned = group.planned.map((row) => exactMicroseconds(row.scheduled_seconds));
    const actual = complete.map((row) => exactMicroseconds(row.elapsed_seconds ?? -1));
    const incomplete = complete.length !== group.actual.length;
    if (planned.some((value) => value === null) || actual.some((value) => value === null)) {
      notices.push("The weekly totals are too large to compare safely.");
    } else if (planned.reduce<bigint>((sum, value) => sum + (value ?? BigInt(0)), BigInt(0)) !==
      actual.reduce<bigint>((sum, value) => sum + (value ?? BigInt(0)), BigInt(0))) {
      notices.push(incomplete
        ? "Known recorded elapsed differs from scheduled span; incomplete attendance prevents a full comparison."
        : "Scheduled span and recorded elapsed time differ; review individual records.");
    } else if (!incomplete) {
      notices.push("Weekly spans match; review individual times and breaks.");
    }
  }
  return notices;
}
