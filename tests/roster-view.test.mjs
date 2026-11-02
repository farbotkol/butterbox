import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collapsedRosterDepartments,
  matchesRosterSearch,
  rosterSearchQuery,
  rosterShortcut,
  rosterViewHref,
  toggleRosterDepartment,
} from "../src/lib/roster-view.ts";

test("collapsed departments are deduplicated and restricted to permitted departments", () => {
  assert.deepEqual(collapsedRosterDepartments(["foh", "other", "foh", "boh"], ["foh", "boh"]), ["foh", "boh"]);
  assert.deepEqual(collapsedRosterDepartments("other", ["foh"]), []);
  assert.deepEqual(collapsedRosterDepartments(undefined, ["foh"]), []);
});

test("roster search validates actual length/duplicate boundaries and preserves scoped navigation", () => {
  assert.equal(rosterSearchQuery(undefined), "");
  assert.equal(rosterSearchQuery("  SYNTHETIC  "), "SYNTHETIC");
  assert.equal(rosterSearchQuery("x".repeat(100)), "x".repeat(100));
  assert.equal(rosterSearchQuery("x".repeat(101)), null);
  assert.equal(rosterSearchQuery(["one", "two"]), null);
  assert.equal(matchesRosterSearch("Synthetic Worker", "synthetic"), true);
  assert.equal(matchesRosterSearch("Synthetic Worker", "Absent"), false);
  const url = new URL(rosterViewHref("2032-03-15", "foh", ["boh"], "venue", "Synthetic", "business"), "https://example.test");
  assert.equal(url.searchParams.get("q"), "Synthetic");
  assert.equal(url.searchParams.get("business"), "business");
  assert.deepEqual(url.searchParams.getAll("collapsed"), ["boh"]);
});

test("roster shortcuts require explicit modifiers and ignore repeated, handled or unrequested combinations", () => {
  const event = { key: "ArrowLeft", altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, repeat: false, defaultPrevented: false };
  assert.equal(rosterShortcut(event), "previous");
  assert.equal(rosterShortcut({ ...event, key: "ArrowRight" }), "next");
  assert.equal(rosterShortcut({ ...event, key: "F" }), "search");
  for (const change of [
    { key: "Delete" }, { altKey: false }, { shiftKey: false }, { ctrlKey: true },
    { metaKey: true }, { repeat: true }, { defaultPrevented: true },
  ]) assert.equal(rosterShortcut({ ...event, ...change }), null);
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
  assert.equal(url.search, "?week=2032-03-15&venue=venue-a&department=all&collapsed=foh&collapsed=boh");
  assert.equal(new URL(rosterViewHref("2032-03-22", undefined, []), url).searchParams.has("department"), false);
});
