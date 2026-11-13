import assert from "node:assert/strict";
import { test } from "node:test";
import { localMidnightAsUtc } from "../src/lib/dates.ts";
import { rosterDayTimeline, rosterShiftTimelinePosition } from "../src/lib/roster-timetable.ts";
import { rosterCreateShiftHref } from "../src/lib/roster-view.ts";

test("venue-local time scale uses the actual 23- or 25-hour DST day", () => {
  const springForward = rosterDayTimeline("2032-10-03", "Australia/Melbourne");
  const fallBack = rosterDayTimeline("2032-04-04", "Australia/Melbourne");

  assert.equal(springForward.durationMinutes, 23 * 60);
  assert.equal(fallBack.durationMinutes, 25 * 60);
  assert.deepEqual(springForward.ticks.map((tick) => tick.label), ["00:00", "06:00", "12:00", "18:00", "24:00"]);
  assert.deepEqual(fallBack.ticks.map((tick) => tick.label), ["00:00", "06:00", "12:00", "18:00", "24:00"]);
});

test("timeline positions preserve repeated DST hours and clip overnight shifts at venue midnight", () => {
  const dayStart = Date.parse(localMidnightAsUtc("2032-04-04", "Australia/Melbourne"));
  const firstRepeatedHour = rosterShiftTimelinePosition(
    new Date(dayStart + 90 * 60_000).toISOString(),
    new Date(dayStart + 150 * 60_000).toISOString(),
    "2032-04-04",
    "Australia/Melbourne",
  );
  const secondRepeatedHour = rosterShiftTimelinePosition(
    new Date(dayStart + 150 * 60_000).toISOString(),
    new Date(dayStart + 210 * 60_000).toISOString(),
    "2032-04-04",
    "Australia/Melbourne",
  );
  assert.equal(secondRepeatedHour.top - firstRepeatedHour.top, 4);

  const ordinaryStart = Date.parse(localMidnightAsUtc("2032-03-29", "Australia/Melbourne"));
  const overnight = rosterShiftTimelinePosition(
    new Date(ordinaryStart + 22 * 60 * 60_000).toISOString(),
    new Date(ordinaryStart + 30 * 60 * 60_000).toISOString(),
    "2032-03-29",
    "Australia/Melbourne",
  );
  assert.equal(overnight.top, (22 / 24) * 100);
  assert.equal(overnight.height, (2 / 24) * 100);
  assert.equal(overnight.continuesFromPreviousDay, false);
  assert.equal(overnight.continuesPastMidnight, true);

  const nextDay = rosterShiftTimelinePosition(
    new Date(ordinaryStart + 22 * 60 * 60_000).toISOString(),
    new Date(ordinaryStart + 30 * 60 * 60_000).toISOString(),
    "2032-03-30",
    "Australia/Melbourne",
  );
  assert.equal(nextDay.top, 0);
  assert.equal(nextDay.height, (6 / 24) * 100);
  assert.equal(nextDay.continuesFromPreviousDay, true);
  assert.equal(nextDay.continuesPastMidnight, false);
});

test("a schedule slot link carries its venue-local date, time and employee", () => {
  const href = rosterCreateShiftHref(
    "2032-03-29", "front-of-house", ["back-of-house"], "venue-a", "business-a",
    "2032-03-31", "06:00", "employee-a",
  );
  const url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/roster");
  assert.equal(url.searchParams.get("week"), "2032-03-29");
  assert.equal(url.searchParams.get("department"), "front-of-house");
  assert.equal(url.searchParams.get("day"), "2032-03-31");
  assert.equal(url.searchParams.get("create_date"), "2032-03-31");
  assert.equal(url.searchParams.get("create_start"), "2032-03-31T06:00");
  assert.equal(url.searchParams.get("create_employee"), "employee-a");
  assert.equal(url.hash, "#shift-editor");
});
