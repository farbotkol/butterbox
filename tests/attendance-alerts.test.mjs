import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canManageAttendanceAlerts, parseAttendanceAlertActionInput, parseAttendanceAlertNotifications,
  parseAttendanceAlerts, parseAttendanceAlertSettings, parseAttendanceAlertSettingsInput,
} from "../src/lib/attendance-alerts.ts";
import { parseBusinessVenueContext } from "../src/lib/form-data.ts";

const business = "b7300000-0000-4000-8000-000000000001";
const venue = "c7300000-0000-4000-8000-000000000001";
const alertId = "d7300000-0000-4000-8000-000000000001";
const eventId = "e7300000-0000-4000-8000-000000000001";
const userId = "a7300000-0000-4000-8000-000000000001";
const start = "2026-11-02T09:00:00Z";
const end = "2026-11-02T17:00:00Z";
const history = {
  id: eventId, event_type: "opened", actor_id: null, old_signal: null,
  new_signal: "missing_clock_in", reason: null, created_at: start,
};
const alert = {
  alert_id: alertId, shift_id: venue, employee_id: userId, employee_name: "Worker",
  department_name: "FOH", category: "arrival", signal: "missing_clock_in", status: "open",
  starts_at: start, ends_at: end, created_at: start, updated_at: start, history: [history],
};
const notice = {
  notification_id: eventId, alert_id: alertId, employee_name: "Worker", department_name: "FOH",
  signal: "missing_clock_in", status: "open", starts_at: start, created_at: start, unread: true,
};

function form(values) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.append(name, value);
  return data;
}

test("settings input validates both thresholds and rejects duplicate or malformed fields", () => {
  assert.deepEqual(parseAttendanceAlertSettingsInput(form({
    enabled: "true", grace_minutes: "0", no_show_minutes: "1440",
  })), { enabled: true, graceMinutes: 0, noShowMinutes: 1440 });
  assert.deepEqual(parseAttendanceAlertSettingsInput(form({
    enabled: "false", grace_minutes: "240", no_show_minutes: "241",
  })), { enabled: false, graceMinutes: 240, noShowMinutes: 241 });
  for (const values of [
    { enabled: "on", grace_minutes: "10", no_show_minutes: "60" },
    { enabled: "true", grace_minutes: "-1", no_show_minutes: "60" },
    { enabled: "true", grace_minutes: "241", no_show_minutes: "300" },
    { enabled: "true", grace_minutes: "10", no_show_minutes: "10" },
    { enabled: "true", grace_minutes: "01", no_show_minutes: "60" },
    { enabled: "true", grace_minutes: "10", no_show_minutes: "1441" },
    { enabled: "true", grace_minutes: "1.5", no_show_minutes: "60" },
  ]) assert.equal(parseAttendanceAlertSettingsInput(form(values)), null, JSON.stringify(values));
  const duplicate = form({ enabled: "true", grace_minutes: "10", no_show_minutes: "60" });
  duplicate.append("grace_minutes", "20");
  assert.equal(parseAttendanceAlertSettingsInput(duplicate), null);
});

test("action and tenant context require singular valid identifiers and an explicit resolution reason", () => {
  const context = form({ business_id: business, venue_id: venue });
  assert.deepEqual(parseBusinessVenueContext(context), { businessId: business, venueId: venue });
  context.append("venue_id", venue);
  assert.equal(parseBusinessVenueContext(context), null);
  const acknowledge = { alert_id: alertId, request_id: eventId, action: "acknowledged" };
  assert.deepEqual(parseAttendanceAlertActionInput(form(acknowledge)), {
    alertId, requestId: eventId, action: "acknowledged", reason: null,
  });
  assert.deepEqual(parseAttendanceAlertActionInput(form({
    ...acknowledge, action: "resolved", reason: "  Investigated  ",
  })), { alertId, requestId: eventId, action: "resolved", reason: "Investigated" });
  for (const change of [
    { alert_id: "bad" }, { request_id: "bad" }, { action: "other" },
    { action: "resolved" }, { action: "resolved", reason: "  " },
    { action: "resolved", reason: "x".repeat(501) }, { reason: "not allowed" },
  ]) assert.equal(parseAttendanceAlertActionInput(form({ ...acknowledge, ...change })), null);
  const duplicate = form(acknowledge);
  duplicate.append("request_id", eventId);
  assert.equal(parseAttendanceAlertActionInput(duplicate), null);
});

test("settings and alert parsers reject inconsistent scheduler, signal and audit data", () => {
  const settings = { enabled: true, grace_minutes: 10, no_show_minutes: 60,
    scheduler_state: "running", last_completed_at: start };
  assert.deepEqual(parseAttendanceAlertSettings([settings]), settings);
  for (const change of [
    { enabled: false }, { grace_minutes: 60 }, { no_show_minutes: 1441 },
    { scheduler_state: "running", last_completed_at: null }, { scheduler_state: "unknown" },
  ]) assert.equal(parseAttendanceAlertSettings([{ ...settings, ...change }]), null);
  assert.equal(parseAttendanceAlertSettings([]), null);
  assert.deepEqual(parseAttendanceAlerts([alert]), [alert]);
  assert.deepEqual(parseAttendanceAlerts([]), []);
  assert.equal(parseAttendanceAlerts([alert, alert]), null);
  for (const change of [
    { signal: "no_such_signal" }, { signal: null }, { category: "departure" },
    { starts_at: end, ends_at: start }, { employee_name: "" }, { history: [] },
    { history: [history, history] }, { history: [{ ...history, actor_id: userId }] },
    { history: [{ ...history, event_type: "resolved", actor_id: userId, reason: null }] },
  ]) assert.equal(parseAttendanceAlerts([{ ...alert, ...change }]), null, JSON.stringify(change));
});

test("notifications stay distinct per current alert and management role", () => {
  assert.deepEqual(parseAttendanceAlertNotifications([notice]), [notice]);
  assert.deepEqual(parseAttendanceAlertNotifications([]), []);
  assert.equal(parseAttendanceAlertNotifications([notice, notice]), null);
  assert.equal(parseAttendanceAlertNotifications([notice, {
    ...notice, notification_id: "e7300000-0000-4000-8000-000000000002",
  }]), null);
  for (const change of [
    { status: "resolved" }, { signal: null }, { unread: "true" },
    { employee_name: "" }, { created_at: "invalid" },
  ]) assert.equal(parseAttendanceAlertNotifications([{ ...notice, ...change }]), null);
  for (const role of ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"]) {
    assert.equal(canManageAttendanceAlerts(role), true);
  }
  assert.equal(canManageAttendanceAlerts("employee"), false);
  assert.equal(canManageAttendanceAlerts("unknown"), false);
});
