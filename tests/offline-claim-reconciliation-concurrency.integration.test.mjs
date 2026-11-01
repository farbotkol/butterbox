import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("offline claim decisions serialize retries, edit locks and access changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 90_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const owner = createClient(url, anonKey, options);
  const manager = createClient(url, anonKey, options);
  const worker = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, fohId, bohId, employeeId, sessionId, clockInId, clockOutId] =
    Array.from({ length: 8 }, () => randomUUID());
  const users = [];
  try {
    for (const role of ["owner", "manager", "worker"]) {
      const result = await admin.auth.admin.createUser({
        email: `claim-review-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Claim review race cafe" })).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: fohId },
    ])).error);
    assert.ifError((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users[2], name: "Claim review worker", role_title: "Server",
    })).error);
    assert.ifError((await admin.from("attendance_sessions").insert({
      id: sessionId, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: employeeId, started_by: users[2],
    })).error);
    assert.ifError((await admin.from("attendance_events").insert([
      { id: clockInId, session_id: sessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[2], request_id: randomUUID(),
        event_type: "clock_in", occurred_at: "2024-01-10T09:00:00Z" },
      { id: clockOutId, session_id: sessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[2], request_id: randomUUID(),
        event_type: "clock_out", occurred_at: "2024-01-10T17:00:00Z" },
    ])).error);
    for (const [client, role] of [[owner, "owner"], [manager, "manager"], [worker, "worker"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `claim-review-race-${role}-${suffix}@example.test`, password,
      })).error);
    }
    const claims = [];
    for (const [eventType, claimedAt] of [
      ["clock_in", "2024-01-10T08:45:00Z"],
      ["clock_out", "2024-01-10T17:00:00Z"],
      ["clock_out", "2024-01-10T17:20:00Z"],
      ["clock_in", "2024-01-10T08:00:00Z"],
      ["clock_in", "2024-01-10T08:30:00Z"],
    ]) {
      const result = await worker.rpc("submit_attendance_offline_claim", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
        p_employee_id: employeeId, p_actor_id: users[2], p_request_id: randomUUID(),
        p_event_type: eventType, p_claimed_at: claimedAt,
      });
      assert.ifError(result.error);
      claims.push(result.data[0].claim_id);
    }
    const args = {
      p_business_id: businessId, p_venue_id: venueId, p_claim_id: claims[0], p_request_id: randomUUID(),
      p_decision: "corrected", p_event_id: clockInId, p_expected_at: "2024-01-10T09:00:00Z",
      p_reason: "Confirmed",
    };
    const retries = await Promise.all(Array.from({ length: 8 }, () =>
      manager.rpc("review_attendance_offline_claim", args)));
    for (const result of retries) {
      assert.ifError(result.error);
      assert.equal(result.data, retries[0].data);
    }
    const reviews = await manager.from("attendance_offline_claim_reviews").select("id, correction_id");
    assert.ifError(reviews.error);
    assert.equal(reviews.data.length, 1);
    assert.ok(reviews.data[0].correction_id);
    const corrections = await manager.from("attendance_event_corrections").select("id");
    assert.ifError(corrections.error);
    assert.equal(corrections.data.length, 1);

    const competing = await Promise.all([
      manager.rpc("review_attendance_offline_claim", {
        ...args, p_claim_id: claims[1], p_request_id: randomUUID(), p_decision: "rejected",
        p_event_id: null, p_expected_at: null, p_reason: "Duplicate",
      }),
      manager.rpc("review_attendance_offline_claim", {
        ...args, p_claim_id: claims[1], p_request_id: randomUUID(), p_decision: "matched",
        p_event_id: clockOutId, p_expected_at: "2024-01-10T17:00:00Z", p_reason: "Already recorded",
      }),
    ]);
    assert.equal(competing.filter((result) => !result.error).length, 1);
    assert.equal(competing.find((result) => result.error).error.message, "Claim has already been reviewed");

    const locking = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[0]}', true); ` +
        `set local role authenticated; select public.set_attendance_edit_lock(` +
        `'${businessId}'::uuid, '${venueId}'::uuid, '${sessionId}'::uuid, '${randomUUID()}'::uuid, true, 'Reviewed')`,
    );
    let pendingLock;
    try {
      pendingLock = Promise.resolve(manager.rpc("review_attendance_offline_claim", {
        ...args, p_claim_id: claims[2], p_request_id: randomUUID(), p_event_id: clockOutId,
        p_expected_at: "2024-01-10T17:00:00Z", p_reason: "Locked race",
      }));
      await waitForLock("review_attendance_offline_claim");
      await locking.release(true);
      assert.equal((await pendingLock).error?.message, "Attendance edits are locked");
    } finally {
      await locking.release(false);
      await Promise.allSettled([pendingLock].filter(Boolean));
    }

    const revocation = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[1]}'::uuid returning user_id`,
      users[1],
    );
    let pendingRevocation;
    try {
      pendingRevocation = Promise.resolve(manager.rpc("review_attendance_offline_claim", {
        ...args, p_claim_id: claims[3], p_request_id: randomUUID(), p_decision: "rejected",
        p_event_id: null, p_expected_at: null, p_reason: "Access changed",
      }));
      await waitForLock("review_attendance_offline_claim");
      await revocation.release(true);
      assert.equal((await pendingRevocation).error?.message, "Claim not found or permission denied");
    } finally {
      await revocation.release(false);
      await Promise.allSettled([pendingRevocation].filter(Boolean));
    }
    assert.ifError((await admin.from("business_memberships").update({ department_id: fohId })
      .eq("business_id", businessId).eq("user_id", users[1])).error);
    assert.ifError((await owner.rpc("set_attendance_edit_lock", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: sessionId,
      p_request_id: randomUUID(), p_locked: false, p_reason: "Reopen",
    })).error);

    const reviewing = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[1]}', true); ` +
        `set local role authenticated; select public.review_attendance_offline_claim(` +
        `'${businessId}'::uuid, '${venueId}'::uuid, '${claims[4]}'::uuid, '${randomUUID()}'::uuid, ` +
        `'corrected', '${clockInId}'::uuid, '2024-01-10T08:45:00Z'::timestamptz, 'Checked')`,
    );
    let pendingClock;
    try {
      pendingClock = Promise.resolve(worker.rpc("clock_in_attendance", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
        p_employee_id: employeeId, p_request_id: randomUUID(),
      }));
      await waitForLock("clock_in_attendance");
      await reviewing.release(true);
      const clock = await pendingClock;
      assert.ifError(clock.error);
      assert.ifError((await worker.rpc("clock_out_attendance", {
        p_business_id: businessId, p_session_id: clock.data[0].session_id, p_request_id: randomUUID(),
      })).error);
    } finally {
      await reviewing.release(false);
      await Promise.allSettled([pendingClock].filter(Boolean));
    }
    const originals = await admin.from("attendance_events").select("occurred_at").eq("id", clockInId).single();
    assert.ifError(originals.error);
    assert.equal(new Date(originals.data.occurred_at).toISOString(), "2024-01-10T09:00:00.000Z");
  } finally {
    assert.ifError((await admin.from("businesses").delete().eq("id", businessId)).error);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
