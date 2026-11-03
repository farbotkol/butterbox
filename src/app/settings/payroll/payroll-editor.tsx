"use client";

import { useEffect, useRef, useState } from "react";
import { savePayrollMappingAction } from "@/app/actions";
import { InlineEditor, SaveButton } from "@/components/inline-editor";
import { serializePayrollDirectoryFilters, type PayrollDirectoryFilters } from "@/lib/payroll-directory";
import {
  payrollProviders, type PayrollEmployeeMapping, type PayrollMappingConnection,
} from "@/lib/payroll-mapping";
import { payrollFieldClass } from "./payroll-field";

export function PayrollEditor({
  businessId, venueId, venueName, connection, mapping, filters, requestId,
}: {
  businessId: string; venueId: string; venueName: string; connection: PayrollMappingConnection;
  mapping: PayrollEmployeeMapping; filters: PayrollDirectoryFilters; requestId: string;
}) {
  return <InlineEditor label="Edit mapping"
    read={<p className="text-sm text-muted">Review this employee and destination before changing the mapping.</p>}
    editor={<PayrollEditForm businessId={businessId} venueId={venueId} venueName={venueName}
      connection={connection} mapping={mapping} filters={filters} requestId={requestId} />} />;
}

function PayrollEditForm({
  businessId, venueId, venueName, connection, mapping, filters, requestId,
}: {
  businessId: string; venueId: string; venueName: string; connection: PayrollMappingConnection;
  mapping: PayrollEmployeeMapping; filters: PayrollDirectoryFilters; requestId: string;
}) {
  const [externalId, setExternalId] = useState(mapping.external_employee_id ?? "");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const normalizedId = externalId.trim() || null;
  const changed = normalizedId !== mapping.external_employee_id;
  const removing = mapping.external_employee_id !== null && normalizedId === null;

  return <form action={savePayrollMappingAction} className="mt-4 space-y-4">
    <h3 ref={heading} tabIndex={-1} className="font-semibold">Edit mapping</h3>
    <input type="hidden" name="business_id" value={businessId} />
    <input type="hidden" name="venue_id" value={venueId} />
    <input type="hidden" name="connection_id" value={connection.id} />
    <input type="hidden" name="employee_id" value={mapping.employee_id} />
    <input type="hidden" name="revision" value={mapping.revision} />
    <input type="hidden" name="request_id" value={requestId} />
    <input type="hidden" name="operation" value="mapping" />
    <input type="hidden" name="directory_filters" value={serializePayrollDirectoryFilters(filters)} />
    <p className="break-words text-sm text-muted [overflow-wrap:anywhere]">
      Destination: {connection.name} · {payrollProviders[connection.provider]} · Account ID: {connection.account_id}.
      Venue: {venueName}.
    </p>
    <label className="block text-sm font-medium">Payroll employee ID
      <input name="external_employee_id" value={externalId} onChange={(event) => setExternalId(event.target.value)}
        maxLength={255} autoComplete="off" className={payrollFieldClass} />
    </label>
    <p className="text-sm text-muted">
      IDs are case-sensitive. To remove an existing mapping, clear the ID and confirm the removal below.
    </p>
    <label className="block text-sm font-medium">Reason for mapping change
      <input name="reason" required maxLength={500} className={payrollFieldClass} />
    </label>
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="confirm_destination" value="yes" required className="mt-1" />
      <span>I confirmed the destination and account shown above for this employee.</span>
    </label>
    {removing && <div className="space-y-3 rounded-lg border border-line bg-soft-sand p-4">
      <p className="text-sm">
        Removing this mapping blocks provider-ready records for this employee. Existing audit and reconciliation
        history is retained; no payroll is sent.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm_removal" value="yes" required className="mt-1" />
        <span>I confirm removal of this employee&apos;s payroll mapping.</span>
      </label>
    </div>}
    {changed ? <SaveButton className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
      {removing ? "Confirm and remove mapping" : "Save payroll ID"}
    </SaveButton> : <button type="button" disabled
      className="min-h-11 cursor-not-allowed rounded-lg bg-ocean px-4 py-2 font-semibold text-white opacity-50">
      Save payroll ID
    </button>}
  </form>;
}
