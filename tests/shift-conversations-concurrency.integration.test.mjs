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

test("shift messages serialize retries, reassignment, revocation and department changes", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { sql, waitForLock, holdLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const roles = ["owner", "foh", "boh", "ann", "ben", "relinked", "outsider"];
  const clients = Object.fromEntries(roles.map((role) => [role, createClient(url, anonKey, options)]));
  const users = {};
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const [businessId, outsideId, venueId, fohId, bohId, annId, benId, shiftId] =
    Array.from({ length: 8 }, () => randomUUID());

  async function waitForWaiters(expected) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const count = await sql(
        "select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%send_shift_conversation_message%'",
      );
      if (Number(count) >= expected) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${expected} conversation sends to reach a lock.`);
  }

  async function context(client, selection = { p_shift_id: shiftId, p_conversation_id: null }) {
    const result = await client.rpc("open_shift_conversation", {
      p_business_id: businessId, p_venue_id: venueId, ...selection,
    });
    assert.ifError(result.error);
    assert.equal(result.data.length, 1);
    return result.data[0];
  }

  function send(client, current, body, requestId = randomUUID()) {
    return client.rpc("send_shift_conversation_message", {
      p_business_id: businessId, p_venue_id: venueId, p_shift_id: current.shift_id,
      p_employee_id: current.employee_id, p_participant_user_id: current.participant_user_id,
      p_expected_shift_updated_at: current.shift_updated_at, p_expected_department_id: current.department_id,
      p_body: body, p_request_id: requestId,
    });
  }

  async function messageCount() {
    return Number(await sql(`select count(*) from public.shift_conversation_messages where business_id = '${businessId}'::uuid`));
  }

  async function gatedSend(statement, expectedOutput, invoke, commit = true) {
    const gate = await holdLock(statement, expectedOutput);
    let pending;
    try {
      pending = Promise.resolve(invoke());
      await waitForLock("send_shift_conversation_message");
      await gate.release(commit);
      return await pending;
    } finally {
      await gate.release(false);
      if (pending) await Promise.allSettled([pending]);
    }
  }

  try {
    for (const role of roles) {
      const result = await admin.auth.admin.createUser({
        email: `conversation-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(result.error);
      users[role] = result.data.user.id;
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Conversation race cafe" }, { id: outsideId, name: "Outside conversation cafe" },
    ])).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Harbour", timezone: "UTC",
    })).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    const membership = (role, user, department = fohId) => ({
      business_id: businessId, user_id: users[user], role, venue_id: venueId, department_id: department,
    });
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users.owner, role: "owner" },
      membership("foh_manager", "foh"), membership("boh_manager", "boh", bohId),
      membership("employee", "ann"), membership("employee", "ben"), membership("employee", "relinked"),
      { business_id: outsideId, user_id: users.outsider, role: "owner" },
    ])).error);
    assert.ifError((await admin.from("employees").insert([
      { id: annId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.ann, name: "Ann", role_title: "Server" },
      { id: benId, business_id: businessId, venue_id: venueId, department_id: fohId,
        auth_user_id: users.ben, name: "Ben", role_title: "Server" },
    ])).error);
    assert.ifError((await admin.from("employee_departments").insert({
      business_id: businessId, employee_id: annId, department_id: bohId,
    })).error);
    assert.ifError((await admin.from("shifts").insert({
      id: shiftId, business_id: businessId, venue_id: venueId, department_id: fohId,
      employee_id: annId, role_title: "Server", starts_at: "2032-04-05T09:00:00Z",
      ends_at: "2032-04-05T13:00:00Z", is_published: true,
    })).error);
    for (const role of roles) {
      assert.ifError((await clients[role].auth.signInWithPassword({
        email: `conversation-race-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const original = await context(clients.foh);
    const gate = await holdLock(`select id from public.shifts where id = '${shiftId}'::uuid for update`, shiftId);
    let retries;
    try {
      const requestId = randomUUID();
      retries = Promise.all([
        send(clients.foh, original, "Private concurrent message", requestId),
        send(clients.foh, original, "Private concurrent message", requestId),
      ]);
      await waitForWaiters(2);
      await gate.release(false);
      const results = await retries;
      results.forEach((result) => assert.ifError(result.error));
      assert.equal(results[0].data, results[1].data, "concurrent retries return the same thread");
      assert.equal(await messageCount(), 1, "concurrent retries insert exactly one message");
    } finally {
      await gate.release(false);
      if (retries) await Promise.allSettled([retries]);
    }
    const firstThread = (await context(clients.foh)).conversation_id;
    assert.ok(firstThread);
    const collidingId = randomUUID();
    const conflicting = await Promise.all([
      send(clients.foh, original, "First request body", collidingId),
      send(clients.foh, original, "Different request body", collidingId),
    ]);
    assert.equal(conflicting.filter((result) => !result.error).length, 1);
    assert.equal(conflicting.find((result) => result.error)?.error.message, "Request identifier already used");
    assert.equal(await messageCount(), 2, "a conflicting retry cannot insert a second message");

    const simultaneous = await Promise.all([
      send(clients.foh, original, "Manager concurrent reply"),
      send(clients.ann, original, "Employee concurrent reply"),
    ]);
    simultaneous.forEach((result) => assert.ifError(result.error));
    assert.ok(simultaneous.every((result) => result.data === firstThread));
    const messageResult = await clients.ann.rpc("list_shift_conversation_messages", {
      p_business_id: businessId, p_venue_id: venueId, p_conversation_id: firstThread,
    });
    assert.ifError(messageResult.error);
    assert.equal(messageResult.data.length, 4);
    assert.deepEqual(messageResult.data.map((item) => item.sequence_id),
      [...messageResult.data.map((item) => item.sequence_id)].sort((a, b) => a - b));
    const summaries = await clients.ann.rpc("list_shift_conversations", {
      p_business_id: businessId, p_venue_id: venueId,
    });
    assert.ifError(summaries.error);
    assert.equal(summaries.data.length, 1);
    assert.ok(!JSON.stringify(summaries.data).includes("Private concurrent message"), "history has no message previews");

    const reassigned = await gatedSend(
      `update public.shifts set employee_id = '${benId}'::uuid where id = '${shiftId}'::uuid returning id`,
      shiftId, () => send(clients.foh, original, "Must not reach replacement"),
    );
    assert.equal(reassigned.error?.message, "Shift or participant changed; reload the conversation");
    assert.equal(await messageCount(), 4);
    const oldHistory = await context(clients.ann, { p_shift_id: null, p_conversation_id: firstThread });
    assert.equal(oldHistory.can_reply, false);
    assert.equal((await clients.ben.rpc("list_shift_conversation_messages", {
      p_business_id: businessId, p_venue_id: venueId, p_conversation_id: firstThread,
    })).error?.message, "Conversation unavailable or permission denied");
    const replacement = await context(clients.foh);
    assert.equal(replacement.employee_id, benId);
    assert.equal(replacement.conversation_id, null);

    const senderRevoked = await gatedSend(
      `delete from public.business_memberships where business_id = '${businessId}'::uuid and user_id = '${users.foh}'::uuid returning user_id`,
      users.foh, () => send(clients.foh, replacement, "Revoked manager must not send"),
    );
    assert.equal(senderRevoked.error?.message, "Permission denied");
    assert.equal(await messageCount(), 4);
    assert.ifError((await admin.from("business_memberships").insert(membership("foh_manager", "foh"))).error);

    const participantRevoked = await gatedSend(
      `delete from public.business_memberships where business_id = '${businessId}'::uuid and user_id = '${users.ben}'::uuid returning user_id`,
      users.ben, () => send(clients.foh, replacement, "Revoked recipient must not receive"),
    );
    assert.equal(participantRevoked.error?.message, "Shift participant is no longer available");
    assert.equal(await messageCount(), 4);
    assert.ifError((await admin.from("business_memberships").insert(membership("employee", "ben"))).error);

    const relinked = await gatedSend(
      `update public.employees set auth_user_id = '${users.relinked}'::uuid where id = '${benId}'::uuid returning id`,
      benId, () => send(clients.foh, replacement, "Relinked account must not inherit"),
    );
    assert.equal(relinked.error?.message, "Shift or participant changed; reload the conversation");
    assert.equal(await messageCount(), 4);

    await sql(`update public.shifts set employee_id = '${annId}'::uuid where id = '${shiftId}'::uuid`);
    const beforeMove = await context(clients.ann);
    assert.equal(beforeMove.conversation_id, firstThread);
    const moved = await gatedSend(
      `update public.shifts set department_id = '${bohId}'::uuid where id = '${shiftId}'::uuid returning id`,
      shiftId, () => send(clients.ann, beforeMove, "Must not reach new department"),
    );
    assert.equal(moved.error?.message, "Shift or participant changed; reload the conversation");
    assert.equal(await messageCount(), 4);
    assert.equal((await context(clients.ann, { p_shift_id: null, p_conversation_id: firstThread })).can_reply, false);
    const newDepartment = await context(clients.boh);
    assert.equal(newDepartment.conversation_id, null);
    const newMessage = await send(clients.boh, newDepartment, "New department message");
    assert.ifError(newMessage.error);
    assert.notEqual(newMessage.data, firstThread);
    assert.equal((await clients.foh.rpc("list_shift_conversation_messages", {
      p_business_id: businessId, p_venue_id: venueId, p_conversation_id: newMessage.data,
    })).error?.message, "Conversation unavailable or permission denied");
    assert.equal((await clients.boh.rpc("list_shift_conversation_messages", {
      p_business_id: businessId, p_venue_id: venueId, p_conversation_id: firstThread,
    })).error?.message, "Conversation unavailable or permission denied");
    assert.equal(Number(await sql(`select count(*) from public.sensitive_action_audit
      where business_id = '${businessId}'::uuid and new_values::text like '%Private concurrent message%'`)), 0,
    "audit metadata excludes private message bodies");
  } finally {
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const user of Object.values(users)) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
