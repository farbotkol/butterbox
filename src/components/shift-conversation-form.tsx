"use client";

import { useActionState, useState } from "react";
import { sendShiftMessageAction, type ShiftMessageState } from "@/app/shift-conversations/actions";
import type { ShiftConversationContext } from "@/lib/shift-conversations";

export function ShiftConversationForm({ businessId, venueId, context, requestId }: {
  businessId: string; venueId: string; context: ShiftConversationContext; requestId: string;
}) {
  const initial: ShiftMessageState = {};
  const [state, action, pending] = useActionState(sendShiftMessageAction, initial);
  const [body, setBody] = useState("");
  return <form action={action} aria-label="Send shift message" className="mt-5 space-y-3">
    <input type="hidden" name="business_id" value={businessId} />
    <input type="hidden" name="venue_id" value={venueId} />
    <input type="hidden" name="shift_id" value={context.shift_id} />
    <input type="hidden" name="department_id" value={context.department_id} />
    <input type="hidden" name="employee_id" value={context.employee_id} />
    <input type="hidden" name="participant_user_id" value={context.participant_user_id ?? ""} />
    <input type="hidden" name="shift_updated_at" value={context.shift_updated_at} />
    <input type="hidden" name="request_id" value={requestId} />
    {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{state.error}</p>}
    <label htmlFor="shift-message" className="block text-sm font-semibold">Message</label>
    <textarea id="shift-message" name="body" value={body} onChange={(event) => setBody(event.target.value)}
      required maxLength={4000} rows={4} aria-describedby="shift-message-help"
      className="block w-full min-w-0 rounded-lg border border-line bg-white p-3 text-sm" />
    <p id="shift-message-help" className="text-sm text-muted">
      Up to 2,000 characters. Messages are retained and cannot be edited or deleted. Do not include payroll or other sensitive details.
    </p>
    <button type="submit" disabled={pending}
      className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? "Sending..." : "Send message"}
    </button>
  </form>;
}
