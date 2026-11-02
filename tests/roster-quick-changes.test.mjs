import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseQuickChangeInput,
  parseQuickChangePreview,
  quickChangeBlockingMessages,
  quickChangeFailure,
  quickChangePreviewPayload,
  quickChangeWarningMessage,
} from "../src/lib/roster-quick-changes.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  businessId: id(1), venueId: id(2), departmentId: id(3), shiftId: id(4),
  expectedUpdatedAt: "2032-03-29T10:00:00.123456+00:00",
  weekStart: "2032-03-29", targetDate: "2032-03-31",
  targetEmployeeId: id(5), operation: "move",
};
const preview = {
  operation: "move", target_date: "2032-03-31", target_employee_id: id(5),
  target_employee_name: "Sam", role_title: "Server",
  starts_at: "2032-03-30T22:00:31.123456+00:00", ends_at: "2032-03-31T00:00:48.654321+00:00",
  blocking: [], warnings: ["linked-overlap"],
  publish_blocks_overlap: true, publish_blocks_unavailability: false,
};

test("quick-change inputs require a valid scoped week, target and revision", () => {
  assert.deepEqual(parseQuickChangeInput(input), input);
  assert.equal(parseQuickChangeInput({ ...input, targetEmployeeId: null })?.targetEmployeeId, null);
  assert.equal(parseQuickChangeInput({ ...input, operation: "duplicate" })?.operation, "duplicate");
  for (const change of [
    { businessId: "bad" }, { venueId: null }, { departmentId: id(3).slice(1) }, { shiftId: "" },
    { expectedUpdatedAt: "2032-03-29T10:00:00" }, { expectedUpdatedAt: "tomorrow" },
    { weekStart: "2032-03-30" }, { weekStart: "1900-02-29" },
    { targetDate: "2032-04-05" }, { targetDate: "2032-03-28" }, { targetDate: "2032-03-32" },
    { targetEmployeeId: "" }, { targetEmployeeId: undefined }, { operation: "publish" },
  ]) {
    assert.equal(parseQuickChangeInput({ ...input, ...change }), null, JSON.stringify(change));
  }
  assert.equal(parseQuickChangeInput(null), null);
});

test("preview parsing confirms the destination and exposes only known conflict states", () => {
  const parsed = parseQuickChangePreview(preview, input);
  assert.equal(parsed?.targetEmployeeName, "Sam");
  assert.equal(parsed?.targetDate, input.targetDate);
  assert.deepEqual(parsed?.warnings, ["linked-overlap"]);
  assert.equal(parsed?.publishBlocksOverlap, true);
  assert.deepEqual(quickChangePreviewPayload(parsed), preview);
  assert.match(quickChangeWarningMessage("linked-overlap", parsed), /Publication will be blocked/);
  assert.match(quickChangeWarningMessage("unavailable", parsed), /Publication will warn/);

  const openInput = { ...input, targetEmployeeId: null };
  const openPreview = { ...preview, target_employee_id: null, target_employee_name: null };
  assert.equal(parseQuickChangePreview(openPreview, openInput)?.targetEmployeeName, null);
  for (const change of [
    { operation: "duplicate" }, { target_date: "2032-04-01" }, { target_employee_id: id(6) },
    { target_employee_id: null, target_employee_name: null }, { target_employee_name: "" },
    { role_title: " " }, { role_title: "a".repeat(81) }, { starts_at: "bad" },
    { ends_at: preview.starts_at }, { blocking: ["unrecognised"] },
    { blocking: ["overlap", "overlap"] }, { warnings: ["unknown"] },
    { publish_blocks_overlap: "yes" }, { publish_blocks_unavailability: null },
  ]) {
    assert.equal(parseQuickChangePreview({ ...preview, ...change }, input), null, JSON.stringify(change));
  }
  assert.equal(parseQuickChangePreview({ ...openPreview, target_employee_name: "Sam" }, openInput), null);
});

test("failure messages distinguish conflicts, stale data and uncertain results", () => {
  assert.equal(quickChangeFailure("Shift change blocked: overlap"), quickChangeBlockingMessages.overlap);
  assert.match(quickChangeFailure("Permission denied"), /cannot change/);
  assert.match(quickChangeFailure("Shift changed since the quick change"), /changed/);
  assert.match(quickChangeFailure("Shift change was already undone"), /already undone/);
  assert.match(quickChangeFailure("Shift preview changed; preview again"), /Preview the change again/);
  assert.match(quickChangeFailure("Start time does not exist in venue timezone"), /clock change/);
  assert.match(quickChangeFailure(undefined), /couldn't confirm/);
  assert.match(quickChangeFailure("unexpected"), /Retry this same request/);
});
