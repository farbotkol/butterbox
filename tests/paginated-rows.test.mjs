import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePageNumber, readAllPages } from "../src/lib/paginated-rows.ts";

test("page numbers are canonical positive integers within the supported range", () => {
  assert.equal(parsePageNumber(undefined), 1);
  assert.equal(parsePageNumber("1"), 1);
  assert.equal(parsePageNumber("100000"), 100000);
  for (const invalid of ["", "0", "-1", "01", "1.0", "1e2", "100001", null, 2, ["1"]]) {
    assert.equal(parsePageNumber(invalid), null);
  }
});

test("loads every row even when the server enforces a smaller page limit", async () => {
  const values = [1, 2, 3, 4, 5];
  const offsets = [];
  const result = await readAllPages(async (from) => {
    offsets.push(from);
    return { data: values.slice(from, from + 2), error: null, count: values.length };
  }, String);
  assert.deepEqual(result, { data: values, error: null });
  assert.deepEqual(offsets, [0, 2, 4]);
});

test("surfaces database errors and incomplete page results", async () => {
  const error = { code: "query_failed", message: "Database unavailable" };
  assert.deepEqual(await readAllPages(async () => ({ data: null, error, count: null }), String), {
    data: null, error,
  });
  const noCount = await readAllPages(async () => ({ data: [], error: null, count: null }), String);
  assert.equal(noCount.error.code, "incomplete_result");
  assert.equal(noCount.data, null);
  const prematureEnd = await readAllPages(async () => ({ data: [], error: null, count: 1 }), String);
  assert.equal(prematureEnd.error.code, "incomplete_result");
  assert.equal(prematureEnd.data, null);
});

test("surfaces changed counts and duplicate rows rather than returning incomplete data", async () => {
  const changed = await readAllPages(async (from) => ({
    data: from === 0 ? [1] : [2], error: null, count: from === 0 ? 2 : 3,
  }), String);
  assert.equal(changed.error.code, "incomplete_result");
  assert.match(changed.error.message, /changed/);
  const duplicate = await readAllPages(async () => ({
    data: [1], error: null, count: 2,
  }), String);
  assert.equal(duplicate.error.code, "incomplete_result");
  assert.match(duplicate.error.message, /duplicate/);
});
