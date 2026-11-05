import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("business exports serialize owner revocation and venue timezone changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, holdLock, waitForLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const owner = createClient(url, anonKey, options);
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, venueId, departmentId, employeeId] = Array.from({ length: 4 }, () => randomUUID());
  const users = [];
  try {
    for (const role of ["owner", "backup"]) {
      const result = await admin.auth.admin.createUser({
        email: `report-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users.push(result.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert({ id: businessId, name: "Report race cafe" })).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Sydney", timezone: "Australia/Sydney",
    })).error);
    assert.ifError((await admin.from("departments").insert({
      id: departmentId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error);
    assert.ifError((await admin.from("business_memberships").insert(users.map((user_id) => ({
      business_id: businessId, user_id, role: "owner",
    })))).error);
    assert.ifError((await admin.from("employees").insert({
      id: employeeId, business_id: businessId, venue_id: venueId, department_id: departmentId,
      name: "Synthetic race worker", role_title: "Server",
    })).error);
    assert.ifError((await admin.from("shifts").insert({
      business_id: businessId, venue_id: venueId, department_id: departmentId, employee_id: employeeId,
      role_title: "Server", starts_at: "2024-09-29T14:00:00Z", ends_at: "2024-09-29T15:00:00Z",
    })).error);
    assert.ifError((await owner.auth.signInWithPassword({
      email: `report-race-owner-${suffix}@example.test`, password,
    })).error);
    const args = {
      p_business_id: businessId, p_venue_id: venueId, p_week_start: "2024-09-30", p_report_type: "roster",
    };
    const generate = () => owner.rpc("generate_business_report_export", args);
    const eventCount = async () => Number(await sql(
      `select count(*) from public.business_report_export_events where business_id = '${businessId}'::uuid`,
    ));
    const asOwner = (statement) =>
      `select set_config('request.jwt.claim.sub', '${users[0]}', true); set local role authenticated; ${statement}`;
    const exportSql = `select public.generate_business_report_export('${businessId}'::uuid, ` +
      `'${venueId}'::uuid, '2024-09-30'::date, 'roster')`;

    const before = await eventCount();
    const revocation = await holdLock(
      `update public.business_memberships set role = 'admin' where business_id = '${businessId}'::uuid ` +
      `and user_id = '${users[0]}'::uuid returning id`,
    );
    let pendingExport;
    try {
      pendingExport = Promise.resolve(generate());
      await waitForLock("generate_business_report_export");
      await revocation.release(true);
      assert.equal((await pendingExport).error?.message, "Permission denied");
    } finally {
      await revocation.release(false);
      await Promise.allSettled([pendingExport].filter(Boolean));
    }
    assert.equal(await eventCount(), before, "a revoked request does not record an export");

    await sql(`update public.business_memberships set role = 'owner' where business_id = '${businessId}'::uuid ` +
      `and user_id = '${users[0]}'::uuid`);
    const generating = await holdLock(asOwner(exportSql), '"entry_count": 1');
    let pendingRevocation;
    try {
      pendingRevocation = sql(`update public.business_memberships set role = 'admin' ` +
        `where business_id = '${businessId}'::uuid and user_id = '${users[0]}'::uuid`);
      await waitForLock("business_memberships");
      await generating.release(true);
      await pendingRevocation;
    } finally {
      await generating.release(false);
      await Promise.allSettled([pendingRevocation].filter(Boolean));
    }
    assert.equal(await eventCount(), before + 1, "an already-authorized export commits before revocation");
    assert.equal((await generate()).error?.message, "Permission denied");

    await sql(`update public.business_memberships set role = 'owner' where business_id = '${businessId}'::uuid ` +
      `and user_id = '${users[0]}'::uuid`);
    const changingTimezone = await holdLock(
      `update public.venues set timezone = 'UTC' where id = '${venueId}'::uuid returning id`, venueId,
    );
    try {
      pendingExport = Promise.resolve(generate());
      await waitForLock("generate_business_report_export");
      await changingTimezone.release(true);
      const result = await pendingExport;
      assert.ifError(result.error);
      assert.equal(result.data.venue_timezone, "UTC");
      assert.equal(result.data.period_start_utc, "2024-09-30T00:00:00.000000Z");
      assert.equal(result.data.period_end_utc, "2024-10-07T00:00:00.000000Z");
      assert.equal(result.data.entry_count, 0, "rows and boundaries use the same committed timezone");
    } finally {
      await changingTimezone.release(false);
      await Promise.allSettled([pendingExport].filter(Boolean));
    }

    const capturedTimezone = await holdLock(asOwner(exportSql), '"venue_timezone": "UTC"');
    let pendingTimezone;
    try {
      pendingTimezone = sql(`update public.venues set timezone = 'Australia/Sydney' where id = '${venueId}'::uuid`);
      await waitForLock("venues");
      await capturedTimezone.release(true);
      await pendingTimezone;
    } finally {
      await capturedTimezone.release(false);
      await Promise.allSettled([pendingTimezone].filter(Boolean));
    }
    assert.equal(await eventCount(), before + 3);
    const recordedBounds = async (timezone, start, end) => Number(await sql(
      `select count(*) from public.business_report_export_events ` +
      `where business_id = '${businessId}'::uuid and venue_timezone = '${timezone}' ` +
      `and period_starts_at = '${start}'::timestamptz and period_ends_at = '${end}'::timestamptz`,
    ));
    assert.equal(await recordedBounds(
      "Australia/Sydney", "2024-09-29 14:00:00+00", "2024-10-06 13:00:00+00",
    ), 1, "the original timezone and DST-adjusted period remain in the audit history");
    assert.equal(await recordedBounds(
      "UTC", "2024-09-30 00:00:00+00", "2024-10-07 00:00:00+00",
    ), 2, "subsequent exports retain their own timezone and boundaries");
    const auditCount = Number(await sql(`select count(*) from public.sensitive_action_audit ` +
      `where business_id = '${businessId}'::uuid and source_table = 'business_report_export_events' ` +
      `and actor_id = '${users[0]}'::uuid`));
    assert.equal(auditCount, 3, "committed exports have attributed audit entries");
  } finally {
    await assertBusinessFixturesPreserved(admin, businessId);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
