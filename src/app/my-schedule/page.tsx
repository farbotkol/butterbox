import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { acknowledgeShiftAction, respondShiftOfferAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { RosterNotificationBanner } from "@/components/roster-notification-banner";
import { groupEmployeeSchedule, type EmployeeScheduleShift } from "@/lib/employee-schedule";
import { unreadRosterNotificationCount } from "@/lib/roster-notifications";
import { shiftAcknowledgements } from "@/lib/shift-acknowledgements";
import { outcomeLabels, parseMyShiftOffers, responseLabels, type MyShiftOffer } from "@/lib/shift-offers";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  addDays,
  formatDay,
  formatTime,
  getVenueDate,
  getWeekStart,
  getWorkspace,
  localMidnightAsUtc,
} from "@/lib/workspace";

type Venue = { id: string; name: string; address: string | null; timezone: string };
type ScheduleShift = EmployeeScheduleShift & { requires_acknowledgement: boolean };

function scheduleHref(week: string, venue: string) {
  return `/my-schedule?${new URLSearchParams({ week, venue })}`;
}

const offerErrors: Record<string, string> = {
  offer: "We couldn't record your response. Refresh your schedule and try again.",
  "offer-expired": "That offer has expired and can no longer be accepted.",
  "offer-answered": "You have already responded to that offer.",
  "offer-unavailable": "That shift is no longer available.",
  "offer-ineligible": "You are no longer eligible for that shift, so it could not be accepted.",
  "offer-unknown": "The server could not confirm your response. Refresh your schedule before trying again.",
};

function ShiftOffers({ offers, venue, week }: { offers: MyShiftOffer[]; venue: Venue; week: string }) {
  const stamp = (value: string) => new Intl.DateTimeFormat("en-AU", {
    timeZone: venue.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
  return (
    <section id="shift-offers" aria-labelledby="shift-offers-heading" className="mt-5 rounded-xl border border-amber-200 bg-[#fffaf0] p-5">
      <h2 id="shift-offers-heading" className="text-lg font-semibold">Shift offers</h2>
      <ul className="mt-3 space-y-3">
        {offers.map((offer) => {
          const day = formatDay(getVenueDate(offer.starts_at, venue.timezone));
          const label = `${offer.role_title} shift on ${day} at ${formatTime(offer.starts_at, venue.timezone)}`;
          return (
            <li key={offer.offer_id} className="rounded-lg border border-amber-200 bg-white p-4">
              <p className="font-semibold text-ink">{offer.role_title} · {offer.department_name}</p>
              <p className="mt-1 text-sm text-ink">
                <time dateTime={offer.starts_at}>{day} · {formatTime(offer.starts_at, venue.timezone)}</time>
                {" – "}<time dateTime={offer.ends_at}>{formatTime(offer.ends_at, venue.timezone)}</time>
              </p>
              {offer.can_respond ? (
                <>
                  <p className="mt-1 text-xs text-muted">
                    Respond by <time dateTime={offer.expires_at}>{stamp(offer.expires_at)}</time>
                  </p>
                  <form action={respondShiftOfferAction} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="offer_id" value={offer.offer_id} />
                    <input type="hidden" name="venue_id" value={venue.id} />
                    <input type="hidden" name="week" value={week} />
                    <button type="submit" name="response" value="accept" aria-label={`Claim ${label}`}
                      className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
                      Claim shift
                    </button>
                    <button type="submit" name="response" value="decline" aria-label={`Decline ${label}`}
                      className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
                      Decline
                    </button>
                  </form>
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold text-amber-900">
                  {offer.outcome ? outcomeLabels[offer.outcome]
                    : offer.response === "accepted" ? "Claimed — waiting for manager confirmation"
                      : responseLabels[offer.response]}
                  {offer.responded_at && (
                    <span className="font-normal text-muted"> · responded <time dateTime={offer.responded_at}>{stamp(offer.responded_at)}</time></span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShiftDetails({ shift, venue, week, acknowledgements }: {
  shift: ScheduleShift; venue: Venue; week: string;
  acknowledgements: Map<string, string | null> | null;
}) {
  const startDate = getVenueDate(shift.starts_at, venue.timezone);
  const endDate = getVenueDate(shift.ends_at, venue.timezone);
  const acknowledgedAt = acknowledgements?.get(shift.id);
  return (
    <div className="rounded-lg border border-sea-glass/40 bg-soft-sea p-4">
      <p className="font-semibold text-ink">{shift.role_title}</p>
      <p className="mt-1 text-sm text-ink">
        <time dateTime={shift.starts_at}>{formatDay(startDate)} · {formatTime(shift.starts_at, venue.timezone)}</time>
        {" – "}
        <time dateTime={shift.ends_at}>
          {endDate !== startDate && `${formatDay(endDate)} · `}{formatTime(shift.ends_at, venue.timezone)}
        </time>
      </p>
      <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
        <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{venue.name}{venue.address ? ` · ${venue.address}` : " · Address not provided"}</span>
      </p>
      {shift.requires_acknowledgement && (
        acknowledgedAt === undefined ? (
          <p className="mt-3 text-sm font-semibold text-red-800">Acknowledgement status unavailable</p>
        ) : acknowledgedAt ? (
          <p className="mt-3 text-sm font-semibold text-ocean">
            Acknowledged{" · "}
            <time dateTime={acknowledgedAt}>
              {new Intl.DateTimeFormat("en-AU", {
                timeZone: venue.timezone, day: "numeric", month: "short", year: "numeric",
                hour: "numeric", minute: "2-digit",
              }).format(new Date(acknowledgedAt))}
            </time>
          </p>
        ) : (
          <form action={acknowledgeShiftAction} className="mt-3">
            <input type="hidden" name="shift_id" value={shift.id} />
            <input type="hidden" name="venue_id" value={venue.id} />
            <input type="hidden" name="week" value={week} />
            <p className="text-sm font-semibold text-amber-900">Acknowledgement required</p>
            <button type="submit"
              aria-label={`Acknowledge ${shift.role_title} shift on ${formatDay(startDate)} at ${formatTime(shift.starts_at, venue.timezone)}`}
              className="mt-2 rounded-lg bg-ocean px-3 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
              Acknowledge shift
            </button>
          </form>
        )
      )}
    </div>
  );
}

export default async function MySchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; week?: string; venue?: string; error?: string; acknowledged?: string; offer?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the personal schedule workspace.", { message: workspace.message });
    return (
      <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">Schedule unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-muted">
          We couldn&apos;t load the selected venue. Check your access and connection, then try again.
        </p>
        <Link href="/my-schedule" className="mt-4 inline-block text-sm font-semibold text-ocean">
          Return to an available schedule
        </Link>
      </main>
    );
  }

  const week = getWeekStart(params.week, workspace.venue.timezone);
  const [venueResult, employeeResult, unreadNotifications] = await Promise.all([
    workspace.supabase.from("venues").select("id, name, address, timezone")
      .eq("business_id", workspace.business.id).order("created_at"),
    workspace.supabase.from("employees").select("id")
      .eq("business_id", workspace.business.id)
      .eq("venue_id", workspace.venue.id)
      .eq("auth_user_id", workspace.user.id),
    unreadRosterNotificationCount(workspace.supabase, workspace.business.id, workspace.venue.id),
  ]);
  const venue = venueResult.data?.find((item) => item.id === workspace.venue.id);
  const employeeIds = (employeeResult.data ?? []).map((employee) => employee.id);
  const [weekResult, nextResult] = employeeIds.length
    ? await Promise.all([
        workspace.supabase.from("shifts").select("id, role_title, starts_at, ends_at, requires_acknowledgement")
          .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id)
          .eq("status", "scheduled").eq("is_published", true).in("employee_id", employeeIds)
          .lt("starts_at", localMidnightAsUtc(addDays(week, 7), workspace.venue.timezone))
          .gt("ends_at", localMidnightAsUtc(week, workspace.venue.timezone))
          .order("starts_at"),
        workspace.supabase.from("shifts").select("id, role_title, starts_at, ends_at, requires_acknowledgement")
          .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id)
          .eq("status", "scheduled").eq("is_published", true).in("employee_id", employeeIds)
          .gte("starts_at", new Date().toISOString()).order("starts_at").limit(1),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const loadError = venueResult.error || employeeResult.error || weekResult.error || nextResult.error;
  if (loadError || !venue) {
    console.error("Could not load the personal schedule.", {
      code: loadError?.code,
      message: loadError?.message ?? "The selected venue is unavailable.",
    });
  }

  const days = groupEmployeeSchedule(week, weekResult.data ?? [], workspace.venue.timezone);
  const nextShift = nextResult.data?.[0];
  const acknowledgementIds = [...(weekResult.data ?? []), ...(nextResult.data ?? [])]
    .filter((shift) => shift.requires_acknowledgement).map((shift) => shift.id);
  const [acknowledgements, offerResult] = !loadError && venue
    ? await Promise.all([
        shiftAcknowledgements(workspace.supabase, workspace.business.id, workspace.venue.id, acknowledgementIds),
        employeeIds.length
          ? workspace.supabase.rpc("list_my_shift_offers", {
              p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
            })
          : Promise.resolve({ data: [], error: null }),
      ])
    : [null, null];
  const shiftOffers = offerResult && !offerResult.error ? parseMyShiftOffers(offerResult.data) : null;
  if (offerResult && !shiftOffers) {
    console.error("Could not load shift offers.", {
      code: offerResult.error?.code,
      message: offerResult.error?.message ?? "The server returned invalid shift offers.",
    });
  }
  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length} venueName={workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted">Your roster</p>
          <h1 className="mt-2 text-3xl font-semibold">My schedule</h1>
          <p className="mt-2 text-sm text-muted">
            Only your published shifts are shown. Times use {workspace.venue.timezone.replaceAll("_", " ")}.
          </p>
        </div>
        {(venueResult.data ?? []).length > 1 && (
          <form action="/my-schedule" className="flex items-center gap-2">
            <input type="hidden" name="week" value={week} />
            <label htmlFor="schedule-venue" className="text-sm text-muted">Venue</label>
            <select id="schedule-venue" name="venue" defaultValue={workspace.venue.id}
              className="min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-sm">
              {venueResult.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold">
              Switch venue
            </button>
          </form>
        )}
      </div>

      <RosterNotificationBanner count={unreadNotifications} venueId={workspace.venue.id} />

      {params.error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {offerErrors[params.error] ?? (params.error === "ack-unknown"
            ? "The server could not confirm your acknowledgement. Refresh the schedule before trying again."
            : "We couldn't acknowledge this shift. Check your access and refresh the schedule, then try again.")}
        </p>
      )}
      {(params.offer === "accepted" || params.offer === "declined") && (
        <p role="status" className="mt-4 rounded-xl bg-soft-sea px-4 py-3 text-sm text-ocean">
          {params.offer === "accepted"
            ? "Shift claimed. Your manager will confirm who gets the shift."
            : "Shift offer declined."}
        </p>
      )}
      {offerResult && !shiftOffers && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          We couldn&apos;t load your shift offers. Refresh the schedule to try again.
        </p>
      )}
      {params.acknowledged && (
        <p role="status" className="mt-4 rounded-xl bg-soft-sea px-4 py-3 text-sm text-ocean">
          Shift acknowledged.
        </p>
      )}
      {!loadError && venue && !acknowledgements && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          We couldn&apos;t load acknowledgement status. Refresh the schedule before responding.
        </p>
      )}

      {loadError || !venue ? (
        <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          We couldn&apos;t load your schedule. Check your connection and try again.
        </p>
      ) : employeeIds.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-white p-5 text-sm text-muted">
          No employee profile is linked to your account at this venue. Ask your business owner to link your membership.
        </p>
      ) : (
        <>
          <section aria-labelledby="next-shift-heading" className="mt-6 rounded-xl border border-line bg-white p-5">
            <h2 id="next-shift-heading" className="text-lg font-semibold">Next shift</h2>
            <div className="mt-3">
              {nextShift
                ? <ShiftDetails shift={nextShift} venue={venue} week={week} acknowledgements={acknowledgements} />
                : <p className="text-sm text-muted">You have no upcoming published shifts at this venue.</p>}
            </div>
          </section>

          {shiftOffers && shiftOffers.length > 0 && <ShiftOffers offers={shiftOffers} venue={venue} week={week} />}

          <section aria-labelledby="weekly-schedule-heading" className="mt-5 rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="weekly-schedule-heading" className="text-lg font-semibold">Weekly schedule</h2>
              <div className="flex items-center gap-3">
                <Link href={scheduleHref(addDays(week, -7), venue.id)} aria-label="Previous week"
                  className="rounded-lg p-2 text-ocean hover:bg-soft-sea">
                  <ArrowLeft size={18} aria-hidden="true" />
                </Link>
                <p className="text-center text-sm font-semibold">{formatDay(week)} – {formatDay(addDays(week, 6))}</p>
                <Link href={scheduleHref(addDays(week, 7), venue.id)} aria-label="Next week"
                  className="rounded-lg p-2 text-ocean hover:bg-soft-sea">
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {days.map((day) => (
                <section key={day.date} aria-labelledby={`schedule-${day.date}`} className="border-t border-line pt-4">
                  <h3 id={`schedule-${day.date}`} className="mb-2 text-sm font-semibold">{formatDay(day.date)}</h3>
                  {day.shifts.length
                    ? <div className="space-y-2">{day.shifts.map((shift) => (
                      <ShiftDetails key={shift.id} shift={shift} venue={venue} week={week} acknowledgements={acknowledgements} />
                    ))}</div>
                    : <p className="text-sm text-muted">No shifts</p>}
                </section>
              ))}
            </div>
            <form action="/my-schedule" className="mt-5">
              <input type="hidden" name="week" value={week} />
              <input type="hidden" name="venue" value={venue.id} />
              <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ocean">
                Refresh schedule
              </button>
            </form>
            <p className="mt-2 text-xs text-muted">
              Refresh to see newly published shifts. Acknowledge a shift when your manager requires it.
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
