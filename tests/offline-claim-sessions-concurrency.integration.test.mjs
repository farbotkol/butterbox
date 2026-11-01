import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("offline session creation serializes retries, decisions, permissions and clocking", {
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
    try {
      const endId = randomUUID();
      await sql(
        `insert into public.attendance_offline_claims ` +
          `(id, business_id, venue_id, department_id, employee_id, actor_id, request_id, event_type, claimed_at) ` +
          `values ('${endId}', '${businessId}', '${venueId}', '${fohId}', '${employeeId}', '${users[1]}', ` +
          `'${randomUUID()}', 'clock_out', clock_timestamp())`,
      );
      const clockRace = pair(clockRaceStart, endId);
      pendingClock = Promise.resolve(manager.rpc("create_attendance_from_offline_claims", clockRace));
      await waitForLock("create_attendance_from_offline_claims");
      await clocking.release(true);
      assert.equal((await pendingClock).error?.message, "Claimed attendance overlaps another session");
    } finally {
      await clocking.release(false);
      await Promise.allSettled([pendingClock].filter(Boolean));
    }
  } finally {
    assert.ifError((await admin.from("businesses").delete().eq("id", businessId)).error);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
