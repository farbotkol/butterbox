import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { savePayrollMappingAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { isPayrollUuid } from "@/lib/generic-payroll-exports";
import { readAllPages } from "@/lib/paginated-rows";
import {
  parsePayrollConnections, parsePayrollEmployeeMappings, payrollProviders,
  type PayrollEmployeeMapping, type PayrollMappingConnection,
} from "@/lib/payroll-mapping";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const errors: Record<string, string> = {
  invalid: "Choose valid IDs and enter a reason. Account and employee IDs must be 255 characters or fewer.",
  permission: "Only an owner or admin can manage payroll mappings for this business.",
  venue: "The selected venue is unavailable. Check your access and try again.",
  duplicate: "This payroll employee ID is already assigned to another employee in this connection.",
  stale: "The mapping changed or already has that value. Review the refreshed entry before saving.",
  "connection-exists": "This payroll account already has a destination with different details. Select the existing destination.",
  retry: "The request was already used. Review the refreshed mapping before saving.",
  save: "We couldn't confirm the mapping change. Refresh and check it before retrying.",
};
const fieldClass = "mt-1 block w-full min-w-0 rounded-lg border border-line bg-white p-2 text-sm";

export default async function PayrollMappingPage({ searchParams }: {
  searchParams: Promise<{ venue?: string; connection?: string; error?: string; saved?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load payroll mappings.", { message: workspace.message });
    return <main className="m-5"><h1 className="text-xl font-semibold">Payroll mappings unavailable</h1>
      <p role="alert">Check your venue access and try again.</p></main>;
  }
  if (!["owner", "admin"].includes(workspace.membership.role)) redirect("/?error=permission");
  const connectionsResult = await readAllPages<PayrollMappingConnection>((from, to) =>
    workspace.supabase.rpc("list_payroll_mapping_connections", {
      p_business_id: workspace.business.id,
    }, { count: "exact" }).order("name").order("id").range(from, to), (row) => row.id);
  const connections = parsePayrollConnections(connectionsResult.data);
  const connection = params.connection === undefined ? connections?.[0]
    : isPayrollUuid(params.connection)
      ? connections?.find((item) => item.id.toLowerCase() === params.connection?.toLowerCase()) : undefined;
  const mappingResult = connection ? await readAllPages<PayrollEmployeeMapping>((from, to) =>
    workspace.supabase.rpc("list_payroll_employee_mappings", {
      p_business_id: workspace.business.id, p_connection_id: connection.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("employee_name").order("employee_id").range(from, to), (row) => row.employee_id)
    : { data: [], error: null };
  const mappings = parsePayrollEmployeeMappings(mappingResult.data);
  const loadError = connectionsResult.error || mappingResult.error || !connections || !mappings;
  if (loadError) console.error("Could not load payroll mapping data.", {
    code: connectionsResult.error?.code ?? mappingResult.error?.code,
    message: connectionsResult.error?.message ?? mappingResult.error?.message ?? "Invalid payroll mapping data.",
  });
  const hidden = (operation: "connection" | "mapping", connectionId: string) => <>
    <input type="hidden" name="venue_id" value={workspace.venue.id} />
    <input type="hidden" name="connection_id" value={connectionId} />
    <input type="hidden" name="request_id" value={randomUUID()} />
    <input type="hidden" name="operation" value={operation} />
  </>;

  return <AppShell businessName={workspace.business.name} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <h1 className="text-3xl font-semibold">Payroll employee mapping</h1>
    <p className="mt-3 text-sm text-muted">
      Enter the exact employee IDs from your payroll account; names are display-only and never matched automatically.
      Destinations are business-wide; employees below belong to {workspace.venue.name}.
      This is mapping setup only, not an authenticated provider connection. No payroll is sent.
      Xero and other adapters remain unavailable until separately verified.
    </p>
    <Link href={`/timesheets?venue=${workspace.venue.id}`} className="mt-3 inline-block font-semibold text-ocean">
      Return to timesheets
    </Link>
    {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">
      {Object.hasOwn(errors, params.error) ? errors[params.error] : errors.save}
    </p>}
    {params.saved && ["connection", "mapping"].includes(params.saved) &&
      <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-ocean">
        {params.saved === "connection" ? "Payroll mapping destination created. No provider has been connected."
          : "Payroll employee mapping saved with an audit record."}
      </p>}
    {loadError ? <p role="alert" className="mt-4">We couldn&apos;t load payroll mappings. Refresh before making changes.</p>
      : <>
        <form action="/settings/payroll" className="mt-5 rounded-xl border border-line bg-white p-4">
          <input type="hidden" name="venue" value={workspace.venue.id} />
          <label htmlFor="payroll-connection">Payroll destination</label>
          <select id="payroll-connection" name="connection" defaultValue={connection?.id ?? ""} className={fieldClass}>
            <option value="" disabled>Choose a destination</option>
            {connections?.map((item) => <option key={item.id} value={item.id}>
              {item.name} ({payrollProviders[item.provider]})
            </option>)}
          </select>
          <button type="submit" className="mt-3 min-h-11 rounded-lg border border-line px-4 font-semibold">
            Show mappings
          </button>
        </form>
        {params.connection !== undefined && !connection && <p role="alert" className="mt-3">
          The selected payroll destination is unavailable. Choose a destination from this business.
        </p>}
        {connection && <section aria-label="Employee payroll IDs" className="mt-5">
          <h2 className="text-lg font-semibold">{connection.name}</h2>
          <p className="mt-2 break-all text-sm text-muted">Account ID: {connection.account_id}. IDs are case-sensitive.
            An employee has one ID per destination; the same ID cannot identify two employees in that destination.
            Leave the ID blank to remove a mapping. Removal blocks provider-ready records for that employee.
          </p>
          {mappings?.length === 0 && <p className="mt-3">No employee profiles in this venue.</p>}
          <ul className="mt-4 space-y-3">
            {mappings?.map((mapping) => <li key={mapping.employee_id} id={`payroll-employee-${mapping.employee_id}`}
              className="rounded-xl border border-line bg-white p-4">
              <h3 className="break-words font-semibold">{mapping.employee_name}</h3>
              <p className="mt-1 break-all text-xs text-muted">Butterbox employee ID: {mapping.employee_id}</p>
              <p className="mt-1 text-sm">{mapping.external_employee_id === null ? "Missing payroll mapping" : "Explicit payroll ID saved"}</p>
              <form action={savePayrollMappingAction} aria-label={`Payroll ID for ${mapping.employee_name}`}
                className="mt-3 grid gap-3 sm:grid-cols-2">
                {hidden("mapping", connection.id)}
                <input type="hidden" name="employee_id" value={mapping.employee_id} />
                <input type="hidden" name="revision" value={mapping.revision} />
                <label className="min-w-0 text-sm">Payroll employee ID
                  <input name="external_employee_id" maxLength={255} defaultValue={mapping.external_employee_id ?? ""}
                    className={fieldClass} autoComplete="off" />
                </label>
                <label className="min-w-0 text-sm">Reason for mapping change
                  <input name="reason" required maxLength={500} className={fieldClass} />
                </label>
                <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
                  Save payroll ID
                </button>
              </form>
            </li>)}
          </ul>
        </section>}
        <section aria-label="Add payroll destination" className="mt-6 rounded-xl border border-line bg-white p-4">
          <h2 className="text-lg font-semibold">Add mapping destination</h2>
          <p className="mt-2 text-sm text-muted">Use the provider&apos;s account or organisation ID, not credentials.
            This does not authorise access or enable an integration.</p>
          <form action={savePayrollMappingAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            {hidden("connection", randomUUID())}
            <div className="text-sm">
              <label htmlFor="payroll-provider">Provider</label>
              <select id="payroll-provider" name="provider" className={fieldClass}>
                {Object.entries(payrollProviders).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
            <label className="min-w-0 text-sm">Destination name
              <input name="name" required maxLength={100} className={fieldClass} />
            </label>
            <label className="min-w-0 text-sm">Payroll account ID
              <input name="account_id" required maxLength={255} autoComplete="off" className={fieldClass} />
            </label>
            <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
              Add mapping destination
            </button>
          </form>
        </section>
      </>}
  </AppShell>;
}
