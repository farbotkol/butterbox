import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ShiftConversationForm } from "@/components/shift-conversation-form";
import { parseBusinessId } from "@/lib/business-selection";
import { helpHref } from "@/lib/help";
import { readAllPages } from "@/lib/paginated-rows";
import {
  parseConversationContext, parseConversationMessages, parseConversationSummaries,
  shiftConversationHref, type ShiftConversationMessage, type ShiftConversationSummary,
} from "@/lib/shift-conversations";
import { formatDay, formatTime, getVenueDate, getWorkspace } from "@/lib/workspace";

type SearchParams = {
  business?: string; venue?: string; shift?: string; conversation?: string; sent?: string;
};
type ReadyWorkspace = Extract<Awaited<ReturnType<typeof getWorkspace>>, { status: "ready" }>;

export default async function ShiftConversationsPage({ searchParams }: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load shift conversation workspace.", { message: workspace.message });
    return <main className="mx-auto mt-20 max-w-lg rounded-xl bg-white p-8">
      <h1 className="text-xl font-semibold">Shift conversations unavailable</h1>
      <p role="alert" className="mt-3">Your business and venue access could not be verified.</p>
      <Link href="/choose-business" className="mt-3 inline-block text-ocean underline">Choose a business</Link>
    </main>;
  }
  return <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
    businessCount={workspace.businesses.length} venueId={workspace.venue.id} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <Suspense fallback={<p role="status" className="text-sm text-muted">Loading shift conversations...</p>}>
      <ShiftConversationContent workspace={workspace} params={params} />
    </Suspense>
  </AppShell>;
}

async function ShiftConversationContent({ workspace, params }: {
  workspace: ReadyWorkspace; params: SearchParams;
}) {
  const businessId = workspace.business.id;
  const venueId = workspace.venue.id;
  const historyHref = shiftConversationHref(businessId, venueId);
  const shiftId = parseBusinessId(params.shift);
  const conversationId = parseBusinessId(params.conversation);
  const hasSelection = params.shift !== undefined || params.conversation !== undefined;
  const invalidSelection = (hasSelection && !shiftId && !conversationId) ||
    shiftId === null || conversationId === null || Boolean(shiftId && conversationId);
  const contextResponse = hasSelection && !invalidSelection
    ? await workspace.supabase.rpc("open_shift_conversation", {
        p_business_id: businessId, p_venue_id: venueId,
        p_shift_id: shiftId ?? null, p_conversation_id: conversationId ?? null,
      })
    : null;
  const context = contextResponse && !contextResponse.error
    ? parseConversationContext(contextResponse.data) : null;
  const historyResponse = !hasSelection
    ? await readAllPages<ShiftConversationSummary>((from, to) => workspace.supabase.rpc(
        "list_shift_conversations", { p_business_id: businessId, p_venue_id: venueId }, { count: "exact" },
      ).order("last_sent_at", { ascending: false }).order("conversation_id").range(from, to),
      (row) => row?.conversation_id)
    : null;
  const history = historyResponse && !historyResponse.error
    ? parseConversationSummaries(historyResponse.data) : null;
  const messagesResponse = context?.conversation_id
    ? await readAllPages<ShiftConversationMessage>((from, to) => workspace.supabase.rpc(
        "list_shift_conversation_messages", {
          p_business_id: businessId, p_venue_id: venueId, p_conversation_id: context.conversation_id,
        }, { count: "exact" },
      ).order("sequence_id").range(from, to), (row) => row?.message_id)
    : null;
  const messages = context && !context.conversation_id ? [] : messagesResponse && !messagesResponse.error
    ? parseConversationMessages(messagesResponse.data) : null;
  const failed = invalidSelection || (hasSelection && (!context || !messages)) || (!hasSelection && !history);
  if (failed) console.error("Could not load shift conversation.", {
    code: contextResponse?.error?.code ?? historyResponse?.error?.code ?? messagesResponse?.error?.code,
    message: contextResponse?.error?.message ?? historyResponse?.error?.message ??
      messagesResponse?.error?.message ?? "Invalid selection or incomplete conversation data.",
  });
  const stamp = (value: string) => new Intl.DateTimeFormat("en-AU", {
    timeZone: workspace.venue.timezone, day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
  const shiftDate = (value: string) => formatDay(getVenueDate(value, workspace.venue.timezone));

  return <>
    <h1 className="text-3xl font-semibold">Shift conversations</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
      In-app discussions between the assigned team member and managers with access to that department.
      No email, push or automatic notifications are sent; check the conversation for replies.
    </p>
    <div className="mt-2 flex flex-wrap gap-x-5">
      <Link href={helpHref("shift-conversations", businessId, venueId)}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Help with shift conversations
      </Link>
      {hasSelection && <Link href={historyHref}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Conversation history
      </Link>}
    </div>
    {failed ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-900">
      We couldn&apos;t load this conversation or verify your access. Refresh or return to conversation history.
    </p> : !hasSelection && history ? <section aria-labelledby="conversation-history-heading" className="mt-5">
      <h2 id="conversation-history-heading" className="text-xl font-semibold">Conversation history</h2>
      {history.length === 0 ? <p className="mt-3 text-sm text-muted">
        No conversations yet. Open a published assigned shift from the roster or your schedule to start one.
      </p> : <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
        {history.map((item) => <li key={item.conversation_id} className="p-4">
          <Link href={shiftConversationHref(businessId, venueId, { conversationId: item.conversation_id })}
            className="inline-flex min-h-11 items-center font-semibold text-ocean underline">
            {item.role_title} · {item.employee_name} · {shiftDate(item.starts_at)}
          </Link>
          <p className="text-sm text-muted">{item.department_name} · {item.message_count} {item.message_count === 1 ? "message" : "messages"} ·
            {" "}Last message <time dateTime={item.last_sent_at}>{stamp(item.last_sent_at)}</time></p>
        </li>)}
      </ul>}
    </section> : context && messages ? <section aria-labelledby="conversation-heading" className="mt-5 rounded-xl border border-line bg-white p-4 sm:p-6">
      <h2 id="conversation-heading" className="text-xl font-semibold">{context.role_title} · {context.employee_name}</h2>
      <p className="mt-2 text-sm text-muted">
        {context.department_name} · <time dateTime={context.starts_at}>{shiftDate(context.starts_at)} · {formatTime(context.starts_at, workspace.venue.timezone)}</time>
        {" – "}<time dateTime={context.ends_at}>{formatTime(context.ends_at, workspace.venue.timezone)}</time>
      </p>
      {context.conversation_id && <p className="mt-2 text-xs text-muted">
        Shift details are recorded when the conversation starts. Check the roster for later changes.
      </p>}
      {params.sent === "1" && <p role="status" className="mt-4 rounded-lg bg-soft-sea p-3 text-sm text-ocean">Message sent in-app.</p>}
      <h3 className="mt-5 text-lg font-semibold">Messages</h3>
      {messages.length === 0 ? <p className="mt-3 text-sm text-muted">
        {context.can_reply ? "No messages yet. Start the conversation below." : "No messages in this conversation."}
      </p> :
        <ol className="mt-3 space-y-3">
          {messages.map((message) => <li key={message.message_id}
            className="min-w-0 rounded-lg border border-line bg-brand-cream p-4 [overflow-wrap:anywhere]">
            <p className="text-xs font-semibold text-muted">
              {message.is_mine ? "You" : message.sender_kind === "manager" ? "Manager" : "Team member"} ·{" "}
              <time dateTime={message.sent_at}>{stamp(message.sent_at)}</time>
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{message.body}</p>
          </li>)}
        </ol>}
      {context.can_reply && context.participant_user_id
        ? <ShiftConversationForm businessId={businessId} venueId={venueId} context={context} requestId={randomUUID()} />
        : <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {context.participant_user_id
              ? "This conversation is read-only because the shift, participant or department is no longer available."
              : "This team member needs an active linked account before a conversation can start."}
          </p>}
    </section> : null}
  </>;
}
