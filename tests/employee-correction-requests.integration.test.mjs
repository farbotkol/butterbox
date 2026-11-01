import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("employee correction requests serialize retries, decisions and scope changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 90_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const clients = Object.fromEntries(
    ["manager", "boh", "worker", "colleague", "outside"].map((role) =>
      [role, createClient(url, anonKey, options)]),
  );
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusiness, venueId, outsideVenue, fohId, bohId, employeeId, colleagueId,
    sessionId, clockInId, clockOutId] = Array.from({ length: 11 }, () => randomUUID());
  const users = [];
  try {
    for (const role of ["manager", "boh", "worker", "colleague", "outside"]) {
      const result = await admin.auth.admin.createUser({
        email: `request-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Request race cafe" },
      { id: outsideBusiness, name: "Other request cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[1], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusiness, user_id: users[4], role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert([
      { id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[2], name: "Request worker", role_title: "Server" },
      { id: colleagueId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[3], name: "Request colleague", role_title: "Server" },
    ])).error);
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
    for (const role of Object.keys(clients)) {
      assert.ifError((await clients[role].auth.signInWithPassword({
        email: `request-race-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const request = {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
      p_employee_id: employeeId, p_actor_id: users[2], p_request_id: randomUUID(),
      p_event_type: "clock_in", p_proposed_at: "2024-01-10T08:45:00.123456Z",
      p_reason: "Forgot to clock in",
    };
    const retries = await Promise.all(Array.from({ length: 8 }, () =>
      clients.worker.rpc("submit_attendance_correction_request", request)));
    for (const result of retries) {
      assert.ifError(result.error);
      assert.equal(result.data[0].claim_id, retries[0].data[0].claim_id);
      assert.equal(result.data[0].received_at, retries[0].data[0].received_at);
    }
    const claimId = retries[0].data[0].claim_id;
    const stored = await clients.worker.from("attendance_offline_claims")
      .select("id, claim_source, request_reason").eq("request_id", request.p_request_id);
    assert.ifError(stored.error);
    assert.deepEqual(stored.data, [{
      id: claimId, claim_source: "employee_request", request_reason: "Forgot to clock in",
    }]);
    const collision = await clients.worker.rpc("submit_attendance_offline_claim", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
      p_employee_id: employeeId, p_actor_id: users[2], p_request_id: request.p_request_id,
      p_event_type: request.p_event_type, p_claimed_at: request.p_proposed_at,
    });
    assert.equal(collision.error?.message, "Request identifier already used");
    for (const role of ["boh", "colleague", "outside"]) {
      const visible = await clients[role].from("attendance_offline_claims").select("id").eq("id", claimId);
      assert.ifError(visible.error);
      assert.deepEqual(visible.data, []);
    }
    const denied = await clients.boh.rpc("review_attendance_offline_claim", {
      p_business_id: businessId, p_venue_id: venueId, p_claim_id: claimId, p_request_id: randomUUID(),
      p_decision: "rejected", p_event_id: null, p_expected_at: null, p_reason: "Out of scope",
    });
    assert.equal(denied.error?.message, "Claim not found or permission denied");

    const decision = {
      p_business_id: businessId, p_venue_id: venueId, p_claim_id: claimId, p_request_id: randomUUID(),
      p_decision: "corrected", p_event_id: clockInId, p_expected_at: "2024-01-10T09:00:00Z",
      p_reason: "Confirmed with employee",
    };
    const decisions = await Promise.all(Array.from({ length: 8 }, () =>
      clients.manager.rpc("review_attendance_offline_claim", decision)));
    for (const result of decisions) {
      assert.ifError(result.error);
      assert.equal(result.data, decisions[0].data);
    }
    const reviews = await clients.manager.from("attendance_offline_claim_reviews")
      .select("id, correction_id, reason").eq("claim_id", claimId);
    assert.ifError(reviews.error);
    assert.equal(reviews.data.length, 1);
    assert.ok(reviews.data[0].correction_id);
    assert.equal(reviews.data[0].reason, decision.p_reason);
    const original = await clients.worker.from("attendance_events").select("occurred_at").eq("id", clockInId).single();
    assert.ifError(original.error);
    assert.equal(new Date(original.data.occurred_at).toISOString(), "2024-01-10T09:00:00.000Z");
    const corrections = await clients.worker.from("attendance_event_corrections")
      .select("id, new_at").eq("event_id", clockInId);
    assert.ifError(corrections.error);
    assert.equal(corrections.data.length, 1);
    assert.match(corrections.data[0].new_at, /08:45:00\.123456/);

    const competingId = randomUUID();
    const competing = await Promise.all([
      clients.worker.rpc("submit_attendance_correction_request", {
        ...request, p_request_id: competingId, p_event_type: "clock_out",
        p_proposed_at: "2024-01-10T17:10:00Z", p_reason: "First explanation",
      }),
      clients.worker.rpc("submit_attendance_correction_request", {
        ...request, p_request_id: competingId, p_event_type: "clock_out",
        p_proposed_at: "2024-01-10T17:10:00Z", p_reason: "Second explanation",
      }),
    ]);
    assert.equal(competing.filter((result) => !result.error).length, 1);
    assert.equal(competing.find((result) => result.error).error.message, "Request identifier already used");
    const pendingClaim = competing.find((result) => !result.error).data[0].claim_id;

    const managerRevocation = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[0]}'::uuid returning user_id`,
      users[0],
    );
    let pendingDecision;
    try {
      pendingDecision = Promise.resolve(clients.manager.rpc("review_attendance_offline_claim", {
        ...decision, p_claim_id: pendingClaim, p_request_id: randomUUID(), p_decision: "rejected",
        p_event_id: null, p_expected_at: null, p_reason: "Access changed",
      }));
      await waitForLock("review_attendance_offline_claim");
      await managerRevocation.release(true);
      assert.equal((await pendingDecision).error?.message, "Claim not found or permission denied");
    } finally {
      await managerRevocation.release(false);
      await Promise.allSettled([pendingDecision].filter(Boolean));
    }

    const employeeRevocation = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[2]}'::uuid returning user_id`,
      users[2],
    );
    let pendingSubmission;
    try {
      pendingSubmission = Promise.resolve(clients.worker.rpc("submit_attendance_correction_request", {
        ...request, p_request_id: randomUUID(), p_reason: "After scope change",
      }));
      await waitForLock("submit_attendance_correction_request");
      await employeeRevocation.release(true);
      assert.equal((await pendingSubmission).error?.message, "Employee not found or permission denied");
    } finally {
      await employeeRevocation.release(false);
      await Promise.allSettled([pendingSubmission].filter(Boolean));
    }
  } finally {
    for (const business of [businessId, outsideBusiness]) {
      assert.ifError((await admin.from("businesses").delete().eq("id", business)).error);
    }
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
