import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isRosterPlanningDate,
  parseRosterPlanningPeriod,
  parseRosterWeekEvents,
  parseRosterWeekInput,
  parseRosterWeekSettings,
} from "../src/lib/roster-planning.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const settings = {
  current_weekday: 1, pending_weekday: 7, pending_effective_on: "2032-03-21",
  pending_id: id(1), pending_locked: true, revision: 1, venue_today: "2032-03-15",
};
const event = {
  id: id(1), actor_id: id(2), revision: 1, action: "scheduled",
  previous_weekday: 1, weekday: 7, effective_on: "2032-03-21",
  supersedes: null, recorded_at: "2032-03-15T10:00:00Z",
};
const period = {
  start_on: "2032-03-15", end_on: "2032-03-21", weekday: 1,
  previous_on: "2032-03-14", next_on: "2032-03-21",
  start_at: "2032-03-14T13:00:00Z", end_at: "2032-03-20T13:00:00Z",
};

test("planning dates reject invalid dates and unsupported navigation bounds", () => {
  for (const value of ["1900-01-08", "2032-02-29", "9999-12-24"]) {
    assert.equal(isRosterPlanningDate(value), true);
  }
  for (const value of ["1900-01-07", "2031-02-29", "9999-12-25", "", null, "infinity"]) {
    assert.equal(isRosterPlanningDate(value), false);
  }
});

test("week setting form requires one valid day, revision and request identifier", () => {
  const form = new FormData();
  form.set("weekday", "7");
  form.set("revision", "0");
  form.set("pending_id", "");
  form.set("request_id", id(1));
  assert.deepEqual(parseRosterWeekInput(form), { weekday: 7, revision: 0, pendingId: null, requestId: id(1) });
  for (const [field, value] of [
    ["weekday", "0"], ["weekday", "1.0"], ["revision", "-1"], ["revision", "01"],
    ["revision", "2147483647"], ["pending_id", "bad"], ["request_id", "bad"],
  ]) {
    const invalid = new FormData();
    for (const [key, item] of form) invalid.append(key, item);
    invalid.set(field, value);
    assert.equal(parseRosterWeekInput(invalid), null, `${field}: ${value}`);
  }
  form.append("weekday", "1");
  assert.equal(parseRosterWeekInput(form), null);
});

test("week settings reject inconsistent pending changes", () => {
  assert.deepEqual(parseRosterWeekSettings([settings]), settings);
  const noPending = {
    ...settings, pending_weekday: null, pending_effective_on: null, pending_id: null, pending_locked: false,
  };
  assert.deepEqual(parseRosterWeekSettings([noPending]), noPending);
  for (const value of [
    null, [], [settings, settings], [{ ...settings, current_weekday: 8 }],
    [{ ...settings, pending_weekday: null }], [{ ...settings, pending_effective_on: "2032-03-15" }],
    [{ ...settings, pending_id: null }], [{ ...settings, pending_locked: false }],
    [{ ...settings, pending_weekday: 1 }], [{ ...settings, revision: -1 }],
    [{ ...settings, venue_today: "2032-02-30" }],
  ]) assert.equal(parseRosterWeekSettings(value), null);
});

test("event history validates actors, transitions and duplicate rows", () => {
  assert.deepEqual(parseRosterWeekEvents([event]), [event]);
  assert.deepEqual(parseRosterWeekEvents([]), []);
  const cancellation = {
    ...event, id: id(3), revision: 2, action: "cancelled", previous_weekday: 7,
    weekday: 1, supersedes: id(1),
  };
  assert.deepEqual(parseRosterWeekEvents([cancellation, event]), [cancellation, event]);
  for (const value of [
    null, [event, event], [{ ...event, actor_id: "bad" }], [{ ...event, revision: 0 }],
    [{ ...event, action: "cancelled" }], [{ ...event, weekday: 1 }],
    [{ ...event, effective_on: "bad" }], [{ ...event, recorded_at: "bad" }],
  ]) assert.equal(parseRosterWeekEvents(value), null);
});

test("planning response validates range, transition length and navigation", () => {
  assert.deepEqual(parseRosterPlanningPeriod([period], "2032-03-20"), period);
  const sunday = {
    start_on: "2032-03-21", end_on: "2032-03-28", weekday: 7,
    previous_on: "2032-03-20", next_on: "2032-03-28",
    start_at: "2032-03-20T13:00:00Z", end_at: "2032-03-27T13:00:00Z",
  };
  assert.deepEqual(parseRosterPlanningPeriod([sunday], "2032-03-21"), sunday);
  for (const value of [
    null, [], [period, period], [{ ...period, end_on: "2032-03-15" }],
    [{ ...period, end_on: "2032-03-23", next_on: "2032-03-23" }],
    [{ ...period, weekday: 7 }], [{ ...period, previous_on: "2032-03-13" }],
    [{ ...period, next_on: "2032-03-22" }],
    [{ ...period, start_at: "bad" }], [{ ...period, end_at: period.start_at }],
  ]) assert.equal(parseRosterPlanningPeriod(value, "2032-03-20"), null);
  assert.equal(parseRosterPlanningPeriod([period], "2032-03-21"), null);
});
