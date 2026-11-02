import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("location checks and scoped reviews remain atomic across retries and policy changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 90_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const owner = createClient(url, anonKey, options);
  const worker = createClient(url, anonKey, options);
  const manager = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, fohId, bohId, employeeId] = Array.from({ length: 5 }, () => randomUUID());
  const users = [];
  const position = {
    p_location_status: "position", p_latitude: -33.8688, p_longitude: 151.2093, p_accuracy_meters: 10,
  };
  const denied = {
    p_location_status: "permission_denied", p_latitude: null, p_longitude: null, p_accuracy_meters: null,
  };
  const inArgs = (requestId, location) => ({
    p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
    p_employee_id: employeeId, p_request_id: requestId, ...location,
  });
  const outArgs = (sessionId, requestId, location) => ({
    p_business_id: businessId, p_session_id: sessionId, p_request_id: requestId, ...location,
  });

  try {
    for (const role of ["owner", "worker", "manager"]) {
      const result = await admin.auth.admin.createUser({
        email: `location-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Location race cafe" })).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
      geofence_latitude: -33.8688, geofence_longitude: 151.2093, geofence_radius_meters: 100,
    })).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "foh_manager", venue_id: venueId, department_id: fohId },
    ])).error);
    assert.ifError((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users[1], name: "Location worker", role_title: "Server",
    })).error);
    for (const [client, role] of [[owner, "owner"], [worker, "worker"], [manager, "manager"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `location-race-${role}-${suffix}@example.test`, password,
      })).error);
    }
    assert.ifError((await owner.rpc("set_venue_clock_geofence", {
      p_business_id: businessId, p_venue_id: venueId, p_enabled: true,
    })).error);

    const requestId = randomUUID();
    const retries = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      worker.rpc("clock_in_attendance_with_location", inArgs(requestId, index % 2 ? denied : position))));
    for (const result of retries) assert.ifError(result.error);
    const started = retries[0].data[0];
    for (const result of retries) assert.deepEqual(result.data[0], started);
    const originalCheck = await admin.from("attendance_location_checks")
      .select("event_id, verification_status, reason").eq("event_id", started.event_id);
    assert.ifError(originalCheck.error);
    assert.deepEqual(originalCheck.data, [{
      event_id: started.event_id, verification_status: started.location_status, reason: started.location_reason,
    }]);

    const outRequest = randomUUID();
    const outRetries = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      worker.rpc("clock_out_attendance_with_location",
        outArgs(started.session_id, outRequest, index % 2 ? denied : position))));
    for (const result of outRetries) assert.ifError(result.error);
    for (const result of outRetries) assert.deepEqual(result.data[0], outRetries[0].data[0]);
    const firstSessionChecks = await admin.from("attendance_location_checks").select("event_id")
      .eq("session_id", started.session_id);
    assert.ifError(firstSessionChecks.error);
    assert.equal(firstSessionChecks.data.length, 2);

    const disabling = await holdLock(
      `update public.venues set clock_geofence_enabled = false where id = '${venueId}'::uuid returning id`, venueId,
    );
    let pendingDisable;
    try {
      pendingDisable = Promise.resolve(worker.rpc("clock_in_attendance_with_location", inArgs(randomUUID(), denied)));
      await waitForLock("clock_in_attendance_with_location");
      await disabling.release(true);
      const result = await pendingDisable;
      assert.ifError(result.error);
      assert.equal(result.data[0].location_status, "not_required");
      assert.equal(result.data[0].location_reason, "disabled");
      assert.ifError((await worker.rpc("clock_out_attendance_with_location",
        outArgs(result.data[0].session_id, randomUUID(), denied))).error);
    } finally {
      await disabling.release(false);
      await Promise.allSettled([pendingDisable].filter(Boolean));
    }

    const enabling = await holdLock(
      `update public.venues set clock_geofence_enabled = true where id = '${venueId}'::uuid returning id`, venueId,
    );
    let pendingEnable;
    let openSession;
    try {
      pendingEnable = Promise.resolve(worker.rpc("clock_in_attendance_with_location", inArgs(randomUUID(), denied)));
      await waitForLock("clock_in_attendance_with_location");
      await enabling.release(true);
      const result = await pendingEnable;
      assert.ifError(result.error);
      assert.equal(result.data[0].location_status, "review");
      assert.equal(result.data[0].location_reason, "permission_denied");
      openSession = result.data[0].session_id;
      const exception = await admin.from("attendance_location_checks").select("id")
        .eq("event_id", result.data[0].event_id).single();
      assert.ifError(exception.error);
      const reviews = await Promise.all(Array.from({ length: 6 }, () =>
        manager.rpc("review_attendance_location_exception", {
          p_business_id: businessId, p_check_id: exception.data.id,
        })));
      for (const review of reviews) assert.ifError(review.error);
      assert.equal(new Set(reviews.map((review) => review.data)).size, 1);
      const reviewRows = await admin.from("attendance_location_reviews").select("id, actor_id")
        .eq("check_id", exception.data.id);
      assert.ifError(reviewRows.error);
      assert.deepEqual(reviewRows.data, [{ id: reviews[0].data, actor_id: users[2] }]);
    } finally {
      await enabling.release(false);
      await Promise.allSettled([pendingEnable].filter(Boolean));
    }

    const revocation = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[1]}'::uuid returning user_id`,
      users[1],
    );
    let pendingRevocation;
    try {
      pendingRevocation = Promise.resolve(worker.rpc("clock_out_attendance_with_location",
        outArgs(openSession, randomUUID(), position)));
      await waitForLock("clock_out_attendance_with_location");
      await revocation.release(true);
      const result = await pendingRevocation;
      assert.equal(result.error?.message, "Session not found or permission denied");
      const events = await admin.from("attendance_events").select("event_type").eq("session_id", openSession);
      assert.ifError(events.error);
      assert.deepEqual(events.data, [{ event_type: "clock_in" }]);
    } finally {
      await revocation.release(false);
      await Promise.allSettled([pendingRevocation].filter(Boolean));
    }
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
