import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  combineChunks,
  createChunks,
  stringFromBase64URL,
  stringToBase64URL,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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

test("verified signup, resumable setup, cross-tab sessions and recovery", async ({
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
    await page.getByRole("checkbox").uncheck();
    await page.getByRole("button", { name: "Save progress" }).click();
    await expect(page.getByRole("status")).toContainText("Setup progress saved");

    resumedContext = await browser.newContext({ baseURL: appUrl });
    const resumedPage = await resumedContext.newPage();
    await signIn(resumedPage, email, password);
    await expect(resumedPage).toHaveURL(/\/setup/);
    await expect(resumedPage.getByLabel("Business name")).toHaveValue("Authentication test business");
    await expect(resumedPage.getByLabel("First venue")).toHaveValue("Authentication test venue");
    await expect(resumedPage.getByRole("checkbox")).not.toBeChecked();
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
    if (resumedContext && browser.isConnected()) await resumedContext.close();
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
});
