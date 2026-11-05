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

test("venue planning changes serialize, preserve tenant scope and honor revoked ownership", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, waitForLock, holdLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const roles = ["owner", "second-owner", "manager", "outsider"];
  const clients = Object.fromEntries(roles.map((role) => [role, createClient(url, anonKey, options)]));
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, outsideVenueId, departmentId] =
    Array.from({ length: 5 }, () => randomUUID());
  const users = {};

  async function waitForWaiters(expected) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const count = await sql(
        "select count(*) from pg_stat_activity where wait_event_type = 'Lock' " +
        "and query ilike '%save_venue_roster_week%'",
      );
      if (Number(count) >= expected) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${expected} planning-week calls to reach a lock.`);
  }

  const input = (weekday, revision, pendingId = null, requestId = randomUUID()) => ({
    p_business_id: businessId, p_venue_id: venueId, p_weekday: weekday,
    p_expected_revision: revision, p_expected_pending_id: pendingId, p_request_id: requestId,
  });
  const save = (client, value) => client.rpc("save_venue_roster_week", value);

  try {
    for (const role of roles) {
      const created = await admin.auth.admin.createUser({
        email: `planning-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(created.error);
      users[role] = created.data.user.id;
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Planning race cafe" },
      { id: outsideId, name: "Outside planning cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert([
      { id: venueId, business_id: businessId, name: "Sydney venue", timezone: "Australia/Sydney" },
      { id: outsideVenueId, business_id: outsideId, name: "Outside venue", timezone: "Australia/Perth" },
    ])).error);
    assert.ifError((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users["second-owner"], role: "owner" },
      { business_id: businessId, user_id: users.manager, role: "foh_manager", venue_id: venueId, department_id: departmentId },
      { business_id: outsideId, user_id: users.outsider, role: "owner" },
    ])).error);
    for (const role of roles) {
      assert.ifError((await clients[role].auth.signInWithPassword({
        email: `planning-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const requests = [input(3, 0), input(7, 0)];
    const writers = [clients.owner, clients["second-owner"]];
    const gate = await holdLock(
      `select id from public.venues where id = '${venueId}'::uuid for update`, venueId,
    );
    let pending;
    let results;
    try {
      pending = Promise.all(writers.map((client, index) => save(client, requests[index])));
      await waitForWaiters(2);
      await gate.release(false);
      results = await pending;
    } finally {
      await gate.release(false);
      await Promise.allSettled([pending].filter(Boolean));
    }
    assert.equal(results.filter((result) => !result.error).length, 1, "only one same-revision change succeeds");
    assert.equal(results.find((result) => result.error)?.error.message,
      "Roster week setting changed; refresh before saving");
    const winner = results.findIndex((result) => !result.error);
    const eventId = results[winner].data;
    const retry = await save(writers[winner], requests[winner]);
    assert.ifError(retry.error);
    assert.equal(retry.data, eventId, "an identical retry returns the existing event");
    const history = await clients.owner.from("venue_roster_week_events")
      .select("id, revision, weekday").eq("venue_id", venueId);
    assert.ifError(history.error);
    assert.deepEqual(history.data.map((event) => event.revision), [1]);
    assert.equal(history.data[0].id, eventId);
    const audit = await clients.owner.from("sensitive_action_audit")
      .select("actor_id, new_values").eq("source_table", "venue_roster_week_events").eq("record_id", eventId);
    assert.ifError(audit.error);
    assert.equal(audit.data.length, 1);
    assert.equal(audit.data[0].new_values.weekday, requests[winner].p_weekday);

    for (const role of ["manager", "outsider"]) {
      assert.equal((await save(clients[role], input(2, 1, eventId))).error?.message, "Permission denied");
      const hidden = await clients[role].from("venue_roster_week_events").select("id").eq("venue_id", venueId);
      assert.ifError(hidden.error);
      assert.deepEqual(hidden.data, []);
      assert.equal((await clients[role].rpc("get_venue_roster_week_settings", {
        p_business_id: businessId, p_venue_id: venueId,
      })).error?.message, "Permission denied");
    }
    const managerPeriod = await clients.manager.rpc("get_roster_planning_period", {
      p_business_id: businessId, p_venue_id: venueId, p_date: "2032-01-01",
    });
    assert.ifError(managerPeriod.error);
    assert.equal(managerPeriod.data.length, 1);
    assert.equal((await clients.outsider.rpc("get_roster_planning_period", {
      p_business_id: businessId, p_venue_id: venueId, p_date: "2032-01-01",
    })).error?.message, "Permission denied");
    assert.equal((await clients.owner.rpc("get_roster_planning_period", {
      p_business_id: businessId, p_venue_id: outsideVenueId, p_date: "2032-01-01",
    })).error?.message, "Permission denied");

    const revocation = await holdLock(
      `update public.business_memberships set role = 'admin' where business_id = '${businessId}'::uuid ` +
      `and user_id = '${users.owner}'::uuid returning user_id`, users.owner,
    );
    let waitingSave;
    try {
      waitingSave = Promise.resolve(save(clients.owner, input(2, 1, eventId)));
      await waitForLock("save_venue_roster_week");
      await revocation.release(true);
      const denied = await waitingSave;
      assert.equal(denied.error?.message, "Permission denied", "ownership is checked after a concurrent revocation");
    } finally {
      await revocation.release(false);
      await Promise.allSettled([waitingSave].filter(Boolean));
    }
    const unchanged = await clients["second-owner"].from("venue_roster_week_events")
      .select("id, revision").eq("venue_id", venueId);
    assert.ifError(unchanged.error);
    assert.deepEqual(unchanged.data.map((event) => event.revision), [1]);
  } finally {
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const id of Object.values(users)) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
});
