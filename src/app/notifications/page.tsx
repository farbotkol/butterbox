import Link from "next/link";
import { redirect } from "next/navigation";
import {
  markRosterNotificationReadAction,
  markShiftOfferNotificationReadAction,
  markShiftSwapNotificationReadAction,
} from "@/app/actions";
import { markAttendanceAlertNotificationReadAction } from "@/app/attendance/alerts/actions";
import { AppShell } from "@/components/app-shell";
import {
  attendanceAlertSignalLabels, attendanceAlertStatusLabels, canManageAttendanceAlerts,
  parseAttendanceAlertNotifications, type AttendanceAlertNotification,
} from "@/lib/attendance-alerts";
import { readAllPages } from "@/lib/paginated-rows";
import { parseSwapNotifications, swapNotificationMessage, type SwapNotification } from "@/lib/shift-swaps";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { addDays, formatDay, getWorkspace } from "@/lib/workspace";

type RosterNotice = {
  kind: "roster";
  publication_id: string;
  week_start: string;
  published_at: string;
  unread: boolean;
};

type OfferNotice = {
  kind: "offer";
  notification_id: string;
  event_type: "offer" | "outcome";
  offer_id: string;
  shift_id: string;
  role_title: string;
  department_name: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  outcome: "confirmed" | "not_selected" | "unavailable" | "closed" | null;
  unread: boolean;
};

type SwapNotice = SwapNotification & { kind: "swap" };
type AttendanceNotice = AttendanceAlertNotification & { kind: "attendance" };
type Notice = RosterNotice | OfferNotice | SwapNotice | AttendanceNotice;

const offerOutcomeMessages: Record<NonNullable<OfferNotice["outcome"]>, string> = {
  confirmed: "Your shift claim was approved.",
  not_selected: "Another team member was assigned this shift.",
  unavailable: "Your claim could not be approved because you are no longer available.",
  closed: "This shift offer is closed.",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; venue?: string; error?: string; saved?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the notifications workspace.", { message: workspace.message });
    return (
      <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">Notifications unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-muted">
          We couldn&apos;t load the selected venue. Check your access and connection, then try again.
        </p>
        <Link href="/notifications" className="mt-4 inline-block text-sm font-semibold text-ocean">
          Return to an available venue
        </Link>
      </main>
    );
  }

  const canReviewAttendance = canManageAttendanceAlerts(workspace.membership.role);
  const [venueResult, rosterNotifications, offerNotifications, swapNotifications, attendanceNotifications] = await Promise.all([
    workspace.supabase.from("venues").select("id, name")
      .eq("business_id", workspace.business.id).order("created_at"),
    readAllPages<Omit<RosterNotice, "kind">>((from, to) => workspace.supabase.rpc("list_roster_notifications", {
      p_business_id: workspace.business.id,
      p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("published_at", { ascending: false })
      .order("publication_id", { ascending: false }).range(from, to),
    (notice) => notice.publication_id),
    readAllPages<Omit<OfferNotice, "kind">>((from, to) => workspace.supabase.rpc("list_shift_offer_notifications", {
      p_business_id: workspace.business.id,
      p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("created_at", { ascending: false })
      .order("notification_id", { ascending: false }).range(from, to),
    (notice) => notice.notification_id),
    readAllPages<SwapNotification>((from, to) => workspace.supabase.rpc("list_shift_swap_notifications", {
      p_business_id: workspace.business.id,
      p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("created_at", { ascending: false })
      .order("notification_id", { ascending: false }).range(from, to),
    (notice) => notice?.notification_id),
    canReviewAttendance
      ? readAllPages<AttendanceAlertNotification>((from, to) => workspace.supabase.rpc("list_attendance_alert_notifications", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
      }, { count: "exact" }).order("created_at", { ascending: false })
        .order("notification_id", { ascending: false }).range(from, to),
      (notice) => notice?.notification_id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const swapNotices = parseSwapNotifications(swapNotifications.data);
  const attendanceNotices = parseAttendanceAlertNotifications(attendanceNotifications.data);
  const loadError = venueResult.error || rosterNotifications.error || offerNotifications.error ||
    swapNotifications.error || attendanceNotifications.error;
  if (loadError || !swapNotices || !attendanceNotices) {
    console.error("Could not load notifications.", {
      code: loadError?.code,
      message: loadError?.message ?? "The server returned invalid work notifications.",
    });
  }
  const notifications: Notice[] = [
    ...(rosterNotifications.data ?? []).map((notice) => ({ ...notice, kind: "roster" as const })),
    ...(offerNotifications.data ?? []).map((notice) => ({ ...notice, kind: "offer" as const })),
    ...(swapNotices ?? []).map((notice) => ({ ...notice, kind: "swap" as const })),
    ...(attendanceNotices ?? []).map((notice) => ({ ...notice, kind: "attendance" as const })),
  ].sort((a, b) => {
    const first = a.kind === "roster" ? a.published_at : a.created_at;
    const second = b.kind === "roster" ? b.published_at : b.created_at;
    return Date.parse(second) - Date.parse(first);
  });

  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length} venueName={workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted">Your updates</p>
          <h1 className="mt-2 text-3xl font-semibold">Notifications</h1>
          <p className="mt-2 text-sm text-muted">
            Work updates for {workspace.venue.name}. Email and push delivery are not available yet.
          </p>
        </div>
        {(venueResult.data ?? []).length > 1 && (
          <form action="/notifications" className="flex items-center gap-2">
            <input type="hidden" name="business" value={workspace.business.id} />
            <label htmlFor="notification-venue" className="text-sm text-muted">Venue</label>
            <select id="notification-venue" name="venue" defaultValue={workspace.venue.id}
              className="min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-sm">
              {venueResult.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold">
              Switch venue
            </button>
          </form>
        )}
      </div>

      {params.error && (
        <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          We couldn&apos;t update that notification. Check your access and try again.
        </p>
      )}
      {params.saved === "read" && !params.error && (
        <p role="status" className="mt-5 rounded-xl bg-soft-sea p-4 text-sm text-ocean">
          Notification marked as read.
        </p>
      )}
      {loadError || !swapNotices || !attendanceNotices ? (
        <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          We couldn&apos;t load your notifications. Check your connection and try again.
        </p>
      ) : notifications.length === 0 ? (
        <p className="mt-5 rounded-xl border border-line bg-white p-5 text-sm text-muted">
          No work updates yet. New roster changes, shift offers and swap requests will appear here.
          {canReviewAttendance && " Attendance alerts for your departments also appear here."}
        </p>
      ) : (
        <ol className="mt-5 space-y-3">
          {notifications.map((notice) => (
            <li key={`${notice.kind}-${notice.kind === "roster" ? notice.publication_id : notice.notification_id}`}>
              <article aria-label={notice.kind === "roster"
                ? `Roster update for week starting ${notice.week_start}`
                : notice.kind === "offer"
                  ? `${notice.event_type === "offer" ? "Shift offer" : "Shift offer outcome"} for ${notice.role_title}`
                  : notice.kind === "swap"
                    ? `Shift swap update for ${notice.requester_name} and ${notice.recipient_name}`
                    : `Attendance alert for ${notice.employee_name}`}
                className="rounded-xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">
                      {notice.kind === "roster" ? "Your roster was updated"
                        : notice.kind === "swap" ? swapNotificationMessage(notice)
                          : notice.kind === "attendance" ? attendanceAlertSignalLabels[notice.signal]
                          : notice.event_type === "offer" ? "A shift was offered to you"
                            : offerOutcomeMessages[notice.outcome ?? "closed"]}
                    </h2>
                    {notice.kind === "roster" ? (
                      <p className="mt-1 text-sm text-muted">
                        {formatDay(notice.week_start)} – {formatDay(addDays(notice.week_start, 6))}
                        {" · "}{notice.week_start.slice(0, 4)}
                      </p>
                    ) : notice.kind === "offer" ? (
                      <p className="mt-1 text-sm text-muted">
                        {notice.role_title} · {notice.department_name} ·{" "}
                        {new Intl.DateTimeFormat("en-AU", {
                          timeZone: workspace.venue.timezone, day: "numeric", month: "short", year: "numeric",
                          hour: "numeric", minute: "2-digit",
                        }).format(new Date(notice.starts_at))}
                      </p>
                    ) : notice.kind === "swap" ? (
                      <p className="mt-1 text-sm text-muted">{notice.requester_name} · {notice.recipient_name}</p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">
                        {notice.employee_name} · {notice.department_name} · {attendanceAlertStatusLabels[notice.status]}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {notice.kind === "roster" ? "Published" : "Received"} {new Intl.DateTimeFormat("en-AU", {
                        timeZone: workspace.venue.timezone, day: "numeric", month: "short", year: "numeric",
                        hour: "numeric", minute: "2-digit",
                      }).format(new Date(notice.kind === "roster" ? notice.published_at : notice.created_at))}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    notice.unread ? "bg-soft-sea text-ocean" : "bg-cloud text-muted"
                  }`}>
                    {notice.unread ? "Unread" : "Read"}
                  </span>
                </div>
                {notice.kind === "roster" ? (
                  <form action={markRosterNotificationReadAction} className="mt-4 flex flex-wrap gap-2">
                    <input type="hidden" name="publication_id" value={notice.publication_id} />
                    <input type="hidden" name="venue_id" value={workspace.venue.id} />
                    <button type="submit" name="operation" value="open"
                      className="rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
                      View schedule
                    </button>
                    {notice.unread && (
                      <button type="submit" name="operation" value="read"
                        className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ocean">
                        Mark as read
                      </button>
                    )}
                  </form>
                ) : notice.kind === "offer" ? (
                  <form action={markShiftOfferNotificationReadAction} className="mt-4 flex flex-wrap gap-2">
                    <input type="hidden" name="notification_id" value={notice.notification_id} />
                    <input type="hidden" name="business_id" value={workspace.business.id} />
                    <input type="hidden" name="venue_id" value={workspace.venue.id} />
                    <button type="submit" name="operation" value="open"
                      className="rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
                      View shift offer
                    </button>
                    {notice.unread && (
                      <button type="submit" name="operation" value="read"
                        className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ocean">
                        Mark as read
                      </button>
                    )}
                  </form>
                ) : notice.kind === "swap" ? (
                  <form action={markShiftSwapNotificationReadAction} className="mt-4 flex flex-wrap gap-2">
                    <input type="hidden" name="notification_id" value={notice.notification_id} />
                    <input type="hidden" name="business_id" value={workspace.business.id} />
                    <input type="hidden" name="venue_id" value={workspace.venue.id} />
                    <button type="submit" name="operation" value="open"
                      className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
                      View shift swap
                    </button>
                    {notice.unread && (
                      <button type="submit" name="operation" value="read"
                        className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ocean">
                        Mark as read
                      </button>
                    )}
                  </form>
                ) : (
                  <form action={markAttendanceAlertNotificationReadAction} className="mt-4 flex flex-wrap gap-2">
                    <input type="hidden" name="notification_id" value={notice.notification_id} />
                    <input type="hidden" name="business_id" value={workspace.business.id} />
                    <input type="hidden" name="venue_id" value={workspace.venue.id} />
                    <button type="submit" name="operation" value="open"
                      className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
                      View attendance alert
                    </button>
                    {notice.unread && (
                      <button type="submit" name="operation" value="read"
                        className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ocean">
                        Mark as read
                      </button>
                    )}
                  </form>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-xs text-muted">
        Only work events recorded after their notification support was introduced appear here.
      </p>
    </AppShell>
  );
}
