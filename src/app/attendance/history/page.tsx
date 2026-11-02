import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { correctionEventLabels } from "@/lib/attendance-corrections";
import { isLocationReviewReason, locationReasonLabels } from "@/lib/attendance-location";
import { withBusiness } from "@/lib/business-selection";
import { parsePageNumber } from "@/lib/paginated-rows";
import {
  attendanceSourceLabels, parsePersonalAttendanceHistory,
} from "@/lib/personal-attendance-history";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

type Search = { business?: string; venue?: string; page?: string };
const pageSize = 50;

function formatTime(timestamp: string, timezone: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, timeZoneName: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

export default async function PersonalAttendanceHistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const search = await searchParams;
  const workspace = await getWorkspace(search.venue, { businessId: search.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the personal attendance workspace.", { message: workspace.message });
    return <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
      <h1 className="text-xl font-semibold">Attendance history unavailable</h1>
      <p role="alert" className="mt-3 text-sm text-muted">
        We couldn&apos;t load the selected venue. Check your access and connection, then try again.
      </p>
      <Link href="/attendance" className="mt-4 inline-block font-semibold text-ocean">Return to attendance</Link>
    </main>;
  }
  const page = parsePageNumber(search.page);
  const offset = page === null ? 0 : (page - 1) * pageSize;
  const result = page === null ? null : await workspace.supabase.rpc("list_my_attendance_history", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
  }, { count: "exact" }).order("original_at", { ascending: false }).order("event_id", { ascending: false })
    .range(offset, offset + pageSize - 1);
  const events = result ? parsePersonalAttendanceHistory(result.data) : null;
  const count = result?.count;
  const failed = result !== null && Boolean(result.error || !events || typeof count !== "number" ||
    !Number.isSafeInteger(count) || count < 0 ||
    events.length !== Math.max(0, Math.min(pageSize, count - offset)));
  if (failed) {
    console.error("Could not load personal attendance history.", {
      code: result?.error?.code,
      message: result?.error?.message ?? "The server returned incomplete or invalid attendance history.",
    });
  }
  const attendanceHref = withBusiness(`/attendance?venue=${encodeURIComponent(workspace.venue.id)}`, workspace.business.id);
  const pageHref = (nextPage: number) => withBusiness(
    `/attendance/history?venue=${encodeURIComponent(workspace.venue.id)}&page=${nextPage}`, workspace.business.id,
  );

  return <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
    businessCount={workspace.businesses.length} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <Link href={attendanceHref} className="text-sm font-semibold text-ocean underline">Back to clock in / out</Link>
    <h1 className="mt-4 text-3xl font-semibold">Your attendance history</h1>
    <p className="mt-3 text-sm leading-6 text-muted">
      These are your own recorded clock and break events for {workspace.venue.name}, ordered by their original
      times. Current times include corrections; original events remain unchanged. Times are shown in{" "}
      {workspace.venue.timezone.replaceAll("_", " ")}. To change a time,{" "}
      <Link href={`${attendanceHref}#request-attendance-correction`} className="font-semibold text-ocean underline">
        request a correction
      </Link>; a scoped manager must review it.
    </p>
    <section aria-label="Attendance privacy and retention" className="mt-6 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">Visibility and retention</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        You can see your own linked records while you have access. Owners and managers can see attendance
        within their authorised scope; database operators may also have access. If location verification
        is enabled, your browser requests a position only at clock-in or clock-out. The saved check can
        include its outcome, distance, accuracy and venue radius, but not raw device coordinates.
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">
        Original events and corrections are protected from ordinary edits and are not automatically expired.
        A privileged business deletion can remove associated records. An approved legal retention policy and
        hosted backups have not been verified; contact your employer about access, correction or retention
        after your account access ends. This description is not a compliance guarantee.
      </p>
    </section>
    {page === null && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      Invalid page number. <Link href={pageHref(1)} className="font-semibold underline">Return to the first page.</Link>
    </p>}
    {failed && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      We couldn&apos;t load a complete attendance history. Refresh and check your access before trying again.
    </p>}
    {page !== null && !failed && events && typeof count === "number" && <>
      <p role="status" className="mt-5 text-sm text-muted">{count} recorded events. Page {page}.</p>
      {events.length === 0 ? <p className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">
        No recorded events on this page.
      </p> : <ol aria-label="Your recorded clock and break events" className="mt-4 space-y-3">
        {events.map((event) => <li key={event.event_id} className="break-words rounded-xl border border-line bg-white p-4 text-sm">
          <h2 className="font-semibold">{correctionEventLabels[event.event_type]} · {event.department_name}
            {event.classification && ` · ${event.classification === "paid" ? "Paid" : "Unpaid"} break`}
          </h2>
          <p className="mt-2">Current time: <time dateTime={event.effective_at}>
            {formatTime(event.effective_at, workspace.venue.timezone)} ({event.effective_at})
          </time></p>
          <p className="mt-1">Original time: <time dateTime={event.original_at}>
            {formatTime(event.original_at, workspace.venue.timezone)} ({event.original_at})
          </time></p>
          <p className="mt-1">Source: {attendanceSourceLabels[event.event_source]}</p>
          {event.has_correction && <p className="mt-1">
            Corrected. <Link href={`${attendanceHref}#attendance-correction-history`}
              className="font-semibold text-ocean underline">View correction history</Link>.
          </p>}
          {event.location_status === "not_required" && <p className="mt-2">Location verification was off.</p>}
          {event.location_status === "verified" && <p className="mt-2">Location was verified within the venue radius.</p>}
          {event.location_status === "review" && isLocationReviewReason(event.location_reason) && <p className="mt-2">
            Location review: {locationReasonLabels[event.location_reason]}.
            {event.reviewed_at ? " Reviewed by a manager." : " Awaiting manager review."}
          </p>}
          {event.location_status === null && (event.event_type === "clock_in" || event.event_type === "clock_out") &&
            <p className="mt-2">No location check is recorded for this event.</p>}
          {event.distance_meters !== null && event.accuracy_meters !== null && <p className="mt-1 text-muted">
            Distance {event.distance_meters.toFixed(1)} m; accuracy ±{event.accuracy_meters.toFixed(1)} m;
            venue radius {event.radius_meters} m.
          </p>}
        </li>)}
      </ol>}
      <nav aria-label="Attendance history pages" className="mt-5 flex flex-wrap gap-5 text-sm font-semibold text-ocean">
        {page > 1 && <Link href={pageHref(page - 1)} className="min-h-11 py-3">Previous history page</Link>}
        {page * pageSize < count && <Link href={pageHref(page + 1)} className="min-h-11 py-3">Next history page</Link>}
      </nav>
    </>}
  </AppShell>;
}
