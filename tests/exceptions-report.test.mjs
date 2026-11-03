import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exceptionsReportWeek, parseExceptionsReport, parseWeeklyHoursThreshold, summariseExceptions,
} from "../src/lib/exceptions-report.ts";

const scope = {
  businessId: "b9120000-0000-4000-8000-000000000001",
  venueId: "c9120000-0000-4000-8000-000000000001",
  venueTimezone: "Australia/Sydney",
  week: "2024-09-30",
};
const employee = "e9120000-0000-4000-8000-000000000001";
const foh = "d9120000-0000-4000-8000-000000000001";
const boh = "d9120000-0000-4000-8000-000000000002";
const shift = {
  shift_id: "f9120000-0000-4000-8000-000000000001",
  employee_id: employee, employee_name: "Example worker", department_id: foh, department_name: "FOH",
  starts_at: "2024-10-01T01:00:00Z", ends_at: "2024-10-01T05:00:00Z",
  break_minutes: 30, scheduled_seconds: 14400,
};
const secondShift = {
  ...shift, shift_id: "f9120000-0000-4000-8000-000000000002",
  department_id: boh, department_name: "BOH",
  starts_at: "2024-10-02T01:00:00Z", ends_at: "2024-10-02T04:00:00Z",
  break_minutes: 0, scheduled_seconds: 10800,
};
const draft = {
  ...shift, shift_id: "f9120000-0000-4000-8000-000000000003",
  starts_at: "2024-10-01T03:00:00Z", ends_at: "2024-10-01T04:00:00Z",
  break_minutes: 0, scheduled_seconds: 3600, is_published: false,
};
const approved = {
  session_id: "29120000-0000-4000-8000-000000000001",
  employee_id: employee, employee_name: "Example worker", department_id: foh, department_name: "FOH",
  venue_id: scope.venueId, venue_name: "Sydney", venue_timezone: scope.venueTimezone,
  clocked_in_at: "2024-10-01T01:00:00Z", clocked_out_at: "2024-10-01T05:00:00Z",
  elapsed_seconds: 14400, worked_seconds: 10800, paid_seconds: 11700,
  paid_break_seconds: 900, unpaid_break_seconds: 2700, exceptions: [], approval_status: "approved",
};
const otherApproved = {
  ...approved, session_id: "29120000-0000-4000-8000-000000000002",
  department_id: boh, department_name: "BOH",
  clocked_in_at: "2024-10-02T01:00:00Z", clocked_out_at: "2024-10-02T03:00:00Z",
  elapsed_seconds: 7200, worked_seconds: 7200, paid_seconds: 7200,
  paid_break_seconds: 0, unpaid_break_seconds: 0,
};
const pending = {
  ...otherApproved, session_id: "29120000-0000-4000-8000-000000000003", approval_status: "pending",
};
const missingOut = {
  ...pending, session_id: "29120000-0000-4000-8000-000000000004", clocked_out_at: null,
  elapsed_seconds: null, worked_seconds: null, paid_seconds: null, paid_break_seconds: null,
  unpaid_break_seconds: null, exceptions: ["missing_clock_out"],
};
const missingIn = {
  ...missingOut, session_id: "29120000-0000-4000-8000-000000000005",
  clocked_in_at: null, clocked_out_at: "2024-10-03T03:00:00Z", exceptions: ["missing_clock_in"],
};
const raw = {
  business_id: scope.businessId, venue_id: scope.venueId, week_start: scope.week,
  planned: [shift, secondShift], actual: [approved, otherApproved, pending, missingOut, missingIn],
  overlaps: [{ ...shift, is_published: true }, draft],
};

test("the optional operational threshold has no default and strictly accepts hundredths", () => {
  assert.equal(parseWeeklyHoursThreshold(undefined), null);
  assert.equal(parseWeeklyHoursThreshold(""), null);
  assert.equal(parseWeeklyHoursThreshold("0.01"), 1);
  assert.equal(parseWeeklyHoursThreshold("40"), 4000);
  assert.equal(parseWeeklyHoursThreshold("40.5"), 4050);
  assert.equal(parseWeeklyHoursThreshold("1000.00"), 100000);
  for (const invalid of ["0", "0.00", "1000.01", "-1", "01", ".5", "1.001", "1e2", " 40", ["40"], null]) {
    assert.equal(parseWeeklyHoursThreshold(invalid), undefined);
  }
});

test("summaries separately compare scheduled and approved worked time and retain source exceptions", () => {
  const report = parseExceptionsReport(raw, scope);
  assert.ok(report);
  const unevaluated = summariseExceptions(report, null);
  assert.equal(unevaluated.hours, null);
  assert.equal(unevaluated.excludedEntries, 3);
  assert.deepEqual(unevaluated.overlaps.map((row) => row.shift_id), [shift.shift_id, draft.shift_id]);
  assert.deepEqual(unevaluated.missingClockEvents.map((row) => row.session_id), [missingOut.session_id, missingIn.session_id]);
  const evaluated = summariseExceptions(report, 500);
  assert.deepEqual(evaluated.hours, [{
    employeeId: employee, employeeName: "Example worker", scheduledSeconds: 25200,
    approvedWorkedSeconds: 18000, scheduledExceeds: true, approvedWorkedExceeds: false,
  }]);
  assert.equal(summariseExceptions(report, 499).hours[0].approvedWorkedExceeds, true);
  assert.deepEqual(summariseExceptions(report, 700).hours, []);
});

test("threshold comparisons use exact microseconds rather than rounded displayed seconds", () => {
  const tinyShift = {
    ...shift, starts_at: "2024-10-01T01:00:00Z", ends_at: "2024-10-01T05:00:00.000001Z",
    scheduled_seconds: 14400.000001,
  };
  const report = parseExceptionsReport({ ...raw, planned: [tinyShift], actual: [], overlaps: [] }, scope);
  assert.ok(report);
  assert.equal(summariseExceptions(report, 400).hours[0].scheduledExceeds, true);
  assert.deepEqual(summariseExceptions(report, 401).hours, []);
  assert.equal(summariseExceptions(report, 0), null);
  const large = { ...report.planned[0], scheduled_seconds: 5_000_000_000 };
  assert.equal(summariseExceptions({ ...report, planned: [large, large] }, 400), null);
});

test("report week boundaries preserve reliable source links and reject invalid timezones", () => {
  assert.equal(exceptionsReportWeek("0999-12-30", "UTC"), null);
  assert.equal(exceptionsReportWeek("1000-01-05", "UTC"), null);
  assert.equal(exceptionsReportWeek("1000-01-06", "UTC"), "1000-01-06");
  assert.equal(exceptionsReportWeek("1000-01-12", "UTC"), "1000-01-06");
  assert.equal(exceptionsReportWeek("9998-12-24", "UTC"), "9998-12-21");
  assert.equal(exceptionsReportWeek("9998-12-25", "UTC"), null);
  const earlyScope = { ...scope, venueTimezone: "UTC", week: "1000-01-06" };
  const early = {
    ...shift, starts_at: "1000-01-06T01:00:00Z", ends_at: "1000-01-06T05:00:00Z",
  };
  const input = {
    ...raw, week_start: earlyScope.week, planned: [early], actual: [], overlaps: [],
  };
  assert.ok(parseExceptionsReport(input, earlyScope));
  assert.equal(parseExceptionsReport({ ...input, week_start: "0001-01-01" },
    { ...earlyScope, week: "0001-01-01" }), null);
  assert.equal(parseExceptionsReport(input, { ...earlyScope, venueTimezone: "Invalid/Timezone" }), null);
});

test("malformed, incomplete or cross-scope report data fail closed", () => {
  for (const changed of [
    { business_id: "b9120000-0000-4000-8000-000000000002" },
    { venue_id: "c9120000-0000-4000-8000-000000000002" },
    { week_start: "2024-10-07" }, { planned: null },
    { planned: [shift, shift] }, { actual: [approved, approved] }, { overlaps: [draft, draft] },
    { actual: [{ ...approved, venue_id: "c9120000-0000-4000-8000-000000000002" }] },
    { actual: [{ ...approved, venue_timezone: "UTC" }] },
    { actual: [{ ...approved, approval_status: "unknown" }] },
    { actual: [{ ...missingOut, approval_status: "approved" }] },
    { actual: [{ ...approved, employee_name: "Changed name" }] },
    { overlaps: [{ ...draft, is_published: true }] },
    { overlaps: [{ ...shift, is_published: false }] },
    { overlaps: [{ ...shift, employee_name: "Changed name", is_published: true }] },
    { planned: [{ ...shift, starts_at: "2024-09-23T01:00:00Z", ends_at: "2024-09-23T05:00:00Z" }] },
    { actual: [{ ...approved, clocked_in_at: "2024-10-08T01:00:00Z", clocked_out_at: "2024-10-08T05:00:00Z" }] },
  ]) assert.equal(parseExceptionsReport({ ...raw, ...changed }, scope), null, JSON.stringify(changed));
});
