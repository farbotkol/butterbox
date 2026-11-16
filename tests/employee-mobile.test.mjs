import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEmployeeMobile } from "../src/lib/employee-mobile.ts";

test("employee mobile numbers normalize Australian input and accept international E.164", () => {
  for (const input of ["0412345678", "04 1234 5678", "(04) 1234-5678"]) {
    assert.deepEqual(normalizeEmployeeMobile(input), { valid: true, value: "+61412345678" });
  }
  assert.deepEqual(normalizeEmployeeMobile("+61 4 1234 5678"), { valid: true, value: "+61412345678" });
  assert.deepEqual(normalizeEmployeeMobile("+14155552671"), { valid: true, value: "+14155552671" });
});

test("employee mobile numbers allow clearing and reject malformed input", () => {
  for (const input of ["", "  "]) {
    assert.deepEqual(normalizeEmployeeMobile(input), { valid: true, value: null });
  }
  for (const input of [
    null, "041234567", "04123456789", "61412345678", "+610412345678",
    "+0123456789", "+1234567", "+1234567890123456", "04 12 AB 5678",
    "0412345678 ext 2", "+1+4155552671", "x".repeat(65),
  ]) assert.deepEqual(normalizeEmployeeMobile(input), { valid: false }, input);
});
