import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collapsedRosterDepartments,
  rosterViewHref,
  toggleRosterDepartment,
} from "../src/lib/roster-view.ts";

test("collapsed departments are deduplicated and restricted to permitted departments", () => {
  assert.deepEqual(collapsedRosterDepartments(["foh", "other", "foh", "boh"], ["foh", "boh"]), ["foh", "boh"]);
  assert.deepEqual(collapsedRosterDepartments("other", ["foh"]), []);
  assert.deepEqual(collapsedRosterDepartments(undefined, ["foh"]), []);
});

test("department collapse can be toggled without changing other groups", () => {
  assert.deepEqual(toggleRosterDepartment(["foh"], "boh"), ["foh", "boh"]);
  assert.deepEqual(toggleRosterDepartment(["foh", "boh"], "foh"), ["boh"]);
});

test("roster navigation preserves the department and every collapsed group", () => {
  const href = rosterViewHref("2032-03-15", "all", ["foh", "boh"], "venue-a");
  const url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/roster");
  assert.equal(url.searchParams.get("week"), "2032-03-15");
  assert.equal(url.searchParams.get("venue"), "venue-a");
  assert.equal(url.searchParams.get("department"), "all");
  assert.deepEqual(url.searchParams.getAll("collapsed"), ["foh", "boh"]);
  assert.equal(new URL(rosterViewHref("2032-03-22", undefined, []), url).searchParams.has("department"), false);
});
