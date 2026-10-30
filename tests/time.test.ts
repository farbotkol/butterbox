import assert from "node:assert/strict";
import test from "node:test";
import { addDays, dateLabel, localDate, localInput, localToInstant, monday, timeLabel } from "../src/components/time.ts";

test("venue local input converts using the date's actual timezone offset", () => {
  assert.equal(localToInstant("2026-07-01T09:00", "Europe/London"), "2026-07-01T08:00:00.000Z");
  assert.equal(localToInstant("2026-01-01T09:00", "Europe/London"), "2026-01-01T09:00:00.000Z");
  assert.equal(localToInstant("2026-07-01T09:00", "Australia/Sydney"), "2026-06-30T23:00:00.000Z");
  assert.equal(localToInstant("2026-01-01T09:00", "Australia/Sydney"), "2025-12-31T22:00:00.000Z");
});

test("fractional timezone offsets are preserved", () => {
  assert.equal(localToInstant("2026-07-01T09:00", "Asia/Kathmandu"), "2026-07-01T03:15:00.000Z");
  assert.equal(localToInstant("2026-07-01T09:00", "Australia/Adelaide"), "2026-06-30T23:30:00.000Z");
});

test("nonexistent daylight-saving local times fail instead of silently shifting", () => {
  assert.throws(() => localToInstant("2026-03-29T01:30", "Europe/London"), /does not exist/);
  assert.throws(() => localToInstant("2026-03-08T02:30", "America/New_York"), /does not exist/);
  assert.throws(() => localToInstant("2026-10-04T02:15", "Australia/Lord_Howe"), /does not exist/);
});

test("ambiguous daylight-saving local times fail instead of guessing an offset", () => {
  assert.throws(() => localToInstant("2026-10-25T01:30", "Europe/London"), /occurs twice/);
  assert.throws(() => localToInstant("2026-11-01T01:30", "America/New_York"), /occurs twice/);
  assert.throws(() => localToInstant("2026-04-05T01:45", "Australia/Lord_Howe"), /occurs twice/);
});

test("times immediately around clock transitions still convert correctly", () => {
  assert.equal(localToInstant("2026-03-29T00:59", "Europe/London"), "2026-03-29T00:59:00.000Z");
  assert.equal(localToInstant("2026-03-29T02:00", "Europe/London"), "2026-03-29T01:00:00.000Z");
  assert.equal(localToInstant("2026-10-25T02:00", "Europe/London"), "2026-10-25T02:00:00.000Z");
});

test("malformed and invalid calendar inputs are rejected", () => {
  for (const value of ["", "2026-07-01", "2026-07-01T9:00", "2026-07-01T09:00:00", "2026-07-01T09:00Z"])
    assert.throws(() => localToInstant(value, "UTC"), /complete date and time/);
  for (const value of ["2026-02-30T09:00", "2026-13-01T09:00", "2026-01-01T25:00"])
    assert.throws(() => localToInstant(value, "UTC"), /valid calendar date/);
});

test("venue date and time labels do not use the browser timezone", () => {
  const instant = "2026-07-01T23:30:00.000Z";
  assert.equal(localDate(instant, "Australia/Sydney"), "2026-07-02");
  assert.equal(localDate(instant, "America/New_York"), "2026-07-01");
  assert.equal(localInput(instant, "Australia/Sydney"), "2026-07-02T09:30");
  assert.equal(timeLabel(instant, "Australia/Sydney"), "09:30");
  assert.equal(localInput("2026-06-30T18:15:00.000Z", "Asia/Kathmandu"), "2026-07-01T00:00");
});

test("weekly calendar boundaries remain stable across DST and year changes", () => {
  assert.equal(monday("2026-11-01"), "2026-10-26");
  assert.equal(monday("2026-10-26"), "2026-10-26");
  assert.equal(addDays("2026-10-26", 7), "2026-11-02");
  assert.equal(addDays("2026-12-29", 7), "2027-01-05");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(dateLabel("2026-11-01"), "1 Nov");
});

test("publishing week boundaries use venue midnight and preserve DST-length weeks", () => {
  const duration = (start: string, zone: string) => {
    const first = localToInstant(`${start}T00:00`, zone);
    const last = localToInstant(`${addDays(start, 7)}T00:00`, zone);
    return { first, last, hours: (Date.parse(last) - Date.parse(first)) / 3600000 };
  };
  assert.deepEqual(duration("2026-03-23", "Europe/London"), {
    first: "2026-03-23T00:00:00.000Z", last: "2026-03-29T23:00:00.000Z", hours: 167,
  });
  assert.deepEqual(duration("2026-10-19", "Europe/London"), {
    first: "2026-10-18T23:00:00.000Z", last: "2026-10-26T00:00:00.000Z", hours: 169,
  });
  assert.deepEqual(duration("2026-10-26", "Australia/Sydney"), {
    first: "2026-10-25T13:00:00.000Z", last: "2026-11-01T13:00:00.000Z", hours: 168,
  });
});
