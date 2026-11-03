import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterAndSortPermissions, parsePermissionsFilterContext, parsePermissionsFilters, permissionRoleLabel,
  permissionScopeLabel, permissionsFiltersAvailable, permissionsHref, serializePermissionsFilters,
} from "../src/lib/permissions-directory.ts";

const business = "a0000000-0000-4000-8000-000000000001";
const venue = "a0000000-0000-4000-8000-000000000002";
const department = "a0000000-0000-4000-8000-000000000003";
const member = "a0000000-0000-4000-8000-000000000004";

test("permission filters use predictable defaults and retain valid criteria", () => {
  assert.deepEqual(parsePermissionsFilters({}), {
    q: "", role: "all", venue: "all", department: "all", sort: "identity", page: 1,
  });
  const filters = parsePermissionsFilters({
    q: "  owner@example.test  ", role: "general_manager", venue, department: "unscoped",
    sort: "venue", page: "2",
  });
  assert.ok(filters);
  assert.deepEqual(parsePermissionsFilterContext(serializePermissionsFilters(filters)), filters);
  assert.equal(filters.q, "owner@example.test");
  assert.equal(permissionRoleLabel("admin"), "Administrator (legacy)");
  assert.equal(permissionRoleLabel("unrecognized_role"), "unrecognized role (legacy)");
  assert.equal(permissionRoleLabel("constructor"), "constructor (legacy)");
});

test("invalid or ambiguous permission filters are rejected rather than broadened", () => {
  for (const value of [
    { q: "bad\nvalue" }, { q: "x".repeat(101) }, { role: "OWNER" }, { venue: "other" },
    { department: "" }, { sort: "unknown" }, { page: "0" }, { page: ["1", "2"] },
  ]) assert.equal(parsePermissionsFilters(value), null);
  assert.equal(parsePermissionsFilterContext("role=owner&role=employee"), null);
  assert.equal(parsePermissionsFilterContext("return=https%3A%2F%2Fexample.test"), null);
});

test("permission URLs retain only normalized safe directory context", () => {
  const filters = parsePermissionsFilters({ department, venue, role: "employee", q: "Alex" });
  assert.ok(filters);
  const url = new URL(permissionsHref(business, filters, member), "http://localhost");
  assert.equal(url.pathname, `/settings/permissions/${member}`);
  assert.equal(url.searchParams.get("business"), business);
  assert.equal(url.searchParams.get("department"), department);
  assert.equal(url.searchParams.get("venue"), venue);
  assert.equal(url.searchParams.get("role"), "employee");
  assert.equal(url.searchParams.get("q"), "Alex");
});

test("the owner directory searches names and emails and filters scopes without mutating its input", () => {
  const rows = [
    { user_id: "3", full_name: "Zoe", email: "worker@example.test", role: "employee", venue_id: venue, department_id: department },
    { user_id: "1", full_name: "Alex", email: "owner@example.test", role: "owner", venue_id: null, department_id: null },
    { user_id: "2", full_name: "Alex", email: "manager@example.test", role: "general_manager", venue_id: venue, department_id: null },
  ];
  const venues = [{ id: venue, name: "Beach cafe" }];
  const departments = [{ id: department, name: "FOH" }];
  const filtered = (input) => filterAndSortPermissions(rows, parsePermissionsFilters(input), venues, departments);
  assert.deepEqual(filtered({ q: "aLEX" }).map((row) => row.user_id), ["2", "1"]);
  assert.deepEqual(filtered({ q: "WORKER@" }).map((row) => row.user_id), ["3"]);
  assert.deepEqual(filtered({ venue, department: "unscoped" }).map((row) => row.user_id), ["2"]);
  assert.deepEqual(filtered({ venue: "unscoped", role: "owner" }).map((row) => row.user_id), ["1"]);
  assert.deepEqual(filtered({ sort: "role" }).map((row) => row.user_id), ["3", "2", "1"]);
  assert.deepEqual(filtered({ sort: "department" }).map((row) => row.user_id), ["3", "2", "1"]);
  assert.deepEqual(rows.map((row) => row.user_id), ["3", "1", "2"]);
  assert.equal(permissionScopeLabel(null, venues, "venue"), "No venue restriction");
  assert.equal(permissionScopeLabel("missing", venues, "venue"), "Unavailable venue");
  assert.equal(permissionsFiltersAvailable(parsePermissionsFilters({ venue, role: "owner" }), ["owner"], venues, departments), true);
  assert.equal(permissionsFiltersAvailable(parsePermissionsFilters({ venue, role: "unknown" }), ["owner"], venues, departments), false);
  assert.equal(permissionsFiltersAvailable(parsePermissionsFilters({ venue: business }), ["owner"], venues, departments), false);
});
