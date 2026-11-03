import { randomUUID } from "node:crypto";
import Link from "next/link";
import { savePayrollMappingAction } from "@/app/actions";
import { SaveButton } from "@/components/inline-editor";
import { helpHref } from "@/lib/help";
import {
  DEFAULT_PAYROLL_FILTERS, parsePayrollDirectoryFilters, payrollDirectoryHref,
  serializePayrollDirectoryFilters,
} from "@/lib/payroll-directory";
import { payrollProviders } from "@/lib/payroll-mapping";
import { PayrollFeedback } from "../payroll-feedback";
import { payrollFieldClass } from "../payroll-field";
import { PayrollShell, PayrollUnavailable } from "../payroll-shell";
import {
  loadPayrollConnections, requirePayrollWorkspace, selectPayrollConnection, type PayrollSearch,
} from "../payroll-workspace";

export default async function NewPayrollDestinationPage({ searchParams }: { searchParams: Promise<PayrollSearch> }) {
  const search = await searchParams;
  const workspace = await requirePayrollWorkspace(search);
  if (!workspace) return <PayrollUnavailable />;
  const connections = await loadPayrollConnections(workspace);
  const selected = selectPayrollConnection(connections, search.connection);
  const filters = parsePayrollDirectoryFilters(search);
  const invalidContext = !filters || (search.connection !== undefined && !selected);
  const returnFilters = filters ?? DEFAULT_PAYROLL_FILTERS;
  const back = payrollDirectoryHref(workspace.business.id, workspace.venue.id, selected?.id, returnFilters);

  return <PayrollShell workspace={workspace}>
    <h1 className="text-3xl font-semibold">Add mapping destination</h1>
    <p className="mt-3 text-sm text-muted">
      Use the provider&apos;s account or organisation ID, not credentials. This creates mapping configuration only;
      it does not authorise access, connect a provider or send payroll.
    </p>
    <div className="mt-2 flex flex-wrap gap-x-4">
      <Link href={back} className="inline-flex min-h-11 items-center font-semibold text-ocean underline">
        Back to mappings
      </Link>
      <Link href={helpHref("payroll", workspace.business.id)}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Help with payroll preparation
      </Link>
    </div>
    <PayrollFeedback error={search.error} saved={search.saved} />
    {invalidContext ? <p role="alert" className="mt-4">
      The previous directory context is unavailable. Return to mappings before adding a destination.
    </p> : <section aria-label="Add payroll destination" className="mt-5 rounded-xl border border-line bg-white p-5">
      <form action={savePayrollMappingAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="business_id" value={workspace.business.id} />
        <input type="hidden" name="venue_id" value={workspace.venue.id} />
        <input type="hidden" name="connection_id" value={randomUUID()} />
        <input type="hidden" name="request_id" value={randomUUID()} />
        <input type="hidden" name="operation" value="connection" />
        <input type="hidden" name="directory_filters" value={serializePayrollDirectoryFilters(returnFilters)} />
        {selected && <input type="hidden" name="return_connection_id" value={selected.id} />}
        <label className="text-sm font-medium">Provider
          <select name="provider" className={payrollFieldClass}>
            {Object.entries(payrollProviders).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium">Destination name
          <input name="name" required maxLength={100} className={payrollFieldClass} />
        </label>
        <label className="min-w-0 text-sm font-medium">Payroll account ID
          <input name="account_id" required maxLength={255} autoComplete="off" className={payrollFieldClass} />
        </label>
        <div className="flex items-end">
          <SaveButton className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
            Add mapping destination
          </SaveButton>
        </div>
      </form>
    </section>}
  </PayrollShell>;
}
