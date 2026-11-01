import assert from "node:assert/strict";
import { test } from "node:test";
import { shiftConflicts } from "../src/lib/shift-conflicts.ts";

const monday = [
  { weekday: 1, start_minute: 540, end_minute: 720 },
  { weekday: 1, start_minute: 780, end_minute: 1020 },
];

function conflicts(startsAt, endsAt, intervals = monday, exceptions = [], timezone = "UTC") {
  return shiftConflicts({ startsAt, endsAt, intervals, exceptions, timezone });
}

test("availability conflict detection uses half-open, sub-minute boundaries", () => {
  assert.deepEqual(conflicts("2032-03-15T09:00Z", "2032-03-15T12:00Z"), []);
  assert.deepEqual(conflicts("2032-03-15T13:00Z", "2032-03-15T17:00Z"), []);
  assert.deepEqual(conflicts("2032-03-15T11:59:59Z", "2032-03-15T12:00:00.001Z"), [
    "recurring-availability",
  ]);
  assert.deepEqual(conflicts("2032-03-15T12:00Z", "2032-03-15T13:00Z"), [
    "recurring-availability",
  ]);
});

test("overnight shifts check each actual local date without including the end instant", () => {
  const overnight = [{ weekday: 7, start_minute: 1320, end_minute: 120 }];
  const blocked = [{
    starts_on: "2032-03-15", ends_on: "2032-03-15",
    exception_type: "unavailable", status: "active",
  }];
  assert.deepEqual(conflicts("2032-03-14T22:00Z", "2032-03-15T02:00Z", overnight), []);
  assert.deepEqual(conflicts("2032-03-14T22:00Z", "2032-03-15T00:00Z", overnight, blocked), []);
  assert.deepEqual(conflicts("2032-03-14T22:00Z", "2032-03-15T00:00:00.001Z", overnight, blocked), [
    "blocked-date",
  ]);
});

test("only active date blocks and approved leave override an unknown or submitted pattern", () => {
  const exceptions = [
    { starts_on: "2032-03-15", ends_on: "2032-03-15", exception_type: "leave", status: "pending" },
    { starts_on: "2032-03-15", ends_on: "2032-03-15", exception_type: "leave", status: "rejected" },
    { starts_on: "2032-03-15", ends_on: "2032-03-15", exception_type: "unavailable", status: "cancelled" },
  ];
  assert.deepEqual(conflicts("2032-03-15T10:00Z", "2032-03-15T11:00Z", null, exceptions), []);
  assert.deepEqual(conflicts("2032-03-15T12:00Z", "2032-03-15T13:00Z", monday, exceptions), [
    "recurring-availability",
  ]);
  exceptions.push(
    { starts_on: "2032-03-15", ends_on: "2032-03-15", exception_type: "leave", status: "approved" },
    { starts_on: "2032-03-15", ends_on: "2032-03-15", exception_type: "unavailable", status: "active" },
  );
  assert.deepEqual(conflicts("2032-03-15T10:00Z", "2032-03-15T11:00Z", null, exceptions), [
    "blocked-date", "approved-leave",
  ]);
});

test("availability is compared in the venue's timezone, not UTC", () => {
  assert.deepEqual(conflicts("2032-03-14T22:00Z", "2032-03-15T01:00Z", monday, [], "Australia/Sydney"), []);
  assert.deepEqual(conflicts("2032-03-14T21:59Z", "2032-03-15T01:00Z", monday, [], "Australia/Sydney"), [
    "recurring-availability",
  ]);
});

test("a skipped daylight-saving hour does not create a false conflict", () => {
  const sunday = [
    { weekday: 7, start_minute: 60, end_minute: 120 },
    { weekday: 7, start_minute: 180, end_minute: 240 },
  ];
  assert.deepEqual(conflicts("2026-10-03T15:30Z", "2026-10-03T16:30Z", sunday, [], "Australia/Sydney"), []);
});

test("both occurrences of a repeated daylight-saving hour are checked", () => {
  const bothSegments = [
    { weekday: 7, start_minute: 150, end_minute: 180 },
    { weekday: 7, start_minute: 120, end_minute: 135 },
  ];
  assert.deepEqual(conflicts("2027-04-03T15:45Z", "2027-04-03T16:15Z", bothSegments, [], "Australia/Sydney"), []);
  assert.deepEqual(conflicts("2027-04-03T15:45Z", "2027-04-03T16:15Z", bothSegments.slice(0, 1), [], "Australia/Sydney"), [
    "recurring-availability",
  ]);
});

test("a skipped local calendar date is not treated as part of a shift", () => {
  const exceptions = [{
    starts_on: "2011-12-30", ends_on: "2011-12-30",
    exception_type: "unavailable", status: "active",
  }];
  assert.deepEqual(conflicts("2011-12-30T09:30Z", "2011-12-30T10:30Z", null, exceptions, "Pacific/Apia"), []);
  exceptions[0].starts_on = "2011-12-31";
  exceptions[0].ends_on = "2011-12-31";
  assert.deepEqual(conflicts("2011-12-30T09:30Z", "2011-12-30T10:30Z", null, exceptions, "Pacific/Apia"), [
    "blocked-date",
  ]);
});

test("legacy shifts over 24 hours are explicitly flagged for review", () => {
  assert.deepEqual(conflicts("2032-03-15T09:00Z", "2032-03-16T09:00:00.001Z"), ["invalid-duration"]);
  assert.throws(() => conflicts("2032-03-15T09:00Z", "2032-03-15T09:00Z"), RangeError);
});
