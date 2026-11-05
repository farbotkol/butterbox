import assert from "node:assert/strict";
import { test } from "node:test";

test("Agent Merge POC: intentionally failing test—repair to 1 === 1", () => {
  assert.equal(1, 2);
});
