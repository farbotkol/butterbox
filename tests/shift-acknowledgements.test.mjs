import assert from "node:assert/strict";
import { test } from "node:test";
import { parseShiftAcknowledgements } from "../src/lib/shift-acknowledgements.ts";

test("acknowledgement status validates complete distinct shift results", () => {
  const result = parseShiftAcknowledgements([
    { shift_id: "one", acknowledged_at: null },
    { shift_id: "two", acknowledged_at: "2032-03-15T10:00:00Z" },
  ], ["one", "two", "one"]);
  assert.deepEqual([...result], [
    ["one", null],
    ["two", "2032-03-15T10:00:00Z"],
  ]);
  assert.deepEqual([...parseShiftAcknowledgements([], [])], []);
});

test("incomplete, duplicate, unexpected or malformed status is rejected", () => {
  assert.equal(parseShiftAcknowledgements(null, []), null);
  assert.equal(parseShiftAcknowledgements([], ["one"]), null);
  assert.equal(parseShiftAcknowledgements([
    { shift_id: "one", acknowledged_at: null },
    { shift_id: "one", acknowledged_at: null },
  ], ["one"]), null);
  assert.equal(parseShiftAcknowledgements([{ shift_id: "other", acknowledged_at: null }], ["one"]), null);
  assert.equal(parseShiftAcknowledgements([{ shift_id: "one" }], ["one"]), null);
  assert.equal(parseShiftAcknowledgements([{ shift_id: "one", acknowledged_at: "invalid" }], ["one"]), null);
});
