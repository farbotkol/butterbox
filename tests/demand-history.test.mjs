import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DemandImportError, demandHistoryHref, MAX_DEMAND_FILE_BYTES, parseDemandCsv, parseDemandImportForm,
  parseDemandImports, parseDemandPage, parseDemandRecords,
} from "../src/lib/demand-history.ts";

const business = "a9150000-0000-4000-8000-000000000001";
const venue = "a9150000-0000-4000-8000-000000000002";
const importId = "a9150000-0000-4000-8000-000000000003";
const actor = "a9150000-0000-4000-8000-000000000004";
const requestId = "a9150000-0000-4000-8000-000000000005";
const salesHeader = "source_record_id,occurred_at,sales_amount_aud";
const bookingHeader = "source_record_id,occurred_at,guest_count";
const sales = (row) => `${salesHeader}\n${row}\n`;
const bookings = (row) => `${bookingHeader}\n${row}\n`;
const reject = (text, type = "sales", timezone = "Australia/Sydney") =>
  assert.throws(() => parseDemandCsv(text, type, timezone), DemandImportError);

test("sales CSV preserves original values and handles BOM, quotes and daylight-saving offsets", () => {
  const rows = parseDemandCsv(`\ufeff${salesHeader}\r\n"sale-1",2024-01-15T12:30:00+11:00,00012.50\r\n` +
    `"sale.2",2024-07-15T12:30:00+10:00,0\r\n`, "sales", "Australia/Sydney");
  assert.deepEqual(rows, [
    { source_record_id: "sale-1", occurred_at: "2024-01-15T12:30:00+11:00", value: "00012.50" },
    { source_record_id: "sale.2", occurred_at: "2024-07-15T12:30:00+10:00", value: "0" },
  ]);
});

test("booking CSV accepts valid positive counts and a UTC venue", () => {
  assert.deepEqual(parseDemandCsv(bookings("booking:1,2024-02-29T11:00:00Z,999999"), "bookings", "UTC"), [
    { source_record_id: "booking:1", occurred_at: "2024-02-29T11:00:00Z", value: "999999" },
  ]);
  for (const value of ["", "0", "-1", "1.5", "1000000", "x"]) {
    reject(bookings(`booking1,2024-02-29T11:00:00Z,${value}`), "bookings", "UTC");
  }
});

test("timestamps require real dates and the explicit offset valid at the venue", () => {
  for (const time of [
    "2024-01-15T12:30:00+10:00", "2024-07-15T12:30:00+11:00", "2024-01-15T12:30:00Z",
    "2024-02-30T12:30:00+11:00", "2024-01-15T12:30+11:00", "2024-01-15T12:30:00",
    "2024-10-06T02:30:00+10:00", "2024-10-06T02:30:00+11:00",
    "0000-01-01T00:00:00+11:00", "9999-01-01T00:00:00+11:00",
  ]) reject(sales(`sale1,${time},1.00`));
  for (const time of ["2024-04-07T02:30:00+10:00", "2024-04-07T02:30:00+11:00"]) {
    assert.equal(parseDemandCsv(sales(`sale1,${time},1.00`), "sales", "Australia/Sydney").length, 1);
  }
  reject(sales("sale1,2024-01-15T12:30:00+11:00,1"), "sales", "Invalid/Zone");
});

test("headers, unknown columns, empty rows and malformed CSV are rejected", () => {
  for (const text of [
    "", salesHeader, `${salesHeader},customer_name\nid,2024-01-15T12:30:00+11:00,1,Person`,
    `occurred_at,source_record_id,sales_amount_aud\n2024-01-15T12:30:00+11:00,id,1`,
    `${bookingHeader}\nid,2024-01-15T12:30:00+11:00,2`,
    `${salesHeader}\nid,2024-01-15T12:30:00+11:00,1\n\n`,
    `${salesHeader}\n"id,2024-01-15T12:30:00+11:00,1`,
    `${salesHeader}\nid,2024-01-15T12:30:00+11:00`,
  ]) reject(text);
});

test("missing, unsafe, oversized and duplicated source values are rejected", () => {
  for (const id of ["", "person@example.com", "=1+1", "id space", "x".repeat(129)]) {
    reject(sales(`${id},2024-01-15T12:30:00+11:00,1`));
  }
  for (const amount of ["", "-1", "1.001", "1000000000", "1e2", "NaN", "1,000"]) {
    reject(sales(`sale1,2024-01-15T12:30:00+11:00,${amount}`));
  }
  reject(`${salesHeader}\nid,2024-01-15T12:30:00+11:00,1\nid,2024-01-16T12:30:00+11:00,2`);
  assert.equal(parseDemandCsv(`${salesHeader}\nid,2024-01-15T12:30:00+11:00,1\nID,2024-01-16T12:30:00+11:00,2`,
    "sales", "Australia/Sydney").length, 2);
});

test("file and row limits reject oversized input instead of truncating", () => {
  const row = (n) => `id${n},2024-01-15T12:30:00+11:00,1`;
  const thousand = `${salesHeader}\n${Array.from({ length: 1000 }, (_, n) => row(n)).join("\n")}`;
  assert.equal(parseDemandCsv(thousand, "sales", "Australia/Sydney").length, 1000);
  reject(`${thousand}\n${row(1000)}`);
  reject("x".repeat(MAX_DEMAND_FILE_BYTES + 1));
});

function form() {
  const data = new FormData();
  data.set("business_id", business);
  data.set("venue_id", venue);
  data.set("event_type", "sales");
  data.set("source_name", "  POS One  ");
  data.set("venue_timezone", "Australia/Sydney");
  data.set("request_id", requestId);
  data.set("file", new File([sales("id,2024-01-15T12:30:00+11:00,1")], "history.csv", { type: "text/csv" }));
  return data;
}

test("form parsing requires one valid context, source, type, timezone, request and file", () => {
  assert.equal(parseDemandImportForm(form()).sourceName, "POS One");
  for (const [field, value] of [
    ["business_id", "not-a-uuid"], ["venue_id", ""], ["event_type", "other"],
    ["source_name", "customer@example.com"], ["source_name", " "],
    ["venue_timezone", "invalid-zone"], ["request_id", ""], ["file", "not a file"],
  ]) {
    const data = form();
    data.set(field, value);
    assert.equal(parseDemandImportForm(data), null, field);
  }
  const duplicate = form();
  duplicate.append("source_name", "Second source");
  assert.equal(parseDemandImportForm(duplicate), null);
});

test("provenance and original-record parsers fail closed on invalid or duplicated rows", () => {
  const item = {
    id: importId, event_type: "sales", source_name: "POS One", venue_timezone: "Australia/Sydney",
    actor_id: actor, entry_count: 1, occurred_at: "2024-01-15T12:00:00Z",
  };
  const record = {
    id: requestId, source_record_id: "sale1", original_occurred_at: "2024-01-15T12:30:00+11:00",
    original_value: "0001.50",
  };
  assert.deepEqual(parseDemandImports([item]), [item]);
  assert.deepEqual(parseDemandRecords([record], "sales", "Australia/Sydney"), [record]);
  assert.equal(parseDemandImports([item, item]), null);
  assert.equal(parseDemandImports([{ ...item, actor_id: null }]), null);
  assert.equal(parseDemandImports([{ ...item, entry_count: 0 }]), null);
  assert.equal(parseDemandRecords([record, record], "sales", "Australia/Sydney"), null);
  assert.equal(parseDemandRecords([{ ...record, original_value: "" }], "sales", "Australia/Sydney"), null);
  const retained = { ...record, original_occurred_at: "2024-01-15T12:30:00+10:00" };
  assert.deepEqual(parseDemandRecords([retained], "sales", "Australia/Sydney"), [retained],
    "a stored original remains readable if timezone rules change after import");
  assert.equal(parseDemandRecords([{ ...record, original_occurred_at: "not a timestamp" }],
    "sales", "Australia/Sydney"), null);
});

test("pagination and links retain the scoped venue without accepting invalid selections", () => {
  assert.equal(parseDemandPage(undefined), 1);
  assert.equal(parseDemandPage("2"), 2);
  for (const value of ["", "0", "-1", "1.5", "10000", ["1", "2"]]) assert.equal(parseDemandPage(value), null);
  const url = new URL(demandHistoryHref(business, venue, { importId, page: 2 }), "http://localhost");
  assert.equal(url.pathname, "/reports/demand-history");
  assert.equal(url.searchParams.get("business"), business);
  assert.equal(url.searchParams.get("venue"), venue);
  assert.equal(url.searchParams.get("import"), importId);
  assert.equal(url.searchParams.get("page"), "2");
});
