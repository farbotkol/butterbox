const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ClockOption = {
  employee_id: string;
  employee_name: string;
  department_id: string;
  department_name: string;
};

export type BreakClassification = "paid" | "unpaid";

export type AttendanceState =
  | { state: "clocked_out" | "needs_review" }
  | {
      state: "clocked_in";
      session_id: string;
      venue_id: string;
      venue_name: string;
      venue_timezone: string;
      department_name: string;
      clocked_in_at: string;
      active_break: null | {
        id: string;
        classification: BreakClassification;
        started_at: string;
      };
    };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: value });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function parseClockOptions(value: unknown): ClockOption[] | null {
  if (!Array.isArray(value)) return null;
  const options: ClockOption[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!record(row) || typeof row.employee_id !== "string" || !uuid.test(row.employee_id) ||
      typeof row.department_id !== "string" || !uuid.test(row.department_id) ||
      typeof row.employee_name !== "string" || !row.employee_name.trim() ||
      typeof row.department_name !== "string" || !row.department_name.trim()) return null;
    const key = `${row.employee_id}:${row.department_id}`.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    options.push({
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      department_id: row.department_id,
      department_name: row.department_name,
    });
  }
  return options;
}

export function parseClockOptionValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const parts = value.split(":");
  if (parts.length !== 2 || !uuid.test(parts[0]) || !uuid.test(parts[1])) return null;
  return { employeeId: parts[0], departmentId: parts[1] };
}

export function parseBreakClassification(value: FormDataEntryValue | null): BreakClassification | null {
  return value === "paid" || value === "unpaid" ? value : null;
}

export function parseClockReceipt(value: unknown) {
  if (!Array.isArray(value) || value.length !== 1 || !record(value[0])) return null;
  const row = value[0];
  if (typeof row.session_id !== "string" || !uuid.test(row.session_id) ||
    typeof row.event_id !== "string" || !uuid.test(row.event_id) ||
    typeof row.occurred_at !== "string" || Number.isNaN(Date.parse(row.occurred_at))) return null;
  return { sessionId: row.session_id, eventId: row.event_id, occurredAt: row.occurred_at };
}

export function parseAttendanceState(value: unknown): AttendanceState | null {
  if (!record(value)) return null;
  if (value.state === "clocked_out" || value.state === "needs_review") {
    if (value.session_id !== null || value.venue_id !== null || value.venue_name !== null ||
      value.venue_timezone !== null || value.department_name !== null ||
      value.clocked_in_at !== null || value.break_id !== null ||
      value.break_classification !== null || value.break_started_at !== null) return null;
    return { state: value.state };
  }
  if (value.state !== "clocked_in" || typeof value.session_id !== "string" ||
    !uuid.test(value.session_id) || typeof value.venue_id !== "string" || !uuid.test(value.venue_id) ||
    typeof value.venue_name !== "string" || !value.venue_name.trim() ||
    typeof value.venue_timezone !== "string" || !validTimezone(value.venue_timezone) ||
    typeof value.department_name !== "string" || !value.department_name.trim() ||
    typeof value.clocked_in_at !== "string" || Number.isNaN(Date.parse(value.clocked_in_at))) {
    return null;
  }
  let activeBreak: Extract<AttendanceState, { state: "clocked_in" }>["active_break"] = null;
  if (value.break_id !== null || value.break_classification !== null || value.break_started_at !== null) {
    if (typeof value.break_id !== "string" || !uuid.test(value.break_id) ||
      (value.break_classification !== "paid" && value.break_classification !== "unpaid") ||
      typeof value.break_started_at !== "string" || Number.isNaN(Date.parse(value.break_started_at)) ||
      Date.parse(value.break_started_at) < Date.parse(value.clocked_in_at)) return null;
    activeBreak = {
      id: value.break_id,
      classification: value.break_classification,
      started_at: value.break_started_at,
    };
  }
  return {
    state: "clocked_in",
    session_id: value.session_id,
    venue_id: value.venue_id,
    venue_name: value.venue_name,
    venue_timezone: value.venue_timezone,
    department_name: value.department_name,
    clocked_in_at: value.clocked_in_at,
    active_break: activeBreak,
  };
}
