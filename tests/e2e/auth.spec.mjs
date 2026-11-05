import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  combineChunks,
  createChunks,
  stringFromBase64URL,
  stringToBase64URL,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "../helpers/disposable-database.mjs";

const appUrl = process.env.BUTTERBOX_TEST_APP_URL;
const apiUrl = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const mailUrl = process.env.BUTTERBOX_TEST_MAIL_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

if (
  process.env.BUTTERBOX_TEST_DISPOSABLE !== "yes" ||
  !appUrl || !apiUrl || !mailUrl || !anonKey || !serviceKey
) {
  throw new Error("Authentication tests require a disposable local Supabase and app.");
}
for (const value of [appUrl, apiUrl, mailUrl]) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.username || parsed.password
  ) {
    throw new Error("Authentication tests only permit local HTTP endpoints.");
  }
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(apiUrl, serviceKey, options);
await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);

async function findUser(email) {
  const result = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  expect(result.error).toBeNull();
  return result.data.users.find((user) => user.email === email);
}

async function waitForMail(email, subject) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const list = await (await fetch(new URL("/api/v1/messages", mailUrl))).json();
    const item = list.messages.find(
      (message) =>
        subject.test(message.Subject) &&
        message.To.some((recipient) => recipient.Address === email),
    );
    if (item) {
      const message = await (
        await fetch(new URL(`/api/v1/message/${item.ID}`, mailUrl))
      ).json();
      const match = message.HTML.match(/href="([^"]+)"/);
      expect(match, "The test email must contain a confirmation link").not.toBeNull();
      const link = new URL(match[1].replaceAll("&amp;", "&"));
      expect(link.origin).toBe(new URL(apiUrl).origin);
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("The expected test email was not received.");
}

async function followEmailLink(page, link, next) {
  const response = await fetch(link, { redirect: "manual" });
  expect(response.status).toBe(303);
  const target = new URL(response.headers.get("location"));
  expect(target.origin).toBe(new URL(appUrl).origin);
  expect(target.pathname).toBe("/auth/callback");
  expect(target.searchParams.get("next")).toBe(next);
  expect(target.searchParams.has("code")).toBe(true);
  const callback = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/auth/callback",
  );
  await page.evaluate(async (url) => {
    await fetch(url, { credentials: "same-origin", redirect: "manual" });
  }, target.toString());
  const callbackResponse = await callback;
  expect(callbackResponse.status()).toBe(303);
  expect(callbackResponse.headers().location).toBe(next);
  expect(callbackResponse.headers()["cache-control"]).toContain("no-store");
  await page.goto(next);
}

async function openMainNavigation(page) {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation).toBeVisible();
  const toggle = navigation.getByRole("button", { name: "Menu", exact: true });
  if (!await toggle.isVisible()) return;
  // A tap before hydration is ignored, so retry until React has attached the handler.
  await expect(async () => {
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

async function signIn(page, email, password) {
  if (new URL(page.url()).pathname !== "/login") await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForResponse(
      (result) =>
        result.request().method() === "POST" && new URL(result.url()).pathname === "/login",
    ),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

test("owner demand history imports preserve provenance, isolation and accessibility", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const { sql } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, secondVenueId, outsideVenueId, departmentId] =
    Array.from({ length: 6 }, () => randomUUID());
  const invalidVenueId = randomUUID();
  const users = {};
  const contexts = [];
  const pageErrors = [];
  const unexpectedOrigins = [];
  const historyPosts = [];
  const allowedOrigins = new Set([appUrl, apiUrl, mailUrl].map((value) => new URL(value).origin));
  const history = `/reports/demand-history?business=${businessId}&venue=${venueId}`;
  const salesHeader = "source_record_id,occurred_at,sales_amount_aud";
  const bookingHeader = "source_record_id,occurred_at,guest_count";
  const longId = "s".repeat(128);
  const sales = `${salesHeader}\n${longId},2024-01-15T12:30:00+11:00,00012.50\n` +
    "sale-2,2024-07-15T12:30:00+10:00,0\n" +
    Array.from({ length: 24 }, (_, index) =>
      `z${String(index).padStart(2, "0")},2024-01-16T12:30:00+11:00,1\n`).join("");
  const bookings = `${bookingHeader}\nbooking-1,2024-04-07T02:30:00+10:00,4\n`;

  async function monitor(context, monitoredPage) {
    monitoredPage.on("pageerror", (error) => pageErrors.push(error.message));
    await context.route("**/*", (route) => {
      const origin = new URL(route.request().url()).origin;
      if (allowedOrigins.has(origin)) return route.continue();
      unexpectedOrigins.push(origin);
      return route.abort("blockedbyclient");
    });
  }
  async function importFile(contents, type = "sales") {
    const form = page.getByRole("form", { name: "Import demand history" });
    await form.getByLabel("History type").selectOption(type);
    await form.getByLabel("Source system name").fill("Harbour POS");
    await form.getByLabel("CSV file").setInputFiles({
      name: "history.csv", mimeType: "text/csv", buffer: Buffer.from(contents),
    });
    await form.getByRole("button", { name: "Import history", exact: true }).click();
  }
  const counts = async () => ({
    imports: Number(await sql(`select count(*) from public.demand_history_imports where business_id = '${businessId}'::uuid`)),
    records: Number(await sql(`select count(*) from public.demand_history_records where business_id = '${businessId}'::uuid`)),
  });

  try {
    for (const role of ["owner", "manager", "worker", "admin", "outside"]) {
      const email = `demand-ui-${role}-${suffix}@example.test`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(created.error).toBeNull();
      users[role] = { id: created.data.user.id, email };
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Demand UI cafe" }, { id: outsideId, name: "Outside demand cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Sydney venue", timezone: "Australia/Sydney" },
      { id: secondVenueId, business_id: businessId, name: "Second venue", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner.id, role: "owner" },
      { business_id: businessId, user_id: users.manager.id, role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users.worker.id, role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users.admin.id, role: "admin" },
      { business_id: outsideId, user_id: users.outside.id, role: "owner" },
    ])).error).toBeNull();

    await monitor(page.context(), page);
    const anonymousNavigations = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) anonymousNavigations.push(frame.url());
    });
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/reports/demand-history") {
        historyPosts.push(request.url());
      }
    });
    await page.goto(history, { waitUntil: "commit", timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Welcome to Butterbox" })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(anonymousNavigations.filter((url) => new URL(url).pathname === "/login").length,
      "anonymous demand history redirects should settle without a login reload loop").toBeLessThan(5);
    await signIn(page, users.owner.email, password);
    await page.goto(`/reports/hours?business=${businessId}&contextVenue=${venueId}`);
    await page.getByRole("link", { name: "Import sales and booking history" }).click();
    await expect(page.getByRole("heading", { name: "Demand history", exact: true })).toBeVisible();
    await expect(page.getByText("No history has been imported for this venue yet.")).toBeVisible();

    const form = page.getByRole("form", { name: "Import demand history" });
    await expect(page.getByText("this version has no correction or deletion workflow.", { exact: false })).toBeVisible();
    await form.getByLabel("History type").focus();
    await page.keyboard.press("Tab");
    await expect(form.getByLabel("Source system name")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(form.getByLabel("CSV file")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(form.getByRole("button", { name: "Import history" })).toBeFocused();

    await importFile(`${salesHeader},customer_name\nid,2024-01-15T12:30:00+11:00,1,Person`);
    await expect(form.getByRole("alert")).toContainText("exactly the columns");
    expect(await counts()).toEqual({ imports: 0, records: 0 });
    await importFile(`${salesHeader}\nid,2024-10-06T02:30:00+10:00,1`);
    await expect(form.getByRole("alert")).toContainText("offset matching Australia/Sydney");
    expect(await counts()).toEqual({ imports: 0, records: 0 });
    await importFile(Buffer.from([0xff, 0xfe, 0x61]));
    await expect(form.getByRole("alert")).toContainText("encoded as UTF-8");
    const postsBeforeOversizedFile = historyPosts.length;
    await importFile(Buffer.alloc(0));
    await expect(form.getByRole("alert")).toContainText("non-empty CSV file");
    expect(historyPosts.length).toBe(postsBeforeOversizedFile);
    await importFile(Buffer.alloc(1_100_000, 0x61));
    await expect(form.getByRole("alert")).toContainText("no larger than 500,000 bytes");
    await expect(form.getByLabel("CSV file")).toHaveAttribute("aria-invalid", "true");
    expect(historyPosts.length).toBe(postsBeforeOversizedFile);
    await form.getByLabel("CSV file").setInputFiles({
      name: "history.csv", mimeType: "text/csv", buffer: Buffer.alloc(500_001, 0x61),
    });
    await form.getByLabel("CSV file").evaluate((input) => input.setCustomValidity(""));
    const oversizedResponse = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/reports/demand-history");
    await form.getByRole("button", { name: "Import history", exact: true }).click();
    expect((await oversizedResponse).status()).toBe(200);
    expect(historyPosts.length).toBe(postsBeforeOversizedFile + 1);
    await expect(form.getByRole("alert")).toContainText("no larger than 500,000 bytes");
    expect(await counts()).toEqual({ imports: 0, records: 0 });
    await importFile(sales);
    await expect(page.getByRole("status")).toContainText("Import confirmed");
    await expect(page.getByRole("heading", { name: "Import provenance" })).toBeVisible();
    await expect(page.getByText("Harbour POS", { exact: true })).toBeVisible();
    await expect(page.getByText(longId, { exact: true })).toBeVisible();
    await expect(page.getByText("Sales amount (AUD): 00012.50")).toBeVisible();
    expect(await counts()).toEqual({ imports: 1, records: 26 });
    const salesImportId = new URL(page.url()).searchParams.get("import");
    expect(salesImportId).toBeTruthy();
    await page.reload();
    await expect(page.getByText("Sales amount (AUD): 00012.50")).toBeVisible();
    const pagination = page.getByRole("navigation", { name: "Demand history pages" });
    await pagination.getByRole("link", { name: "Next page" }).click();
    await expect(page.getByText("z23", { exact: true })).toBeVisible();
    await expect(page.getByText(longId, { exact: true })).toHaveCount(0);
    await pagination.getByRole("link", { name: "Previous page" }).click();
    await expect(page.getByText(longId, { exact: true })).toBeVisible();

    for (const width of [375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("heading", { name: "Original records" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width === 375 || width === 1440) {
        const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect(accessibility.violations).toEqual([]);
      }
    }
    await page.getByRole("link", { name: "Import history", exact: true }).click();
    await importFile(sales);
    await expect(form.getByRole("alert")).toContainText("already been imported");
    expect(await counts()).toEqual({ imports: 1, records: 26 });
    await importFile(bookings, "bookings");
    await expect(page.getByRole("status")).toContainText("Import confirmed");
    await expect(page.getByText("Guest count: 4")).toBeVisible();
    expect(await counts()).toEqual({ imports: 2, records: 27 });
    await page.getByRole("link", { name: "Import history", exact: true }).click();
    await expect(page.getByRole("link", { name: /View sales amounts/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /View bookings/ })).toBeVisible();
    await page.getByRole("link", { name: "Help with demand history" }).click();
    await expect(page.getByRole("heading", { name: "Importing sales and booking history" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Importing sales and booking history" }))
      .toContainText("Only a business owner can view or import history");
    await page.goto(`/reports/demand-history?business=${businessId}&venue=${secondVenueId}`);
    await expect(page.getByText("No history has been imported for this venue yet.")).toBeVisible();
    await page.goto(`/reports/demand-history?business=${businessId}&venue=${secondVenueId}&import=${salesImportId}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("couldn't load this import history");
    await expect(page.getByText(longId, { exact: true })).toHaveCount(0);
    expect((await admin.from("venues").insert({
      id: invalidVenueId, business_id: businessId, name: "Invalid timezone venue", timezone: "Invalid/Zone",
    })).error).toBeNull();
    await page.goto(`/reports/demand-history?business=${businessId}&venue=${invalidVenueId}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("invalid timezone");
    await expect(page.getByRole("form", { name: "Import demand history" })).toHaveCount(0);

    for (const role of ["manager", "worker", "admin", "outside"]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      contexts.push(context);
      const rolePage = await context.newPage();
      await monitor(context, rolePage);
      await signIn(rolePage, users[role].email, password);
      await rolePage.goto(history);
      await expect(rolePage.getByRole("main").getByRole("alert")).toContainText(role === "outside"
        ? "selected business or venue is unavailable" : "Only a business owner");
      await expect(rolePage.getByRole("form", { name: "Import demand history" })).toHaveCount(0);
      await expect(rolePage.getByText("Harbour POS", { exact: true })).toHaveCount(0);
      await context.close();
    }
    expect(pageErrors).toEqual([]);
    expect(unexpectedOrigins).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const user of Object.values(users)) expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
  }
});

test("future vision previews are isolated, honest and accessible", async ({ page, browser }, testInfo) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, outsideVenueId, departmentId] =
    Array.from({ length: 5 }, () => randomUUID());
  const users = {};
  const contexts = [];
  const enabled = process.env.BUTTERBOX_FUTURE_VISION_PREVIEW === "true";
  const destination = `/?business=${businessId}&venue=${venueId}`;
  const selector = 'details[aria-label="Future concept previews"]';
  const pageErrors = [];
  const unexpectedOrigins = [];
  const allowedOrigins = new Set([appUrl, apiUrl, mailUrl].map((url) => new URL(url).origin));
  async function restrictBrowser(context) {
    await context.route("**/*", (route) => {
      const origin = new URL(route.request().url()).origin;
      if (allowedOrigins.has(origin)) return route.continue();
      unexpectedOrigins.push(origin);
      return route.abort("blockedbyclient");
    });
  }
  try {
    for (const role of ["owner", "manager", "worker", "outside"]) {
      const email = `future-${role}-${suffix}@example.test`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(created.error).toBeNull();
      users[role] = { id: created.data.user.id, email };
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Fictional concept cafe ${suffix}` },
      { id: outsideId, name: `Outside concept cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Fictional venue", timezone: "Australia/Sydney" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside venue", timezone: "Australia/Sydney" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Fictional department",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner.id, role: "owner" },
      { business_id: businessId, user_id: users.manager.id, role: "foh_manager",
        venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users.worker.id, role: "employee",
        venue_id: venueId, department_id: departmentId },
      { business_id: outsideId, user_id: users.outside.id, role: "owner" },
    ])).error).toBeNull();

    await restrictBrowser(page.context());
    await page.goto(destination);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator(selector)).toHaveCount(0);

    let ownerText;
    for (const role of ["owner", "manager", "worker"]) {
      const context = role === "owner" ? page.context() : await browser.newContext();
      if (role !== "owner") {
        contexts.push(context);
        await restrictBrowser(context);
      }
      const rolePage = role === "owner" ? page : await context.newPage();
      rolePage.on("pageerror", (error) => pageErrors.push(error.message));
      await rolePage.goto("/login");
      await signIn(rolePage, users[role].email, password);
      await rolePage.goto(destination);
      await expect(rolePage.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();
      if (process.env.NEXT_PUBLIC_BUTTERBOX_SHOWCASE === "true") {
        await expect(rolePage.getByRole("complementary", { name: "Synthetic showcase notice" })).toBeVisible();
      }
      for (const label of ["Forecast demand", "Labour optimisation", "Compliance checks"]) {
        const card = rolePage.locator("section").filter({ has: rolePage.getByText(label, { exact: true }) });
        await expect(card).toContainText("Not available");
        await expect(card).toContainText("Concept · not yet available");
      }
      const copilot = rolePage.locator("section").filter({
        has: rolePage.getByRole("heading", { name: "Butterbox AI Copilot", exact: true }),
      });
      await expect(copilot).toContainText("This link opens the existing roster; it does not use AI.");
      const preview = rolePage.locator(selector);
      if (!enabled) {
        await expect(preview).toHaveCount(0);
        if (role === "owner") {
          await rolePage.getByRole("link", { name: "Open weekly roster" }).click();
          await expect(rolePage.getByRole("heading", { name: "Weekly roster", exact: true })).toBeVisible();
        }
        continue;
      }

      await expect(preview).toBeVisible();
      await expect(preview).not.toHaveAttribute("open", "");
      const summary = preview.locator("summary");
      const writes = [];
      const recordWrite = (request) => {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(request.method());
      };
      rolePage.on("request", recordWrite);
      await summary.focus();
      await rolePage.keyboard.press("Enter");
      await expect(preview).toHaveAttribute("open", "");
      await expect(preview.locator("article")).toHaveCount(3);
      for (const title of ["AI rostering assistant", "Demand forecasting", "Award Central review"]) {
        await expect(preview.getByRole("heading", { name: title, exact: true })).toBeVisible();
      }
      await expect(preview.getByText("Concept · not functional", { exact: true })).toHaveCount(3);
      await expect(preview).toContainText("These fictional examples are for internal discussion, not working features.");
      await expect(preview).toContainText("No award interpretation, entitlement, payroll or compliance decision is made.");
      await expect(preview.locator("form, input, button, select, textarea")).toHaveCount(0);
      await expect(preview.getByRole("link")).toHaveCount(1);
      const text = await preview.innerText();
      expect(text).not.toContain(suffix);
      if (role === "owner") ownerText = text;
      else expect(text).toBe(ownerText);
      await rolePage.keyboard.press("Space");
      await expect(preview).not.toHaveAttribute("open", "");
      await summary.focus();
      await rolePage.keyboard.press("Enter");
      await expect(preview).toHaveAttribute("open", "");
      rolePage.off("request", recordWrite);
      expect(writes).toEqual([]);

      if (role === "owner") {
        for (const width of [375, 390, 768, 1024, 1440]) {
          await rolePage.setViewportSize({ width, height: 900 });
          expect(await rolePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            `${width}px has no horizontal overflow`).toBe(true);
          const violations = await new AxeBuilder({ page: rolePage }).include(selector)
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
          expect(violations.violations.map((violation) => violation.id), `${width}px accessibility`).toEqual([]);
          if (width === 375 || width === 1440) {
            await rolePage.screenshot({ path: testInfo.outputPath(`future-vision-${width}.png`), fullPage: true });
          }
        }
        const help = preview.getByRole("link", { name: "Help with future concepts", exact: true });
        await expect(help).toHaveAttribute("href", `/help?business=${businessId}&contextVenue=${venueId}&topic=unavailable`);
        await help.click();
        await expect(rolePage.getByRole("heading", { name: "Unavailable capabilities", exact: true })).toBeVisible();
        await expect(rolePage.getByRole("article")).toContainText("Explore future concepts");
      }
    }

    const outsideContext = await browser.newContext();
    contexts.push(outsideContext);
    await restrictBrowser(outsideContext);
    const outside = await outsideContext.newPage();
    await outside.goto("/login");
    await signIn(outside, users.outside.email, password);
    await outside.goto(destination);
    await expect(outside.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
    await expect(outside.locator(selector)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    expect(unexpectedOrigins).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const user of Object.values(users)) {
      expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
    }
  }
});

test("shift conversations preserve participant privacy and accessible in-app history", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const { sql } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, outsideVenueId, fohId, bohId, workerId, replacementId, shiftId] =
    Array.from({ length: 9 }, () => randomUUID());
  const roles = ["manager", "boh", "worker", "coworker", "replacement", "relinked", "outside"];
  const users = {};
  const contexts = [];
  const pageErrors = [];
  const unexpectedOrigins = [];
  const allowedOrigins = new Set([appUrl, apiUrl, mailUrl].map((value) => new URL(value).origin));
  const history = `/shift-conversations?business=${businessId}&venue=${venueId}`;
  const shift = `${history}&shift=${shiftId}`;
  const conversation = (id) => `${history}&conversation=${id}`;
  const accessError = (rolePage) => rolePage.getByRole("alert").filter({
    hasText: /We couldn't load this conversation|Your business and venue access could not be verified/,
  });
  const originalMessage = `Private service message <img src=x onerror="window.__conversationInjected=true"> ${"x".repeat(300)}`;

  async function monitor(context, monitoredPage) {
    monitoredPage.on("pageerror", (error) => pageErrors.push(error.message));
    await context.route("**/*", (route) => {
      const origin = new URL(route.request().url()).origin;
      if (allowedOrigins.has(origin)) return route.continue();
      unexpectedOrigins.push(origin);
      return route.abort("blockedbyclient");
    });
  }

  async function openRole(role, viewport = { width: 390, height: 844 }) {
    const context = await browser.newContext({ viewport });
    contexts.push(context);
    const rolePage = await context.newPage();
    await monitor(context, rolePage);
    await signIn(rolePage, `conversation-ui-${role}-${suffix}@example.test`, password);
    return { context, page: rolePage };
  }

  try {
    for (const role of roles) {
      const result = await admin.auth.admin.createUser({
        email: `conversation-ui-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users[role] = result.data.user.id;
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Conversation UI cafe" }, { id: outsideId, name: "Outside UI cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.manager, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "boh_manager", venue_id: venueId, department_id: bohId },
      ...["worker", "coworker", "replacement", "relinked"].map((role) => ({
        business_id: businessId, user_id: users[role], role: "employee", venue_id: venueId, department_id: fohId,
      })),
      { business_id: outsideId, user_id: users.outside, role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.worker, name: "Conversation worker", role_title: "Server" },
      { id: replacementId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.replacement, name: "Replacement worker", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert({
      id: shiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: workerId, role_title: "Server", starts_at: "2032-04-05T09:00:00Z",
      ends_at: "2032-04-05T13:00:00Z", is_published: true,
    })).error).toBeNull();

    await monitor(page.context(), page);
    const anonymousNavigations = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) anonymousNavigations.push(frame.url());
    });
    await page.goto(shift, { waitUntil: "commit", timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Welcome to Butterbox" })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(anonymousNavigations.filter((url) => new URL(url).pathname === "/login").length,
      "anonymous conversation redirects should settle without a login reload loop").toBeLessThan(5);
    await signIn(page, `conversation-ui-manager-${suffix}@example.test`, password);
    await page.goto(`/roster?week=2032-04-05&business=${businessId}&venue=${venueId}&department=all`);
    await page.locator(`#roster-shift-${shiftId}`).getByRole("link", { name: /Discuss shift for Conversation worker: Server/ }).click();
    await expect(page.getByRole("heading", { name: "Shift conversations", exact: true })).toBeVisible();
    await expect(page.getByText("No messages yet. Start the conversation below.")).toBeVisible();
    await expect(page.getByText(/No email, push or automatic notifications are sent/)).toBeVisible();
    const managerForm = page.getByRole("form", { name: "Send shift message" });
    await managerForm.getByLabel("Message", { exact: true }).fill("x".repeat(2001));
    await managerForm.getByRole("button", { name: "Send message" }).click();
    await expect(managerForm.getByRole("alert")).toContainText("up to 2,000 characters");
    expect(Number(await sql(`select count(*) from public.shift_conversation_messages where business_id = '${businessId}'::uuid`))).toBe(0);
    await managerForm.getByLabel("Message", { exact: true }).fill(originalMessage);
    await managerForm.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("status")).toContainText("Message sent in-app.");
    await expect(page.getByText(originalMessage, { exact: true })).toBeVisible();
    const firstThread = new URL(page.url()).searchParams.get("conversation");
    expect(firstThread).toBeTruthy();
    await expect(page.locator("section[aria-labelledby='conversation-heading'] ol img")).toHaveCount(0);
    expect(await page.evaluate(() => window.__conversationInjected)).toBeUndefined();
    await page.reload();
    await expect(page.getByText(originalMessage, { exact: true })).toBeVisible();

    for (const width of [375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("heading", { name: "Shift conversations", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width === 375 || width === 1440) {
        const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect(accessibility.violations).toEqual([]);
      }
    }
    await page.goto(history);
    await expect(page.getByRole("heading", { name: "Conversation history", exact: true })).toBeVisible();
    await expect(page.getByText(originalMessage, { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: /Server · Conversation worker/ }).click();
    await expect(page.getByText(originalMessage, { exact: true })).toBeVisible();

    const worker = await openRole("worker", { width: 375, height: 812 });
    await worker.page.goto(`/my-schedule?week=2032-04-05&business=${businessId}&venue=${venueId}`);
    await worker.page.getByRole("region", { name: "Weekly schedule" })
      .getByRole("link", { name: /Discuss shift for Server/ }).first().click();
    await expect(worker.page.getByText(originalMessage, { exact: true })).toBeVisible();
    await expect(worker.page.locator("section[aria-labelledby='conversation-heading'] ol img")).toHaveCount(0);
    const workerForm = worker.page.getByRole("form", { name: "Send shift message" });
    await workerForm.getByLabel("Message", { exact: true }).fill("Employee keyboard reply");
    await workerForm.getByLabel("Message", { exact: true }).focus();
    await worker.page.keyboard.press("Tab");
    await expect(workerForm.getByRole("button", { name: "Send message" })).toBeFocused();
    await worker.page.keyboard.press("Enter");
    await expect(worker.page.getByRole("status")).toContainText("Message sent in-app.");
    await worker.page.reload();
    const ordered = worker.page.locator("section[aria-labelledby='conversation-heading'] ol > li");
    await expect(ordered).toHaveCount(2);
    await expect(ordered.nth(0)).toContainText("Private service message");
    await expect(ordered.nth(1)).toContainText("Employee keyboard reply");
    await worker.page.goto(`/notifications?business=${businessId}&venue=${venueId}`);
    await expect(worker.page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
    await expect(worker.page.locator("body")).not.toContainText("Private service message");
    await expect(worker.page.locator("body")).not.toContainText("Employee keyboard reply");
    await worker.page.goto(conversation(firstThread));
    await expect(worker.page.getByText("Employee keyboard reply", { exact: true })).toBeVisible();

    for (const role of ["coworker", "boh", "outside"]) {
      const visitor = await openRole(role);
      await visitor.page.goto(conversation(firstThread));
      await expect(accessError(visitor.page)).toBeVisible();
      await expect(visitor.page.getByText(originalMessage, { exact: true })).toHaveCount(0);
      await expect(visitor.page.getByText("Employee keyboard reply", { exact: true })).toHaveCount(0);
      if (role !== "outside") {
        await visitor.page.goto(history);
        await expect(visitor.page.getByText("No conversations yet.", { exact: false })).toBeVisible();
      }
      await visitor.context.close();
    }

    await sql(`update public.shifts set employee_id = '${replacementId}'::uuid where id = '${shiftId}'::uuid`);
    await workerForm.getByLabel("Message", { exact: true }).fill("Stale reply must not send");
    await workerForm.getByRole("button", { name: "Send message" }).click();
    await expect(workerForm.getByRole("alert")).toContainText("shift, department or linked participant changed");
    await worker.page.reload();
    await expect(worker.page.getByText(originalMessage, { exact: true })).toBeVisible();
    await expect(worker.page.getByText(/This conversation is read-only/)).toBeVisible();
    await expect(worker.page.getByRole("form", { name: "Send shift message" })).toHaveCount(0);

    const replacement = await openRole("replacement");
    await replacement.page.goto(conversation(firstThread));
    await expect(accessError(replacement.page)).toBeVisible();
    await expect(replacement.page.getByText(originalMessage, { exact: true })).toHaveCount(0);
    await replacement.page.goto(shift);
    await expect(replacement.page.getByText("No messages yet. Start the conversation below.")).toBeVisible();
    const replacementForm = replacement.page.getByRole("form", { name: "Send shift message" });
    await replacementForm.getByLabel("Message", { exact: true }).fill("Replacement-only reply");
    await replacementForm.getByRole("button", { name: "Send message" }).click();
    await expect(replacement.page.getByRole("status")).toContainText("Message sent in-app.");
    const replacementThread = new URL(replacement.page.url()).searchParams.get("conversation");
    expect(replacementThread).toBeTruthy();
    expect(replacementThread).not.toBe(firstThread);
    await worker.page.goto(conversation(replacementThread));
    await expect(accessError(worker.page)).toBeVisible();
    await expect(worker.page.getByText("Replacement-only reply", { exact: true })).toHaveCount(0);

    await sql(`update public.employees set auth_user_id = '${users.relinked}'::uuid where id = '${replacementId}'::uuid`);
    await replacement.page.goto(conversation(replacementThread));
    await expect(accessError(replacement.page)).toBeVisible();
    const relinked = await openRole("relinked");
    await relinked.page.goto(conversation(replacementThread));
    await expect(accessError(relinked.page)).toBeVisible();
    await relinked.page.goto(shift);
    await expect(relinked.page.getByText("No messages yet. Start the conversation below.")).toBeVisible();
    await expect(relinked.page.getByText("Replacement-only reply", { exact: true })).toHaveCount(0);

    await page.goto(history);
    await expect(page.getByRole("link", { name: /Server · Conversation worker/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Server · Replacement worker/ })).toBeVisible();
    await expect(page.getByText("Employee keyboard reply", { exact: true })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    expect(unexpectedOrigins).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const user of Object.values(users)) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("scoped announcements publish immutable plain-text history with real acknowledgements and concurrent retries", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { sql } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, outsideVenueId, fohId, bohId, workerId, bohWorkerId] =
    Array.from({ length: 8 }, () => randomUUID());
  const users = {};
  const contexts = [];
  const clients = {};
  const destination = `/announcements?business=${businessId}&venue=${venueId}`;
  try {
    for (const role of ["owner", "manager", "worker", "boh", "outside"]) {
      const created = await admin.auth.admin.createUser({
        email: `notice-ui-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users[role] = created.data.user.id;
      clients[role] = createClient(apiUrl, anonKey, options);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Announcement test cafe" }, { id: outsideId, name: "Outside notice cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Notice venue", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.manager, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "employee", venue_id: venueId, department_id: bohId },
      { business_id: outsideId, user_id: users.outside, role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.worker, name: "FOH notice worker", role_title: "Server" },
      { id: bohWorkerId, business_id: businessId, venue_id: venueId, department_id: bohId,
        auth_user_id: users.boh, name: "BOH notice worker", role_title: "Cook" },
    ])).error).toBeNull();
    for (const [role, client] of Object.entries(clients)) {
      expect((await client.auth.signInWithPassword({
        email: `notice-ui-${role}-${suffix}@example.test`, password,
      })).error).toBeNull();
    }
    await page.goto(destination);
    await expect(page).toHaveURL((url) => url.pathname === "/login");
    await signIn(page, `notice-ui-owner-${suffix}@example.test`, password);
    await page.goto(destination);
    await expect(page.getByRole("heading", { name: "Announcements", exact: true })).toBeVisible();
    const form = page.getByRole("form", { name: "Publish announcement", exact: true });
    await form.getByLabel("Title", { exact: true }).fill("Venue briefing");
    await form.getByLabel("Message", { exact: true }).fill("Read this plain text <img src=x onerror=alert(1)>.");
    await form.getByLabel("Acknowledgement", { exact: true }).selectOption("required");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Publish announcement", exact: true }).click();
    const published = page.getByRole("article", { name: "Venue briefing", exact: true });
    await expect(published).toContainText("2 recorded recipients");
    await expect(published).toContainText("0 acknowledged; 2 pending");
    await expect(published.locator("img")).toHaveCount(0);
    await page.getByRole("link", { name: "View receipts for Venue briefing", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Recipient receipts", exact: true })).toBeVisible();
    await expect(page.getByText("FOH notice worker: Pending acknowledgement", { exact: true })).toBeVisible();
    const publishedRows = await clients.owner.rpc("list_published_announcements", { p_business_id: businessId });
    expect(publishedRows.error).toBeNull();
    const venueNotice = publishedRows.data.find((item) => item.title === "Venue briefing").announcement_id;

    const workerContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, `notice-ui-worker-${suffix}@example.test`, password);
    await workerPage.goto(destination);
    await expect(workerPage.getByRole("heading", { name: "New announcement", exact: true })).toHaveCount(0);
    const received = workerPage.getByRole("article", { name: "Venue briefing", exact: true });
    await expect(received).toContainText("<img src=x onerror=alert(1)>");
    await expect(received.locator("img")).toHaveCount(0);
    await received.getByRole("checkbox").check();
    await received.getByRole("button", { name: "Acknowledge notice", exact: true }).focus();
    await workerPage.keyboard.press("Enter");
    await expect(workerPage.getByRole("article", { name: "Venue briefing", exact: true })).toContainText("Acknowledged");
    await expect(workerPage.getByRole("button", { name: "Acknowledge notice", exact: true })).toHaveCount(0);
    expect(await workerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page: workerPage }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    await workerPage.goto(`/notifications?business=${businessId}&venue=${venueId}`);
    await workerPage.getByRole("region", { name: "Announcement updates", exact: true })
      .getByRole("link", { name: "Venue briefing", exact: true }).click();
    await expect(workerPage.getByRole("article", { name: "Venue briefing", exact: true })).toContainText("Acknowledged");

    const managerContext = await browser.newContext();
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `notice-ui-manager-${suffix}@example.test`, password);
    await managerPage.goto(destination);
    const managerForm = managerPage.getByRole("form", { name: "Publish announcement", exact: true });
    await expect(managerForm.getByLabel("Audience", { exact: true }).locator("option")).toHaveCount(1);
    await expect(managerForm.getByLabel("Department", { exact: true }).locator(`option[value="${bohId}"]`)).toHaveCount(0);
    await managerForm.getByLabel("Title", { exact: true }).fill("FOH information");
    await managerForm.getByLabel("Message", { exact: true }).fill("Information, not a roster change.");
    await managerForm.getByRole("checkbox").check();
    await managerForm.getByRole("button", { name: "Publish announcement", exact: true }).click();
    await expect(managerPage.getByRole("article", { name: "FOH information", exact: true })).toContainText("1 recorded recipients");
    await expect(managerPage.getByRole("article", { name: "Venue briefing", exact: true })).toHaveCount(0);
    await managerForm.getByLabel("Title", { exact: true }).fill("Denied whole venue");
    await managerForm.getByLabel("Message", { exact: true }).fill("This must not be published.");
    await managerForm.getByLabel("Audience", { exact: true }).evaluate((select) => {
      select.add(new Option("Forged venue", "venue", true, true));
    });
    await managerForm.getByLabel("Department", { exact: true }).selectOption("");
    await managerForm.getByRole("checkbox").check();
    await managerForm.getByRole("button", { name: "Publish announcement", exact: true }).click();
    await expect(managerForm.getByRole("alert")).toContainText("You cannot publish to that audience");
    await expect(managerForm.getByLabel("Title", { exact: true })).toHaveValue("Denied whole venue");
    await workerPage.goto(destination);
    await expect(workerPage.getByRole("article", { name: "FOH information", exact: true })).toContainText("Information only");
    expect((await clients.boh.rpc("list_my_announcements", { p_business_id: businessId })).data.map((item) => item.title)).not.toContain("FOH information");

    const args = {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: null,
      p_title: "Concurrent briefing", p_body: "Recorded once", p_requires_acknowledgement: true, p_request_id: randomUUID(),
    };
    const publications = await Promise.all([
      clients.owner.rpc("publish_announcement", args), clients.owner.rpc("publish_announcement", args),
    ]);
    for (const result of publications) expect(result.error).toBeNull();
    expect(publications[0].data).toBe(publications[1].data);
    expect(await sql(`select count(*) from public.announcements where id='${publications[0].data}'`)).toBe("1");
    const myRows = await clients.worker.rpc("list_my_announcements", { p_business_id: businessId });
    expect(myRows.error).toBeNull();
    const receipt = myRows.data.find((item) => item.announcement_id === publications[0].data);
    const ackArgs = { p_business_id: businessId, p_recipient_id: receipt.recipient_id };
    const acknowledgements = await Promise.all([
      clients.worker.rpc("acknowledge_announcement", ackArgs), clients.worker.rpc("acknowledge_announcement", ackArgs),
    ]);
    for (const result of acknowledgements) expect(result.error).toBeNull();
    expect(acknowledgements[0].data).toBe(acknowledgements[1].data);
    expect(await sql(`select count(*) from public.sensitive_action_audit where business_id='${businessId}'
      and source_table='announcement_recipients' and operation='UPDATE' and record_id='${receipt.recipient_id}'`)).toBe("1");
    expect((await clients.manager.rpc("publish_announcement", { ...args, p_request_id: randomUUID() })).error?.message).toBe("Permission denied");
    expect((await clients.worker.rpc("publish_announcement", { ...args, p_request_id: randomUUID() })).error?.message).toBe("Permission denied");
    expect((await clients.outside.rpc("list_my_announcements", { p_business_id: businessId })).error?.message).toBe("Permission denied");
    expect((await clients.boh.rpc("acknowledge_announcement", ackArgs)).error?.message).toBe("Permission denied");
    expect((await clients.manager.rpc("list_announcement_receipts", {
      p_business_id: businessId, p_announcement_id: venueNotice,
    })).error?.message).toBe("Permission denied");
    await workerPage.goto(`${destination}&notice=${venueNotice}`);
    await expect(workerPage.getByText("The notice is unavailable or you do not have permission to view its receipts.", { exact: true })).toBeVisible();
    await workerPage.goto(`/announcements?business=${outsideId}&venue=${outsideVenueId}`);
    await expect(workerPage.getByRole("heading", { name: "Announcements unavailable", exact: true })).toBeVisible();
    await page.goto(`${destination}&notice=${venueNotice}`);
    await expect(page.getByRole("article", { name: "Venue briefing", exact: true })).toContainText("1 acknowledged; 1 pending");
    await expect(page.getByText(/^FOH notice worker: Acknowledged/)).toBeVisible();
    await page.goto(`/settings/audit?business=${businessId}&source=announcements`);
    await expect(page.getByRole("list", { name: "Sensitive action history", exact: true })
      .getByRole("heading", { name: /Announcement publications/ })).toHaveCount(3);
    await workerPage.goto(destination);
    await workerPage.getByRole("link", { name: "Help with announcements", exact: true }).click();
    await expect(workerPage.getByRole("article", { name: "Announcements", exact: true })).toContainText("Opening the page alone does not acknowledge");
    expect(await sql(`select count(*) from public.announcements where business_id='${businessId}'`)).toBe("3");
  } finally {
    for (const context of contexts) await context.close();
    for (const client of Object.values(clients)) expect((await client.auth.signOut()).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const userId of Object.values(users)) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});

test("owner business report exports download scoped CSVs with audited generation and accessible controls", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const { sql, holdLock, waitForLock } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, secondVenueId, outsideVenueId, departmentId, secondDepartmentId,
    outsideDepartmentId, workerId, secondWorkerId, outsideWorkerId, sessionId, openSessionId] =
    Array.from({ length: 13 }, () => randomUUID());
  const users = {};
  const contexts = [];
  const week = "2024-09-30";
  const reportUrl = `/reports/hours?business=${businessId}&contextVenue=${venueId}&week=${week}`;
  const fields = { business: businessId, venue: venueId, week: "2024-10-04", type: "roster" };
  const eventCount = async () => Number(await sql(
    `select count(*) from public.business_report_export_events where business_id = '${businessId}'::uuid`,
  ));
  try {
    for (const role of ["owner", "manager", "worker", "outside"]) {
      const created = await admin.auth.admin.createUser({
        email: `report-export-ui-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users[role] = created.data.user.id;
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Report export UI cafe" }, { id: outsideId, name: "Outside export cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Sydney export venue", timezone: "Australia/Sydney" },
      { id: secondVenueId, business_id: businessId, name: "UTC export venue", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside export venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: secondDepartmentId, business_id: businessId, venue_id: secondVenueId, name: "UTC team" },
      { id: outsideDepartmentId, business_id: outsideId, venue_id: outsideVenueId, name: "Outside team" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.manager, role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: outsideId, user_id: users.outside, role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users.worker, name: " =2+2", email: "private-export@example.test", role_title: "Server" },
      { id: secondWorkerId, business_id: businessId, venue_id: secondVenueId, department_id: secondDepartmentId,
        name: "Other venue worker", role_title: "Server" },
      { id: outsideWorkerId, business_id: outsideId, venue_id: outsideVenueId, department_id: outsideDepartmentId,
        name: "Outside business worker", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: workerId,
        role_title: "+Server", starts_at: "2024-09-29T14:00:00Z", ends_at: "2024-09-29T15:00:00Z",
        status: "scheduled", is_published: true },
      { business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: null,
        role_title: "Draft", starts_at: "2024-10-02T01:00:00Z", ends_at: "2024-10-02T02:00:00Z",
        status: "scheduled", is_published: false },
      { business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: workerId,
        role_title: "Cancelled", starts_at: "2024-10-03T01:00:00Z", ends_at: "2024-10-03T02:00:00Z",
        status: "cancelled", is_published: false },
      { business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: workerId,
        role_title: "Next week", starts_at: "2024-10-06T13:00:00Z", ends_at: "2024-10-06T14:00:00Z",
        status: "scheduled", is_published: false },
      { business_id: businessId, venue_id: secondVenueId, department_id: secondDepartmentId, employee_id: secondWorkerId,
        role_title: "Second venue", starts_at: "2024-10-01T01:00:00Z", ends_at: "2024-10-01T02:00:00Z",
        status: "scheduled", is_published: false },
      { business_id: outsideId, venue_id: outsideVenueId, department_id: outsideDepartmentId, employee_id: outsideWorkerId,
        role_title: "Outside", starts_at: "2024-10-01T01:00:00Z", ends_at: "2024-10-01T02:00:00Z",
        status: "scheduled", is_published: false },
    ])).error).toBeNull();
    expect((await admin.from("attendance_sessions").insert([sessionId, openSessionId].map((id) => ({
      id, business_id: businessId, venue_id: venueId, department_id: departmentId,
      employee_id: workerId, started_by: users.worker,
    })))).error).toBeNull();
    await sql(`insert into public.attendance_events
      (session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source)
      select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
        t.event_type, t.occurred_at::timestamptz, 'server_clock'
      from (values
        ('${sessionId}', 'clock_in', '2024-09-29 14:00:00+00'),
        ('${sessionId}', 'clock_out', '2024-09-29 15:00:00.000001+00'),
        ('${openSessionId}', 'clock_in', '2024-10-02 03:00:00+00')
      ) t(session_id, event_type, occurred_at)
      join public.attendance_sessions s on s.id = t.session_id::uuid`);

    await signIn(page, `report-export-ui-owner-${suffix}@example.test`, password);
    await page.goto(reportUrl);
    const form = page.getByRole("form", { name: "Business report export" });
    await expect(form).toBeVisible();
    await form.getByLabel("Export venue").selectOption(venueId);
    await form.getByLabel("Export week containing").fill("2024-10-04");
    const rosterButton = form.getByRole("button", { name: "Download roster CSV" });
    const [rosterDownload, rosterResponse] = await Promise.all([
      page.waitForEvent("download"),
      page.waitForResponse((response) => new URL(response.url()).pathname === "/reports/export"),
      rosterButton.click(),
    ]);
    expect(rosterResponse.status()).toBe(200);
    expect(rosterResponse.headers()["cache-control"]).toContain("no-store");
    expect(rosterResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect(rosterDownload.suggestedFilename()).toMatch(/^butterbox-roster-2024-09-30-[0-9a-f-]+\.csv$/);
    const rosterCsv = await readFile(await rosterDownload.path(), "utf8");
    expect(rosterCsv.startsWith('\uFEFF"export_event_id"')).toBe(true);
    expect(rosterCsv).toContain(`"${venueId}"`);
    expect(rosterCsv).toContain(`"${workerId}"`);
    expect(rosterCsv).toContain(`"' =2+2"`);
    expect(rosterCsv).toContain(`"'+Server"`);
    expect(rosterCsv).toContain('"Draft"');
    expect(rosterCsv).toContain('"cancelled"');
    expect(rosterCsv).toContain('"2024-09-29T14:00:00.000000Z"');
    expect(rosterCsv).toContain('"2024-10-06T13:00:00.000000Z"');
    expect(rosterCsv).not.toContain('"Next week"');
    expect(rosterCsv).not.toContain("private-export@example.test");
    expect(rosterCsv).not.toContain("Other venue worker");
    expect(rosterCsv).not.toContain("Outside business worker");

    const [attendanceDownload] = await Promise.all([
      page.waitForEvent("download"), form.getByRole("button", { name: "Download attendance CSV" }).click(),
    ]);
    const attendanceCsv = await readFile(await attendanceDownload.path(), "utf8");
    expect(attendanceDownload.suggestedFilename()).toMatch(/^butterbox-attendance-2024-09-30-[0-9a-f-]+\.csv$/);
    expect(attendanceCsv).toContain(`"${sessionId}"`);
    expect(attendanceCsv).toContain(`"${openSessionId}"`);
    expect(attendanceCsv).toContain('"3600.000001"');
    expect(attendanceCsv).toContain('"pending"');
    expect(attendanceCsv).not.toContain("private-export@example.test");
    expect(attendanceCsv).not.toContain("gps");

    await form.getByLabel("Export week containing").fill("2020-01-06");
    const [emptyDownload] = await Promise.all([page.waitForEvent("download"), rosterButton.click()]);
    expect((await readFile(await emptyDownload.path(), "utf8")).split("\r\n")).toHaveLength(2);
    await form.getByLabel("Export venue").selectOption(secondVenueId);
    await form.getByLabel("Export week containing").fill("2024-10-04");
    const [secondDownload] = await Promise.all([page.waitForEvent("download"), rosterButton.click()]);
    const secondCsv = await readFile(await secondDownload.path(), "utf8");
    expect(secondCsv).toContain("Other venue worker");
    expect(secondCsv).not.toContain(`"${workerId}"`);
    expect(secondCsv).not.toContain("Outside business worker");
    expect(await eventCount()).toBe(4);

    for (const width of [375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.locator("body").evaluate((body) =>
        body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      for (const control of [
        form.getByLabel("Export venue"), form.getByLabel("Export week containing"),
        rosterButton, form.getByRole("button", { name: "Download attendance CSV" }),
      ]) {
        const bounds = await control.boundingBox();
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      }
      await form.getByLabel("Export venue").focus();
      await page.keyboard.press("Tab");
      await expect(form.getByLabel("Export week containing")).toBeFocused();
      for (let segment = 0; segment < 5; segment += 1) {
        await page.keyboard.press("Tab");
        if (await rosterButton.evaluate((button) => document.activeElement === button)) break;
        await expect(form.getByLabel("Export week containing")).toBeFocused();
      }
      await expect(rosterButton).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(form.getByRole("button", { name: "Download attendance CSV" })).toBeFocused();
      findingsMustBeEmpty(await accessibilityFindings(page, `${width}px business reports`));
    }

    await page.getByRole("link", { name: "How to export reports" }).click();
    await expect(page.getByRole("heading", { name: "Download roster and attendance reports" })).toBeVisible();
    await expect(page.getByText("A file can contain at most 10,000 rows.", { exact: false })).toBeVisible();

    for (const role of ["manager", "worker", "outside"]) {
      const context = await browser.newContext({ baseURL: appUrl });
      contexts.push(context);
      const target = await context.newPage();
      await signIn(target, `report-export-ui-${role}-${suffix}@example.test`, password);
      await target.goto(reportUrl);
      await expect(target.getByRole("main").getByRole("alert")).toContainText(role === "outside"
        ? "selected business or venue is unavailable" : "Only a business owner");
      expect((await context.request.post("/reports/export", {
        headers: { origin: appUrl }, form: fields,
      })).status()).toBe(role === "outside" ? 404 : 403);
    }
    const anonymous = await browser.newContext({ baseURL: appUrl });
    contexts.push(anonymous);
    expect((await anonymous.request.post("/reports/export", { headers: { origin: appUrl }, form: fields })).status())
      .toBe(401);
    expect((await page.request.get("/reports/export")).status()).toBe(405);
    expect((await page.request.post("/reports/export", {
      headers: { origin: "https://evil.example.test" }, form: fields,
    })).status()).toBe(403);
    const duplicated = new URLSearchParams(fields);
    duplicated.append("business", businessId);
    expect((await page.request.post("/reports/export", {
      headers: { origin: appUrl, "content-type": "application/x-www-form-urlencoded" }, data: duplicated.toString(),
    })).status()).toBe(400);
    expect(await eventCount()).toBe(4);

    await page.goto(`/settings/audit?business=${businessId}&contextVenue=${venueId}&source=business_report_export_events`);
    await expect(page.getByRole("main").getByRole("status")).toContainText("4 audit records match");
    const auditRows = page.getByRole("list", { name: "Sensitive action history" }).getByRole("listitem");
    await expect(auditRows).toHaveCount(4);
    await auditRows.first().getByText("Before and after values").click();
    await expect(auditRows.first().getByText('"entry_count": 1')).toBeVisible();

    const changingTimezone = await holdLock(
      `update public.venues set timezone = 'UTC' where id = '${venueId}'::uuid returning id`, venueId,
    );
    let staleExport;
    try {
      staleExport = page.request.post("/reports/export", { headers: { origin: appUrl }, form: fields });
      await waitForLock("generate_business_report_export");
      await changingTimezone.release(true);
      const staleResponse = await staleExport;
      expect(staleResponse.status()).toBe(500);
      expect(await staleResponse.text()).toContain("Refresh the report and try again");
    } finally {
      await changingTimezone.release(false);
      await Promise.allSettled([staleExport].filter(Boolean));
    }
    expect(await eventCount()).toBe(5);
    await page.reload();
    await expect(page.getByRole("main").getByRole("status")).toContainText("5 audit records match");
    await auditRows.first().getByText("Before and after values").click();
    await expect(auditRows.first().getByText('"venue_timezone": "UTC"')).toBeVisible();
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const id of Object.values(users)) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

test("owner hours and labour report reconciles approved time with mobile filters and estimated costs", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { sql } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, secondVenueId, outsideVenueId, fohId, bohId, secondDepartmentId,
    workerId, secondWorkerId, approvedId, bohSessionId, secondSessionId, pendingId, incompleteId, paidBreakId, unpaidBreakId] =
    Array.from({ length: 17 }, () => randomUUID());
  const users = {};
  const contexts = [];
  const ownerApi = createClient(apiUrl, anonKey, options);
  const week = "2024-09-30";
  const reportUrl = `/reports/hours?business=${businessId}&week=${week}&rate=30`;
  try {
    for (const role of ["owner", "manager", "worker", "outside"]) {
      const created = await admin.auth.admin.createUser({
        email: `report-ui-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users[role] = created.data.user.id;
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Report UI cafe" }, { id: outsideId, name: "Outside report cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Report Sydney", timezone: "Australia/Sydney" },
      { id: secondVenueId, business_id: businessId, name: "Report UTC", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideId, name: "Private outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
      { id: secondDepartmentId, business_id: businessId, venue_id: secondVenueId, name: "UTC FOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.manager, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outside, role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.worker, name: "Report worker", role_title: "Server" },
      { id: secondWorkerId, business_id: businessId, venue_id: secondVenueId, department_id: secondDepartmentId,
        name: "UTC worker", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("employee_departments").insert({
      business_id: businessId, employee_id: workerId, department_id: bohId,
    })).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId,
        role_title: "Server", starts_at: "2024-10-01T01:00:00Z", ends_at: "2024-10-01T05:00:00Z", break_minutes: 30, is_published: true },
      { business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: workerId,
        role_title: "Kitchen", starts_at: "2024-10-01T06:00:00Z", ends_at: "2024-10-01T09:00:00Z", break_minutes: 0, is_published: true },
      { business_id: businessId, venue_id: secondVenueId, department_id: secondDepartmentId, employee_id: secondWorkerId,
        role_title: "Server", starts_at: "2024-10-01T01:00:00Z", ends_at: "2024-10-01T03:00:00Z", break_minutes: 0, is_published: true },
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId,
        role_title: "Draft", starts_at: "2024-10-02T01:00:00Z", ends_at: "2024-10-02T02:00:00Z", break_minutes: 0, is_published: false },
    ])).error).toBeNull();
    expect((await admin.from("attendance_sessions").insert([
      { id: approvedId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId, started_by: users.worker },
      { id: bohSessionId, business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: workerId, started_by: users.worker },
      { id: secondSessionId, business_id: businessId, venue_id: secondVenueId, department_id: secondDepartmentId, employee_id: secondWorkerId, started_by: users.owner },
      { id: pendingId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId, started_by: users.worker },
      { id: incompleteId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId, started_by: users.worker },
    ])).error).toBeNull();
    await sql(`insert into public.attendance_events (
      session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
    ) select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
      t.event_type, t.occurred_at, 'server_clock'
    from (values
      ('${approvedId}', '2024-10-01 01:00+00', '2024-10-01 05:00+00'),
      ('${bohSessionId}', '2024-10-01 06:00+00', '2024-10-01 08:00+00'),
      ('${secondSessionId}', '2024-10-01 01:00+00', '2024-10-01 02:00+00'),
      ('${pendingId}', '2024-10-02 01:00+00', '2024-10-02 02:00+00'),
      ('${incompleteId}', '2024-10-02 03:00+00', null)
    ) f(id, starts_at, ends_at)
    join public.attendance_sessions s on s.id = f.id::uuid
    cross join lateral (values ('clock_in', f.starts_at::timestamptz), ('clock_out', f.ends_at::timestamptz)) t(event_type, occurred_at)
    where t.occurred_at is not null;
    insert into public.attendance_breaks (id, session_id, business_id, classification) values
      ('${paidBreakId}', '${approvedId}', '${businessId}', 'paid'),
      ('${unpaidBreakId}', '${approvedId}', '${businessId}', 'unpaid');
    insert into public.attendance_events (
      session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source, break_id
    ) select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
      t.event_type, t.occurred_at::timestamptz, 'server_clock', t.break_id::uuid
    from (values
      ('${paidBreakId}', 'break_start', '2024-10-01 02:00+00'),
      ('${paidBreakId}', 'break_end', '2024-10-01 02:15+00'),
      ('${unpaidBreakId}', 'break_start', '2024-10-01 03:00+00'),
      ('${unpaidBreakId}', 'break_end', '2024-10-01 03:30+00')
    ) t(break_id, event_type, occurred_at)
    join public.attendance_sessions s on s.id = '${approvedId}'::uuid;`);
    expect((await ownerApi.auth.signInWithPassword({ email: `report-ui-owner-${suffix}@example.test`, password })).error).toBeNull();
    for (const [venue, sessionIds] of [[venueId, [approvedId, bohSessionId]], [secondVenueId, [secondSessionId]]]) {
      const entries = await ownerApi.rpc("list_weekly_worked_time_for_edit", {
        p_business_id: businessId, p_venue_id: venue, p_week_start: week,
      });
      expect(entries.error).toBeNull();
      for (const id of sessionIds) {
        const entry = entries.data.find((item) => item.session_id === id);
        expect(entry).toBeDefined();
        expect((await ownerApi.rpc("decide_attendance_timesheet", {
          p_business_id: businessId, p_venue_id: venue, p_session_id: id, p_request_id: randomUUID(),
          p_expected_revision: entry.edit_revision, p_decision: "approved", p_reason: null,
        })).error).toBeNull();
      }
    }
    const report = await ownerApi.rpc("get_hours_labour_report", { p_business_id: businessId, p_week_start: week });
    expect(report.error).toBeNull();
    expect(report.data.reduce((sum, item) => sum + item.approved_paid_seconds, 0)).toBe(23400);
    expect(report.data.reduce((sum, item) => sum + item.scheduled_seconds, 0)).toBe(32400);

    await page.setViewportSize({ width: 390, height: 844 });
    page.setDefaultTimeout(20_000);
    await signIn(page, `report-ui-owner-${suffix}@example.test`, password);
    await page.goto(reportUrl);
    await expect(page.getByRole("heading", { name: "Hours and labour", exact: true })).toBeVisible();
    await openMainNavigation(page);
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Hours & labour" })).toBeVisible();
    const totals = page.getByLabel("Report totals");
    await expect(totals).toContainText("9h 0m 0s");
    await expect(totals).toContainText("6h 15m 0s");
    await expect(totals).toContainText("6h 30m 0s");
    await expect(totals).toContainText("$195.00");
    await expect(page.getByText("3 approved entries included. 2 entries excluded", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Metric definitions and limitations" })).toBeVisible();
    await expect(page.getByText("Not actual payroll, an export or a compliance result.", { exact: false })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    findingsMustBeEmpty(await accessibilityFindings(page, "mobile hours and labour"));
    const form = page.getByRole("form", { name: "Report filters" });
    await form.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueId);
    await form.getByRole("combobox", { name: "Department", exact: true }).selectOption(fohId);
    await form.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("article", { name: "Report Sydney / FOH" })).toContainText("3h 15m 0s");
    await expect(totals).toContainText("$105.00");
    await expect(page.getByRole("article", { name: "Report Sydney / BOH" })).toHaveCount(0);
    const source = page.getByRole("link", { name: "Review source timesheets" });
    await expect(source).toHaveAttribute("href", `/timesheets?venue=${venueId}&week=${week}&business=${businessId}`);
    await source.click();
    await expect(page.getByRole("heading", { name: "Weekly timesheet review" })).toBeVisible();
    await expect(page.getByText("Approved by department manager", { exact: true }).first()).toBeVisible();

    await page.goto(`${reportUrl}&venue=${secondVenueId}`);
    await expect(totals).toContainText("2h 0m 0s");
    await expect(totals).toContainText("$30.00");
    await page.goto(`${reportUrl}&venue=${secondVenueId}&department=${fohId}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Choose a valid week");
    await expect(totals).toHaveCount(0);
    await page.goto(`${reportUrl}&rate=31`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("use each filter once");
    await page.goto(`/reports/hours?business=${businessId}&week=2024-02-30`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Choose a valid week");
    await page.goto(`/reports/hours?business=${businessId}&week=2020-01-06`);
    await expect(page.getByText("No published assigned shifts or timesheet entries for these filters.")).toBeVisible();
    await expect(totals).toContainText("Not estimated");

    expect((await ownerApi.rpc("set_attendance_edit_lock", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: approvedId,
      p_request_id: randomUUID(), p_locked: false, p_reason: "Report verifies outdated approvals",
    })).error).toBeNull();
    await page.goto(reportUrl);
    await expect(totals).toContainText("3h 0m 0s");
    await expect(totals).toContainText("$90.00");
    await page.setViewportSize({ width: 1280, height: 900 });
    findingsMustBeEmpty(await accessibilityFindings(page, "desktop hours and labour"));

    for (const role of ["manager", "worker", "outside"]) {
      const context = await browser.newContext({ baseURL: appUrl });
      contexts.push(context);
      const target = await context.newPage();
      await signIn(target, `report-ui-${role}-${suffix}@example.test`, password);
      await target.goto(reportUrl);
      await expect(target.getByRole("main").getByRole("alert")).toContainText(role === "outside"
        ? "selected business or venue is unavailable" : "Only a business owner");
      await expect(target.getByLabel("Report totals")).toHaveCount(0);
      const caller = createClient(apiUrl, anonKey, options);
      expect((await caller.auth.signInWithPassword({ email: `report-ui-${role}-${suffix}@example.test`, password })).error).toBeNull();
      expect((await caller.rpc("get_hours_labour_report", { p_business_id: businessId, p_week_start: week })).error?.message)
        .toContain("Only a business owner");
    }
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const id of Object.values(users)) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

test("overtime and exceptions report is scoped, source-linked and accessible", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { sql } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, outsideVenueId, fohId, bohId, workerId, kitchenId,
    publishedId, draftId, bohPublishedId, approvedId, bohApprovedId, missingId, kitchenMissingId] =
    Array.from({ length: 15 }, () => randomUUID());
  const users = {};
  const contexts = [];
  const ownerApi = createClient(apiUrl, anonKey, options);
  const week = "2024-09-30";
  const reportUrl = `/reports/exceptions?business=${businessId}&venue=${venueId}&week=${week}`;
  try {
    for (const role of ["owner", "foh", "boh", "worker", "outside"]) {
      const created = await admin.auth.admin.createUser({
        email: `exception-ui-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users[role] = created.data.user.id;
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Exception UI cafe" }, { id: outsideId, name: "Outside exception cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Exception Sydney", timezone: "Australia/Sydney" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Private BOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outside, role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.worker, name: "Shared report worker", role_title: "Server" },
      { id: kitchenId, business_id: businessId, venue_id: venueId, department_id: bohId,
        name: "Private kitchen worker", role_title: "Cook" },
    ])).error).toBeNull();
    expect((await admin.from("employee_departments").insert({
      business_id: businessId, employee_id: workerId, department_id: bohId,
    })).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: publishedId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, role_title: "Server", starts_at: "2024-10-01T01:00:00Z",
        ends_at: "2024-10-01T05:00:00Z", is_published: true },
      { id: draftId, business_id: businessId, venue_id: venueId, department_id: bohId,
        employee_id: workerId, role_title: "Draft", starts_at: "2024-10-01T03:00:00Z",
        ends_at: "2024-10-01T04:00:00Z", is_published: false },
      { id: bohPublishedId, business_id: businessId, venue_id: venueId, department_id: bohId,
        employee_id: workerId, role_title: "Cook", starts_at: "2024-10-01T06:00:00Z",
        ends_at: "2024-10-01T08:00:00Z", is_published: true },
    ])).error).toBeNull();
    expect((await admin.from("attendance_sessions").insert([
      { id: approvedId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, started_by: users.worker },
      { id: bohApprovedId, business_id: businessId, venue_id: venueId, department_id: bohId,
        employee_id: workerId, started_by: users.worker },
      { id: missingId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, started_by: users.worker },
      { id: kitchenMissingId, business_id: businessId, venue_id: venueId, department_id: bohId,
        employee_id: kitchenId, started_by: users.owner },
    ])).error).toBeNull();
    await sql(`insert into public.attendance_events (
      session_id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, occurred_at, source
    ) select s.id, s.business_id, s.venue_id, s.department_id, s.employee_id, s.started_by, gen_random_uuid(),
      t.event_type, t.occurred_at::timestamptz, 'server_clock'
    from (values
      ('${approvedId}', '2024-10-01 01:00+00', '2024-10-01 04:00+00'),
      ('${bohApprovedId}', '2024-10-01 06:00+00', '2024-10-01 08:00+00'),
      ('${missingId}', '2024-10-02 01:00+00', null),
      ('${kitchenMissingId}', '2024-10-02 02:00+00', null)
    ) f(id, starts_at, ends_at)
    join public.attendance_sessions s on s.id = f.id::uuid
    cross join lateral (values ('clock_in', f.starts_at), ('clock_out', f.ends_at)) t(event_type, occurred_at)
    where t.occurred_at is not null;`);
    expect((await ownerApi.auth.signInWithPassword({ email: `exception-ui-owner-${suffix}@example.test`, password })).error).toBeNull();
    const editable = await ownerApi.rpc("list_weekly_worked_time_for_edit", {
      p_business_id: businessId, p_venue_id: venueId, p_week_start: week,
    });
    expect(editable.error).toBeNull();
    for (const id of [approvedId, bohApprovedId]) {
      const entry = editable.data.find((item) => item.session_id === id);
      expect(entry).toBeDefined();
      expect((await ownerApi.rpc("decide_attendance_timesheet", {
        p_business_id: businessId, p_venue_id: venueId, p_session_id: id,
        p_request_id: randomUUID(), p_expected_revision: entry.edit_revision, p_decision: "approved", p_reason: null,
      })).error).toBeNull();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    page.setDefaultTimeout(20_000);
    await signIn(page, `exception-ui-owner-${suffix}@example.test`, password);
    await page.goto(reportUrl);
    await expect(page.getByRole("heading", { name: "Overtime and exceptions" })).toBeVisible();
    await openMainNavigation(page);
    await expect(page.getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Exceptions", exact: true })).toBeVisible();
    const totals = page.getByLabel("Exception totals");
    const total = (label) => totals.locator("div").filter({ hasText: label });
    await expect(total("Overlapping shifts")).toContainText("2");
    await expect(total("Sessions missing a clock event")).toContainText("2");
    await expect(total("People above scheduled threshold")).toContainText("Not evaluated");
    await expect(total("People above approved worked threshold")).toContainText("Not evaluated");
    await expect(page.getByText("Private kitchen worker")).toBeVisible();
    const form = page.getByRole("form", { name: "Exceptions report filters" });
    await form.getByLabel("Optional weekly hours threshold").fill("3.5");
    await form.getByRole("button", { name: "Apply filters" }).click();
    await expect(total("People above scheduled threshold")).toContainText("1");
    await expect(total("People above approved worked threshold")).toContainText("1");
    await expect(page.getByText("Scheduled: 6h 0m 0s", { exact: false })).toBeVisible();
    await expect(page.getByText("Approved worked: 5h 0m 0s", { exact: false })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    findingsMustBeEmpty(await accessibilityFindings(page, "mobile exceptions report"));
    await page.setViewportSize({ width: 1280, height: 900 });
    findingsMustBeEmpty(await accessibilityFindings(page, "desktop exceptions report"));

    const missingSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Missing clock events" }) });
    const source = missingSection.locator("li").filter({ hasText: "Shared report worker" })
      .getByRole("link", { name: "Review source timesheet" });
    const sourceUrl = new URL(await source.getAttribute("href"), appUrl);
    expect(sourceUrl.pathname).toBe("/timesheets");
    expect(sourceUrl.searchParams.get("employee")).toBe(workerId);
    expect(sourceUrl.searchParams.get("week")).toBe(week);
    expect(sourceUrl.hash).toBe(`#timesheet-session-${missingId}`);
    await source.click();
    await expect(page.locator(`#timesheet-session-${missingId}`)).toBeVisible();
    await page.goto(`${reportUrl}&threshold=5`);
    await expect(total("People above scheduled threshold")).toContainText("1");
    await expect(total("People above approved worked threshold")).toContainText("0");
    const overlapSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Overlapping shifts" }) });
    const rosterSource = overlapSection.getByRole("link", { name: "Review source roster" }).first();
    const rosterUrl = new URL(await rosterSource.getAttribute("href"), appUrl);
    expect(rosterUrl.pathname).toBe("/roster");
    expect(rosterUrl.searchParams.get("department")).toBe(fohId);
    expect(rosterUrl.searchParams.has("q")).toBe(false);
    expect(rosterUrl.hash).toBe(`#roster-shift-${publishedId}`);
    await rosterSource.click();
    await expect(page.getByRole("heading", { name: "Weekly roster" })).toBeVisible();
    const sourceShift = page.locator(`#roster-shift-${publishedId}`);
    await expect(sourceShift).toBeVisible();
    await expect(sourceShift).toContainText("Server");
    await expect(sourceShift).toContainText("Published");
    await expect(sourceShift).toContainText("11:00");
    await page.goto(`${reportUrl}&threshold=6`);
    await expect(page.getByText("No employee exceeds the selected threshold in this scope.")).toBeVisible();
    await page.goto(`${reportUrl}&threshold=3.5&threshold=4`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("use each filter once");
    await expect(totals).toHaveCount(0);
    await page.goto(`/reports/exceptions?business=${businessId}&venue=${venueId}&week=2024-02-30`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Choose a valid venue and week");
    await page.goto(`/reports/exceptions?business=${businessId}&venue=${venueId}&week=0001-01-01`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("6 January 1000");
    await expect(totals).toHaveCount(0);
    await page.goto(reportUrl);
    await page.getByRole("link", { name: "How to use this report" }).click();
    await expect(page.getByRole("heading", { name: "Overtime and exceptions" })).toBeVisible();
    await expect(page.getByText("This is not an overtime-pay or award-breach assessment.", { exact: false })).toBeVisible();

    for (const role of ["foh", "boh", "worker", "outside"]) {
      const context = await browser.newContext({ baseURL: appUrl, viewport: { width: 390, height: 844 } });
      contexts.push(context);
      const target = await context.newPage();
      target.setDefaultTimeout(20_000);
      await signIn(target, `exception-ui-${role}-${suffix}@example.test`, password);
      await target.goto(`${reportUrl}&threshold=3.5`);
      if (role === "foh" || role === "boh") {
        await expect(target.getByRole("heading", { name: "Overtime and exceptions" })).toBeVisible();
        await expect(target.getByLabel("Exception totals")).toContainText("1");
        if (role === "foh") {
          await expect(target.getByText("Private kitchen worker")).toHaveCount(0);
          await expect(target.getByText("Private BOH", { exact: false })).toHaveCount(0);
          await expect(target.getByText("Approved worked: 3h 0m 0s", { exact: false })).toBeVisible();
        } else {
          await expect(target.getByText("Private kitchen worker")).toBeVisible();
        }
      } else if (role === "worker") {
        await expect(target).toHaveURL(/\/\?error=permission/);
        await expect(target.getByLabel("Exception totals")).toHaveCount(0);
      } else {
        await expect(target.getByRole("main").getByRole("alert")).toContainText("selected business or venue is unavailable");
        await expect(target.getByLabel("Exception totals")).toHaveCount(0);
      }
    }

    const [formerWorkerId, formerShiftId, secondFormerShiftId] = Array.from({ length: 3 }, () => randomUUID());
    expect((await admin.from("employees").insert({
      id: formerWorkerId, business_id: businessId, venue_id: venueId, department_id: bohId,
      name: "Former report worker", role_title: "Cook",
    })).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: formerShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: formerWorkerId, role_title: "Historical FOH shift", starts_at: "2024-10-03T01:00:00Z",
        ends_at: "2024-10-03T04:00:00Z", is_published: false },
      { id: secondFormerShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: formerWorkerId, role_title: "Historical FOH conflict", starts_at: "2024-10-03T02:00:00Z",
        ends_at: "2024-10-03T03:00:00Z", is_published: false },
    ])).error).toBeNull();
    const historicalContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(historicalContext);
    const historicalPage = await historicalContext.newPage();
    await signIn(historicalPage, `exception-ui-foh-${suffix}@example.test`, password);
    await historicalPage.goto(reportUrl);
    const historicalSection = historicalPage.locator("section").filter({
      has: historicalPage.getByRole("heading", { name: "Overlapping shifts" }),
    });
    await expect(historicalSection.getByText("Former report worker", { exact: false })).toHaveCount(0);
    const historicalSource = historicalSection.locator("li").filter({ hasText: "Former team member" })
      .getByRole("link", { name: "Review source roster" }).first();
    await historicalSource.click();
    await expect(historicalPage.getByText("Former team member", { exact: true })).toBeVisible();
    await expect(historicalPage.locator(`#roster-shift-${formerShiftId}`)).toBeVisible();

    const [earlyShiftId, secondEarlyShiftId] = Array.from({ length: 2 }, () => randomUUID());
    expect((await admin.from("shifts").insert([
      { id: earlyShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, role_title: "Early source shift", starts_at: "1000-01-07T01:00:00Z",
        ends_at: "1000-01-07T04:00:00Z", is_published: false },
      { id: secondEarlyShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, role_title: "Early conflict", starts_at: "1000-01-07T02:00:00Z",
        ends_at: "1000-01-07T03:00:00Z", is_published: false },
    ])).error).toBeNull();
    await historicalPage.goto(`/reports/exceptions?business=${businessId}&venue=${venueId}&week=1000-01-06`);
    const earlySource = historicalPage.locator("section").filter({
      has: historicalPage.getByRole("heading", { name: "Overlapping shifts" }),
    }).getByRole("link", { name: "Review source roster" }).first();
    expect(new URL(await earlySource.getAttribute("href"), appUrl).hash).toBe(`#roster-shift-${earlyShiftId}`);
    await earlySource.click();
    await expect(historicalPage.locator(`#roster-shift-${earlyShiftId}`)).toBeVisible();
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const id of Object.values(users)) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

test("attendance alerts support scoped mobile review and per-manager notifications", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { sql } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusinessId, venueId, outsideVenueId, fohId, bohId, outsideDepartmentId,
    workerId, draftWorkerId, shiftId, draftShiftId] = Array.from({ length: 11 }, () => randomUUID());
  const users = {};
  const contexts = [];
  const ownerApi = createClient(apiUrl, anonKey, options);
  const settingsArgs = {
    p_business_id: businessId, p_venue_id: venueId,
    p_enabled: false, p_grace_minutes: 1, p_no_show_minutes: 60,
  };
  let settingsAttempted = false;
  const alertUrl = `/attendance/alerts?business=${businessId}&venue=${venueId}`;

  async function signedInPage(role) {
    const context = await browser.newContext({ baseURL: appUrl, viewport: { width: 390, height: 844 } });
    contexts.push(context);
    const target = await context.newPage();
    target.setDefaultTimeout(20_000);
    await signIn(target, `alert-browser-${role}-${suffix}@example.test`, password);
    return target;
  }

  try {
    for (const role of ["owner", "foh", "colleague", "boh", "worker", "outside"]) {
      const created = await admin.auth.admin.createUser({
        email: `alert-browser-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users[role] = created.data.user.id;
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Alert browser cafe" },
      { id: outsideBusinessId, name: "Outside alert browser cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Alert venue", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideBusinessId, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
      { id: outsideDepartmentId, business_id: outsideBusinessId, venue_id: outsideVenueId, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.colleague, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusinessId, user_id: users.outside, role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.worker, name: "Alert worker", role_title: "Server" },
      { id: draftWorkerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        name: "Draft worker", role_title: "Server" },
    ])).error).toBeNull();
    const startsAt = new Date(Date.now() - 15 * 60_000).toISOString();
    const endsAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    expect((await admin.from("shifts").insert([
      { id: shiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, role_title: "Server", starts_at: startsAt, ends_at: endsAt, is_published: true },
      { id: draftShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: draftWorkerId, role_title: "Draft", starts_at: startsAt, ends_at: endsAt, is_published: false },
    ])).error).toBeNull();
    expect((await ownerApi.auth.signInWithPassword({
      email: `alert-browser-owner-${suffix}@example.test`, password,
    })).error).toBeNull();

    page.setDefaultTimeout(20_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `alert-browser-owner-${suffix}@example.test`, password);
    await page.goto(`/attendance?business=${businessId}&venue=${venueId}`);
    await page.getByRole("link", { name: "Review attendance alerts" }).click();
    await expect(page.getByRole("heading", { name: "Attendance alerts", exact: true })).toBeVisible();
    await expect(page.getByText("Monitoring is off for this venue.")).toBeVisible();
    await page.getByRole("combobox", { name: "Monitoring", exact: true }).selectOption("true");
    await page.getByLabel("Grace period (minutes)").fill("20");
    await page.getByLabel("No-show threshold (minutes)").fill("20");
    await page.getByRole("button", { name: "Save monitoring settings" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("longer no-show threshold");
    await page.getByRole("combobox", { name: "Monitoring", exact: true }).selectOption("true");
    await page.getByLabel("Grace period (minutes)").fill("1");
    await page.getByLabel("No-show threshold (minutes)").fill("60");
    settingsAttempted = true;
    await page.getByRole("button", { name: "Save monitoring settings" }).click();
    await expect(page.getByRole("status")).toContainText("Attendance alert settings saved.");
    await sql("select public.run_attendance_alert_worker()");
    await expect.poll(async () => {
      const result = await ownerApi.rpc("list_attendance_alerts", {
        p_business_id: businessId, p_venue_id: venueId,
      });
      expect(result.error).toBeNull();
      return result.data.filter((alert) => alert.shift_id === shiftId).length;
    }, { timeout: 10_000 }).toBe(1);
    await page.reload();
    const ownerAlert = page.getByRole("article", { name: "Attendance alert for Alert worker" });
    await expect(ownerAlert).toContainText("Missing clock-in");
    await expect(page.getByText("Draft worker", { exact: true })).toHaveCount(0);
    findingsMustBeEmpty(await accessibilityFindings(page, "mobile attendance alerts"));
    expect(await page.locator("body").evaluate((body) =>
      body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const manager = await signedInPage("foh");
    await manager.goto(`/?business=${businessId}`);
    const banner = manager.getByRole("region", { name: "Unread work updates" });
    await expect(banner).toContainText("1 unread work update");
    await banner.getByRole("link", { name: "View notifications" }).click();
    const managerNotice = manager.getByRole("article", { name: "Attendance alert for Alert worker" });
    await expect(managerNotice).toContainText("Unread");
    await managerNotice.getByRole("button", { name: "View attendance alert" }).click();
    const managerAlert = manager.getByRole("article", { name: "Attendance alert for Alert worker" });
    await expect(managerAlert).toContainText("Missing clock-in");
    await expect(manager.getByRole("button", { name: "Save monitoring settings" })).toHaveCount(0);
    await managerAlert.getByRole("button", { name: "Acknowledge alert" }).click();
    await expect(manager.getByRole("status")).toContainText("Alert acknowledged.");
    await expect(managerAlert).toContainText("Acknowledged");

    const colleague = await signedInPage("colleague");
    await colleague.goto(`/?business=${businessId}`);
    await expect(colleague.getByRole("region", { name: "Unread work updates" })).toContainText("1 unread work update");
    await colleague.goto(`/notifications?business=${businessId}&venue=${venueId}`);
    const colleagueNotice = colleague.getByRole("article", { name: "Attendance alert for Alert worker" });
    await expect(colleagueNotice).toContainText("Acknowledged");
    await expect(colleagueNotice).toContainText("Unread");
    await colleagueNotice.getByRole("button", { name: "Mark as read" }).click();
    await expect(colleague.getByRole("status")).toContainText("Notification marked as read.");
    await expect(colleagueNotice).toContainText("Read");
    await colleagueNotice.getByRole("button", { name: "View attendance alert" }).click();
    const colleagueAlert = colleague.getByRole("article", { name: "Attendance alert for Alert worker" });
    await expect(colleagueAlert.getByLabel("Resolution reason")).toHaveAttribute("required", "");
    await colleagueAlert.getByLabel("Resolution reason").fill("Contacted worker");
    await colleagueAlert.getByRole("button", { name: "Resolve alert" }).click();
    await expect(colleague.getByRole("status")).toContainText("Alert resolved with its reason.");
    await colleagueAlert.getByText("Review alert history").click();
    await expect(colleagueAlert).toContainText("Reason: Contacted worker");
    await expect(colleagueAlert).toContainText(users.colleague);

    await page.goto(`/settings/audit?business=${businessId}&source=attendance_alert_events`);
    await expect(page.getByRole("list", { name: "Sensitive action history" })).toContainText("Attendance alert decisions");
    await expect(page.getByRole("list", { name: "Sensitive action history" })).toContainText("Reason: Contacted worker");

    const boh = await signedInPage("boh");
    await boh.goto(alertUrl);
    await expect(boh.getByText("No alerts have been recorded for your accessible departments.")).toBeVisible();
    await expect(boh.getByText("Alert worker", { exact: true })).toHaveCount(0);
    const worker = await signedInPage("worker");
    await worker.goto(`/attendance?business=${businessId}&venue=${venueId}`);
    await expect(worker.getByRole("link", { name: "Review attendance alerts" })).toHaveCount(0);
    await worker.goto(alertUrl);
    await expect(worker.getByRole("main").getByRole("alert")).toContainText("Only managers");
    const outside = await signedInPage("outside");
    await outside.goto(alertUrl);
    await expect(outside.getByRole("heading", { name: "Attendance alerts unavailable" })).toBeVisible();
    await expect(outside.getByText("Alert worker", { exact: true })).toHaveCount(0);
  } finally {
    if (settingsAttempted) expect((await ownerApi.rpc("save_attendance_alert_settings", settingsArgs)).error).toBeNull();
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideBusinessId]);
    for (const user of Object.values(users)) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("QR kiosk devices rotate decoded codes and protect mobile attendance", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusinessId, venueId, outsideVenueId, departmentId, outsideDepartmentId,
    workerId, colleagueId] = Array.from({ length: 8 }, () => randomUUID());
  const users = [];
  const contexts = [];

  async function decodeQr(target, svg) {
    await expect(svg).toBeVisible();
    await target.addScriptTag({ path: "node_modules/jsqr/dist/jsQR.js" });
    const value = await svg.evaluate(async (element) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(element))}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not render the QR image");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      return window.jsQR(pixels.data, canvas.width, canvas.height)?.data ?? null;
    });
    expect(typeof value, "The rendered QR image must be decodable").toBe("string");
    const result = new URL(value);
    expect(result.origin).toBe(appUrl);
    return result;
  }

  async function openScan(context, scanned) {
    const scannedPage = await context.newPage();
    await scannedPage.addInitScript(({ pathname, fragment }) => {
      if (location.pathname === pathname && !sessionStorage.getItem("test-qr-opened")) {
        sessionStorage.setItem("test-qr-opened", "yes");
        history.replaceState(null, "", location.pathname + location.search + fragment);
      }
    }, { pathname: scanned.pathname, fragment: scanned.hash });
    await scannedPage.goto(scanned.pathname + scanned.search);
    return scannedPage;
  }

  async function waitForNewCode(kioskPage, oldPath) {
    const foreground = kioskPage.getByRole("region", { name: "Venue clock QR" }).locator("svg path").last();
    await expect.poll(async () => (await foreground.getAttribute("d")) !== oldPath, {
      timeout: 15_000, message: "The kiosk must display a fresh QR after consumption",
    }).toBe(true);
    return decodeQr(kioskPage, kioskPage.getByRole("region", { name: "Venue clock QR" }).locator("svg"));
  }

  try {
    for (const role of ["owner", "worker", "colleague", "manager", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `qr-browser-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `QR cafe ${suffix}` },
      { id: outsideBusinessId, name: `Outside QR cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour QR", timezone: "Australia/Sydney",
        geofence_latitude: -33.8688, geofence_longitude: 151.2093, geofence_radius_meters: 100 },
      { id: outsideVenueId, business_id: outsideBusinessId, name: "Outside QR", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: outsideDepartmentId, business_id: outsideBusinessId, venue_id: outsideVenueId, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users[3], role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusinessId, user_id: users[4], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[1], name: "QR Worker", role_title: "Server" },
      { id: colleagueId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[2], name: "QR Colleague", role_title: "Server" },
    ])).error).toBeNull();

    const ownerApi = createClient(apiUrl, anonKey, options);
    expect((await ownerApi.auth.signInWithPassword({
      email: `qr-browser-owner-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await ownerApi.rpc("set_venue_clock_geofence", {
      p_business_id: businessId, p_venue_id: venueId, p_enabled: true,
    })).error).toBeNull();

    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, `qr-browser-owner-${suffix}@example.test`, password);
    await page.goto(`/attendance?business=${businessId}&venue=${venueId}`);
    await page.getByRole("link", { name: "Manage kiosk devices" }).click();
    const setup = page.getByRole("region", { name: "Create kiosk device" });
    await setup.getByLabel("Device name").fill("Front counter");
    await setup.getByRole("button", { name: "Create activation code" }).click();
    await expect(setup.getByRole("heading", { name: "Activate the venue device" })).toBeVisible();
    const setupUrl = await decodeQr(page, setup.locator("svg"));
    expect(setupUrl.pathname).toBe("/kiosk");
    const activation = new URLSearchParams(setupUrl.hash.slice(1)).get("activate");
    expect(Boolean(activation) && activation === await setup.locator("code").innerText()).toBe(true);
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    findingsMustBeEmpty(await accessibilityFindings(page, "mobile kiosk setup"));

    const managerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `qr-browser-manager-${suffix}@example.test`, password);
    await managerPage.goto(`/attendance/kiosks?business=${businessId}&venue=${venueId}`);
    await expect(managerPage.getByRole("alert").filter({
      hasText: "Only a business owner can manage kiosk devices.",
    })).toBeVisible();
    await expect(managerPage.getByRole("button", { name: "Create activation code" })).toHaveCount(0);

    const workerContext = await browser.newContext({
      baseURL: appUrl, viewport: { width: 375, height: 812 },
      geolocation: { latitude: -33.8688, longitude: 151.2093, accuracy: 10 },
    });
    contexts.push(workerContext);
    await workerContext.grantPermissions([], { origin: appUrl });
    const workerLogin = await workerContext.newPage();
    await signIn(workerLogin, `qr-browser-worker-${suffix}@example.test`, password);

    const colleagueContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(colleagueContext);
    const colleagueLogin = await colleagueContext.newPage();
    await signIn(colleagueLogin, `qr-browser-colleague-${suffix}@example.test`, password);

    const deviceContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(deviceContext);
    const kioskPage = await openScan(deviceContext, setupUrl);
    const activationInput = kioskPage.getByLabel("One-time activation code");
    await expect(activationInput).toBeVisible();
    expect((await activationInput.inputValue()) === activation).toBe(true);
    expect(new URL(kioskPage.url()).hash).toBe("");
    await kioskPage.getByRole("button", { name: "Activate this device" }).click();
    await expect(kioskPage.getByRole("region", { name: "Venue clock QR" }).locator("svg")).toBeVisible();
    const deviceCookie = (await deviceContext.cookies(`${appUrl}/kiosk`))
      .find((cookie) => cookie.name === "__Secure-bb_kiosk");
    expect(Boolean(deviceCookie)).toBe(true);
    expect({
      httpOnly: deviceCookie.httpOnly, secure: deviceCookie.secure,
      sameSite: deviceCookie.sameSite, path: deviceCookie.path,
    }).toEqual({ httpOnly: true, secure: true, sameSite: "Strict", path: "/kiosk" });
    const signedOutPage = await deviceContext.newPage();
    await signedOutPage.goto("/attendance");
    await expect(signedOutPage.getByLabel("Email address")).toBeVisible();
    findingsMustBeEmpty(await accessibilityFindings(kioskPage, "mobile kiosk display"));
    expect(await kioskPage.locator("body").evaluate((body) =>
      body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const firstUrl = await decodeQr(kioskPage, kioskPage.getByRole("region", { name: "Venue clock QR" }).locator("svg"));
    expect(firstUrl.pathname).toBe("/attendance/qr");
    expect(firstUrl.searchParams.get("business")).toBe(businessId);
    expect(firstUrl.searchParams.get("venue")).toBe(venueId);
    const oldPath = await kioskPage.getByRole("region", { name: "Venue clock QR" }).locator("svg path").last().getAttribute("d");

    const guestContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(guestContext);
    const unauthorizedIssue = await guestContext.request.post("/kiosk/code");
    expect(unauthorizedIssue.status()).toBe(401);
    expect(unauthorizedIssue.headers()["cache-control"]).toContain("no-store");
    const guestPage = await guestContext.newPage();
    await guestPage.goto("/login");
    await guestPage.evaluate((url) => { window.location.assign(url); }, firstUrl.href);
    await expect.poll(() => {
      const current = new URL(guestPage.url());
      return current.pathname === "/login" && current.searchParams.get("message") === "qr-sign-in";
    }).toBe(true);
    await expect(guestPage.getByRole("status")).toContainText("Sign in on your own device, then scan a fresh venue kiosk code.");
    await expect.poll(() => new URL(guestPage.url()).hash === "").toBe(true);

    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outsideLogin = await outsideContext.newPage();
    await signIn(outsideLogin, `qr-browser-outside-${suffix}@example.test`, password);
    const outsideScan = await openScan(outsideContext, firstUrl);
    await expect(outsideScan.getByRole("heading", { name: "QR clock unavailable" })).toBeVisible();
    await expect(outsideScan.getByRole("alert").filter({
      hasText: "This venue is unavailable to your account.",
    })).toBeVisible();
    await expect.poll(() => new URL(outsideScan.url()).hash === "").toBe(true);

    const invalidUrl = new URL(firstUrl);
    invalidUrl.searchParams.delete("venue");
    const invalidScan = await openScan(workerContext, invalidUrl);
    await expect(invalidScan.getByRole("heading", { name: "Invalid kiosk link" })).toBeVisible();
    await expect.poll(() => new URL(invalidScan.url()).hash === "").toBe(true);

    const workerScan = await openScan(workerContext, firstUrl);
    const colleagueScan = await openScan(colleagueContext, firstUrl);
    await expect(workerScan.getByRole("button", { name: "Confirm QR clock in" })).toBeVisible();
    await expect(colleagueScan.getByRole("button", { name: "Confirm QR clock in" })).toBeVisible();
    expect(new URL(workerScan.url()).hash).toBe("");
    expect(await workerScan.locator("body").evaluate((body) =>
      body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    findingsMustBeEmpty(await accessibilityFindings(workerScan, "mobile QR clock confirmation"));
    await workerScan.getByRole("button", { name: "Confirm QR clock in" }).click();
    await expect(workerScan.getByRole("status").filter({ hasText: "QR clock request recorded" }))
      .toContainText("queued for manager review");
    await colleagueScan.getByRole("button", { name: "Confirm QR clock in" }).click();
    await expect(colleagueScan.getByRole("alert").filter({ hasText: "That code was already used" })).toBeVisible();

    const secondUrl = await waitForNewCode(kioskPage, oldPath);
    expect(secondUrl.hash !== firstUrl.hash).toBe(true);
    const secondPath = await kioskPage.getByRole("region", { name: "Venue clock QR" }).locator("svg path").last().getAttribute("d");
    await workerContext.grantPermissions(["geolocation"], { origin: appUrl });
    const workerOut = await openScan(workerContext, secondUrl);
    await expect(workerOut.getByRole("button", { name: "Confirm QR clock out" })).toBeVisible();
    await workerOut.getByRole("button", { name: "Confirm QR clock out" }).click();
    await expect(workerOut.getByRole("status").filter({ hasText: "QR clock request recorded" })).toBeVisible();
    const events = await admin.from("attendance_events").select("event_type, employee_id, verification_status")
      .eq("business_id", businessId).order("event_type");
    expect(events.error).toBeNull();
    expect(events.data).toEqual([
      { event_type: "clock_in", employee_id: workerId, verification_status: "unverified" },
      { event_type: "clock_out", employee_id: workerId, verification_status: "unverified" },
    ]);
    const checks = await admin.from("attendance_location_checks").select("verification_status, reason")
      .eq("business_id", businessId);
    expect(checks.error).toBeNull();
    expect(checks.data.map((row) => `${row.verification_status}:${row.reason}`).sort())
      .toEqual(["review:permission_denied", "verified:inside"]);

    const unusedUrl = await waitForNewCode(kioskPage, secondPath);
    await page.reload();
    await page.getByRole("button", { name: "Revoke Front counter" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Device revoked" })).toBeVisible();
    await expect(kioskPage.getByRole("status").filter({ hasText: "expired or been revoked" })).toBeVisible();
    const revokedScan = await openScan(workerContext, unusedUrl);
    await revokedScan.getByRole("button", { name: "Confirm QR clock in" }).click();
    await expect(revokedScan.getByRole("alert").filter({ hasText: "That code has expired or its kiosk is unavailable" }))
      .toBeVisible();
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideBusinessId]);
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("operational probes report database readiness and protect process metrics", async ({ request }) => {
  const liveness = await request.get("/api/health");
  expect(liveness.status()).toBe(200);
  expect(await liveness.json()).toEqual({ status: "ok" });
  const ready = await request.get("/api/ready");
  expect(ready.status()).toBe(200);
  expect(ready.headers()["cache-control"]).toContain("no-store");
  expect(await ready.json()).toEqual({ status: "ok" });
  const { sql } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  try {
    await sql("revoke execute on function public.check_application_readiness() from anon");
    const unavailable = await request.get("/api/ready");
    expect(unavailable.status()).toBe(503);
    expect(unavailable.headers()["cache-control"]).toContain("no-store");
    expect(await unavailable.json()).toEqual({ status: "unavailable" });
    expect((await request.get("/api/health")).status()).toBe(200);
  } finally {
    await sql("grant execute on function public.check_application_readiness() to anon");
  }
  expect((await request.get("/api/ready")).status()).toBe(200);
  const token = process.env.BUTTERBOX_TEST_OPERATIONS_TOKEN;
  expect(token).toBeTruthy();
  expect((await request.get("/api/metrics")).status()).toBe(401);
  expect((await request.get("/api/metrics", { headers: { authorization: "Bearer invalid" } })).status()).toBe(401);
  const protectedMetrics = await request.get("/api/metrics", { headers: { authorization: `Bearer ${token}` } });
  expect(protectedMetrics.status()).toBe(200);
  expect(protectedMetrics.headers()["cache-control"]).toContain("no-store");
  const body = await protectedMetrics.json();
  expect(body.scope).toBe("process");
  expect(body.probes.readiness.passed).toBeGreaterThanOrEqual(1);
  expect(body.probes.readiness.failed).toBeGreaterThanOrEqual(1);
  expect(body.probes.liveness.passed).toBeGreaterThanOrEqual(1);
  expect(body.requestErrors.render).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(body)).not.toContain(token);
});

test("quick roster changes preview drag targets, support keyboard and undo on mobile", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const users = [];
  const contexts = [];
  const [businessId, venueId, fohId, bohId, alexId, samId, sourceId, overlapId, openId,
    outsideBusinessId, outsideVenueId, outsideDepartmentId, outsideEmployeeId] =
    Array.from({ length: 13 }, () => randomUUID());
  const roster = `/roster?business=${businessId}&venue=${venueId}&department=${fohId}&week=2032-03-29`;
  async function sourceShift() {
    const result = await admin.from("shifts").select("id, employee_id, role_title, starts_at, updated_at, is_published, requires_acknowledgement")
      .eq("id", sourceId).single();
    expect(result.error).toBeNull();
    return result.data;
  }
  try {
    for (const role of ["manager", "worker", "boh", "outside"]) {
      const created = await admin.auth.admin.createUser({
        email: `quick-browser-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users.push(created.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Quick change UI cafe" },
      { id: outsideBusinessId, name: "Outside quick change cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Quick venue", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideBusinessId, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
      { id: outsideDepartmentId, business_id: outsideBusinessId, venue_id: outsideVenueId, name: "Outside team" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: outsideBusinessId, user_id: users[3], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: alexId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[1], name: "Alex Quick", role_title: "Server" },
      { id: samId, business_id: businessId, venue_id: venueId, department_id: fohId,
        name: "Sam Quick", role_title: "Server" },
      { id: outsideEmployeeId, business_id: outsideBusinessId, venue_id: outsideVenueId,
        department_id: outsideDepartmentId, name: "Mira Outside", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: sourceId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: alexId, role_title: "Quick service",
        starts_at: "2032-03-29T09:00:00Z", ends_at: "2032-03-29T11:00:00Z",
        requires_acknowledgement: true },
      { id: overlapId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: samId, role_title: "Existing service",
        starts_at: "2032-03-30T09:00:00Z", ends_at: "2032-03-30T11:00:00Z",
        requires_acknowledgement: false },
      { id: openId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: null, role_title: "Open coverage",
        starts_at: "2032-04-03T09:00:00Z", ends_at: "2032-04-03T11:00:00Z",
        requires_acknowledgement: false },
    ])).error).toBeNull();
    expect((await admin.from("employee_availability_exceptions").insert({
      business_id: businessId, venue_id: venueId, employee_id: samId,
      starts_on: "2032-04-01", ends_on: "2032-04-01", exception_type: "leave", status: "approved",
    })).error).toBeNull();

    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `quick-browser-manager-${suffix}@example.test`, password);
    await page.goto(roster);
    const shortcuts = page.getByRole("checkbox", { name: "Enable roster shortcuts", exact: true });
    await expect(shortcuts).not.toBeChecked();
    await page.locator("#main-content").focus();
    await page.keyboard.press("Alt+Shift+ArrowRight");
    expect(new URL(page.url()).searchParams.get("week")).toBe("2032-03-29");
    await shortcuts.check();
    await page.locator("#main-content").focus();
    await page.keyboard.press("Alt+Shift+f");
    await expect(page.getByLabel("Find team member", { exact: true })).toBeFocused();
    await page.getByLabel("Find team member", { exact: true }).fill("aLeX");
    await page.keyboard.press("Alt+Shift+ArrowRight");
    expect(new URL(page.url()).searchParams.get("week")).toBe("2032-03-29");
    await page.getByRole("button", { name: "Search roster", exact: true }).click();
    await expect(page.locator(`#roster-row-${fohId}-${alexId}`)).toBeVisible();
    await expect(page.locator(`#roster-row-${fohId}-${samId}`)).toHaveCount(0);
    await expect(page.getByText("2 assigned", { exact: false })).toContainText("1 open");
    await expect(page.getByText("Open coverage", { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("business")).toBe(businessId);
    await page.getByRole("button", { name: "Collapse Front of House", exact: true }).click();
    await expect(page.locator(`#roster-row-${fohId}-${alexId}`)).toBeHidden();
    expect(new URL(page.url()).searchParams.get("q")).toBe("aLeX");
    await page.getByRole("button", { name: "Expand Front of House", exact: true }).click();
    await page.locator("#department-filter").selectOption(fohId);
    await page.getByRole("button", { name: "Apply filter", exact: true }).click();
    expect(new URL(page.url()).searchParams.get("q")).toBe("aLeX");
    await page.getByRole("link", { name: "Next week", exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("week") === "2032-04-05" &&
      url.searchParams.get("q") === "aLeX" && url.searchParams.get("department") === fohId);
    await page.getByRole("link", { name: "Previous week", exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("week") === "2032-03-29" &&
      url.searchParams.get("q") === "aLeX" && url.searchParams.get("business") === businessId);
    await page.getByRole("link", { name: "Clear roster search", exact: true }).click();
    await expect(page.getByLabel("Find team member", { exact: true })).toHaveValue("");
    await shortcuts.check();
    await page.locator("#main-content").focus();
    const findPrevented = await page.locator("#main-content").evaluate((element) => {
      const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(findPrevented).toBe(false);
    await page.evaluate(() => {
      const editor = document.createElement("div");
      editor.id = "test-roster-rich-editor";
      editor.contentEditable = "true";
      document.getElementById("main-content").append(editor);
      editor.focus();
    });
    await page.keyboard.press("Alt+Shift+ArrowRight");
    expect(new URL(page.url()).searchParams.get("week")).toBe("2032-03-29");
    await page.locator("#test-roster-rich-editor").evaluate((editor) => editor.remove());
    await page.locator("#main-content").focus();
    await page.keyboard.press("Alt+Shift+ArrowLeft");
    await expect(page).toHaveURL((url) => url.searchParams.get("week") === "2032-03-22" && url.searchParams.get("business") === businessId);
    await expect(shortcuts).toBeChecked();
    await page.locator("#main-content").focus();
    await page.keyboard.press("Alt+Shift+ArrowRight");
    await expect(page).toHaveURL((url) => url.searchParams.get("week") === "2032-03-29");
    await shortcuts.uncheck();
    await page.locator("#main-content").focus();
    await page.keyboard.press("Alt+Shift+ArrowLeft");
    expect(new URL(page.url()).searchParams.get("week")).toBe("2032-03-29");
    await shortcuts.check();
    await page.getByLabel("Find team member", { exact: true }).fill("absent-worker-63728");
    await page.getByRole("button", { name: "Search roster", exact: true }).click();
    await expect(page.getByText("No team members match this search.", { exact: true })).toBeVisible();
    await page.goto(`${roster}&q=one&q=two`);
    await expect(page.getByRole("alert").filter({ hasText: "Enter one team-member search" })).toBeVisible();
    await page.goto(`${roster}&q=${"a".repeat(101)}`);
    await expect(page.getByRole("alert").filter({ hasText: "Enter one team-member search" })).toBeVisible();
    await page.goto(`${roster}&q=Mira%20Outside`);
    await expect(page.getByText("No team members match this search.", { exact: true })).toBeVisible();
    await expect(page.getByText("Mira Outside", { exact: true })).toHaveCount(0);
    await page.goto(roster);
    await expect(shortcuts).not.toBeChecked();
    await shortcuts.check();
    const source = page.getByRole("button", { name: /Move or duplicate Alex Quick, Quick service/ });
    const target = page.locator(`#roster-row-${fohId}-${samId} td`).nth(3).locator("div").first();
    await source.dragTo(target);
    const panel = page.getByRole("region", { name: "Quick shift change" });
    const preview = panel.locator('[aria-label="Shift change preview"]');
    await expect(preview).toContainText("Sam Quick");
    await panel.getByRole("heading", { name: "Quick shift change", exact: true }).focus();
    await page.keyboard.press("Alt+Shift+ArrowRight");
    expect(new URL(page.url()).searchParams.get("week")).toBe("2032-03-29");
    await expect(panel.getByLabel("Target day")).toHaveValue("2032-04-01");
    await expect(preview).toContainText("unavailable or has approved leave");
    expect((await sourceShift()).starts_at).toBe("2032-03-29T09:00:00+00:00");
    await preview.getByRole("button", { name: "Apply move" }).click();
    await expect(panel.getByRole("status")).toContainText("Draft shift moved");
    expect(await sourceShift()).toMatchObject({
      employee_id: samId, starts_at: "2032-04-01T09:00:00+00:00",
      is_published: false, requires_acknowledgement: true,
    });
    await panel.getByRole("button", { name: "Undo last quick change" }).click();
    await expect(panel.getByRole("status")).toHaveText("Draft shift move undone.");
    expect(await sourceShift()).toMatchObject({
      employee_id: alexId, starts_at: "2032-03-29T09:00:00+00:00", is_published: false,
    });

    await source.focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("heading", { name: "Quick shift change" })).toBeFocused();
    await panel.getByLabel("Action").focus();
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByLabel("Action")).toHaveValue("duplicate");
    await panel.getByLabel("Target day").focus();
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByLabel("Target day")).toHaveValue("2032-03-30");
    await panel.getByLabel("Target team member").focus();
    await page.keyboard.press("End");
    await expect(panel.getByLabel("Target team member")).toHaveValue(samId);
    await panel.getByRole("button", { name: "Preview change" }).focus();
    await page.keyboard.press("Enter");
    await expect(preview.getByRole("alert")).toContainText("already has a shift");
    await expect(preview.getByRole("button", { name: "Create draft duplicate" })).toBeDisabled();
    await panel.getByLabel("Target day").focus();
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByLabel("Target day")).toHaveValue("2032-03-31");
    await panel.getByRole("button", { name: "Preview change" }).click();
    await expect(preview).toContainText("Sam Quick");
    await preview.getByRole("button", { name: "Create draft duplicate" }).click();
    await expect(panel.getByRole("status")).toContainText("Draft duplicate created");
    const duplicated = await admin.from("shifts").select("id, is_published, requires_acknowledgement")
      .eq("business_id", businessId).eq("employee_id", samId).eq("role_title", "Quick service");
    expect(duplicated.error).toBeNull();
    expect(duplicated.data).toHaveLength(1);
    expect(duplicated.data[0]).toMatchObject({ is_published: false, requires_acknowledgement: true });
    await panel.getByRole("button", { name: "Undo last quick change" }).click();
    await expect(panel.getByRole("status")).toHaveText("Draft duplicate removed.");

    await page.setViewportSize({ width: 375, height: 812 });
    await source.click();
    await expect(panel.getByRole("heading", { name: "Quick shift change" })).toBeFocused();
    expect((await panel.boundingBox()).width).toBeLessThanOrEqual(375);
    findingsMustBeEmpty(await accessibilityFindings(page, "mobile quick shift change"));
    await panel.getByRole("button", { name: "Cancel" }).click();
    const workerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(workerContext);
    const worker = await workerContext.newPage();
    await signIn(worker, `quick-browser-worker-${suffix}@example.test`, password);
    await worker.goto(roster);
    await expect(worker.getByRole("button", { name: /Move or duplicate/ })).toHaveCount(0);
    const bohContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(bohContext);
    const boh = await bohContext.newPage();
    await signIn(boh, `quick-browser-boh-${suffix}@example.test`, password);
    await boh.goto(roster);
    await expect(boh.getByRole("button", { name: /Move or duplicate Alex Quick/ })).toHaveCount(0);
    await boh.goto(`${roster}&q=Alex`);
    await expect(boh.getByText("No team members match this search.", { exact: true })).toBeVisible();
    await expect(boh.getByText("Alex Quick", { exact: true })).toHaveCount(0);
    await expect(worker.getByRole("button", { name: /Delete .* shift/ })).toHaveCount(0);
    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outside = await outsideContext.newPage();
    await signIn(outside, `quick-browser-outside-${suffix}@example.test`, password);
    await outside.goto(roster);
    await expect(outside.getByRole("heading", { name: "Roster unavailable", exact: true })).toBeVisible();
    await expect(outside.getByText("Alex Quick", { exact: true })).toHaveCount(0);
    for (const role of ["worker", "boh", "outside"]) {
      const client = createClient(apiUrl, anonKey, options);
      expect((await client.auth.signInWithPassword({
        email: `quick-browser-${role}-${suffix}@example.test`, password,
      })).error).toBeNull();
      expect((await client.rpc("delete_shift", { p_shift_id: sourceId })).error).not.toBeNull();
      expect((await client.rpc("delete_shift_if_unchanged", {
        p_shift_id: sourceId, p_expected_updated_at: (await sourceShift()).updated_at,
      })).error?.message).toBe("Permission denied");
      expect((await sourceShift()).id).toBe(sourceId);
    }
    const noJavaScript = await browser.newContext({ baseURL: appUrl, javaScriptEnabled: false });
    contexts.push(noJavaScript);
    await noJavaScript.addCookies(await page.context().cookies());
    const noJavaScriptPage = await noJavaScript.newPage();
    await noJavaScriptPage.goto(roster);
    await expect(noJavaScriptPage).toHaveURL((url) => url.pathname === "/roster");
    await expect(noJavaScriptPage.getByRole("heading", { name: "Weekly roster", exact: true })).toBeVisible();
    const noJavaScriptDelete = noJavaScriptPage.getByRole("form", { name: "Delete Alex Quick shift", exact: true });
    await expect(noJavaScriptDelete).toBeVisible();
    const noJavaScriptNotice = noJavaScriptDelete.locator("noscript span");
    await expect(noJavaScriptNotice).toBeVisible();
    await expect(noJavaScriptNotice).toHaveText("JavaScript is required to confirm draft deletion.");
    await noJavaScriptDelete.getByRole("button", { name: "Delete Alex Quick shift", exact: true }).click();
    await expect(noJavaScriptDelete.getByRole("button", { name: "Confirm deletion", exact: true })).toHaveCount(0);
    expect((await sourceShift()).id).toBe(sourceId);
    await page.getByRole("button", { name: "Delete Alex Quick shift", exact: true }).click();
    const confirmation = page.getByRole("button", { name: "Confirm deletion", exact: true });
    await expect(confirmation).toBeFocused();
    await expect(confirmation).toHaveAccessibleDescription(/Alex Quick, Quick service/);
    await expect(page.getByRole("button", { name: "Delete Alex Quick shift", exact: true }))
      .toHaveAttribute("aria-expanded", "true");
    const confirmationBounds = await confirmation.boundingBox();
    expect(confirmationBounds.x).toBeGreaterThanOrEqual(0);
    expect(confirmationBounds.x + confirmationBounds.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator("#main-content").focus();
    await page.keyboard.press("Alt+Shift+ArrowRight");
    expect(new URL(page.url()).searchParams.get("week")).toBe("2032-03-29");
    await page.getByRole("button", { name: "Cancel deletion", exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete Alex Quick shift", exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: "Delete Alex Quick shift", exact: true }))
      .toHaveAttribute("aria-expanded", "false");
    expect((await sourceShift()).id).toBe(sourceId);
    await page.getByRole("button", { name: "Delete Alex Quick shift", exact: true }).click();
    findingsMustBeEmpty(await accessibilityFindings(page, "mobile draft deletion confirmation"));
    const oldRevision = (await sourceShift()).updated_at;
    const changed = await admin.from("shifts").update({ role_title: "Revised quick service" })
      .eq("id", sourceId).select("updated_at").single();
    expect(changed.error).toBeNull();
    expect(changed.data.updated_at).not.toBe(oldRevision);
    await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("This draft changed");
    expect((await sourceShift()).role_title).toBe("Revised quick service");
    await page.getByRole("button", { name: "Delete Alex Quick shift", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirm deletion", exact: true }))
      .toHaveAccessibleDescription(/Alex Quick, Revised quick service/);
    await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
    await expect(page.locator('p[role="status"]')).toContainText("Draft shift removed.");
    const deleted = await admin.from("shifts").select("id").eq("id", sourceId).maybeSingle();
    expect(deleted.error).toBeNull();
    expect(deleted.data).toBeNull();
    await page.getByLabel("Find team member", { exact: true }).fill("no matching team member");
    await page.getByRole("button", { name: "Search roster", exact: true }).click();
    await expect(page.getByText("No team members match this search.", { exact: true })).toBeVisible();
    await expect(page.getByText("Open coverage", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Publish this department", exact: true }).click();
    await expect(page.locator('p[role="status"]')).toContainText("Front of House roster published.");
    const published = await admin.from("shifts").select("id, is_published").in("id", [overlapId, openId]);
    expect(published.error).toBeNull();
    expect(published.data).toHaveLength(2);
    expect(published.data.every((shift) => shift.is_published)).toBe(true);
    await page.getByRole("link", { name: "Help with rosters", exact: true }).click();
    const help = page.getByRole("article", { name: "Building and publishing rosters", exact: true });
    await expect(help.getByText("Search changes the display only;", { exact: false })).toBeVisible();
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideBusinessId]);
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

async function navigateDuringSessionChange(page, path) {
  await page.goto(path).catch((error) => {
    if (!error.message.includes("net::ERR_ABORTED")) throw error;
  });
}

async function expireBrowserSession(context) {
  const cookies = await context.cookies(appUrl);
  const parts = cookies.filter((cookie) =>
    /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name),
  );
  expect(parts.length).toBeGreaterThan(0);
  const name = parts[0].name.replace(/\.\d+$/, "");
  const value = await combineChunks(
    name,
    (chunkName) => parts.find((cookie) => cookie.name === chunkName)?.value,
  );
  expect(value?.startsWith("base64-")).toBe(true);
  const session = JSON.parse(stringFromBase64URL(value.slice(7)));
  session.expires_at = Math.floor(Date.now() / 1000) - 60;
  for (const part of parts) {
    await context.clearCookies({ name: part.name });
  }
  await context.addCookies(
    createChunks(name, `base64-${stringToBase64URL(JSON.stringify(session))}`).map(
      (chunk) => ({ ...chunk, url: appUrl }),
    ),
  );
}

test("verified signup, resumable setup, cross-tab logout and recovery", async ({
  page,
  context,
  browser,
}) => {
  const email = `auth-${randomUUID()}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const newPassword = `${randomBytes(18).toString("base64url")}bB2!`;
  let resumedContext;

  try {
    await page.goto("/auth/callback?code=invalid&next=/setup");
    await expect(page).toHaveURL(/\/forgot-password\?error=link/);
    await expect(page.locator('p[role="alert"]')).toContainText("expired");

    await page.goto("/signup");
    await page.getByLabel("Email address").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/login\?message=confirm/);

    await signIn(page, email, password);
    const unverifiedError = await page.locator('p[role="alert"]').innerText();
    await signIn(page, `unknown-${randomUUID()}@example.test`, password);
    await expect(page.locator('p[role="alert"]')).toHaveText(unverifiedError);

    await followEmailLink(page, await waitForMail(email, /confirm/i), "/setup");
    await expect(page).toHaveURL(/\/setup/);
    await page.getByLabel("Business name").fill("Authentication test business");
    await page.getByLabel("First venue").fill("Authentication test venue");
    await expect(page.getByRole("checkbox", { name: /Add a sample team/ })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: /Add a sample team/ })).not.toBeChecked();
    await page.getByRole("button", { name: "Save progress" }).click();
    await expect(page.getByRole("status")).toContainText("Setup progress saved");
    const pendingOwner = await findUser(email);
    expect(pendingOwner).toBeDefined();
    const savedDraft = await admin.from("business_setup_drafts").select("include_sample_data")
      .eq("user_id", pendingOwner.id).single();
    expect(savedDraft.error).toBeNull();
    expect(savedDraft.data.include_sample_data).toBe(false);

    resumedContext = await browser.newContext({ baseURL: appUrl });
    const resumedPage = await resumedContext.newPage();
    await signIn(resumedPage, email, password);
    await expect(resumedPage).toHaveURL(/\/setup/);
    await expect(resumedPage.getByLabel("Business name")).toHaveValue("Authentication test business");
    await expect(resumedPage.getByLabel("First venue")).toHaveValue("Authentication test venue");
    await expect(resumedPage.getByRole("checkbox", { name: /Add a sample team/ })).toBeDisabled();
    await expect(resumedPage.getByRole("checkbox", { name: /Add a sample team/ })).not.toBeChecked();
    await resumedPage.getByLabel("Venue address").fill("10 Test Street, Sydney NSW");
    await resumedPage.getByLabel("Venue timezone").selectOption("Australia/Perth");
    await resumedPage.getByRole("button", { name: "Create workspace" }).click();
    await expect(resumedPage.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();

    const owner = await findUser(email);
    expect(owner).toBeDefined();
    const membership = await admin
      .from("business_memberships")
      .select("business_id, role")
      .eq("user_id", owner.id)
      .single();
    expect(membership.error).toBeNull();
    expect(membership.data.role).toBe("owner");
    const venue = await admin
      .from("venues")
      .select("name, address, timezone")
      .eq("business_id", membership.data.business_id)
      .single();
    expect(venue.error).toBeNull();
    expect(venue.data).toEqual({
      name: "Authentication test venue",
      address: "10 Test Street, Sydney NSW",
      timezone: "Australia/Perth",
    });

    await resumedContext.close();
    resumedContext = undefined;

    await page.bringToFront();
    await navigateDuringSessionChange(page, "/");
    await expect(page.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();
    await page.goto("/login?error=signout");
    await expect(page.locator('p[role="alert"]')).toContainText("session may still be active");
    await page.getByRole("link", { name: "Return to workspace" }).click();
    await expect(page.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();

    const secondTab = await context.newPage();
    await secondTab.goto("/");
    await expect(secondTab.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?message=signed-out/);
    await expect(secondTab).toHaveURL(/\/login/, { timeout: 10_000 });
    await secondTab.close();

    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill(`unknown-${randomUUID()}@example.test`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    const resetMessage = await page.getByRole("status").innerText();
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toHaveText(resetMessage);
    await followEmailLink(page, await waitForMail(email, /reset|recovery/i), "/reset-password");
    await expect(page).toHaveURL(/\/reset-password/);
    await page.locator("#password").fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(/\/login\?message=password-updated/);
    await expect(page.getByRole("status")).toContainText("password has been updated");

    await signIn(page, email, password);
    await expect(page.locator('p[role="alert"]')).toHaveText(unverifiedError);
    await signIn(page, email, newPassword);
    await expect(page.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();
  } finally {
    try {
      if (resumedContext && browser.isConnected()) await resumedContext.close();
    } finally {
      const user = await findUser(email);
      if (user) {
        const memberships = await admin
          .from("business_memberships")
          .select("business_id")
          .eq("user_id", user.id);
        expect(memberships.error).toBeNull();
        const businesses = memberships.data.map((membership) => membership.business_id);
        if (businesses.length > 0) {
          await assertBusinessFixturesPreserved(admin, businesses);
        }
        const removed = await admin.auth.admin.deleteUser(user.id);
        expect(removed.error).toBeNull();
        expect(await findUser(email)).toBeUndefined();
        if (businesses.length > 0) {
          const remaining = await admin.from("businesses").select("id").in("id", businesses);
          expect(remaining.error).toBeNull();
          expect(remaining.data.map(({ id }) => id).sort()).toEqual([...businesses].sort());
        }
      }
    }
  }
});

test("a recovered session expires across signed-in tabs", async ({ page, context }) => {
  const suffix = randomUUID();
  const email = `expiry-${suffix}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const newPassword = `${randomBytes(18).toString("base64url")}bB2!`;
  const businessId = randomUUID();
  const venueId = randomUUID();
  let userId;
  try {
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(user.error).toBeNull();
    userId = user.data.user.id;
    expect((await admin.from("businesses").insert({ id: businessId, name: `Expiry ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Expiry venue", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: userId, role: "owner",
    })).error).toBeNull();

    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await followEmailLink(page, await waitForMail(email, /reset|recovery/i), "/reset-password");
    await page.locator("#password").fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(/\/login\?message=password-updated/);
    await signIn(page, email, newPassword);
    await expect(page.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();
    const expiryTab = await context.newPage();
    await expiryTab.goto("/");

    const otherClient = createClient(apiUrl, anonKey, options);
    const session = await otherClient.auth.signInWithPassword({ email, password: newPassword });
    expect(session.error).toBeNull();
    const revoked = await admin.auth.admin.signOut(session.data.session.access_token, "global");
    expect(revoked.error).toBeNull();
    await expireBrowserSession(context);
    await navigateDuringSessionChange(expiryTab, "/");
    await expect(expiryTab).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});

test("offline attendance claims survive reconnect failures and stay scoped to the signed-in account", async ({
  page, context, browser,
}) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, outsideVenue, fohId, bohId, workerId, colleagueId] =
    Array.from({ length: 8 }, () => randomUUID());
  const users = [];
  const contexts = [];
  const workerApi = createClient(apiUrl, anonKey, options);
  try {
    for (const role of ["worker", "colleague", "foh", "boh", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `offline-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Offline cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside offline cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[3], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: outsideBusiness, user_id: users[4], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[0], name: "Offline Worker", role_title: "Server" },
      { id: colleagueId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[1], name: "Offline Colleague", role_title: "Server" },
    ])).error).toBeNull();
    expect((await workerApi.auth.signInWithPassword({
      email: `offline-worker-${suffix}@example.test`, password,
    })).error).toBeNull();

    await signIn(page, `offline-worker-${suffix}@example.test`, password);
    await page.goto(`/attendance?venue=${venueId}`);
    const recoveryPage = await context.newPage();
    await recoveryPage.goto(`/attendance?venue=${venueId}`);
    const fallback = page.getByRole("region", { name: "Offline attendance fallback" });
    await expect(fallback).toContainText("Offline Worker");
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await fallback.getByRole("button", { name: "Save offline clock in" }).click();
    await expect(fallback.getByRole("status")).toContainText("1 claim pending on this device while offline");
    await fallback.getByRole("button", { name: "Save offline clock out" }).click();
    await expect(fallback.getByRole("status")).toContainText("2 claims pending on this device while offline");
    const pending = fallback.getByRole("list", { name: "Claims pending on this device" });
    await expect(pending.getByRole("listitem")).toHaveCount(2);
    await expect(pending).toContainText("Clock in");
    await expect(pending).toContainText("Clock out");
    const stored = await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open("butterbox-offline-attendance", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction("claims", "readonly");
        const request = transaction.objectStore("claims").getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        transaction.oncomplete = () => database.close();
      };
    }));
    expect(stored).toHaveLength(2);
    expect(stored.map((claim) => claim.eventType).sort()).toEqual(["clock_in", "clock_out"]);
    expect(stored.every((claim) => claim.actorId === users[0] && claim.businessId === businessId)).toBe(true);

    await page.close();
    await context.route("**/rest/v1/rpc/submit_attendance_offline_claim", (route) => route.abort());
    await context.setOffline(false);
    const recovered = recoveryPage.getByRole("region", { name: "Offline attendance fallback" });
    await expect(recovered.getByRole("alert")).toContainText("Some claims could not be uploaded");
    await expect(recovered.getByRole("status")).toContainText("2 claims pending on this device");
    let rows = await workerApi.from("attendance_offline_claims").select("id");
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);

    await context.unroute("**/rest/v1/rpc/submit_attendance_offline_claim");
    await context.route("**/rest/v1/rpc/submit_attendance_offline_claim", (route) => route.fulfill({
      status: 400, contentType: "application/json",
      body: JSON.stringify({ code: "P0001", message: "Venue timezone changed; retry attendance claim" }),
    }));
    await recovered.getByRole("button", { name: "Retry upload" }).click();
    await expect(recovered.getByRole("alert")).toContainText("venue timezone changed");
    await expect(recovered.getByRole("status")).toContainText("2 claims pending on this device");
    await context.unroute("**/rest/v1/rpc/submit_attendance_offline_claim");
    await context.route("**/rest/v1/rpc/submit_attendance_offline_claim", (route) => route.abort());

    await recoveryPage.getByRole("button", { name: "Sign out" }).click();
    await expect(recoveryPage).toHaveURL(/\/login\?message=signed-out/);
    await signIn(recoveryPage, `offline-colleague-${suffix}@example.test`, password);
    await recoveryPage.goto(`/attendance?venue=${venueId}`);
    await expect(recovered).toContainText("No claims are waiting on this device");
    await expect(recovered.getByRole("list", { name: "Claims pending on this device" })).toHaveCount(0);
    rows = await workerApi.from("attendance_offline_claims").select("id");
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);

    await recoveryPage.getByRole("button", { name: "Sign out" }).click();
    await expect(recoveryPage).toHaveURL(/\/login\?message=signed-out/);
    await signIn(recoveryPage, `offline-worker-${suffix}@example.test`, password);
    await recoveryPage.goto(`/attendance?venue=${venueId}`);
    await expect(recovered.getByRole("alert")).toContainText("Some claims could not be uploaded");
    const competingPage = await context.newPage();
    await competingPage.goto(`/attendance?venue=${venueId}`);
    const competing = competingPage.getByRole("region", { name: "Offline attendance fallback" });
    await expect(competing.getByRole("alert")).toContainText("Some claims could not be uploaded");
    await context.unroute("**/rest/v1/rpc/submit_attendance_offline_claim");
    await Promise.all([
      recovered.getByRole("button", { name: "Retry upload" }).click(),
      competing.getByRole("button", { name: "Retry upload" }).click(),
    ]);
    const submitted = recoveryPage.getByRole("region", { name: "Submitted offline attendance claims" });
    await expect(submitted.getByRole("listitem")).toHaveCount(2);
    await expect(submitted).toContainText("Manager review required");
    await expect(submitted).toContainText("do not automatically change recorded attendance");
    await expect(recovered.getByRole("list", { name: "Claims pending on this device" })).toHaveCount(0);
    rows = await workerApi.from("attendance_offline_claims")
      .select("id, request_id, event_type, claimed_at, received_at").eq("business_id", businessId);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(2);
    for (const claim of stored) {
      const received = rows.data.find((row) => row.request_id === claim.requestId);
      expect(received).toBeDefined();
      expect(received.event_type).toBe(claim.eventType);
      expect(new Date(received.claimed_at).toISOString()).toBe(claim.claimedAt);
      expect(Date.parse(received.received_at)).toBeGreaterThanOrEqual(Date.parse(claim.claimedAt));
      expect(Date.parse(received.received_at)).toBeLessThanOrEqual(Date.now() + 5_000);
      await expect(submitted.locator(`time[datetime="${received.claimed_at}"]`)).toHaveCount(1);
      await expect(submitted.locator(`time[datetime="${received.received_at}"]`)).toHaveCount(1);
    }
    const events = await admin.from("attendance_events").select("id").eq("business_id", businessId);
    expect(events.error).toBeNull();
    expect(events.data).toEqual([]);
    await competingPage.close();

    const managerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `offline-foh-${suffix}@example.test`, password);
    await managerPage.goto(`/attendance?venue=${venueId}`);
    const managerClaims = managerPage.getByRole("region", { name: "Submitted offline attendance claims" });
    await expect(managerClaims.getByRole("listitem")).toHaveCount(2);
    await expect(managerClaims).toContainText("Offline Worker");
    for (const row of rows.data) {
      await expect(managerClaims.locator(`time[datetime="${row.claimed_at}"]`)).toHaveCount(1);
      await expect(managerClaims.locator(`time[datetime="${row.received_at}"]`)).toHaveCount(1);
    }
    await managerPage.getByRole("button", { name: "Sign out" }).click();
    await expect(managerPage).toHaveURL(/\/login\?message=signed-out/);
    await signIn(managerPage, `offline-boh-${suffix}@example.test`, password);
    await managerPage.goto(`/attendance?venue=${venueId}`);
    await expect(managerClaims).toContainText("No submitted claims in your scope");
    await expect(managerClaims).not.toContainText("Offline Worker");
    await managerPage.getByRole("button", { name: "Sign out" }).click();
    await expect(managerPage).toHaveURL(/\/login\?message=signed-out/);
    await signIn(managerPage, `offline-outside-${suffix}@example.test`, password);
    await managerPage.goto(`/attendance?venue=${outsideVenue}`);
    await expect(managerClaims).toContainText("No submitted claims in your scope");
    await expect(managerClaims).not.toContainText("Offline Worker");

    const storageContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(storageContext);
    await storageContext.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        get() { throw new DOMException("Storage unavailable", "SecurityError"); },
      });
    });
    const storagePage = await storageContext.newPage();
    await signIn(storagePage, `offline-worker-${suffix}@example.test`, password);
    await storagePage.goto(`/attendance?venue=${venueId}`);
    const storageFallback = storagePage.getByRole("region", { name: "Offline attendance fallback" });
    await expect(storageFallback.getByRole("alert")).toContainText("Device storage or the connection is unavailable");
    await storageFallback.getByRole("button", { name: "Save offline clock in" }).click();
    await expect(storageFallback.getByRole("alert")).toContainText("The claim was not saved");
    const afterFailure = await workerApi.from("attendance_offline_claims").select("id");
    expect(afterFailure.error).toBeNull();
    expect(afterFailure.data).toHaveLength(2);
  } finally {
    await context.setOffline(false);
    for (const item of contexts) await item.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("employees and scoped managers complete and reject shift swaps with mobile notifications", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const names = ["owner", "foh", "boh", "ann", "ben", "outside"];
  const users = {};
  const contexts = [];
  const [businessId, outsideId, venueId, outsideVenue, fohId, bohId, annId, benId,
    annFirst, benFirst, annSecond, benSecond] = Array.from({ length: 12 }, () => randomUUID());
  const ownerApi = createClient(apiUrl, anonKey, options);
  const swapPath = `/shift-swaps?business=${businessId}&venue=${venueId}`;
  const notificationPath = `/notifications?business=${businessId}&venue=${venueId}`;

  try {
    for (const name of names) {
      const created = await admin.auth.admin.createUser({
        email: `swap-ui-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users[name] = created.data.user.id;
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Swap UI cafe" }, { id: outsideId, name: "Other UI cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Swap venue", timezone: "UTC" },
      { id: outsideVenue, business_id: outsideId, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users.ann, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.ben, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outside, role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: annId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.ann, name: "Swap Ann", role_title: "Server" },
      { id: benId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.ben, name: "Swap Ben", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: annFirst, employee_id: annId, role_title: "First Ann", starts_at: "2032-04-05T09:00:00Z",
        ends_at: "2032-04-05T13:00:00Z", requires_acknowledgement: true },
      { id: benFirst, employee_id: benId, role_title: "First Ben", starts_at: "2032-04-05T09:00:00Z",
        ends_at: "2032-04-05T13:00:00Z", requires_acknowledgement: true },
      { id: annSecond, employee_id: annId, role_title: "Second Ann", starts_at: "2032-04-06T09:00:00Z",
        ends_at: "2032-04-06T13:00:00Z", requires_acknowledgement: false },
      { id: benSecond, employee_id: benId, role_title: "Second Ben", starts_at: "2032-04-06T14:00:00Z",
        ends_at: "2032-04-06T18:00:00Z", requires_acknowledgement: false },
    ].map((shift) => ({ ...shift, business_id: businessId, venue_id: venueId, department_id: fohId })))).error).toBeNull();
    expect((await ownerApi.auth.signInWithPassword({
      email: `swap-ui-owner-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await ownerApi.rpc("publish_roster", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId, p_week_start: "2032-04-05",
    })).error).toBeNull();

    await signIn(page, `swap-ui-foh-${suffix}@example.test`, password);
    const annContext = await browser.newContext({ baseURL: appUrl });
    const benContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(annContext, benContext);
    const annPage = await annContext.newPage();
    const benPage = await benContext.newPage();
    await signIn(annPage, `swap-ui-ann-${suffix}@example.test`, password);
    await signIn(benPage, `swap-ui-ben-${suffix}@example.test`, password);

    await annPage.goto(`/my-schedule?business=${businessId}&venue=${venueId}&week=2032-04-05`);
    await annPage.getByRole("link", { name: "Request or review shift swaps" }).click();
    const requestSection = annPage.getByRole("region", { name: "Request a swap" });
    const firstRequest = requestSection.locator("details").filter({ hasText: "First Ann" });
    await firstRequest.locator("summary").click();
    await firstRequest.getByLabel("Choose a colleague").selectOption(benId);
    await firstRequest.getByRole("button", { name: "Request swap" }).click();
    await expect(annPage.getByRole("status")).toContainText("Swap requested");
    const firstSwap = new URL(annPage.url()).hash.replace("#swap-", "");
    expect(firstSwap).toMatch(/^[0-9a-f-]{36}$/);

    await page.goto(swapPath);
    const managerFirst = page.locator(`#swap-${firstSwap}`);
    await expect(managerFirst).toContainText("Awaiting colleague response");
    await expect(managerFirst.getByRole("button", { name: "Approve swap" })).toHaveCount(0);

    await benPage.goto(notificationPath);
    const requestNotice = benPage.getByRole("article", { name: /Shift swap update for Swap Ann and Swap Ben/ })
      .filter({ hasText: "Swap Ann requested a shift swap with you." });
    await expect(requestNotice).toContainText("Unread");
    await requestNotice.getByRole("button", { name: "View shift swap" }).click();
    const benFirstCard = benPage.locator(`#swap-${firstSwap}`);
    await expect(benFirstCard).toContainText("Awaiting colleague response");
    expect(await benPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    findingsMustBeEmpty(await accessibilityFindings(benPage, "mobile shift swaps"));
    await benFirstCard.getByLabel("Choose your shift to exchange").selectOption(benFirst);
    await benFirstCard.getByRole("button", { name: "Propose and confirm my shift" }).click();
    await expect(benPage.getByRole("status")).toContainText("Your shift was proposed");
    await benPage.goto(notificationPath);
    await expect(requestNotice).toContainText("Read");

    await annPage.goto(notificationPath);
    const proposalNotice = annPage.getByRole("article", { name: /Shift swap update for Swap Ann and Swap Ben/ })
      .filter({ hasText: "Swap Ben proposed a shift for your swap." });
    await proposalNotice.getByRole("button", { name: "View shift swap" }).click();
    await annPage.locator(`#swap-${firstSwap}`).getByRole("button", { name: "Confirm exchange" }).click();
    await expect(annPage.getByRole("status")).toContainText("A manager must review it");

    await page.goto(notificationPath);
    const reviewNotice = page.getByRole("article", { name: /Shift swap update for Swap Ann and Swap Ben/ })
      .filter({ hasText: "Swap Ann and Swap Ben confirmed a swap for review." });
    await reviewNotice.getByRole("button", { name: "View shift swap" }).click();
    await expect(managerFirst).toContainText("Both employees confirmed");
    const exceptionId = randomUUID();
    expect((await admin.from("employee_availability_exceptions").insert({
      id: exceptionId, business_id: businessId, venue_id: venueId, employee_id: benId,
      starts_on: "2032-04-05", ends_on: "2032-04-05", exception_type: "unavailable", status: "active",
    })).error).toBeNull();
    await managerFirst.getByRole("button", { name: "Approve swap" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("no longer eligible");
    expect((await admin.from("employee_availability_exceptions").delete().eq("id", exceptionId)).error).toBeNull();
    await managerFirst.getByRole("button", { name: "Approve swap" }).click();
    await expect(page.getByRole("status")).toContainText("Swap approved");
    const approvedShifts = await admin.from("shifts").select("id, employee_id").in("id", [annFirst, benFirst]);
    expect(approvedShifts.error).toBeNull();
    expect(approvedShifts.data.find((shift) => shift.id === annFirst).employee_id).toBe(benId);
    expect(approvedShifts.data.find((shift) => shift.id === benFirst).employee_id).toBe(annId);

    for (const worker of [annPage, benPage]) {
      await worker.goto(notificationPath);
      const approved = worker.getByRole("article", { name: /Shift swap update for Swap Ann and Swap Ben/ })
        .filter({ hasText: "Your shift swap was approved." });
      await expect(approved).toContainText("Unread");
      await approved.getByRole("button", { name: "View shift swap" }).click();
      await expect(worker.locator(`#swap-${firstSwap}`)).toContainText("Approved");
    }
    await annPage.goto(`/my-schedule?business=${businessId}&venue=${venueId}&week=2032-04-05`);
    const weekly = annPage.getByRole("region", { name: "Weekly schedule" });
    await expect(weekly).toContainText("First Ben");
    await expect(weekly).not.toContainText("First Ann");
    await weekly.getByRole("button", { name: /Acknowledge First Ben shift/ }).click();
    await expect(annPage.getByRole("status")).toHaveText("Shift acknowledged.");

    await annPage.goto(swapPath);
    const secondRequest = annPage.getByRole("region", { name: "Request a swap" })
      .locator("details").filter({ hasText: "Second Ann" });
    await secondRequest.locator("summary").click();
    await secondRequest.getByLabel("Choose a colleague").selectOption(benId);
    await secondRequest.getByRole("button", { name: "Request swap" }).click();
    await expect(annPage.getByRole("status")).toContainText("Swap requested");
    const secondSwap = new URL(annPage.url()).hash.replace("#swap-", "");
    await benPage.goto(swapPath);
    const benSecondCard = benPage.locator(`#swap-${secondSwap}`);
    await benSecondCard.getByLabel("Choose your shift to exchange").selectOption(benSecond);
    await benSecondCard.getByRole("button", { name: "Propose and confirm my shift" }).click();
    await expect(benPage.getByRole("status")).toContainText("Your shift was proposed");
    await annPage.goto(swapPath);
    await annPage.locator(`#swap-${secondSwap}`).getByRole("button", { name: "Confirm exchange" }).click();
    await expect(annPage.getByRole("status")).toContainText("A manager must review it");

    const bohContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(bohContext);
    const bohPage = await bohContext.newPage();
    await signIn(bohPage, `swap-ui-boh-${suffix}@example.test`, password);
    await bohPage.goto(swapPath);
    await expect(bohPage.locator(`#swap-${secondSwap}`)).toHaveCount(0);
    await expect(bohPage.getByRole("button", { name: "Approve swap" })).toHaveCount(0);

    await page.goto(swapPath);
    const managerSecond = page.locator(`#swap-${secondSwap}`);
    await managerSecond.getByLabel("Reason for rejection").fill("   ");
    await managerSecond.getByRole("button", { name: "Reject swap" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Enter a rejection reason");
    await managerSecond.getByLabel("Reason for rejection").fill("Coverage required");
    await managerSecond.getByRole("button", { name: "Reject swap" }).click();
    await expect(page.getByRole("status")).toContainText("Swap rejected");
    for (const worker of [annPage, benPage]) {
      await worker.goto(notificationPath);
      const rejected = worker.getByRole("article", { name: /Shift swap update for Swap Ann and Swap Ben/ })
        .filter({ hasText: "Your shift swap was rejected." });
      await expect(rejected).toContainText("Unread");
      await rejected.getByRole("button", { name: "View shift swap" }).click();
      await expect(worker.locator(`#swap-${secondSwap}`)).toContainText("Manager's reason: Coverage required");
    }
    const rejectedShifts = await admin.from("shifts").select("id, employee_id").in("id", [annSecond, benSecond]);
    expect(rejectedShifts.error).toBeNull();
    expect(rejectedShifts.data.find((shift) => shift.id === annSecond).employee_id).toBe(annId);
    expect(rejectedShifts.data.find((shift) => shift.id === benSecond).employee_id).toBe(benId);

    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outsidePage = await outsideContext.newPage();
    await signIn(outsidePage, `swap-ui-outside-${suffix}@example.test`, password);
    await outsidePage.goto(swapPath);
    await expect(outsidePage.getByRole("heading", { name: "Shift swaps unavailable" })).toBeVisible();
    await expect(outsidePage.getByText("Swap Ann", { exact: false })).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
    for (const id of [businessId, outsideId]) {
      await assertBusinessFixturesPreserved(admin, id);
    }
    for (const user of Object.values(users)) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("prepared attendance reopens offline without crossing account or tenant sessions", async ({
  page, context, browser,
}) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const passphrase = "an offline phrase for this test";
  const [businessId, outsideBusiness, venueId, outsideVenue, departmentId, outsideDepartment, employeeId, outsideEmployee] =
    Array.from({ length: 8 }, () => randomUUID());
  const users = [];
  const workerApi = createClient(apiUrl, anonKey, options);
  const outsideContext = await browser.newContext({ baseURL: appUrl });
  let mirrored;

  async function prepare(target) {
    const section = target.getByRole("region", { name: "Offline attendance fallback" });
    await section.getByText("Prepare this tab for offline reopening").click();
    await section.getByLabel("Offline passphrase", { exact: true }).fill(passphrase);
    await section.getByLabel("Confirm offline passphrase").fill(passphrase);
    await section.getByRole("button", { name: "Prepare offline reopening" }).click();
    await expect(section.getByRole("status")).toContainText("Offline reopening is prepared");
    expect(await target.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    return section;
  }

  async function unlock(target) {
    await target.getByLabel("Offline passphrase").fill(passphrase);
    await target.getByRole("button", { name: "Unlock offline attendance" }).click();
    await expect(target.getByRole("region", { name: "Offline attendance fallback" })).toBeVisible();
  }

  async function replaceAuthCookies(cookies) {
    for (const cookie of (await context.cookies(appUrl)).filter((item) =>
      /^sb-.+-auth-token(?:\.\d+)?$/.test(item.name))) {
      await context.clearCookies({ name: cookie.name });
    }
    await context.addCookies(cookies);
  }

  try {
    for (const role of ["worker", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `reopen-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Reopen cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside reopen cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "Outside department" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusiness, user_id: users[1], role: "employee", venue_id: outsideVenue,
        department_id: outsideDepartment },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[0], name: "Reopen Worker", role_title: "Server" },
      { id: outsideEmployee, business_id: outsideBusiness, venue_id: outsideVenue, department_id: outsideDepartment,
        auth_user_id: users[1], name: "Outside Worker", role_title: "Server" },
    ])).error).toBeNull();

    const outsidePage = await outsideContext.newPage();
    await signIn(outsidePage, `reopen-outside-${suffix}@example.test`, password);
    const outsideCookies = (await outsideContext.cookies(appUrl))
      .filter((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name));
    expect(outsideCookies.length).toBeGreaterThan(0);
    await signIn(page, `reopen-worker-${suffix}@example.test`, password);
    expect((await workerApi.auth.signInWithPassword({
      email: `reopen-worker-${suffix}@example.test`, password,
    })).error).toBeNull();
    await page.goto(`/attendance?venue=${venueId}`);
    const fallback = await prepare(page);
    const workerCookies = (await context.cookies(appUrl))
      .filter((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name));
    const envelope = await page.evaluate(() => sessionStorage.getItem("butterbox:offline-attendance-context:v1"));
    expect(envelope).toBeTruthy();
    expect(envelope).not.toContain("Reopen Worker");
    expect(envelope).not.toContain(users[0]);
    const cached = await page.evaluate(async () => {
      const cache = await caches.open("butterbox-offline-shell-v1");
      const requests = await cache.keys();
      return {
        paths: requests.map((request) => new URL(request.url).pathname).sort(),
        credentials: requests.map((request) => request.credentials),
      };
    });
    expect(cached.paths).toEqual([
      "/offline-attendance-app.mjs", "/offline-attendance-shared.mjs",
      "/offline-attendance.css", "/offline-attendance.html",
    ]);
    expect(cached.credentials.every((credentials) => credentials === "omit")).toBe(true);

    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.testOriginalSetItem = original;
      Storage.prototype.setItem = function (key, value) {
        if (key === "butterbox:offline-attendance-context:v1") {
          throw new DOMException("Storage full", "QuotaExceededError");
        }
        return original.call(this, key, value);
      };
    });
    await fallback.getByLabel("Offline passphrase", { exact: true }).fill(passphrase);
    await fallback.getByLabel("Confirm offline passphrase").fill(passphrase);
    await fallback.getByRole("button", { name: "Prepare offline reopening" }).click();
    await expect(fallback.getByRole("alert")).toContainText("Offline preparation could not be stored");
    await page.evaluate(() => { Storage.prototype.setItem = window.testOriginalSetItem; });
    expect(await page.evaluate(() => sessionStorage.getItem("butterbox:offline-attendance-context:v1"))).toBe(envelope);

    let startPreparation;
    let resumePreparation;
    const preparationStarted = new Promise((resolve) => { startPreparation = resolve; });
    const preparationResumed = new Promise((resolve) => { resumePreparation = resolve; });
    const optionsRoute = "**/rest/v1/rpc/list_my_clock_options*";
    await context.route(optionsRoute, async (route) => {
      startPreparation();
      await preparationResumed;
      await route.continue();
    });
    try {
      await fallback.getByLabel("Offline passphrase", { exact: true }).fill(passphrase);
      await fallback.getByLabel("Confirm offline passphrase").fill(passphrase);
      await fallback.getByRole("button", { name: "Prepare offline reopening" }).click();
      await preparationStarted;
      await replaceAuthCookies(outsideCookies);
      await expect(fallback.getByRole("alert")).toContainText("account session changed", { timeout: 7_000 });
      const failedPreparation = page.waitForEvent("console", {
        predicate: (message) => message.type() === "error" &&
          message.text().includes("Could not prepare offline attendance reopening."),
      });
      resumePreparation();
      await failedPreparation;
      expect(await page.evaluate(() => sessionStorage.getItem("butterbox:offline-attendance-context:v1"))).toBe(envelope);
    } finally {
      resumePreparation();
      await context.unroute(optionsRoute);
    }
    await replaceAuthCookies(workerCookies);
    await page.goto(`/attendance?venue=${venueId}`);

    await context.setOffline(true);
    await replaceAuthCookies(outsideCookies);
    await expect(fallback.getByRole("alert")).toContainText("account session changed", { timeout: 7_000 });
    await expect(fallback).not.toContainText("Reopen Worker");
    await expect(fallback.getByRole("button", { name: "Save offline clock in" })).toHaveCount(0);
    await replaceAuthCookies(workerCookies);
    await page.reload();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("heading", { name: "Offline attendance" })).toBeVisible();
    await page.evaluate(async () => {
      const shell = await caches.open("butterbox-offline-shell-v1");
      const backup = await caches.open("test-offline-asset-backup");
      await backup.put("/offline-attendance-app.mjs", await shell.match("/offline-attendance-app.mjs"));
      await shell.delete("/offline-attendance-app.mjs");
    });
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("Offline controls are loading");
    await page.evaluate(async () => {
      const shell = await caches.open("butterbox-offline-shell-v1");
      const backup = await caches.open("test-offline-asset-backup");
      await shell.put("/offline-attendance-app.mjs", await backup.match("/offline-attendance-app.mjs"));
      await caches.delete("test-offline-asset-backup");
    });
    await page.reload();
    await page.getByLabel("Offline passphrase").fill("incorrect passphrase");
    await page.getByRole("button", { name: "Unlock offline attendance" }).click();
    await expect(page.getByRole("alert")).toContainText("passphrase is incorrect");
    await unlock(page);
    await expect(page.getByRole("combobox", { name: "Employee and department" })).toContainText("Reopen Worker");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto(`/attendance?venue=${outsideVenue}`);
    await page.getByLabel("Offline passphrase").fill(passphrase);
    await page.getByRole("button", { name: "Unlock offline attendance" }).click();
    await expect(page.getByRole("alert")).toContainText("prepared for another venue");
    await page.goto(`/attendance?venue=${venueId}`);
    await unlock(page);
    await page.evaluate(({ employee, department }) => {
      const select = document.querySelector("#offline-selection");
      select.add(new Option("Injected outside worker", `${employee}:${department}`, true, true));
    }, { employee: outsideEmployee, department: outsideDepartment });
    await page.getByRole("button", { name: "Save offline clock in" }).click();
    await expect(page.getByRole("alert")).toContainText("Choose your employee and department");
    await page.getByRole("combobox", { name: "Employee and department" }).selectOption({
      label: "Reopen Worker · FOH",
    });
    await page.getByRole("button", { name: "Save offline clock in" }).click();
    await page.getByRole("button", { name: "Save offline clock out" }).click();
    await expect(page.getByRole("status")).toContainText("2 claims pending");
    await page.reload();
    await unlock(page);
    await expect(page.getByRole("list", { name: "Claims pending on this device" }).getByRole("listitem")).toHaveCount(2);

    await page.evaluate(() => {
      Object.defineProperty(window, "indexedDB", {
        configurable: true, get() { throw new DOMException("Storage unavailable", "SecurityError"); },
      });
    });
    await page.getByRole("button", { name: "Save offline clock in" }).click();
    await expect(page.getByRole("alert")).toContainText("The claim was not saved");
    await page.reload();
    await unlock(page);
    await page.evaluate(() => {
      const original = indexedDB.open;
      let calls = 0;
      window.testOriginalIndexedDbOpen = original;
      indexedDB.open = function (...args) {
        calls += 1;
        if (calls === 2) throw new DOMException("Storage unavailable", "SecurityError");
        return original.apply(this, args);
      };
    });
    await page.getByRole("button", { name: "Save offline clock in" }).click();
    await expect(page.getByRole("alert")).toContainText("The claim was saved, but its pending status");
    await page.evaluate(() => { indexedDB.open = window.testOriginalIndexedDbOpen; });
    await page.reload();
    await unlock(page);
    const stored = await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("butterbox-offline-attendance", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("claims", "readonly");
        const all = transaction.objectStore("claims").getAll();
        all.onerror = () => reject(all.error);
        all.onsuccess = () => resolve(all.result);
        transaction.oncomplete = () => database.close();
      };
    }));
    expect(stored).toHaveLength(3);
    expect(stored.every((claim) => claim.actorId === users[0] && claim.businessId === businessId)).toBe(true);

    await replaceAuthCookies(outsideCookies);
    await expect(page.getByRole("alert")).toContainText("account session changed", { timeout: 7_000 });
    await expect(page.getByRole("region", { name: "Offline attendance fallback" })).toBeHidden();
    await page.getByLabel("Offline passphrase").fill(passphrase);
    await page.getByRole("button", { name: "Unlock offline attendance" }).click();
    await expect(page.getByRole("alert")).toContainText("account session changed");

    await context.setOffline(false);
    const otherTenant = await context.newPage();
    await otherTenant.goto(`/attendance?venue=${outsideVenue}`);
    const otherFallback = await prepare(otherTenant);
    await expect(otherFallback).toContainText("No claims are waiting on this device");
    await context.setOffline(true);
    await otherTenant.reload();
    await unlock(otherTenant);
    await expect(otherTenant.getByRole("status")).toContainText("No claims are waiting on this device");
    await expect(otherTenant.getByRole("region", { name: "Offline attendance fallback" })).not.toContainText("Reopen Worker");
    await replaceAuthCookies(workerCookies);
    await expect(otherTenant.getByRole("alert")).toContainText("account session changed", { timeout: 7_000 });
    await unlock(page);
    await expect(page.getByRole("status")).toContainText("3 claims pending");
    await context.setOffline(false);
    await page.getByRole("button", { name: "Reconnect and upload" }).click();
    const submitted = page.getByRole("region", { name: "Submitted offline attendance claims" });
    await expect(submitted.getByRole("listitem")).toHaveCount(3);
    const received = await workerApi.from("attendance_offline_claims")
      .select("request_id, claimed_at, received_at").eq("business_id", businessId);
    expect(received.error).toBeNull();
    expect(received.data).toHaveLength(3);
    for (const claim of stored) {
      const row = received.data.find((item) => item.request_id === claim.requestId);
      expect(row).toBeDefined();
      expect(new Date(row.claimed_at).toISOString()).toBe(claim.claimedAt);
      expect(Date.parse(row.received_at)).toBeGreaterThanOrEqual(Date.parse(claim.claimedAt));
    }

    mirrored = await context.newPage();
    await mirrored.goto("/offline-attendance.html");
    await mirrored.evaluate((value) => sessionStorage.setItem("butterbox:offline-attendance-context:v1", value), envelope);
    await unlock(mirrored);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?message=signed-out/);
    await expect(mirrored.getByRole("alert")).toContainText("account session changed");
    await expect(mirrored.getByRole("region", { name: "Offline attendance fallback" })).toBeHidden();
    expect(await page.evaluate(() => sessionStorage.getItem("butterbox:offline-attendance-context:v1"))).toBeNull();
    expect(await mirrored.evaluate(() => sessionStorage.getItem("butterbox:offline-attendance-context:v1"))).toBeNull();
  } finally {
    await context.setOffline(false);
    await outsideContext.close();
    if (mirrored) await mirrored.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

async function withPermissionFixtures(initialRole, run) {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const userIds = [];
  const businessId = randomUUID();
  const venueIds = [randomUUID(), randomUUID()];
  const departmentIds = [randomUUID(), randomUUID(), randomUUID()];
  try {
    for (const name of ["owner", "member"]) {
      const result = await admin.auth.admin.createUser({
        email: `${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      userIds.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Permissions ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert(venueIds.map((id, index) => ({
      id, business_id: businessId, name: `Venue ${index + 1}`,
    })))).error).toBeNull();
    expect((await admin.from("departments").insert(departmentIds.map((id, index) => ({
      id, business_id: businessId, venue_id: venueIds[index === 2 ? 1 : 0],
      name: index === 1 ? "Back of House" : "Front of House",
    })))).error).toBeNull();
    const scopes = {
      general_manager: { role: "general_manager", venue_id: venueIds[1], department_id: null },
      foh_manager: { role: "foh_manager", venue_id: venueIds[0], department_id: departmentIds[0] },
      boh_manager: { role: "boh_manager", venue_id: venueIds[0], department_id: departmentIds[1] },
      employee: { role: "employee", venue_id: venueIds[0], department_id: departmentIds[0] },
      owner: { role: "owner", venue_id: null, department_id: null },
      admin: { role: "admin", venue_id: null, department_id: null },
      department_manager: { role: "department_manager", venue_id: venueIds[0], department_id: departmentIds[0] },
    };
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], ...scopes[initialRole] },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert(departmentIds.map((departmentId, index) => ({
      business_id: businessId, venue_id: venueIds[index === 2 ? 1 : 0], department_id: departmentId,
      name: ["FOH directory worker", "BOH directory worker", "Other venue worker"][index],
      email: `private-${index}@example.test`, role_title: index === 1 ? "Cook" : "Server",
    })))).error).toBeNull();
    await run({ suffix, password, userIds, businessId, venueIds, departmentIds, scopes });
  } finally {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    const remaining = await admin.from("businesses").select("id").eq("id", businessId);
    expect(remaining.error).toBeNull();
    expect(remaining.data).toEqual([{ id: businessId }]);
  }
}

async function verifyLivePermissionChange(page, browser, initialRole, role) {
  await withPermissionFixtures(initialRole, async ({
    suffix, password, userIds, businessId, venueIds, departmentIds, scopes,
  }) => {
    await signIn(page, `owner-${suffix}@example.test`, password);
    await page.getByRole("link", { name: "Permissions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Business permissions" })).toBeVisible();
    await page.getByRole("link", { name: `View access for member-${suffix}`, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Member access", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Business role", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Edit permissions" }).click();
    const targetContext = await browser.newContext({ baseURL: appUrl });
    try {
      const targetPage = await targetContext.newPage();
      await signIn(targetPage, `member-${suffix}@example.test`, password);
      const { venue_id: venueId, department_id: departmentId } = scopes[role];
      await page.getByRole("combobox", { name: "Business role", exact: true }).selectOption(role);
      if (venueId) await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueId);
      if (departmentId) await page.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentId);
      await page.getByRole("button", { name: "Review change" }).click();
      await expect(page.getByRole("heading", { name: "Review access change" })).toBeFocused();
      await expect(page.getByText("Current access", { exact: true })).toBeVisible();
      await expect(page.getByText("New access", { exact: true })).toBeVisible();
      await page.getByLabel("I confirm this change to the member's business access.").check();
      await Promise.all([
        page.waitForResponse((response) => response.request().method() === "POST" &&
          new URL(response.url()).pathname.toLowerCase() === `/settings/permissions/${userIds[1]}`),
        page.getByRole("button", { name: "Confirm and save permissions" }).click(),
      ]);
      await expect(page.getByRole("status").filter({ hasText: "Permissions updated." })).toBeVisible();
      const stored = await admin.from("business_memberships").select("role, venue_id, department_id")
        .eq("user_id", userIds[1]).eq("business_id", businessId).single();
      expect(stored.error).toBeNull();
      expect(stored.data).toEqual(scopes[role]);
      await page.reload();
      await expect(page.getByText(permissionRoleDisplay(role), { exact: true })).toBeVisible();
      await navigateDuringSessionChange(targetPage, "/");
      await expect(targetPage.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();
      await expect(targetPage.getByRole("link", { name: "Permissions", exact: true })).toHaveCount(role === "owner" ? 1 : 0);
      if (role !== "owner") {
        await navigateDuringSessionChange(targetPage, "/settings/permissions");
        await expect(targetPage).toHaveURL(/\/\?error=permission/);
        await expect(targetPage.getByRole("heading", { name: "Business permissions" })).toHaveCount(0);
      }
      if (role === "employee") {
        await expect(targetPage.getByRole("link", { name: "People", exact: true })).toHaveCount(0);
        await navigateDuringSessionChange(targetPage, "/people");
        await expect(targetPage).toHaveURL(/\/\?error=permission/);
      } else if (role !== "owner") {
        await navigateDuringSessionChange(targetPage, "/people");
        const directory = targetPage.getByRole("form", { name: "Directory filters" });
        await expect(directory).toBeVisible();
        await expect(directory.getByRole("combobox", { name: "Venue", exact: true }).locator("option")).toHaveCount(1);
        const expectedWorker = role === "general_manager" ? "Other venue worker" : role === "boh_manager" ? "BOH directory worker" : "FOH directory worker";
        await expect(targetPage.getByRole("link", { name: `View profile for ${expectedWorker}` })).toBeVisible();
        for (const worker of ["FOH directory worker", "BOH directory worker", "Other venue worker"].filter((name) => name !== expectedWorker)) {
          await expect(targetPage.getByRole("link", { name: `View profile for ${worker}` })).toHaveCount(0);
        }
        await navigateDuringSessionChange(targetPage, `/people?venue=${venueIds[role === "general_manager" ? 0 : 1]}`);
        await expect(targetPage).toHaveURL(/\/people\?error=filter/);
        await expect(targetPage.locator('p[role="alert"]')).toContainText("filter is unavailable");
      }
      await navigateDuringSessionChange(targetPage, "/roster?department=all");
      await expect(targetPage).toHaveURL(/\/roster\?/);
      await expect(targetPage.locator("#department-filter")).toBeVisible();
      const departmentNames = role === "owner"
        ? ["Back of House", "Front of House"]
        : [role === "boh_manager" ? "Back of House" : "Front of House"];
      const actualDepartments = await targetPage.locator("#department-filter option").allTextContents();
      expect(actualDepartments.filter((name) => name !== "All departments")).toEqual(departmentNames);
      if (role === "employee") {
        await expect(targetPage.getByRole("button", { name: "Save draft shift" })).toHaveCount(0);
        await expect(targetPage.getByRole("button", { name: "Publish this department" })).toHaveCount(0);
      } else {
        await targetPage.locator("#department-filter").selectOption(departmentIds[role === "general_manager" ? 2 : role === "boh_manager" ? 1 : 0]);
        await targetPage.getByRole("button", { name: "Apply filter" }).click();
        await expect(targetPage.getByRole("button", { name: "Save draft shift" })).toBeVisible();
      }
    } finally {
      if (browser.isConnected()) await targetContext.close();
    }
  });
}

function permissionRoleDisplay(role) {
  return ({
    owner: "Owner", general_manager: "General manager", foh_manager: "FOH manager",
    boh_manager: "BOH manager", employee: "Employee",
  })[role];
}

test("live permissions: employee to general manager", async ({ page, browser }) =>
  verifyLivePermissionChange(page, browser, "employee", "general_manager"));
test("live permissions: general manager to FOH manager", async ({ page, browser }) =>
  verifyLivePermissionChange(page, browser, "general_manager", "foh_manager"));
test("live permissions: FOH manager to BOH manager", async ({ page, browser }) =>
  verifyLivePermissionChange(page, browser, "foh_manager", "boh_manager"));
test("live permissions: BOH manager to employee", async ({ page, browser }) =>
  verifyLivePermissionChange(page, browser, "boh_manager", "employee"));
test("live permissions: employee to owner", async ({ page, browser }) =>
  verifyLivePermissionChange(page, browser, "employee", "owner"));

test("permissions UX: search, cancel, stale save and audit", async ({ page }) => {
  await withPermissionFixtures("employee", async ({ suffix, password, userIds, businessId, venueIds, departmentIds, scopes }) => {
    const owner = createClient(apiUrl, anonKey, options);
    expect((await owner.auth.signInWithPassword({ email: `owner-${suffix}@example.test`, password })).error).toBeNull();
    await signIn(page, `owner-${suffix}@example.test`, password);
    await page.goto(`/settings/permissions?business=${businessId}`);
    const filters = page.getByRole("form", { name: "Member directory filters" });
    await filters.getByRole("searchbox", { name: "Search members" }).fill(`member-${suffix}`);
    await filters.getByRole("combobox", { name: "Business role" }).selectOption("employee");
    await filters.getByRole("combobox", { name: "Venue" }).selectOption(venueIds[0]);
    await filters.getByRole("combobox", { name: "Department" }).selectOption(departmentIds[0]);
    await filters.getByRole("combobox", { name: "Sort by" }).selectOption("role");
    await Promise.all([
      page.waitForURL(/role=employee/),
      filters.getByRole("button", { name: "Apply filters" }).click(),
    ]);
    await expect(page.getByText("1 member of 2", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: `View access for member-${suffix}`, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Member access", exact: true })).toBeVisible();
    await expect(page.getByText("Employee", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Business role" })).toHaveCount(0);
    await page.getByRole("button", { name: "Edit permissions" }).click();
    await expect(page.getByRole("heading", { name: "Edit permissions", exact: true })).toBeFocused();
    await page.getByRole("combobox", { name: "Business role" }).selectOption("foh_manager");
    await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueIds[1]);
    await expect(page.getByRole("button", { name: "Review change" })).toBeDisabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByRole("button", { name: "Edit permissions" })).toBeFocused();
    const before = await admin.from("business_memberships").select("role, venue_id, department_id")
      .eq("business_id", businessId).eq("user_id", userIds[1]).single();
    expect(before.error).toBeNull();
    expect(before.data).toEqual(scopes.employee);
    await page.getByRole("button", { name: "Edit permissions" }).click();
    await expect(page.getByRole("combobox", { name: "Business role" })).toHaveValue("employee");
    await expect(page.getByRole("combobox", { name: "Venue", exact: true })).toHaveValue(venueIds[0]);
    await page.getByRole("combobox", { name: "Business role" }).selectOption("foh_manager");
    expect((await owner.rpc("assign_business_member_role", {
      p_business_id: businessId, p_user_id: userIds[1], p_role: "general_manager",
      p_venue_id: venueIds[1], p_department_id: null,
    })).error).toBeNull();
    await page.getByRole("button", { name: "Review change" }).click();
    await page.getByLabel("I confirm this change to the member's business access.").check();
    await page.getByRole("button", { name: "Confirm and save permissions" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("These permissions changed while you were editing");
    await expect(page.getByText("General manager", { exact: true })).toBeVisible();
    const after = await admin.from("business_memberships").select("role, venue_id, department_id")
      .eq("business_id", businessId).eq("user_id", userIds[1]).single();
    expect(after.error).toBeNull();
    expect(after.data).toEqual(scopes.general_manager);
    const audit = await owner.from("sensitive_action_audit").select("old_values, new_values")
      .eq("business_id", businessId).eq("source_table", "business_memberships").eq("operation", "UPDATE");
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
    expect(audit.data[0].old_values.role).toBe("employee");
    expect(audit.data[0].new_values.role).toBe("general_manager");
    await page.getByRole("link", { name: "Back to members" }).click();
    await expect(filters.getByRole("searchbox", { name: "Search members" })).toHaveValue(`member-${suffix}`);
    await expect(filters.getByRole("combobox", { name: "Business role" })).toHaveValue("employee");
    await expect(page.getByText("No members match these filters. Try resetting them.")).toBeVisible();
    await page.getByRole("link", { name: "Help with permissions" }).click();
    await expect(page.getByRole("heading", { name: "Delegating access" })).toBeVisible();
    await expect(page.getByText("Only owners can inspect and manage this directory", { exact: false })).toBeVisible();
  });
});

test("permissions UX: legacy administrator cannot inspect or forge access changes", async ({ page }) => {
  await withPermissionFixtures("admin", async ({ suffix, password, userIds, businessId, venueIds, departmentIds }) => {
    await signIn(page, `owner-${suffix}@example.test`, password);
    await page.goto(`/settings/permissions/${userIds[1].toUpperCase()}?business=${businessId}`);
    await expect(page.getByRole("heading", { name: "Member access", exact: true })).toBeVisible();
    await expect(page.getByText("Administrator (legacy)", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit permissions" }).click();
    await expect(page.getByText("This member has a legacy role.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review change" })).toBeDisabled();
    await page.getByRole("combobox", { name: "Business role" }).selectOption("employee");
    await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueIds[0]);
    await page.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentIds[0]);
    await page.getByRole("button", { name: "Review change" }).click();
    const confirmation = page.getByLabel("I confirm this change to the member's business access.");
    await page.getByRole("button", { name: "Confirm and save permissions" }).click();
    expect(await confirmation.evaluate((checkbox) => checkbox.validity.valueMissing)).toBe(true);
    await confirmation.check();

    const memberPage = await page.context().newPage();
    await memberPage.goto("/");
    await memberPage.getByRole("button", { name: "Sign out" }).click();
    await signIn(memberPage, `member-${suffix}@example.test`, password);
    await memberPage.goto(`/settings/permissions/${userIds[1]}?business=${businessId}`);
    await expect(memberPage).toHaveURL(/\/\?error=permission/);
    await expect(memberPage.getByRole("heading", { name: "Member access" })).toHaveCount(0);
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" &&
        new URL(response.url()).pathname.toLowerCase() === `/settings/permissions/${userIds[1]}`),
      page.getByRole("button", { name: "Confirm and save permissions" }).click(),
    ]);
    await expect(page).toHaveURL(/\/\?error=permission/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("No changes were saved");
    const membership = await admin.from("business_memberships").select("role, venue_id, department_id")
      .eq("business_id", businessId).eq("user_id", userIds[1]).single();
    expect(membership.error).toBeNull();
    expect(membership.data).toEqual({ role: "admin", venue_id: null, department_id: null });
    await memberPage.close();
  });
});

test("permissions UX: last owner is protected and successful self-demotion is reported", async ({ page }) => {
  await withPermissionFixtures("employee", async ({ suffix, password, userIds, businessId, venueIds, departmentIds }) => {
    const owner = createClient(apiUrl, anonKey, options);
    expect((await owner.auth.signInWithPassword({ email: `owner-${suffix}@example.test`, password })).error).toBeNull();
    await signIn(page, `owner-${suffix}@example.test`, password);
    await page.goto(`/settings/permissions/${userIds[0]}?business=${businessId}`);
    async function prepareDemotion() {
      await page.getByRole("button", { name: "Edit permissions" }).click();
      await page.getByRole("combobox", { name: "Business role" }).selectOption("employee");
      await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueIds[0]);
      await page.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentIds[0]);
      await page.getByRole("button", { name: "Review change" }).click();
      await page.getByLabel("I confirm this change to the member's business access.").check();
    }
    await prepareDemotion();
    await page.getByRole("button", { name: "Confirm and save permissions" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("A business must retain an owner");
    expect((await owner.rpc("assign_business_member_role", {
      p_business_id: businessId, p_user_id: userIds[1], p_role: "owner",
      p_venue_id: null, p_department_id: null,
    })).error).toBeNull();
    await prepareDemotion();
    await page.locator('input[name="user_id"]').evaluate((input) => { input.value = input.value.toUpperCase(); });
    const submitted = page.waitForRequest((request) => request.method() === "POST" &&
      new URL(request.url()).pathname === `/settings/permissions/${userIds[0]}`);
    await page.getByRole("button", { name: "Confirm and save permissions" }).click();
    expect((await submitted).postData()).toContain(userIds[0].toUpperCase());
    await expect(page.getByRole("status").filter({ hasText: "Your permissions were updated" })).toBeVisible();
    await expect(page.getByText("No changes were saved")).toHaveCount(0);
    const membership = await admin.from("business_memberships").select("role, venue_id, department_id")
      .eq("business_id", businessId).eq("user_id", userIds[0]).single();
    expect(membership.error).toBeNull();
    expect(membership.data).toEqual({ role: "employee", venue_id: venueIds[0], department_id: departmentIds[0] });
    await page.goto(`/settings/permissions?business=${businessId}`);
    await expect(page).toHaveURL(/\/\?error=permission/);
  });
});

test("permissions UX: cross-business details and forged member IDs are denied", async ({ page }) => {
  await withPermissionFixtures("employee", async ({ suffix, password, userIds, businessId, venueIds, scopes }) => {
    const outsideBusiness = randomUUID();
    const outsideVenue = randomUUID();
    const outsideEmail = `permissions-outside-${suffix}@example.test`;
    let outsideUser;
    try {
      const created = await admin.auth.admin.createUser({ email: outsideEmail, password, email_confirm: true });
      expect(created.error).toBeNull();
      outsideUser = created.data.user.id;
      expect((await admin.from("businesses").insert({ id: outsideBusiness, name: "Outside permissions cafe" })).error).toBeNull();
      expect((await admin.from("venues").insert({ id: outsideVenue, business_id: outsideBusiness, name: "Outside" })).error).toBeNull();
      expect((await admin.from("business_memberships").insert({
        business_id: outsideBusiness, user_id: outsideUser, role: "owner",
      })).error).toBeNull();

      await signIn(page, `owner-${suffix}@example.test`, password);
      const response = await page.goto(`/settings/permissions/${outsideUser}?business=${businessId}`);
      expect([200, 404]).toContain(response.status());
      await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
      await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toHaveAttribute("content", "noindex");
      await expect(page.getByRole("heading", { name: "Member access" })).toHaveCount(0);
      await expect(page.getByText(outsideEmail, { exact: true })).toHaveCount(0);
      await page.goto(`/settings/permissions?business=${businessId}&venue=${outsideVenue}`);
      await expect(page.getByRole("main").getByRole("alert")).toContainText("directory filters are unavailable");
      await expect(page.getByText(outsideEmail, { exact: true })).toHaveCount(0);
      await page.goto(`/settings/permissions?business=${businessId}&role=constructor&error=constructor`);
      await expect(page.getByRole("heading", { name: "Business permissions" })).toBeVisible();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("couldn't confirm the permission change");
      await expect(page.getByRole("combobox", { name: "Business role" })).toHaveValue("constructor");
      await page.goto(`/settings/permissions/${userIds[1]}?business=${businessId}`);
      await page.getByRole("button", { name: "Edit permissions" }).click();
      await page.getByRole("combobox", { name: "Business role" }).selectOption("general_manager");
      await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueIds[0]);
      await page.getByRole("button", { name: "Review change" }).click();
      await page.getByLabel("I confirm this change to the member's business access.").check();
      await page.locator('input[name="user_id"]').evaluate((input, value) => { input.value = value; }, outsideUser);
      await page.getByRole("button", { name: "Confirm and save permissions" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("That member is no longer available in this business");
      const [inside, outside] = await Promise.all([
        admin.from("business_memberships").select("role, venue_id, department_id")
          .eq("business_id", businessId).eq("user_id", userIds[1]).single(),
        admin.from("business_memberships").select("role, venue_id, department_id")
          .eq("business_id", outsideBusiness).eq("user_id", outsideUser).single(),
      ]);
      expect(inside.error).toBeNull();
      expect(outside.error).toBeNull();
      expect(inside.data).toEqual(scopes.employee);
      expect(outside.data).toEqual({ role: "owner", venue_id: null, department_id: null });
    } finally {
      await assertBusinessFixturesPreserved(admin, outsideBusiness);
      if (outsideUser) expect((await admin.auth.admin.deleteUser(outsideUser)).error).toBeNull();
    }
  });
});

test("permissions UX: an empty member list is distinct from filtered results", async ({ page }) => {
  await withPermissionFixtures("employee", async ({ suffix, password, userIds, businessId }) => {
    await signIn(page, `owner-${suffix}@example.test`, password);
    const removed = await admin.from("profiles").delete().in("id", userIds);
    expect(removed.error).toBeNull();
    await page.goto(`/settings/permissions?business=${businessId}`);
    await expect(page.getByText("No business members are available.")).toBeVisible();
    await expect(page.getByText("No members match these filters. Try resetting them.")).toHaveCount(0);
    await expect(page.getByText("0 members", { exact: true })).toBeVisible();
  });
});

test("permissions UX: loading and failed saves are announced and recoverable", async ({ page }) => {
  await withPermissionFixtures("employee", async ({ suffix, password, userIds, businessId, scopes }) => {
    await signIn(page, `owner-${suffix}@example.test`, password);
    let releaseNavigation;
    const navigationHeld = new Promise((resolve) => { releaseNavigation = resolve; });
    await page.route("**/settings/permissions**", async (route) => {
      const headers = route.request().headers();
      if (headers.rsc === "1" && !headers["next-router-prefetch"]) await navigationHeld;
      await route.continue();
    });
    try {
      await page.getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Permissions", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Loading…" })).toBeVisible();
      releaseNavigation();
      await expect(page.getByRole("heading", { name: "Business permissions" })).toBeVisible();
    } finally {
      releaseNavigation();
      await page.unrouteAll({ behavior: "wait" });
    }

    await page.goto(`/settings/permissions/${userIds[1]}?business=${businessId}`);
    async function prepareChange() {
      await page.getByRole("button", { name: "Edit permissions" }).click();
      await page.getByRole("combobox", { name: "Business role" }).selectOption("foh_manager");
      await page.getByRole("button", { name: "Review change" }).click();
      await page.getByLabel("I confirm this change to the member's business access.").check();
    }
    await prepareChange();
    let releaseSave;
    const saveHeld = new Promise((resolve) => { releaseSave = resolve; });
    await page.route("**/settings/permissions/**", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        await saveHeld;
        await route.fulfill({ status: 500, contentType: "text/plain", body: "Simulated outage" });
      } else {
        await route.continue();
      }
    });
    try {
      await page.getByRole("button", { name: "Confirm and save permissions" }).click();
      await expect(page.getByRole("button", { name: "Saving..." })).toBeDisabled();
    } finally {
      releaseSave();
    }
    await expect(page.getByRole("heading", { name: "Permissions unavailable" })).toBeFocused();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("check the current access before trying again");
    const unchanged = await admin.from("business_memberships").select("role, venue_id, department_id")
      .eq("business_id", businessId).eq("user_id", userIds[1]).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toEqual(scopes.employee);
    await page.unroute("**/settings/permissions/**");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Employee", { exact: true })).toBeVisible();
    await prepareChange();
    await page.getByRole("button", { name: "Confirm and save permissions" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Permissions updated." })).toBeVisible();
    await page.reload();
    await expect(page.getByText("FOH manager", { exact: true })).toBeVisible();
  });
});

test("permissions UX: stable filtered pagination returns to the selected page", async ({ page }) => {
  test.setTimeout(180_000);
  await withPermissionFixtures("employee", async ({ suffix, password, businessId, venueIds, departmentIds }) => {
    const added = [];
    try {
      for (let index = 0; index < 26; index += 1) {
        const name = `Directory Worker ${String(index).padStart(2, "0")}`;
        const created = await admin.auth.admin.createUser({
          email: `directory-worker-${index}-${suffix}@example.test`,
          password, email_confirm: true, user_metadata: { full_name: name },
        });
        expect(created.error).toBeNull();
        added.push(created.data.user.id);
      }
      expect((await admin.from("business_memberships").insert(added.map((userId) => ({
        business_id: businessId, user_id: userId, role: "employee",
        venue_id: venueIds[0], department_id: departmentIds[0],
      })))).error).toBeNull();
      await signIn(page, `owner-${suffix}@example.test`, password);
      await page.goto(`/settings/permissions?business=${businessId}`);
      const filters = page.getByRole("form", { name: "Member directory filters" });
      await filters.getByRole("searchbox", { name: "Search members" }).fill("Directory Worker");
      await filters.getByRole("combobox", { name: "Business role" }).selectOption("employee");
      await filters.getByRole("button", { name: "Apply filters" }).click();
      await expect(page.getByText("26 members of 28", { exact: true })).toBeVisible();
      await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
      await page.getByRole("navigation", { name: "Member pages" }).getByRole("link", { name: "Next" }).click();
      await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "View access for Directory Worker 25", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Directory Worker 25", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Back to members" }).click();
      await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
      await expect(filters.getByRole("searchbox", { name: "Search members" })).toHaveValue("Directory Worker");
      await expect(filters.getByRole("combobox", { name: "Business role" })).toHaveValue("employee");
    } finally {
      for (const user of added) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
    }
  });
});

test("permissions UX: five-width accessible directory, detail and confirmation", async ({ page }) => {
  test.setTimeout(300_000);
  await withPermissionFixtures("employee", async ({ suffix, password, userIds, businessId }) => {
    const screenshots = process.env.BUTTERBOX_TEST_SCREENSHOT_DIR;
    await signIn(page, `owner-${suffix}@example.test`, password);
    async function checkLayout(label) {
      await expect(page).toHaveTitle(/Butterbox/);
      const layout = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const overflow = [...document.querySelectorAll("body *")].filter((element) => {
          const box = element.getBoundingClientRect();
          return box.right > width + 1 || (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1);
        }).slice(0, 20).map((element) => ({
          tag: element.tagName, className: element.getAttribute("class"),
          width: element.clientWidth, scrollWidth: element.scrollWidth,
        }));
        return { width, scrollWidth: document.documentElement.scrollWidth, overflow };
      });
      expect(layout.scrollWidth, `${label}: horizontal page overflow ${JSON.stringify(layout.overflow)}`)
        .toBeLessThanOrEqual(layout.width);
      const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
      const violations = results.violations
        .map((item) => `${item.impact} ${item.id}: ${item.nodes.map((node) => node.target.join(" ")).join(", ")}`);
      expect(violations, `${label}: accessibility violations`).toEqual([]);
    }

    for (const width of [375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/settings/permissions?business=${businessId}`);
      await expect(page.getByRole("heading", { name: "Business permissions" })).toBeVisible();
      await checkLayout(`${width} directory`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-directory-${width}.png`, fullPage: true });
      const link = page.getByRole("link", { name: `View access for member-${suffix}`, exact: true });
      await link.focus();
      await expect(link).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(link).not.toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(link).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/settings/permissions/${userIds[1]}`));
      await expect(page.getByRole("heading", { name: "Member access", exact: true })).toBeVisible();
      await checkLayout(`${width} detail`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-detail-${width}.png`, fullPage: true });
      const edit = page.getByRole("button", { name: "Edit permissions" });
      await edit.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Edit permissions", exact: true })).toBeFocused();
      await checkLayout(`${width} edit`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-edit-${width}.png`, fullPage: true });
      await page.getByRole("combobox", { name: "Business role" }).selectOption("foh_manager");
      const review = page.getByRole("button", { name: "Review change" });
      await review.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Review access change" })).toBeFocused();
      await checkLayout(`${width} confirmation`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-confirmation-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Discard changes" }).click();
      await expect(edit).toBeFocused();
    }
  });
});

test("employee profiles and filtered team directory", async ({ page }) => {
  await withPermissionFixtures("employee", async ({ suffix, password, businessId, venueIds, departmentIds }) => {
    await signIn(page, `owner-${suffix}@example.test`, password);
    await page.getByRole("link", { name: "People", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your people", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Add person", exact: true }).click();
    const newEmployee = page.getByRole("region", { name: "New employee", exact: true });
    await newEmployee.getByRole("textbox", { name: "Name", exact: true }).fill("Profile worker");
    await newEmployee.getByRole("textbox", { name: "Preferred contact email", exact: true }).fill("profile@example.test");
    await newEmployee.getByRole("textbox", { name: "Job role", exact: true }).fill("Server");
    await newEmployee.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentIds[0]);
    await newEmployee.getByRole("button", { name: "Add employee", exact: true })
      .evaluate((button) => { button.click(); button.click(); });
    await expect(page.getByRole("heading", { name: "Profile worker", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Person added." })).toBeVisible();
    const employee = await admin.from("employees").select("id")
      .eq("business_id", businessId).eq("name", "Profile worker").single();
    expect(employee.error).toBeNull();
    expect((await admin.from("shifts").insert({
      business_id: businessId, venue_id: venueIds[0], department_id: departmentIds[0],
      employee_id: employee.data.id, role_title: "Server",
      starts_at: "2031-06-02T09:00:00Z", ends_at: "2031-06-02T10:00:00Z",
    })).error).toBeNull();
    const overview = page.getByRole("region", { name: "Overview", exact: true });
    await expect(overview.getByRole("textbox", { name: "Name", exact: true })).toHaveCount(0);
    await overview.getByRole("button", { name: "Edit overview" }).click();
    await overview.getByRole("textbox", { name: "Name", exact: true }).fill("Discarded change");
    await overview.getByRole("button", { name: "Cancel", exact: true }).click();
    await overview.getByRole("button", { name: "Discard changes" }).click();
    await expect(overview.getByRole("button", { name: "Edit overview" })).toBeFocused();
    expect((await admin.from("employees").select("name").eq("id", employee.data.id).single()).data.name)
      .toBe("Profile worker");
    await overview.getByRole("button", { name: "Edit overview" }).click();
    await overview.getByRole("textbox", { name: "Name", exact: true }).fill("Archived worker");
    await overview.getByRole("textbox", { name: "Preferred contact email", exact: true }).fill("updated@example.test");
    await overview.getByRole("combobox", { name: "Employment type", exact: true }).selectOption("part_time");
    await overview.getByRole("button", { name: "Save employee" }).click();
    await expect(page.getByRole("heading", { name: "Archived worker", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("updated@example.test", { exact: true })).toBeVisible();
    const employment = page.getByRole("region", { name: "Employment", exact: true });
    await employment.getByRole("button", { name: "Archive person" }).click();
    const archive = page.getByRole("form", { name: "Archive Archived worker" });
    await archive.getByLabel("I confirm this status change.").check();
    await archive.getByRole("button", { name: "Confirm archive" }).click();
    await expect(page.getByText("Person archived. Existing history is preserved.", { exact: true })).toBeVisible();
    const savedEmployee = await admin.from("employees").select("name, email, employment_type, active")
      .eq("id", employee.data.id).single();
    expect(savedEmployee.error).toBeNull();
    expect(savedEmployee.data).toEqual({
      name: "Archived worker", email: "updated@example.test", employment_type: "part_time", active: false,
    });
    const history = await admin.from("shifts").select("id").eq("employee_id", employee.data.id);
    expect(history.error).toBeNull();
    expect(history.data).toHaveLength(1);
    await page.getByRole("link", { name: "Back to people" }).click();
    const filters = page.getByRole("form", { name: "Directory filters" });
    await filters.getByRole("searchbox", { name: "Search team" }).fill("archived");
    await filters.getByRole("textbox", { name: "Role (exact title or qualification)" }).fill("Server");
    await filters.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentIds[0]);
    await filters.getByRole("combobox", { name: "Status", exact: true }).selectOption("archived");
    await filters.getByRole("button", { name: "Filter team" }).click();
    await expect(page.getByRole("list", { name: "People directory" }).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("link", { name: "View profile for Archived worker" }).click();
    await expect(page.getByRole("heading", { name: "Archived worker", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to people" }).click();
    await expect(filters.getByRole("searchbox", { name: "Search team" })).toHaveValue("archived");
    await expect(filters.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("archived");
    await filters.getByRole("combobox", { name: "Status", exact: true }).selectOption("active");
    await Promise.all([
      page.waitForURL(/status=active/),
      filters.getByRole("button", { name: "Filter team" }).click(),
    ]);
    await expect(page.getByText("No people match these filters.", { exact: true })).toBeVisible();
    await filters.getByRole("searchbox", { name: "Search team" }).fill("");
    await filters.getByRole("textbox", { name: "Role (exact title or qualification)" }).fill("");
    await filters.getByRole("combobox", { name: "Department", exact: true }).selectOption("");
    await filters.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueIds[1]);
    await filters.getByRole("button", { name: "Filter team" }).click();
    await expect(page.getByRole("link", { name: "View profile for Other venue worker" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View profile for Archived worker" })).toHaveCount(0);
    await page.goto(`/roster?department=${departmentIds[0]}`);
    await expect(page.locator('select[name="employee_id"] option').filter({ hasText: "Archived worker" })).toHaveCount(0);
    await page.goto(`/people/${employee.data.id}?business=${businessId}&venue=${venueIds[0]}`);
    await employment.getByRole("button", { name: "Reactivate person" }).click();
    const reactivate = page.getByRole("form", { name: "Reactivate Archived worker" });
    await reactivate.getByLabel("I confirm this status change.").check();
    await reactivate.getByRole("button", { name: "Confirm reactivation" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Person reactivated." })).toBeVisible();
    expect((await admin.from("employees").select("active").eq("id", employee.data.id).single()).data.active).toBe(true);
    expect((await admin.from("shifts").select("id").eq("employee_id", employee.data.id)).data).toHaveLength(1);
  });
});

test("People directory and profiles preserve scoped access, concurrency and five viewport layouts", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await withPermissionFixtures("foh_manager", async ({ suffix, password, userIds, businessId, venueIds, departmentIds, scopes }) => {
    const employees = await admin.from("employees").select("id, name")
      .eq("business_id", businessId).in("name", ["FOH directory worker", "BOH directory worker"]);
    expect(employees.error).toBeNull();
    const foh = employees.data.find((item) => item.name === "FOH directory worker");
    const boh = employees.data.find((item) => item.name === "BOH directory worker");
    expect(foh).toBeTruthy();
    expect(boh).toBeTruthy();
    expect((await admin.from("employee_departments").insert({
      business_id: businessId, employee_id: boh.id, department_id: departmentIds[0],
    })).error).toBeNull();
    const longEmployeeId = randomUUID();
    const longName = "Long".repeat(25);
    const longEmail = `${"long".repeat(16)}@${"domain".repeat(10)}.example.test`;
    expect((await admin.from("employees").insert({
      id: longEmployeeId, business_id: businessId, venue_id: venueIds[0], department_id: departmentIds[0],
      name: longName, email: longEmail, role_title: "Server",
    })).error).toBeNull();
    const directory = `/people?business=${businessId}&venue=${venueIds[0]}`;
    const profile = `/people/${foh.id}?business=${businessId}&venue=${venueIds[0]}`;
    const screenshots = process.env.BUTTERBOX_TEST_SCREENSHOT_DIR;
    await signIn(page, `owner-${suffix}@example.test`, password);

    async function checkLayout(label) {
      const layout = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const overflow = [...document.querySelectorAll("body *")].filter((element) => {
          const box = element.getBoundingClientRect();
          return box.right > width + 1 || (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1);
        }).slice(0, 20).map((element) => ({
          tag: element.tagName, className: element.getAttribute("class"),
          width: element.clientWidth, scrollWidth: element.scrollWidth,
        }));
        return { width, scrollWidth: document.documentElement.scrollWidth, overflow };
      });
      expect(layout.scrollWidth, `${label}: horizontal page overflow ${JSON.stringify(layout.overflow)}`)
        .toBeLessThanOrEqual(layout.width);
      const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
      const serious = results.violations.filter((item) => ["serious", "critical"].includes(item.impact))
        .map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(" ")).join(", ")}`);
      expect(serious, `${label}: serious or critical accessibility violations`).toEqual([]);
    }

    for (const width of [375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(directory);
      await expect(page.getByRole("heading", { name: "Your people" })).toBeVisible();
      await expect(page.getByText("3 visible active people in this venue · 0 visible invitations awaiting action"))
        .toBeVisible();
      await checkLayout(`${width} directory`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-directory-${width}.png`, fullPage: true });

      const filters = page.getByRole("form", { name: "Directory filters" });
      await filters.getByRole("searchbox", { name: "Search team" }).fill("no-such-person");
      await filters.getByRole("searchbox", { name: "Search team" }).press("Enter");
      await expect(page.getByText("No people match these filters.", { exact: true })).toBeVisible();
      await expect(page.getByText("3 visible active people in this venue · 0 visible invitations awaiting action"))
        .toBeVisible();
      await checkLayout(`${width} filtered empty`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-empty-${width}.png`, fullPage: true });

      await page.goto(`/people/${longEmployeeId}?business=${businessId}&venue=${venueIds[0]}`);
      await expect(page.getByRole("heading", { name: longName, exact: true })).toBeVisible();
      await expect(page.getByText(longEmail, { exact: true })).toBeVisible();
      await checkLayout(`${width} long profile`);

      await page.goto(profile);
      await expect(page.getByRole("heading", { name: "FOH directory worker", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "FOH directory worker", exact: true }).locator(".."))
        .toContainText("Primary role: Not set or unavailable · Casual · Not invited");
      const overview = page.getByRole("region", { name: "Overview" });
      await expect(overview.getByRole("textbox", { name: "Name", exact: true })).toHaveCount(0);
      await checkLayout(`${width} profile`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-profile-${width}.png`, fullPage: true });

      await overview.getByRole("button", { name: "Edit overview" }).click();
      await checkLayout(`${width} edit`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-edit-${width}.png`, fullPage: true });
      await overview.getByRole("textbox", { name: "Name", exact: true }).fill("");
      await overview.locator("form").evaluate((form) => { form.noValidate = true; });
      await overview.getByRole("button", { name: "Save employee" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not save the employee");
      await checkLayout(`${width} validation error`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-validation-${width}.png`, fullPage: true });
      await overview.getByRole("button", { name: "Edit overview" }).click();
      await overview.getByRole("textbox", { name: "Name", exact: true }).fill("Unsaved mobile change");
      await overview.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(overview.getByRole("group", { name: "Discard unsaved changes" })).toBeVisible();
      await checkLayout(`${width} discard confirmation`);
      await overview.getByRole("button", { name: "Discard changes" }).click();
      await expect(overview.getByRole("button", { name: "Edit overview" })).toBeFocused();

      const employment = page.getByRole("region", { name: "Employment", exact: true });
      await employment.getByRole("button", { name: "Archive person" }).click();
      const archive = page.getByRole("form", { name: "Archive FOH directory worker" });
      await expect(archive.getByLabel("I confirm this status change.")).not.toBeChecked();
      await checkLayout(`${width} archive confirmation`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-confirmation-${width}.png`, fullPage: true });
      await employment.getByRole("button", { name: "Cancel", exact: true }).click();
    }

    await page.goto(directory);
    const keyboardSearch = page.getByRole("searchbox", { name: "Search team" });
    await keyboardSearch.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("combobox", { name: "Venue", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(keyboardSearch).toBeFocused();
    await keyboardSearch.fill("FOH directory");
    await page.keyboard.press("Enter");
    const profileLink = page.getByRole("link", { name: "View profile for FOH directory worker" });
    await profileLink.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "FOH directory worker", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Roles & departments", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#roles$/);
    const keyboardOverview = page.getByRole("region", { name: "Overview" });
    await keyboardOverview.getByRole("button", { name: "Edit overview" }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(keyboardOverview.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Keyboard saved profile");
    for (let index = 0; index < 5; index += 1) await page.keyboard.press("Tab");
    await expect(keyboardOverview.getByRole("button", { name: "Save employee" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Keyboard saved profile" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Keyboard saved profile" })).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(directory);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await checkLayout("reduced motion directory");
    await page.emulateMedia({ reducedMotion: "no-preference" });

    const secondContext = await browser.newContext({ baseURL: appUrl });
    const secondPage = await secondContext.newPage();
    const managerContext = await browser.newContext({ baseURL: appUrl });
    const managerPage = await managerContext.newPage();
    try {
      await signIn(secondPage, `owner-${suffix}@example.test`, password);
      await page.goto(profile);
      await secondPage.goto(profile);
      const firstEditor = page.getByRole("region", { name: "Overview" });
      const secondEditor = secondPage.getByRole("region", { name: "Overview" });
      await firstEditor.getByRole("button", { name: "Edit overview" }).click();
      await secondEditor.getByRole("button", { name: "Edit overview" }).click();
      await firstEditor.getByRole("textbox", { name: "Name", exact: true }).fill("First saved profile");
      await secondEditor.getByRole("textbox", { name: "Name", exact: true }).fill("Stale profile");
      await firstEditor.getByRole("button", { name: "Save employee" }).click();
      await expect(page.getByRole("heading", { name: "First saved profile" })).toBeVisible();
      await secondEditor.getByRole("button", { name: "Save employee" }).click();
      await expect(secondPage.getByRole("main").getByRole("alert"))
        .toContainText("This profile changed while you were editing");
      const persisted = await admin.from("employees").select("name").eq("id", foh.id).single();
      expect(persisted.error).toBeNull();
      expect(persisted.data.name).toBe("First saved profile");

      await signIn(managerPage, `member-${suffix}@example.test`, password);
      await managerPage.goto(directory);
      await expect(managerPage.getByRole("link", { name: "View profile for BOH directory worker" })).toBeVisible();
      await managerPage.getByRole("link", { name: "View profile for BOH directory worker" }).click();
      await expect(managerPage.getByText("private-1@example.test", { exact: true })).toHaveCount(0);
      await expect(managerPage.getByRole("region", { name: "Account & invitations" })).toHaveCount(0);
      await managerPage.goto(`/people/${boh.id}?business=${businessId}&venue=${venueIds[1]}`);
      await expect(managerPage.getByText("private-1@example.test", { exact: true })).toHaveCount(0);

      await managerPage.goto(profile);
      const managerEditor = managerPage.getByRole("region", { name: "Overview" });
      await managerEditor.getByRole("button", { name: "Edit overview" }).click();
      await managerEditor.getByRole("textbox", { name: "Name", exact: true }).fill("Tampered update");
      await managerEditor.locator('select[name="department_id"]').evaluate((select, id) => {
        const option = document.createElement("option");
        option.value = id;
        select.append(option);
        select.value = id;
      }, departmentIds[1]);
      await managerEditor.getByRole("button", { name: "Save employee" }).click();
      await expect(managerPage.getByRole("main").getByRole("alert")).toContainText("cannot manage");
      expect((await admin.from("employees").select("name").eq("id", foh.id).single()).data.name)
        .toBe("First saved profile");

      for (const role of ["boh_manager", "general_manager", "employee", "admin", "owner"]) {
        const scope = role === "admin" ? { role, venue_id: null, department_id: null } : scopes[role];
        expect((await admin.from("business_memberships").update(scope)
          .eq("business_id", businessId).eq("user_id", userIds[1])).error).toBeNull();
        await managerPage.goto(profile);
        if (role === "owner" || role === "admin") {
          await expect(managerPage.getByRole("heading", { name: "First saved profile" })).toBeVisible();
          await expect(managerPage.getByRole("button", { name: "Edit overview" })).toBeVisible();
          if (role === "admin") {
            await expect(managerPage.getByRole("button", { name: "Edit account link" })).toHaveCount(0);
            await expect(managerPage.getByRole("button", { name: "Manage shared profiles" })).toHaveCount(0);
          }
        } else {
          await expect(managerPage.getByRole("heading", { name: "First saved profile" })).toHaveCount(0);
        }
        if (role === "boh_manager") {
          await managerPage.goto(`/people/${boh.id}?business=${businessId}&venue=${venueIds[0]}`);
          await expect(managerPage.getByRole("heading", { name: "BOH directory worker" })).toBeVisible();
          await expect(managerPage.getByRole("button", { name: "Edit overview" })).toBeVisible();
        }
        if (role === "general_manager") {
          await managerPage.goto(`/people?business=${businessId}&venue=${venueIds[1]}`);
          await managerPage.getByRole("link", { name: "View profile for Other venue worker" }).click();
          await expect(managerPage.getByRole("heading", { name: "Other venue worker" })).toBeVisible();
          await expect(managerPage.getByRole("button", { name: "Edit overview" })).toBeVisible();
        }
      }
    } finally {
      await secondContext.close();
      await managerContext.close();
    }

    const [outsideBusiness, outsideVenue, outsideDepartment, outsideEmployee] =
      Array.from({ length: 4 }, () => randomUUID());
    expect((await admin.from("businesses").insert({ id: outsideBusiness, name: "Outside private People" })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: outsideVenue, business_id: outsideBusiness, name: "Outside venue",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "Outside department",
    })).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: outsideEmployee, business_id: outsideBusiness, venue_id: outsideVenue, department_id: outsideDepartment,
      name: "Outside private employee", email: "outside-private@example.test", role_title: "Server",
    })).error).toBeNull();
    for (const path of [
      `/people/${outsideEmployee}?business=${businessId}&venue=${venueIds[0]}`,
      `/people/not-a-valid-employee?business=${businessId}&venue=${venueIds[0]}`,
    ]) {
      const response = await page.goto(path);
      expect([200, 404]).toContain(response.status());
      await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
      await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toHaveCount(1);
      await expect(page.getByText("Outside private employee", { exact: true })).toHaveCount(0);
      await expect(page.getByText("outside-private@example.test", { exact: true })).toHaveCount(0);
    }
    await page.goto(`${directory}&q=Outside%20private`);
    await expect(page.getByText("No people match these filters.", { exact: true })).toBeVisible();
    await page.goto(`${directory}&department=${outsideDepartment}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("filters are invalid or unavailable");
    await expect(page.getByText("Outside private employee", { exact: true })).toHaveCount(0);
    await assertBusinessFixturesPreserved(admin, outsideBusiness);

    const emptyVenue = randomUUID();
    const emptyDepartment = randomUUID();
    expect((await admin.from("venues").insert({
      id: emptyVenue, business_id: businessId, name: "Empty venue",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: emptyDepartment, business_id: businessId, venue_id: emptyVenue, name: "Empty department",
    })).error).toBeNull();
    await page.goto(`/people?business=${businessId}&venue=${emptyVenue}`);
    await expect(page.getByText("No people are in this venue yet.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add person" })).toBeVisible();
    await checkLayout("empty venue");
    await page.goto(`${directory}&q=NoSuchPerson&page=10`);
    await expect(page.getByText("This page is no longer available.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Return to the first page" })).toBeVisible();

    const bulk = Array.from({ length: 1001 }, (_, index) => ({
      id: randomUUID(), business_id: businessId, venue_id: venueIds[0], department_id: departmentIds[0],
      name: `Directory bulk ${String(index).padStart(4, "0")}`, role_title: "Server",
    }));
    try {
      for (let offset = 0; offset < bulk.length; offset += 200) {
        expect((await admin.from("employees").insert(bulk.slice(offset, offset + 200))).error).toBeNull();
      }
      await page.goto(`${directory}&q=Directory%20bulk`);
      await expect(page.getByRole("status").filter({ hasText: "1001 people match" })).toBeVisible();
      await expect(page.getByRole("list", { name: "People directory" }).getByRole("listitem")).toHaveCount(25);
      await page.getByRole("link", { name: "Next page" }).click();
      await expect(page).toHaveURL(/page=2/);
      await page.goto(`${directory}&q=Directory%20bulk&page=41`);
      await expect(page.getByRole("list", { name: "People directory" }).getByRole("listitem")).toHaveCount(1);
      await expect(page.getByRole("link", { name: "View profile for Directory bulk 1000" })).toBeVisible();
    } finally {
      for (let offset = 0; offset < bulk.length; offset += 200) {
        expect((await admin.from("employees").delete().in("id", bulk.slice(offset, offset + 200).map((item) => item.id))).error)
          .toBeNull();
      }
    }
  });
});

test.describe("People public demonstration mode", () => {
  test.use({ serviceWorkers: "block" });

  test("profile and direct invitation actions stay unavailable", async ({ page, context }) => {
    test.skip(process.env.BUTTERBOX_TEST_PUBLIC_MODE !== "yes", "Requires an isolated public-mode test app.");
    expect(new URL(apiUrl).port).not.toBe("57421");
    expect(new URL(appUrl).port).not.toBe("3137");
    const manifestPath = process.env.BUTTERBOX_TEST_PUBLIC_MODE_MANIFEST;
    expect(manifestPath).toBeTruthy();
    await context.route("http://127.0.0.1:57421/**", (route) => route.abort());

    await withPermissionFixtures("foh_manager", async ({
      suffix, password, userIds, businessId, venueIds, scopes,
    }) => {
      const employee = await admin.from("employees").select("id")
        .eq("business_id", businessId).eq("name", "FOH directory worker").single();
      expect(employee.error).toBeNull();
      await signIn(page, `owner-${suffix}@example.test`, password);
      const directory = `/people?business=${businessId}&venue=${venueIds[0]}`;
      await page.goto(directory);
      await expect(page.getByRole("list", { name: "People directory" }).getByRole("listitem")).toHaveCount(2);
      await page.goto(`/people/${employee.data.id}?business=${businessId}&venue=${venueIds[0]}`);
      await expect(page.getByRole("complementary", { name: "Synthetic showcase notice" })).toBeVisible();
      await expect(page.getByText("Email invitations are unavailable in the public demo.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Manage invitation" })).toHaveCount(0);

      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      for (const name of ["createStaffInvitationAction", "resendStaffInvitationAction"]) {
        const actions = Object.entries(manifest.node).filter(([, action]) => action.exportedName === name);
        expect(actions).toHaveLength(1);
        const response = await page.request.post("/", {
          headers: { origin: appUrl },
          multipart: { [`$ACTION_ID_${actions[0][0]}`]: "" },
          maxRedirects: 0,
        });
        expect(response.status()).toBe(303);
        expect(response.headers().location).toBe("/people?error=invite-disabled");
      }

      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await signIn(page, `member-${suffix}@example.test`, password);
      for (const [role, visible, hidden] of [
        ["foh_manager", "FOH directory worker", "BOH directory worker"],
        ["boh_manager", "BOH directory worker", "FOH directory worker"],
      ]) {
        expect((await admin.from("business_memberships").update(scopes[role])
          .eq("business_id", businessId).eq("user_id", userIds[1])).error).toBeNull();
        await page.goto(directory);
        const people = page.getByRole("list", { name: "People directory" });
        await expect(people.getByRole("listitem")).toHaveCount(1);
        await expect(people.getByRole("link", { name: `View profile for ${visible}`, exact: true })).toBeVisible();
        await expect(people.getByRole("link", { name: `View profile for ${hidden}`, exact: true })).toHaveCount(0);
      }
    });
  });
});

test("People loading and failed saves are announced and recover without writing", async ({ page }) => {
  test.setTimeout(180_000);
  await withPermissionFixtures("employee", async ({ suffix, password, businessId, venueIds }) => {
    const employee = await admin.from("employees").select("id").eq("business_id", businessId)
      .eq("name", "FOH directory worker").single();
    expect(employee.error).toBeNull();
    await signIn(page, `owner-${suffix}@example.test`, password);

    let releaseNavigation;
    const navigationHeld = new Promise((resolve) => { releaseNavigation = resolve; });
    await page.route("**/people**", async (route) => {
      const headers = route.request().headers();
      if (headers.rsc === "1" && !headers["next-router-prefetch"]) await navigationHeld;
      await route.continue();
    });
    try {
      await page.getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "People", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Loading…" })).toBeVisible();
      releaseNavigation();
      await expect(page.getByRole("heading", { name: "Your people" })).toBeVisible();
    } finally {
      releaseNavigation();
      await page.unrouteAll({ behavior: "wait" });
    }

    await page.goto(`/people/${employee.data.id}?business=${businessId}&venue=${venueIds[0]}`);
    const overview = page.getByRole("region", { name: "Overview" });
    await overview.getByRole("button", { name: "Edit overview" }).click();
    await overview.getByRole("textbox", { name: "Name", exact: true }).fill("Unsent profile");
    await page.route("**/people/**", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        await route.fulfill({ status: 500, contentType: "text/plain", body: "Simulated outage" });
      } else {
        await route.continue();
      }
    });
    await overview.getByRole("button", { name: "Save employee" }).click();
    const failure = page.getByRole("alert").filter({ hasText: "Something went wrong" });
    await expect(failure).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeFocused();
    expect((await admin.from("employees").select("name").eq("id", employee.data.id).single()).data.name)
      .toBe("FOH directory worker");
    await page.unroute("**/people/**");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "FOH directory worker" })).toBeVisible();
    await overview.getByRole("button", { name: "Edit overview" }).click();
    await overview.getByRole("textbox", { name: "Name", exact: true }).fill("Recovered profile");
    await overview.getByRole("button", { name: "Save employee" }).click();
    await expect(page.getByRole("heading", { name: "Recovered profile" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Recovered profile" })).toBeVisible();
  });
});

test("People section editors reject stale department, qualification and account saves", async ({ page }) => {
  test.setTimeout(180_000);
  await withPermissionFixtures("foh_manager", async ({ suffix, password, userIds, businessId, venueIds, departmentIds }) => {
    const employee = await admin.from("employees").select("id").eq("business_id", businessId)
      .eq("name", "FOH directory worker").single();
    expect(employee.error).toBeNull();
    const [barista, runner] = [randomUUID(), randomUUID()];
    expect((await admin.from("job_roles").insert([
      { id: barista, business_id: businessId, venue_id: venueIds[0], department_id: departmentIds[0], name: "Barista" },
      { id: runner, business_id: businessId, venue_id: venueIds[0], department_id: departmentIds[0], name: "Runner" },
    ])).error).toBeNull();
    await signIn(page, `owner-${suffix}@example.test`, password);
    const second = await page.context().newPage();
    const url = `/people/${employee.data.id}?business=${businessId}&venue=${venueIds[0]}`;
    try {
      await page.goto(url);
      await second.goto(url);
      await page.getByRole("button", { name: "Edit departments" }).click();
      await second.getByRole("button", { name: "Edit departments" }).click();
      let firstDepartments = page.getByRole("form", { name: "Departments for FOH directory worker" });
      await firstDepartments.getByRole("checkbox", { name: "Back of House" }).check();
      const rolesSection = page.getByRole("region", { name: "Roles & departments" });
      await rolesSection.getByRole("button", { name: "Cancel", exact: true }).click();
      await rolesSection.getByRole("button", { name: "Discard changes" }).click();
      const beforeSave = await admin.from("employee_departments").select("department_id")
        .eq("employee_id", employee.data.id);
      expect(beforeSave.error).toBeNull();
      expect(beforeSave.data.map((item) => item.department_id)).toEqual([departmentIds[0]]);
      await page.getByRole("button", { name: "Edit departments" }).click();
      firstDepartments = page.getByRole("form", { name: "Departments for FOH directory worker" });
      await firstDepartments.getByRole("checkbox", { name: "Back of House" }).check();
      const { holdLock } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
      const gate = await holdLock(
        `select id from public.employees where id = '${employee.data.id}'::uuid for update`, employee.data.id,
      );
      let pendingSave;
      try {
        pendingSave = firstDepartments.getByRole("button", { name: "Save departments" }).click({ noWaitAfter: true });
        await expect(firstDepartments.getByRole("button", { name: "Saving..." })).toBeDisabled();
      } finally {
        await gate.release(false);
        await pendingSave;
      }
      await expect(page.getByRole("main").getByRole("status")).toHaveText("Department membership saved.");
      await second.getByRole("form", { name: "Departments for FOH directory worker" })
        .getByRole("button", { name: "Save departments" }).click();
      await expect(second.getByRole("main").getByRole("alert")).toContainText("This section changed while you were editing");
      const departments = await admin.from("employee_departments").select("department_id").eq("employee_id", employee.data.id);
      expect(departments.error).toBeNull();
      expect(departments.data.map((item) => item.department_id).sort()).toEqual([departmentIds[0], departmentIds[1]].sort());

      await page.goto(url);
      await second.goto(url);
      await page.getByRole("button", { name: "Edit qualified roles in Front of House" }).click();
      await second.getByRole("button", { name: "Edit qualified roles in Front of House" }).click();
      const firstRoles = page.getByRole("form", { name: "Eligible roles for FOH directory worker in Front of House" });
      const secondRoles = second.getByRole("form", { name: "Eligible roles for FOH directory worker in Front of House" });
      await firstRoles.getByRole("checkbox", { name: "Barista" }).check();
      await secondRoles.getByRole("checkbox", { name: "Runner" }).check();
      await firstRoles.getByRole("button", { name: "Save eligible roles" }).click();
      await expect(page.getByRole("main").getByRole("status")).toHaveText("Eligible roles saved.");
      await secondRoles.getByRole("button", { name: "Save eligible roles" }).click();
      await expect(second.getByRole("main").getByRole("alert")).toContainText("This section changed while you were editing");
      const qualification = await admin.from("employee_job_roles").select("job_role_id").eq("employee_id", employee.data.id);
      expect(qualification.error).toBeNull();
      expect(qualification.data).toEqual([{ job_role_id: barista }]);
      await page.getByRole("button", { name: "Edit primary role" }).click();
      const primary = page.getByRole("form", { name: "Primary role for FOH directory worker" });
      await primary.getByRole("combobox", { name: "Primary qualified role" }).selectOption(barista);
      await primary.getByRole("button", { name: "Set primary role" }).click();
      await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Primary role saved." })).toBeVisible();
      await page.getByRole("link", { name: "Back to people" }).click();
      const filters = page.getByRole("form", { name: "Directory filters" });
      await filters.getByRole("combobox", { name: "Sort by" }).selectOption("role");
      await filters.getByRole("button", { name: "Filter team" }).click();
      await expect(page.getByRole("list", { name: "People directory" }).getByRole("listitem").first())
        .toContainText("FOH directory worker");

      await page.goto(url);
      await second.goto(url);
      await page.getByRole("button", { name: "Edit account link" }).click();
      await second.getByRole("button", { name: "Edit account link" }).click();
      const firstAccount = page.getByRole("form", { name: "Account for FOH directory worker" });
      await firstAccount.getByRole("combobox", { name: "Linked business member" }).selectOption(userIds[1]);
      await firstAccount.getByRole("button", { name: "Save account link" }).click();
      await expect(page.getByRole("main").getByRole("status")).toHaveText("Account link saved.");
      await second.getByRole("form", { name: "Account for FOH directory worker" })
        .getByRole("button", { name: "Save account link" }).click();
      await expect(second.getByRole("main").getByRole("alert")).toContainText("This profile changed while you were editing");
      const account = await admin.from("employees").select("auth_user_id").eq("id", employee.data.id).single();
      expect(account.error).toBeNull();
      expect(account.data.auth_user_id).toBe(userIds[1]);
    } finally {
      await second.close();
    }
  });
});

test("employment metadata keeps dated history, unknown classifications and scoped access", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await withPermissionFixtures("foh_manager", async ({ suffix, password, userIds, businessId, venueIds }) => {
    const employees = await admin.from("employees").select("id, name")
      .eq("business_id", businessId).in("name", ["FOH directory worker", "BOH directory worker"]);
    expect(employees.error).toBeNull();
    const fohEmployee = employees.data.find((employee) => employee.name === "FOH directory worker");
    const bohEmployee = employees.data.find((employee) => employee.name === "BOH directory worker");
    expect(fohEmployee).toBeTruthy();
    expect(bohEmployee).toBeTruthy();
    const peopleUrl = `/people?venue=${venueIds[0]}&business=${businessId}`;
    const metadataUrl = `/people/${fohEmployee.id}/employment?venue=${venueIds[0]}&business=${businessId}`;
    const futureDate = `${new Date().getUTCFullYear() + 2}-01-01`;
    const longClassification = "L".repeat(100);
    const longReference = "R".repeat(255);
    const contexts = [];
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await signIn(page, `owner-${suffix}@example.test`, password);
      await page.goto(peopleUrl);
      await page.getByRole("link", { name: "View profile for FOH directory worker" }).click();
      const profile = page.getByRole("region", { name: "Employment", exact: true });
      await expect(profile).toContainText("classification is unknown");
      await profile.getByRole("link", { name: "Review employment metadata" }).click();
      await expect(page.getByRole("heading", { name: "Employment metadata for FOH directory worker" })).toBeVisible();
      const current = page.getByRole("region", { name: "Current employment metadata" });
      await expect(current).toContainText("Employment basis and classification are unknown");
      let form = page.getByRole("form", { name: "Record employment metadata" });
      await expect(form.getByLabel("Employment basis")).toHaveValue("unknown");
      await expect(form.getByLabel("Classification (optional)")).toHaveValue("");
      findingsMustBeEmpty(await accessibilityFindings(page, "employment metadata mobile"));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      async function submitDetails(targetPage) {
        await Promise.all([
          targetPage.waitForResponse((response) =>
            response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/employment")),
          targetPage.getByRole("button", { name: "Record employment details" }).click(),
        ]);
        await expect(targetPage.getByRole("main").getByRole("status"))
          .toHaveText("Employment metadata recorded.");
        await targetPage.goto(metadataUrl);
      }

      await form.getByLabel("Effective date").fill("2020-01-01");
      await form.getByLabel("Employment basis").selectOption("part_time");
      await form.getByLabel("Award reference (optional)").fill("Award reference A");
      await form.getByLabel("Contract reference (optional)").fill(longReference);
      await submitDetails(page);
      await expect(current).toContainText("Employment basis: Part time");
      await expect(current).toContainText("Classification: Unknown");
      await expect(current).toContainText("Award reference: Award reference A");
      await expect(current).toContainText(`Contract reference: ${longReference}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.goto(metadataUrl.replace(fohEmployee.id, fohEmployee.id.toUpperCase()));
      await expect(page.getByRole("heading", { name: "Employment metadata for FOH directory worker" })).toBeVisible();
      await expect(current).toContainText(`Contract reference: ${longReference}`);
      await page.goto(metadataUrl);

      form = page.getByRole("form", { name: "Record employment metadata" });
      await form.getByLabel("Effective date").fill("2020-01-01");
      await form.getByLabel("Employment basis").selectOption("full_time");
      await form.getByLabel("Classification (optional)").fill("Level 2");
      await submitDetails(page);
      await expect(current).toContainText("Employment basis: Full time");
      await expect(current).toContainText("Classification: Level 2");
      const history = page.getByRole("region", { name: "Employment metadata history" });
      await expect(history.getByRole("listitem")).toHaveCount(2);
      await expect(history).toContainText("Classification: Unknown");

      form = page.getByRole("form", { name: "Record employment metadata" });
      await form.getByLabel("Effective date").fill(futureDate);
      await form.getByLabel("Employment basis").selectOption("casual");
      await form.getByLabel("Classification (optional)").fill(longClassification);
      await form.getByLabel("Contract reference (optional)").fill(longReference);
      await submitDetails(page);
      await expect(current).toContainText("Employment basis: Full time");
      await expect(history).toContainText(`Effective ${futureDate}`);
      await expect(history).toContainText(longClassification);
      await expect(history).toContainText(longReference);
      await expect(history.getByRole("listitem")).toHaveCount(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      await page.goto(peopleUrl);
      await page.getByRole("link", { name: "View profile for FOH directory worker" }).click();
      const updatedProfile = page.getByRole("region", { name: "Overview", exact: true });
      await updatedProfile.getByRole("button", { name: "Edit overview" }).click();
      await expect(updatedProfile.getByRole("combobox", { name: "Employment type", exact: true })).toHaveValue("full_time");
      await updatedProfile.getByRole("combobox", { name: "Employment type", exact: true }).selectOption("part_time");
      await Promise.all([
        page.waitForURL(/saved=1/),
        updatedProfile.getByRole("button", { name: "Save employee" }).click(),
      ]);
      await page.goto(metadataUrl);
      await expect(current).toContainText("Employment basis: Part time");
      await expect(current).toContainText("Classification: Level 2");
      await expect(current).toContainText("Award reference: Award reference A");
      await expect(history).toContainText("profile edit");
      await expect(history.getByRole("listitem")).toHaveCount(4);

      const stale = await page.context().newPage();
      await stale.goto(metadataUrl);
      form = page.getByRole("form", { name: "Record employment metadata" });
      await form.getByLabel("Effective date").fill("2021-01-01");
      await form.getByLabel("Employment basis").selectOption("unknown");
      await form.getByLabel("Classification (optional)").fill("");
      await submitDetails(page);
      const staleForm = stale.getByRole("form", { name: "Record employment metadata" });
      await staleForm.getByLabel("Effective date").fill("2022-01-01");
      await staleForm.getByRole("button", { name: "Record employment details" }).click();
      await expect(stale.getByRole("main").getByRole("alert"))
        .toContainText("Employment details changed while this form was open");
      await expect(stale.getByRole("region", { name: "Employment metadata history" }).getByRole("listitem"))
        .toHaveCount(5);
      await stale.close();

      await page.goto(`/settings/audit?business=${businessId}`);
      await page.getByRole("combobox", { name: "Change category" }).selectOption("employee_employment_metadata_events");
      await page.getByRole("button", { name: "Apply audit filters" }).click();
      await expect(page.getByRole("heading", { name: "Employment metadata · INSERT" })).toHaveCount(5);

      const managerContext = await browser.newContext({ baseURL: appUrl });
      contexts.push(managerContext);
      const manager = await managerContext.newPage();
      await signIn(manager, `member-${suffix}@example.test`, password);
      await manager.goto(metadataUrl);
      await expect(manager.getByRole("heading", { name: "Employment metadata for FOH directory worker" })).toBeVisible();
      await manager.goto(`/people/${bohEmployee.id}/employment?venue=${venueIds[0]}&business=${businessId}`);
      await expect(manager.getByRole("main").getByRole("alert")).toContainText("cannot manage that department");
      expect((await admin.from("business_memberships").update({ role: "employee" }).eq("user_id", userIds[1])
        .eq("business_id", businessId)).error).toBeNull();
      await manager.goto(metadataUrl);
      await expect(manager).toHaveURL(/error=permission/);
    } finally {
      for (const context of contexts) await context.close();
    }
  });
});

test("owners configure venue geofences with protected audit and scoped access", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusinessId] = [randomUUID(), randomUUID()];
  const [venueId, secondVenueId, outsideVenueId] = [randomUUID(), randomUUID(), randomUUID()];
  const departmentId = randomUUID();
  const userIds = [];
  const contexts = [];
  try {
    for (const name of ["owner", "manager", "worker", "outside"]) {
      const user = await admin.auth.admin.createUser({
        email: `geofence-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(user.error).toBeNull();
      userIds.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Geofence ${suffix}` },
      { id: outsideBusinessId, name: `Outside geofence ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour" },
      { id: secondVenueId, business_id: businessId, name: "Riverside" },
      { id: outsideVenueId, business_id: outsideBusinessId, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], role: "general_manager", venue_id: venueId },
      { business_id: businessId, user_id: userIds[2], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusinessId, user_id: userIds[3], role: "owner" },
    ])).error).toBeNull();

    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, `geofence-owner-${suffix}@example.test`, password);
    await page.goto(`/settings/organisation?venue=${venueId}`);
    const region = page.getByRole("region", { name: "Venue location and geofence" });
    const form = page.getByRole("form", { name: "Configure venue geofence" });
    await expect(region).toContainText("Staff may need to allow location access at clock-in and clock-out");
    await expect(region).toContainText("Location verification is optional and is off until an owner enables it");
    await expect(region).toContainText("flagged for review without stopping the clock event");
    await expect(form.getByLabel("Latitude")).toHaveValue("");
    await expect(form.getByLabel("Longitude")).toHaveValue("");
    await expect(form.getByLabel("Radius in metres")).toHaveValue("");
    await form.getByLabel("Latitude").fill("-33.8688");
    await form.getByLabel("Longitude").fill("151.2093");
    await form.getByLabel("Radius in metres").fill("150");
    await form.getByRole("button", { name: "Save venue location" }).click();
    await expect(page.getByRole("status")).toHaveText("Venue location saved.");
    await expect(region).toContainText("-33.8688, 151.2093; 150 m");
    await expect(region).toContainText(`User ${userIds[0]}`);
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const firstVenue = await admin.from("venues")
      .select("geofence_latitude, geofence_longitude, geofence_radius_meters").eq("id", venueId).single();
    expect(firstVenue.error).toBeNull();
    expect(firstVenue.data).toEqual({
      geofence_latitude: -33.8688, geofence_longitude: 151.2093, geofence_radius_meters: 150,
    });
    // A repeated save keeps the same URL and status, then re-renders a fresh form with the saved values. Wait for
    // that replacement so the next edit cannot be overwritten by a still-pending save.
    await form.evaluate((element) => element.setAttribute("data-test-before-repeated-save", ""));
    await form.getByRole("button", { name: "Save venue location" }).click();
    await expect(page.locator("form[data-test-before-repeated-save]")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Venue location saved.");
    await form.getByLabel("Longitude").fill("");
    await form.getByRole("button", { name: "Save venue location" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("or clear all three");
    const unchanged = await admin.from("venue_geofence_events").select("id").eq("venue_id", venueId);
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toHaveLength(1);
    await expect(form.getByLabel("Longitude")).toHaveValue("151.2093");

    await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption(secondVenueId);
    await page.getByRole("button", { name: "Show venue" }).click();
    await expect(form.getByLabel("Latitude")).toHaveValue("");
    await expect(region).toContainText("No location changes yet.");
    await form.getByLabel("Latitude").fill("12");
    await form.getByLabel("Longitude").fill("20");
    await form.getByLabel("Radius in metres").fill("50");
    await form.getByRole("button", { name: "Save venue location" }).click();
    await expect(page.getByRole("status")).toHaveText("Venue location saved.");
    const secondVenue = await admin.from("venues")
      .select("geofence_latitude, geofence_longitude, geofence_radius_meters").eq("id", secondVenueId).single();
    expect(secondVenue.error).toBeNull();
    expect(secondVenue.data).toEqual({
      geofence_latitude: 12, geofence_longitude: 20, geofence_radius_meters: 50,
    });
    await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueId);
    await page.getByRole("button", { name: "Show venue" }).click();
    await expect(form.getByLabel("Latitude")).toHaveValue("-33.8688");
    await form.getByLabel("Latitude").fill("");
    await form.getByLabel("Longitude").fill("");
    await form.getByLabel("Radius in metres").fill("");
    await form.getByRole("button", { name: "Save venue location" }).click();
    await expect(page.getByRole("status")).toHaveText("Venue location saved.");
    await expect(region).toContainText("-33.8688, 151.2093; 150 m to Not configured");

    const ownerApi = createClient(apiUrl, anonKey, options);
    expect((await ownerApi.auth.signInWithPassword({ email: `geofence-owner-${suffix}@example.test`, password })).error).toBeNull();
    const concurrent = await Promise.all([
      ownerApi.rpc("save_venue_geofence", {
        p_business_id: businessId, p_venue_id: venueId, p_latitude: 10, p_longitude: 20, p_radius_meters: 100,
      }),
      ownerApi.rpc("save_venue_geofence", {
        p_business_id: businessId, p_venue_id: venueId, p_latitude: 30, p_longitude: 40, p_radius_meters: 200,
      }),
    ]);
    expect(concurrent.every((result) => !result.error)).toBe(true);
    const history = await admin.from("venue_geofence_events")
      .select("actor_id, old_values, new_values, created_at").eq("venue_id", venueId)
      .order("created_at", { ascending: true });
    expect(history.error).toBeNull();
    expect(history.data).toHaveLength(4);
    expect(history.data.every((event) => event.actor_id === userIds[0])).toBe(true);
    expect(history.data[2].old_values).toEqual({ latitude: null, longitude: null, radius_meters: null });
    expect(history.data[3].old_values).toEqual(history.data[2].new_values);
    expect(history.data.map((event) => event.new_values.radius_meters).slice(2).sort((a, b) => a - b)).toEqual([100, 200]);
    expect((await ownerApi.from("venue_geofence_events").update({ actor_type: "fake" }).eq("venue_id", venueId)).error?.code).toBe("42501");
    expect((await ownerApi.rpc("save_venue_geofence", {
      p_business_id: businessId, p_venue_id: venueId, p_latitude: 90.000001, p_longitude: 0, p_radius_meters: 100,
    })).error?.message).toBe("Invalid venue geofence");

    const managerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `geofence-manager-${suffix}@example.test`, password);
    await managerPage.goto("/settings/organisation");
    await expect(managerPage.getByRole("heading", { name: "Venue settings" })).toBeVisible();
    await expect(managerPage.getByRole("form", { name: "Configure venue geofence" })).toHaveCount(0);
    const managerApi = createClient(apiUrl, anonKey, options);
    expect((await managerApi.auth.signInWithPassword({ email: `geofence-manager-${suffix}@example.test`, password })).error).toBeNull();
    const managerHistory = await managerApi.from("venue_geofence_events").select("id").eq("venue_id", venueId);
    expect(managerHistory.error).toBeNull();
    expect(managerHistory.data).toEqual([]);
    expect((await managerApi.rpc("save_venue_geofence", {
      p_business_id: businessId, p_venue_id: venueId, p_latitude: 0, p_longitude: 0, p_radius_meters: 1,
    })).error?.message).toBe("Permission denied");

    const workerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, `geofence-worker-${suffix}@example.test`, password);
    await workerPage.goto("/settings/organisation");
    await expect(workerPage).toHaveURL(/\/\?error=permission/);
    const outsideApi = createClient(apiUrl, anonKey, options);
    expect((await outsideApi.auth.signInWithPassword({ email: `geofence-outside-${suffix}@example.test`, password })).error).toBeNull();
    expect((await outsideApi.rpc("save_venue_geofence", {
      p_business_id: outsideBusinessId, p_venue_id: venueId, p_latitude: 0, p_longitude: 0, p_radius_meters: 1,
    })).error?.message).toBe("Permission denied");
    const outsideHistory = await outsideApi.from("venue_geofence_events").select("id").eq("venue_id", venueId);
    expect(outsideHistory.error).toBeNull();
    expect(outsideHistory.data).toEqual([]);
  } finally {
    try {
      if (browser.isConnected()) {
        for (const context of contexts) await context.close();
      }
    } finally {
      await assertBusinessFixturesPreserved(admin, [businessId, outsideBusinessId]);
      for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
      const remaining = await admin.from("businesses").select("id").in("id", [businessId, outsideBusinessId]);
      expect(remaining.error).toBeNull();
      expect(remaining.data.map(({ id }) => id).sort()).toEqual([businessId, outsideBusinessId].sort());
    }
  }
});

test("venue planning weeks remain scoped, prospective and accessible on mobile", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const roles = ["owner", "manager", "worker", "outside"];
  const users = {};
  const contexts = [];
  const [businessId, outsideId, venueId, secondVenueId, outsideVenueId, fohId, bohId,
    workerId, cookId, publishedId, draftId, privateId] = Array.from({ length: 12 }, () => randomUUID());
  const settings = `/settings/organisation?business=${businessId}&venue=${venueId}`;
  const planning = `/roster/planning?business=${businessId}&venue=${venueId}&date=2032-03-21`;
  try {
    for (const role of roles) {
      const created = await admin.auth.admin.createUser({
        email: `planning-ui-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users[role] = created.data.user.id;
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Planning UI cafe" }, { id: outsideId, name: "Outside planning UI cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Sydney venue", timezone: "Australia/Sydney" },
      { id: secondVenueId, business_id: businessId, name: "Perth venue", timezone: "Australia/Perth" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside venue", timezone: "Australia/Brisbane" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.manager, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outside, role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.worker, name: "Planning worker", role_title: "Server" },
      { id: cookId, business_id: businessId, venue_id: venueId, department_id: bohId,
        name: "Private cook", role_title: "Cook" },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: publishedId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, role_title: "Published service", starts_at: "2032-03-20T22:00:00Z",
        ends_at: "2032-03-21T02:00:00Z", is_published: true, requires_acknowledgement: false },
      { id: draftId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, role_title: "Draft service", starts_at: "2032-03-21T22:00:00Z",
        ends_at: "2032-03-22T02:00:00Z", is_published: false, requires_acknowledgement: false },
      { id: privateId, business_id: businessId, venue_id: venueId, department_id: bohId,
        employee_id: cookId, role_title: "Kitchen private", starts_at: "2032-03-22T22:00:00Z",
        ends_at: "2032-03-23T02:00:00Z", is_published: false, requires_acknowledgement: false },
    ])).error).toBeNull();

    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, `planning-ui-owner-${suffix}@example.test`, password);
    await page.goto(settings);
    const region = page.getByRole("region", { name: "Roster planning week settings" });
    const form = page.getByRole("form", { name: "Configure roster planning week" });
    await expect(region).toContainText("Current planning start: Monday");
    await expect(form.getByLabel("Planning week starts on")).toHaveValue("1");
    await form.getByLabel("Planning week starts on").evaluate((select) => {
      select.add(new Option("Invalid", "8"));
      select.value = "8";
    });
    await form.getByRole("button", { name: "Save planning week" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "couldn't confirm the roster planning week" })).toBeVisible();
    await form.getByLabel("Planning week starts on").selectOption("7");
    await form.getByRole("button", { name: "Save planning week" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Roster planning week setting saved" })).toBeVisible();
    await expect(region).toContainText("Current planning start: Monday");
    await expect(region).toContainText("Scheduled: Sunday");
    await expect(region).toContainText("Monday to Sunday");
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    findingsMustBeEmpty(await accessibilityFindings(page, "venue planning settings"));

    await page.goto(planning);
    await expect(page.getByRole("heading", { name: "Venue planning view" })).toBeVisible();
    await expect(page.getByText("Planning starts on Sunday.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Shifts for 2032-03-21" })).toContainText("Published service");
    await expect(page.getByRole("region", { name: "Shifts for 2032-03-22" })).toContainText("Draft service");
    await expect(page.getByText("Kitchen private")).toBeVisible();
    await expect(page.getByRole("link", { name: "Operational week from 2032-03-15" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Operational week from 2032-03-22" })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    findingsMustBeEmpty(await accessibilityFindings(page, "venue planning view"));
    await page.getByRole("link", { name: "Next planning period" }).click();
    await expect(page.getByText("2032-03-28 to 2032-04-03")).toBeVisible();
    await page.getByRole("link", { name: "Previous planning period" }).click();
    await expect(page.getByText("2032-03-21 to 2032-03-27")).toBeVisible();
    await page.getByRole("link", { name: "Operational week from 2032-03-15" }).click();
    await expect(page.getByRole("heading", { name: "Weekly roster" })).toBeVisible();
    await expect(page.getByText("This editing and publication roster uses Monday–Sunday operational weeks.")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("week")).toBe("2032-03-15");
    await page.goto(`/roster/planning?business=${businessId}&venue=${venueId}&date=2031-02-29`);
    await expect(page.getByRole("alert").filter({ hasText: "Choose a valid planning date" })).toBeVisible();

    const managerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(managerContext);
    const manager = await managerContext.newPage();
    await signIn(manager, `planning-ui-manager-${suffix}@example.test`, password);
    await manager.goto(settings);
    await expect(manager.getByRole("form", { name: "Configure roster planning week" })).toHaveCount(0);
    await manager.goto(planning);
    await expect(manager.getByText("Published service")).toBeVisible();
    await expect(manager.getByText("Draft service")).toBeVisible();
    await expect(manager.getByText("Kitchen private")).toHaveCount(0);

    const workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const worker = await workerContext.newPage();
    await signIn(worker, `planning-ui-worker-${suffix}@example.test`, password);
    await worker.goto(planning);
    await expect(worker.getByText("Published service")).toBeVisible();
    await expect(worker.getByText("Draft service")).toHaveCount(0);
    await expect(worker.getByText("Kitchen private")).toHaveCount(0);
    findingsMustBeEmpty(await accessibilityFindings(worker, "employee planning view"));

    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outside = await outsideContext.newPage();
    await signIn(outside, `planning-ui-outside-${suffix}@example.test`, password);
    await outside.goto(planning);
    await expect(outside.getByRole("heading", { name: "Planning view unavailable" })).toBeVisible();
    await expect(outside.getByText("Published service")).toHaveCount(0);

    await page.goto(settings);
    await form.getByLabel("Planning week starts on").selectOption("1");
    await form.getByRole("button", { name: "Save planning week" }).click();
    await expect(region).toContainText("Cancelled pending change");
    await expect(region).not.toContainText("Scheduled: Sunday");
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const id of Object.values(users)) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

test("owners and scoped managers review roster snapshots with mobile-safe audited decisions", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const names = ["owner", "foh", "boh", "worker", "outside"];
  const users = {};
  const contexts = [];
  const [businessId, outsideId, venueId, secondVenueId, outsideVenueId, fohId, bohId,
    employeeId, reviewedShiftId, lateShiftId] = Array.from({ length: 10 }, () => randomUUID());
  const roster = `/roster?business=${businessId}&venue=${venueId}&department=${fohId}&week=2032-03-15`;
  const settings = `/settings/organisation?business=${businessId}&venue=${venueId}`;
  try {
    for (const name of names) {
      const created = await admin.auth.admin.createUser({
        email: `roster-review-ui-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users[name] = created.data.user.id;
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Review UI cafe" }, { id: outsideId, name: "Outside review UI cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Review venue", timezone: "UTC" },
      { id: secondVenueId, business_id: businessId, name: "Second venue", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outside, role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users.worker, name: "Review worker", role_title: "Server",
    })).error).toBeNull();
    expect((await admin.from("shifts").insert({
      id: reviewedShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: employeeId, role_title: "Reviewed service", starts_at: "2032-03-15T09:00:00Z",
      ends_at: "2032-03-15T13:00:00Z", break_minutes: 30, requires_acknowledgement: true,
    })).error).toBeNull();

    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, `roster-review-ui-owner-${suffix}@example.test`, password);
    await page.goto(`${settings}&error=inactive`);
    await expect(page.getByRole("main").getByRole("alert"))
      .toContainText("Reactivate the department before saving an active role.");
    await page.goto(settings);
    const policy = page.getByRole("form", { name: "Configure roster publication" });
    await expect(policy.getByLabel("Publication mode")).toHaveValue("direct");
    await policy.getByLabel("Publication mode").selectOption("approval");
    await policy.getByRole("button", { name: "Save publication setting" }).click();
    await expect(page.getByRole("status")).toHaveText("Roster publication setting saved.");
    await expect(page.getByRole("region", { name: "Roster publication settings" }))
      .toContainText("Direct publication to Approval required");
    await policy.getByLabel("Publication mode").evaluate((select) => {
      select.add(new Option("Invalid", "invalid"));
      select.value = "invalid";
    });
    await policy.getByRole("button", { name: "Save publication setting" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "couldn't save the roster publication setting" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("business")).toBe(businessId);
    expect(new URL(page.url()).searchParams.get("venue")).toBe(venueId);
    await expect(policy.getByLabel("Publication mode")).toHaveValue("approval");
    const otherVenue = await admin.from("venues").select("roster_publication_mode").eq("id", secondVenueId).single();
    expect(otherVenue.error).toBeNull();
    expect(otherVenue.data.roster_publication_mode).toBe("direct");

    const managerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(managerContext);
    const manager = await managerContext.newPage();
    await signIn(manager, `roster-review-ui-foh-${suffix}@example.test`, password);
    await manager.goto(settings);
    await expect(manager.getByRole("form", { name: "Configure roster publication" })).toHaveCount(0);
    await manager.goto(roster);
    await expect(manager.getByRole("button", { name: "Publish this department" })).toHaveCount(0);
    await manager.getByRole("button", { name: "Submit for review" }).click();
    await expect(manager.getByRole("status")).toContainText("Roster submitted for review");
    const firstHash = new URL(manager.url()).hash;
    expect(firstHash).toMatch(/^#review-[0-9a-f-]{36}$/);
    const managerReview = manager.locator(firstHash);
    await expect(managerReview).toContainText("Reviewed service");
    await expect(managerReview).toContainText("Review worker");
    await expect(managerReview).toContainText("Acknowledgement required");
    await expect(managerReview.getByRole("button", { name: "Approve and publish" })).toHaveCount(0);
    await expect(manager.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    expect(await manager.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    expect((await admin.from("shifts").insert({
      id: lateShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
      role_title: "Later open draft", starts_at: "2032-03-16T09:00:00Z",
      ends_at: "2032-03-16T13:00:00Z", break_minutes: 0,
    })).error).toBeNull();
    await page.goto(roster);
    let ownerReview = page.locator(firstHash);
    await expect(ownerReview).toContainText("Reviewed service");
    await expect(ownerReview).not.toContainText("Later open draft");
    findingsMustBeEmpty(await accessibilityFindings(page, "mobile roster review"));
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await ownerReview.getByRole("button", { name: "Approve and publish" }).click();
    await expect(page.getByRole("status")).toHaveText("Roster approved and the reviewed shifts published.");
    const published = await admin.from("shifts").select("id, is_published").in("id", [reviewedShiftId, lateShiftId]);
    expect(published.error).toBeNull();
    expect(published.data.find((shift) => shift.id === reviewedShiftId).is_published).toBe(true);
    expect(published.data.find((shift) => shift.id === lateShiftId).is_published).toBe(false);

    const workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const worker = await workerContext.newPage();
    await signIn(worker, `roster-review-ui-worker-${suffix}@example.test`, password);
    await worker.goto(`/notifications?business=${businessId}&venue=${venueId}`);
    await expect(worker.getByRole("article", { name: "Roster update for week starting 2032-03-15" })).toHaveCount(1);
    await worker.goto(`/my-schedule?business=${businessId}&venue=${venueId}&week=2032-03-15`);
    const weekly = worker.getByRole("region", { name: "Weekly schedule" });
    await expect(weekly).toContainText("Reviewed service");
    await expect(weekly).not.toContainText("Later open draft");
    await weekly.getByRole("button", { name: /Acknowledge Reviewed service shift/ }).click();
    await expect(worker.getByRole("status")).toHaveText("Shift acknowledged.");

    await manager.goto(roster);
    await manager.getByRole("button", { name: "Submit for review" }).click();
    await expect(manager.getByRole("status")).toContainText("Roster submitted for review");
    const secondHash = new URL(manager.url()).hash;
    await page.goto(roster);
    ownerReview = page.locator(secondHash);
    await expect(ownerReview).toContainText("Later open draft");
    await expect(ownerReview).toContainText("Open shift");
    await ownerReview.getByLabel("Reason for rejection").fill("   ");
    await ownerReview.getByRole("button", { name: "Reject review" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter a rejection reason" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("business")).toBe(businessId);
    expect(new URL(page.url()).searchParams.get("venue")).toBe(venueId);
    expect(new URL(page.url()).hash).toBe(secondHash);
    await ownerReview.getByLabel("Reason for rejection").fill("Coverage changed");
    await ownerReview.getByRole("button", { name: "Reject review" }).click();
    await expect(page.getByRole("status")).toHaveText("Roster review rejected. The submitted shifts remain drafts.");
    await expect(page.locator(secondHash)).toContainText("Reason: Coverage changed");
    await page.goto(`/settings/audit?business=${businessId}&source=roster_review_decisions`);
    await expect(page.getByRole("list", { name: "Sensitive action history" }))
      .toContainText("Roster review decisions");
    await expect(page.getByRole("list", { name: "Sensitive action history" })).toContainText("Coverage changed");

    await manager.goto(roster);
    await manager.getByRole("button", { name: "Submit for review" }).click();
    await expect(manager.getByRole("status")).toContainText("Roster submitted for review");
    const thirdHash = new URL(manager.url()).hash;
    await page.goto(settings);
    await policy.getByLabel("Publication mode").selectOption("direct");
    await policy.getByRole("button", { name: "Save publication setting" }).click();
    await expect(page.getByRole("status")).toHaveText("Roster publication setting saved.");
    await manager.goto(roster);
    await expect(manager.locator(thirdHash)).toContainText("drafts or the publication settings have changed");
    await expect(manager.locator(thirdHash).getByRole("button", { name: "Approve and publish" })).toHaveCount(0);
    await manager.locator(thirdHash).getByRole("button", { name: "Withdraw review" }).click();
    await expect(manager.getByRole("status")).toHaveText("Roster review withdrawn. The submitted shifts remain drafts.");
    await expect(manager.getByRole("button", { name: "Publish this department" })).toBeVisible();

    const bohContext = await browser.newContext({ baseURL: appUrl });
    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(bohContext, outsideContext);
    const boh = await bohContext.newPage();
    const outside = await outsideContext.newPage();
    await signIn(boh, `roster-review-ui-boh-${suffix}@example.test`, password);
    await boh.goto(roster);
    await expect(boh.getByText("Reviewed service", { exact: true })).toHaveCount(0);
    await expect(boh.getByText("Coverage changed", { exact: false })).toHaveCount(0);
    await signIn(outside, `roster-review-ui-outside-${suffix}@example.test`, password);
    await outside.goto(roster);
    await expect(outside.getByRole("heading", { name: "Roster unavailable" })).toBeVisible();
    await expect(outside.getByText("Reviewed service", { exact: true })).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
    for (const id of [businessId, outsideId]) {
      await assertBusinessFixturesPreserved(admin, id);
    }
    for (const user of Object.values(users)) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("owners configure venue conflict rules with protected history and scoped access", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusinessId] = [randomUUID(), randomUUID()];
  const [venueId, secondVenueId, outsideVenueId] = [randomUUID(), randomUUID(), randomUUID()];
  const departmentId = randomUUID();
  const userIds = [];
  const contexts = [];
  try {
    for (const name of ["owner", "manager", "outside"]) {
      const user = await admin.auth.admin.createUser({
        email: `conflict-policy-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(user.error).toBeNull();
      userIds.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Conflict rules ${suffix}` },
      { id: outsideBusinessId, name: `Outside conflict rules ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "UTC" },
      { id: secondVenueId, business_id: businessId, name: "Riverside", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideBusinessId, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusinessId, user_id: userIds[2], role: "owner" },
    ])).error).toBeNull();

    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, `conflict-policy-owner-${suffix}@example.test`, password);
    await page.goto(`/settings/organisation?venue=${venueId}`);
    const region = page.getByRole("region", { name: "Roster conflict rules" });
    const form = page.getByRole("form", { name: "Configure roster conflict rules" });
    const labels = [
      "Manual assignment with unavailable worker", "Publish with unavailable worker",
      "Publish with overlapping shifts", "Publish a shift longer than 24 hours",
    ];
    await expect(region).toContainText("Cross-venue overlaps are detected when an owner explicitly links");
    await expect(region).toContainText("automatic selection avoids them and publication follows the overlap rule");
    await expect(region).toContainText("No rule changes yet.");
    for (const label of labels) await expect(form.getByLabel(label)).toHaveValue("false");
    for (const label of labels) await form.getByLabel(label).selectOption("true");
    await form.getByRole("button", { name: "Save roster conflict rules" }).click();
    await expect(page.getByRole("status")).toHaveText("Roster conflict rules saved.");
    await expect(region).toContainText(`User ${userIds[0]}`);
    await expect(region).toContainText("Manual availability: warn");
    await expect(region).toContainText("Manual availability: block");
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const saved = await admin.from("venues")
      .select("block_manual_unavailability, block_publish_unavailability, block_publish_overlap, block_publish_long_shift")
      .eq("id", venueId).single();
    expect(saved.error).toBeNull();
    expect(saved.data).toEqual({
      block_manual_unavailability: true, block_publish_unavailability: true,
      block_publish_overlap: true, block_publish_long_shift: true,
    });
    // Clear the previous saved message so the unchanged save is observed completing before the next step.
    await page.goto(`/settings/organisation?venue=${venueId}`);
    await expect(page.getByRole("status")).toHaveCount(0);
    for (const label of labels) await expect(form.getByLabel(label)).toHaveValue("true");
    await form.getByRole("button", { name: "Save roster conflict rules" }).click();
    await expect(page.getByRole("status")).toHaveText("Roster conflict rules saved.");
    const unchangedHistory = await admin.from("venue_conflict_policy_events").select("id").eq("venue_id", venueId);
    expect(unchangedHistory.error).toBeNull();
    expect(unchangedHistory.data).toHaveLength(1);

    await form.getByLabel(labels[0]).evaluate((select) => {
      select.add(new Option("Invalid", "invalid"));
      select.value = "invalid";
    });
    await form.getByRole("button", { name: "Save roster conflict rules" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Select a valid option for each roster conflict rule");
    await expect(form.getByLabel(labels[0])).toHaveValue("true");
    await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption(secondVenueId);
    await page.getByRole("button", { name: "Show venue" }).click();
    for (const label of labels) await expect(form.getByLabel(label)).toHaveValue("false");
    await expect(region).toContainText("No rule changes yet.");
    await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueId);
    await page.getByRole("button", { name: "Show venue" }).click();
    for (const label of labels) await expect(form.getByLabel(label)).toHaveValue("true");

    const managerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `conflict-policy-manager-${suffix}@example.test`, password);
    await managerPage.goto(`/settings/organisation?venue=${venueId}`);
    await expect(managerPage.getByRole("form", { name: "Configure roster conflict rules" })).toHaveCount(0);
    const managerApi = createClient(apiUrl, anonKey, options);
    expect((await managerApi.auth.signInWithPassword({
      email: `conflict-policy-manager-${suffix}@example.test`, password,
    })).error).toBeNull();
    const args = {
      p_business_id: businessId, p_venue_id: venueId,
      p_block_manual_unavailability: false, p_block_publish_unavailability: false,
      p_block_publish_overlap: false, p_block_publish_long_shift: false,
    };
    expect((await managerApi.rpc("save_venue_conflict_policy", args)).error?.message).toBe("Permission denied");
    const managerHistory = await managerApi.from("venue_conflict_policy_events").select("id").eq("venue_id", venueId);
    expect(managerHistory.error).toBeNull();
    expect(managerHistory.data).toEqual([]);
    const outsideApi = createClient(apiUrl, anonKey, options);
    expect((await outsideApi.auth.signInWithPassword({
      email: `conflict-policy-outside-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await outsideApi.rpc("save_venue_conflict_policy", args)).error?.message).toBe("Permission denied");
    const outsideHistory = await outsideApi.from("venue_conflict_policy_events").select("id").eq("venue_id", venueId);
    expect(outsideHistory.error).toBeNull();
    expect(outsideHistory.data).toEqual([]);
  } finally {
    try {
      if (browser.isConnected()) {
        for (const context of contexts) await context.close();
      }
    } finally {
      await assertBusinessFixturesPreserved(admin, [businessId, outsideBusinessId]);
      for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
});

test("configured conflict rules block assignments and publication until warnings are resolved", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const venueId = randomUUID();
  const [fohId, bohId] = [randomUUID(), randomUUID()];
  const employeeId = randomUUID();
  const [unavailableId, openId, overlapId, hiddenId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const userIds = [];
  const contexts = [];
  try {
    for (const name of ["owner", "manager"]) {
      const user = await admin.auth.admin.createUser({
        email: `conflict-enforce-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(user.error).toBeNull();
      userIds.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Conflict enforcement ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({ id: venueId, business_id: businessId, name: "Harbour", timezone: "UTC" })).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], role: "foh_manager", venue_id: venueId, department_id: fohId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      name: "Policy worker", role_title: "Server",
    })).error).toBeNull();
    expect((await admin.from("employee_departments").insert({
      business_id: businessId, employee_id: employeeId, department_id: bohId,
    })).error).toBeNull();
    expect((await admin.from("employee_availability_patterns").insert({
      employee_id: employeeId, business_id: businessId, venue_id: venueId,
    })).error).toBeNull();
    expect((await admin.from("employee_availability_intervals").insert([
      { employee_id: employeeId, business_id: businessId, venue_id: venueId, weekday: 1, start_minute: 540, end_minute: 1020 },
      { employee_id: employeeId, business_id: businessId, venue_id: venueId, weekday: 4, start_minute: 540, end_minute: 1020 },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: unavailableId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: employeeId,
        role_title: "Unavailable legacy", starts_at: "2032-03-15T18:00:00Z", ends_at: "2032-03-15T19:00:00Z" },
      { id: openId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: null,
        role_title: "Long open coverage", starts_at: "2032-03-16T09:00:00Z", ends_at: "2032-03-17T10:00:00Z" },
      { id: overlapId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: employeeId,
        role_title: "FOH conflict", starts_at: "2032-03-18T09:00:00Z", ends_at: "2032-03-18T12:00:00Z" },
      { id: hiddenId, business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: employeeId,
        role_title: "Private BOH conflict", starts_at: "2032-03-18T11:00:00Z", ends_at: "2032-03-18T13:00:00Z" },
    ])).error).toBeNull();

    await signIn(page, `conflict-enforce-owner-${suffix}@example.test`, password);
    await page.goto(`/settings/organisation?venue=${venueId}`);
    const policy = page.getByRole("form", { name: "Configure roster conflict rules" });
    for (const label of [
      "Manual assignment with unavailable worker", "Publish with unavailable worker",
      "Publish with overlapping shifts", "Publish a shift longer than 24 hours",
    ]) await policy.getByLabel(label).selectOption("true");
    await policy.getByRole("button", { name: "Save roster conflict rules" }).click();
    await expect(page.getByRole("status")).toHaveText("Roster conflict rules saved.");

    const roster = `/roster?week=2032-03-15&venue=${venueId}&department=${fohId}`;
    await page.goto(roster);
    const history = page.getByRole("region", { name: "Publication history" });
    await expect(history).toContainText("No recorded publications for this department and week.");
    await expect(page.getByText("Manual assignment blocks unavailable workers", { exact: false })).toBeVisible();
    await expect(page.locator("article", { hasText: "Unavailable legacy" }).getByRole("note"))
      .toContainText("Outside submitted availability");
    await expect(page.locator("#open-shifts").getByRole("note", { name: /Long open coverage/ }))
      .toContainText("Shift exceeds 24 hours");
    const create = page.getByRole("form", { name: "Add draft shift" });
    await create.getByLabel("Role").fill("Rejected unavailable assignment");
    await create.getByLabel("Team member").selectOption(employeeId);
    await create.getByLabel("Starts").fill("2032-03-15T20:00");
    await create.getByLabel("Ends").fill("2032-03-15T21:00");
    await create.getByRole("button", { name: "Save draft shift" }).click();
    await expect(create.getByRole("alert")).toContainText("That worker is unavailable");
    await expect(create.getByLabel("Role")).toHaveValue("Rejected unavailable assignment");
    await expect(create.getByLabel("Starts")).toHaveValue("2032-03-15T20:00");
    const rejected = await admin.from("shifts").select("id")
      .eq("business_id", businessId).eq("role_title", "Rejected unavailable assignment");
    expect(rejected.error).toBeNull();
    expect(rejected.data).toEqual([]);

    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page).toHaveURL(/error=publish-duration/);
    await expect(page.locator('p[role="alert"]')).toContainText("shifts longer than 24 hours");
    await expect(history).toContainText("No recorded publications for this department and week.");
    await page.getByRole("link", { name: "Edit open shift" }).click();
    const edit = page.getByRole("form", { name: "Edit draft shift" });
    await edit.getByLabel("Ends").fill("2032-03-16T12:00");
    await edit.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft shift updated.");
    await expect(page.locator("#open-shifts").getByRole("note", { name: /Long open coverage/ })).toHaveCount(0);

    const managerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `conflict-enforce-manager-${suffix}@example.test`, password);
    await managerPage.goto(roster);
    await expect(managerPage.locator("article", { hasText: "FOH conflict" }).getByRole("note"))
      .toContainText("Overlaps another shift");
    await expect(managerPage.getByText("Private BOH conflict", { exact: true })).toHaveCount(0);
    await managerPage.getByLabel("Find team member", { exact: true }).fill("no matching team member");
    await managerPage.getByRole("button", { name: "Search roster", exact: true }).click();
    await expect(managerPage.getByText("No team members match this search.", { exact: true })).toBeVisible();
    await expect(managerPage.getByText("FOH conflict", { exact: true })).toHaveCount(0);
    await managerPage.getByRole("button", { name: "Publish this department" }).click();
    await expect(managerPage).toHaveURL(/error=publish-overlap/);
    await expect(managerPage.locator('p[role="alert"]')).toContainText("overlapping shifts");
    await expect(managerPage.getByText("Private BOH conflict", { exact: true })).toHaveCount(0);
    const before = await admin.from("shifts").select("id, is_published").eq("business_id", businessId);
    expect(before.error).toBeNull();
    expect(before.data.every((shift) => !shift.is_published)).toBe(true);

    await page.goto(`/roster?week=2032-03-15&venue=${venueId}&department=${bohId}`);
    await page.locator("article", { hasText: "Private BOH conflict" })
      .getByRole("button", { name: "Delete Policy worker shift" }).click();
    await page.locator("article", { hasText: "Private BOH conflict" })
      .getByRole("button", { name: "Confirm deletion", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Draft shift removed.");
    await page.goto(roster);
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page).toHaveURL(/error=publish-unavailable/);
    await expect(page.locator('p[role="alert"]')).toContainText("unavailable workers");
    await page.locator("article", { hasText: "Unavailable legacy" })
      .getByRole("link", { name: "Edit Policy worker shift" }).click();
    await edit.getByLabel("Starts").fill("2032-03-15T14:00");
    await edit.getByLabel("Ends").fill("2032-03-15T15:00");
    await edit.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft shift updated.");
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("status")).toHaveText("Front of House roster published.");
    await expect(history.getByRole("listitem")).toHaveCount(1);
    await expect(history.getByRole("listitem").first()).toContainText("Version 1");
    await expect(history.getByRole("listitem").first()).toContainText("3 newly published, 3 total shifts");
    const published = await admin.from("shifts").select("id, is_published")
      .in("id", [unavailableId, openId, overlapId]);
    expect(published.error).toBeNull();
    expect(published.data).toHaveLength(3);
    expect(published.data.every((shift) => shift.is_published)).toBe(true);
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("status")).toHaveText("There are no draft shifts to publish.");
    await expect(history.getByRole("listitem")).toHaveCount(1);

    await create.getByLabel("Role").fill("Later open shift");
    await create.getByLabel("Team member").selectOption("");
    await create.getByLabel("Starts").fill("2032-03-19T09:00");
    await create.getByLabel("Ends").fill("2032-03-19T10:00");
    await create.getByLabel("Break").fill("0");
    await create.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("status")).toHaveText("Front of House roster published.");
    await expect(history.getByRole("listitem")).toHaveCount(2);
    await expect(history.getByRole("listitem").nth(0)).toContainText("Version 2");
    await expect(history.getByRole("listitem").nth(0)).toContainText("1 newly published, 4 total shifts");
    await expect(history.getByRole("listitem").nth(1)).toContainText("Version 1");
    await managerPage.goto(roster);
    await expect(managerPage.getByRole("region", { name: "Publication history" }).getByRole("listitem"))
      .toHaveCount(2);
  } finally {
    try {
      if (browser.isConnected()) {
        for (const context of contexts) await context.close();
      }
    } finally {
      expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
      await assertBusinessFixturesPreserved(admin, businessId);
      for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
});

test("automatic assignment respects availability while manual warnings remain advisory", async ({ page }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const venueId = randomUUID();
  const departmentId = randomUUID();
  const [unavailableId, availableId, unknownId] = [randomUUID(), randomUUID(), randomUUID()];
  const userIds = [];
  try {
    for (const name of ["owner", "available", "unknown"]) {
      const user = await admin.auth.admin.createUser({
        email: `auto-availability-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(user.error).toBeNull();
      userIds.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Auto availability ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({ id: venueId, business_id: businessId, name: "Harbour", timezone: "UTC" })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: userIds[2], role: "employee", venue_id: venueId, department_id: departmentId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: unavailableId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "A Unavailable", role_title: "Server" },
      { id: availableId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "B Available", role_title: "Server", auth_user_id: userIds[1] },
      { id: unknownId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "C Unknown", role_title: "Server", auth_user_id: userIds[2] },
    ])).error).toBeNull();
    expect((await admin.from("employee_availability_patterns").insert({
      employee_id: unavailableId, business_id: businessId, venue_id: venueId,
    })).error).toBeNull();

    const ownerApi = createClient(apiUrl, anonKey, options);
    const availableApi = createClient(apiUrl, anonKey, options);
    const unknownApi = createClient(apiUrl, anonKey, options);
    expect((await ownerApi.auth.signInWithPassword({ email: `auto-availability-owner-${suffix}@example.test`, password })).error).toBeNull();
    expect((await availableApi.auth.signInWithPassword({ email: `auto-availability-available-${suffix}@example.test`, password })).error).toBeNull();
    expect((await unknownApi.auth.signInWithPassword({ email: `auto-availability-unknown-${suffix}@example.test`, password })).error).toBeNull();
    expect((await availableApi.rpc("set_employee_recurring_availability", {
      p_business_id: businessId, p_employee_id: availableId,
      p_intervals: [{ weekday: 1, start: "09:00", end: "17:00" }],
    })).error).toBeNull();
    const leave = await availableApi.rpc("request_availability_exception", {
      p_business_id: businessId, p_venue_id: venueId, p_employee_id: availableId,
      p_starts_on: "2032-03-15", p_ends_on: "2032-03-15", p_exception_type: "leave",
    });
    expect(leave.error).toBeNull();

    await signIn(page, `auto-availability-owner-${suffix}@example.test`, password);
    await page.goto(`/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`);
    const form = page.getByRole("form", { name: "Add draft shift" });
    await expect(form).toContainText("Automatic selection checks qualifications, overlaps, submitted availability");
    await form.getByLabel("Role").fill("First auto availability");
    await form.getByLabel("Team member").selectOption("auto");
    await form.getByLabel("Starts").fill("2032-03-15T09:00");
    await form.getByLabel("Ends").fill("2032-03-15T10:00");
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/roster"),
      form.getByRole("button", { name: "Save draft shift" }).click(),
    ]);
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    const first = await admin.from("shifts").select("id, employee_id")
      .eq("business_id", businessId).eq("role_title", "First auto availability").single();
    expect(first.error).toBeNull();
    expect(first.data.employee_id).toBe(availableId);
    await expect(page).toHaveURL(new RegExp(`created=${first.data.id}`));

    expect((await ownerApi.rpc("review_leave_request", {
      p_business_id: businessId, p_venue_id: venueId, p_exception_id: leave.data, p_status: "approved",
    })).error).toBeNull();
    await form.getByLabel("Role").fill("Second auto availability");
    await form.getByLabel("Team member").selectOption("auto");
    await form.getByLabel("Starts").fill("2032-03-15T11:00");
    await form.getByLabel("Ends").fill("2032-03-15T12:00");
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/roster"),
      form.getByRole("button", { name: "Save draft shift" }).click(),
    ]);
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    const second = await admin.from("shifts").select("id, employee_id")
      .eq("business_id", businessId).eq("role_title", "Second auto availability").single();
    expect(second.error).toBeNull();
    expect(second.data.employee_id).toBe(unknownId);
    await expect(page).toHaveURL(new RegExp(`created=${second.data.id}`));
    await expect(page.locator("article", { hasText: "First auto availability" }).getByRole("note"))
      .toContainText("Approved leave");

    const blocked = await unknownApi.rpc("request_availability_exception", {
      p_business_id: businessId, p_venue_id: venueId, p_employee_id: unknownId,
      p_starts_on: "2032-03-15", p_ends_on: "2032-03-15", p_exception_type: "unavailable",
    });
    expect(blocked.error).toBeNull();
    await form.getByLabel("Role").fill("No automatic candidate");
    await form.getByLabel("Team member").selectOption("auto");
    await form.getByLabel("Starts").fill("2032-03-15T13:00");
    await form.getByLabel("Ends").fill("2032-03-15T14:00");
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/roster"),
      form.getByRole("button", { name: "Save draft shift" }).click(),
    ]);
    await expect(form.getByRole("alert")).toContainText("No eligible worker is available");
    const missing = await admin.from("shifts").select("id")
      .eq("business_id", businessId).eq("role_title", "No automatic candidate");
    expect(missing.error).toBeNull();
    expect(missing.data).toEqual([]);

    await form.getByLabel("Role").fill("Manual availability warning");
    await form.getByLabel("Team member").selectOption(unavailableId);
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/roster"),
      form.getByRole("button", { name: "Save draft shift" }).click(),
    ]);
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    await expect(page.locator("article", { hasText: "Manual availability warning" }).getByRole("note"))
      .toContainText("Outside submitted availability");
    await expect(page.getByText("Availability warnings do not block manual assignment or publication", { exact: false })).toBeVisible();
  } finally {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

test("departments and job roles can be created, deactivated and keep shift history", async ({ page, browser }) => {
      const suffix = randomUUID();
      const password = `${randomBytes(18).toString("base64url")}aA1!`;
      const userIds = [];
      const businessId = randomUUID();
      const venueId = randomUUID();
      const fohId = randomUUID();
      let employeeContext;
      try {
        for (const name of ["owner", "staff"]) {
          const result = await admin.auth.admin.createUser({
            email: `${name}-${suffix}@example.test`, password, email_confirm: true,
          });
          expect(result.error).toBeNull();
          userIds.push(result.data.user.id);
        }
        expect((await admin.from("businesses").insert({ id: businessId, name: `Organisation ${suffix}` })).error).toBeNull();
        expect((await admin.from("venues").insert({ id: venueId, business_id: businessId, name: "Harbour" })).error).toBeNull();
        expect((await admin.from("departments").insert({
          id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House",
        })).error).toBeNull();
        expect((await admin.from("business_memberships").insert([
          { business_id: businessId, user_id: userIds[0], role: "owner" },
          { business_id: businessId, user_id: userIds[1], role: "employee", venue_id: venueId, department_id: fohId },
        ])).error).toBeNull();

        await signIn(page, `owner-${suffix}@example.test`, password);
        await page.getByRole("link", { name: "Departments & roles", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Departments and roles" })).toBeVisible();
        const addDepartment = page.getByRole("region", { name: "Add department", exact: true });
        await addDepartment.getByRole("button", { name: "Add department" }).click();
        await addDepartment.getByRole("textbox", { name: "Department name" }).fill("Events");
        await addDepartment.getByRole("button", { name: "Create department" }).click();
        await expect(page.getByRole("status").filter({ hasText: "Department saved." })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
        const storedDepartment = await admin.from("departments").select("id, active")
          .eq("business_id", businessId).eq("name", "Events").single();
        expect(storedDepartment.error).toBeNull();
        expect(storedDepartment.data.active).toBe(true);
        const eventsId = storedDepartment.data.id;

        await page.getByRole("button", { name: "Edit department details" }).click();
        await page.getByRole("form", { name: "Edit department details" }).getByLabel("Department name").fill("Not saved");
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.getByRole("button", { name: "Discard changes" }).click();
        await page.reload();
        await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
        await page.getByRole("link", { name: "Back to departments" }).click();
        await addDepartment.getByRole("button", { name: "Add department" }).click();
        await addDepartment.getByRole("textbox", { name: "Department name" }).fill("events");
        await addDepartment.getByRole("button", { name: "Create department" }).click();
        await expect(page.locator('p[role="alert"]')).toContainText("already used");

        await page.getByRole("link", { name: /Events.*View/ }).click();
        const rolesRegion = page.getByRole("region", { name: "Job roles", exact: true });
        await rolesRegion.getByRole("button", { name: "Add role" }).click();
        await rolesRegion.getByRole("textbox", { name: "Role name" }).fill("Event host");
        await rolesRegion.getByRole("button", { name: "Create role" }).click();
        await expect(page.getByRole("status").filter({ hasText: "Job role saved." })).toBeVisible();
        await expect(rolesRegion.getByRole("link", { name: /Event host.*Manage role/ })).toBeVisible();

        expect((await admin.from("employees").insert({
          business_id: businessId, venue_id: venueId, department_id: eventsId,
          name: "Event worker", role_title: "Event host",
        })).error).toBeNull();
        await page.goto(`/roster?department=${eventsId}`);
        await expect(page.locator("#role-suggestions option[value='Event host']")).toHaveCount(1);
        await page.locator('input[name="role_title"]').fill("Event host");
        await page.locator('select[name="employee_id"]').selectOption({ label: "Event worker · Event host" });
        await page.getByRole("button", { name: "Save draft shift" }).click();
        await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
        const shift = await admin.from("shifts").select("id, department_id, role_title")
          .eq("business_id", businessId).single();
        expect(shift.error).toBeNull();
        expect(shift.data).toMatchObject({ department_id: eventsId, role_title: "Event host" });

        await page.goto(`/settings/departments/${eventsId}?business=${businessId}&venue=${venueId}`);
        await page.getByRole("link", { name: /Event host.*Manage role/ }).click();
        await page.getByRole("button", { name: "Deactivate role" }).click();
        await page.getByRole("checkbox", { name: "I confirm this role status change." }).check();
        await page.getByRole("button", { name: "Confirm deactivation" }).click();
        await expect(page.getByRole("status").filter({ hasText: "Job role saved." })).toBeVisible();
        await page.getByRole("link", { name: "Back to Events" }).click();
        await page.getByRole("button", { name: "Edit department details" }).click();
        await page.getByRole("textbox", { name: "Department name" }).fill("Functions");
        await page.getByRole("button", { name: "Save department" }).click();
        await expect(page.getByRole("status").filter({ hasText: "Department saved." })).toBeVisible();
        await page.getByRole("button", { name: "Deactivate department" }).click();
        await page.getByRole("checkbox", { name: "I confirm this department status change." }).check();
        await page.getByRole("button", { name: "Confirm deactivation" }).click();
        await expect(page.getByRole("status").filter({ hasText: "Department saved." })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Functions", exact: true })).toBeVisible();
        await expect(page.getByText("Inactive department", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Add role" })).toHaveCount(0);

        const retained = await admin.from("shifts").select("id, department_id, role_title").eq("id", shift.data.id).single();
        expect(retained.error).toBeNull();
        expect(retained.data).toEqual(shift.data);
        const roles = await admin.from("job_roles").select("name, active").eq("department_id", eventsId);
        expect(roles.data).toEqual([{ name: "Event host", active: false }]);

        await page.goto(`/roster?department=${eventsId}`);
        await expect(page.locator("#department-filter option", { hasText: "Functions (inactive)" })).toHaveCount(1);
        await expect(page.getByRole("note")).toContainText("This department is inactive");
        await expect(page.getByRole("button", { name: "Save draft shift" })).toHaveCount(0);

        await page.goto("/people");
        await page.getByRole("link", { name: "Add person", exact: true }).click();
        const newEmployee = page.getByRole("region", { name: "New employee", exact: true });
        await expect(newEmployee.locator(`select[name="department_id"] option[value="${eventsId}"]`)).toHaveCount(0);

        await page.goto(`/settings/departments/${eventsId}?business=${businessId}&venue=${venueId}`);
        await page.getByRole("button", { name: "Reactivate department" }).click();
        await page.getByRole("checkbox", { name: "I confirm this department status change." }).check();
        await page.getByRole("button", { name: "Confirm reactivation" }).click();
        await expect(page.getByText("Active department", { exact: true })).toBeVisible();
        await page.getByRole("link", { name: /Event host.*Manage role/ }).click();
        await page.getByRole("button", { name: "Reactivate role" }).click();
        await page.getByRole("checkbox", { name: "I confirm this role status change." }).check();
        await page.getByRole("button", { name: "Confirm reactivation" }).click();
        await expect(page.getByText("Functions · Active role", { exact: true })).toBeVisible();
        const restored = await admin.from("job_roles").select("name, active").eq("department_id", eventsId);
        expect(restored.data).toEqual([{ name: "Event host", active: true }]);
        expect((await admin.from("shifts").select("id, department_id, role_title").eq("id", shift.data.id).single()).data)
          .toEqual(shift.data);

        employeeContext = await browser.newContext({ baseURL: appUrl });
        const employeePage = await employeeContext.newPage();
        await signIn(employeePage, `staff-${suffix}@example.test`, password);
        await expect(employeePage.getByRole("link", { name: "Departments & roles", exact: true })).toHaveCount(0);
        await employeePage.goto("/settings/departments");
        await expect(employeePage).toHaveURL(/\/\?error=permission/);
      } finally {
        try {
          if (employeeContext && browser.isConnected()) await employeeContext.close();
        } finally {
          expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
          await assertBusinessFixturesPreserved(admin, businessId);
          for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
        }
      }
});

test("Department directory and role details preserve scope, stale edits and five viewport layouts", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await withPermissionFixtures("foh_manager", async ({ suffix, password, userIds, businessId, venueIds, departmentIds, scopes }) => {
    const [baristaId, cookId, longDepartmentId, longRoleId, inactiveId, outsideBusiness, outsideVenue, outsideDepartment,
      emptyVenue, otherRoleId, serverId, pausedDepartmentId, pausedRoleId] =
      Array.from({ length: 13 }, () => randomUUID());
    const longName = "LongDepartment".repeat(5);
    const longRole = "LongRole".repeat(10);
    const contexts = [];
    try {
      expect((await admin.from("departments").insert([
        { id: longDepartmentId, business_id: businessId, venue_id: venueIds[0], name: longName, active: true },
        { id: inactiveId, business_id: businessId, venue_id: venueIds[0], name: "Night service", active: false },
        { id: pausedDepartmentId, business_id: businessId, venue_id: venueIds[0], name: "Paused service", active: true },
      ])).error).toBeNull();
      expect((await admin.from("venues").insert({
        id: emptyVenue, business_id: businessId, name: "Empty venue",
      })).error).toBeNull();
      expect((await admin.from("job_roles").insert([
        { id: baristaId, business_id: businessId, venue_id: venueIds[0], department_id: departmentIds[0], name: "Barista" },
        { id: cookId, business_id: businessId, venue_id: venueIds[0], department_id: departmentIds[1], name: "Cook" },
        { id: longRoleId, business_id: businessId, venue_id: venueIds[0], department_id: longDepartmentId, name: longRole },
        { id: otherRoleId, business_id: businessId, venue_id: venueIds[1], department_id: departmentIds[2], name: "Other venue role" },
        { id: serverId, business_id: businessId, venue_id: venueIds[0], department_id: departmentIds[0], name: "Server" },
        { id: pausedRoleId, business_id: businessId, venue_id: venueIds[0], department_id: pausedDepartmentId, name: "Paused role" },
      ])).error).toBeNull();
      expect((await admin.from("departments").update({ active: false }).eq("id", pausedDepartmentId)).error).toBeNull();
      expect((await admin.from("businesses").insert({ id: outsideBusiness, name: `Outside ${suffix}` })).error).toBeNull();
      expect((await admin.from("venues").insert({
        id: outsideVenue, business_id: outsideBusiness, name: "Private venue",
      })).error).toBeNull();
      expect((await admin.from("departments").insert({
        id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "Private department",
      })).error).toBeNull();
      const directory = `/settings/departments?business=${businessId}&venue=${venueIds[0]}`;
      const detail = `/settings/departments/${departmentIds[0]}?business=${businessId}&venue=${venueIds[0]}`;
      const role = `/settings/departments/${departmentIds[0]}/roles/${baristaId}?business=${businessId}&venue=${venueIds[0]}`;
      const screenshots = process.env.BUTTERBOX_TEST_SCREENSHOT_DIR;
      await signIn(page, `owner-${suffix}@example.test`, password);
      await page.emulateMedia({ reducedMotion: "reduce" });

      async function checkLayout(label) {
        const layout = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const overflow = [...document.querySelectorAll("body *")].filter((element) => {
            const box = element.getBoundingClientRect();
            return box.right > width + 1 || (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1);
          }).slice(0, 20).map((element) => ({
            tag: element.tagName, className: element.getAttribute("class"),
            width: element.clientWidth, scrollWidth: element.scrollWidth,
          }));
          return { width, scrollWidth: document.documentElement.scrollWidth, overflow };
        });
        expect(layout.scrollWidth, `${label}: horizontal page overflow ${JSON.stringify(layout.overflow)}`)
          .toBeLessThanOrEqual(layout.width);
        const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
        const serious = results.violations.filter((item) => ["serious", "critical"].includes(item.impact))
          .map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(" ")).join(", ")}`);
        expect(serious, `${label}: serious or critical accessibility violations`).toEqual([]);
      }

      for (const width of [375, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(directory);
        await expect(page.getByRole("link", { name: /Front of House.*View/ })).toBeVisible();
        await expect(page.getByRole("textbox", { name: "Department name" })).toHaveCount(0);
        await checkLayout(`${width} directory`);
        if (screenshots) await page.screenshot({ path: `${screenshots}/after-directory-${width}.png`, fullPage: true });

        const filters = page.getByRole("form", { name: "Filter departments" });
        await filters.getByRole("textbox", { name: "Search departments" }).fill("no-such-department");
        await filters.getByRole("button", { name: "Show departments" }).click();
        await expect(page.getByText("No departments match these filters.")).toBeVisible();
        await checkLayout(`${width} filtered empty`);

        await page.goto(detail);
        await expect(page.getByRole("heading", { name: "Front of House", exact: true })).toBeVisible();
        await expect(page.getByRole("textbox", { name: "Department name" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: /Barista.*Manage role/ })).toBeVisible();
        await expect(page.getByRole("region", { name: "Job roles" }))
          .toContainText("Automatic: any linked worker. Manual: any linked worker.");
        await checkLayout(`${width} department detail`);
        if (screenshots) await page.screenshot({ path: `${screenshots}/after-department-${width}.png`, fullPage: true });
        await page.getByRole("button", { name: "Edit department details" }).click();
        await checkLayout(`${width} department edit`);
        await page.getByRole("textbox", { name: "Department name" }).fill("Unsaved");
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.getByRole("button", { name: "Discard changes" }).click();
        await expect(page.getByRole("button", { name: "Edit department details" })).toBeFocused();

        await page.goto(role);
        await expect(page.getByRole("heading", { name: "Barista", exact: true })).toBeVisible();
        await expect(page.getByRole("combobox", { name: "Automatic assignment" })).toHaveCount(0);
        await checkLayout(`${width} role detail`);
        if (screenshots) await page.screenshot({ path: `${screenshots}/after-role-${width}.png`, fullPage: true });
        await page.getByRole("button", { name: "Edit automatic assignment" }).click();
        await checkLayout(`${width} role edit`);
        if (screenshots) await page.screenshot({ path: `${screenshots}/after-role-edit-${width}.png`, fullPage: true });
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.getByRole("button", { name: "Deactivate role" }).click();
        await expect(page.getByLabel("I confirm this role status change.")).not.toBeChecked();
        await checkLayout(`${width} role status confirmation`);
        if (screenshots) await page.screenshot({ path: `${screenshots}/after-confirmation-${width}.png`, fullPage: true });
        await page.getByRole("button", { name: "Cancel", exact: true }).click();

        await page.goto(`/settings/departments/${longDepartmentId}?business=${businessId}&venue=${venueIds[0]}`);
        await expect(page.getByRole("heading", { name: longName, exact: true })).toBeVisible();
        await checkLayout(`${width} long department`);
        await page.goto(`/settings/departments/${longDepartmentId}/roles/${longRoleId}?business=${businessId}&venue=${venueIds[0]}`);
        await expect(page.getByRole("heading", { name: longRole, exact: true })).toBeVisible();
        await checkLayout(`${width} long role`);
      }

      await page.goto(directory);
      const filters = page.getByRole("form", { name: "Filter departments" });
      await filters.getByRole("combobox", { name: "Venue" }).selectOption(emptyVenue);
      await filters.getByRole("button", { name: "Show departments" }).click();
      await expect(page.getByText("No departments are available to you at this venue.")).toBeVisible();
      await filters.getByRole("combobox", { name: "Venue" }).selectOption(venueIds[0]);
      await filters.getByRole("button", { name: "Show departments" }).click();
      await page.goto(`/settings/departments/${inactiveId}?business=${businessId}&venue=${venueIds[0]}`);
      await expect(page.getByText("No job roles have been added to this department.")).toBeVisible();
      await page.goto(`/settings/departments/${pausedDepartmentId}/roles/${pausedRoleId}?business=${businessId}&venue=${venueIds[0]}`);
      await expect(page.getByText("Reactivate this department before saving changes to this active role.")).toBeVisible();
      await page.getByRole("button", { name: "Edit role details" }).click();
      await page.getByLabel("Role name").fill("Cannot save while paused");
      await page.getByRole("button", { name: "Save role" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("Reactivate the department before saving an active role.");
      const pausedRole = await admin.from("job_roles").select("name").eq("id", pausedRoleId).single();
      expect(pausedRole.error).toBeNull();
      expect(pausedRole.data.name).toBe("Paused role");
      await page.goto(`/settings/departments/${randomUUID()}?business=${businessId}&venue=${venueIds[0]}`);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await page.goto(`/settings/departments/${departmentIds[2]}?business=${businessId}&venue=${venueIds[0]}`);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await page.goto(directory);
      await filters.getByRole("combobox", { name: "Sort by" }).selectOption("roles");
      await filters.getByRole("button", { name: "Show departments" }).click();
      await expect(page.getByRole("main").locator("ul > li").first()).toContainText("Front of House");
      await filters.getByRole("combobox", { name: "Status" }).selectOption("inactive");
      await filters.getByRole("button", { name: "Show departments" }).click();
      await expect(page.getByRole("link", { name: /Night service.*Inactive.*View/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Front of House.*View/ })).toHaveCount(0);

      await page.goto(detail);
      await page.getByRole("button", { name: "Add role", exact: true }).click();
      const wrongVenueCreate = page.getByRole("form", { name: "Create job role" });
      await wrongVenueCreate.locator('input[name="department_id"]')
        .evaluate((input, value) => { input.value = value; }, departmentIds[2]);
      await wrongVenueCreate.getByLabel("Role name").fill("Wrong venue role");
      await wrongVenueCreate.getByRole("button", { name: "Create role" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("permission");
      const wrongVenueRoles = await admin.from("job_roles").select("id")
        .eq("department_id", departmentIds[2]).eq("name", "Wrong venue role");
      expect(wrongVenueRoles.error).toBeNull();
      expect(wrongVenueRoles.data).toEqual([]);

      await page.goto(role);
      await page.getByRole("button", { name: "Edit automatic assignment" }).click();
      const wrongVenueRestriction = page.getByRole("form", { name: "Edit automatic assignment" });
      await wrongVenueRestriction.locator('input[name="department_id"]')
        .evaluate((input, value) => { input.value = value; }, departmentIds[2]);
      await wrongVenueRestriction.locator('input[name="job_role_id"]')
        .evaluate((input, value) => { input.value = value; }, otherRoleId);
      await wrongVenueRestriction.locator('input[name="expected_name"]')
        .evaluate((input) => { input.value = "Other venue role"; });
      await wrongVenueRestriction.getByLabel("Automatic assignment").selectOption("true");
      await wrongVenueRestriction.getByRole("button", { name: "Save automatic assignment" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("permission");
      const otherRestriction = await admin.from("job_roles").select("restrict_auto_assignment")
        .eq("id", otherRoleId).single();
      expect(otherRestriction.error).toBeNull();
      expect(otherRestriction.data.restrict_auto_assignment).toBe(false);

      await page.goto(`${directory}&status=invalid`);
      await expect(page.getByRole("main").getByRole("alert")).toContainText("filters");
      await page.getByRole("link", { name: "Reset filters" }).click();
      await page.getByRole("main").getByRole("link", { name: "Venue settings", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Venue settings" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Roster planning week settings" })).toBeVisible();
      await page.getByRole("link", { name: "Open departments and roles" }).click();
      await expect(page.getByRole("heading", { name: "Departments and roles" })).toBeVisible();
      await page.getByRole("link", { name: "Department help" }).click();
      await expect(page.getByRole("heading", { name: "Departments and roles" })).toBeVisible();
      await page.goto(directory);
      await filters.getByRole("textbox", { name: "Search departments" }).focus();
      await page.keyboard.type("Front of House");
      await page.keyboard.press("Enter");
      const selected = page.getByRole("link", { name: /Front of House.*View/ });
      await selected.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Front of House", exact: true })).toBeVisible();
      await page.getByRole("link", { name: /Barista.*Manage role/ }).click();
      await page.getByRole("button", { name: "Edit role details" }).click();
      await page.getByLabel("Role name").fill("Senior Barista");
      await page.getByRole("button", { name: "Save role" }).click();
      await expect(page.getByRole("heading", { name: "Senior Barista", exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: "Senior Barista", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Back to Front of House" }).click();
      await page.getByRole("link", { name: "Back to departments" }).click();
      await expect(filters.getByRole("textbox", { name: "Search departments" })).toHaveValue("Front of House");
      await expect(filters.getByRole("combobox", { name: "Venue" })).toHaveValue(venueIds[0]);
      await page.getByRole("link", { name: /Front of House.*View/ }).click();
      await page.getByRole("button", { name: "Edit department details" }).focus();
      await page.keyboard.press("Enter");
      await page.getByLabel("Department name").fill("Stale name");

      const competingContext = await browser.newContext({ baseURL: appUrl });
      contexts.push(competingContext);
      const competingPage = await competingContext.newPage();
      await signIn(competingPage, `owner-${suffix}@example.test`, password);
      await competingPage.goto(detail);
      await competingPage.getByRole("button", { name: "Edit department details" }).click();
      await competingPage.getByLabel("Department name").fill("Front team");
      await competingPage.getByRole("button", { name: "Save department" }).click();
      await expect(competingPage.getByRole("heading", { name: "Front team", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Save department" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("changed while you were editing");
      expect((await admin.from("departments").select("name").eq("id", departmentIds[0]).single()).data.name).toBe("Front team");

      await page.goto(role);
      await page.getByRole("button", { name: "Edit automatic assignment" }).click();
      await page.getByRole("form", { name: "Edit automatic assignment" }).getByLabel("Automatic assignment").selectOption("true");
      await competingPage.goto(role);
      await competingPage.getByRole("button", { name: "Edit manual assignment" }).click();
      await competingPage.getByRole("form", { name: "Edit manual assignment" }).getByLabel("Manual assignment").selectOption("true");
      await competingPage.getByRole("button", { name: "Save manual assignment" }).click();
      await expect(competingPage.getByRole("status").filter({ hasText: "Manual assignment setting saved." })).toBeVisible();
      await page.getByRole("button", { name: "Save automatic assignment" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("changed while you were editing");
      const restrictions = await admin.from("job_roles").select("restrict_auto_assignment, restrict_manual_assignment")
        .eq("id", baristaId).single();
      expect(restrictions.data).toEqual({ restrict_auto_assignment: false, restrict_manual_assignment: true });
      await competingPage.goto(detail);
      await expect(competingPage.getByRole("region", { name: "Job roles" }))
        .toContainText("Automatic: qualified workers only (manual restriction). Manual: qualified workers only.");

      const managerContext = await browser.newContext({ baseURL: appUrl });
      contexts.push(managerContext);
      const manager = await managerContext.newPage();
      await signIn(manager, `member-${suffix}@example.test`, password);
      await manager.goto(directory);
      await expect(manager.getByRole("link", { name: /Front team.*View/ })).toBeVisible();
      await expect(manager.getByRole("link", { name: /Back of House.*View/ })).toHaveCount(0);
      await expect(manager.getByRole("button", { name: "Add department" })).toHaveCount(0);
      await manager.goto(`/settings/departments/${departmentIds[1]}?business=${businessId}&venue=${venueIds[0]}`);
      await expect(manager.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await manager.goto(`/settings/departments/${outsideDepartment}?business=${businessId}&venue=${venueIds[0]}`);
      await expect(manager.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await manager.goto(detail);
      await expect(manager.getByRole("button", { name: "Edit department details" })).toHaveCount(0);
      await manager.goto(role);
      await manager.getByRole("button", { name: "Edit role details" }).click();
      const forged = manager.getByRole("form", { name: "Edit role details" });
      await forged.locator('input[name="department_id"]').evaluate((input, value) => { input.value = value; }, departmentIds[1]);
      await forged.locator('input[name="job_role_id"]').evaluate((input, value) => { input.value = value; }, cookId);
      await forged.locator('input[name="expected_name"]').evaluate((input) => { input.value = "Cook"; });
      await forged.getByLabel("Role name").fill("Forged role");
      await forged.getByRole("button", { name: "Save role" }).click();
      await expect(manager.getByRole("main").getByRole("alert")).toContainText("permission");
      expect((await admin.from("job_roles").select("name").eq("id", cookId).single()).data.name).toBe("Cook");
      await manager.goto(role);
      await manager.getByRole("button", { name: "Edit role details" }).click();
      await manager.getByLabel("Role name").fill("No longer permitted");
      expect((await admin.from("business_memberships").update(scopes.boh_manager)
        .eq("business_id", businessId).eq("user_id", userIds[1])).error).toBeNull();
      await manager.getByRole("button", { name: "Save role" }).click();
      await expect(manager.getByRole("main").getByRole("alert")).toContainText("permission");
      await expect(manager.getByRole("link", { name: /Back of House.*View/ })).toBeVisible();
      expect((await admin.from("job_roles").select("name").eq("id", baristaId).single()).data.name).toBe("Senior Barista");

      expect((await admin.from("business_memberships").update(scopes.general_manager)
        .eq("business_id", businessId).eq("user_id", userIds[1])).error).toBeNull();
      await manager.goto(directory);
      await expect(manager.getByRole("main").getByRole("alert")).toContainText("venue");
      await expect(manager.getByRole("link", { name: /Front team.*View/ })).toHaveCount(0);
      await manager.goto(`/settings/departments?business=${businessId}&venue=${venueIds[1]}`);
      await manager.getByRole("link", { name: /Front of House.*View/ }).click();
      await expect(manager.getByRole("button", { name: "Edit department details" })).toBeVisible();
      await manager.getByRole("link", { name: /Other venue role.*Manage role/ }).click();
      await manager.getByRole("button", { name: "Edit role details" }).click();
      await manager.getByLabel("Role name").fill("Venue two host");
      await manager.getByRole("button", { name: "Save role" }).click();
      await expect(manager.getByRole("heading", { name: "Venue two host", exact: true })).toBeVisible();
      await manager.reload();
      await expect(manager.getByRole("heading", { name: "Venue two host", exact: true })).toBeVisible();
      expect((await admin.from("business_memberships").update({ role: "admin", venue_id: null, department_id: null })
        .eq("business_id", businessId).eq("user_id", userIds[1])).error).toBeNull();
      await manager.goto(detail);
      await manager.getByRole("button", { name: "Edit department details" }).click();
      await manager.getByLabel("Department name").fill("Admin front");
      await manager.getByRole("button", { name: "Save department" }).click();
      await expect(manager.getByRole("heading", { name: "Admin front", exact: true })).toBeVisible();
      await manager.reload();
      await expect(manager.getByRole("heading", { name: "Admin front", exact: true })).toBeVisible();
      expect((await admin.from("business_memberships").update(scopes.employee)
        .eq("business_id", businessId).eq("user_id", userIds[1])).error).toBeNull();
      await manager.goto(`/settings/departments?business=${businessId}`);
      await expect(manager).toHaveURL(/\/\?error=permission/);
      await expect(manager.getByRole("main").getByRole("alert")).toContainText("permission");
    } finally {
      for (const context of contexts) await context.close();
      await assertBusinessFixturesPreserved(admin, outsideBusiness);
    }
  });
});

test("Department loading and failed saves are announced and recover without writing", async ({ page }) => {
  test.setTimeout(180_000);
  await withPermissionFixtures("employee", async ({ suffix, password, businessId, venueIds, departmentIds }) => {
    await signIn(page, `owner-${suffix}@example.test`, password);
    let releaseNavigation;
    const navigationHeld = new Promise((resolve) => { releaseNavigation = resolve; });
    await page.route("**/settings/departments**", async (route) => {
      const headers = route.request().headers();
      if (headers.rsc === "1" && !headers["next-router-prefetch"]) await navigationHeld;
      await route.continue();
    });
    try {
      await page.getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Departments & roles", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Loading…" })).toBeVisible();
      releaseNavigation();
      await expect(page.getByRole("heading", { name: "Departments and roles" })).toBeVisible();
    } finally {
      releaseNavigation();
      await page.unrouteAll({ behavior: "wait" });
    }

    await page.goto(`/settings/departments/${departmentIds[0]}?business=${businessId}&venue=${venueIds[0]}`);
    await page.getByRole("button", { name: "Edit department details" }).click();
    await page.getByLabel("Department name").fill("Unsent department");
    await page.route("**/settings/departments/**", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        await route.fulfill({ status: 500, contentType: "text/plain", body: "Simulated outage" });
      } else {
        await route.continue();
      }
    });
    await page.getByRole("button", { name: "Save department" }).click();
    await expect(page.getByRole("heading", { name: "Departments unavailable" })).toBeFocused();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("check the record before trying again");
    expect((await admin.from("departments").select("name").eq("id", departmentIds[0]).single()).data.name)
      .toBe("Front of House");
    await page.unroute("**/settings/departments/**");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Front of House", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit department details" }).click();
    await page.getByLabel("Department name").fill("Recovered department");
    await page.getByRole("button", { name: "Save department" }).click();
    await expect(page.getByRole("heading", { name: "Recovered department", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Recovered department", exact: true })).toBeVisible();
  });
});

test("departmental managers keep separate rosters for shared staff with an owner overview", async ({ page, browser }) => {
      const suffix = randomUUID();
      const password = `${randomBytes(18).toString("base64url")}aA1!`;
      const userIds = [];
      const businessId = randomUUID();
      const venueId = randomUUID();
      const [fohId, bohId] = [randomUUID(), randomUUID()];
      const contexts = [];
      try {
        for (const name of ["owner", "foh", "boh"]) {
          const result = await admin.auth.admin.createUser({
            email: `${name}-${suffix}@example.test`, password, email_confirm: true,
          });
          expect(result.error).toBeNull();
          userIds.push(result.data.user.id);
        }
        expect((await admin.from("businesses").insert({ id: businessId, name: `Delegation ${suffix}` })).error).toBeNull();
        expect((await admin.from("venues").insert({ id: venueId, business_id: businessId, name: "Harbour" })).error).toBeNull();
        expect((await admin.from("departments").insert([
          { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
          { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
        ])).error).toBeNull();
        expect((await admin.from("business_memberships").insert([
          { business_id: businessId, user_id: userIds[0], role: "owner" },
          { business_id: businessId, user_id: userIds[1], role: "foh_manager", venue_id: venueId, department_id: fohId },
          { business_id: businessId, user_id: userIds[2], role: "boh_manager", venue_id: venueId, department_id: bohId },
        ])).error).toBeNull();
        expect((await admin.from("employees").insert({
          business_id: businessId, venue_id: venueId, department_id: fohId, name: "Shared worker", role_title: "Server",
        })).error).toBeNull();

        await signIn(page, `owner-${suffix}@example.test`, password);
        await page.goto("/people");
        await page.getByRole("link", { name: "View profile for Shared worker" }).click();
        await page.getByRole("button", { name: "Edit departments" }).click();
        const membership = page.getByRole("form", { name: "Departments for Shared worker" });
        await expect(membership.getByRole("checkbox", { name: "Front of House (primary)" })).toBeChecked();
        await expect(membership.getByRole("checkbox", { name: "Front of House (primary)" })).toBeDisabled();
        await membership.getByRole("checkbox", { name: "Back of House" }).check();
        await membership.getByRole("button", { name: "Save departments" }).click();
        await expect(page.getByRole("status")).toHaveText("Department membership saved.");
        const links = await admin.from("employee_departments").select("department_id").eq("business_id", businessId);
        expect(links.error).toBeNull();
        expect(links.data.map((link) => link.department_id).sort()).toEqual([fohId, bohId].sort());
        await expect(page.getByRole("region", { name: "Roles & departments" }))
          .toContainText(/Departments: (Back of House, Front of House|Front of House, Back of House)/);

        const managerPage = async (name) => {
          const context = await browser.newContext({ baseURL: appUrl });
          contexts.push(context);
          const managerTab = await context.newPage();
          await signIn(managerTab, `${name}-${suffix}@example.test`, password);
          await expect(managerTab.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();
          return managerTab;
        };

        const boh = await managerPage("boh");
        await boh.goto("/roster");
        expect(await boh.locator("#department-filter option").allTextContents()).toEqual(["Back of House"]);
        await boh.locator('input[name="role_title"]').fill("Prep");
        await boh.locator('select[name="employee_id"]').selectOption({ label: "Shared worker · Server" });
        await boh.getByRole("button", { name: "Save draft shift" }).click();
        await expect(boh.getByRole("status")).toHaveText("Shift saved to the draft roster.");
        await boh.goto("/people");
        await boh.getByRole("link", { name: "View profile for Shared worker" }).click();
        const sharedForBoh = boh.getByRole("region", { name: "Overview" });
        await expect(sharedForBoh).toContainText("managed by this person's primary department");
        await expect(sharedForBoh.getByRole("button", { name: "Save employee" })).toHaveCount(0);
        await expect(boh.getByRole("form", { name: "Departments for Shared worker" })).toHaveCount(0);

        const foh = await managerPage("foh");
        await foh.goto(`/roster?department=${bohId}`);
        expect(await foh.locator("#department-filter option").allTextContents()).toEqual(["Front of House"]);
        await foh.locator('input[name="role_title"]').fill("Host");
        await foh.getByRole("button", { name: "Save draft shift" }).click();
        await expect(foh.getByRole("status")).toHaveText("Shift saved to the draft roster.");
        await expect(foh.locator("article", { hasText: "Prep" })).toHaveCount(0);
        await expect(foh.getByText("Host", { exact: true })).toBeVisible();

        const stored = await admin.from("shifts").select("department_id, role_title, employee_id").eq("business_id", businessId);
        expect(stored.error).toBeNull();
        expect(stored.data.map((shift) => `${shift.department_id === bohId ? "BOH" : "FOH"}:${shift.role_title}`).sort())
          .toEqual(["BOH:Prep", "FOH:Host"]);

        await page.goto("/roster?department=all");
        await expect(page.locator("#department-filter")).toHaveValue("all");
        await expect(page.locator("article", { hasText: "Prep" })).toContainText("Back of House");
        await expect(page.getByText("Host", { exact: true })).toBeVisible();
        await expect(page.getByText(/1 assigned\s*·\s*1 open/)).toBeVisible();
      } finally {
        try {
          for (const context of contexts) if (browser.isConnected()) await context.close();
        } finally {
          expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
          await assertBusinessFixturesPreserved(admin, businessId);
          for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
        }
      }
});

test("qualified roles and primary role control restricted automatic assignment", async ({ page }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const venueId = randomUUID();
  const departmentId = randomUUID();
  const baristaId = randomUUID();
  const serverId = randomUUID();
  const unqualifiedId = randomUUID();
  const qualifiedId = randomUUID();
  let ownerId;
  try {
    const owner = await admin.auth.admin.createUser({
      email: `roles-owner-${suffix}@example.test`, password, email_confirm: true,
    });
    expect(owner.error).toBeNull();
    ownerId = owner.data.user.id;
    expect((await admin.from("businesses").insert({ id: businessId, name: `Roles ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({ id: venueId, business_id: businessId, name: "Harbour" })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: ownerId, role: "owner",
    })).error).toBeNull();
    expect((await admin.from("job_roles").insert([
      { id: baristaId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "Barista" },
      { id: serverId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: unqualifiedId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "A Unqualified", role_title: "Barista" },
      { id: qualifiedId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "B Qualified", role_title: "Server" },
    ])).error).toBeNull();

    await signIn(page, `roles-owner-${suffix}@example.test`, password);
    await page.goto(`/settings/departments/${departmentId}/roles/${baristaId}?business=${businessId}&venue=${venueId}`);
    await page.getByRole("button", { name: "Edit automatic assignment" }).click();
    const autoForm = page.getByRole("form", { name: "Edit automatic assignment" });
    await autoForm.getByRole("combobox", { name: "Automatic assignment" }).selectOption("true");
    await autoForm.getByRole("button", { name: "Save automatic assignment" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Automatic assignment setting saved." })).toBeVisible();
    const restriction = await admin.from("job_roles").select("restrict_auto_assignment").eq("id", baristaId).single();
    expect(restriction.error).toBeNull();
    expect(restriction.data.restrict_auto_assignment).toBe(true);

    await page.goto(`/roster?department=${departmentId}`);
    await page.locator('input[name="role_title"]').fill("Barista");
    await page.locator('select[name="employee_id"]').selectOption("auto");
    await expect(page.getByText("Automatic selection checks qualifications, overlaps, submitted availability, date blocks and approved leave. Unsubmitted availability is unknown.")).toBeVisible();
    await page.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("No eligible worker");
    const none = await admin.from("shifts").select("id").eq("business_id", businessId);
    expect(none.error).toBeNull();
    expect(none.data).toHaveLength(0);

    await page.goto("/people");
    await page.getByRole("link", { name: "View profile for B Qualified" }).click();
    await page.getByRole("button", { name: "Edit qualified roles in Front of House" }).click();
    const eligible = page.getByRole("form", { name: "Eligible roles for B Qualified in Front of House" });
    await eligible.getByRole("checkbox", { name: "Barista" }).check();
    await eligible.getByRole("checkbox", { name: "Server" }).check();
    await eligible.getByRole("button", { name: "Save eligible roles" }).click();
    await expect(page.getByRole("status")).toHaveText("Eligible roles saved.");
    await page.getByRole("button", { name: "Edit primary role" }).click();
    const primary = page.getByRole("form", { name: "Primary role for B Qualified" });
    await primary.getByRole("combobox", { name: "Primary qualified role" }).selectOption(baristaId);
    await primary.getByRole("button", { name: "Set primary role" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Primary role saved." })).toBeVisible();
    const storedRoles = await admin.from("employee_job_roles").select("job_role_id, is_primary").eq("employee_id", qualifiedId);
    expect(storedRoles.error).toBeNull();
    expect(storedRoles.data).toEqual(expect.arrayContaining([
      { job_role_id: baristaId, is_primary: true },
      { job_role_id: serverId, is_primary: false },
    ]));
    expect(storedRoles.data).toHaveLength(2);
    const profile = await admin.from("employees").select("role_title").eq("id", qualifiedId).single();
    expect(profile.error).toBeNull();
    expect(profile.data.role_title).toBe("Barista");

    await page.getByRole("link", { name: "Back to people" }).click();
    const filters = page.getByRole("form", { name: "Directory filters" });
    await filters.getByRole("textbox", { name: "Role (exact title or qualification)" }).fill("Server");
    await filters.getByRole("button", { name: "Filter team" }).click();
    await expect(page.getByRole("link", { name: "View profile for B Qualified" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View profile for A Unqualified" })).toHaveCount(0);

    await page.goto(`/roster?department=${departmentId}`);
    await page.locator('input[name="role_title"]').fill("barista");
    await page.locator('select[name="employee_id"]').selectOption("auto");
    await page.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    const shift = await admin.from("shifts").select("employee_id, role_title").eq("business_id", businessId).single();
    expect(shift.error).toBeNull();
    expect(shift.data).toEqual({ employee_id: qualifiedId, role_title: "barista" });
    await page.locator('input[name="role_title"]').fill("Barista");
    await page.locator('select[name="employee_id"]').selectOption("auto");
    await page.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("No eligible worker");

    const signedIn = createClient(apiUrl, anonKey, options);
    const login = await signedIn.auth.signInWithPassword({ email: `roles-owner-${suffix}@example.test`, password });
    expect(login.error).toBeNull();
    const concurrentDetails = {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: departmentId,
      p_role_title: "Barista", p_start_local: "2032-03-15 09:00", p_end_local: "2032-03-15 13:00",
      p_break_minutes: 0,
    };
    const concurrent = await Promise.all([
      signedIn.rpc("save_shift_auto_assign", concurrentDetails),
      signedIn.rpc("save_shift_auto_assign", concurrentDetails),
    ]);
    expect(concurrent.filter((result) => !result.error)).toHaveLength(1);
    expect(concurrent.filter((result) => result.error?.message === "No eligible employee available for automatic assignment")).toHaveLength(1);
    const concurrentShifts = await admin.from("shifts").select("id, employee_id")
      .eq("business_id", businessId).eq("role_title", "Barista");
    expect(concurrentShifts.error).toBeNull();
    expect(concurrentShifts.data).toHaveLength(1);
    expect(concurrentShifts.data[0].employee_id).toBe(qualifiedId);

    await page.goto(`/people/${qualifiedId}?business=${businessId}&venue=${venueId}`);
    await page.getByRole("button", { name: "Edit qualified roles in Front of House" }).click();
    await eligible.getByRole("checkbox", { name: "Barista" }).uncheck();
    await eligible.getByRole("button", { name: "Save eligible roles" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Choose another primary role");
    await page.getByRole("button", { name: "Edit primary role" }).click();
    await primary.getByRole("combobox", { name: "Primary qualified role" }).selectOption(serverId);
    await primary.getByRole("button", { name: "Set primary role" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Primary role saved." })).toBeVisible();
    await page.getByRole("button", { name: "Edit qualified roles in Front of House" }).click();
    await eligible.getByRole("checkbox", { name: "Barista" }).uncheck();
    await eligible.getByRole("button", { name: "Save eligible roles" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Eligible roles saved." })).toBeVisible();
    const remaining = await admin.from("employee_job_roles").select("job_role_id, is_primary").eq("employee_id", qualifiedId);
    expect(remaining.error).toBeNull();
    expect(remaining.data).toEqual([{ job_role_id: serverId, is_primary: true }]);
  } finally {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    if (ownerId) expect((await admin.auth.admin.deleteUser(ownerId)).error).toBeNull();
  }
});

test("manual role restrictions protect open shifts without changing automatic-only policy", async ({ page }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const venueId = randomUUID();
  const departmentId = randomUUID();
  const roleId = randomUUID();
  const unqualifiedId = randomUUID();
  const qualifiedId = randomUUID();
  let ownerId;
  try {
    const owner = await admin.auth.admin.createUser({
      email: `manual-owner-${suffix}@example.test`, password, email_confirm: true,
    });
    expect(owner.error).toBeNull();
    ownerId = owner.data.user.id;
    expect((await admin.from("businesses").insert({ id: businessId, name: `Manual ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: ownerId, role: "owner",
    })).error).toBeNull();
    expect((await admin.from("job_roles").insert({
      id: roleId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "Barista",
    })).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: unqualifiedId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "A Unqualified", role_title: "Barista" },
      { id: qualifiedId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "B Qualified", role_title: "Barista" },
    ])).error).toBeNull();

    await signIn(page, `manual-owner-${suffix}@example.test`, password);
    const roleUrl = `/settings/departments/${departmentId}/roles/${roleId}?business=${businessId}&venue=${venueId}`;
    await page.goto(roleUrl);
    await expect(page.getByRole("region", { name: "Assignment restrictions" })).toContainText("Any linked worker");
    await page.getByRole("button", { name: "Edit automatic assignment" }).click();
    const autoForm = page.getByRole("form", { name: "Edit automatic assignment" });
    await autoForm.getByRole("combobox", { name: "Automatic assignment" }).selectOption("true");
    await autoForm.getByRole("button", { name: "Save automatic assignment" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Automatic assignment setting saved." })).toBeVisible();

    const roster = `/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`;
    await page.goto(roster);
    const add = page.getByRole("form", { name: "Add draft shift" });
    await add.getByLabel("Role").fill("Barista");
    await add.getByLabel("Team member").selectOption(unqualifiedId);
    await add.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    await expect(page.getByText(/1 assigned\s*·\s*0 open/)).toBeVisible();

    await page.goto(roleUrl);
    await page.getByRole("button", { name: "Edit manual assignment" }).click();
    const manual = page.getByRole("form", { name: "Edit manual assignment" });
    await manual.getByRole("combobox", { name: "Manual assignment" }).selectOption("true");
    await manual.getByRole("button", { name: "Save manual assignment" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Manual assignment setting saved." })).toBeVisible();
    await page.getByRole("button", { name: "Edit automatic assignment" }).click();
    await autoForm.getByRole("combobox", { name: "Automatic assignment" }).selectOption("false");
    await autoForm.getByRole("button", { name: "Save automatic assignment" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Automatic assignment setting saved." })).toBeVisible();
    await expect(page.getByRole("region", { name: "Assignment restrictions" }))
      .toContainText("Follows manual restriction (qualified workers only)");
    const restriction = await admin.from("job_roles")
      .select("restrict_auto_assignment, restrict_manual_assignment").eq("id", roleId).single();
    expect(restriction.error).toBeNull();
    expect(restriction.data).toEqual({ restrict_auto_assignment: false, restrict_manual_assignment: true });

    await page.goto(roster);
    await add.getByLabel("Role").fill("barista");
    await add.getByLabel("Team member").selectOption(unqualifiedId);
    await add.getByLabel("Starts").fill("2032-03-16T08:00");
    await add.getByLabel("Ends").fill("2032-03-16T16:00");
    await add.getByRole("button", { name: "Save draft shift" }).click();
    await expect(add.getByText("Choose a worker qualified for this role, or leave the shift open.")).toBeVisible();
    await expect(add.getByLabel("Role")).toHaveValue("barista");
    await expect(add.getByLabel("Team member")).toHaveValue(unqualifiedId);
    await expect(add.getByLabel("Starts")).toHaveValue("2032-03-16T08:00");

    await add.getByLabel("Team member").selectOption("");
    await add.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    await expect(page.getByText(/1 assigned\s*·\s*1 open/)).toBeVisible();
    await expect(page.locator("#open-shifts")).toContainText("1 to fill");
    const open = await admin.from("shifts").select("id, employee_id").eq("business_id", businessId)
      .is("employee_id", null).single();
    expect(open.error).toBeNull();

    await page.getByRole("link", { name: "Edit open shift" }).click();
    const edit = page.getByRole("form", { name: "Edit draft shift" });
    await expect(edit.getByLabel("Role")).toHaveValue("barista");
    await expect(edit.getByLabel("Starts")).toHaveValue("2032-03-16T08:00");
    await edit.getByLabel("Team member").selectOption(unqualifiedId);
    await edit.getByRole("button", { name: "Update draft shift" }).click();
    await expect(edit.getByText("Choose a worker qualified for this role, or leave the shift open.")).toBeVisible();
    await expect(edit.getByLabel("Team member")).toHaveValue(unqualifiedId);
    await expect(page.locator("#open-shifts")).toContainText("1 to fill");
    const unchanged = await admin.from("shifts").select("employee_id").eq("id", open.data.id).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data.employee_id).toBeNull();

    await page.goto("/people");
    await page.getByRole("link", { name: "View profile for B Qualified" }).click();
    await page.getByRole("button", { name: "Edit qualified roles in Front of House" }).click();
    const eligible = page.getByRole("form", { name: "Eligible roles for B Qualified in Front of House" });
    await eligible.getByRole("checkbox", { name: "Barista" }).check();
    await eligible.getByRole("button", { name: "Save eligible roles" }).click();
    await expect(page.getByRole("status")).toHaveText("Eligible roles saved.");
    await page.goto(roster);
    await page.getByRole("link", { name: "Edit open shift" }).click();
    await edit.getByLabel("Team member").selectOption(qualifiedId);
    await edit.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft shift updated.");
    await expect(page.getByText(/2 assigned\s*·\s*0 open/)).toBeVisible();
    const filled = await admin.from("shifts").select("employee_id").eq("id", open.data.id).single();
    expect(filled.error).toBeNull();
    expect(filled.data.employee_id).toBe(qualifiedId);

    await page.getByRole("link", { name: "Edit A Unqualified shift" }).click();
    await edit.getByLabel("Ends").fill("2032-03-15T17:00");
    await edit.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft shift updated.");

    await add.getByLabel("Role").fill("Barista");
    await add.getByLabel("Team member").selectOption("auto");
    await add.getByLabel("Starts").fill("2032-03-17T08:00");
    await add.getByLabel("Ends").fill("2032-03-17T16:00");
    await add.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    const automatic = await admin.from("shifts").select("employee_id").eq("business_id", businessId)
      .gte("starts_at", "2032-03-16T21:00:00Z").single();
    expect(automatic.error).toBeNull();
    expect(automatic.data.employee_id).toBe(qualifiedId);
  } finally {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    if (ownerId) expect((await admin.auth.admin.deleteUser(ownerId)).error).toBeNull();
  }
});

test("new open shifts load their saved values when edited", async ({ page }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const venueId = randomUUID();
  const departmentId = randomUUID();
  const employeeId = randomUUID();
  let ownerId;
  try {
    const owner = await admin.auth.admin.createUser({
      email: `new-open-owner-${suffix}@example.test`, password, email_confirm: true,
    });
    expect(owner.error).toBeNull();
    ownerId = owner.data.user.id;
    expect((await admin.from("businesses").insert({ id: businessId, name: `New open ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "UTC",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: ownerId, role: "owner",
    })).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
      name: "New open worker", role_title: "Server",
    })).error).toBeNull();

    await signIn(page, `new-open-owner-${suffix}@example.test`, password);
    await page.goto(`/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`);
    const add = page.getByRole("form", { name: "Add draft shift" });
    await add.getByLabel("Role").fill("New open");
    await add.getByLabel("Starts").fill("2032-03-16T09:00");
    await add.getByLabel("Ends").fill("2032-03-16T12:00");
    await add.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    await expect(add.getByLabel("Role")).toHaveValue("");
    await expect(page.locator("#open-shifts")).toContainText("1 to fill");

    await page.getByRole("link", { name: "Edit open shift" }).click();
    const edit = page.getByRole("form", { name: "Edit draft shift" });
    await expect(edit.getByLabel("Role")).toHaveValue("New open");
    await expect(edit.getByLabel("Starts")).toHaveValue("2032-03-16T09:00");
    await expect(edit.getByLabel("Ends")).toHaveValue("2032-03-16T12:00");
    await edit.getByLabel("Team member").selectOption(employeeId);
    await edit.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft shift updated.");
    await expect(page.locator("#open-shifts")).toContainText("0 to fill");
    const shift = await admin.from("shifts").select("employee_id, role_title, starts_at, ends_at")
      .eq("business_id", businessId).single();
    expect(shift.error).toBeNull();
    expect(shift.data.employee_id).toBe(employeeId);
    expect(shift.data.role_title).toBe("New open");
    expect(new Date(shift.data.starts_at).toISOString()).toBe("2032-03-16T09:00:00.000Z");
    expect(new Date(shift.data.ends_at).toISOString()).toBe("2032-03-16T12:00:00.000Z");
  } finally {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    if (ownerId) expect((await admin.auth.admin.deleteUser(ownerId)).error).toBeNull();
  }
});

test("employees save recurring availability and the roster displays overnight gaps", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const venueId = randomUUID();
  const fohId = randomUUID();
  const bohId = randomUUID();
  const workerId = randomUUID();
  const unsubmittedId = randomUUID();
  const userIds = [];
  const failures = [];
  let workerContext;

  try {
    for (const name of ["availability-owner", "availability-worker", "availability-boh"]) {
      const user = await admin.auth.admin.createUser({
        email: `${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(user.error).toBeNull();
      userIds.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Availability ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: userIds[2], role: "employee", venue_id: venueId, department_id: bohId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Available worker", role_title: "Server" },
      { id: unsubmittedId, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Unsubmitted worker", role_title: "Server" },
    ])).error).toBeNull();

    workerContext = await browser.newContext({ baseURL: appUrl });
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, `availability-worker-${suffix}@example.test`, password);
    await workerPage.goto("/availability");
    await expect(workerPage.getByText("No active employee profile is linked", { exact: false })).toBeVisible();

    await signIn(page, `availability-owner-${suffix}@example.test`, password);
    await page.goto("/people");
    await page.getByRole("link", { name: "View profile for Available worker" }).click();
    await page.getByRole("button", { name: "Edit account link" }).click();
    const account = page.getByRole("form", { name: "Account for Available worker" });
    await expect(account.getByRole("option", { name: `availability-boh-${suffix}@example.test` })).toHaveCount(0);
    await account.getByRole("combobox", { name: "Linked business member" }).selectOption(userIds[1]);
    await account.getByRole("button", { name: "Save account link" }).click();
    await expect(page.getByRole("status")).toHaveText("Account link saved.");
    const linked = await admin.from("employees").select("auth_user_id").eq("id", workerId).single();
    expect(linked.error).toBeNull();
    expect(linked.data.auth_user_id).toBe(userIds[1]);

    await workerPage.reload();
    const form = workerPage.getByRole("form", { name: "Recurring availability for Available worker" });
    await expect(form.getByText("No availability has been submitted yet.", { exact: false })).toBeVisible();
    for (let index = 0; index < 3; index += 1) {
      await form.getByRole("button", { name: "Add interval" }).click();
    }
    await form.getByLabel("Day for interval 1").selectOption("1");
    await form.getByLabel("Start for interval 1").fill("09:00");
    await form.getByLabel("End for interval 1").fill("12:00");
    await form.getByLabel("Day for interval 2").selectOption("1");
    await form.getByLabel("Start for interval 2").fill("13:00");
    await form.getByLabel("End for interval 2").fill("17:00");
    await form.getByLabel("Day for interval 3").selectOption("7");
    await form.getByLabel("Start for interval 3").fill("22:00");
    await form.getByLabel("End for interval 3").fill("02:00");
    await form.getByRole("button", { name: "Save availability" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Availability saved.");
    const saved = await admin.from("employee_availability_intervals")
      .select("weekday, start_minute, end_minute").eq("employee_id", workerId);
    expect(saved.error).toBeNull();
    expect(saved.data).toHaveLength(3);
    expect(saved.data).toEqual(expect.arrayContaining([
      { weekday: 1, start_minute: 540, end_minute: 720 },
      { weekday: 1, start_minute: 780, end_minute: 1020 },
      { weekday: 7, start_minute: 1320, end_minute: 120 },
    ]));

    const signedIn = createClient(apiUrl, anonKey, options);
    expect((await signedIn.auth.signInWithPassword({
      email: `availability-worker-${suffix}@example.test`, password,
    })).error).toBeNull();
    const otherWrite = await signedIn.rpc("set_employee_recurring_availability", {
      p_business_id: businessId, p_employee_id: unsubmittedId, p_intervals: [],
    });
    expect(otherWrite.error?.message).toBe("Permission denied");

    await page.goto(`/roster?week=2032-03-15&department=${fohId}`);
    const monday = page.getByLabel("Unavailable Available worker 2032-03-15");
    await expect(monday).toContainText("Unavailable 02:00–09:00");
    await expect(monday).toContainText("Unavailable 12:00–13:00");
    await expect(monday).toContainText("Unavailable 17:00–24:00");
    await expect(page.getByLabel("Unavailable Available worker 2032-03-16")).toHaveText("Unavailable all day");
    await expect(page.getByLabel("Unavailable Available worker 2032-03-21")).toHaveText("Unavailable 00:00–22:00");
    await expect(page.getByRole("row", { name: /Unsubmitted worker/ })).toContainText("Availability not submitted");

    await workerPage.goto(`/roster?week=2032-03-15&department=${fohId}`);
    await expect(workerPage.getByLabel("Unavailable Available worker 2032-03-15")).toBeVisible();
    await expect(workerPage.getByRole("row", { name: /Unsubmitted worker/ })).toHaveCount(0);
    await workerPage.goto("/availability");
    for (let index = 0; index < 3; index += 1) {
      await form.getByRole("button", { name: "Remove interval 1" }).click();
    }
    await form.getByRole("checkbox", { name: /unavailable all week/ }).check();
    await form.getByRole("button", { name: "Save availability" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Availability saved.");
    const empty = await admin.from("employee_availability_intervals").select("id").eq("employee_id", workerId);
    expect(empty.error).toBeNull();
    expect(empty.data).toHaveLength(0);
    await page.reload();
    await expect(page.getByLabel("Unavailable Available worker 2032-03-15")).toHaveText("Unavailable all day");

    await page.goto("/people");
    await page.getByRole("link", { name: "View profile for Available worker" }).click();
    await page.getByRole("button", { name: "Edit account link" }).click();
    await account.getByRole("combobox", { name: "Linked business member" }).selectOption("");
    await account.getByRole("button", { name: "Save account link" }).click();
    await expect(page.getByRole("status")).toHaveText("Account link saved.");
    await workerPage.goto("/availability");
    await expect(workerPage.getByText("No active employee profile is linked", { exact: false })).toBeVisible();
    const afterUnlink = await signedIn.from("employee_availability_patterns").select("employee_id").eq("employee_id", workerId);
    expect(afterUnlink.error).toBeNull();
    expect(afterUnlink.data).toEqual([]);
  } catch (error) {
    failures.push(error);
  }
  try {
    if (workerContext && browser.isConnected()) await workerContext.close();
  } catch (error) {
    failures.push(error);
  }
  try {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length) throw new AggregateError(failures, "Availability scenario or fixture cleanup failed");
});

async function withAvailabilityExceptionFixtures(page, browser, run) {
  page.setDefaultTimeout(20_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const otherBusinessId = randomUUID();
  const venueId = randomUUID();
  const secondVenueId = randomUUID();
  const otherVenueId = randomUUID();
  const fohId = randomUUID();
  const bohId = randomUUID();
  const workerId = randomUUID();
  const userIds = [];
  const failures = [];
  let workerContext;

  try {
    for (const name of ["exceptions-owner", "exceptions-worker", "exceptions-boh", "exceptions-outsider"]) {
      const user = await admin.auth.admin.createUser({
        email: `${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(user.error).toBeNull();
      userIds.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Exceptions ${suffix}` },
      { id: otherBusinessId, name: `Other exceptions ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: secondVenueId, business_id: businessId, name: "Second venue", timezone: "Australia/Perth" },
      { id: otherVenueId, business_id: otherBusinessId, name: "Other", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: userIds[2], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: otherBusinessId, user_id: userIds[3], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: userIds[1], name: "Exception worker", role_title: "Server",
    })).error).toBeNull();

    workerContext = await browser.newContext({ baseURL: appUrl });
    const workerPage = await workerContext.newPage();
    workerPage.setDefaultTimeout(20_000);
    await run({ workerPage, suffix, password, businessId, venueId, secondVenueId, fohId, workerId });
  } catch (error) {
    failures.push(error);
  }
  try {
    if (workerContext && browser.isConnected()) await workerContext.close();
  } catch (error) {
    failures.push(error);
  }
  try {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, [businessId, otherBusinessId]);
    for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length) throw new AggregateError(failures, "Availability exception scenario or cleanup failed");
}

test("employees save work preferences visible to eligible managers with change history", async ({ page, browser }) => {
  await withAvailabilityExceptionFixtures(page, browser, async ({
    workerPage, suffix, password, businessId, venueId, workerId,
  }) => {
    await signIn(page, `exceptions-owner-${suffix}@example.test`, password);
    await page.goto(`/people?venue=${venueId}`);
    await page.getByRole("link", { name: "View profile for Exception worker" }).click();
    const managerView = page.getByRole("region", { name: "Work preferences" });
    await expect(managerView).toContainText("No preferences submitted.");

    await signIn(workerPage, `exceptions-worker-${suffix}@example.test`, password);
    await workerPage.goto(`/availability?venue=${venueId}`);
    const form = workerPage.getByRole("form", { name: "Work preferences for Exception worker" });
    await expect(form.getByLabel("Preferred weekly hours (optional)")).toHaveValue("");
    await expect(form.getByLabel("Email about schedule updates")).toHaveValue("");
    await expect(form.getByLabel("Email about leave decisions")).toHaveValue("");
    await expect(workerPage.getByText("Email delivery is not yet available.", { exact: false })).toBeVisible();
    await form.getByLabel("Preferred weekly hours (optional)").fill("24.75");
    await form.getByLabel("Email about schedule updates").selectOption("true");
    await form.getByLabel("Email about leave decisions").selectOption("false");
    await form.getByRole("button", { name: "Save work preferences" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Work preferences saved.");
    await expect(form.getByLabel("Preferred weekly hours (optional)")).toHaveValue("24.75");
    await expect(form.getByLabel("Email about schedule updates")).toHaveValue("true");
    await expect(form.getByLabel("Email about leave decisions")).toHaveValue("false");
    await workerPage.reload();
    await expect(form.getByLabel("Preferred weekly hours (optional)")).toHaveValue("24.75");
    await expect(form.getByLabel("Email about schedule updates")).toHaveValue("true");
    await expect(form.getByLabel("Email about leave decisions")).toHaveValue("false");

    const profile = await admin.from("employees").select("auth_user_id, employment_type").eq("id", workerId).single();
    expect(profile.error).toBeNull();
    expect(profile.data.employment_type).toBe("casual");
    const stored = await admin.from("employee_preferences")
      .select("preferred_weekly_hours, notify_schedule_email, notify_leave_email")
      .eq("employee_id", workerId).single();
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual({
      preferred_weekly_hours: 24.75, notify_schedule_email: true, notify_leave_email: false,
    });
    const initialHistory = await admin.from("employee_preference_events")
      .select("actor_id, old_values, new_values, created_at").eq("employee_id", workerId);
    expect(initialHistory.error).toBeNull();
    expect(initialHistory.data).toHaveLength(1);
    expect(initialHistory.data[0].actor_id).toBe(profile.data.auth_user_id);
    expect(initialHistory.data[0].old_values).toBeNull();
    expect(initialHistory.data[0].new_values).toEqual(stored.data);
    expect(initialHistory.data[0].created_at).toBeTruthy();

    await page.reload();
    await expect(managerView).toContainText("Preferred weekly hours: 24.75");
    await expect(managerView).toContainText("Schedule emails: Yes");
    await expect(managerView).toContainText("Leave decision emails: No");
    await expect(managerView).toContainText("not contractual limits");

    const workerApi = createClient(apiUrl, anonKey, options);
    const otherManager = createClient(apiUrl, anonKey, options);
    const outsider = createClient(apiUrl, anonKey, options);
    expect((await workerApi.auth.signInWithPassword({
      email: `exceptions-worker-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await otherManager.auth.signInWithPassword({
      email: `exceptions-boh-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await outsider.auth.signInWithPassword({
      email: `exceptions-outsider-${suffix}@example.test`, password,
    })).error).toBeNull();
    for (const client of [otherManager, outsider]) {
      for (const table of ["employee_preferences", "employee_preference_events"]) {
        const hidden = await client.from(table).select("employee_id").eq("employee_id", workerId);
        expect(hidden.error).toBeNull();
        expect(hidden.data).toEqual([]);
      }
      const denied = await client.rpc("save_employee_preferences", {
        p_business_id: businessId, p_venue_id: venueId, p_employee_id: workerId,
        p_preferred_weekly_hours: 8, p_notify_schedule_email: true, p_notify_leave_email: true,
      });
      expect(denied.error?.message).toBe("Permission denied");
    }

    await workerPage.goto(`/availability?venue=${venueId}`);
    await form.getByLabel("Preferred weekly hours (optional)").fill("");
    await form.getByLabel("Email about schedule updates").selectOption("false");
    await form.getByLabel("Email about leave decisions").selectOption("true");
    await form.getByRole("button", { name: "Save work preferences" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Work preferences saved.");
    await workerPage.reload();
    await expect(form.getByLabel("Preferred weekly hours (optional)")).toHaveValue("");
    await expect(form.getByLabel("Email about schedule updates")).toHaveValue("false");
    await expect(form.getByLabel("Email about leave decisions")).toHaveValue("true");
    await page.reload();
    await expect(managerView).toContainText("Preferred weekly hours: Not specified");
    await expect(managerView).toContainText("Schedule emails: No");
    await expect(managerView).toContainText("Leave decision emails: Yes");

    await workerPage.goto(`/availability?venue=${venueId}`);
    await form.evaluate((element) => { element.noValidate = true; });
    await form.getByLabel("Preferred weekly hours (optional)").fill("168.25");
    await form.getByRole("button", { name: "Save work preferences" }).click();
    await expect(workerPage.locator('p[role="alert"]')).toContainText("weekly hours from 0 to 168");
    const afterInvalid = await admin.from("employee_preference_events").select("id").eq("employee_id", workerId);
    expect(afterInvalid.error).toBeNull();
    expect(afterInvalid.data).toHaveLength(2);

    const changes = await Promise.all([
      workerApi.rpc("save_employee_preferences", {
        p_business_id: businessId, p_venue_id: venueId, p_employee_id: workerId,
        p_preferred_weekly_hours: 16, p_notify_schedule_email: true, p_notify_leave_email: true,
      }),
      workerApi.rpc("save_employee_preferences", {
        p_business_id: businessId, p_venue_id: venueId, p_employee_id: workerId,
        p_preferred_weekly_hours: 20.25, p_notify_schedule_email: false, p_notify_leave_email: false,
      }),
    ]);
    for (const change of changes) expect(change.error).toBeNull();
    const history = await admin.from("employee_preference_events")
      .select("actor_id, old_values, new_values, created_at").eq("employee_id", workerId);
    expect(history.error).toBeNull();
    expect(history.data).toHaveLength(4);
    const concurrent = history.data.filter((event) => [16, 20.25].includes(event.new_values.preferred_weekly_hours));
    expect(concurrent).toHaveLength(2);
    const first = concurrent.find((event) => event.old_values.preferred_weekly_hours === null);
    const second = concurrent.find((event) => event !== first);
    expect(first).toBeTruthy();
    expect(second.old_values).toEqual(first.new_values);
    expect(first.actor_id).toBe(profile.data.auth_user_id);
    expect(second.actor_id).toBe(profile.data.auth_user_id);
    expect(new Date(first.created_at).getTime()).toBeLessThanOrEqual(new Date(second.created_at).getTime());
    const final = await admin.from("employee_preferences")
      .select("preferred_weekly_hours, notify_schedule_email, notify_leave_email")
      .eq("employee_id", workerId).single();
    expect(final.error).toBeNull();
    expect(final.data).toEqual(second.new_values);
    const unchangedProfile = await admin.from("employees").select("employment_type").eq("id", workerId).single();
    expect(unchangedProfile.error).toBeNull();
    expect(unchangedProfile.data.employment_type).toBe("casual");
  });
});

test("date blocks and approved leave override recurring availability", async ({ page, browser }) => {
  await withAvailabilityExceptionFixtures(page, browser, async ({
    workerPage, suffix, password, businessId, venueId, secondVenueId, fohId, workerId,
  }) => {
    await signIn(workerPage, `exceptions-worker-${suffix}@example.test`, password);
    await workerPage.goto(`/availability?venue=${secondVenueId}`);
    await expect(workerPage.locator('p[role="alert"]')).toContainText("couldn't load the selected venue");
    await workerPage.goto("/availability");
    const recurring = workerPage.getByRole("form", { name: "Recurring availability for Exception worker" });
    for (const [index, day] of ["1", "2", "3"].entries()) {
      await recurring.getByRole("button", { name: "Add interval" }).click();
      await recurring.getByLabel(`Day for interval ${index + 1}`).selectOption(day);
      await recurring.getByLabel(`Start for interval ${index + 1}`).fill("09:00");
      await recurring.getByLabel(`End for interval ${index + 1}`).fill("17:00");
    }
    await recurring.getByRole("button", { name: "Save availability" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Availability saved.");

    const form = workerPage.getByRole("form", { name: "Date exception for Exception worker" });
    const list = workerPage.getByRole("list", { name: "Exceptions for Exception worker" });
    await form.getByLabel("From").fill("2032-03-15");
    await form.getByLabel("Through").fill("2032-03-15");
    await form.getByRole("button", { name: "Save date exception" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Dates marked unavailable.");
    await expect(list.getByRole("listitem").filter({ hasText: "Date block: 2032-03-15" })).toContainText("Unavailable");

    await form.getByLabel("Type").selectOption("leave");
    await form.getByLabel("From").fill("2032-03-16");
    await form.getByLabel("Through").fill("2032-03-17");
    await form.getByRole("button", { name: "Save date exception" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Leave request submitted.");
    await expect(list.getByRole("listitem").filter({ hasText: "Leave: 2032-03-16" })).toContainText("Pending");
    const pending = await admin.from("employee_availability_exceptions").select("id, status")
      .eq("employee_id", workerId).eq("starts_on", "2032-03-16").single();
    expect(pending.error).toBeNull();
    expect(pending.data.status).toBe("pending");

    await form.getByLabel("From").fill("2032-01-01");
    await form.getByLabel("Through").fill("2033-01-01");
    await form.getByRole("button", { name: "Save date exception" }).click();
    await expect(workerPage.locator('p[role="alert"]')).toContainText("at most 366 days");

    await form.getByLabel("Type").selectOption("unavailable");
    await form.getByLabel("From").fill("2032-03-22");
    await form.getByLabel("Through").fill("2032-03-22");
    await form.getByRole("button", { name: "Save date exception" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Dates marked unavailable.");

    const shifts = [
      { role_title: "Blocked shift", starts_at: "2032-03-14T22:00:00Z", ends_at: "2032-03-14T23:00:00Z" },
      { role_title: "Outside hours", starts_at: "2032-03-15T21:00:00Z", ends_at: "2032-03-15T22:00:00Z" },
      { role_title: "Pending leave shift", starts_at: "2032-03-15T22:00:00Z", ends_at: "2032-03-16T00:00:00Z" },
      { role_title: "Legacy long shift", starts_at: "2032-03-16T22:00:00Z", ends_at: "2032-03-17T23:00:00Z" },
      { role_title: "Overnight next week", starts_at: "2032-03-21T12:30:00Z", ends_at: "2032-03-21T13:30:00Z" },
    ];
    expect((await admin.from("shifts").insert(shifts.map((shift) => ({
      ...shift, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId,
    })))).error).toBeNull();

    const workerIntervals = await admin.from("employee_availability_intervals").select("id").eq("employee_id", workerId);
    expect(workerIntervals.error).toBeNull();
    expect(workerIntervals.data).toHaveLength(3);
    for (const interval of workerIntervals.data) {
      expect((await admin.from("employee_availability_intervals").update({
        id: randomUUID().replace(/^[^-]+/, "ffffffff"),
      }).eq("id", interval.id)).error).toBeNull();
    }
    const pagedEmployees = Array.from({ length: 18 }, (_, index) => ({
      id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: fohId,
      name: `Pagination fixture ${String(index + 1).padStart(2, "0")}`, role_title: "Server",
    }));
    expect((await admin.from("employees").insert(pagedEmployees)).error).toBeNull();
    expect((await admin.from("employee_availability_patterns").insert(pagedEmployees.map((employee) => ({
      employee_id: employee.id, business_id: businessId, venue_id: venueId,
    })))).error).toBeNull();
    const additionalIntervals = pagedEmployees.flatMap((employee) =>
      Array.from({ length: 56 }, () => ({
        id: randomUUID().replace(/^[^-]+/, "00000000"),
        employee_id: employee.id, business_id: businessId, venue_id: venueId,
        weekday: 1, start_minute: 540, end_minute: 1020,
      })));
    expect((await admin.from("employee_availability_intervals").insert(additionalIntervals)).error).toBeNull();
    const firstPageBoundary = await admin.from("employee_availability_intervals").select("employee_id")
      .eq("venue_id", venueId).order("id").range(999, 999);
    expect(firstPageBoundary.error).toBeNull();
    expect(firstPageBoundary.data[0].employee_id).not.toBe(workerId);
    const laterIntervals = await admin.from("employee_availability_intervals").select("employee_id")
      .eq("venue_id", venueId).order("id").range(1000, 1010);
    expect(laterIntervals.error).toBeNull();
    expect(laterIntervals.data.filter((interval) => interval.employee_id === workerId)).toHaveLength(3);

    const otherManager = createClient(apiUrl, anonKey, options);
    expect((await otherManager.auth.signInWithPassword({
      email: `exceptions-boh-${suffix}@example.test`, password,
    })).error).toBeNull();
    const otherVisible = await otherManager.from("employee_availability_exceptions").select("id").eq("id", pending.data.id);
    expect(otherVisible.error).toBeNull();
    expect(otherVisible.data).toEqual([]);
    const otherShifts = await otherManager.from("shifts").select("id").eq("employee_id", workerId);
    expect(otherShifts.error).toBeNull();
    expect(otherShifts.data).toEqual([]);
    const deniedReview = await otherManager.rpc("review_leave_request", {
      p_business_id: businessId, p_venue_id: venueId, p_exception_id: pending.data.id, p_status: "approved",
    });
    expect(deniedReview.error?.message).toBe("Permission denied");
    const outsider = createClient(apiUrl, anonKey, options);
    expect((await outsider.auth.signInWithPassword({
      email: `exceptions-outsider-${suffix}@example.test`, password,
    })).error).toBeNull();
    const outsideVisible = await outsider.from("employee_availability_exceptions").select("id").eq("id", pending.data.id);
    expect(outsideVisible.error).toBeNull();
    expect(outsideVisible.data).toEqual([]);
    const outsideShifts = await outsider.from("shifts").select("id").eq("employee_id", workerId);
    expect(outsideShifts.error).toBeNull();
    expect(outsideShifts.data).toEqual([]);

    await signIn(page, `exceptions-owner-${suffix}@example.test`, password);
    await page.goto(`/availability?venue=${venueId}`);
    await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption(secondVenueId);
    await page.getByRole("button", { name: "Show venue" }).click();
    expect(new URL(page.url()).searchParams.get("venue")).toBe(secondVenueId);
    await expect(page.getByRole("region", { name: "Leave requests to review" }))
      .toContainText("No pending or approved leave at this venue.");
    await page.goto(`/roster?week=2032-03-15&venue=${venueId}&department=${fohId}`);
    await expect(page.getByLabel("Date blocked Exception worker 2032-03-15")).toBeVisible();
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-15")).toHaveText("Unavailable all day");
    await expect(page.getByLabel("Pending leave Exception worker 2032-03-16")).toBeVisible();
    await expect(page.getByLabel("Approved leave Exception worker 2032-03-16")).toHaveCount(0);
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-16")).toContainText("Unavailable 00:00–09:00");
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-16")).toContainText("Unavailable 17:00–24:00");
    await expect(page.getByText("Availability warnings do not block", { exact: false })).toBeVisible();
    await expect(page.locator("article", { hasText: "Blocked shift" }).getByRole("note")).toContainText("Date blocked");
    await expect(page.locator("article", { hasText: "Outside hours" }).getByRole("note")).toContainText("Outside submitted availability");
    await expect(page.locator("article", { hasText: "Pending leave shift" }).getByRole("note")).toHaveCount(0);
    await expect(page.locator("article", { hasText: "Legacy long shift" }).getByRole("note")).toContainText("review availability manually");
    await expect(page.locator("article", { hasText: "Overnight next week" }).getByRole("note")).toContainText("Date blocked");

    await page.goto(`/availability?venue=${venueId}`);
    const review = page.getByRole("listitem", { name: "Leave request for Exception worker 2032-03-16" });
    await expect(review).toContainText("Pending");
    await review.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("status")).toHaveText("Leave approved.");
    await workerPage.reload();
    await expect(list.getByRole("listitem").filter({ hasText: "Leave: 2032-03-16" })).toContainText("Approved");
    await page.goto(`/roster?week=2032-03-15&venue=${venueId}&department=${fohId}`);
    await expect(page.getByLabel("Approved leave Exception worker 2032-03-16")).toBeVisible();
    await expect(page.getByLabel("Approved leave Exception worker 2032-03-17")).toBeVisible();
    await expect(page.getByLabel("Pending leave Exception worker 2032-03-16")).toHaveCount(0);
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-16")).toHaveText("Unavailable all day");
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-17")).toHaveText("Unavailable all day");
    await expect(page.locator("article", { hasText: "Pending leave shift" }).getByRole("note")).toContainText("Approved leave");
  });
});

test("leave rejection and cancellations restore availability and serialize decisions", async ({ page, browser }) => {
  await withAvailabilityExceptionFixtures(page, browser, async ({
    workerPage, suffix, password, businessId, venueId, fohId, workerId,
  }) => {
    const workerApi = createClient(apiUrl, anonKey, options);
    const ownerApi = createClient(apiUrl, anonKey, options);
    expect((await workerApi.auth.signInWithPassword({
      email: `exceptions-worker-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await ownerApi.auth.signInWithPassword({
      email: `exceptions-owner-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await workerApi.rpc("set_employee_recurring_availability", {
      p_business_id: businessId, p_employee_id: workerId,
      p_intervals: [
        { weekday: 1, start: "09:00", end: "17:00" },
        { weekday: 2, start: "09:00", end: "17:00" },
        { weekday: 3, start: "09:00", end: "17:00" },
      ],
    })).error).toBeNull();
    expect((await workerApi.rpc("request_availability_exception", {
      p_business_id: businessId, p_venue_id: venueId, p_employee_id: workerId,
      p_starts_on: "2032-03-15", p_ends_on: "2032-03-15", p_exception_type: "unavailable",
    })).error).toBeNull();
    const leave = await workerApi.rpc("request_availability_exception", {
      p_business_id: businessId, p_venue_id: venueId, p_employee_id: workerId,
      p_starts_on: "2032-03-16", p_ends_on: "2032-03-17", p_exception_type: "leave",
    });
    expect(leave.error).toBeNull();
    expect(typeof leave.data).toBe("string");
    expect((await ownerApi.rpc("review_leave_request", {
      p_business_id: businessId, p_venue_id: venueId, p_exception_id: leave.data, p_status: "approved",
    })).error).toBeNull();
    await signIn(workerPage, `exceptions-worker-${suffix}@example.test`, password);
    await workerPage.goto(`/availability?venue=${venueId}`);
    await signIn(page, `exceptions-owner-${suffix}@example.test`, password);
    const form = workerPage.getByRole("form", { name: "Date exception for Exception worker" });
    const list = workerPage.getByRole("list", { name: "Exceptions for Exception worker" });
    const review = page.getByRole("listitem", { name: "Leave request for Exception worker 2032-03-16" });

    await form.getByLabel("Type").selectOption("leave");
    await form.getByLabel("From").fill("2032-03-18");
    await form.getByLabel("Through").fill("2032-03-18");
    await form.getByRole("button", { name: "Save date exception" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Leave request submitted.");
    await page.goto(`/availability?venue=${venueId}`);
    await page.getByRole("listitem", { name: "Leave request for Exception worker 2032-03-18" })
      .getByRole("button", { name: "Reject" }).click();
    await expect(page.getByRole("status")).toHaveText("Leave rejected.");
    await workerPage.reload();
    await expect(list.getByRole("listitem").filter({ hasText: "Leave: 2032-03-18" })).toContainText("Rejected");

    await form.getByLabel("Type").selectOption("leave");
    await form.getByLabel("From").fill("2032-03-19");
    await form.getByLabel("Through").fill("2032-03-19");
    await form.getByRole("button", { name: "Save date exception" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Leave request submitted.");
    await list.getByRole("listitem").filter({ hasText: "Leave: 2032-03-19" })
      .getByRole("button", { name: "Cancel" }).click();
    await expect(list.getByRole("listitem").filter({ hasText: "Leave: 2032-03-19" })).toContainText("Cancelled");
    await list.getByRole("listitem").filter({ hasText: "Date block: 2032-03-15" })
      .getByRole("button", { name: "Cancel" }).click();
    await expect(list.getByRole("listitem").filter({ hasText: "Date block: 2032-03-15" })).toContainText("Cancelled");

    await page.goto(`/availability?venue=${venueId}`);
    await review.getByText("Change approval").click();
    await review.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(page.getByRole("status")).toHaveText("Availability exception cancelled.");
    await workerPage.reload();
    await expect(list.getByRole("listitem").filter({ hasText: "Leave: 2032-03-16" })).toContainText("Cancelled");
    await page.goto(`/roster?week=2032-03-15&venue=${venueId}&department=${fohId}`);
    await expect(page.getByLabel("Date blocked Exception worker 2032-03-15")).toHaveCount(0);
    await expect(page.getByLabel("Approved leave Exception worker 2032-03-16")).toHaveCount(0);
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-15")).toContainText("Unavailable 00:00–09:00");
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-16")).toContainText("Unavailable 17:00–24:00");

    const racingRequest = await workerApi.rpc("request_availability_exception", {
      p_business_id: businessId, p_venue_id: venueId, p_employee_id: workerId,
      p_starts_on: "2032-03-20", p_ends_on: "2032-03-20", p_exception_type: "leave",
    });
    expect(racingRequest.error).toBeNull();
    expect(typeof racingRequest.data).toBe("string");
    const racingDecision = await Promise.all([
      ownerApi.rpc("review_leave_request", {
        p_business_id: businessId, p_venue_id: venueId, p_exception_id: racingRequest.data, p_status: "approved",
      }),
      workerApi.rpc("cancel_availability_exception", {
        p_business_id: businessId, p_venue_id: venueId, p_exception_id: racingRequest.data,
      }),
    ]);
    expect(racingDecision.filter((result) => !result.error)).toHaveLength(1);
    expect(racingDecision.filter((result) =>
      result.error?.message === "Leave request can no longer be changed" ||
      result.error?.message === "Availability exception can no longer be cancelled")).toHaveLength(1);
    const racingState = await admin.from("employee_availability_exceptions").select("status")
      .eq("id", racingRequest.data).single();
    expect(racingState.error).toBeNull();
    expect(["approved", "cancelled"]).toContain(racingState.data.status);
  });
});

test("weekly roster groups staff by department and preserves local dates on mobile", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const venueId = randomUUID();
  const fohId = randomUUID();
  const bohId = randomUUID();
  const sharedId = randomUUID();
  const archivedId = randomUUID();
  const managerId = randomUUID();
  const userIds = [];
  const contexts = [];
  try {
    for (const name of ["owner", "worker", "manager"]) {
      const user = await admin.auth.admin.createUser({
        email: `roster-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(user.error).toBeNull();
      userIds.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Roster ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: userIds[2], role: "foh_manager", venue_id: venueId, department_id: fohId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: sharedId, business_id: businessId, venue_id: venueId, department_id: fohId, auth_user_id: userIds[1], name: "Shared worker", role_title: "Server" },
      { id: archivedId, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Archived worker", role_title: "Server" },
      { id: managerId, business_id: businessId, venue_id: venueId, department_id: fohId, auth_user_id: userIds[2], name: "FOH Manager", role_title: "Manager" },
    ])).error).toBeNull();
    expect((await admin.from("employee_departments").insert([
      { business_id: businessId, employee_id: sharedId, department_id: bohId },
      { business_id: businessId, employee_id: managerId, department_id: bohId },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: sharedId,
        role_title: "Server", starts_at: "2032-03-14T22:30:00Z", ends_at: "2032-03-15T02:00:00Z", is_published: true },
      { business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: sharedId,
        role_title: "Prep", starts_at: "2032-03-16T00:00:00Z", ends_at: "2032-03-16T03:00:00Z", is_published: true },
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: sharedId,
        role_title: "FOH overlap", starts_at: "2032-03-15T03:00:00Z", ends_at: "2032-03-15T05:00:00Z", is_published: false },
      { business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: sharedId,
        role_title: "BOH overlap", starts_at: "2032-03-15T04:00:00Z", ends_at: "2032-03-15T06:00:00Z", is_published: false },
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: archivedId,
        role_title: "Former role", starts_at: "2032-03-16T23:00:00Z", ends_at: "2032-03-17T01:00:00Z", is_published: false },
      { business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: managerId,
        role_title: "Manager published", starts_at: "2032-03-18T00:00:00Z", ends_at: "2032-03-18T03:00:00Z", is_published: true },
      { business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: managerId,
        role_title: "Manager draft", starts_at: "2032-03-19T00:00:00Z", ends_at: "2032-03-19T03:00:00Z", is_published: false },
    ])).error).toBeNull();
    expect((await admin.from("employees").update({ active: false }).eq("id", archivedId)).error).toBeNull();

    await signIn(page, `roster-owner-${suffix}@example.test`, password);
    await page.goto("/roster?week=2032-03-15&department=all");
    const foh = page.getByRole("rowgroup", { name: "Department Front of House" });
    const boh = page.getByRole("rowgroup", { name: "Department Back of House" });
    const fohShared = foh.getByRole("row", { name: /Shared worker/ });
    const bohShared = boh.getByRole("row", { name: /Shared worker/ });
    await expect(fohShared.locator("article", { hasText: "Server" })).toContainText("9:30");
    await expect(fohShared.locator("article", { hasText: "Server" })).toContainText("1:00");
    await expect(fohShared.locator("article", { hasText: "Prep" })).toHaveCount(0);
    await expect(bohShared.locator("article", { hasText: "Prep" })).toContainText("11:00");
    await expect(bohShared.locator("article", { hasText: "Prep" })).toContainText("2:00");
    await expect(bohShared.locator("article", { hasText: "Server" })).toHaveCount(0);
    await expect(fohShared.locator("article", { hasText: "FOH overlap" }).getByRole("note")).toContainText("Overlaps another shift");
    await expect(bohShared.locator("article", { hasText: "BOH overlap" }).getByRole("note")).toContainText("Overlaps another shift");
    await expect(foh.getByRole("row", { name: /Archived worker \(Archived\)/ })).toContainText("Former role");
    await expect(page.getByRole("columnheader", { name: /15 Mar/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /16 Mar/ })).toBeVisible();

    await page.getByRole("button", { name: "Collapse Front of House" }).click();
    await expect(page.getByRole("button", { name: "Expand Front of House" })).toHaveAttribute("aria-expanded", "false");
    await expect(foh.getByText("Shared worker", { exact: true })).toBeHidden();
    await expect(bohShared).toBeVisible();
    await page.getByRole("link", { name: "Next week" }).click();
    await expect(page).toHaveURL(new RegExp(`week=2032-03-22&venue=${venueId}&department=all&collapsed=${fohId}`));
    await expect(page.getByRole("columnheader", { name: /22 Mar/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expand Front of House" })).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("link", { name: "Previous week" }).click();
    await expect(page).toHaveURL(new RegExp(`week=2032-03-15&venue=${venueId}&department=all&collapsed=${fohId}`));
    await page.locator("#department-filter").selectOption(fohId);
    await page.getByRole("button", { name: "Apply filter" }).click();
    await expect(page.getByRole("button", { name: "Expand Front of House" })).toBeVisible();
    await page.locator('input[name="role_title"]').fill("Extra open");
    await page.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    await expect(page.getByRole("button", { name: "Expand Front of House" })).toHaveAttribute("aria-expanded", "false");
    await page.locator("#department-filter").selectOption("all");
    await page.getByRole("button", { name: "Apply filter" }).click();
    await expect(foh.getByText("Shared worker", { exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Expand Front of House" }).click();
    await expect(page.getByRole("button", { name: "Collapse Front of House" })).toHaveAttribute("aria-expanded", "true");
    await expect(fohShared).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    const scroller = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Team roster" }),
    }).locator("div.overflow-x-auto");
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await scroller.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      return element.scrollLeft > 0;
    })).toBe(true);
    await page.close();

    const managerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `roster-manager-${suffix}@example.test`, password);
    await managerPage.goto("/roster?week=2032-03-15");
    await expect(managerPage.locator("#department-filter")).toHaveValue(fohId);
    const inaccessibleDepartment = randomUUID();
    await managerPage.goto(`/roster?week=2032-03-15&department=all&collapsed=${inaccessibleDepartment}`);
    const managerNextWeek = await managerPage.getByRole("link", { name: "Next week" }).getAttribute("href");
    expect(new URL(managerNextWeek, appUrl).searchParams.getAll("collapsed")).toEqual([]);
    const managerBoh = managerPage.getByRole("rowgroup", { name: "Department Back of House" });
    await expect(managerBoh.getByRole("row", { name: /FOH Manager/ })).toContainText("Manager published");
    await expect(managerBoh.getByText("Manager draft", { exact: true })).toHaveCount(0);
    await expect(managerBoh.getByRole("row", { name: /Shared worker/ })).toHaveCount(0);
    await managerPage.goto(`/roster?week=2032-03-15&department=${bohId}`);
    await expect(managerPage.getByRole("note")).toContainText("cannot change its roster");
    await expect(managerPage.getByRole("button", { name: "Save draft shift" })).toHaveCount(0);
    await expect(managerPage.getByRole("button", { name: "Publish this department" })).toHaveCount(0);
    await managerPage.goto(`/roster?week=2032-03-15&department=${fohId}`);
    await expect(managerPage.getByRole("button", { name: "Save draft shift" })).toBeVisible();
    await expect(managerPage.locator("article", { hasText: "FOH overlap" }).getByRole("note"))
      .toContainText("Overlaps another shift");
    await expect(managerPage.getByText("BOH overlap", { exact: true })).toHaveCount(0);
    await managerPage.goto("/settings/departments");
    await expect(managerPage.getByRole("link", { name: /Front of House.*View/ })).toBeVisible();
    await expect(managerPage.getByRole("link", { name: /Back of House.*View/ })).toHaveCount(0);
    await managerPage.goto("/people");
    await managerPage.getByRole("link", { name: "Add person", exact: true }).click();
    await expect(managerPage.getByRole("region", { name: "New employee" })
      .getByRole("combobox", { name: "Department" }).locator("option"))
      .toHaveText(["Front of House"]);
    await managerContext.close();

    const workerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, `roster-worker-${suffix}@example.test`, password);
    await workerPage.goto("/roster?week=2032-03-15");
    await expect(workerPage.locator("#department-filter")).toHaveValue(fohId);
    await workerPage.goto("/roster?week=2032-03-15&department=all");
    await expect(workerPage.getByRole("rowgroup", { name: "Department Front of House" })
      .getByRole("row", { name: /Shared worker/ })).toContainText("Server");
    await expect(workerPage.getByRole("rowgroup", { name: "Department Back of House" })
      .getByRole("row", { name: /Shared worker/ })).toContainText("Prep");
    await expect(workerPage.getByRole("row", { name: /FOH Manager|Archived worker/ })).toHaveCount(0);
    await expect(workerPage.getByRole("button", { name: "Save draft shift" })).toHaveCount(0);
    await expect(workerPage.getByRole("button", { name: "Publish this department" })).toHaveCount(0);
  } finally {
    try {
      for (const context of contexts) if (browser.isConnected()) await context.close();
    } finally {
      expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
      await assertBusinessFixturesPreserved(admin, businessId);
      for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
});


test("draft shifts can be created and edited with inline errors in permitted venues", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const [sydneyId, perthId] = [randomUUID(), randomUUID()];
  const [fohId, bohId, remoteId] = [randomUUID(), randomUUID(), randomUUID()];
  const [workerId, archivedId] = [randomUUID(), randomUUID()];
  const [draftId, publishedId, openId, archivedShiftId, otherDraftId] =
    [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const userIds = [];
  const contexts = [];
  const failures = [];
  try {
    for (const name of ["owner", "manager", "worker"]) {
      const user = await admin.auth.admin.createUser({
        email: `edit-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(user.error).toBeNull();
      userIds.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Edit roster ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: sydneyId, business_id: businessId, name: "Sydney venue", timezone: "Australia/Sydney" },
      { id: perthId, business_id: businessId, name: "Perth venue", timezone: "Australia/Perth" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: sydneyId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: sydneyId, name: "Back of House" },
      { id: remoteId, business_id: businessId, venue_id: perthId, name: "Perth service" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], role: "foh_manager", venue_id: sydneyId, department_id: fohId },
      { business_id: businessId, user_id: userIds[2], role: "employee", venue_id: sydneyId, department_id: fohId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: sydneyId, department_id: fohId,
        auth_user_id: userIds[2], name: "Edit worker", role_title: "Server" },
      { id: archivedId, business_id: businessId, venue_id: sydneyId, department_id: fohId,
        name: "Former worker", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: draftId, business_id: businessId, venue_id: sydneyId, department_id: fohId, employee_id: workerId,
        role_title: "Original draft", starts_at: "2032-03-14T22:00:00Z", ends_at: "2032-03-14T23:00:00Z", break_minutes: 15, is_published: false },
      { id: publishedId, business_id: businessId, venue_id: sydneyId, department_id: fohId, employee_id: workerId,
        role_title: "Published shift", starts_at: "2032-03-15T22:00:00Z", ends_at: "2032-03-15T23:00:00Z", break_minutes: 0, is_published: true },
      { id: openId, business_id: businessId, venue_id: sydneyId, department_id: fohId, employee_id: null,
        role_title: "Original open", starts_at: "2032-03-17T22:00:00Z", ends_at: "2032-03-18T00:00:00Z", break_minutes: 0, is_published: false },
      { id: archivedShiftId, business_id: businessId, venue_id: sydneyId, department_id: fohId, employee_id: archivedId,
        role_title: "Archived draft", starts_at: "2032-03-16T22:00:00Z", ends_at: "2032-03-17T00:00:00Z", break_minutes: 0, is_published: false },
      { id: otherDraftId, business_id: businessId, venue_id: sydneyId, department_id: bohId, employee_id: null,
        role_title: "Other department", starts_at: "2032-03-18T22:00:00Z", ends_at: "2032-03-19T00:00:00Z", break_minutes: 0, is_published: false },
    ])).error).toBeNull();
    expect((await admin.from("employees").update({ active: false }).eq("id", archivedId)).error).toBeNull();

    await signIn(page, `edit-owner-${suffix}@example.test`, password);
    await page.goto(`/roster?week=2032-03-15&venue=${sydneyId}&department=all&collapsed=${bohId}`);
    await expect(page.locator("#venue-filter option")).toHaveCount(2);
    await page.locator("article", { hasText: "Original draft" }).getByRole("link", { name: "Edit Edit worker shift" }).click();
    const form = page.getByRole("form", { name: "Edit draft shift" });
    await expect(form.getByLabel("Role")).toHaveValue("Original draft");
    await expect(form.getByLabel("Team member")).toHaveValue(workerId);
    await expect(form.getByLabel("Starts")).toHaveValue("2032-03-15T09:00");
    await expect(form.getByLabel("Ends")).toHaveValue("2032-03-15T10:00");
    await expect(form.getByLabel("Break (mins)")).toHaveValue("15");
    expect(new URL(page.url()).searchParams.getAll("collapsed")).toEqual([bohId]);

    await form.getByLabel("Role").fill("");
    await form.getByLabel("Starts").fill("");
    await form.getByLabel("Break (mins)").fill("241");
    await form.getByRole("button", { name: "Update draft shift" }).click();
    await expect(form.getByText("Enter a role of up to 80 characters.")).toBeVisible();
    await expect(form.getByText("Enter a valid start date and time.")).toBeVisible();
    await expect(form.getByText("Enter a whole number from 0 to 240 minutes.")).toBeVisible();
    await expect(form.getByLabel("Break (mins)")).toHaveValue("241");

    await form.getByLabel("Role").fill("Changed server");
    await form.getByLabel("Starts").fill("2032-03-16T09:30");
    await form.getByLabel("Ends").fill("2032-03-16T10:30");
    await form.getByLabel("Break (mins)").fill("20");
    await form.getByRole("button", { name: "Update draft shift" }).click();
    await expect(form.getByText("That employee already has a shift during this time.")).toBeVisible();
    await expect(form.getByLabel("Role")).toHaveValue("Changed server");
    await expect(form.getByLabel("Starts")).toHaveValue("2032-03-16T09:30");
    const unchanged = await admin.from("shifts").select("role_title").eq("id", draftId).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data.role_title).toBe("Original draft");

    await form.getByLabel("Starts").fill("2032-03-15T10:00");
    await form.getByLabel("Ends").fill("2032-03-15T12:30");
    await form.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft shift updated.");
    await expect(page.locator("article", { hasText: "Changed server" })).toContainText("12:30");
    const changed = await admin.from("shifts").select("starts_at, ends_at, break_minutes").eq("id", draftId).single();
    expect(changed.error).toBeNull();
    expect(new Date(changed.data.starts_at).toISOString()).toBe("2032-03-14T23:00:00.000Z");
    expect(new Date(changed.data.ends_at).toISOString()).toBe("2032-03-15T01:30:00.000Z");
    expect(changed.data.break_minutes).toBe(20);
    expect(new URL(page.url()).searchParams.getAll("collapsed")).toEqual([bohId]);

    await page.getByRole("link", { name: "Edit open shift" }).click();
    await expect(form.getByLabel("Team member")).toHaveValue("");
    await form.getByLabel("Team member").selectOption(workerId);
    await form.getByLabel("Role").fill("Filled open shift");
    await form.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.locator("article", { hasText: "Filled open shift" })).toBeVisible();
    const filled = await admin.from("shifts").select("employee_id").eq("id", openId).single();
    expect(filled.error).toBeNull();
    expect(filled.data.employee_id).toBe(workerId);

    await page.locator("article", { hasText: "Archived draft" }).getByRole("link", { name: "Edit Former worker shift" }).click();
    await expect(form.getByLabel("Team member")).toHaveValue(archivedId);
    await expect(form.locator(`option[value="${archivedId}"]`)).toContainText("(unavailable)");
    await form.getByRole("button", { name: "Update draft shift" }).click();
    await expect(form.getByText(/Choose an active team member linked to this department/)).toBeVisible();
    const stillAssigned = await admin.from("shifts").select("employee_id").eq("id", archivedShiftId).single();
    expect(stillAssigned.error).toBeNull();
    expect(stillAssigned.data.employee_id).toBe(archivedId);
    await form.getByLabel("Team member").selectOption("");
    await form.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.locator("#open-shifts")).toContainText("Archived draft");

    const publishedShift = page.locator(`#roster-shift-${publishedId}`);
    await expect(publishedShift).toBeVisible();
    await expect(publishedShift.getByRole("link", { name: /^Discuss shift for Edit worker: Published shift/ })).toHaveCount(1);
    await expect(publishedShift.getByRole("link", { name: /^Edit / })).toHaveCount(0);
    await expect(publishedShift.locator('a[href*="&edit="]')).toHaveCount(0);
    await page.goto(`/roster?week=2032-03-15&venue=${sydneyId}&department=${fohId}&edit=${publishedId}`);
    await expect(page.locator('p[role="alert"]')).toContainText("unavailable or you cannot edit");
    await expect(page.getByRole("form", { name: "Edit draft shift" })).toHaveCount(0);

    const create = page.getByRole("form", { name: "Add draft shift" });
    await create.getByLabel("Role").fill("New Friday shift");
    await create.getByLabel("Team member").selectOption(workerId);
    await create.getByLabel("Starts").fill("2032-03-19T09:00");
    await create.getByLabel("Ends").fill("2032-03-19T12:00");
    await create.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    await expect(page.locator("article", { hasText: "New Friday shift" })).toBeVisible();
    await expect(create.getByLabel("Role")).toHaveValue("");
    await create.getByLabel("Role").fill("Second new shift");
    await create.getByLabel("Starts").fill("2032-03-20T09:00");
    await create.getByLabel("Ends").fill("2032-03-20T12:00");
    await create.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.locator("#open-shifts")).toContainText("Second new shift");
    await expect(create.getByLabel("Role")).toHaveValue("");

    await page.locator("#venue-filter").selectOption(perthId);
    await page.getByRole("button", { name: "Switch venue" }).click();
    await expect(page.locator("#department-filter option")).toHaveText(["Perth service"]);
    await expect(page.getByText(/Perth venue · Perth service/)).toBeVisible();
    await create.getByLabel("Role").fill("Remote cover");
    await create.getByLabel("Starts").fill("2032-03-15T09:00");
    await create.getByLabel("Ends").fill("2032-03-15T12:00");
    await create.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.locator("#open-shifts")).toContainText("Remote cover");
    const remote = await admin.from("shifts").select("venue_id, department_id, starts_at")
      .eq("business_id", businessId).eq("role_title", "Remote cover").single();
    expect(remote.error).toBeNull();
    expect(remote.data.venue_id).toBe(perthId);
    expect(remote.data.department_id).toBe(remoteId);
    expect(new Date(remote.data.starts_at).toISOString()).toBe("2032-03-15T01:00:00.000Z");
    await page.getByRole("link", { name: "Next week" }).click();
    expect(new URL(page.url()).searchParams.get("venue")).toBe(perthId);
    await page.close();

    for (const name of ["manager", "worker"]) {
      const context = await browser.newContext({ baseURL: appUrl });
      contexts.push(context);
      const scoped = await context.newPage();
      await signIn(scoped, `edit-${name}-${suffix}@example.test`, password);
      await scoped.goto(`/roster?week=2032-03-15&venue=${sydneyId}&department=${fohId}`);
      await expect(scoped.locator("#venue-filter")).toHaveCount(0);
      if (name === "worker") {
        await expect(scoped.getByRole("form", { name: /draft shift/ })).toHaveCount(0);
        await expect(scoped.getByRole("link", { name: /Edit.*shift/ })).toHaveCount(0);
      } else {
        await scoped.goto(`/roster?week=2032-03-15&venue=${sydneyId}&department=${bohId}&edit=${otherDraftId}`);
        await expect(scoped.locator('p[role="alert"]')).toContainText("unavailable or you cannot edit");
        await expect(scoped.getByRole("form", { name: "Edit draft shift" })).toHaveCount(0);
      }
      await scoped.goto(`/roster?week=2032-03-15&venue=${perthId}`);
      await expect(scoped.getByRole("heading", { name: "Roster unavailable" })).toBeVisible();
      await expect(scoped.locator('p[role="alert"]')).toContainText("couldn't load the selected venue");
      await context.close();
    }
  } catch (error) {
    failures.push(error);
  }
  try {
    for (const context of contexts) if (browser.isConnected()) await context.close();
  } catch (error) {
    failures.push(error);
  }
  try {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length) throw new AggregateError(failures, "Draft shift scenario or fixture cleanup failed");
});

test("editing a draft preserves historical sub-minute timestamps", async ({ page }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const venueId = randomUUID();
  const departmentId = randomUUID();
  const shiftId = randomUUID();
  let userId;
  try {
    const user = await admin.auth.admin.createUser({
      email: `precise-owner-${suffix}@example.test`, password, email_confirm: true,
    });
    expect(user.error).toBeNull();
    userId = user.data.user.id;
    expect((await admin.from("businesses").insert({ id: businessId, name: `Precise roster ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Sydney venue", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: userId, role: "owner",
    })).error).toBeNull();
    expect((await admin.from("shifts").insert({
      id: shiftId, business_id: businessId, venue_id: venueId, department_id: departmentId,
      employee_id: null, role_title: "Precise draft",
      starts_at: "2032-03-19T21:00:31.123456Z", ends_at: "2032-03-19T22:30:48.654321Z",
      break_minutes: 0, is_published: false,
    })).error).toBeNull();

    await signIn(page, `precise-owner-${suffix}@example.test`, password);
    await page.goto(`/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`);
    await page.getByRole("link", { name: "Edit open shift" }).click();
    const form = page.getByRole("form", { name: "Edit draft shift" });
    await expect(form.getByLabel("Starts")).toHaveValue("2032-03-20T08:00");
    await expect(form.getByLabel("Ends")).toHaveValue("2032-03-20T09:30");
    await form.getByLabel("Role").fill("Precise draft changed");
    await form.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.locator("#open-shifts")).toContainText("Precise draft changed");
    const precise = await admin.from("shifts").select("starts_at, ends_at").eq("id", shiftId).single();
    expect(precise.error).toBeNull();
    expect(precise.data.starts_at).toContain("21:00:31.123456");
    expect(precise.data.ends_at).toContain("22:30:48.654321");
  } finally {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});

test("personal mobile schedules show only the member's published shifts", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusinessId] = [randomUUID(), randomUUID()];
  const [venueId, outsideVenueId] = [randomUUID(), randomUUID()];
  const [fohId, bohId, outsideDepartmentId] = [randomUUID(), randomUUID(), randomUUID()];
  const [workerId, managerId, coworkerId, outsideWorkerId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const [overnightId, firstId, secondId, draftId, coworkerShiftId, managerShiftId, openId, outsideShiftId] =
    Array.from({ length: 8 }, () => randomUUID());
  const userIds = [];
  const contexts = [];
  try {
    for (const name of ["owner", "worker", "outside", "unlinked"]) {
      const user = await admin.auth.admin.createUser({
        email: `schedule-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(user.error).toBeNull();
      userIds.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Schedule ${suffix}` },
      { id: outsideBusinessId, name: `Outside schedule ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour cafe", address: "44 Harbour Road, Sydney", timezone: "Australia/Sydney" },
      { id: outsideVenueId, business_id: outsideBusinessId, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
      { id: outsideDepartmentId, business_id: outsideBusinessId, venue_id: outsideVenueId, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusinessId, user_id: userIds[2], role: "owner" },
      { business_id: businessId, user_id: userIds[3], role: "employee", venue_id: venueId, department_id: fohId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId, auth_user_id: userIds[1], name: "Schedule worker", role_title: "Server" },
      { id: managerId, business_id: businessId, venue_id: venueId, department_id: fohId, auth_user_id: userIds[0], name: "Schedule owner", role_title: "Manager" },
      { id: coworkerId, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Schedule coworker", role_title: "Server" },
      { id: outsideWorkerId, business_id: outsideBusinessId, venue_id: outsideVenueId, department_id: outsideDepartmentId, auth_user_id: userIds[2], name: "Outside worker", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("employee_departments").insert({
      business_id: businessId, employee_id: workerId, department_id: bohId,
    })).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: overnightId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId, role_title: "Sunday overnight", starts_at: "2099-03-15T12:30:00Z", ends_at: "2099-03-15T13:30:00Z", is_published: true },
      { id: firstId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId, role_title: "Morning service", starts_at: "2099-03-15T21:00:00Z", ends_at: "2099-03-15T23:00:00Z", is_published: true },
      { id: secondId, business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: workerId, role_title: "Kitchen support", starts_at: "2099-03-16T22:00:00Z", ends_at: "2099-03-17T00:00:00Z", is_published: true },
      { id: draftId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId, role_title: "Newly published service", starts_at: "2099-03-17T22:00:00Z", ends_at: "2099-03-18T00:00:00Z", is_published: false },
      { id: coworkerShiftId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: coworkerId, role_title: "Coworker private shift", starts_at: "2099-03-17T22:00:00Z", ends_at: "2099-03-18T00:00:00Z", is_published: true },
      { id: managerShiftId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: managerId, role_title: "Manager personal shift", starts_at: "2099-03-18T22:00:00Z", ends_at: "2099-03-19T00:00:00Z", is_published: true },
      { id: openId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: null, role_title: "Unfilled private shift", starts_at: "2099-03-19T22:00:00Z", ends_at: "2099-03-20T00:00:00Z", is_published: true },
      { id: outsideShiftId, business_id: outsideBusinessId, venue_id: outsideVenueId, department_id: outsideDepartmentId, employee_id: outsideWorkerId, role_title: "Outside private shift", starts_at: "2099-03-18T09:00:00Z", ends_at: "2099-03-18T11:00:00Z", is_published: true },
    ])).error).toBeNull();

    const workerClient = createClient(apiUrl, anonKey, options);
    expect((await workerClient.auth.signInWithPassword({ email: `schedule-worker-${suffix}@example.test`, password })).error).toBeNull();
    const hidden = await workerClient.from("shifts").select("id")
      .in("id", [draftId, coworkerShiftId, managerShiftId, openId, outsideShiftId]);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
    const visible = await workerClient.from("shifts").select("id").in("id", [overnightId, firstId, secondId]);
    expect(visible.error).toBeNull();
    expect(visible.data.map((shift) => shift.id).sort()).toEqual([overnightId, firstId, secondId].sort());

    const guest = await fetch(new URL("/my-schedule", appUrl), { redirect: "manual" });
    expect([200, 307]).toContain(guest.status);
    if (guest.status === 200) {
      const html = await guest.text();
      expect(html).not.toContain("Morning service");
      expect(html).not.toContain("Coworker private shift");
    } else {
      expect(new URL(guest.headers.get("location"), appUrl).pathname).toBe("/login");
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/my-schedule");
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, `schedule-worker-${suffix}@example.test`, password);
    await openMainNavigation(page);
    await page.getByRole("link", { name: "My schedule", exact: true }).click();
    await page.goto(`/my-schedule?week=2099-03-16&venue=${venueId}`);
    const next = page.getByRole("region", { name: "Next shift" });
    const weekly = page.getByRole("region", { name: "Weekly schedule" });
    await expect(next).toContainText("Sunday overnight");
    await expect(next).toContainText("Sun, 15 Mar");
    await expect(next).toContainText("11:30 pm");
    await expect(next).toContainText("44 Harbour Road, Sydney");
    await expect(page.getByText(/Times use Australia\/Sydney/)).toBeVisible();
    await expect(weekly.getByRole("region", { name: "Mon, 16 Mar" })).toContainText("Sunday overnight");
    await expect(weekly.getByRole("region", { name: "Mon, 16 Mar" })).toContainText("Morning service");
    await expect(weekly.getByRole("region", { name: "Tue, 17 Mar" })).toContainText("Kitchen support");
    for (const title of ["Newly published service", "Coworker private shift", "Manager personal shift", "Unfilled private shift", "Outside private shift"]) {
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    }
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole("link", { name: "Next week" }).click();
    await expect(page).toHaveURL(/week=2099-03-23/);
    await expect(weekly).not.toContainText("Morning service");
    await page.getByRole("link", { name: "Previous week" }).click();
    await expect(page).toHaveURL(/week=2099-03-16/);

    const ownerClient = createClient(apiUrl, anonKey, options);
    expect((await ownerClient.auth.signInWithPassword({ email: `schedule-owner-${suffix}@example.test`, password })).error).toBeNull();
    const publication = await ownerClient.rpc("publish_roster", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId, p_week_start: "2099-03-16",
    });
    expect(publication.error).toBeNull();
    expect(publication.data).toBe(1);
    await page.getByRole("button", { name: "Refresh schedule" }).click();
    await expect(weekly).toContainText("Newly published service");
    await expect(page.getByText("Coworker private shift", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Acknowledge a shift when your manager requires it/)).toBeVisible();
    await expect(weekly.getByRole("button", { name: /^Acknowledge / })).toHaveCount(0);
    await page.goto(`/my-schedule?week=2099-03-16&venue=${outsideVenueId}`);
    await expect(page.getByRole("heading", { name: "Schedule unavailable" })).toBeVisible();
    await expect(page.locator('p[role="alert"]')).toContainText("couldn't load the selected venue");
    await expect(page.getByText("Outside private shift", { exact: true })).toHaveCount(0);
    await page.close();

    const managerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `schedule-owner-${suffix}@example.test`, password);
    await managerPage.goto(`/my-schedule?week=2099-03-16&venue=${venueId}&employee=${workerId}`);
    await expect(managerPage.getByRole("region", { name: "Weekly schedule" })).toContainText("Manager personal shift");
    await expect(managerPage.getByText("Morning service", { exact: true })).toHaveCount(0);
    await expect(managerPage.getByText("Coworker private shift", { exact: true })).toHaveCount(0);
    await managerContext.close();

    const unlinkedContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(unlinkedContext);
    const unlinkedPage = await unlinkedContext.newPage();
    await signIn(unlinkedPage, `schedule-unlinked-${suffix}@example.test`, password);
    await unlinkedPage.goto(`/my-schedule?week=2099-03-16&venue=${venueId}`);
    await expect(unlinkedPage.getByText(/No employee profile is linked to your account/)).toBeVisible();
    await expect(unlinkedPage.getByRole("region", { name: "Weekly schedule" })).toHaveCount(0);
    await unlinkedContext.close();
  } finally {
    try {
      for (const context of contexts) if (browser.isConnected()) await context.close();
    } finally {
      expect((await admin.from("shifts").delete().in("business_id", [businessId, outsideBusinessId])).error).toBeNull();
      await assertBusinessFixturesPreserved(admin, [businessId, outsideBusinessId]);
      for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
});

test("published roster updates reach the right employees once and retain pending profiles", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusinessId] = [randomUUID(), randomUUID()];
  const [venueId, outsideVenueId] = [randomUUID(), randomUUID()];
  const [departmentId, outsideDepartmentId] = [randomUUID(), randomUUID()];
  const [workerId, pendingId, coworkerId] = [randomUUID(), randomUUID(), randomUUID()];
  const userIds = [];
  const contexts = [];
  try {
    for (const name of ["owner", "worker", "pending", "coworker", "outside"]) {
      const user = await admin.auth.admin.createUser({
        email: `roster-notice-${name}-${suffix}@example.test`, password, email_confirm: true,
      });

      expect(user.error).toBeNull();
      userIds.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Notice business ${suffix}` },
      { id: outsideBusinessId, name: `Outside notices ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Notice cafe", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideBusinessId, name: "Outside cafe", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: outsideDepartmentId, business_id: outsideBusinessId, venue_id: outsideVenueId, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: userIds[0], role: "owner" },
      { business_id: businessId, user_id: userIds[1], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: userIds[2], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: userIds[3], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusinessId, user_id: userIds[4], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: userIds[1], name: "Notified worker", role_title: "Server" },
      { id: pendingId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        name: "Pending worker", role_title: "Server" },
      { id: coworkerId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: userIds[3], name: "Other worker", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: workerId,
        role_title: "Worker morning", starts_at: "2032-03-15T09:00:00Z", ends_at: "2032-03-15T10:00:00Z", is_published: false },
      { business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: workerId,
        role_title: "Worker midday", starts_at: "2032-03-15T11:00:00Z", ends_at: "2032-03-15T12:00:00Z", is_published: false },
      { business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: pendingId,
        role_title: "Pending service", starts_at: "2032-03-15T13:00:00Z", ends_at: "2032-03-15T14:00:00Z", is_published: false },
      { business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: null,
        role_title: "Open service", starts_at: "2032-03-15T15:00:00Z", ends_at: "2032-03-15T16:00:00Z", is_published: false },
      { business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: coworkerId,
        role_title: "Private existing service", starts_at: "2032-03-15T17:00:00Z",
        ends_at: "2032-03-15T18:00:00Z", is_published: true },
    ])).error).toBeNull();

    const workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, `roster-notice-worker-${suffix}@example.test`, password);
    await workerPage.goto(`/notifications?venue=${venueId}`);
    await expect(workerPage.getByText("No work updates yet.", { exact: false })).toBeVisible();
    await workerPage.goto(`/my-schedule?week=2032-03-15&venue=${venueId}`);
    await expect(workerPage.getByText("Worker morning", { exact: true })).toHaveCount(0);

    await signIn(page, `roster-notice-owner-${suffix}@example.test`, password);
    const roster = `/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`;
    await page.goto(roster);
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("status")).toHaveText("Front of House roster published.");
    const history = page.getByRole("region", { name: "Publication history" });
    await expect(history).toContainText("1 affected employee profile cannot currently see this update");

    const versions = await admin.from("roster_publications").select("id, version")
      .eq("department_id", departmentId).eq("week_start", "2032-03-15");
    expect(versions.error).toBeNull();
    expect(versions.data).toHaveLength(1);
    const firstPublication = versions.data[0].id;
    await workerPage.goto("/");
    const banner = workerPage.getByRole("region", { name: "Unread work updates" });
    await expect(banner).toContainText("1 unread work update");
    await banner.getByRole("link", { name: "View notifications" }).click();
    const firstNotice = workerPage.getByRole("article", { name: "Roster update for week starting 2032-03-15" });
    await expect(firstNotice).toHaveCount(1);
    await expect(firstNotice.getByText("Unread", { exact: true })).toBeVisible();
    await expect(workerPage.getByText("Private existing service", { exact: true })).toHaveCount(0);
    expect(await workerPage.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await firstNotice.getByRole("button", { name: "Mark as read" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Notification marked as read.");
    await expect(firstNotice.getByText("Read", { exact: true })).toBeVisible();

    const create = page.getByRole("form", { name: "Add draft shift" });
    await create.getByLabel("Role").fill("Later worker shift");
    await create.getByLabel("Team member").selectOption(workerId);
    await create.getByLabel("Starts").fill("2032-03-16T11:00");
    await create.getByLabel("Ends").fill("2032-03-16T12:00");
    await create.getByLabel("Break").fill("0");
    await create.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("status")).toHaveText("Front of House roster published.");
    await expect(history.getByRole("listitem")).toHaveCount(2);
    await workerPage.goto(`/my-schedule?week=2032-03-15&venue=${venueId}`);
    await expect(banner).toContainText("1 unread work update");
    await banner.getByRole("link", { name: "View notifications" }).click();
    await expect(workerPage.getByRole("article")).toHaveCount(2);
    const unread = workerPage.getByRole("article").filter({
      has: workerPage.getByText("Unread", { exact: true }),
    });
    await expect(unread).toHaveCount(1);
    await unread.getByRole("button", { name: "View schedule" }).click();
    await expect(workerPage).toHaveURL(new RegExp(`/my-schedule\\?week=2032-03-15&venue=${venueId}`));
    const weekly = workerPage.getByRole("region", { name: "Weekly schedule" });
    await expect(weekly).toContainText("Worker morning");
    await expect(weekly).toContainText("Worker midday");
    await expect(weekly).toContainText("Later worker shift");
    await expect(weekly).not.toContainText("Pending service");
    await expect(weekly).not.toContainText("Private existing service");
    await expect(banner).toHaveCount(0);

    const pendingContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(pendingContext);
    const pendingPage = await pendingContext.newPage();
    await signIn(pendingPage, `roster-notice-pending-${suffix}@example.test`, password);
    await pendingPage.goto(`/notifications?venue=${venueId}`);
    await expect(pendingPage.getByText("No work updates yet.", { exact: false })).toBeVisible();
    const ownerApi = createClient(apiUrl, anonKey, options);
    expect((await ownerApi.auth.signInWithPassword({
      email: `roster-notice-owner-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await ownerApi.rpc("set_employee_auth_user", {
      p_business_id: businessId, p_employee_id: pendingId, p_user_id: userIds[2],
    })).error).toBeNull();
    await page.goto(roster);
    await expect(history).not.toContainText("cannot currently see this update");
    await pendingPage.reload();
    const pendingNotice = pendingPage.getByRole("article");
    await expect(pendingNotice).toHaveCount(1);
    await expect(pendingNotice.getByText("Unread", { exact: true })).toBeVisible();
    await pendingNotice.getByRole("button", { name: "View schedule" }).click();
    await expect(pendingPage.getByRole("region", { name: "Weekly schedule" })).toContainText("Pending service");
    await expect(pendingPage.getByRole("region", { name: "Weekly schedule" })).not.toContainText("Worker morning");

    const coworkerApi = createClient(apiUrl, anonKey, options);
    expect((await coworkerApi.auth.signInWithPassword({
      email: `roster-notice-coworker-${suffix}@example.test`, password,
    })).error).toBeNull();
    const coworkerNotices = await coworkerApi.rpc("list_roster_notifications", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    expect(coworkerNotices.error).toBeNull();
    expect(coworkerNotices.data).toEqual([]);
    expect((await coworkerApi.rpc("mark_roster_notification_read", {
      p_publication_id: firstPublication,
    })).error?.message).toBe("Permission denied");
    const outsideApi = createClient(apiUrl, anonKey, options);
    expect((await outsideApi.auth.signInWithPassword({
      email: `roster-notice-outside-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await outsideApi.rpc("list_roster_notifications", {
      p_business_id: outsideBusinessId, p_venue_id: venueId,
    })).error?.message).toBe("Permission denied");
    expect((await outsideApi.rpc("mark_roster_notification_read", {
      p_publication_id: firstPublication,
    })).error?.message).toBe("Permission denied");
  } finally {
    try {
      if (browser.isConnected()) {
        for (const context of contexts) await context.close();
      }
    } finally {
      expect((await admin.from("shifts").delete().in("business_id", [businessId, outsideBusinessId])).error).toBeNull();
      await assertBusinessFixturesPreserved(admin, [businessId, outsideBusinessId]);
      for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
});

test("required shift acknowledgements stay scoped and survive later publications", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, departmentId, workerId, coworkerId, shiftId] =
    Array.from({ length: 6 }, () => randomUUID());
  const users = [];
  let workerContext;
  try {
    for (const name of ["owner", "worker", "coworker"]) {
      const result = await admin.auth.admin.createUser({
        email: `ack-${name}-${suffix}@example.test`, password, email_confirm: true,
      });

      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Ack cafe ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Ack venue", timezone: "UTC", address: "1 Test Street",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: departmentId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[1], name: "Ack worker", role_title: "Server" },
      { id: coworkerId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[2], name: "Ack coworker", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: shiftId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        employee_id: workerId, role_title: "Required service", starts_at: "2032-03-15T09:00:00Z",
        ends_at: "2032-03-15T10:00:00Z", is_published: false },
      { id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: departmentId,
        employee_id: coworkerId, role_title: "Coworker service", starts_at: "2032-03-15T11:00:00Z",
        ends_at: "2032-03-15T12:00:00Z", is_published: false },
    ])).error).toBeNull();

    workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, `ack-worker-${suffix}@example.test`, password);
    const schedule = `/my-schedule?week=2032-03-15&venue=${venueId}`;
    await workerPage.goto(schedule);
    await expect(workerPage.getByText("Required service", { exact: true })).toHaveCount(0);

    await signIn(page, `ack-owner-${suffix}@example.test`, password);
    const roster = `/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`;
    await page.goto(roster);
    const card = page.getByRole("article").filter({ has: page.getByText("Required service", { exact: true }) });
    await card.getByRole("button", { name: /Require acknowledgement for Ack worker/ }).click();
    await expect(page.getByRole("status")).toHaveText("Acknowledgement requirement updated.");
    await expect(card).toContainText("Acknowledgement required");

    await card.getByRole("link", { name: "Edit Ack worker shift" }).click();
    let editor = page.getByRole("form", { name: "Edit draft shift" });
    await editor.getByLabel("Team member").selectOption("");
    await editor.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft shift updated.");
    const open = page.locator("#open-shifts").getByText("Required service", { exact: true }).locator("../..");
    await expect(open).toContainText("Assign a worker or remove the requirement");
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Assign the open shift" })).toBeVisible();
    const blockedVersions = await admin.from("roster_publications").select("id").eq("department_id", departmentId);
    expect(blockedVersions.error).toBeNull();
    expect(blockedVersions.data).toHaveLength(0);

    await open.getByRole("link", { name: "Edit open shift" }).click();
    editor = page.getByRole("form", { name: "Edit draft shift" });
    await editor.getByLabel("Team member").selectOption(workerId);
    await editor.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft shift updated.");
    await expect(card).toContainText("Acknowledgement required");
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("status")).toHaveText("Front of House roster published.");
    await expect(card).toContainText("Awaiting acknowledgement");

    await workerPage.goto(schedule);
    const weekly = workerPage.getByRole("region", { name: "Weekly schedule" });
    await expect(weekly).toContainText("Required service");
    await expect(weekly).not.toContainText("Coworker service");
    await expect(weekly).toContainText("Acknowledgement required");
    expect(await workerPage.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await weekly.getByRole("button", { name: /Acknowledge Required service shift/ }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Shift acknowledged.");
    await expect(weekly).toContainText("Acknowledged");
    await expect(weekly.getByRole("button", { name: /Acknowledge Required service shift/ })).toHaveCount(0);
    await workerPage.reload();
    await expect(weekly).toContainText("Acknowledged");
    await page.reload();
    await expect(card).toContainText("Acknowledged");

    const create = page.getByRole("form", { name: "Add draft shift" });
    await create.getByLabel("Role").fill("Later required service");
    await create.getByLabel("Team member").selectOption(workerId);
    await create.getByLabel("Starts").fill("2032-03-16T11:00");
    await create.getByLabel("Ends").fill("2032-03-16T12:00");
    await create.getByLabel("Break").fill("0");
    await create.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    const laterCard = page.getByRole("article").filter({ hasText: "Later required service" });
    await laterCard.getByRole("button", { name: /Require acknowledgement for Ack worker/ }).click();
    await expect(page.getByRole("status")).toHaveText("Acknowledgement requirement updated.");
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("status")).toHaveText("Front of House roster published.");
    await expect(card).toContainText("Acknowledged");
    await expect(laterCard).toContainText("Awaiting acknowledgement");
    await workerPage.goto(schedule);
    await expect(weekly).toContainText("Later required service");
    await expect(weekly).toContainText("Acknowledged");
    await expect(weekly.getByRole("button", { name: /Acknowledge Later required service shift/ })).toBeVisible();

    const unlink = await admin.from("employees").update({ auth_user_id: null }).eq("id", workerId);
    expect(unlink.error).toBeNull();
    await weekly.getByRole("button", { name: /Acknowledge Later required service shift/ }).click();
    await expect(workerPage.getByRole("alert").filter({ hasText: "We couldn't acknowledge this shift" })).toBeVisible();
    const acknowledgementRows = await admin.from("shift_acknowledgements").select("shift_id, user_id")
      .eq("user_id", users[1]);
    expect(acknowledgementRows.error).toBeNull();
    expect(acknowledgementRows.data).toEqual([{ shift_id: shiftId, user_id: users[1] }]);
  } finally {
    if (workerContext) await workerContext.close();
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

test("open shift suggestions are scoped, explained and require manager action", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, outsideVenueId, fohId, bohId, outsideDepartmentId,
    heavyId, lightId, untaggedId, conflictId, unavailableId, outsideEmployeeId,
    roleId, otherRoleId, openShiftId, staleShiftId] = Array.from({ length: 17 }, () => randomUUID());
  const users = [];
  const contexts = [];
  const pageErrors = [];
  const roster = `/roster?business=${businessId}&week=2032-04-05&venue=${venueId}&department=${fohId}`;
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    for (const name of ["owner", "foh", "boh", "employee", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `suggest-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Suggestion cafe ${suffix}` },
      { id: outsideId, name: `Outside cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Suggestion venue", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
      { id: outsideDepartmentId, business_id: outsideId, venue_id: outsideVenueId, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users[4], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: heavyId, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Zoe Tagged", role_title: "Barista" },
      { id: lightId, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Amy Tagged", role_title: "Barista" },
      { id: untaggedId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[3], name: "Alex Untagged", role_title: "Server" },
      { id: conflictId, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Casey Conflict", role_title: "Server" },
      { id: unavailableId, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Uma Leave", role_title: "Server" },
      { id: outsideEmployeeId, business_id: outsideId, venue_id: outsideVenueId, department_id: outsideDepartmentId,
        name: "Outside Worker", role_title: "Barista" },
    ])).error).toBeNull();
    expect((await admin.from("employee_departments").insert({
      business_id: businessId, employee_id: lightId, department_id: bohId,
    })).error).toBeNull();
    expect((await admin.from("job_roles").insert([
      { id: roleId, business_id: businessId, venue_id: venueId, department_id: fohId, name: "Barista" },
      { id: otherRoleId, business_id: businessId, venue_id: venueId, department_id: bohId, name: "Barista" },
    ])).error).toBeNull();
    expect((await admin.from("employee_job_roles").insert([
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: heavyId, job_role_id: roleId },
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: lightId, job_role_id: roleId },
      { business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: lightId, job_role_id: otherRoleId },
    ])).error).toBeNull();
    expect((await admin.from("employee_availability_patterns").insert({
      business_id: businessId, venue_id: venueId, employee_id: lightId,
    })).error).toBeNull();
    expect((await admin.from("employee_availability_intervals").insert({
      business_id: businessId, venue_id: venueId, employee_id: lightId,
      weekday: 2, start_minute: 540, end_minute: 1020,
    })).error).toBeNull();
    expect((await admin.from("employee_availability_exceptions").insert({
      business_id: businessId, venue_id: venueId, employee_id: unavailableId,
      starts_on: "2032-04-06", ends_on: "2032-04-06", exception_type: "leave", status: "approved",
    })).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: openShiftId, business_id: businessId, venue_id: venueId, department_id: fohId, role_title: "Barista",
        starts_at: "2032-04-06T09:00:00Z", ends_at: "2032-04-06T12:00:00Z", break_minutes: 0, is_published: true },
      { id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: heavyId, role_title: "Service",
        starts_at: "2032-04-05T09:00:00Z", ends_at: "2032-04-05T17:00:00Z", break_minutes: 30, is_published: true },
      { id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: lightId, role_title: "Service",
        starts_at: "2032-04-05T09:00:00Z", ends_at: "2032-04-05T13:00:00Z", break_minutes: 0, is_published: false },
      { id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: lightId, role_title: "Kitchen",
        starts_at: "2032-04-07T08:00:00Z", ends_at: "2032-04-07T20:00:00Z", break_minutes: 0, is_published: true },
      { id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: conflictId, role_title: "Service",
        starts_at: "2032-04-06T10:00:00Z", ends_at: "2032-04-06T14:00:00Z", break_minutes: 0, is_published: true },
    ])).error).toBeNull();

    await signIn(page, `suggest-foh-${suffix}@example.test`, password);
    await page.goto(roster);
    const openShifts = page.locator("#open-shifts");
    await openShifts.getByText("Offer shift", { exact: true }).click();
    const disclosure = openShifts.getByText("Suggested candidates", { exact: true });
    await disclosure.focus();
    await page.keyboard.press("Enter");
    const suggestions = openShifts.getByRole("list", { name: /Suggested candidates for open shift Barista/ });
    await expect(suggestions).toBeVisible();
    await expect(suggestions.locator("li")).toHaveCount(3);
    await expect(suggestions.locator("li").nth(0)).toContainText("Amy Tagged");
    await expect(suggestions.locator("li").nth(0)).toContainText("4h 0m 0s scheduled");
    await expect(suggestions.locator("li").nth(0)).toContainText("Matching role tag recorded");
    await expect(suggestions.locator("li").nth(0)).toContainText("Availability pattern on file");
    await expect(suggestions.locator("li").nth(1)).toContainText("Zoe Tagged");
    await expect(suggestions.locator("li").nth(1)).toContainText("8h 0m 0s scheduled");
    await expect(suggestions.locator("li").nth(1)).toContainText("No availability pattern visible");
    await expect(suggestions.locator("li").nth(2)).toContainText("Alex Untagged");
    await expect(suggestions.locator("li").nth(2)).toContainText("No matching role tag recorded");
    await expect(suggestions).not.toContainText("Casey Conflict");
    await expect(suggestions).not.toContainText("Uma Leave");
    await expect(suggestions).not.toContainText("Outside Worker");
    await expect(openShifts).toContainText("Rule-based suggestions, not a generative AI model");
    await expect(openShifts).toContainText("other departments, venues and businesses are excluded");
    await expect(openShifts).toContainText("not confirmed availability");
    await expect(openShifts.getByRole("link", { name: "Help with open shifts" }))
      .toHaveAttribute("href", `/help?business=${businessId}&contextVenue=${venueId}&topic=shifts`);

    for (const width of [375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(suggestions).toBeVisible();
      expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth),
        `${width}px has no horizontal overflow`).toBe(true);
      if (width === 375 || width === 1440) {
        const accessibility = await new AxeBuilder({ page }).include("#open-shifts")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect(accessibility.violations.map((violation) => violation.id), `${width}px accessibility`).toEqual([]);
      }
    }
    const before = await admin.from("shift_offers").select("id", { count: "exact", head: true }).eq("shift_id", openShiftId);
    expect(before.error).toBeNull();
    expect(before.count).toBe(0);

    for (const name of ["boh", "employee", "outside"]) {
      const context = await browser.newContext({ baseURL: appUrl });
      contexts.push(context);
      const other = await context.newPage();
      await signIn(other, `suggest-${name}-${suffix}@example.test`, password);
      await other.goto(roster);
      await expect(other.getByText("Suggested candidates", { exact: true })).toHaveCount(0);
      await expect(other.getByText("Zoe Tagged", { exact: true })).toHaveCount(0);
      await context.close();
      contexts.pop();
    }
    const ownerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(ownerContext);
    const owner = await ownerContext.newPage();
    await signIn(owner, `suggest-owner-${suffix}@example.test`, password);
    await owner.goto(roster);
    await owner.locator("#open-shifts").getByText("Offer shift", { exact: true }).click();
    await owner.locator("#open-shifts").getByText("Suggested candidates", { exact: true }).click();
    await expect(owner.getByRole("list", { name: /Suggested candidates for open shift Barista/ }))
      .toContainText("Amy Tagged");
    await owner.getByRole("link", { name: "Help with open shifts" }).click();
    await expect(owner.getByRole("heading", { name: "Open shifts and swaps" })).toBeVisible();
    await expect(owner.locator("main")).toContainText("not a generative AI model");
    await ownerContext.close();
    contexts.pop();

    expect((await admin.from("shifts").insert({
      id: staleShiftId, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: lightId,
      role_title: "New conflicting shift", starts_at: "2032-04-06T10:00:00Z", ends_at: "2032-04-06T11:00:00Z",
    })).error).toBeNull();
    await openShifts.getByRole("button", { name: "Send offer" }).click();
    await expect(page.getByText("A selected team member is no longer eligible. Review the list and try again.")).toBeVisible();
    const after = await admin.from("shift_offers").select("id", { count: "exact", head: true }).eq("shift_id", openShiftId);
    expect(after.error).toBeNull();
    expect(after.count).toBe(0);
    const stillOpen = await admin.from("shifts").select("employee_id").eq("id", openShiftId).single();
    expect(stillOpen.error).toBeNull();
    expect(stillOpen.data.employee_id).toBeNull();
    await openShifts.getByText("Offer shift", { exact: true }).click();
    await openShifts.getByText("Suggested candidates", { exact: true }).click();
    await expect(suggestions).not.toContainText("Amy Tagged");
    await expect(suggestions).toContainText("Zoe Tagged");
    expect((await admin.from("employee_availability_exceptions").insert([
      { business_id: businessId, venue_id: venueId, employee_id: heavyId,
        starts_on: "2032-04-06", ends_on: "2032-04-06", exception_type: "leave", status: "approved" },
      { business_id: businessId, venue_id: venueId, employee_id: untaggedId,
        starts_on: "2032-04-06", ends_on: "2032-04-06", exception_type: "leave", status: "approved" },
    ])).error).toBeNull();
    await page.reload();
    await openShifts.getByText("Offer shift", { exact: true }).click();
    await openShifts.getByText("Suggested candidates", { exact: true }).click();
    await expect(openShifts.getByText("No eligible suggestions are available for this shift.")).toBeVisible();
    await expect(suggestions).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

test("open shift offer audiences handle the 200-person boundary", async ({ page }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, departmentId, openShiftId] = Array.from({ length: 4 }, () => randomUUID());
  let userId;
  try {
    const user = await admin.auth.admin.createUser({
      email: `suggest-limit-${suffix}@example.test`, password, email_confirm: true,
    });
    expect(user.error).toBeNull();
    userId = user.data.user.id;
    expect((await admin.from("businesses").insert({ id: businessId, name: `Large offer cafe ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Large offer venue", timezone: "UTC",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: userId, role: "owner",
    })).error).toBeNull();
    const employee = (index) => ({
      id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: departmentId,
      name: `Offer worker ${String(index).padStart(3, "0")}`, role_title: "Server",
    });
    expect((await admin.from("employees").insert(Array.from({ length: 200 }, (_, index) => employee(index)))).error).toBeNull();
    expect((await admin.from("shifts").insert({
      id: openShiftId, business_id: businessId, venue_id: venueId, department_id: departmentId,
      role_title: "Cover service", starts_at: "2032-04-06T09:00:00Z", ends_at: "2032-04-06T12:00:00Z",
      is_published: true,
    })).error).toBeNull();

    await signIn(page, `suggest-limit-${suffix}@example.test`, password);
    await page.goto(`/roster?business=${businessId}&week=2032-04-05&venue=${venueId}&department=${departmentId}`);
    const openShifts = page.locator("#open-shifts");
    const audience = openShifts.getByRole("group", { name: /Invite eligible team members for open shift Cover service/ });
    await openShifts.getByText("Offer shift", { exact: true }).click();
    await expect(audience.getByRole("checkbox")).toHaveCount(200);
    await expect(audience.locator('input[type="checkbox"]:checked')).toHaveCount(200);

    expect((await admin.from("employees").insert(employee(200))).error).toBeNull();
    await page.reload();
    await openShifts.getByText("Offer shift", { exact: true }).click();
    await expect(audience.getByRole("checkbox")).toHaveCount(201);
    await expect(audience.locator('input[type="checkbox"]:checked')).toHaveCount(0);
    await expect(audience).toContainText("More than 200 team members are eligible. Select up to 200");
    await openShifts.getByText("Suggested candidates", { exact: true }).click();
    await expect(openShifts.getByRole("list", { name: /Suggested candidates for open shift Cover service/ }).locator("li"))
      .toHaveCount(201);
    await audience.getByRole("checkbox", { name: "Offer worker 000" }).check();
    await openShifts.getByRole("button", { name: "Send offer" }).click();
    await expect(page.locator("main").getByRole("status"))
      .toHaveText("Shift offer sent. The shift stays open until you confirm a claim.");
    const offer = await admin.from("shift_offers").select("id").eq("shift_id", openShiftId).single();
    expect(offer.error).toBeNull();
    const recipients = await admin.from("shift_offer_recipients")
      .select("employee_id", { count: "exact", head: true }).eq("offer_id", offer.data.id);
    expect(recipients.error).toBeNull();
    expect(recipients.count).toBe(1);
  } finally {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});

test("managers offer published open shifts to eligible staff and confirm one timestamped claim", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, departmentId, annId, benId, openShiftId] = Array.from({ length: 6 }, () => randomUUID());
  const users = [];
  let workerContext;
  try {
    for (const name of ["owner", "ann", "ben"]) {
      const result = await admin.auth.admin.createUser({
        email: `offer-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Offer cafe ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Offer venue", timezone: "UTC", address: "1 Test Street",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: departmentId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: annId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[1], name: "Offer Ann", role_title: "Server" },
      { id: benId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[2], name: "Offer Ben", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: openShiftId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        role_title: "Cover service", starts_at: "2032-04-06T09:00:00Z", ends_at: "2032-04-06T12:00:00Z", is_published: true },
      { id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: benId,
        role_title: "Ben service", starts_at: "2032-04-06T10:00:00Z", ends_at: "2032-04-06T14:00:00Z", is_published: true },
    ])).error).toBeNull();

    await signIn(page, `offer-owner-${suffix}@example.test`, password);
    await page.goto(`/roster?week=2032-04-05&venue=${venueId}&department=${departmentId}`);
    const openShifts = page.locator("#open-shifts");
    await openShifts.getByText("Offer shift", { exact: true }).click();
    const audience = openShifts.getByRole("group", { name: /Invite eligible team members for open shift Cover service/ });
    await expect(audience.getByRole("checkbox", { name: /Offer Ann/ })).toBeChecked();
    const ben = audience.getByRole("checkbox", { name: /Offer Ben/ });
    await expect(ben).toBeDisabled();
    await expect(audience.locator("label").filter({ hasText: "Offer Ben" })).toContainText("Already rostered at this time");
    await openShifts.getByRole("button", { name: "Send offer" }).click();
    await expect(page.locator("main").getByRole("status"))
      .toHaveText("Shift offer sent. The shift stays open until you confirm a claim.");
    const panel = openShifts.getByRole("region", { name: /Offer for open shift Cover service/ });
    await expect(panel).toContainText("Offered to 1");
    await expect(panel).toContainText("Offer Ann — Awaiting response");

    workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    const benPage = await workerContext.newPage();
    await signIn(benPage, `offer-ben-${suffix}@example.test`, password);
    await benPage.goto(`/my-schedule?week=2032-04-05&venue=${venueId}`);
    await expect(benPage.getByRole("region", { name: "Shift offers" })).toHaveCount(0);
    await workerContext.close();

    workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    const annPage = await workerContext.newPage();
    await signIn(annPage, `offer-ann-${suffix}@example.test`, password);
    await annPage.goto(`/notifications?business=${businessId}&venue=${venueId}`);
    const offerNotification = annPage.getByRole("article", { name: "Shift offer for Cover service" });
    await expect(offerNotification).toContainText("A shift was offered to you");
    await expect(offerNotification.getByText("Unread", { exact: true })).toBeVisible();
    await offerNotification.getByRole("button", { name: "View shift offer" }).click();
    await expect(annPage).toHaveURL(new RegExp(`/my-schedule\\?business=${businessId}&week=2032-04-05&venue=${venueId}#shift-offers`));
    await annPage.goto(`/my-schedule?week=2032-04-05&venue=${venueId}`);
    const offers = annPage.getByRole("region", { name: "Shift offers" });
    await expect(offers).toContainText("Cover service · Front of House");
    expect(await annPage.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await offers.getByRole("button", { name: /Claim Cover service shift/ }).click();
    await expect(annPage.locator("main").getByRole("status"))
      .toHaveText("Shift claimed. Your manager will confirm who gets the shift.");
    await expect(offers).toContainText("Claimed — waiting for manager confirmation");
    await expect(offers.getByRole("button", { name: /Claim Cover service shift/ })).toHaveCount(0);
    const claim = await admin.from("shift_offer_recipients").select("response, responded_at, responded_by")
      .eq("employee_id", annId).single();
    expect(claim.error).toBeNull();
    expect(claim.data.response).toBe("accepted");
    expect(claim.data.responded_by).toBe(users[1]);
    expect(Number.isNaN(Date.parse(claim.data.responded_at))).toBe(false);

    await page.reload();
    await expect(panel).toContainText("Offer Ann — Claimed");
    await panel.getByRole("button", { name: /Confirm Offer Ann for open shift Cover service/ }).click();
    await expect(page.locator("main").getByRole("status")).toHaveText("Claim confirmed and the shift assigned.");
    await expect(openShifts.getByText("Cover service", { exact: true })).toHaveCount(0);
    const assigned = await admin.from("shifts").select("employee_id").eq("id", openShiftId).single();
    expect(assigned.error).toBeNull();
    expect(assigned.data.employee_id).toBe(annId);

    await annPage.reload();
    await expect(offers).toContainText("Confirmed — this shift is yours");
    await expect(annPage.getByRole("region", { name: "Weekly schedule" })).toContainText("Cover service");
    await annPage.goto(`/notifications?business=${businessId}&venue=${venueId}`);
    const approvalNotification = annPage.getByRole("article", { name: "Shift offer outcome for Cover service" });
    await expect(approvalNotification).toContainText("Your shift claim was approved.");
    await expect(approvalNotification.getByText("Unread", { exact: true })).toBeVisible();
    await approvalNotification.getByRole("button", { name: "View shift offer" }).click();
    await expect(annPage).toHaveURL(new RegExp(`/my-schedule\\?business=${businessId}&week=2032-04-05&venue=${venueId}#shift-offers`));
    await expect(annPage.getByRole("region", { name: "Shift offers" })).toContainText("Confirmed — this shift is yours");
  } finally {
    if (workerContext) await workerContext.close();
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

test("owners link shared workers and scoped rosters enforce cross-venue conflicts", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusinessId, firstVenue, secondVenue, outsideVenue,
    firstDepartment, secondDepartment, outsideDepartment, firstEmployee, secondEmployee,
    alternateEmployee, outsideEmployee, firstShift, secondShift] =
    Array.from({ length: 14 }, () => randomUUID());
  const users = [];
  let managerContext;
  try {
    for (const name of ["owner", "manager", "worker", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `shared-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Shared cafe ${suffix}` },
      { id: outsideBusinessId, name: `Other shared cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: firstVenue, business_id: businessId, name: "Harbour", timezone: "UTC" },
      { id: secondVenue, business_id: businessId, name: "Riverside", timezone: "UTC" },
      { id: outsideVenue, business_id: outsideBusinessId, name: "Other business", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: firstDepartment, business_id: businessId, venue_id: firstVenue, name: "Front of House" },
      { id: secondDepartment, business_id: businessId, venue_id: secondVenue, name: "Back of House" },
      { id: outsideDepartment, business_id: outsideBusinessId, venue_id: outsideVenue, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: firstVenue, department_id: firstDepartment },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: firstVenue, department_id: firstDepartment },
      { business_id: outsideBusinessId, user_id: users[3], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: firstEmployee, business_id: businessId, venue_id: firstVenue, department_id: firstDepartment,
        auth_user_id: users[2], name: "Alex Shared", role_title: "Server" },
      { id: secondEmployee, business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        name: "Alex Shared", role_title: "Cook" },
      { id: alternateEmployee, business_id: businessId, venue_id: firstVenue, department_id: firstDepartment,
        name: "Zoe Alternative", role_title: "Server" },
      { id: outsideEmployee, business_id: outsideBusinessId, venue_id: outsideVenue, department_id: outsideDepartment,
        name: "Alex Shared", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { id: firstShift, business_id: businessId, venue_id: firstVenue, department_id: firstDepartment,
        employee_id: firstEmployee, role_title: "Visible service",
        starts_at: "2032-03-15T09:00:00Z", ends_at: "2032-03-15T12:00:00Z" },
      { id: secondShift, business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        employee_id: secondEmployee, role_title: "Private other venue",
        starts_at: "2032-03-15T10:00:00Z", ends_at: "2032-03-15T11:00:00Z" },
      { id: randomUUID(), business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        employee_id: secondEmployee, role_title: "Private afternoon",
        starts_at: "2032-03-15T16:00:00Z", ends_at: "2032-03-15T17:00:00Z" },
    ])).error).toBeNull();

    managerContext = await browser.newContext({ baseURL: appUrl });
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `shared-manager-${suffix}@example.test`, password);
    const roster = `/roster?week=2032-03-15&venue=${firstVenue}&department=${firstDepartment}`;
    await managerPage.goto(roster);
    const visibleCard = managerPage.locator("article", { hasText: "Visible service" });
    await expect(visibleCard.getByRole("note")).toHaveCount(0);
    await expect(managerPage.getByText("Private other venue", { exact: true })).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, `shared-owner-${suffix}@example.test`, password);
    await page.goto(`/people?venue=${firstVenue}`);
    await page.getByRole("link", { name: "View profile for Alex Shared" }).click();
    await page.getByRole("button", { name: "Manage shared profiles" }).click();
    const section = page.getByRole("region", { name: "Shared staff across venues" });
    const form = section.getByRole("form", { name: "Link shared staff" });
    await expect(section).toContainText("do not link accounts or grant access");
    await expect(form.locator(`option[value="${outsideEmployee}"]`)).toHaveCount(0);
    await expect(form).toContainText("Profile in Harbour: Alex Shared");
    await form.getByLabel("Profile at another venue").selectOption(secondEmployee);
    await form.evaluate((element) => { element.noValidate = true; });
    await form.getByRole("button", { name: "Link profiles" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Confirm the shared-profile change");
    await page.getByRole("button", { name: "Manage shared profiles" }).click();
    await form.getByLabel("Profile at another venue").selectOption(secondEmployee);
    await form.getByLabel("I have confirmed that these profiles belong to the same person.").check();
    await form.getByRole("button", { name: "Link profiles" }).click();
    await expect(page.locator('p[role="status"]')).toHaveText("Shared-worker profiles linked.");
    await page.getByRole("button", { name: "Manage shared profiles" }).click();
    await expect(section).toContainText(`Alex Shared — Riverside — ${secondEmployee}`);
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const linkedAccount = await admin.from("employees").select("auth_user_id").eq("id", secondEmployee).single();
    expect(linkedAccount.error).toBeNull();
    expect(linkedAccount.data.auth_user_id).toBeNull();

    await managerPage.reload();
    await expect(visibleCard.getByRole("note")).toContainText("Overlaps another shift");
    await expect(managerPage.getByText("Private other venue", { exact: true })).toHaveCount(0);
    const managerApi = createClient(apiUrl, anonKey, options);
    expect((await managerApi.auth.signInWithPassword({
      email: `shared-manager-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await managerApi.rpc("list_shared_worker_profiles", {
      p_business_id: businessId, p_venue_id: firstVenue,
    })).error?.message).toBe("Permission denied");
    await managerPage.goto(`/people?venue=${firstVenue}`);
    await managerPage.getByRole("link", { name: "View profile for Alex Shared" }).click();
    await expect(managerPage.getByRole("region", { name: "Shared staff across venues" })).toHaveCount(0);
    await expect(managerPage.getByRole("button", { name: "Manage shared profiles" })).toHaveCount(0);
    await managerPage.goto(roster);
    const create = managerPage.getByRole("form", { name: "Add draft shift" });
    await create.getByLabel("Role").fill("Automatic shared-worker check");
    await create.getByLabel("Team member").selectOption("auto");
    await create.getByLabel("Starts").fill("2032-03-15T16:00");
    await create.getByLabel("Ends").fill("2032-03-15T17:00");
    await create.getByRole("button", { name: "Save draft shift" }).click();
    await expect(managerPage.locator('p[role="status"]')).toHaveText("Shift saved to the draft roster.");
    const automatic = await admin.from("shifts").select("employee_id")
      .eq("business_id", businessId).eq("role_title", "Automatic shared-worker check").single();
    expect(automatic.error).toBeNull();
    expect(automatic.data.employee_id).toBe(alternateEmployee);

    await page.goto(`/settings/organisation?venue=${firstVenue}`);
    const policy = page.getByRole("form", { name: "Configure roster conflict rules" });
    await policy.getByLabel("Publish with overlapping shifts").selectOption("true");
    await policy.getByRole("button", { name: "Save roster conflict rules" }).click();
    await expect(page.locator('p[role="status"]')).toHaveText("Roster conflict rules saved.");
    await managerPage.goto(roster);
    await managerPage.getByRole("button", { name: "Publish this department" }).click();
    await expect(managerPage.locator('p[role="alert"]')).toContainText("overlapping shifts");
    await expect(managerPage.getByText("Private other venue", { exact: true })).toHaveCount(0);
    const blocked = await admin.from("shifts").select("is_published").eq("id", firstShift).single();
    expect(blocked.error).toBeNull();
    expect(blocked.data.is_published).toBe(false);

    await page.goto(`/people?venue=${firstVenue}`);
    await page.getByRole("link", { name: "View profile for Alex Shared" }).click();
    await page.getByRole("button", { name: "Manage shared profiles" }).click();
    const unlink = page.getByRole("form", { name: `Unlink Alex Shared ${firstEmployee}` });
    await unlink.getByLabel("Remove this profile from all its linked venues.").check();
    await unlink.getByRole("button", { name: "Unlink profile" }).click();
    await expect(page.locator('p[role="status"]')).toHaveText("Shared-worker profile unlinked.");
    await managerPage.goto(roster);
    await expect(visibleCard.getByRole("note")).toHaveCount(0);
    await managerPage.getByRole("button", { name: "Publish this department" }).click();
    await expect(managerPage.locator('p[role="status"]')).toHaveText("Front of House roster published.");
    const otherVenue = await admin.from("shifts").select("is_published").eq("id", secondShift).single();
    expect(otherVenue.error).toBeNull();
    expect(otherVenue.data.is_published).toBe(false);
  } finally {
    try {
      if (managerContext && browser.isConnected()) await managerContext.close();
    } finally {
      await assertBusinessFixturesPreserved(admin, [businessId, outsideBusinessId]);
      for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
});

test("cross-venue roster conflicts remain visible beyond 1000 shifts", async ({ page }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, firstVenue, secondVenue, firstDepartment, secondDepartment, firstEmployee, secondEmployee] =
    Array.from({ length: 7 }, () => randomUUID());
  let userId;
  try {
    const user = await admin.auth.admin.createUser({
      email: `shared-pagination-${suffix}@example.test`, password, email_confirm: true,
    });

    expect(user.error).toBeNull();
    userId = user.data.user.id;
    expect((await admin.from("businesses").insert({ id: businessId, name: `Large roster ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: firstVenue, business_id: businessId, name: "First", timezone: "UTC" },
      { id: secondVenue, business_id: businessId, name: "Second", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: firstDepartment, business_id: businessId, venue_id: firstVenue, name: "First FOH" },
      { id: secondDepartment, business_id: businessId, venue_id: secondVenue, name: "Second FOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: userId, role: "owner",
    })).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: firstEmployee, business_id: businessId, venue_id: firstVenue, department_id: firstDepartment,
        name: "Paged worker", role_title: "Server" },
      { id: secondEmployee, business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        name: "Paged worker", role_title: "Server" },
    ])).error).toBeNull();
    const openShifts = Array.from({ length: 1000 }, () => ({
      business_id: businessId, venue_id: firstVenue, department_id: firstDepartment,
      employee_id: null, role_title: "Early open coverage",
      starts_at: "2032-03-15T00:00:00Z", ends_at: "2032-03-15T01:00:00Z",
    }));
    expect((await admin.from("shifts").insert(openShifts)).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { business_id: businessId, venue_id: firstVenue, department_id: firstDepartment, employee_id: firstEmployee,
        role_title: "Beyond the first page", starts_at: "2032-03-16T09:00:00Z", ends_at: "2032-03-16T10:00:00Z" },
      { business_id: businessId, venue_id: secondVenue, department_id: secondDepartment, employee_id: secondEmployee,
        role_title: "Hidden paged conflict", starts_at: "2032-03-16T09:00:00Z", ends_at: "2032-03-16T10:00:00Z" },
    ])).error).toBeNull();
    const ownerApi = createClient(apiUrl, anonKey, options);
    expect((await ownerApi.auth.signInWithPassword({
      email: `shared-pagination-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await ownerApi.rpc("link_shared_worker_profiles", {
      p_business_id: businessId, p_venue_id: firstVenue,
      p_employee_id: firstEmployee, p_other_employee_id: secondEmployee,
    })).error).toBeNull();
    const count = await admin.from("shifts").select("id", { count: "exact", head: true })
      .eq("venue_id", firstVenue);
    expect(count.error).toBeNull();
    expect(count.count).toBe(1001);

    await signIn(page, `shared-pagination-${suffix}@example.test`, password);
    await page.goto(`/roster?week=2032-03-15&venue=${firstVenue}&department=${firstDepartment}`);
    await expect(page.locator("#open-shifts")).toContainText("1000 to fill");
    await expect(page.locator("article", { hasText: "Beyond the first page" }).getByRole("note"))
      .toContainText("Overlaps another shift");
    await expect(page.getByText("Hidden paged conflict", { exact: true })).toHaveCount(0);
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});

test("managers correct finished attendance with audit history, scoped locks and DST safety", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, outsideVenue, fohId, bohId, employeeId, colleagueId,
    sessionId, adjacentSession, dstSession, breakId, clockInId, breakStartId, breakEndId, clockOutId,
    adjacentInId, adjacentOutId, dstInId, dstOutId] = Array.from({ length: 20 }, () => randomUUID());
  const users = [];
  const contexts = [];
  const workerApi = createClient(apiUrl, anonKey, options);
  try {
    for (const role of ["owner", "foh", "boh", "worker", "colleague", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `correction-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Correction cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside correction cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[4], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusiness, user_id: users[5], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[3], name: "Correction Worker", role_title: "Server" },
      { id: colleagueId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[4], name: "Correction Colleague", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("attendance_sessions").insert([sessionId, adjacentSession, dstSession].map((id) => ({
      id, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: employeeId, started_by: users[3],
    })))).error).toBeNull();
    expect((await admin.from("attendance_breaks").insert({
      id: breakId, session_id: sessionId, business_id: businessId, classification: "unpaid",
    })).error).toBeNull();
    const sourceEvents = [
      [clockInId, sessionId, "clock_in", null, "2024-01-09T22:00:00Z"],
      [breakStartId, sessionId, "break_start", breakId, "2024-01-10T01:00:00Z"],
      [breakEndId, sessionId, "break_end", breakId, "2024-01-10T01:30:00Z"],
      [clockOutId, sessionId, "clock_out", null, "2024-01-10T06:00:00Z"],
      [adjacentInId, adjacentSession, "clock_in", null, "2024-01-10T07:00:00Z"],
      [adjacentOutId, adjacentSession, "clock_out", null, "2024-01-10T08:00:00Z"],
      [dstInId, dstSession, "clock_in", null, "2024-04-06T14:30:00Z"],
      [dstOutId, dstSession, "clock_out", null, "2024-04-06T17:30:00Z"],
    ].map(([id, session, eventType, breakValue, occurredAt]) => ({
      id, session_id: session, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: employeeId, actor_id: users[3], request_id: randomUUID(), event_type: eventType,
      break_id: breakValue, occurred_at: occurredAt,
    }));
    expect((await admin.from("attendance_events").insert(sourceEvents)).error).toBeNull();
    expect((await workerApi.auth.signInWithPassword({
      email: `correction-worker-${suffix}@example.test`, password,
    })).error).toBeNull();

    await signIn(page, `correction-foh-${suffix}@example.test`, password);
    await page.goto(`/work-time?venue=${venueId}`);
    const card = page.locator(`#attendance-session-${sessionId}`);
    const dstCard = page.locator(`#attendance-session-${dstSession}`);
    const metric = (item, label) => item.getByText(label, { exact: true }).locator("..").locator("dd");
    await expect(metric(card, "Worked")).toHaveText("7h 30m 0s");
    await card.locator("summary").click();
    let form = card.getByRole("form", { name: "Correct Clock in" });
    await form.getByLabel("Corrected local time (Australia/Sydney)").fill("2024-01-10T08:30:00.123");
    await form.getByLabel("Additional microseconds (optional, 0 to 999)").fill("456");
    await form.getByLabel("Reason for correction").fill("Forgot to clock at the start");
    await form.getByRole("button", { name: "Save correction" }).click();
    await expect(page.locator('p[role="status"]')).toContainText("original event is unchanged");
    await expect(metric(card, "Worked")).toHaveText("8h 0m 0s");
    await card.locator("summary").click();
    await expect(card).toContainText("Forgot to clock at the start");
    await expect(card).toContainText(users[1]);
    form = card.getByRole("form", { name: "Correct Break end" });
    await form.getByLabel("Corrected local time (Australia/Sydney)").fill("2024-01-10T12:45");
    await form.getByLabel("Reason for correction").fill("Break ended later");
    await form.getByRole("button", { name: "Save correction" }).click();
    await expect(page.locator('p[role="status"]')).toContainText("original event is unchanged");
    await expect(metric(card, "Unpaid break")).toHaveText("0h 45m 0s");
    await expect(metric(card, "Worked")).toHaveText("7h 45m 0s");

    const workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, `correction-worker-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${venueId}`);
    const history = workerPage.getByRole("region", { name: "Attendance correction history" });
    await expect(history).toContainText("Forgot to clock at the start");
    await expect(history).toContainText("Break ended later");
    await expect(history).toContainText(users[1]);
    await expect(history).toContainText("Original:");
    await expect(history).toContainText("Previous:");
    await expect(history).toContainText("Corrected:");
    expect(await workerPage.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await dstCard.locator("summary").click();
    form = dstCard.getByRole("form", { name: "Correct Clock in" });
    await form.getByLabel("Corrected local time (Australia/Sydney)").fill("2024-10-06T02:30");
    await form.getByLabel("Reason for correction").fill("Invalid gap");
    await form.getByRole("button", { name: "Save correction" }).click();
    await expect(page.locator('p[role="alert"]').filter({ hasText: "did not exist" })).toBeVisible();
    await dstCard.locator("summary").click();
    form = dstCard.getByRole("form", { name: "Correct Clock in" });
    await form.getByLabel("Corrected local time (Australia/Sydney)").fill("2024-04-07T02:30");
    await form.getByLabel("Reason for correction").fill("Repeated hour");
    await form.getByRole("button", { name: "Save correction" }).click();
    await expect(page.locator('p[role="alert"]').filter({ hasText: "occurred twice" })).toBeVisible();
    await dstCard.locator("summary").click();
    form = dstCard.getByRole("form", { name: "Correct Clock in" });
    await form.getByLabel("Corrected local time (Australia/Sydney)").fill("2024-04-07T02:30");
    await form.getByLabel("If this time occurred twice").selectOption("earlier");
    await form.getByLabel("Reason for correction").fill("First occurrence");
    await form.getByRole("button", { name: "Save correction" }).click();
    await expect(page.locator('p[role="status"]')).toContainText("original event is unchanged");
    await expect(metric(dstCard, "Worked")).toHaveText("2h 0m 0s");
    await dstCard.locator("summary").click();
    form = dstCard.getByRole("form", { name: "Correct Clock in" });
    await form.getByLabel("Corrected local time (Australia/Sydney)").fill("2024-04-07T02:30");
    await form.getByLabel("If this time occurred twice").selectOption("later");
    await form.getByLabel("Reason for correction").fill("Second occurrence");
    await form.getByRole("button", { name: "Save correction" }).click();
    await expect(page.locator('p[role="status"]')).toContainText("original event is unchanged");
    await expect(metric(dstCard, "Worked")).toHaveText("1h 0m 0s");

    await card.locator("summary").click();
    form = card.getByRole("form", { name: "Correct Clock out" });
    await form.getByLabel("Corrected local time (Australia/Sydney)").fill("2024-01-10T18:30");
    await form.getByLabel("Reason for correction").fill("Overlapping correction");
    await form.getByRole("button", { name: "Save correction" }).click();
    await expect(page.locator('p[role="alert"]').filter({ hasText: "overlaps another session" })).toBeVisible();
    await card.locator("summary").click();
    form = card.getByRole("form", { name: "Correct Break start" });
    await form.getByLabel("Corrected local time (Australia/Sydney)").fill("2024-01-10T08:00");
    await form.getByLabel("Reason for correction").fill("Requires review");
    await form.getByRole("button", { name: "Save correction" }).click();
    await expect(page.locator('p[role="status"]')).toContainText("original event is unchanged");
    await expect(metric(card, "Worked")).toHaveText("Unavailable");
    await expect(card).toContainText("Break times invalid");
    await card.locator("summary").click();
    await expect(card.getByRole("form", { name: "Lock attendance edits" })).toHaveCount(0);
    form = card.getByRole("form", { name: "Correct Break start" });
    await form.getByLabel("Corrected local time (Australia/Sydney)").fill("2024-01-10T12:00");
    await form.getByLabel("Reason for correction").fill("Correct chronology");
    await form.getByRole("button", { name: "Save correction" }).click();
    await expect(page.locator('p[role="status"]')).toContainText("original event is unchanged");
    await expect(metric(card, "Worked")).toHaveText("7h 45m 0s");
    await card.locator("summary").click();
    const lockForm = card.getByRole("form", { name: "Lock attendance edits" });
    await lockForm.getByLabel("Reason to lock attendance edits").fill("Manager review complete");
    await lockForm.getByRole("button", { name: "Lock attendance edits" }).click();
    await expect(page.locator('p[role="status"]')).toContainText("not a payroll approval");
    if (!await card.locator("details").evaluate((details) => details.open)) {
      await card.locator("summary").click();
    }
    await expect(card).toContainText("Attendance edits: Locked");
    await expect(card.getByText("Locked: Manager review complete", { exact: true })).toBeVisible();
    await expect(card.getByRole("heading", { name: "Edit lock history" }).locator("..")).toContainText(users[1]);
    await expect(card).toContainText("Ask an owner or general manager");
    await expect(card.getByRole("form", { name: "Correct Clock in" })).toHaveCount(0);
    await expect(card.getByRole("form", { name: "Unlock attendance edits" })).toHaveCount(0);

    const ownerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(ownerContext);
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, `correction-owner-${suffix}@example.test`, password);
    await ownerPage.goto(`/work-time?venue=${venueId}`);
    const ownerCard = ownerPage.locator(`#attendance-session-${sessionId}`);
    await ownerCard.locator("summary").click();
    const unlockForm = ownerCard.getByRole("form", { name: "Unlock attendance edits" });
    await unlockForm.getByLabel("Reason to unlock attendance edits").fill("Reopen after discussion");
    await unlockForm.getByRole("button", { name: "Unlock attendance edits" }).click();
    await expect(ownerPage.locator('p[role="status"]')).toContainText("unlocked with a recorded reason");
    await page.reload();
    await card.locator("summary").click();
    await expect(card).toContainText("Attendance edits: Unlocked");
    const lockHistory = card.getByRole("heading", { name: "Edit lock history" }).locator("..");
    await expect(lockHistory.locator("li").first()).toContainText("Unlocked: Reopen after discussion");
    await expect(lockHistory.locator("li").first()).toContainText(users[0]);
    await expect(lockHistory.locator("li").nth(1)).toContainText("Locked: Manager review complete");
    await expect(card.getByRole("form", { name: "Correct Clock in" })).toBeVisible();

    const mobileManagerContext = await browser.newContext({
      baseURL: appUrl, viewport: { width: 375, height: 812 },
    });
    contexts.push(mobileManagerContext);
    const mobileManagerPage = await mobileManagerContext.newPage();
    await signIn(mobileManagerPage, `correction-foh-${suffix}@example.test`, password);
    await mobileManagerPage.goto(`/work-time?venue=${venueId}`);
    const mobileCard = mobileManagerPage.locator(`#attendance-session-${sessionId}`);
    await mobileCard.locator("summary").click();
    await expect(mobileCard.getByRole("form", { name: "Correct Clock in" })).toBeVisible();
    await expect(mobileCard.getByText("Unlocked: Reopen after discussion", { exact: true })).toBeVisible();
    expect(await mobileManagerPage.locator("body")
      .evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await workerPage.reload();
    await expect(history).toContainText("Second occurrence");
    await expect(history).toContainText("Correct chronology");
    const visibleHistory = await workerApi.rpc("list_attendance_corrections", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    expect(visibleHistory.error).toBeNull();
    expect(visibleHistory.data).toHaveLength(6);
    expect(visibleHistory.data.find((row) => row.event_id === clockInId).new_at)
      .toMatch(/21:30:00\.123456/);
    const dstRows = visibleHistory.data.filter((row) => row.event_id === dstInId);
    expect(dstRows.map((row) => new Date(row.new_at).toISOString()).sort())
      .toEqual(["2024-04-06T15:30:00.000Z", "2024-04-06T16:30:00.000Z"]);
    const originals = await admin.from("attendance_events").select("id, occurred_at")
      .in("id", [clockInId, breakStartId, breakEndId, clockOutId, dstInId]);
    expect(originals.error).toBeNull();
    for (const event of sourceEvents.filter((item) =>
      [clockInId, breakStartId, breakEndId, clockOutId, dstInId].includes(item.id))) {
      expect(new Date(originals.data.find((item) => item.id === event.id).occurred_at).toISOString())
        .toBe(new Date(event.occurred_at).toISOString());
    }

    await workerPage.getByRole("button", { name: "Sign out" }).click();
    await expect(workerPage).toHaveURL(/\/login\?message=signed-out/);
    await signIn(workerPage, `correction-colleague-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${venueId}`);
    await expect(history).toContainText("No attendance corrections in your scope");
    await expect(history).not.toContainText("Correction Worker");
    await workerPage.getByRole("button", { name: "Sign out" }).click();
    await expect(workerPage).toHaveURL(/\/login\?message=signed-out/);
    await signIn(workerPage, `correction-boh-${suffix}@example.test`, password);
    await workerPage.goto(`/work-time?venue=${venueId}`);
    await expect(workerPage.getByRole("region", { name: "Recorded work time" }))
      .not.toContainText("Correction Worker");
    await workerPage.getByRole("button", { name: "Sign out" }).click();
    await expect(workerPage).toHaveURL(/\/login\?message=signed-out/);
    await signIn(workerPage, `correction-outside-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${outsideVenue}`);
    await expect(history).toContainText("No attendance corrections in your scope");
    await expect(history).not.toContainText("Correction Worker");
  } finally {
    for (const item of contexts) await item.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("managers reconcile offline claims with existing attendance and an auditable decision", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, outsideVenue, fohId, bohId, employeeId, sessionId,
    clockInId, clockOutId, openSessionId, openBreakId, colleagueEmployeeId, colleagueSessionId,
    colleagueBreakId] = Array.from({ length: 15 }, () => randomUUID());
  const users = [];
  const contexts = [];
  const workerApi = createClient(apiUrl, anonKey, options);
  const ownerApi = createClient(apiUrl, anonKey, options);
  const colleagueApi = createClient(apiUrl, anonKey, options);
  try {
    for (const role of ["owner", "foh", "boh", "worker", "colleague", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `claim-review-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Claim review cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside review cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[4], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusiness, user_id: users[5], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[3], name: "Claim Worker", role_title: "Server" },
      { id: colleagueEmployeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[4], name: "Claim Colleague", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("attendance_sessions").insert([
      { id: sessionId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: employeeId, started_by: users[3] },
      { id: openSessionId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: employeeId, started_by: users[3] },
      { id: colleagueSessionId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: colleagueEmployeeId, started_by: users[4] },
    ])).error).toBeNull();
    expect((await admin.from("attendance_breaks").insert([
      { id: openBreakId, session_id: openSessionId, business_id: businessId, classification: "unpaid" },
      { id: colleagueBreakId, session_id: colleagueSessionId, business_id: businessId, classification: "paid" },
    ])).error).toBeNull();
    expect((await admin.from("attendance_events").insert([
      { id: clockInId, session_id: sessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[3], request_id: randomUUID(),
        event_type: "clock_in", occurred_at: "2024-01-10T09:00:00Z" },
      { id: clockOutId, session_id: sessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[3], request_id: randomUUID(),
        event_type: "clock_out", occurred_at: "2024-01-10T17:00:00Z" },
      { id: randomUUID(), session_id: openSessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[3], request_id: randomUUID(),
        event_type: "clock_in", occurred_at: "2024-01-13T09:00:00Z" },
      { id: randomUUID(), session_id: openSessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[3], request_id: randomUUID(),
        event_type: "break_start", break_id: openBreakId, occurred_at: "2024-01-13T12:00:00Z" },
      { id: randomUUID(), session_id: openSessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[3], request_id: randomUUID(),
        event_type: "break_end", break_id: openBreakId, occurred_at: "2024-01-13T12:30:00Z" },
      { id: randomUUID(), session_id: colleagueSessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: colleagueEmployeeId, actor_id: users[4], request_id: randomUUID(),
        event_type: "clock_in", occurred_at: "2024-01-13T09:00:00Z" },
      { id: randomUUID(), session_id: colleagueSessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: colleagueEmployeeId, actor_id: users[4], request_id: randomUUID(),
        event_type: "break_start", break_id: colleagueBreakId, occurred_at: "2024-01-13T12:00:00Z" },
    ])).error).toBeNull();
    expect((await workerApi.auth.signInWithPassword({
      email: `claim-review-worker-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await ownerApi.auth.signInWithPassword({
      email: `claim-review-owner-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await colleagueApi.auth.signInWithPassword({
      email: `claim-review-colleague-${suffix}@example.test`, password,
    })).error).toBeNull();

    const claims = [];
    for (const [eventType, claimedAt] of [
      ["clock_in", "2024-01-10T08:45:00.123456Z"],
      ["clock_out", "2024-01-10T17:00:00Z"],
      ["clock_in", "2024-01-10T08:00:00Z"],
      ["clock_out", "2024-01-10T17:20:00Z"],
      ["clock_in", "2024-01-11T09:00:00.123456Z"],
      ["clock_out", "2024-01-11T17:00:00.654321Z"],
      ["clock_out", "2024-01-13T17:00:00.234567Z"],
    ]) {
      const result = await workerApi.rpc("submit_attendance_offline_claim", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
        p_employee_id: employeeId, p_actor_id: users[3], p_request_id: randomUUID(),
        p_event_type: eventType, p_claimed_at: claimedAt,
      });
      expect(result.error).toBeNull();
      claims.push({ ...result.data[0], claimedAt });
    }
    const colleagueClaim = await colleagueApi.rpc("submit_attendance_offline_claim", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
      p_employee_id: colleagueEmployeeId, p_actor_id: users[4], p_request_id: randomUUID(),
      p_event_type: "clock_out", p_claimed_at: "2024-01-13T17:00:00Z",
    });
    expect(colleagueClaim.error).toBeNull();
    claims.push({ ...colleagueClaim.data[0], claimedAt: "2024-01-13T17:00:00Z", colleague: true });
    await signIn(page, `claim-review-foh-${suffix}@example.test`, password);
    await page.goto(`/attendance?venue=${venueId}`);
    const claimCard = (index) => page.locator(`#offline-claim-${claims[index].claim_id}`);
    let form = claimCard(0).getByRole("form", { name: "Reconcile offline claim" });
    await form.getByLabel("Existing finished attendance event").selectOption({ index: 1 });
    await form.getByLabel("Reason for review").fill("Confirmed start from the claim");
    await form.getByRole("button", { name: "Use claimed time as correction" }).click();
    await expect(claimCard(0)).toContainText("Existing event corrected to the claimed time");
    await expect(claimCard(0)).toContainText("Confirmed start from the claim");
    await expect(claimCard(0)).toContainText(users[1]);
    const worked = await ownerApi.rpc("list_worked_time", { p_business_id: businessId, p_venue_id: venueId });
    expect(worked.error).toBeNull();
    expect(worked.data.find((row) => row.session_id === sessionId).worked_seconds).toBe(29699.876544);

    form = claimCard(1).getByRole("form", { name: "Reconcile offline claim" });
    await form.getByLabel("Existing finished attendance event").selectOption({ index: 1 });
    await form.getByLabel("Reason for review").fill("Already recorded correctly");
    await form.getByRole("button", { name: "Match without changing time" }).click();
    await expect(claimCard(1)).toContainText("Matched to an existing event without changing its time");
    const reject = claimCard(2).getByRole("form", { name: "Reject offline claim" });
    await reject.getByLabel("Reason for rejecting this claim").fill("Duplicate device claim");
    await reject.getByRole("button", { name: "Reject claim" }).click();
    await expect(claimCard(2)).toContainText("Rejected: Duplicate device claim");

    expect((await ownerApi.rpc("set_attendance_edit_lock", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: sessionId,
      p_request_id: randomUUID(), p_locked: true, p_reason: "Reviewed",
    })).error).toBeNull();
    await page.reload();
    form = claimCard(3).getByRole("form", { name: "Reconcile offline claim" });
    await form.getByLabel("Existing finished attendance event").selectOption({ index: 1 });
    await expect(form.locator("option").nth(1)).toContainText("editing locked");
    await form.getByLabel("Reason for review").fill("Attempt while locked");
    await form.getByRole("button", { name: "Use claimed time as correction" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Attendance edits are locked" })).toBeVisible();
    await expect(claimCard(3)).toContainText("Manager review required");

    const ownerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(ownerContext);
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, `claim-review-owner-${suffix}@example.test`, password);
    await ownerPage.goto(`/attendance?venue=${venueId}`);
    const ownerClaim = ownerPage.locator(`#offline-claim-${claims[0].claim_id}`);
    const reopen = ownerClaim.getByRole("form", { name: "Reopen offline claim" });
    await reopen.getByLabel("Reason for reopening this claim").fill("Review again with the employee");
    await reopen.getByRole("button", { name: "Reopen claim" }).click();
    await expect(ownerClaim).toContainText("Reopened for review");
    await expect(ownerClaim).toContainText("Confirmed start from the claim");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/attendance?venue=${venueId}`);
    const create = claimCard(4).getByRole("form", { name: "Create attendance from offline claims" });
    await create.getByLabel("Matching clock-out claim").selectOption(claims[5].claim_id);
    await create.getByLabel("Reason for creating attendance").fill("Confirmed both times with employee");
    await create.getByLabel("I checked both claimed times. They are unverified reported times, and no breaks were captured.").check();
    await create.getByRole("button", { name: "Create attendance from claims" }).click();
    await expect(page.getByRole("status")).toContainText("Attendance created from unverified reported times");
    await expect(claimCard(4)).toContainText("Attendance created from unverified reported times");
    await expect(claimCard(5)).toContainText("Confirmed both times with employee");
    const createdPair = await ownerApi.from("attendance_offline_claim_sessions").select("session_id")
      .eq("clock_in_claim_id", claims[4].claim_id).single();
    expect(createdPair.error).toBeNull();
    const createdEvents = await ownerApi.from("attendance_events").select("event_type, occurred_at, source")
      .eq("session_id", createdPair.data.session_id).order("event_type");
    expect(createdEvents.error).toBeNull();
    expect(createdEvents.data).toHaveLength(2);
    expect(createdEvents.data.map((event) => event.source)).toEqual(["offline_claim", "offline_claim"]);
    expect(createdEvents.data.find((event) => event.event_type === "clock_in").occurred_at)
      .toContain("2024-01-11T09:00:00.123456");
    expect(createdEvents.data.find((event) => event.event_type === "clock_out").occurred_at)
      .toContain("2024-01-11T17:00:00.654321");
    await ownerPage.goto(`/attendance?venue=${venueId}`);
    const createdClaim = ownerPage.locator(`#offline-claim-${claims[4].claim_id}`);
    const reopenCreated = createdClaim.getByRole("form", { name: "Reopen offline claim" });
    await reopenCreated.getByLabel("Reason for reopening this claim").fill("Recheck this history");
    await reopenCreated.getByRole("button", { name: "Reopen claim" }).click();
    await expect(createdClaim).toContainText("This claim was already linked to attendance");
    await expect(createdClaim.getByRole("form", { name: "Create attendance from offline claims" })).toHaveCount(0);
    await page.goto(`/attendance?venue=${venueId}`);
    const blockedCompletion = claimCard(7).getByRole("form", { name: "Complete attendance with offline clock-out" });
    await expect(blockedCompletion.locator(`option[value="${openSessionId}"]`)).toHaveCount(0);
    await expect(blockedCompletion.locator(`option[value="${colleagueSessionId}"]`)).toContainText("open break");
    await blockedCompletion.getByLabel("Matching open attendance session").selectOption(colleagueSessionId);
    await blockedCompletion.getByLabel("Reason for completing attendance").fill("Attempt with open break");
    await blockedCompletion.getByLabel("I checked the unverified clock-out time and reviewed recorded breaks.").check();
    await blockedCompletion.getByRole("button", { name: "Complete attendance from claim" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Resolve the recorded open break" })).toBeVisible();
    await expect(claimCard(7)).toContainText("Manager review required");
    const resolveBreak = () => claimCard(7).getByRole("form", { name: "Resolve open break and complete attendance" });
    for (const [time, error] of [
      ["2024-04-07T02:30", "That local time occurred twice"],
      ["2024-10-06T02:30", "That local time did not exist"],
      ["2024-01-13T23:00", "The reported break end must follow the start"],
    ]) {
      await resolveBreak().getByLabel("Reported break end (Australia/Sydney)", { exact: true }).fill(time);
      await resolveBreak().getByLabel("Reason for resolving the break").fill("Confirmed with colleague");
      await resolveBreak().getByLabel("I confirmed the reported break end and unverified clock-out with the employee.").check();
      await resolveBreak().getByRole("button", { name: "Record break end and complete attendance" }).click();
      await expect(page.getByRole("alert").filter({ hasText: error })).toBeVisible();
      await expect(claimCard(7)).toContainText("Manager review required");
    }
    await resolveBreak().getByLabel("Reported break end (Australia/Sydney)", { exact: true })
      .fill("2024-01-13T23:30:00.123");
    await resolveBreak().getByLabel("Additional microseconds").fill("456");
    await resolveBreak().getByLabel("Reason for resolving the break").fill("Confirmed with colleague");
    await resolveBreak().getByLabel("I confirmed the reported break end and unverified clock-out with the employee.").check();
    await resolveBreak().getByRole("button", { name: "Record break end and complete attendance" }).click();
    await expect(page.getByRole("status")).toContainText("Manager-reported break end and unverified reported clock-out");
    await expect(claimCard(7)).toContainText("Manager-reported paid break end");
    await expect(claimCard(7)).toContainText("Confirmed with colleague");
    await expect(claimCard(7)).toContainText("2024-01-13T12:30:00.123456");
    await expect(claimCard(7)).toContainText(users[1]);
    const resolvedEvents = await ownerApi.from("attendance_events").select("event_type, occurred_at, source")
      .eq("session_id", colleagueSessionId).in("event_type", ["break_end", "clock_out"]).order("event_type");
    expect(resolvedEvents.error).toBeNull();
    expect(resolvedEvents.data).toHaveLength(2);
    expect(resolvedEvents.data[0].source).toBe("manager_reported");
    expect(resolvedEvents.data[0].occurred_at).toContain("2024-01-13T12:30:00.123456");
    expect(resolvedEvents.data[1].source).toBe("offline_claim");
    const afterBreakResolution = await ownerApi.rpc("list_worked_time", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    expect(afterBreakResolution.error).toBeNull();
    const colleagueWork = afterBreakResolution.data.find((row) => row.session_id === colleagueSessionId);
    expect(colleagueWork.paid_break_seconds).toBe(1800.123456);
    expect(colleagueWork.paid_seconds).toBe(28800);
    expect(colleagueWork.exceptions).toEqual(expect.arrayContaining([
      "offline_claim_unverified", "manager_reported_break",
    ]));
    const completion = claimCard(6).getByRole("form", { name: "Complete attendance with offline clock-out" });
    await completion.getByLabel("Matching open attendance session").selectOption(openSessionId);
    await completion.getByLabel("Reason for completing attendance").fill("Confirmed clock-out and recorded break");
    await completion.getByLabel("I checked the unverified clock-out time and reviewed recorded breaks.").check();
    await completion.getByRole("button", { name: "Complete attendance from claim" }).click();
    await expect(page.getByRole("status")).toContainText("Attendance completed with an unverified reported clock-out");
    await expect(claimCard(6)).toContainText("Confirmed clock-out and recorded break");
    await page.goto(`/work-time?venue=${venueId}`);
    await expect(page.locator(`#attendance-session-${createdPair.data.session_id}`))
      .toContainText("Unverified offline times; review recorded breaks");
    await expect(page.locator(`#attendance-session-${openSessionId}`))
      .toContainText("Unverified offline times; review recorded breaks");
    await expect(page.locator(`#attendance-session-${openSessionId}`)).toContainText("0h 30m 0s");
    await expect(page.locator(`#attendance-session-${colleagueSessionId}`))
      .toContainText("Manager-reported break end; review its history");
    expect(await page.locator("body")
      .evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, `claim-review-worker-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${venueId}`);
    const workerClaims = workerPage.getByRole("region", { name: "Submitted offline attendance claims" });
    await expect(workerClaims).toContainText("Confirmed start from the claim");
    await expect(workerClaims).toContainText("Reopened for review");
    await expect(workerClaims).toContainText("Duplicate device claim");
    await expect(workerClaims).toContainText("Attendance created from unverified reported times");
    await expect(workerClaims).toContainText("Open attendance completed with an unverified reported clock-out");
    await expect(workerPage.getByRole("region", { name: "Attendance correction history" }))
      .toContainText("Confirmed start from the claim");
    expect(await workerPage.locator("body")
      .evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const received = await workerApi.from("attendance_offline_claims").select("id, claimed_at, received_at");
    expect(received.error).toBeNull();
    for (const claim of claims.filter((item) => !item.colleague)) {
      const saved = received.data.find((row) => row.id === claim.claim_id);
      expect(saved.received_at).toBe(claim.received_at);
      expect(Date.parse(saved.claimed_at)).toBe(Date.parse(claim.claimedAt));
    }
    const original = await admin.from("attendance_events").select("occurred_at").eq("id", clockInId).single();
    expect(original.error).toBeNull();
    expect(new Date(original.data.occurred_at).toISOString()).toBe("2024-01-10T09:00:00.000Z");
    await workerPage.getByRole("button", { name: "Sign out" }).click();
    await signIn(workerPage, `claim-review-colleague-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${venueId}`);
    await expect(workerClaims).not.toContainText("Claim Worker");
    await expect(workerClaims).toContainText("Manager-reported paid break end");
    await expect(workerClaims).toContainText("Confirmed with colleague");
    await workerPage.getByRole("button", { name: "Sign out" }).click();
    await signIn(workerPage, `claim-review-boh-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${venueId}`);
    await expect(workerClaims).not.toContainText("Claim Worker");
    await workerPage.getByRole("button", { name: "Sign out" }).click();
    await signIn(workerPage, `claim-review-outside-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${outsideVenue}`);
    await expect(workerClaims).not.toContainText("Claim Worker");
  } finally {
    for (const item of contexts) await item.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("employees request missed clocks and scoped managers decide without overwriting events", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, outsideVenue, fohId, bohId, employeeId, colleagueId,
    sessionId, openSessionId, clockInId, clockOutId, openClockInId] =
    Array.from({ length: 13 }, () => randomUUID());
  const users = [];
  const contexts = [];
  const workerApi = createClient(apiUrl, anonKey, options);
  const managerApi = createClient(apiUrl, anonKey, options);
  try {
    for (const role of ["manager", "boh", "worker", "colleague", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `request-browser-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Request cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside request cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[1], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusiness, user_id: users[4], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[2], name: "Request Worker", role_title: "Server" },
      { id: colleagueId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[3], name: "Request Colleague", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("attendance_sessions").insert([
      { id: sessionId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: employeeId, started_by: users[2] },
      { id: openSessionId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: employeeId, started_by: users[2] },
    ])).error).toBeNull();
    expect((await admin.from("attendance_events").insert([
      { id: clockInId, session_id: sessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[2], request_id: randomUUID(),
        event_type: "clock_in", occurred_at: "2024-01-10T09:00:00Z" },
      { id: clockOutId, session_id: sessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[2], request_id: randomUUID(),
        event_type: "clock_out", occurred_at: "2024-01-10T17:00:00Z" },
      { id: openClockInId, session_id: openSessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[2], request_id: randomUUID(),
        event_type: "clock_in", occurred_at: "2024-01-11T09:00:00Z" },
    ])).error).toBeNull();
    expect((await workerApi.auth.signInWithPassword({
      email: `request-browser-worker-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await managerApi.auth.signInWithPassword({
      email: `request-browser-manager-${suffix}@example.test`, password,
    })).error).toBeNull();

    const workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, `request-browser-worker-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${venueId}`);
    const requestForm = workerPage.getByRole("form", { name: "Submit correction request" });
    const fillRequest = async (type, local, reason, occurrence = "", microseconds = "") => {
      await requestForm.getByLabel("Missed clock").selectOption(type);
      await requestForm.getByLabel("Proposed time", { exact: false }).fill(local);
      await requestForm.getByLabel("Additional microseconds", { exact: false }).fill(microseconds);
      await requestForm.getByLabel("If this time occurred twice").selectOption(occurrence);
      await requestForm.getByLabel("Reason for the request").fill(reason);
      await Promise.all([
        workerPage.waitForResponse((response) =>
          response.request().method() === "POST" && new URL(response.url()).pathname === "/attendance",
        { timeout: 15_000 }),
        requestForm.getByRole("button", { name: "Submit correction request" }).click(),
      ]);
    };
    await fillRequest("clock_in", "2024-04-07T02:30", "Ambiguous time");
    await expect(workerPage.locator('p[role="alert"]')).toContainText("occurred twice");
    await fillRequest("clock_in", "2024-10-06T02:30", "Missing local time");
    await expect(workerPage.locator('p[role="alert"]')).toContainText("did not exist");
    await fillRequest("clock_in", "2099-01-10T19:00", "Future time");
    await expect(workerPage.locator('p[role="alert"]')).toContainText("valid time in the past");

    const submit = async (type, local, reason, occurrence = "", microseconds = "") => {
      await fillRequest(type, local, reason, occurrence, microseconds);
      await expect(workerPage.getByRole("status")).toContainText("submitted for manager review");
      await expect(workerPage.getByRole("region", { name: "Employee correction requests" }))
        .toContainText(`Employee's reason: ${reason}`);
      const result = await workerApi.rpc("list_attendance_offline_claims", {
        p_business_id: businessId, p_venue_id: venueId,
      });
      expect(result.error).toBeNull();
      const row = result.data.find((item) => item.request_reason === reason);
      expect(row?.claim_source).toBe("employee_request");
      return row;
    };
    const first = await submit("clock_in", "2024-01-10T19:45:00.123", "Forgot start", "", "456");
    const rejected = await submit("clock_out", "2024-01-11T04:05", "Duplicate finish");
    const open = await submit("clock_out", "2024-01-12T04:00", "Forgot finish");
    const pairStart = await submit("clock_in", "2024-01-09T19:00", "Missed both: start");
    const pairEnd = await submit("clock_out", "2024-01-10T04:00", "Missed both: finish");
    const repeated = await submit("clock_in", "2024-04-07T02:30", "Second DST occurrence", "later");
    expect(first.claimed_at).toContain("08:45:00.123456");
    expect(new Date(repeated.claimed_at).toISOString()).toBe("2024-04-06T16:30:00.000Z");
    const originalBefore = await workerApi.from("attendance_events").select("id, occurred_at");
    expect(originalBefore.error).toBeNull();
    expect(originalBefore.data).toHaveLength(3);
    const ownRequests = workerPage.getByRole("region", { name: "Employee correction requests" });
    await expect(ownRequests).toContainText("Forgot start");
    await expect(ownRequests).toContainText("Proposed time");
    await expect(ownRequests).not.toContainText("Claimed on device");

    await signIn(page, `request-browser-manager-${suffix}@example.test`, password);
    await page.goto(`/attendance?venue=${venueId}`);
    const card = (request) => page.locator(`#correction-request-${request.id}`);
    let review = card(first).getByRole("form", { name: "Review correction request" });
    await review.getByLabel("Existing finished attendance event").selectOption({ index: 1 });
    await review.getByLabel("Reason for review").fill("Cannot approve a different time");
    await review.getByRole("button", { name: "Approve if time already matches" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("does not match the proposed time");
    review = card(first).getByRole("form", { name: "Review correction request" });
    await review.getByLabel("Existing finished attendance event").selectOption({ index: 1 });
    await review.getByLabel("Reason for review").fill("Confirmed start with worker");
    await review.getByRole("button", { name: "Approve and apply proposed time" }).click();
    await expect(card(first)).toContainText("Approved; the requested time was applied as a correction");
    await expect(card(first)).toContainText("Confirmed start with worker");
    const reject = card(rejected).getByRole("form", { name: "Reject correction request" });
    await reject.getByLabel("Reason for rejecting this request").fill("Already recorded correctly");
    await reject.getByRole("button", { name: "Reject request" }).click();
    await expect(card(rejected)).toContainText("Rejected: Already recorded correctly");
    const complete = card(open).getByRole("form", { name: "Approve requested clock-out" });
    await complete.getByLabel("Matching open attendance session").selectOption(openSessionId);
    await complete.getByLabel("Reason for completing attendance").fill("Confirmed finish and breaks");
    await complete.getByLabel("I checked the unverified clock-out time and reviewed recorded breaks.").check();
    await complete.getByRole("button", { name: "Approve and complete attendance" }).click();
    await expect(card(open)).toContainText("Approved; open attendance completed with the requested clock-out");
    const create = card(pairStart).getByRole("form", { name: "Create attendance from correction requests" });
    await create.getByLabel("Matching clock-out claim").selectOption(pairEnd.id);
    await create.getByLabel("Reason for creating attendance").fill("Confirmed both missed clocks");
    await create.getByLabel("I checked both claimed times. They are unverified reported times, and no breaks were captured.").check();
    await create.getByRole("button", { name: "Approve and create attendance" }).click();
    await expect(card(pairStart)).toContainText("Approved; attendance created from unverified reported times");
    await expect(card(pairEnd)).toContainText("Confirmed both missed clocks");

    const pair = await managerApi.from("attendance_offline_claim_sessions").select("session_id")
      .eq("clock_in_claim_id", pairStart.id).single();
    expect(pair.error).toBeNull();
    const events = await workerApi.from("attendance_events").select("id, session_id, event_type, occurred_at, source");
    expect(events.error).toBeNull();
    expect(events.data.find((row) => row.id === clockInId).occurred_at)
      .toBe(originalBefore.data.find((row) => row.id === clockInId).occurred_at);
    expect(events.data.find((row) => row.id === openClockInId).occurred_at)
      .toBe(originalBefore.data.find((row) => row.id === openClockInId).occurred_at);
    expect(events.data.filter((row) => row.session_id === pair.data.session_id).map((row) => row.source))
      .toEqual(["employee_request", "employee_request"]);
    expect(events.data.find((row) => row.session_id === openSessionId && row.event_type === "clock_out").source)
      .toBe("employee_request");

    await page.goto(`/work-time?venue=${venueId}`);
    await expect(page.locator(`#attendance-session-${pair.data.session_id}`))
      .toContainText("Unverified employee-requested times; review recorded breaks");
    await page.goto(`/timesheets?venue=${venueId}&week=2024-01-08`);
    const timesheet = page.locator(`#timesheet-session-${pair.data.session_id}`);
    await timesheet.getByText("Inspect source events").click();
    await expect(timesheet).toContainText("Unverified employee-requested time");
    await expect(timesheet).not.toContainText("Unverified offline claim");

    await workerPage.reload();
    await expect(ownRequests).toContainText("Confirmed start with worker");
    await expect(ownRequests).toContainText("Already recorded correctly");
    await expect(ownRequests).toContainText("Confirmed both missed clocks");
    expect(await workerPage.locator("body")
      .evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await workerPage.getByRole("button", { name: "Sign out" }).click();
    await signIn(workerPage, `request-browser-colleague-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${venueId}`);
    await expect(ownRequests).not.toContainText("Request Worker");
    await workerPage.getByRole("button", { name: "Sign out" }).click();
    await signIn(workerPage, `request-browser-boh-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${venueId}`);
    await expect(ownRequests).not.toContainText("Request Worker");
    await workerPage.getByRole("button", { name: "Sign out" }).click();
    await signIn(workerPage, `request-browser-outside-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${outsideVenue}`);
    await expect(ownRequests).not.toContainText("Request Worker");
  } finally {
    for (const item of contexts) await item.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("employees view only their paginated attendance history and correction details", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, outsideVenue, departmentId, workerId, colleagueId,
    managerId, workerSession, colleagueSession, managerSession, originalClock] =
    Array.from({ length: 12 }, () => randomUUID());
  const users = [];
  const contexts = [];
  const workerApi = createClient(apiUrl, anonKey, options);
  const managerApi = createClient(apiUrl, anonKey, options);
  try {
    for (const role of ["worker", "colleague", "manager", "outside"]) {
      const created = await admin.auth.admin.createUser({
        email: `personal-history-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users.push(created.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `History cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside history cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
        geofence_latitude: -33.8688, geofence_longitude: 151.2093, geofence_radius_meters: 100,
        clock_geofence_enabled: true },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC",
        clock_geofence_enabled: false },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users[2], role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusiness, user_id: users[3], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[0], name: "History Worker", role_title: "Server" },
      { id: colleagueId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[1], name: "History Colleague", role_title: "Server" },
      { id: managerId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[2], name: "History Manager", role_title: "Supervisor" },
    ])).error).toBeNull();
    expect((await admin.from("attendance_sessions").insert([
      { id: workerSession, business_id: businessId, venue_id: venueId, department_id: departmentId,
        employee_id: workerId, started_by: users[0] },
      { id: colleagueSession, business_id: businessId, venue_id: venueId, department_id: departmentId,
        employee_id: colleagueId, started_by: users[1] },
      { id: managerSession, business_id: businessId, venue_id: venueId, department_id: departmentId,
        employee_id: managerId, started_by: users[2] },
    ])).error).toBeNull();
    const breaks = Array.from({ length: 25 }, () => ({
      id: randomUUID(), session_id: workerSession, business_id: businessId, classification: "unpaid",
    }));
    expect((await admin.from("attendance_breaks").insert(breaks)).error).toBeNull();
    const event = (id, session, employee, actor, eventType, breakId, occurredAt, source = "server_clock") => ({
      id, session_id: session, business_id: businessId, venue_id: venueId, department_id: departmentId,
      employee_id: employee, actor_id: actor, request_id: randomUUID(), event_type: eventType,
      break_id: breakId, occurred_at: occurredAt, source,
    });
    const breakEvents = breaks.flatMap((item, index) => {
      const start = Date.parse("2024-01-01T10:00:00Z") + index * 10 * 60_000;
      return [
        event(randomUUID(), workerSession, workerId, users[0], "break_start", item.id,
          new Date(start).toISOString()),
        event(randomUUID(), workerSession, workerId, users[0], "break_end", item.id,
          new Date(start + 5 * 60_000).toISOString(), "manager_reported"),
      ];
    });
    expect((await admin.from("attendance_events").insert([
      event(originalClock, workerSession, workerId, users[0], "clock_in", null, "2024-01-01T09:05:00Z"),
      ...breakEvents,
      event(randomUUID(), workerSession, workerId, users[0], "clock_out", null, "2024-01-01T17:00:00Z"),
      event(randomUUID(), colleagueSession, colleagueId, users[1], "clock_in", null, "2024-02-01T09:00:00Z"),
      event(randomUUID(), managerSession, managerId, users[2], "clock_in", null, "2024-03-01T09:00:00Z", "offline_claim"),
    ])).error).toBeNull();
    for (const [client, role] of [[workerApi, "worker"], [managerApi, "manager"]]) {
      expect((await client.auth.signInWithPassword({
        email: `personal-history-${role}-${suffix}@example.test`, password,
      })).error).toBeNull();
    }
    expect((await managerApi.rpc("correct_attendance_event", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: workerSession,
      p_event_id: originalClock, p_request_id: randomUUID(), p_expected_at: "2024-01-01T09:05:00Z",
      p_new_at: "2024-01-01T09:00:00Z", p_reason: "Confirmed original clock was late",
    })).error).toBeNull();
    const started = await workerApi.rpc("clock_in_attendance_with_location", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: departmentId,
      p_employee_id: workerId, p_request_id: randomUUID(), p_location_status: "position",
      p_latitude: -33.8688, p_longitude: 151.2093, p_accuracy_meters: 5,
    });
    expect(started.error).toBeNull();
    expect(started.data[0].location_status).toBe("verified");
    const finished = await workerApi.rpc("clock_out_attendance_with_location", {
      p_business_id: businessId, p_session_id: started.data[0].session_id, p_request_id: randomUUID(),
      p_location_status: "permission_denied", p_latitude: null, p_longitude: null, p_accuracy_meters: null,
    });
    expect(finished.error).toBeNull();
    expect(finished.data[0].location_status).toBe("review");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(() => {
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      const originalWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (success, failure, options) => {
        sessionStorage.setItem("history-location-calls",
          String(Number(sessionStorage.getItem("history-location-calls") || 0) + 1));
        return original(success, failure, options);
      };
      navigator.geolocation.watchPosition = (success, failure, options) => {
        sessionStorage.setItem("history-location-watches",
          String(Number(sessionStorage.getItem("history-location-watches") || 0) + 1));
        return originalWatch(success, failure, options);
      };
    });
    await signIn(page, `personal-history-worker-${suffix}@example.test`, password);
    await page.goto(`/attendance?business=${businessId}&venue=${venueId}`);
    await page.getByRole("link", { name: "View your attendance history" }).click();
    await expect(page.getByRole("heading", { name: "Your attendance history" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("54 recorded events. Page 1.");
    const history = page.getByRole("list", { name: "Your recorded clock and break events" });
    await expect(history.getByRole("listitem")).toHaveCount(50);
    await expect(history).toContainText("Location was verified within the venue radius.");
    await expect(history).toContainText("Distance 0.0 m; accuracy ±5.0 m; venue radius 100 m.");
    await expect(history).toContainText("Location review: Location permission denied. Awaiting manager review.");
    await expect(history).toContainText("Unpaid break");
    await expect(history).toContainText("Source: Manager-reported time");
    await expect(history).not.toContainText("2024-02-01T09:00:00");
    await expect(history).not.toContainText("2024-03-01T09:00:00");
    await expect(page.getByRole("region", { name: "Attendance privacy and retention" }))
      .toContainText("Business deletion is disabled by the preservation safeguard");
    await expect(page.getByRole("region", { name: "Attendance privacy and retention" }))
      .toContainText("other privileged database or storage operations could still remove records");
    expect(await page.evaluate(() => Number(sessionStorage.getItem("history-location-calls") || 0))).toBe(0);
    expect(await page.evaluate(() => Number(sessionStorage.getItem("history-location-watches") || 0))).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    findingsMustBeEmpty(await accessibilityFindings(page, "mobile personal attendance history"));

    await page.getByRole("link", { name: "Next history page" }).click();
    await expect(page.getByRole("status")).toHaveText("54 recorded events. Page 2.");
    await expect(history.getByRole("listitem")).toHaveCount(4);
    const corrected = history.getByRole("listitem").filter({ hasText: "Corrected." });
    await expect(corrected).toHaveCount(1);
    await expect(corrected.locator("time").nth(0)).toHaveAttribute("datetime", /^2024-01-01T09:00:00/);
    await expect(corrected.locator("time").nth(1)).toHaveAttribute("datetime", /^2024-01-01T09:05:00/);
    await corrected.getByRole("link", { name: "View correction history" }).click();
    await expect(page.getByRole("region", { name: "Attendance correction history" }))
      .toContainText("Confirmed original clock was late");
    await page.goto(`/attendance/history?business=${businessId}&venue=${venueId}`);
    await page.getByRole("link", { name: "request a correction" }).click();
    await expect(page.getByRole("form", { name: "Submit correction request" })).toBeVisible();
    await page.goto(`/attendance/history?business=${businessId}&venue=${venueId}&page=0`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Invalid page number.");
    await expect(page.getByRole("list", { name: "Your recorded clock and break events" })).toHaveCount(0);
    await page.getByRole("link", { name: "Return to the first page." }).click();
    await expect(page.getByRole("status")).toHaveText("54 recorded events. Page 1.");
    const original = await admin.from("attendance_events").select("occurred_at").eq("id", originalClock).single();
    expect(original.error).toBeNull();
    expect(Date.parse(original.data.occurred_at)).toBe(Date.parse("2024-01-01T09:05:00Z"));

    for (const [role, date] of [["colleague", "2024-02-01T09:00:00"], ["manager", "2024-03-01T09:00:00"]]) {
      const context = await browser.newContext({ baseURL: appUrl });
      contexts.push(context);
      const ownPage = await context.newPage();
      await signIn(ownPage, `personal-history-${role}-${suffix}@example.test`, password);
      await ownPage.goto(`/attendance/history?business=${businessId}&venue=${venueId}`);
      await expect(ownPage.getByRole("status")).toHaveText("1 recorded events. Page 1.");
      const ownHistory = ownPage.getByRole("list", { name: "Your recorded clock and break events" });
      await expect(ownHistory).toContainText(date);
      await expect(ownHistory).not.toContainText("2024-01-01");
      if (role === "manager") {
        await expect(ownHistory).toContainText("Source: Unverified offline claim");
        expect((await admin.from("employees").update({ auth_user_id: null }).eq("id", managerId)).error).toBeNull();
        await ownPage.reload();
        await expect(ownPage.getByRole("status")).toHaveText("0 recorded events. Page 1.");
        await expect(ownHistory).toHaveCount(0);
        const managed = await managerApi.from("attendance_events").select("id").eq("id", originalClock);
        expect(managed.error).toBeNull();
        expect(managed.data).toEqual([{ id: originalClock }]);
      }
    }
    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outsidePage = await outsideContext.newPage();
    await signIn(outsidePage, `personal-history-outside-${suffix}@example.test`, password);
    await outsidePage.goto(`/attendance/history?business=${businessId}&venue=${venueId}`);
    await expect(outsidePage.getByRole("heading", { name: "Attendance history unavailable" })).toBeVisible();
    await expect(outsidePage.getByText("Confirmed original clock was late")).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("employees clock in and out with scoped immutable cross-venue events", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, firstVenue, secondVenue, outsideVenue, firstDepartment,
    otherDepartment, secondDepartment, outsideDepartment, firstEmployee, secondEmployee] =
    Array.from({ length: 11 }, () => randomUUID());
  const users = [];
  let workerContext;
  const workerApi = createClient(apiUrl, anonKey, options);
  const secondApi = createClient(apiUrl, anonKey, options);
  const managerApi = createClient(apiUrl, anonKey, options);
  const otherManagerApi = createClient(apiUrl, anonKey, options);
  const outsideApi = createClient(apiUrl, anonKey, options);
  try {
    for (const role of ["owner", "worker", "second", "foh", "boh", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `clock-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Clock cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside clock cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: firstVenue, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
        geofence_latitude: -33.8688, geofence_longitude: 151.2093, geofence_radius_meters: 100 },
      { id: secondVenue, business_id: businessId, name: "Riverside", timezone: "Australia/Perth" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: firstDepartment, business_id: businessId, venue_id: firstVenue, name: "FOH" },
      { id: otherDepartment, business_id: businessId, venue_id: firstVenue, name: "BOH" },
      { id: secondDepartment, business_id: businessId, venue_id: secondVenue, name: "Kitchen" },
      { id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: firstVenue, department_id: firstDepartment },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: secondVenue, department_id: secondDepartment },
      { business_id: businessId, user_id: users[3], role: "foh_manager", venue_id: firstVenue, department_id: firstDepartment },
      { business_id: businessId, user_id: users[4], role: "boh_manager", venue_id: firstVenue, department_id: otherDepartment },
      { business_id: outsideBusiness, user_id: users[5], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: firstEmployee, business_id: businessId, venue_id: firstVenue, department_id: firstDepartment,
        auth_user_id: users[1], name: "Alex Clock", role_title: "Server" },
      { id: secondEmployee, business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        auth_user_id: users[2], name: "Alex Clock", role_title: "Cook" },
    ])).error).toBeNull();
    for (const [client, role] of [[workerApi, "worker"], [secondApi, "second"],
      [managerApi, "foh"], [otherManagerApi, "boh"], [outsideApi, "outside"]]) {
      expect((await client.auth.signInWithPassword({
        email: `clock-${role}-${suffix}@example.test`, password,
      })).error).toBeNull();
    }

    await signIn(page, `clock-owner-${suffix}@example.test`, password);
    await page.goto(`/attendance?venue=${firstVenue}`);
    for (const region of ["Current attendance", "Request an attendance correction"]) {
      await expect(page.getByRole("region", { name: region })
        .getByText("No active employee profile is linked to your account", { exact: false })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Clock in", exact: true })).toHaveCount(0);

    workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    let workerPage = await workerContext.newPage();
    await signIn(workerPage, `clock-worker-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${firstVenue}`);
    const region = workerPage.getByRole("region", { name: "Current attendance" });
    await expect(region.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    await expect(workerPage.getByText("location is requested only when clocking in or out", { exact: false })).toBeVisible();
    const requestId = await region.locator('input[name="request_id"]').inputValue();
    const before = Date.now();
    await region.getByRole("button", { name: "Clock in", exact: true }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Clock request recorded. Your current state is shown below.");
    await expect(region.getByRole("heading", { name: "Clocked in" })).toBeVisible();
    await expect(region).toContainText("Harbour · FOH");
    await expect(region).toContainText("Australia/Sydney");
    expect(await workerPage.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const firstEvents = await admin.from("attendance_events")
      .select("id, session_id, actor_id, venue_id, department_id, event_type, occurred_at, verification_status")
      .eq("request_id", requestId).single();
    expect(firstEvents.error).toBeNull();
    expect(firstEvents.data).toMatchObject({
      actor_id: users[1], venue_id: firstVenue, department_id: firstDepartment,
      event_type: "clock_in", verification_status: "unverified",
    });
    expect(Date.parse(firstEvents.data.occurred_at)).toBeGreaterThanOrEqual(before - 5_000);
    expect(Date.parse(firstEvents.data.occurred_at)).toBeLessThanOrEqual(Date.now() + 5_000);
    const replay = await workerApi.rpc("clock_in_attendance", {
      p_business_id: businessId, p_venue_id: firstVenue, p_department_id: firstDepartment,
      p_employee_id: firstEmployee, p_request_id: requestId,
    });
    expect(replay.error).toBeNull();
    expect(replay.data[0].event_id).toBe(firstEvents.data.id);
    expect((await managerApi.from("attendance_events").select("id")).data).toEqual([{ id: firstEvents.data.id }]);
    expect((await otherManagerApi.from("attendance_events").select("id")).data).toEqual([]);
    expect((await outsideApi.from("attendance_events").select("id")).data).toEqual([]);
    expect((await workerApi.from("attendance_events").update({ occurred_at: "2000-01-01" })
      .eq("id", firstEvents.data.id)).error?.code).toBe("42501");
    await workerContext.close();
    workerContext = undefined;

    const secondOpen = await secondApi.rpc("clock_in_attendance", {
      p_business_id: businessId, p_venue_id: secondVenue, p_department_id: secondDepartment,
      p_employee_id: secondEmployee, p_request_id: randomUUID(),
    });
    expect(secondOpen.error).toBeNull();
    await page.goto(`/people?venue=${firstVenue}`);
    await page.getByRole("link", { name: "View profile for Alex Clock" }).click();
    await page.getByRole("button", { name: "Manage shared profiles" }).click();
    let linkForm = page.getByRole("form", { name: "Link shared staff" });
    await expect(linkForm).toContainText("Profile in Harbour: Alex Clock");
    await linkForm.getByLabel("Profile at another venue").selectOption(secondEmployee);
    await linkForm.getByLabel("I have confirmed that these profiles belong to the same person.").check();
    await linkForm.getByRole("button", { name: "Link profiles" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Finish at least one open clock session" })).toBeVisible();
    const secondClose = await secondApi.rpc("clock_out_attendance", {
      p_business_id: businessId, p_session_id: secondOpen.data[0].session_id, p_request_id: randomUUID(),
    });
    expect(secondClose.error).toBeNull();
    await page.getByRole("button", { name: "Manage shared profiles" }).click();
    linkForm = page.getByRole("form", { name: "Link shared staff" });
    await linkForm.getByLabel("Profile at another venue").selectOption(secondEmployee);
    await linkForm.getByLabel("I have confirmed that these profiles belong to the same person.").check();
    await linkForm.getByRole("button", { name: "Link profiles" }).click();
    await expect(page.getByRole("status")).toHaveText("Shared-worker profiles linked.");

    workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    workerPage = await workerContext.newPage();
    await signIn(workerPage, `clock-second-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${secondVenue}`);
    await workerPage.getByRole("button", { name: "Clock in", exact: true }).click();
    await expect(workerPage.getByRole("alert").filter({ hasText: "An attendance session is already open" })).toBeVisible();
    await expect(workerPage.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    await workerContext.close();
    workerContext = undefined;

    workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    workerPage = await workerContext.newPage();
    await signIn(workerPage, `clock-worker-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${firstVenue}`);
    const firstCloseForm = workerPage.locator("form").filter({
      has: workerPage.getByRole("button", { name: "Clock out", exact: true }),
    });
    const firstCloseRequest = await firstCloseForm.locator('input[name="request_id"]').inputValue();
    await workerPage.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(workerPage.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    const repeatedClose = await workerApi.rpc("clock_out_attendance", {
      p_business_id: businessId, p_session_id: firstEvents.data.session_id, p_request_id: firstCloseRequest,
    });
    expect(repeatedClose.error).toBeNull();
    const closedEvents = await admin.from("attendance_events").select("event_type, occurred_at")
      .eq("session_id", firstEvents.data.session_id).order("event_type");
    expect(closedEvents.error).toBeNull();
    expect(closedEvents.data.map((event) => event.event_type)).toEqual(["clock_in", "clock_out"]);
    expect(Date.parse(closedEvents.data[1].occurred_at)).toBeGreaterThanOrEqual(Date.parse(closedEvents.data[0].occurred_at));

    await workerPage.getByRole("button", { name: "Clock in", exact: true }).click();
    await expect(workerPage.getByRole("heading", { name: "Clocked in" })).toBeVisible();
    const laterSession = await workerPage.locator("form").filter({
      has: workerPage.getByRole("button", { name: "Clock out", exact: true }),
    }).locator('input[name="session_id"]').inputValue();
    expect((await admin.from("employees").update({ auth_user_id: null }).eq("id", firstEmployee)).error).toBeNull();
    await workerPage.reload();
    await expect(workerPage.getByRole("heading", { name: "Attendance needs review" })).toBeVisible();
    await expect(workerPage.getByRole("button", { name: "Clock out", exact: true })).toHaveCount(0);
    const denied = await workerApi.rpc("clock_out_attendance", {
      p_business_id: businessId, p_session_id: laterSession, p_request_id: randomUUID(),
    });
    expect(denied.error?.message).toBe("Session not found or permission denied");
    expect((await admin.from("employees").update({ auth_user_id: users[1] }).eq("id", firstEmployee)).error).toBeNull();
    await workerPage.reload();
    await workerPage.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(workerPage.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    await workerContext.close();
    workerContext = undefined;

    workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    workerPage = await workerContext.newPage();
    await signIn(workerPage, `clock-second-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${secondVenue}`);
    await workerPage.getByRole("button", { name: "Clock in", exact: true }).click();
    await expect(workerPage.getByRole("heading", { name: "Clocked in" })).toBeVisible();
    const secondSession = await workerPage.locator("form").filter({
      has: workerPage.getByRole("button", { name: "Clock out", exact: true }),
    }).locator('input[name="session_id"]').inputValue();
    const venueEvents = await admin.from("attendance_events").select("venue_id, department_id, verification_status")
      .eq("session_id", secondSession);
    expect(venueEvents.error).toBeNull();
    expect(venueEvents.data).toEqual([{
      venue_id: secondVenue, department_id: secondDepartment, verification_status: "unverified",
    }]);
    await workerPage.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(workerPage.getByRole("heading", { name: "Clocked out" })).toBeVisible();
  } finally {
    if (workerContext) await workerContext.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("multi-department workers explicitly select their clock-in department", async ({ page }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, fohId, bohId, employeeId] =
    Array.from({ length: 5 }, () => randomUUID());
  let userId;
  try {
    const user = await admin.auth.admin.createUser({
      email: `clock-multidepartment-${suffix}@example.test`, password, email_confirm: true,
    });
    expect(user.error).toBeNull();
    userId = user.data.user.id;
    expect((await admin.from("businesses").insert({
      id: businessId, name: `Multi-department cafe ${suffix}`,
    })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: userId, role: "general_manager", venue_id: venueId,
    })).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: userId, name: "Morgan Clock", role_title: "Manager",
    })).error).toBeNull();
    expect((await admin.from("employee_departments").insert({
      business_id: businessId, employee_id: employeeId, department_id: bohId,
    })).error).toBeNull();

    await signIn(page, `clock-multidepartment-${suffix}@example.test`, password);
    await page.goto(`/attendance?venue=${venueId}`);
    const region = page.getByRole("region", { name: "Current attendance" });
    const department = region.getByLabel("Employee and department");
    await expect(department).toHaveValue("");
    await region.getByRole("button", { name: "Clock in", exact: true }).click();
    expect(await department.evaluate((select) => select.validity.valueMissing)).toBe(true);
    const before = await admin.from("attendance_events").select("id", { count: "exact", head: true })
      .eq("business_id", businessId);
    expect(before.error).toBeNull();
    expect(before.count).toBe(0);

    await department.selectOption(`${employeeId}:${bohId}`);
    await region.getByRole("button", { name: "Clock in", exact: true }).click();
    await expect(region.getByRole("heading", { name: "Clocked in" })).toBeVisible();
    await expect(region).toContainText("Harbour · BOH");
    const event = await admin.from("attendance_events").select("employee_id, venue_id, department_id")
      .eq("business_id", businessId).eq("event_type", "clock_in").single();
    expect(event.error).toBeNull();
    expect(event.data).toEqual({ employee_id: employeeId, venue_id: venueId, department_id: bohId });
    await region.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(region.getByRole("heading", { name: "Clocked out" })).toBeVisible();
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});

test("employees record multiple explicitly classified breaks without assumed deductions", async ({ page }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, departmentId, employeeId] =
    Array.from({ length: 4 }, () => randomUUID());
  const users = [];
  const workerApi = createClient(apiUrl, anonKey, options);
  try {
    for (const role of ["owner", "worker"]) {
      const result = await admin.auth.admin.createUser({
        email: `break-browser-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert({
      id: businessId, name: `Break cafe ${suffix}`,
    })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: departmentId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
      auth_user_id: users[1], name: "Break worker", role_title: "Server",
    })).error).toBeNull();
    expect((await workerApi.auth.signInWithPassword({
      email: `break-browser-worker-${suffix}@example.test`, password,
    })).error).toBeNull();
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, `break-browser-worker-${suffix}@example.test`, password);
    await page.goto(`/attendance?venue=${venueId}`);
    const region = page.getByRole("region", { name: "Current attendance" });
    await expect(region.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    await expect(page.getByText("no break is automatically deducted", { exact: false })).toBeVisible();
    await region.getByRole("button", { name: "Clock in", exact: true }).click();
    await expect(region.getByRole("heading", { name: "Clocked in" })).toBeVisible();
    const startForm = region.locator("form").filter({
      has: page.getByRole("button", { name: "Start unpaid break", exact: true }),
    });
    const sessionId = await startForm.locator('input[name="session_id"]').inputValue();
    const startKey = await startForm.locator('input[name="request_id"]').inputValue();
    const stalePage = await page.context().newPage();
    await stalePage.goto(`/attendance?venue=${venueId}`);
    await expect(stalePage.getByRole("button", { name: "Clock out", exact: true })).toBeVisible();
    const before = Date.now();
    await startForm.getByRole("button", { name: "Start unpaid break", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Break request recorded. Your current state is shown below.");
    await expect(region.getByText("On an unpaid break since", { exact: false })).toBeVisible();
    await expect(region.getByRole("button", { name: "Clock out", exact: true })).toHaveCount(0);
    await expect(region.getByRole("button", { name: "Start paid break", exact: true })).toHaveCount(0);
    await expect(region.getByText("End this break before clocking out.")).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const unpaidBreak = await admin.from("attendance_breaks").select("id, classification, session_id")
      .eq("session_id", sessionId).single();
    expect(unpaidBreak.error).toBeNull();
    expect(unpaidBreak.data).toMatchObject({ classification: "unpaid", session_id: sessionId });
    const started = await admin.from("attendance_events").select("id, break_id, occurred_at")
      .eq("request_id", startKey).single();
    expect(started.error).toBeNull();
    expect(started.data.break_id).toBe(unpaidBreak.data.id);
    expect(Date.parse(started.data.occurred_at)).toBeGreaterThanOrEqual(before - 5_000);
    expect(Date.parse(started.data.occurred_at)).toBeLessThanOrEqual(Date.now() + 5_000);
    const replayStart = await workerApi.rpc("start_attendance_break", {
      p_business_id: businessId, p_session_id: sessionId,
      p_classification: "unpaid", p_request_id: startKey,
    });
    expect(replayStart.error).toBeNull();
    expect(replayStart.data[0].event_id).toBe(started.data.id);
    const blockedOut = await workerApi.rpc("clock_out_attendance", {
      p_business_id: businessId, p_session_id: sessionId, p_request_id: randomUUID(),
    });
    expect(blockedOut.error?.message).toBe("End the open break before clocking out");
    await stalePage.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(stalePage.getByRole("alert").filter({ hasText: "End your current break before clocking out." }))
      .toBeVisible();
    await expect(stalePage.getByText("On an unpaid break since", { exact: false })).toBeVisible();
    await stalePage.close();
    await page.reload();
    await expect(region.getByText("On an unpaid break since", { exact: false })).toBeVisible();
    const endForm = region.locator("form").filter({
      has: page.getByRole("button", { name: "End break", exact: true }),
    });
    const endKey = await endForm.locator('input[name="request_id"]').inputValue();
    await endForm.getByRole("button", { name: "End break", exact: true }).click();
    await expect(region.getByRole("button", { name: "Start paid break", exact: true })).toBeVisible();
    const replayEnd = await workerApi.rpc("end_attendance_break", {
      p_business_id: businessId, p_session_id: sessionId,
      p_break_id: unpaidBreak.data.id, p_request_id: endKey,
    });
    expect(replayEnd.error).toBeNull();
    const endEvent = await admin.from("attendance_events").select("id")
      .eq("request_id", endKey).single();
    expect(endEvent.error).toBeNull();
    expect(replayEnd.data[0].event_id).toBe(endEvent.data.id);

    await region.getByRole("button", { name: "Start paid break", exact: true }).click();
    await expect(region.getByText("On a paid break since", { exact: false })).toBeVisible();
    await region.getByRole("button", { name: "End break", exact: true }).click();
    await expect(region.getByRole("button", { name: "Clock out", exact: true })).toBeVisible();
    await region.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(region.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    const breaks = await admin.from("attendance_breaks").select("classification")
      .eq("session_id", sessionId).order("classification");
    expect(breaks.error).toBeNull();
    expect(breaks.data.map((item) => item.classification)).toEqual(["paid", "unpaid"]);
    const events = await admin.from("attendance_events").select("event_type, occurred_at")
      .eq("session_id", sessionId).order("occurred_at");
    expect(events.error).toBeNull();
    expect(events.data.map((event) => event.event_type)).toEqual([
      "clock_in", "break_start", "break_end", "break_start", "break_end", "clock_out",
    ]);

    await region.getByRole("button", { name: "Clock in", exact: true }).click();
    const noBreakForm = region.locator("form").filter({
      has: page.getByRole("button", { name: "Clock out", exact: true }),
    });
    const noBreakSession = await noBreakForm.locator('input[name="session_id"]').inputValue();
    await noBreakForm.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(region.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    const noBreaks = await admin.from("attendance_breaks").select("id", { count: "exact", head: true })
      .eq("session_id", noBreakSession);
    expect(noBreaks.error).toBeNull();
    expect(noBreaks.count).toBe(0);
    const noBreakEvents = await admin.from("attendance_events").select("event_type")
      .eq("session_id", noBreakSession).order("event_type");
    expect(noBreakEvents.error).toBeNull();
    expect(noBreakEvents.data.map((event) => event.event_type)).toEqual(["clock_in", "clock_out"]);
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("optional clock location is requested only at clock events and exceptions are scoped and reviewable", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, firstVenue, secondVenue, outsideVenue, fohId, bohId, employeeId] =
    Array.from({ length: 8 }, () => randomUUID());
  const users = [];
  const contexts = [];
  try {
    for (const role of ["owner", "worker", "foh", "boh", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `clock-location-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Location cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside location cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: firstVenue, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
        geofence_latitude: -33.8688, geofence_longitude: 151.2093, geofence_radius_meters: 100 },
      { id: secondVenue, business_id: businessId, name: "Riverside", timezone: "Australia/Perth" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: firstVenue, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: firstVenue, name: "BOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee" },
      { business_id: businessId, user_id: users[2], role: "foh_manager", venue_id: firstVenue, department_id: fohId },
      { business_id: businessId, user_id: users[3], role: "boh_manager", venue_id: firstVenue, department_id: bohId },
      { business_id: outsideBusiness, user_id: users[4], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: firstVenue, department_id: fohId,
      auth_user_id: users[1], name: "Location Worker", role_title: "Server",
    })).error).toBeNull();

    await signIn(page, `clock-location-owner-${suffix}@example.test`, password);
    await page.goto(`/settings/organisation?venue=${secondVenue}`);
    const policy = page.getByRole("form", { name: "Configure clock location verification" });
    await expect(policy.getByLabel("Clock location verification")).toHaveValue("false");
    await policy.getByLabel("Clock location verification").selectOption("true");
    await policy.getByRole("button", { name: "Save clock location setting" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Configure a venue location before enabling verification");
    await page.goto(`/settings/organisation?venue=${firstVenue}`);
    await expect(policy.getByLabel("Clock location verification")).toHaveValue("false");

    const workerContext = await browser.newContext({
      baseURL: appUrl, viewport: { width: 375, height: 812 },
      geolocation: { latitude: -33.8688, longitude: 151.2093, accuracy: 10 },
      permissions: ["geolocation"],
    });
    contexts.push(workerContext);
    await workerContext.addInitScript(() => {
      if (location.protocol !== "http:") return;
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      const originalWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (success, failure, options) => {
        sessionStorage.setItem("geolocation-calls", String(Number(sessionStorage.getItem("geolocation-calls") || 0) + 1));
        sessionStorage.setItem("geolocation-options", JSON.stringify(options));
        return original(success, failure, options);
      };
      navigator.geolocation.watchPosition = (success, failure, options) => {
        sessionStorage.setItem("geolocation-watches",
          String(Number(sessionStorage.getItem("geolocation-watches") || 0) + 1));
        return originalWatch(success, failure, options);
      };
    });
    const workerPage = await workerContext.newPage();
    const calls = () => workerPage.evaluate(() => Number(sessionStorage.getItem("geolocation-calls") || 0));
    await signIn(workerPage, `clock-location-worker-${suffix}@example.test`, password);
    await workerPage.goto(`/attendance?venue=${firstVenue}`);
    await expect(workerPage.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    expect(await calls()).toBe(0);
    await workerPage.getByRole("button", { name: "Clock in", exact: true }).click();
    await expect(workerPage.getByRole("heading", { name: "Clocked in" })).toBeVisible();
    await workerPage.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(workerPage.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    expect(await calls()).toBe(0);
    expect(await workerPage.evaluate(() => Number(sessionStorage.getItem("geolocation-watches") || 0))).toBe(0);
    const disabledChecks = await admin.from("attendance_location_checks")
      .select("verification_status, reason, distance_meters").eq("business_id", businessId);
    expect(disabledChecks.error).toBeNull();
    expect(disabledChecks.data).toHaveLength(2);
    expect(disabledChecks.data.every((row) =>
      row.verification_status === "not_required" && row.reason === "disabled" && row.distance_meters === null)).toBe(true);

    await policy.getByLabel("Clock location verification").selectOption("true");
    await policy.getByRole("button", { name: "Save clock location setting" }).click();
    await expect(page.getByRole("status")).toHaveText("Clock location setting saved.");
    await expect(page.getByRole("region", { name: "Venue location and geofence" }))
      .toContainText(`User ${users[0]}`);
    const audit = await admin.from("venue_clock_location_events").select("actor_id, old_enabled, new_enabled")
      .eq("venue_id", firstVenue);
    expect(audit.error).toBeNull();
    expect(audit.data).toEqual([{ actor_id: users[0], old_enabled: false, new_enabled: true }]);
    const geofence = page.getByRole("form", { name: "Configure venue geofence" });
    await geofence.getByLabel("Latitude").fill("");
    await geofence.getByLabel("Longitude").fill("");
    await geofence.getByLabel("Radius in metres").fill("");
    await geofence.getByRole("button", { name: "Save venue location" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("disable verification before removing it");

    await workerPage.reload();
    expect(await calls()).toBe(0);
    await workerPage.getByRole("button", { name: "Clock in", exact: true }).click();
    await expect(workerPage.getByRole("heading", { name: "Clocked in" })).toBeVisible();
    expect(await calls()).toBe(1);
    expect(await workerPage.evaluate(() => JSON.parse(sessionStorage.getItem("geolocation-options"))))
      .toMatchObject({ enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
    const activeSession = await workerPage.locator('input[name="session_id"]').first().inputValue();
    const verified = await admin.from("attendance_location_checks")
      .select("*").eq("session_id", activeSession).single();
    expect(verified.error).toBeNull();
    expect(verified.data).toMatchObject({
      verification_status: "verified", reason: "inside", distance_meters: 0,
      accuracy_meters: 10, radius_meters: 100,
    });
    expect(Object.hasOwn(verified.data, "latitude")).toBe(false);
    expect(Object.hasOwn(verified.data, "longitude")).toBe(false);

    await workerPage.getByLabel("Venue", { exact: true }).selectOption(secondVenue);
    await workerPage.getByRole("button", { name: "Switch venue" }).click();
    await expect(workerPage.getByRole("region", { name: "Current attendance" })).toContainText("Harbour · FOH");
    expect(await calls()).toBe(1);
    await workerContext.grantPermissions([], { origin: appUrl });
    await workerPage.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(workerPage.getByRole("status").filter({ hasText: "queued for manager review" })).toBeVisible();
    await expect(workerPage.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    expect(await calls()).toBe(2);
    const denied = await admin.from("attendance_location_checks")
      .select("id, verification_status, reason, event_id").eq("session_id", activeSession).eq("reason", "permission_denied").single();
    expect(denied.error).toBeNull();
    expect(denied.data.verification_status).toBe("review");
    const deniedEvent = await admin.from("attendance_events")
      .select("venue_id, event_type, verification_status").eq("id", denied.data.event_id).single();
    expect(deniedEvent.error).toBeNull();
    expect(deniedEvent.data).toEqual({ venue_id: firstVenue, event_type: "clock_out", verification_status: "unverified" });

    await workerContext.grantPermissions(["geolocation"], { origin: appUrl });
    await workerContext.setGeolocation({ latitude: -33.8700, longitude: 151.2093, accuracy: 10 });
    await workerPage.goto(`/attendance?venue=${firstVenue}`);
    expect(await calls()).toBe(2);
    await workerPage.getByRole("button", { name: "Clock in", exact: true }).click();
    await expect(workerPage.getByRole("status").filter({ hasText: "queued for manager review" })).toBeVisible();
    await expect(workerPage.getByRole("heading", { name: "Clocked in" })).toBeVisible();
    expect(await calls()).toBe(3);
    const secondSession = await workerPage.locator('input[name="session_id"]').first().inputValue();
    await workerPage.getByRole("button", { name: "Start paid break" }).click();
    await expect(workerPage.getByText("On a paid break since", { exact: false })).toBeVisible();
    await workerPage.getByRole("button", { name: "End break" }).click();
    await expect(workerPage.getByRole("button", { name: "Clock out", exact: true })).toBeVisible();
    expect(await calls()).toBe(3);
    await workerContext.setGeolocation({ latitude: -33.8688, longitude: 151.2093, accuracy: 101 });
    await workerPage.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(workerPage.getByRole("status").filter({ hasText: "queued for manager review" })).toBeVisible();
    expect(await calls()).toBe(4);
    expect(await workerPage.evaluate(() => Number(sessionStorage.getItem("geolocation-watches") || 0))).toBe(0);
    const outcomes = await admin.from("attendance_location_checks").select("reason").eq("session_id", secondSession);
    expect(outcomes.error).toBeNull();
    expect(outcomes.data.map((row) => row.reason).sort()).toEqual(["inaccurate", "outside"]);
    expect(await workerPage.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const noJsContext = await browser.newContext({
      baseURL: appUrl, javaScriptEnabled: false, storageState: await workerContext.storageState(),
    });
    contexts.push(noJsContext);
    const noJsPage = await noJsContext.newPage();
    await noJsPage.goto(`/attendance?venue=${firstVenue}`);
    await noJsPage.getByRole("button", { name: "Clock in", exact: true }).click();
    await expect(noJsPage.getByRole("status").filter({ hasText: "queued for manager review" })).toBeVisible();
    await expect(noJsPage.getByRole("heading", { name: "Clocked in" })).toBeVisible();
    const noJsSession = await noJsPage.locator('input[name="session_id"]').first().inputValue();
    await noJsPage.getByRole("button", { name: "Clock out", exact: true }).click();
    await expect(noJsPage.getByRole("status").filter({ hasText: "queued for manager review" })).toBeVisible();
    await expect(noJsPage.getByRole("heading", { name: "Clocked out" })).toBeVisible();
    const noJsChecks = await admin.from("attendance_location_checks").select("reason").eq("session_id", noJsSession);
    expect(noJsChecks.error).toBeNull();
    expect(noJsChecks.data.map((row) => row.reason)).toEqual(["not_provided", "not_provided"]);

    const managerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `clock-location-foh-${suffix}@example.test`, password);
    await managerPage.goto(`/attendance?venue=${firstVenue}`);
    const exceptions = managerPage.getByRole("region", { name: "Location exceptions" });
    const denial = exceptions.locator("li").filter({ hasText: "Location permission denied" });
    await expect(denial).toContainText("Location Worker · FOH");
    await expect(exceptions).toContainText("Outside the venue radius");
    await expect(exceptions).toContainText("Location accuracy is insufficient");
    const outsideForm = exceptions.locator("li").filter({ hasText: "Outside the venue radius" }).locator("form");
    const outsideCheckId = await outsideForm.locator('input[name="check_id"]').inputValue();
    await outsideForm.locator('input[name="check_id"]').evaluate((input, id) => { input.value = id; }, randomUUID());
    await outsideForm.getByRole("button", { name: "Mark as reviewed" }).click();
    await expect(managerPage.locator('p[role="alert"]')).toContainText("could not save the location review");
    const outsideReview = await admin.from("attendance_location_reviews").select("id").eq("check_id", outsideCheckId);
    expect(outsideReview.error).toBeNull();
    expect(outsideReview.data).toEqual([]);
    await denial.getByRole("button", { name: "Mark as reviewed" }).click();
    await expect(managerPage.getByRole("status")).toContainText("original clock event is unchanged");
    await expect(denial).toContainText(`Reviewed by user ${users[2]}`);
    const review = await admin.from("attendance_location_reviews").select("check_id, actor_id").eq("check_id", denied.data.id).single();
    expect(review.error).toBeNull();
    expect(review.data).toEqual({ check_id: denied.data.id, actor_id: users[2] });

    const otherContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(otherContext);
    const otherPage = await otherContext.newPage();
    await signIn(otherPage, `clock-location-boh-${suffix}@example.test`, password);
    await otherPage.goto(`/attendance?venue=${firstVenue}`);
    await expect(otherPage.getByRole("region", { name: "Location exceptions" }))
      .toContainText("No location exceptions for this venue.");
    await expect(otherPage.getByText("Location Worker", { exact: false })).toHaveCount(0);
    const outsideApi = createClient(apiUrl, anonKey, options);
    expect((await outsideApi.auth.signInWithPassword({
      email: `clock-location-outside-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await outsideApi.from("attendance_location_checks").select("id").eq("business_id", businessId)).data).toEqual([]);
    expect((await outsideApi.from("attendance_location_reviews").select("id").eq("business_id", businessId)).data).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("work time uses actual events and breaks with venue, role and exception scope", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, firstVenue, secondVenue, outsideVenue, fohId, bohId, secondDepartment,
    workerId, cookId, secondWorkerId, completeSession, openSession, cookSession, secondSession, paidBreak,
    unpaidBreak, openBreak] = Array.from({ length: 18 }, () => randomUUID());
  const users = [];
  const contexts = [];
  try {
    for (const role of ["owner", "foh", "boh", "worker", "cook", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `worked-time-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Work time cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside work time ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: firstVenue, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
        geofence_latitude: -33.8688, geofence_longitude: 151.2093, geofence_radius_meters: 100 },
      { id: secondVenue, business_id: businessId, name: "Riverside", timezone: "Australia/Perth" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: firstVenue, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: firstVenue, name: "BOH" },
      { id: secondDepartment, business_id: businessId, venue_id: secondVenue, name: "Service" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: firstVenue, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "boh_manager", venue_id: firstVenue, department_id: bohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: firstVenue, department_id: fohId },
      { business_id: businessId, user_id: users[4], role: "employee", venue_id: firstVenue, department_id: bohId },
      { business_id: outsideBusiness, user_id: users[5], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: firstVenue, department_id: fohId,
        auth_user_id: users[3], name: "Time Worker", role_title: "Server" },
      { id: cookId, business_id: businessId, venue_id: firstVenue, department_id: bohId,
        auth_user_id: users[4], name: "Time Cook", role_title: "Cook" },
      { id: secondWorkerId, business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        auth_user_id: users[3], name: "Riverside Worker", role_title: "Server" },
    ])).error).toBeNull();
    const sessions = [
      { id: completeSession, business_id: businessId, venue_id: firstVenue, department_id: fohId,
        employee_id: workerId, started_by: users[3] },
      { id: openSession, business_id: businessId, venue_id: firstVenue, department_id: fohId,
        employee_id: workerId, started_by: users[3] },
      { id: cookSession, business_id: businessId, venue_id: firstVenue, department_id: bohId,
        employee_id: cookId, started_by: users[4] },
      { id: secondSession, business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        employee_id: secondWorkerId, started_by: users[3] },
    ];
    expect((await admin.from("attendance_sessions").insert(sessions)).error).toBeNull();
    expect((await admin.from("attendance_breaks").insert([
      { id: paidBreak, session_id: completeSession, business_id: businessId, classification: "paid" },
      { id: unpaidBreak, session_id: completeSession, business_id: businessId, classification: "unpaid" },
      { id: openBreak, session_id: openSession, business_id: businessId, classification: "paid" },
    ])).error).toBeNull();
    const event = (session, eventType, occurredAt, breakId = null) => ({
      session_id: session.id, business_id: session.business_id, venue_id: session.venue_id,
      department_id: session.department_id, employee_id: session.employee_id, actor_id: session.started_by,
      request_id: randomUUID(), event_type: eventType, occurred_at: occurredAt, break_id: breakId,
    });
    expect((await admin.from("attendance_events").insert([
      event(sessions[0], "clock_in", "2024-10-05T13:30:00Z"),
      event(sessions[0], "break_start", "2024-10-05T14:15:00Z", paidBreak),
      event(sessions[0], "break_end", "2024-10-05T14:30:00Z", paidBreak),
      event(sessions[0], "break_start", "2024-10-05T15:45:00Z", unpaidBreak),
      event(sessions[0], "break_end", "2024-10-05T16:15:00Z", unpaidBreak),
      event(sessions[0], "clock_out", "2024-10-05T17:30:00Z"),
      event(sessions[2], "clock_in", "2024-04-06T15:30:00Z"),
      event(sessions[2], "clock_out", "2024-04-06T16:30:00Z"),
      event(sessions[3], "clock_in", "2024-01-15T08:00:00Z"),
      event(sessions[3], "clock_out", "2024-01-15T10:00:00Z"),
    ])).error).toBeNull();
    expect((await admin.from("venues").update({ clock_geofence_enabled: true }).eq("id", firstVenue)).error).toBeNull();
    expect((await admin.from("attendance_events").insert([
      event(sessions[1], "clock_in", "2024-10-07T08:00:00Z"),
      event(sessions[1], "break_start", "2024-10-07T08:30:00Z", openBreak),
    ])).error).toBeNull();

    await signIn(page, `worked-time-owner-${suffix}@example.test`, password);
    await page.goto(`/work-time?venue=${firstVenue}`);
    await expect(page.getByRole("heading", { name: "Work time", exact: true })).toBeVisible();
    await expect(page.getByText("displayed to the nearest second", { exact: false })).toBeVisible();
    const recorded = page.getByRole("region", { name: "Recorded work time" });
    const complete = recorded.locator("li").filter({ hasText: "Time Worker · FOH" }).filter({ hasText: "5 Oct 2024" });
    await expect(complete).toContainText("6 Oct 2024");
    const measure = (card, label) => card.getByText(label, { exact: true }).locator("..").locator("dd");
    await expect(measure(complete, "Elapsed")).toHaveText("4h 0m 0s");
    await expect(measure(complete, "Worked")).toHaveText("3h 15m 0s");
    await expect(measure(complete, "Paid time")).toHaveText("3h 30m 0s");
    await expect(measure(complete, "Paid break")).toHaveText("0h 15m 0s");
    await expect(measure(complete, "Unpaid break")).toHaveText("0h 30m 0s");
    await expect(complete).toContainText("No exceptions");
    const cook = recorded.locator("li").filter({ hasText: "Time Cook · BOH" });
    await expect(measure(cook, "Elapsed")).toHaveText("1h 0m 0s");
    const open = recorded.locator("li").filter({ hasText: "Time Worker · FOH" }).filter({ hasText: "Clock-out missing" });
    await expect(open).toContainText("Break start or end missing");
    await expect(open).toContainText("Location review required");
    await expect(measure(open, "Worked")).toHaveText("Unavailable");

    await page.getByLabel("Venue", { exact: true }).selectOption(secondVenue);
    await page.getByRole("button", { name: "Switch venue" }).click();
    await expect(recorded).toContainText("Riverside Worker · Service");
    await expect(recorded).not.toContainText("Time Worker · FOH");
    await expect(recorded).toContainText("Australia/Perth");
    await page.goto(`/work-time?venue=${outsideVenue}`);
    await expect(page.locator('p[role="alert"]')).toContainText("couldn't load the selected venue");

    const managerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(managerContext);
    const manager = await managerContext.newPage();
    await signIn(manager, `worked-time-foh-${suffix}@example.test`, password);
    await manager.goto(`/work-time?venue=${firstVenue}`);
    await expect(manager.getByRole("region", { name: "Recorded work time" })).toContainText("Time Worker · FOH");
    await expect(manager.getByText("Time Cook", { exact: false })).toHaveCount(0);
    expect(await manager.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await manager.goto(`/attendance?venue=${firstVenue}`);
    await manager.getByRole("region", { name: "Location exceptions" })
      .getByRole("button", { name: "Mark as reviewed" }).click();
    await expect(manager.getByRole("status")).toContainText("original clock event is unchanged");
    await manager.goto(`/work-time?venue=${firstVenue}`);
    const reviewed = manager.getByRole("region", { name: "Recorded work time" }).locator("li")
      .filter({ hasText: "Clock-out missing" });
    await expect(reviewed).toContainText("Location exception reviewed");
    await expect(reviewed).not.toContainText("Location review required");
    await expect(measure(reviewed, "Worked")).toHaveText("Unavailable");

    const otherContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(otherContext);
    const other = await otherContext.newPage();
    await signIn(other, `worked-time-boh-${suffix}@example.test`, password);
    await other.goto(`/work-time?venue=${firstVenue}`);
    await expect(other.getByRole("region", { name: "Recorded work time" })).toContainText("Time Cook · BOH");
    await expect(other.getByText("Time Worker", { exact: false })).toHaveCount(0);
    const workerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(workerContext);
    const worker = await workerContext.newPage();
    await signIn(worker, `worked-time-worker-${suffix}@example.test`, password);
    await expect(worker.getByRole("link", { name: "Work time" })).toHaveCount(0);
    await worker.goto(`/work-time?venue=${firstVenue}`);
    await expect(worker).toHaveURL(/\/\?error=permission/);
    const outsider = createClient(apiUrl, anonKey, options);
    expect((await outsider.auth.signInWithPassword({
      email: `worked-time-outside-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await outsider.rpc("list_worked_time", { p_business_id: businessId, p_venue_id: firstVenue }))
      .error?.message).toBe("Permission denied");
    const originals = await admin.from("attendance_events").select("event_type, occurred_at")
      .eq("session_id", completeSession).order("occurred_at");
    expect(originals.error).toBeNull();
    expect(originals.data).toHaveLength(6);
    expect(new Date(originals.data[0].occurred_at).toISOString()).toBe("2024-10-05T13:30:00.000Z");
    expect(new Date(originals.data[5].occurred_at).toISOString()).toBe("2024-10-05T17:30:00.000Z");
  } finally {
    for (const context of contexts) await context.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("weekly timesheet review filters, discrepancies, source events and scoped historical workers", async ({ page, browser }) => {
  page.setDefaultTimeout(20_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, secondVenue, outsideVenue, fohId, bohId, secondDepartment,
    outsideDepartment, workerId, cookId, historicId, secondWorkerId, completeSession, openSession, bohSession,
    historicSession, cookSession, secondSession, unpaidBreak, clockInId] = Array.from({ length: 21 }, () => randomUUID());
  const users = [];
  const contexts = [];
  try {
    for (const role of ["owner", "foh", "worker", "cook", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `weekly-review-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Weekly review cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside weekly cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: secondVenue, business_id: businessId, name: "Riverside", timezone: "Australia/Perth" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
      { id: secondDepartment, business_id: businessId, venue_id: secondVenue, name: "Riverside service" },
      { id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "Outside service" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: venueId, department_id: bohId },
      { business_id: outsideBusiness, user_id: users[4], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[2], name: "Weekly Worker", role_title: "Server" },
      { id: cookId, business_id: businessId, venue_id: venueId, department_id: bohId,
        auth_user_id: users[3], name: "Weekly Cook", role_title: "Cook" },
      { id: historicId, business_id: businessId, venue_id: venueId, department_id: bohId,
        name: "Historical Worker", role_title: "Server" },
      { id: secondWorkerId, business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        auth_user_id: users[2], name: "Riverside Worker", role_title: "Server" },
    ])).error).toBeNull();
    expect((await admin.from("employee_departments").insert([
      { business_id: businessId, employee_id: workerId, department_id: bohId },
      { business_id: businessId, employee_id: historicId, department_id: fohId },
    ])).error).toBeNull();
    const shifts = [
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId,
        role_title: "Server", starts_at: "2024-10-05T13:30:00Z", ends_at: "2024-10-05T17:30:00Z",
        break_minutes: 30, is_published: true },
      { business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: workerId,
        role_title: "Cook", starts_at: "2024-10-06T12:00:00Z", ends_at: "2024-10-06T14:00:00Z",
        is_published: true },
      { business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: cookId,
        role_title: "Cook", starts_at: "2024-10-02T00:00:00Z", ends_at: "2024-10-02T02:00:00Z",
        is_published: true },
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: historicId,
        role_title: "Server", starts_at: "2024-10-04T00:00:00Z", ends_at: "2024-10-04T01:00:00Z",
        is_published: true },
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId,
        role_title: "Private draft", starts_at: "2024-10-03T00:00:00Z", ends_at: "2024-10-03T02:00:00Z",
        is_published: false },
      { business_id: businessId, venue_id: secondVenue, department_id: secondDepartment, employee_id: secondWorkerId,
        role_title: "Server", starts_at: "2024-10-02T00:00:00Z", ends_at: "2024-10-02T02:00:00Z",
        is_published: true },
    ];
    expect((await admin.from("shifts").insert(shifts.map((shift) => ({ break_minutes: 0, ...shift })))).error).toBeNull();
    const sessions = [
      { id: completeSession, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, started_by: users[2] },
      { id: openSession, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, started_by: users[2] },
      { id: bohSession, business_id: businessId, venue_id: venueId, department_id: bohId,
        employee_id: workerId, started_by: users[2] },
      { id: historicSession, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: historicId, started_by: users[2] },
      { id: cookSession, business_id: businessId, venue_id: venueId, department_id: bohId,
        employee_id: cookId, started_by: users[3] },
      { id: secondSession, business_id: businessId, venue_id: secondVenue, department_id: secondDepartment,
        employee_id: secondWorkerId, started_by: users[2] },
    ];
    expect((await admin.from("attendance_sessions").insert(sessions)).error).toBeNull();
    expect((await admin.from("attendance_breaks").insert({
      id: unpaidBreak, session_id: completeSession, business_id: businessId, classification: "unpaid",
    })).error).toBeNull();
    const event = (session, eventType, occurredAt, id = randomUUID(), breakId = null, source = "server_clock") => ({
      id, session_id: session.id, business_id: session.business_id, venue_id: session.venue_id,
      department_id: session.department_id, employee_id: session.employee_id, actor_id: session.started_by,
      request_id: randomUUID(), event_type: eventType, occurred_at: occurredAt, break_id: breakId, source,
    });
    expect((await admin.from("attendance_events").insert([
      event(sessions[0], "clock_in", "2024-10-05T13:29:00.123456Z", clockInId),
      event(sessions[0], "break_start", "2024-10-05T15:00:00Z", randomUUID(), unpaidBreak),
      event(sessions[0], "break_end", "2024-10-05T15:30:00Z", randomUUID(), unpaidBreak),
      event(sessions[0], "clock_out", "2024-10-05T17:00:00.123456Z"),
      event(sessions[1], "clock_in", "2024-10-06T10:00:00Z"),
      event(sessions[2], "clock_in", "2024-10-06T12:00:00Z", randomUUID(), null, "offline_claim"),
      event(sessions[2], "clock_out", "2024-10-06T14:00:00Z", randomUUID(), null, "offline_claim"),
      event(sessions[3], "clock_in", "2024-10-04T00:00:00Z"),
      event(sessions[3], "clock_out", "2024-10-04T01:00:00Z"),
      event(sessions[4], "clock_in", "2024-10-02T00:00:00Z"),
      event(sessions[4], "clock_out", "2024-10-02T02:00:00Z"),
      event(sessions[5], "clock_in", "2024-10-02T00:00:00Z"),
      event(sessions[5], "clock_out", "2024-10-02T02:00:00Z"),
    ])).error).toBeNull();
    expect((await admin.from("employee_departments").delete().eq("employee_id", historicId)
      .eq("department_id", fohId)).error).toBeNull();

    const ownerApi = createClient(apiUrl, anonKey, options);
    expect((await ownerApi.auth.signInWithPassword({
      email: `weekly-review-owner-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await ownerApi.rpc("correct_attendance_event", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: completeSession, p_event_id: clockInId,
      p_request_id: randomUUID(), p_expected_at: "2024-10-05T13:29:00.123456Z",
      p_new_at: "2024-10-05T13:30:00.123456Z", p_reason: "Confirmed with worker",
    })).error).toBeNull();

    await signIn(page, `weekly-review-owner-${suffix}@example.test`, password);
    await expect(page.getByRole("link", { name: "Timesheet review" })).toBeVisible();
    await page.goto(`/timesheets?venue=${venueId}&week=2024-10-02`);
    await expect(page.getByRole("heading", { name: "Weekly timesheet review" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /30 Sept.*6 Oct/ })).toBeVisible();
    const fohCard = page.getByRole("heading", { name: "Weekly Worker · FOH" }).locator("..");
    const bohCard = page.getByRole("heading", { name: "Weekly Worker · BOH" }).locator("..");
    await expect(fohCard).toContainText("Incomplete or invalid attendance is excluded from recorded totals.");
    await expect(fohCard).toContainText("Known recorded elapsed differs from scheduled span");
    await expect(fohCard).toContainText("Clock-out missing");
    await expect(bohCard).toContainText("Unverified offline times");
    await expect(page.getByRole("heading", { name: "Weekly Cook · BOH" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historical Worker · FOH" })).toBeVisible();
    await expect(page.getByText("Private draft", { exact: false })).toHaveCount(0);
    const complete = page.locator(`#timesheet-session-${completeSession}`);
    await complete.getByText("Inspect source events").click();
    await expect(complete).toContainText("Original: 2024-10-05T13:29:00.123456");
    await expect(complete).toContainText("Effective: 2024-10-05T13:30:00.123456");
    await expect(complete).toContainText("unpaid break");
    await expect(complete.getByRole("link", { name: "Open correction and edit-lock history" }))
      .toHaveAttribute("href", `/work-time?venue=${venueId}#attendance-session-${completeSession}`);

    const incomplete = page.locator(`#timesheet-session-${openSession}`);
    await expect(incomplete.getByRole("checkbox")).toBeDisabled();
    await expect(incomplete).toContainText("Incomplete or invalid; cannot be locked");
    await page.getByLabel("Reason for edit lock").fill("Reviewed weekly attendance");
    await page.getByRole("button", { name: "Lock selected sessions" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Select between 1 and 100");

    await complete.getByRole("checkbox").check();
    await page.getByLabel("Reason for edit lock").fill("Reviewed weekly attendance");
    expect((await ownerApi.rpc("correct_attendance_event", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: completeSession, p_event_id: clockInId,
      p_request_id: randomUUID(), p_expected_at: "2024-10-05T13:30:00.123456Z",
      p_new_at: "2024-10-05T13:31:00.123456Z", p_reason: "Changed after review",
    })).error).toBeNull();
    await page.getByRole("button", { name: "Lock selected sessions" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Attendance changed");
    await expect(complete.getByRole("checkbox")).toBeEnabled();

    await complete.getByRole("checkbox").check();
    await incomplete.getByRole("checkbox").evaluate((input) => {
      input.disabled = false;
      input.checked = true;
    });
    await page.getByLabel("Reason for edit lock").fill("Reviewed weekly attendance");
    await page.getByRole("button", { name: "Lock selected sessions" }).click();
    await expect(page.locator("main").getByRole("status"))
      .toContainText("1 locked, 1 incomplete or invalid excluded, 0 already locked");
    await expect(page.locator("main").getByRole("status")).toContainText("not payroll approval");
    await expect(complete.getByRole("checkbox")).toBeDisabled();
    await expect(complete).toContainText("Already locked against corrections");
    await expect(incomplete.getByRole("checkbox")).toBeDisabled();
    const receiptUrl = page.url();
    const receiptId = new URL(receiptUrl).searchParams.get("receipt");
    expect(receiptId).toBeTruthy();
    const locks = await ownerApi.rpc("list_attendance_edit_lock_history", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    expect(locks.error).toBeNull();
    expect(locks.data.filter((row) => row.session_id === completeSession).map((row) => ({
      locked: row.locked, reason: row.reason, actor_id: row.actor_id,
    }))).toEqual([{ locked: true, reason: "Reviewed weekly attendance", actor_id: users[0] }]);
    expect(locks.data.filter((row) => row.session_id === openSession)).toHaveLength(0);
    expect((await ownerApi.rpc("correct_attendance_event", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: completeSession, p_event_id: clockInId,
      p_request_id: randomUUID(), p_expected_at: "2024-10-05T13:31:00.123456Z",
      p_new_at: "2024-10-05T13:32:00.123456Z", p_reason: "Attempt after lock",
    })).error?.message).toBe("Attendance edits are locked");
    await page.reload();
    await expect(page.locator("main").getByRole("status")).toContainText("1 locked, 1 incomplete or invalid excluded");
    await page.goto(`/timesheets?venue=${venueId}&week=2024-10-07&receipt=${receiptId}`);
    await expect(page.locator("main").getByRole("alert")).toContainText("couldn't verify the edit-lock result");
    await expect(page.locator("main").getByRole("status")).toHaveCount(0);
    await page.goto(`/timesheets?venue=${venueId}&week=2024-09-30&receipt=${randomUUID()}&locked_count=99`);
    await expect(page.locator("main").getByRole("alert")).toContainText("couldn't verify the edit-lock result");
    await expect(page.locator("main").getByRole("status")).toHaveCount(0);
    await page.goto(receiptUrl);

    await page.getByLabel("Employee", { exact: true }).selectOption(workerId);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("heading", { name: "Weekly Worker · FOH" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Weekly Worker · BOH" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Weekly Cook · BOH" })).toHaveCount(0);
    await page.getByLabel("Week containing date", { exact: true }).fill("2024-10-07");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("heading", { name: /7 Oct.*13 Oct/ })).toBeVisible();
    await expect(page.getByText("No published shifts or attendance sessions", { exact: false })).toBeVisible();
    await page.getByLabel("Week containing date", { exact: true }).fill("2024-09-30");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("heading", { name: "Weekly Worker · FOH" })).toBeVisible();
    await page.getByLabel("Employee", { exact: true }).selectOption("");
    await page.getByLabel("Venue", { exact: true }).selectOption(secondVenue);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("heading", { name: "Riverside Worker · Riverside service" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Weekly Worker · FOH" })).toHaveCount(0);
    expect((await ownerApi.rpc("link_shared_worker_profiles", {
      p_business_id: businessId, p_venue_id: venueId,
      p_employee_id: workerId, p_other_employee_id: secondWorkerId,
    })).error).toBeNull();
    await page.reload();
    const riversideRow = page.locator(`#timesheet-session-${secondSession}`);
    await riversideRow.getByRole("button", { name: "Approve time" }).click();
    await expect(riversideRow).toContainText("Approved by department manager");
    const riversidePeriod = page.getByRole("region", { name: "Payroll period" });
    await riversidePeriod.getByRole("button", { name: "Finalise payroll period" }).click();
    await expect(riversidePeriod).toContainText("Finalised for payroll");
    const riversideExport = riversidePeriod.getByRole("region", { name: "Generic payroll CSV" });
    await riversideExport.getByRole("button", { name: "Prepare payroll CSV" }).click();
    await expect(riversideExport.getByRole("status")).toContainText("Batch");
    const riversideHistory = riversideExport.getByText("Payroll export history (1)");
    if (!(await riversideHistory.evaluate((summary) => summary.parentElement.open))) {
      await riversideHistory.click();
    }
    const riversideDownload = riversideExport.getByRole("link", { name: "Download payroll CSV" });
    const [download] = await Promise.all([page.waitForEvent("download"), riversideDownload.click()]);
    const riversideCsv = await readFile(await download.path(), "utf8");
    expect(riversideCsv).toContain(`"${secondVenue}"`);
    expect(riversideCsv).toContain(`"${secondDepartment}"`);
    expect(riversideCsv).toContain(`"${secondWorkerId}"`);
    expect(riversideCsv).toContain('"Australia/Perth"');
    expect(riversideCsv).toContain(secondSession);
    for (const foreignSession of [completeSession, bohSession, cookSession, historicSession]) {
      expect(riversideCsv).not.toContain(foreignSession);
    }
    expect(riversideCsv).not.toContain(`"${venueId}"`);
    expect(riversideCsv).not.toContain(`"${workerId}"`);
    await page.goto(`/timesheets?venue=${venueId}&week=bad&employee=bad`);
    await expect(page.locator("main").getByRole("alert")).toContainText("Enter a valid date");
    await page.goto(`/timesheets?venue=${venueId}&week=2024-09-30&employee=${randomUUID()}`);
    await expect(page.locator("main").getByRole("alert")).toContainText("selected employee is unavailable");

    const fohContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(fohContext);
    const fohPage = await fohContext.newPage();
    fohPage.setDefaultTimeout(20_000);
    await signIn(fohPage, `weekly-review-foh-${suffix}@example.test`, password);
    await fohPage.goto(`/timesheets?venue=${venueId}&week=2024-09-30&receipt=${receiptId}`);
    await expect(fohPage.locator("main").getByRole("alert")).toContainText("couldn't verify the edit-lock result");
    await expect(fohPage.locator("main").getByRole("status")).toHaveCount(0);
    await fohPage.goto(`/timesheets?venue=${venueId}&week=2024-09-30`);
    await expect(fohPage.getByRole("heading", { name: "Weekly Worker · FOH" })).toBeVisible();
    await expect(fohPage.getByRole("heading", { name: "Weekly Worker · BOH" })).toHaveCount(0);
    await expect(fohPage.getByText("Weekly Cook", { exact: false })).toHaveCount(0);
    await expect(fohPage.getByRole("heading", { name: "Historical Worker · FOH" })).toBeVisible();
    await fohPage.locator(`#timesheet-session-${completeSession}`).getByText("Inspect source events").click();
    await expect(fohPage.locator(`#timesheet-session-${completeSession}`))
      .toContainText("Effective: 2024-10-05T13:31:00.123456");
    expect(await fohPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);
    await expect(fohPage.getByLabel("Employee", { exact: true }).locator(`option[value="${historicId}"]`))
      .toHaveText("Historical Worker");
    await fohPage.getByLabel("Employee", { exact: true }).selectOption(historicId);
    await fohPage.getByRole("button", { name: "Apply filters" }).click();
    await expect(fohPage.getByRole("heading", { name: "Historical Worker · FOH" })).toBeVisible();
    await expect(fohPage.getByRole("heading", { name: "Weekly Worker · FOH" })).toHaveCount(0);
    await fohPage.locator(`#timesheet-session-${historicSession}`).getByRole("checkbox").check();
    await fohPage.getByLabel("Reason for edit lock").fill("Historical attendance reviewed");
    await fohPage.getByRole("button", { name: "Lock selected sessions" }).click();
    await expect(fohPage.locator("main").getByRole("status"))
      .toContainText("1 locked, 0 incomplete or invalid excluded, 0 already locked");
    expect(await fohPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);

    const workerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, `weekly-review-worker-${suffix}@example.test`, password);
    await expect(workerPage.getByRole("link", { name: "Timesheet review" })).toHaveCount(0);
    await workerPage.goto(`/timesheets?venue=${venueId}&week=2024-09-30`);
    await expect(workerPage).toHaveURL(/\/\?error=permission/);

    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outsidePage = await outsideContext.newPage();
    await signIn(outsidePage, `weekly-review-outside-${suffix}@example.test`, password);
    await outsidePage.goto(`/timesheets?venue=${venueId}&week=2024-09-30`);
    await expect(outsidePage.getByRole("heading", { name: "Timesheets unavailable" })).toBeVisible();
    await expect(outsidePage.getByText("Weekly Worker", { exact: false })).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("department managers approve or return scoped timesheet entries for correction", async ({ page, browser }) => {
  page.setDefaultTimeout(20_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, outsideVenue, fohId, bohId, workerId, managerEmployeeId,
    fohSession, bohSession, selfSession, openSession, fohClockIn, bohClockIn] = Array.from({ length: 14 }, () => randomUUID());
  const users = [];
  const contexts = [];
  try {
    for (const role of ["owner", "foh", "boh", "worker", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `approval-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Approval cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside approval cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusiness, user_id: users[4], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[3], name: "Split Worker", role_title: "Server" },
      { id: managerEmployeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[1], name: "Working Manager", role_title: "Supervisor" },
    ])).error).toBeNull();
    expect((await admin.from("employee_departments").insert([
      { business_id: businessId, employee_id: workerId, department_id: bohId },
    ])).error).toBeNull();
    const sessions = [
      { id: fohSession, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, started_by: users[3] },
      { id: bohSession, business_id: businessId, venue_id: venueId, department_id: bohId,
        employee_id: workerId, started_by: users[3] },
      { id: selfSession, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: managerEmployeeId, started_by: users[1] },
      { id: openSession, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, started_by: users[3] },
    ];
    expect((await admin.from("attendance_sessions").insert(sessions)).error).toBeNull();
    const event = (session, eventType, occurredAt, id = randomUUID()) => ({
      id, session_id: session.id, business_id: session.business_id, venue_id: session.venue_id,
      department_id: session.department_id, employee_id: session.employee_id, actor_id: session.started_by,
      request_id: randomUUID(), event_type: eventType, occurred_at: occurredAt, source: "server_clock",
    });
    expect((await admin.from("attendance_events").insert([
      event(sessions[0], "clock_in", "2024-09-30T22:00:00Z", fohClockIn),
      event(sessions[0], "clock_out", "2024-10-01T02:00:00Z"),
      event(sessions[1], "clock_in", "2024-10-01T22:00:00Z", bohClockIn),
      event(sessions[1], "clock_out", "2024-10-02T02:00:00Z"),
      event(sessions[2], "clock_in", "2024-10-02T22:00:00Z"),
      event(sessions[2], "clock_out", "2024-10-03T02:00:00Z"),
      event(sessions[3], "clock_in", "2024-10-05T22:00:00Z"),
    ])).error).toBeNull();
    const signedIn = async (role) => {
      const client = createClient(apiUrl, anonKey, options);
      expect((await client.auth.signInWithPassword({
        email: `approval-${role}-${suffix}@example.test`, password,
      })).error).toBeNull();
      return client;
    };
    const ownerApi = await signedIn("owner");
    const fohApi = await signedIn("foh");
    const outsideApi = await signedIn("outside");

    const ownerApprovals = await ownerApi.rpc("list_weekly_timesheet_approvals", {
      p_business_id: businessId, p_venue_id: venueId, p_week_start: "2024-09-30", p_employee_id: null,
    });
    expect(ownerApprovals.error).toBeNull();
    expect(Object.fromEntries(ownerApprovals.data.map((row) => [row.session_id, row.department_id]))).toEqual({
      [fohSession]: fohId, [bohSession]: bohId, [selfSession]: fohId, [openSession]: fohId,
    });
    const decide = (client, sessionId, revision, decision, reason = null) => client.rpc("decide_attendance_timesheet", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: sessionId, p_request_id: randomUUID(),
      p_expected_revision: revision, p_decision: decision, p_reason: reason,
    });
    const fohWeek = await fohApi.rpc("list_weekly_timesheet_approvals", {
      p_business_id: businessId, p_venue_id: venueId, p_week_start: "2024-09-30", p_employee_id: null,
    });
    expect(fohWeek.error).toBeNull();
    expect(fohWeek.data.map((row) => row.session_id).sort()).toEqual([fohSession, selfSession, openSession].sort());
    expect((await decide(fohApi, bohSession, "0".repeat(64), "approved")).error?.message)
      .toBe("Session not found or permission denied");
    expect((await decide(outsideApi, fohSession, "0".repeat(64), "approved")).error?.message)
      .toBe("Permission denied");

    const fohContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(fohContext);
    const fohPage = await fohContext.newPage();
    fohPage.setDefaultTimeout(20_000);
    await signIn(fohPage, `approval-foh-${suffix}@example.test`, password);
    await fohPage.goto(`/timesheets?venue=${venueId}&week=2024-09-30`);
    await expect(fohPage.getByRole("heading", { name: "Split Worker · FOH" })).toBeVisible();
    await expect(fohPage.getByRole("heading", { name: "Split Worker · BOH" })).toHaveCount(0);
    const fohRow = fohPage.locator(`#timesheet-session-${fohSession}`);
    const selfRow = fohPage.locator(`#timesheet-session-${selfSession}`);
    const openRow = fohPage.locator(`#timesheet-session-${openSession}`);
    await expect(fohRow).toContainText("Awaiting department approval");
    await expect(selfRow).toContainText("Another manager or the owner must decide your own attendance.");
    await expect(selfRow.getByRole("button")).toHaveCount(0);
    await expect(openRow).toContainText("Incomplete or invalid; return it for correction.");
    await expect(openRow.getByRole("button", { name: "Approve time" })).toHaveCount(0);
    await expect(openRow.getByRole("button", { name: "Return for correction" })).toBeVisible();
    expect(await fohPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);

    await fohRow.getByLabel("Reason for returning").evaluate((input) => { input.required = false; });
    await fohRow.getByRole("button", { name: "Return for correction" }).click();
    await expect(fohPage.locator("main").getByRole("alert")).toContainText("Enter a reason of up to 500 characters");
    await fohRow.getByLabel("Reason for returning").fill("Clock-out looks late; confirm your finish time");
    await fohRow.getByRole("button", { name: "Return for correction" }).click();
    await expect(fohPage.locator("main").getByRole("status"))
      .toContainText("Timesheet entry returned to the employee for correction.");
    await expect(fohRow).toContainText("Returned for correction");
    await expect(fohRow).toContainText("Reason returned: Clock-out looks late; confirm your finish time");
    await expect(fohRow.getByRole("button", { name: "Return for correction" })).toHaveCount(0);
    await expect(fohRow.getByRole("button", { name: "Approve time" })).toBeVisible();

    const workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    workerPage.setDefaultTimeout(20_000);
    await signIn(workerPage, `approval-worker-${suffix}@example.test`, password);
    await workerPage.goto("/attendance");
    const decisions = workerPage.getByRole("region", { name: "Timesheet decisions" });
    await expect(decisions).toContainText("Split Worker · FOH");
    await expect(decisions).toContainText("Returned for correction");
    await expect(decisions).toContainText("Reason returned: Clock-out looks late; confirm your finish time");
    expect(await workerPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);

    expect((await ownerApi.rpc("correct_attendance_event", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: fohSession, p_event_id: fohClockIn,
      p_request_id: randomUUID(), p_expected_at: "2024-09-30T22:00:00Z",
      p_new_at: "2024-09-30T22:15:00Z", p_reason: "Worker confirmed later start",
    })).error).toBeNull();
    await workerPage.reload();
    await expect(decisions).toContainText("Corrected after return; review again");

    await fohPage.reload();
    await expect(fohRow).toContainText("Corrected after return; review again");
    await fohRow.getByLabel("Approval note (optional)").fill("Corrected start confirmed");
    await fohRow.getByRole("button", { name: "Approve time" }).click();
    await expect(fohPage.locator("main").getByRole("status"))
      .toContainText("Timesheet entry approved for your department and locked against corrections.");
    await expect(fohRow).toContainText("Approved by department manager");
    await expect(fohRow).toContainText("Approval note: Corrected start confirmed");
    await expect(fohRow).toContainText("Already locked against corrections");
    await expect(fohRow.getByRole("button", { name: "Approve time" })).toHaveCount(0);
    expect((await ownerApi.rpc("correct_attendance_event", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: fohSession, p_event_id: fohClockIn,
      p_request_id: randomUUID(), p_expected_at: "2024-09-30T22:15:00Z",
      p_new_at: "2024-09-30T22:20:00Z", p_reason: "Attempt after approval",
    })).error?.message).toBe("Attendance edits are locked");
    await workerPage.reload();
    await expect(decisions).toContainText("Approved by department manager");

    const bohContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(bohContext);
    const bohPage = await bohContext.newPage();
    bohPage.setDefaultTimeout(20_000);
    await signIn(bohPage, `approval-boh-${suffix}@example.test`, password);
    await bohPage.goto(`/timesheets?venue=${venueId}&week=2024-09-30`);
    await expect(bohPage.getByRole("heading", { name: "Split Worker · BOH" })).toBeVisible();
    await expect(bohPage.getByRole("heading", { name: "Split Worker · FOH" })).toHaveCount(0);
    const bohRow = bohPage.locator(`#timesheet-session-${bohSession}`);
    await expect(bohRow).toContainText("Awaiting department approval");
    expect((await ownerApi.rpc("correct_attendance_event", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: bohSession, p_event_id: bohClockIn,
      p_request_id: randomUUID(), p_expected_at: "2024-10-01T22:00:00Z",
      p_new_at: "2024-10-01T22:05:00Z", p_reason: "Changed while reviewing",
    })).error).toBeNull();
    await bohRow.getByRole("button", { name: "Approve time" }).click();
    await expect(bohPage.locator("main").getByRole("alert")).toContainText("Attendance or its approval changed");
    await bohRow.getByRole("button", { name: "Approve time" }).click();
    await expect(bohPage.locator("main").getByRole("status")).toContainText("Timesheet entry approved");
    await expect(bohRow).toContainText("Approved by department manager");

    const history = await ownerApi.rpc("list_timesheet_decisions", { p_business_id: businessId, p_venue_id: venueId });
    expect(history.error).toBeNull();
    expect(history.data.map((row) => ({
      session: row.session_id, department: row.department_name, decision: row.decision, actor: row.actor_id,
    })).sort((a, b) => a.department.localeCompare(b.department))).toEqual([
      { session: bohSession, department: "BOH", decision: "approved", actor: users[2] },
      { session: fohSession, department: "FOH", decision: "approved", actor: users[1] },
    ]);

    const ownerPage = page;
    await signIn(ownerPage, `approval-owner-${suffix}@example.test`, password);
    await ownerPage.goto(`/timesheets?venue=${venueId}&week=2024-09-30`);
    const ownerSelf = ownerPage.locator(`#timesheet-session-${selfSession}`);
    await expect(ownerSelf).toContainText("Awaiting department approval");
    await ownerSelf.getByRole("button", { name: "Approve time" }).click();
    await expect(ownerPage.locator("main").getByRole("status")).toContainText("Timesheet entry approved");
    await expect(ownerSelf).toContainText("Approved by department manager");

    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outsidePage = await outsideContext.newPage();
    await signIn(outsidePage, `approval-outside-${suffix}@example.test`, password);
    await outsidePage.goto(`/timesheets?venue=${venueId}&week=2024-09-30`);
    await expect(outsidePage.getByRole("heading", { name: "Timesheets unavailable" })).toBeVisible();
    await expect(outsidePage.getByText("Split Worker", { exact: false })).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("authorised managers finalise payroll periods after exceptions and reopen them with a recorded reason", async ({ page, browser }) => {
  page.setDefaultTimeout(20_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, fohId, workerId, completeSession, openSession] =
    Array.from({ length: 7 }, () => randomUUID());
  const users = [];
  const contexts = [];
  try {
    for (const role of ["owner", "gm", "foh", "worker", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `payroll-${role}-${suffix}@example.test`, password, email_confirm: true,
      });

      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Payroll cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside payroll cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: fohId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "general_manager", venue_id: venueId },
      { business_id: businessId, user_id: users[2], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusiness, user_id: users[4], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users[3], name: "Payroll Worker", role_title: "Server",
    })).error).toBeNull();
    const sessions = [completeSession, openSession].map((id) => ({
      id, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId, started_by: users[3],
    }));
    expect((await admin.from("attendance_sessions").insert(sessions)).error).toBeNull();
    const event = (session, eventType, occurredAt) => ({
      session_id: session.id, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: workerId, actor_id: users[3], request_id: randomUUID(), event_type: eventType,
      occurred_at: occurredAt, source: "server_clock",
    });
    expect((await admin.from("attendance_events").insert([
      event(sessions[0], "clock_in", "2024-09-30T22:00:00Z"),
      event(sessions[0], "clock_out", "2024-10-01T02:00:00Z"),
      event(sessions[1], "clock_in", "2024-10-02T22:00:00Z"),
    ])).error).toBeNull();
    const signedIn = async (role) => {
      const client = createClient(apiUrl, anonKey, options);
      expect((await client.auth.signInWithPassword({
        email: `payroll-${role}-${suffix}@example.test`, password,
      })).error).toBeNull();
      return client;
    };
    const fohApi = await signedIn("foh");
    const gmApi = await signedIn("gm");
    const outsideApi = await signedIn("outside");
    const scope = { p_business_id: businessId, p_venue_id: venueId, p_week_start: "2024-09-30" };
    const permissionMessage =
      "Only an owner, admin or general manager with full venue access can finalise or reopen payroll";
    expect((await fohApi.rpc("finalise_payroll_period", { ...scope, p_request_id: randomUUID() })).error?.message)
      .toBe(permissionMessage);
    expect((await outsideApi.rpc("get_payroll_period", scope)).error?.message).toBe("Permission denied");

    const ownerPage = page;
    await signIn(ownerPage, `payroll-owner-${suffix}@example.test`, password);
    const timesheetUrl = `/timesheets?venue=${venueId}&week=2024-09-30`;
    await ownerPage.goto(timesheetUrl);
    const period = ownerPage.getByRole("region", { name: "Payroll period" });
    await expect(period).toContainText("Open — not finalised");
    const exceptions = period.getByRole("list", { name: "Outstanding payroll exceptions" });
    await expect(exceptions.getByRole("listitem")).toHaveCount(3);
    await expect(exceptions).toContainText("Payroll Worker · FOH · Awaiting department approval");
    await expect(exceptions).toContainText("Payroll Worker · FOH · Incomplete or invalid attendance");
    const finaliseButton = period.getByRole("button", { name: "Finalise payroll period" });
    await expect(finaliseButton).toBeDisabled();
    await finaliseButton.evaluate((button) => { button.disabled = false; });
    await finaliseButton.click();
    await expect(ownerPage.locator("main").getByRole("alert"))
      .toContainText("Resolve every outstanding exception before finalising");

    expect((await admin.from("attendance_events").insert(event(sessions[1], "clock_out", "2024-10-03T03:00:00Z")))
      .error).toBeNull();
    const rows = await fohApi.rpc("list_weekly_worked_time_for_edit", scope);
    expect(rows.error).toBeNull();
    for (const row of rows.data) {
      expect((await fohApi.rpc("decide_attendance_timesheet", {
        p_business_id: businessId, p_venue_id: venueId, p_session_id: row.session_id, p_request_id: randomUUID(),
        p_expected_revision: row.edit_revision, p_decision: "approved", p_reason: null,
      })).error).toBeNull();
    }

    const staleContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(staleContext);
    const stalePage = await staleContext.newPage();
    stalePage.setDefaultTimeout(20_000);
    await signIn(stalePage, `payroll-owner-${suffix}@example.test`, password);
    await stalePage.goto(`/work-time?venue=${venueId}`);
    const staleCard = stalePage.locator(`#attendance-session-${completeSession}`);
    await staleCard.locator("summary").click();
    const staleUnlock = staleCard.getByRole("form", { name: "Unlock attendance edits" });
    await staleUnlock.getByLabel("Reason to unlock attendance edits").fill("Change after payroll");

    await ownerPage.goto(timesheetUrl);
    await expect(period.getByText("No outstanding exceptions in your scope.")).toBeVisible();
    await period.getByLabel("Finalisation note (optional)").fill("Week checked against roster");
    await finaliseButton.click();
    await expect(ownerPage.locator("main").getByRole("status"))
      .toContainText("Payroll period finalised. Attendance in this week cannot change until it is reopened.");
    await expect(period).toContainText("Finalised for payroll");
    await expect(period).toContainText("Finalised by you (owner)");
    await expect(period).toContainText("2 sessions, worked 9h");
    await ownerPage.setViewportSize({ width: 375, height: 812 });
    await period.getByText("Finalised payroll records (2)", { exact: true }).click();
    const payrollRecords = period.getByRole("list", { name: "Finalised payroll records" });
    await expect(payrollRecords.getByRole("listitem")).toHaveCount(2);
    await expect(payrollRecords).toContainText("Payroll Worker");
    await expect(payrollRecords).toContainText("Worked 4h 0m 0s · paid 4h 0m 0s");
    await expect(payrollRecords).toContainText("Worked 5h 0m 0s · paid 5h 0m 0s");
    await expect(payrollRecords).toContainText("0 recorded breaks");
    await expect(period).toContainText("Provider employee mappings and pay codes are not assigned yet");
    await expect(period).toContainText("this preview is not an export or an award calculation");
    expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);
    await expect(finaliseButton).toHaveCount(0);
    await expect(ownerPage.getByRole("button", { name: "Lock selected sessions" })).toBeDisabled();
    await expect(ownerPage.locator(`#timesheet-session-${completeSession}`))
      .toContainText("Decisions are unavailable while the payroll period is finalised");

    await staleUnlock.getByRole("button", { name: "Unlock attendance edits" }).click();
    await expect(stalePage.locator("main").getByRole("alert"))
      .toContainText("This week's payroll period is finalised. An owner, admin or general manager must reopen it");
    expect((await gmApi.rpc("finalise_payroll_period", { ...scope, p_request_id: randomUUID() })).error?.message)
      .toBe("Payroll period is already finalised");

    const fohContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(fohContext);
    const fohPage = await fohContext.newPage();
    fohPage.setDefaultTimeout(20_000);
    await signIn(fohPage, `payroll-foh-${suffix}@example.test`, password);
    await fohPage.goto(timesheetUrl);
    const fohPeriod = fohPage.getByRole("region", { name: "Payroll period" });
    await expect(fohPeriod).toContainText("Finalised for payroll");
    await expect(fohPeriod).toContainText("Only an owner, admin or general manager with access to every department");
    await expect(fohPeriod.getByRole("button")).toHaveCount(0);
    await expect(fohPeriod.getByText("Finalised payroll records", { exact: false })).toHaveCount(0);
    expect(await fohPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);
    expect((await fohApi.rpc("reopen_payroll_period", {
      ...scope, p_request_id: randomUUID(), p_reason: "Not allowed",
    })).error?.message).toBe(permissionMessage);

    const reopenReason = period.getByLabel("Reason for reopening");
    await reopenReason.evaluate((input) => { input.required = false; });
    await period.getByRole("button", { name: "Reopen payroll period" }).click();
    await expect(ownerPage.locator("main").getByRole("alert"))
      .toContainText("Enter a reason of up to 500 characters before reopening");
    await expect(period).toContainText("Finalised for payroll");
    await period.getByLabel("Reason for reopening").fill("Late tip adjustment approved by owner");
    await period.getByRole("button", { name: "Reopen payroll period" }).click();
    await expect(ownerPage.locator("main").getByRole("status"))
      .toContainText("Payroll period reopened. The previous finalisation and your reason remain in its history.");
    await expect(period).toContainText("Reopened — not finalised");
    await expect(period.getByText("Finalised payroll records", { exact: false })).toHaveCount(0);
    await expect(finaliseButton).toBeEnabled();
    await period.getByText("Payroll period history (2)").click();
    const history = period.getByRole("list", { name: "Payroll period history" }).getByRole("listitem");
    await expect(history.nth(0)).toContainText("Reopened by you (owner)");
    await expect(history.nth(0)).toContainText("Reason: Late tip adjustment approved by owner");
    await expect(history.nth(1)).toContainText("Finalised by you (owner)");
    await expect(history.nth(1)).toContainText("Note: Week checked against roster");

    await fohPage.reload();
    await expect(fohPeriod).toContainText("Reopened — not finalised");
    await fohPeriod.getByText("Payroll period history (2)").click();
    await expect(fohPeriod.getByRole("list", { name: "Payroll period history" }).getByRole("listitem").nth(0))
      .toContainText("Reopened by an owner");

    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outsidePage = await outsideContext.newPage();
    await signIn(outsidePage, `payroll-outside-${suffix}@example.test`, password);
    await outsidePage.goto(timesheetUrl);
    await expect(outsidePage.getByRole("heading", { name: "Timesheets unavailable" })).toBeVisible();
    await expect(outsidePage.getByText("Payroll Worker", { exact: false })).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("managers copy scoped draft rosters with conflict checks and publication-only notifications", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, outsideVenue, fohId, bohId, outsideDepartment,
    workerId] = Array.from({ length: 8 }, () => randomUUID());
  const users = [];
  const contexts = [];
  const roster = (week) => `/roster?week=${week}&venue=${venueId}&department=${fohId}`;
  const source = "2032-03-29";
  async function shiftsInWeek(week) {
    const start = new Date(`${week}T00:00:00+10:00`);
    const end = new Date(start.valueOf() + 7 * 24 * 60 * 60 * 1000);
    const result = await admin.from("shifts")
      .select("id, role_title, employee_id, starts_at, ends_at, break_minutes, is_published, requires_acknowledgement")
      .eq("business_id", businessId).eq("department_id", fohId)
      .gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at");
    expect(result.error).toBeNull();
    return result.data;
  }
  try {
    for (const role of ["foh", "boh", "worker", "outside"]) {
      const created = await admin.auth.admin.createUser({
        email: `copy-browser-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users.push(created.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Copy cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside copy cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Sydney cafe", timezone: "Australia/Sydney" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
      { id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[1], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusiness, user_id: users[3], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users[2], name: "Copy worker", role_title: "Server",
    })).error).toBeNull();
    expect((await admin.from("shifts").insert([
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId,
        role_title: "Copy server", starts_at: "2032-03-28T22:00:00Z", ends_at: "2032-03-29T00:00:00Z",
        break_minutes: 15, is_published: true, requires_acknowledgement: true },
      { business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: null,
        role_title: "Copy open", starts_at: "2032-03-30T01:00:00Z", ends_at: "2032-03-30T03:00:00Z",
        break_minutes: 0, is_published: false, requires_acknowledgement: false },
      { business_id: businessId, venue_id: venueId, department_id: bohId, employee_id: null,
        role_title: "BOH only", starts_at: "2032-03-28T22:00:00Z", ends_at: "2032-03-29T00:00:00Z",
        break_minutes: 0, is_published: false, requires_acknowledgement: false },
    ])).error).toBeNull();

    await signIn(page, `copy-browser-foh-${suffix}@example.test`, password);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(roster("2032-04-05"));
    await page.getByLabel("Find team member", { exact: true }).fill("no matching team member");
    await page.getByRole("button", { name: "Search roster", exact: true }).click();
    await expect(page.getByText("No team members match this search.", { exact: true })).toBeVisible();
    const form = page.getByRole("form", { name: "Copy a previous roster week" });
    const sourceInput = form.getByLabel("Source week commencing Monday");
    await expect(sourceInput).toHaveValue(source);
    expect((await form.boundingBox()).width).toBeLessThanOrEqual(390);
    const initialRequest = await form.locator('input[name="request_id"]').inputValue();
    await sourceInput.fill("2032-03-30");
    await form.getByRole("button", { name: "Copy into this week" }).click();
    await expect(form.getByRole("alert")).toContainText("valid Monday");
    await expect(sourceInput).toHaveValue("2032-03-30");
    expect(await form.locator('input[name="request_id"]').inputValue()).toBe(initialRequest);
    await sourceInput.fill("2032-04-05");
    await form.getByRole("button", { name: "Copy into this week" }).click();
    await expect(form.getByRole("alert")).toContainText("different source week");
    await sourceInput.fill(source);
    await form.getByRole("button", { name: "Copy into this week" }).click();
    await expect(page.getByRole("status")).toContainText("2 shifts were copied");
    const drafts = await shiftsInWeek("2032-04-05");
    expect(drafts).toHaveLength(2);
    expect(drafts.every((shift) => !shift.is_published)).toBe(true);
    expect(drafts[0]).toMatchObject({
      role_title: "Copy server", employee_id: workerId, break_minutes: 15, requires_acknowledgement: true,
    });
    expect(new Date(drafts[0].starts_at).toISOString()).toBe("2032-04-04T23:00:00.000Z");
    expect(new Date(drafts[0].ends_at).toISOString()).toBe("2032-04-05T01:00:00.000Z");
    expect(drafts[1]).toMatchObject({ role_title: "Copy open", employee_id: null });
    const beforePublication = await admin.from("roster_publications").select("id").eq("business_id", businessId);
    expect(beforePublication.error).toBeNull();
    expect(beforePublication.data).toHaveLength(0);

    const workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const worker = await workerContext.newPage();
    await signIn(worker, `copy-browser-worker-${suffix}@example.test`, password);
    await worker.goto(`/notifications?venue=${venueId}`);
    await expect(worker.getByText("No work updates yet.", { exact: false })).toBeVisible();
    await worker.goto(`/my-schedule?week=2032-04-05&venue=${venueId}`);
    await expect(worker.getByRole("region", { name: "Weekly schedule" })
      .getByText("Copy server", { exact: true })).toHaveCount(0);
    await worker.goto(roster("2032-04-05"));
    await expect(worker.getByRole("form", { name: "Copy a previous roster week" })).toHaveCount(0);

    await page.locator("#open-shifts").getByRole("link", { name: "Edit open shift" }).click();
    const edit = page.getByRole("form", { name: "Edit draft shift" });
    await edit.getByLabel("Role").fill("Edited copied open");
    await edit.getByRole("button", { name: "Update draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft shift updated.");
    expect((await shiftsInWeek("2032-04-05")).find((shift) => shift.employee_id === null).role_title)
      .toBe("Edited copied open");
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("status")).toHaveText("Front of House roster published.");
    const publications = await admin.from("roster_publications").select("id")
      .eq("department_id", fohId).eq("week_start", "2032-04-05");
    expect(publications.error).toBeNull();
    expect(publications.data).toHaveLength(1);
    const recipients = await admin.from("roster_publication_recipients").select("employee_id")
      .eq("publication_id", publications.data[0].id);
    expect(recipients.error).toBeNull();
    expect(recipients.data).toEqual([{ employee_id: workerId }]);
    await worker.goto(`/notifications?venue=${venueId}`);
    await expect(worker.getByRole("article", { name: "Roster update for week starting 2032-04-05" })).toBeVisible();
    await worker.goto(`/my-schedule?week=2032-04-05&venue=${venueId}`);
    await expect(worker.getByRole("region", { name: "Weekly schedule" })
      .getByText("Copy server", { exact: true })).toBeVisible();
    await workerContext.close();

    expect((await admin.from("employee_availability_exceptions").insert({
      business_id: businessId, venue_id: venueId, employee_id: workerId,
      starts_on: "2032-04-12", ends_on: "2032-04-12", exception_type: "leave", status: "approved",
    })).error).toBeNull();
    await page.goto(roster("2032-04-12"));
    await form.getByLabel("Source week commencing Monday").fill(source);
    await form.getByRole("button", { name: "Copy into this week" }).click();
    await expect(form.getByRole("alert")).toContainText("unavailable or has approved leave");
    expect(await shiftsInWeek("2032-04-12")).toHaveLength(0);

    expect((await admin.from("shifts").insert({
      business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId,
      role_title: "Existing target", starts_at: "2032-04-18T23:30:00Z", ends_at: "2032-04-19T01:30:00Z",
    })).error).toBeNull();
    await page.goto(roster("2032-04-19"));
    await form.getByLabel("Source week commencing Monday").fill(source);
    await form.getByRole("button", { name: "Copy into this week" }).click();
    await expect(form.getByRole("alert")).toContainText("overlaps an existing shift");
    expect(await shiftsInWeek("2032-04-19")).toHaveLength(1);

    expect((await admin.from("employee_availability_patterns").insert({
      business_id: businessId, venue_id: venueId, employee_id: workerId,
    })).error).toBeNull();
    await page.goto(roster("2032-04-26"));
    await form.getByLabel("Source week commencing Monday").fill(source);
    await form.getByRole("button", { name: "Copy into this week" }).click();
    await expect(form.getByRole("alert")).toContainText("unavailable or has approved leave");
    expect(await shiftsInWeek("2032-04-26")).toHaveLength(0);
    expect((await admin.from("employee_availability_patterns").delete().eq("employee_id", workerId)).error).toBeNull();

    await page.goto(roster("2032-05-03"));
    await form.getByLabel("Source week commencing Monday").fill("2032-02-02");
    await form.getByRole("button", { name: "Copy into this week" }).click();
    await expect(page.getByRole("status")).toContainText("No shifts were found");
    expect(await shiftsInWeek("2032-05-03")).toHaveLength(0);

    const noJsContext = await browser.newContext({ baseURL: appUrl, javaScriptEnabled: false });
    contexts.push(noJsContext);
    const noJs = await noJsContext.newPage();
    await signIn(noJs, `copy-browser-foh-${suffix}@example.test`, password);
    await noJs.goto(roster("2032-05-10"));
    const noJsForm = noJs.getByRole("form", { name: "Copy a previous roster week" });
    const noJsRequest = await noJsForm.locator('input[name="request_id"]').inputValue();
    await noJsForm.getByLabel("Source week commencing Monday").fill("2032-03-30");
    await noJsForm.getByRole("button", { name: "Copy into this week" }).click();
    await expect(noJsForm.getByRole("alert")).toContainText("valid Monday");
    await expect(noJsForm.getByLabel("Source week commencing Monday")).toHaveValue("2032-03-30");
    expect(await noJsForm.locator('input[name="request_id"]').inputValue()).toBe(noJsRequest);
    await noJsForm.getByLabel("Source week commencing Monday").fill(source);
    await noJsForm.getByRole("button", { name: "Copy into this week" }).click();
    await expect(noJs.getByRole("status")).toContainText("2 shifts were copied");
    expect(await shiftsInWeek("2032-05-10")).toHaveLength(2);
    await noJsContext.close();

    expect((await admin.from("shifts").insert({
      business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: null,
      role_title: "Clock-change source", starts_at: "2032-03-20T14:30:00Z",
      ends_at: "2032-03-20T16:30:00Z",
    })).error).toBeNull();
    await page.goto(roster("2032-03-29"));
    await form.getByLabel("Source week commencing Monday").fill("2032-03-15");
    await form.getByRole("button", { name: "Copy into this week" }).click();
    await expect(form.getByRole("alert")).toContainText("crosses a clock change");
    const unsafeCopies = await admin.from("shifts").select("id")
      .eq("business_id", businessId).eq("role_title", "Clock-change source")
      .gte("starts_at", "2032-03-29T00:00:00Z").lt("starts_at", "2032-04-05T00:00:00Z");
    expect(unsafeCopies.error).toBeNull();
    expect(unsafeCopies.data).toHaveLength(0);

    const bohContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(bohContext);
    const boh = await bohContext.newPage();
    await signIn(boh, `copy-browser-boh-${suffix}@example.test`, password);
    await boh.goto(roster("2032-04-05"));
    await expect(boh.getByRole("form", { name: "Copy a previous roster week" })
      .locator('input[name="department_id"]')).toHaveValue(bohId);
    const bohClient = createClient(apiUrl, anonKey, options);
    expect((await bohClient.auth.signInWithPassword({
      email: `copy-browser-boh-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await bohClient.rpc("copy_roster_week", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
      p_source_week: source, p_target_week: "2032-05-17", p_request_id: randomUUID(),
    })).error?.message).toBe("Permission denied");
    await bohContext.close();

    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outside = await outsideContext.newPage();
    await signIn(outside, `copy-browser-outside-${suffix}@example.test`, password);
    await outside.goto(roster("2032-04-05"));
    await expect(outside.getByRole("heading", { name: "Roster unavailable" })).toBeVisible();
    await outsideContext.close();
  } finally {
    for (const context of contexts) await context.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("owner onboarding follows real staff, draft and publication progress without crossing tenants", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, outsideVenue, departmentId, outsideDepartment,
    outsideEmployee] = Array.from({ length: 7 }, () => randomUUID());
  const users = [];
  const contexts = [];
  try {
    for (const role of ["owner", "employee", "outside"]) {
      const created = await admin.auth.admin.createUser({
        email: `onboarding-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users.push(created.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Onboarding cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "First venue", timezone: "UTC" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusiness, user_id: users[2], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: outsideEmployee, business_id: outsideBusiness, venue_id: outsideVenue,
      department_id: outsideDepartment, name: "Outside worker", role_title: "Server",
    })).error).toBeNull();
    expect((await admin.from("shifts").insert({
      business_id: outsideBusiness, venue_id: outsideVenue, department_id: outsideDepartment,
      employee_id: outsideEmployee, role_title: "Outside shift",
      starts_at: "2032-03-29T09:00:00Z", ends_at: "2032-03-29T10:00:00Z",
    })).error).toBeNull();

    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `onboarding-owner-${suffix}@example.test`, password);
    const checklist = page.getByRole("region", { name: "Get your first roster ready" });
    await expect(checklist).toBeVisible();
    await expect(checklist).toContainText("2 of 5 steps complete");
    await expect(checklist.getByText("Complete", { exact: true })).toHaveCount(2);
    await expect(checklist.getByText("To do", { exact: true })).toHaveCount(3);
    await expect(page.getByText("Outside worker", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await checklist.getByRole("link", { name: "Open departments" }).click();
    await expect(page.getByRole("heading", { name: "Departments and roles" })).toBeVisible();
    await page.goto("/");

    const employeeContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(employeeContext);
    const employeePage = await employeeContext.newPage();
    await signIn(employeePage, `onboarding-employee-${suffix}@example.test`, password);
    await expect(employeePage.getByRole("region", { name: "Get your first roster ready" })).toHaveCount(0);
    await employeeContext.close();

    await checklist.getByRole("link", { name: "Add staff" }).click();
    await expect(page).toHaveURL(/\/people/);
    await page.getByRole("link", { name: "Add person", exact: true }).click();
    const newEmployee = page.getByRole("region", { name: "New employee" });
    await newEmployee.getByRole("textbox", { name: "Name", exact: true }).fill("First team member");
    await newEmployee.getByRole("textbox", { name: "Job role", exact: true }).fill("Server");
    await newEmployee.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentId);
    await newEmployee.getByRole("button", { name: "Add employee" }).click();
    await expect(page.getByRole("heading", { name: "First team member", exact: true })).toBeVisible();
    const employee = await admin.from("employees").select("id")
      .eq("business_id", businessId).eq("name", "First team member").single();
    expect(employee.error).toBeNull();
    await page.goto("/");
    await expect(checklist).toContainText("3 of 5 steps complete");

    await checklist.getByRole("link", { name: "Create a shift" }).click();
    await expect(page).toHaveURL(/\/roster/);
    await page.goto(`/roster?week=2032-03-29&venue=${venueId}&department=${departmentId}`);
    const draft = page.getByRole("form", { name: "Add draft shift" });
    await draft.getByLabel("Role").fill("Server");
    await draft.getByLabel("Team member").selectOption(employee.data.id);
    await draft.getByLabel("Starts").fill("2032-03-29T09:00");
    await draft.getByLabel("Ends").fill("2032-03-29T10:00");
    await draft.getByLabel("Break (mins)").fill("0");
    await draft.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toContainText("Shift saved to the draft roster");
    await page.goto("/");
    await expect(checklist).toContainText("4 of 5 steps complete");

    await checklist.getByRole("link", { name: "Open the roster" }).click();
    await page.goto(`/roster?week=2032-03-29&venue=${venueId}&department=${departmentId}`);
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("status")).toContainText("roster published");
    await page.goto("/");
    await expect(checklist).toContainText("5 of 5 steps complete");
    await expect(checklist.getByText("Complete", { exact: true })).toHaveCount(5);
    const publications = await admin.from("roster_publications").select("id").eq("business_id", businessId);
    expect(publications.error).toBeNull();
    expect(publications.data).toHaveLength(1);
  } finally {
    for (const context of contexts) await context.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("sample teams remain unavailable and saved preferences cannot seed a customer workspace", async ({ page }) => {
  const { sql } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  expect(await sql("select enabled from public.demo_seed_policy where singleton")).toBe("f");
  const suffix = randomUUID();
  const email = `onboarding-sample-${suffix}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  let userId;
  try {
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(user.error).toBeNull();
    userId = user.data.user.id;
    expect((await admin.from("business_setup_drafts").insert({
      user_id: userId, business_name: "Clean customer cafe", venue_name: "Test venue",
      venue_address: "10 Test Street", timezone: "Australia/Sydney", include_sample_data: true,
    })).error).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/setup/);
    const sample = page.getByRole("checkbox", { name: /Add a sample team/ });
    await expect(sample).toBeDisabled();
    await expect(sample).not.toBeChecked();
    await expect(page.getByRole("status")).toContainText("previously saved sample-team selection");
    await expect(page.getByText(/Sample teams are unavailable/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    findingsMustBeEmpty(await accessibilityFindings(page, "mobile clean setup"));

    const tamperWithSampleControl = (value) => page.evaluate((inputValue) => {
      const control = document.querySelector('input[name="sample_data"]');
      if (!(control instanceof HTMLInputElement)) throw new Error("Sample control is missing");
      control.disabled = false;
      control.value = inputValue;
      control.checked = true;
    }, value);
    await tamperWithSampleControl("unexpected");
    await page.getByRole("button", { name: "Save progress" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Sample data is unavailable");
    const retainedDraft = await admin.from("business_setup_drafts")
      .select("include_sample_data").eq("user_id", userId).single();
    expect(retainedDraft.error).toBeNull();
    expect(retainedDraft.data.include_sample_data).toBe(true);
    await expect(sample).toBeDisabled();
    await tamperWithSampleControl("on");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Sample data is unavailable");
    const deniedMemberships = await admin.from("business_memberships").select("id").eq("user_id", userId);
    expect(deniedMemberships.error).toBeNull();
    expect(deniedMemberships.data).toHaveLength(0);

    await expect(sample).toBeDisabled();
    await page.getByRole("button", { name: "Create workspace" }).click();
    const checklist = page.getByRole("region", { name: "Get your first roster ready" });
    await expect(checklist).toContainText("2 of 5 steps complete");
    const membership = await admin.from("business_memberships").select("business_id")
      .eq("user_id", userId).single();
    expect(membership.error).toBeNull();
    const [staff, shifts, roles, publications] = await Promise.all([
      admin.from("employees").select("id").eq("business_id", membership.data.business_id),
      admin.from("shifts").select("is_published").eq("business_id", membership.data.business_id),
      admin.from("job_roles").select("id").eq("business_id", membership.data.business_id),
      admin.from("roster_publications").select("id").eq("business_id", membership.data.business_id),
    ]);
    expect(staff.error).toBeNull();
    expect(shifts.error).toBeNull();
    expect(roles.error).toBeNull();
    expect(publications.error).toBeNull();
    expect(staff.data).toHaveLength(0);
    expect(shifts.data).toHaveLength(0);
    expect(roles.data).toHaveLength(0);
    expect(publications.data).toHaveLength(0);
  } finally {
    if (userId) {
      const memberships = await admin.from("business_memberships").select("business_id").eq("user_id", userId);
      expect(memberships.error).toBeNull();
      for (const membership of memberships.data) {
        await assertBusinessFixturesPreserved(admin, membership.business_id);
      }
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  }
});

async function openInvitationMail(page, email) {
  const link = await waitForMail(email, /confirm|magic|sign-in/i);
  const response = await fetch(link, { redirect: "manual" });
  expect(response.status).toBe(303);
  const target = new URL(response.headers.get("location"));
  expect(target.origin).toBe(new URL(appUrl).origin);
  expect(target.pathname).toMatch(/^\/invitations\/[0-9a-f-]{36}$/i);
  const fragment = new URLSearchParams(target.hash.slice(1));
  expect(fragment.has("access_token")).toBe(true);
  expect(fragment.has("refresh_token")).toBe(true);
  await page.goto("/");
  const navigation = page.waitForURL((url) => url.pathname === target.pathname);
  await page.evaluate(({ path, hash }) => {
    window.location.replace(new URL(`${path}${hash}`, window.location.origin).href);
  }, { path: `${target.pathname}${target.search}`, hash: target.hash });
  await navigation;
  return target.pathname;
}

test("staff invitations deliver separate-browser email and join only the intended scope", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const recipientPassword = `${randomBytes(18).toString("base64url")}bB2!`;
  const ownerEmail = `invite-owner-${suffix}@example.test`;
  const managerEmail = `invite-manager-${suffix}@example.test`;
  const outsideEmail = `invite-outside-${suffix}@example.test`;
  const recipientEmail = `invite-recipient-${suffix}@example.test`;
  const [businessId, outsideBusiness, venueId, outsideVenue, departmentId, outsideDepartment, employeeId] =
    Array.from({ length: 7 }, () => randomUUID());
  const users = [];
  const contexts = [];
  try {
    for (const email of [ownerEmail, managerEmail, outsideEmail]) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(created.error).toBeNull();
      users.push(created.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Invitation cafe" },
      { id: outsideBusiness, name: "Outside invitation cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Main venue", timezone: "UTC" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "Outside" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusiness, user_id: users[2], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
      name: "Taylor Invitee", email: recipientEmail, role_title: "Server",
    })).error).toBeNull();

    await signIn(page, managerEmail, password);
    await page.goto(`/people?venue=${venueId}`);
    await page.getByRole("link", { name: "View profile for Taylor Invitee" }).click();
    await page.getByRole("button", { name: "Manage invitation" }).click();
    const form = page.getByRole("form", { name: "Invite Taylor Invitee" });
    await expect(form.getByLabel("Invitation email")).toHaveValue(recipientEmail);
    await form.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status")).toContainText("Invitation email requested");
    const manager = createClient(apiUrl, anonKey, options);
    expect((await manager.auth.signInWithPassword({ email: managerEmail, password })).error).toBeNull();
    const invitation = await manager.from("staff_invitations").select("id, status, email")
      .eq("employee_id", employeeId).single();
    expect(invitation.error).toBeNull();
    expect(invitation.data).toMatchObject({ status: "pending", email: recipientEmail });

    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outsidePage = await outsideContext.newPage();
    await signIn(outsidePage, outsideEmail, password);
    await outsidePage.goto(`/invitations/${invitation.data.id}`);
    await expect(outsidePage.getByText(/unavailable for the signed-in email/)).toBeVisible();
    await expect(outsidePage.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);

    const recipientContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(recipientContext);
    const recipientPage = await recipientContext.newPage();
    await openInvitationMail(recipientPage, recipientEmail);
    await expect(recipientPage.getByRole("button", { name: "Accept invitation" })).toBeVisible();
    await expect(recipientPage.getByText(/Invitation cafe invited Taylor Invitee to Main venue/)).toBeVisible();
    expect(new URL(recipientPage.url()).hash === "").toBe(true);
    await recipientPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(recipientPage.getByRole("status")).toContainText("invitation has been accepted");
    const recipient = await findUser(recipientEmail);
    expect(recipient).toBeDefined();
    const membership = await admin.from("business_memberships").select("business_id, venue_id, department_id, role")
      .eq("user_id", recipient.id);
    expect(membership.error).toBeNull();
    expect(membership.data).toEqual([{
      business_id: businessId, venue_id: venueId, department_id: departmentId, role: "employee",
    }]);
    const employee = await admin.from("employees").select("auth_user_id").eq("id", employeeId).single();
    expect(employee.error).toBeNull();
    expect(employee.data.auth_user_id).toBe(recipient.id);
    const events = await manager.from("staff_invitation_events").select("event, actor_id")
      .eq("invitation_id", invitation.data.id).order("id");
    expect(events.error).toBeNull();
    expect(events.data).toEqual([
      { event: "created", actor_id: users[1] }, { event: "accepted", actor_id: recipient.id },
    ]);
    await expect(recipientPage.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
    await recipientPage.getByRole("link", { name: "Choose a password" }).click();
    await recipientPage.getByLabel("New password").fill(recipientPassword);
    await recipientPage.getByRole("button", { name: "Update password" }).click();
    await expect(recipientPage).toHaveURL(/\/login\?message=password-updated/);
    await signIn(recipientPage, recipientEmail, recipientPassword);
    await expect(recipientPage.getByText("Invitation cafe", { exact: true })).toBeVisible();
    await expect(recipientPage.getByText("Outside invitation cafe", { exact: true })).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    const recipient = await findUser(recipientEmail);
    if (recipient) users.push(recipient.id);
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function findingsMustBeEmpty(findings) {
  expect(findings, findings.join("\n")).toEqual([]);
}

async function accessibilityFindings(page, label) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  const findings = results.violations.map((violation) =>
    `${label}: ${violation.id} (${violation.impact}) ${violation.nodes.slice(0, 3)
      .map((node) => `${node.target.join(" ")} [${node.failureSummary?.replace(/\s+/g, " ").slice(0, 220)}]`)
      .join(", ")}`);
  expect(await page.locator("html").getAttribute("lang")).toBe("en-AU");
  expect((await page.title()).length).toBeGreaterThan(0);
  const mains = await page.getByRole("main").count();
  const headings = await page.getByRole("heading", { level: 1 }).count();
  if (mains !== 1) findings.push(`${label}: expected one main landmark, found ${mains}`);
  if (headings !== 1) findings.push(`${label}: expected one level-one heading, found ${headings}`);
  return findings;
}

test("core pages pass WCAG checks, keyboard controls and screen-reader smoke tests", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const ownerEmail = `a11y-owner-${suffix}@example.test`;
  const workerEmail = `a11y-worker-${suffix}@example.test`;
  const [businessId, venueId, departmentId, employeeId] = Array.from({ length: 4 }, () => randomUUID());
  const users = [];
  const contexts = [];
  const findings = [];
  try {
    for (const email of [ownerEmail, workerEmail]) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(created.error).toBeNull();
      users.push(created.data.user.id);
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Accessible cafe ${suffix}` })).error)
      .toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Accessible venue", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: departmentId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
      auth_user_id: users[1], name: "Avery Access", email: workerEmail, role_title: "Server",
    })).error).toBeNull();
    expect((await admin.from("shifts").insert({
      business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: employeeId,
      role_title: "Accessible service", starts_at: "2032-03-15T22:00:00Z", ends_at: "2032-03-16T02:00:00Z",
      is_published: false,
    })).error).toBeNull();

    for (const path of ["/login", "/signup", "/forgot-password"]) {
      await page.goto(path);
      findings.push(...await accessibilityFindings(page, path));
    }

    await page.goto("/login");
    await page.keyboard.press("Tab");
    for (let index = 0; index < 8; index += 1) {
      if (await page.getByLabel("Email address").evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(page.getByLabel("Email address")).toBeFocused();
    await page.keyboard.type(ownerEmail);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#password")).toBeFocused();
    await page.keyboard.type(password);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    const roster = `/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`;
    const ownerPages = [
      "/", roster, `/people?venue=${venueId}`, `/timesheets?venue=${venueId}`, `/work-time?venue=${venueId}`,
      `/availability?venue=${venueId}`, `/attendance?venue=${venueId}`, `/notifications?venue=${venueId}`,
      "/settings/organisation", "/settings/departments", "/settings/permissions", "/settings/payroll", "/settings/audit",
    ];
    for (const path of ownerPages) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      findings.push(...await accessibilityFindings(page, `owner ${path}`));
    }

    await page.goto(roster);
    const publish = page.getByRole("button", { name: "Publish this department" });
    await publish.focus();
    await expect(publish).toBeFocused();
    await page.keyboard.press("Enter");
    const published = page.getByRole("main").getByRole("status").filter({ hasText: "roster published" });
    await expect(published).toHaveText("Front of House roster published.");
    findings.push(...await accessibilityFindings(page, "owner roster after publishing"));

    const workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, workerEmail, password);
    await expect(workerPage.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    const workerPages = [
      "/", `/my-schedule?week=2032-03-15&venue=${venueId}`, `/notifications?venue=${venueId}`,
      `/attendance?venue=${venueId}`, `/availability?venue=${venueId}`,
    ];
    for (const path of workerPages) {
      await workerPage.goto(path);
      await expect(workerPage.getByRole("main")).toBeVisible();
      findings.push(...await accessibilityFindings(workerPage, `employee mobile ${path}`));
      expect(await workerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${path} must not scroll horizontally on a phone`).toBe(true);
    }

    await workerPage.goto(`/notifications?venue=${venueId}`);
    const markRead = workerPage.getByRole("button", { name: "Mark as read" });
    await markRead.focus();
    await workerPage.keyboard.press("Enter");
    await expect(workerPage.getByRole("main").getByRole("status")).toHaveText("Notification marked as read.");
    await workerPage.goto(`/my-schedule?week=2032-03-15&venue=${venueId}`);
    await expect(workerPage.getByRole("region", { name: "Weekly schedule" })).toContainText("Accessible service");

    expect(findings, findings.join("\n")).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("showcase polish: branded role navigation and overflow-free owner, manager and employee screens", async ({ browser }) => {
  test.setTimeout(300_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const shotDir = process.env.BUTTERBOX_TEST_SCREENSHOT_DIR;
  const [businessId, venueId, fohId, bohId] = Array.from({ length: 4 }, () => randomUUID());
  const accounts = { owner: "owner", manager: "foh_manager", worker: "employee" };
  const users = {};
  const contexts = [];
  const findings = [];
  try {
    for (const key of Object.keys(accounts)) {
      const created = await admin.auth.admin.createUser({
        email: `polish-${key}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(created.error).toBeNull();
      users[key] = created.data.user.id;
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Polish cafe ${suffix}` })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Long Reef Kiosk", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "Back of House" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.manager, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
    ])).error).toBeNull();
    const staff = [
      ["Avery Barista", fohId, "Barista", users.worker], ["Jordan Floor", fohId, "Server", null],
      ["Riley Pass", bohId, "Cook", null], ["Sam Prep", bohId, "Kitchen hand", null],
    ].map(([name, departmentId, roleTitle, authUserId]) => ({
      id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: departmentId,
      auth_user_id: authUserId, name, role_title: roleTitle,
    }));
    expect((await admin.from("employees").insert(staff)).error).toBeNull();
    expect((await admin.from("shifts").insert(staff.flatMap((employee, index) => [0, 1, 2].map((day) => ({
      business_id: businessId, venue_id: venueId, department_id: employee.department_id, employee_id: employee.id,
      role_title: employee.role_title, is_published: true,
      starts_at: `2032-03-${String(14 + day).padStart(2, "0")}T${String(19 + index).padStart(2, "0")}:30:00Z`,
      ends_at: `2032-03-${String(15 + day).padStart(2, "0")}T0${2 + index}:00:00Z`,
    }))))).error).toBeNull();

    const week = `week=2032-03-15&venue=${venueId}`;
    const journeys = [
      { key: "owner", viewport: { width: 1280, height: 800 }, payroll: true, pages: [
        "/", `/roster?${week}&department=${fohId}`, `/people?venue=${venueId}`, `/timesheets?venue=${venueId}`,
        `/work-time?venue=${venueId}`, `/reports/hours?${week}`, "/settings/payroll", "/settings/organisation"] },
      { key: "owner", viewport: { width: 375, height: 812 }, payroll: true, pages: [
        "/", `/roster?${week}&department=${fohId}`, `/people?venue=${venueId}`, `/timesheets?venue=${venueId}`,
        `/work-time?venue=${venueId}`, `/reports/hours?${week}`, "/settings/payroll", "/settings/organisation",
        "/settings/permissions", "/settings/audit"] },
      { key: "manager", viewport: { width: 375, height: 812 }, payroll: false, pages: [
        "/", `/roster?${week}&department=${fohId}`, `/people?venue=${venueId}`, `/timesheets?venue=${venueId}`,
        `/work-time?venue=${venueId}`, `/attendance?venue=${venueId}`] },
      { key: "worker", viewport: { width: 375, height: 812 }, payroll: false, pages: [
        "/", `/my-schedule?${week}`, `/attendance?venue=${venueId}`, `/availability?venue=${venueId}`,
        `/notifications?venue=${venueId}`, `/shift-swaps?venue=${venueId}`, "/help"] },
      { key: "worker", viewport: { width: 1280, height: 800 }, payroll: false, pages: ["/", `/my-schedule?${week}`] },
    ];
    for (const journey of journeys) {
      const context = await browser.newContext({ baseURL: appUrl, viewport: journey.viewport });
      contexts.push(context);
      const page = await context.newPage();
      await signIn(page, `polish-${journey.key}-${suffix}@example.test`, password);
      const navigation = page.getByRole("navigation", { name: "Main navigation" });
      await expect(navigation).toBeVisible();
      await expect(page.getByRole("img", { name: "Butterbox" })).toBeVisible();
      const menu = navigation.getByRole("button", { name: "Menu", exact: true });
      const label = `${journey.key} ${journey.viewport.width}px`;
      if (journey.viewport.width < 768) {
        await expect(menu).toHaveAttribute("aria-expanded", "false");
        await expect(navigation.getByRole("link")).toHaveCount(0);
        await openMainNavigation(page);
        await expect(navigation.getByRole("link", { name: "My schedule", exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${label} open menu`)
          .toBeLessThanOrEqual(0);
        if (shotDir) await page.screenshot({ path: `${shotDir}/${journey.key}-${journey.viewport.width}-menu.png` });
        findings.push(...await accessibilityFindings(page, `${label} open menu`));
        await expect(navigation.getByRole("link", { name: "Payroll", exact: true })).toHaveCount(journey.payroll ? 1 : 0);
        await page.keyboard.press("Escape");
        await expect(menu).toHaveAttribute("aria-expanded", "false");
        await expect(menu).toBeFocused();
      } else {
        await expect(menu).toBeHidden();
        await expect(navigation.getByRole("link", { name: "Payroll", exact: true })).toHaveCount(journey.payroll ? 1 : 0);
        const lastLink = navigation.getByRole("link").last();
        await lastLink.scrollIntoViewIfNeeded();
        await expect(lastLink).toBeInViewport();
      }
      for (const path of journey.pages) {
        await page.goto(path);
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.getByRole("img", { name: "Butterbox" })).toBeVisible();
        const route = new URL(path, appUrl).pathname;
        expect(await navigation.locator('a[aria-current="page"]').count(), `${label} ${path} current page`)
          .toBeLessThanOrEqual(1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) findings.push(`${label} ${path}: page scrolls horizontally by ${overflow}px`);
        findings.push(...await accessibilityFindings(page, `${label} ${path}`));
        if (shotDir) {
          await page.screenshot({
            path: `${shotDir}/${journey.key}-${journey.viewport.width}${route === "/" ? "-dashboard" : route.replaceAll("/", "-")}.png`,
            fullPage: true,
          });
        }
      }
    }
    expect(findings, findings.join("\n")).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const user of Object.values(users)) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

test("a 25 employee by 7 day roster meets the documented performance benchmark", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const ownerEmail = `bench-owner-${suffix}@example.test`;
  const workerEmail = `bench-worker-${suffix}@example.test`;
  const [businessId, venueId, departmentId] = Array.from({ length: 3 }, () => randomUUID());
  const employeeIds = Array.from({ length: 25 }, () => randomUUID());
  const users = [];
  const contexts = [];
  const budget = { rosterLoadMs: 3_000, publishMs: 5_000, mobileScheduleMs: 2_000 };
  try {
    for (const email of [ownerEmail, workerEmail]) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(created.error).toBeNull();
      users.push(created.data.user.id);
    }
    expect((await admin.from("businesses").insert({ id: businessId, name: `Benchmark cafe ${suffix}` })).error)
      .toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Benchmark venue", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: departmentId },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert(employeeIds.map((id, index) => ({
      id, business_id: businessId, venue_id: venueId, department_id: departmentId,
      auth_user_id: index === 0 ? users[1] : null,
      name: `Bench Worker ${String(index + 1).padStart(2, "0")}`, role_title: "Server",
    })))).error).toBeNull();
    const shifts = employeeIds.flatMap((employeeId) => Array.from({ length: 7 }, (_, day) => ({
      business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: employeeId,
      role_title: "Benchmark service", is_published: false,
      starts_at: `2032-03-${15 + day}T00:00:00Z`, ends_at: `2032-03-${15 + day}T06:00:00Z`,
    })));
    expect(shifts).toHaveLength(175);
    expect((await admin.from("shifts").insert(shifts)).error).toBeNull();

    await signIn(page, ownerEmail, password);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    const roster = `/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`;
    const drafts = page.getByRole("link", { name: /^Edit Bench Worker \d+ shift$/ });
    const rosterLoads = [];
    for (let run = 0; run < 3; run += 1) {
      const started = Date.now();
      await page.goto(roster);
      await expect(drafts).toHaveCount(175);
      rosterLoads.push(Date.now() - started);
    }

    const publishStarted = Date.now();
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: "roster published" }))
      .toHaveText("Front of House roster published.");
    await expect(drafts).toHaveCount(0);
    const publishMs = Date.now() - publishStarted;
    const published = await admin.from("shifts").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("is_published", true);
    expect(published.error).toBeNull();
    expect(published.count).toBe(175);

    const workerContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(workerContext);
    const workerPage = await workerContext.newPage();
    await signIn(workerPage, workerEmail, password);
    await expect(workerPage.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    const scheduleLoads = [];
    const schedule = workerPage.getByRole("region", { name: "Weekly schedule" });
    for (let run = 0; run < 3; run += 1) {
      const started = Date.now();
      await workerPage.goto(`/my-schedule?week=2032-03-15&venue=${venueId}`);
      await expect(schedule.getByText("Benchmark service")).toHaveCount(7);
      scheduleLoads.push(Date.now() - started);
    }
    expect(await workerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(schedule).not.toContainText("Bench Worker 02");

    const result = { rosterLoadMs: median(rosterLoads), publishMs, mobileScheduleMs: median(scheduleLoads) };
    test.info().annotations.push({ type: "benchmark", description: JSON.stringify({ ...result, rosterLoads, scheduleLoads }) });
    console.log(`25x7 benchmark ${JSON.stringify({ ...result, rosterLoads, scheduleLoads, budget })}`);
    for (const [name, value] of Object.entries(result)) {
      expect(value, `${name} must stay within ${budget[name]} ms`).toBeLessThanOrEqual(budget[name]);
    }
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("loading, failure and missing-page states are announced and recoverable", async ({ page }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const email = `states-owner-${suffix}@example.test`;
  const [businessId, venueId, departmentId, employeeId, shiftId] = Array.from({ length: 5 }, () => randomUUID());
  let userId;
  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    userId = created.data.user.id;
    expect((await admin.from("businesses").insert({ id: businessId, name: `States cafe ${suffix}` })).error)
      .toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "States venue", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert({ business_id: businessId, user_id: userId, role: "owner" }))
      .error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
      name: "Stella States", role_title: "Server",
    })).error).toBeNull();
    expect((await admin.from("shifts").insert({
      id: shiftId, business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: employeeId,
      role_title: "State service", starts_at: "2032-03-15T00:00:00Z", ends_at: "2032-03-15T06:00:00Z",
      is_published: false,
    })).error).toBeNull();

    const signedOutMissing = await page.goto("/missing-butterbox-page");
    expect(signedOutMissing.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    findingsMustBeEmpty(await accessibilityFindings(page, "not found"));

    await signIn(page, email, password);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    const missing = await page.goto("/missing-butterbox-page");
    expect(missing.status()).toBe(404);
    await page.getByRole("link", { name: "Go to dashboard" }).click();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

    let releaseNavigation;
    const navigationHeld = new Promise((resolve) => { releaseNavigation = resolve; });
    await page.route("**/roster**", async (route) => {
      const headers = route.request().headers();
      if (headers.rsc === "1" && !headers["next-router-prefetch"]) await navigationHeld;
      await route.continue();
    });
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Rostering" }).click();
    const loading = page.getByRole("status").filter({ hasText: "Loading…" });
    await expect(loading).toBeVisible();
    releaseNavigation();
    await expect(page.getByRole("heading", { name: "Team roster" })).toBeVisible();
    await expect(loading).toHaveCount(0);
    await page.unroute("**/roster**");

    await page.goto(`/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`);
    const publish = page.getByRole("button", { name: "Publish this department" });
    await expect(publish).toBeVisible();
    await page.route("**/roster**", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        await route.fulfill({ status: 500, contentType: "text/plain", body: "Simulated outage" });
      } else {
        await route.continue();
      }
    });
    await publish.click();
    const failure = page.getByRole("alert").filter({ hasText: "Something went wrong" });
    await expect(failure).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeFocused();
    findingsMustBeEmpty(await accessibilityFindings(page, "error state"));
    const unchanged = await admin.from("shifts").select("is_published").eq("id", shiftId).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data.is_published).toBe(false);

    await page.unroute("**/roster**");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(failure).toHaveCount(0);
    await expect(publish).toBeVisible();
    await publish.click();
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: "roster published" }))
      .toHaveText("Front of House roster published.");
    const saved = await admin.from("shifts").select("is_published").eq("id", shiftId).single();
    expect(saved.error).toBeNull();
    expect(saved.data.is_published).toBe(true);
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});

test("owners filter immutable staffing and payroll audit history without crossing businesses", async ({ page, browser }) => {
  page.setDefaultTimeout(20_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, departmentId, employeeId] =
    Array.from({ length: 5 }, () => randomUUID());
  const users = [];
  const contexts = [];
  try {
    for (const role of ["owner", "manager", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `audit-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `Audit cafe ${suffix}` }, { id: outsideBusiness, name: `Outside audit ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Audit venue", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusiness, user_id: users[2], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
        name: "Audit Before", email: "not-copied@example.test", role_title: "Server" },
      ...Array.from({ length: 51 }, (_, index) => ({
        id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: departmentId,
        name: `Audit Page Worker ${index + 1}`, role_title: "Server",
      })),
    ])).error).toBeNull();
    const ownerApi = createClient(apiUrl, anonKey, options);
    expect((await ownerApi.auth.signInWithPassword({
      email: `audit-owner-${suffix}@example.test`, password,
    })).error).toBeNull();
    expect((await ownerApi.rpc("save_employee_profile", {
      p_business_id: businessId, p_department_id: departmentId, p_employee_id: employeeId,
      p_name: "Audit After", p_email: "not-copied@example.test", p_role_title: "Supervisor",
      p_employment_type: "part_time", p_active: true,
    })).error).toBeNull();
    const scope = { p_business_id: businessId, p_venue_id: venueId, p_week_start: "2024-01-08", p_request_id: randomUUID() };
    expect((await ownerApi.rpc("finalise_payroll_period", scope)).error).toBeNull();
    expect((await ownerApi.rpc("reopen_payroll_period", {
      ...scope, p_request_id: randomUUID(), p_reason: "Audit reopening smoke check",
    })).error).toBeNull();
    expect((await ownerApi.from("sensitive_action_audit").select("id")
      .eq("business_id", outsideBusiness)).data).toEqual([]);
    expect((await ownerApi.from("sensitive_action_audit").update({ reason: "forged" }).eq("business_id", businessId))
      .error?.code).toBe("42501");

    await page.goto("/settings/audit");
    await expect(page.getByRole("heading", { name: "Welcome to Butterbox" })).toBeVisible();
    await signIn(page, `audit-owner-${suffix}@example.test`, password);
    await page.goto(`/settings/audit?business=${businessId}`);
    await expect(page.getByRole("heading", { name: "Sensitive action audit" })).toBeVisible();
    const form = page.getByRole("form", { name: "Filter audit history" });
    await form.getByLabel("Change category").selectOption("employees");
    await form.getByRole("combobox", { name: "Operation", exact: true }).selectOption("UPDATE");
    await form.getByLabel("Actor user ID").fill(users[0]);
    const today = new Date().toISOString().slice(0, 10);
    await form.getByLabel("From date (UTC)").fill(today);
    await form.getByLabel("Through date (UTC)").fill(today);
    await form.getByRole("button", { name: "Apply audit filters" }).click();
    await expect(page.getByRole("status")).toHaveText("1 audit records match. Page 1.");
    const history = page.getByRole("list", { name: "Sensitive action history" });
    await expect(history.getByRole("listitem")).toHaveCount(1);
    await expect(history).toContainText(`You (${users[0]})`);
    await history.getByText("Before and after values").click();
    await expect(history.locator("pre").nth(0)).toContainText("Audit Before");
    await expect(history.locator("pre").nth(1)).toContainText("Audit After");
    await expect(history).not.toContainText("not-copied@example.test");
    await expect(history.locator("time")).toHaveAttribute("datetime", /T/);

    await form.getByLabel("Change category").selectOption("payroll_period_events");
    await form.getByRole("combobox", { name: "Operation", exact: true }).selectOption("");
    await form.getByRole("button", { name: "Apply audit filters" }).click();
    await expect(history.getByRole("listitem")).toHaveCount(2);
    await expect(history).toContainText("Reason: Audit reopening smoke check");

    await form.getByLabel("Change category").selectOption("employees");
    await form.getByRole("combobox", { name: "Operation", exact: true }).selectOption("INSERT");
    await form.getByLabel("Actor user ID").fill("");
    await form.getByRole("button", { name: "Apply audit filters" }).click();
    await expect(page.getByRole("status")).toHaveText("52 audit records match. Page 1.");
    await expect(history.getByRole("listitem")).toHaveCount(50);
    await page.getByRole("link", { name: "Next audit page" }).click();
    await expect(page.getByRole("status")).toHaveText("52 audit records match. Page 2.");
    await expect(history.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Previous audit page" })).toBeVisible();
    await expect(history).toContainText("Database service (no user session)");

    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    findingsMustBeEmpty(await accessibilityFindings(page, "mobile audit history"));
    await page.goto(`/settings/audit?business=${businessId}&actor=invalid`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Invalid audit filters");
    await expect(page.getByRole("list", { name: "Sensitive action history" })).toHaveCount(0);

    const managerContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, `audit-manager-${suffix}@example.test`, password);
    await managerPage.goto(`/settings/audit?business=${businessId}`);
    await expect(managerPage).toHaveURL(new RegExp(`/\\?error=permission&business=${businessId}`));
    await expect(managerPage.getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Audit history" })).toHaveCount(0);
    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outsidePage = await outsideContext.newPage();
    await signIn(outsidePage, `audit-outside-${suffix}@example.test`, password);
    await outsidePage.goto(`/settings/audit?business=${businessId}`);
    await expect(outsidePage.getByRole("heading", { name: "Audit history unavailable" })).toBeVisible();
    await expect(outsidePage.getByText("Audit After", { exact: false })).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
    for (const id of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, id);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("published roster updates reach uninvited staff once after they accept an invitation", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const ownerEmail = `roster-invite-owner-${suffix}@example.test`;
  const recipientEmail = `roster-invite-recipient-${suffix}@example.test`;
  const [businessId, venueId, departmentId, employeeId] = Array.from({ length: 4 }, () => randomUUID());
  const users = [];
  const contexts = [];
  try {
    const owner = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
    expect(owner.error).toBeNull();
    users.push(owner.data.user.id);
    expect((await admin.from("businesses").insert({ id: businessId, name: `Invite notices ${suffix}` })).error)
      .toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Invite notice cafe", timezone: "UTC",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: users[0], role: "owner",
    })).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
      name: "Uninvited worker", email: recipientEmail, role_title: "Server",
    })).error).toBeNull();
    expect((await admin.from("shifts").insert({
      business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: employeeId,
      role_title: "Invited service", starts_at: "2032-03-15T09:00:00Z", ends_at: "2032-03-15T10:00:00Z",
      is_published: false,
    })).error).toBeNull();

    await signIn(page, ownerEmail, password);
    const roster = `/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`;
    await page.goto(roster);
    await page.getByRole("button", { name: "Publish this department" }).click();
    await expect(page.getByRole("status")).toHaveText("Front of House roster published.");
    const history = page.getByRole("region", { name: "Publication history" });
    await expect(history).toContainText("1 affected employee profile cannot currently see this update");
    await history.getByRole("link", { name: "Invite staff from People" }).click();
    await expect(page).toHaveURL(new RegExp(
      `/people\\?venue=${venueId}&department=${departmentId}&business=${businessId}$`,
    ));
    await page.getByRole("link", { name: "View profile for Uninvited worker" }).click();
    await page.getByRole("button", { name: "Manage invitation" }).click();
    const form = page.getByRole("form", { name: "Invite Uninvited worker" });
    await expect(form.getByLabel("Invitation email")).toHaveValue(recipientEmail);
    await form.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status")).toContainText("Invitation email requested");

    const recipientContext = await browser.newContext({ baseURL: appUrl, viewport: { width: 375, height: 812 } });
    contexts.push(recipientContext);
    const recipientPage = await recipientContext.newPage();
    await openInvitationMail(recipientPage, recipientEmail);
    await recipientPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(recipientPage.getByRole("status")).toContainText("invitation has been accepted");
    await recipientPage.getByRole("link", { name: "Open workspace" }).click();
    const banner = recipientPage.getByRole("region", { name: "Unread work updates" });
    await expect(banner).toContainText("1 unread work update");
    await banner.getByRole("link", { name: "View notifications" }).click();
    const notice = recipientPage.getByRole("article");
    await expect(notice).toHaveCount(1);
    await expect(notice).toHaveAccessibleName("Roster update for week starting 2032-03-15");
    await expect(notice.getByText("Unread", { exact: true })).toBeVisible();
    await notice.getByRole("button", { name: "View schedule" }).click();
    await expect(recipientPage.getByRole("region", { name: "Weekly schedule" })).toContainText("Invited service");
    await recipientPage.goto(`/notifications?venue=${venueId}`);
    await expect(recipientPage.getByRole("article")).toHaveCount(1);
    await expect(recipientPage.getByRole("article").getByText("Read", { exact: true })).toBeVisible();

    await page.goto(roster);
    await expect(history.getByRole("listitem")).toHaveCount(1);
    await expect(history).not.toContainText("cannot currently see this update");
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, businessId);
    const recipient = await findUser(recipientEmail);
    if (recipient) users.push(recipient.id);
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("existing members of another business accept a scoped invitation and switch explicitly", async ({ page }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const managerEmail = `cross-invite-manager-${suffix}@example.test`;
  const ownerEmail = `cross-invite-owner-${suffix}@example.test`;
  const [businessId, ownBusiness, venueId, ownVenue, departmentId, bohDepartment, ownDepartment, employeeId] =
    Array.from({ length: 8 }, () => randomUUID());
  const users = [];
  try {
    for (const email of [managerEmail, ownerEmail]) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(created.error).toBeNull();
      users.push(created.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Inviting cross cafe" },
      { id: ownBusiness, name: "Own cross cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Inviting venue", timezone: "UTC" },
      { id: ownVenue, business_id: ownBusiness, name: "Own venue", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "Front of House" },
      { id: bohDepartment, business_id: businessId, venue_id: venueId, name: "Back of House" },
      { id: ownDepartment, business_id: ownBusiness, venue_id: ownVenue, name: "Own team" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: ownBusiness, user_id: users[1], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
      name: "Casey Crossover", email: ownerEmail, role_title: "Server",
    })).error).toBeNull();

    await signIn(page, managerEmail, password);
    await page.goto(`/people?venue=${venueId}`);
    await page.getByRole("link", { name: "View profile for Casey Crossover" }).click();
    await page.getByRole("button", { name: "Manage invitation" }).click();
    const form = page.getByRole("form", { name: "Invite Casey Crossover" });
    await expect(form.getByLabel("Invitation email")).toHaveValue(ownerEmail);
    await form.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status")).toContainText("Invitation email requested");
    const manager = createClient(apiUrl, anonKey, options);
    expect((await manager.auth.signInWithPassword({ email: managerEmail, password })).error).toBeNull();
    const invitation = await manager.from("staff_invitations").select("id")
      .eq("employee_id", employeeId).eq("status", "pending").single();
    expect(invitation.error).toBeNull();
    await page.context().clearCookies();

    await signIn(page, ownerEmail, password);
    await expect(page.locator("aside").getByText("Own cross cafe", { exact: true })).toBeVisible();
    await page.goto(`/invitations/${invitation.data.id}`);
    await expect(page.getByText(/Inviting cross cafe invited Casey Crossover to Inviting venue \/ Front of House/))
      .toBeVisible();
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page.getByRole("status")).toContainText("invitation has been accepted");
    await expect(page).toHaveURL(new RegExp(`accepted=1&business=${businessId}$`));
    const memberships = await admin.from("business_memberships")
      .select("business_id, venue_id, department_id, role").eq("user_id", users[1]);
    expect(memberships.error).toBeNull();
    expect(memberships.data.sort((a, b) => a.role.localeCompare(b.role))).toEqual([
      { business_id: businessId, venue_id: venueId, department_id: departmentId, role: "employee" },
      { business_id: ownBusiness, venue_id: null, department_id: null, role: "owner" },
    ]);

    await page.getByRole("link", { name: "Open workspace" }).click();
    await expect(page).toHaveURL(new RegExp(`/\\?business=${businessId}$`));
    const shell = page.locator("aside");
    await expect(shell.getByText("Inviting cross cafe", { exact: true })).toBeVisible();
    await expect(page.getByText("Own cross cafe", { exact: true })).toHaveCount(0);
    await page.goto(`/people?business=${businessId}`);
    await expect(page).toHaveURL(new RegExp(`/\\?error=permission&business=${businessId}$`));
    await expect(shell.getByText("Inviting cross cafe", { exact: true })).toBeVisible();

    await page.goto(`/?business=${businessId}`);
    await shell.getByRole("link", { name: "Switch business" }).click();
    const choices = page.getByRole("list", { name: "Your businesses" });
    await expect(choices.getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Open Own cross cafe" }).click();
    await expect(page).toHaveURL(new RegExp(`/\\?business=${ownBusiness}$`));
    await expect(shell.getByText("Own cross cafe", { exact: true })).toBeVisible();
    await page.goto(`/people?business=${ownBusiness}`);
    await expect(page.getByRole("heading", { name: "Your people" })).toBeVisible();
    await expect(page.locator("main")).toContainText("Own venue");
    await expect(page.locator("main")).not.toContainText("Inviting venue");
    await expect(page.getByText("Casey Crossover")).toHaveCount(0);
  } finally {
    for (const business of [businessId, ownBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("staff invitations reject revocation and expiry and require consent before switching sessions", async ({ page, browser }) => {
  const { sql } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const ownerEmail = `invite-owner2-${suffix}@example.test`;
  const addresses = {
    Revoked: `invite-revoked-${suffix}@example.test`,
    Expired: `invite-expired-${suffix}@example.test`,
    Session: `invite-session-${suffix}@example.test`,
    Resend: `invite-resend-${suffix}@example.test`,
  };
  const [businessId, venueId, departmentId, revokedEmployee, expiredEmployee, sessionEmployee, resendEmployee] =
    Array.from({ length: 7 }, () => randomUUID());
  const contexts = [];
  let ownerId;
  try {
    const owner = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
    expect(owner.error).toBeNull();
    ownerId = owner.data.user.id;
    expect((await admin.auth.admin.createUser({
      email: addresses.Session, password, email_confirm: true,
    })).error).toBeNull();
    expect((await admin.from("businesses").insert({ id: businessId, name: "Invitation safety cafe" })).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Main venue", timezone: "UTC",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: ownerId, role: "owner",
    })).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: revokedEmployee, business_id: businessId, venue_id: venueId, department_id: departmentId,
        name: "Revoked", email: addresses.Revoked, role_title: "Server" },
      { id: expiredEmployee, business_id: businessId, venue_id: venueId, department_id: departmentId,
        name: "Expired", email: addresses.Expired, role_title: "Server" },
      { id: sessionEmployee, business_id: businessId, venue_id: venueId, department_id: departmentId,
        name: "Session", email: addresses.Session, role_title: "Server" },
      { id: resendEmployee, business_id: businessId, venue_id: venueId, department_id: departmentId,
        name: "Resend", email: addresses.Resend, role_title: "Server" },
    ])).error).toBeNull();
    await signIn(page, ownerEmail, password);
    await page.goto(`/people?venue=${venueId}`);
    const ownerClient = createClient(apiUrl, anonKey, options);
    expect((await ownerClient.auth.signInWithPassword({ email: ownerEmail, password })).error).toBeNull();

    async function send(name, employeeId) {
      await page.goto(`/people?venue=${venueId}`);
      await page.getByRole("link", { name: `View profile for ${name}` }).click();
      await page.getByRole("button", { name: "Manage invitation" }).click();
      const form = page.getByRole("form", { name: `Invite ${name}` });
      await form.getByRole("button", { name: "Send invitation" }).click();
      await expect(page.getByRole("status")).toContainText("Invitation email requested");
      const result = await ownerClient.from("staff_invitations").select("id")
        .eq("employee_id", employeeId).eq("status", "pending").single();
      expect(result.error).toBeNull();
      return result.data.id;
    }

    const resendId = await send("Resend", resendEmployee);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await page.goto(`/people?venue=${venueId}`);
    await page.getByRole("link", { name: "View profile for Resend" }).click();
    await page.getByRole("button", { name: "Manage invitation" }).click();
    await page.getByRole("form", { name: "Resend invitation for Resend" })
      .getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByRole("status")).toContainText("Invitation email requested");
    const resent = await ownerClient.from("staff_invitations").select("id, status")
      .eq("employee_id", resendEmployee).eq("status", "pending");
    expect(resent.error).toBeNull();
    expect(resent.data).toEqual([{ id: resendId, status: "pending" }]);
    await expect.poll(async () => {
      const list = await (await fetch(new URL("/api/v1/messages", mailUrl))).json();
      return list.messages.filter((message) =>
        message.To.some((recipient) => recipient.Address === addresses.Resend)).length;
    }).toBeGreaterThanOrEqual(2);

    const revokedId = await send("Revoked", revokedEmployee);
    await page.goto(`/people?venue=${venueId}`);
    await page.getByRole("link", { name: "View profile for Revoked" }).click();
    await page.getByRole("button", { name: "Manage invitation" }).click();
    await page.getByRole("form", { name: "Revoke invitation for Revoked" })
      .getByRole("button", { name: "Revoke invitation" }).click();
    await expect(page.getByRole("status")).toContainText("Invitation revoked");
    const revokedContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(revokedContext);
    const revokedPage = await revokedContext.newPage();
    await openInvitationMail(revokedPage, addresses.Revoked);
    await expect(revokedPage.getByText("This invitation is revoked.", { exact: false })).toBeVisible();
    await expect(revokedPage.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);

    const expiredId = await send("Expired", expiredEmployee);
    await sql(`update public.staff_invitations set created_at = clock_timestamp() - interval '8 days', expires_at = clock_timestamp() - interval '1 minute' where id = '${expiredId}'::uuid`);
    await page.reload();
    await page.getByRole("button", { name: "Manage invitation" }).click();
    await expect(page.getByRole("region", { name: "Invitation for Expired" })).toContainText("Expired invitation");
    await expect(page.getByRole("form", { name: "Invite Expired" })).toBeVisible();
    const expiredContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(expiredContext);
    const expiredPage = await expiredContext.newPage();
    await openInvitationMail(expiredPage, addresses.Expired);
    await expect(expiredPage.getByText("This invitation is expired.", { exact: false })).toBeVisible();
    await expect(expiredPage.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);

    const sessionId = await send("Session", sessionEmployee);
    const ownerSession = (await ownerClient.auth.getSession()).data.session;
    expect(ownerSession).not.toBeNull();
    const invitedClient = createClient(apiUrl, anonKey, options);
    const invitedLogin = await invitedClient.auth.signInWithPassword({ email: addresses.Session, password });
    expect(invitedLogin.error).toBeNull();
    expect(invitedLogin.data.session).not.toBeNull();
    const tamperedPage = await page.context().newPage();
    await tamperedPage.goto(`/invitations/${sessionId}`);
    await tamperedPage.evaluate(({ accessToken, refreshToken }) => {
      const fragment = new URLSearchParams({ access_token: accessToken, refresh_token: refreshToken });
      window.history.replaceState(null, "", `${window.location.pathname}#${fragment}`);
      window.location.reload();
    }, { accessToken: invitedLogin.data.session.access_token, refreshToken: ownerSession.refresh_token });
    await expect(tamperedPage.getByText("This email link is invalid or expired.", { exact: false })).toBeVisible();
    await expect(tamperedPage.getByRole("button", { name: "Continue with invitation email" })).toHaveCount(0);
    expect(new URL(tamperedPage.url()).hash).toBe("");
    await tamperedPage.goto("/");
    await expect(tamperedPage.getByText("Invitation safety cafe", { exact: true })).toBeVisible();
    await tamperedPage.close();
    const existingContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(existingContext);
    const existingPage = await existingContext.newPage();
    await signIn(existingPage, ownerEmail, password);
    await openInvitationMail(existingPage, addresses.Session);
    await expect(existingPage.getByText("You are already signed in.", { exact: false })).toBeVisible();
    const ownerTab = await existingContext.newPage();
    await ownerTab.goto("/");
    await expect(ownerTab.getByText("Invitation safety cafe", { exact: true })).toBeVisible();
    await existingPage.getByRole("button", { name: "Continue with invitation email" }).click();
    await expect(existingPage.getByRole("button", { name: "Accept invitation" })).toBeVisible();
    await existingPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(existingPage.getByRole("status")).toContainText("invitation has been accepted");
    const revoked = await ownerClient.from("staff_invitations").select("status").eq("id", revokedId).single();
    expect(revoked.error).toBeNull();
    expect(revoked.data.status).toBe("revoked");
    for (const address of [addresses.Revoked, addresses.Expired]) {
      const recipient = await findUser(address);
      expect(recipient).toBeDefined();
      const membership = await admin.from("business_memberships").select("id").eq("user_id", recipient.id);
      expect(membership.error).toBeNull();
      expect(membership.data).toEqual([]);
    }
  } finally {
    for (const context of contexts) await context.close();
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const address of Object.values(addresses)) {
      const recipient = await findUser(address);
      if (recipient) expect((await admin.auth.admin.deleteUser(recipient.id)).error).toBeNull();
    }
    if (ownerId) expect((await admin.auth.admin.deleteUser(ownerId)).error).toBeNull();
  }
});

test("multi-business members switch explicitly with per-tab isolation, revocation and private pages", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const email = `multiple-businesses-${suffix}@example.test`;
  const outsideEmail = `multiple-businesses-outside-${suffix}@example.test`;
  const [businessId, otherBusiness, outsideBusiness, venueId, otherVenue, outsideVenue,
    departmentId, otherDepartment, outsideDepartment] = Array.from({ length: 9 }, () => randomUUID());
  const users = [];
  try {
    for (const address of [email, outsideEmail]) {
      const user = await admin.auth.admin.createUser({ email: address, password, email_confirm: true });
      expect(user.error).toBeNull();
      users.push(user.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "First private business" }, { id: otherBusiness, name: "Second private business" },
      { id: outsideBusiness, name: "Outside private business" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "First", timezone: "UTC" },
      { id: otherVenue, business_id: otherBusiness, name: "Second", timezone: "UTC" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "First FOH" },
      { id: otherDepartment, business_id: otherBusiness, venue_id: otherVenue, name: "Second FOH" },
      { id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "Outside FOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: otherBusiness, user_id: users[1], role: "owner" },
      { business_id: otherBusiness, user_id: users[0], role: "admin" },
      { business_id: outsideBusiness, user_id: users[1], role: "owner" },
    ])).error).toBeNull();

    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/choose-business$/);
    const choices = page.getByRole("list", { name: "Your businesses" });
    await expect(choices.getByRole("listitem")).toHaveCount(2);
    await expect(choices).toContainText("First private business");
    await expect(choices).toContainText("Second private business");
    await expect(page.getByText("Outside private business")).toHaveCount(0);
    await page.getByRole("button", { name: "Open First private business" }).click();
    await expect(page).toHaveURL(new RegExp(`/\\?business=${businessId}$`));
    const shell = page.locator("aside");
    await expect(shell.getByText("First private business", { exact: true })).toBeVisible();
    await expect(shell.getByRole("link", { name: "Switch business" })).toBeVisible();
    await expect(page.getByRole("link", { name: "People" }))
      .toHaveAttribute("href", `/people?business=${businessId}&venue=${venueId}`);

    const secondTab = await page.context().newPage();
    secondTab.setDefaultTimeout(20_000);
    await secondTab.goto("/choose-business");
    await secondTab.getByRole("button", { name: "Open Second private business" }).click();
    await expect(secondTab).toHaveURL(new RegExp(`/\\?business=${otherBusiness}$`));
    await expect(secondTab.locator("aside").getByText("Second private business", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "People" }).click();
    await expect(page).toHaveURL(new RegExp(`/people\\?business=${businessId}&venue=${venueId}$`));
    await expect(shell.getByText("First private business", { exact: true })).toBeVisible();
    await expect(page.getByText("Second private business", { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Add person", exact: true }).click();
    let newEmployee = page.getByRole("region", { name: "New employee", exact: true });
    await newEmployee.getByRole("textbox", { name: "Name", exact: true }).fill("First tab staff");
    await newEmployee.getByRole("textbox", { name: "Job role", exact: true }).fill("Server");
    await newEmployee.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentId);
    await newEmployee.getByRole("button", { name: "Add employee" }).click();
    await expect(page.locator("main").getByRole("status").filter({ hasText: "Person added." })).toBeVisible();
    await expect(shell.getByText("First private business", { exact: true })).toBeVisible();
    const placed = await admin.from("employees").select("business_id").eq("name", "First tab staff")
      .in("business_id", [businessId, otherBusiness, outsideBusiness]);
    expect(placed.error).toBeNull();
    expect(placed.data).toEqual([{ business_id: businessId }]);

    const privateResponse = await page.goto(`/people?business=${businessId}`);
    expect(privateResponse?.headers()["cache-control"] ?? "").toContain("no-store");
    for (const path of [`/?business=${outsideBusiness}`, `/?business=${businessId}&business=${otherBusiness}`,
      "/?business=not-a-business"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
      await expect(page.getByText("Outside private business", { exact: true })).toHaveCount(0);
    }
    await page.goto(`/roster?venue=${outsideVenue}`);
    await expect(page.getByRole("heading", { name: "Roster unavailable" })).toBeVisible();
    await expect(page.getByText("Outside private business", { exact: true })).toHaveCount(0);
    await page.goto(`/roster?business=${businessId}&venue=${otherVenue}`);
    await expect(page.getByRole("heading", { name: "Roster unavailable" })).toBeVisible();
    await expect(page.getByText("Second private business", { exact: true })).toHaveCount(0);

    await secondTab.getByRole("link", { name: "People" }).click();
    await expect(secondTab).toHaveURL(new RegExp(`/people\\?business=${otherBusiness}&venue=${otherVenue}$`));
    await secondTab.getByRole("link", { name: "Add person", exact: true }).click();
    newEmployee = secondTab.getByRole("region", { name: "New employee", exact: true });
    await newEmployee.getByRole("textbox", { name: "Name", exact: true }).fill("Revoked tab staff");
    await newEmployee.getByRole("textbox", { name: "Job role", exact: true }).fill("Server");
    await newEmployee.getByRole("combobox", { name: "Department", exact: true }).selectOption(otherDepartment);
    expect((await admin.from("business_memberships").delete()
      .eq("business_id", otherBusiness).eq("user_id", users[0])).error).toBeNull();
    await newEmployee.getByRole("button", { name: "Add employee" }).click();
    await expect(secondTab.locator("aside").getByText("First private business", { exact: true })).toBeVisible();
    await expect(secondTab.getByText("Second private business", { exact: true })).toHaveCount(0);
    const revoked = await admin.from("employees").select("id").eq("name", "Revoked tab staff");
    expect(revoked.error).toBeNull();
    expect(revoked.data).toEqual([]);
    await secondTab.goto(`/people?business=${otherBusiness}`);
    await expect(secondTab).toHaveURL(/\/\?error=workspace$/);
    await expect(secondTab.locator("aside").getByText("First private business", { exact: true })).toBeVisible();
    await expect(secondTab.getByText("Second private business", { exact: true })).toHaveCount(0);
    await secondTab.goto("/choose-business");
    await expect(secondTab.getByRole("list", { name: "Your businesses" }).getByRole("listitem")).toHaveCount(1);
    await expect(secondTab.getByText("Second private business", { exact: true })).toHaveCount(0);
    await secondTab.close();

    await page.goto("/");
    await expect(shell.getByText("First private business", { exact: true })).toBeVisible();
    await expect(shell.getByRole("link", { name: "Switch business" })).toHaveCount(0);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?message=signed-out/);
    expect((await page.context().cookies()).some((cookie) => cookie.name === "bb_business")).toBe(false);
  } finally {
    for (const business of [businessId, otherBusiness, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("owners explicitly map same-name employees to payroll destinations without connecting a provider", async ({ page, browser }) => {
  page.setDefaultTimeout(20_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, outsideVenueId, departmentId, firstEmployee, secondEmployee] =
    Array.from({ length: 7 }, () => randomUUID());
  const users = [];
  const contexts = [];
  try {
    for (const role of ["owner", "foh", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `mapping-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Explicit payroll mapping cafe" }, { id: outsideId, name: "Outside mapping cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: outsideId, user_id: users[2], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([firstEmployee, secondEmployee].map((id) => ({
      id, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "Same Name", role_title: "Server",
    })))).error).toBeNull();

    await signIn(page, `mapping-owner-${suffix}@example.test`, password);
    const owner = createClient(apiUrl, anonKey, options);
    expect((await owner.auth.signInWithPassword({ email: `mapping-owner-${suffix}@example.test`, password })).error).toBeNull();
    await page.goto(`/timesheets?venue=${venueId}&week=2024-01-08`);
    await page.getByRole("link", { name: "Manage payroll employee mapping" }).click();
    await expect(page.getByRole("heading", { name: "Payroll employee mapping", exact: true })).toBeVisible();
    await expect(page.getByText("No payroll destinations have been added.", { exact: false })).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/settings\/payroll\/new\?/),
      page.getByRole("link", { name: "Add mapping destination" }).click(),
    ]);
    await expect(page.getByRole("heading", { name: "Add mapping destination" })).toBeVisible();
    const add = page.getByRole("region", { name: "Add payroll destination" });
    await add.getByRole("combobox", { name: "Provider", exact: true }).selectOption("xero");
    await add.getByLabel("Destination name").fill("Test Xero account");
    await add.getByLabel("Payroll account ID").fill("explicit-account-id");
    await add.getByRole("button", { name: "Add mapping destination" }).click();
    await expect(page.locator("main").getByRole("status"))
      .toContainText("Payroll mapping destination created. No provider has been connected.");
    await expect(page.getByText("Mapped: 0 · Missing: 2")).toBeVisible();
    const filters = page.getByRole("form", { name: "Payroll mapping filters" });
    await filters.getByRole("searchbox", { name: "Search employees" }).fill("Same Name");
    await filters.getByRole("combobox", { name: "Mapping status" }).selectOption("missing");
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/status=missing/);
    async function openMapping(employeeId) {
      await page.getByRole("link", { name: `View mapping for Same Name (${employeeId})` }).click();
      await expect(page.getByRole("heading", { name: "Employee payroll mapping" })).toBeVisible();
    }
    async function editMapping(externalId, reason) {
      await page.getByRole("button", { name: "Edit mapping" }).click();
      await expect(page.getByRole("heading", { name: "Edit mapping" })).toBeFocused();
      await page.getByLabel("Payroll employee ID", { exact: true }).fill(externalId);
      await page.getByLabel("Reason for mapping change").fill(reason);
    }
    async function mappingRows() {
      const connection = new URL(page.url()).searchParams.get("connection");
      const result = await owner.rpc("list_payroll_employee_mappings", {
        p_business_id: businessId, p_connection_id: connection, p_venue_id: venueId,
      });
      expect(result.error).toBeNull();
      return result.data;
    }
    await openMapping(firstEmployee);
    await expect(page.getByLabel("Payroll employee ID", { exact: true })).toHaveCount(0);
    await editMapping("Temporary", "Discard this draft");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Discard changes" }).click();
    expect((await mappingRows()).find((row) => row.employee_id === firstEmployee).revision).toBe(0);
    await editMapping("Staff-001", "Copied exact employee ID from payroll account");
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    expect((await mappingRows()).find((row) => row.employee_id === firstEmployee).revision).toBe(0);
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("Payroll employee mapping saved");
    await page.reload();
    await expect(page.getByText("Staff-001", { exact: true })).toBeVisible();
    expect((await mappingRows()).find((row) => row.employee_id === firstEmployee)).toMatchObject({
      external_employee_id: "Staff-001", revision: 1,
    });
    const audit = await owner.from("sensitive_action_audit").select("new_values")
      .eq("business_id", businessId).eq("source_table", "payroll_employee_mapping_events");
    expect(audit.error).toBeNull();
    expect(audit.data.some((row) => row.new_values.employee_id === firstEmployee &&
      row.new_values.external_employee_id === "Staff-001")).toBe(true);
    await page.getByRole("link", { name: "Back to mappings" }).click();
    await expect(filters.getByRole("combobox", { name: "Mapping status" })).toHaveValue("missing");
    await openMapping(secondEmployee);
    await editMapping("Staff-001", "Attempt duplicate ID");
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("already assigned to another employee");
    await editMapping("Staff-002", "Distinct ID despite same name");
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("Payroll employee mapping saved");
    await page.getByRole("link", { name: "Back to mappings" }).click();
    await expect(page.getByText("No employees match these filters. Try resetting them.")).toBeVisible();
    await page.getByRole("link", { name: "Reset filters" }).click();
    await openMapping(firstEmployee);
    await editMapping("", "Remove incorrect assignment");
    await expect(page.getByText("Removing this mapping blocks provider-ready records", { exact: false })).toBeVisible();
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    await page.getByRole("button", { name: "Confirm and remove mapping" }).click();
    expect((await mappingRows()).find((row) => row.employee_id === firstEmployee).revision).toBe(1);
    await page.getByLabel("I confirm removal of this employee's payroll mapping.").check();
    await page.getByRole("button", { name: "Confirm and remove mapping" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("Payroll employee mapping removed");
    expect((await mappingRows()).find((row) => row.employee_id === firstEmployee)).toMatchObject({
      external_employee_id: null, revision: 2,
    });
    expect((await mappingRows()).find((row) => row.employee_id === secondEmployee)).toMatchObject({
      external_employee_id: "Staff-002", revision: 1,
    });
    await page.getByRole("link", { name: "Back to mappings" }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const fohContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(fohContext);
    const fohPage = await fohContext.newPage();
    await signIn(fohPage, `mapping-foh-${suffix}@example.test`, password);
    await fohPage.goto(`/settings/payroll?venue=${venueId}`);
    await expect(fohPage).toHaveURL(/error=permission/);
    await expect(fohPage.getByRole("button", { name: "Save payroll ID" })).toHaveCount(0);
    const outsideContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(outsideContext);
    const outsidePage = await outsideContext.newPage();
    await signIn(outsidePage, `mapping-outside-${suffix}@example.test`, password);
    await outsidePage.goto(`/settings/payroll?venue=${venueId}`);
    await expect(outsidePage.getByRole("heading", { name: "Payroll mappings unavailable" })).toBeVisible();
    await expect(outsidePage.getByText("Staff-002")).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
    for (const id of [businessId, outsideId]) {
      await assertBusinessFixturesPreserved(admin, id);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

async function withPayrollDirectoryFixtures(run) {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, secondVenue, emptyVenue, outsideVenue, departmentId, secondDepartment, outsideDepartment,
    firstEmployee, secondEmployee, otherVenueEmployee, outsideEmployee, connectionId, otherConnection, outsideConnection] =
    Array.from({ length: 16 }, () => randomUUID());
  const users = [];
  const email = (role) => `payroll-ux-${role}-${suffix}@example.test`;
  try {
    for (const role of ["owner", "admin", "gm", "foh", "employee", "outside"]) {
      const created = await admin.auth.admin.createUser({ email: email(role), password, email_confirm: true });
      expect(created.error).toBeNull();
      users.push(created.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "Payroll UX cafe" },
      { id: outsideBusiness, name: "Outside payroll UX cafe" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: secondVenue, business_id: businessId, name: "Second venue", timezone: "Australia/Sydney" },
      { id: emptyVenue, business_id: businessId, name: "Empty venue", timezone: "Australia/Sydney" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside venue", timezone: "Australia/Sydney" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: secondDepartment, business_id: businessId, venue_id: secondVenue, name: "FOH" },
      { id: outsideDepartment, business_id: outsideBusiness, venue_id: outsideVenue, name: "FOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "admin" },
      { business_id: businessId, user_id: users[2], role: "general_manager", venue_id: venueId },
      { business_id: businessId, user_id: users[3], role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users[4], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusiness, user_id: users[5], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert([
      { id: firstEmployee, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "Alex Taylor", role_title: "Server" },
      { id: secondEmployee, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "Blake Morgan", role_title: "Server" },
      { id: otherVenueEmployee, business_id: businessId, venue_id: secondVenue, department_id: secondDepartment, name: "Other venue worker", role_title: "Server" },
      { id: outsideEmployee, business_id: outsideBusiness, venue_id: outsideVenue, department_id: outsideDepartment, name: "Outside worker", role_title: "Server" },
    ])).error).toBeNull();

    const owner = createClient(apiUrl, anonKey, options);
    const outside = createClient(apiUrl, anonKey, options);
    expect((await owner.auth.signInWithPassword({ email: email("owner"), password })).error).toBeNull();
    expect((await outside.auth.signInWithPassword({ email: email("outside"), password })).error).toBeNull();
    for (const [client, business, connection, provider, account, name] of [
      [owner, businessId, connectionId, "xero", "harbour-account", "Harbour payroll"],
      [owner, businessId, otherConnection, "myob", "backup-account", "Backup payroll"],
      [outside, outsideBusiness, outsideConnection, "xero", "outside-private-account", "Outside private payroll"],
    ]) {
      expect((await client.rpc("create_payroll_mapping_connection", {
        p_business_id: business, p_connection_id: connection, p_provider: provider,
        p_account_id: account, p_name: name,
      })).error).toBeNull();
    }
    for (const [client, business, venue, connection, employee, external] of [
      [owner, businessId, venueId, connectionId, firstEmployee, "Harbour-001"],
      [owner, businessId, secondVenue, connectionId, otherVenueEmployee, "OTHER-VENUE-PRIVATE"],
      [outside, outsideBusiness, outsideVenue, outsideConnection, outsideEmployee, "OUTSIDE-PRIVATE"],
    ]) {
      expect((await client.rpc("set_payroll_employee_mapping_scoped", {
        p_business_id: business, p_venue_id: venue, p_connection_id: connection, p_employee_id: employee, p_expected_revision: 0,
        p_external_employee_id: external, p_reason: "Synthetic fixture", p_request_id: randomUUID(),
        p_destination_confirmed: true, p_removal_confirmed: false,
      })).error).toBeNull();
    }
    await run({ suffix, password, email, users, businessId, outsideBusiness, venueId, secondVenue, emptyVenue,
      outsideVenue, firstEmployee, secondEmployee, otherVenueEmployee, outsideEmployee,
      connectionId, otherConnection, outsideConnection, owner });
  } finally {
    for (const id of [businessId, outsideBusiness]) await assertBusinessFixturesPreserved(admin, id);
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
}

test("navigation UX: role visibility and direct-route authorization", async ({ browser }) => {
  test.setTimeout(180_000);
  const screenshotDir = process.env.BUTTERBOX_UXFIX_005_SCREENSHOTS;
  await withPayrollDirectoryFixtures(async ({ email, password, businessId, outsideBusiness, venueId, outsideVenue }) => {
    const expectations = {
      owner: [
        ["My Work", ["Dashboard", "My schedule", "Clock in / out", "My availability", "Notifications"]],
        ["Team Management", ["Rostering", "People", "Announcements", "Timesheet review", "Work time", "Exceptions"]],
        ["Venue Management", ["Clock kiosks", "Departments & roles", "Venue settings"]],
        ["Business", ["Payroll", "Hours & labour", "Permissions", "Audit history"]],
      ],
      admin: [
        ["My Work", ["Dashboard", "My schedule", "Clock in / out", "My availability", "Notifications"]],
        ["Team Management", ["Rostering", "People", "Announcements", "Timesheet review", "Work time", "Exceptions"]],
        ["Venue Management", ["Departments & roles"]],
        ["Business", ["Payroll"]],
      ],
      foh: [
        ["My Work", ["Dashboard", "My schedule", "Clock in / out", "My availability", "Notifications"]],
        ["Team Management", ["Rostering", "People", "Announcements", "Timesheet review", "Work time", "Exceptions"]],
        ["Venue Management", ["Departments & roles"]],
      ],
      employee: [
        ["My Work", ["Dashboard", "My schedule", "Clock in / out", "My availability", "Notifications"]],
        ["Team Management", ["Rostering", "Announcements"]],
      ],
    };
    const contexts = [];
    try {
      for (const [role, groups] of Object.entries(expectations)) {
        const context = await browser.newContext({
          baseURL: appUrl, viewport: { width: role === "foh" || role === "employee" ? 375 : 1440, height: 900 },
        });
        contexts.push(context);
        const rolePage = await context.newPage();
        await signIn(rolePage, email(role), password);
        await rolePage.goto(`/?business=${businessId}&venue=${venueId}`);
        await openMainNavigation(rolePage);
        const nav = rolePage.getByRole("navigation", { name: "Main navigation" });
        await expect(nav.getByRole("group")).toHaveCount(groups.length);
        for (const [index, [name, items]] of groups.entries()) {
          const group = nav.getByRole("group").nth(index);
          await expect(group).toHaveAccessibleName(name);
          await expect(group.getByRole("link")).toHaveText(items);
        }
        await expect(nav.getByRole("link", { name: "Help", exact: true })).toHaveCount(1);
        if (screenshotDir && (role === "foh" || role === "employee")) {
          await rolePage.screenshot({ path: `${screenshotDir}/after-${role}-375.png`, fullPage: true });
        }
        if (role === "employee") {
          for (const path of ["/settings/payroll", "/settings/permissions", "/settings/departments", "/reports/exceptions"]) {
            await rolePage.goto(`${path}?business=${businessId}&venue=${venueId}`);
            await expect(rolePage).toHaveURL(/error=permission/);
          }
          await rolePage.goto(`/attendance/kiosks?business=${businessId}&venue=${venueId}`);
          await expect(rolePage.getByRole("main").getByRole("alert")).toContainText("Only a business owner");
        }
        if (role === "admin") {
          await rolePage.goto(`/attendance/kiosks?business=${businessId}&venue=${venueId}`);
          await expect(rolePage.getByRole("main").getByRole("alert")).toContainText("Only a business owner");
          await rolePage.goto(`/settings/permissions?business=${businessId}`);
          await expect(rolePage).toHaveURL(/error=permission/);
        }
        if (role === "foh") {
          await rolePage.goto(`/settings/departments?business=${outsideBusiness}&venue=${outsideVenue}`);
          await expect(rolePage).toHaveURL(/error=workspace/);
          await expect(rolePage.getByText("Outside payroll UX cafe")).toHaveCount(0);
          await rolePage.goto(`/settings/payroll?business=${businessId}&venue=${venueId}`);
          await expect(rolePage).toHaveURL(/error=permission/);
        }
      }
    } finally {
      for (const context of contexts) await context.close();
    }
  });
});

test("navigation UX: every owner destination, context and browser history", async ({ page }) => {
  test.setTimeout(180_000);
  await withPayrollDirectoryFixtures(async ({ email, password, businessId, secondVenue }) => {
    await signIn(page, email("owner"), password);
    await page.goto(`/roster?business=${businessId}&venue=${secondVenue}`);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const destinations = [
      ["Dashboard", "/"], ["My schedule", "/my-schedule"], ["Clock in / out", "/attendance"],
      ["My availability", "/availability"], ["Notifications", "/notifications"], ["Rostering", "/roster"],
      ["People", "/people"], ["Announcements", "/announcements"], ["Timesheet review", "/timesheets"],
      ["Work time", "/work-time"], ["Exceptions", "/reports/exceptions"], ["Clock kiosks", "/attendance/kiosks"],
      ["Departments & roles", "/settings/departments"], ["Venue settings", "/settings/organisation"],
      ["Payroll", "/settings/payroll"], ["Hours & labour", "/reports/hours"],
      ["Permissions", "/settings/permissions"], ["Audit history", "/settings/audit"], ["Help", "/help"],
    ];
    const businessWide = new Set(["Hours & labour", "Permissions", "Audit history", "Help"]);
    let contextualHelpLinks = 0;
    for (const [label, pathname] of destinations) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === pathname &&
        url.searchParams.get(businessWide.has(label) ? "contextVenue" : "venue") === secondVenue);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.locator("aside").first().getByText("Second venue", { exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
      for (const link of await page.locator('main a[href^="/help?"]').all()) {
        const href = await link.getAttribute("href");
        expect(new URL(href, appUrl).searchParams.get("contextVenue"), `${label} contextual help`).toBe(secondVenue);
        contextualHelpLinks++;
      }
    }
    expect(contextualHelpLinks).toBeGreaterThanOrEqual(10);
    await page.goto(`/attendance/kiosks?business=${businessId}&venue=${secondVenue}`);
    await expect(nav.getByRole("link", { name: "Clock kiosks" })).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await nav.getByRole("link", { name: "Clock in / out" }).click();
    await expect(nav.getByRole("link", { name: "Clock in / out" })).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(nav.getByRole("link", { name: "Clock kiosks" })).toHaveAttribute("aria-current", "page");
    await page.goForward();
    await expect(nav.getByRole("link", { name: "Clock in / out" })).toHaveAttribute("aria-current", "page");
  });
});

test("navigation UX: business-wide views retain venue context without narrowing results", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  await withPayrollDirectoryFixtures(async ({ email, password, businessId, secondVenue, users }) => {
    await signIn(page, email("owner"), password);
    await page.goto(`/roster?business=${businessId}&venue=${secondVenue}`);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const venueLabel = () => page.locator("aside").first().getByText("Second venue", { exact: true });
    await nav.getByRole("link", { name: "Hours & labour" }).click();
    const hours = page.getByRole("form", { name: "Report filters" });
    await expect(hours.locator('select[name="venue"]')).toHaveValue("");
    await hours.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("contextVenue") === secondVenue);
    await expect(venueLabel()).toBeVisible();
    await nav.getByRole("link", { name: "Permissions", exact: true }).click();
    const backToDashboard = await page.getByRole("link", { name: "Back to dashboard" }).getAttribute("href");
    expect(new URL(backToDashboard, appUrl).searchParams.get("venue")).toBe(secondVenue);
    const filters = page.getByRole("form", { name: "Member directory filters" });
    await expect(filters.locator('select[name="venue"]')).toHaveValue("all");
    await filters.getByRole("searchbox", { name: "Search members" }).fill(email("foh"));
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("contextVenue") === secondVenue);
    await page.getByRole("row").filter({ hasText: email("foh") }).getByRole("link", { name: /^View access for / }).click();
    await expect(venueLabel()).toBeVisible();
    await page.getByRole("button", { name: "Edit permissions" }).click();
    await page.getByLabel("Business role").selectOption("general_manager");
    await page.getByRole("button", { name: "Review change" }).click();
    await page.getByLabel("I confirm this change to the member's business access.").check();
    await page.getByRole("button", { name: "Confirm and save permissions" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText("Permissions updated");
    await expect(page).toHaveURL((url) => url.searchParams.get("contextVenue") === secondVenue);
    await expect(venueLabel()).toBeVisible();
    const membership = await admin.from("business_memberships").select("role")
      .eq("business_id", businessId).eq("user_id", users[3]).single();
    expect(membership.error).toBeNull();
    expect(membership.data.role).toBe("general_manager");
    await page.getByRole("link", { name: "Help with permissions" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("contextVenue") === secondVenue);
    await expect(venueLabel()).toBeVisible();
    await page.goBack();
    await page.getByRole("link", { name: "sensitive action audit" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("contextVenue") === secondVenue &&
      url.searchParams.get("source") === "business_memberships");
    await page.getByRole("button", { name: "Apply audit filters" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("contextVenue") === secondVenue);
    await expect(venueLabel()).toBeVisible();
    await nav.getByRole("link", { name: "Help", exact: true }).click();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("contextVenue") === secondVenue);
    await expect(venueLabel()).toBeVisible();
    for (const [topic, title] of [
      ["attendance", "Clocking and corrections"], ["alerts", "Attendance alerts"],
      ["kiosk", "Setting up a QR kiosk"], ["employee", "Employee self-service"],
    ]) {
      await page.goto(`/help?business=${businessId}&contextVenue=${secondVenue}&topic=${topic}`);
      await expect(page.getByRole("article", { name: title })).toContainText("Clock in / out");
      await expect(venueLabel()).toBeVisible();
    }
  });
});

for (const width of [375, 390, 768, 1024, 1440]) {
  test(`navigation UX: responsive keyboard and accessibility at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    const screenshotDir = process.env.BUTTERBOX_UXFIX_005_SCREENSHOTS;
    await withPayrollDirectoryFixtures(async ({ email, password, businessId, venueId }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await signIn(page, email("owner"), password);
      await page.goto(`/?business=${businessId}&venue=${venueId}`);
      await openMainNavigation(page);
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      const menu = nav.getByRole("button", { name: "Menu", exact: true });
      await expect(nav.getByRole("group")).toHaveCount(4);
      await expect(nav.getByRole("link")).toHaveCount(19);
      const sizes = await nav.locator("a").evaluateAll((anchors) =>
        anchors.map((anchor) => ({ label: anchor.textContent.trim(), height: anchor.getBoundingClientRect().height })));
      for (const size of sizes) expect(size.height, `${width}px ${size.label} target height`).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width < 768) {
        await menu.focus();
        await page.keyboard.press("Tab");
        await expect(nav.getByRole("link", { name: "Dashboard", exact: true })).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(menu).toBeFocused();
        await nav.getByRole("link", { name: "Help", exact: true }).focus();
        await expect(nav.getByRole("link", { name: "Help", exact: true })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(menu).toHaveAttribute("aria-expanded", "false");
        await expect(menu).toBeFocused();
        await openMainNavigation(page);
      } else {
        await expect(menu).toBeHidden();
        await nav.getByRole("link", { name: "Dashboard", exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(nav.getByRole("link", { name: "My schedule", exact: true })).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(nav.getByRole("link", { name: "Dashboard", exact: true })).toBeFocused();
      }
      expect(await accessibilityFindings(page, `navigation ${width}px`)).toEqual([]);
      if (screenshotDir) {
        await nav.getByRole("link", { name: "Dashboard", exact: true }).focus();
        await page.screenshot({ path: `${screenshotDir}/after-owner-${width}-top.png`, fullPage: true });
        await nav.getByRole("link", { name: "Help", exact: true }).focus();
        await page.screenshot({ path: `${screenshotDir}/after-owner-${width}-bottom.png`, fullPage: true });
      }
    });
  });
}

test("payroll UX: destination switching, empty states and return filters", async ({ page }) => {
  await withPayrollDirectoryFixtures(async ({ email, password, businessId, venueId, emptyVenue,
    firstEmployee, connectionId, otherConnection }) => {
    await signIn(page, email("owner"), password);
    await page.goto(`/settings/payroll?business=${businessId}&venue=${venueId}&connection=${connectionId}`);
    await expect(page.getByText("Xero and other adapters remain unavailable", { exact: false })).toBeVisible();
    await expect(page.getByText("Mapped: 1 · Missing: 1")).toBeVisible();
    const filters = page.getByRole("form", { name: "Payroll mapping filters" });
    await filters.getByRole("searchbox", { name: "Search employees" }).fill("Alex");
    await filters.getByRole("combobox", { name: "Mapping status" }).selectOption("mapped");
    await filters.getByRole("combobox", { name: "Sort by" }).selectOption("payroll-id");
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("link", { name: `View mapping for Alex Taylor (${firstEmployee})` })).toBeVisible();
    const destinations = page.getByRole("region", { name: "Payroll destinations" });
    await destinations.getByRole("combobox", { name: "Payroll destination" }).selectOption(otherConnection);
    await destinations.getByRole("button", { name: "Show mappings" }).click();
    await expect(page.getByRole("heading", { name: "Backup payroll" })).toBeVisible();
    await expect(filters.getByRole("searchbox", { name: "Search employees" })).toHaveValue("Alex");
    await expect(filters.getByRole("combobox", { name: "Mapping status" })).toHaveValue("mapped");
    await expect(filters.getByRole("combobox", { name: "Sort by" })).toHaveValue("payroll-id");
    await expect(page.getByText("No employees match these filters. Try resetting them.")).toBeVisible();
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("connection")).toBe(connectionId);
    await expect(destinations.getByRole("combobox", { name: "Payroll destination" })).toHaveValue(connectionId);
    await expect(page.getByText("Harbour-001", { exact: true })).toBeVisible();
    await page.goForward();
    await expect(destinations.getByRole("combobox", { name: "Payroll destination" })).toHaveValue(otherConnection);
    await page.getByRole("link", { name: "Add mapping destination" }).click();
    await expect(page.getByText("it does not authorise access, connect a provider or send payroll", { exact: false })).toBeVisible();
    await page.getByRole("link", { name: "Back to mappings" }).click();
    await expect(filters.getByRole("searchbox", { name: "Search employees" })).toHaveValue("Alex");
    await page.goto(`/settings/payroll?business=${businessId}&venue=${emptyVenue}&connection=${connectionId}`);
    await expect(page.getByText("No employee profiles in this venue.")).toBeVisible();
    await expect(page.getByText("No employees match these filters. Try resetting them.")).toHaveCount(0);
  });
});

test("payroll UX: admin access, forged scopes and unauthorized roles", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await withPayrollDirectoryFixtures(async ({ email, password, users, businessId, venueId, secondVenue, firstEmployee, secondEmployee,
    otherVenueEmployee, outsideEmployee, connectionId, outsideConnection, owner }) => {
    await signIn(page, email("admin"), password);
    const directory = `/settings/payroll?business=${businessId}&venue=${venueId}&connection=${connectionId}`;
    await page.goto(directory);
    await expect(page.getByText("Harbour-001", { exact: true })).toBeVisible();
    await expect(page.getByText("OTHER-VENUE-PRIVATE", { exact: true })).toHaveCount(0);
    await expect(page.getByText("OUTSIDE-PRIVATE", { exact: true })).toHaveCount(0);
    for (const search of ["OTHER-VENUE-PRIVATE", "OUTSIDE-PRIVATE"]) {
      await page.goto(`${directory}&q=${search}`);
      await expect(page.getByText("No employees match these filters. Try resetting them.")).toBeVisible();
      await expect(page.getByText("Other venue worker", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Outside worker", { exact: true })).toHaveCount(0);
    }
    for (const id of [otherVenueEmployee, outsideEmployee]) {
      const response = await page.goto(`/settings/payroll/${id}?business=${businessId}&venue=${venueId}&connection=${connectionId}`);
      expect([200, 404]).toContain(response.status());
      await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
      await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toHaveAttribute("content", "noindex");
      await expect(page.getByText("OTHER-VENUE-PRIVATE", { exact: true })).toHaveCount(0);
      await expect(page.getByText("OUTSIDE-PRIVATE", { exact: true })).toHaveCount(0);
    }
    await page.goto(`/settings/payroll?business=${businessId}&venue=${venueId}&connection=${outsideConnection}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("selected payroll destination is unavailable");
    await expect(page.getByText("outside-private-account", { exact: false })).toHaveCount(0);
    await page.goto(`/settings/payroll/${firstEmployee}?business=${businessId}&venue=${venueId}&connection=${connectionId}`);
    await page.getByRole("button", { name: "Edit mapping" }).click();
    await page.getByLabel("Payroll employee ID", { exact: true }).fill("Forged-ID");
    await page.getByLabel("Reason for mapping change").fill("Forged other venue");
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    await page.locator('input[name="employee_id"]').evaluate((input, value) => { input.value = value; }, otherVenueEmployee);
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
    const unchanged = await owner.rpc("list_payroll_employee_mappings", {
      p_business_id: businessId, p_connection_id: connectionId, p_venue_id: secondVenue,
    });
    expect(unchanged.error).toBeNull();
    expect(unchanged.data.find((row) => row.employee_id === otherVenueEmployee)).toMatchObject({
      external_employee_id: "OTHER-VENUE-PRIVATE", revision: 1,
    });
    await page.goto(`/settings/payroll/${firstEmployee}?business=${businessId}&venue=${venueId}&connection=${connectionId}`);
    await page.getByRole("button", { name: "Edit mapping" }).click();
    await page.getByLabel("Payroll employee ID", { exact: true }).fill("Forged-connection");
    await page.getByLabel("Reason for mapping change").fill("Forged outside destination");
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    await page.locator('input[name="connection_id"]').evaluate((input, value) => { input.value = value; }, outsideConnection);
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
    await page.goto(`/settings/payroll/${secondEmployee}?business=${businessId}&venue=${venueId}&connection=${connectionId}`);
    await page.getByRole("button", { name: "Edit mapping" }).click();
    await page.getByLabel("Payroll employee ID", { exact: true }).fill("Admin-002");
    await page.getByLabel("Reason for mapping change").fill("Admin verified employee");
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText("mapping saved");
    await page.reload();
    await expect(page.getByText("Admin-002", { exact: true })).toBeVisible();
    const audit = await owner.from("sensitive_action_audit").select("actor_id, new_values")
      .eq("business_id", businessId).eq("source_table", "payroll_employee_mapping_events");
    expect(audit.error).toBeNull();
    expect(audit.data.some((row) => row.actor_id === users[1] && row.new_values.employee_id === secondEmployee &&
      row.new_values.external_employee_id === "Admin-002")).toBe(true);
    for (const role of ["gm", "foh", "employee", "outside"]) {
      const context = await browser.newContext({ baseURL: appUrl });
      try {
        const restricted = await context.newPage();
        await signIn(restricted, email(role), password);
        await restricted.goto(directory);
        if (role === "outside") {
          await expect(restricted.getByRole("heading", { name: "Payroll mappings unavailable" })).toBeVisible();
        } else {
          await expect(restricted).toHaveURL(/error=permission/);
        }
        await expect(restricted.getByText("Harbour-001", { exact: true })).toHaveCount(0);
        await restricted.goto(`/settings/payroll/${firstEmployee}?business=${businessId}&venue=${venueId}&connection=${connectionId}`);
        if (role === "outside") {
          await expect(restricted.getByRole("heading", { name: "Payroll mappings unavailable" })).toBeVisible();
        } else {
          await expect(restricted).toHaveURL(/error=permission/);
        }
        await expect(restricted.getByText("harbour-account", { exact: false })).toHaveCount(0);
      } finally {
        await context.close();
      }
    }
    await page.goto(`/settings/payroll/${firstEmployee}?business=${businessId}&venue=${venueId}&connection=${connectionId}`);
    await page.getByRole("button", { name: "Edit mapping" }).click();
    await page.getByLabel("Payroll employee ID", { exact: true }).fill("Unauthorized-change");
    await page.getByLabel("Reason for mapping change").fill("Role changed before submission");
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    const replacementContext = await browser.newContext({ baseURL: appUrl });
    try {
      const sessionPage = await replacementContext.newPage();
      await signIn(sessionPage, email("foh"), password);
      await expect(sessionPage.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();
      const authCookies = (await replacementContext.cookies(appUrl))
        .filter((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name));
      expect(authCookies.length).toBeGreaterThan(0);
      // Shared-tab sign-out correctly removes the editor; swap only auth cookies to exercise a stale form.
      for (const cookie of (await page.context().cookies(appUrl))
        .filter((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))) {
        await page.context().clearCookies({ name: cookie.name });
      }
      await page.context().addCookies(authCookies);
      await expect(page.getByRole("button", { name: "Save payroll ID" })).toBeVisible();
      await Promise.all([
        page.waitForResponse((response) => response.request().method() === "POST" &&
          new URL(response.url()).pathname === `/settings/payroll/${firstEmployee}`),
        page.getByRole("button", { name: "Save payroll ID" }).click(),
      ]);
      await expect(page).toHaveURL(/error=permission/);
      await expect(page.getByText("Harbour-001", { exact: true })).toHaveCount(0);
    } finally {
      await replacementContext.close();
    }
    const after = await owner.rpc("list_payroll_employee_mappings", {
      p_business_id: businessId, p_connection_id: connectionId, p_venue_id: venueId,
    });
    expect(after.error).toBeNull();
    expect(after.data.find((row) => row.employee_id === firstEmployee)).toMatchObject({
      external_employee_id: "Harbour-001", revision: 1,
    });
  });
});

test("payroll UX: stale and malformed updates fail and recover", async ({ page }) => {
  await withPayrollDirectoryFixtures(async ({ email, password, businessId, venueId, firstEmployee, connectionId, owner }) => {
    await signIn(page, email("owner"), password);
    const detail = `/settings/payroll/${firstEmployee}?business=${businessId}&venue=${venueId}&connection=${connectionId}`;
    await page.goto(detail);
    await page.getByRole("button", { name: "Edit mapping" }).click();
    await page.getByLabel("Payroll employee ID", { exact: true }).fill("Stale-draft");
    await page.getByLabel("Reason for mapping change").fill("Attempt stale edit");
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    expect((await owner.rpc("set_payroll_employee_mapping_scoped", {
      p_business_id: businessId, p_venue_id: venueId, p_connection_id: connectionId, p_employee_id: firstEmployee,
      p_expected_revision: 1, p_external_employee_id: "Concurrent-002", p_reason: "Concurrent edit",
      p_request_id: randomUUID(), p_destination_confirmed: true, p_removal_confirmed: false,
    })).error).toBeNull();
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("mapping changed");
    await expect(page.getByText("Concurrent-002", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit mapping" }).click();
    await page.getByLabel("Payroll employee ID", { exact: true }).fill("Malformed-draft");
    await page.getByLabel("Reason for mapping change").fill("Invalid revision");
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    await page.locator('input[name="revision"]').evaluate((input) => { input.value = "not-a-revision"; });
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Choose valid IDs and enter a reason");
    await expect(page.getByText("Concurrent-002", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit mapping" }).click();
    await page.getByLabel("Payroll employee ID", { exact: true }).fill("Recovered-003");
    await page.getByLabel("Reason for mapping change").fill("After reviewing current value");
    await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText("mapping saved");
    await page.reload();
    await expect(page.getByText("Recovered-003", { exact: true })).toBeVisible();
  });
});

test("payroll UX: stable filtered pagination returns to the selected page", async ({ page }) => {
  await withPayrollDirectoryFixtures(async ({ email, password, businessId, venueId, connectionId }) => {
    const department = await admin.from("departments").select("id")
      .eq("business_id", businessId).eq("venue_id", venueId).single();
    expect(department.error).toBeNull();
    const workers = Array.from({ length: 26 }, (_, index) => ({
      id: randomUUID(), business_id: businessId, venue_id: venueId, department_id: department.data.id,
      name: `Directory Worker ${String(index).padStart(2, "0")}`, role_title: "Server",
    }));
    expect((await admin.from("employees").insert(workers)).error).toBeNull();
    await signIn(page, email("owner"), password);
    await page.goto(`/settings/payroll?business=${businessId}&venue=${venueId}&connection=${connectionId}`);
    const filters = page.getByRole("form", { name: "Payroll mapping filters" });
    await filters.getByRole("searchbox", { name: "Search employees" }).fill("Directory Worker");
    await filters.getByRole("combobox", { name: "Mapping status" }).selectOption("missing");
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByText("26 employees of 28", { exact: true })).toBeVisible();
    await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Payroll mapping pages" }).getByRole("link", { name: "Next" }).click();
    await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: `View mapping for Directory Worker 25 (${workers[25].id})` }).click();
    await expect(page.getByRole("heading", { name: "Employee payroll mapping" })).toBeVisible();
    await page.getByRole("link", { name: "Back to mappings" }).click();
    await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
    await expect(filters.getByRole("searchbox", { name: "Search employees" })).toHaveValue("Directory Worker");
    await expect(filters.getByRole("combobox", { name: "Mapping status" })).toHaveValue("missing");
  });
});

test("payroll UX: loading and failed saves are announced and recoverable", async ({ page }) => {
  await withPayrollDirectoryFixtures(async ({ email, password, businessId, venueId, firstEmployee, connectionId, owner }) => {
    await signIn(page, email("owner"), password);
    let releaseNavigation;
    const navigationHeld = new Promise((resolve) => { releaseNavigation = resolve; });
    await page.route("**/settings/payroll**", async (route) => {
      const headers = route.request().headers();
      if (headers.rsc === "1" && !headers["next-router-prefetch"]) await navigationHeld;
      await route.continue();
    });
    try {
      await page.goto(`/timesheets?business=${businessId}&venue=${venueId}`);
      await page.getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Payroll", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Loading…" })).toBeVisible();
      releaseNavigation();
      await expect(page.getByRole("heading", { name: "Payroll employee mapping" })).toBeVisible();
    } finally {
      releaseNavigation();
      await page.unrouteAll({ behavior: "wait" });
    }
    await page.goto(`/settings/payroll/${firstEmployee}?business=${businessId}&venue=${venueId}&connection=${connectionId}`);
    async function prepareChange() {
      await page.getByRole("button", { name: "Edit mapping" }).click();
      await page.getByLabel("Payroll employee ID", { exact: true }).fill("Retry-002");
      await page.getByLabel("Reason for mapping change").fill("After temporary outage");
      await page.getByLabel("I confirmed the destination and account shown above for this employee.").check();
    }
    await prepareChange();
    let releaseSave;
    const saveHeld = new Promise((resolve) => { releaseSave = resolve; });
    await page.route("**/settings/payroll/**", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        await saveHeld;
        await route.fulfill({ status: 500, contentType: "text/plain", body: "Simulated outage" });
      } else {
        await route.continue();
      }
    });
    try {
      await page.getByRole("button", { name: "Save payroll ID" }).click();
      await expect(page.getByRole("button", { name: "Saving..." })).toBeDisabled();
    } finally {
      releaseSave();
    }
    await expect(page.getByRole("heading", { name: "Payroll mappings unavailable" })).toBeFocused();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("check the current mapping before trying again");
    const unchanged = await owner.rpc("list_payroll_employee_mappings", {
      p_business_id: businessId, p_connection_id: connectionId, p_venue_id: venueId,
    });
    expect(unchanged.error).toBeNull();
    expect(unchanged.data.find((row) => row.employee_id === firstEmployee)).toMatchObject({
      external_employee_id: "Harbour-001", revision: 1,
    });
    await page.unroute("**/settings/payroll/**");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Harbour-001", { exact: true })).toBeVisible();
    await prepareChange();
    await page.getByRole("button", { name: "Save payroll ID" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText("mapping saved");
    await page.reload();
    await expect(page.getByText("Retry-002", { exact: true })).toBeVisible();
  });
});

for (const width of [375, 390, 768, 1024, 1440]) {
  test(`payroll UX: responsive keyboard and accessibility at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await withPayrollDirectoryFixtures(async ({ email, password, businessId, venueId, firstEmployee, connectionId }) => {
      await signIn(page, email("owner"), password);
      const screenshots = process.env.BUTTERBOX_UXFIX_004_SCREENSHOTS;
      const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
      async function checkLayout(label) {
        const layout = await page.evaluate(() => ({
          width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(layout.scrollWidth, `${label}: horizontal page overflow`).toBeLessThanOrEqual(layout.width);
        const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
        const violations = results.violations
          .map((item) => `${item.impact} ${item.id}: ${item.nodes.map((node) => node.target.join(" ")).join(", ")}`);
        expect(violations, `${label}: accessibility violations`).toEqual([]);
      }
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/settings/payroll?business=${businessId}&venue=${venueId}&connection=${connectionId}`);
      await expect(page.getByRole("heading", { name: "Payroll employee mapping" })).toBeVisible();
      await checkLayout(`${width} directory`);
      const destinationFits = await page.getByRole("combobox", { name: "Payroll destination" }).evaluate((select) => {
        const style = getComputedStyle(select);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not measure the selected destination label.");
        context.font = style.font;
        const label = select.selectedOptions[0].textContent;
        return context.measureText(label).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 24
          <= select.clientWidth;
      });
      expect(destinationFits, `${width}: selected destination label is clipped`).toBe(true);
      const directory = page.getByRole("region", { name: "Employee payroll IDs" });
      if (width < 1024) await expect(directory.getByRole("list")).toBeVisible();
      else await expect(directory.getByRole("table")).toBeVisible();
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-directory-${width}.png`, fullPage: true });
      const link = page.getByRole("link", { name: `View mapping for Alex Taylor (${firstEmployee})` });
      await link.focus();
      await expect(link).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(link).not.toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(link).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Employee payroll mapping" })).toBeVisible();
      await checkLayout(`${width} detail`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-detail-${width}.png`, fullPage: true });
      const edit = page.getByRole("button", { name: "Edit mapping" });
      await edit.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Edit mapping", exact: true })).toBeFocused();
      await checkLayout(`${width} edit`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-edit-${width}.png`, fullPage: true });
      await page.getByLabel("Payroll employee ID", { exact: true }).fill("");
      await checkLayout(`${width} removal`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-removal-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Discard changes" }).click();
      await expect(edit).toBeFocused();
      await page.getByRole("link", { name: "Back to mappings" }).click();
      await page.getByRole("link", { name: "Add mapping destination" }).click();
      await expect(page.getByRole("heading", { name: "Add mapping destination" })).toBeVisible();
      await checkLayout(`${width} add destination`);
      if (screenshots) await page.screenshot({ path: `${screenshots}/after-add-${width}.png`, fullPage: true });
    });
  });
}

test("generic payroll CSV downloads approved hours and reconciles amended exports", async ({ page, browser }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, fohId, workerId, firstSession, secondSession, thirdSession,
    firstIn, firstOut, secondIn, secondOut, thirdIn, thirdOut] = Array.from({ length: 14 }, () => randomUUID());
  const users = [];
  const contexts = [];
  const employeeName = "=SUM(1,2)";
  const scope = { p_business_id: businessId, p_venue_id: venueId, p_week_start: "2024-09-30" };
  try {
    for (const role of ["owner", "gm", "foh", "worker", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `payroll-csv-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      expect(result.error).toBeNull();
      users.push(result.data.user.id);
    }
    expect((await admin.from("businesses").insert([
      { id: businessId, name: `CSV cafe ${suffix}` },
      { id: outsideBusiness, name: `Outside CSV cafe ${suffix}` },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error).toBeNull();
    expect((await admin.from("departments").insert({
      id: fohId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error).toBeNull();
    expect((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "general_manager", venue_id: venueId },
      { business_id: businessId, user_id: users[2], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusiness, user_id: users[4], role: "owner" },
    ])).error).toBeNull();
    expect((await admin.from("employees").insert({
      id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users[3], name: employeeName, role_title: "Server",
    })).error).toBeNull();
    const addSessions = async (rows) => {
      expect((await admin.from("attendance_sessions").insert(rows.map(([id]) => ({
        id, business_id: businessId, venue_id: venueId, department_id: fohId, employee_id: workerId,
        started_by: users[3],
      })))).error).toBeNull();
      expect((await admin.from("attendance_events").insert(rows.flatMap(([session, startId, endId, start, end]) =>
        [[startId, "clock_in", start], [endId, "clock_out", end]].map(([id, eventType, occurredAt]) => ({
          id, session_id: session, business_id: businessId, venue_id: venueId, department_id: fohId,
          employee_id: workerId, actor_id: users[3], request_id: randomUUID(), event_type: eventType,
          occurred_at: occurredAt, source: "server_clock",
        }))))).error).toBeNull();
    };
    await addSessions([
      [firstSession, firstIn, firstOut, "2024-09-30T22:00:00Z", "2024-10-01T02:00:00Z"],
      [secondSession, secondIn, secondOut, "2024-10-02T22:00:00Z", "2024-10-03T02:00:00Z"],
    ]);
    const signedIn = async (role) => {
      const client = createClient(apiUrl, anonKey, options);
      expect((await client.auth.signInWithPassword({
        email: `payroll-csv-${role}-${suffix}@example.test`, password,
      })).error).toBeNull();
      return client;
    };
    const ownerApi = await signedIn("owner");
    const fohApi = await signedIn("foh");
    const workerApi = await signedIn("worker");
    const approve = async (sessionIds) => {
      const rows = await fohApi.rpc("list_weekly_worked_time_for_edit", scope);
      expect(rows.error).toBeNull();
      for (const sessionId of sessionIds) {
        const row = rows.data.find((item) => item.session_id === sessionId);
        expect(row).toBeDefined();
        expect((await fohApi.rpc("decide_attendance_timesheet", {
          p_business_id: businessId, p_venue_id: venueId, p_session_id: sessionId, p_request_id: randomUUID(),
          p_expected_revision: row.edit_revision, p_decision: "approved", p_reason: null,
        })).error).toBeNull();
      }
    };
    await approve([firstSession, secondSession]);
    expect((await ownerApi.rpc("finalise_payroll_period", { ...scope, p_request_id: randomUUID() })).error).toBeNull();

    await signIn(page, `payroll-csv-owner-${suffix}@example.test`, password);
    const timesheetUrl = `/timesheets?venue=${venueId}&week=2024-09-30`;
    await page.goto(timesheetUrl);
    const period = page.getByRole("region", { name: "Payroll period" });
    const exportSection = period.getByRole("region", { name: "Generic payroll CSV" });
    await expect(exportSection).toContainText("2 new approved sessions available");
    await expect(exportSection).toContainText("Re-downloading and importing the same batch again may pay people twice");
    await exportSection.getByRole("button", { name: "Prepare payroll CSV" }).click();
    await expect(exportSection.getByRole("status")).toContainText("Batch");
    let history = await ownerApi.rpc("list_generic_payroll_export_history", scope);
    expect(history.error).toBeNull();
    const firstBatch = history.data.find((event) => event.kind === "batch");
    expect(firstBatch.entry_count).toBe(2);
    const firstHistorySummary = exportSection.getByText("Payroll export history (1)");
    if (!(await firstHistorySummary.evaluate((summary) => summary.parentElement.open))) {
      await firstHistorySummary.click();
    }
    const downloadLink = exportSection.getByRole("link", { name: "Download payroll CSV" });
    const downloadUrl = await downloadLink.getAttribute("href");
    const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
    expect(download.suggestedFilename()).toBe(`butterbox-hours-2024-09-30-${firstBatch.id}.csv`);
    const csv = await readFile(await download.path(), "utf8");
    expect(csv.startsWith('\uFEFF"batch_id","finalisation_id"')).toBe(true);
    expect(csv).toContain(`"'${employeeName}"`);
    expect(csv).toContain(firstSession);
    expect(csv).toContain(secondSession);
    expect(csv).not.toContain(thirdSession);
    const ownerDownload = await page.request.get(downloadUrl);
    expect(ownerDownload.status()).toBe(200);
    expect(ownerDownload.headers()["cache-control"]).toContain("no-store");
    expect(ownerDownload.headers()["x-content-type-options"]).toBe("nosniff");

    for (const [role, expectedStatus] of [["gm", 200], ["foh", 404], ["worker", 404], ["outside", 404]]) {
      const context = await browser.newContext({ baseURL: appUrl });
      contexts.push(context);
      const rolePage = await context.newPage();
      await signIn(rolePage, `payroll-csv-${role}-${suffix}@example.test`, password);
      expect((await rolePage.request.get(downloadUrl)).status(), role).toBe(expectedStatus);
      if (role === "foh") {
        await rolePage.goto(timesheetUrl);
        await expect(rolePage.getByRole("region", { name: "Generic payroll CSV" })).toHaveCount(0);
      }
    }
    const anonymousContext = await browser.newContext({ baseURL: appUrl });
    contexts.push(anonymousContext);
    expect((await anonymousContext.request.get(downloadUrl)).status()).toBe(401);

    await period.getByLabel("Reason for reopening").fill("Correct an exported finish time");
    await period.getByRole("button", { name: "Reopen payroll period" }).click();
    await expect(period).toContainText("Reopened — not finalised");
    expect((await page.request.get(downloadUrl)).status()).toBe(409);
    const reopenedHistorySummary = exportSection.getByText("Payroll export history (1)");
    if (!(await reopenedHistorySummary.evaluate((summary) => summary.parentElement.open))) {
      await reopenedHistorySummary.click();
    }
    const oldEntries = exportSection.getByRole("list", { name: `Entries for batch ${firstBatch.id}` });
    await expect(oldEntries.getByRole("listitem")).toHaveCount(2);
    await expect(oldEntries).toContainText(firstSession);
    await expect(oldEntries).toContainText("paid 14400.000000 seconds");
    await expect(oldEntries).toContainText("finalisation version");
    await expect(exportSection.getByRole("link", { name: "Download payroll CSV" })).toHaveCount(0);
    expect((await ownerApi.rpc("set_attendance_edit_lock", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: firstSession, p_request_id: randomUUID(),
      p_locked: false, p_reason: "Worker confirmed a later finish",
    })).error).toBeNull();
    expect((await ownerApi.rpc("correct_attendance_event", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: firstSession, p_event_id: firstOut,
      p_request_id: randomUUID(), p_expected_at: "2024-10-01T02:00:00Z",
      p_new_at: "2024-10-01T03:00:00Z", p_reason: "Worker confirmed a later finish",
    })).error).toBeNull();
    await addSessions([[thirdSession, thirdIn, thirdOut, "2024-10-04T22:00:00Z", "2024-10-05T00:00:00Z"]]);
    await approve([firstSession, thirdSession]);
    expect((await ownerApi.rpc("finalise_payroll_period", { ...scope, p_request_id: randomUUID() })).error).toBeNull();

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(timesheetUrl);
    const changes = exportSection.getByRole("list", { name: "Payroll changes requiring reconciliation" });
    await expect(changes.getByRole("listitem")).toHaveCount(1);
    await expect(changes).toContainText("paid 14400.000000 seconds");
    await expect(changes).toContainText("paid 18000.000000 seconds");
    await expect(exportSection.getByRole("button", { name: "Prepare payroll CSV" })).toHaveCount(0);
    await expect(exportSection).toContainText("Butterbox does not create or send that adjustment");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);

    await exportSection.getByLabel("Reconciliation reason").fill("   ");
    await exportSection.getByLabel("Reconciliation reason").evaluate((input) => { input.required = false; });
    await exportSection.getByRole("checkbox", { name: /I reviewed all changes/ })
      .evaluate((input) => { input.required = false; });
    await exportSection.getByRole("button", { name: "Record manual reconciliation" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Enter a reason");
    await exportSection.getByLabel("Reconciliation reason").fill("Adjustment entered in external payroll");
    await exportSection.getByRole("checkbox", { name: /I reviewed all changes/ }).check();
    await exportSection.getByRole("button", { name: "Record manual reconciliation" }).click();
    await expect(exportSection.getByRole("status")).toContainText("manual reconciliation is recorded");
    await expect(exportSection).toContainText("1 new approved session available");
    await exportSection.getByRole("button", { name: "Prepare payroll CSV" }).click();
    await expect(exportSection.getByRole("status")).toContainText("1 approved session");
    history = await ownerApi.rpc("list_generic_payroll_export_history", scope);
    expect(history.error).toBeNull();
    expect(history.data.filter((event) => event.kind === "batch")).toHaveLength(2);
    const reconciliation = history.data.find((event) => event.kind === "reconciliation");
    expect(reconciliation.reason).toBe("Adjustment entered in external payroll");
    const finalHistorySummary = exportSection.getByText("Payroll export history (3)");
    if (!(await finalHistorySummary.evaluate((summary) => summary.parentElement.open))) {
      await finalHistorySummary.click();
    }
    const reconciledEntries = exportSection.getByRole("list", { name: `Entries for reconciliation ${reconciliation.id}` });
    await expect(reconciledEntries).toContainText("paid 14400.000000 seconds");
    await expect(reconciledEntries).toContainText("paid 18000.000000 seconds");
    const newDownload = exportSection.getByRole("link", { name: "Download payroll CSV" });
    await expect(newDownload).toHaveCount(1);
    const newUrl = await newDownload.getAttribute("href");
    const [secondDownload] = await Promise.all([page.waitForEvent("download"), newDownload.click()]);
    const newCsv = await readFile(await secondDownload.path(), "utf8");
    expect(newCsv).toContain(thirdSession);
    expect(newCsv).not.toContain(firstSession);
    expect(newCsv).not.toContain(secondSession);
    expect((await page.request.get(downloadUrl)).status()).toBe(409);

    const claim = await workerApi.rpc("submit_attendance_offline_claim", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId, p_employee_id: workerId,
      p_actor_id: users[3], p_request_id: randomUUID(), p_event_type: "clock_out",
      p_claimed_at: "2024-10-05T00:10:00Z",
    });
    expect(claim.error).toBeNull();
    expect((await page.request.get(newUrl)).status()).toBe(409);
    expect((await ownerApi.rpc("review_attendance_offline_claim", {
      p_business_id: businessId, p_venue_id: venueId, p_claim_id: claim.data[0].claim_id,
      p_request_id: randomUUID(), p_decision: "rejected", p_event_id: null, p_expected_at: null,
      p_reason: "Already included",
    })).error).toBeNull();
    expect((await page.request.get(newUrl)).status()).toBe(200);
  } finally {
    for (const context of contexts) await context.close();
    for (const business of [businessId, outsideBusiness]) {
      await assertBusinessFixturesPreserved(admin, business);
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});
