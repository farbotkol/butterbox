import Link from "next/link";
import { helpHref } from "@/lib/help";
import {
  DEFAULT_PAYROLL_FILTERS, filterAndSortPayrollMappings, parsePayrollDirectoryFilters,
  payrollDirectoryHref, payrollEmployeeHref, payrollNewDestinationHref, PAYROLL_DIRECTORY_PAGE_SIZE,
  serializePayrollDirectoryFilters,
} from "@/lib/payroll-directory";
import { payrollProviders, type PayrollEmployeeMapping } from "@/lib/payroll-mapping";
import { PayrollFeedback } from "./payroll-feedback";
import { payrollFieldClass } from "./payroll-field";
import { PayrollHistoryReset } from "./payroll-history";
import { PayrollShell, PayrollUnavailable } from "./payroll-shell";
import {
  loadPayrollConnections, loadPayrollMappings, requirePayrollWorkspace, selectPayrollConnection,
  type PayrollSearch,
} from "./payroll-workspace";

function employeeLabel(mapping: PayrollEmployeeMapping) {
  return mapping.employee_name || "(Unnamed employee)";
}

export default async function PayrollMappingPage({ searchParams }: { searchParams: Promise<PayrollSearch> }) {
  const search = await searchParams;
  const workspace = await requirePayrollWorkspace(search);
  if (!workspace) return <PayrollUnavailable />;
  const connections = await loadPayrollConnections(workspace);
  const connection = selectPayrollConnection(connections, search.connection);
  const mappings = connection ? await loadPayrollMappings(workspace, connection) : [];
  const filters = parsePayrollDirectoryFilters(search);
  const selectedFilters = filters ?? DEFAULT_PAYROLL_FILTERS;
  const filtered = filters ? filterAndSortPayrollMappings(mappings, filters) : [];
  const pages = Math.max(1, Math.ceil(filtered.length / PAYROLL_DIRECTORY_PAGE_SIZE));
  const currentFilters = { ...selectedFilters, page: Math.min(selectedFilters.page, pages) };
  const visible = filtered.slice(
    (currentFilters.page - 1) * PAYROLL_DIRECTORY_PAGE_SIZE,
    currentFilters.page * PAYROLL_DIRECTORY_PAGE_SIZE,
  );
  const mappedCount = mappings.filter((mapping) => mapping.external_employee_id !== null).length;
  const { id: businessId } = workspace.business;
  const { id: venueId } = workspace.venue;
  const connectionId = connection?.id;

  return <PayrollShell workspace={workspace}>
    <PayrollHistoryReset connectionId={connectionId} filters={currentFilters} />
    <h1 className="text-3xl font-semibold">Payroll employee mapping</h1>
    <p className="mt-3 text-sm text-muted">
      Enter exact payroll employee IDs; names are display-only and are never matched automatically.
      Destinations are business-wide; employees shown belong to {workspace.venue.name}.
      This is mapping setup only, not an authenticated provider connection. No payroll is sent.
      Xero and other adapters remain unavailable until separately verified.
    </p>
    <div className="mt-2 flex flex-wrap gap-x-4">
      <Link href={helpHref("payroll", businessId)}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Help with payroll preparation
      </Link>
      <Link href={`/timesheets?venue=${encodeURIComponent(venueId)}&business=${encodeURIComponent(businessId)}`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Return to timesheets
      </Link>
    </div>
    <PayrollFeedback error={search.error} saved={search.saved} />
    <section aria-label="Payroll destinations" className="mt-5 rounded-xl border border-line bg-white p-4">
      <form id="payroll-destination-form" action="/settings/payroll" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="business" value={businessId} />
        <input type="hidden" name="venue" value={venueId} />
        {selectedFilters.q && <input type="hidden" name="q" value={selectedFilters.q} />}
        {selectedFilters.status !== "all" && <input type="hidden" name="status" value={selectedFilters.status} />}
        {selectedFilters.sort !== "name" && <input type="hidden" name="sort" value={selectedFilters.sort} />}
        <label className="min-w-0 basis-full text-sm font-medium lg:flex-1">Payroll destination
          <select key={connectionId ?? "none"} name="connection" defaultValue={connectionId ?? ""} className={payrollFieldClass}
            disabled={connections.length === 0}>
            <option value="" disabled>Choose a destination</option>
            {connections.map((item) => <option key={item.id} value={item.id}>
              {item.name} ({payrollProviders[item.provider]})
            </option>)}
          </select>
        </label>
        <button type="submit" disabled={connections.length === 0}
          className="min-h-11 rounded-lg border border-line px-4 font-semibold disabled:opacity-50">
          Show mappings
        </button>
        <Link href={payrollNewDestinationHref(businessId, venueId, connectionId, currentFilters)}
          className="inline-flex min-h-11 items-center font-semibold text-ocean underline">
          Add mapping destination
        </Link>
      </form>
    </section>
    {search.connection !== undefined && !connection && <p role="alert" className="mt-3">
      The selected payroll destination is unavailable. Choose a destination from this business.
    </p>}
    {connections.length === 0 && <p className="mt-4 rounded-lg border border-line bg-white p-4">
      No payroll destinations have been added. Add a mapping destination to begin; this does not connect a provider.
    </p>}
    {connection && <section aria-label="Employee payroll IDs" className="mt-5">
      <h2 className="break-words text-lg font-semibold">{connection.name}</h2>
      <p className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
        {payrollProviders[connection.provider]} · Account ID: {connection.account_id}. IDs are case-sensitive.
        One ID cannot identify two employees in the same destination.
      </p>
      <p className="mt-2 text-sm text-muted">
        Mapped: {mappedCount} · Missing: {mappings.length - mappedCount}
      </p>
      <form id="payroll-filter-form" key={`${connection.id}:${serializePayrollDirectoryFilters(currentFilters)}`}
        action="/settings/payroll" aria-label="Payroll mapping filters"
        className="mt-4 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="business" value={businessId} />
        <input type="hidden" name="venue" value={venueId} />
        <input type="hidden" name="connection" value={connection.id} />
        <label className="min-w-0 text-sm font-medium">Search employees
          <input type="search" name="q" maxLength={100} defaultValue={selectedFilters.q}
            placeholder="Name, Butterbox ID or payroll ID" className={payrollFieldClass} />
        </label>
        <label className="text-sm font-medium">Mapping status
          <select name="status" defaultValue={selectedFilters.status} className={payrollFieldClass}>
            <option value="all">All mappings</option>
            <option value="mapped">Mapped</option>
            <option value="missing">Missing</option>
          </select>
        </label>
        <label className="text-sm font-medium">Sort by
          <select name="sort" defaultValue={selectedFilters.sort} className={payrollFieldClass}>
            <option value="name">Employee name</option>
            <option value="status">Mapping status</option>
            <option value="payroll-id">Payroll employee ID</option>
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 font-semibold text-white">
            Apply filters
          </button>
          <Link href={payrollDirectoryHref(businessId, venueId, connection.id, DEFAULT_PAYROLL_FILTERS)}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
            Reset filters
          </Link>
        </div>
      </form>
      {!filters && <p role="alert" className="mt-3">The directory filters are unavailable. Reset them and try again.</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Employees</h3>
        <p aria-live="polite" className="text-sm text-muted">
          {filtered.length} {filtered.length === 1 ? "employee" : "employees"}
          {filtered.length !== mappings.length ? ` of ${mappings.length}` : ""}
        </p>
      </div>
      {visible.length === 0 ? <p className="mt-3 rounded-xl border border-line bg-white p-5 text-sm text-muted">
        {mappings.length === 0 ? "No employee profiles in this venue." : "No employees match these filters. Try resetting them."}
      </p> : <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
        <table className="hidden w-full table-fixed text-left text-sm lg:table">
          <thead className="bg-soft-sea text-brand-charcoal"><tr>
            <th scope="col" className="p-3">Employee</th>
            <th scope="col" className="p-3">Butterbox ID</th>
            <th scope="col" className="p-3">Payroll employee ID</th>
            <th scope="col" className="p-3">Status</th>
            <th scope="col" className="p-3">Action</th>
          </tr></thead>
          <tbody>{visible.map((mapping) => <tr key={mapping.employee_id} className="border-t border-line align-top">
            <td className="break-words p-3 font-semibold">{employeeLabel(mapping)}</td>
            <td className="break-all p-3">{mapping.employee_id}</td>
            <td className="break-all p-3">{mapping.external_employee_id ?? "—"}</td>
            <td className="p-3">{mapping.external_employee_id === null ? "Missing" : "Mapped"}</td>
            <td className="p-3">
              <Link href={payrollEmployeeHref(businessId, venueId, connection.id, currentFilters, mapping.employee_id)}
                aria-label={`View mapping for ${employeeLabel(mapping)} (${mapping.employee_id})`}
                className="inline-flex min-h-11 items-center font-semibold text-ocean underline">View</Link>
            </td>
          </tr>)}</tbody>
        </table>
        <ul className="divide-y divide-line lg:hidden">{visible.map((mapping) => <li key={mapping.employee_id} className="p-4">
          <h4 className="break-words font-semibold">{employeeLabel(mapping)}</h4>
          <p className="mt-1 break-all text-xs text-muted">Butterbox ID: {mapping.employee_id}</p>
          <p className="mt-2 break-all text-sm">Payroll employee ID: {mapping.external_employee_id ?? "Not mapped"}</p>
          <p className="mt-1 text-sm">{mapping.external_employee_id === null ? "Missing" : "Mapped"}</p>
          <Link href={payrollEmployeeHref(businessId, venueId, connection.id, currentFilters, mapping.employee_id)}
            aria-label={`View mapping for ${employeeLabel(mapping)} (${mapping.employee_id})`}
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-ocean underline">View mapping</Link>
        </li>)}</ul>
      </div>}
      {pages > 1 && <nav aria-label="Payroll mapping pages" className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        {currentFilters.page > 1 && <Link className="inline-flex min-h-11 items-center font-semibold text-ocean underline"
          href={payrollDirectoryHref(businessId, venueId, connection.id, { ...currentFilters, page: currentFilters.page - 1 })}>
          Previous
        </Link>}
        <span>Page {currentFilters.page} of {pages}</span>
        {currentFilters.page < pages && <Link className="inline-flex min-h-11 items-center font-semibold text-ocean underline"
          href={payrollDirectoryHref(businessId, venueId, connection.id, { ...currentFilters, page: currentFilters.page + 1 })}>
          Next
        </Link>}
      </nav>}
    </section>}
  </PayrollShell>;
}
