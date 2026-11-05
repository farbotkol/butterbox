import assert from "node:assert/strict";
import { test } from "node:test";
import { groupEmployeeSchedule } from "../src/lib/employee-schedule.ts";

function shift(id, startsAt, endsAt) {
  return { id, role_title: id, starts_at: startsAt, ends_at: endsAt };
}

test("the personal schedule groups and sorts shifts by venue-local day", () => {
  const days = groupEmployeeSchedule("2099-03-16", [
    shift("later", "2099-03-16T00:00:00Z", "2099-03-16T02:00:00Z"),
    shift("first", "2099-03-15T21:00:00Z", "2099-03-15T23:00:00Z"),
    shift("tuesday", "2099-03-16T22:00:00Z", "2099-03-17T00:00:00Z"),
  ], "Australia/Sydney");
  assert.equal(days.length, 7);
  assert.deepEqual(days[0].shifts.map(({ id }) => id), ["first", "later"]);
  assert.deepEqual(days[1].shifts.map(({ id }) => id), ["tuesday"]);
  assert.deepEqual(days.slice(2).flatMap(({ shifts }) => shifts), []);
});

test("overnight shifts overlapping the week appear on Monday, not in adjacent weeks", () => {
  const days = groupEmployeeSchedule("2099-03-16", [
    shift("overnight", "2099-03-15T12:30:00Z", "2099-03-15T13:30:00Z"),
    shift("ended-at-boundary", "2099-03-15T10:00:00Z", "2099-03-15T13:00:00Z"),
    shift("next-week", "2099-03-22T13:00:00Z", "2099-03-22T15:00:00Z"),
  ], "Australia/Sydney");
  assert.deepEqual(days[0].shifts.map(({ id }) => id), ["overnight"]);
  assert.equal(days.flatMap(({ shifts }) => shifts).length, 1);
});

test("week overlap uses venue-local boundaries across daylight saving", () => {
  const shifts = [
    shift("sunday-night", "2026-10-04T12:30:00Z", "2026-10-04T14:30:00Z"),
    shift("next-monday", "2026-10-11T13:00:00Z", "2026-10-11T14:00:00Z"),
  ];
  const days = groupEmployeeSchedule("2026-10-05", shifts, "Australia/Sydney");
  assert.deepEqual(days[0].shifts.map(({ id }) => id), ["sunday-night"]);
  assert.equal(days.flatMap(({ shifts: items }) => items).length, 1);
});
