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

test("permissions, employee profiles and filtered team directory", async ({ page, browser }) => {
      const suffix = randomUUID();
      const password = `${randomBytes(18).toString("base64url")}aA1!`;
      const userIds = [];
      const businessId = randomUUID();
      const venueIds = [randomUUID(), randomUUID()];
      const departmentIds = [randomUUID(), randomUUID(), randomUUID()];
      let targetContext;
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
        expect((await admin.from("business_memberships").insert([
          { business_id: businessId, user_id: userIds[0], role: "owner" },
          { business_id: businessId, user_id: userIds[1], role: "employee",
            venue_id: venueIds[0], department_id: departmentIds[0] },
        ])).error).toBeNull();
        expect((await admin.from("employees").insert(departmentIds.map((departmentId, index) => ({
          business_id: businessId, venue_id: venueIds[index === 2 ? 1 : 0], department_id: departmentId,
          name: ["FOH directory worker", "BOH directory worker", "Other venue worker"][index],
          email: `private-${index}@example.test`, role_title: index === 1 ? "Cook" : "Server",
        })))).error).toBeNull();
        await signIn(page, `owner-${suffix}@example.test`, password);
        await page.getByRole("link", { name: "Permissions", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Business permissions" })).toBeVisible();
        const memberForm = page.getByRole("region", { name: `Permissions for member-${suffix}@example.test` });

        for (const [role, venueId, departmentId, departmentNames] of [
          ["general_manager", venueIds[1], "", ["Front of House"]],
          ["foh_manager", venueIds[0], departmentIds[0], ["Front of House"]],
          ["boh_manager", venueIds[0], departmentIds[1], ["Back of House"]],
          ["employee", venueIds[0], departmentIds[0], ["Front of House"]],
          ["owner", "", "", ["Front of House", "Back of House"]],
        ]) {
          await memberForm.getByRole("combobox", { name: "Role", exact: true }).selectOption(role);
          await memberForm.getByRole("combobox", { name: "Venue", exact: true }).selectOption(venueId);
          await memberForm.getByRole("combobox", { name: "Department", exact: true }).selectOption(departmentId);
          await Promise.all([
            page.waitForResponse((response) => response.request().method() === "POST" &&
              new URL(response.url()).pathname === "/settings/permissions"),
            memberForm.getByRole("button", { name: "Save permissions" }).click(),
          ]);
          await expect(page.getByRole("status")).toHaveText("Permissions updated.");
          const stored = await admin.from("business_memberships").select("role, venue_id, department_id")
            .eq("user_id", userIds[1]).eq("business_id", businessId).single();
          expect(stored.error).toBeNull();
          expect(stored.data).toEqual({ role, venue_id: venueId || null, department_id: departmentId || null });
          targetContext = await browser.newContext({ baseURL: appUrl });
          const targetPage = await targetContext.newPage();
          await signIn(targetPage, `member-${suffix}@example.test`, password);
          await expect(targetPage.getByRole("heading", { name: "Butterbox AI Rostering" })).toBeVisible();
          await expect(targetPage.getByRole("link", { name: "Permissions", exact: true })).toHaveCount(role === "owner" ? 1 : 0);
          if (role !== "owner") {
            await targetPage.goto("/settings/permissions");
            await expect(targetPage).toHaveURL(/\/\?error=permission/);
            await expect(targetPage.getByRole("heading", { name: "Business permissions" })).toHaveCount(0);
          }
          if (role === "employee") {
            await expect(targetPage.getByRole("link", { name: "People", exact: true })).toHaveCount(0);
            await targetPage.goto("/people");
            await expect(targetPage).toHaveURL(/\/\?error=permission/);
          } else if (role !== "owner") {
            await targetPage.goto("/people");
            const directory = targetPage.getByRole("form", { name: "Directory filters" });
            await expect(directory.getByRole("combobox", { name: "Venue", exact: true }).locator("option")).toHaveCount(1);
            const expectedWorker = role === "general_manager" ? "Other venue worker" : role === "boh_manager" ? "BOH directory worker" : "FOH directory worker";
            await expect(targetPage.getByRole("region", { name: `Employee ${expectedWorker}`, exact: true })).toBeVisible();
            for (const worker of ["FOH directory worker", "BOH directory worker", "Other venue worker"].filter((name) => name !== expectedWorker)) {
              await expect(targetPage.getByRole("region", { name: `Employee ${worker}`, exact: true })).toHaveCount(0);
            }
            await targetPage.goto(`/people?venue=${venueIds[role === "general_manager" ? 0 : 1]}`);
            await expect(targetPage.locator('p[role="alert"]')).toContainText("filter is unavailable");
          }
          await targetPage.goto("/roster?department=all");
          const actualDepartments = await targetPage.locator("#department-filter option").allTextContents();
          expect(actualDepartments.filter((name) => name !== "All departments")).toEqual(departmentNames.slice().sort());
          if (role === "employee") {
            await expect(targetPage.getByRole("button", { name: "Save draft shift" })).toHaveCount(0);
            await expect(targetPage.getByRole("button", { name: "Publish this department" })).toHaveCount(0);
          } else {
            await targetPage.locator("#department-filter").selectOption(departmentIds[role === "general_manager" ? 2 : role === "boh_manager" ? 1 : 0]);
            await targetPage.getByRole("button", { name: "Apply filter" }).click();
            await expect(targetPage.getByRole("button", { name: "Save draft shift" })).toBeVisible();
          }
          await targetContext.close();
          targetContext = undefined;
        }
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
      } finally {
        if (targetContext && browser.isConnected()) await targetContext.close();
        expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
        expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
        for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
        const remaining = await admin.from("businesses").select("id").eq("id", businessId);
        expect(remaining.error).toBeNull();
        expect(remaining.data).toEqual([]);
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
        if (employeeContext && browser.isConnected()) await employeeContext.close();
        expect((await admin.from("shifts").delete().eq("business_id", businessId)).error).toBeNull();
        expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
        for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
      }
});
