import assert from "node:assert/strict";
import { test } from "node:test";
import {
  departmentHref, parseDepartmentFilterContext, parseDepartmentFilters, serializeDepartmentFilters,
} from "../src/lib/department-directory.ts";

test("department filters use predictable defaults and retain valid criteria", () => {
  assert.deepEqual(parseDepartmentFilters({}), { q: "", status: "all", sort: "name", page: 1 });
  assert.deepEqual(parseDepartmentFilters({
    q: "  Front  ", status: "inactive", sort: "roles", page: "3",
  }), { q: "Front", status: "inactive", sort: "roles", page: 3 });
});

test("invalid and ambiguous department filters are rejected rather than broadened", () => {
  for (const input of [
    { q: ["one", "two"] }, { q: "a".repeat(101) }, { q: "one\ntwo" },
    { status: "archived" }, { sort: "other" }, { page: "0" }, { page: "1.5" }, { page: "100001" },
  ]) assert.equal(parseDepartmentFilters(input), null);
  for (const context of ["q=one&q=two", "return=https%3A%2F%2Fexample.test", "q=" + "a".repeat(1025), null]) {
    assert.equal(parseDepartmentFilterContext(context), null);
  }
});

test("directory, department and role URLs preserve only normalized filter context", () => {
  const filters = parseDepartmentFilters({ q: "A&B / ? #", status: "active", sort: "roles", page: "2" });
  assert.ok(filters);
  assert.deepEqual(parseDepartmentFilterContext(serializeDepartmentFilters(filters)), filters);
  const url = new URL(departmentHref("business-id", "venue-id", filters, "department-id", "role-id"),
    "https://butterbox.example.test");
  assert.equal(url.origin, "https://butterbox.example.test");
  assert.equal(url.pathname, "/settings/departments/department-id/roles/role-id");
  assert.equal(url.searchParams.get("q"), "A&B / ? #");
  assert.equal(url.searchParams.get("business"), "business-id");
  assert.equal(url.searchParams.get("venue"), "venue-id");
  assert.equal(url.searchParams.get("page"), "2");
});
