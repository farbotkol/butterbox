import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { actOnAttendanceAlertAction, saveAttendanceAlertSettingsAction } from "@/app/attendance/alerts/actions";
import { AppShell } from "@/components/app-shell";
import {
  attendanceAlertEventLabels, attendanceAlertSignalLabels, attendanceAlertStatusLabels,
  canManageAttendanceAlerts, parseAttendanceAlerts, parseAttendanceAlertSettings,
  type AttendanceAlert,
} from "@/lib/attendance-alerts";
import { withBusiness } from "@/lib/business-selection";
import { readAllPages } from "@/lib/paginated-rows";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const errors: Record<string, string> = {
  settings: "Enter a grace period from 0 to 240 minutes and a longer no-show threshold, up to 1,440 minutes.",
  action: "Choose an available action and provide a resolution reason of up to 500 characters.",
  permission: "Your access has changed. Refresh and check your venue and department permissions.",
  stale: "This alert was already updated. Review its current status before trying again.",
  save: "We couldn't save that change. Refresh, check your access and try again.",
};

function ContextFields({ businessId, venueId }: { businessId: string; venueId: string }) {
  return <>
    <input type="hidden" name="business_id" value={businessId} />
    <input type="hidden" name="venue_id" value={venueId} />
  </>;
}

function AlertCard({ alert, businessId, venueId, timezone }: {
  alert: AttendanceAlert; businessId: string; venueId: string; timezone: string;
}) {
  const format = (value: string) => new Date(value).toLocaleString("en-AU", {
    timeZone: timezone, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
  return (
    <article id={`alert-${alert.alert_id}`} aria-label={`Attendance alert for ${alert.employee_name}`}
      className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="break-words font-semibold">
            {alert.signal ? attendanceAlertSignalLabels[alert.signal] : "Attendance signal cleared"}
          </h3>
          <p className="mt-1 break-words text-sm text-muted">{alert.employee_name} · {alert.department_name}</p>
          <p className="mt-1 text-sm text-muted">
            Shift: <time dateTime={alert.starts_at}>{format(alert.starts_at)}</time> –{" "}
            <time dateTime={alert.ends_at}>{format(alert.ends_at)}</time> ({timezone.replaceAll("_", " ")})
          </p>
        </div>
        <span className="rounded-full bg-cloud px-3 py-1 text-xs font-semibold text-ink">
          {attendanceAlertStatusLabels[alert.status]}
        </span>
      </div>
      {alert.status === "resolved" && alert.signal && (
        <p className="mt-3 text-sm text-muted">The last detected signal is shown above; the team resolved this alert.</p>
      )}
      {alert.status === "open" && (
        <form action={actOnAttendanceAlertAction} className="mt-4">
          <ContextFields businessId={businessId} venueId={venueId} />
          <input type="hidden" name="alert_id" value={alert.alert_id} />
          <input type="hidden" name="request_id" value={randomUUID()} />
          <input type="hidden" name="action" value="acknowledged" />
          <button type="submit" className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ocean">
            Acknowledge alert
          </button>
        </form>
      )}
      {alert.status !== "resolved" && (
        <form action={actOnAttendanceAlertAction} className="mt-4 space-y-2">
          <ContextFields businessId={businessId} venueId={venueId} />
          <input type="hidden" name="alert_id" value={alert.alert_id} />
          <input type="hidden" name="request_id" value={randomUUID()} />
          <input type="hidden" name="action" value="resolved" />
          <label htmlFor={`reason-${alert.alert_id}`} className="block text-sm font-semibold">Resolution reason</label>
          <textarea id={`reason-${alert.alert_id}`} name="reason" required maxLength={500} rows={2}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" />
          <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
            Resolve alert
          </button>
        </form>
      )}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-ocean">Review alert history</summary>
        <ol className="mt-3 space-y-3">
          {alert.history.map((event) => (
            <li key={event.id} className="border-l-2 border-line pl-3">
              <p>{attendanceAlertEventLabels[event.event_type]} ·{" "}
                <time dateTime={event.created_at}>{format(event.created_at)}</time>
              </p>
              <p className="mt-1 break-words text-xs text-muted">
                {event.actor_id ? `Manager ID: ${event.actor_id}` : "Automatic scan"}
                {event.new_signal ? ` · ${attendanceAlertSignalLabels[event.new_signal]}` : ""}
              </p>
              {event.reason && <p className="mt-1 break-words">Reason: {event.reason}</p>}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

export default async function AttendanceAlertsPage({ searchParams }: {
  searchParams: Promise<{ business?: string; venue?: string; error?: string; saved?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the attendance alerts workspace.", { message: workspace.message });
    return <main className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">Attendance alerts unavailable</h1>
      <p role="alert" className="mt-3 text-sm">Check your venue access and connection, then try again.</p>
      <Link href="/attendance" className="mt-4 inline-block text-ocean underline">Return to attendance</Link>
    </main>;
  }
  const attendanceUrl = withBusiness(`/attendance?venue=${encodeURIComponent(workspace.venue.id)}`, workspace.business.id);
  const shell = {
    businessName: workspace.business.name, businessId: workspace.business.id,
    businessCount: workspace.businesses.length, venueName: workspace.venue.name,
    email: workspace.user.email ?? "", role: workspace.membership.role,
  };
  if (!canManageAttendanceAlerts(workspace.membership.role)) {
    return <AppShell {...shell}>
      <h1 className="text-2xl font-semibold">Attendance alerts</h1>
      <p role="alert" className="mt-3 text-sm">Only managers with venue and department access can review alerts.</p>
      <Link href={attendanceUrl} className="mt-4 inline-block text-ocean underline">Return to attendance</Link>
    </AppShell>;
  }
  const [venueResult, settingResult, alertResult] = await Promise.all([
    readAllPages((from, to) => workspace.supabase.from("venues").select("id, name", { count: "exact" })
      .eq("business_id", workspace.business.id).order("name").order("id").range(from, to), (venue) => venue.id),
    workspace.supabase.rpc("get_attendance_alert_settings", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }),
    readAllPages<AttendanceAlert>((from, to) => workspace.supabase.rpc("list_attendance_alerts", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("updated_at", { ascending: false }).order("alert_id", { ascending: false })
      .range(from, to), (alert) => alert.alert_id),
  ]);
  const settings = parseAttendanceAlertSettings(settingResult.data);
  const alerts = parseAttendanceAlerts(alertResult.data);
  if (venueResult.error || settingResult.error || alertResult.error || !settings || !alerts) {
    console.error("Could not load attendance alerts.", {
      code: venueResult.error?.code ?? settingResult.error?.code ?? alertResult.error?.code,
      message: venueResult.error?.message ?? settingResult.error?.message ?? alertResult.error?.message ??
        "The server returned invalid alert data.",
    });
  }

  return <AppShell {...shell}>
    <Link href={attendanceUrl} className="text-sm font-semibold text-ocean underline">Back to attendance</Link>
    <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-3xl font-semibold">Attendance alerts</h1>
        <p className="mt-2 text-sm text-muted">Review published shifts for {workspace.venue.name} within your management scope.</p>
      </div>
      {venueResult.data && venueResult.data.length > 1 && <form action="/attendance/alerts" className="flex items-center gap-2">
        <input type="hidden" name="business" value={workspace.business.id} />
        <label htmlFor="alert-venue" className="text-sm text-muted">Venue</label>
        <select id="alert-venue" name="venue" defaultValue={workspace.venue.id}
          className="min-h-11 min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-sm">
          {venueResult.data.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
        </select>
        <button type="submit" className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold">Switch venue</button>
      </form>}
    </div>
    {venueResult.error && <p role="alert" className="mt-4 text-sm text-red-800">
      We couldn&apos;t load the venue selector. Refresh before switching venues.
    </p>}
    {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      {Object.hasOwn(errors, params.error) ? errors[params.error] : errors.save}
    </p>}
    {(params.saved === "settings" || params.saved === "acknowledged" || params.saved === "resolved") &&
      !params.error && <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
      {params.saved === "settings" ? "Attendance alert settings saved."
        : params.saved === "acknowledged" ? "Alert acknowledged." : "Alert resolved with its reason."}
    </p>}
    <section aria-labelledby="alert-monitoring" className="mt-6 rounded-xl border border-line bg-white p-5">
      <h2 id="alert-monitoring" className="text-lg font-semibold">Monitoring settings</h2>
      {settingResult.error || !settings ? <p role="alert" className="mt-3 text-sm text-red-800">
        We couldn&apos;t load monitoring settings. Refresh before relying on alerts.
      </p> : <>
        <p className={`mt-3 text-sm ${settings.scheduler_state === "stale" ? "font-semibold text-red-800" : "text-muted"}`}
          role={settings.scheduler_state === "stale" ? "alert" : undefined}>
          {settings.scheduler_state === "disabled" ? "Monitoring is off for this venue."
            : settings.scheduler_state === "stale" ? "Monitoring is enabled, but the latest scan is overdue or unavailable."
              : "Monitoring is enabled and a recent scan completed."}
        </p>
        {settings.last_completed_at && <p className="mt-1 text-xs text-muted">
          Latest completed scan: <time dateTime={settings.last_completed_at}>
            {new Date(settings.last_completed_at).toLocaleString("en-AU", { timeZone: workspace.venue.timezone })}
          </time> ({workspace.venue.timezone.replaceAll("_", " ")}).
        </p>}
        <p className="mt-2 text-sm text-muted">
          The grace period applies after shift start and end. A no-show signal means no qualifying clock-in
          was recorded by the longer threshold; it does not prove absence. Pending offline claims are not confirmed clocks.
        </p>
        {workspace.membership.role === "owner" ? <form action={saveAttendanceAlertSettingsAction}
          className="mt-4 grid gap-4 sm:grid-cols-3">
          <ContextFields businessId={workspace.business.id} venueId={workspace.venue.id} />
          <label className="text-sm font-semibold">Monitoring
            <select name="enabled" defaultValue={String(settings.enabled)}
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2">
              <option value="false">Off</option>
              <option value="true">On</option>
            </select>
          </label>
          <label className="text-sm font-semibold">Grace period (minutes)
            <input name="grace_minutes" type="number" min={0} max={240} step={1} required
              defaultValue={settings.grace_minutes} className="mt-1 min-h-11 w-full rounded-lg border border-line px-3 py-2" />
          </label>
          <label className="text-sm font-semibold">No-show threshold (minutes)
            <input name="no_show_minutes" type="number" min={1} max={1440} step={1} required
              defaultValue={settings.no_show_minutes} className="mt-1 min-h-11 w-full rounded-lg border border-line px-3 py-2" />
          </label>
          <div className="sm:col-span-3">
            <p className="text-xs text-muted">The no-show threshold must be longer than the grace period. Turning monitoring off stops new scans; existing alert history remains.</p>
            <button type="submit" className="mt-3 min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
              Save monitoring settings
            </button>
          </div>
        </form> : <p className="mt-3 text-sm text-muted">
          Grace: {settings.grace_minutes} minutes; no-show threshold: {settings.no_show_minutes} minutes. Only an owner can change these settings.
        </p>}
      </>}
    </section>
    <section aria-labelledby="alert-list" className="mt-6">
      <h2 id="alert-list" className="text-xl font-semibold">Alert review</h2>
      <p className="mt-2 text-sm text-muted">
        Acknowledgement is shared with the management team; individual notification read state is separate.
        Check the underlying attendance before resolving an alert.
      </p>
      {alertResult.error || !alerts ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
        We couldn&apos;t load alerts. Refresh and check your access before relying on this list.
      </p> : alerts.length === 0 ? <p className="mt-4 rounded-lg border border-line bg-white p-4 text-sm text-muted">
        No alerts have been recorded for your accessible departments.
      </p> : <div className="mt-4 space-y-4">
        {alerts.map((alert) => <AlertCard key={alert.alert_id} alert={alert}
          businessId={workspace.business.id} venueId={workspace.venue.id} timezone={workspace.venue.timezone} />)}
      </div>}
    </section>
  </AppShell>;
}
