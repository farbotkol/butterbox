import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  clockInAction,
  clockOutAction,
  endAttendanceBreakAction,
  reviewAttendanceLocationAction,
  startAttendanceBreakAction,
  submitAttendanceCorrectionRequestAction,
} from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { AttendanceCorrectionHistory } from "@/components/attendance-correction-history";
import { ClockLocationForm } from "@/components/clock-location-form";
import { OfflineAttendance } from "@/components/offline-attendance";
import { OfflineClaimReview } from "@/components/offline-claim-review";
import { parseAttendanceState, parseClockOptions, type ClockOption } from "@/lib/attendance";
import { parseAttendanceCorrections, type AttendanceCorrection } from "@/lib/attendance-corrections";
import {
  locationReasonLabels, parseLocationExceptions, type LocationException,
} from "@/lib/attendance-location";
import {
  hasPriorAttendanceLink, offlineMatchKey, offlineWorkerKey, parseOfflineBreakResolutions, parseOfflineClaimReviews,
  parseOfflineMatchEvents, parseOfflineOpenBreaks, parseOfflineOpenSessions, parseSubmittedOfflineClaims,
  type OfflineBreakResolution, type OfflineClaimReview as OfflineClaimReviewRow, type OfflineMatchEvent,
  type OfflineOpenBreak, type OfflineOpenSession, type SubmittedOfflineClaim,
} from "@/lib/offline-attendance";
import { readAllPages } from "@/lib/paginated-rows";
import {
  parseTimesheetDecisions, timesheetApprovalLabels, type TimesheetDecision,
} from "@/lib/timesheet-approvals";
import { getWorkspace } from "@/lib/workspace";

type AttendancePageProps = {
  searchParams: Promise<{ business?: string; venue?: string; error?: string; saved?: string }>;
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
  "claim-invalid": "Choose a valid event and enter a reason of up to 500 characters.",
  "claim-reviewed": "This claim was already reviewed. Refresh and check its history.",
  "claim-pending": "This claim is already awaiting review.",
  "claim-permission": "Only an owner or general manager can reopen a claim.",
  "claim-match": "The matching finished clock event is unavailable. Refresh and check its scope.",
  "claim-stale": "Attendance changed. Refresh and review the current event time.",
  "claim-locked": "Attendance edits are locked. Ask an owner or general manager to unlock them.",
  "period-finalised": "This week's payroll period is finalised. An owner, admin or general manager must reopen it with a reason before attendance can change.",
  "claim-overlap": "The claimed time would overlap another attendance session.",
  "claim-time": "The claimed time must be in the past and different from the event. If it is already correct, match without changing it.",
  "claim-save": "We could not save the claim decision. Your access may have changed; refresh and try again.",
  "claim-timezone": "The venue timezone changed while you were working. Refresh and retry the attendance request.",
  "claim-pair-invalid": "Choose matching clock-in and clock-out claims, confirm the warning, and enter a reason.",
  "claim-pair-time": "The clock-out time must be after clock-in and in the past.",
  "claim-pair-used": "A claim was already reviewed or used to create attendance. Refresh and check its history.",
  "claim-open-invalid": "Choose an open session, confirm the warning, and enter a reason.",
  "claim-open-stale": "The matching open session is unavailable or has already ended. Refresh and review it.",
  "claim-open-break": "Resolve the recorded open break before completing this session.",
  "claim-open-order": "The claimed clock-out precedes another recorded event. Investigate before completing it.",
  "claim-break-invalid": "Enter a valid break end time, confirm the warning, and provide a reason.",
  "claim-break-nonexistent": "That local time did not exist when the clocks changed. Choose an actual time.",
  "claim-break-ambiguous": "That local time occurred twice. Choose its first or second occurrence.",
  "claim-break-stale": "The matching open break is unavailable. Refresh and review the current attendance.",
  "claim-break-time": "The reported break end must follow the start and not exceed the claimed clock-out.",
  "claim-break-overlap": "Another break is open or overlaps the reported break. Investigate before completing it.",
  "request-invalid": "Choose a clock, a valid local time and a reason of up to 500 characters.",
  "request-nonexistent": "That local time did not exist when the clocks changed. Choose an actual time.",
  "request-ambiguous": "That local time occurred twice. Choose its first or second occurrence.",
  "request-time": "The proposed time must be a valid time in the past.",
  "request-save": "We could not submit your request. Check your access and connection, then try again.",
  "request-mismatch": "The recorded event does not match the proposed time. Apply the correction or reject the request.",
};
const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
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
  const [venueResult, optionResult, stateResult, exceptionResult, offlineResult, reviewResult, matchResult, openResult,
    openBreakResult, breakResolutionResult, correctionResult, decisionResult] = await Promise.all([
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
    readAllPages<SubmittedOfflineClaim>((from, to) => workspace.supabase.rpc("list_attendance_offline_claims", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("received_at", { ascending: false }).order("id").range(from, to),
    (row) => row && typeof row.id === "string" ? row.id : ""),
    readAllPages<OfflineClaimReviewRow>((from, to) => workspace.supabase.rpc("list_attendance_offline_claim_reviews", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("sequence", { ascending: false }).order("id").range(from, to),
    (row) => row && typeof row.id === "string" ? row.id : ""),
    canReview
      ? readAllPages<OfflineMatchEvent>((from, to) => workspace.supabase.rpc("list_attendance_offline_match_events", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
      }, { count: "exact" }).order("effective_at", { ascending: false }).order("event_id").range(from, to),
      (row) => row && typeof row.event_id === "string" ? row.event_id : "")
      : Promise.resolve({ data: [], error: null }),
    canReview
      ? readAllPages<OfflineOpenSession>((from, to) => workspace.supabase.rpc("list_attendance_offline_open_sessions", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
      }, { count: "exact" }).order("clocked_in_at", { ascending: false }).order("session_id").range(from, to),
      (row) => row && typeof row.session_id === "string" ? row.session_id : "")
      : Promise.resolve({ data: [], error: null }),
    canReview
      ? readAllPages<OfflineOpenBreak>((from, to) => workspace.supabase.rpc("list_attendance_offline_open_breaks", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
      }, { count: "exact" }).order("started_at", { ascending: false }).order("break_id").range(from, to),
      (row) => row && typeof row.break_id === "string" ? row.break_id : "")
      : Promise.resolve({ data: [], error: null }),
    readAllPages<OfflineBreakResolution>((from, to) => workspace.supabase.rpc("list_attendance_offline_break_resolutions", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("created_at", { ascending: false }).order("id").range(from, to),
    (row) => row && typeof row.id === "string" ? row.id : ""),
    readAllPages<AttendanceCorrection>((from, to) => workspace.supabase.rpc("list_attendance_corrections", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("sequence", { ascending: false }).order("id").range(from, to),
    (row) => row && typeof row.id === "string" ? row.id : ""),
    readAllPages<TimesheetDecision>((from, to) => workspace.supabase.rpc("list_timesheet_decisions", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("decided_at", { ascending: false }).order("decision_id").range(from, to),
    (row) => row && typeof row.decision_id === "string" ? row.decision_id : ""),
  ]);
  const options = parseClockOptions(optionResult.data);
  const state = parseAttendanceState(stateResult.data);
  const exceptions = parseLocationExceptions(exceptionResult.data);
  const offlineClaims = parseSubmittedOfflineClaims(offlineResult.data);
  const claimReviews = parseOfflineClaimReviews(reviewResult.data);
  const matchEvents = parseOfflineMatchEvents(matchResult.data);
  const openSessions = parseOfflineOpenSessions(openResult.data);
  const openBreaks = parseOfflineOpenBreaks(openBreakResult.data);
  const breakResolutions = parseOfflineBreakResolutions(breakResolutionResult.data);
  const reviewsByClaim = new Map<string, OfflineClaimReviewRow[]>();
  const eventsByWorker = new Map<string, OfflineMatchEvent[]>();
  const pendingEndsByWorker = new Map<string, SubmittedOfflineClaim[]>();
  const openSessionsByWorker = new Map<string, OfflineOpenSession[]>();
  const openBreaksByWorker = new Map<string, OfflineOpenBreak[]>();
  const breakResolutionsByClaim = new Map<string, OfflineBreakResolution[]>();
  for (const review of claimReviews ?? []) {
    const history = reviewsByClaim.get(review.claim_id) ?? [];
    history.push(review);
    reviewsByClaim.set(review.claim_id, history);
  }
  for (const event of matchEvents ?? []) {
    const key = offlineMatchKey(event);
    const matches = eventsByWorker.get(key) ?? [];
    matches.push(event);
    eventsByWorker.set(key, matches);
  }
  for (const session of openSessions ?? []) {
    const key = offlineWorkerKey(session);
    const sessions = openSessionsByWorker.get(key) ?? [];
    sessions.push(session);
    openSessionsByWorker.set(key, sessions);
  }
  for (const item of openBreaks ?? []) {
    const key = offlineWorkerKey(item);
    const items = openBreaksByWorker.get(key) ?? [];
    items.push(item);
    openBreaksByWorker.set(key, items);
  }
  for (const resolution of breakResolutions ?? []) {
    const items = breakResolutionsByClaim.get(resolution.claim_id) ?? [];
    items.push(resolution);
    breakResolutionsByClaim.set(resolution.claim_id, items);
  }
  for (const claim of offlineClaims ?? []) {
    const history = reviewsByClaim.get(claim.id) ?? [];
    const latest = history[0];
    if (claim.event_type !== "clock_out" || hasPriorAttendanceLink(history) ||
      (latest && latest.decision !== "reopened")) continue;
    const key = offlineWorkerKey(claim);
    const ends = pendingEndsByWorker.get(key) ?? [];
    ends.push(claim);
    pendingEndsByWorker.set(key, ends);
  }
  const corrections = parseAttendanceCorrections(correctionResult.data);
  const timesheetDecisions = parseTimesheetDecisions(decisionResult.data);
  if (decisionResult.error || !timesheetDecisions) {
    console.error("Could not load timesheet decisions.", {
      code: decisionResult.error?.code,
      message: decisionResult.error?.message ?? "The server returned invalid timesheet decisions.",
    });
  }
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
  if (offlineResult.error || !offlineClaims) {
    console.error("Could not load offline attendance claims.", {
      code: offlineResult.error?.code,
      message: offlineResult.error?.message ?? "The server returned invalid offline attendance claims.",
    });
  }
  if (reviewResult.error || !claimReviews || matchResult.error || !matchEvents || openResult.error || !openSessions ||
    openBreakResult.error || !openBreaks || breakResolutionResult.error || !breakResolutions) {
    console.error("Could not load offline claim review details.", {
      code: reviewResult.error?.code ?? matchResult.error?.code ?? openResult.error?.code ??
        openBreakResult.error?.code ?? breakResolutionResult.error?.code,
      message: reviewResult.error?.message ?? matchResult.error?.message ?? openResult.error?.message ??
        openBreakResult.error?.message ?? breakResolutionResult.error?.message ??
        "The server returned invalid offline review details.",
    });
  }
  if (correctionResult.error || !corrections) {
    console.error("Could not load attendance corrections.", {
      code: correctionResult.error?.code,
      message: correctionResult.error?.message ?? "The server returned invalid attendance corrections.",
    });
  }

  const formatClockTime = (timestamp: string, timezone: string) =>
    new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone, day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit",
    }).format(new Date(timestamp));
  const optionValue = (option: ClockOption) => `${option.employee_id}:${option.department_id}`;
  const requestId = randomUUID();
  const claimDetailsUnavailable = offlineResult.error || !offlineClaims || reviewResult.error || !claimReviews ||
    matchResult.error || !matchEvents || openResult.error || !openSessions ||
    openBreakResult.error || !openBreaks || breakResolutionResult.error || !breakResolutions;
  const offlineOnly = offlineClaims?.filter((claim) => claim.claim_source === "offline") ?? [];
  const correctionRequests = offlineClaims?.filter((claim) => claim.claim_source === "employee_request") ?? [];
  const renderClaim = (claim: SubmittedOfflineClaim) => <OfflineClaimReview key={claim.id} claim={claim}
    reviews={reviewsByClaim.get(claim.id) ?? []} events={eventsByWorker.get(offlineMatchKey(claim)) ?? []}
    endClaims={pendingEndsByWorker.get(offlineWorkerKey(claim)) ?? []}
    openSessions={openSessionsByWorker.get(offlineWorkerKey(claim)) ?? []}
    openBreaks={openBreaksByWorker.get(offlineWorkerKey(claim)) ?? []}
    breakResolutions={breakResolutionsByClaim.get(claim.id) ?? []}
    venueId={workspace.venue.id} timezone={workspace.venue.timezone} canReview={canReview}
    canReopen={["owner", "admin", "general_manager"].includes(workspace.membership.role)} />;
  const breakRequestId = randomUUID();

  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length} venueName={workspace.venue.name}
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
      {params.saved === "claim-reviewed" && (
        <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
          Claim decision saved. Recorded time changes only when a correction was explicitly selected.
        </p>
      )}
      {params.saved === "claim-created" && (
        <p role="status" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          Attendance created from unverified reported times. Check any missing breaks before approval.
        </p>
      )}
      {params.saved === "claim-completed" && (
        <p role="status" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          Attendance completed with an unverified reported clock-out. Review recorded breaks before approval.
        </p>
      )}
      {params.saved === "claim-break-resolved" && (
        <p role="status" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          Manager-reported break end and unverified reported clock-out recorded with an audit trail.
        </p>
      )}
      {params.saved === "request-submitted" && (
        <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
          Your correction request was submitted for manager review. Recorded attendance has not changed.
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
      {!loadError && options && <OfflineAttendance
        key={`${workspace.user.id}:${workspace.business.id}:${workspace.venue.id}`}
        url={supabaseUrl}
        anonKey={supabaseAnonKey}
        actorId={workspace.user.id} businessId={workspace.business.id} venueId={workspace.venue.id}
        options={options}
      />}
      <section aria-label="Request an attendance correction" className="mt-6 rounded-xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Request a missed clock time</h2>
        <p className="mt-2 text-sm text-muted">
          Propose a time and explain what happened. It is not a verified clock event and does not change
          attendance unless a scoped manager approves it. Use the venue&apos;s local time in{" "}
          {workspace.venue.timezone.replaceAll("_", " ")}.
        </p>
        {loadError || !options ? <p role="alert" className="mt-3 text-sm text-red-800">
          We couldn&apos;t load your employee and department options. Refresh and try again.
        </p> : options.length === 0 ? <p className="mt-3 text-sm text-muted">
          No active employee profile is linked to your account at this venue. Ask an owner to check your access.
        </p> : <form action={submitAttendanceCorrectionRequestAction}
          aria-label="Submit correction request" className="mt-4 space-y-3 text-sm">
          <input type="hidden" name="venue_id" value={workspace.venue.id} />
          <input type="hidden" name="request_id" value={randomUUID()} />
          {options.length === 1 ? <>
            <input type="hidden" name="clock_option" value={optionValue(options[0])} />
            <p className="text-muted">{options[0].employee_name} · {options[0].department_name}</p>
          </> : <label className="block">
            Employee and department
            <select name="clock_option" required defaultValue=""
              className="mt-1 block w-full max-w-md rounded-lg border border-line bg-white p-2">
              <option value="" disabled>Choose your employee and department</option>
              {options.map((option) => <option key={optionValue(option)} value={optionValue(option)}>
                {option.employee_name} · {option.department_name}
              </option>)}
            </select>
          </label>}
          <label className="block">
            Missed clock
            <select name="event_type" required defaultValue=""
              className="mt-1 block w-full max-w-md rounded-lg border border-line bg-white p-2">
              <option value="" disabled>Choose clock in or clock out</option>
              <option value="clock_in">Clock in</option>
              <option value="clock_out">Clock out</option>
            </select>
          </label>
          <label className="block">
            Proposed time ({workspace.venue.timezone.replaceAll("_", " ")})
            <input type="datetime-local" name="proposed_local" step="0.001" required
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
            Reason for the request
            <textarea name="reason" required maxLength={500}
              className="mt-1 block w-full max-w-md rounded-lg border border-line p-2" />
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
            Submit correction request
          </button>
        </form>}
      </section>
      <section aria-label="Employee correction requests" className="mt-6 rounded-xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Employee correction requests</h2>
        <p className="mt-2 text-sm text-muted">
          Requests retain the employee&apos;s proposed time and reason. A manager can approve or reject with
          an explanation; the original clock events remain unchanged. A missing clock-in and clock-out
          can be paired with another reported time after both are checked.
        </p>
        {claimDetailsUnavailable ? <p role="alert" className="mt-3 text-sm text-red-800">
          We couldn&apos;t load correction requests and review details. Refresh and try again.
        </p> : correctionRequests.length === 0 ? <p className="mt-3 text-sm text-muted">
          No correction requests in your scope for this venue.
        </p> : <ul className="mt-4 space-y-3">{correctionRequests.map(renderClaim)}</ul>}
      </section>
      <section aria-label="Submitted offline attendance claims" className="mt-6 rounded-xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Submitted offline attendance claims</h2>
        <p className="mt-2 text-sm text-muted">
          These device-reported times are unverified and require manager review. They do not automatically
          change recorded attendance or calculated work time. Managers may match or correct a finished clock
          event, reject a claim, create a finished session from a matching pair, or complete an open session
          with a matching offline clock-out.
          Device times remain unverified and no breaks are assumed.
          Times are shown in {workspace.venue.timezone.replaceAll("_", " ")}.
        </p>
        {claimDetailsUnavailable ? (
          <p role="alert" className="mt-3 text-sm text-red-800">
            We couldn&apos;t load offline attendance claims and review details. Refresh and try again.
          </p>
        ) : offlineOnly.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No submitted claims in your scope for this venue.</p>
        ) : <ul className="mt-4 space-y-3">
          {offlineOnly.map(renderClaim)}
        </ul>}
      </section>
      <section aria-label="Timesheet decisions" className="mt-6 rounded-xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Timesheet decisions</h2>
        <p className="mt-2 text-sm text-muted">
          Department managers approve or return attended sessions. Returned entries show the reason so you can request a
          correction above.
        </p>
        {decisionResult.error || !timesheetDecisions ? <p role="alert" className="mt-3 text-sm text-red-800">
          We couldn&apos;t load timesheet decisions. Refresh and try again.
        </p> : timesheetDecisions.length === 0 ? <p className="mt-3 text-sm text-muted">
          No timesheet decisions in your scope for this venue.
        </p> : <ul className="mt-4 space-y-3">{timesheetDecisions.map((item) => <li key={item.decision_id}
          className="rounded-lg border border-line p-3 text-sm">
          <p className="font-semibold">{item.employee_name} · {item.department_name}</p>
          {item.clocked_in_at && <p className="mt-1 text-muted">Clocked in <time dateTime={item.clocked_in_at}>
            {formatClockTime(item.clocked_in_at, workspace.venue.timezone)}</time></p>}
          <p className="mt-1">{timesheetApprovalLabels[item.status]}</p>
          {item.reason && <p className="mt-1">
            {item.decision === "rejected" ? "Reason returned" : "Approval note"}: {item.reason}
          </p>}
          <p className="mt-1 text-muted">Decided <time dateTime={item.decided_at}>
            {formatClockTime(item.decided_at, workspace.venue.timezone)}</time></p>
        </li>)}</ul>}
      </section>
      <section aria-label="Attendance correction history" className="mt-6 rounded-xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Attendance correction history</h2>
        <p className="mt-2 text-sm text-muted">
          Corrections retain the original event, the previous and corrected times, the reason and the person who changed it.
        </p>
        {correctionResult.error || !corrections ? <p role="alert" className="mt-3 text-sm text-red-800">
          We couldn&apos;t load attendance corrections. Refresh and try again.
        </p> : <AttendanceCorrectionHistory corrections={corrections} timezone={workspace.venue.timezone} />}
      </section>
      <p className="mt-5 text-sm leading-6 text-muted">
        When enabled by the venue owner, location is requested only when clocking in or out.
        A failed location check is reviewed without removing the time recorded. Break events
        have no location check. Managers can see recorded breaks in work-time calculations;
        scoped managers can correct finished sessions without overwriting original events. Department
        managers approve or return timesheet entries on the Timesheets page, and no break is automatically deducted unless it has a
        recorded start and end.
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
