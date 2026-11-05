import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseRosterPublicationMode,
  parseRosterPublicationModeEvents,
  parseRosterReviews,
  rosterReviewFailureCode,
} from "../src/lib/roster-review.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const shift = {
  shift_id: id(1), employee_id: id(2), employee_name: "Sam", role_title: "Barista",
  starts_at: "2032-03-15T09:00:00+00:00", ends_at: "2032-03-15T13:00:00+00:00",
  break_minutes: 30, requires_acknowledgement: true,
};
const review = {
  review_id: id(3), requested_by: id(4), requested_at: "2032-03-01T10:00:00Z",
  decision: null, reason: null, decided_by: null, decided_at: null,
  published_count: null, stale: false, changes: [shift],
};

test("publication mode accepts only supported settings", () => {
  assert.equal(parseRosterPublicationMode("direct"), "direct");
  assert.equal(parseRosterPublicationMode("approval"), "approval");
  for (const value of ["", "Direct", "unknown", null, undefined, true]) {
    assert.equal(parseRosterPublicationMode(value), null);
  }
});

test("publication mode history validates actors, transitions and duplicates", () => {
  const event = {
    id: id(7), actor_id: id(8), old_mode: "direct", new_mode: "approval",
    created_at: "2032-03-01T10:00:00Z",
  };
  assert.deepEqual(parseRosterPublicationModeEvents([event]), [event]);
  assert.deepEqual(parseRosterPublicationModeEvents([{ ...event, actor_id: null }])?.length, 1);
  assert.deepEqual(parseRosterPublicationModeEvents([]), []);
  for (const value of [
    null, [event, event], [{ ...event, actor_id: "bad" }], [{ ...event, old_mode: "approval" }],
    [{ ...event, new_mode: "bad" }], [{ ...event, created_at: "bad" }],
  ]) assert.equal(parseRosterPublicationModeEvents(value), null);
});

test("review parsing accepts valid pending, stale and historical snapshots", () => {
  assert.deepEqual(parseRosterReviews([review]), [review]);
  const open = { ...shift, shift_id: id(5), employee_id: null, employee_name: null };
  assert.deepEqual(parseRosterReviews([{ ...review, stale: true, changes: [shift, open] }])?.[0].changes, [shift, open]);
  const approved = {
    ...review, decision: "approved", decided_by: id(6), decided_at: "2032-03-02T10:00:00Z",
    published_count: 1,
  };
  assert.deepEqual(parseRosterReviews([approved]), [approved]);
  const rejected = { ...approved, decision: "rejected", reason: "Too many shifts", published_count: 0 };
  assert.deepEqual(parseRosterReviews([rejected]), [rejected]);
  assert.deepEqual(parseRosterReviews([]), []);
});

test("review parsing rejects malformed, duplicate or inconsistent responses", () => {
  assert.equal(parseRosterReviews(null), null);
  assert.equal(parseRosterReviews([review, review]), null);
  for (const change of [
    { review_id: "bad" }, { requested_by: "bad" }, { requested_at: "tomorrow" },
    { decision: "maybe" }, { reason: "unexpected" }, { decided_by: id(6) },
    { stale: "yes" }, { changes: [] }, { changes: [shift, shift] },
    { changes: [{ ...shift, employee_name: null }] },
    { changes: [{ ...shift, shift_id: "bad" }] },
    { changes: [{ ...shift, role_title: "" }] },
    { changes: [{ ...shift, ends_at: shift.starts_at }] },
    { changes: [{ ...shift, break_minutes: -1 }] },
    { changes: [{ ...shift, requires_acknowledgement: "yes" }] },
    { decision: "approved", decided_by: id(6), decided_at: "2032-03-02T10:00:00Z", published_count: 0 },
    { decision: "rejected", decided_by: id(6), decided_at: "2032-03-02T10:00:00Z", published_count: 0 },
    { decision: "withdrawn", decided_by: id(6), decided_at: "2032-03-02T10:00:00Z", published_count: 0, stale: true },
  ]) {
    assert.equal(parseRosterReviews([{ ...review, ...change }]), null, JSON.stringify(change));
  }
});

test("review failures identify conflicts, stale requests and authorization", () => {
  assert.equal(rosterReviewFailureCode("Roster approval settings changed"), "review-settings");
  assert.equal(rosterReviewFailureCode("Submitted roster changed; withdraw or reject and resubmit"), "review-stale");
  assert.equal(rosterReviewFailureCode("Roster has overlapping shifts"), "publish-overlap");
  assert.equal(rosterReviewFailureCode("A different authorised reviewer is required"), "review-permission");
  assert.equal(rosterReviewFailureCode("Roster review already decided"), "review-decided");
  assert.equal(rosterReviewFailureCode(undefined), "review");
});
