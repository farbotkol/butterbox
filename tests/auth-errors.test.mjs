import assert from "node:assert/strict";
import { test } from "node:test";
import { isEndedSession } from "../src/lib/auth-errors.ts";

test("expired and revoked sessions are distinguished from service failures", () => {
  for (const error of [
    { name: "AuthSessionMissingError" },
    { name: "AuthApiError", status: 401 },
    { name: "AuthApiError", status: 400, code: "refresh_token_not_found" },
    { name: "AuthApiError", status: 400, code: "refresh_token_already_used" },
    { name: "AuthApiError", status: 400, code: "session_expired" },
  ]) {
    assert.equal(isEndedSession(error), true);
  }
  for (const error of [
    { name: "AuthRetryableFetchError", status: 0 },
    { name: "AuthApiError", status: 429 },
    { name: "AuthApiError", status: 500 },
  ]) {
    assert.equal(isEndedSession(error), false);
  }
});
