import { parseBusinessId } from "./business-selection.ts";
import { singleFormString } from "./form-data.ts";

const signals = ["missing_clock_in", "late", "no_show", "missing_clock_out"] as const;
const statuses = ["open", "acknowledged", "resolved"] as const;
const eventTypes = ["opened", "signal_changed", "auto_resolved", "acknowledged", "resolved"] as const;

export type AttendanceAlertSignal = typeof signals[number];
export type AttendanceAlertStatus = typeof statuses[number];
export type AttendanceAlertEventType = typeof eventTypes[number];

export const attendanceAlertSignalLabels: Record<AttendanceAlertSignal, string> = {
  missing_clock_in: "Missing clock-in",
  late: "Late clock-in",
  no_show: "No-show signal",
  missing_clock_out: "Missing clock-out",
};

export const attendanceAlertStatusLabels: Record<AttendanceAlertStatus, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};

export const attendanceAlertEventLabels: Record<AttendanceAlertEventType, string> = {
  opened: "Alert opened",
  signal_changed: "Signal changed",
  auto_resolved: "Signal cleared",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};

export type AttendanceAlertSettings = {
  enabled: boolean;
  grace_minutes: number;
  no_show_minutes: number;
  scheduler_state: "disabled" | "running" | "stale";
  last_completed_at: string | null;
};

export type AttendanceAlertHistory = {
  id: string;
  event_type: AttendanceAlertEventType;
  actor_id: string | null;
  old_signal: AttendanceAlertSignal | null;
  new_signal: AttendanceAlertSignal | null;
  reason: string | null;
  created_at: string;
};

export type AttendanceAlert = {
  alert_id: string;
  shift_id: string;
  employee_id: string;
  employee_name: string;
  department_name: string;
  category: "arrival" | "departure";
  signal: AttendanceAlertSignal | null;
  status: AttendanceAlertStatus;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
  history: AttendanceAlertHistory[];
};

export type AttendanceAlertNotification = {
  notification_id: string;
  alert_id: string;
  employee_name: string;
  department_name: string;
  signal: AttendanceAlertSignal;
  status: "open" | "acknowledged";
  starts_at: string;
  created_at: string;
  unread: boolean;
};

export function canManageAttendanceAlerts(role: string): boolean {
  return ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"].includes(role);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && Boolean(parseBusinessId(value));
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.some((option) => option === value);
}

function isSignal(value: unknown): value is AttendanceAlertSignal {
  return isOneOf(value, signals);
}

function validThresholds(grace: unknown, noShow: unknown): grace is number {
  return typeof grace === "number" && Number.isInteger(grace) && grace >= 0 && grace <= 240 &&
    typeof noShow === "number" && Number.isInteger(noShow) && noShow > grace && noShow <= 1440;
}

export function parseAttendanceAlertSettings(data: unknown): AttendanceAlertSettings | null {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) return null;
  const row = data[0];
  if (typeof row.enabled !== "boolean" || !validThresholds(row.grace_minutes, row.no_show_minutes) ||
    typeof row.no_show_minutes !== "number" ||
    !isOneOf(row.scheduler_state, ["disabled", "running", "stale"] as const) ||
    (row.enabled ? row.scheduler_state === "disabled" : row.scheduler_state !== "disabled") ||
    (row.scheduler_state === "running" && row.last_completed_at === null) ||
    (row.last_completed_at !== null && !isTimestamp(row.last_completed_at))) return null;
  return {
    enabled: row.enabled, grace_minutes: row.grace_minutes, no_show_minutes: row.no_show_minutes,
    scheduler_state: row.scheduler_state, last_completed_at: row.last_completed_at,
  };
}

export function parseAttendanceAlertSettingsInput(formData: FormData) {
  const enabled = singleFormString(formData, "enabled");
  const grace = singleFormString(formData, "grace_minutes");
  const noShow = singleFormString(formData, "no_show_minutes");
  if ((enabled !== "true" && enabled !== "false") || !grace || !noShow ||
    !/^(0|[1-9]\d*)$/.test(grace) || !/^(0|[1-9]\d*)$/.test(noShow)) return null;
  const graceMinutes = Number(grace);
  const noShowMinutes = Number(noShow);
  if (!validThresholds(graceMinutes, noShowMinutes)) return null;
  return { enabled: enabled === "true", graceMinutes, noShowMinutes };
}

export function parseAttendanceAlertActionInput(formData: FormData) {
  const alertId = parseBusinessId(singleFormString(formData, "alert_id"));
  const requestId = parseBusinessId(singleFormString(formData, "request_id"));
  const action = singleFormString(formData, "action");
  const reasons = formData.getAll("reason");
  if (!alertId || !requestId || (action !== "acknowledged" && action !== "resolved") ||
    reasons.length > 1 || (reasons.length === 1 && typeof reasons[0] !== "string")) return null;
  const reason = typeof reasons[0] === "string" ? reasons[0].trim() : "";
  if ((action === "resolved" && (!reason || reason.length > 500)) ||
    (action === "acknowledged" && reason)) return null;
  return { alertId, requestId, action, reason: reason || null };
}

function parseHistory(data: unknown): AttendanceAlertHistory[] | null {
  if (!Array.isArray(data)) return null;
  const history: AttendanceAlertHistory[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    if (!isRecord(row) || !isUuid(row.id) || seen.has(row.id) ||
      !isOneOf(row.event_type, eventTypes) || (row.actor_id !== null && !isUuid(row.actor_id)) ||
      (row.old_signal !== null && !isSignal(row.old_signal)) ||
      (row.new_signal !== null && !isSignal(row.new_signal)) ||
      (row.reason !== null && (typeof row.reason !== "string" || !row.reason.trim() || row.reason.length > 500)) ||
      (row.event_type === "resolved" ? row.reason === null : row.reason !== null) ||
      (["acknowledged", "resolved"].includes(row.event_type) ? row.actor_id === null : row.actor_id !== null) ||
      !isTimestamp(row.created_at)) return null;
    seen.add(row.id);
    history.push({
      id: row.id, event_type: row.event_type, actor_id: row.actor_id,
      old_signal: row.old_signal, new_signal: row.new_signal, reason: row.reason, created_at: row.created_at,
    });
  }
  return history;
}

export function parseAttendanceAlerts(data: unknown): AttendanceAlert[] | null {
  if (!Array.isArray(data)) return null;
  const alerts: AttendanceAlert[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    if (!isRecord(row) || !isUuid(row.alert_id) || seen.has(row.alert_id) ||
      !isUuid(row.shift_id) || !isUuid(row.employee_id) ||
      typeof row.employee_name !== "string" || !row.employee_name.trim() ||
      typeof row.department_name !== "string" || !row.department_name.trim() ||
      !isOneOf(row.category, ["arrival", "departure"] as const) ||
      (row.signal !== null && !isSignal(row.signal)) || !isOneOf(row.status, statuses) ||
      (row.signal === null && row.status !== "resolved") ||
      (row.signal === "missing_clock_out" ? row.category !== "departure"
        : row.signal !== null && row.category !== "arrival") ||
      !isTimestamp(row.starts_at) || !isTimestamp(row.ends_at) ||
      Date.parse(row.starts_at) >= Date.parse(row.ends_at) ||
      !isTimestamp(row.created_at) || !isTimestamp(row.updated_at)) return null;
    const history = parseHistory(row.history);
    if (!history || history.length === 0) return null;
    seen.add(row.alert_id);
    alerts.push({
      alert_id: row.alert_id, shift_id: row.shift_id, employee_id: row.employee_id,
      employee_name: row.employee_name, department_name: row.department_name, category: row.category,
      signal: row.signal, status: row.status, starts_at: row.starts_at, ends_at: row.ends_at,
      created_at: row.created_at, updated_at: row.updated_at, history,
    });
  }
  return alerts;
}

export function parseAttendanceAlertNotifications(data: unknown): AttendanceAlertNotification[] | null {
  if (!Array.isArray(data)) return null;
  const notifications: AttendanceAlertNotification[] = [];
  const seen = new Set<string>();
  const seenAlerts = new Set<string>();
  for (const row of data) {
    if (!isRecord(row) || !isUuid(row.notification_id) || seen.has(row.notification_id) ||
      !isUuid(row.alert_id) || seenAlerts.has(row.alert_id) ||
      typeof row.employee_name !== "string" || !row.employee_name.trim() ||
      typeof row.department_name !== "string" || !row.department_name.trim() || !isSignal(row.signal) ||
      !isOneOf(row.status, ["open", "acknowledged"] as const) ||
      !isTimestamp(row.starts_at) || !isTimestamp(row.created_at) || typeof row.unread !== "boolean") return null;
    seen.add(row.notification_id);
    seenAlerts.add(row.alert_id);
    notifications.push({
      notification_id: row.notification_id, alert_id: row.alert_id,
      employee_name: row.employee_name, department_name: row.department_name, signal: row.signal,
      status: row.status, starts_at: row.starts_at, created_at: row.created_at, unread: row.unread,
    });
  }
  return notifications;
}
