import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasPriorAttendanceLink, offlineMatchKey, parseOfflineAttendanceClaim, parseOfflineClaimReceipt,
  parseOfflineBreakResolutions, parseOfflineClaimReviews, parseOfflineMatchEvents, parseOfflineMatchOption,
  parseOfflineOpenBreaks, parseOfflineOpenSessions, parseSubmittedOfflineClaims,
} from "../src/lib/offline-attendance.ts";

const id = "af000000-0000-4000-8000-000000000001";
const claim = {
  requestId: id, actorId: id, businessId: id, venueId: id, departmentId: id,
  employeeId: id, eventType: "clock_in", claimedAt: "2026-11-01T10:00:00.000Z",
};

test("offline claims require an actor, scoped identifiers, event type and claimed time", () => {
  assert.deepEqual(parseOfflineAttendanceClaim(claim), claim);
  for (const invalid of [
    null, {}, { ...claim, actorId: "other" }, { ...claim, businessId: "" },
    { ...claim, eventType: "break" }, { ...claim, claimedAt: "not a time" },
  ]) assert.equal(parseOfflineAttendanceClaim(invalid), null);
});

test("offline receipts must contain one server identifier and confirmed time", () => {
  const receipt = { claim_id: id, received_at: "2026-11-01T12:00:00Z" };
  assert.deepEqual(parseOfflineClaimReceipt([receipt]), { id, receivedAt: receipt.received_at });
  for (const invalid of [null, [], [receipt, receipt], [{ ...receipt, claim_id: "" }],
    [{ ...receipt, received_at: "invalid" }]]) assert.equal(parseOfflineClaimReceipt(invalid), null);
});

test("submitted offline claim lists reject incomplete, duplicate or invalid rows", () => {
  const row = {
    id, employee_id: id, employee_name: "Worker", department_id: id, department_name: "FOH",
    actor_id: id, event_type: "clock_out", claimed_at: "2026-11-01T10:00:00Z", received_at: "2026-11-01T12:00:00Z",
    claim_source: "offline", request_reason: null,
  };
  assert.deepEqual(parseSubmittedOfflineClaims([row]), [row]);
  const request = { ...row, claim_source: "employee_request", request_reason: "Forgot to clock out" };
  assert.deepEqual(parseSubmittedOfflineClaims([request]), [request]);
  for (const invalid of [null, [row, row], [{ ...row, employee_name: "" }],
    [{ ...row, event_type: "other" }], [{ ...row, received_at: "invalid" }],
    [{ ...row, claim_source: "unknown" }], [{ ...row, request_reason: "wrong source" }],
    [{ ...request, request_reason: " " }], [{ ...request, request_reason: null }]]) {
    assert.equal(parseSubmittedOfflineClaims(invalid), null);
  }
});

test("offline review history validates decision-specific audit details and sequence", () => {
  const reviewed = {
    id, sequence: 1, claim_id: id, actor_id: id, decision: "corrected", session_id: id,
    event_id: id, old_at: "2026-11-01T10:00:00Z", correction_id: id,
    reason: "Confirmed", created_at: "2026-11-01T12:00:00Z",
  };
  const reopened = {
    ...reviewed, id: "af000000-0000-4000-8000-000000000002", sequence: 2, decision: "reopened",
    session_id: null, event_id: null, old_at: null, correction_id: null,
  };
  const created = {
    ...reviewed, id: "af000000-0000-4000-8000-000000000003", sequence: 3,
    decision: "created", old_at: null, correction_id: null,
  };
  assert.deepEqual(parseOfflineClaimReviews([reviewed, reopened]), [reopened, reviewed]);
  assert.deepEqual(parseOfflineClaimReviews([created]), [created]);
  assert.deepEqual(parseOfflineClaimReviews([{ ...created, decision: "completed" }]),
    [{ ...created, decision: "completed" }]);
  assert.equal(hasPriorAttendanceLink([reopened]), false);
  assert.equal(hasPriorAttendanceLink([reopened, reviewed]), true);
  assert.equal(hasPriorAttendanceLink([created]), true);
  for (const invalid of [null, [reviewed, reviewed], [{ ...reviewed, correction_id: null }],
    [{ ...reviewed, decision: "matched" }], [{ ...reopened, event_id: id }],
    [{ ...created, old_at: reviewed.old_at }], [{ ...created, event_id: null }],
    [reviewed, { ...reopened, sequence: 1 }], [{ ...reviewed, reason: " " }]]) {
    assert.equal(parseOfflineClaimReviews(invalid), null);
  }
});

test("open offline clock-out candidates require scoped identifiers, event times and state", () => {
  const row = {
    session_id: id, employee_id: id, department_id: id, actor_id: id,
    clocked_in_at: "2026-11-01T10:00:00Z", latest_event_at: "2026-11-01T12:00:00Z",
    open_break: false, locked: false,
  };
  assert.deepEqual(parseOfflineOpenSessions([row]), [row]);
  for (const invalid of [null, [row, row], [{ ...row, session_id: "" }],
    [{ ...row, latest_event_at: null }], [{ ...row, open_break: "false" }]]) {
    assert.equal(parseOfflineOpenSessions(invalid), null);
  }
});

test("offline break candidates and history retain classification, time and attribution", () => {
  const open = {
    break_id: id, session_id: id, employee_id: id, department_id: id, actor_id: id,
    classification: "unpaid", started_at: "2026-11-01T10:00:00Z",
  };
  const resolution = {
    id, claim_id: id, session_id: id, actor_id: id, classification: "unpaid",
    started_at: open.started_at, reported_end_at: "2026-11-01T10:30:00Z",
    reason: "Confirmed with employee", created_at: "2026-11-01T12:00:00Z",
  };
  assert.deepEqual(parseOfflineOpenBreaks([open]), [open]);
  assert.deepEqual(parseOfflineBreakResolutions([resolution]), [resolution]);
  for (const invalid of [null, [open, open], [{ ...open, classification: "unknown" }],
    [{ ...open, break_id: "" }]]) assert.equal(parseOfflineOpenBreaks(invalid), null);
  for (const invalid of [null, [resolution, resolution], [{ ...resolution, reason: " " }],
    [{ ...resolution, reported_end_at: "" }]]) assert.equal(parseOfflineBreakResolutions(invalid), null);
});

test("offline matching options validate scoped event identifiers and exact timestamps", () => {
  const row = {
    event_id: id, session_id: id, employee_id: id, department_id: id, actor_id: id,
    event_type: "clock_in", effective_at: "2026-11-01T10:00:00.123456Z", locked: false,
  };
  assert.deepEqual(parseOfflineMatchEvents([row]), [row]);
  assert.equal(offlineMatchKey(row), `${id}:${id}:${id}:clock_in`);
  assert.deepEqual(parseOfflineMatchOption(`${id}|${row.effective_at}`), {
    eventId: id, expectedAt: row.effective_at,
  });
  for (const invalid of [null, [row, row], [{ ...row, locked: "false" }], [{ ...row, actor_id: "" }]]) {
    assert.equal(parseOfflineMatchEvents(invalid), null);
  }
  for (const invalid of [null, "", `${id}|bad`, `${id}|${row.effective_at}|extra`]) {
    assert.equal(parseOfflineMatchOption(invalid), null);
  }
});
