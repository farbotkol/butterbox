import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { readEnvironment, showcaseStatus, verify } from "../../scripts/showcase-environment.mjs";

const workdir = process.env.BUTTERBOX_SHOWCASE_WORKDIR;
if (!workdir || process.env.BUTTERBOX_TEST_APP_URL !== "http://127.0.0.1:3137" ||
    process.env.NEXT_PUBLIC_BUTTERBOX_SHOWCASE !== "true") {
  throw new Error("Showcase browser checks require the verified private local showcase configuration.");
}
await verify(workdir);
readEnvironment(workdir);
const settings = showcaseStatus(workdir);
const state = JSON.parse(await readFile(path.join(workdir, "fixture-state.json"), "utf8"));
if (state.phase !== "seeded" || state.simulationOnly !== true) throw new Error("Showcase fixture is not ready.");

async function authenticate(context, role) {
  const account = state.accounts.find((item) => item.role === role);
  const cookies = [];
  const supabase = createServerClient(settings.API_URL, settings.ANON_KEY, {
    cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
  });
  const result = await supabase.auth.signInWithPassword({ email: account.email, password: account.password });
  if (result.error) throw new Error(`Could not sign in the synthetic ${role}: ${result.error.code}`);
  await context.addCookies(cookies.map(({ name, value, options }) => ({
    name, value, domain: "127.0.0.1", path: options.path ?? "/", secure: false, sameSite: "Lax",
  })));
  return supabase;
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

async function navigate(page, label, heading) {
  await page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: label, exact: true }).click();
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
}

async function seededWeek(page, week) {
  const url = new URL(page.url());
  url.searchParams.set("business", state.plan.businessId);
  url.searchParams.set("venue", state.plan.venueId);
  url.searchParams.set("week", week);
  await page.goto(`${url.pathname}${url.search}`);
}

test("isolated showcase labels login and mobile owner report and marks every downloaded sample row", async ({ page, context, browser }) => {
  const sessions = [];
  const contexts = [];
  try {
    await page.goto("/login");
    await expect(page.getByRole("complementary", { name: "Synthetic showcase notice" })).toContainText("SIMULATION ONLY");
    sessions.push(await authenticate(context, "owner"));
    const report = `/reports/hours?business=${state.plan.businessId}&week=${state.plan.week}`;
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport);
      await page.goto(report);
      await expect(page.getByRole("heading", { name: "Hours and labour", exact: true })).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Synthetic showcase notice" })).toBeVisible();
      await expect(page.getByRole("article", { name: "SIMULATION ONLY - Harbour Cafe / FOH", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(accessibility.violations).toEqual([]);
    }
    const download = await page.request.get(`/timesheets/payroll-export?venue=${state.plan.venueId}&batch=${state.batchId}`);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-disposition"]).toContain("SIMULATION_ONLY-");
    expect(download.headers()["cache-control"]).toContain("no-store");
    const csv = await download.text();
    expect(csv).toContain('"simulation_notice"');
    expect(csv.split("SIMULATION ONLY - NOT FOR PAYROLL").length - 1).toBe(14);
    for (const role of ["foh_manager", "employee"]) {
      const scopedContext = await browser.newContext();
      contexts.push(scopedContext);
      sessions.push(await authenticate(scopedContext, role));
      const scopedPage = await scopedContext.newPage();
      await scopedPage.goto(report);
      await expect(scopedPage.getByText("Only a business owner can view this report.")).toBeVisible();
      const denied = await scopedContext.request.get(`/timesheets/payroll-export?venue=${state.plan.venueId}&batch=${state.batchId}`);
      expect(denied.status()).toBe(404);
    }
  } finally {
    for (const session of sessions) await session.auth.signOut();
    for (const scopedContext of contexts) await scopedContext.close();
  }
});

test("guided showcase owner reviews provisioned setup, people, roster and approved sample payroll through real navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, "owner");
  await expect(page.getByRole("heading", { name: "Get your first roster ready" })).toBeVisible();
  await page.goto("/setup");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toHaveCount(0);
  await navigate(page, "Departments", "Departments and roles");
  for (const department of ["FOH", "BOH"]) {
    await expect(page.getByRole("region", { name: `Department ${department}`, exact: true })).toBeVisible();
  }
  await navigate(page, "People", "Employee profiles");
  await expect(page.getByRole("region", { name: /^Employee Fictional / })).toHaveCount(14);
  await navigate(page, "Rostering", "Weekly roster");
  await seededWeek(page, state.plan.currentWeek);
  await expect(page.getByRole("heading", { name: "Publication history", exact: true })).toBeVisible();
  await page.getByLabel("Department", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "Apply filter", exact: true }).click();
  await expect(page.locator("#open-shifts")).toContainText("2 to fill");
  await navigate(page, "Timesheet review", "Weekly timesheet review");
  await page.getByLabel("Week containing date").fill(state.plan.week);
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  const period = page.getByRole("region", { name: "Payroll period", exact: true });
  await expect(period).toContainText("Finalised");
  await page.locator("summary").filter({ hasText: "Finalised payroll records (14)" }).click();
  await expect(page.getByRole("list", { name: "Finalised payroll records", exact: true }).getByRole("listitem")).toHaveCount(14);
  await page.locator("summary").filter({ hasText: "Payroll export history (1)" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download payroll CSV", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^SIMULATION_ONLY-butterbox-hours-/);
  expect(await download.failure()).toBeNull();
  await navigate(page, "Clock in / out", "Clock in / out");
  await expect(page.getByRole("heading", { name: "Attendance correction history", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

for (const [role, department, start] of [["foh_manager", "FOH", 0], ["boh_manager", "BOH", 7]]) {
  test(`guided showcase ${role} sees only their department and cannot finalise or export payroll`, async ({ page }) => {
    await signIn(page, role);
    await navigate(page, "People", "Employee profiles");
    await expect(page.getByRole("region", { name: /^Employee Fictional / })).toHaveCount(7);
    for (const person of state.plan.staff.slice(start, start + 7)) {
      await expect(page.getByRole("region", { name: `Employee ${person.name}`, exact: true })).toBeVisible();
    }
    await navigate(page, "Rostering", "Weekly roster");
    await seededWeek(page, state.plan.currentWeek);
    await expect(page.locator("#open-shifts")).toContainText("1 to fill");
    await navigate(page, "Timesheet review", "Weekly timesheet review");
    await page.getByLabel("Week containing date").fill(state.plan.week);
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    const groups = page.getByRole("region", { name: "Weekly planned and actual time", exact: true });
    await expect(groups.getByRole("heading", { level: 3 })).toHaveCount(7);
    for (const person of state.plan.staff.slice(start, start + 7)) {
      await expect(groups.getByRole("heading", { name: `${person.name} · ${department}`, exact: true })).toBeVisible();
    }
    await expect(groups.getByRole("group", { name: "Department approval", exact: true })
      .filter({ hasText: "Approved" })).toHaveCount(7);
    await expect(page.getByRole("button", { name: "Approve time", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Download payroll CSV", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reopen payroll period", exact: true })).toHaveCount(0);
    const denied = await page.request.get(`/timesheets/payroll-export?venue=${state.plan.venueId}&batch=${state.batchId}`);
    expect(denied.status()).toBe(404);
  });
}

test("guided mobile employee follows schedule, availability and original attendance but cannot manage timesheets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, "employee");
  await navigate(page, "My schedule", "My schedule");
  await seededWeek(page, state.plan.currentWeek);
  await expect(page.getByRole("heading", { name: "Weekly schedule", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next shift", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Timesheet review", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await navigate(page, "Availability", "Availability and leave");
  await expect(page.getByRole("heading", { name: "Recurring availability", exact: true })).toBeVisible();
  await navigate(page, "Clock in / out", "Clock in / out");
  await expect(page.getByRole("button", { name: "Clock in", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View your attendance history", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your attendance history", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Your recorded clock and break events", exact: true })
    .getByRole("listitem")).toHaveCount(4);
  await page.goto(`/timesheets?business=${state.plan.businessId}&venue=${state.plan.venueId}&week=${state.plan.week}`);
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("error") === "permission");
  await expect(page.getByRole("heading", { name: "Weekly timesheet review", exact: true })).toHaveCount(0);
});
