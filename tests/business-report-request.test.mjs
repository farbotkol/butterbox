import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseBusinessReportParams, readBusinessReportForm, validBusinessReportOrigin,
} from "../src/lib/business-report-request.ts";

const business = "b9130000-0000-4000-8000-000000000001";
const venue = "c9130000-0000-4000-8000-000000000001";
const fields = { business, venue, week: "2024-10-04", type: "roster" };
const local = "http://127.0.0.1:3117";

function request(headers, body = new URLSearchParams(fields)) {
  return new Request(`${local}/reports/export`, { method: "POST", headers, body });
}

test("export requests require the exact same origin, including proxy and fetch-metadata checks", () => {
  const headers = { origin: local, host: "127.0.0.1:3117", "sec-fetch-site": "same-origin" };
  assert.equal(validBusinessReportOrigin(request(headers)), true);
  assert.equal(validBusinessReportOrigin(request({ origin: local, host: "127.0.0.1:3117" })), true);
  assert.equal(validBusinessReportOrigin(request({
    origin: "https://preview.example.test", host: "127.0.0.1:3117",
    "x-forwarded-host": "preview.example.test", "x-forwarded-proto": "https",
  })), true);
  for (const change of [
    { origin: "http://evil.example.test" },
    { origin: "http://127.0.0.1:3118" },
    { origin: "https://127.0.0.1:3117" },
    { origin: "null" },
    { origin: `${local}/path` },
    { origin: "" },
    { host: "evil.example.test" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { "x-forwarded-host": "127.0.0.1:3117,evil.example.test" },
  ]) assert.equal(validBusinessReportOrigin(request({ ...headers, ...change })), false, JSON.stringify(change));
});

test("report form accepts one explicit scope, type and date and computes the selected Monday", () => {
  assert.deepEqual(parseBusinessReportParams(new URLSearchParams(fields)), {
    businessId: business, venueId: venue, weekStart: "2024-09-30", reportType: "roster",
  });
  assert.equal(parseBusinessReportParams(new URLSearchParams({ ...fields, type: "attendance" }))?.reportType,
    "attendance");
  for (const change of [
    { business: "" }, { venue: "bad" }, { week: "" }, { week: "2024-02-30" },
    { week: "infinity" }, { week: "0001-01-01" }, { week: "0001-01-07" },
    { week: "9999-12-31" }, { type: "payroll" }, { unknown: "private" },
  ]) assert.equal(parseBusinessReportParams(new URLSearchParams({ ...fields, ...change })), null);
  assert.equal(parseBusinessReportParams(new URLSearchParams({ ...fields, week: "0001-01-08" }))?.weekStart,
    "0001-01-08");
  for (const key of ["business", "venue", "week", "type"]) {
    const duplicated = new URLSearchParams(fields);
    duplicated.append(key, fields[key]);
    assert.equal(parseBusinessReportParams(duplicated), null, key);
    const omitted = new URLSearchParams(fields);
    omitted.delete(key);
    assert.equal(parseBusinessReportParams(omitted), null, key);
  }
});

test("export form rejects unsupported, malformed, non-UTF-8 and oversized request bodies", async () => {
  const valid = await readBusinessReportForm(request({}));
  assert.equal(valid.ok, true);
  assert.equal(valid.value.weekStart, "2024-09-30");
  assert.deepEqual(await readBusinessReportForm(request({ "content-type": "application/json" }, "{}")),
    { ok: false, status: 415 });
  assert.deepEqual(await readBusinessReportForm(request({
    "content-type": "application/x-www-form-urlencoded", "content-length": "5000",
  }, "type=roster")), { ok: false, status: 413 });
  assert.deepEqual(await readBusinessReportForm(request({
    "content-type": "application/x-www-form-urlencoded", "content-length": "invalid",
  }, "type=roster")), { ok: false, status: 400 });
  assert.deepEqual(await readBusinessReportForm(request({
    "content-type": "application/x-www-form-urlencoded",
  }, "x".repeat(4097))), { ok: false, status: 413 });
  assert.deepEqual(await readBusinessReportForm(request({
    "content-type": "application/x-www-form-urlencoded",
  }, new Uint8Array([0xff]))), { ok: false, status: 400 });
  assert.deepEqual(await readBusinessReportForm(request({
    "content-type": "application/x-www-form-urlencoded",
  }, "business=invalid")), { ok: false, status: 400 });
});
