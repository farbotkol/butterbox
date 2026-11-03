import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeNavigationItem, helpNavigation, navigationGroups, navigationHref,
} from "../src/lib/navigation.ts";

const business = "a0000000-0000-4000-8000-000000000001";
const venue = "a0000000-0000-4000-8000-000000000002";
const labels = (groups) => groups.map((group) => [group.label, group.items.map((item) => item.label)]);

test("owner navigation follows the approved group and item order", () => {
  assert.deepEqual(labels(navigationGroups("owner")), [
    ["My Work", ["Dashboard", "My schedule", "Clock in / out", "My availability", "Notifications"]],
    ["Team Management", ["Rostering", "People", "Announcements", "Timesheet review", "Work time", "Exceptions"]],
    ["Venue Management", ["Clock kiosks", "Departments & roles", "Venue settings"]],
    ["Business", ["Payroll", "Hours & labour", "Permissions", "Audit history"]],
  ]);
});

test("employee, manager and administrator menus retain only relevant authorized destinations", () => {
  assert.deepEqual(labels(navigationGroups("employee")), [
    ["My Work", ["Dashboard", "My schedule", "Clock in / out", "My availability", "Notifications"]],
    ["Team Management", ["Rostering", "Announcements"]],
  ]);
  for (const role of ["general_manager", "foh_manager", "boh_manager", "department_manager"]) {
    const groups = navigationGroups(role);
    assert.deepEqual(groups.map((group) => group.label), ["My Work", "Team Management", "Venue Management"]);
    assert.deepEqual(groups[2].items.map((item) => item.label), ["Departments & roles"]);
    assert.ok(groups[1].items.some((item) => item.label === "People"));
  }
  const admin = navigationGroups("admin");
  assert.deepEqual(admin[2].items.map((item) => item.label), ["Departments & roles"]);
  assert.deepEqual(admin[3].items.map((item) => item.label), ["Payroll"]);
  assert.deepEqual(labels(navigationGroups("unknown")), labels(navigationGroups("employee")));
});

test("active navigation chooses the most specific route and respects path boundaries", () => {
  const items = [...navigationGroups("owner").flatMap((group) => group.items), helpNavigation];
  for (const [pathname, label] of [
    ["/", "Dashboard"], ["/attendance", "Clock in / out"], ["/attendance/history", "Clock in / out"],
    ["/attendance/kiosks", "Clock kiosks"], ["/settings/departments/123/roles/456", "Departments & roles"],
    ["/settings/organisation", "Venue settings"], ["/settings/payroll/new", "Payroll"],
    ["/roster/planning", "Rostering"], ["/help", "Help"],
  ]) assert.equal(activeNavigationItem(pathname, items)?.label, label, pathname);
  assert.equal(activeNavigationItem("/attendance-extra", items), undefined);
  assert.equal(activeNavigationItem("/settings/permission", items), undefined);
});

test("navigation carries the selected venue without narrowing business-wide destinations", () => {
  const items = navigationGroups("owner").flatMap((group) => group.items);
  for (const [label, expectedKey] of [
    ["Dashboard", "venue"], ["People", "venue"], ["Payroll", "venue"], ["Clock kiosks", "venue"],
    ["Hours & labour", "contextVenue"], ["Permissions", "contextVenue"], ["Audit history", "contextVenue"],
  ]) {
    const item = items.find((candidate) => candidate.label === label);
    assert.ok(item);
    const url = new URL(navigationHref(item, business, venue), "http://localhost");
    assert.equal(url.searchParams.get("business"), business);
    assert.equal(url.searchParams.get(expectedKey), venue);
    if (expectedKey === "contextVenue") assert.equal(url.searchParams.has("venue"), false);
  }
  assert.equal(navigationHref(helpNavigation), "/help");
  const help = new URL(navigationHref(helpNavigation, business, venue), "http://localhost");
  assert.equal(help.searchParams.get("contextVenue"), venue);
});
