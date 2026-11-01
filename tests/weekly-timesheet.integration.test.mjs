import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("weekly timesheet HTTP RPCs enforce tenant, venue, department and live membership scope", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 90_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const users = [];
  const clients = new Map();
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [business, outsideBusiness, venue, otherVenue, outsideVenue, foh, boh, otherDepartment,
    worker, cook, fohSession, bohSession, cookSession] = Array.from({ length: 13 }, () => randomUUID());
  try {
    for (const role of ["owner", "foh", "boh", "worker", "outside"]) {
      const email = `weekly-http-${role}-${suffix}@example.test`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(created.error);
      users.push(created.data.user.id);
      const client = createClient(url, anonKey, options);
      assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
      clients.set(role, client);
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: business, name: "Weekly HTTP cafe" },
      { id: outsideBusiness, name: "Outside weekly HTTP cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert([
      { id: venue, business_id: business, name: "Harbour", timezone: "Australia/Sydney" },
      { id: otherVenue, business_id: business, name: "Riverside", timezone: "Australia/Perth" },
      { id: outsideVenue, business_id: outsideBusiness, name: "Outside", timezone: "UTC" },
    ])).error);
    assert.ifError((await admin.from("departments").insert([
      { id: foh, business_id: business, venue_id: venue, name: "FOH" },
      { id: boh, business_id: business, venue_id: venue, name: "BOH" },
      { id: otherDepartment, business_id: business, venue_id: otherVenue, name: "Riverside" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: business, user_id: users[0], role: "owner" },
      { business_id: business, user_id: users[1], role: "foh_manager", venue_id: venue, department_id: foh },
      { business_id: business, user_id: users[2], role: "boh_manager", venue_id: venue, department_id: boh },
      { business_id: business, user_id: users[3], role: "employee", venue_id: venue, department_id: foh },
      { business_id: outsideBusiness, user_id: users[4], role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert([
      { id: worker, business_id: business, venue_id: venue, department_id: foh,
        auth_user_id: users[3], name: "Weekly HTTP worker", role_title: "Server" },
      { id: cook, business_id: business, venue_id: venue, department_id: boh,
        name: "Weekly HTTP cook", role_title: "Cook" },
    ])).error);
    assert.ifError((await admin.from("employee_departments").insert({
      business_id: business, employee_id: worker, department_id: boh,
    })).error);
    assert.ifError((await admin.from("shifts").insert([
      { business_id: business, venue_id: venue, department_id: foh, employee_id: worker, role_title: "Server",
        starts_at: "2024-10-05T13:30:00Z", ends_at: "2024-10-05T17:30:00Z", is_published: true },
      { business_id: business, venue_id: venue, department_id: boh, employee_id: worker, role_title: "Cook",
        starts_at: "2024-10-06T12:00:00Z", ends_at: "2024-10-06T14:00:00Z", is_published: true },
      { business_id: business, venue_id: venue, department_id: boh, employee_id: cook, role_title: "Cook",
        starts_at: "2024-10-02T00:00:00Z", ends_at: "2024-10-02T02:00:00Z", is_published: true },
      { business_id: business, venue_id: venue, department_id: foh, employee_id: worker, role_title: "Private",
        starts_at: "2024-10-03T00:00:00Z", ends_at: "2024-10-03T01:00:00Z", is_published: false },
    ])).error);
    const sessions = [
      { id: fohSession, business_id: business, venue_id: venue, department_id: foh, employee_id: worker,
        started_by: users[3] },
      { id: bohSession, business_id: business, venue_id: venue, department_id: boh, employee_id: worker,
        started_by: users[3] },
      { id: cookSession, business_id: business, venue_id: venue, department_id: boh, employee_id: cook,
        started_by: users[3] },
    ];
    assert.ifError((await admin.from("attendance_sessions").insert(sessions)).error);
    const event = (session, eventType, occurredAt, source = "server_clock") => ({
      session_id: session.id, business_id: session.business_id, venue_id: session.venue_id,
      department_id: session.department_id, employee_id: session.employee_id, actor_id: session.started_by,
      request_id: randomUUID(), event_type: eventType, occurred_at: occurredAt, source,
    });
    assert.ifError((await admin.from("attendance_events").insert([
      event(sessions[0], "clock_in", "2024-10-05T13:30:00.123456Z"),
      event(sessions[0], "clock_out", "2024-10-05T17:30:00.123456Z"),
      event(sessions[1], "clock_in", "2024-10-06T12:00:00Z", "offline_claim"),
      event(sessions[1], "clock_out", "2024-10-06T14:00:00Z", "offline_claim"),
      event(sessions[2], "clock_in", "2024-10-02T00:00:00Z"),
      event(sessions[2], "clock_out", "2024-10-02T02:00:00Z"),
    ])).error);
    const scope = { p_business_id: business, p_venue_id: venue, p_week_start: "2024-09-30" };
    const rpcNames = [
      "list_weekly_planned_shifts", "list_weekly_worked_time", "list_weekly_timesheet_events",
      "list_weekly_worked_time_for_edit", "list_weekly_timesheet_events_for_edit",
    ];
    for (const rpcName of rpcNames) {
      for (const role of ["worker", "outside"]) {
        const result = await clients.get(role).rpc(rpcName, scope);
        assert.equal(result.error?.message, "Permission denied", `${role} must not use ${rpcName}`);
      }
      const other = await clients.get("foh").rpc(rpcName, { ...scope, p_venue_id: otherVenue });
      assert.equal(other.error?.message, "Permission denied", `${rpcName} must enforce venue scope`);
      const crossTenantVenue = await clients.get("owner").rpc(rpcName, { ...scope, p_venue_id: outsideVenue });
      assert.equal(crossTenantVenue.error?.message, "Permission denied", `${rpcName} must enforce tenant scope`);
      const invalid = await clients.get("owner").rpc(rpcName, { ...scope, p_week_start: "2024-10-01" });
      assert.equal(invalid.error?.message, "Invalid timesheet week");
    }
    const fohPlanned = await clients.get("foh").rpc("list_weekly_planned_shifts", scope);
    assert.ifError(fohPlanned.error);
    assert.deepEqual(fohPlanned.data.map((row) => row.department_id), [foh]);
    const fohTime = await clients.get("foh").rpc("list_weekly_worked_time", scope);
    assert.ifError(fohTime.error);
    assert.deepEqual(fohTime.data.map((row) => row.session_id), [fohSession]);
    const fohEvents = await clients.get("foh").rpc("list_weekly_timesheet_events", scope);
    assert.ifError(fohEvents.error);
    assert.equal(fohEvents.data.length, 2);
    assert.ok(fohEvents.data.every((row) => row.session_id === fohSession && row.source === "server_clock"));
    assert.ok(fohEvents.data.some((row) => row.original_at.includes(".123456")));
    const restrictedEmployee = await clients.get("foh").rpc("list_weekly_worked_time", {
      ...scope, p_employee_id: cook,
    });
    assert.ifError(restrictedEmployee.error);
    assert.deepEqual(restrictedEmployee.data, []);
    const bohTime = await clients.get("boh").rpc("list_weekly_worked_time", {
      ...scope, p_employee_id: worker,
    });
    assert.ifError(bohTime.error);
    assert.deepEqual(bohTime.data.map((row) => row.session_id), [bohSession]);
    assert.ok(bohTime.data[0].exceptions.includes("offline_claim_unverified"));
    const bohEvents = await clients.get("boh").rpc("list_weekly_timesheet_events", {
      ...scope, p_employee_id: worker,
    });
    assert.ifError(bohEvents.error);
    assert.equal(bohEvents.data.length, 2);
    assert.ok(bohEvents.data.every((row) => row.session_id === bohSession && row.source === "offline_claim"));
    const nextWeek = await clients.get("owner").rpc("list_weekly_worked_time", {
      ...scope, p_week_start: "2024-10-07",
    });
    assert.ifError(nextWeek.error);
    assert.deepEqual(nextWeek.data, [], "overnight sessions belong only to their start week");
    const ownerTime = await clients.get("owner").rpc("list_weekly_worked_time", scope);
    assert.ifError(ownerTime.error);
    assert.deepEqual(new Set(ownerTime.data.map((row) => row.session_id)), new Set([fohSession, bohSession, cookSession]));

    assert.ifError((await admin.from("business_memberships").delete().eq("business_id", business)
      .eq("user_id", users[1])).error);
    for (const rpcName of rpcNames) {
      const result = await clients.get("foh").rpc(rpcName, scope);
      assert.equal(result.error?.message, "Permission denied", `${rpcName} must recheck revoked membership`);
    }
  } finally {
    for (const id of [business, outsideBusiness]) {
      assert.ifError((await admin.from("businesses").delete().eq("id", id)).error);
    }
    for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
});
