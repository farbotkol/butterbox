"use client";

import { useFormStatus } from "react-dom";
import { loadWorkspaceDemoDataAction } from "@/app/actions";

function LoadButton() {
  const { pending } = useFormStatus();
  return (
    <>
      {pending && <p role="status" aria-live="polite" className="text-sm text-ocean">Loading fictional demo data…</p>}
      <button
        className="min-h-11 rounded-lg bg-ocean px-5 py-3 text-sm font-semibold text-white hover:bg-ocean/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Loading demo data…" : "Load Demo Data"}
      </button>
    </>
  );
}

export function LoadDemoDataForm({ businessId, venueId }: { businessId: string; venueId: string }) {
  return (
    <form action={loadWorkspaceDemoDataAction} className="mt-5 space-y-4">
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="venue_id" value={venueId} />
      <label className="flex items-start gap-3 text-sm leading-6">
        <input className="mt-1 accent-ocean" name="confirm_demo_load" type="checkbox" value="yes" required />
        <span>
          I understand this adds clearly labeled fictional records to this clean venue. It will not delete or
          overwrite existing records and will not send invitations, messages, or payroll.
        </span>
      </label>
      <LoadButton />
    </form>
  );
}
