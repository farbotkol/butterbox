"use client";

import { useActionState } from "react";
import { publishAnnouncementAction, type AnnouncementFormState } from "@/app/announcements/actions";

export function AnnouncementForm({ businessId, venueId, requestId, departments, broadScope }: {
  businessId: string; venueId: string; requestId: string;
  departments: { id: string; name: string }[]; broadScope: boolean;
}) {
  const initial: AnnouncementFormState = {};
  const [state, action, pending] = useActionState(publishAnnouncementAction, initial);
  const field = "mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-line bg-white p-2";
  return <form action={action} aria-label="Publish announcement" onReset={(event) => event.preventDefault()}
    className="mt-4 grid gap-4 rounded-xl border border-line bg-white p-4 sm:grid-cols-2">
    <input type="hidden" name="business_id" value={businessId} />
    <input type="hidden" name="venue_id" value={venueId} />
    <input type="hidden" name="request_id" value={requestId} />
    {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900 sm:col-span-2">{state.error}</p>}
    <label className="text-sm font-medium sm:col-span-2">Title
      <input name="title" required maxLength={120} className={field} />
    </label>
    <label className="text-sm font-medium sm:col-span-2">Message
      <textarea name="body" required maxLength={4000} rows={5} className={field} />
    </label>
    <div className="text-sm font-medium">
      <label htmlFor="announcement-scope">Audience</label>
      <select id="announcement-scope" name="scope" defaultValue={broadScope ? "venue" : "department"} className={field}>
        {broadScope && <><option value="business">Whole business (requires business-wide permission)</option>
          <option value="venue">Current venue</option></>}
        <option value="department">Department</option>
      </select>
    </div>
    <div className="text-sm font-medium">
      <label htmlFor="announcement-department">Department</label>
      <select id="announcement-department" name="department_id" defaultValue={broadScope ? "" : departments[0]?.id ?? ""} className={field}>
        <option value="">No department (business/venue notices only)</option>
        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
    </div>
    <div className="text-sm font-medium sm:col-span-2">
      <label htmlFor="announcement-acknowledgement">Acknowledgement</label>
      <select id="announcement-acknowledgement" name="acknowledgement" defaultValue="optional" className={field}>
        <option value="optional">Information only</option>
        <option value="required">Require explicit acknowledgement</option>
      </select>
    </div>
    <p className="text-sm text-muted sm:col-span-2">
      Only active staff linked to a current account with audience access receive this in-app notice.
      New staff are not added later. Published content and recipients cannot be edited or withdrawn.
      This does not send email or push; acknowledgement is not legal consent or a shift change.
    </p>
    <label className="flex items-start gap-2 text-sm sm:col-span-2">
      <input type="checkbox" name="confirm" value="yes" required className="mt-1 h-5 w-5 shrink-0" />
      I have reviewed the audience and message and want to publish this immutable notice.
    </label>
    <button disabled={pending} className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white disabled:opacity-60 sm:col-span-2">
      {pending ? "Publishing..." : "Publish announcement"}
    </button>
  </form>;
}
