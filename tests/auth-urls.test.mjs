import assert from "node:assert/strict";
import { test } from "node:test";
import { authCallbackUrl, safeAuthRedirect } from "../src/lib/auth-urls.ts";

test("authentication callbacks use a configured secure application origin", () => {
  assert.equal(
    authCallbackUrl("https://butterbox.example", "/setup"),
    "https://butterbox.example/auth/callback?next=%2Fsetup",
  );
  assert.equal(
    authCallbackUrl("http://127.0.0.1:3117", "/reset-password"),
    "http://127.0.0.1:3117/auth/callback?next=%2Freset-password",
  );
  for (const invalid of [
    undefined,
    "",
    "not-a-url",
    "http://butterbox.example",
    "https://user:password@butterbox.example",
    "https://butterbox.example/path",
    "https://butterbox.example/?query=1",
    "https://butterbox.example/#fragment",
  ]) {
    assert.equal(authCallbackUrl(invalid, "/setup"), null);
  }
});

test("authentication redirects cannot leave the request origin", () => {
  assert.equal(
    safeAuthRedirect("/roster?week=2026-10-26"),
    "/roster?week=2026-10-26",
  );
  for (const invalid of [
    null,
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/.//evil.example",
    "javascript:alert(1)",
    "relative",
  ]) {
    assert.equal(safeAuthRedirect(invalid), "/");
  }
});
