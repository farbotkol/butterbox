import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("department timesheet approvals enforce HTTP scope and serialize retries, corrections and access changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 90_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const roles = ["owner", "foh", "boh", "worker", "outsider"];
  const clients = Object.fromEntries(roles.map((role) => [role, createClient(url, anonKey, options)]));
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, outsideVenueId, fohId, bohId, employeeId] =
    Array.from({ length: 7 }, () => randomUUID());
  const sessions = { foh: randomUUID(), boh: randomUUID(), race: randomUUID() };
  const raceClockOut = randomUUID();
  const users = {};

  try {
    for (const role of roles) {
      const result = await admin.auth.admin.createUser({
        email: `approval-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users[role] = result.data.user.id;
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Approval race cafe" }, { id: outsideId, name: "Outside approval cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside", timezone: "UTC" },
    ])).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outsider, role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users.worker, name: "Split approval worker", role_title: "Server",
    })).error);
    assert.ifError((await admin.from("employee_departments").insert({
      business_id: businessId, employee_id: employeeId, department_id: bohId,
    })).error);
    const sessionRows = [[sessions.foh, fohId, 9], [sessions.boh, bohId, 12], [sessions.race, fohId, 15]];
    assert.ifError((await admin.from("attendance_sessions").insert(sessionRows.map(([id, department]) => ({
      id, business_id: businessId, venue_id: venueId, department_id: department,
      employee_id: employeeId, started_by: users.worker,
    })))).error);
    assert.ifError((await admin.from("attendance_events").insert(sessionRows.flatMap(([id, department, hour]) =>
      [["clock_in", hour], ["clock_out", hour + 2]].map(([type, at]) => ({
        id: id === sessions.race && type === "clock_out" ? raceClockOut : randomUUID(),
        session_id: id, business_id: businessId, venue_id: venueId, department_id: department,
        employee_id: employeeId, actor_id: users.worker, request_id: randomUUID(), event_type: type,
        occurred_at: `2024-01-10T${String(at).padStart(2, "0")}:00:00Z`,
      }))))).error);
    for (const role of roles) {
      assert.ifError((await clients[role].auth.signInWithPassword({
        email: `approval-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const revision = async (client, sessionId) => {
      const result = await client.rpc("list_weekly_worked_time_for_edit", {
        p_business_id: businessId, p_venue_id: venueId, p_week_start: "2024-01-08",
      });
      assert.ifError(result.error);
      return result.data.find((row) => row.session_id === sessionId)?.edit_revision;
    };
    const decide = (client, sessionId, rev, decision = "approved", reason = null, request = randomUUID()) =>
      client.rpc("decide_attendance_timesheet", {
        p_business_id: businessId, p_venue_id: venueId, p_session_id: sessionId, p_request_id: request,
        p_expected_revision: rev, p_decision: decision, p_reason: reason,
      });
    const approvals = async (client) => {
      const result = await client.rpc("list_weekly_timesheet_approvals", {
        p_business_id: businessId, p_venue_id: venueId, p_week_start: "2024-01-08",
      });
      assert.ifError(result.error);
      return result.data;
    };

    const fohRevision = await revision(clients.foh, sessions.foh);
    assert.match(fohRevision, /^[0-9a-f]{64}$/);
    assert.equal(await revision(clients.foh, sessions.boh), undefined, "FOH cannot see BOH time");
    assert.equal((await decide(clients.worker, sessions.foh, fohRevision)).error?.message,
      "Session not found or permission denied");
    assert.equal((await decide(clients.boh, sessions.foh, fohRevision)).error?.message,
      "Session not found or permission denied");
    assert.equal((await decide(clients.foh, sessions.boh, fohRevision)).error?.message,
      "Session not found or permission denied");
    assert.equal((await decide(clients.outsider, sessions.foh, fohRevision)).error?.message, "Permission denied");
    assert.equal((await clients.worker.rpc("list_weekly_timesheet_approvals", {
      p_business_id: businessId, p_venue_id: venueId, p_week_start: "2024-01-08",
    })).error?.message, "Permission denied");
    const outsiderRead = await clients.outsider.from("attendance_timesheet_decisions").select("id");
    assert.ifError(outsiderRead.error);
    assert.equal(outsiderRead.data.length, 0);

    const request = randomUUID();
    const duplicates = await Promise.all(Array.from({ length: 8 }, () =>
      decide(clients.foh, sessions.foh, fohRevision, "approved", "Matches roster", request)));
    for (const result of duplicates) {
      assert.ifError(result.error);
      assert.equal(result.data, duplicates[0].data);
    }
    const bohRevision = await revision(clients.boh, sessions.boh);
    const competing = await Promise.all(Array.from({ length: 6 }, () => decide(clients.boh, sessions.boh, bohRevision)));
    assert.equal(competing.filter((result) => !result.error).length, 1, "exactly one competing approval wins");
    for (const result of competing.filter((item) => item.error)) {
      assert.ok(["Timesheet entry is already approved", "Attendance changed; review again"]
        .includes(result.error.message), result.error.message);
    }
    const fohView = await approvals(clients.foh);
    assert.deepEqual(fohView.map((row) => [row.session_id, row.department_id, row.status]).sort(),
      [[sessions.foh, fohId, "approved"], [sessions.race, fohId, "pending"]].sort());
    const bohView = await approvals(clients.boh);
    assert.deepEqual(bohView.map((row) => [row.session_id, row.department_id, row.status]),
      [[sessions.boh, bohId, "approved"]]);
    const decisions = await sql(`select session_id || ':' || department_id from public.attendance_timesheet_decisions ` +
      `where business_id = '${businessId}'::uuid order by 1`);
    assert.deepEqual(decisions.split("\n").filter(Boolean),
      [`${sessions.foh}:${fohId}`, `${sessions.boh}:${bohId}`].sort(), "each department approval is recorded once");

    const raceRevision = await revision(clients.foh, sessions.race);
    const correcting = await holdLock(
      `select set_config('request.jwt.claim.sub', '${users.foh}', true); ` +
        `set local role authenticated; select public.correct_attendance_event(` +
        `'${businessId}'::uuid, '${venueId}'::uuid, '${sessions.race}'::uuid, '${raceClockOut}'::uuid, ` +
        `'${randomUUID()}'::uuid, '2024-01-10T17:00:00Z'::timestamptz, ` +
        `'2024-01-10T17:30:00Z'::timestamptz, 'Confirmed later finish')`,
    );
    let pendingApproval;
    try {
      pendingApproval = Promise.resolve(decide(clients.foh, sessions.race, raceRevision));
      await waitForLock("decide_attendance_timesheet");
      await correcting.release(true);
      assert.equal((await pendingApproval).error?.message, "Attendance changed; review again");
    } finally {
      await correcting.release(false);
      await Promise.allSettled([pendingApproval].filter(Boolean));
    }

    const correctedRevision = await revision(clients.foh, sessions.race);
    assert.notEqual(correctedRevision, raceRevision);
    const returned = await decide(clients.foh, sessions.race, correctedRevision, "rejected", "Confirm your break");
    assert.ifError(returned.error);
    const workerView = await clients.worker.rpc("list_timesheet_decisions", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    assert.ifError(workerView.error);
    const workerReturned = workerView.data.find((row) => row.session_id === sessions.race);
    assert.equal(workerReturned?.status, "returned");
    assert.equal(workerReturned?.reason, "Confirm your break");

    const revocation = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users.foh}'::uuid returning user_id`,
      users.foh,
    );
    let pendingRevoked;
    try {
      pendingRevoked = Promise.resolve(decide(clients.foh, sessions.race, correctedRevision));
      await waitForLock("decide_attendance_timesheet");
      await revocation.release(true);
      assert.equal((await pendingRevoked).error?.message, "Session not found or permission denied");
    } finally {
      await revocation.release(false);
      await Promise.allSettled([pendingRevoked].filter(Boolean));
    }
    assert.equal(await sql(`select string_agg(decision, ',' order by sequence) from ` +
      `public.attendance_timesheet_decisions where session_id = '${sessions.race}'::uuid`),
    "rejected", "no approval survived the races");
  } finally {
    for (const id of [businessId, outsideId]) {
      await assertBusinessFixturesPreserved(admin, id);
    }
    for (const user of Object.values(users)) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
