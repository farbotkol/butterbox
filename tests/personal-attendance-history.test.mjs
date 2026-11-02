import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePersonalAttendanceHistory } from "../src/lib/personal-attendance-history.ts";

const clock = {
  event_id: "36a00000-0000-4000-8000-000000000001",
  session_id: "16a00000-0000-4000-8000-000000000001",
  department_name: "FOH", event_type: "clock_in", classification: null,
  original_at: "2024-01-01T09:05:00+00:00", effective_at: "2024-01-01T09:00:00+00:00",
  has_correction: true, event_source: "server_clock",
  location_status: "verified", location_reason: "inside", distance_meters: 12.5,
  accuracy_meters: 5, radius_meters: 100, reviewed_at: null,
};
const breakEvent = {
  ...clock, event_id: "36a00000-0000-4000-8000-000000000002", event_type: "break_end",
  classification: "unpaid", original_at: "2024-01-01T12:00:00+00:00",
  effective_at: "2024-01-01T12:00:00+00:00", has_correction: false,
  event_source: "manager_reported", location_status: null, location_reason: null,
  distance_meters: null, accuracy_meters: null, radius_meters: null,
};

test("personal history preserves original and corrected time, source, breaks and retained location", () => {
  assert.deepEqual(parsePersonalAttendanceHistory([clock, breakEvent]), [clock, breakEvent]);
  const disabled = {
    ...clock, has_correction: false, effective_at: clock.original_at,
    location_status: "not_required", location_reason: "disabled",
    distance_meters: null, accuracy_meters: null, radius_meters: null,
  };
  assert.deepEqual(parsePersonalAttendanceHistory([disabled]), [disabled]);
  const reviewed = {
    ...clock, location_status: "review", location_reason: "permission_denied",
    distance_meters: null, accuracy_meters: null, reviewed_at: "2024-01-02T00:00:00Z",
  };
  assert.deepEqual(parsePersonalAttendanceHistory([reviewed]), [reviewed]);
  const outside = { ...clock, location_status: "review", location_reason: "outside" };
  assert.deepEqual(parsePersonalAttendanceHistory([outside]), [outside]);
});

test("personal history rejects incomplete, contradictory and duplicate results", () => {
  for (const value of [
    null, [clock, clock], [{ ...clock, event_id: "bad" }], [{ ...clock, session_id: null }],
    [{ ...clock, department_name: "" }], [{ ...clock, event_type: "other" }],
    [{ ...clock, original_at: "invalid" }], [{ ...clock, has_correction: false }],
    [{ ...clock, event_source: "other" }], [{ ...clock, classification: "paid" }],
    [{ ...breakEvent, classification: null }], [{ ...breakEvent, location_status: "verified" }],
    [{ ...clock, location_reason: "outside" }], [{ ...clock, distance_meters: -1 }],
    [{ ...clock, radius_meters: 0 }], [{ ...clock, reviewed_at: "2024-01-02T00:00:00Z" }],
    [{ ...clock, location_status: "review", location_reason: "outside", distance_meters: null }],
    [{ ...clock, location_status: "review", location_reason: "permission_denied" }],
    [{ ...clock, location_status: null, location_reason: null }],
  ]) assert.equal(parsePersonalAttendanceHistory(value), null, JSON.stringify(value));
  assert.deepEqual(parsePersonalAttendanceHistory([]), []);
});
