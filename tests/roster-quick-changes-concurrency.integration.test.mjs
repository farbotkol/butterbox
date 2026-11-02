import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("quick roster changes serialize retries and recheck conflicts, reviews and revoked permissions", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { waitForLock, holdLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const owner = createClient(url, anonKey, options);
  const manager = createClient(url, anonKey, options);
  const otherManager = createClient(url, anonKey, options);
  const employee = createClient(url, anonKey, options);
  const outsider = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const users = [];
  const [businessId, outsideId, venueId, fohId, bohId, firstWorkerId, secondWorkerId,
    duplicateSourceId, raceSourceId, conflictSourceId, revokedSourceId] =
    Array.from({ length: 11 }, () => randomUUID());
  const week = "2032-03-29";

  async function prepare(shiftId, targetDate, targetEmployeeId, operation = "move") {
    const source = await admin.from("shifts").select("updated_at").eq("id", shiftId).single();
    assert.ifError(source.error);
    const args = {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
      p_shift_id: shiftId, p_expected_updated_at: source.data.updated_at,
      p_week_start: week, p_target_date: targetDate,
      p_target_employee_id: targetEmployeeId, p_operation: operation,
    };
    const preview = await manager.rpc("preview_roster_shift_change", args);
    assert.ifError(preview.error);
    assert.deepEqual(preview.data.blocking, []);
    return { ...args, p_expected_preview: preview.data, p_request_id: randomUUID() };
  }

  async function shift(id) {
    const result = await admin.from("shifts")
      .select("id, employee_id, starts_at, ends_at, break_minutes, is_published")
      .eq("id", id).single();
    assert.ifError(result.error);
    return result.data;
  }

  try {
    for (const role of ["owner", "manager", "boh", "worker", "outside"]) {
      const created = await admin.auth.admin.createUser({
        email: `quick-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(created.error);
      users.push(created.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Quick change races" }, { id: outsideId, name: "Outside quick changes" },
    ])).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Race venue", timezone: "UTC",
    })).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "owner" },
      { business_id: businessId, user_id: users[1], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[2], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users[3], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users[4], role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert([
      { id: firstWorkerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users[3], name: "Quick worker", role_title: "Server" },
      { id: secondWorkerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        name: "Another worker", role_title: "Server" },
    ])).error);
    assert.ifError((await admin.from("shifts").insert([
      { id: duplicateSourceId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: firstWorkerId, role_title: "Duplicate source",
        starts_at: "2032-03-29T09:00:00Z", ends_at: "2032-03-29T11:00:00Z" },
      { id: raceSourceId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: firstWorkerId, role_title: "Race source",
        starts_at: "2032-03-29T15:00:00Z", ends_at: "2032-03-29T17:00:00Z" },
      { id: conflictSourceId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: firstWorkerId, role_title: "Conflict source",
        starts_at: "2032-04-01T10:00:00Z", ends_at: "2032-04-01T12:00:00Z" },
      { id: revokedSourceId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: firstWorkerId, role_title: "Revocation source",
        starts_at: "2032-04-02T15:00:00Z", ends_at: "2032-04-02T17:00:00Z" },
    ])).error);
    for (const [client, role] of [
      [owner, "owner"], [manager, "manager"], [otherManager, "boh"], [employee, "worker"], [outsider, "outside"],
    ]) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `quick-race-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const duplicate = await prepare(duplicateSourceId, "2032-03-30", secondWorkerId, "duplicate");
    for (const client of [otherManager, employee, outsider]) {
      assert.equal((await client.rpc("apply_roster_shift_change", duplicate)).error?.message, "Permission denied");
    }
    const retries = await Promise.all([
      manager.rpc("apply_roster_shift_change", duplicate),
      manager.rpc("apply_roster_shift_change", duplicate),
    ]);
    retries.forEach((result) => assert.ifError(result.error));
    assert.equal(retries[0].data, retries[1].data, "concurrent retries share one receipt");
    const duplicates = await admin.from("shifts").select("id")
      .eq("business_id", businessId).eq("role_title", "Duplicate source")
      .eq("starts_at", "2032-03-30T09:00:00Z");
    assert.ifError(duplicates.error);
    assert.equal(duplicates.data.length, 1, "concurrent retries create one draft");
    const undoDuplicate = {
      p_business_id: businessId, p_venue_id: venueId, p_change_id: retries[0].data, p_request_id: randomUUID(),
    };
    const undone = await Promise.all([
      manager.rpc("undo_roster_shift_change", undoDuplicate),
      manager.rpc("undo_roster_shift_change", undoDuplicate),
    ]);
    undone.forEach((result) => assert.ifError(result.error));
    assert.equal(undone[0].data, undone[1].data, "concurrent undo retries are idempotent");

    const destinations = await Promise.all([
      prepare(raceSourceId, "2032-03-31", firstWorkerId),
      prepare(raceSourceId, "2032-04-01", firstWorkerId),
    ]);
    const moves = await Promise.all(destinations.map((args) => manager.rpc("apply_roster_shift_change", args)));
    assert.equal(moves.filter((result) => !result.error).length, 1, "only one concurrent move succeeds");
    assert.ok([
      "Roster changed while scheduling; please try again", "Shift changed; reload the roster",
    ].includes(moves.find((result) => result.error).error.message));
    const afterRace = await shift(raceSourceId);
    assert.ok(["2032-03-31T15:00:00+00:00", "2032-04-01T15:00:00+00:00"].includes(afterRace.starts_at));

    const conflict = await prepare(conflictSourceId, "2032-04-02", secondWorkerId);
    const conflictShiftId = randomUUID();
    assert.ifError((await admin.from("shifts").insert({
      id: conflictShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: secondWorkerId, role_title: "New overlap",
      starts_at: "2032-04-02T10:30:00Z", ends_at: "2032-04-02T11:30:00Z",
    })).error);
    assert.equal((await manager.rpc("apply_roster_shift_change", conflict)).error?.message,
      "Shift change blocked: overlap", "a conflict introduced after preview blocks the mutation");
    assert.equal((await shift(conflictSourceId)).starts_at, "2032-04-01T10:00:00+00:00");
    assert.ifError((await admin.from("shifts").delete().eq("id", conflictShiftId)).error);

    const warning = await prepare(conflictSourceId, "2032-04-02", secondWorkerId);
    const exceptionId = randomUUID();
    assert.ifError((await admin.from("employee_availability_exceptions").insert({
      id: exceptionId, business_id: businessId, venue_id: venueId, employee_id: secondWorkerId,
      starts_on: "2032-04-02", ends_on: "2032-04-02", exception_type: "leave", status: "approved",
    })).error);
    assert.equal((await manager.rpc("apply_roster_shift_change", warning)).error?.message,
      "Shift preview changed; preview again", "a new warning cannot be silently applied");
    assert.ifError((await admin.from("employee_availability_exceptions").delete().eq("id", exceptionId)).error);

    const lockedChange = await prepare(conflictSourceId, "2032-04-03", secondWorkerId);
    const sourceGate = await holdLock(
      `update public.shifts set break_minutes = 20 where id = '${conflictSourceId}'::uuid`,
    );
    try {
      assert.equal((await manager.rpc("apply_roster_shift_change", lockedChange)).error?.message,
        "Roster changed while scheduling; please try again");
      await sourceGate.release(true);
      assert.equal((await manager.rpc("apply_roster_shift_change", lockedChange)).error?.message,
        "Shift changed; reload the roster");
      assert.equal((await shift(conflictSourceId)).break_minutes, 20, "a concurrent edit is retained");
    } finally {
      await sourceGate.release(false);
    }

    const revocation = await prepare(revokedSourceId, "2032-04-04", firstWorkerId);
    const membershipGate = await holdLock(
      `update public.business_memberships set role = 'employee' where business_id = '${businessId}'::uuid and user_id = '${users[1]}'::uuid`,
    );
    let pending;
    try {
      pending = Promise.resolve(manager.rpc("apply_roster_shift_change", revocation));
      await waitForLock("apply_roster_shift_change");
      await membershipGate.release(true);
      assert.equal((await pending).error?.message, "Permission denied", "revocation takes effect before the mutation");
      assert.equal((await shift(revokedSourceId)).starts_at, "2032-04-02T15:00:00+00:00");
    } finally {
      await membershipGate.release(false);
      if (pending) await pending;
    }
    assert.ifError((await admin.from("business_memberships").update({ role: "foh_manager" })
      .eq("business_id", businessId).eq("user_id", users[1])).error);

    assert.ifError((await owner.rpc("save_roster_publication_mode", {
      p_business_id: businessId, p_venue_id: venueId, p_mode: "approval",
    })).error);
    const review = await manager.rpc("submit_roster_review", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
      p_week_start: week, p_request_id: randomUUID(),
    });
    assert.ifError(review.error);
    const reviewMove = await prepare(raceSourceId, "2032-04-04", firstWorkerId);
    const moved = await manager.rpc("apply_roster_shift_change", reviewMove);
    assert.ifError(moved.error);
    const staleReview = await owner.rpc("decide_roster_review", {
      p_review_id: review.data, p_decision: "approved", p_request_id: randomUUID(), p_reason: null,
    });
    assert.equal(staleReview.error?.message, "Submitted roster changed; withdraw or reject and resubmit");
    assert.ifError((await manager.rpc("decide_roster_review", {
      p_review_id: review.data, p_decision: "withdrawn", p_request_id: randomUUID(), p_reason: null,
    })).error);
    assert.ifError((await owner.rpc("save_roster_publication_mode", {
      p_business_id: businessId, p_venue_id: venueId, p_mode: "direct",
    })).error);
    const published = await owner.rpc("publish_roster", {
      p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId, p_week_start: week,
    });
    assert.ifError(published.error);
    assert.ok(published.data > 0);
    assert.equal((await manager.rpc("undo_roster_shift_change", {
      p_business_id: businessId, p_venue_id: venueId, p_change_id: moved.data, p_request_id: randomUUID(),
    })).error?.message, "Shift changed since the quick change", "undo never changes a published shift");
    assert.equal((await shift(raceSourceId)).is_published, true);
  } finally {
    assert.ifError((await admin.from("businesses").delete().in("id", [businessId, outsideId])).error);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
