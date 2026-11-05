import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("business deletion is rejected across tenants and during a clock-in", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 90_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const owner = createClient(url, anonKey, options);
  const worker = createClient(url, anonKey, options);
  const outsideOwner = createClient(url, anonKey, options);
  const anonymous = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, departmentId, employeeId] =
    Array.from({ length: 5 }, () => randomUUID());
  const users = [];
  const preservationError = "Business deletion is disabled while record preservation requirements remain unresolved";

  try {
    for (const role of ["owner", "worker", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `preservation-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Preservation test business" },
      { id: outsideId, name: "Other preservation test business" },
    ])).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Venue", timezone: "UTC",
    })).error);
    assert.ifError((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee",
        venue_id: venueId, department_id: departmentId },
      { business_id: outsideId, user_id: users[2], role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId,
      department_id: departmentId, auth_user_id: users[1], name: "Worker", role_title: "Server",
    })).error);
    for (const [client, role] of [[owner, "owner"], [worker, "worker"], [outsideOwner, "outside"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `preservation-${role}-${suffix}@example.test`, password,
      })).error);
    }

    for (const [client, target] of [
      [owner, businessId], [owner, outsideId], [worker, businessId], [anonymous, businessId],
    ]) {
      const denied = await client.from("businesses").delete().eq("id", target);
      assert.equal(denied.error?.code, "42501");
    }
    const crossTenant = await outsideOwner.from("businesses").select("id").eq("id", businessId);
    assert.ifError(crossTenant.error);
    assert.deepEqual(crossTenant.data, []);

    const lock = await holdLock(
      `select id from public.businesses where id = '${businessId}'::uuid for key share`,
      businessId,
    );
    let deletion;
    let clockIn;
    try {
      deletion = Promise.resolve(admin.from("businesses").delete().eq("id", businessId));
      await waitForLock("businesses");
      clockIn = Promise.resolve(worker.rpc("clock_in_attendance", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: departmentId,
        p_employee_id: employeeId, p_request_id: randomUUID(),
      }));
      await lock.release(true);
      const [deleteResult, clockResult] = await Promise.all([deletion, clockIn]);
      assert.equal(deleteResult.error?.code, "P0001");
      assert.equal(deleteResult.error?.message, preservationError);
      assert.ifError(clockResult.error);
      assert.equal(clockResult.data.length, 1);
      const { session_id: sessionId, event_id: eventId, occurred_at: occurredAt } = clockResult.data[0];

      const retry = await admin.from("businesses").delete().in("id", [businessId, outsideId]);
      assert.equal(retry.error?.code, "P0001");
      assert.equal(retry.error?.message, preservationError);
      const businesses = await admin.from("businesses").select("id").in("id", [businessId, outsideId]);
      assert.ifError(businesses.error);
      assert.deepEqual(businesses.data.map(({ id }) => id).sort(), [businessId, outsideId].sort());
      const original = await admin.from("attendance_events").select("id, event_type, occurred_at")
        .eq("session_id", sessionId);
      assert.ifError(original.error);
      assert.deepEqual(original.data, [{ id: eventId, event_type: "clock_in", occurred_at: occurredAt }]);
      const hidden = await outsideOwner.from("attendance_events").select("id").eq("session_id", sessionId);
      assert.ifError(hidden.error);
      assert.deepEqual(hidden.data, []);

      const clockOut = await worker.rpc("clock_out_attendance", {
        p_business_id: businessId, p_session_id: sessionId, p_request_id: randomUUID(),
      });
      assert.ifError(clockOut.error);
      const events = await admin.from("attendance_events").select("id, event_type, occurred_at")
        .eq("session_id", sessionId);
      assert.ifError(events.error);
      assert.deepEqual(events.data.find(({ id }) => id === eventId), original.data[0]);
      assert.deepEqual(events.data.map(({ event_type: type }) => type).sort(), ["clock_in", "clock_out"]);
    } finally {
      await lock.release(false);
      await Promise.allSettled([deletion, clockIn].filter(Boolean));
    }
  } finally {
    try {
      await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    } finally {
      for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
    }
  }
});
