import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("department and role writes serialize competing edits and live permission changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 180_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const owner = createClient(url, anonKey, options);
  const manager = createClient(url, anonKey, options);
  const outsider = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, departmentId, roleId] = Array.from({ length: 5 }, () => randomUUID());
  const users = [];

  async function waitForWaiters(functionName, expected) {
    assert.match(functionName, /^[a-z_]+$/);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const count = await sql(
        `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%${functionName}%'`,
      );
      if (Number(count) >= expected) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${expected} ${functionName} calls to reach a lock.`);
  }

  async function race(statement, functionName, calls) {
    const gate = await holdLock(statement);
    let pending;
    try {
      pending = Promise.all(calls.map((call) => call()));
      await waitForWaiters(functionName, calls.length);
      await gate.release(false);
      return await pending;
    } finally {
      await gate.release(false);
      await Promise.allSettled([pending].filter(Boolean));
    }
  }

  function oneSuccess(results, message) {
    assert.equal(results.filter((result) => !result.error).length, 1);
    assert.equal(results.find((result) => result.error)?.error.message, message);
  }

  try {
    for (const name of ["owner", "manager", "outsider"]) {
      const result = await admin.auth.admin.createUser({
        email: `department-concurrency-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Department concurrency cafe" },
      { id: outsideId, name: "Outside concurrency cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour",
    })).error);
    assert.ifError((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error);
    assert.ifError((await admin.from("job_roles").insert({
      id: roleId, business_id: businessId, venue_id: venueId, department_id: departmentId, name: "Barista",
    })).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: outsideId, user_id: users[2], role: "owner" },
    ])).error);
    for (const [client, name] of [[owner, "owner"], [manager, "manager"], [outsider, "outsider"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `department-concurrency-${name}-${suffix}@example.test`, password,
      })).error);
    }

    const departmentInput = {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: null,
      p_name: "Events", p_active: true, p_expected_name: null, p_expected_active: null, p_confirm_lifecycle: false,
    };
    const departmentCreates = await race(
      `select pg_advisory_xact_lock(hashtextextended('department-names:${venueId}', 0))`,
      "save_department_checked",
      [
        () => owner.rpc("save_department_checked", departmentInput),
        () => owner.rpc("save_department_checked", { ...departmentInput, p_name: "eVENTS" }),
      ],
    );
    oneSuccess(departmentCreates, "Department name already exists");
    const createdDepartments = await admin.from("departments").select("id")
      .eq("venue_id", venueId).ilike("name", "events");
    assert.ifError(createdDepartments.error);
    assert.equal(createdDepartments.data.length, 1);

    const roleInput = {
      p_business_id: businessId, p_department_id: departmentId, p_job_role_id: null,
      p_name: "Server", p_active: true, p_expected_name: null, p_expected_active: null, p_confirm_lifecycle: false,
    };
    const roleCreates = await race(
      `select pg_advisory_xact_lock(hashtextextended('job-role-names:${departmentId}', 0))`,
      "save_job_role_checked",
      [
        () => owner.rpc("save_job_role_checked", roleInput),
        () => manager.rpc("save_job_role_checked", { ...roleInput, p_name: "sERVER" }),
      ],
    );
    oneSuccess(roleCreates, "Job role name already exists");
    const createdRoles = await admin.from("job_roles").select("id")
      .eq("department_id", departmentId).ilike("name", "server");
    assert.ifError(createdRoles.error);
    assert.equal(createdRoles.data.length, 1);

    const departmentEdit = {
      ...departmentInput, p_department_id: departmentId, p_expected_name: "FOH", p_expected_active: true,
    };
    const departmentEdits = await race(
      `select pg_advisory_xact_lock(hashtextextended('department-names:${venueId}', 0))`,
      "save_department_checked",
      [
        () => owner.rpc("save_department_checked", { ...departmentEdit, p_name: "Front one" }),
        () => owner.rpc("save_department_checked", { ...departmentEdit, p_name: "Front two" }),
      ],
    );
    oneSuccess(departmentEdits, "Department changed; refresh before saving");

    const roleEdit = {
      ...roleInput, p_job_role_id: roleId, p_expected_name: "Barista", p_expected_active: true,
    };
    const roleEdits = await race(
      `select pg_advisory_xact_lock(hashtextextended('job-role-names:${departmentId}', 0))`,
      "save_job_role_checked",
      [
        () => owner.rpc("save_job_role_checked", { ...roleEdit, p_name: "Senior barista" }),
        () => manager.rpc("save_job_role_checked", { ...roleEdit, p_name: "Lead barista" }),
      ],
    );
    oneSuccess(roleEdits, "Job role changed; refresh before saving");
    const currentRole = await admin.from("job_roles").select("name").eq("id", roleId).single();
    assert.ifError(currentRole.error);

    const restrictionInput = {
      p_business_id: businessId, p_department_id: departmentId, p_job_role_id: roleId,
      p_restricted: true, p_expected_name: currentRole.data.name, p_expected_active: true,
      p_expected_auto: false, p_expected_manual: false,
    };
    const restrictions = await race(
      `select id from public.job_roles where id = '${roleId}'::uuid for update`,
      "set_job_role_restriction_checked",
      [
        () => owner.rpc("set_job_role_restriction_checked", { ...restrictionInput, p_mode: "automatic" }),
        () => manager.rpc("set_job_role_restriction_checked", { ...restrictionInput, p_mode: "manual" }),
      ],
    );
    oneSuccess(restrictions, "Role restrictions changed; refresh before saving");
    const savedRestrictions = await admin.from("job_roles")
      .select("restrict_auto_assignment, restrict_manual_assignment").eq("id", roleId).single();
    assert.ifError(savedRestrictions.error);
    assert.equal(Number(savedRestrictions.data.restrict_auto_assignment) +
      Number(savedRestrictions.data.restrict_manual_assignment), 1);
    const denied = await outsider.rpc("save_job_role_checked", {
      ...roleEdit, p_name: "Other business", p_expected_name: currentRole.data.name,
    });
    assert.equal(denied.error?.message, "Permission denied");

    const membershipGate = await holdLock(
      `select id from public.business_memberships where user_id = '${users[1]}'::uuid and business_id = '${businessId}'::uuid for update; ` +
      `update public.business_memberships set role = 'employee' where user_id = '${users[1]}'::uuid and business_id = '${businessId}'::uuid`,
    );
    let pending;
    try {
      pending = Promise.resolve(manager.rpc("save_job_role_checked", {
        ...roleEdit, p_name: "Revoked edit", p_expected_name: currentRole.data.name,
      }));
      await waitForLock("save_job_role_checked");
      await membershipGate.release(true);
      const result = await pending;
      assert.equal(result.error?.message, "Permission denied");
    } finally {
      await membershipGate.release(false);
      await Promise.allSettled([pending].filter(Boolean));
    }
    const finalRole = await admin.from("job_roles").select("name").eq("id", roleId).single();
    assert.ifError(finalRole.error);
    assert.equal(finalRole.data.name, currentRole.data.name);
  } finally {
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
