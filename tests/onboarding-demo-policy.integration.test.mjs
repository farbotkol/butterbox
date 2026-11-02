import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertBusinessFixturesPreserved, disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test(
  "sample setup is isolated, explicitly enabled and serialized with policy changes",
  {
    skip: container ? false : "requires an explicitly configured disposable database container",
    timeout: 90_000,
  },
  async () => {
    assert.ok(url && anonKey && serviceKey);
    const { sql, waitForLock, holdLock } = await disposableDatabase(container, url);
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const admin = createClient(url, serviceKey, options);
    const first = createClient(url, anonKey, options);
    const second = createClient(url, anonKey, options);
    const suffix = randomUUID();
    const password = `${randomBytes(18).toString("base64url")}aA1!`;
    const users = [];
    const businesses = [];
    const setup = (name) => ({
      p_business_name: name, p_venue_name: "Test venue",
      p_venue_address: "10 Test Street", p_timezone: "UTC", p_include_sample_data: true,
    });

    assert.equal(await sql("select enabled from public.demo_seed_policy where singleton"), "f");
    try {
      for (const [client, name] of [[first, "first"], [second, "second"]]) {
        const email = `onboarding-${name}-${suffix}@example.test`;
        const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        assert.ifError(created.error);
        users.push(created.data.user.id);
        assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
      }

      const forbidden = await admin.from("demo_seed_policy").update({ enabled: true }).eq("singleton", true);
      assert.equal(forbidden.error?.code, "42501");
      assert.equal((await first.rpc("demo_seed_enabled")).data, false);
      const denied = await first.rpc("complete_initial_setup", setup("Denied sample"));
      assert.equal(denied.error?.message, "Sample data is not enabled in this environment");
      const deniedMemberships = await admin.from("business_memberships").select("id").eq("user_id", users[0]);
      assert.ifError(deniedMemberships.error);
      assert.deepEqual(deniedMemberships.data, []);

      await sql("update public.demo_seed_policy set enabled = true where singleton");
      assert.equal((await first.rpc("demo_seed_enabled")).data, true);
      const created = await first.rpc("complete_initial_setup", setup("Isolated sample"));
      assert.ifError(created.error);
      assert.match(created.data, /^[0-9a-f-]{36}$/i);
      businesses.push(created.data);
      const [staff, shifts, hiddenStaff] = await Promise.all([
        admin.from("employees").select("id").eq("business_id", created.data),
        admin.from("shifts").select("id, is_published").eq("business_id", created.data),
        second.from("employees").select("id").eq("business_id", created.data),
      ]);
      assert.ifError(staff.error);
      assert.ifError(shifts.error);
      assert.ifError(hiddenStaff.error);
      assert.equal(staff.data.length, 24);
      assert.equal(shifts.data.length, 48);
      assert.ok(shifts.data.every((shift) => shift.is_published === false));
      assert.deepEqual(hiddenStaff.data, []);

      const policyLock = await holdLock(
        "update public.demo_seed_policy set enabled = false where singleton",
      );
      let pending;
      try {
        pending = Promise.resolve(second.rpc("complete_initial_setup", setup("Racing sample")));
        await waitForLock("complete_initial_setup");
        await policyLock.release(true);
        assert.equal((await pending).error?.message, "Sample data is not enabled in this environment");
      } finally {
        await policyLock.release(false);
        await Promise.allSettled([pending].filter(Boolean));
      }
      const memberships = await admin.from("business_memberships").select("id").eq("user_id", users[1]);
      assert.ifError(memberships.error);
      assert.deepEqual(memberships.data, []);
      assert.equal((await second.rpc("demo_seed_enabled")).data, false);
    } finally {
      await sql("update public.demo_seed_policy set enabled = false where singleton");
      for (const user of users) {
        const memberships = await admin.from("business_memberships").select("business_id").eq("user_id", user);
        assert.ifError(memberships.error);
        businesses.push(...memberships.data.map((membership) => membership.business_id));
      }
      for (const business of new Set(businesses)) {
        await assertBusinessFixturesPreserved(admin, business);
      }
      for (const user of users) assert.ifError((await admin.auth.admin.deleteUser(user)).error);
    }
  },
);
