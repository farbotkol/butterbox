import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  acquireAwardSource,
  MAPD_SOURCE_COVERAGE_GAPS,
  MAX_AWARD_SOURCE_BYTES,
} from "../src/server/award-central/source-ingestion.ts";
import { stageAwardSource } from "../src/server/award-central/source-snapshot-repository.ts";

const metadata = {
  sourceIdentity: "test-source",
  sourceKind: "award_instrument",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  sourceRevision: null,
  variationReferences: [],
  fieldsPresent: ["instrument_title"],
  unresolvedFields: ["effective_until"],
};
const mapdMetadata = {
  ...metadata,
  sourceKind: "pay_database_api",
  unresolvedFields: [...metadata.unresolvedFields, ...MAPD_SOURCE_COVERAGE_GAPS],
};

function response(body = "synthetic source bytes", init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8");
  return new Response(body, { ...init, headers });
}

test("official source acquisition stages original bytes and computes a stable digest", async () => {
  const raw = "synthetic source bytes";
  let request;
  const snapshot = await acquireAwardSource(
    "https://www.fwc.gov.au/award?version=2026",
    metadata,
    {
      headers: { "Ocp-Apim-Subscription-Key": "test-only" },
      fetcher: async (url, init) => {
        request = { url: String(url), init };
        return response(raw);
      },
    },
  );

  assert.equal(snapshot.status, "staged");
  assert.equal(snapshot.contentType, "text/plain");
  assert.equal(new TextDecoder().decode(snapshot.content), raw);
  assert.equal(snapshot.sha256, createHash("sha256").update(raw).digest("hex"));
  assert.equal(snapshot.sourceUrl, "https://www.fwc.gov.au/award?version=2026");
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.redirect, "manual");
  assert.equal(new Headers(request.init.headers).get("Ocp-Apim-Subscription-Key"), "test-only");
  assert.deepEqual(snapshot.unresolvedFields, ["effective_until"]);
});

test("staging persists source provenance and verifies the database-computed digest", async () => {
  const raw = "synthetic source bytes";
  let inserted;
  const client = {
    from(table) {
      assert.equal(table, "award_central_source_snapshots");
      return {
        insert(row) {
          inserted = row;
          return {
            select(columns) {
              assert.equal(columns, "id,source_sha256");
              return {
                async single() {
                  return {
                    data: {
                      id: "a1700000-0000-4000-8000-000000000001",
                      source_sha256: createHash("sha256").update(raw).digest("hex"),
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await stageAwardSource(
    client,
    "https://www.fwc.gov.au/award?version=2026",
    metadata,
    { fetcher: async () => response(raw) },
  );

  assert.deepEqual(result, {
    sourceSnapshotId: "a1700000-0000-4000-8000-000000000001",
    sha256: createHash("sha256").update(raw).digest("hex"),
    status: "staged",
  });
  assert.equal(Buffer.from(inserted.content_bytes.slice(2), "hex").toString(), raw);
  assert.equal(inserted.source_url, "https://www.fwc.gov.au/award?version=2026");
  assert.deepEqual(inserted.fields_present, metadata.fieldsPresent);
  assert.deepEqual(inserted.unresolved_fields, metadata.unresolvedFields);
});

test("staging rejects persistence errors and mismatched database hashes", async () => {
  const clientWithError = {
    from() {
      return {
        insert() {
          return {
            select() {
              return { single: async () => ({ data: null, error: new Error("database unavailable") }) };
            },
          };
        },
      };
    },
  };
  await assert.rejects(
    stageAwardSource(
      clientWithError,
      "https://www.fwc.gov.au/award",
      metadata,
      { fetcher: async () => response() },
    ),
    /could not be persisted/,
  );

  const clientWithWrongHash = {
    from() {
      return {
        insert() {
          return {
            select() {
              return {
                single: async () => ({
                  data: { id: "a1700000-0000-4000-8000-000000000001", source_sha256: "0".repeat(64) },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
  await assert.rejects(
    stageAwardSource(
      clientWithWrongHash,
      "https://www.fwc.gov.au/award",
      metadata,
      { fetcher: async () => response() },
    ),
    /invalid provenance/,
  );
});

test("source URLs reject non-HTTPS, non-official, credential-bearing, and ported origins", async () => {
  for (const url of [
    "http://www.fwc.gov.au/award",
    "https://fwc.gov.au.example.com/award",
    "https://example.com/award",
    "https://user:pass@www.fwc.gov.au/award",
    "https://www.fwc.gov.au:8443/award",
    "https://www.fwc.gov.au/award?subscription-key=secret",
  ]) {
    await assert.rejects(acquireAwardSource(url, metadata), /approved official HTTPS URL/);
  }
});

test("source metadata rejects invalid dates, reversed boundaries, and missing timezones", async () => {
  const invalidCases = [
    { ...metadata, retrievedAt: "2026-01-01T00:00:00" },
    { ...metadata, effectiveFrom: "2026-02-30" },
    { ...metadata, effectiveFrom: "2026-02-01", effectiveUntil: "2026-01-31" },
    { ...metadata, unresolvedFields: ["duplicate", "duplicate"] },
    { ...metadata, fieldsPresent: ["field"], unresolvedFields: ["field"] },
  ];
  for (const invalid of invalidCases) {
    await assert.rejects(
      acquireAwardSource("https://www.fwc.gov.au/award", invalid, { fetcher: async () => response() }),
    );
  }
  await assert.rejects(
    acquireAwardSource(
      "https://api.fwc.gov.au/awards",
      { ...metadata, sourceKind: "pay_database_api" },
      { fetcher: async () => response() },
    ),
    /documented API coverage limitations/,
  );
});

test("failed, redirected, empty, and oversized source responses are rejected", async () => {
  const url = "https://api.fwc.gov.au/awards";
  await assert.rejects(
    acquireAwardSource(url, mapdMetadata, {
      fetcher: async () => response("unavailable", { status: 503 }),
    }),
    /HTTP 503/,
  );
  await assert.rejects(
    acquireAwardSource(url, mapdMetadata, {
      fetcher: async () => response("", { status: 302, headers: { location: "https://example.com" } }),
    }),
    /redirects are not followed/,
  );
  await assert.rejects(
    acquireAwardSource(url, mapdMetadata, {
      fetcher: async () => response(""),
    }),
    /no content/,
  );
  await assert.rejects(
    acquireAwardSource(url, mapdMetadata, {
      fetcher: async () => response("too large", {
        headers: { "content-length": String(MAX_AWARD_SOURCE_BYTES + 1) },
      }),
    }),
    /maximum permitted size/,
  );
});
