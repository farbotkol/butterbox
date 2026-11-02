import Link from "next/link";
import { redirect } from "next/navigation";
import { markRosterNotificationReadAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { readAllPages } from "@/lib/paginated-rows";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { addDays, formatDay, getWorkspace } from "@/lib/workspace";

type Notice = {
  publication_id: string;
  week_start: string;
  published_at: string;
  unread: boolean;
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

  const [venueResult, notifications] = await Promise.all([
    workspace.supabase.from("venues").select("id, name")
      .eq("business_id", workspace.business.id).order("created_at"),
    readAllPages<Notice>((from, to) => workspace.supabase.rpc("list_roster_notifications", {
      p_business_id: workspace.business.id,
      p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("published_at", { ascending: false })
      .order("publication_id", { ascending: false }).range(from, to),
    (notice) => notice.publication_id),
  ]);
  const loadError = venueResult.error || notifications.error;
  if (loadError) {
    console.error("Could not load roster notifications.", {
      code: loadError.code,
      message: loadError.message,
    });
  }

  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length} venueName={workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted">Your updates</p>
          <h1 className="mt-2 text-3xl font-semibold">Notifications</h1>
          <p className="mt-2 text-sm text-muted">
            Roster updates for {workspace.venue.name}. Email and push delivery are not available yet.
          </p>
        </div>
        {(venueResult.data ?? []).length > 1 && (
          <form action="/notifications" className="flex items-center gap-2">
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
      {loadError ? (
        <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          We couldn&apos;t load your notifications. Check your connection and try again.
        </p>
      ) : notifications.data?.length === 0 ? (
        <p className="mt-5 rounded-xl border border-line bg-white p-5 text-sm text-muted">
          No roster updates yet. Newly published assigned shifts will appear here.
        </p>
      ) : (
        <ol className="mt-5 space-y-3">
          {notifications.data?.map((notice) => (
            <li key={notice.publication_id}>
              <article aria-label={`Roster update for week starting ${notice.week_start}`}
                className="rounded-xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Your roster was updated</h2>
                    <p className="mt-1 text-sm text-muted">
                      {formatDay(notice.week_start)} – {formatDay(addDays(notice.week_start, 6))}
                      {" · "}{notice.week_start.slice(0, 4)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Published {new Intl.DateTimeFormat("en-AU", {
                        timeZone: workspace.venue.timezone, day: "numeric", month: "short", year: "numeric",
                        hour: "numeric", minute: "2-digit",
                      }).format(new Date(notice.published_at))}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    notice.unread ? "bg-soft-sea text-ocean" : "bg-cloud text-muted"
                  }`}>
                    {notice.unread ? "Unread" : "Read"}
                  </span>
                </div>
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
              </article>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-xs text-muted">
        Only publications made after in-app notifications were introduced appear here.
      </p>
    </AppShell>
  );
}
