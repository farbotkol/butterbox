import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  prepareCanonicalPayrollForProvider, validateCanonicalPayrollRows,
} from "../src/lib/canonical-payroll.ts";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;
const week = "2024-01-08";
const finalisedMessage = "Payroll period is finalised; reopen it before changing attendance";

test("payroll period finalisation enforces HTTP scope and serializes with attendance changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const roles = ["owner", "gm", "foh", "worker", "outsider"];
  const clients = Object.fromEntries(roles.map((role) => [role, createClient(url, anonKey, options)]));
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, fohId, employeeId] = Array.from({ length: 5 }, () => randomUUID());
  const sessions = [randomUUID(), randomUUID()];
  const users = {};

  try {
    for (const role of roles) {
      const result = await admin.auth.admin.createUser({
        email: `payroll-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users[role] = result.data.user.id;
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Payroll race cafe" }, { id: outsideId, name: "Outside payroll cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error);
    assert.ifError((await admin.from("departments").insert({
      id: fohId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.gm, role: "general_manager", venue_id: venueId },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outsider, role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: fohId,
      auth_user_id: users.worker, name: "Payroll race worker", role_title: "Server",
    })).error);
    assert.ifError((await admin.from("attendance_sessions").insert(sessions.map((id) => ({
      id, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: employeeId, started_by: users.worker,
    })))).error);
    assert.ifError((await admin.from("attendance_events").insert(sessions.flatMap((id, index) =>
      [["clock_in", 9 + index * 4], ["clock_out", 11 + index * 4]].map(([type, hour]) => ({
        session_id: id, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: employeeId, actor_id: users.worker, request_id: randomUUID(), event_type: type,
        occurred_at: `2024-01-10T${String(hour).padStart(2, "0")}:00:00Z`,
      }))))).error);
    for (const role of roles) {
      assert.ifError((await clients[role].auth.signInWithPassword({
        email: `payroll-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const scope = { p_business_id: businessId, p_venue_id: venueId, p_week_start: week };
    const finalise = (client, request = randomUUID(), note = null) =>
      client.rpc("finalise_payroll_period", { ...scope, p_request_id: request, p_note: note });
    const reopen = (client, reason, request = randomUUID()) =>
      client.rpc("reopen_payroll_period", { ...scope, p_request_id: request, p_reason: reason });
    const exceptions = async (client) => {
      const result = await client.rpc("list_payroll_period_exceptions", scope);
      assert.ifError(result.error);
      return result.data.map((row) => `${row.session_id}:${row.exception_code}`).sort();
    };
    const approveAll = async () => {
      const rows = await clients.foh.rpc("list_weekly_worked_time_for_edit", scope);
      assert.ifError(rows.error);
      const approvals = await clients.foh.rpc("list_weekly_timesheet_approvals", scope);
      assert.ifError(approvals.error);
      for (const row of rows.data) {
        if (approvals.data.find((item) => item.session_id === row.session_id)?.status === "approved") continue;
        assert.ifError((await clients.foh.rpc("decide_attendance_timesheet", {
          p_business_id: businessId, p_venue_id: venueId, p_session_id: row.session_id, p_request_id: randomUUID(),
          p_expected_revision: row.edit_revision, p_decision: "approved", p_reason: null,
        })).error);
      }
    };
    const unlock = (client, sessionId, request = randomUUID()) => client.rpc("set_attendance_edit_lock", {
      p_business_id: businessId, p_venue_id: venueId, p_session_id: sessionId, p_request_id: request,
      p_locked: false, p_reason: "Payroll race check",
    });
    const periodStatus = async () => {
      const result = await clients.owner.rpc("get_payroll_period", scope);
      assert.ifError(result.error);
      return result.data[0].status;
    };
    const canonical = (client, finalisationId) =>
      client.rpc("list_canonical_payroll_records", { ...scope, p_finalisation_id: finalisationId });
    const asOwner = (statement) =>
      `select set_config('request.jwt.claim.sub', '${users.owner}', true); set local role authenticated; ${statement}`;

    assert.equal((await finalise(clients.foh)).error?.message,
      "Only an owner, admin or general manager with full venue access can finalise or reopen payroll");
    assert.equal((await finalise(clients.worker)).error?.message, "Permission denied");
    assert.equal((await finalise(clients.outsider)).error?.message, "Permission denied");
    assert.equal((await clients.outsider.rpc("get_payroll_period", scope)).error?.message, "Permission denied");
    assert.deepEqual(await exceptions(clients.owner), sessions.map((id) => `${id}:approval_pending`).sort());
    assert.equal((await finalise(clients.gm)).error?.message, "Resolve outstanding exceptions before finalising");
    await approveAll();
    assert.deepEqual(await exceptions(clients.owner), []);

    const changingTimezone = await holdLock(
      `update public.venues set timezone = 'UTC' where id = '${venueId}'::uuid returning id`, venueId,
    );
    let pendingFinalise;
    try {
      pendingFinalise = Promise.resolve(finalise(clients.owner));
      await waitForLock("finalise_payroll_period");
      await changingTimezone.release(true);
      assert.equal((await pendingFinalise).error?.message, "Cannot snapshot payroll: the venue period changed",
        "finalisation fails instead of recording boundaries from a stale venue timezone");
    } finally {
      await changingTimezone.release(false);
      await Promise.allSettled([pendingFinalise].filter(Boolean));
    }
    assert.ifError((await admin.from("venues").update({ timezone: "Australia/Sydney" }).eq("id", venueId)).error);

    const capturedTimezone = await holdLock(asOwner(`select public.finalise_payroll_period('${businessId}'::uuid, ` +
      `'${venueId}'::uuid, '${week}'::date, '${randomUUID()}'::uuid, null)`));
    let pendingTimezone;
    try {
      pendingTimezone = Promise.resolve(admin.from("venues").update({ timezone: "Australia/Melbourne" }).eq("id", venueId));
      await waitForLock("venues");
      await capturedTimezone.release(false);
      assert.ifError((await pendingTimezone).error);
    } finally {
      await capturedTimezone.release(false);
      await Promise.allSettled([pendingTimezone].filter(Boolean));
    }
    assert.ifError((await admin.from("venues").update({ timezone: "Australia/Sydney" }).eq("id", venueId)).error);

    const unlocking = await holdLock(asOwner(`select public.set_attendance_edit_lock('${businessId}'::uuid, ` +
      `'${venueId}'::uuid, '${sessions[0]}'::uuid, '${randomUUID()}'::uuid, false, 'Late change')`));
    try {
      pendingFinalise = Promise.resolve(finalise(clients.gm));
      await waitForLock("finalise_payroll_period");
      await unlocking.release(true);
      assert.equal((await pendingFinalise).error?.message, "Resolve outstanding exceptions before finalising",
        "finalisation waits for the in-flight unlock and sees its outdated approval");
    } finally {
      await unlocking.release(false);
      await Promise.allSettled([pendingFinalise].filter(Boolean));
    }
    assert.deepEqual(await exceptions(clients.gm), [`${sessions[0]}:approval_outdated`]);
    await approveAll();

    const abandoned = await holdLock(asOwner(`select public.finalise_payroll_period('${businessId}'::uuid, ` +
      `'${venueId}'::uuid, '${week}'::date, '${randomUUID()}'::uuid, null)`));
    let pendingUnlock;
    try {
      pendingUnlock = Promise.resolve(unlock(clients.owner, sessions[1]));
      await waitForLock("set_attendance_edit_lock");
      await abandoned.release(false);
      assert.ifError((await pendingUnlock).error, "a rolled-back finalisation does not block attendance");
    } finally {
      await abandoned.release(false);
      await Promise.allSettled([pendingUnlock].filter(Boolean));
    }
    assert.equal(await periodStatus(), "open");
    await approveAll();

    const finalising = await holdLock(asOwner(`select public.finalise_payroll_period('${businessId}'::uuid, ` +
      `'${venueId}'::uuid, '${week}'::date, '${randomUUID()}'::uuid, 'Week closed')`));
    try {
      pendingUnlock = Promise.resolve(unlock(clients.owner, sessions[1]));
      await waitForLock("set_attendance_edit_lock");
      await finalising.release(true);
      assert.equal((await pendingUnlock).error?.message, finalisedMessage,
        "an unlock waiting on finalisation is rejected once the period commits");
    } finally {
      await finalising.release(false);
      await Promise.allSettled([pendingUnlock].filter(Boolean));
    }
    assert.equal(await periodStatus(), "finalised");
    assert.equal((await reopen(clients.foh, "Not mine")).error?.message,
      "Only an owner, admin or general manager with full venue access can finalise or reopen payroll");
    assert.equal((await reopen(clients.owner, "   ")).error?.message, "Invalid payroll period request");

    const reopenRequest = randomUUID();
    const retries = await Promise.all(Array.from({ length: 6 }, () =>
      reopen(clients.owner, "Late correction approved by owner", reopenRequest)));
    for (const result of retries) {
      assert.ifError(result.error);
      assert.equal(result.data, retries[0].data, "idempotent reopen retries return one event");
    }
    const competingReopens = await Promise.all(Array.from({ length: 4 }, () => reopen(clients.gm, "Second reopen")));
    for (const result of competingReopens) assert.equal(result.error?.message, "Payroll period is not finalised");
    assert.ifError((await unlock(clients.owner, sessions[1])).error);
    await approveAll();

    const competing = await Promise.all([
      ...Array.from({ length: 4 }, () => finalise(clients.owner)),
      ...Array.from({ length: 4 }, () => finalise(clients.gm)),
    ]);
    assert.equal(competing.filter((result) => !result.error).length, 1, "exactly one competing finalisation wins");
    for (const result of competing.filter((item) => item.error)) {
      assert.equal(result.error.message, "Payroll period is already finalised");
    }
    assert.equal(await sql(`select string_agg(action || ':' || session_count, ',' order by sequence) ` +
      `from public.payroll_period_events where business_id = '${businessId}'::uuid`),
    "finalised:2,reopened:0,finalised:2", "history records each committed transition once");
    assert.equal(await sql(`select count(*) from public.payroll_period_entries where business_id = '${businessId}'::uuid`),
      "4", "each finalisation snapshots both sessions");
    const outsiderEvents = await clients.outsider.from("payroll_period_events").select("id");
    assert.ifError(outsiderEvents.error);
    assert.equal(outsiderEvents.data.length, 0);
    const workerEntries = await clients.worker.from("payroll_period_entries").select("session_id");
    assert.ifError(workerEntries.error);
    assert.equal(workerEntries.data.length, 4, "the employee can read only snapshots of their own attendance");

    const finalisationId = competing.find((result) => !result.error)?.data;
    assert.ok(finalisationId);
    const ownerRecords = await canonical(clients.owner, finalisationId);
    assert.ifError(ownerRecords.error);
    const records = validateCanonicalPayrollRows(ownerRecords.data, {
      businessId, venueId, weekStart: week, finalisationId, sessionCount: 2,
    });
    assert.equal(records.length, 2);
    assert.ok(records.every((record) => record.approval.status === "approved" &&
      record.worker.providerMapping === null && record.payCodes === null));
    assert.ifError((await canonical(clients.gm, finalisationId)).error);
    for (const role of ["foh", "worker", "outsider"]) {
      assert.equal((await canonical(clients[role], finalisationId)).error?.message, "Permission denied");
    }
    assert.ok((await clients.worker.from("payroll_canonical_details").select("session_id")).error,
      "direct access cannot bypass the full-venue RPC");
    const originalRecord = JSON.stringify(ownerRecords.data[0].record);
    const prepared = prepareCanonicalPayrollForProvider(ownerRecords.data[0].record, {
      businessId, employeeId, provider: "example", connectionId: randomUUID(),
      externalEmployeeId: "explicit-worker-id", payCodes: [{ code: "example", seconds: records[0].hours.paid }],
    });
    assert.equal(prepared.worker.providerMapping.externalEmployeeId, "explicit-worker-id");
    assert.throws(() => { prepared.attendance.clockInAt = "changed"; }, TypeError);
    assert.equal(JSON.stringify(ownerRecords.data[0].record), originalRecord,
      "preparing a detached provider record does not alter the source snapshot");
    const reloaded = await canonical(clients.owner, finalisationId);
    assert.ifError(reloaded.error);
    assert.equal(JSON.stringify(reloaded.data[0].record), originalRecord,
      "preparing a provider record does not alter persisted attendance or its snapshot");

    const revocation = await holdLock(
      `delete from public.business_memberships where business_id = '${businessId}'::uuid ` +
        `and user_id = '${users.gm}'::uuid returning user_id`,
      users.gm,
    );
    let pendingPreview;
    try {
      pendingPreview = Promise.resolve(canonical(clients.gm, finalisationId));
      await waitForLock("list_canonical_payroll_records");
      await revocation.release(true);
      assert.equal((await pendingPreview).error?.message, "Permission denied",
        "a payroll preview waiting on membership revocation rechecks access");
    } finally {
      await revocation.release(false);
      await Promise.allSettled([pendingPreview].filter(Boolean));
    }

    const reopening = await holdLock(asOwner(`select public.reopen_payroll_period('${businessId}'::uuid, ` +
      `'${venueId}'::uuid, '${week}'::date, '${randomUUID()}'::uuid, 'Review late request')`));
    try {
      pendingPreview = Promise.resolve(canonical(clients.owner, finalisationId));
      await waitForLock("list_canonical_payroll_records");
      await reopening.release(true);
      assert.equal((await pendingPreview).error?.message, "Payroll period changed; refresh before reviewing records",
        "a preview waiting on reopening cannot return a stale finalisation");
    } finally {
      await reopening.release(false);
      await Promise.allSettled([pendingPreview].filter(Boolean));
    }
  } finally {
    for (const id of [businessId, outsideId]) {
      assert.ifError((await admin.from("businesses").delete().eq("id", id)).error);
    }
    for (const user of Object.values(users)) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
