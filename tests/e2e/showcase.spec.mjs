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
