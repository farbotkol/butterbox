import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BusinessReportValidationError, businessReportCsv, validateBusinessReport,
} from "../src/lib/business-report-export.ts";

const scope = {
  businessId: "b9130000-0000-4000-8000-000000000001",
  venueId: "c9130000-0000-4000-8000-000000000001",
  venueName: "Sydney",
  venueTimezone: "Australia/Sydney",
  weekStart: "2024-09-30",
  reportType: "roster",
};
const metadata = {
  event_id: "99130000-0000-4000-8000-000000000001",
  business_id: scope.businessId,
  venue_id: scope.venueId,
  venue_name: scope.venueName,
  venue_timezone: scope.venueTimezone,
  week_start: scope.weekStart,
  period_start_utc: "2024-09-29T14:00:00.000000Z",
  period_end_utc: "2024-10-06T13:00:00.000000Z",
};
const rosterRow = {
  shift_id: "19130000-0000-4000-8000-000000000001",
  department_id: "d9130000-0000-4000-8000-000000000001",
  department_name: "FOH",
  employee_id: "e9130000-0000-4000-8000-000000000001",
  employee_name: ' =1+1, "Example"',
  role_title: "+Server",
  starts_at_utc: "2024-09-29T14:00:00.000000Z",
  ends_at_utc: "2024-09-29T15:00:00.000001Z",
  break_minutes: 30,
  status: "scheduled",
  is_published: true,
};
const attendanceRow = {
  session_id: "29130000-0000-4000-8000-000000000001",
  department_id: rosterRow.department_id,
  department_name: rosterRow.department_name,
  employee_id: rosterRow.employee_id,
  employee_name: rosterRow.employee_name,
  clock_in_utc: rosterRow.starts_at_utc,
  clock_out_utc: rosterRow.ends_at_utc,
  period_reference_utc: rosterRow.starts_at_utc,
  period_reference_basis: "clock_in",
  elapsed_seconds: "3600.000001",
  worked_seconds: "3590.000001",
  timesheet_status: "approved",
  has_exceptions: true,
};
const roster = { ...metadata, report_type: "roster", entry_count: 1, rows: [rosterRow] };
const attendanceScope = { ...scope, reportType: "attendance" };
const attendance = { ...metadata, report_type: "attendance", entry_count: 1, rows: [attendanceRow] };

function parseCsv(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = input.charCodeAt(0) === 0xfeff ? 1 : 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted && ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ",") { row.push(cell); cell = ""; }
    else if (!quoted && ch === "\r" && input[i + 1] === "\n") {
      row.push(cell); rows.push(row); row = []; cell = ""; i++;
    } else cell += ch;
  }
  assert.equal(quoted, false);
  assert.deepEqual(row, []);
  return rows;
}

function rejected(payload, expectedScope = scope) {
  assert.throws(() => validateBusinessReport(payload, expectedScope), BusinessReportValidationError);
}

test("roster CSV has the exact minimal shape and safely quotes spreadsheet formulas", () => {
  const csv = businessReportCsv(validateBusinessReport(roster, scope));
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.endsWith("\r\n"));
  const [headers, line] = parseCsv(csv);
  assert.deepEqual(headers, [
    "export_event_id", "business_id", "venue_id", "venue_name", "venue_timezone",
    "week_start", "period_start_utc", "period_end_utc", "shift_id", "department_id",
    "department_name", "employee_id", "employee_name", "role_title", "starts_at_utc",
    "ends_at_utc", "break_minutes", "status", "is_published",
  ]);
  assert.deepEqual(line, [
    metadata.event_id, scope.businessId, scope.venueId, scope.venueName, scope.venueTimezone,
    scope.weekStart, metadata.period_start_utc, metadata.period_end_utc, rosterRow.shift_id,
    rosterRow.department_id, "FOH", rosterRow.employee_id, `'${rosterRow.employee_name}`,
    "'+Server", rosterRow.starts_at_utc, rosterRow.ends_at_utc, "30", "scheduled", "true",
  ]);
  for (const prefix of ["=1+1", " \t@SUM(1)", "\n-42", "\u200b+2", "\ufeff=2"]) {
    const changed = { ...roster, rows: [{ ...rosterRow, department_name: prefix }] };
    const parsed = parseCsv(businessReportCsv(validateBusinessReport(changed, scope)));
    assert.equal(parsed[1][10], `'${prefix}`);
  }
});

test("attendance CSV preserves precise seconds and clearly labels pending or missing events", () => {
  const open = {
    ...attendanceRow, session_id: "29130000-0000-4000-8000-000000000002",
    clock_out_utc: null, elapsed_seconds: null, worked_seconds: null, timesheet_status: "pending",
  };
  const noClockIn = {
    ...open, session_id: "29130000-0000-4000-8000-000000000003",
    clock_in_utc: null, clock_out_utc: "2024-10-01T10:00:00.000000Z",
    period_reference_utc: "2024-10-01T10:00:00.000000Z", period_reference_basis: "clock_out",
  };
  const noEvents = {
    ...noClockIn, session_id: "29130000-0000-4000-8000-000000000004",
    clock_out_utc: null, period_reference_basis: "session_created",
  };
  const report = validateBusinessReport({ ...attendance, entry_count: 4, rows: [
    attendanceRow, open, noClockIn, noEvents,
  ] }, attendanceScope);
  const [headers, complete, pending, missingIn, missingBoth] = parseCsv(businessReportCsv(report));
  assert.deepEqual(headers.slice(8), [
    "session_id", "department_id", "department_name", "employee_id", "employee_name",
    "clock_in_utc", "clock_out_utc", "period_reference_utc", "period_reference_basis",
    "elapsed_seconds", "worked_seconds", "timesheet_status", "has_exceptions",
  ]);
  assert.deepEqual(complete.slice(-4), ["3600.000001", "3590.000001", "approved", "true"]);
  assert.deepEqual(pending.slice(-4), ["", "", "pending", "true"]);
  assert.equal(missingIn[16], "clock_out");
  assert.equal(missingBoth[16], "session_created");
});

test("empty reports have headers and showcase exports carry simulation notices", () => {
  const empty = validateBusinessReport({ ...roster, entry_count: 0, rows: [] }, scope);
  assert.equal(parseCsv(businessReportCsv(empty)).length, 1);
  const normal = parseCsv(businessReportCsv(validateBusinessReport(roster, scope)));
  const simulation = parseCsv(businessReportCsv(validateBusinessReport(roster, scope), true));
  assert.equal(simulation[0][0], "simulation_notice");
  assert.equal(simulation[1][0], "SIMULATION ONLY - NOT FOR PAYROLL");
  assert.deepEqual(simulation.map((row) => row.slice(1)), normal);
});

test("the selected venue, business, week, bounds, counts and exact row keys fail closed", () => {
  for (const changed of [
    { event_id: "not-a-uuid" },
    { business_id: "b9130000-0000-4000-8000-000000000002" },
    { venue_id: "c9130000-0000-4000-8000-000000000002" },
    { venue_name: "Changed name" },
    { venue_timezone: "UTC" },
    { week_start: "2024-10-07" },
    { report_type: "attendance" },
    { period_start_utc: "2024-09-29T15:00:00.000000Z" },
    { period_end_utc: "2024-10-06T14:00:00.000000Z" },
    { period_end_utc: "2024-10-06T13:00:00Z" },
    { period_end_utc: "2024-10-06T13:00:60.000000Z" },
    { entry_count: 0 },
    { entry_count: 10001 },
    { rows: null },
    { rows: [rosterRow, rosterRow], entry_count: 2 },
    { unexpected: "private" },
    { rows: [{ ...rosterRow, email: "private@example.test" }] },
    { rows: [{ ...rosterRow, payroll_id: "private" }] },
    { rows: [{ ...rosterRow, gps_latitude: -33 }] },
  ]) rejected({ ...roster, ...changed });
  rejected(roster, { ...scope, venueTimezone: "Invalid/Timezone" });
  const { role_title: omitted, ...missing } = rosterRow;
  assert.ok(omitted);
  rejected({ ...roster, rows: [missing] });
});

test("week membership is start-inclusive, end-exclusive, and allows an end in the following week", () => {
  const last = {
    ...rosterRow, starts_at_utc: "2024-10-06T12:59:59.999999Z",
    ends_at_utc: "2024-10-06T15:00:00.000000Z",
  };
  assert.equal(validateBusinessReport({ ...roster, rows: [last] }, scope).rows.length, 1);
  for (const starts_at_utc of ["2024-09-29T13:59:59.999999Z", "2024-10-06T13:00:00.000000Z"]) {
    rejected({ ...roster, rows: [{ ...last, starts_at_utc }] });
  }
  rejected({ ...roster, rows: [{ ...rosterRow, ends_at_utc: rosterRow.starts_at_utc }] });
  assert.equal(validateBusinessReport({ ...roster, rows: [{
    ...rosterRow, employee_id: null, employee_name: null, is_published: false, status: "cancelled",
  }] }, scope).rows[0].employeeId, null);
  rejected({ ...roster, rows: [{ ...rosterRow, employee_name: null }] });
});

test("the earliest supported week uses representable historical Sydney UTC boundaries", () => {
  const earlyScope = { ...scope, weekStart: "0001-01-08" };
  const early = {
    ...roster, week_start: earlyScope.weekStart, rows: [], entry_count: 0,
    period_start_utc: "0001-01-07T13:55:08.000000Z",
    period_end_utc: "0001-01-14T13:55:08.000000Z",
  };
  assert.equal(validateBusinessReport(early, earlyScope).rows.length, 0);
  rejected({ ...early, week_start: "0001-01-01" }, { ...earlyScope, weekStart: "0001-01-01" });
});

test("attendance rejects inconsistent references, durations, flags, approvals and extra fields", () => {
  for (const changed of [
    { period_reference_basis: "clock_out" },
    { period_reference_utc: "2024-10-06T13:00:00.000000Z" },
    { elapsed_seconds: "3600.000000" },
    { worked_seconds: "3600.000002" },
    { worked_seconds: "-1" },
    { worked_seconds: 3590 },
    { worked_seconds: null },
    { elapsed_seconds: null, worked_seconds: null, timesheet_status: "approved" },
    { timesheet_status: "unknown" },
    { has_exceptions: null },
    { gps_longitude: 151 },
  ]) rejected({ ...attendance, rows: [{ ...attendanceRow, ...changed }] }, attendanceScope);
});
