import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DemandHistoryForm } from "@/components/demand-history-form";
import { validTimezone } from "@/lib/attendance";
import { parseBusinessId, withBusiness } from "@/lib/business-selection";
import {
  DEMAND_PAGE_SIZE, demandHistoryHref, MAX_DEMAND_FILE_BYTES, parseDemandImports, parseDemandPage, parseDemandRecords,
  type DemandImport,
} from "@/lib/demand-history";
import { helpHref } from "@/lib/help";
import { getWorkspace } from "@/lib/workspace";

type SearchParams = Record<string, string | string[] | undefined>;
type ReadyWorkspace = Extract<Awaited<ReturnType<typeof getWorkspace>>, { status: "ready" }>;

export default async function DemandHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const venueId = parseBusinessId(params.venue);
  const workspace = await getWorkspace(typeof venueId === "string" ? venueId : undefined, {
    businessId: params.business, page: true,
  });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error" || venueId === null) {
    console.error("Could not load demand history workspace.", {
      message: workspace.status === "error" ? workspace.message : "Invalid venue selection.",
    });
    return <main className="mx-auto mt-20 max-w-lg rounded-xl bg-white p-8">
      <h1 className="text-xl font-semibold">Demand history unavailable</h1>
      <p role="alert" className="mt-3">The selected business or venue is unavailable. Check your access and try again.</p>
      <Link href="/choose-business" className="mt-3 inline-block text-ocean underline">Choose a business</Link>
    </main>;
  }
  return <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
    businessCount={workspace.businesses.length} venueId={workspace.venue.id} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    {workspace.membership.role !== "owner" ? <>
      <h1 className="text-2xl font-semibold">Demand history</h1>
      <p role="alert" className="mt-5 rounded-xl border border-line bg-white p-5">
        Only a business owner can view or import demand history.
      </p>
    </> : <Suspense fallback={<p role="status" className="text-sm text-muted">Loading demand history...</p>}>
      <DemandHistoryContent workspace={workspace} params={params} />
    </Suspense>}
  </AppShell>;
}

function importDescription(item: DemandImport) {
  return item.event_type === "sales" ? "Sales amounts (AUD)" : "Bookings (guest counts)";
}

function ImportProvenance({ item, currentUserId }: { item: DemandImport; currentUserId: string }) {
  const stamp = new Intl.DateTimeFormat("en-AU", {
    timeZone: item.venue_timezone, day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(item.occurred_at));
  return <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
    <div><dt className="font-semibold">Source system</dt><dd className="break-all">{item.source_name}</dd></div>
    <div><dt className="font-semibold">History type</dt><dd>{importDescription(item)}</dd></div>
    <div><dt className="font-semibold">Venue timezone at import</dt><dd className="break-all">{item.venue_timezone}</dd></div>
    <div><dt className="font-semibold">Imported</dt><dd><time dateTime={item.occurred_at}>{stamp}</time></dd></div>
    <div><dt className="font-semibold">Records</dt><dd>{item.entry_count}</dd></div>
    <div><dt className="font-semibold">Imported by</dt><dd className="break-all">
      {item.actor_id === currentUserId ? "Your owner account" : `Owner account ${item.actor_id}`}
    </dd></div>
  </dl>;
}

async function DemandHistoryContent({ workspace, params }: { workspace: ReadyWorkspace; params: SearchParams }) {
  const businessId = workspace.business.id;
  const venueId = workspace.venue.id;
  const importId = parseBusinessId(params.import);
  const page = parseDemandPage(params.page);
  const validVenueTimezone = validTimezone(workspace.venue.timezone);
  const invalid = importId === null || (params.import !== undefined && !importId) || page === null;
  let imports: DemandImport[] | null = null;
  let selected: DemandImport | null = null;
  let records: ReturnType<typeof parseDemandRecords> = null;
  let loadError = invalid;
  if (!invalid && page) {
    if (importId) {
      const result = await workspace.supabase.from("demand_history_imports")
        .select("id, event_type, source_name, venue_timezone, actor_id, entry_count, occurred_at")
        .eq("business_id", businessId).eq("venue_id", venueId).eq("id", importId).maybeSingle();
      const parsed = result.data ? parseDemandImports([result.data]) : null;
      selected = parsed?.[0] ?? null;
      if (result.error || !selected) {
        console.error("Could not load selected demand import.", { code: result.error?.code, message: result.error?.message });
        loadError = true;
      } else {
        const from = (page - 1) * DEMAND_PAGE_SIZE;
        const detail = await workspace.supabase.from("demand_history_records")
          .select("id, source_record_id, original_occurred_at, original_value")
          .eq("business_id", businessId).eq("venue_id", venueId).eq("import_id", selected.id)
          .order("source_record_id").order("id").range(from, from + DEMAND_PAGE_SIZE);
        records = detail.error ? null : parseDemandRecords(detail.data, selected.event_type, selected.venue_timezone);
        if (!records) {
          console.error("Could not load demand import records.", { code: detail.error?.code, message: detail.error?.message });
          loadError = true;
        }
      }
    } else {
      const from = (page - 1) * DEMAND_PAGE_SIZE;
      const result = await workspace.supabase.from("demand_history_imports")
        .select("id, event_type, source_name, venue_timezone, actor_id, entry_count, occurred_at")
        .eq("business_id", businessId).eq("venue_id", venueId)
        .order("occurred_at", { ascending: false }).order("id", { ascending: false })
        .range(from, from + DEMAND_PAGE_SIZE);
      imports = result.error ? null : parseDemandImports(result.data);
      if (!imports) {
        console.error("Could not load demand import history.", { code: result.error?.code, message: result.error?.message });
        loadError = true;
      }
    }
  }
  if (invalid) console.error("Invalid demand history selection.");
  const currentPage = page ?? 1;
  const hasNext = (importId ? records : imports)?.length === DEMAND_PAGE_SIZE + 1;
  const pageHref = (nextPage: number) => demandHistoryHref(businessId, venueId, {
    importId: importId ?? undefined, page: nextPage,
  });

  return <>
    <h1 className="text-2xl font-semibold sm:text-3xl">Demand history</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
      Import sales or booking history for {workspace.venue.name}. This stores historical data only; it does not create forecasts.
    </p>
    <div className="mt-2 flex flex-wrap gap-x-5">
      <Link href={helpHref("demand-history", businessId, venueId)}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Help with demand history
      </Link>
      <Link href={withBusiness(`/reports/hours?contextVenue=${encodeURIComponent(venueId)}`, businessId)}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Hours and labour
      </Link>
      {importId && <Link href={demandHistoryHref(businessId, venueId)}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Import history
      </Link>}
    </div>
    {loadError ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-900">
      We couldn&apos;t load this import history or verify your access. Return to import history and try again.
    </p> : importId && selected && records ? <>
      {params.saved === "1" && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
        Import confirmed. The original records are retained and cannot be overwritten.
      </p>}
      <section aria-labelledby="demand-import-heading" className="mt-5 rounded-xl border border-line bg-white p-4 sm:p-6">
        <h2 id="demand-import-heading" className="text-xl font-semibold">Import provenance</h2>
        <ImportProvenance item={selected} currentUserId={workspace.user.id} />
        <p className="mt-3 break-all text-xs text-muted">Import ID: {selected.id}</p>
      </section>
      <section aria-labelledby="demand-records-heading" className="mt-6">
        <h2 id="demand-records-heading" className="text-xl font-semibold">Original records</h2>
        {records.length === 0 ? <p className="mt-3 text-sm text-muted">No records on this page.</p> :
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
            {records.slice(0, DEMAND_PAGE_SIZE).map((record) => <li key={record.id} className="p-4">
              <p className="break-all font-semibold">{record.source_record_id}</p>
              <p className="mt-1 break-all text-sm">Original timestamp: {record.original_occurred_at}</p>
              <p className="mt-1 text-sm">{selected.event_type === "sales" ? "Sales amount (AUD)" : "Guest count"}: {record.original_value}</p>
            </li>)}
          </ul>}
      </section>
    </> : imports ? <>
      <section aria-labelledby="demand-upload-heading" className="mt-5 rounded-xl border border-line bg-white p-4 sm:p-6">
        <h2 id="demand-upload-heading" className="text-xl font-semibold">Import history</h2>
        <p className="mt-2 text-sm leading-6">
          The timestamps must include an offset matching {workspace.venue.timezone} at each recorded time.
          Source record IDs are case-sensitive and must be unique for this venue, history type and source name.
          A duplicate rejects the whole file; existing records are never overwritten. Check the file before
          importing: this version has no correction or deletion workflow.
        </p>
        <div className="mt-3 space-y-1 text-sm">
          <p>Sales header: <code className="break-all">source_record_id,occurred_at,sales_amount_aud</code></p>
          <p>Bookings header: <code className="break-all">source_record_id,occurred_at,guest_count</code></p>
          <p>Example timestamp: <code>2024-01-15T12:30:00+11:00</code> (Sydney summer).</p>
        </div>
        {validVenueTimezone ? <DemandHistoryForm businessId={businessId} venueId={venueId}
          timezone={workspace.venue.timezone} requestId={randomUUID()} maxFileBytes={MAX_DEMAND_FILE_BYTES} /> :
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-900">
            This venue has an invalid timezone. It must be corrected before importing history.
          </p>}
      </section>
      <section aria-labelledby="demand-history-heading" className="mt-6">
        <h2 id="demand-history-heading" className="text-xl font-semibold">Import history</h2>
        {imports.length === 0 ? <p className="mt-3 text-sm text-muted">
          {currentPage === 1 ? "No history has been imported for this venue yet." : "No imports on this page."}
        </p> : <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
          {imports.slice(0, DEMAND_PAGE_SIZE).map((item) => <li key={item.id} className="p-4">
            <Link href={demandHistoryHref(businessId, venueId, { importId: item.id })}
              className="inline-flex min-h-11 items-center break-all font-semibold text-ocean underline">
              View {importDescription(item).toLowerCase()} import
            </Link>
            <ImportProvenance item={item} currentUserId={workspace.user.id} />
          </li>)}
        </ul>}
      </section>
    </> : null}
    {!loadError && (currentPage > 1 || hasNext) && <nav aria-label="Demand history pages" className="mt-5 flex flex-wrap gap-4">
      {currentPage > 1 && <Link href={pageHref(currentPage - 1)} className="inline-flex min-h-11 items-center font-semibold text-ocean underline">Previous page</Link>}
      <span className="inline-flex min-h-11 items-center text-sm">Page {currentPage}</span>
      {hasNext && <Link href={pageHref(currentPage + 1)} className="inline-flex min-h-11 items-center font-semibold text-ocean underline">Next page</Link>}
    </nav>}
  </>;
}
