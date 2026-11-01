import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { stageAwardSource } from "../src/server/award-central/source-snapshot-repository.ts";
import { MAPD_SOURCE_COVERAGE_GAPS } from "../src/server/award-central/source-ingestion.ts";
import { disposableDatabase } from "./helpers/disposable-database.mjs";

const container = process.env.BUTTERBOX_TEST_DB_CONTAINER;
const url = process.env.BUTTERBOX_TEST_SUPABASE_URL;
const anonKey = process.env.BUTTERBOX_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.BUTTERBOX_TEST_SUPABASE_SERVICE_KEY;

test(
  "trusted staging persists original source bytes, rejects duplicates and hides sources from customers",
  {
    skip: container ? false : "requires an explicitly configured disposable database container",
    timeout: 60_000,
  },
  async () => {
    assert.ok(url && anonKey && serviceKey);
    const { sql } = await disposableDatabase(container, url);
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const admin = createClient(url, serviceKey, options);
    const customer = createClient(url, anonKey, options);
    const suffix = randomUUID();
    const raw = `synthetic Award Central integration source ${suffix}; not an official source`;
    const metadata = {
      sourceIdentity: `integration-mapd-${suffix}`,
      sourceKind: "pay_database_api",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      effectiveFrom: "2026-07-01",
      effectiveUntil: null,
      sourceRevision: "synthetic-r1",
      variationReferences: ["synthetic-variation"],
      fieldsPresent: ["classification", "rate"],
      unresolvedFields: [...MAPD_SOURCE_COVERAGE_GAPS],
    };
    const fetcher = async () => new Response(raw, { headers: { "content-type": "application/json" } });
    let userId;

    try {
      const staged = await stageAwardSource(admin, "https://api.fwc.gov.au/awards/synthetic", metadata, { fetcher });
      assert.equal(staged.status, "staged");

      const stored = await sql(
        `select convert_from(content_bytes, 'UTF8') || '|' || source_sha256 || '|' || status || '|' ||
          effective_from || '|' || unresolved_fields::text
         from public.award_central_source_snapshots where id = '${staged.sourceSnapshotId}'`,
      );
      const [content, hash, status, effectiveFrom, unresolved] = stored.split("|");
      assert.equal(content, raw);
      assert.equal(hash, staged.sha256);
      assert.equal(status, "staged");
      assert.equal(effectiveFrom, "2026-07-01");
      for (const gap of MAPD_SOURCE_COVERAGE_GAPS) assert.ok(unresolved.includes(gap));

      await assert.rejects(
        stageAwardSource(admin, "https://api.fwc.gov.au/awards/synthetic", metadata, { fetcher }),
        (error) => error.cause?.code === "23505",
      );
      assert.equal(await sql(
        `select count(*) from public.award_central_source_snapshots where source_identity = '${metadata.sourceIdentity}'`,
      ), "1");

      const rewrite = await admin.from("award_central_source_snapshots")
        .update({ source_identity: "rewritten" }).eq("id", staged.sourceSnapshotId);
      assert.equal(rewrite.error?.code, "42501");

      const email = `award-central-${suffix}@example.test`;
      const password = `${randomBytes(18).toString("base64url")}aA1!`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(created.error);
      userId = created.data.user.id;
      assert.ifError((await customer.auth.signInWithPassword({ email, password })).error);

      const read = await customer.from("award_central_source_snapshots").select("id").eq("id", staged.sourceSnapshotId);
      assert.equal(read.error?.code, "42501");
      const insert = await customer.from("award_central_source_snapshots").insert({
        source_identity: `customer-${suffix}`, source_kind: "award_instrument",
        source_url: "https://www.fwc.gov.au/customer", retrieved_at: "2026-01-01T00:00:00Z",
        content_type: "text/plain", content_bytes: "\\x78",
      });
      assert.equal(insert.error?.code, "42501");
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  },
);
