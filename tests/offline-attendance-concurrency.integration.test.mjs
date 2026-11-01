import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("offline claims serialize retries and respect concurrent access changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 90_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const worker = createClient(url, anonKey, options);
  const outsider = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, fohId, bohId, employeeId] =
    Array.from({ length: 6 }, () => randomUUID());
  const users = [];

  try {
    for (const role of ["worker", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `offline-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Offline race cafe" },
      { id: outsideBusiness, name: "Outside offline cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusiness, user_id: users[1], role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users[0], name: "Offline worker", role_title: "Server",
    })).error);
    for (const [client, role] of [[worker, "worker"], [outsider, "outside"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `offline-race-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const args = {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
      p_employee_id: employeeId, p_actor_id: users[0], p_request_id: randomUUID(),
      p_event_type: "clock_in", p_claimed_at: "2020-01-01T09:00:00.000Z",
    };
    const before = Date.now();
    const retries = await Promise.all(Array.from({ length: 8 }, () =>
      worker.rpc("submit_attendance_offline_claim", args)));
    for (const result of retries) {
      assert.ifError(result.error);
      assert.deepEqual(result.data, retries[0].data);
    }
    const receipt = retries[0].data[0];
    assert.ok(Date.parse(receipt.received_at) >= before - 5_000);
    assert.ok(Date.parse(receipt.received_at) <= Date.now() + 5_000);
    const saved = await worker.from("attendance_offline_claims")
      .select("id, event_type, claimed_at, received_at").eq("business_id", businessId);
    assert.ifError(saved.error);
    assert.equal(saved.data.length, 1);
    assert.equal(saved.data[0].id, receipt.claim_id);
    assert.equal(new Date(saved.data[0].claimed_at).toISOString(), args.p_claimed_at);
    assert.equal(saved.data[0].received_at, receipt.received_at);
    const changedRetry = await worker.rpc("submit_attendance_offline_claim", {
      ...args, p_event_type: "clock_out",
    });
    assert.equal(changedRetry.error?.message, "Request identifier already used");
    const events = await admin.from("attendance_events").select("id").eq("business_id", businessId);
    assert.ifError(events.error);
    assert.deepEqual(events.data, []);

    const forged = await outsider.rpc("submit_attendance_offline_claim", args);
    assert.equal(forged.error?.message, "Permission denied");
    const outsideList = await outsider.rpc("list_attendance_offline_claims", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    assert.equal(outsideList.error?.message, "Permission denied");
    const outsideRows = await outsider.from("attendance_offline_claims").select("id");
    assert.ifError(outsideRows.error);
    assert.deepEqual(outsideRows.data, []);

    const revocation = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[0]}'::uuid returning user_id`,
      users[0],
    );
    let pendingRevocation;
    try {
      pendingRevocation = Promise.resolve(worker.rpc("submit_attendance_offline_claim", {
        ...args, p_request_id: randomUUID(), p_event_type: "clock_out",
      }));
      await waitForLock("submit_attendance_offline_claim");
      await revocation.release(true);
      const result = await pendingRevocation;
      assert.equal(result.error?.message, "Employee not found or permission denied");
      const revokedRetry = await worker.rpc("submit_attendance_offline_claim", args);
      assert.equal(revokedRetry.error?.message, "Employee not found or permission denied");
    } finally {
      await revocation.release(false);
      await Promise.allSettled([pendingRevocation].filter(Boolean));
    }
    assert.ifError((await admin.from("business_memberships").update({ department_id: fohId })
      .eq("business_id", businessId).eq("user_id", users[0])).error);

    const unlink = await holdLock(
      `update public.employees set auth_user_id = null where id = '${employeeId}'::uuid returning id`,
      employeeId,
    );
    let pendingUnlink;
    try {
      pendingUnlink = Promise.resolve(worker.rpc("submit_attendance_offline_claim", {
        ...args, p_request_id: randomUUID(), p_event_type: "clock_out",
      }));
      await waitForLock("submit_attendance_offline_claim");
      await unlink.release(true);
      const result = await pendingUnlink;
      assert.equal(result.error?.message, "Employee not found or permission denied");
    } finally {
      await unlink.release(false);
      await Promise.allSettled([pendingUnlink].filter(Boolean));
    }
    const count = await admin.from("attendance_events").select("id").eq("business_id", businessId);
    assert.ifError(count.error);
    assert.deepEqual(count.data, []);
  } finally {
    assert.ifError((await admin.from("businesses").delete().in("id", [businessId, outsideBusiness])).error);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
