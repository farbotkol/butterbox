import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canViewOnboardingProgress,
  getOnboardingDashboardState,
  getOnboardingProgress,
  isOnboardingComplete,
} from "../src/lib/onboarding.ts";

const stepKeys = [
  "business_ready",
  "venue_ready",
  "staff_ready",
  "shift_ready",
  "publication_ready",
];

function progressFor(mask) {
  return Object.fromEntries(stepKeys.map((key, index) => [key, Boolean(mask & (1 << index))]));
}

test("the checklist remains incomplete for every 0–4 of 5 combination", () => {
  for (let mask = 0; mask < 2 ** stepKeys.length - 1; mask += 1) {
    const progress = progressFor(mask);
    const completed = stepKeys.filter((key) => progress[key]).length;

    assert.ok(completed < 5);
    assert.equal(isOnboardingComplete(progress), false, `${completed} of 5 must remain visible`);
    assert.deepEqual(getOnboardingProgress({ data: [progress], error: null }), progress);
    assert.equal(getOnboardingDashboardState("owner", { data: [progress], error: null }).status, "incomplete");
  }
});

test("the checklist is complete only at 5 of 5 and reappears when a step regresses", () => {
  const complete = progressFor(2 ** stepKeys.length - 1);
  assert.equal(isOnboardingComplete(complete), true);

  const regressed = { ...complete, publication_ready: false };
  assert.equal(isOnboardingComplete(regressed), false);
  assert.deepEqual(getOnboardingProgress({ data: [regressed], error: null }), regressed);
});

test("missing, malformed and errored results never imply completion", () => {
  const complete = progressFor(2 ** stepKeys.length - 1);

  for (const result of [
    null,
    { data: null, error: null },
    { data: [], error: null },
    { data: [complete], error: new Error("RPC failed") },
  ]) {
    assert.equal(getOnboardingProgress(result), null);
    assert.deepEqual(getOnboardingDashboardState("owner", result), { status: "error" });
  }
});

test("each active business uses its own returned completion state", () => {
  const completedBusiness = getOnboardingProgress({
    data: [progressFor(2 ** stepKeys.length - 1)],
    error: null,
  });
  const incompleteBusiness = getOnboardingProgress({
    data: [progressFor(2 ** (stepKeys.length - 1) - 1)],
    error: null,
  });

  assert.ok(completedBusiness);
  assert.ok(incompleteBusiness);
  assert.equal(isOnboardingComplete(completedBusiness), true);
  assert.equal(isOnboardingComplete(incompleteBusiness), false);
  assert.equal(getOnboardingDashboardState("owner", {
    data: [progressFor(2 ** stepKeys.length - 1)],
    error: null,
  }).status, "complete");
  assert.equal(getOnboardingDashboardState("owner", {
    data: [progressFor(2 ** (stepKeys.length - 1) - 1)],
    error: null,
  }).status, "incomplete");
});

test("only owners may request onboarding progress", () => {
  assert.equal(canViewOnboardingProgress("owner"), true);
  for (const role of ["admin", "general_manager", "foh_manager", "boh_manager", "employee"]) {
    assert.equal(canViewOnboardingProgress(role), false, `${role} must not load business progress`);
    assert.deepEqual(getOnboardingDashboardState(role, null), { status: "unavailable" });
  }
});
