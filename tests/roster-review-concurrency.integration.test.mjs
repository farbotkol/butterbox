import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("roster reviews serialize submissions and decisions and honor permission revocation", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, waitForLock, holdLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const roles = ["owner", "gm", "foh", "boh", "worker", "outsider"];
  const clients = Object.fromEntries(roles.map((role) => [role, createClient(url, anonKey, options)]));
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, fohId, bohId, employeeId, firstShiftId, lateShiftId] =
    Array.from({ length: 8 }, () => randomUUID());
  const users = {};
  const week = "2032-03-15";

  async function waitForWaiters(functionName, expected) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const count = await sql(
        `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%${functionName}%'`,
      );
      if (Number(count) >= expected) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${expected} ${functionName} calls to reach a lock.`);
  }

  const submit = (requestId) => clients.foh.rpc("submit_roster_review", {
    p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
    p_week_start: week, p_request_id: requestId,
  });
  const decide = (client, reviewId, requestId, decision = "approved") => client.rpc("decide_roster_review", {
    p_review_id: reviewId, p_decision: decision, p_request_id: requestId, p_reason: null,
  });

  try {
    for (const role of roles) {
      const created = await admin.auth.admin.createUser({
        email: `roster-review-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(created.error);
      users[role] = created.data.user.id;
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Review race cafe" }, { id: outsideId, name: "Other review cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Review venue", timezone: "UTC",
    })).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.gm, role: "general_manager", venue_id: venueId },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outsider, role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users.worker, name: "Review worker", role_title: "Server",
    })).error);
    assert.ifError((await admin.from("shifts").insert({
      id: firstShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: employeeId, role_title: "Reviewed shift",
      starts_at: "2032-03-15T09:00:00Z", ends_at: "2032-03-15T13:00:00Z",
      requires_acknowledgement: true,
    })).error);
    for (const role of roles) {
      assert.ifError((await clients[role].auth.signInWithPassword({
        email: `roster-review-${role}-${suffix}@example.test`, password,
      })).error);
    }
    assert.ifError((await clients.owner.rpc("save_roster_publication_mode", {
      p_business_id: businessId, p_venue_id: venueId, p_mode: "approval",
    })).error);
    assert.equal((await clients.foh.rpc("publish_roster", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId, p_week_start: week,
    })).error?.message, "Roster approval is required");

    const requestIds = [randomUUID(), randomUUID()];
    const submissionGate = await holdLock(
      `select pg_advisory_xact_lock(hashtextextended('roster-review:${fohId}:${week}', 0))`,
    );
    let submissions;
    let firstReview;
    try {
      submissions = Promise.all(requestIds.map(submit));
      await waitForWaiters("submit_roster_review", 2);
      await submissionGate.release(false);
      const results = await submissions;
      const winningIndex = results.findIndex((result) => !result.error);
      assert.notEqual(winningIndex, -1);
      assert.equal(results.filter((result) => !result.error).length, 1, "only one review can be pending");
      assert.equal(results.find((result) => result.error)?.error.message, "A roster review is already pending");
      firstReview = results[winningIndex].data;
      assert.equal((await submit(requestIds[winningIndex])).data, firstReview, "submission retry is idempotent");
    } finally {
      await submissionGate.release(false);
      await Promise.allSettled([submissions].filter(Boolean));
    }

    for (const role of ["boh", "worker", "outsider"]) {
      assert.equal((await decide(clients[role], firstReview, randomUUID())).error?.message, "Permission denied");
      const visible = await clients[role].from("roster_review_requests").select("id").eq("id", firstReview);
      assert.ifError(visible.error);
      assert.deepEqual(visible.data, [], `${role} cannot read another scope's review`);
    }
    assert.equal((await decide(clients.foh, firstReview, randomUUID())).error?.message,
      "A different authorised reviewer is required");
    assert.ifError((await admin.from("shifts").insert({
      id: lateShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
      role_title: "Later open shift", starts_at: "2032-03-16T09:00:00Z", ends_at: "2032-03-16T13:00:00Z",
    })).error);

    const decisionIds = [randomUUID(), randomUUID()];
    const approvalGate = await holdLock(
      `select id from public.roster_review_requests where id = '${firstReview}'::uuid for update`, firstReview,
    );
    let approvals;
    try {
      approvals = Promise.all([
        decide(clients.owner, firstReview, decisionIds[0]),
        decide(clients.gm, firstReview, decisionIds[1]),
      ]);
      await waitForWaiters("decide_roster_review", 2);
      await approvalGate.release(false);
      const results = await approvals;
      const winningIndex = results.findIndex((result) => !result.error);
      assert.notEqual(winningIndex, -1);
      assert.equal(results.filter((result) => result.data === 1).length, 1, "one approval publishes one snapshot");
      assert.equal(results.find((result) => result.error)?.error.message, "Roster review already decided");
      const winner = winningIndex === 0 ? clients.owner : clients.gm;
      assert.equal((await decide(winner, firstReview, decisionIds[winningIndex])).data, 1,
        "retrying the winning decision does not republish");
    } finally {
      await approvalGate.release(false);
      await Promise.allSettled([approvals].filter(Boolean));
    }
    const shifts = await admin.from("shifts").select("id, is_published").in("id", [firstShiftId, lateShiftId]);
    assert.ifError(shifts.error);
    assert.equal(shifts.data.find((shift) => shift.id === firstShiftId).is_published, true);
    assert.equal(shifts.data.find((shift) => shift.id === lateShiftId).is_published, false,
      "a draft added after submission is not silently published");
    const decisions = await clients.foh.from("roster_review_decisions").select("id").eq("review_id", firstReview);
    assert.ifError(decisions.error);
    assert.equal(decisions.data.length, 1);
    const notices = await clients.worker.rpc("list_roster_notifications", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    assert.ifError(notices.error);
    assert.equal(notices.data.filter((notice) => notice.week_start === week).length, 1,
      "one publication notification is recorded despite retries and competing approvals");

    const next = await submit(randomUUID());
    assert.ifError(next.error);
    const shiftGate = await holdLock(
      `select id from public.shifts where id = '${lateShiftId}'::uuid for update`, lateShiftId,
    );
    try {
      assert.equal((await decide(clients.owner, next.data, randomUUID())).error?.message,
        "Roster changed while publishing; please try again", "a simultaneous edit prevents publication");
    } finally {
      await shiftGate.release(false);
    }
    assert.ifError((await admin.from("shifts").update({ role_title: "Changed after review" })
      .eq("id", lateShiftId)).error);
    const stale = await clients.foh.rpc("list_roster_reviews", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId, p_week_start: week,
    });
    assert.ifError(stale.error);
    assert.equal(stale.data.find((review) => review.review_id === next.data).stale, true);
    assert.equal((await decide(clients.owner, next.data, randomUUID())).error?.message,
      "Submitted roster changed; withdraw or reject and resubmit");
    assert.equal((await decide(clients.foh, next.data, randomUUID(), "withdrawn")).data, 0);

    const resubmitted = await submit(randomUUID());
    assert.ifError(resubmitted.error);
    const revokeGate = await holdLock(
      `update public.business_memberships set role = 'employee'
        where business_id = '${businessId}'::uuid and user_id = '${users.gm}'::uuid returning user_id`, users.gm,
    );
    let revokedApproval;
    try {
      revokedApproval = Promise.resolve(decide(clients.gm, resubmitted.data, randomUUID()));
      await waitForLock("decide_roster_review");
      await revokeGate.release(true);
      assert.equal((await revokedApproval).error?.message, "Permission denied",
        "an approval waiting behind revocation must recheck the committed role");
    } finally {
      await revokeGate.release(false);
      await Promise.allSettled([revokedApproval].filter(Boolean));
    }
    assert.equal((await decide(clients.owner, resubmitted.data, randomUUID())).data, 1);
  } finally {
    for (const id of [businessId, outsideId]) {
      await assertBusinessFixturesPreserved(admin, id);
    }
    for (const user of Object.values(users)) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
