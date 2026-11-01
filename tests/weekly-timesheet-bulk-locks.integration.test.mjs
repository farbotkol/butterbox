import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("weekly bulk locks serialize retries, corrections, reviews, membership and linked-worker changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const owner = createClient(url, anonKey, options);
  const manager = createClient(url, anonKey, options);
  const worker = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, secondVenueId, fohId, bohId, secondDepartmentId, employeeId, linkedEmployeeId] =
    Array.from({ length: 8 }, () => randomUUID());
  const users = [];
  const sessions = Array.from({ length: 9 }, () => randomUUID());
  const clockIns = sessions.map(() => randomUUID());
  let checkId;
  const scope = { p_business_id: businessId, p_venue_id: venueId, p_week_start: "2024-01-08" };
  const start = (index) => new Date(Date.parse("2024-01-08T00:00:00Z") + index * 7_200_000).toISOString();
  const end = (index) => new Date(Date.parse(start(index)) + 3_600_000).toISOString();

  async function selections(ids) {
    const result = await manager.rpc("list_weekly_worked_time_for_edit", scope);
    assert.ifError(result.error);
    const rows = result.data.filter((row) => ids.includes(row.session_id));
    assert.equal(rows.length, ids.length);
    return rows.map((row) => ({ session_id: row.session_id, revision: row.edit_revision }));
  }
  function bulkArgs(selection, requestId = randomUUID()) {
    return { ...scope, p_employee_id: null, p_request_id: requestId,
      p_selections: selection, p_reason: "Reviewed attendance" };
  }
  function correctionArgs(index) {
    return { p_business_id: businessId, p_venue_id: venueId, p_session_id: sessions[index],
      p_event_id: clockIns[index], p_request_id: randomUUID(), p_expected_at: start(index),
      p_new_at: new Date(Date.parse(start(index)) + 60_000).toISOString(), p_reason: "Confirmed change" };
  }
  async function lockHistory(sessionId) {
    const result = await manager.rpc("list_attendance_edit_lock_history", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    assert.ifError(result.error);
    return result.data.filter((row) => row.session_id === sessionId);
  }

  try {
    for (const role of ["owner", "manager", "worker"]) {
      const email = `weekly-bulk-${role}-${suffix}@example.test`;
      const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Bulk race cafe" })).error);
    assert.ifError((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "First", timezone: "Australia/Sydney",
        clock_geofence_enabled: true, geofence_latitude: -33.8688, geofence_longitude: 151.2093,
        geofence_radius_meters: 100 },
      { id: secondVenueId, business_id: businessId, name: "Second", timezone: "Australia/Perth",
        clock_geofence_enabled: false, geofence_latitude: null, geofence_longitude: null, geofence_radius_meters: null },
    ])).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
      { id: secondDepartmentId, business_id: businessId, venue_id: secondVenueId, name: "Second FOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: fohId },
    ])).error);
    assert.ifError((await admin.from("employees").insert([
      { id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[2], name: "Bulk worker", role_title: "Server" },
      { id: linkedEmployeeId, business_id: businessId, venue_id: secondVenueId, department_id: secondDepartmentId,
        name: "Linked worker", role_title: "Server" },
    ])).error);
    assert.ifError((await admin.from("attendance_sessions").insert(sessions.map((id) => ({
      id, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: employeeId, started_by: users[2],
    })))).error);
    const events = sessions.flatMap((sessionId, index) => {
      const event = (id, eventType, occurredAt) => ({
        id, session_id: sessionId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: employeeId, actor_id: users[2], request_id: randomUUID(), event_type: eventType, occurred_at: occurredAt,
      });
      return index === 7 ? [event(clockIns[index], "clock_in", start(index))] : [
        event(clockIns[index], "clock_in", start(index)), event(randomUUID(), "clock_out", end(index)),
      ];
    });
    assert.ifError((await admin.from("attendance_events").insert(events)).error);
    const locationCheck = await admin.from("attendance_location_checks").select("id, verification_status")
      .eq("event_id", clockIns[4]).single();
    assert.ifError(locationCheck.error);
    assert.equal(locationCheck.data.verification_status, "review");
    checkId = locationCheck.data.id;
    for (const [client, role] of [[owner, "owner"], [manager, "manager"], [worker, "worker"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `weekly-bulk-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const firstArgs = bulkArgs(await selections([sessions[0], sessions[7]]));
    const duplicateResults = await Promise.all(Array.from({ length: 6 }, () =>
      manager.rpc("bulk_lock_weekly_attendance", firstArgs)));
    for (const result of duplicateResults) {
      assert.ifError(result.error);
      assert.deepEqual(result.data, duplicateResults[0].data);
    }
    assert.deepEqual({
      locked: duplicateResults[0].data[0].locked_count, invalid: duplicateResults[0].data[0].invalid_count,
      already: duplicateResults[0].data[0].already_locked_count,
    }, { locked: 1, invalid: 1, already: 0 });
    assert.equal((await lockHistory(sessions[0])).length, 1);
    assert.equal((await lockHistory(sessions[7])).length, 0);
    const changedRetry = await manager.rpc("bulk_lock_weekly_attendance", { ...firstArgs, p_reason: "Changed" });
    assert.equal(changedRetry.error?.message, "Request identifier already used");
    const receipt = await manager.rpc("get_weekly_bulk_lock_receipt", {
      p_business_id: businessId, p_venue_id: venueId, p_batch_id: duplicateResults[0].data[0].batch_id,
    });
    assert.ifError(receipt.error);
    assert.equal(receipt.data[0].week_start, scope.p_week_start);
    assert.equal((await worker.rpc("get_weekly_bulk_lock_receipt", {
      p_business_id: businessId, p_venue_id: venueId, p_batch_id: duplicateResults[0].data[0].batch_id,
    })).error?.message, "Bulk attendance receipt not found or permission denied");

    const individualArgs = bulkArgs(await selections([sessions[1]]));
    const individualLock = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[1]}', true); set local role authenticated; ` +
      `select public.set_attendance_edit_lock('${businessId}'::uuid, '${venueId}'::uuid, ` +
      `'${sessions[1]}'::uuid, '${randomUUID()}'::uuid, true, 'Individual review')`,
    );
    try {
      const busy = await manager.rpc("bulk_lock_weekly_attendance", individualArgs);
      assert.equal(busy.error?.message, "Attendance changed; review again");
      await individualLock.release(true);
      const result = await manager.rpc("bulk_lock_weekly_attendance", individualArgs);
      assert.ifError(result.error);
      assert.equal(result.data[0].already_locked_count, 1);
      assert.equal((await lockHistory(sessions[1])).length, 1);
    } finally {
      await individualLock.release(false);
    }

    const staleArgs = bulkArgs(await selections([sessions[2]]));
    const correction = correctionArgs(2);
    const correcting = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[1]}', true); set local role authenticated; ` +
      `select public.correct_attendance_event('${businessId}'::uuid, '${venueId}'::uuid, '${sessions[2]}'::uuid, ` +
      `'${clockIns[2]}'::uuid, '${correction.p_request_id}'::uuid, '${correction.p_expected_at}'::timestamptz, ` +
      `'${correction.p_new_at}'::timestamptz, 'Confirmed change')`,
    );
    try {
      const busy = await manager.rpc("bulk_lock_weekly_attendance", staleArgs);
      assert.equal(busy.error?.message, "Attendance changed; review again");
      await correcting.release(true);
      const stale = await manager.rpc("bulk_lock_weekly_attendance", staleArgs);
      assert.equal(stale.error?.message, "Attendance changed; review again");
      assert.equal((await lockHistory(sessions[2])).length, 0);
      const fresh = await manager.rpc("bulk_lock_weekly_attendance", {
        ...staleArgs, p_selections: await selections([sessions[2]]),
      });
      assert.ifError(fresh.error);
      assert.equal(fresh.data[0].locked_count, 1);
    } finally {
      await correcting.release(false);
    }

    const beforeCorrection = bulkArgs(await selections([sessions[3]]));
    const bulkFirst = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[1]}', true); set local role authenticated; ` +
      `select * from public.bulk_lock_weekly_attendance('${businessId}'::uuid, '${venueId}'::uuid, ` +
      `'${scope.p_week_start}'::date, null, '${beforeCorrection.p_request_id}'::uuid, ` +
      `'${JSON.stringify(beforeCorrection.p_selections)}'::jsonb, 'Reviewed attendance')`,
    );
    let pendingCorrection;
    try {
      pendingCorrection = Promise.resolve(manager.rpc("correct_attendance_event", correctionArgs(3)));
      await waitForLock("correct_attendance_event");
      await bulkFirst.release(true);
      assert.equal((await pendingCorrection).error?.message, "Attendance edits are locked");
    } finally {
      await bulkFirst.release(false);
      await Promise.allSettled([pendingCorrection].filter(Boolean));
    }

    const locationArgs = bulkArgs(await selections([sessions[4]]));
    const locationReview = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[1]}', true); set local role authenticated; ` +
      `select public.review_attendance_location_exception('${businessId}'::uuid, '${checkId}'::uuid)`,
    );
    try {
      const busy = await manager.rpc("bulk_lock_weekly_attendance", locationArgs);
      assert.equal(busy.error?.message, "Attendance changed; review again");
      await locationReview.release(true);
      const stale = await manager.rpc("bulk_lock_weekly_attendance", locationArgs);
      assert.equal(stale.error?.message, "Attendance changed; review again");
      const fresh = await manager.rpc("bulk_lock_weekly_attendance", {
        ...locationArgs, p_selections: await selections([sessions[4]]),
      });
      assert.ifError(fresh.error);
      assert.equal(fresh.data[0].locked_count, 1);
    } finally {
      await locationReview.release(false);
    }

    const scopeArgs = bulkArgs(await selections([sessions[5]]));
    const revocation = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
      `where business_id = '${businessId}'::uuid and user_id = '${users[1]}'::uuid returning user_id`, users[1],
    );
    let pendingRevocation;
    try {
      pendingRevocation = Promise.resolve(manager.rpc("bulk_lock_weekly_attendance", scopeArgs));
      await waitForLock("bulk_lock_weekly_attendance");
      await revocation.release(true);
      assert.equal((await pendingRevocation).error?.message, "Selected attendance not found or permission denied");
    } finally {
      await revocation.release(false);
      await Promise.allSettled([pendingRevocation].filter(Boolean));
    }
    assert.ifError((await admin.from("business_memberships").update({ department_id: fohId })
      .eq("business_id", businessId).eq("user_id", users[1])).error);
    assert.equal((await lockHistory(sessions[5])).length, 0);

    assert.ifError((await owner.rpc("link_shared_worker_profiles", {
      p_business_id: businessId, p_venue_id: venueId, p_employee_id: employeeId,
      p_other_employee_id: linkedEmployeeId,
    })).error);
    const groupId = await sql(
      `select shared_worker_id from public.shared_worker_profiles where employee_id = '${employeeId}'::uuid`,
    );
    assert.match(groupId, /^[0-9a-f-]{36}$/);
    const linkedArgs = bulkArgs(await selections([sessions[6]]));
    const groupLock = await holdLock(`select pg_advisory_xact_lock(hashtextextended('shared-worker:${groupId}', 0))`);
    try {
      const busy = await manager.rpc("bulk_lock_weekly_attendance", linkedArgs);
      assert.equal(busy.error?.message, "Attendance changed; review again");
      await groupLock.release(true);
      const result = await manager.rpc("bulk_lock_weekly_attendance", linkedArgs);
      assert.ifError(result.error);
      assert.equal(result.data[0].locked_count, 1);
    } finally {
      await groupLock.release(false);
    }

    const competingSelection = await selections([sessions[8]]);
    const competing = await Promise.all([manager, owner].map((client) =>
      client.rpc("bulk_lock_weekly_attendance", bulkArgs(competingSelection))));
    assert.equal(competing.filter((result) => !result.error && result.data[0].locked_count === 1).length, 1);
    for (const result of competing) {
      if (result.error) assert.equal(result.error.message, "Attendance changed; review again");
      else if (result.data[0].locked_count === 0) assert.equal(result.data[0].already_locked_count, 1);
    }
    assert.equal((await lockHistory(sessions[8])).length, 1);
  } finally {
    assert.ifError((await admin.from("businesses").delete().eq("id", businessId)).error);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
