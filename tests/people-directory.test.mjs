import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePeopleFilterContext, parsePeopleFilters, parseProfileRevision, peopleHref, serializePeopleFilters,
} from "../src/lib/people-directory.ts";

const department = "d7100000-0000-4000-8000-000000000001";

test("people filters have predictable defaults and retain valid criteria", () => {
  assert.deepEqual(parsePeopleFilters({}), {
    q: "", department: "", role: "", status: "all", sort: "name", page: 1,
  });
  assert.deepEqual(parsePeopleFilters({
    q: "  Alex  ", department: department.toUpperCase(), role: " Barista ",
    status: "archived", sort: "department", page: "3",
  }), {
    q: "Alex", department, role: "Barista", status: "archived", sort: "department", page: 3,
  });
});

test("invalid and ambiguous filters are rejected rather than silently broadened", () => {
  for (const input of [
    { q: ["Alice", "Bob"] }, { q: "a".repeat(101) }, { q: "Alice\nBob" },
    { role: "x".repeat(81) }, { department: "not-a-uuid" }, { status: "other" },
    { sort: "other" }, { page: "0" }, { page: "1.5" }, { page: "100001" },
  ]) assert.equal(parsePeopleFilters(input), null);
});

test("filter context rejects duplicate, unknown and oversized parameters", () => {
  assert.equal(parsePeopleFilterContext("q=one&q=two"), null);
  assert.equal(parsePeopleFilterContext("return=https%3A%2F%2Fexample.test"), null);
  assert.equal(parsePeopleFilterContext("q=" + "a".repeat(1025)), null);
  assert.equal(parsePeopleFilterContext(null), null);
});

test("profile revisions reject ambiguous and unsafe values", () => {
  assert.equal(parseProfileRevision("0"), 0);
  assert.equal(parseProfileRevision("123"), 123);
  for (const value of ["", "-1", "01", "1.5", "9007199254740992", null, 2]) {
    assert.equal(parseProfileRevision(value), null);
  }
});

test("directory and profile URLs preserve only normalized, encoded filter context", () => {
  const filters = parsePeopleFilters({
    q: "A&B / ? #", department, role: "Senior / Barista", status: "active", sort: "role", page: "2",
  });
  assert.ok(filters);
  assert.deepEqual(parsePeopleFilterContext(serializePeopleFilters(filters)), filters);
  const href = peopleHref("business-id", "venue-id", filters, "employee-id");
  const url = new URL(href, "https://butterbox.example.test");
  assert.equal(url.origin, "https://butterbox.example.test");
  assert.equal(url.pathname, "/people/employee-id");
  assert.equal(url.searchParams.get("q"), "A&B / ? #");
  assert.equal(url.searchParams.get("role"), "Senior / Barista");
  assert.equal(url.searchParams.get("department"), department);
  assert.equal(url.searchParams.get("business"), "business-id");
  assert.equal(url.searchParams.get("venue"), "venue-id");
  assert.equal(url.searchParams.get("page"), "2");
});
