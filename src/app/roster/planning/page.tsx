import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { withBusiness } from "@/lib/business-selection";
import { readAllPages } from "@/lib/paginated-rows";
import { isRosterPlanningDate, parseRosterPlanningPeriod, rosterWeekdays } from "@/lib/roster-planning";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { addDays, formatDay, formatTime, getVenueDate, getWeekStart, getWorkspace } from "@/lib/workspace";

type PlanningPageProps = {
  searchParams: Promise<{ business?: string; venue?: string; date?: string }>;
};

function planningHref(business: string, venue: string, date?: string) {
  const query = new URLSearchParams({ business, venue });
  if (date) query.set("date", date);
  return `/roster/planning?${query}`;
}

export default async function RosterPlanningPage({ searchParams }: PlanningPageProps) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the roster planning workspace.", { message: workspace.message });
    return (
      <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">Planning view unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-muted">
          We couldn&apos;t load the selected venue. Check your access and connection, then try again.
        </p>
        <Link href="/roster" className="mt-4 inline-block text-sm font-semibold text-ocean">Return to a roster</Link>
      </main>
    );
  }

  const date = params.date ?? getVenueDate(new Date().toISOString(), workspace.venue.timezone);
  const validDate = isRosterPlanningDate(date);
  const planningResult = validDate
    ? await workspace.supabase.rpc("get_roster_planning_period", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_date: date,
    })
    : null;
  const period = planningResult && !planningResult.error
    ? parseRosterPlanningPeriod(planningResult.data, date) : null;
  if (validDate && !period) {
    console.error("Could not load the roster planning period.", {
      code: planningResult?.error?.code,
      message: planningResult?.error?.message ?? "The server returned an invalid planning period.",
    });
  }
  const [shifts, employees, departments] = period ? await Promise.all([
    readAllPages((from, to) => workspace.supabase.from("shifts")
      .select("id, department_id, employee_id, role_title, starts_at, ends_at, is_published", { count: "exact" })
      .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id).eq("status", "scheduled")
      .gte("starts_at", period.start_at).lt("starts_at", period.end_at)
      .order("starts_at").order("id").range(from, to), (shift) => shift.id),
    readAllPages((from, to) => workspace.supabase.from("employees")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
      .eq("venue_id", workspace.venue.id).order("id").range(from, to), (employee) => employee.id),
    readAllPages((from, to) => workspace.supabase.from("departments")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
      .eq("venue_id", workspace.venue.id).order("id").range(from, to), (department) => department.id),
  ]) : [null, null, null];
  const loadError = shifts?.error ?? employees?.error ?? departments?.error;
  if (loadError) {
    console.error("Could not load roster planning shifts.", { code: loadError.code, message: loadError.message });
  }
  const employeeNames = new Map((employees?.data ?? []).map((employee) => [employee.id, employee.name]));
  const departmentNames = new Map((departments?.data ?? []).map((department) => [department.id, department.name]));
  const days = period
    ? Array.from({ length: Math.round((Date.parse(`${period.end_on}T00:00:00Z`)
      - Date.parse(`${period.start_on}T00:00:00Z`)) / 86400000) }, (_, index) => addDays(period.start_on, index))
    : [];
  const operationalWeeks = period
    ? [...new Set([getWeekStart(period.start_on, workspace.venue.timezone),
      getWeekStart(addDays(period.end_on, -1), workspace.venue.timezone)])]
    : [];

  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
      businessCount={workspace.businesses.length} venueId={workspace.venue.id} venueName={workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <p className="text-sm font-medium text-muted">Rostering</p>
      <h1 className="mt-2 text-3xl font-semibold">Venue planning view</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        This read-only view groups visible shifts by the venue&apos;s planning week in {workspace.venue.timezone}.
        Editing, approvals and publication still use Monday–Sunday operational weeks; payroll and
        historic publication records are unchanged.
      </p>
      <form action="/roster/planning" className="mt-5 flex flex-wrap items-end gap-3">
        <input type="hidden" name="business" value={workspace.business.id} />
        <input type="hidden" name="venue" value={workspace.venue.id} />
        <label className="text-sm">Date in planning period
          <input type="date" name="date" min="1900-01-08" max="9999-12-24"
            defaultValue={validDate ? date : ""} required
            className="mt-2 block rounded-lg border border-line bg-white p-3 text-ink" />
        </label>
        <button type="submit" className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold">
          Show planning period
        </button>
      </form>

      {!validDate ? (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">
          Choose a valid planning date from 1900-01-08 to 9999-12-24.
        </p>
      ) : !period ? (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">
          We couldn&apos;t load this planning period. Check your access and try again.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
            {isRosterPlanningDate(period.previous_on) ? (
              <Link href={planningHref(workspace.business.id, workspace.venue.id, period.previous_on)}
                className="inline-flex min-h-11 items-center font-semibold text-ocean underline">
                Previous planning period
              </Link>
            ) : <span className="text-sm text-muted">Start of supported dates</span>}
            <div className="text-center text-sm font-semibold">
              <time dateTime={period.start_on}>{period.start_on}</time>{" to "}
              <time dateTime={addDays(period.end_on, -1)}>{addDays(period.end_on, -1)}</time>
            </div>
            {isRosterPlanningDate(period.next_on) ? (
              <Link href={planningHref(workspace.business.id, workspace.venue.id, period.next_on)}
                className="inline-flex min-h-11 items-center font-semibold text-ocean underline">
                Next planning period
              </Link>
            ) : <span className="text-sm text-muted">End of supported dates</span>}
          </div>
          <p className="mt-3 text-sm text-muted">
            Planning starts on {rosterWeekdays[period.weekday - 1]}.
            {days.length < 7 && " This shorter transition period keeps every date in exactly one planning period."}
          </p>
          <section aria-label="Operational roster links" className="mt-5 rounded-xl border border-line bg-white p-4">
            <h2 className="font-semibold">Edit or publish in the operational roster</h2>
            <p className="mt-2 text-sm text-muted">A planning period can cover more than one Monday-based operational week.</p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {operationalWeeks.map((week) => (
                <li key={week}>
                  <Link href={withBusiness(`/roster?${new URLSearchParams({ venue: workspace.venue.id, week })}`, workspace.business.id)}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
                    Operational week from {week}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {loadError ? (
            <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">
              We couldn&apos;t load the shifts for this period. Try again.
            </p>
          ) : (
            <div className="mt-5 grid gap-3">
              {days.map((day) => {
                const dayShifts = (shifts?.data ?? []).filter((shift) =>
                  getVenueDate(shift.starts_at, workspace.venue.timezone) === day);
                return (
                  <section key={day} aria-label={`Shifts for ${day}`} className="rounded-xl border border-line bg-white p-4">
                    <h2 className="font-semibold"><time dateTime={day}>{formatDay(day)} ({day})</time></h2>
                    {dayShifts.length === 0 ? (
                      <p className="mt-2 text-sm text-muted">No visible shifts start on this date.</p>
                    ) : (
                      <ul className="mt-2 space-y-3">
                        {dayShifts.map((shift) => (
                          <li key={shift.id} className="break-words text-sm">
                            <strong>{shift.employee_id ? employeeNames.get(shift.employee_id) ?? "Team member"
                              : "Open shift"}</strong>
                            {" · "}{shift.role_title}{" · "}{departmentNames.get(shift.department_id) ?? "Department"}
                            {" · "}{formatTime(shift.starts_at, workspace.venue.timezone)}–{formatTime(shift.ends_at, workspace.venue.timezone)}
                            {getVenueDate(shift.ends_at, workspace.venue.timezone) !== day &&
                              ` (${getVenueDate(shift.ends_at, workspace.venue.timezone)})`}
                            {" · "}{shift.is_published ? "Published" : "Draft"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
