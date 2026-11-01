import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { readAllPages } from "@/lib/paginated-rows";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { formatWorkedDuration, parseWorkedTime, workTimeExceptionLabels, type WorkedTime } from "@/lib/worked-time";
import { getWorkspace } from "@/lib/workspace";

const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];

function formatClockTime(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, timeZoneName: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

function duration(value: number | null): string {
  return value === null ? "Unavailable" : formatWorkedDuration(value);
}

export default async function WorkTimePage({ searchParams }: { searchParams: Promise<{ venue?: string }> }) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the work-time workspace.", { message: workspace.message });
    return (
      <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">Work time unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-muted">
          We couldn&apos;t load the selected venue. Check your access and connection, then try again.
        </p>
        <Link href="/work-time" className="mt-4 inline-block text-sm font-semibold text-ocean">
          Return to an available venue
        </Link>
      </main>
    );
  }
  if (!managerRoles.includes(workspace.membership.role)) redirect("/?error=permission");

  const [venues, result] = await Promise.all([
    readAllPages((from, to) => workspace.supabase.from("venues")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
      .order("name").order("id").range(from, to), (venue) => venue.id),
    readAllPages<WorkedTime>((from, to) => workspace.supabase.rpc("list_worked_time", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("clocked_in_at", { ascending: false, nullsFirst: true })
      .order("session_id").range(from, to), (row) => row && typeof row.session_id === "string" ? row.session_id : ""),
  ]);
  const rows = parseWorkedTime(result.data);
  if (venues.error || !venues.data) {
    console.error("Could not load work-time venues.", {
      code: venues.error?.code, message: venues.error?.message ?? "The server returned incomplete venue data.",
    });
  }
  if (result.error || !rows) {
    console.error("Could not load worked time.", {
      code: result.error?.code, message: result.error?.message ?? "The server returned invalid work-time data.",
    });
  }

  return (
    <AppShell businessName={workspace.business.name} venueName={workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted">Attendance</p>
          <h1 className="mt-2 text-3xl font-semibold">Work time</h1>
          <p className="mt-2 text-sm text-muted">
            Recorded sessions in your permitted departments at this venue.
          </p>
        </div>
        {venues.data && venues.data.length > 1 && (
          <form action="/work-time" className="flex items-center gap-2">
            <label htmlFor="work-time-venue" className="text-sm text-muted">Venue</label>
            <select id="work-time-venue" name="venue" defaultValue={workspace.venue.id}
              className="rounded-lg border border-line bg-white p-2 text-sm">
              {venues.data.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">
              Switch venue
            </button>
          </form>
        )}
      </div>
      <p className="mt-5 text-sm leading-6 text-muted">
        Worked time excludes recorded paid and unpaid breaks; paid time includes paid breaks.
        Calculations preserve the original event precision and are displayed to the nearest second.
        No payroll rounding, award rules, corrections or approvals are applied. Times are shown in
        the venue&apos;s current timezone. Incomplete or invalid events have no calculated totals.
      </p>
      {venues.error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          We couldn&apos;t load the venue list. Refresh and try again.
        </p>
      )}
      <section aria-label="Recorded work time" className="mt-6 rounded-xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Recorded work time</h2>
        {result.error || !rows ? (
          <p role="alert" className="mt-3 text-sm text-red-800">
            We couldn&apos;t load work-time calculations. Refresh and try again.
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No attendance sessions in your scope for this venue.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {rows.map((row) => (
              <li key={row.session_id} className="rounded-lg border border-line p-4 text-sm">
                <h3 className="font-semibold">{row.employee_name} · {row.department_name}</h3>
                <p className="mt-1 text-muted">{row.venue_name} · {row.venue_timezone}</p>
                <p className="mt-2">
                  Clock in: {row.clocked_in_at
                    ? <time dateTime={row.clocked_in_at}>{formatClockTime(row.clocked_in_at, row.venue_timezone)}</time>
                    : "Missing"}
                </p>
                <p className="mt-1">
                  Clock out: {row.clocked_out_at
                    ? <time dateTime={row.clocked_out_at}>{formatClockTime(row.clocked_out_at, row.venue_timezone)}</time>
                    : "Missing"}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div><dt className="text-muted">Elapsed</dt><dd className="font-semibold">{duration(row.elapsed_seconds)}</dd></div>
                  <div><dt className="text-muted">Worked</dt><dd className="font-semibold">{duration(row.worked_seconds)}</dd></div>
                  <div><dt className="text-muted">Paid time</dt><dd className="font-semibold">{duration(row.paid_seconds)}</dd></div>
                  <div><dt className="text-muted">Paid break</dt><dd className="font-semibold">{duration(row.paid_break_seconds)}</dd></div>
                  <div><dt className="text-muted">Unpaid break</dt><dd className="font-semibold">{duration(row.unpaid_break_seconds)}</dd></div>
                </dl>
                <p className={`mt-3 ${row.exceptions.length ? "text-amber-900" : "text-muted"}`}>
                  {row.exceptions.length
                    ? `Exceptions: ${row.exceptions.map((exception) => workTimeExceptionLabels[exception]).join("; ")}`
                    : "No exceptions"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
