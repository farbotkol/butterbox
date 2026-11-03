import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { verify } from "../../scripts/showcase-environment.mjs";
import { publicShowcaseOrigin } from "../../scripts/showcase-public-gateway.mjs";
import { SHOWCASE_AUTH_COOKIE_NAME } from "../../src/lib/showcase.ts";

const workdir = process.env.BUTTERBOX_SHOWCASE_WORKDIR;
const origin = publicShowcaseOrigin(process.env.BUTTERBOX_TEST_APP_URL);
if (!workdir || process.env.BUTTERBOX_TEST_PUBLIC_SHOWCASE !== "yes") {
  throw new Error("Public browser checks require the explicitly identified synthetic showcase.");
}
await verify(workdir);
const state = JSON.parse(await readFile(path.join(workdir, "fixture-state.json"), "utf8"));
if (state.phase !== "seeded" || state.simulationOnly !== true) {
  throw new Error("The synthetic showcase fixture is not ready.");
}

async function signIn(page, role) {
  const account = state.accounts.find((item) => item.role === role);
  if (!account) throw new Error(`Missing synthetic ${role} review account.`);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel(/^Password/).fill(account.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/"),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  await expect(page.getByRole("complementary", { name: "Synthetic showcase notice" })).toBeVisible();
}

async function signOut(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
}

async function expectAccessible(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
}

test("public login is accessible, limits unavailable routes and rejects cross-origin changes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await expect(page.getByRole("status")).toContainText("pre-provisioned fictional accounts");
  await expect(page.getByRole("status")).toContainText("password changes and recovery");
  await expect(page.getByRole("link", { name: "Create account" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveCount(0);
  await expectAccessible(page);
  for (const route of ["/signup", "/forgot-password", "/auth/v1/user", "/rest/v1/businesses", "/api/metrics"]) {
    expect((await page.request.get(route)).status()).toBe(404);
  }
  const rejected = await page.request.post("/login", {
    headers: { origin: "https://unrelated.example.test" }, data: "untrusted",
  });
  expect(rejected.status()).toBe(403);
});

test("disabled email and password actions remain blocked when posted directly", async ({ page }) => {
  const manifestPath = path.join(
    path.dirname(workdir), "butterbox-showcase-public", "app", ".next", "server", "server-reference-manifest.json",
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const [name, destination] of [
    ["signUpAction", "/login"],
    ["resetPasswordAction", "/login"],
    ["updatePasswordAction", "/login"],
    ["createStaffInvitationAction", "/people?error=invite-disabled"],
    ["resendStaffInvitationAction", "/people?error=invite-disabled"],
  ]) {
    const actions = Object.entries(manifest.node).filter(([, action]) => action.exportedName === name);
    expect(actions).toHaveLength(1);
    const response = await page.request.post("/", {
      headers: { origin },
      multipart: { [`$ACTION_ID_${actions[0][0]}`]: "", password: "short" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe(destination);
  }
});

test("owner signs in over HTTPS and reviews synthetic people, rosters, reports and CSV", async ({ page, context }) => {
  await signIn(page, "owner");
  const cookies = await context.cookies(origin);
  const session = cookies.filter((cookie) =>
    cookie.name === SHOWCASE_AUTH_COOKIE_NAME || cookie.name.startsWith(`${SHOWCASE_AUTH_COOKIE_NAME}.`));
  expect(session.length).toBeGreaterThan(0);
  expect(session.every((cookie) => cookie.secure && cookie.httpOnly && cookie.sameSite === "Lax")).toBe(true);
  await page.goto(`/people?business=${state.plan.businessId}&venue=${state.plan.venueId}`);
  await expect(page.getByRole("region", { name: /^Employee Fictional / })).toHaveCount(14);
  await expect(page.getByText("Email invitations are unavailable in the public demo.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Send invitation", exact: true })).toHaveCount(0);
  await page.goto(`/roster?business=${state.plan.businessId}&venue=${state.plan.venueId}&week=${state.plan.currentWeek}`);
  await expect(page.getByRole("heading", { name: "Weekly roster", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Publication history", exact: true })).toBeVisible();
  await page.getByLabel("Department", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "Apply filter", exact: true }).click();
  await expect(page.locator("#open-shifts")).toContainText("2 to fill");
  await page.goto(`/timesheets?business=${state.plan.businessId}&venue=${state.plan.venueId}&week=${state.plan.week}`);
  await expect(page.getByRole("region", { name: "Payroll period", exact: true })).toContainText("Finalised");
  const download = await page.request.get(`/timesheets/payroll-export?venue=${state.plan.venueId}&batch=${state.batchId}`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("SIMULATION_ONLY-");
  expect((await download.text()).split("SIMULATION ONLY - NOT FOR PAYROLL").length - 1).toBe(14);
  await page.goto(`/reports/hours?business=${state.plan.businessId}&week=${state.plan.week}`);
  await expect(page.getByRole("heading", { name: "Hours and labour", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "SIMULATION ONLY - Harbour Cafe / FOH", exact: true })).toBeVisible();
  await expectAccessible(page);
  await page.goto(`/help?business=${state.plan.outsideId}`);
  await expect(page.getByRole("heading", { name: "Help unavailable", exact: true })).toBeVisible();
  await signOut(page);
  expect((await context.cookies(origin)).some((cookie) =>
    cookie.name === SHOWCASE_AUTH_COOKIE_NAME || cookie.name.startsWith(`${SHOWCASE_AUTH_COOKIE_NAME}.`))).toBe(false);
});

for (const [role, start] of [["foh_manager", 0], ["boh_manager", 7]]) {
  test(`public ${role} is limited to their department and cannot download payroll`, async ({ page }) => {
    await signIn(page, role);
    await page.goto(`/people?business=${state.plan.businessId}&venue=${state.plan.venueId}`);
    await expect(page.getByRole("region", { name: /^Employee Fictional / })).toHaveCount(7);
    for (const person of state.plan.staff.slice(start, start + 7)) {
      await expect(page.getByRole("region", { name: `Employee ${person.name}`, exact: true })).toBeVisible();
    }
    for (const person of state.plan.staff.slice(start === 0 ? 7 : 0, start === 0 ? 14 : 7)) {
      await expect(page.getByRole("region", { name: `Employee ${person.name}`, exact: true })).toHaveCount(0);
    }
    await page.goto(`/roster?business=${state.plan.businessId}&venue=${state.plan.venueId}&week=${state.plan.currentWeek}`);
    await expect(page.getByRole("heading", { name: "Weekly roster", exact: true })).toBeVisible();
    await expect(page.locator("#open-shifts")).toContainText("1 to fill");
    await page.goto(`/timesheets?business=${state.plan.businessId}&venue=${state.plan.venueId}&week=${state.plan.week}`);
    await expect(page.getByRole("region", { name: "Weekly planned and actual time", exact: true })
      .getByRole("heading", { level: 3 })).toHaveCount(7);
    expect((await page.request.get(`/timesheets/payroll-export?venue=${state.plan.venueId}&batch=${state.batchId}`))
      .status()).toBe(404);
    await page.goto(`/reports/hours?business=${state.plan.businessId}&week=${state.plan.week}`);
    await expect(page.getByText("Only a business owner can view this report.")).toBeVisible();
    await signOut(page);
  });
}

test("mobile employee reviews schedule and online attendance without manager access", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, "employee");
  await page.goto(`/my-schedule?business=${state.plan.businessId}&venue=${state.plan.venueId}&week=${state.plan.currentWeek}`);
  await expect(page.getByRole("heading", { name: "Weekly schedule", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next shift", exact: true })).toBeVisible();
  await expectAccessible(page);
  await page.goto(`/availability?business=${state.plan.businessId}&venue=${state.plan.venueId}`);
  await expect(page.getByRole("heading", { name: "Recurring availability", exact: true })).toBeVisible();
  await page.goto(`/attendance?business=${state.plan.businessId}&venue=${state.plan.venueId}`);
  await expect(page.getByRole("button", { name: "Clock in", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Offline attendance fallback" }))
    .toContainText("Offline claims and reopening are unavailable in the public demo.");
  await expect(page.getByText("Prepare this tab for offline reopening")).toHaveCount(0);
  await page.goto(`/help?business=${state.plan.businessId}&topic=offline`);
  await expect(page.getByRole("article", { name: "Offline attendance", exact: true }))
    .toContainText("The optional public showcase preview does not support offline claims or reopening.");
  await page.goto(`/attendance?business=${state.plan.businessId}&venue=${state.plan.venueId}`);
  await page.getByRole("link", { name: "View your attendance history", exact: true }).click();
  await expect(page.getByRole("list", { name: "Your recorded clock and break events", exact: true })
    .getByRole("listitem")).toHaveCount(4);
  await page.goto(`/timesheets?business=${state.plan.businessId}&venue=${state.plan.venueId}&week=${state.plan.week}`);
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("error") === "permission");
  await signOut(page);
});

test("outside-business owner cannot read the showcase tenant", async ({ page }) => {
  await signIn(page, "outside");
  await page.goto(`/help?business=${state.plan.businessId}`);
  await expect(page.getByRole("heading", { name: "Help unavailable", exact: true })).toBeVisible();
  expect((await page.request.get(`/timesheets/payroll-export?venue=${state.plan.venueId}&batch=${state.batchId}`))
    .status()).toBe(404);
  await page.goto("/choose-business");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});
