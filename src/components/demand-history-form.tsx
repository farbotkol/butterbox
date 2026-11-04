"use client";

import { useActionState, useState } from "react";
import {
  importDemandHistoryAction, type DemandImportState,
} from "@/app/reports/demand-history/actions";

export function DemandHistoryForm({ businessId, venueId, timezone, requestId, maxFileBytes }: {
  businessId: string; venueId: string; timezone: string; requestId: string; maxFileBytes: number;
}) {
  const initial: DemandImportState = {};
  const [state, action, pending] = useActionState(importDemandHistoryAction, initial);
  const [fileError, setFileError] = useState("");
  const maxFileSizeLabel = maxFileBytes.toLocaleString("en-AU");
  const control = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-sm";
  return <form action={action} aria-label="Import demand history" className="mt-4 grid max-w-3xl gap-4">
    <input type="hidden" name="business_id" value={businessId} />
    <input type="hidden" name="venue_id" value={venueId} />
    <input type="hidden" name="venue_timezone" value={timezone} />
    <input type="hidden" name="request_id" value={requestId} />
    {(fileError || state.error) && <p id="demand-import-error" role="alert"
      className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{fileError || state.error}</p>}
    <label className="grid gap-1 text-sm font-semibold">History type
      <select name="event_type" defaultValue="sales" className={control}>
        <option value="sales">Sales amounts (AUD)</option>
        <option value="bookings">Bookings (guest counts)</option>
      </select>
    </label>
    <label className="grid gap-1 text-sm font-semibold">Source system name
      <input name="source_name" required maxLength={80} autoComplete="off" className={control}
        aria-describedby="demand-source-help" />
    </label>
    <p id="demand-source-help" className="text-sm text-muted">
      Use the same non-identifying system name for later uploads. Start with a letter or number; use up to 80 letters,
      numbers, spaces, dots, underscores or hyphens.
    </p>
    <label className="grid gap-1 text-sm font-semibold">CSV file
      <input type="file" name="file" accept=".csv,text/csv" required className={control}
        aria-invalid={Boolean(fileError)}
        aria-describedby={fileError ? "demand-file-help demand-import-error" : "demand-file-help"}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          const message = file && (file.size === 0 || file.size > maxFileBytes)
            ? `Choose a non-empty CSV file no larger than ${maxFileSizeLabel} bytes. Nothing was imported.` : "";
          event.currentTarget.setCustomValidity(message);
          setFileError(message);
        }} />
    </label>
    <p id="demand-file-help" className="text-sm text-muted">
      UTF-8, up to {maxFileSizeLabel} bytes and 1,000 records. Include no customer names or contact details.
    </p>
    <button type="submit" disabled={pending}
      className="min-h-11 justify-self-start rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? "Importing..." : "Import history"}
    </button>
  </form>;
}
