import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { acknowledgeAnnouncementAction } from "@/app/announcements/actions";
import { AnnouncementForm } from "@/components/announcement-form";
import { AppShell } from "@/components/app-shell";
import {
  canManageAnnouncements, parseAnnouncementReceipts, parseMyAnnouncements, parsePublishedAnnouncements,
  type AnnouncementReceipt, type MyAnnouncement, type PublishedAnnouncement,
} from "@/lib/announcements";
import { parseBusinessId } from "@/lib/business-selection";
import { helpHref } from "@/lib/help";
import { readAllPages } from "@/lib/paginated-rows";
import { getWorkspace } from "@/lib/workspace";

export default async function AnnouncementsPage({ searchParams }: {
  searchParams: Promise<{ business?: string; venue?: string; notice?: string; error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load announcement workspace.", { message: workspace.message });
    return <main className="mx-auto mt-20 max-w-lg rounded-xl bg-white p-8">
      <h1 className="text-xl font-semibold">Announcements unavailable</h1>
      <p role="alert" className="mt-3">Your business and venue access could not be verified.</p>
      <Link href="/choose-business" className="mt-3 inline-block text-ocean underline">Choose a business</Link>
    </main>;
  }
  const businessId = workspace.business.id;
  const venueId = workspace.venue.id;
  const manage = canManageAnnouncements(workspace.membership.role);
  const noticeId = parseBusinessId(params.notice);
  const [mineResponse, publishedResponse, departmentResponse, receiptResponse] = await Promise.all([
    readAllPages<MyAnnouncement>((from, to) => workspace.supabase.rpc("list_my_announcements", {
      p_business_id: businessId,
    }, { count: "exact" }).order("published_at", { ascending: false }).order("recipient_id").range(from, to),
    (row) => row?.recipient_id),
    manage ? readAllPages<PublishedAnnouncement>((from, to) => workspace.supabase.rpc("list_published_announcements", {
      p_business_id: businessId,
    }, { count: "exact" }).order("published_at", { ascending: false }).order("announcement_id").range(from, to),
    (row) => row?.announcement_id) : Promise.resolve({ data: [], error: null }),
    workspace.supabase.from("departments").select("id, name").eq("business_id", businessId)
      .eq("venue_id", venueId).eq("active", true).order("name"),
    noticeId && manage ? readAllPages<AnnouncementReceipt>((from, to) => workspace.supabase.rpc("list_announcement_receipts", {
      p_business_id: businessId, p_announcement_id: noticeId,
    }, { count: "exact" }).order("employee_name").order("recipient_id").range(from, to),
    (row) => row?.recipient_id) : Promise.resolve({ data: [], error: null }),
  ]);
  const mine = parseMyAnnouncements(mineResponse.data);
  const published = parsePublishedAnnouncements(publishedResponse.data);
  const receipts = parseAnnouncementReceipts(receiptResponse.data);
  const receiptNotice = noticeId ? published?.find((notice) => notice.announcement_id === noticeId) : undefined;
  const invalidReceipt = params.notice !== undefined && (!noticeId || !manage || !receiptNotice);
  const failure = mineResponse.error || publishedResponse.error || departmentResponse.error;
  if (failure || !mine || !published) console.error("Could not load announcement history.", {
    code: failure?.code, message: failure?.message ?? "Invalid announcement response.",
  });
  if (invalidReceipt || receiptResponse.error || !receipts) console.error("Could not load announcement receipts.", {
    code: receiptResponse.error?.code, message: receiptResponse.error?.message ?? "Notice missing or receipt access unavailable.",
  });
  const href = (notice?: string) => `/announcements?${new URLSearchParams({
    business: businessId, venue: venueId, ...(notice ? { notice } : {}),
  })}`;
  return <AppShell businessName={workspace.business.name} businessId={businessId} businessCount={workspace.businesses.length}
    venueName={workspace.venue.name} email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <h1 className="text-3xl font-semibold">Announcements</h1>
    <p className="mt-3 text-sm text-muted">
      In-app business, venue and department notices. Your history follows current business access.
      Email and push are not sent. Reading a notice does not acknowledge it or change your roster.
    </p>
    <Link href={helpHref("announcements", businessId)}
      className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">Help with announcements</Link>
    {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-900">
      We could not confirm that acknowledgement. Refresh history and check your access before retrying.
    </p>}
    {!params.error && ["published", "acknowledged"].includes(params.saved ?? "") && <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-ocean">
      {params.saved === "published" ? "Announcement published to its recorded recipients." : "Your acknowledgement is recorded."}
    </p>}
    {failure || !mine || !published ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-900">
      Announcement history could not load. Refresh before publishing or acknowledging.
    </p> : <>
      <section aria-labelledby="my-announcements-heading" className="mt-6">
        <h2 id="my-announcements-heading" className="text-xl font-semibold">My announcements</h2>
        {!mine.length && <p className="mt-3 text-sm text-muted">No announcements have been sent to your linked staff account.</p>}
        <div className="mt-3 grid gap-4">
          {mine.map((notice) => <article key={notice.recipient_id} id={`notice-${notice.recipient_id}`}
            aria-labelledby={`title-${notice.recipient_id}`} className="min-w-0 rounded-xl border border-line bg-white p-4 [overflow-wrap:anywhere]">
            <h3 id={`title-${notice.recipient_id}`} className="text-lg font-semibold">{notice.title}</h3>
            <p className="mt-1 text-xs text-muted">Published <time dateTime={notice.published_at}>{notice.published_at}</time></p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{notice.body}</p>
            {notice.requires_acknowledgement ? notice.acknowledged_at
              ? <p className="mt-3 text-sm font-semibold text-ocean">Acknowledged <time dateTime={notice.acknowledged_at}>{notice.acknowledged_at}</time></p>
              : <form action={acknowledgeAnnouncementAction} className="mt-3 space-y-3">
                <input type="hidden" name="business_id" value={businessId} />
                <input type="hidden" name="venue_id" value={venueId} />
                <input type="hidden" name="recipient_id" value={notice.recipient_id} />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm" value="yes" required className="mt-1 h-5 w-5 shrink-0" />
                  I have read this notice. Acknowledgement is not agreement to a roster change.
                </label>
                <button className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">Acknowledge notice</button>
              </form> : <p className="mt-3 text-sm text-muted">Information only; no acknowledgement required.</p>}
          </article>)}
        </div>
      </section>
      {manage && <>
        <section aria-labelledby="publish-announcement-heading" className="mt-8">
          <h2 id="publish-announcement-heading" className="text-xl font-semibold">New announcement</h2>
          <AnnouncementForm businessId={businessId} venueId={venueId} requestId={randomUUID()}
            departments={departmentResponse.data ?? []} broadScope={["owner", "admin", "general_manager"].includes(workspace.membership.role)} />
        </section>
        <section aria-labelledby="published-announcements-heading" className="mt-8">
          <h2 id="published-announcements-heading" className="text-xl font-semibold">Published announcements</h2>
          {!published.length && <p className="mt-3 text-sm text-muted">No published announcements in your management scope.</p>}
          <div className="mt-3 grid gap-3">
            {published.map((notice) => <article id={`published-${notice.announcement_id}`} key={notice.announcement_id}
              aria-labelledby={`published-title-${notice.announcement_id}`} className="min-w-0 rounded-xl border border-line bg-white p-4 [overflow-wrap:anywhere]">
              <h3 id={`published-title-${notice.announcement_id}`} className="font-semibold">{notice.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">{notice.body}</p>
              <p className="mt-2 text-sm text-muted">
                {notice.department_id ? "Department" : notice.venue_id ? "Venue" : "Business"} notice;
                {" "}{notice.recipient_count} recorded recipients.
                {notice.requires_acknowledgement ? ` ${notice.acknowledged_count} acknowledged; ${notice.recipient_count - notice.acknowledged_count} pending.` : " Information only."}
              </p>
              <Link href={`${href(notice.announcement_id)}#announcement-receipts`}
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
                View receipts for {notice.title}
              </Link>
            </article>)}
          </div>
        </section>
      </>}
    </>}
    {params.notice !== undefined && <section id="announcement-receipts" aria-labelledby="announcement-receipts-heading" className="mt-6 rounded-xl border border-line bg-white p-4">
      <h2 id="announcement-receipts-heading" className="text-xl font-semibold">Recipient receipts</h2>
      {invalidReceipt || receiptResponse.error || !receipts
        ? <p role="alert" className="mt-3 text-red-900">The notice is unavailable or you do not have permission to view its receipts.</p>
        : <ul className="mt-3 space-y-2">{receipts.map((receipt) => <li key={receipt.recipient_id} className="text-sm">
          {receipt.employee_name}: {receipt.acknowledged_at ? `Acknowledged ${receipt.acknowledged_at}` :
            receiptNotice?.requires_acknowledgement ? "Pending acknowledgement" : "Information only"}
        </li>)}</ul>}
      <Link href={href()} className="mt-3 inline-flex min-h-11 items-center text-ocean underline">All announcements</Link>
    </section>}
  </AppShell>;
}
