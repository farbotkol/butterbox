import assert from "node:assert/strict";
import { test } from "node:test";
import { parseShiftAcknowledgements, shiftAcknowledgements } from "../src/lib/shift-acknowledgements.ts";

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

test("acknowledgement status batches and paginates more than 1000 shifts", async () => {
  const calls = [];
  const supabase = {
    rpc(name, args, options) {
      calls.push({ name, args, options });
      return {
        order(column) {
          assert.equal(column, "shift_id");
          return this;
        },
        async range(from) {
          const rows = args.p_shift_ids.map((shift_id) => ({ shift_id, acknowledged_at: null }));
          return { data: rows.slice(from, from + 251), count: rows.length, error: null };
        },
      };
    },
  };
  const ids = Array.from({ length: 2001 }, (_, index) => `shift-${index}`);
  const result = await shiftAcknowledgements(supabase, "business", "venue", [...ids, ids[0]]);
  assert.deepEqual([...result.keys()], ids);
  assert.deepEqual(calls.map((call) => call.args.p_shift_ids.length), [
    1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1,
  ]);
  assert.ok(calls.every((call) => call.name === "list_shift_acknowledgements" &&
    call.args.p_business_id === "business" && call.args.p_venue_id === "venue" &&
    call.options.count === "exact"));
  assert.deepEqual([...await shiftAcknowledgements(supabase, "business", "venue", [])], []);
});

test("an incomplete acknowledgement batch remains explicitly unavailable", async () => {
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const result = await shiftAcknowledgements({
      rpc: () => ({
        order() { return this; },
        range: async () => ({ data: [], count: 1, error: null }),
      }),
    }, "business", "venue", ["shift-1"]);
    assert.equal(result, null);
    assert.equal(logged.length, 1);
    assert.equal(logged[0][1].code, "incomplete_result");
  } finally {
    console.error = originalError;
  }
});
