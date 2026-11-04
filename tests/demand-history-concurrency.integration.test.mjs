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

test("demand imports serialize retries, overlapping files and access changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, waitForLock, holdLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const ownerA = createClient(url, anonKey, options);
  const ownerB = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const email = `demand-race-${suffix}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const businessId = randomUUID();
  const venueId = randomUUID();
  let userId;

  const row = (id, value = "1") => ({
    source_record_id: id, occurred_at: "2024-01-15T12:30:00Z", value,
  });
  const upload = (client, requestId, rows, timezone = "UTC") => client.rpc("import_demand_history", {
    p_business_id: businessId, p_venue_id: venueId, p_event_type: "sales",
    p_source_name: "POS", p_venue_timezone: timezone, p_request_id: requestId, p_rows: rows,
  });
  const counts = async () => ({
    imports: Number(await sql(`select count(*) from public.demand_history_imports where business_id = '${businessId}'::uuid`)),
    records: Number(await sql(`select count(*) from public.demand_history_records where business_id = '${businessId}'::uuid`)),
  });
  async function waitForWaiters(expected) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const count = await sql(
        "select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%import_demand_history%'",
      );
      if (Number(count) >= expected) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${expected} demand imports to reach a lock.`);
  }
  async function gatedImports(invoke) {
    const gate = await holdLock(`select id from public.venues where id = '${venueId}'::uuid for update`, venueId);
    let pending;
    try {
      pending = Promise.all(invoke());
      await waitForWaiters(2);
      await gate.release(false);
      return await pending;
    } finally {
      await gate.release(false);
      if (pending) await Promise.allSettled([pending]);
    }
  }
  async function gatedChange(statement, expectedOutput, invoke) {
    const gate = await holdLock(statement, expectedOutput);
    let pending;
    try {
      pending = Promise.resolve(invoke());
      await waitForLock("import_demand_history");
      await gate.release(true);
      return await pending;
    } finally {
      await gate.release(false);
      if (pending) await Promise.allSettled([pending]);
    }
  }

  try {
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(user.error);
    userId = user.data.user.id;
    assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Demand race cafe" })).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "UTC venue", timezone: "UTC",
    })).error);
    assert.ifError((await admin.from("business_memberships").insert({
      business_id: businessId, user_id: userId, role: "owner",
    })).error);
    for (const client of [ownerA, ownerB]) {
      assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    }

    const requestId = randomUUID();
    const identical = await gatedImports(() => [
      upload(ownerA, requestId, [row("same")]),
      upload(ownerB, requestId, [row("same")]),
    ]);
    identical.forEach((result) => assert.ifError(result.error));
    assert.equal(identical[0].data, identical[1].data);
    assert.deepEqual(await counts(), { imports: 1, records: 1 }, "simultaneous retries insert exactly once");

    const collision = randomUUID();
    const conflicting = await gatedImports(() => [
      upload(ownerA, collision, [row("conflict-a")]),
      upload(ownerB, collision, [row("conflict-b")]),
    ]);
    assert.equal(conflicting.filter((result) => !result.error).length, 1);
    assert.equal(conflicting.find((result) => result.error)?.error.message, "Request identifier already used");
    assert.deepEqual(await counts(), { imports: 2, records: 2 }, "conflicting request bodies cannot both succeed");

    const overlap = await gatedImports(() => [
      upload(ownerA, randomUUID(), [row("overlap", "10"), row("unique-a")]),
      upload(ownerB, randomUUID(), [row("overlap", "20"), row("unique-b")]),
    ]);
    assert.equal(overlap.filter((result) => !result.error).length, 1);
    assert.equal(overlap.find((result) => result.error)?.error.message, "Source record IDs already imported; nothing was saved");
    assert.deepEqual(await counts(), { imports: 3, records: 4 }, "a duplicate rolls back the losing file completely");
    assert.equal(Number(await sql(`select count(*) from public.demand_history_records
      where business_id = '${businessId}'::uuid and source_record_id = 'overlap'`)), 1);
    assert.equal(Number(await sql(`select count(*) from public.demand_history_records
      where business_id = '${businessId}'::uuid and source_record_id in ('unique-a', 'unique-b')`)), 1);

    const changedZone = await gatedChange(
      `update public.venues set timezone = 'Australia/Sydney' where id = '${venueId}'::uuid returning id`,
      venueId, () => upload(ownerA, randomUUID(), [row("stale-timezone")]),
    );
    assert.equal(changedZone.error?.message, "Venue timezone changed or is invalid");
    assert.deepEqual(await counts(), { imports: 3, records: 4 }, "timezone changes cannot accept stale imports");
    const retryAfterZoneChange = await upload(ownerA, requestId, [row("same")]);
    assert.ifError(retryAfterZoneChange.error);
    assert.equal(retryAfterZoneChange.data, identical[0].data, "a known retry returns its original receipt");

    const revoked = await gatedChange(
      `delete from public.business_memberships where business_id = '${businessId}'::uuid
        and user_id = '${userId}'::uuid returning user_id`,
      userId, () => upload(ownerA, randomUUID(), [row("revoked")]),
    );
    assert.equal(revoked.error?.message, "Permission denied");
    assert.deepEqual(await counts(), { imports: 3, records: 4 }, "membership revocation blocks in-flight imports");
    const visibility = await ownerA.from("demand_history_records").select("id").eq("business_id", businessId);
    assert.ifError(visibility.error);
    assert.deepEqual(visibility.data, [], "revoked owner can no longer read raw records");
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    if (userId) assert.ifError((await admin.auth.admin.deleteUser(userId)).error);
  }
});
