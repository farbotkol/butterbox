"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  canManageAttendanceAlerts, parseAttendanceAlertActionInput, parseAttendanceAlertSettingsInput,
} from "@/lib/attendance-alerts";
import { parseBusinessId } from "@/lib/business-selection";
import { parseBusinessVenueContext, singleFormString } from "@/lib/form-data";
import { getWorkspace } from "@/lib/workspace";

function refreshAlertPaths() {
  revalidatePath("/attendance/alerts");
  revalidatePath("/attendance");
  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function saveAttendanceAlertSettingsAction(formData: FormData) {
  const context = parseBusinessVenueContext(formData);
  if (!context) {
    console.error("Invalid attendance alert settings context.");
    redirect("/attendance?error=invalid");
  }
  const destination = `/attendance/alerts?${new URLSearchParams({
    business: context.businessId, venue: context.venueId,
  })}`;
  const settings = parseAttendanceAlertSettingsInput(formData);
  if (!settings) {
    console.error("Invalid attendance alert thresholds.");
    redirect(`${destination}&error=settings`);
  }
  const workspace = await getWorkspace(context.venueId, { businessId: context.businessId });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready" || workspace.membership.role !== "owner") {
    console.error("Attendance alert settings access is unavailable.");
    redirect(`${destination}&error=permission`);
  }
  const { data, error } = await workspace.supabase.rpc("save_attendance_alert_settings", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    p_enabled: settings.enabled, p_grace_minutes: settings.graceMinutes,
    p_no_show_minutes: settings.noShowMinutes,
  });
  if (error || parseBusinessId(data) !== workspace.venue.id) {
    console.error("Could not save attendance alert settings.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid settings receipt.",
    });
    redirect(`${destination}&error=save`);
  }
  refreshAlertPaths();
  redirect(`${destination}&saved=settings`);
}

export async function actOnAttendanceAlertAction(formData: FormData) {
  const context = parseBusinessVenueContext(formData);
  if (!context) {
    console.error("Invalid attendance alert action context.");
    redirect("/attendance?error=invalid");
  }
  const destination = `/attendance/alerts?${new URLSearchParams({
    business: context.businessId, venue: context.venueId,
  })}`;
  const input = parseAttendanceAlertActionInput(formData);
  if (!input) {
    console.error("Invalid attendance alert action.");
    redirect(`${destination}&error=action`);
  }
  const workspace = await getWorkspace(context.venueId, { businessId: context.businessId });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready" || !canManageAttendanceAlerts(workspace.membership.role)) {
    console.error("Attendance alert action access is unavailable.");
    redirect(`${destination}&error=permission`);
  }
  const { data, error } = await workspace.supabase.rpc("act_on_attendance_alert", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    p_alert_id: input.alertId, p_action: input.action, p_reason: input.reason,
    p_request_id: input.requestId,
  });
  if (error || parseBusinessId(data) !== input.alertId) {
    console.error("Could not update attendance alert.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid action receipt.",
    });
    const stale = error?.message === "Alert is already resolved" ||
      error?.message === "Alert is already acknowledged" || error?.message === "Request identifier already used";
    redirect(`${destination}&error=${stale ? "stale" : "save"}#alert-${input.alertId}`);
  }
  refreshAlertPaths();
  redirect(`${destination}&saved=${input.action}#alert-${input.alertId}`);
}

export async function markAttendanceAlertNotificationReadAction(formData: FormData) {
  const context = parseBusinessVenueContext(formData);
  const notificationId = parseBusinessId(singleFormString(formData, "notification_id"));
  const operation = singleFormString(formData, "operation");
  if (!context || !notificationId || (operation !== "read" && operation !== "open")) {
    console.error("Invalid attendance alert notification request.");
    redirect("/notifications?error=read");
  }
  const destination = `/notifications?${new URLSearchParams({
    business: context.businessId, venue: context.venueId,
  })}`;
  const workspace = await getWorkspace(context.venueId, { businessId: context.businessId });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready" || !canManageAttendanceAlerts(workspace.membership.role)) {
    console.error("Attendance alert notification access is unavailable.");
    redirect(`${destination}&error=read`);
  }
  const { data, error } = await workspace.supabase.rpc("mark_attendance_alert_notification_read", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_notification_id: notificationId,
  });
  const alertId = parseBusinessId(data);
  if (error || !alertId) {
    console.error("Could not mark attendance alert notification read.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid notification target.",
    });
    redirect(`${destination}&error=read`);
  }
  refreshAlertPaths();
  if (operation === "open") {
    redirect(`/attendance/alerts?${new URLSearchParams({
      business: workspace.business.id, venue: workspace.venue.id,
    })}#alert-${alertId}`);
  }
  redirect(`${destination}&saved=read`);
}
