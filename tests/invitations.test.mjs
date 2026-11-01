import assert from "node:assert/strict";
import { test } from "node:test";
import { isInvitationId, parseInvitationPreview, parsePendingStaffInvitation } from "../src/lib/invitations.ts";

test("invitation identifiers accept only a UUID", () => {
  assert.equal(isInvitationId("a4000000-0000-4000-8000-000000000001"), true);
  for (const id of ["", "../login", "not-a-uuid", "a4000000-0000-4000-8000-000000000001/other"]) {
    assert.equal(isInvitationId(id), false);
  }
});

test("invitation previews require one complete, valid result", () => {
  const preview = {
    business_name: "Cafe", venue_name: "Main", department_name: "FOH", employee_name: "Worker",
    status: "pending", expires_at: "2032-01-01T00:00:00Z",
  };
  assert.deepEqual(parseInvitationPreview([preview]), preview);
  for (const value of [
    null, [], [null], [preview, preview], [{ ...preview, status: "unknown" }],
    [{ ...preview, expires_at: "invalid" }], [{ ...preview, business_name: null }],
  ]) {
    assert.equal(parseInvitationPreview(value), null);
  }
});

test("pending invitation data is validated before email delivery", () => {
  const pending = {
    id: "a4000000-0000-4000-8000-000000000001",
    employee_id: "e4000000-0000-4000-8000-000000000001",
    email: "worker@example.test", status: "pending", expires_at: "2032-01-01T00:00:00Z",
  };
  assert.deepEqual(parsePendingStaffInvitation(pending), pending);
  for (const invalid of [
    null, [], {}, { ...pending, id: "invalid" }, { ...pending, employee_id: "invalid" },
    { ...pending, email: "" }, { ...pending, expires_at: "invalid" }, { ...pending, status: "accepted" },
  ]) {
    assert.equal(parsePendingStaffInvitation(invalid), null);
  }
});
