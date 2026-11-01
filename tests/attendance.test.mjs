import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseAttendanceState,
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
};
const activeState = {
  state: "clocked_in", session_id: session, venue_id: venue, venue_name: "Sydney",
  venue_timezone: "Australia/Sydney", department_name: "FOH",
  clocked_in_at: "2032-03-15T09:00:00+00:00",
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

test("attendance state requires valid server results and venue-local time data", () => {
  assert.deepEqual(parseAttendanceState(emptyState), { state: "clocked_out" });
  assert.deepEqual(parseAttendanceState({ ...emptyState, state: "needs_review" }), { state: "needs_review" });
  assert.deepEqual(parseAttendanceState(activeState), activeState);
  assert.equal(parseAttendanceState({ ...emptyState, venue_name: "leaked" }), null);
  assert.equal(parseAttendanceState({ ...activeState, clocked_in_at: "not a date" }), null);
  assert.equal(parseAttendanceState({ ...activeState, venue_timezone: "not/a-timezone" }), null);
  assert.equal(parseAttendanceState({ ...activeState, session_id: "bad" }), null);
  assert.equal(parseAttendanceState({ ...activeState, state: "unknown" }), null);
  assert.equal(parseAttendanceState(null), null);
});
