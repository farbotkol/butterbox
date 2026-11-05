import assert from "node:assert/strict";
import { test } from "node:test";
import {
  availabilityForDate,
  formatWallTime,
  unavailablePeriods,
  validExceptionDates,
} from "../src/lib/availability.ts";

test("multiple daily availability intervals leave the correct gaps", () => {
  assert.deepEqual(unavailablePeriods("2032-03-15", [
    { weekday: 1, start_minute: 540, end_minute: 720 },
    { weekday: 1, start_minute: 780, end_minute: 1020 },
  ]), [
    { start: 0, end: 540 },
    { start: 720, end: 780 },
    { start: 1020, end: 1440 },
  ]);
});

test("overnight intervals extend into the next day and across the weekly boundary", () => {
  const intervals = [
    { weekday: 2, start_minute: 1320, end_minute: 120 },
    { weekday: 7, start_minute: 1380, end_minute: 180 },
  ];
  assert.deepEqual(unavailablePeriods("2032-03-16", intervals), [{ start: 0, end: 1320 }]);
  assert.deepEqual(unavailablePeriods("2032-03-17", intervals), [{ start: 120, end: 1440 }]);
  assert.deepEqual(unavailablePeriods("2032-03-21", intervals), [{ start: 0, end: 1380 }]);
  assert.deepEqual(unavailablePeriods("2032-03-22", intervals), [{ start: 180, end: 1440 }]);
});

test("overlapping and adjacent availability is combined before gaps are shown", () => {
  assert.deepEqual(unavailablePeriods("2032-03-15", [
    { weekday: 1, start_minute: 720, end_minute: 900 },
    { weekday: 1, start_minute: 540, end_minute: 780 },
    { weekday: 1, start_minute: 900, end_minute: 1020 },
  ]), [{ start: 0, end: 540 }, { start: 1020, end: 1440 }]);
});

test("empty, full-day and daytime-spanning 24-hour patterns are distinct", () => {
  assert.deepEqual(unavailablePeriods("2032-03-15", []), [{ start: 0, end: 1440 }]);
  assert.deepEqual(unavailablePeriods("2032-03-15", [
    { weekday: 1, start_minute: 0, end_minute: 0 },
  ]), []);
  const fullDay = [{ weekday: 1, start_minute: 540, end_minute: 540 }];
  assert.deepEqual(unavailablePeriods("2032-03-15", fullDay), [{ start: 0, end: 540 }]);
  assert.deepEqual(unavailablePeriods("2032-03-16", fullDay), [{ start: 540, end: 1440 }]);
  assert.equal(formatWallTime(0), "00:00");
  assert.equal(formatWallTime(1440), "24:00");
});

test("recurring availability remains in venue wall time on daylight-saving Sundays", () => {
  const intervals = [{ weekday: 7, start_minute: 90, end_minute: 210 }];
  const expected = [{ start: 0, end: 90 }, { start: 210, end: 1440 }];
  assert.deepEqual(unavailablePeriods("2026-10-04", intervals), expected);
  assert.deepEqual(unavailablePeriods("2027-04-04", intervals), expected);
});

test("active date blocks and approved leave override recurring or unsubmitted availability", () => {
  const intervals = [{ weekday: 1, start_minute: 540, end_minute: 1020 }];
  const exceptions = [
    { starts_on: "2032-03-15", ends_on: "2032-03-16", exception_type: "unavailable", status: "active" },
    { starts_on: "2032-03-16", ends_on: "2032-03-17", exception_type: "leave", status: "approved" },
  ];
  assert.deepEqual(availabilityForDate("2032-03-15", intervals, exceptions), {
    blocked: true, approvedLeave: false, pendingLeave: false,
    unavailable: [{ start: 0, end: 1440 }],
  });
  assert.deepEqual(availabilityForDate("2032-03-16", null, exceptions), {
    blocked: true, approvedLeave: true, pendingLeave: false,
    unavailable: [{ start: 0, end: 1440 }],
  });
  assert.deepEqual(availabilityForDate("2032-03-17", intervals, exceptions).unavailable, [
    { start: 0, end: 1440 },
  ]);
  assert.equal(availabilityForDate("2032-03-18", null, exceptions).unavailable, null);
});

test("pending leave is visible without overriding recurring availability; rejected and cancelled dates do nothing", () => {
  const intervals = [{ weekday: 1, start_minute: 540, end_minute: 1020 }];
  const exceptions = [
    { starts_on: "2032-03-15", ends_on: "2032-03-15", exception_type: "leave", status: "pending" },
    { starts_on: "2032-03-15", ends_on: "2032-03-15", exception_type: "leave", status: "rejected" },
    { starts_on: "2032-03-15", ends_on: "2032-03-15", exception_type: "unavailable", status: "cancelled" },
  ];
  assert.deepEqual(availabilityForDate("2032-03-15", intervals, exceptions), {
    blocked: false, approvedLeave: false, pendingLeave: true,
    unavailable: [{ start: 0, end: 540 }, { start: 1020, end: 1440 }],
  });
  assert.equal(availabilityForDate("2032-03-16", null, exceptions).pendingLeave, false);
});

test("exception date ranges require real, ordered dates and at most 366 inclusive days", () => {
  assert.equal(validExceptionDates("2032-02-29", "2032-02-29"), true);
  assert.equal(validExceptionDates("2032-01-01", "2032-12-31"), true);
  assert.equal(validExceptionDates("2032-01-01", "2033-01-01"), false);
  assert.equal(validExceptionDates("2031-02-29", "2031-03-01"), false);
  assert.equal(validExceptionDates("2032-04-10", "2032-04-09"), false);
  assert.equal(validExceptionDates("2032-03-15extra", "2032-03-16"), false);
  assert.equal(validExceptionDates("0000-01-01", "0000-01-01"), false);
});
