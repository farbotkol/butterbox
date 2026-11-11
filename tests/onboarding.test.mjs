import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as dates from "../src/lib/dates.ts";
import * as help from "../src/lib/help.ts";
import { parseOnboardingProgress } from "../src/lib/onboarding.ts";

const require = createRequire(import.meta.url);
function loadComponent(file, dependencies) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function("require", "exports", outputText)(
    (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), exports,
  );
  return exports;
}

const { OnboardingChecklist } = loadComponent("../src/components/onboarding-checklist.tsx", {
  "@/lib/help": help,
});
const complete = {
  business_ready: true, venue_ready: true, staff_ready: true, shift_ready: true, publication_ready: true,
};
const renderChecklist = (progress, businessId = "business-a", venueId = "venue-a") =>
  renderToStaticMarkup(createElement(OnboardingChecklist, { progress, businessId, venueId }));

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

test("every incomplete combination retains accurate checklist statuses and scoped links", () => {
  const keys = Object.keys(complete);
  for (let mask = 0; mask < 31; mask++) {
    const progress = Object.fromEntries(keys.map((key, index) => [key, Boolean(mask & (1 << index))]));
    const completed = Object.values(progress).filter(Boolean).length;
    const html = renderChecklist(progress);
    assert.match(html, /<section[^>]*aria-labelledby="onboarding-heading"/);
    assert.ok(html.includes(`${completed} of 5 steps complete`));
    assert.equal((html.match(/>Complete<\/span>/g) ?? []).length, completed);
    assert.equal((html.match(/>To do<\/span>/g) ?? []).length, 5 - completed);
    for (const title of ["Business", "Venue", "Staff", "Shift", "Publish"]) {
      assert.ok(html.includes(`>${title}</h3>`));
    }
    for (const href of [
      "/settings/departments?business=business-a&amp;venue=venue-a", "/people?venue=venue-a",
      "/roster?venue=venue-a", help.helpHref("onboarding", "business-a", "venue-a").replaceAll("&", "&amp;"),
    ]) assert.ok(html.includes(`href="${href}"`), href);
  }
});

test("completed checklist renders no section, counter, help link or spacing", () => {
  assert.equal(renderChecklist(complete), "");
  assert.notEqual(renderChecklist({ ...complete, staff_ready: false }), "");
  assert.equal(renderChecklist(complete), "");
});

function dashboardHarness({ role = "owner", getProgress } = {}) {
  const calls = [];
  const query = new Proxy({}, {
    get: (_, property) => property === "then"
      ? (resolve) => resolve({ data: [], error: null })
      : () => query,
  });
  const { default: HomePage } = loadComponent("../src/app/page.tsx", {
    "@/app/actions": { signOutAction: () => {} },
    "@/components/app-shell": { AppShell: ({ children }) => children },
    ...Object.fromEntries([
      ["brand-lockup", "BrandLockup"], ["coastal-illustration", "CoastalIllustration"],
      ["future-vision-preview", "FutureVisionPreview"], ["roster-notification-banner", "RosterNotificationBanner"],
    ].map(([file, name]) => [`@/components/${file}`, { [name]: () => null }])),
    "@/components/onboarding-checklist": { OnboardingChecklist },
    "@/lib/future-vision": { isFutureVisionPreviewEnabled: () => false },
    "@/lib/onboarding": { parseOnboardingProgress },
    "@/lib/roster-notifications": { unreadRosterNotificationCount: async () => 0 },
    "@/lib/supabase/server": { isSupabaseConfigured: () => true },
    "@/lib/workspace": {
      ...dates,
      getWorkspace: async (venueId, { businessId }) => ({
        status: "ready", business: { id: businessId, name: businessId }, businesses: [{ id: businessId }],
        venue: { id: venueId, name: venueId, timezone: "UTC" }, user: { email: "owner@example.test" },
        membership: { role },
        supabase: {
          from: () => query,
          rpc: (name, args) => {
            calls.push([name, args]);
            return getProgress(args.p_business_id);
          },
        },
      }),
    },
  });
  return {
    calls,
    render: async (business = "business-a", venue = "venue-a") => renderToStaticMarkup(await HomePage({
      searchParams: Promise.resolve({ business, venue, week: "2032-03-29" }),
    })),
  };
}

test("dashboard awaits server progress before rendering and never flashes a completed checklist", async () => {
  let resolveProgress;
  const progress = new Promise((resolve) => { resolveProgress = resolve; });
  const dashboard = dashboardHarness({ getProgress: () => progress });
  let rendered = false;
  const pending = dashboard.render().then((html) => { rendered = true; return html; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rendered, false);
  resolveProgress({ data: [complete], error: null });
  const html = await pending;
  assert.ok(!html.includes("onboarding-heading"));
  assert.ok(!html.includes("Help with your first roster"));
  assert.ok(!html.includes("5 of 5 steps complete"));
});

test("dashboard shows a recoverable alert for failed or missing progress, even with complete error data", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const result of [
    { data: null, error: { code: "unavailable" } },
    { data: [complete], error: { code: "unavailable" } },
    { data: [], error: null },
    { data: [{ business_ready: true }], error: null },
  ]) {
    const html = await dashboardHarness({ getProgress: async () => result }).render();
    assert.match(html, /role="alert"/);
    assert.match(html, /load your onboarding checklist\. Refresh and try again/);
    assert.ok(!html.includes("onboarding-heading"));
  }
});

test("dashboard reloads each business independently and reflects final completion and regression", async () => {
  const progress = {
    "business-a": complete,
    "business-b": { ...complete, publication_ready: false },
  };
  const dashboard = dashboardHarness({ getProgress: async (business) => ({ data: [progress[business]], error: null }) });
  assert.ok(!(await dashboard.render()).includes("onboarding-heading"));
  const incomplete = await dashboard.render("business-b", "venue-b");
  assert.ok(incomplete.includes("4 of 5 steps complete"));
  assert.ok(incomplete.includes("business=business-b&amp;venue=venue-b"));
  assert.ok(!incomplete.includes("business-a"));
  progress["business-b"] = complete;
  assert.ok(!(await dashboard.render("business-b", "venue-b")).includes("onboarding-heading"));
  assert.ok(!(await dashboard.render("business-b", "venue-b")).includes("onboarding-heading"));
  progress["business-a"] = { ...complete, staff_ready: false };
  assert.ok((await dashboard.render()).includes("4 of 5 steps complete"));
  assert.deepEqual(dashboard.calls.map(([name, args]) => [name, args.p_business_id]), [
    ["get_onboarding_progress", "business-a"], ["get_onboarding_progress", "business-b"],
    ["get_onboarding_progress", "business-b"], ["get_onboarding_progress", "business-b"],
    ["get_onboarding_progress", "business-a"],
  ]);
});

test("non-owner dashboards do not request or expose onboarding progress", async () => {
  for (const role of ["employee", "foh_manager", "boh_manager", "admin", "general_manager", "department_manager"]) {
    const dashboard = dashboardHarness({ role, getProgress: () => assert.fail("Owner-only RPC called") });
    const html = await dashboard.render();
    assert.equal(dashboard.calls.length, 0);
    assert.ok(!html.includes("onboarding-heading"));
    assert.ok(!html.includes("load your onboarding checklist"));
  }
});
