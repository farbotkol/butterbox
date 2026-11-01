import assert from "node:assert/strict";
import { test } from "node:test";
import {
  groupWeeklyTimesheets, parseBulkLockReceipt, parseBulkLockSelections, parseStoredBulkLockReceipt,
  parseTimesheetEditEvents, parseTimesheetEditTime, parseTimesheetEmployeeFilter, parseTimesheetEmployees,
  parseTimesheetPlannedShifts, parseTimesheetSourceEvents, timesheetEditSourcesMatch,
  timesheetEmployeeOptions, timesheetSourcesMatch, timesheetWeek, weeklyTimesheetNotices,
} from "../src/lib/weekly-timesheet.ts";

const employeeId = "e1000000-0000-4000-8000-000000000001";
const departmentId = "d1000000-0000-4000-8000-000000000001";
const shift = {
  shift_id: "51000000-0000-4000-8000-000000000001",
  employee_id: employeeId, employee_name: "Worker", department_id: departmentId, department_name: "FOH",
  starts_at: "2024-10-05T13:30:00.123456Z", ends_at: "2024-10-05T17:30:00.123457Z",
  break_minutes: 30, scheduled_seconds: 14400.000001,
};
const actual = {
  session_id: "21000000-0000-4000-8000-000000000001",
  employee_id: employeeId, employee_name: "Worker", department_id: departmentId, department_name: "FOH",
  venue_id: "c1000000-0000-4000-8000-000000000001", venue_name: "Harbour",
  venue_timezone: "Australia/Sydney", clocked_in_at: shift.starts_at, clocked_out_at: shift.ends_at,
  elapsed_seconds: 14400.000001, worked_seconds: 12600.000001, paid_seconds: 12600.000001,
  paid_break_seconds: 0, unpaid_break_seconds: 1800, exceptions: [],
};
const event = {
  event_id: "41000000-0000-4000-8000-000000000001", session_id: actual.session_id,
  event_type: "clock_in", classification: null, original_at: shift.starts_at,
  effective_at: shift.starts_at, finished: true, locked: false, source: "server_clock",
};
const revision = "a".repeat(64);

test("weekly filter dates are valid and normalized to the venue week", () => {
  assert.equal(timesheetWeek("2024-10-06", "Australia/Sydney"), "2024-09-30");
  assert.equal(timesheetWeek("2024-10-07", "Australia/Sydney"), "2024-10-07");
  for (const invalid of ["2024-02-31", "not-a-date", "0000-01-01", "9999-12-31", ["2024-10-07"]]) {
    assert.equal(timesheetWeek(invalid, "Australia/Sydney"), null);
  }
  assert.equal(parseTimesheetEmployeeFilter(undefined), null);
  assert.equal(parseTimesheetEmployeeFilter(""), null);
  assert.equal(parseTimesheetEmployeeFilter(employeeId), employeeId);
  assert.equal(parseTimesheetEmployeeFilter("not-an-id"), undefined);
  assert.equal(parseTimesheetEmployeeFilter([employeeId]), undefined);
});

test("weekly filters and planned shifts reject incomplete or inconsistent results", () => {
  assert.deepEqual(parseTimesheetEmployees([{ id: employeeId, name: "Worker" }]),
    [{ id: employeeId, name: "Worker" }]);
  assert.equal(parseTimesheetEmployees([{ id: employeeId, name: " " }]), null);
  assert.equal(parseTimesheetEmployees([
    { id: employeeId, name: "Worker" }, { id: employeeId.toUpperCase(), name: "Worker" },
  ]), null);
  assert.deepEqual(parseTimesheetPlannedShifts([shift]), [shift]);
  for (const invalid of [
    { ...shift, shift_id: "bad" }, { ...shift, starts_at: "not-a-time" },
    { ...shift, ends_at: shift.starts_at }, { ...shift, break_minutes: 241 },
    { ...shift, scheduled_seconds: 14400 }, { ...shift, scheduled_seconds: NaN },
  ]) assert.equal(parseTimesheetPlannedShifts([invalid]), null);
  assert.equal(parseTimesheetPlannedShifts([shift, shift]), null);
  assert.equal(parseTimesheetPlannedShifts(null), null);
});

test("source events retain original time, corrections and provenance", () => {
  assert.deepEqual(parseTimesheetSourceEvents([event]), [event]);
  const corrected = { ...event, effective_at: "2024-10-05T13:35:00Z", source: "offline_claim" };
  assert.deepEqual(parseTimesheetSourceEvents([corrected]), [corrected]);
  assert.equal(parseTimesheetSourceEvents([{ ...event, source: "unknown" }]), null);
  assert.equal(parseTimesheetSourceEvents([{ ...event, event_type: "unknown" }]), null);
  assert.equal(parseTimesheetSourceEvents([event, event]), null);
});

test("employee options include scoped historical records without exposing unrelated employees", () => {
  assert.deepEqual(timesheetEmployeeOptions([], [shift], [actual]), [{ id: employeeId, name: "Worker" }]);
  assert.deepEqual(timesheetEmployeeOptions([{ id: employeeId, name: "Worker" }], [shift], [actual]),
    [{ id: employeeId, name: "Worker" }]);
  assert.equal(timesheetEmployeeOptions([{ id: employeeId, name: "Renamed" }], [shift], [actual]), null);
});

test("source events and recorded clock times must describe the same snapshot", () => {
  const clockOut = { ...event, event_id: "41000000-0000-4000-8000-000000000002",
    event_type: "clock_out", original_at: shift.ends_at, effective_at: shift.ends_at };
  assert.equal(timesheetSourcesMatch([actual], [event, clockOut]), true);
  assert.equal(timesheetSourcesMatch([actual], [event]), false);
  assert.equal(timesheetSourcesMatch([actual], [event, { ...clockOut, effective_at: "2024-10-05T17:30:00Z" }]), false);
  assert.equal(timesheetSourcesMatch([actual], [event, clockOut, clockOut]), false);
  assert.equal(timesheetSourcesMatch([], [event]), false);
  const incomplete = { ...actual, clocked_out_at: null };
  assert.equal(timesheetSourcesMatch([incomplete], [{ ...event, finished: false }]), true);
  assert.equal(timesheetSourcesMatch([incomplete], [event]), false);
  assert.equal(timesheetSourcesMatch([{ ...incomplete, clocked_in_at: null }], []), true);
});

test("edit rows and source events require the same protected revision and lock state", () => {
  const edited = { ...actual, edit_revision: revision, edit_locked: false };
  const clockIn = { ...event, edit_revision: revision };
  const clockOut = { ...clockIn, event_id: "41000000-0000-4000-8000-000000000002",
    event_type: "clock_out", original_at: shift.ends_at, effective_at: shift.ends_at };
  assert.deepEqual(parseTimesheetEditTime([edited]), [edited]);
  assert.deepEqual(parseTimesheetEditEvents([clockIn, clockOut]), [clockIn, clockOut]);
  assert.equal(timesheetEditSourcesMatch([edited], [clockIn, clockOut]), true);
  assert.equal(timesheetEditSourcesMatch([edited], [{ ...clockIn, edit_revision: "b".repeat(64) }, clockOut]), false);
  assert.equal(timesheetEditSourcesMatch([{ ...edited, edit_locked: true }], [clockIn, clockOut]), false);
  assert.equal(timesheetEditSourcesMatch([edited], [clockIn]), false);
  assert.equal(parseTimesheetEditTime([{ ...edited, edit_revision: "bad" }]), null);
  assert.equal(parseTimesheetEditTime([{ ...edited, edit_locked: null }]), null);
  assert.equal(parseTimesheetEditEvents([{ ...clockIn, edit_revision: revision.toUpperCase() }]), null);
  assert.equal(parseTimesheetEditEvents([{ ...clockIn, edit_revision: null }]), null);
});

test("bulk selections validate bounded, distinct session and revision pairs", () => {
  const first = `${actual.session_id}:${revision}`;
  const secondId = "21000000-0000-4000-8000-000000000002";
  assert.deepEqual(parseBulkLockSelections([first, `${secondId}:${"b".repeat(64)}`]), [
    { session_id: actual.session_id, revision }, { session_id: secondId, revision: "b".repeat(64) },
  ]);
  for (const invalid of [null, [], [first, first], [first, `${actual.session_id.toUpperCase()}:${revision}`],
    [`${actual.session_id}:bad`], [`bad:${revision}`], [`${first}:extra`], [null], Array(101).fill(first)]) {
    assert.equal(parseBulkLockSelections(invalid), null);
  }
});

test("bulk receipts require bounded counts and valid, matching filter metadata", () => {
  const row = { batch_id: "61000000-0000-4000-8000-000000000001",
    locked_count: 2, invalid_count: 1, already_locked_count: 1 };
  assert.deepEqual(parseBulkLockReceipt([row]), {
    batchId: row.batch_id, lockedCount: 2, invalidCount: 1, alreadyLockedCount: 1,
  });
  assert.deepEqual(parseStoredBulkLockReceipt([{ ...row, week_start: "2024-09-30", employee_id: employeeId }]), {
    batchId: row.batch_id, lockedCount: 2, invalidCount: 1, alreadyLockedCount: 1,
    weekStart: "2024-09-30", employeeId,
  });
  assert.equal(parseStoredBulkLockReceipt([{ ...row, week_start: "2024-09-30", employee_id: null }]).employeeId, null);
  for (const invalid of [[], [row, row], [{ ...row, batch_id: "bad" }], [{ ...row, locked_count: -1 }],
    [{ ...row, invalid_count: 0.5 }], [{ ...row, locked_count: 101 }], [{
      ...row, locked_count: 0, invalid_count: 0, already_locked_count: 0,
    }]]) assert.equal(parseBulkLockReceipt(invalid), null);
  assert.equal(parseStoredBulkLockReceipt([{ ...row, week_start: "2024-10-01", employee_id: employeeId }]), null);
  assert.equal(parseStoredBulkLockReceipt([{ ...row, week_start: "2024-09-30", employee_id: "bad" }]), null);
});

test("weekly comparison preserves department attribution and exact discrepancies", () => {
  const groups = groupWeeklyTimesheets([shift], [actual]);
  assert.equal(groups.length, 1);
  assert.deepEqual(weeklyTimesheetNotices(groups[0]), ["Weekly spans match; review individual times and breaks."]);
  const different = groupWeeklyTimesheets([shift], [{ ...actual, elapsed_seconds: 14400 }]);
  assert.ok(weeklyTimesheetNotices(different[0]).includes(
    "Scheduled span and recorded elapsed time differ; review individual records.",
  ));
  const incomplete = groupWeeklyTimesheets([shift], [{
    ...actual, clocked_out_at: null, elapsed_seconds: null, worked_seconds: null, paid_seconds: null,
    paid_break_seconds: null, unpaid_break_seconds: null, exceptions: ["missing_clock_out"],
  }]);
  assert.ok(weeklyTimesheetNotices(incomplete[0]).includes(
    "Incomplete or invalid attendance is excluded from recorded totals.",
  ));
  assert.ok(!weeklyTimesheetNotices(incomplete[0]).some((notice) => notice.includes("spans match")));
  const partiallyComplete = groupWeeklyTimesheets([shift], [actual, {
    ...actual, session_id: "21000000-0000-4000-8000-000000000002",
    clocked_out_at: null, elapsed_seconds: null, worked_seconds: null, paid_seconds: null,
    paid_break_seconds: null, unpaid_break_seconds: null, exceptions: ["missing_clock_out"],
  }]);
  assert.ok(!weeklyTimesheetNotices(partiallyComplete[0]).some((notice) => notice.includes("spans match")));
  const partiallyDifferent = groupWeeklyTimesheets([shift], [
    { ...actual, elapsed_seconds: 14400 }, partiallyComplete[0].actual[1],
  ]);
  assert.ok(weeklyTimesheetNotices(partiallyDifferent[0]).includes(
    "Known recorded elapsed differs from scheduled span; incomplete attendance prevents a full comparison.",
  ));
  const otherDepartment = { ...actual, department_id: "d1000000-0000-4000-8000-000000000002",
    department_name: "BOH" };
  assert.equal(groupWeeklyTimesheets([shift], [otherDepartment]).length, 2);
  assert.equal(groupWeeklyTimesheets([shift], [{ ...actual, employee_name: "Changed while loading" }]), null);
  assert.ok(weeklyTimesheetNotices(groupWeeklyTimesheets([shift], [])[0])
    .includes("No attendance sessions are attributed to this week."));
  assert.ok(weeklyTimesheetNotices(groupWeeklyTimesheets([], [actual])[0])
    .includes("No published shifts start in this week."));
});
