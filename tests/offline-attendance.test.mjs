import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseOfflineAttendanceClaim, parseOfflineClaimReceipt, parseSubmittedOfflineClaims,
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
    event_type: "clock_out", claimed_at: "2026-11-01T10:00:00Z", received_at: "2026-11-01T12:00:00Z",
  };
  assert.deepEqual(parseSubmittedOfflineClaims([row]), [row]);
  for (const invalid of [null, [row, row], [{ ...row, employee_name: "" }],
    [{ ...row, event_type: "other" }], [{ ...row, received_at: "invalid" }]]) {
    assert.equal(parseSubmittedOfflineClaims(invalid), null);
  }
});
