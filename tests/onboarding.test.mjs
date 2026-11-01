import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOnboardingProgress } from "../src/lib/onboarding.ts";

test("onboarding progress accepts one complete boolean result", () => {
  const progress = {
    business_ready: true,
    venue_ready: true,
    staff_ready: false,
    shift_ready: false,
    publication_ready: false,
  };
  assert.deepEqual(parseOnboardingProgress([progress]), progress);
});

test("onboarding progress rejects incomplete, duplicated and malformed results", () => {
  const progress = {
    business_ready: true,
    venue_ready: true,
    staff_ready: false,
    shift_ready: false,
    publication_ready: false,
  };
  for (const value of [
    null, [], [null], [progress, progress],
    [{ ...progress, staff_ready: "false" }],
    [{ ...progress, publication_ready: null }],
    [{ business_ready: true }],
  ]) {
    assert.equal(parseOnboardingProgress(value), null);
  }
});
