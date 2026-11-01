import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("attendance corrections serialize retries, edit locks and permission changes", {
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
        email: `correction-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Correction race cafe" })).error);
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
      auth_user_id: users[2], name: "Correction worker", role_title: "Server",
    })).error);
    assert.ifError((await admin.from("attendance_sessions").insert({
      id: sessionId, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: employeeId, started_by: users[2],
    })).error);
    assert.ifError((await admin.from("attendance_events").insert([
      { id: clockInId, session_id: sessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[2],
        request_id: randomUUID(), event_type: "clock_in", occurred_at: "2024-01-10T09:00:00Z" },
      { id: clockOutId, session_id: sessionId, business_id: businessId, venue_id: venueId,
        department_id: fohId, employee_id: employeeId, actor_id: users[2],
        request_id: randomUUID(), event_type: "clock_out", occurred_at: "2024-01-10T17:00:00Z" },
    ])).error);
    for (const [client, role] of [[owner, "owner"], [manager, "manager"], [worker, "worker"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `correction-race-${role}-${suffix}@example.test`, password,
      })).error);
    }
    const args = {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: sessionId,
      p_event_id: clockInId, p_request_id: randomUUID(), p_expected_at: "2024-01-10T09:00:00Z",
      p_new_at: "2024-01-10T08:30:00Z", p_reason: "Forgot to clock",
    };
    const duplicates = await Promise.all(Array.from({ length: 8 }, () =>
      manager.rpc("correct_attendance_event", args)));
    for (const result of duplicates) {
      assert.ifError(result.error);
      assert.equal(result.data, duplicates[0].data);
    }
    const initialHistory = await manager.from("attendance_event_corrections").select("id");
    assert.ifError(initialHistory.error);
    assert.equal(initialHistory.data.length, 1);
    const competingArgs = ["2024-01-10T08:40:00Z", "2024-01-10T08:45:00Z"].map((time) => ({
      ...args, p_request_id: randomUUID(), p_expected_at: args.p_new_at, p_new_at: time, p_reason: "Second correction",
    }));
    const competing = await Promise.all(competingArgs.map((value) =>
      manager.rpc("correct_attendance_event", value)));
    assert.equal(competing.filter((result) => !result.error).length, 1);
    assert.equal(competing.find((result) => result.error).error.message, "Attendance changed; refresh before correcting");
    const effective = competingArgs[competing.findIndex((result) => !result.error)].p_new_at;

    const lockRequest = randomUUID();
    const locking = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[1]}', true); ` +
        `set local role authenticated; select public.set_attendance_edit_lock(` +
        `'${businessId}'::uuid, '${venueId}'::uuid, '${sessionId}'::uuid, '${lockRequest}'::uuid, true, 'Reviewed')`,
    );
    let pendingCorrection;
    try {
      pendingCorrection = Promise.resolve(manager.rpc("correct_attendance_event", {
        ...args, p_request_id: randomUUID(), p_expected_at: effective,
        p_new_at: "2024-01-10T08:50:00Z", p_reason: "Locked race",
      }));
      await waitForLock("correct_attendance_event");
      await locking.release(true);
      const result = await pendingCorrection;
      assert.equal(result.error?.message, "Attendance edits are locked");
    } finally {
      await locking.release(false);
      await Promise.allSettled([pendingCorrection].filter(Boolean));
    }
    const workerHistory = await worker.rpc("list_attendance_corrections", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    assert.ifError(workerHistory.error);
    assert.equal(workerHistory.data.length, 2);
    assert.ifError((await owner.rpc("set_attendance_edit_lock", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: sessionId,
      p_request_id: randomUUID(), p_locked: false, p_reason: "Reopen",
    })).error);

    const revocation = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[1]}'::uuid returning user_id`,
      users[1],
    );
    let pendingRevocation;
    try {
      pendingRevocation = Promise.resolve(manager.rpc("correct_attendance_event", {
        ...args, p_request_id: randomUUID(), p_expected_at: effective,
        p_new_at: "2024-01-10T08:50:00Z", p_reason: "Access changed",
      }));
      await waitForLock("correct_attendance_event");
      await revocation.release(true);
      const result = await pendingRevocation;
      assert.equal(result.error?.message, "Session not found or permission denied");
    } finally {
      await revocation.release(false);
      await Promise.allSettled([pendingRevocation].filter(Boolean));
    }
    assert.ifError((await admin.from("business_memberships").update({ department_id: fohId })
      .eq("business_id", businessId).eq("user_id", users[1])).error);

    const correctionRequest = randomUUID();
    const correcting = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[1]}', true); ` +
        `set local role authenticated; select public.correct_attendance_event(` +
        `'${businessId}'::uuid, '${venueId}'::uuid, '${sessionId}'::uuid, '${clockInId}'::uuid, ` +
        `'${correctionRequest}'::uuid, '${effective}'::timestamptz, '2024-01-10T08:50:00Z'::timestamptz, 'Verified')`,
    );
    let pendingClock;
    try {
      pendingClock = Promise.resolve(worker.rpc("clock_in_attendance", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
        p_employee_id: employeeId, p_request_id: randomUUID(),
      }));
      await waitForLock("clock_in_attendance");
      await correcting.release(true);
      const clock = await pendingClock;
      assert.ifError(clock.error);
      assert.ifError((await worker.rpc("clock_out_attendance", {
        p_business_id: businessId, p_session_id: clock.data[0].session_id, p_request_id: randomUUID(),
      })).error);
    } finally {
      await correcting.release(false);
      await Promise.allSettled([pendingClock].filter(Boolean));
    }
    const originals = await admin.from("attendance_events").select("id, occurred_at")
      .in("id", [clockInId, clockOutId]);
    assert.ifError(originals.error);
    assert.equal(new Date(originals.data.find((event) => event.id === clockInId).occurred_at).toISOString(),
      "2024-01-10T09:00:00.000Z");
    const finalHistory = await worker.rpc("list_attendance_corrections", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    assert.ifError(finalHistory.error);
    assert.equal(finalHistory.data.length, 3);

    const relinked = createClient(url, anonKey, options);
    const newWorker = await admin.auth.admin.createUser({
      email: `correction-race-relinked-${suffix}@example.test`, password, email_confirm: true,
    });
    assert.ifError(newWorker.error);
    users.push(newWorker.data.user.id);
    assert.ifError((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: users[3], role: "employee",
      venue_id: venueId, department_id: fohId,
    })).error);
    assert.ifError((await admin.from("employees").update({ auth_user_id: users[3] })
      .eq("id", employeeId)).error);
    assert.ifError((await relinked.auth.signInWithPassword({
      email: `correction-race-relinked-${suffix}@example.test`, password,
    })).error);

    const relinkedCorrection = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[1]}', true); ` +
        `set local role authenticated; select public.correct_attendance_event(` +
        `'${businessId}'::uuid, '${venueId}'::uuid, '${sessionId}'::uuid, '${clockInId}'::uuid, ` +
        `'${randomUUID()}'::uuid, '2024-01-10T08:50:00Z'::timestamptz, ` +
        `'2024-01-10T08:55:00Z'::timestamptz, 'Relinked worker correction')`,
    );
    let relinkedClock;
    try {
      relinkedClock = Promise.resolve(relinked.rpc("clock_in_attendance", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
        p_employee_id: employeeId, p_request_id: randomUUID(),
      }));
      await waitForLock("clock_in_attendance");
      await relinkedCorrection.release(true);
      const clock = await relinkedClock;
      assert.ifError(clock.error);
      assert.ifError((await relinked.rpc("clock_out_attendance", {
        p_business_id: businessId, p_session_id: clock.data[0].session_id, p_request_id: randomUUID(),
      })).error);
    } finally {
      await relinkedCorrection.release(false);
      await Promise.allSettled([relinkedClock].filter(Boolean));
    }
  } finally {
    assert.ifError((await admin.from("businesses").delete().eq("id", businessId)).error);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
