import Link from "next/link";
import { redirect } from "next/navigation";
import { submitShiftSwapAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { RosterNotificationBanner } from "@/components/roster-notification-banner";
import { readAllPages } from "@/lib/paginated-rows";
import { unreadRosterNotificationCount } from "@/lib/roster-notifications";
import {
  parseShiftSwaps, parseSwapColleagues, parseSwapRecipients, parseSwapShifts, swapStatusLabels,
  type ShiftSwap, type SwapColleague, type SwapRecipient, type SwapShift,
} from "@/lib/shift-swaps";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { formatDay, formatTime, getVenueDate, getWorkspace } from "@/lib/workspace";

type SwapContext = { businessId: string; venueId: string; timezone: string };

const errorMessages: Record<string, string> = {
  invalid: "That swap request is invalid. Refresh and try again.",
  selection: "Choose an available shift and colleague before continuing.",
  duplicate: "There is already an open swap request for that shift.",
  ineligible: "A participant is no longer eligible or has an overlapping shift. Check availability, qualifications and the roster.",
  changed: "The swap or a shift has changed. Refresh and request a new swap if needed.",
  permission: "That swap is not available in this venue or you no longer have permission to change it.",
  reason: "Enter a rejection reason between 1 and 500 characters.",
  unknown: "The server could not confirm the result. Refresh the page before trying again.",
};

const savedMessages: Record<string, string> = {
  requested: "Swap requested. Your colleague can propose one of their shifts.",
  proposed: "Your shift was proposed. The requester must confirm it before manager review.",
  confirmed: "You confirmed the proposal. A manager must review it before either shift changes.",
  declined: "Swap declined. The existing shifts have not changed.",
  withdrawn: "Swap withdrawn. The existing shifts have not changed.",
  approved: "Swap approved. Both shifts have been reassigned and republished.",
  rejected: "Swap rejected. The existing shifts have not changed.",
};

function ContextFields({ context }: { context: SwapContext }) {
  return (
    <>
      <input type="hidden" name="business_id" value={context.businessId} />
      <input type="hidden" name="venue_id" value={context.venueId} />
    </>
  );
}

function shiftLabel(role: string, start: string, end: string, timezone: string): string {
  const startDay = getVenueDate(start, timezone);
  const endDay = getVenueDate(end, timezone);
  return `${role} · ${formatDay(startDay)} ${formatTime(start, timezone)} – ${
    endDay === startDay ? "" : `${formatDay(endDay)} `
  }${formatTime(end, timezone)}`;
}

function RequestSwap({ shifts, colleagues, swaps, context }: {
  shifts: SwapShift[]; colleagues: SwapColleague[]; swaps: ShiftSwap[]; context: SwapContext;
}) {
  const openShiftIds = new Set(swaps.filter((swap) => swap.is_requester &&
    ["pending_recipient", "pending_requester", "pending_manager"].includes(swap.status))
    .map((swap) => swap.requester_shift_id));
  return (
    <section id="request-swap" aria-labelledby="request-swap-heading" className="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 id="request-swap-heading" className="text-lg font-semibold">Request a swap</h2>
      <p className="mt-2 text-sm text-muted">
        Choose one of your upcoming published shifts and a colleague in the same department.
        Both of you must agree to the exchange, then a manager must approve it.
      </p>
      {shifts.length === 0 ? (
        <p className="mt-3 text-sm text-muted">You have no upcoming published shifts available to swap at this venue.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {shifts.map((shift) => {
            const candidates = colleagues.filter((colleague) =>
              colleague.own_employee_id === shift.employee_id && colleague.department_id === shift.department_id);
            return (
              <li key={shift.shift_id}>
                <details className="rounded-lg border border-line p-3">
                  <summary className="cursor-pointer font-semibold text-ink">
                    {shiftLabel(shift.role_title, shift.starts_at, shift.ends_at, context.timezone)} · {shift.department_name}
                  </summary>
                  {openShiftIds.has(shift.shift_id) ? (
                    <p className="mt-3 text-sm text-muted">This shift already has an open swap request.</p>
                  ) : candidates.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">No linked colleagues are available in this department.</p>
                  ) : (
                    <form action={submitShiftSwapAction} className="mt-3 space-y-2">
                      <ContextFields context={context} />
                      <input type="hidden" name="shift_id" value={shift.shift_id} />
                      <label htmlFor={`colleague-${shift.shift_id}`} className="block text-sm font-semibold">Choose a colleague</label>
                      <select id={`colleague-${shift.shift_id}`} name="employee_id" required defaultValue=""
                        className="min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm sm:max-w-sm">
                        <option value="" disabled>Select a colleague</option>
                        {candidates.map((candidate) => (
                          <option key={candidate.employee_id} value={candidate.employee_id}>{candidate.employee_name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-muted">Qualifications and availability are checked before the request is sent.</p>
                      <button type="submit" name="operation" value="request"
                        className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
                        Request swap
                      </button>
                    </form>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SwapOperation({ swap, context, operation, label, secondary = false }: {
  swap: ShiftSwap; context: SwapContext; operation: string; label: string; secondary?: boolean;
}) {
  return (
    <form action={submitShiftSwapAction}>
      <ContextFields context={context} />
      <input type="hidden" name="swap_id" value={swap.swap_id} />
      <button type="submit" name="operation" value={operation}
        className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${
          secondary ? "border border-line bg-white text-ink" : "bg-ocean text-white hover:bg-ocean/90"
        }`}>
        {label}
      </button>
    </form>
  );
}

function SwapCard({ swap, shifts, recipients, context }: {
  swap: ShiftSwap; shifts: SwapShift[]; recipients: Map<string, string>; context: SwapContext;
}) {
  const active = ["pending_recipient", "pending_requester", "pending_manager"].includes(swap.status);
  const recipientEmployee = recipients.get(swap.swap_id);
  const choices = shifts.filter((shift) => shift.department_id === swap.department_id &&
    shift.employee_id === recipientEmployee);
  return (
    <article id={`swap-${swap.swap_id}`} aria-labelledby={`swap-heading-${swap.swap_id}`}
      className="scroll-mt-4 rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`swap-heading-${swap.swap_id}`} className="font-semibold">
            {swap.requester_name} and {swap.recipient_name} · {swap.department_name}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {swap.requester_name}: {shiftLabel(swap.requester_role, swap.requester_starts_at, swap.requester_ends_at, context.timezone)}
          </p>
          {swap.recipient_role && swap.recipient_starts_at && swap.recipient_ends_at && (
            <p className="mt-1 text-sm text-muted">
              {swap.recipient_name}: {shiftLabel(swap.recipient_role, swap.recipient_starts_at, swap.recipient_ends_at, context.timezone)}
            </p>
          )}
        </div>
        <span className="rounded-full bg-cloud px-3 py-1 text-xs font-semibold text-ink">
          {swapStatusLabels[swap.status]}
        </span>
      </div>
      {swap.review_reason && <p className="mt-3 text-sm text-ink">Manager&apos;s reason: {swap.review_reason}</p>}
      {active && !swap.snapshots_current && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-800">
          A shift has changed since this request. The swap cannot be approved; request a new one.
        </p>
      )}

      {swap.is_recipient && swap.status === "pending_recipient" && (
        <div className="mt-4 space-y-3">
          {!recipientEmployee ? (
            <p role="alert" className="text-sm text-red-800">This request changed while loading. Refresh before responding.</p>
          ) : !swap.snapshots_current ? null : choices.length === 0 ? (
            <p className="text-sm text-muted">You have no upcoming published shifts in this department to offer in exchange.</p>
          ) : (
            <form action={submitShiftSwapAction} className="space-y-2">
              <ContextFields context={context} />
              <input type="hidden" name="swap_id" value={swap.swap_id} />
              <label htmlFor={`proposed-${swap.swap_id}`} className="block text-sm font-semibold">Choose your shift to exchange</label>
              <select id={`proposed-${swap.swap_id}`} name="shift_id" required defaultValue=""
                className="min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm sm:max-w-lg">
                <option value="" disabled>Select your shift</option>
                {choices.map((shift) => (
                  <option key={shift.shift_id} value={shift.shift_id}>
                    {shiftLabel(shift.role_title, shift.starts_at, shift.ends_at, context.timezone)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted">Proposing a shift confirms you agree to this exchange, subject to manager approval.</p>
              <button type="submit" name="operation" value="propose"
                className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
                Propose and confirm my shift
              </button>
            </form>
          )}
          <SwapOperation swap={swap} context={context} operation="decline-request" label="Decline request" secondary />
        </div>
      )}

      {swap.is_requester && swap.status === "pending_requester" && (
        <div className="mt-4">
          <p className="text-sm text-muted">Confirm only if you agree to the proposed exchange.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {swap.snapshots_current && (
              <SwapOperation swap={swap} context={context} operation="confirm" label="Confirm exchange" />
            )}
            <SwapOperation swap={swap} context={context} operation="decline-proposal" label="Decline proposal" secondary />
          </div>
        </div>
      )}

      {swap.can_manage && swap.status === "pending_manager" && (
        <div className="mt-4 rounded-lg bg-cloud p-3">
          <p className="text-sm text-muted">
            Both employees confirmed. Approval rechecks their eligibility and roster conflicts.
          </p>
          {swap.snapshots_current && (
            <div className="mt-3">
              <SwapOperation swap={swap} context={context} operation="approve" label="Approve swap" />
            </div>
          )}
          <form action={submitShiftSwapAction} className="mt-3 space-y-2">
            <ContextFields context={context} />
            <input type="hidden" name="swap_id" value={swap.swap_id} />
            <label htmlFor={`reason-${swap.swap_id}`} className="block text-sm font-semibold">Reason for rejection</label>
            <textarea id={`reason-${swap.swap_id}`} name="reason" required maxLength={500} rows={2}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" />
            <button type="submit" name="operation" value="reject"
              className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
              Reject swap
            </button>
          </form>
        </div>
      )}

      {swap.is_requester && active && (
        <div className="mt-3">
          <SwapOperation swap={swap} context={context} operation="withdraw" label="Withdraw request" secondary />
        </div>
      )}
    </article>
  );
}

export default async function ShiftSwapsPage({
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
    console.error("Could not load the shift swaps workspace.", { message: workspace.message });
    return (
      <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">Shift swaps unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-muted">Check your access and connection, then try again.</p>
        <Link href="/shift-swaps" className="mt-4 inline-block text-sm font-semibold text-ocean">Return to an available venue</Link>
      </main>
    );
  }

  const args = { p_business_id: workspace.business.id, p_venue_id: workspace.venue.id };
  const [venueResult, swapResult, shiftResult, colleagueResult, recipientResult, unread] = await Promise.all([
    workspace.supabase.from("venues").select("id, name")
      .eq("business_id", workspace.business.id).order("created_at"),
    readAllPages<ShiftSwap>((from, to) => workspace.supabase.rpc("list_shift_swaps", args, { count: "exact" })
      .order("requested_at", { ascending: false }).order("swap_id").range(from, to), (row) => row?.swap_id),
    readAllPages<SwapShift>((from, to) => workspace.supabase.rpc("list_my_swap_shifts", args, { count: "exact" })
      .order("starts_at").order("shift_id").range(from, to), (row) => row?.shift_id),
    readAllPages<SwapColleague>((from, to) => workspace.supabase.rpc("list_my_swap_colleagues", args, { count: "exact" })
      .order("own_employee_id").order("department_id").order("employee_id").range(from, to),
    (row) => `${row?.own_employee_id}:${row?.department_id}:${row?.employee_id}`),
    readAllPages<SwapRecipient>((from, to) => workspace.supabase.rpc("list_my_pending_swap_recipients", args, { count: "exact" })
      .order("swap_id").range(from, to), (row) => row?.swap_id),
    unreadRosterNotificationCount(workspace.supabase, workspace.business.id, workspace.venue.id),
  ]);
  const swaps = parseShiftSwaps(swapResult.data);
  const shifts = parseSwapShifts(shiftResult.data);
  const colleagues = parseSwapColleagues(colleagueResult.data);
  const recipientRows = parseSwapRecipients(recipientResult.data);
  const loadError = venueResult.error || swapResult.error || shiftResult.error || colleagueResult.error || recipientResult.error;
  if (loadError || !swaps || !shifts || !colleagues || !recipientRows) {
    console.error("Could not load shift swaps.", {
      code: loadError?.code, message: loadError?.message ?? "The server returned invalid swap data.",
    });
  }
  const context = { businessId: workspace.business.id, venueId: workspace.venue.id, timezone: workspace.venue.timezone };
  const recipients = new Map((recipientRows ?? []).map((row) => [row.swap_id, row.employee_id]));

  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length}
      venueId={workspace.venue.id} venueName={workspace.venue.name} email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted">Your roster</p>
          <h1 className="mt-2 text-3xl font-semibold">Shift swaps</h1>
          <p className="mt-2 text-sm text-muted">Times use {workspace.venue.timezone.replaceAll("_", " ")}. Shifts remain unchanged until approved.</p>
        </div>
        {(venueResult.data ?? []).length > 1 && (
          <form action="/shift-swaps" className="flex items-center gap-2">
            <input type="hidden" name="business" value={workspace.business.id} />
            <label htmlFor="swap-venue" className="text-sm text-muted">Venue</label>
            <select id="swap-venue" name="venue" defaultValue={workspace.venue.id}
              className="min-h-11 min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-sm">
              {venueResult.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
            <button type="submit" className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold">Switch venue</button>
          </form>
        )}
      </div>
      <RosterNotificationBanner count={unread} venueId={workspace.venue.id} businessId={workspace.business.id} />
      {params.error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessages[params.error] ?? errorMessages.unknown}
        </p>
      )}
      {params.saved && savedMessages[params.saved] && (
        <p role="status" className="mt-4 rounded-xl bg-soft-sea px-4 py-3 text-sm text-ocean">{savedMessages[params.saved]}</p>
      )}
      {loadError || !swaps || !shifts || !colleagues || !recipientRows ? (
        <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          We couldn&apos;t load shift swaps. Check your connection and refresh before responding.
        </p>
      ) : (
        <>
          <RequestSwap shifts={shifts} colleagues={colleagues} swaps={swaps} context={context} />
          <section aria-labelledby="swap-list-heading" className="mt-5 rounded-xl border border-line bg-white p-5">
            <h2 id="swap-list-heading" className="text-lg font-semibold">Swap requests and reviews</h2>
            <p className="mt-2 text-sm text-muted">Only your requests and requests in departments you manage are shown.</p>
            {swaps.length === 0 ? (
              <p className="mt-3 text-sm text-muted">There are no swap requests in this venue yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {swaps.map((swap) => <SwapCard key={swap.swap_id} swap={swap} shifts={shifts} recipients={recipients} context={context} />)}
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
