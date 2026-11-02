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

test("open shift offers enforce HTTP scope and confirm exactly one concurrent claim", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, holdLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const roles = ["owner", "foh", "ann", "ben", "outsider"];
  const clients = Object.fromEntries(roles.map((role) => [role, createClient(url, anonKey, options)]));
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, fohId, annId, benId, shiftId] = Array.from({ length: 7 }, () => randomUUID());
  const users = {};

  async function waitForWaiters(functionName, expected) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const count = await sql(
        `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%${functionName}%'`,
      );
      if (Number(count) >= expected) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${expected} ${functionName} calls to reach the lock.`);
  }

  try {
    for (const role of roles) {
      const result = await admin.auth.admin.createUser({
        email: `offer-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users[role] = result.data.user.id;
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Offer race cafe" }, { id: outsideId, name: "Outside offer cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "Australia/Sydney",
    })).error);
    assert.ifError((await admin.from("departments").insert({
      id: fohId, business_id: businessId, venue_id: venueId, name: "FOH",
    })).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      { business_id: businessId, user_id: users.foh, role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.ann, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users.ben, role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users.outsider, role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert([
      { id: annId, business_id: businessId, venue_id: venueId, department_id: fohId, auth_user_id: users.ann, name: "Ann", role_title: "Barista" },
      { id: benId, business_id: businessId, venue_id: venueId, department_id: fohId, auth_user_id: users.ben, name: "Ben", role_title: "Barista" },
    ])).error);
    assert.ifError((await admin.from("shifts").insert({
      id: shiftId, business_id: businessId, venue_id: venueId, department_id: fohId, role_title: "Barista",
      starts_at: "2032-04-05T09:00:00Z", ends_at: "2032-04-05T13:00:00Z", is_published: true,
    })).error);
    for (const role of roles) {
      assert.ifError((await clients[role].auth.signInWithPassword({
        email: `offer-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const offer = (client) => client.rpc("create_shift_offer", {
      p_business_id: businessId, p_venue_id: venueId, p_shift_id: shiftId,
      p_employee_ids: [annId, benId], p_expires_at: "2032-04-04T09:00:00Z",
    });
    assert.equal((await offer(clients.outsider)).error?.message, "Permission denied",
      "another tenant cannot send offers for this shift");
    assert.equal((await offer(clients.ann)).error?.message, "Permission denied", "employees cannot send offers");

    const created = await Promise.all([offer(clients.owner), offer(clients.foh)]);
    const sent = created.filter((result) => !result.error);
    assert.equal(sent.length, 1, "concurrent sends create exactly one open offer");
    assert.equal(created.find((result) => result.error)?.error.message, "This shift already has an open offer");
    const offerId = sent[0].data;

    const claims = await Promise.all([clients.ann, clients.ben].map((client) =>
      client.rpc("respond_shift_offer", { p_offer_id: offerId, p_response: "accept" })));
    for (const claim of claims) {
      assert.ifError(claim.error);
      assert.ok(!Number.isNaN(Date.parse(claim.data)), "each claim is timestamped");
    }
    assert.equal((await clients.outsider.rpc("respond_shift_offer", { p_offer_id: offerId, p_response: "accept" }))
      .error?.message, "Shift offer not found or permission denied");
    const shiftBefore = await admin.from("shifts").select("employee_id").eq("id", shiftId).single();
    assert.equal(shiftBefore.data.employee_id, null, "claims keep the shift open until confirmation");

    const gate = await holdLock(
      `select id from public.shift_offers where id = '${offerId}'::uuid for update`, offerId,
    );
    let confirmations;
    try {
      confirmations = Promise.all([
        clients.owner.rpc("confirm_shift_offer_claim", { p_offer_id: offerId, p_employee_id: annId }),
        clients.foh.rpc("confirm_shift_offer_claim", { p_offer_id: offerId, p_employee_id: benId }),
      ]);
      await waitForWaiters("confirm_shift_offer_claim", 2);
      await gate.release(false);
      const results = await confirmations;
      const winners = results.filter((result) => result.data === "confirmed");
      assert.equal(winners.length, 1, "exactly one concurrent confirmation succeeds");
      assert.equal(results.find((result) => result.error)?.error.message, "Shift offer has already been filled",
        "the losing confirmation fails clearly instead of reassigning the shift");
    } finally {
      await gate.release(false);
      await Promise.allSettled([confirmations].filter(Boolean));
    }

    const shift = await admin.from("shifts").select("employee_id").eq("id", shiftId).single();
    assert.ifError(shift.error);
    assert.ok([annId, benId].includes(shift.data.employee_id));
    const loser = shift.data.employee_id === annId ? "ben" : "ann";
    const winner = loser === "ann" ? "ben" : "ann";
    const status = async (role) => {
      const result = await clients[role].rpc("list_my_shift_offers", { p_business_id: businessId, p_venue_id: venueId });
      assert.ifError(result.error);
      assert.equal(result.data.length, 1);
      return [result.data[0].outcome, result.data[0].can_respond];
    };
    assert.deepEqual(await status(winner), ["confirmed", false]);
    assert.deepEqual(await status(loser), ["not_selected", false], "the losing claimant receives a clear status");
    const filled = await clients.foh.from("shift_offers").select("status, filled_employee_id").eq("id", offerId).single();
    assert.ifError(filled.error);
    assert.deepEqual(filled.data, { status: "filled", filled_employee_id: shift.data.employee_id });
    assert.equal((await clients.outsider.from("shift_offer_recipients").select("employee_id").eq("offer_id", offerId)).data.length, 0,
      "another tenant cannot read offer audiences");
  } finally {
    for (const id of [businessId, outsideId]) {
      await assertBusinessFixturesPreserved(admin, id);
    }
    for (const user of Object.values(users)) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
