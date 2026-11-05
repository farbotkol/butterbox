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

test("scoped payroll mapping serializes competing edits, duplicate IDs and queued revocation", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 180_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const owner = createClient(url, anonKey, options);
  const manager = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, departmentId, connectionId, ...employees] =
    Array.from({ length: 8 }, () => randomUUID());
  const users = [];
  const payrollLock = `select pg_advisory_xact_lock(hashtextextended('payroll-mapping:${businessId}', 0))`;

  async function waitForWaiters(expected) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const count = await sql(
        "select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%set_payroll_employee_mapping_scoped%'",
      );
      if (Number(count) >= expected) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${expected} payroll mapping calls to reach the lock.`);
  }

  async function race(calls) {
    const gate = await holdLock(payrollLock);
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
    for (const name of ["owner", "admin"]) {
      const result = await admin.auth.admin.createUser({
        email: `payroll-race-${name}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Payroll race cafe" })).error);
    assert.ifError((await admin.from("venues").insert({ id: venueId, business_id: businessId, name: "Race venue" })).error);
    assert.ifError((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "Race FOH",
    })).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "admin" },
    ])).error);
    assert.ifError((await admin.from("employees").insert(employees.map((id, index) => ({
      id, business_id: businessId, venue_id: venueId, department_id: departmentId,
      name: `Race worker ${index}`, role_title: "Server",
    })))).error);
    for (const [client, name] of [[owner, "owner"], [manager, "admin"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `payroll-race-${name}-${suffix}@example.test`, password,
      })).error);
    }
    assert.ifError((await owner.rpc("create_payroll_mapping_connection", {
      p_business_id: businessId, p_connection_id: connectionId,
      p_provider: "xero", p_account_id: `account-${suffix}`, p_name: "Race destination",
    })).error);
    const base = {
      p_business_id: businessId, p_venue_id: venueId, p_connection_id: connectionId,
      p_expected_revision: 0, p_reason: "Verified against payroll account",
      p_destination_confirmed: true, p_removal_confirmed: false,
    };
    const first = {
      ...base, p_employee_id: employees[0], p_external_employee_id: "First-ID", p_request_id: randomUUID(),
    };
    const second = {
      ...base, p_employee_id: employees[0], p_external_employee_id: "Second-ID", p_request_id: randomUUID(),
    };
    const edits = await race([
      () => owner.rpc("set_payroll_employee_mapping_scoped", first),
      () => manager.rpc("set_payroll_employee_mapping_scoped", second),
    ]);
    assert.equal(edits.filter((result) => !result.error).length, 1);
    assert.equal(edits.find((result) => result.error)?.error.message, "Payroll mapping changed; refresh before saving");
    const winningIndex = edits.findIndex((result) => !result.error);
    const retry = await (winningIndex === 0 ? owner : manager).rpc(
      "set_payroll_employee_mapping_scoped", winningIndex === 0 ? first : second,
    );
    assert.ifError(retry.error);
    assert.equal(retry.data, edits[winningIndex].data);
    const bypass = await owner.rpc("set_payroll_employee_mapping", {
      p_business_id: businessId, p_connection_id: connectionId, p_employee_id: employees[0],
      p_expected_revision: 1, p_external_employee_id: null,
      p_reason: "Attempt direct unconfirmed removal", p_request_id: randomUUID(),
    });
    assert.ok(bypass.error, "the legacy HTTP RPC cannot bypass venue and removal confirmation");

    const duplicates = await race([
      () => owner.rpc("set_payroll_employee_mapping_scoped", {
        ...base, p_employee_id: employees[1], p_external_employee_id: "Shared-ID", p_request_id: randomUUID(),
      }),
      () => manager.rpc("set_payroll_employee_mapping_scoped", {
        ...base, p_employee_id: employees[2], p_external_employee_id: "Shared-ID", p_request_id: randomUUID(),
      }),
    ]);
    assert.equal(duplicates.filter((result) => !result.error).length, 1);
    assert.equal(duplicates.find((result) => result.error)?.error.message,
      "Payroll employee ID is already mapped to another employee");

    const revocation = await holdLock(`select set_config('request.jwt.claim.sub', '${users[0]}', true);
      select public.assign_business_member_role('${businessId}', '${users[1]}', 'employee', '${venueId}', '${departmentId}')`);
    let pending;
    try {
      pending = Promise.resolve(manager.rpc("set_payroll_employee_mapping_scoped", {
        ...base, p_employee_id: employees[3], p_external_employee_id: "After-Revocation", p_request_id: randomUUID(),
      }));
      await waitForLock("set_payroll_employee_mapping_scoped");
      await revocation.release(true);
      const denied = await pending;
      assert.equal(denied.error?.message, "Permission denied");
    } finally {
      await revocation.release(false);
      if (pending) await Promise.allSettled([pending]);
    }
    const rows = await owner.rpc("list_payroll_employee_mappings", {
      p_business_id: businessId, p_connection_id: connectionId, p_venue_id: venueId,
    });
    assert.ifError(rows.error);
    assert.equal(rows.data.filter((row) => row.external_employee_id !== null).length, 2);
    assert.equal(rows.data.find((row) => row.employee_id === employees[0]).revision, 1);
    assert.equal(rows.data.find((row) => row.employee_id === employees[3]).revision, 0);
    const audit = await owner.from("sensitive_action_audit").select("id")
      .eq("business_id", businessId).eq("source_table", "payroll_employee_mapping_events");
    assert.ifError(audit.error);
    assert.equal(audit.data.length, 2);
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
