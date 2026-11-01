import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  clockInAction,
  clockOutAction,
  endAttendanceBreakAction,
  reviewAttendanceLocationAction,
  startAttendanceBreakAction,
} from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { ClockLocationForm } from "@/components/clock-location-form";
import { parseAttendanceState, parseClockOptions, type ClockOption } from "@/lib/attendance";
import {
  locationReasonLabels, parseLocationExceptions, type LocationException,
} from "@/lib/attendance-location";
import { readAllPages } from "@/lib/paginated-rows";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

type AttendancePageProps = {
  searchParams: Promise<{ venue?: string; error?: string; saved?: string }>;
};

const errors: Record<string, string> = {
  "already-in": "An attendance session is already open for this account or linked staff profile. If you cannot see it, contact an owner.",
  "already-out": "This session is already finished. Check your current state before trying again.",
  "already-break": "A break is already running. End it before starting another.",
  "break-ended": "This break has already ended. Check your current state before trying again.",
  "break-open": "End your current break before clocking out.",
  invalid: "That attendance request was invalid. Refresh the page and try again.",
  permission: "Your employee link or venue access has changed. Contact an owner before clocking.",
  reused: "That request was already used for another action. Refresh the page and try again.",
  unavailable: "This profile or department is no longer available for a new session.",
  venue: "The selected venue is unavailable. Choose a venue you can access.",
  save: "We could not record the clock request. Check your connection and try again.",
  "review-invalid": "That location review request was invalid. Refresh the page and try again.",
  "review-save": "We could not save the location review. Your access may have changed; refresh the page and try again.",
};
const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the attendance workspace.", { message: workspace.message });
    return (
      <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">Attendance unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-muted">
          We couldn&apos;t load the selected venue. Check your access and connection, then try again.
        </p>
        <Link href="/attendance" className="mt-4 inline-block text-sm font-semibold text-ocean">
          Return to an available venue
        </Link>
      </main>
    );
  }

  const canReview = managerRoles.includes(workspace.membership.role);
  const [venueResult, optionResult, stateResult, exceptionResult] = await Promise.all([
    readAllPages((from, to) => workspace.supabase.from("venues")
      .select("id, name, clock_geofence_enabled", { count: "exact" }).eq("business_id", workspace.business.id)
      .order("name").order("id").range(from, to), (venue) => venue.id),
    readAllPages<ClockOption>((from, to) => workspace.supabase.rpc("list_my_clock_options", {
      p_business_id: workspace.business.id,
      p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("employee_id").order("department_id").range(from, to),
    (option) => option && typeof option.employee_id === "string" &&
      typeof option.department_id === "string" ? `${option.employee_id}:${option.department_id}` : ""),
    workspace.supabase.rpc("get_my_attendance_state_with_break", {
      p_business_id: workspace.business.id,
    }).single(),
    canReview
      ? readAllPages<LocationException>((from, to) => workspace.supabase.rpc("list_attendance_location_exceptions", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
      }, { count: "exact" }).order("occurred_at", { ascending: false }).order("check_id").range(from, to),
      (row) => row && typeof row.check_id === "string" ? row.check_id : "")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const options = parseClockOptions(optionResult.data);
  const state = parseAttendanceState(stateResult.data);
  const exceptions = parseLocationExceptions(exceptionResult.data);
  const clockVenueId = state?.state === "clocked_in" ? state.venue_id : workspace.venue.id;
  const clockVenue = venueResult.data?.find((venue) => venue.id === clockVenueId);
  const validClockPolicy = clockVenue && typeof clockVenue.clock_geofence_enabled === "boolean";
  const loadError = venueResult.error || optionResult.error || stateResult.error;
  if (loadError || !venueResult.data || !options || !state || !validClockPolicy) {
    console.error("Could not load attendance.", {
      code: loadError?.code,
      message: loadError?.message ?? "The server returned incomplete or invalid attendance data.",
    });
  }
  if (exceptionResult.error || !exceptions) {
    console.error("Could not load attendance location exceptions.", {
      code: exceptionResult.error?.code,
      message: exceptionResult.error?.message ?? "The server returned invalid location exceptions.",
    });
  }

  const formatClockTime = (timestamp: string, timezone: string) =>
    new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone, day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit",
    }).format(new Date(timestamp));
  const optionValue = (option: ClockOption) => `${option.employee_id}:${option.department_id}`;
  const requestId = randomUUID();
  const breakRequestId = randomUUID();

  return (
    <AppShell businessName={workspace.business.name} venueName={workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted">Your attendance</p>
          <h1 className="mt-2 text-3xl font-semibold">Clock in / out</h1>
          <p className="mt-2 text-sm text-muted">
            Your clock time is recorded by the server, not your device.
          </p>
        </div>
        {venueResult.data && venueResult.data.length > 1 && (
          <form action="/attendance" className="flex items-center gap-2">
            <label htmlFor="attendance-venue" className="text-sm text-muted">Venue</label>
            <select id="attendance-venue" name="venue" defaultValue={workspace.venue.id}
              className="rounded-lg border border-line bg-white p-2 text-sm">
              {venueResult.data.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">
              Switch venue
            </button>
          </form>
        )}
      </div>

      {params.error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {Object.hasOwn(errors, params.error) ? errors[params.error] : errors.save}
        </p>
      )}
      {params.saved === "recorded" && (
        <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
          Clock request recorded. Your current state is shown below.
        </p>
      )}
      {params.saved === "break-recorded" && (
        <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
          Break request recorded. Your current state is shown below.
        </p>
      )}
      {params.saved === "location-review" && (
        <p role="status" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          Clock request recorded. Your location could not be verified and is queued for manager review.
        </p>
      )}
      {params.saved === "location-historical" && (
        <p role="status" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          This earlier clock request was already recorded without a location check.
        </p>
      )}
      {params.saved === "location-reviewed" && (
        <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
          Location exception marked as reviewed. The original clock event is unchanged.
        </p>
      )}
      {loadError || !venueResult.data || !options || !state || !validClockPolicy ? (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          We couldn&apos;t load your attendance. Try again before making changes.
        </p>
      ) : (
        <section aria-label="Current attendance" className="mt-6 rounded-xl border border-line bg-white p-5 sm:p-6">
          {state.state === "needs_review" ? (
            <>
              <h2 className="text-lg font-semibold">Attendance needs review</h2>
              <p className="mt-2 text-sm text-muted">
                An earlier session is unavailable under your current access. Contact an owner for help.
              </p>
            </>
          ) : state.state === "clocked_in" ? (
            <>
              <h2 className="text-lg font-semibold text-ocean">Clocked in</h2>
              <p className="mt-2 text-sm text-muted">
                {state.venue_name} · {state.department_name}
              </p>
              <p className="mt-2 text-sm">
                Started <time dateTime={state.clocked_in_at}>
                  {formatClockTime(state.clocked_in_at, state.venue_timezone)}
                </time>{" "}({state.venue_timezone.replaceAll("_", " ")})
              </p>
              {state.active_break ? (
                <>
                  <p className="mt-4 text-sm font-semibold">
                    On {state.active_break.classification === "paid" ? "a paid" : "an unpaid"} break since{" "}
                    <time dateTime={state.active_break.started_at}>
                      {formatClockTime(state.active_break.started_at, state.venue_timezone)}
                    </time>
                  </p>
                  <p className="mt-2 text-sm text-muted">End this break before clocking out.</p>
                  <form action={endAttendanceBreakAction} className="mt-4">
                    <input type="hidden" name="venue_id" value={workspace.venue.id} />
                    <input type="hidden" name="session_id" value={state.session_id} />
                    <input type="hidden" name="break_id" value={state.active_break.id} />
                    <input type="hidden" name="request_id" value={breakRequestId} />
                    <button type="submit" className="min-h-11 rounded-lg bg-ocean px-5 py-3 font-semibold text-white hover:bg-ocean/90">
                      End break
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <form action={startAttendanceBreakAction} className="mt-5">
                    <input type="hidden" name="venue_id" value={workspace.venue.id} />
                    <input type="hidden" name="session_id" value={state.session_id} />
                    <input type="hidden" name="request_id" value={breakRequestId} />
                    <fieldset>
                      <legend className="text-sm font-semibold">Start a break</legend>
                      <p className="mt-1 text-sm text-muted">
                        Choose its paid or unpaid classification; ask your manager if unsure.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button type="submit" name="classification" value="paid"
                          className="min-h-11 rounded-lg border border-line px-4 py-3 text-sm font-semibold">
                          Start paid break
                        </button>
                        <button type="submit" name="classification" value="unpaid"
                          className="min-h-11 rounded-lg border border-line px-4 py-3 text-sm font-semibold">
                          Start unpaid break
                        </button>
                      </div>
                    </fieldset>
                  </form>
                  <ClockLocationForm action={clockOutAction} enabled={clockVenue.clock_geofence_enabled} className="mt-5">
                    <input type="hidden" name="venue_id" value={workspace.venue.id} />
                    <input type="hidden" name="session_id" value={state.session_id} />
                    <input type="hidden" name="request_id" value={requestId} />
                    <button type="submit" className="min-h-11 rounded-lg bg-ocean px-5 py-3 font-semibold text-white hover:bg-ocean/90">
                      Clock out
                    </button>
                  </ClockLocationForm>
                </>
              )}
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Clocked out</h2>
              {options.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  No active employee profile is linked to your account at this venue. Ask an owner to check your access.
                </p>
              ) : (
                <ClockLocationForm action={clockInAction} enabled={clockVenue.clock_geofence_enabled} className="mt-4">
                  <input type="hidden" name="venue_id" value={workspace.venue.id} />
                  <input type="hidden" name="request_id" value={requestId} />
                  {options.length === 1 ? (
                    <>
                      <input type="hidden" name="clock_option" value={optionValue(options[0])} />
                      <p className="text-sm text-muted">{options[0].employee_name} · {options[0].department_name} · {workspace.venue.name}</p>
                    </>
                  ) : (
                    <label className="block text-sm">
                      Employee and department
                      <select name="clock_option" required defaultValue=""
                        className="mt-2 block w-full max-w-md rounded-lg border border-line bg-white p-3">
                        <option value="" disabled>Choose your employee and department</option>
                        {options.map((option) => <option key={optionValue(option)} value={optionValue(option)}>
                          {option.employee_name} · {option.department_name}
                        </option>)}
                      </select>
                    </label>
                  )}
                  <button type="submit" className="mt-4 min-h-11 rounded-lg bg-ocean px-5 py-3 font-semibold text-white hover:bg-ocean/90">
                    Clock in
                  </button>
                </ClockLocationForm>
              )}
            </>
          )}
        </section>
      )}
      <p className="mt-5 text-sm leading-6 text-muted">
        When enabled by the venue owner, location is requested only when clocking in or out.
        A failed location check is reviewed without removing the time recorded. Break events
        have no location check. Managers can see recorded breaks in work-time calculations;
        corrections and timesheet approvals are not available yet, and no break is automatically
        deducted unless it has a recorded start and end.
      </p>
      {canReview && (
        <section aria-label="Location exceptions" className="mt-6 rounded-xl border border-line bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Location exceptions</h2>
          <p className="mt-2 text-sm text-muted">
            Only exceptions within your management scope are shown. Reviewing an exception does not alter recorded time.
          </p>
          {exceptionResult.error || !exceptions ? (
            <p role="alert" className="mt-3 text-sm text-red-800">We couldn&apos;t load location exceptions. Try again.</p>
          ) : exceptions.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No location exceptions for this venue.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {exceptions.map((exception) => (
                <li key={exception.check_id} className="rounded-lg border border-line p-4 text-sm">
                  <p className="font-semibold">{exception.employee_name} · {exception.department_name}</p>
                  <p className="mt-1 text-muted">
                    {exception.event_type === "clock_in" ? "Clock in" : "Clock out"} ·{" "}
                    <time dateTime={exception.occurred_at}>{formatClockTime(exception.occurred_at, workspace.venue.timezone)}</time>
                  </p>
                  <p className="mt-2">{locationReasonLabels[exception.reason]}</p>
                  {exception.distance_meters !== null && exception.accuracy_meters !== null && (
                    <p className="mt-1 text-muted">
                      Distance {exception.distance_meters.toFixed(1)} m; accuracy ±{exception.accuracy_meters.toFixed(1)} m;
                      venue radius {exception.radius_meters} m.
                    </p>
                  )}
                  {exception.reviewed_at ? (
                    <p className="mt-2 text-muted">
                      Reviewed by user {exception.reviewed_by} at{" "}
                      <time dateTime={exception.reviewed_at}>{formatClockTime(exception.reviewed_at, workspace.venue.timezone)}</time>
                    </p>
                  ) : (
                    <form action={reviewAttendanceLocationAction} className="mt-3">
                      <input type="hidden" name="venue_id" value={workspace.venue.id} />
                      <input type="hidden" name="check_id" value={exception.check_id} />
                      <button type="submit" className="min-h-11 rounded-lg border border-line px-4 py-2 font-semibold">
                        Mark as reviewed
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </AppShell>
  );
}
