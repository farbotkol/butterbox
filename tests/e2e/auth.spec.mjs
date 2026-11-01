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
    await expect(page.getByText("Automatic selection checks role qualifications and overlaps, not employee availability.")).toBeVisible();
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

test("date exceptions override recurring availability and leave requests show their review status", async ({ page, browser }) => {
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const otherBusinessId = randomUUID();
  const venueId = randomUUID();
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
    await signIn(workerPage, `exceptions-worker-${suffix}@example.test`, password);
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
    await expect(workerPage.getByRole("alert")).toContainText("at most 366 days");

    const otherManager = createClient(apiUrl, anonKey, options);
    expect((await otherManager.auth.signInWithPassword({
      email: `exceptions-boh-${suffix}@example.test`, password,
    })).error).toBeNull();
    const otherVisible = await otherManager.from("employee_availability_exceptions").select("id").eq("id", pending.data.id);
    expect(otherVisible.error).toBeNull();
    expect(otherVisible.data).toEqual([]);
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

    await signIn(page, `exceptions-owner-${suffix}@example.test`, password);
    await page.goto(`/roster?week=2032-03-15&department=${fohId}`);
    await expect(page.getByLabel("Date blocked Exception worker 2032-03-15")).toBeVisible();
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-15")).toHaveText("Unavailable all day");
    await expect(page.getByLabel("Pending leave Exception worker 2032-03-16")).toBeVisible();
    await expect(page.getByLabel("Approved leave Exception worker 2032-03-16")).toHaveCount(0);
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-16")).toContainText("Unavailable 00:00–09:00");
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-16")).toContainText("Unavailable 17:00–24:00");

    await page.goto("/availability");
    const review = page.getByRole("listitem", { name: "Leave request for Exception worker 2032-03-16" });
    await expect(review).toContainText("Pending");
    await review.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("status")).toHaveText("Leave approved.");
    await workerPage.reload();
    await expect(list.getByRole("listitem").filter({ hasText: "Leave: 2032-03-16" })).toContainText("Approved");
    await page.goto(`/roster?week=2032-03-15&department=${fohId}`);
    await expect(page.getByLabel("Approved leave Exception worker 2032-03-16")).toBeVisible();
    await expect(page.getByLabel("Approved leave Exception worker 2032-03-17")).toBeVisible();
    await expect(page.getByLabel("Pending leave Exception worker 2032-03-16")).toHaveCount(0);
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-16")).toHaveText("Unavailable all day");
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-17")).toHaveText("Unavailable all day");

    await form.getByLabel("Type").selectOption("leave");
    await form.getByLabel("From").fill("2032-03-18");
    await form.getByLabel("Through").fill("2032-03-18");
    await form.getByRole("button", { name: "Save date exception" }).click();
    await expect(workerPage.getByRole("status")).toHaveText("Leave request submitted.");
    await page.goto("/availability");
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

    await page.goto("/availability");
    await review.getByText("Change approval").click();
    await review.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(page.getByRole("status")).toHaveText("Availability exception cancelled.");
    await workerPage.reload();
    await expect(list.getByRole("listitem").filter({ hasText: "Leave: 2032-03-16" })).toContainText("Cancelled");
    await page.goto(`/roster?week=2032-03-15&department=${fohId}`);
    await expect(page.getByLabel("Date blocked Exception worker 2032-03-15")).toHaveCount(0);
    await expect(page.getByLabel("Approved leave Exception worker 2032-03-16")).toHaveCount(0);
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-15")).toContainText("Unavailable 00:00–09:00");
    await expect(page.getByLabel("Unavailable Exception worker 2032-03-16")).toContainText("Unavailable 17:00–24:00");
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
    await expect(page.getByText(/Shift acknowledgements are not available yet/)).toBeVisible();
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
