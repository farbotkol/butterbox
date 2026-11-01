import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { correctionEventLabels } from "@/lib/attendance-corrections";
import { addDays, formatDay } from "@/lib/dates";
import { readAllPages } from "@/lib/paginated-rows";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  groupWeeklyTimesheets, parseTimesheetEmployeeFilter, parseTimesheetEmployees, parseTimesheetPlannedShifts,
  parseTimesheetSourceEvents, timesheetEmployeeOptions, timesheetSourcesMatch, timesheetWeek, weeklyTimesheetNotices,
  type TimesheetEmployee, type TimesheetPlannedShift, type TimesheetSourceEvent,
} from "@/lib/weekly-timesheet";
import { formatWorkedDuration, parseWorkedTime, workTimeExceptionLabels, type WorkedTime } from "@/lib/worked-time";
import { getWorkspace } from "@/lib/workspace";

const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];
const sourceLabels: Record<TimesheetSourceEvent["source"], string> = {
  server_clock: "Server clock event",
  offline_claim: "Unverified offline claim",
  manager_reported: "Manager-reported break end",
};

function formatClockTime(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, timeZoneName: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

function totalDuration(values: number[]): string {
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number.isSafeInteger(Math.round(total * 1_000_000)) ? formatWorkedDuration(total) : "Unavailable";
}

export default async function TimesheetsPage({ searchParams }: {
  searchParams: Promise<{ venue?: string; week?: string; employee?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the timesheet workspace.", { message: workspace.message });
    return <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
      <h1 className="text-xl font-semibold">Timesheets unavailable</h1>
      <p role="alert" className="mt-3 text-sm text-muted">
        We couldn&apos;t load the selected venue. Check your access and connection, then try again.
      </p>
      <Link href="/timesheets" className="mt-4 inline-block text-sm font-semibold text-ocean">
        Return to an available venue
      </Link>
    </main>;
  }
  if (!managerRoles.includes(workspace.membership.role)) redirect("/?error=permission");

  const week = timesheetWeek(params.week, workspace.venue.timezone);
  const employee = parseTimesheetEmployeeFilter(params.employee);
  const validFilters = week !== null && employee !== undefined;
  const [venuesResult, employeesResult, plannedResult, actualResult, eventsResult] = await Promise.all([
    readAllPages<TimesheetEmployee>((from, to) => workspace.supabase.from("venues")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
      .order("name").order("id").range(from, to), (row) => row && typeof row.id === "string" ? row.id : ""),
    readAllPages<TimesheetEmployee>((from, to) => workspace.supabase.from("employees")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
      .eq("venue_id", workspace.venue.id).order("name").order("id").range(from, to),
    (row) => row && typeof row.id === "string" ? row.id : ""),
    validFilters
      ? readAllPages<TimesheetPlannedShift>((from, to) => workspace.supabase.rpc("list_weekly_planned_shifts", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week, p_employee_id: employee,
      }, { count: "exact" }).order("starts_at").order("shift_id").range(from, to),
      (row) => row && typeof row.shift_id === "string" ? row.shift_id : "")
      : Promise.resolve({ data: [], error: null }),
    validFilters
      ? readAllPages<WorkedTime>((from, to) => workspace.supabase.rpc("list_weekly_worked_time", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week, p_employee_id: employee,
      }, { count: "exact" }).order("clocked_in_at", { nullsFirst: true }).order("session_id").range(from, to),
      (row) => row && typeof row.session_id === "string" ? row.session_id : "")
      : Promise.resolve({ data: [], error: null }),
    validFilters
      ? readAllPages<TimesheetSourceEvent>((from, to) => workspace.supabase.rpc("list_weekly_timesheet_events", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week, p_employee_id: employee,
      }, { count: "exact" }).order("session_id").order("original_at").order("event_id").range(from, to),
      (row) => row && typeof row.event_id === "string" ? row.event_id : "")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const venues = parseTimesheetEmployees(venuesResult.data);
  const currentEmployees = parseTimesheetEmployees(employeesResult.data);
  const planned = parseTimesheetPlannedShifts(plannedResult.data);
  const actual = parseWorkedTime(actualResult.data);
  const events = parseTimesheetSourceEvents(eventsResult.data);
  const employees = currentEmployees && planned && actual
    ? timesheetEmployeeOptions(currentEmployees, planned, actual) : null;
  const employeeAvailable = employee === null || (employee !== undefined &&
    employees?.some((item) => item.id.toLowerCase() === employee.toLowerCase()));
  const groups = planned && actual ? groupWeeklyTimesheets(planned, actual) : null;
  const eventsConsistent = actual && events && timesheetSourcesMatch(actual, events);
  const dataError = Boolean(venuesResult.error || employeesResult.error || plannedResult.error || actualResult.error ||
    eventsResult.error || !venues || !employees || !planned || !actual || !events || !groups || !eventsConsistent);
  if (dataError) {
    console.error("Could not load the weekly timesheet.", {
      code: venuesResult.error?.code ?? employeesResult.error?.code ?? plannedResult.error?.code ??
        actualResult.error?.code ?? eventsResult.error?.code,
      message: venuesResult.error?.message ?? employeesResult.error?.message ?? plannedResult.error?.message ??
        actualResult.error?.message ?? eventsResult.error?.message ?? "The server returned inconsistent timesheet data.",
    });
  }

  return <AppShell businessName={workspace.business.name} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <div>
      <p className="text-sm font-medium text-muted">Attendance</p>
      <h1 className="mt-2 text-3xl font-semibold">Weekly timesheet review</h1>
      <p className="mt-2 text-sm text-muted">Compare published shifts with recorded attendance in your permitted departments.</p>
    </div>
    <form action="/timesheets" className="mt-5 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-4 sm:items-end">
      <div>
        <label htmlFor="timesheet-venue" className="block text-sm">Venue</label>
        <select id="timesheet-venue" name="venue" defaultValue={workspace.venue.id}
          className="mt-1 block w-full rounded-lg border border-line bg-white p-2 text-sm">
          {(venues ?? []).map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="timesheet-week" className="block text-sm">Week containing date</label>
        <input id="timesheet-week" type="date" name="week" defaultValue={week ?? ""}
          className="mt-1 block w-full rounded-lg border border-line bg-white p-2 text-sm" />
      </div>
      <div>
        <label htmlFor="timesheet-employee" className="block text-sm">Employee</label>
        <select id="timesheet-employee" name="employee" defaultValue={employeeAvailable && employee ? employee : ""}
          className="mt-1 block w-full rounded-lg border border-line bg-white p-2 text-sm">
          <option value="">All employees</option>
          {(employees ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">
        Apply filters
      </button>
    </form>
    <p className="mt-4 text-sm leading-6 text-muted">
      Weeks use the venue&apos;s current timezone. A published shift belongs to the week it starts; a session
      belongs to the week of its corrected clock-in, or its clock-out or creation time if clock-in is missing.
      Overnight records are not split between weeks. Scheduled span is before planned breaks and is compared
      with recorded elapsed time, not paid time. Matching totals do not pair shifts with sessions or approve payroll.
    </p>
    {!validFilters && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      Enter a valid date and choose an available employee before reviewing this week.
    </p>}
    {validFilters && !employeeAvailable && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      The selected employee is unavailable in this venue or your scope. Choose another employee or all employees.
    </p>}
    {dataError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      We couldn&apos;t load a consistent timesheet. Refresh and check your access before reviewing it.
    </p>}
    {week && <h2 className="mt-6 text-lg font-semibold">
      {formatDay(week)} to {formatDay(addDays(week, 6))} · {workspace.venue.timezone}
    </h2>}
    {validFilters && employeeAvailable && !dataError && groups && (
      <section aria-label="Weekly planned and actual time" className="mt-4">
        {groups.length === 0 ? <p className="rounded-xl border border-line bg-white p-5 text-sm text-muted">
          No published shifts or attendance sessions in your scope for these filters.
        </p> : <ul className="space-y-4">
          {groups.map((group) => {
            const notices = weeklyTimesheetNotices(group);
            const complete = group.actual.filter((row) => row.elapsed_seconds !== null);
            return <li key={`${group.employeeId}:${group.departmentId}`} className="rounded-xl border border-line bg-white p-5 text-sm">
              <h3 className="text-base font-semibold">{group.employeeName} · {group.departmentName}</h3>
              <p className="mt-2 text-muted">
                Scheduled span: {totalDuration(group.planned.map((row) => row.scheduled_seconds))} ·{" "}
                Recorded elapsed: {totalDuration(complete.map((row) => row.elapsed_seconds ?? 0))}
              </p>
              <ul aria-label="Review notices" className="mt-3 space-y-1 text-amber-900">
                {notices.map((notice) => <li key={notice}>{notice}</li>)}
              </ul>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <h4 className="font-semibold">Published shifts</h4>
                  {group.planned.length === 0 ? <p className="mt-2 text-muted">None in this week.</p>
                    : <ul className="mt-2 space-y-2">
                      {group.planned.map((shift) => <li key={shift.shift_id} className="rounded-lg border border-line p-3">
                        <p><time dateTime={shift.starts_at}>{formatClockTime(shift.starts_at, workspace.venue.timezone)}</time>
                          {" "}to{" "}<time dateTime={shift.ends_at}>{formatClockTime(shift.ends_at, workspace.venue.timezone)}</time>
                        </p>
                        <p className="mt-1 text-muted">Scheduled span {formatWorkedDuration(shift.scheduled_seconds)} ·{" "}
                          planned break {shift.break_minutes} min, classification not specified
                        </p>
                      </li>)}
                    </ul>}
                </div>
                <div>
                  <h4 className="font-semibold">Attendance sessions</h4>
                  {group.actual.length === 0 ? <p className="mt-2 text-muted">None in this week.</p>
                    : <ul className="mt-2 space-y-2">
                      {group.actual.map((row) => {
                        const sessionEvents = events?.filter((event) => event.session_id === row.session_id) ?? [];
                        const workTimeHref = `/work-time?${new URLSearchParams({ venue: workspace.venue.id })}` +
                          `#attendance-session-${row.session_id}`;
                        return <li key={row.session_id} id={`timesheet-session-${row.session_id}`}
                          className="rounded-lg border border-line p-3">
                          <p>Clock in: {row.clocked_in_at
                            ? <time dateTime={row.clocked_in_at}>{formatClockTime(row.clocked_in_at, row.venue_timezone)}</time>
                            : "Missing"}</p>
                          <p className="mt-1">Clock out: {row.clocked_out_at
                            ? <time dateTime={row.clocked_out_at}>{formatClockTime(row.clocked_out_at, row.venue_timezone)}</time>
                            : "Missing"}</p>
                          <p className="mt-1 text-muted">Elapsed: {row.elapsed_seconds === null
                            ? "Unavailable" : formatWorkedDuration(row.elapsed_seconds)} · Paid: {row.paid_seconds === null
                              ? "Unavailable" : formatWorkedDuration(row.paid_seconds)}</p>
                          {row.exceptions.length > 0 && <p className="mt-2 text-amber-900">
                            Exceptions: {row.exceptions.map((exception) => workTimeExceptionLabels[exception]).join("; ")}
                          </p>}
                          <details className="mt-3">
                            <summary className="cursor-pointer font-semibold">Inspect source events</summary>
                            {sessionEvents.length === 0 ? <p className="mt-2 text-muted">No original events are available.</p>
                              : <ul className="mt-2 space-y-2">
                                {sessionEvents.map((event) => <li key={event.event_id} className="rounded-lg border border-line p-2">
                                  <p className="font-semibold">{correctionEventLabels[event.event_type]}
                                    {event.classification && ` · ${event.classification} break`} · {sourceLabels[event.source]}
                                  </p>
                                  <p className="mt-1">Original: {event.original_at}</p>
                                  <p className="mt-1">Effective: {event.effective_at}</p>
                                </li>)}
                              </ul>}
                            <Link href={workTimeHref} className="mt-3 inline-block font-semibold text-ocean">
                              Open correction and edit-lock history
                            </Link>
                          </details>
                        </li>;
                      })}
                    </ul>}
                </div>
              </div>
            </li>;
          })}
        </ul>}
      </section>
    )}
  </AppShell>;
}
