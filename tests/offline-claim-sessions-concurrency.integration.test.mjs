import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("offline attendance reconciliation serializes retries, decisions, permissions and clocking", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 90_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { holdLock, waitForLock, sql } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const manager = createClient(url, anonKey, options);
  const worker = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, fohId, bohId, employeeId] = Array.from({ length: 5 }, () => randomUUID());
  const users = [];
  try {
    for (const role of ["manager", "worker"]) {
      const result = await admin.auth.admin.createUser({
        email: `offline-pair-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Offline pair race cafe" })).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "UTC",
    })).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[1], role: "employee", venue_id: venueId, department_id: fohId },
    ])).error);
    assert.ifError((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users[1], name: "Pair race worker", role_title: "Server",
    })).error);
    for (const [client, role] of [[manager, "manager"], [worker, "worker"]]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `offline-pair-${role}-${suffix}@example.test`, password,
      })).error);
    }
    async function claim(type, time) {
      const result = await worker.rpc("submit_attendance_offline_claim", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
        p_employee_id: employeeId, p_actor_id: users[1], p_request_id: randomUUID(),
        p_event_type: type, p_claimed_at: time,
      });
      assert.ifError(result.error);
      return result.data[0].claim_id;
    }
    function pair(start, end) {
      return {
        p_business_id: businessId, p_venue_id: venueId, p_clock_in_claim_id: start,
        p_clock_out_claim_id: end, p_request_id: randomUUID(), p_reason: "Confirmed with worker",
        p_acknowledge_unverified: true,
      };
    }
    async function clockOutFixture() {
      const id = randomUUID();
      await sql(
        `insert into public.attendance_offline_claims ` +
          `(id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, claimed_at) ` +
          `values ('${id}', '${businessId}', '${venueId}', '${fohId}', '${employeeId}', '${users[1]}', ` +
          `'${randomUUID()}', 'clock_out', clock_timestamp())`,
      );
      return id;
    }
    function complete(claimId, sessionId) {
      return {
        p_business_id: businessId, p_venue_id: venueId, p_claim_id: claimId, p_session_id: sessionId,
        p_request_id: randomUUID(), p_reason: "Confirmed with worker", p_acknowledge_unverified: true,
      };
    }
    async function clockIn() {
      const result = await worker.rpc("clock_in_attendance", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
        p_employee_id: employeeId, p_request_id: randomUUID(),
      });
      assert.ifError(result.error);
      return result.data[0].session_id;
    }
    const first = pair(await claim("clock_in", "2024-01-10T09:00:00Z"),
      await claim("clock_out", "2024-01-10T17:00:00Z"));
    const retries = await Promise.all(Array.from({ length: 8 }, () =>
      manager.rpc("create_attendance_from_offline_claims", first)));
    for (const result of retries) {
      assert.ifError(result.error);
      assert.equal(result.data, retries[0].data);
    }
    const paired = await manager.from("attendance_offline_claim_sessions").select("session_id");
    assert.ifError(paired.error);
    assert.equal(paired.data.length, 1);
    const reviews = await manager.from("attendance_offline_claim_reviews").select("decision");
    assert.ifError(reviews.error);
    assert.deepEqual(reviews.data.map((row) => row.decision), ["created", "created"]);

    const competing = pair(await claim("clock_in", "2024-01-11T09:00:00Z"),
      await claim("clock_out", "2024-01-11T17:00:00Z"));
    const decisionRace = await Promise.all([
      manager.rpc("create_attendance_from_offline_claims", competing),
      manager.rpc("review_attendance_offline_claim", {
        p_business_id: businessId, p_venue_id: venueId, p_claim_id: competing.p_clock_out_claim_id,
        p_request_id: randomUUID(), p_decision: "rejected", p_event_id: null,
        p_expected_at: null, p_reason: "Duplicate",
      }),
    ]);
    assert.equal(decisionRace.filter((result) => !result.error).length, 1);
    assert.ok(["A claim has already been reviewed", "Claim has already been reviewed"]
      .includes(decisionRace.find((result) => result.error).error.message));

    const start = await claim("clock_in", "2024-01-12T09:00:00Z");
    const endA = await claim("clock_out", "2024-01-12T16:00:00Z");
    const endB = await claim("clock_out", "2024-01-12T17:00:00Z");
    const pairRace = await Promise.all([
      manager.rpc("create_attendance_from_offline_claims", pair(start, endA)),
      manager.rpc("create_attendance_from_offline_claims", pair(start, endB)),
    ]);
    assert.equal(pairRace.filter((result) => !result.error).length, 1);
    assert.equal(pairRace.find((result) => result.error).error.message, "A claim already created attendance");

    const revoked = pair(await claim("clock_in", "2024-01-13T09:00:00Z"),
      await claim("clock_out", "2024-01-13T17:00:00Z"));
    const revocation = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[0]}'::uuid returning user_id`,
      users[0],
    );
    let pendingRevocation;
    try {
      pendingRevocation = Promise.resolve(manager.rpc("create_attendance_from_offline_claims", revoked));
      await waitForLock("create_attendance_from_offline_claims");
      await revocation.release(true);
      assert.equal((await pendingRevocation).error?.message, "Claims not found or permission denied");
    } finally {
      await revocation.release(false);
      await Promise.allSettled([pendingRevocation].filter(Boolean));
    }
    assert.ifError((await admin.from("business_memberships").update({ department_id: fohId })
      .eq("business_id", businessId).eq("user_id", users[0])).error);

    const clockRaceStart = await claim("clock_in", new Date(Date.now() - 300_000).toISOString());
    const clocking = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[1]}', true); ` +
        `set local role authenticated; select public.clock_in_attendance(` +
        `'${businessId}'::uuid, '${venueId}'::uuid, '${fohId}'::uuid, '${employeeId}'::uuid, '${randomUUID()}'::uuid)`,
    );
    let pendingClock;
    let clockRace;
    try {
      clockRace = pair(clockRaceStart, await clockOutFixture());
      pendingClock = Promise.resolve(manager.rpc("create_attendance_from_offline_claims", clockRace));
      await waitForLock("create_attendance_from_offline_claims");
      await clocking.release(true);
      assert.equal((await pendingClock).error?.message, "Claimed attendance overlaps another session");
    } finally {
      await clocking.release(false);
      await Promise.allSettled([pendingClock].filter(Boolean));
    }
    const current = await worker.rpc("get_my_attendance_state_with_break", {
      p_business_id: businessId,
    }).single();
    assert.ifError(current.error);
    assert.equal(current.data.state, "clocked_in");
    const completion = complete(clockRace.p_clock_out_claim_id, current.data.session_id);
    const completionRetries = await Promise.all(Array.from({ length: 8 }, () =>
      manager.rpc("complete_attendance_from_offline_claim", completion)));
    for (const result of completionRetries) {
      assert.ifError(result.error);
      assert.equal(result.data, completionRetries[0].data);
    }
    const completedEvents = await manager.from("attendance_events").select("event_type, source")
      .eq("session_id", current.data.session_id).eq("event_type", "clock_out");
    assert.ifError(completedEvents.error);
    assert.deepEqual(completedEvents.data, [{ event_type: "clock_out", source: "offline_claim" }]);

    const liveSession = await clockIn();
    const competingClaim = await clockOutFixture();
    const liveRace = await Promise.all([
      manager.rpc("complete_attendance_from_offline_claim", complete(competingClaim, liveSession)),
      worker.rpc("clock_out_attendance", {
        p_business_id: businessId, p_session_id: liveSession, p_request_id: randomUUID(),
      }),
    ]);
    assert.equal(liveRace.filter((result) => !result.error).length, 1);
    assert.ok(["Matching open attendance session not found", "Already clocked out"]
      .includes(liveRace.find((result) => result.error).error.message));
    const liveEvents = await worker.from("attendance_events").select("id")
      .eq("session_id", liveSession).eq("event_type", "clock_out");
    assert.ifError(liveEvents.error);
    assert.equal(liveEvents.data.length, 1);

    const protectedSession = await clockIn();
    const protectedClaim = await clockOutFixture();
    const accessChange = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[0]}'::uuid returning user_id`,
      users[0],
    );
    let pendingAccess;
    try {
      pendingAccess = Promise.resolve(manager.rpc("complete_attendance_from_offline_claim",
        complete(protectedClaim, protectedSession)));
      await waitForLock("complete_attendance_from_offline_claim");
      await accessChange.release(true);
      assert.equal((await pendingAccess).error?.message, "Claim not found or permission denied");
    } finally {
      await accessChange.release(false);
      await Promise.allSettled([pendingAccess].filter(Boolean));
    }
    assert.ifError((await admin.from("business_memberships").update({ department_id: fohId })
      .eq("business_id", businessId).eq("user_id", users[0])).error);
    assert.ifError((await worker.rpc("clock_out_attendance", {
      p_business_id: businessId, p_session_id: protectedSession, p_request_id: randomUUID(),
    })).error);

    async function openBreakFixture() {
      const sessionId = await clockIn();
      assert.ifError((await worker.rpc("start_attendance_break", {
        p_business_id: businessId, p_session_id: sessionId,
        p_classification: "unpaid", p_request_id: randomUUID(),
      })).error);
      const state = await worker.rpc("get_my_attendance_state_with_break", {
        p_business_id: businessId,
      }).single();
      assert.ifError(state.error);
      assert.equal(state.data.session_id, sessionId);
      assert.ok(state.data.break_id);
      const reportedEnd = await sql("select clock_timestamp()::text");
      const claimId = await clockOutFixture();
      return { sessionId, breakId: state.data.break_id, claimId, reportedEnd };
    }
    function resolveBreak(fixture) {
      return {
        p_business_id: businessId, p_venue_id: venueId, p_claim_id: fixture.claimId,
        p_session_id: fixture.sessionId, p_break_id: fixture.breakId, p_request_id: randomUUID(),
        p_break_ended_at: fixture.reportedEnd, p_reason: "Confirmed with worker",
        p_acknowledge_unverified: true,
      };
    }
    async function finishLiveBreak(fixture) {
      assert.ifError((await worker.rpc("end_attendance_break", {
        p_business_id: businessId, p_session_id: fixture.sessionId,
        p_break_id: fixture.breakId, p_request_id: randomUUID(),
      })).error);
      assert.ifError((await worker.rpc("clock_out_attendance", {
        p_business_id: businessId, p_session_id: fixture.sessionId, p_request_id: randomUUID(),
      })).error);
    }

    const retryBreak = await openBreakFixture();
    const resolution = resolveBreak(retryBreak);
    const breakRetries = await Promise.all(Array.from({ length: 8 }, () =>
      manager.rpc("complete_attendance_with_offline_break", resolution)));
    for (const result of breakRetries) {
      assert.ifError(result.error);
      assert.equal(result.data, breakRetries[0].data);
    }
    const breakEvents = await manager.from("attendance_events").select("event_type, source")
      .eq("session_id", retryBreak.sessionId).in("event_type", ["break_end", "clock_out"])
      .order("event_type");
    assert.ifError(breakEvents.error);
    assert.deepEqual(breakEvents.data, [
      { event_type: "break_end", source: "manager_reported" },
      { event_type: "clock_out", source: "offline_claim" },
    ]);
    const resolutions = await manager.from("attendance_offline_break_resolutions").select("review_id")
      .eq("session_id", retryBreak.sessionId);
    assert.ifError(resolutions.error);
    assert.deepEqual(resolutions.data, [{ review_id: breakRetries[0].data }]);

    const liveBreak = await openBreakFixture();
    const clockingOut = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[1]}', true); ` +
        `set local role authenticated; select public.end_attendance_break(` +
        `'${businessId}'::uuid, '${liveBreak.sessionId}'::uuid, '${liveBreak.breakId}'::uuid, '${randomUUID()}'::uuid); ` +
        `select public.clock_out_attendance('${businessId}'::uuid, '${liveBreak.sessionId}'::uuid, '${randomUUID()}'::uuid)`,
    );
    let pendingBreakClock;
    try {
      pendingBreakClock = Promise.resolve(manager.rpc("complete_attendance_with_offline_break", resolveBreak(liveBreak)));
      await waitForLock("complete_attendance_with_offline_break");
      await clockingOut.release(true);
      assert.equal((await pendingBreakClock).error?.message, "Matching open attendance session not found");
    } finally {
      await clockingOut.release(false);
      await Promise.allSettled([pendingBreakClock].filter(Boolean));
    }
    const liveBreakEvents = await worker.from("attendance_events").select("event_type, source")
      .eq("session_id", liveBreak.sessionId).in("event_type", ["break_end", "clock_out"])
      .order("event_type");
    assert.ifError(liveBreakEvents.error);
    assert.deepEqual(liveBreakEvents.data, [
      { event_type: "break_end", source: "server_clock" },
      { event_type: "clock_out", source: "server_clock" },
    ]);

    const reviewedBreak = await openBreakFixture();
    const review = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users[0]}', true); ` +
        `set local role authenticated; select public.review_attendance_offline_claim(` +
        `'${businessId}'::uuid, '${venueId}'::uuid, '${reviewedBreak.claimId}'::uuid, '${randomUUID()}'::uuid, ` +
        `'rejected', null, null, 'Duplicate')`,
    );
    let pendingReview;
    try {
      pendingReview = Promise.resolve(manager.rpc("complete_attendance_with_offline_break", resolveBreak(reviewedBreak)));
      await waitForLock("complete_attendance_with_offline_break");
      await review.release(true);
      assert.equal((await pendingReview).error?.message, "Claim has already been reviewed");
    } finally {
      await review.release(false);
      await Promise.allSettled([pendingReview].filter(Boolean));
    }
    const afterReview = await worker.from("attendance_events").select("id")
      .eq("session_id", reviewedBreak.sessionId).in("event_type", ["break_end", "clock_out"]);
    assert.ifError(afterReview.error);
    assert.deepEqual(afterReview.data, []);
    await finishLiveBreak(reviewedBreak);

    const restrictedBreak = await openBreakFixture();
    const revokeBreakAccess = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[0]}'::uuid returning user_id`,
      users[0],
    );
    let pendingBreakAccess;
    try {
      pendingBreakAccess = Promise.resolve(manager.rpc("complete_attendance_with_offline_break",
        resolveBreak(restrictedBreak)));
      await waitForLock("complete_attendance_with_offline_break");
      await revokeBreakAccess.release(true);
      assert.equal((await pendingBreakAccess).error?.message, "Claim not found or permission denied");
    } finally {
      await revokeBreakAccess.release(false);
      await Promise.allSettled([pendingBreakAccess].filter(Boolean));
    }
    const afterRevocation = await worker.from("attendance_events").select("id")
      .eq("session_id", restrictedBreak.sessionId).in("event_type", ["break_end", "clock_out"]);
    assert.ifError(afterRevocation.error);
    assert.deepEqual(afterRevocation.data, []);
    await finishLiveBreak(restrictedBreak);
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
