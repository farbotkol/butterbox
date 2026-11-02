import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { withBusiness } from "@/lib/business-selection";
import {
  auditOperations, auditSources, parseAuditFilters, parseAuditRows,
} from "@/lib/sensitive-action-audit";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

type AuditSearch = {
  business?: string; source?: string; operation?: string; actor?: string; from?: string; to?: string; page?: string;
};
const pageSize = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditSearch> }) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(undefined, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the audit workspace.", { message: workspace.message });
    return <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
      <h1 className="text-xl font-semibold">Audit history unavailable</h1>
      <p role="alert" className="mt-3 text-sm text-muted">
        We couldn&apos;t load this business. Check your access and try again.
      </p>
      <Link href="/choose-business" className="mt-4 inline-block font-semibold text-ocean">Choose a business</Link>
    </main>;
  }
  if (workspace.membership.role !== "owner") redirect(withBusiness("/?error=permission", workspace.business.id));

  const filters = parseAuditFilters(params);
  let rows = null;
  let count: number | null = null;
  let failed = false;
  if (filters) {
    let query = workspace.supabase.from("sensitive_action_audit")
      .select("id, business_id, actor_id, actor_kind, source_table, operation, record_id, old_values, new_values, reason, occurred_at",
        { count: "exact" })
      .eq("business_id", workspace.business.id);
    if (filters.source) query = query.eq("source_table", filters.source);
    if (filters.operation) query = query.eq("operation", filters.operation);
    if (filters.actor) query = query.eq("actor_id", filters.actor);
    if (filters.from) query = query.gte("occurred_at", filters.from);
    if (filters.to) query = query.lt("occurred_at", filters.to);
    const offset = (filters.page - 1) * pageSize;
    const response = await query.order("occurred_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    rows = parseAuditRows(response.data, workspace.business.id);
    count = response.count;
    failed = Boolean(response.error || !rows || count === null);
    if (failed) {
      console.error("Could not load sensitive action audit history.", {
        code: response.error?.code,
        message: response.error?.message ?? "The server returned incomplete audit data.",
      });
    }
  }
  const pageHref = (page: number) => {
    const query = new URLSearchParams({ business: workspace.business.id, page: String(page) });
    for (const key of ["source", "operation", "actor", "from", "to"] as const) {
      if (params[key]) query.set(key, params[key]);
    }
    return `/settings/audit?${query}`;
  };
  const inputStyle = "mt-1 block w-full rounded-lg border border-line bg-white p-2 text-sm";

  return <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
    businessCount={workspace.businesses.length} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <h1 className="text-3xl font-semibold">Sensitive action audit</h1>
    <p className="mt-3 text-sm leading-6 text-muted">
      Owner-only history of staffing, permissions, timekeeping and payroll changes recorded since this audit
      feature was installed. Earlier domain histories remain on their original screens. Records are read-only;
      each shows the actor, business, UTC timestamp and allowed before/after fields. Contact email, credentials,
      captured GPS positions and arbitrary metadata are not copied. Database-service changes are labelled separately.
    </p>
    <form action="/settings/audit" aria-label="Filter audit history"
      className="mt-5 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="business" value={workspace.business.id} />
      <label className="text-sm">Change category
        <select name="source" defaultValue={filters?.source ?? ""} className={inputStyle}>
          <option value="">All categories</option>
          {Object.entries(auditSources).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="text-sm">Operation
        <select name="operation" defaultValue={filters?.operation ?? ""} className={inputStyle}>
          <option value="">All operations</option>
          {auditOperations.map((operation) => <option key={operation} value={operation}>{operation}</option>)}
        </select>
      </label>
      <label className="text-sm">Actor user ID
        <input name="actor" defaultValue={filters?.actor ?? ""} className={inputStyle} />
      </label>
      <label className="text-sm">From date (UTC)
        <input type="date" name="from" defaultValue={filters ? params.from ?? "" : ""} className={inputStyle} />
      </label>
      <label className="text-sm">Through date (UTC)
        <input type="date" name="to" defaultValue={filters ? params.to ?? "" : ""} className={inputStyle} />
      </label>
      <button type="submit" className="min-h-11 self-end rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">
        Apply audit filters
      </button>
    </form>
    {!filters && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      Invalid audit filters. Choose a listed category and operation, a valid actor UUID and a valid UTC date range.
    </p>}
    {failed && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      We couldn&apos;t load the audit history. Refresh and check your access before trying again.
    </p>}
    {filters && !failed && rows && count !== null && <>
      <p role="status" className="mt-4 text-sm text-muted">{count} audit records match. Page {filters.page}.</p>
      {rows.length === 0 ? <p className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">
        No audit records on this page.
      </p> : <ol aria-label="Sensitive action history" className="mt-4 space-y-3">
        {rows.map((row) => <li key={row.id} className="rounded-xl border border-line bg-white p-4 text-sm">
          <h2 className="font-semibold">{auditSources[row.source_table]} · {row.operation}</h2>
          <p className="mt-1 break-all">Actor: {row.actor_kind === "database" ? "Database service (no user session)"
            : row.actor_id === workspace.user.id ? `You (${row.actor_id})` : row.actor_id}</p>
          <p className="mt-1 break-all">Business: {row.business_id} · Record: {row.record_id}</p>
          <p className="mt-1"><time dateTime={row.occurred_at}>{new Date(row.occurred_at).toISOString()}</time></p>
          {row.reason && <p className="mt-2 break-words">Reason: {row.reason}</p>}
          <details className="mt-3">
            <summary className="cursor-pointer font-semibold">Before and after values</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div><h3 className="font-semibold">Before</h3>
                <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-cloud p-3 text-xs">
                  {row.old_values === null ? "Not present" : JSON.stringify(row.old_values, null, 2)}
                </pre>
              </div>
              <div><h3 className="font-semibold">After</h3>
                <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-cloud p-3 text-xs">
                  {row.new_values === null ? "Not present" : JSON.stringify(row.new_values, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        </li>)}
      </ol>}
      <nav aria-label="Audit pages" className="mt-4 flex gap-4 text-sm font-semibold text-ocean">
        {filters.page > 1 && <Link href={pageHref(filters.page - 1)} className="min-h-11 py-3">Previous audit page</Link>}
        {filters.page * pageSize < count && <Link href={pageHref(filters.page + 1)} className="min-h-11 py-3">Next audit page</Link>}
      </nav>
    </>}
  </AppShell>;
}
