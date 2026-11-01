import assert from "node:assert/strict";
import { test } from "node:test";
import { rosterOverlapConflicts } from "../src/lib/roster-overlap-conflicts.ts";

test("overlap lookups batch more than 1000 shifts and read every server-limited page", async () => {
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
          const rows = args.p_shift_ids.map((shift_id) => ({ shift_id }));
          return { data: rows.slice(from, from + 231), count: rows.length, error: null };
        },
      };
    },
  };
  const ids = Array.from({ length: 2001 }, (_, index) => `shift-${index}`);
  const result = await rosterOverlapConflicts(supabase, "business", "venue", [...ids, ids[0]]);
  assert.equal(result.error, null);
  assert.deepEqual(result.data.map((row) => row.shift_id), ids);
  assert.deepEqual(calls.map((call) => call.args.p_shift_ids.length), [
    1000, 1000, 1000, 1000, 1000,
    1000, 1000, 1000, 1000, 1000, 1,
  ]);
  assert.ok(calls.every((call) => call.name === "list_roster_overlap_conflicts" &&
    call.args.p_business_id === "business" && call.args.p_venue_id === "venue" &&
    call.options.count === "exact"));
  assert.deepEqual(await rosterOverlapConflicts(supabase, "business", "venue", []), {
    data: [], error: null,
  });
});

test("overlap lookups reject failed, incomplete, duplicate, or unrelated rows", async () => {
  for (const response of [
    { data: null, count: null, error: { code: "failed", message: "Unavailable" } },
    { data: [], count: 1, error: null },
    { data: [{ shift_id: "one" }], count: 2, error: null },
    { data: [{ shift_id: "other" }], count: 1, error: null },
    { data: [{ shift_id: null }], count: 1, error: null },
  ]) {
    const result = await rosterOverlapConflicts({
      rpc: () => ({ order() { return this; }, range: async () => response }),
    }, "business", "venue", ["one"]);
    assert.equal(result.data, null);
    assert.ok(result.error);
  }
});
