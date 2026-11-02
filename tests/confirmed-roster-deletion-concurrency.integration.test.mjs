import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test("confirmed draft deletion serializes edits, retries and permission revocation", {
  skip: container ? false : "requires an explicitly configured disposable database container",
  timeout: 120_000,
}, async () => {
  assert.ok(url && anonKey && serviceKey);
  const { waitForLock, holdLock } = await disposableDatabase(container, url);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, options);
  const clients = Object.fromEntries(
    ["manager", "boh", "worker", "outside"].map((role) => [role, createClient(url, anonKey, options)]),
  );
  const suffix = randomUUID();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const users = [];
  const [businessId, outsideId, venueId, fohId, bohId, editedId, duplicateId, revokedId] =
    Array.from({ length: 8 }, () => randomUUID());

  async function shift(id) {
    const result = await admin.from("shifts").select("id, role_title, updated_at").eq("id", id).maybeSingle();
    assert.ifError(result.error);
    return result.data;
  }

  try {
    for (const role of Object.keys(clients)) {
      const created = await admin.auth.admin.createUser({
        email: `delete-race-${role}-${suffix}@example.test`, password, email_confirm: true,
      });
      assert.ifError(created.error);
      users.push(created.data.user.id);
    }
    assert.ifError((await admin.from("businesses").insert([
      { id: businessId, name: "Guarded deletion races" },
      { id: outsideId, name: "Outside guarded deletion" },
    ])).error);
    assert.ifError((await admin.from("venues").insert({
      id: venueId, business_id: businessId, name: "Deletion venue", timezone: "UTC",
    })).error);
    assert.ifError((await admin.from("departments").insert([
      { id: fohId, business_id: businessId, venue_id: venueId, name: "FOH" },
      { id: bohId, business_id: businessId, venue_id: venueId, name: "BOH" },
    ])).error);
    assert.ifError((await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: users[0], role: "foh_manager", venue_id: venueId, department_id: fohId },
      { business_id: businessId, user_id: users[1], role: "boh_manager", venue_id: venueId, department_id: bohId },
      { business_id: businessId, user_id: users[2], role: "employee", venue_id: venueId, department_id: fohId },
      { business_id: outsideId, user_id: users[3], role: "owner" },
    ])).error);
    assert.ifError((await admin.from("shifts").insert([
      { id: editedId, business_id: businessId, venue_id: venueId, department_id: fohId,
        role_title: "Original draft", starts_at: "2032-03-29T09:00:00Z", ends_at: "2032-03-29T11:00:00Z" },
      { id: duplicateId, business_id: businessId, venue_id: venueId, department_id: fohId,
        role_title: "Concurrent deletion", starts_at: "2032-03-30T09:00:00Z", ends_at: "2032-03-30T11:00:00Z" },
      { id: revokedId, business_id: businessId, venue_id: venueId, department_id: fohId,
        role_title: "Revoked manager", starts_at: "2032-03-31T09:00:00Z", ends_at: "2032-03-31T11:00:00Z" },
    ])).error);
    for (const [role, client] of Object.entries(clients)) {
      assert.ifError((await client.auth.signInWithPassword({
        email: `delete-race-${role}-${suffix}@example.test`, password,
      })).error);
    }

    const original = await shift(editedId);
    assert.ok(original);
    const originalRequest = { p_shift_id: editedId, p_expected_updated_at: original.updated_at };
    for (const role of ["boh", "worker", "outside"]) {
      assert.equal((await clients[role].rpc("delete_shift_if_unchanged", originalRequest)).error?.message,
        "Permission denied", `${role} cannot delete outside their management scope`);
    }

    const editGate = await holdLock(
      `update public.shifts set role_title = 'Updated by another manager' where id = '${editedId}'::uuid`,
    );
    let pendingEdit;
    try {
      pendingEdit = Promise.resolve(clients.manager.rpc("delete_shift_if_unchanged", originalRequest));
      await waitForLock("delete_shift_if_unchanged");
      await editGate.release(true);
      assert.equal((await pendingEdit).error?.message, "Shift changed; reload the roster");
      assert.equal((await shift(editedId)).role_title, "Updated by another manager");
    } finally {
      await editGate.release(false);
      if (pendingEdit) await pendingEdit;
    }
    const updated = await shift(editedId);
    assert.notEqual(updated.updated_at, original.updated_at);
    assert.ifError((await clients.manager.rpc("delete_shift_if_unchanged", {
      p_shift_id: editedId, p_expected_updated_at: updated.updated_at,
    })).error);
    assert.equal(await shift(editedId), null);

    const duplicate = await shift(duplicateId);
    assert.ok(duplicate);
    const duplicateRequest = { p_shift_id: duplicateId, p_expected_updated_at: duplicate.updated_at };
    const retries = await Promise.all([
      clients.manager.rpc("delete_shift_if_unchanged", duplicateRequest),
      clients.manager.rpc("delete_shift_if_unchanged", duplicateRequest),
    ]);
    assert.equal(retries.filter((result) => !result.error).length, 1);
    assert.equal(retries.find((result) => result.error).error.message, "Shift not found");
    assert.equal(await shift(duplicateId), null);

    const revoked = await shift(revokedId);
    assert.ok(revoked);
    const membershipGate = await holdLock(
      `update public.business_memberships set role = 'employee' where business_id = '${businessId}'::uuid and user_id = '${users[0]}'::uuid`,
    );
    let pendingRevocation;
    try {
      pendingRevocation = Promise.resolve(clients.manager.rpc("delete_shift_if_unchanged", {
        p_shift_id: revokedId, p_expected_updated_at: revoked.updated_at,
      }));
      await waitForLock("delete_shift_if_unchanged");
      await membershipGate.release(true);
      assert.equal((await pendingRevocation).error?.message, "Permission denied");
      assert.equal((await shift(revokedId)).role_title, "Revoked manager");
    } finally {
      await membershipGate.release(false);
      if (pendingRevocation) await pendingRevocation;
    }
  } finally {
    await assertBusinessFixturesPreserved(admin, [businessId, outsideId]);
    for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
  }
});
