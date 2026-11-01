import assert from "node:assert/strict";
import { test } from "node:test";
import { unreadRosterNotificationCount } from "../src/lib/roster-notifications.ts";

test("the unread roster count uses the selected business and venue", async () => {
  const calls = [];
  const supabase = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data: 2, error: null });
    },
  };
  assert.equal(await unreadRosterNotificationCount(supabase, "business", "venue"), 2);
  assert.deepEqual(calls, [{
    name: "unread_roster_notification_count",
    args: { p_business_id: "business", p_venue_id: "venue" },
  }]);
});

test("failed or malformed unread counts surface an unavailable state", async () => {
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    for (const result of [
      { data: null, error: { code: "failed", message: "Unavailable" } },
      { data: null, error: null },
      { data: -1, error: null },
      { data: 1.5, error: null },
      { data: "2", error: null },
    ]) {
      assert.equal(await unreadRosterNotificationCount({
        rpc: () => Promise.resolve(result),
      }, "business", "venue"), null);
    }
    assert.equal(logged.length, 5);
  } finally {
    console.error = originalError;
  }
});
