import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("QR activation, consumption, retries and access changes serialize safely", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 90_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const device = createClient(url, anonKey, options);
  const owner = createClient(url, anonKey, options);
  const workers = [createClient(url, anonKey, options), createClient(url, anonKey, options)];
  const outsider = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [
    businessId, outsideBusinessId, venueId, outsideVenueId, departmentId, otherDepartmentId,
    outsideDepartmentId, firstEmployee, secondEmployee, outsideEmployee,
  ] = Array.from({ length: 10 }, () => randomUUID());
  const employeeIds = [firstEmployee, secondEmployee];
  const users = [];
  const noLocation = {
    p_location_status: "not_provided",
    p_latitude: null,
    p_longitude: null,
    p_accuracy_meters: null,
  };
  const clockIn = (index, code, requestId) => workers[index].rpc("clock_attendance_with_kiosk_code", {
    p_business_id: businessId, p_venue_id: venueId, p_qr_code: code, p_event_type: "clock_in",
    p_employee_id: employeeIds[index], p_department_id: departmentId, p_session_id: null,
    p_request_id: requestId, ...noLocation,
  });
  const clockOut = (index, code, sessionId) => workers[index].rpc("clock_attendance_with_kiosk_code", {
    p_business_id: businessId, p_venue_id: venueId, p_qr_code: code, p_event_type: "clock_out",
    p_employee_id: null, p_department_id: null, p_session_id: sessionId,
    p_request_id: randomUUID(), ...noLocation,
  });

  try {
    for (const role of ["owner", "first", "second", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `qr-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "QR race business" },
      { id: outsideBusinessId, name: "Outside QR race business" },
    ])).error);
    assert.ifError((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "QR venue", timezone: "Australia/Sydney" },
      { id: outsideVenueId, business_id: outsideBusinessId, name: "Outside venue", timezone: "UTC" },
    ])).error);
    assert.ifError((await admin.from("departments").insert([
      { id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: otherDepartmentId, business_id: businessId, venue_id: venueId, name: "BOH" },
      { id: outsideDepartmentId, business_id: outsideBusinessId, venue_id: outsideVenueId, name: "Outside" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: departmentId },
      { business_id: outsideBusinessId, user_id: users[3], role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert([
      { id: firstEmployee, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[1], name: "First QR worker", role_title: "Server" },
      { id: secondEmployee, business_id: businessId, venue_id: venueId, department_id: departmentId,
        auth_user_id: users[2], name: "Second QR worker", role_title: "Server" },
      { id: outsideEmployee, business_id: outsideBusinessId, venue_id: outsideVenueId,
        department_id: outsideDepartmentId, auth_user_id: users[3], name: "Outside worker", role_title: "Owner" },
    ])).error);
    for (const [client, role] of [[owner, "owner"], [workers[0], "first"], [workers[1], "second"], [outsider, "outside"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `qr-race-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const created = await owner.rpc("create_attendance_kiosk", {
      p_business_id: businessId, p_venue_id: venueId, p_name: "Race device",
    });
    assert.ifError(created.error);
    assert.equal(created.data.length, 1);
    const kioskId = created.data[0].kiosk_id;
    const activations = await Promise.all(Array.from({ length: 4 }, () =>
      device.rpc("activate_attendance_kiosk", { p_activation_code: created.data[0].activation_code })));
    assert.equal(activations.filter((result) => !result.error).length, 1);
    for (const result of activations.filter((item) => item.error)) {
      assert.equal(result.error.message, "Kiosk activation is unavailable");
    }
    const sessionCode = activations.find((result) => !result.error).data[0].session_code;
    const issue = () => device.rpc("issue_attendance_kiosk_code", { p_session_code: sessionCode });
    const issued = await Promise.all(Array.from({ length: 4 }, issue));
    for (const result of issued) {
      assert.ifError(result.error);
      assert.equal(result.data[0].business_id, businessId);
      assert.equal(result.data[0].venue_id, venueId);
      const lifetime = Date.parse(result.data[0].expires_at) - Date.parse(result.data[0].server_at);
      assert.ok(lifetime > 0 && lifetime <= 45_000);
    }
    assert.equal(new Set(issued.map((result) => result.data[0].qr_code)).size, 1);
    const firstCode = issued[0].data[0].qr_code;
    const outsideAttempt = await outsider.rpc("clock_attendance_with_kiosk_code", {
      p_business_id: outsideBusinessId, p_venue_id: outsideVenueId, p_qr_code: firstCode,
      p_event_type: "clock_in", p_employee_id: outsideEmployee, p_department_id: outsideDepartmentId,
      p_session_id: null, p_request_id: randomUUID(), ...noLocation,
    });
    assert.equal(outsideAttempt.error?.message, "Kiosk code is invalid or expired");

    const requestIds = [randomUUID(), randomUUID()];
    const competing = await Promise.all([
      clockIn(0, firstCode, requestIds[0]),
      clockIn(1, firstCode, requestIds[1]),
    ]);
    assert.equal(competing.filter((result) => !result.error).length, 1);
    const winner = competing.findIndex((result) => !result.error);
    assert.equal(competing[1 - winner].error?.message, "Kiosk code was already used");
    const firstReceipt = competing[winner].data[0];
    const retries = await Promise.all(Array.from({ length: 6 }, () =>
      clockIn(winner, firstCode, requestIds[winner])));
    for (const result of retries) {
      assert.ifError(result.error);
      assert.deepEqual(result.data[0], firstReceipt);
    }
    let events = await admin.from("attendance_events").select("id, event_type").eq("business_id", businessId);
    assert.ifError(events.error);
    assert.deepEqual(events.data, [{ id: firstReceipt.event_id, event_type: "clock_in" }]);

    const outCode = await issue();
    assert.ifError(outCode.error);
    assert.ok(outCode.data[0].qr_code !== firstCode, "The kiosk rotates a consumed code");
    assert.ifError((await clockOut(winner, outCode.data[0].qr_code, firstReceipt.session_id)).error);

    const membershipCode = await issue();
    assert.ifError(membershipCode.error);
    const membershipRequest = randomUUID();
    const membershipChange = await holdLock(
      `update public.business_memberships set department_id = '${otherDepartmentId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[1]}'::uuid returning user_id`,
      users[1],
    );
    let pendingMembership;
    try {
      pendingMembership = Promise.resolve(clockIn(0, membershipCode.data[0].qr_code, membershipRequest));
      await waitForLock("clock_attendance_with_kiosk_code");
      await membershipChange.release(true);
      assert.equal((await pendingMembership).error?.message, "Employee not found or permission denied");
    } finally {
      await membershipChange.release(false);
      await Promise.allSettled([pendingMembership].filter(Boolean));
    }
    assert.ifError((await admin.from("business_memberships").update({ department_id: departmentId })
      .eq("business_id", businessId).eq("user_id", users[1])).error);
    const afterRestore = await clockIn(0, membershipCode.data[0].qr_code, membershipRequest);
    assert.ifError(afterRestore.error);
    const finalOutCode = await issue();
    assert.ifError(finalOutCode.error);
    assert.ifError((await clockOut(0, finalOutCode.data[0].qr_code, afterRestore.data[0].session_id)).error);

    const revokedCode = await issue();
    assert.ifError(revokedCode.error);
    const revocation = await holdLock(
      `update public.attendance_kiosks set revoked_at = clock_timestamp(), ` +
        `session_hash = null, session_expires_at = null where id = '${kioskId}'::uuid returning id`,
      kioskId,
    );
    let pendingRevocation;
    try {
      pendingRevocation = Promise.resolve(clockIn(0, revokedCode.data[0].qr_code, randomUUID()));
      await waitForLock("clock_attendance_with_kiosk_code");
      await revocation.release(true);
      assert.equal((await pendingRevocation).error?.message, "Kiosk code is invalid or expired");
    } finally {
      await revocation.release(false);
      await Promise.allSettled([pendingRevocation].filter(Boolean));
    }
    assert.equal((await issue()).error?.message, "Kiosk is unavailable");
    events = await admin.from("attendance_events").select("event_type").eq("business_id", businessId);
    assert.ifError(events.error);
    assert.deepEqual(events.data.map((event) => event.event_type).sort(),
      ["clock_in", "clock_in", "clock_out", "clock_out"]);
  } finally {
    await assertBusinessFixturesPreserved(admin, [businessId, outsideBusinessId]);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
