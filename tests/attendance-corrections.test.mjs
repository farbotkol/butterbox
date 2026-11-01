import assert from "node:assert/strict";
import { test } from "node:test";
import {
  correctionInstant, correctionLocalWithMicroseconds, parseAttendanceCorrections,
  parseAttendanceEditLocks, parseCorrectionEvents,
} from "../src/lib/attendance-corrections.ts";

const id = "a9000000-0000-4000-8000-000000000001";
const second = "a9000000-0000-4000-8000-000000000002";
const instant = "2024-01-10T09:00:00.123456Z";

test("venue-local correction times preserve seconds and microseconds", () => {
  assert.deepEqual(correctionInstant("2024-01-10T20:00:00.123456", "Australia/Sydney", ""), {
    status: "ok", value: instant,
  });
  assert.deepEqual(correctionInstant("2024-01-11T00:15", "Australia/Sydney", ""), {
    status: "ok", value: "2024-01-10T13:15:00Z",
  });
  assert.deepEqual(correctionInstant("2024-01-10T09:00", "UTC", "later"), {
    status: "ok", value: "2024-01-10T09:00:00Z",
  });
});

test("native date-time inputs can supply the final microsecond digits separately", () => {
  assert.equal(correctionLocalWithMicroseconds("2024-01-10T20:00:00.123", "456"),
    "2024-01-10T20:00:00.123456");
  assert.equal(correctionLocalWithMicroseconds("2024-01-10T20:00", "1"),
    "2024-01-10T20:00:00.000001");
  assert.equal(correctionLocalWithMicroseconds("2024-01-10T20:00:00.1", "25"),
    "2024-01-10T20:00:00.100025");
  assert.equal(correctionLocalWithMicroseconds("2024-01-10T20:00", ""), "2024-01-10T20:00");
  for (const [local, extra] of [
    ["2024-01-10T20:00:00.123456", "1"], ["2024-01-10T20:00", "1000"],
    ["2024-01-10T20:00", "-1"], ["invalid", "1"], ["2024-01-10T20:00", null],
  ]) assert.equal(correctionLocalWithMicroseconds(local, extra), null);
});

test("repeated local times require a deliberate first or second occurrence", () => {
  assert.deepEqual(correctionInstant("2024-04-07T02:30", "Australia/Sydney", ""), {
    status: "ambiguous",
  });
  assert.deepEqual(correctionInstant("2024-04-07T02:30", "Australia/Sydney", "earlier"), {
    status: "ok", value: "2024-04-06T15:30:00Z",
  });
  assert.deepEqual(correctionInstant("2024-04-07T02:30", "Australia/Sydney", "later"), {
    status: "ok", value: "2024-04-06T16:30:00Z",
  });
});

test("nonexistent, malformed and invalid-zone local times are rejected", () => {
  assert.deepEqual(correctionInstant("2024-10-06T02:30", "Australia/Sydney", ""), {
    status: "nonexistent",
  });
  for (const [value, zone, occurrence] of [
    ["2024-02-31T12:00", "UTC", ""],
    ["2024-01-10", "UTC", ""],
    ["2024-01-10T12:00:00.1234567", "UTC", ""],
    ["2024-01-10T12:00Z", "UTC", ""],
    ["2024-01-10T12:00", "Not/AZone", ""],
    ["2024-01-10T12:00", "UTC", "guess"],
  ]) assert.deepEqual(correctionInstant(value, zone, occurrence), { status: "invalid" });
});

test("correction candidates require valid event types and consistent session state", () => {
  const row = {
    event_id: id, session_id: id, event_type: "clock_in", classification: null,
    original_at: instant, effective_at: instant, finished: true, locked: false,
  };
  assert.deepEqual(parseCorrectionEvents([row]), [row]);
  const breakRow = { ...row, event_id: second, event_type: "break_end", classification: "unpaid" };
  assert.deepEqual(parseCorrectionEvents([row, breakRow]), [row, breakRow]);
  for (const value of [
    null, [row, row], [{ ...row, classification: "paid" }],
    [{ ...breakRow, classification: null }], [{ ...row, effective_at: "invalid" }],
    [row, { ...breakRow, locked: true }], [{ ...row, event_type: "unknown" }],
  ]) assert.equal(parseCorrectionEvents(value), null);
});

test("correction history rejects duplicate and incomplete records", () => {
  const row = {
    id, sequence: 1, session_id: id, event_id: id, event_type: "clock_in", employee_name: "Worker",
    department_name: "FOH", original_at: instant, old_at: instant, new_at: "2024-01-10T08:30:00Z",
    reason: "Forgot to clock", actor_id: second, created_at: "2024-01-11T00:00:00Z",
  };
  assert.deepEqual(parseAttendanceCorrections([row]), [row]);
  const later = { ...row, id: second, sequence: 2, created_at: "2024-01-09T00:00:00Z" };
  assert.deepEqual(parseAttendanceCorrections([row, later]), [later, row]);
  for (const value of [null, [row, row], [{ ...row, reason: " " }], [{ ...row, actor_id: "bad" }],
    [{ ...row, created_at: "bad" }], [{ ...row, sequence: 0 }],
    [row, { ...later, sequence: row.sequence }]]) assert.equal(parseAttendanceCorrections(value), null);
});

test("edit lock history requires valid, uniquely ordered audit records", () => {
  const locked = {
    id, sequence: 1, session_id: id, locked: true, reason: "Reviewed",
    actor_id: second, created_at: "2024-01-11T00:00:00Z",
  };
  const unlocked = {
    ...locked, id: second, sequence: 2, locked: false, reason: "Reopen",
    created_at: "2024-01-10T00:00:00Z",
  };
  assert.deepEqual(parseAttendanceEditLocks([locked, unlocked]), [unlocked, locked]);
  for (const value of [null, [locked, locked], [{ ...locked, locked: "true" }],
    [{ ...locked, reason: "" }], [{ ...locked, sequence: Number.MAX_SAFE_INTEGER + 1 }],
    [locked, { ...unlocked, sequence: locked.sequence }]]) {
    assert.equal(parseAttendanceEditLocks(value), null);
  }
});
