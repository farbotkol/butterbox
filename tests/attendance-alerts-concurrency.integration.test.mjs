import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("scheduled alerts, scoped notifications and concurrent attendance decisions", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 150_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const clients = Object.fromEntries(["owner", "foh", "colleague", "boh", "worker", "outside"]
    .map((role) => [role, createClient(url, anonKey, options)]));
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideBusinessId, venueId, outsideVenueId, fohId, bohId, outsideDepartmentId,
    workerId, draftWorkerId, outsideEmployeeId, shiftId, draftShiftId, outsideShiftId, lateShiftId] =
    Array.from({ length: 14 }, () => randomUUID());
  const users = {};
  const settingsArgs = {
    p_business_id: businessId, p_venue_id: venueId,
    p_enabled: true, p_grace_minutes: 0, p_no_show_minutes: 60,
  };
  const listArgs = { p_business_id: businessId, p_venue_id: venueId };
  let settingsEnabled = false;
  let sessionId;

  try {
    for (const role of Object.keys(clients)) {
      const result = await admin.auth.admin.createUser({
        email: `alert-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users[role] = result.data.user.id;
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Alert race business" },
      { id: outsideBusinessId, name: "Outside alert race business" },
    ])).error);
    assert.ifError((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Alert venue", timezone: "UTC" },
      { id: outsideVenueId, business_id: outsideBusinessId, name: "Outside venue", timezone: "UTC" },
    ])).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
      { id: outsideDepartmentId, business_id: outsideBusinessId, venue_id: outsideVenueId, name: "Outside" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.colleague, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.boh, role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users.worker, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideBusinessId, user_id: users.outside, role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert([
      { id: workerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.worker, name: "Alert worker", role_title: "Server" },
      { id: draftWorkerId, business_id: businessId, venue_id: venueId, department_id: fohId,
        name: "Draft worker", role_title: "Server" },
      { id: outsideEmployeeId, business_id: outsideBusinessId, venue_id: outsideVenueId,
        department_id: outsideDepartmentId, name: "Outside worker", role_title: "Server" },
    ])).error);
    const startsAt = new Date(Date.now() - 15 * 60_000).toISOString();
    const endsAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    assert.ifError((await admin.from("shifts").insert([
      { id: shiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: workerId, role_title: "Server", starts_at: startsAt, ends_at: endsAt, is_published: true },
      { id: draftShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: draftWorkerId, role_title: "Draft", starts_at: startsAt, ends_at: endsAt, is_published: false },
      { id: outsideShiftId, business_id: outsideBusinessId, venue_id: outsideVenueId, department_id: outsideDepartmentId,
        employee_id: outsideEmployeeId, role_title: "Outside", starts_at: startsAt, ends_at: endsAt, is_published: true },
    ])).error);
    for (const [role, client] of Object.entries(clients)) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `alert-race-${role}-${suffix}@example.test`, password,
      })).error);
    }

    assert.equal((await clients.foh.rpc("save_attendance_alert_settings", settingsArgs)).error?.message, "Permission denied");
    assert.equal((await clients.worker.rpc("list_attendance_alerts", listArgs)).error?.message, "Permission denied");
    assert.equal((await clients.outside.rpc("list_attendance_alerts", listArgs)).error?.message, "Permission denied");
    assert.equal((await clients.owner.rpc("save_attendance_alert_settings", {
      ...settingsArgs, p_no_show_minutes: 0,
    })).error?.message, "Invalid attendance alert settings");
    const enabledAt = await sql("select clock_timestamp()::text");
    assert.ifError((await clients.owner.rpc("save_attendance_alert_settings", settingsArgs)).error);
    settingsEnabled = true;

    let firstAlert;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const result = await clients.foh.rpc("list_attendance_alerts", listArgs);
      assert.ifError(result.error);
      firstAlert = result.data.find((item) => item.shift_id === shiftId);
      if (firstAlert) break;
      await delay(1_500);
    }
    assert.ok(firstAlert, "The scheduled worker must create the alert without a manual scan");
    assert.equal(firstAlert.signal, "missing_clock_in");
    assert.equal(firstAlert.status, "open");
    let cronRuns = "0";
    for (let attempt = 0; attempt < 10 && Number(cronRuns) === 0; attempt += 1) {
      cronRuns = await sql(
        `select count(*) from cron.job_run_details r join cron.job j on j.jobid = r.jobid ` +
        `where j.jobname = 'butterbox-attendance-alerts' and r.status = 'succeeded' ` +
        `and r.start_time >= '${enabledAt}'::timestamptz`,
      );
      if (Number(cronRuns) === 0) await delay(200);
    }
    assert.ok(Number(cronRuns) >= 1, "The actual scheduled job must finish successfully after monitoring was enabled");
    assert.equal(await sql(
      `select count(*) from public.attendance_alerts where shift_id in ('${draftShiftId}'::uuid, '${outsideShiftId}'::uuid)`,
    ), "0");

    const initialNotifications = await clients.foh.rpc("list_attendance_alert_notifications", listArgs);
    assert.ifError(initialNotifications.error);
    assert.equal(initialNotifications.data.length, 1);
    assert.equal(initialNotifications.data[0].unread, true);
    const initialNoticeId = initialNotifications.data[0].notification_id;
    assert.equal((await clients.boh.rpc("list_attendance_alerts", listArgs)).data.length, 0);
    assert.equal((await clients.boh.rpc("mark_attendance_alert_notification_read", {
      ...listArgs, p_notification_id: initialNoticeId,
    })).error?.message, "Notification not found or permission denied");
    assert.equal((await clients.outside.rpc("mark_attendance_alert_notification_read", {
      ...listArgs, p_notification_id: initialNoticeId,
    })).error?.message, "Permission denied");
    assert.equal((await clients.worker.rpc("act_on_attendance_alert", {
      ...listArgs, p_alert_id: firstAlert.alert_id, p_action: "acknowledged",
      p_reason: null, p_request_id: randomUUID(),
    })).error?.message, "Alert not found or permission denied");

    const acknowledgement = {
      ...listArgs, p_alert_id: firstAlert.alert_id, p_action: "acknowledged",
      p_reason: null, p_request_id: randomUUID(),
    };
    const acknowledgements = await Promise.all(Array.from({ length: 5 }, () =>
      clients.foh.rpc("act_on_attendance_alert", acknowledgement)));
    for (const result of acknowledgements) {
      assert.ifError(result.error);
      assert.equal(result.data, firstAlert.alert_id);
    }
    assert.equal(await sql(
      `select count(*) from public.attendance_alert_events where alert_id = '${firstAlert.alert_id}'::uuid ` +
      "and event_type = 'acknowledged'",
    ), "1");
    const colleagueNotice = await clients.colleague.rpc("list_attendance_alert_notifications", listArgs);
    assert.ifError(colleagueNotice.error);
    assert.equal(colleagueNotice.data[0].status, "acknowledged");
    assert.equal(colleagueNotice.data[0].unread, true);
    const markArgs = { ...listArgs, p_notification_id: initialNoticeId };
    const reads = await Promise.all(Array.from({ length: 4 }, () =>
      clients.colleague.rpc("mark_attendance_alert_notification_read", markArgs)));
    for (const result of reads) {
      assert.ifError(result.error);
      assert.equal(result.data, firstAlert.alert_id);
    }
    assert.equal((await clients.colleague.rpc("list_attendance_alert_notifications", listArgs)).data[0].unread, false);

    const shiftLock = await holdLock(`select id from public.shifts where id = '${shiftId}'::uuid for update`, shiftId);
    let scanning;
    try {
      scanning = sql("select public.run_attendance_alert_worker()");
      await waitForLock("run_attendance_alert_worker");
      const clock = await clients.worker.rpc("clock_in_attendance", {
        p_business_id: businessId, p_venue_id: venueId, p_department_id: fohId,
        p_employee_id: workerId, p_request_id: randomUUID(),
      });
      assert.ifError(clock.error);
      sessionId = clock.data[0].session_id;
      await shiftLock.release(false);
      await scanning;
    } finally {
      await shiftLock.release(false);
      await Promise.allSettled([scanning].filter(Boolean));
    }
    const scanAtClockStart = await clients.foh.rpc("list_attendance_alerts", listArgs);
    assert.ifError(scanAtClockStart.error);
    assert.equal(scanAtClockStart.data[0].signal, "missing_clock_in",
      "A scan uses its start time, so a later clock is not included in that scan");
    await sql("select public.run_attendance_alert_worker()");
    const afterClock = await clients.foh.rpc("list_attendance_alerts", listArgs);
    assert.ifError(afterClock.error);
    assert.equal(afterClock.data.length, 1);
    assert.equal(afterClock.data[0].alert_id, firstAlert.alert_id);
    assert.equal(afterClock.data[0].signal, "late");
    assert.equal(afterClock.data[0].status, "open");
    const newerNotice = await clients.colleague.rpc("list_attendance_alert_notifications", listArgs);
    assert.ifError(newerNotice.error);
    assert.equal(newerNotice.data.length, 1);
    assert.equal(newerNotice.data[0].unread, true);
    assert.notEqual(newerNotice.data[0].notification_id, initialNoticeId);
    assert.ifError((await clients.colleague.rpc("mark_attendance_alert_notification_read", markArgs)).error);
    assert.equal((await clients.colleague.rpc("list_attendance_alert_notifications", listArgs)).data[0].unread, true);

    const membershipLock = await holdLock(
      `update public.business_memberships set department_id = '${bohId}'::uuid ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users.foh}'::uuid returning user_id`,
      users.foh,
    );
    let pendingAction;
    try {
      pendingAction = Promise.resolve(clients.foh.rpc("act_on_attendance_alert", {
        ...acknowledgement, p_request_id: randomUUID(),
      }));
      await waitForLock("act_on_attendance_alert");
      await membershipLock.release(true);
      assert.equal((await pendingAction).error?.message, "Alert not found or permission denied");
    } finally {
      await membershipLock.release(false);
      await Promise.allSettled([pendingAction].filter(Boolean));
    }
    assert.ifError((await admin.from("business_memberships").update({ department_id: fohId })
      .eq("business_id", businessId).eq("user_id", users.foh)).error);

    const decisions = await Promise.all([clients.foh, clients.colleague].map((client) =>
      client.rpc("act_on_attendance_alert", {
        ...listArgs, p_alert_id: firstAlert.alert_id, p_action: "resolved",
        p_reason: "Checked the clock", p_request_id: randomUUID(),
      })));
    assert.equal(decisions.filter((result) => !result.error).length, 1);
    assert.equal(decisions.find((result) => result.error).error.message, "Alert is already resolved");
    assert.equal(await sql(
      `select count(*) from public.attendance_alert_events where alert_id = '${firstAlert.alert_id}'::uuid ` +
      "and event_type = 'resolved' and reason = 'Checked the clock'",
    ), "1");

    const unpublishLock = await holdLock(
      `update public.shifts set is_published = false where id = '${shiftId}'::uuid returning id`, shiftId,
    );
    let pendingScan;
    try {
      pendingScan = sql("select public.run_attendance_alert_worker()");
      await waitForLock("run_attendance_alert_worker");
      await unpublishLock.release(true);
      await pendingScan;
    } finally {
      await unpublishLock.release(false);
      await Promise.allSettled([pendingScan].filter(Boolean));
    }
    await sql("select public.run_attendance_alert_worker()");
    const cleared = await clients.foh.rpc("list_attendance_alerts", listArgs);
    assert.ifError(cleared.error);
    assert.equal(cleared.data[0].status, "resolved");
    assert.equal(cleared.data[0].signal, null);

    const policyLock = await holdLock(
      `update public.venue_attendance_alert_policies set enabled = false, enabled_at = null ` +
        `where venue_id = '${venueId}'::uuid returning venue_id`,
      venueId,
    );
    let policyScan;
    try {
      assert.ifError((await admin.from("shifts").insert({
        id: lateShiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
        employee_id: draftWorkerId, role_title: "Policy race", starts_at: startsAt, ends_at: endsAt,
        is_published: true,
      })).error);
      policyScan = sql("select public.run_attendance_alert_worker()");
      await waitForLock("run_attendance_alert_worker");
      await policyLock.release(true);
      await policyScan;
    } finally {
      await policyLock.release(false);
      await Promise.allSettled([policyScan].filter(Boolean));
    }
    assert.equal(await sql(`select count(*) from public.attendance_alerts where shift_id = '${lateShiftId}'::uuid`), "0");
    const stopped = await clients.owner.rpc("get_attendance_alert_settings", listArgs);
    assert.ifError(stopped.error);
    assert.equal(stopped.data[0].scheduler_state, "disabled");
  } finally {
    if (settingsEnabled) {
      assert.ifError((await clients.owner.rpc("save_attendance_alert_settings", {
        ...settingsArgs, p_enabled: false,
      })).error);
    }
    if (sessionId) {
      assert.ifError((await clients.worker.rpc("clock_out_attendance", {
        p_business_id: businessId, p_session_id: sessionId, p_request_id: randomUUID(),
      })).error);
    }
    await assertBusinessFixturesPreserved(admin, [businessId, outsideBusinessId]);
    for (const user of Object.values(users)) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
