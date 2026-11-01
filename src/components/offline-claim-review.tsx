import { randomUUID } from "node:crypto";
import { reviewOfflineAttendanceClaimAction } from "@/app/actions";
import type {
  OfflineClaimReview, OfflineMatchEvent, SubmittedOfflineClaim,
} from "@/lib/offline-attendance";

const decisionLabels: Record<OfflineClaimReview["decision"], string> = {
  matched: "Matched to an existing event without changing its time",
  corrected: "Existing event corrected to the claimed time",
  rejected: "Rejected",
  reopened: "Reopened for review",
};

function formatTime(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

export function OfflineClaimReview({ claim, reviews, events, venueId, timezone, canReview, canReopen }: {
  claim: SubmittedOfflineClaim; reviews: OfflineClaimReview[]; events: OfflineMatchEvent[];
  venueId: string; timezone: string; canReview: boolean; canReopen: boolean;
}) {
  const history = reviews;
  const latest = history[0];
  const pending = !latest || latest.decision === "reopened";
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
      </form> : <p className="mt-3 text-muted">
        No matching finished clock event is available. This workflow cannot create a missing clock event;
        leave the claim pending if it needs further investigation.
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
      <p className="text-muted">Reopening the claim does not undo any previous attendance correction.</p>
    </form>}
  </li>;
}
