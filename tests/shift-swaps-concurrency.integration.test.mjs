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

test("swap approval serializes with other approvals and linked-worker scheduling", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, waitForLock, holdLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const roles = ["owner", "foh", "boh", "ann", "ben", "outsider"];
  const clients = Object.fromEntries(roles.map((role) => [role, createClient(url, anonKey, options)]));
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, secondVenueId, fohId, bohId, secondDepartmentId,
    annId, benId, benSecondId, annFirst, benFirst, annSecond, benSecond, annThird, benThird] =
    Array.from({ length: 16 }, () => randomUUID());
  const users = {};

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

  async function prepareSwap(requesterShift, recipientShift) {
    const request = await clients.ann.rpc("request_shift_swap", {
      p_business_id: businessId, p_venue_id: venueId,
      p_shift_id: requesterShift, p_recipient_employee_id: benId,
    });
    assert.ifError(request.error);
    const proposal = await clients.ben.rpc("respond_shift_swap", {
      p_swap_id: request.data, p_response: "propose", p_recipient_shift_id: recipientShift,
    });
    assert.ifError(proposal.error);
    const confirmation = await clients.ann.rpc("confirm_shift_swap", {
      p_swap_id: request.data, p_response: "confirm",
    });
    assert.ifError(confirmation.error);
    return request.data;
  }

  const review = (client, swapId) => client.rpc("review_shift_swap", {
    p_swap_id: swapId, p_decision: "approve", p_reason: null,
  });
  const saveLinkedShift = (start, end) => clients.owner.rpc("save_shift", {
    p_business_id: businessId, p_venue_id: secondVenueId, p_department_id: secondDepartmentId,
    p_employee_id: benSecondId, p_role_title: "Linked service",
    p_start_local: start, p_end_local: end, p_break_minutes: 0,
  });

  try {
    for (const role of roles) {
      const created = await admin.auth.admin.createUser({
        email: `swap-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(created.error);
      users[role] = created.data.user.id;
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Swap race cafe" }, { id: outsideId, name: "Outside swap cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "First", timezone: "UTC" },
      { id: secondVenueId, business_id: businessId, name: "Second", timezone: "UTC" },
    ])).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
      { id: secondDepartmentId, business_id: businessId, venue_id: secondVenueId, name: "Other venue" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users.ann, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.ben, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outsider, role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert([
      { id: annId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.ann, name: "Ann", role_title: "Server" },
      { id: benId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.ben, name: "Ben", role_title: "Server" },
      { id: benSecondId, business_id: businessId, venue_id: secondVenueId, department_id: secondDepartmentId,
        auth_user_id: users.ben, name: "Ben second venue", role_title: "Server" },
    ])).error);
    const shifts = [
      [annFirst, annId, "2032-04-05T09:00:00Z", "2032-04-05T13:00:00Z", true],
      [benFirst, benId, "2032-04-05T09:00:00Z", "2032-04-05T13:00:00Z", true],
      [annSecond, annId, "2032-04-06T09:00:00Z", "2032-04-06T13:00:00Z", false],
      [benSecond, benId, "2032-04-06T14:00:00Z", "2032-04-06T18:00:00Z", false],
      [annThird, annId, "2032-04-07T09:00:00Z", "2032-04-07T13:00:00Z", false],
      [benThird, benId, "2032-04-07T14:00:00Z", "2032-04-07T18:00:00Z", false],
    ].map(([id, employee_id, starts_at, ends_at, requires_acknowledgement]) => ({
      id, employee_id, starts_at, ends_at, requires_acknowledgement,
      business_id: businessId, venue_id: venueId, department_id: fohId, role_title: "Server",
    }));
    assert.ifError((await admin.from("shifts").insert(shifts)).error);
    for (const role of roles) {
      assert.ifError((await clients[role].auth.signInWithPassword({
        email: `swap-race-${role}-${suffix}@example.test`, password,
      })).error);
    }
    assert.ifError((await clients.owner.rpc("publish_roster", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId, p_week_start: "2032-04-05",
    })).error);
    assert.ifError((await clients.ann.rpc("acknowledge_shift", {
      p_business_id: businessId, p_venue_id: venueId, p_shift_id: annFirst,
    })).error);

    const firstSwap = await prepareSwap(annFirst, benFirst);
    assert.equal((await review(clients.outsider, firstSwap)).error?.message, "Swap not found or permission denied");
    assert.equal((await review(clients.boh, firstSwap)).error?.message, "Swap not found or permission denied");
    assert.equal((await review(clients.ann, firstSwap)).error?.message, "Swap not found or permission denied");
    assert.equal((await clients.outsider.rpc("list_shift_swaps", {
      p_business_id: businessId, p_venue_id: venueId,
    })).error?.message, "Permission denied");

    const gate = await holdLock(
      `select id from public.shift_swap_requests where id = '${firstSwap}'::uuid for update`, firstSwap,
    );
    let approvals;
    try {
      approvals = Promise.all([review(clients.owner, firstSwap), review(clients.foh, firstSwap)]);
      await waitForWaiters("review_shift_swap", 2);
      await gate.release(false);
      const results = await approvals;
      assert.equal(results.filter((result) => !result.error).length, 1, "only one concurrent approval succeeds");
      assert.equal(results.find((result) => result.error)?.error.message,
        "This swap is no longer awaiting manager review");
    } finally {
      await gate.release(false);
      await Promise.allSettled([approvals].filter(Boolean));
    }
    const exchanged = await admin.from("shifts").select("id, employee_id").in("id", [annFirst, benFirst]);
    assert.ifError(exchanged.error);
    assert.equal(exchanged.data.find((shift) => shift.id === annFirst).employee_id, benId);
    assert.equal(exchanged.data.find((shift) => shift.id === benFirst).employee_id, annId);
    const acknowledgements = await clients.ben.rpc("list_shift_acknowledgements", {
      p_business_id: businessId, p_venue_id: venueId, p_shift_ids: [annFirst],
    });
    assert.ifError(acknowledgements.error);
    assert.equal(acknowledgements.data[0].acknowledged_at, null, "the new assignee must acknowledge again");
    assert.ifError((await clients.ben.rpc("acknowledge_shift", {
      p_business_id: businessId, p_venue_id: venueId, p_shift_id: annFirst,
    })).error);
    for (const role of ["ann", "ben"]) {
      const notices = await clients[role].rpc("list_shift_swap_notifications", {
        p_business_id: businessId, p_venue_id: venueId,
      });
      assert.ifError(notices.error);
      assert.equal(notices.data.filter((notice) => notice.swap_id === firstSwap && notice.event_type === "approved").length, 1);
    }

    assert.ifError((await clients.owner.rpc("link_shared_worker_profiles", {
      p_business_id: businessId, p_venue_id: venueId, p_employee_id: benId, p_other_employee_id: benSecondId,
    })).error);

    const secondSwap = await prepareSwap(annSecond, benSecond);
    const employeeGate = await holdLock(
      `select pg_advisory_xact_lock(hashtextextended('${benId}', 0))`,
    );
    let pendingApproval;
    try {
      pendingApproval = Promise.resolve(review(clients.foh, secondSwap));
      await waitForLock("review_shift_swap");
      const competing = await saveLinkedShift("2032-04-06 09:30", "2032-04-06 10:30");
      assert.equal(competing.error?.message, "Roster changed while scheduling; please try again",
        "another venue cannot assign the linked worker during approval");
      await employeeGate.release(false);
      assert.ifError((await pendingApproval).error);
    } finally {
      await employeeGate.release(false);
      await Promise.allSettled([pendingApproval].filter(Boolean));
    }

    const thirdSwap = await prepareSwap(annThird, benThird);
    const linkedGate = await holdLock(
      `select pg_advisory_xact_lock(hashtextextended('${benSecondId}', 0))`,
    );
    let pendingAssignment;
    try {
      pendingAssignment = Promise.resolve(saveLinkedShift("2032-04-07 09:30", "2032-04-07 10:30"));
      await waitForLock("save_shift");
      const competing = await review(clients.foh, thirdSwap);
      assert.equal(competing.error?.message, "Roster changed while scheduling; please try again",
        "approval cannot race a linked-worker assignment");
      await linkedGate.release(false);
      assert.ifError((await pendingAssignment).error);
    } finally {
      await linkedGate.release(false);
      await Promise.allSettled([pendingAssignment].filter(Boolean));
    }
    assert.equal((await review(clients.foh, thirdSwap)).error?.message,
      "Recipient is no longer eligible for the requested shift: conflict",
      "approval rechecks the linked-venue shift after the concurrent assignment");
    const unchanged = await admin.from("shifts").select("id, employee_id").in("id", [annThird, benThird]);
    assert.ifError(unchanged.error);
    assert.equal(unchanged.data.find((shift) => shift.id === annThird).employee_id, annId);
    assert.equal(unchanged.data.find((shift) => shift.id === benThird).employee_id, benId);
  } finally {
    for (const id of [businessId, outsideId]) {
      await assertBusinessFixturesPreserved(admin, id);
    }
    for (const user of Object.values(users)) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
