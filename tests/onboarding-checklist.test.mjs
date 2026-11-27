import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  canViewOnboardingProgress,
  getOnboardingDashboardState,
  getOnboardingProgress,
  getOnboardingSection,
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

test("a completed or unavailable checklist renders no dashboard section at all", () => {
  const complete = progressFor(2 ** stepKeys.length - 1);
  const incomplete = progressFor(1);

  assert.equal(getOnboardingSection(getOnboardingDashboardState("owner", { data: [complete], error: null })), "none");
  assert.equal(getOnboardingSection(getOnboardingDashboardState("employee", null)), "none");
  assert.equal(getOnboardingSection(getOnboardingDashboardState("owner", { data: [incomplete], error: null })), "checklist");
  assert.equal(getOnboardingSection(getOnboardingDashboardState("owner", null)), "error");
});

test("completing the final step is reflected on the next render and nothing wraps the checklist", () => {
  const before = getOnboardingDashboardState("owner", { data: [progressFor(0b01111)], error: null });
  const after = getOnboardingDashboardState("owner", { data: [progressFor(0b11111)], error: null });
  assert.equal(getOnboardingSection(before), "checklist");
  assert.equal(getOnboardingSection(after), "none");

  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /rpc\("get_onboarding_progress", \{ p_business_id: workspace\.business\.id \}\)/);
  assert.match(page, /onboardingSection === "checklist" && onboardingState\.status === "incomplete" &&\s*<OnboardingChecklist/);

  const component = readFileSync(new URL("../src/components/onboarding-checklist.tsx", import.meta.url), "utf8");
  assert.match(component, /if \(isOnboardingComplete\(progress\)\) return null;/);
});

test("only owners may request onboarding progress", () => {
  assert.equal(canViewOnboardingProgress("owner"), true);
  for (const role of ["admin", "general_manager", "foh_manager", "boh_manager", "employee"]) {
    assert.equal(canViewOnboardingProgress(role), false, `${role} must not load business progress`);
    assert.deepEqual(getOnboardingDashboardState(role, null), { status: "unavailable" });
  }
});
