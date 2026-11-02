import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { withBusiness } from "@/lib/business-selection";
import { addDays, formatDay } from "@/lib/dates";
import {
  illustrativeCostCents, parseHoursLabour, parseIllustrativeRate, parseReportFilter, totalHoursLabour,
  type HoursLabourScope,
} from "@/lib/hours-labour";
import { readAllPages } from "@/lib/paginated-rows";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { timesheetWeek } from "@/lib/weekly-timesheet";
import { formatWorkedDuration } from "@/lib/worked-time";
import { getWorkspace } from "@/lib/workspace";

function costLabel(seconds: number, rate: number | null): string {
  if (rate === null) return "Not estimated";
  const cents = illustrativeCostCents(seconds, rate);
  return cents === null ? "Estimate unavailable" : new Intl.NumberFormat("en-AU", {
    style: "currency", currency: "AUD",
  }).format(cents / 100);
}

export default async function HoursLabourPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const venue = parseReportFilter(params.venue);
  const department = parseReportFilter(params.department);
  const rate = parseIllustrativeRate(params.rate);
  const workspace = await getWorkspace(typeof venue === "string" ? venue : undefined, {
    businessId: params.business, page: true,
  });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load hours and labour workspace.", { message: workspace.message });
    return <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
      <h1 className="text-xl font-semibold">Hours and labour unavailable</h1>
      <p role="alert" className="mt-3 text-sm text-muted">The selected business or venue is unavailable. Check your access and try again.</p>
    </main>;
  }
  const shell = {
    businessName: workspace.business.name, businessId: workspace.business.id,
    businessCount: workspace.businesses.length, venueName: workspace.venue.name,
    email: workspace.user.email ?? "", role: workspace.membership.role,
  };
  if (workspace.membership.role !== "owner") return <AppShell {...shell}>
    <h1 className="text-2xl font-semibold">Hours and labour</h1>
    <p role="alert" className="mt-5 rounded-xl border border-line bg-white p-5">
      Only a business owner can view this report.
    </p>
  </AppShell>;

  const week = timesheetWeek(params.week, workspace.venue.timezone);
  const [venues, departments] = await Promise.all([
    readAllPages<{ id: string; name: string }>((from, to) => workspace.supabase.from("venues")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id).order("name").order("id").range(from, to), (row) => row.id),
    readAllPages<{ id: string; name: string; venue_id: string }>((from, to) => workspace.supabase.from("departments")
      .select("id, name, venue_id", { count: "exact" }).eq("business_id", workspace.business.id).order("name").order("id").range(from, to), (row) => row.id),
  ]);
  const validFilters = venue !== undefined && department !== undefined && rate !== undefined && week !== null &&
    (venue === null || venues.data?.some((row) => row.id === venue)) &&
    (department === null || departments.data?.some((row) => row.id === department && (venue === null || row.venue_id === venue)));
  const scope: HoursLabourScope | null = validFilters ? {
    businessId: workspace.business.id, week, venueId: venue, departmentId: department,
  } : null;
  const report = scope ? await workspace.supabase.rpc("get_hours_labour_report", {
    p_business_id: scope.businessId, p_week_start: scope.week, p_venue_id: scope.venueId, p_department_id: scope.departmentId,
  }) : null;
  const rows = report && scope ? parseHoursLabour(report.data, scope) : null;
  const totals = rows ? totalHoursLabour(rows) : null;
  const loadError = venues.error || departments.error || report?.error || (scope && (!rows || !totals));
  if (loadError) console.error("Could not load hours and labour report.", {
    code: venues.error?.code ?? departments.error?.code ?? report?.error?.code,
    message: venues.error?.message ?? departments.error?.message ?? report?.error?.message ?? "Invalid report totals.",
  });
  const selectedRate = rate ?? null;
  const control = "min-h-11 min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-sm";

  return <AppShell {...shell}>
    <h1 className="text-2xl font-semibold sm:text-3xl">Hours and labour</h1>
    <p className="mt-2 text-sm text-muted">Published scheduled hours compared with currently approved timesheets. Read-only; not a payroll calculation.</p>
    <form action="/reports/hours" aria-label="Report filters" className="mt-5 grid gap-4 rounded-xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-5">
      <input type="hidden" name="business" value={workspace.business.id} />
      <label className="grid gap-1 text-sm">Week containing
        <input type="date" name="week" defaultValue={week ?? ""} className={control} required />
      </label>
      <label className="grid gap-1 text-sm">Venue
        <select name="venue" defaultValue={venue ?? ""} className={control}>
          <option value="">All venues</option>
          {(venues.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Department
        <select name="department" defaultValue={department ?? ""} className={control}>
          <option value="">All departments</option>
          {(departments.data ?? []).map((row) => <option key={row.id} value={row.id}>
            {venues.data?.find((item) => item.id === row.venue_id)?.name} / {row.name}
          </option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Illustrative hourly rate (AUD)
        <input type="number" name="rate" min="0" max="10000" step="0.01"
          defaultValue={typeof params.rate === "string" ? params.rate : ""} className={control} />
      </label>
      <button className="min-h-11 self-end rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90">
        Apply filters
      </button>
    </form>
    {loadError ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
      We couldn&apos;t load a complete report. Check your connection and access, then try again.
    </p> : !scope ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
      Choose a valid week, venue and matching department. The optional rate must be 0 to 10,000 AUD with at most two decimal places; use each filter once.
    </p> : rows && totals && <>
      <h2 className="mt-6 text-lg font-semibold">Week {formatDay(scope.week)} to {formatDay(addDays(scope.week, 6))}</h2>
      <p className="mt-1 text-sm text-muted">Monday timesheet week in each venue&apos;s timezone, not its roster display week. Entries starting in the week are included in full, even when ending outside it.</p>
      <dl aria-label="Report totals" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Scheduled hours", formatWorkedDuration(totals.scheduled_seconds)],
          ["Approved worked hours", formatWorkedDuration(totals.approved_worked_seconds)],
          ["Approved paid hours", formatWorkedDuration(totals.approved_paid_seconds)],
          ["Illustrative approved-time cost", costLabel(totals.approved_paid_seconds, selectedRate)],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-white p-4">
          <dt className="text-sm text-muted">{label}</dt><dd className="mt-2 font-semibold">{value}</dd>
        </div>)}
      </dl>
      <p className="mt-3 text-sm">{totals.approved_entries} approved entries included. {totals.excluded_entries} entries excluded from approved totals; {totals.invalid_entries} have incomplete or invalid clock/break calculations.</p>
      {rows.length === 0 || (totals.scheduled_shifts === 0 && totals.approved_entries === 0 && totals.excluded_entries === 0)
        ? <p className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">No published assigned shifts or timesheet entries for these filters.</p> : null}
      <section aria-label="Venue and department totals" className="mt-5 grid gap-4 lg:grid-cols-2">
        {rows.map((row) => <article key={row.department_id} aria-label={`${row.venue_name} / ${row.department_name}`}
          className="rounded-xl border border-line bg-white p-5">
          <h3 className="font-semibold">{row.venue_name} / {row.department_name}</h3>
          <p className="mt-1 break-words text-xs text-muted">{row.venue_timezone}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt>Scheduled</dt><dd>{formatWorkedDuration(row.scheduled_seconds)} ({row.scheduled_shifts} shifts)</dd></div>
            <div><dt>Approved worked</dt><dd>{formatWorkedDuration(row.approved_worked_seconds)}</dd></div>
            <div><dt>Approved paid</dt><dd>{formatWorkedDuration(row.approved_paid_seconds)}</dd></div>
            <div><dt>Illustrative cost</dt><dd>{costLabel(row.approved_paid_seconds, selectedRate)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted">{row.approved_entries} approved; {row.excluded_entries} excluded ({row.invalid_entries} incomplete/invalid).</p>
          <Link href={withBusiness(`/timesheets?venue=${row.venue_id}&week=${scope.week}`, workspace.business.id)}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
            Review source timesheets
          </Link>
        </article>)}
      </section>
    </>}
    <section aria-labelledby="metric-definitions" className="mt-6 rounded-xl border border-line bg-white p-5">
      <h2 id="metric-definitions" className="text-lg font-semibold">Metric definitions and limitations</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
        <li>Scheduled: full elapsed duration of assigned, scheduled, published shifts; planned breaks are not deducted. Draft, cancelled and unassigned shifts are excluded, matching Timesheet review.</li>
        <li>Approved worked: effective clock duration minus all recorded breaks, for entries with a current approval and valid calculations.</li>
        <li>Approved paid: approved worked time plus paid recorded breaks. Unpaid breaks are excluded. Pending, returned, resubmitted and outdated approvals are not included.</li>
        <li>Source timesheets: use the same week and venue to reconcile approved entries, including sessions recorded under a different department from the employee&apos;s home department. Refresh after corrections, approvals or unlocks.</li>
        <li>Illustrative cost: approved paid hours multiplied by the optional uniform hourly rate, rounded once to AUD cents per displayed total. Rounded department costs can differ from the rounded overall cost. No employee rates, awards, penalties, overtime, minimum engagements, allowances, superannuation or tax are calculated. Not actual payroll, an export or a compliance result.</li>
      </ul>
    </section>
  </AppShell>;
}
