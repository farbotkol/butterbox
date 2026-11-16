import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LoadDemoDataForm } from "@/app/settings/demo-data/load-form";
import { demoDataProjectRef } from "@/lib/demo-data-environment";
import { workspaceDemoDataApproved } from "@/lib/demo-data";
import { withBusiness } from "@/lib/business-selection";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

type DemoDataStatus = {
  loaded: boolean;
  loaded_at: string | null;
  counts: Record<string, number>;
  payroll_examples: {
    employee_name: string;
    period_start: string;
    hours_to_review: number;
    note: string;
  }[];
};

const errorMessages: Record<string, string> = {
  disabled: "Demo data is unavailable because this app or database has not been explicitly approved as an isolated development environment.",
  invalid: "Confirm the load and reload this page before trying again.",
  load: "Demo data could not be loaded. No partial demo-data changes were saved; contact the deployment operator if this continues.",
  "not-clean": "Demo data can only be loaded into a clean venue with no existing team, shifts, attendance, roster history, invitations, or payroll integration. No existing records were changed.",
  "publication-mode": "This venue requires roster approval. Demo loading made no changes because it does not change your roster-publication settings.",
  permission: "Only the owner of this workspace can load demo data.",
  status: "Demo-data status could not be loaded. No data has been changed.",
};

const countLabels: Record<string, string> = {
  employees: "fictional employees",
  departments: "demo departments",
  shifts: "published shifts",
  roster_publications: "published roster snapshots",
  availability_intervals: "availability intervals",
  attendance_sessions: "completed attendance sessions",
  corrections: "attributed attendance corrections",
  payroll_examples: "non-payroll preparation examples",
};

export default async function DemoDataPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; venue?: string; business?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, {
    businessId: params.business,
    page: true,
  });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") redirect("/?error=workspace");
  if (workspace.membership.role !== "owner") {
    redirect(withBusiness("/?error=permission", workspace.business.id));
  }

  const projectRef = demoDataProjectRef(process.env);
  const enabled = projectRef !== null && await workspaceDemoDataApproved(workspace.supabase);
  let status: DemoDataStatus | null = null;
  let statusError = false;
  if (enabled) {
    const result = await workspace.supabase.rpc("get_workspace_demo_data_status", {
      p_business_id: workspace.business.id,
      p_venue_id: workspace.venue.id,
    });
    if (result.error) {
      statusError = true;
      console.error("Demo-data status could not be loaded.", {
        code: result.error.code,
        message: result.error.message,
      });
    } else {
      status = result.data as DemoDataStatus;
    }
  }

  const venues = await workspace.supabase.from("venues")
    .select("id, name")
    .eq("business_id", workspace.business.id)
    .order("name");
  if (venues.error) {
    console.error("Could not load demo-data venue choices.", { code: venues.error.code, message: venues.error.message });
  }
  const errorMessage = params.error === "status" || statusError
    ? errorMessages.status
    : errorMessages[params.error ?? ""] ?? null;

  return (
    <AppShell
      businessName={workspace.business.name}
      businessId={workspace.business.id}
      businessCount={workspace.businesses.length}
      venueId={workspace.venue.id}
      venueName={workspace.venue.name}
      email={workspace.user.email ?? ""}
      role={workspace.membership.role}
    >
      <h1 className="text-3xl font-semibold">Demo Data</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Add a tagged fictional team and example operational records to an existing clean development venue.
        Existing workspace settings and records are never deleted or overwritten.
      </p>
      <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
        SIMULATION ONLY — these fictional staff, rosters and attendance examples are not real employment,
        payroll or compliance records.
      </p>
      {errorMessage && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">{errorMessage}</p>}

      {(venues.data?.length ?? 0) > 1 && (
        <form action="/settings/demo-data" method="get" className="mt-5 flex items-end gap-3">
          <input type="hidden" name="business" value={workspace.business.id} />
          <label className="text-sm">Venue
            <select name="venue" defaultValue={workspace.venue.id}
              className="mt-2 block min-h-11 rounded-lg border border-line bg-white p-3">
              {venues.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-lg border border-line px-4 py-3 text-sm font-semibold">
            Show venue
          </button>
        </form>
      )}

      {status?.loaded && (
        <section aria-labelledby="demo-data-status" className="mt-6 rounded-xl border border-line bg-white p-5">
          <h2 id="demo-data-status" className="text-lg font-semibold">Demo data is already loaded</h2>
          <p className="mt-2 text-sm text-muted">
            Repeating this operation is safe and will not create duplicates.
            {status.loaded_at ? ` Last loaded ${new Intl.DateTimeFormat("en-AU", {
              dateStyle: "medium", timeStyle: "short",
            }).format(new Date(status.loaded_at))}.` : ""}
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(countLabels).map(([key, label]) => (
              <div key={key} className="flex justify-between gap-4 border-b border-line py-2">
                <dt>{label}</dt><dd className="font-semibold">{status?.counts?.[key] ?? 0}</dd>
              </div>
            ))}
          </dl>
          {(status.payroll_examples?.length ?? 0) > 0 && (
            <section aria-labelledby="demo-payroll-examples" className="mt-6">
              <h3 id="demo-payroll-examples" className="font-semibold">
                Illustrative payroll-preparation examples — not processed
              </h3>
              <ul className="mt-2 space-y-3">
                {status.payroll_examples.map((example) => (
                  <li key={`${example.employee_name}-${example.period_start}`} className="rounded-lg bg-cloud p-3 text-sm">
                    <p className="font-semibold">{example.employee_name}</p>
                    <p className="mt-1 text-muted">
                      {example.period_start}: {example.hours_to_review} illustrative hours to review.
                    </p>
                    <p className="mt-1 text-muted">{example.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      )}

      {!enabled ? (
        <section className="mt-6 rounded-xl border border-line bg-white p-5">
          <h2 className="text-lg font-semibold">Loading is disabled</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Before activation, an operator must verify this deployment is non-production and the Supabase project is
            dedicated, isolated, and identified. Neither this page URL nor a Vercel project name proves database
            isolation.
          </p>
          <Link href="/settings/organisation" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
            Return to venue settings
          </Link>
        </section>
      ) : !statusError && !status?.loaded ? (
        <section className="mt-6 rounded-xl border border-line bg-white p-5">
          <h2 className="text-lg font-semibold">Load a fictional sample team</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            This adds FOH and BOH departments, fictional employees, availability, published rosters,
            completed attendance with an attributed correction, and clearly marked preparation examples.
            It creates no employee accounts, invitations, external messages, payroll exports, or Xero records.
            The venue must not already contain employees or operational history.
          </p>
          <LoadDemoDataForm businessId={workspace.business.id} venueId={workspace.venue.id} />
        </section>
      ) : null}
    </AppShell>
  );
}
