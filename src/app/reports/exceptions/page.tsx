import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { withBusiness } from "@/lib/business-selection";
import { addDays, formatDay } from "@/lib/dates";
import {
  earliestExceptionsReportWeek, exceptionsReportWeek, parseExceptionsReport,
  parseWeeklyHoursThreshold, summariseExceptions,
} from "@/lib/exceptions-report";
import { helpHref } from "@/lib/help";
import { readAllPages } from "@/lib/paginated-rows";
import { rosterViewHref } from "@/lib/roster-view";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  parseTimesheetEmployeeFilter, parseTimesheetEmployees, type TimesheetEmployee,
} from "@/lib/weekly-timesheet";
import { formatWorkedDuration } from "@/lib/worked-time";
import { getWorkspace } from "@/lib/workspace";

const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];

function clockLabel(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, timeZoneName: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

export default async function ExceptionsReportPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const venueFilter = parseTimesheetEmployeeFilter(params.venue);
  const workspace = await getWorkspace(typeof venueFilter === "string" ? venueFilter : undefined, {
    businessId: params.business, page: true,
  });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the exceptions report workspace.", { message: workspace.message });
    return <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
      <h1 className="text-xl font-semibold">Exceptions report unavailable</h1>
      <p role="alert" className="mt-3 text-sm text-muted">
        The selected business or venue is unavailable. Check your access and try again.
      </p>
    </main>;
  }
  if (!managerRoles.includes(workspace.membership.role)) redirect(withBusiness("/?error=permission", workspace.business.id));

  const week = exceptionsReportWeek(params.week, workspace.venue.timezone);
  const threshold = parseWeeklyHoursThreshold(params.threshold);
  const validFilters = venueFilter !== undefined && week !== null && threshold !== undefined;
  const [venuesResult, reportResult] = await Promise.all([
    readAllPages<TimesheetEmployee>((from, to) => workspace.supabase.from("venues")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
      .order("name").order("id").range(from, to), (row) => row && typeof row.id === "string" ? row.id : ""),
    validFilters ? workspace.supabase.rpc("get_weekly_exceptions_report", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
    }) : Promise.resolve(null),
  ]);
  const venues = parseTimesheetEmployees(venuesResult.data);
  const report = validFilters && reportResult ? parseExceptionsReport(reportResult.data, {
    businessId: workspace.business.id, venueId: workspace.venue.id,
    venueTimezone: workspace.venue.timezone, week,
  }) : null;
  const summary = report && threshold !== undefined ? summariseExceptions(report, threshold) : null;
  const loadError = Boolean(venuesResult.error || !venues ||
    !venues?.some((row) => row.id === workspace.venue.id) ||
    reportResult?.error || (validFilters && (!report || !summary)));
  if (loadError) console.error("Could not load the exceptions report.", {
    code: venuesResult.error?.code ?? reportResult?.error?.code,
    message: venuesResult.error?.message ?? reportResult?.error?.message ?? "The server returned inconsistent report data.",
  });
  const shell = {
    businessName: workspace.business.name, businessId: workspace.business.id,
    businessCount: workspace.businesses.length, venueId: workspace.venue.id, venueName: workspace.venue.name,
    email: workspace.user.email ?? "", role: workspace.membership.role,
  };
  const control = "min-h-11 min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-sm";
  const timesheetHref = (employeeId: string, sessionId?: string) =>
    withBusiness(`/timesheets?${new URLSearchParams({
      venue: workspace.venue.id, week: week ?? "", employee: employeeId,
    })}${sessionId ? `#timesheet-session-${sessionId}` : ""}`, workspace.business.id);

  return <AppShell {...shell}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Overtime and exceptions</h1>
        <p className="mt-2 text-sm text-muted">Read-only operational indicators for the departments you manage in one venue.</p>
      </div>
      <Link href={helpHref("exceptions", workspace.business.id, workspace.venue.id)}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        How to use this report
      </Link>
    </div>
    <p className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">
      This report does not determine overtime pay or award breaches. An hours threshold is your own review aid,
      not a legal or payroll rule.
    </p>
    <form action="/reports/exceptions" aria-label="Exceptions report filters"
      className="mt-5 grid gap-4 rounded-xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="business" value={workspace.business.id} />
      <label className="grid gap-1 text-sm">Venue
        <select name="venue" defaultValue={workspace.venue.id} className={control}>
          {(venues ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Week containing
        <input type="date" name="week" min={earliestExceptionsReportWeek} max="9998-12-24"
          defaultValue={week ?? ""} className={control} required />
      </label>
      <label className="grid gap-1 text-sm">Optional weekly hours threshold
        <input type="number" name="threshold" min="0.01" max="1000" step="0.01"
          defaultValue={typeof params.threshold === "string" ? params.threshold : ""} className={control}
          aria-describedby="threshold-help" />
      </label>
      <button className="min-h-11 self-end rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
        Apply filters
      </button>
      <p id="threshold-help" className="text-xs text-muted sm:col-span-2 lg:col-span-4">
        Leave blank to skip hours-threshold evaluation. Enter 0.01 to 1,000 hours with at most two decimal places.
      </p>
    </form>
    {loadError ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
      We couldn&apos;t load a complete report. Check your connection and access, then try again.
    </p> : !validFilters ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
      Choose a valid venue and week between 6 January 1000 and 24 December 9998.
      The optional threshold must be 0.01 to 1,000 hours with at most two decimal places; use each filter once.
    </p> : summary && week && <>
      <h2 className="mt-6 text-lg font-semibold">Week {formatDay(week)} to {formatDay(addDays(week, 6))}</h2>
      <p className="mt-1 text-sm text-muted">
        Monday timesheet week in {workspace.venue.timezone}. Entries starting in the week count in full, even if they end later.
        Refresh after roster or attendance changes.
      </p>
      <dl aria-label="Exception totals" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Overlapping shifts", String(summary.overlaps.length)],
          ["Sessions missing a clock event", String(summary.missingClockEvents.length)],
          ["People above scheduled threshold", summary.hours === null ? "Not evaluated" : String(summary.hours.filter((row) => row.scheduledExceeds).length)],
          ["People above approved worked threshold", summary.hours === null ? "Not evaluated" : String(summary.hours.filter((row) => row.approvedWorkedExceeds).length)],
        ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-line bg-white p-4">
          <dt className="text-sm text-muted">{label}</dt><dd className="mt-2 font-semibold">{value}</dd>
        </div>)}
      </dl>
      <section aria-labelledby="overlapping-shifts" className="mt-6">
        <h2 id="overlapping-shifts" className="text-lg font-semibold">Overlapping shifts</h2>
        <p className="mt-1 text-sm text-muted">
          Counts affected assigned draft or published shifts, not conflict pairs. A conflicting shift may be outside your scope.
        </p>
        {summary.overlaps.length === 0 ? <p className="mt-3 text-sm">No overlapping shifts found in your scope.</p>
          : <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {summary.overlaps.map((row) => <li key={row.shift_id} className="min-w-0 rounded-xl border border-line bg-white p-4 text-sm">
              <h3 className="break-words font-semibold">{row.employee_name} · {row.department_name}</h3>
              <p className="mt-1">{row.is_published ? "Published" : "Draft"} shift</p>
              <p className="mt-1 break-words"><time dateTime={row.starts_at}>{clockLabel(row.starts_at, workspace.venue.timezone)}</time>
                {" "}to{" "}<time dateTime={row.ends_at}>{clockLabel(row.ends_at, workspace.venue.timezone)}</time></p>
              <Link href={`${rosterViewHref(week, row.department_id, [],
                workspace.venue.id, undefined, workspace.business.id)}#roster-shift-${row.shift_id}`}
              className="mt-2 inline-flex min-h-11 items-center font-semibold text-ocean underline">
                Review source roster
              </Link>
            </li>)}
          </ul>}
      </section>
      <section aria-labelledby="missing-clock-events" className="mt-6">
        <h2 id="missing-clock-events" className="text-lg font-semibold">Missing clock events</h2>
        <p className="mt-1 text-sm text-muted">
          Open sessions may be normal while someone is working. Shifts with no attendance session cannot be matched here.
        </p>
        {summary.missingClockEvents.length === 0 ? <p className="mt-3 text-sm">No missing clock events found in existing sessions.</p>
          : <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {summary.missingClockEvents.map((row) => <li key={row.session_id} className="min-w-0 rounded-xl border border-line bg-white p-4 text-sm">
              <h3 className="break-words font-semibold">{row.employee_name} · {row.department_name}</h3>
              <p className="mt-1">Clock in: {row.clocked_in_at ? clockLabel(row.clocked_in_at, row.venue_timezone) : "Missing"}</p>
              <p className="mt-1">Clock out: {row.clocked_out_at ? clockLabel(row.clocked_out_at, row.venue_timezone) : "Missing"}</p>
              <Link href={timesheetHref(row.employee_id, row.session_id)}
                className="mt-2 inline-flex min-h-11 items-center font-semibold text-ocean underline">
                Review source timesheet
              </Link>
            </li>)}
          </ul>}
      </section>
      <section aria-labelledby="weekly-hours" className="mt-6">
        <h2 id="weekly-hours" className="text-lg font-semibold">Weekly hours threshold</h2>
        <p className="mt-1 text-sm text-muted">
          Scheduled and approved worked hours are evaluated separately for each employee in the visible departments of this venue.
          Other venues and unmanaged departments are not included. {summary.excludedEntries} non-approved entries are excluded from worked hours.
        </p>
        {summary.hours === null ? <p className="mt-3 text-sm">Not evaluated: enter an optional threshold to compare hours.</p>
          : summary.hours.length === 0 ? <p className="mt-3 text-sm">No employee exceeds the selected threshold in this scope.</p>
            : <ul className="mt-3 grid gap-3 lg:grid-cols-2">
              {summary.hours.map((row) => <li key={row.employeeId} className="min-w-0 rounded-xl border border-line bg-white p-4 text-sm">
                <h3 className="break-words font-semibold">{row.employeeName}</h3>
                <p className="mt-1">Scheduled: {formatWorkedDuration(row.scheduledSeconds)}
                  {row.scheduledExceeds ? " · Above threshold" : ""}</p>
                <p className="mt-1">Approved worked: {formatWorkedDuration(row.approvedWorkedSeconds)}
                  {row.approvedWorkedExceeds ? " · Above threshold" : ""}</p>
                <div className="mt-2 flex flex-wrap gap-x-5">
                  <Link href={rosterViewHref(week, "all", [], workspace.venue.id, undefined, workspace.business.id)}
                    className="inline-flex min-h-11 items-center font-semibold text-ocean underline">Review source roster</Link>
                  <Link href={timesheetHref(row.employeeId)}
                    className="inline-flex min-h-11 items-center font-semibold text-ocean underline">Review source timesheets</Link>
                </div>
              </li>)}
            </ul>}
      </section>
      <section aria-labelledby="report-limitations" className="mt-6 rounded-xl border border-line bg-white p-5">
        <h2 id="report-limitations" className="text-lg font-semibold">Definitions and limitations</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Scheduled hours include full elapsed time of published, assigned, scheduled shifts without deducting planned breaks. Draft and cancelled shifts are excluded from this total.</li>
          <li>Approved worked hours subtract all recorded breaks and include only current approved sessions with valid calculations. Pending, returned, resubmitted and outdated approvals are excluded.</li>
          <li>Threshold comparisons are strictly greater than your chosen value and use exact durations; displayed durations are rounded to the nearest second.</li>
          <li>This is not a payroll calculation or compliance assessment. It does not apply awards, penalties, rates or statutory overtime rules.</li>
        </ul>
      </section>
    </>}
  </AppShell>;
}
