import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSwapUuid,
  parseShiftSwaps,
  parseSwapColleagues,
  parseSwapNotifications,
  parseSwapRecipients,
  parseSwapShifts,
  swapFailureCode,
  swapNotificationMessage,
} from "../src/lib/shift-swaps.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const swap = {
  swap_id: id(1), status: "pending_recipient", department_id: id(2), department_name: "FOH",
  requester_name: "Ann", recipient_name: "Ben", requester_shift_id: id(3), requester_role: "Barista",
  requester_starts_at: "2032-04-05T09:00:00Z", requester_ends_at: "2032-04-05T13:00:00Z",
  recipient_shift_id: null, recipient_role: null, recipient_starts_at: null, recipient_ends_at: null,
  requested_at: "2032-04-01T00:00:00Z", review_reason: null, snapshots_current: true,
  is_requester: false, is_recipient: true, can_manage: false,
};

test("swap rows require valid scope, status, timestamps and complete proposals", () => {
  assert.deepEqual(parseShiftSwaps([swap]), [swap]);
  assert.equal(parseShiftSwaps([{ ...swap, status: "maybe" }]), null);
  assert.equal(parseShiftSwaps([{ ...swap, requester_starts_at: "not a date" }]), null);
  assert.equal(parseShiftSwaps([{ ...swap, recipient_shift_id: id(4) }]), null);
  assert.equal(parseShiftSwaps([{ ...swap, snapshots_current: null }]), null);
  assert.equal(parseShiftSwaps([swap, swap]), null);
  assert.equal(parseShiftSwaps(null), null);
});

test("swap pickers validate identities and reject duplicate or malformed rows", () => {
  const shift = {
    shift_id: id(1), employee_id: id(2), department_id: id(3), department_name: "FOH",
    role_title: "Barista", starts_at: "2032-04-05T09:00:00Z", ends_at: "2032-04-05T13:00:00Z",
  };
  const colleague = { own_employee_id: id(2), department_id: id(3), employee_id: id(4), employee_name: "Ben" };
  const recipient = { swap_id: id(5), employee_id: id(4) };
  assert.deepEqual(parseSwapShifts([shift]), [shift]);
  assert.deepEqual(parseSwapColleagues([colleague]), [colleague]);
  assert.deepEqual(parseSwapRecipients([recipient]), [recipient]);
  assert.equal(parseSwapShifts([{ ...shift, employee_id: "invalid" }]), null);
  assert.equal(parseSwapColleagues([colleague, colleague]), null);
  assert.equal(parseSwapRecipients([{ ...recipient, swap_id: null }]), null);
  assert.equal(isSwapUuid(id(1)), true);
  assert.equal(isSwapUuid("not-a-uuid"), false);
});

test("swap notifications validate events and describe the actual recipient action", () => {
  const notice = {
    notification_id: id(1), swap_id: id(2), event_type: "review", created_at: "2032-04-01T00:00:00Z",
    unread: true, requester_name: "Ann", recipient_name: "Ben",
  };
  assert.deepEqual(parseSwapNotifications([notice]), [notice]);
  assert.equal(swapNotificationMessage(notice), "Ann and Ben confirmed a swap for review.");
  assert.equal(swapNotificationMessage({ ...notice, event_type: "requested" }), "Ann requested a shift swap with you.");
  assert.equal(parseSwapNotifications([{ ...notice, event_type: "unknown" }]), null);
  assert.equal(parseSwapNotifications([{ ...notice, unread: "true" }]), null);
  assert.equal(parseSwapNotifications([notice, notice]), null);
});

test("swap failures distinguish conflicts, stale requests and required rejection reasons", () => {
  assert.equal(swapFailureCode("Recipient is no longer eligible for the requested shift: conflict"), "ineligible");
  assert.equal(swapFailureCode("A shift has changed or started; ask for a new swap"), "changed");
  assert.equal(swapFailureCode("A rejection reason of up to 500 characters is required"), "reason");
  assert.equal(swapFailureCode("Swap not found or permission denied"), "permission");
  assert.equal(swapFailureCode(undefined), "unknown");
});
