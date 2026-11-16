import Link from "next/link";
import {
  cancelPendingXeroAuthorizationAction, disconnectXeroOrganizationAction, selectXeroOrganizationAction,
} from "./actions";
import { isXeroUuid } from "@/lib/xero-oauth";
import { requirePayrollWorkspace } from "../payroll-workspace";

type SearchValue = string | string[] | undefined;
type XeroSearch = {
  business?: SearchValue; grant?: SearchValue; error?: SearchValue; connected?: SearchValue;
  disconnected?: SearchValue; cancelled?: SearchValue;
};

const errorText: Record<string, string> = {
  invalid: "The Xero connection request was invalid. Reload this page and try again.",
  configuration: "Xero connection is not configured for this deployment. Ask an owner to finish the secure setup.",
  permission: "Only a business owner or admin can manage the Xero connection.",
  state: "The Xero authorization could not be verified. Start a new connection and try again.",
  cancelled: "Xero authorization was cancelled. No connection was saved.",
  callback: "Xero returned an incomplete authorization response. Start a new connection and try again.",
  provider: "Xero could not complete authorization. Check the Xero app permissions and try again.",
  organization: "No Xero organisation was available to connect. No payroll data was sent.",
  save: "The Xero authorization could not be stored. No connection was enabled.",
  duplicate: "That Xero organisation is already connected to this business.",
  selection: "That organization could not be selected. Refresh the list and try again.",
  disconnect: "Xero could not confirm disconnection or token revocation. The connection was retained.",
  cancel: "The pending Xero authorization could not be revoked. It remains available for a retry.",
  revocation: "Xero rejected token revocation. Reauthorize or review the connection before retrying.",
};

function first(value: SearchValue) {
  return Array.isArray(value) ? undefined : value;
}

export default async function XeroConnectionPage({ searchParams }: { searchParams: Promise<XeroSearch> }) {
  const search = await searchParams;
  const workspace = await requirePayrollWorkspace({ business: search.business });
  if (!workspace) return <p role="alert">Xero connections are unavailable for this business.</p>;

  const { data: connectionRows, error: connectionError } = await workspace.supabase.rpc(
    "list_xero_oauth_tenants", { p_business_id: workspace.business.id },
  );
  const connections = !connectionError && Array.isArray(connectionRows)
    ? connectionRows.filter((row): row is {
      tenant_id: string; tenant_name: string; tenant_type: string; status: string;
    } => row !== null && typeof row === "object" && isXeroUuid(row.tenant_id) &&
      typeof row.tenant_name === "string" && typeof row.tenant_type === "string" &&
    ["active", "reauthorization_required", "revocation_pending"].includes(row.status))
    : [];
  const grant = first(search.grant);
  let pending: { tenant_id: string; tenant_name: string; tenant_type: string }[] = [];
  let pendingError = false;
  if (grant) {
    if (isXeroUuid(grant)) {
      const { data, error } = await workspace.supabase.rpc("list_pending_xero_oauth_tenants", {
        p_business_id: workspace.business.id,
        p_grant_id: grant,
      });
      pendingError = Boolean(error);
      if (!error && Array.isArray(data)) {
        pending = data.filter((row): row is {
          tenant_id: string; tenant_name: string; tenant_type: string;
        } => row !== null && typeof row === "object" && isXeroUuid(row.tenant_id) &&
          typeof row.tenant_name === "string" && row.tenant_type === "ORGANISATION");
      }
    } else {
      pendingError = true;
    }
  }

  const error = first(search.error);
  const message = error && Object.hasOwn(errorText, error) ? errorText[error] : null;
  const businessId = workspace.business.id;

  return <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">
    <Link href={`/settings/payroll?business=${encodeURIComponent(businessId)}`}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
      Back to payroll mappings
    </Link>
    <h1 className="mt-4 text-3xl font-semibold">Xero organization connection</h1>
    <p className="mt-3 max-w-3xl text-sm text-muted">
      Connect an organization to this Butterbox business using Xero OAuth. Only owners and admins can manage
      this connection. The integration does not submit timesheets. Authorization does not confirm that an
      organization has AU Payroll API access; Xero Demo Company Payroll access still requires owner-assisted
      verification.
    </p>
    {message && <p role="alert" className="mt-4 rounded-lg border border-line bg-white p-3">{message}</p>}
    {connectionError && <p role="alert" className="mt-4 rounded-lg border border-line bg-white p-3">
      Connected Xero organizations could not be loaded. Try again later.
    </p>}
    {first(search.connected) === "1" && <p role="status" className="mt-4">Xero organization connected to this business.</p>}
    {first(search.disconnected) === "1" && <p role="status" className="mt-4">Xero organization disconnected.</p>}
    {first(search.cancelled) === "1" && <p role="status" className="mt-4">Pending Xero authorization revoked.</p>}

    <form method="post" action="/api/xero/oauth/authorize" className="mt-5">
      <input type="hidden" name="business" value={businessId} />
      <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 font-semibold text-white">
        Connect to Xero
      </button>
    </form>

    {grant && <section aria-labelledby="xero-select-heading" className="mt-6 rounded-xl border border-line bg-white p-4">
      <h2 id="xero-select-heading" className="text-xl font-semibold">Choose a Xero organization</h2>
      <p className="mt-2 text-sm text-muted">
        Select the organization to associate with {workspace.business.name}. This does not send payroll.
      </p>
      {pendingError && <p role="alert" className="mt-3">Available organizations could not be loaded. Reconnect and try again.</p>}
      {!pendingError && pending.length === 0 && <p className="mt-3">No available organization was returned by Xero.</p>}
      <ul className="mt-3 space-y-3">
        {pending.map((tenant) => <li key={tenant.tenant_id}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="min-w-0">
            <p className="break-words font-semibold">{tenant.tenant_name}</p>
            <p className="text-sm text-muted">Xero organization · {tenant.tenant_type}</p>
          </div>
          <form action={selectXeroOrganizationAction}>
            <input type="hidden" name="business" value={businessId} />
            <input type="hidden" name="grant" value={grant} />
            <input type="hidden" name="tenant" value={tenant.tenant_id} />
            <button type="submit" className="min-h-11 rounded-lg border border-line px-4 font-semibold">
              Select organization
            </button>
          </form>
        </li>)}
      </ul>
      <form action={cancelPendingXeroAuthorizationAction} className="mt-4 border-t border-line pt-3">
        <input type="hidden" name="business" value={businessId} />
        <input type="hidden" name="grant" value={grant} />
        <button type="submit" className="min-h-11 rounded-lg border border-line px-4 font-semibold">
          Cancel pending Xero authorization
        </button>
      </form>
    </section>}

    <section aria-labelledby="xero-connected-heading" className="mt-6 rounded-xl border border-line bg-white p-4">
      <h2 id="xero-connected-heading" className="text-xl font-semibold">Connected organizations</h2>\n      {connections.length > 0 && <p className="mt-2 text-sm text-muted">\n        Each connected organisation is automatically available as a payroll mapping destination.\n        Employee IDs must still be reviewed before any payroll export.\n      </p>}
      {!connectionError && connections.length === 0 && <p className="mt-3 text-sm text-muted">
        No Xero organization is connected to this business.
      </p>}
      <ul className="mt-3 space-y-3">
        {connections.map((connection) => <li key={connection.tenant_id}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="min-w-0">
            <p className="break-words font-semibold">{connection.tenant_name}</p>
            <p className="text-sm text-muted">
              {connection.status === "reauthorization_required" ? "Reauthorization required" :
                connection.status === "revocation_pending" ? "Disconnection pending" : "Connected"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">\n          <Link href={`/settings/payroll?business=${encodeURIComponent(businessId)}`}\n            className="inline-flex min-h-11 items-center font-semibold text-ocean underline">\n            Manage employee mappings\n          </Link>\n          <form action={disconnectXeroOrganizationAction}>
            <input type="hidden" name="business" value={businessId} />
            <input type="hidden" name="tenant" value={connection.tenant_id} />
            <button type="submit" className="min-h-11 rounded-lg border border-line px-4 font-semibold">
              Disconnect
            </button>
          </form>
        </li>)}
      </ul>
    </section>
  </main>;
}
