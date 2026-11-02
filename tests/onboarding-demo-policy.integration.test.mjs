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
  "sample setup fails closed across privileged, concurrent and cross-tenant paths",
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
    const setup = (name, includeSampleData) => ({
      p_business_name: name, p_venue_name: "Test venue",
      p_venue_address: "10 Test Street", p_timezone: "UTC",
      p_include_sample_data: includeSampleData,
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
      await assert.rejects(
        sql("update public.demo_seed_policy set enabled = true where singleton"),
        /Sample data is not enabled in this environment/,
      );
      const direct = await first.rpc("create_business", {
        p_business_name: "Denied direct sample", p_venue_name: "Test venue",
        p_timezone: "UTC", p_include_sample_data: true,
      });
      assert.equal(direct.error?.message, "Sample data is not enabled in this environment");
      assert.ifError((await first.from("business_setup_drafts").insert({
        user_id: users[0], business_name: "Retained draft", include_sample_data: true,
      })).error);
      const denied = await first.rpc("complete_initial_setup", setup("Denied sample", true));
      assert.equal(denied.error?.message, "Sample data is not enabled in this environment");
      const deniedMemberships = await admin.from("business_memberships").select("id").eq("user_id", users[0]);
      assert.ifError(deniedMemberships.error);
      assert.deepEqual(deniedMemberships.data, []);
      const retainedDraft = await first.from("business_setup_drafts")
        .select("business_name, include_sample_data").single();
      assert.ifError(retainedDraft.error);
      assert.deepEqual(retainedDraft.data, { business_name: "Retained draft", include_sample_data: true });

      const created = await first.rpc("complete_initial_setup", setup("First clean cafe", false));
      assert.ifError(created.error);
      assert.match(created.data, /^[0-9a-f-]{36}$/i);
      businesses.push(created.data);
      const [staff, shifts, roles, draft] = await Promise.all([
        admin.from("employees").select("id").eq("business_id", created.data),
        admin.from("shifts").select("id, is_published").eq("business_id", created.data),
        admin.from("job_roles").select("id").eq("business_id", created.data),
        first.from("business_setup_drafts").select("user_id"),
      ]);
      assert.ifError(staff.error);
      assert.ifError(shifts.error);
      assert.ifError(roles.error);
      assert.ifError(draft.error);
      assert.deepEqual(staff.data, []);
      assert.deepEqual(shifts.data, []);
      assert.deepEqual(roles.data, []);
      assert.deepEqual(draft.data, []);

      const policyLock = await holdLock(
        "update public.demo_seed_policy set enabled = false where singleton returning enabled",
        "f",
      );
      const pendingEnable = assert.rejects(
        sql("update public.demo_seed_policy set enabled = true where singleton"),
        /Sample data is not enabled in this environment/,
      );
      const pendingSample = Promise.resolve(
        second.rpc("complete_initial_setup", setup("Racing sample", true)),
      );
      try {
        await waitForLock("demo_seed_policy");
        await policyLock.release(true);
        const [, racingSample] = await Promise.all([pendingEnable, pendingSample]);
        assert.equal(racingSample.error?.message, "Sample data is not enabled in this environment");
      } finally {
        await policyLock.release(false);
        await Promise.allSettled([pendingEnable, pendingSample]);
      }
      const memberships = await admin.from("business_memberships").select("id").eq("user_id", users[1]);
      assert.ifError(memberships.error);
      assert.deepEqual(memberships.data, []);
      assert.equal((await second.rpc("demo_seed_enabled")).data, false);

      const [cleanRace, sampleRace] = await Promise.all([
        second.rpc("complete_initial_setup", setup("Second clean cafe", false)),
        second.rpc("complete_initial_setup", setup("Concurrent sample", true)),
      ]);
      assert.ifError(cleanRace.error);
      assert.match(cleanRace.data, /^[0-9a-f-]{36}$/i);
      businesses.push(cleanRace.data);
      assert.match(sampleRace.error?.message,
        /^(Sample data is not enabled in this environment|Workspace already exists)$/);
      const secondStaff = await admin.from("employees").select("id").eq("business_id", cleanRace.data);
      assert.ifError(secondStaff.error);
      assert.deepEqual(secondStaff.data, []);

      const department = await admin.from("departments").select("id, venue_id")
        .eq("business_id", created.data).eq("name", "Front of House").single();
      assert.ifError(department.error);
      const fixture = await admin.from("employees").insert({
        business_id: created.data, venue_id: department.data.venue_id,
        department_id: department.data.id, name: "Synthetic tenant worker", role_title: "Server",
      }).select("id").single();
      assert.ifError(fixture.error);
      const visibleStaff = await first.from("employees").select("id").eq("id", fixture.data.id);
      const hiddenStaff = await second.from("employees").select("id").eq("id", fixture.data.id);
      assert.ifError(visibleStaff.error);
      assert.ifError(hiddenStaff.error);
      assert.deepEqual(visibleStaff.data, [{ id: fixture.data.id }]);
      assert.deepEqual(hiddenStaff.data, []);
      await assert.rejects(
        sql(`select public.handle_demo_seed_unchecked('${created.data}', '${department.data.venue_id}', 'UTC')`),
        /Sample data is not enabled in this environment/,
      );
      const remainingStaff = await admin.from("employees").select("id").eq("business_id", created.data);
      assert.ifError(remainingStaff.error);
      assert.deepEqual(remainingStaff.data, [{ id: fixture.data.id }]);
    } finally {
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
