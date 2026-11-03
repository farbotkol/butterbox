import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { saveEmployeeEmploymentMetadataAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { withBusiness } from "@/lib/business-selection";
import {
  currentEmploymentMetadata, employmentBases, parseEmploymentMetadataEvents, parseEmploymentMetadataSnapshots,
} from "@/lib/employment-rule-metadata";
import { isPayrollUuid } from "@/lib/generic-payroll-exports";
import { readAllPages } from "@/lib/paginated-rows";
import { parsePeopleFilters, peopleHref as scopedPeopleHref, serializePeopleFilters } from "@/lib/people-directory";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getVenueDate, getWorkspace } from "@/lib/workspace";

type Search = {
  business?: string; venue?: string; error?: string; saved?: string;
  q?: string; department?: string; role?: string; status?: string; sort?: string; page?: string;
};

const errorMessages: Record<string, string> = {
  permission: "You cannot manage employment details for this worker.",
  stale: "Employment details changed while this form was open. Review the current history before saving.",
  invalid: "Check the effective date, employment basis and reference lengths.",
  retry: "This request was already used for different details. Refresh before trying again.",
  save: "We couldn't save the employment details. Refresh the history and try again.",
};

function rowId(value: unknown) {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string"
    ? value.id : "";
}

export default async function EmploymentMetadataPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<Search>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const [{ employeeId: requestedEmployeeId }, search] = await Promise.all([params, searchParams]);
  if (!isPayrollUuid(requestedEmployeeId)) {
    console.error("Invalid employment metadata employee.");
    redirect("/people?error=employment-invalid");
  }
  const employeeId = requestedEmployeeId.toLowerCase();
  const workspace = await getWorkspace(search.venue, { businessId: search.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load employment metadata workspace.", { message: workspace.message });
    redirect("/people?error=permission");
  }
  const peopleHref = withBusiness(`/people?venue=${encodeURIComponent(workspace.venue.id)}`, workspace.business.id);
  const filters = parsePeopleFilters(search);
  if (!filters) {
    console.error("Invalid employment profile return context.");
    redirect(`${peopleHref}&error=filter`);
  }
  const profileHref = scopedPeopleHref(workspace.business.id, workspace.venue.id, filters, employeeId);
  if (!["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"]
    .includes(workspace.membership.role)) redirect(`${peopleHref}&error=permission`);

  const [employee, snapshotResponse, historyResponse] = await Promise.all([
    workspace.supabase.from("employees").select("id, name")
      .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id).eq("id", employeeId).maybeSingle(),
    workspace.supabase.rpc("list_current_employee_employment_metadata", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    }).eq("employee_id", employeeId),
    readAllPages<unknown>((from, to) => workspace.supabase.from("employee_employment_metadata_events")
      .select("id, employee_id, effective_on, employment_basis, classification, award_reference, contract_reference, revision, source, actor_id, recorded_at",
        { count: "exact" })
      .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id).eq("employee_id", employeeId)
      .order("revision", { ascending: false }).range(from, to), rowId),
  ]);
  if (!employee.error && !snapshotResponse.error && (!employee.data || snapshotResponse.data?.length === 0)) {
    redirect(`${peopleHref}&error=permission`);
  }
  const snapshots = parseEmploymentMetadataSnapshots(snapshotResponse.data);
  const events = parseEmploymentMetadataEvents(historyResponse.data, employeeId);
  const today = getVenueDate(new Date().toISOString(), workspace.venue.timezone);
  const current = events ? currentEmploymentMetadata(events, today) : null;
  const snapshot = snapshots?.length === 1 ? snapshots[0] : null;
  const latestRevision = events?.reduce((latest, event) => Math.max(latest, event.revision), 0);
  const inconsistent = !snapshot || !events || snapshot.employee_id !== employeeId ||
    snapshot.revision !== latestRevision || snapshot.employment_basis !== (current?.employment_basis ?? null) ||
    snapshot.effective_on !== (current?.effective_on ?? null);
  const loadError = employee.error || snapshotResponse.error || historyResponse.error || inconsistent;
  if (loadError) {
    console.error("Could not load employment metadata.", {
      code: employee.error?.code ?? snapshotResponse.error?.code ?? historyResponse.error?.code,
      message: employee.error?.message ?? snapshotResponse.error?.message ?? historyResponse.error?.message ??
        "Employment metadata was incomplete or changed while loading.",
    });
  }
  const history = events ? [...events].sort((a, b) =>
    b.effective_on.localeCompare(a.effective_on) || b.revision - a.revision) : [];
  const fieldClass = "mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink";
  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
      businessCount={workspace.businesses.length} venueId={workspace.venue.id} venueName={workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <Link href={profileHref} className="text-sm font-semibold text-ocean underline">Back to profile</Link>
      <h1 className="mt-4 break-words text-3xl font-semibold">Employment metadata{employee.data ? ` for ${employee.data.name}` : ""}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        These are tenant-supplied references, not verified award interpretation, payroll calculations or compliance advice.
        Dates use the venue&apos;s {workspace.venue.timezone} calendar. A later entry for the same date supersedes the
        earlier entry without deleting it; future entries apply from their effective date.
      </p>
      {search.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">
        {errorMessages[search.error] ?? errorMessages.save}
      </p>}
      {search.saved === "metadata" && <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-ocean">
        Employment metadata recorded.
      </p>}
      {loadError || !snapshot ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">
          Could not load a consistent employment history. Refresh and try again.
        </p>
      ) : <>
        <section aria-label="Current employment metadata" className="mt-6 break-words rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold">Current details</h2>
          {current ? <>
            <p className="mt-2 text-sm">Effective from: {current.effective_on}</p>
            <p className="text-sm">Employment basis: {employmentBases[current.employment_basis]}</p>
            <p className="text-sm">Classification: {current.classification ?? "Unknown"}</p>
            <p className="text-sm">Award reference: {current.award_reference ?? "Not recorded"}</p>
            <p className="text-sm">Contract reference: {current.contract_reference ?? "Not recorded"}</p>
          </> : <p className="mt-2 text-sm text-muted">
            Employment basis and classification are unknown. No currently effective dated record has been supplied.
            An existing profile employment type does not establish an award or classification.
          </p>}
        </section>
        <section className="mt-6 rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold">Record a dated change</h2>
          <p className="mt-2 text-sm text-muted">
            Leave classification blank when it is unknown. Award and contract references are optional and can both be recorded.
            Changes do not recalculate previously exported payroll.
          </p>
          {snapshot.revision >= 2147483647 ? <p role="alert" className="mt-3 text-sm text-red-800">
            This history has reached its revision limit and cannot accept another entry.
          </p> : <form action={saveEmployeeEmploymentMetadataAction} aria-label="Record employment metadata"
            className="mt-4 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="business_id" value={workspace.business.id} />
            <input type="hidden" name="venue_id" value={workspace.venue.id} />
            <input type="hidden" name="employee_id" value={employeeId} />
            <input type="hidden" name="people_origin" value="profile" />
            <input type="hidden" name="people_filters" value={serializePeopleFilters(filters)} />
            <input type="hidden" name="revision" value={snapshot.revision} />
            <input type="hidden" name="request_id" value={randomUUID()} />
            <label className="text-sm">Effective date
              <input type="date" name="effective_on" required min="1900-01-01" max="9999-12-31"
                defaultValue={today} className={fieldClass} />
            </label>
            <label className="text-sm">Employment basis
              <select name="employment_basis" defaultValue={current?.employment_basis ?? "unknown"} className={fieldClass}>
                {Object.entries(employmentBases).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div>
              <label className="text-sm">Classification (optional)
                <input name="classification" maxLength={100} defaultValue={current?.classification ?? ""}
                  className={fieldClass} aria-describedby="classification-help" />
              </label>
              <p id="classification-help" className="mt-1 text-xs text-muted">Blank means unknown.</p>
            </div>
            <label className="text-sm">Award reference (optional)
              <input name="award_reference" maxLength={255} defaultValue={current?.award_reference ?? ""}
                className={fieldClass} />
            </label>
            <label className="text-sm">Contract reference (optional)
              <input name="contract_reference" maxLength={255} defaultValue={current?.contract_reference ?? ""}
                className={fieldClass} />
            </label>
            <button type="submit" className="self-end rounded-lg bg-ocean px-4 py-3 font-semibold text-white">
              Record employment details
            </button>
          </form>}
        </section>
        <section aria-label="Employment metadata history" className="mt-6 break-words rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold">Employment history</h2>
          {history.length ? <ol className="mt-3 space-y-3">
            {history.map((event) => <li key={event.id} className="rounded-lg border border-line p-4 text-sm">
              <p className="font-semibold">Effective {event.effective_on} · revision {event.revision}</p>
              <p>Employment basis: {employmentBases[event.employment_basis]}</p>
              <p>Classification: {event.classification ?? "Unknown"}</p>
              <p>Award reference: {event.award_reference ?? "Not recorded"}</p>
              <p>Contract reference: {event.contract_reference ?? "Not recorded"}</p>
              <p className="mt-2 text-xs text-muted">
                Recorded {new Date(event.recorded_at).toLocaleString("en-AU", { timeZone: workspace.venue.timezone })}
                {" "}by {event.actor_id} · {event.source === "profile_edit" ? "profile edit" : "dated editor"}
              </p>
            </li>)}
          </ol> : <p className="mt-2 text-sm text-muted">No dated employment history has been recorded.</p>}
        </section>
      </>}
    </AppShell>
  );
}
