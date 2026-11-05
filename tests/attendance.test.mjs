import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseAttendanceState,
  parseBreakClassification,
  parseClockOptionValue,
  parseClockOptions,
  parseClockReceipt,
} from "../src/lib/attendance.ts";

const employee = "e8000000-0000-4000-8000-000000000001";
const department = "d8000000-0000-4000-8000-000000000001";
const session = "18000000-0000-4000-8000-000000000001";
const venue = "c8000000-0000-4000-8000-000000000001";
const option = {
  employee_id: employee, employee_name: "Worker",
  department_id: department, department_name: "FOH",
};
const emptyState = {
  state: "clocked_out", session_id: null, venue_id: null, venue_name: null,
  venue_timezone: null, department_name: null, clocked_in_at: null,
  break_id: null, break_classification: null, break_started_at: null,
};
const clockedIn = {
  state: "clocked_in", session_id: session, venue_id: venue, venue_name: "Sydney",
  venue_timezone: "Australia/Sydney", department_name: "FOH",
  clocked_in_at: "2032-03-15T09:00:00+00:00",
};
const activeState = {
  ...clockedIn,
  break_id: null, break_classification: null, break_started_at: null,
};

test("clock options validate complete, unique employee and department pairs", () => {
  assert.deepEqual(parseClockOptions([option]), [option]);
  assert.deepEqual(parseClockOptions([]), []);
  assert.equal(parseClockOptions(null), null);
  assert.equal(parseClockOptions([null]), null);
  assert.equal(parseClockOptions([{ ...option, employee_id: "bad" }]), null);
  assert.equal(parseClockOptions([{ ...option, department_name: " " }]), null);
  assert.equal(parseClockOptions([option, option]), null);
  assert.equal(parseClockOptions([option, { ...option, employee_id: employee.toUpperCase() }]), null);
});

test("clock selections accept exactly one pair of UUIDs", () => {
  assert.deepEqual(parseClockOptionValue(`${employee}:${department}`), {
    employeeId: employee, departmentId: department,
  });
  assert.equal(parseClockOptionValue(null), null);
  assert.equal(parseClockOptionValue(employee), null);
  assert.equal(parseClockOptionValue(`${employee}:${department}:extra`), null);
  assert.equal(parseClockOptionValue(`${employee}:invalid`), null);
});

test("clock receipts require exactly one valid canonical event", () => {
  const receipt = { session_id: session, event_id: employee, occurred_at: "2032-03-15T09:00:00+00:00" };
  assert.deepEqual(parseClockReceipt([receipt]), {
    sessionId: session, eventId: employee, occurredAt: receipt.occurred_at,
  });
  assert.equal(parseClockReceipt(null), null);
  assert.equal(parseClockReceipt([]), null);
  assert.equal(parseClockReceipt([receipt, receipt]), null);
  assert.equal(parseClockReceipt([{ ...receipt, occurred_at: "invalid" }]), null);
  assert.equal(parseClockReceipt([{ ...receipt, event_id: "invalid" }]), null);
});

test("break classification must be explicitly paid or unpaid", () => {
  assert.equal(parseBreakClassification("paid"), "paid");
  assert.equal(parseBreakClassification("unpaid"), "unpaid");
  assert.equal(parseBreakClassification(null), null);
  assert.equal(parseBreakClassification(""), null);
  assert.equal(parseBreakClassification("Paid"), null);
  assert.equal(parseBreakClassification("unknown"), null);
});

test("attendance state requires valid server results and venue-local time data", () => {
  assert.deepEqual(parseAttendanceState(emptyState), { state: "clocked_out" });
  assert.deepEqual(parseAttendanceState({ ...emptyState, state: "needs_review" }), { state: "needs_review" });
  assert.deepEqual(parseAttendanceState(activeState), { ...clockedIn, active_break: null });
  const onBreak = {
    ...activeState, break_id: employee, break_classification: "unpaid",
    break_started_at: "2032-03-15T10:00:00+00:00",
  };
  assert.deepEqual(parseAttendanceState(onBreak), {
    ...clockedIn,
    active_break: { id: employee, classification: "unpaid", started_at: onBreak.break_started_at },
  });
  assert.deepEqual(parseAttendanceState({ ...onBreak, break_classification: "paid" }), {
    ...clockedIn,
    active_break: { id: employee, classification: "paid", started_at: onBreak.break_started_at },
  });
  assert.equal(parseAttendanceState({ ...emptyState, break_id: employee }), null);
  assert.equal(parseAttendanceState({ ...onBreak, break_id: null }), null);
  assert.equal(parseAttendanceState({ ...onBreak, break_classification: "unknown" }), null);
  assert.equal(parseAttendanceState({ ...onBreak, break_started_at: "invalid" }), null);
  assert.equal(parseAttendanceState({ ...onBreak, break_started_at: "2032-03-15T08:59:59Z" }), null);
  assert.equal(parseAttendanceState({ ...activeState, break_started_at: undefined }), null);
  assert.equal(parseAttendanceState({ ...emptyState, venue_name: "leaked" }), null);
  assert.equal(parseAttendanceState({ ...activeState, clocked_in_at: "not a date" }), null);
  assert.equal(parseAttendanceState({ ...activeState, venue_timezone: "not/a-timezone" }), null);
  assert.equal(parseAttendanceState({ ...activeState, session_id: "bad" }), null);
  assert.equal(parseAttendanceState({ ...activeState, state: "unknown" }), null);
  assert.equal(parseAttendanceState(null), null);
});
