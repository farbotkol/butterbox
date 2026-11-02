import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { correctAttendanceEventAction, setAttendanceEditLockAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { AttendanceCorrectionHistory } from "@/components/attendance-correction-history";
import {
  correctionEventLabels, parseAttendanceCorrections, parseAttendanceEditLocks, parseCorrectionEvents,
  type AttendanceCorrection, type AttendanceEditLock, type CorrectionEvent,
} from "@/lib/attendance-corrections";
import { readAllPages } from "@/lib/paginated-rows";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { formatWorkedDuration, parseWorkedTime, workTimeExceptionLabels, type WorkedTime } from "@/lib/worked-time";
import { getWorkspace } from "@/lib/workspace";
import { withBusiness } from "@/lib/business-selection";

const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];
const errors: Record<string, string> = {
  "correction-invalid": "Enter a valid time and a reason of up to 500 characters.",
  "correction-nonexistent": "That local time did not exist when the clocks changed. Choose an actual time.",
  "correction-ambiguous": "That local time occurred twice. Choose its first or second occurrence.",
  "correction-time": "The corrected time must differ from the current time and cannot be in the future.",
  "correction-stale": "Attendance changed. Review the refreshed values before correcting again.",
  "correction-locked": "Attendance edits are locked. Ask an owner or general manager to unlock them.",
  "period-finalised": "This week's payroll period is finalised. An owner, admin or general manager must reopen it with a reason before attendance can change.",
  "correction-overlap": "The corrected attendance overlaps another session for this worker.",
  "correction-unfinished": "Only finished attendance sessions can be corrected.",
  "correction-venue": "The selected venue is unavailable. Check your access and try again.",
  "unlock-permission": "Only an owner or general manager can unlock attendance edits.",
  "lock-invalid": "Resolve incomplete or invalid attendance before locking it.",
  "lock-stale": "The edit lock has already changed. Refresh and review its current state.",
  "correction-save": "We couldn't save the attendance change. Your access may have changed; refresh and try again.",
};

function formatClockTime(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, timeZoneName: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

function duration(value: number | null): string {
  return value === null ? "Unavailable" : formatWorkedDuration(value);
}

export default async function WorkTimePage({ searchParams }: {
  searchParams: Promise<{ business?: string; venue?: string; error?: string; saved?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
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
  if (!managerRoles.includes(workspace.membership.role)) redirect(withBusiness("/?error=permission", workspace.business.id));

  const [venues, result, eventResult, historyResult, lockResult] = await Promise.all([
    readAllPages((from, to) => workspace.supabase.from("venues")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
      .order("name").order("id").range(from, to), (venue) => venue.id),
    readAllPages<WorkedTime>((from, to) => workspace.supabase.rpc("list_worked_time", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("clocked_in_at", { ascending: false, nullsFirst: true })
      .order("session_id").range(from, to), (row) => row && typeof row.session_id === "string" ? row.session_id : ""),
    readAllPages<CorrectionEvent>((from, to) => workspace.supabase.rpc("list_attendance_correction_events", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("session_id").order("original_at").order("event_id").range(from, to),
    (row) => row && typeof row.event_id === "string" ? row.event_id : ""),
    readAllPages<AttendanceCorrection>((from, to) => workspace.supabase.rpc("list_attendance_corrections", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("sequence", { ascending: false }).order("id").range(from, to),
    (row) => row && typeof row.id === "string" ? row.id : ""),
    readAllPages<AttendanceEditLock>((from, to) => workspace.supabase.rpc("list_attendance_edit_lock_history", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("sequence", { ascending: false }).order("id").range(from, to),
    (row) => row && typeof row.id === "string" ? row.id : ""),
  ]);
  const rows = parseWorkedTime(result.data);
  const events = parseCorrectionEvents(eventResult.data);
  const corrections = parseAttendanceCorrections(historyResult.data);
  const locks = parseAttendanceEditLocks(lockResult.data);
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
  if (eventResult.error || !events || historyResult.error || !corrections || lockResult.error || !locks) {
    console.error("Could not load attendance correction details.", {
      code: eventResult.error?.code ?? historyResult.error?.code ?? lockResult.error?.code,
      message: eventResult.error?.message ?? historyResult.error?.message ?? lockResult.error?.message ??
        "The server returned invalid correction details.",
    });
  }

  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length} venueName={workspace.venue.name}
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
        Calculations use the latest attributed corrections while preserving original event precision
        and are displayed to the nearest second. No payroll rounding, award rules or payroll approvals
        are applied. Times are shown in the venue&apos;s current timezone. Incomplete or invalid events
        have no calculated totals.
      </p>
      {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
        {Object.hasOwn(errors, params.error) ? errors[params.error] : errors["correction-save"]}
      </p>}
      {params.saved && ["correction", "locked", "unlocked"].includes(params.saved) &&
        <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
          {params.saved === "correction" ? "Attendance correction saved. The original event is unchanged."
            : params.saved === "locked" ? "Attendance edits locked. This is not a payroll approval."
              : "Attendance edits unlocked with a recorded reason."}
        </p>}
      {venues.error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          We couldn&apos;t load the venue list. Refresh and try again.
        </p>
      )}
      {(eventResult.error || !events || historyResult.error || !corrections || lockResult.error || !locks) &&
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          We couldn&apos;t load attendance correction details. Refresh before making changes.
        </p>}
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
            {rows.map((row) => {
              const sessionEvents = events?.filter((event) => event.session_id === row.session_id) ?? [];
              const sessionCorrections = corrections?.filter((correction) => correction.session_id === row.session_id) ?? [];
              const sessionLocks = locks?.filter((lock) => lock.session_id === row.session_id) ?? [];
              const session = sessionEvents[0];
              const lockStateConsistent = !session || session.locked === (sessionLocks[0]?.locked ?? false);
              const canUnlock = ["owner", "admin", "general_manager"].includes(workspace.membership.role);
              return (
              <li key={row.session_id} id={`attendance-session-${row.session_id}`}
                className="rounded-lg border border-line p-4 text-sm">
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
                {events && corrections && locks && <details className="mt-4 rounded-lg border border-line p-4">
                  <summary className="cursor-pointer font-semibold">Review and correct attendance</summary>
                  <p className="mt-3 text-muted">
                    Corrections are attributed additions; original events remain unchanged. Editing a time
                    does not add a missing clock or reconcile an offline claim. For a repeated local time,
                    choose the first or second occurrence. A time skipped by a clock change cannot be used.
                  </p>
                  {sessionCorrections.length > 0 && <>
                    <h4 className="mt-4 font-semibold">Correction history</h4>
                    <AttendanceCorrectionHistory corrections={sessionCorrections} timezone={row.venue_timezone} />
                  </>}
                  {sessionLocks.length > 0 && <div className="mt-4">
                    <h4 className="font-semibold">Edit lock history</h4>
                    <ul className="mt-2 space-y-2">
                      {sessionLocks.map((lock) => <li key={lock.id} className="rounded-lg border border-line p-3">
                        <p>{lock.locked ? "Locked" : "Unlocked"}: {lock.reason}</p>
                        <p className="mt-1 text-muted">Changed by user {lock.actor_id} at{" "}
                          <time dateTime={lock.created_at}>{formatClockTime(lock.created_at, row.venue_timezone)}</time>
                        </p>
                      </li>)}
                    </ul>
                  </div>}
                  {!session ? <p className="mt-3 text-muted">No original events are available to correct.</p> : <>
                    <p className="mt-4 font-semibold">Attendance edits: {session.locked ? "Locked" : "Unlocked"}</p>
                    {!lockStateConsistent ? <p role="alert" className="mt-2 text-red-800">
                      The edit lock changed while loading. Refresh before making changes.
                    </p> : <>
                    {!session.finished && <p className="mt-2 text-muted">Corrections are available after the session is finished.</p>}
                    {session.locked && !canUnlock && <p className="mt-2 text-muted">
                      Ask an owner or general manager to unlock attendance edits.
                    </p>}
                    {sessionEvents.map((event) => <div key={event.event_id} className="mt-4 rounded-lg border border-line p-3">
                      <p className="font-semibold">{correctionEventLabels[event.event_type]}
                        {event.classification && ` · ${event.classification} break`}
                      </p>
                      <p className="mt-1">Original: <time dateTime={event.original_at}>
                        {formatClockTime(event.original_at, row.venue_timezone)} ({event.original_at})
                      </time></p>
                      <p className="mt-1">Effective: <time dateTime={event.effective_at}>
                        {formatClockTime(event.effective_at, row.venue_timezone)} ({event.effective_at})
                      </time></p>
                      {session.finished && !session.locked && <form action={correctAttendanceEventAction}
                        aria-label={`Correct ${correctionEventLabels[event.event_type]}`} className="mt-3 space-y-3">
                        <input type="hidden" name="venue_id" value={workspace.venue.id} />
                        <input type="hidden" name="session_id" value={row.session_id} />
                        <input type="hidden" name="event_id" value={event.event_id} />
                        <input type="hidden" name="request_id" value={randomUUID()} />
                        <input type="hidden" name="expected_at" value={event.effective_at} />
                        <label className="block">
                          Corrected local time ({row.venue_timezone})
                          <input type="datetime-local" name="new_local_time" step="0.001" required
                            className="mt-1 block w-full max-w-sm rounded-lg border border-line p-2" />
                        </label>
                        <label className="block">
                          Additional microseconds (optional, 0 to 999)
                          <input type="number" name="additional_microseconds" min="0" max="999" step="1"
                            className="mt-1 block w-full max-w-sm rounded-lg border border-line p-2" />
                          <span className="mt-1 block text-muted">The final three digits after milliseconds.</span>
                        </label>
                        <label className="block">
                          If this time occurred twice
                          <select name="occurrence" defaultValue=""
                            className="mt-1 block w-full max-w-sm rounded-lg border border-line p-2">
                            <option value="">Not a repeated time / choose if needed</option>
                            <option value="earlier">First occurrence</option>
                            <option value="later">Second occurrence</option>
                          </select>
                        </label>
                        <label className="block">
                          Reason for correction
                          <textarea name="reason" required maxLength={500}
                            className="mt-1 block w-full max-w-sm rounded-lg border border-line p-2" />
                        </label>
                        <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
                          Save correction
                        </button>
                      </form>}
                    </div>)}
                    {session.finished && (!session.locked || canUnlock) &&
                      (session.locked || row.worked_seconds !== null) && <form action={setAttendanceEditLockAction}
                        aria-label={session.locked ? "Unlock attendance edits" : "Lock attendance edits"} className="mt-4 space-y-3">
                        <input type="hidden" name="venue_id" value={workspace.venue.id} />
                        <input type="hidden" name="session_id" value={row.session_id} />
                        <input type="hidden" name="request_id" value={randomUUID()} />
                        <input type="hidden" name="locked" value={session.locked ? "false" : "true"} />
                        <label className="block">
                          Reason to {session.locked ? "unlock" : "lock"} attendance edits
                          <textarea name="reason" required maxLength={500}
                            className="mt-1 block w-full max-w-sm rounded-lg border border-line p-2" />
                        </label>
                        <button type="submit" className="min-h-11 rounded-lg border border-line px-4 py-2 font-semibold">
                          {session.locked ? "Unlock attendance edits" : "Lock attendance edits"}
                        </button>
                        <p className="text-muted">Locking prevents corrections until an owner or general manager unlocks them; it is not payroll approval.</p>
                      </form>}
                    {session.finished && !session.locked && row.worked_seconds === null &&
                      <p className="mt-3 text-amber-900">Resolve incomplete or invalid attendance before locking edits.</p>}
                    </>}
                  </>}
                </details>}
              </li>
            );})}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
