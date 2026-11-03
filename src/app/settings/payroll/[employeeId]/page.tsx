import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isPayrollUuid } from "@/lib/generic-payroll-exports";
import { helpHref } from "@/lib/help";
import {
  DEFAULT_PAYROLL_FILTERS, parsePayrollDirectoryFilters, payrollDirectoryHref,
} from "@/lib/payroll-directory";
import { payrollProviders } from "@/lib/payroll-mapping";
import { PayrollEditor } from "../payroll-editor";
import { PayrollFeedback } from "../payroll-feedback";
import { PayrollShell, PayrollUnavailable } from "../payroll-shell";
import {
  loadPayrollConnections, loadPayrollMappings, requirePayrollWorkspace, selectPayrollConnection,
  type PayrollSearch,
} from "../payroll-workspace";

export default async function PayrollEmployeePage({ params, searchParams }: {
  params: Promise<{ employeeId: string }>; searchParams: Promise<PayrollSearch>;
}) {
  const [{ employeeId }, search] = await Promise.all([params, searchParams]);
  const workspace = await requirePayrollWorkspace(search);
  if (!workspace) return <PayrollUnavailable />;
  const filters = parsePayrollDirectoryFilters(search);
  const connections = await loadPayrollConnections(workspace);
  const connection = selectPayrollConnection(connections, search.connection);
  if (!isPayrollUuid(employeeId) || !connection) notFound();
  if (!filters) return <PayrollShell workspace={workspace}>
    <h1 className="text-2xl font-semibold">Payroll mapping unavailable</h1>
    <p role="alert" className="mt-3">The directory filters are unavailable. Reset them and try again.</p>
    <Link href={payrollDirectoryHref(workspace.business.id, workspace.venue.id, connection.id, DEFAULT_PAYROLL_FILTERS)}
      className="mt-3 inline-flex min-h-11 items-center font-semibold text-ocean underline">Reset filters</Link>
  </PayrollShell>;
  const mappings = await loadPayrollMappings(workspace, connection);
  const mapping = mappings.find((item) => item.employee_id.toLowerCase() === employeeId.toLowerCase());
  if (!mapping) notFound();
  const name = mapping.employee_name || "(Unnamed employee)";

  return <PayrollShell workspace={workspace}>
    <h1 className="text-3xl font-semibold">Employee payroll mapping</h1>
    <p className="mt-2 text-sm text-muted">
      Review the selected employee and destination. Mapping setup does not connect a provider or send payroll.
    </p>
    <Link href={payrollDirectoryHref(workspace.business.id, workspace.venue.id, connection.id, filters)}
      className="mt-3 inline-flex min-h-11 items-center font-semibold text-ocean underline">Back to mappings</Link>
    <PayrollFeedback error={search.error} saved={search.saved} />
    <section aria-label={`Payroll mapping for ${name}`} className="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 className="break-words text-xl font-semibold">{name}</h2>
      <p className="mt-1 break-all text-xs text-muted">Butterbox employee ID: {mapping.employee_id}</p>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Business</dt><dd className="break-words">{workspace.business.name}</dd></div>
        <div><dt className="font-semibold">Venue</dt><dd className="break-words">{workspace.venue.name}</dd></div>
        <div><dt className="font-semibold">Payroll destination</dt><dd className="break-words">{connection.name}</dd></div>
        <div><dt className="font-semibold">Provider</dt><dd>{payrollProviders[connection.provider]}</dd></div>
        <div><dt className="font-semibold">Account ID</dt><dd className="break-all">{connection.account_id}</dd></div>
        <div><dt className="font-semibold">Mapping status</dt>
          <dd>{mapping.external_employee_id === null ? "Missing" : "Mapped"}</dd></div>
        <div><dt className="font-semibold">Payroll employee ID</dt>
          <dd className="break-all">{mapping.external_employee_id ?? "Not mapped"}</dd></div>
      </dl>
      <div className="mt-4 border-t border-line pt-4">
        <PayrollEditor businessId={workspace.business.id} venueId={workspace.venue.id}
          venueName={workspace.venue.name} connection={connection} mapping={mapping}
          filters={filters} requestId={randomUUID()} />
      </div>
    </section>
    <p className="mt-4 text-sm text-muted">
      Changes retain their existing audit history. Removing an ID blocks provider-ready records for this employee.
    </p>
    <Link href={helpHref("payroll", workspace.business.id)}
      className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
      Help with payroll preparation
    </Link>
  </PayrollShell>;
}
