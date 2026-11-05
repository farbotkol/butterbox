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

test("permission edits serialize stale writes, revocation and concurrent owner demotions", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 180_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const firstOwner = createClient(url, anonKey, options);
  const secondOwner = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, departmentId] = Array.from({ length: 3 }, () => randomUUID());
  const users = [];
  const lockSql = `select pg_advisory_xact_lock(hashtextextended('membership-roles:${businessId}', 0))`;

  async function waitForWaiters(expected) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const count = await sql(
        "select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%assign_business_member_role_checked%'",
      );
      if (Number(count) >= expected) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${expected} permission calls to reach the lock.`);
  }

  async function race(calls) {
    const gate = await holdLock(lockSql);
    let pending;
    try {
      pending = Promise.all(calls.map((call) => call()));
      await waitForWaiters(calls.length);
      await gate.release(false);
      return await pending;
    } finally {
      await gate.release(false);
      if (pending) await Promise.allSettled([pending]);
    }
  }

  try {
    for (const name of ["first-owner", "second-owner", "worker"]) {
      const result = await admin.auth.admin.createUser({
        email: `permission-race-${name}-${suffix}@example.test`,
        password, email_confirm: true, user_metadata: { full_name: `Race ${name}` },
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Permission race cafe" })).error);
    assert.ifError((await admin.from("venues").insert({ id: venueId, business_id: businessId, name: "Race venue" })).error);
    assert.ifError((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Race FOH",
    })).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "owner" },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: departmentId },
    ])).error);
    for (const [client, name] of [[firstOwner, "first-owner"], [secondOwner, "second-owner"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `permission-race-${name}-${suffix}@example.test`, password,
      })).error);
    }

    const firstPage = await firstOwner.rpc("list_business_members_for_permissions", {
      p_business_id: businessId,
    }, { count: "exact" }).range(0, 0);
    const secondPage = await firstOwner.rpc("list_business_members_for_permissions", {
      p_business_id: businessId,
    }, { count: "exact" }).range(1, 2);
    assert.ifError(firstPage.error);
    assert.ifError(secondPage.error);
    assert.equal(firstPage.count, 3);
    assert.equal(secondPage.count, 3);
    assert.equal(new Set([...firstPage.data, ...secondPage.data].map((row) => row.user_id)).size, 3);
    assert.ok([...firstPage.data, ...secondPage.data].some((row) => row.full_name === "Race worker"));

    const input = {
      p_business_id: businessId, p_user_id: users[2], p_role: "general_manager",
      p_venue_id: venueId, p_department_id: null, p_expected_role: "employee",
      p_expected_venue_id: venueId, p_expected_department_id: departmentId, p_confirmed: true,
    };
    const edits = await race([
      () => firstOwner.rpc("assign_business_member_role_checked", input),
      () => secondOwner.rpc("assign_business_member_role_checked", {
        ...input, p_role: "foh_manager", p_department_id: departmentId,
      }),
    ]);
    assert.equal(edits.filter((result) => !result.error).length, 1);
    assert.equal(edits.find((result) => result.error)?.error.message, "Permissions changed; refresh before saving");
    const current = await admin.from("business_memberships").select("role, venue_id, department_id")
      .eq("business_id", businessId).eq("user_id", users[2]).single();
    assert.ifError(current.error);
    const audit = await firstOwner.from("sensitive_action_audit").select("id")
      .eq("business_id", businessId).eq("source_table", "business_memberships").eq("operation", "UPDATE");
    assert.ifError(audit.error);
    assert.equal(audit.data.length, 1);

    const revocation = await holdLock(`${lockSql};
      select set_config('request.jwt.claim.sub', '${users[1]}', true);
      select public.assign_business_member_role('${businessId}', '${users[0]}', 'employee', '${venueId}', '${departmentId}')`);
    let pending;
    try {
      pending = Promise.resolve(firstOwner.rpc("assign_business_member_role_checked", {
        ...input, p_role: "employee", p_department_id: departmentId,
        p_expected_role: current.data.role, p_expected_venue_id: current.data.venue_id,
        p_expected_department_id: current.data.department_id,
      }));
      await waitForLock("assign_business_member_role_checked");
      await revocation.release(true);
      const denied = await pending;
      assert.equal(denied.error?.message, "Permission denied");
    } finally {
      await revocation.release(false);
      if (pending) await Promise.allSettled([pending]);
    }
    const afterRevocation = await admin.from("business_memberships").select("role, venue_id, department_id")
      .eq("business_id", businessId).eq("user_id", users[2]).single();
    assert.ifError(afterRevocation.error);
    assert.deepEqual(afterRevocation.data, current.data);

    assert.ifError((await secondOwner.rpc("assign_business_member_role_checked", {
      ...input, p_user_id: users[0], p_role: "owner", p_venue_id: null, p_department_id: null,
    })).error);
    const ownerSnapshot = {
      ...input, p_role: "employee", p_department_id: departmentId,
      p_expected_role: "owner", p_expected_venue_id: null, p_expected_department_id: null,
    };
    const demotions = await race([
      () => firstOwner.rpc("assign_business_member_role_checked", { ...ownerSnapshot, p_user_id: users[0] }),
      () => firstOwner.rpc("assign_business_member_role_checked", { ...ownerSnapshot, p_user_id: users[1] }),
    ]);
    assert.equal(demotions.filter((result) => !result.error).length, 1);
    assert.ok(["A business must retain an owner", "Permission denied"].includes(
      demotions.find((result) => result.error)?.error.message,
    ));
    const remaining = await admin.from("business_memberships").select("user_id")
      .eq("business_id", businessId).eq("role", "owner");
    assert.ifError(remaining.error);
    assert.equal(remaining.data.length, 1);
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
