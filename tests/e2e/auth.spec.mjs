import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  combineChunks,
  createChunks,
  stringFromBase64URL,
  stringToBase64URL,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "../helpers/disposable-database.mjs";

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
          const shifts = await admin.from("shifts").delete().in("business_id", businesses);
          expect(shifts.error).toBeNull();
          const removed = await admin.from("businesses").delete().in("id", businesses);
          expect(removed.error).toBeNull();
        }
        const removed = await admin.auth.admin.deleteUser(user.id);
        expect(removed.error).toBeNull();
        expect(await findUser(email)).toBeUndefined();
        if (businesses.length > 0) {
          const remaining = await admin.from("businesses").select("id").in("id", businesses);
          expect(remaining.error).toBeNull();
          expect(remaining.data).toEqual([]);
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
    for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    const remaining = await admin.from("businesses").select("id").eq("id", businessId);
    expect(remaining.error).toBeNull();
    expect(remaining.data).toEqual([]);
  }
}

async function verifyLivePermissionChange(page, browser, initialRole, role) {
  await withPermissionFixtures(initialRole, async ({
    suffix, password, userIds, businessId, venueIds, departmentIds, scopes,
  }) => {
    await signIn(page, `owner-${suffix}@example.test`, password);
    await page.getByRole("link", { name: "Permissions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Business permissions" })).toBeVisible();
    const memberForm = page.getByRole("region", { name: `Permissions for member-${suffix}@example.test` });
    const targetContext = await browser.newContext({ baseURL: appUrl });
    try {
      const targetPage = await targetContext.newPage();
      await signIn(targetPage, `member-${suffix}@example.test`, password);
      const { venue_id: venueId, department_id: departmentId } = scopes[role];
      await memberForm.getByRole("combobox", { name: "Role", exact: true }).selectOption(role);
      await memberForm.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueId ?? "");
      await memberForm.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentId ?? "");
      await Promise.all([
        page.waitForResponse((response) => response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/settings/permissions"),
        memberForm.getByRole("button", { name: "Save permissions" }).click(),
      ]);
      await expect(page.getByRole("status")).toHaveText("Permissions updated.");
      const stored = await admin.from("business_memberships").select("role, venue_id, department_id")
        .eq("user_id", userIds[1]).eq("business_id", businessId).single();
      expect(stored.error).toBeNull();
      expect(stored.data).toEqual(scopes[role]);
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
        await expect(targetPage.getByRole("region", { name: `Employee ${expectedWorker}`, exact: true })).toBeVisible();
        for (const worker of ["FOH directory worker", "BOH directory worker", "Other venue worker"].filter((name) => name !== expectedWorker)) {
          await expect(targetPage.getByRole("region", { name: `Employee ${worker}`, exact: true })).toHaveCount(0);
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

test("employee profiles and filtered team directory", async ({ page }) => {
  await withPermissionFixtures("employee", async ({ suffix, password, businessId, venueIds, departmentIds }) => {
    await signIn(page, `owner-${suffix}@example.test`, password);
    await page.getByRole("link", { name: "People", exact: true }).click();
    const newEmployee = page.getByRole("region", { name: "New employee", exact: true });
    await newEmployee.getByRole("textbox", { name: "Name", exact: true }).fill("Profile worker");
    await newEmployee.getByRole("textbox", { name: "Preferred contact email", exact: true }).fill("profile@example.test");
    await newEmployee.getByRole("textbox", { name: "Job role", exact: true }).fill("Server");
    await newEmployee.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentIds[0]);
    await newEmployee.getByRole("button", { name: "Add employee", exact: true }).click();
    await expect(page.getByRole("region", { name: "Employee Profile worker", exact: true })).toBeVisible();
    const employee = await admin.from("employees").select("id")
      .eq("business_id", businessId).eq("name", "Profile worker").single();
    expect(employee.error).toBeNull();
    expect((await admin.from("shifts").insert({
      business_id: businessId, venue_id: venueIds[0], department_id: departmentIds[0],
      employee_id: employee.data.id, role_title: "Server",
      starts_at: "2031-06-02T09:00:00Z", ends_at: "2031-06-02T10:00:00Z",
    })).error).toBeNull();
    const profile = page.getByRole("region", { name: "Employee Profile worker", exact: true });
    await profile.getByRole("textbox", { name: "Name", exact: true }).fill("Archived worker");
    await profile.getByRole("textbox", { name: "Preferred contact email", exact: true }).fill("updated@example.test");
    await profile.getByRole("combobox", { name: "Employment type", exact: true }).selectOption("part_time");
    await profile.getByRole("combobox", { name: "Status", exact: true }).selectOption("false");
    await profile.getByRole("button", { name: "Save employee" }).click();
    await expect(page.getByRole("region", { name: "Employee Archived worker", exact: true })).toBeVisible();
    const savedEmployee = await admin.from("employees").select("name, email, employment_type, active")
      .eq("id", employee.data.id).single();
    expect(savedEmployee.error).toBeNull();
    expect(savedEmployee.data).toEqual({
      name: "Archived worker", email: "updated@example.test", employment_type: "part_time", active: false,
    });
    const history = await admin.from("shifts").select("id").eq("employee_id", employee.data.id);
    expect(history.error).toBeNull();
    expect(history.data).toHaveLength(1);
    const filters = page.getByRole("form", { name: "Directory filters" });
    await filters.getByRole("searchbox", { name: "Search team" }).fill("archived");
    await filters.getByRole("combobox", { name: "Role", exact: true }).selectOption("Server");
    await filters.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentIds[0]);
    await filters.getByRole("combobox", { name: "Status", exact: true }).selectOption("archived");
    await filters.getByRole("button", { name: "Filter team" }).click();
    await expect(page.getByRole("region", { name: /^Employee / })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Employee Archived worker", exact: true })).toBeVisible();
    await filters.getByRole("combobox", { name: "Status", exact: true }).selectOption("active");
    await Promise.all([
      page.waitForURL(/status=active/),
      filters.getByRole("button", { name: "Filter team" }).click(),
    ]);
    await expect(page.getByText("No employees match these filters.", { exact: true })).toBeVisible();
    await filters.getByRole("searchbox", { name: "Search team" }).fill("");
    await filters.getByRole("combobox", { name: "Role", exact: true }).selectOption("");
    await filters.getByRole("combobox", { name: "Department", exact: true }).selectOption("");
    await filters.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueIds[1]);
    await filters.getByRole("button", { name: "Filter team" }).click();
    await expect(page.getByRole("region", { name: "Employee Other venue worker", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Employee Archived worker", exact: true })).toHaveCount(0);
    await page.goto(`/roster?department=${departmentIds[0]}`);
    await expect(page.locator('select[name="employee_id"] option').filter({ hasText: "Archived worker" })).toHaveCount(0);
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
    await form.getByRole("button", { name: "Save venue location" }).click();
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
    await expect(managerPage.getByRole("heading", { name: "Departments and roles" })).toBeVisible();
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
      expect((await admin.from("businesses").delete().in("id", [businessId, outsideBusinessId])).error).toBeNull();
      for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
      const remaining = await admin.from("businesses").select("id").in("id", [businessId, outsideBusinessId]);
      expect(remaining.error).toBeNull();
      expect(remaining.data).toEqual([]);
    }
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
      expect((await admin.from("businesses").delete().in("id", [businessId, outsideBusinessId])).error).toBeNull();
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
      expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
        await page.getByRole("link", { name: "Departments", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Departments and roles" })).toBeVisible();
        const addDepartment = page.getByRole("region", { name: "Add department", exact: true });
        await addDepartment.getByRole("textbox", { name: "Department name" }).fill("Events");
        await addDepartment.getByRole("button", { name: "Add department" }).click();
        await expect(page.getByRole("status")).toHaveText("Department saved.");
        const events = page.getByRole("region", { name: "Department Events", exact: true });
        await expect(events).toBeVisible();
        const storedDepartment = await admin.from("departments").select("id, active")
          .eq("business_id", businessId).eq("name", "Events").single();
        expect(storedDepartment.error).toBeNull();
        expect(storedDepartment.data.active).toBe(true);
        const eventsId = storedDepartment.data.id;

        await addDepartment.getByRole("textbox", { name: "Department name" }).fill("events");
        await addDepartment.getByRole("button", { name: "Add department" }).click();
        await expect(page.locator('p[role="alert"]')).toContainText("already used");

        await events.getByRole("textbox", { name: "New role name" }).fill("Event host");
        await events.getByRole("button", { name: "Add role" }).click();
        await expect(page.getByRole("status")).toHaveText("Job role saved.");
        await expect(events.getByRole("listitem", { name: "Job role Event host" })).toBeVisible();

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

        await page.goto("/settings/organisation");
        const eventsAgain = page.getByRole("region", { name: "Department Events", exact: true });
        const roleRow = eventsAgain.getByRole("listitem", { name: "Job role Event host" });
        await roleRow.getByRole("combobox", { name: "Role status" }).selectOption("false");
        await roleRow.getByRole("button", { name: "Save role" }).click();
        await expect(page.getByRole("status")).toHaveText("Job role saved.");
        await eventsAgain.getByRole("textbox", { name: "Department name" }).fill("Functions");
        await eventsAgain.getByRole("combobox", { name: "Department status" }).selectOption("false");
        await eventsAgain.getByRole("button", { name: "Save department" }).click();
        await expect(page.getByRole("status")).toHaveText("Department saved.");
        const functions = page.getByRole("region", { name: "Department Functions", exact: true });
        await expect(functions.getByRole("heading", { name: "Functions Inactive", exact: true })).toBeVisible();
        await expect(functions.getByRole("button", { name: "Add role" })).toHaveCount(0);

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
        const newEmployee = page.getByRole("region", { name: "New employee", exact: true });
        await expect(newEmployee.locator(`select[name="department_id"] option[value="${eventsId}"]`)).toHaveCount(0);

        employeeContext = await browser.newContext({ baseURL: appUrl });
        const employeePage = await employeeContext.newPage();
        await signIn(employeePage, `staff-${suffix}@example.test`, password);
        await expect(employeePage.getByRole("link", { name: "Departments", exact: true })).toHaveCount(0);
        await employeePage.goto("/settings/organisation");
        await expect(employeePage).toHaveURL(/\/\?error=permission/);
      } finally {
        try {
          if (employeeContext && browser.isConnected()) await employeeContext.close();
        } finally {
          expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
          expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
          for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
        }
      }
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
        const membership = page.getByRole("form", { name: "Departments for Shared worker" });
        await expect(membership.getByRole("checkbox", { name: "Front of House (primary)" })).toBeChecked();
        await expect(membership.getByRole("checkbox", { name: "Front of House (primary)" })).toBeDisabled();
        await membership.getByRole("checkbox", { name: "Back of House" }).check();
        await membership.getByRole("button", { name: "Save departments" }).click();
        await expect(page.getByRole("status")).toHaveText("Department membership saved.");
        const links = await admin.from("employee_departments").select("department_id").eq("business_id", businessId);
        expect(links.error).toBeNull();
        expect(links.data.map((link) => link.department_id).sort()).toEqual([fohId, bohId].sort());
        await expect(page.getByRole("region", { name: "Employee Shared worker" }))
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
        const sharedForBoh = boh.getByRole("region", { name: "Employee Shared worker" });
        await expect(sharedForBoh).toContainText("managed by this worker's primary department");
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
          expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
    await page.goto("/settings/organisation");
    const barista = page.getByRole("listitem", { name: "Job role Barista" });
    await barista.getByRole("combobox", { name: "Automatic assignment" }).selectOption("true");
    await barista.getByRole("button", { name: "Save restriction" }).click();
    await expect(page.getByRole("status")).toHaveText("Automatic assignment setting saved.");
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
    const eligible = page.getByRole("form", { name: "Eligible roles for B Qualified in Front of House" });
    await eligible.getByRole("checkbox", { name: "Barista" }).check();
    await eligible.getByRole("checkbox", { name: "Server" }).check();
    await eligible.getByRole("button", { name: "Save eligible roles" }).click();
    await expect(page.getByRole("status")).toHaveText("Eligible roles saved.");
    const primary = page.getByRole("form", { name: "Primary role for B Qualified" });
    await primary.getByRole("combobox", { name: "Primary qualified role" }).selectOption(baristaId);
    await primary.getByRole("button", { name: "Set primary role" }).click();
    await expect(page.getByRole("status")).toHaveText("Primary role saved.");
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

    const filters = page.getByRole("form", { name: "Directory filters" });
    await filters.getByRole("combobox", { name: "Role", exact: true }).selectOption("Server");
    await filters.getByRole("button", { name: "Filter team" }).click();
    await expect(page.getByRole("region", { name: "Employee B Qualified" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Employee A Unqualified" })).toHaveCount(0);

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

    await page.goto("/people");
    await eligible.getByRole("checkbox", { name: "Barista" }).uncheck();
    await eligible.getByRole("button", { name: "Save eligible roles" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Choose another primary role");
    await primary.getByRole("combobox", { name: "Primary qualified role" }).selectOption(serverId);
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/people"),
      primary.getByRole("button", { name: "Set primary role" }).click(),
    ]);
    await expect(page.getByRole("status")).toHaveText("Primary role saved.");
    await eligible.getByRole("checkbox", { name: "Barista" }).uncheck();
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/people"),
      eligible.getByRole("button", { name: "Save eligible roles" }).click(),
    ]);
    await expect(page.getByRole("status")).toHaveText("Eligible roles saved.");
    const remaining = await admin.from("employee_job_roles").select("job_role_id, is_primary").eq("employee_id", qualifiedId);
    expect(remaining.error).toBeNull();
    expect(remaining.data).toEqual([{ job_role_id: serverId, is_primary: true }]);
  } finally {
    expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
    await page.goto("/settings/organisation");
    const barista = page.getByRole("listitem", { name: "Job role Barista" });
    await expect(barista.getByRole("combobox", { name: "Manual assignment" })).toHaveValue("false");
    await barista.getByRole("combobox", { name: "Automatic assignment" }).selectOption("true");
    await barista.getByRole("button", { name: "Save restriction" }).click();
    await expect(page.getByRole("status")).toHaveText("Automatic assignment setting saved.");

    const roster = `/roster?week=2032-03-15&venue=${venueId}&department=${departmentId}`;
    await page.goto(roster);
    const add = page.getByRole("form", { name: "Add draft shift" });
    await add.getByLabel("Role").fill("Barista");
    await add.getByLabel("Team member").selectOption(unqualifiedId);
    await add.getByRole("button", { name: "Save draft shift" }).click();
    await expect(page.getByRole("status")).toHaveText("Shift saved to the draft roster.");
    await expect(page.getByText(/1 assigned\s*·\s*0 open/)).toBeVisible();

    await page.goto("/settings/organisation");
    await barista.getByRole("combobox", { name: "Manual assignment" }).selectOption("true");
    await barista.getByRole("button", { name: "Save manual restriction" }).click();
    await expect(page.getByRole("status")).toHaveText("Manual assignment setting saved.");
    await barista.getByRole("combobox", { name: "Automatic assignment" }).selectOption("false");
    await barista.getByRole("button", { name: "Save restriction" }).click();
    await expect(page.getByRole("status")).toHaveText("Automatic assignment setting saved.");
    await expect(barista.getByRole("combobox", { name: "Automatic assignment" }).locator('option[value="false"]'))
      .toHaveText("Follow manual restriction (qualified only)");
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
    expect((await admin.from("businesses").delete().in("id", [businessId, otherBusinessId])).error).toBeNull();
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
    const managerView = page.getByRole("region", { name: "Work preferences for Exception worker" });
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
    await managerPage.goto("/settings/organisation");
    await expect(managerPage.getByRole("region", { name: "Department Front of House" })).toBeVisible();
    await expect(managerPage.getByRole("region", { name: "Department Back of House" })).toHaveCount(0);
    await managerPage.goto("/people");
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
      expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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

    await expect(page.locator("article", { hasText: "Published shift" }).getByRole("link", { name: /Edit/ })).toHaveCount(0);
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
      expect((await admin.from("businesses").delete().in("id", [businessId, outsideBusinessId])).error).toBeNull();
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
    await expect(workerPage.getByText("No roster updates yet.", { exact: false })).toBeVisible();
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
    const banner = workerPage.getByRole("region", { name: "Unread roster updates" });
    await expect(banner).toContainText("1 unread roster update");
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
    await expect(banner).toContainText("1 unread roster update");
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
    await expect(pendingPage.getByText("No roster updates yet.", { exact: false })).toBeVisible();
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
      expect((await admin.from("businesses").delete().in("id", [businessId, outsideBusinessId])).error).toBeNull();
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
    const section = page.getByRole("region", { name: "Shared staff across venues" });
    const form = section.getByRole("form", { name: "Link shared staff" });
    await expect(section).toContainText("do not link accounts or grant access");
    await expect(form.locator(`option[value="${outsideEmployee}"]`)).toHaveCount(0);
    await form.getByLabel("Profile in Harbour").selectOption(firstEmployee);
    await form.getByLabel("Profile at another venue").selectOption(secondEmployee);
    await form.evaluate((element) => { element.noValidate = true; });
    await form.getByRole("button", { name: "Link profiles" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Confirm the shared-profile change");
    await form.getByLabel("Profile in Harbour").selectOption(firstEmployee);
    await form.getByLabel("Profile at another venue").selectOption(secondEmployee);
    await form.getByLabel("I have confirmed that these profiles belong to the same person.").check();
    await form.getByRole("button", { name: "Link profiles" }).click();
    await expect(page.locator('p[role="status"]')).toHaveText("Shared-worker profiles linked.");
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
    await expect(managerPage.getByRole("region", { name: "Shared staff across venues" })).toHaveCount(0);
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
      expect((await admin.from("businesses").delete().in("id", [businessId, outsideBusinessId])).error).toBeNull();
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
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
    await create.getByLabel("I checked both claimed times. They are unverified device times, and no breaks were captured.").check();
    await create.getByRole("button", { name: "Create attendance from claims" }).click();
    await expect(page.getByRole("status")).toContainText("Attendance created from unverified offline claims");
    await expect(claimCard(4)).toContainText("Attendance created from unverified offline claims");
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
    await expect(page.getByRole("status")).toContainText("Manager-reported break end and unverified offline clock-out");
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
    await expect(page.getByRole("status")).toContainText("Attendance completed with an unverified offline clock-out");
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
    await expect(workerClaims).toContainText("Attendance created from unverified offline claims");
    await expect(workerClaims).toContainText("Open attendance completed with an unverified offline clock-out");
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
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
    await expect(page.getByText("No active employee profile is linked to your account", { exact: false })).toBeVisible();
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
    let linkForm = page.getByRole("form", { name: "Link shared staff" });
    await linkForm.getByLabel("Profile in Harbour").selectOption(firstEmployee);
    await linkForm.getByLabel("Profile at another venue").selectOption(secondEmployee);
    await linkForm.getByLabel("I have confirmed that these profiles belong to the same person.").check();
    await linkForm.getByRole("button", { name: "Link profiles" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Finish at least one open clock session" })).toBeVisible();
    const secondClose = await secondApi.rpc("clock_out_attendance", {
      p_business_id: businessId, p_session_id: secondOpen.data[0].session_id, p_request_id: randomUUID(),
    });
    expect(secondClose.error).toBeNull();
    linkForm = page.getByRole("form", { name: "Link shared staff" });
    await linkForm.getByLabel("Profile in Harbour").selectOption(firstEmployee);
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
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
      navigator.geolocation.getCurrentPosition = (success, failure, options) => {
        sessionStorage.setItem("geolocation-calls", String(Number(sessionStorage.getItem("geolocation-calls") || 0) + 1));
        sessionStorage.setItem("geolocation-options", JSON.stringify(options));
        return original(success, failure, options);
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
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
    await expect(worker.getByText("No roster updates yet.", { exact: false })).toBeVisible();
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
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
    const newEmployee = page.getByRole("region", { name: "New employee" });
    await newEmployee.getByRole("textbox", { name: "Name", exact: true }).fill("First team member");
    await newEmployee.getByRole("textbox", { name: "Job role", exact: true }).fill("Server");
    await newEmployee.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentId);
    await newEmployee.getByRole("button", { name: "Add employee" }).click();
    await expect(page.getByRole("region", { name: "Employee First team member" })).toBeVisible();
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
    }
    for (const user of users) expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});

test("sample teams are opt-in only after an isolated database operator enables them", async ({ page }) => {
  const { sql } = await disposableDatabase(process.env.BUTTERBOX_TEST_DB_CONTAINER, apiUrl);
  expect(await sql("select enabled from public.demo_seed_policy where singleton")).toBe("f");
  const suffix = randomUUID();
  const email = `onboarding-sample-${suffix}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  let userId;
  try {
    await sql("update public.demo_seed_policy set enabled = true where singleton");
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(user.error).toBeNull();
    userId = user.data.user.id;
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/setup/);
    const sample = page.getByRole("checkbox", { name: /Add a sample team/ });
    await expect(sample).toBeEnabled();
    await expect(sample).not.toBeChecked();
    await sample.check();
    await page.getByLabel("Business name").fill("Isolated sample cafe");
    await page.getByLabel("First venue").fill("Test venue");
    await page.getByLabel("Venue address").fill("10 Test Street");
    await page.getByRole("button", { name: "Save progress" }).click();
    await expect(page.getByRole("status")).toContainText("Setup progress saved");
    await expect(sample).toBeChecked();
    await page.getByRole("button", { name: "Create workspace" }).click();
    const checklist = page.getByRole("region", { name: "Get your first roster ready" });
    await expect(checklist).toContainText("4 of 5 steps complete");
    const membership = await admin.from("business_memberships").select("business_id")
      .eq("user_id", userId).single();
    expect(membership.error).toBeNull();
    const [staff, shifts, publications] = await Promise.all([
      admin.from("employees").select("id").eq("business_id", membership.data.business_id),
      admin.from("shifts").select("is_published").eq("business_id", membership.data.business_id),
      admin.from("roster_publications").select("id").eq("business_id", membership.data.business_id),
    ]);
    expect(staff.error).toBeNull();
    expect(shifts.error).toBeNull();
    expect(publications.error).toBeNull();
    expect(staff.data).toHaveLength(24);
    expect(shifts.data).toHaveLength(48);
    expect(shifts.data.every((shift) => shift.is_published === false)).toBe(true);
    expect(publications.data).toHaveLength(0);
  } finally {
    await sql("update public.demo_seed_policy set enabled = false where singleton");
    if (userId) {
      const memberships = await admin.from("business_memberships").select("business_id").eq("user_id", userId);
      expect(memberships.error).toBeNull();
      for (const membership of memberships.data) {
        expect((await admin.from("businesses").delete().eq("id", membership.business_id)).error).toBeNull();
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
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
    }
    const recipient = await findUser(recipientEmail);
    if (recipient) users.push(recipient.id);
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
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
    for (const address of Object.values(addresses)) {
      const recipient = await findUser(address);
      if (recipient) expect((await admin.auth.admin.deleteUser(recipient.id)).error).toBeNull();
    }
    if (ownerId) expect((await admin.auth.admin.deleteUser(ownerId)).error).toBeNull();
  }
});

test("ambiguous business memberships fail closed in stale forms and workspace pages", async ({ page }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const email = `multiple-businesses-${suffix}@example.test`;
  const [businessId, otherBusiness, venueId, otherVenue, departmentId, otherDepartment] =
    Array.from({ length: 6 }, () => randomUUID());
  let userId;
  try {
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(user.error).toBeNull();
    userId = user.data.user.id;
    expect((await admin.from("businesses").insert([
      { id: businessId, name: "First private business" }, { id: otherBusiness, name: "Second private business" },
    ])).error).toBeNull();
    expect((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "First", timezone: "UTC" },
      { id: otherVenue, business_id: otherBusiness, name: "Second", timezone: "UTC" },
    ])).error).toBeNull();
    expect((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "First FOH" },
      { id: otherDepartment, business_id: otherBusiness, venue_id: otherVenue, name: "Second FOH" },
    ])).error).toBeNull();
    expect((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: userId, role: "owner",
    })).error).toBeNull();
    await signIn(page, email, password);
    await page.goto(`/people?venue=${venueId}`);
    const newEmployee = page.getByRole("region", { name: "New employee" });
    await newEmployee.getByRole("textbox", { name: "Name", exact: true }).fill("Stale staff");
    await newEmployee.getByRole("textbox", { name: "Job role", exact: true }).fill("Server");
    await newEmployee.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentId);
    expect((await admin.from("business_memberships").insert({
      business_id: otherBusiness, user_id: userId, role: "employee",
      venue_id: otherVenue, department_id: otherDepartment,
    })).error).toBeNull();
    await newEmployee.getByRole("button", { name: "Add employee" }).click();
    await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
    await expect(page.getByText(/Safe business switching is not available yet/)).toBeVisible();
    await expect(page.getByText("First private business", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Second private business", { exact: true })).toHaveCount(0);
    const stale = await admin.from("employees").select("id").eq("business_id", businessId).eq("name", "Stale staff");
    expect(stale.error).toBeNull();
    expect(stale.data).toEqual([]);
    await page.goto(`/roster?venue=${otherVenue}`);
    await expect(page.getByRole("heading", { name: "Roster unavailable" })).toBeVisible();
    await expect(page.getByText("Second private business", { exact: true })).toHaveCount(0);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?message=signed-out/);
  } finally {
    for (const business of [businessId, otherBusiness]) {
      expect((await admin.from("businesses").delete().eq("id", business)).error).toBeNull();
    }
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});
