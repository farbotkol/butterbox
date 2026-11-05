import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseLocationCapture, parseLocationClockReceipt, parseLocationExceptions,
} from "../src/lib/attendance-location.ts";

const session = "18000000-0000-4000-8000-000000000001";
const event = "e8000000-0000-4000-8000-000000000001";
const check = "d8000000-0000-4000-8000-000000000001";

function capture(values) {
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.append(`location_${name}`, value);
  return form;
}

test("clock location input preserves failure reasons and rejects malformed positions as review", () => {
  const empty = { latitude: null, longitude: null, accuracyMeters: null };
  assert.deepEqual(parseLocationCapture(new FormData()), { status: "not_provided", ...empty });
  for (const status of ["permission_denied", "unavailable", "timeout", "unsupported", "not_provided"]) {
    assert.deepEqual(parseLocationCapture(capture({ status })), { status, ...empty });
  }
  assert.deepEqual(parseLocationCapture(capture({
    status: "position", latitude: "-33.8688", longitude: "151.2093", accuracy_meters: "2.5e1",
  })), { status: "position", latitude: -33.8688, longitude: 151.2093, accuracyMeters: 25 });
  for (const fields of [
    { status: "position", latitude: "91", longitude: "0", accuracy_meters: "1" },
    { status: "position", latitude: "0", longitude: "-181", accuracy_meters: "1" },
    { status: "position", latitude: "0", longitude: "0", accuracy_meters: "-1" },
    { status: "position", latitude: "0", longitude: "0", accuracy_meters: "10000001" },
    { status: "position", latitude: "Infinity", longitude: "0", accuracy_meters: "1" },
    { status: "position", latitude: "0x10", longitude: "0", accuracy_meters: "1" },
    { status: "permission_denied", latitude: "1" },
    { status: "unknown" },
  ]) assert.deepEqual(parseLocationCapture(capture(fields)), { status: "invalid", ...empty });
  const duplicate = capture({ status: "not_provided" });
  duplicate.append("location_status", "position");
  assert.deepEqual(parseLocationCapture(duplicate), { status: "invalid", ...empty });
  const file = capture({});
  file.append("location_latitude", new Blob(["1"]), "location.txt");
  assert.deepEqual(parseLocationCapture(file), { status: "invalid", ...empty });
});

test("location clock receipts require a valid event and consistent verification outcome", () => {
  const base = { session_id: session, event_id: event, occurred_at: "2032-03-15T09:00:00Z" };
  for (const [status, reason] of [
    ["not_required", "disabled"], ["verified", "inside"], ["review", "outside"],
    ["review", "permission_denied"], ["historical_unverified", "historical"],
  ]) {
    assert.deepEqual(parseLocationClockReceipt([{ ...base, location_status: status, location_reason: reason }]), {
      sessionId: session, eventId: event, occurredAt: base.occurred_at,
      locationStatus: status, locationReason: reason,
    });
  }
  assert.equal(parseLocationClockReceipt([{ ...base, location_status: "verified", location_reason: "outside" }]), null);
  assert.equal(parseLocationClockReceipt([{ ...base, location_status: "review", location_reason: "inside" }]), null);
  assert.equal(parseLocationClockReceipt([{ ...base, event_id: "bad", location_status: "verified", location_reason: "inside" }]), null);
  assert.equal(parseLocationClockReceipt([]), null);
});

test("review lists enforce complete scoped outcomes, paired measurements and review audit", () => {
  const row = {
    check_id: check, employee_name: "Worker", department_name: "FOH", event_type: "clock_in",
    occurred_at: "2032-03-15T09:00:00Z", reason: "outside", distance_meters: 200.1,
    accuracy_meters: 10, radius_meters: 100, reviewed_by: null, reviewed_at: null,
  };
  assert.deepEqual(parseLocationExceptions([row]), [row]);
  const denied = {
    ...row, reason: "permission_denied", distance_meters: null, accuracy_meters: null,
    reviewed_by: event, reviewed_at: "2032-03-15T10:00:00Z",
  };
  assert.deepEqual(parseLocationExceptions([denied]), [denied]);
  assert.deepEqual(parseLocationExceptions([]), []);
  for (const invalid of [
    { ...row, accuracy_meters: null }, { ...denied, distance_meters: 1 },
    { ...row, radius_meters: 0 }, { ...row, reason: "inside" },
    { ...row, event_type: "break_start" }, { ...row, reviewed_by: event },
    { ...row, reviewed_at: "bad" }, { ...row, employee_name: " " },
  ]) assert.equal(parseLocationExceptions([invalid]), null);
  assert.equal(parseLocationExceptions([row, { ...row, check_id: check.toUpperCase() }]), null);
  assert.equal(parseLocationExceptions(null), null);
});
