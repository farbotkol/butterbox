import { randomUUID } from "node:crypto";
import { decideRosterReviewAction } from "@/app/actions";
import { formatDay, formatTime, getVenueDate } from "@/lib/dates";
import type { RosterPublicationMode, RosterReview } from "@/lib/roster-review";

type ReviewContext = {
  businessId: string;
  venueId: string;
  departmentId: string;
  week: string;
  collapsed: string[];
};

function DecisionFields({ context, reviewId, decision }: {
  context: ReviewContext; reviewId: string; decision: "approved" | "rejected" | "withdrawn";
}) {
  return (
    <>
      <input type="hidden" name="business_id" value={context.businessId} />
      <input type="hidden" name="venue_id" value={context.venueId} />
      <input type="hidden" name="department_id" value={context.departmentId} />
      <input type="hidden" name="week" value={context.week} />
      <input type="hidden" name="review_id" value={reviewId} />
      <input type="hidden" name="decision" value={decision} />
      <input type="hidden" name="request_id" value={randomUUID()} />
      {context.collapsed.map((department) => (
        <input key={department} type="hidden" name="collapsed" value={department} />
      ))}
    </>
  );
}

export function RosterReviewPanel({ context, mode, reviews, userId, canDecide, timezone }: {
  context: ReviewContext;
  mode: RosterPublicationMode;
  reviews: RosterReview[] | null;
  userId: string;
  canDecide: boolean;
  timezone: string;
}) {
  if (reviews && reviews.length === 0 && mode === "direct") return null;
  const timestamp = (value: string) =>
    `${formatDay(getVenueDate(value, timezone))} at ${formatTime(value, timezone)}`;
  return (
    <section aria-labelledby="roster-review-heading" className="mt-5 rounded-2xl border border-line bg-white p-5 sm:p-6">
      <h2 id="roster-review-heading" className="font-semibold">Roster reviews</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Reviewers see the submitted draft shifts below. Only these shifts are published on approval;
        shifts added later remain drafts. Times use {timezone.replaceAll("_", " ")} local time.
      </p>
      {!reviews ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          We couldn&apos;t load roster reviews. Reload before submitting or deciding a review.
        </p>
      ) : reviews.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No roster reviews for this department and week.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {reviews.map((review) => {
            const isRequester = review.requested_by === userId;
            const canReview = canDecide && !isRequester;
            const pending = review.decision === null;
            const label = pending ? "Awaiting review" : review.decision === "approved" ? "Approved"
              : review.decision === "rejected" ? "Rejected" : "Withdrawn";
            return (
              <article key={review.review_id} id={`review-${review.review_id}`}
                aria-label={`Roster review ${review.review_id}`} className="rounded-xl border border-line p-4">
                <h3 className="font-semibold">{label}</h3>
                <p className="mt-1 break-words text-sm text-muted">
                  Submitted by {isRequester ? "you" : `user ${review.requested_by}`}{" "}
                  <time dateTime={review.requested_at}>{timestamp(review.requested_at)}</time>.
                </p>
                {review.decision && review.decided_at && (
                  <p className="mt-1 break-words text-sm text-muted">
                    {label} by {review.decided_by === userId ? "you" : `user ${review.decided_by}`}{" "}
                    <time dateTime={review.decided_at}>{timestamp(review.decided_at)}</time>.
                    {review.reason && <> Reason: {review.reason}</>}
                  </p>
                )}
                {pending && review.stale && (
                  <p role="note" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    These drafts or the publication settings have changed. Withdraw or reject this review,
                    then submit the current drafts again.
                  </p>
                )}
                <ul aria-label="Submitted shift changes" className="mt-3 space-y-2">
                  {review.changes.map((shift) => {
                    const startDay = getVenueDate(shift.starts_at, timezone);
                    const endDay = getVenueDate(shift.ends_at, timezone);
                    return (
                      <li key={shift.shift_id} className="rounded-lg bg-soft-sea p-3 text-sm">
                        <span className="font-semibold">{shift.role_title}</span>
                        {" — "}{shift.employee_name ?? "Open shift"}<br />
                        <time dateTime={shift.starts_at}>{formatDay(startDay)} {formatTime(shift.starts_at, timezone)}</time>
                        {" – "}
                        <time dateTime={shift.ends_at}>
                          {endDay !== startDay && `${formatDay(endDay)} `}{formatTime(shift.ends_at, timezone)}
                        </time>
                        {" · "}{shift.break_minutes} min break
                        {shift.requires_acknowledgement && " · Acknowledgement required"}
                      </li>
                    );
                  })}
                </ul>
                {pending && isRequester && (
                  <form action={decideRosterReviewAction} className="mt-4">
                    <DecisionFields context={context} reviewId={review.review_id} decision="withdrawn" />
                    <button type="submit" className="min-h-11 rounded-lg border border-line px-4 font-semibold">
                      Withdraw review
                    </button>
                  </form>
                )}
                {pending && canReview && (
                  <div className="mt-4 flex flex-wrap items-start gap-4">
                    {!review.stale && (
                      <form action={decideRosterReviewAction}>
                        <DecisionFields context={context} reviewId={review.review_id} decision="approved" />
                        <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 font-semibold text-white">
                          Approve and publish
                        </button>
                      </form>
                    )}
                    <form action={decideRosterReviewAction} className="grid w-full gap-2 sm:max-w-sm">
                      <DecisionFields context={context} reviewId={review.review_id} decision="rejected" />
                      <label htmlFor={`rejection-${review.review_id}`} className="text-sm font-medium">
                        Reason for rejection
                      </label>
                      <textarea id={`rejection-${review.review_id}`} name="reason" required maxLength={500}
                        rows={2} className="w-full rounded-lg border border-line p-3 text-sm" />
                      <button type="submit" className="min-h-11 justify-self-start rounded-lg border border-line px-4 font-semibold">
                        Reject review
                      </button>
                    </form>
                  </div>
                )}
                {pending && !isRequester && !canReview && (
                  <p className="mt-3 text-sm text-muted">
                    A different authorised owner, administrator or general manager must decide this review.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {reviews?.length === 10 && <p className="mt-3 text-xs text-muted">Showing the 10 most recent reviews.</p>}
    </section>
  );
}
