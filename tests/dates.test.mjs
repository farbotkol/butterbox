import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  getVenueDate,
  getWeekStart,
  localMidnightAsUtc,
} from "../src/lib/dates.ts";

test("roster weeks start on Monday", () => {
  assert.equal(getWeekStart("2026-10-25", "Australia/Sydney"), "2026-10-19");
  assert.equal(getWeekStart("2026-10-26", "Australia/Sydney"), "2026-10-26");
});

test("week navigation crosses month and year boundaries", () => {
  assert.equal(addDays("2026-12-29", 7), "2027-01-05");
  assert.equal(addDays("2027-01-05", -7), "2026-12-29");
});

test("venue-local week boundaries account for daylight saving", () => {
  assert.equal(
    localMidnightAsUtc("2026-10-04", "Australia/Sydney"),
    "2026-10-03T14:00:00.000Z",
  );
  assert.equal(
    localMidnightAsUtc("2026-10-05", "Australia/Sydney"),
    "2026-10-04T13:00:00.000Z",
  );
});

test("shift day grouping uses the venue timezone", () => {
  assert.equal(
    getVenueDate("2026-10-03T14:30:00.000Z", "Australia/Sydney"),
    "2026-10-04",
  );
});
