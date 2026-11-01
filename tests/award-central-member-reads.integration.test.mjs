import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test(
  "signed-in members of two businesses share read-only catalogue access and revocation takes effect",
  {
    skip: container ? false : "requires an explicitly configured disposable database container",
    timeout: 90_000,
  },
  async () => {
    assert.ok(url && anonKey && serviceKey);
    const { sql } = await disposableDatabase(container, url);
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const admin = createClient(url, serviceKey, options);
    const anonymous = createClient(url, anonKey, options);
    const clients = Array.from({ length: 3 }, () => createClient(url, anonKey, options));
    const suffix = randomUUID();
    const businesses = [randomUUID(), randomUUID()];
    const instrument = randomUUID();
    const users = [];

    try {
      for (let index = 0; index < clients.length; index += 1) {
        const email = `award-member-${index}-${suffix}@example.test`;
        const password = `${randomBytes(18).toString("base64url")}aA1!`;
        const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        assert.ifError(created.error);
        assert.match(created.data.user.id, /^[0-9a-f-]{36}$/);
        users.push(created.data.user.id);
        assert.ifError((await clients[index].auth.signInWithPassword({ email, password })).error);
      }

      await sql(`
        insert into public.businesses (id, name) values
          ('${businesses[0]}', 'Synthetic first award business'),
          ('${businesses[1]}', 'Synthetic second award business');
        insert into public.business_memberships (business_id, user_id, role) values
          ('${businesses[0]}', '${users[0]}', 'owner'),
          ('${businesses[1]}', '${users[1]}', 'employee');
        insert into public.award_central_instruments (id, instrument_code, instrument_name)
        values ('${instrument}', 'TEST-${suffix}', 'Synthetic shared instrument');
      `);

      for (const client of clients.slice(0, 2)) {
        const read = await client.from("award_central_instruments").select("id").eq("id", instrument);
        assert.ifError(read.error);
        assert.deepEqual(read.data, [{ id: instrument }]);
      }
      const outsider = await clients[2].from("award_central_instruments").select("id").eq("id", instrument);
      assert.ifError(outsider.error);
      assert.deepEqual(outsider.data, []);

      const anonymousRead = await anonymous.from("award_central_instruments").select("id").eq("id", instrument);
      assert.equal(anonymousRead.error?.code, "42501");
      const customerEdit = await clients[0].from("award_central_instruments")
        .update({ instrument_name: "Changed" }).eq("id", instrument);
      assert.equal(customerEdit.error?.code, "42501");
      const serviceRead = await admin.from("award_central_instruments").select("id").eq("id", instrument);
      assert.equal(serviceRead.error?.code, "42501");

      await sql(`
        delete from public.business_memberships
        where business_id = '${businesses[0]}' and user_id = '${users[0]}';
      `);
      const revoked = await clients[0].from("award_central_instruments").select("id").eq("id", instrument);
      assert.ifError(revoked.error);
      assert.deepEqual(revoked.data, []);
      const unaffected = await clients[1].from("award_central_instruments").select("id").eq("id", instrument);
      assert.ifError(unaffected.error);
      assert.deepEqual(unaffected.data, [{ id: instrument }]);
    } finally {
      await sql(`
        delete from public.award_central_instruments where id = '${instrument}';
        delete from public.businesses where id in ('${businesses[0]}', '${businesses[1]}');
      `);
      for (const user of users) {
        assert.ifError((await admin.auth.admin.deleteUser(user)).error);
      }
    }
  },
);
