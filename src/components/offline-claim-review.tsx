import { randomUUID } from "node:crypto";
import {
  completeAttendanceFromOfflineClaimAction, completeAttendanceWithOfflineBreakAction,
  createAttendanceFromOfflineClaimsAction, reviewOfflineAttendanceClaimAction,
} from "@/app/actions";
import {
  hasPriorAttendanceLink, type OfflineBreakResolution, type OfflineClaimReview, type OfflineMatchEvent,
  type OfflineOpenBreak, type OfflineOpenSession, type SubmittedOfflineClaim,
} from "@/lib/offline-attendance";

const decisionLabels: Record<OfflineClaimReview["decision"], string> = {
  matched: "Matched to an existing event without changing its time",
  corrected: "Existing event corrected to the claimed time",
  rejected: "Rejected",
  reopened: "Reopened for review",
  created: "Attendance created from unverified offline claims",
  completed: "Open attendance completed with an unverified offline clock-out",
};

function formatTime(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

export function OfflineClaimReview({
  claim, reviews, events, endClaims, openSessions, openBreaks, breakResolutions,
  venueId, timezone, canReview, canReopen,
}: {
  claim: SubmittedOfflineClaim; reviews: OfflineClaimReview[]; events: OfflineMatchEvent[];
  endClaims: SubmittedOfflineClaim[]; openSessions: OfflineOpenSession[]; openBreaks: OfflineOpenBreak[];
  breakResolutions: OfflineBreakResolution[];
  venueId: string; timezone: string; canReview: boolean; canReopen: boolean;
}) {
  const history = reviews;
  const latest = history[0];
  const pending = !latest || latest.decision === "reopened";
  const alreadyLinked = hasPriorAttendanceLink(history);
  const candidates = events;

  return <li id={`offline-claim-${claim.id}`} className="rounded-lg border border-line p-4 text-sm">
    <p className="font-semibold">{claim.employee_name} · {claim.department_name}</p>
    <p className="mt-1 text-amber-900">
      {pending ? "Manager review required" : decisionLabels[latest.decision]} ·{" "}
      {claim.event_type === "clock_in" ? "Clock in" : "Clock out"}
    </p>
    <p className="mt-2">Claimed on device: <time dateTime={claim.claimed_at}>
      {formatTime(claim.claimed_at, timezone)} ({claim.claimed_at})
    </time></p>
    <p className="mt-1">Received by server: <time dateTime={claim.received_at}>
      {formatTime(claim.received_at, timezone)} ({claim.received_at})
    </time></p>
    {history.length > 0 && <div className="mt-3 space-y-2">
      <p className="font-semibold">Review history</p>
      {history.map((review) => <div key={review.id} className="rounded-lg border border-line p-3">
        <p>{decisionLabels[review.decision]}: {review.reason}</p>
        {review.old_at && <p className="mt-1">Previous event time: {review.old_at}</p>}
        <p className="mt-1 text-muted">By user {review.actor_id} at{" "}
          <time dateTime={review.created_at}>{formatTime(review.created_at, timezone)}</time>
        </p>
      </div>)}
    </div>}
    {breakResolutions.map((resolution) => <div key={resolution.id}
      className="mt-3 rounded-lg border border-line p-3">
      <p className="font-semibold">Manager-reported {resolution.classification} break end</p>
      <p className="mt-1">Started: {formatTime(resolution.started_at, timezone)} ({resolution.started_at})</p>
      <p className="mt-1">Reported end: {formatTime(resolution.reported_end_at, timezone)}{" "}
        ({resolution.reported_end_at})</p>
      <p className="mt-1">Reason: {resolution.reason}</p>
      <p className="mt-1 text-muted">By user {resolution.actor_id} at{" "}
        <time dateTime={resolution.created_at}>{formatTime(resolution.created_at, timezone)}</time>
      </p>
    </div>)}
    {canReview && pending && <>
      {candidates.length > 0 ? <form action={reviewOfflineAttendanceClaimAction}
        aria-label="Reconcile offline claim" className="mt-4 space-y-3">
        <input type="hidden" name="venue_id" value={venueId} />
        <input type="hidden" name="claim_id" value={claim.id} />
        <input type="hidden" name="request_id" value={randomUUID()} />
        <label className="block">
          Existing finished attendance event
          <select name="event_option" required defaultValue=""
            className="mt-1 block w-full max-w-md rounded-lg border border-line bg-white p-2">
            <option value="" disabled>Choose an event to compare</option>
            {candidates.map((event) => <option key={event.event_id}
              value={`${event.event_id}|${event.effective_at}`}>
              {formatTime(event.effective_at, timezone)} ({event.effective_at}) ·{" "}
              session {event.session_id.slice(0, 8)}{event.locked ? " · editing locked" : ""}
            </option>)}
          </select>
        </label>
        <label className="block">
          Reason for review
          <textarea name="reason" required maxLength={500}
            className="mt-1 block w-full max-w-md rounded-lg border border-line p-2" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="decision" value="matched"
            className="min-h-11 rounded-lg border border-line px-4 py-2 font-semibold">
            Match without changing time
          </button>
          <button type="submit" name="decision" value="corrected"
            className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
            Use claimed time as correction
          </button>
        </div>
        <p className="text-muted">
          Only use the claimed time after checking it. Device time is unverified; editing locks,
          overlap checks and correction audit rules still apply.
        </p>
      </form> : <p className="mt-3 text-muted">No matching finished clock event is available.</p>}
      {claim.event_type === "clock_in" && (alreadyLinked
        ? <p className="mt-3 text-muted">
          This claim was already linked to attendance and cannot create another session.
        </p>
        : endClaims.length > 0
        ? <form action={createAttendanceFromOfflineClaimsAction}
          aria-label="Create attendance from offline claims" className="mt-4 space-y-3 rounded-lg border border-line p-3">
          <input type="hidden" name="venue_id" value={venueId} />
          <input type="hidden" name="clock_in_claim_id" value={claim.id} />
          <input type="hidden" name="request_id" value={randomUUID()} />
          <label className="block">
            Matching clock-out claim
            <select name="clock_out_claim_id" required defaultValue=""
              className="mt-1 block w-full max-w-md rounded-lg border border-line bg-white p-2">
              <option value="" disabled>Choose a clock-out claim</option>
              {endClaims.map((end) => <option key={end.id} value={end.id}>
                {formatTime(end.claimed_at, timezone)} ({end.claimed_at}) · received {end.received_at}
              </option>)}
            </select>
          </label>
          <label className="block">
            Reason for creating attendance
            <textarea name="reason" required maxLength={500}
              className="mt-1 block w-full max-w-md rounded-lg border border-line p-2" />
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="acknowledge_unverified" value="yes" required className="mt-1" />
            <span>I checked both claimed times. They are unverified device times, and no breaks were captured.</span>
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
            Create attendance from claims
          </button>
          <p className="text-muted">
            Only create a session after checking the times and breaks with the employee. The source remains
            visible in work time, and overlapping sessions are rejected.
          </p>
        </form>
        : <p className="mt-3 text-muted">
          A pending clock-out claim from the same worker is needed to create a finished session.
        </p>)}
      {claim.event_type === "clock_out" && !alreadyLinked && openSessions.length > 0 &&
        <form action={completeAttendanceFromOfflineClaimAction}
          aria-label="Complete attendance with offline clock-out" className="mt-4 space-y-3 rounded-lg border border-line p-3">
          <input type="hidden" name="venue_id" value={venueId} />
          <input type="hidden" name="claim_id" value={claim.id} />
          <input type="hidden" name="request_id" value={randomUUID()} />
          <label className="block">
            Matching open attendance session
            <select name="session_id" required defaultValue=""
              className="mt-1 block w-full max-w-md rounded-lg border border-line bg-white p-2">
              <option value="" disabled>Choose an open session</option>
              {openSessions.map((session) => <option key={session.session_id} value={session.session_id}>
                Started {formatTime(session.clocked_in_at, timezone)} ({session.clocked_in_at}) ·{" "}
                last event {session.latest_event_at}{session.open_break ? " · open break" : ""}
                {session.locked ? " · editing locked" : ""}
              </option>)}
            </select>
          </label>
          <label className="block">
            Reason for completing attendance
            <textarea name="reason" required maxLength={500}
              className="mt-1 block w-full max-w-md rounded-lg border border-line p-2" />
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="acknowledge_unverified" value="yes" required className="mt-1" />
            <span>I checked the unverified clock-out time and reviewed recorded breaks.</span>
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
            Complete attendance from claim
          </button>
          <p className="text-muted">
            Open breaks must be resolved first. The clock-out remains unverified, and existing break events
            are preserved.
          </p>
        </form>}
      {claim.event_type === "clock_out" && !alreadyLinked && openBreaks.map((item) =>
        <form key={item.break_id} action={completeAttendanceWithOfflineBreakAction}
          aria-label="Resolve open break and complete attendance"
          className="mt-4 space-y-3 rounded-lg border border-line p-3">
          <input type="hidden" name="venue_id" value={venueId} />
          <input type="hidden" name="claim_id" value={claim.id} />
          <input type="hidden" name="session_id" value={item.session_id} />
          <input type="hidden" name="break_id" value={item.break_id} />
          <input type="hidden" name="request_id" value={randomUUID()} />
          <p>
            {item.classification === "paid" ? "Paid" : "Unpaid"} break started{" "}
            {formatTime(item.started_at, timezone)} ({item.started_at}).
          </p>
          <label className="block">
            Reported break end ({timezone})
            <input type="datetime-local" name="break_end_local" step="0.001" required
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
            Reason for resolving the break
            <textarea name="reason" required maxLength={500}
              className="mt-1 block w-full max-w-md rounded-lg border border-line p-2" />
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="acknowledge_unverified" value="yes" required className="mt-1" />
            <span>I confirmed the reported break end and unverified clock-out with the employee.</span>
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
            Record break end and complete attendance
          </button>
          <p className="text-muted">
            The break end is recorded as manager-reported, not a server clock event. The existing
            classification and start remain unchanged.
          </p>
        </form>)}
      {claim.event_type === "clock_out" && alreadyLinked && <p className="mt-3 text-muted">
        This claim was already linked to attendance and cannot create another clock event.
      </p>}
      <form action={reviewOfflineAttendanceClaimAction} aria-label="Reject offline claim" className="mt-4 space-y-3">
        <input type="hidden" name="venue_id" value={venueId} />
        <input type="hidden" name="claim_id" value={claim.id} />
        <input type="hidden" name="request_id" value={randomUUID()} />
        <input type="hidden" name="decision" value="rejected" />
        <label className="block">
          Reason for rejecting this claim
          <textarea name="reason" required maxLength={500}
            className="mt-1 block w-full max-w-md rounded-lg border border-line p-2" />
        </label>
        <button type="submit" className="min-h-11 rounded-lg border border-line px-4 py-2 font-semibold">
          Reject claim
        </button>
      </form>
    </>}
    {canReview && !pending && canReopen && <form action={reviewOfflineAttendanceClaimAction}
      aria-label="Reopen offline claim" className="mt-4 space-y-3">
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="claim_id" value={claim.id} />
      <input type="hidden" name="request_id" value={randomUUID()} />
      <input type="hidden" name="decision" value="reopened" />
      <label className="block">
        Reason for reopening this claim
        <textarea name="reason" required maxLength={500}
          className="mt-1 block w-full max-w-md rounded-lg border border-line p-2" />
      </label>
      <button type="submit" className="min-h-11 rounded-lg border border-line px-4 py-2 font-semibold">
        Reopen claim
      </button>
      <p className="text-muted">
        Reopening the claim does not undo a previous correction or attendance created from claims.
      </p>
    </form>}
  </li>;
}
