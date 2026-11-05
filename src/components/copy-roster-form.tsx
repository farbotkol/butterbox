"use client";

import { useActionState, useState } from "react";
import { copyRosterWeekAction } from "@/app/actions";
import type { RosterCopyState } from "@/lib/roster-copy";

const initialState: RosterCopyState = { errors: {} };

export function CopyRosterForm({
  week, previousWeek, venueId, departmentId, collapsed, requestId,
}: {
  week: string;
  previousWeek: string;
  venueId: string;
  departmentId: string;
  collapsed: string[];
  requestId: string;
}) {
  const [state, action, pending] = useActionState(copyRosterWeekAction, initialState);
  const [sourceWeek, setSourceWeek] = useState(state.values?.sourceWeek ?? previousWeek);
  const [copyRequestId] = useState(state.values?.requestId ?? requestId);

  return (
    <form action={action} aria-label="Copy a previous roster week" noValidate
      onReset={(event) => event.preventDefault()} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="department_id" value={departmentId} />
      <input type="hidden" name="request_id" value={copyRequestId} />
      {collapsed.map((id) => <input key={id} type="hidden" name="collapsed" value={id} />)}
      {state.errors.form && (
        <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.errors.form}
        </p>
      )}
      <div>
        <label htmlFor="copy-source-week" className="text-sm font-medium text-muted">
          Source week commencing Monday
        </label>
        <input id="copy-source-week" name="source_week" type="date" required value={sourceWeek}
          aria-invalid={state.errors.sourceWeek ? true : undefined}
          aria-describedby={state.errors.sourceWeek ? "copy-source-week-error" : undefined}
          onChange={(event) => setSourceWeek(event.target.value)}
          className="mt-1.5 block rounded-lg border border-line bg-white px-3 py-2.5 text-sm" />
        {state.errors.sourceWeek && (
          <p id="copy-source-week-error" role="alert" className="mt-1 text-sm text-red-800">
            {state.errors.sourceWeek}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending}
        className="rounded-lg bg-ocean px-4 py-2.5 text-sm font-semibold text-white hover:bg-ocean/90 disabled:opacity-60">
        {pending ? "Copying..." : "Copy into this week"}
      </button>
    </form>
  );
}
