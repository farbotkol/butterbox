import {
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleAlert,
  Coins,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { BrandLockup } from "@/components/brand-lockup";
import { CoastalIllustration } from "@/components/coastal-illustration";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { RosterNotificationBanner } from "@/components/roster-notification-banner";
import { parseOnboardingProgress } from "@/lib/onboarding";
import { unreadRosterNotificationCount } from "@/lib/roster-notifications";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  addDays,
  formatDay,
  getVenueDate,
  getWeekStart,
  localMidnightAsUtc,
  getWorkspace,
} from "@/lib/workspace";

type HomePageProps = {
  searchParams: Promise<{ week?: string; business?: string; venue?: string; error?: string; saved?: string }>;
};

function SetupNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-sm sm:p-10">
        <BrandLockup />
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-ocean">
          First, connect your workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Welcome to Butterbox Systems</h1>
        <p className="mt-3 leading-7 text-muted">
          Add your Supabase project settings to enable secure sign-in and
          persistent venue data. The setup guide walks through the local
          database and environment configuration.
        </p>
        <Link
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-ocean px-5 py-3 text-sm font-semibold text-white hover:bg-ocean/90"
          href="/login"
        >
          View sign-in setup <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
  concept = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof UsersRound;
  tone: "sky" | "amber" | "mint" | "coral";
  concept?: boolean;
}) {
  const tones = {
    sky: "border-sky-100 bg-[#f0f9fc] text-sky-800",
    amber: "border-amber-100 bg-[#fff8ed] text-amber-800",
    mint: "border-teal-100 bg-[#eef9f7] text-teal-800",
    coral: "border-rose-100 bg-[#fff4f1] text-rose-800",
  };

  return (
    <section className={`relative overflow-hidden rounded-lg border p-4 shadow-[0_3px_14px_rgba(18,63,74,0.035)] sm:p-5 ${tones[tone]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-normal text-ink">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm">
          <Icon size={19} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 max-w-[28ch] text-xs leading-5 text-muted">{note}</p>
      {concept && <p className="mt-3 inline-flex rounded-full border border-current/20 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-ink">
        Concept · not yet available
      </p>}
    </section>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    const businessUnavailable = "reason" in workspace && workspace.reason === "business_unavailable";
    return (
      <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">Workspace unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {businessUnavailable
            ? "This business is no longer available to your account. Choose another business or contact your administrator."
            : "We couldn't verify your session or load your workspace. Check your connection and account settings, then try again."}
        </p>
        {businessUnavailable && <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/choose-business" className="rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">Choose a business</Link>
          <form action={signOutAction}>
            <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Sign out</button>
          </form>
        </div>}
      </main>
    );
  }

  const week = getWeekStart(params.week, workspace.venue.timezone);
  const weekEnd = addDays(week, 7);
  const startAt = localMidnightAsUtc(week, workspace.venue.timezone);
  const endAt = localMidnightAsUtc(weekEnd, workspace.venue.timezone);

  const [{ data: shifts }, { data: departments }, unreadNotifications, onboarding] = await Promise.all([
    workspace.supabase
      .from("shifts")
      .select("id, employee_id, department_id, starts_at, ends_at, is_published")
      .eq("venue_id", workspace.venue.id)
      .eq("status", "scheduled")
      .gte("starts_at", startAt)
      .lt("starts_at", endAt),
    workspace.supabase
      .from("departments")
      .select("id, name")
      .eq("venue_id", workspace.venue.id)
      .order("name"),
    unreadRosterNotificationCount(workspace.supabase, workspace.business.id, workspace.venue.id),
    workspace.membership.role === "owner"
      ? workspace.supabase.rpc("get_onboarding_progress", { p_business_id: workspace.business.id })
      : Promise.resolve(null),
  ]);
  const onboardingProgress = onboarding ? parseOnboardingProgress(onboarding.data) : null;
  if (onboarding && (onboarding.error || !onboardingProgress)) {
    console.error("Could not load onboarding progress.", {
      code: onboarding.error?.code,
      message: onboarding.error?.message ?? "The server returned invalid onboarding data.",
    });
  }

  const roster = shifts ?? [];
  const staffed = new Set(
    roster.filter((shift) => shift.employee_id).map((shift) => shift.employee_id),
  ).size;
  const openCount = roster.filter((shift) => !shift.employee_id).length;
  const hours = Math.round(
    roster.reduce(
      (sum, shift) =>
        sum +
        Math.max(
          0,
          (new Date(shift.ends_at).getTime() -
            new Date(shift.starts_at).getTime()) /
            3_600_000,
        ),
      0,
    ),
  );
  const weekLabel = `${formatDay(week)} – ${formatDay(addDays(week, 6))}`;
  const dailyCounts = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(week, index);
    return roster.filter(
      (shift) => getVenueDate(shift.starts_at, workspace.venue.timezone) === date,
    ).length;
  });
  const maxDailyShifts = Math.max(1, ...dailyCounts);

  return (
    <AppShell
      businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length}
      email={workspace.user.email ?? ""}
      role={workspace.membership.role}
      venueId={workspace.venue.id} venueName={workspace.venue.name}
    >
      {params.error === "permission" && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
        You don&apos;t have permission to access that page or make that change. No changes were saved.
      </p>}
      {params.error === "workspace" && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
        We couldn&apos;t verify the requested workspace. Check your access and try again.
      </p>}
      {params.saved === "permissions-self-change" && <p role="status" className="mb-5 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
        Your permissions were updated. You may no longer be able to manage business permissions.
      </p>}
      <section className="relative isolate overflow-hidden rounded-lg border border-[#d8e9e7] bg-[#eff8f6] px-5 py-6 sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[43%] opacity-35 md:block">
          <CoastalIllustration className="h-full w-full" />
        </div>
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ocean">
              Made for hospitality <span className="px-1.5 text-sea-glass">·</span> {workspace.venue.name}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#101b36] sm:text-[36px]">
              Butterbox AI Rostering
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted sm:text-base">
              A smarter way to build rosters, keep your team happy, and run a more profitable venue.
            </p>
          </div>
          <Link
            href={`/roster?week=${week}`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-ocean px-5 py-3 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(18,63,74,0.16)] transition hover:bg-ocean/90"
          >
            Open weekly roster <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <RosterNotificationBanner count={unreadNotifications} venueId={workspace.venue.id} businessId={workspace.business.id} />
      {onboarding && (onboardingProgress
        ? <OnboardingChecklist progress={onboardingProgress} venueId={workspace.venue.id} businessId={workspace.business.id} />
        : <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
            We couldn&apos;t load your onboarding checklist. Refresh and try again.
          </p>)}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={ChartNoAxesColumnIncreasing}
          label="Forecast demand"
          note="Connect bookings and weather to forecast staffing needs"
          value="Not connected"
          tone="sky"
          concept
        />
        <MetricCard
          icon={Coins}
          label="Labour optimisation"
          note="Add wage rates to compare labour cost and savings"
          value="Setup needed"
          tone="amber"
          concept
        />
        <MetricCard
          icon={CircleAlert}
          label="Open shifts"
          note="Unassigned shifts that need cover this week"
          value={String(openCount)}
          tone="mint"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Compliance checks"
          note="Configure award, break and maximum-hour rules"
          value="Rules needed"
          tone="coral"
          concept
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)]">
        <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-white shadow-[0_4px_18px_rgba(18,63,74,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ocean">Week at a glance</p>
              <h2 className="mt-1 text-xl font-semibold text-[#101b36]">{weekLabel}</h2>
            </div>
            <Link
              href={`/roster?week=${week}`}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ocean transition hover:bg-soft-sea"
            >
              <CalendarDays size={16} aria-hidden="true" />
              Edit roster
            </Link>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 xl:grid-cols-7 xl:divide-y-0">
            {Array.from({ length: 7 }, (_, index) => {
              const date = addDays(week, index);
              const dayShiftsCount = dailyCounts[index];
              const dayShifts = roster.filter((shift) => getVenueDate(shift.starts_at, workspace.venue.timezone) === date);
              const openDayShifts = dayShifts.filter((shift) => !shift.employee_id).length;
              return (
                <div key={date} className="min-h-[122px] px-3 py-4">
                  <p className="text-xs font-semibold text-muted">{formatDay(date)}</p>
                  <div className="mt-3 flex h-9 items-end">
                    <span
                      className={`block w-full max-w-8 rounded-t-sm ${openDayShifts ? "bg-[#f1bf63]" : "bg-[#59bdc5]"}`}
                      style={{ height: `${Math.max(5, (dayShiftsCount / maxDailyShifts) * 34)}px` }}
                    />
                  </div>
                  <p className="mt-2 text-xl font-semibold tabular-nums text-ink">{dayShiftsCount}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {openDayShifts > 0 ? `${openDayShifts} open` : "shifts planned"}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="grid gap-5 border-t border-line px-5 py-5 sm:grid-cols-3 sm:px-6">
            <div>
              <p className="text-xs text-muted">Scheduled hours</p>
              <p className="mt-1 text-xl font-semibold">{hours} hrs</p>
            </div>
            <div>
              <p className="text-xs text-muted">Team on the roster</p>
              <p className="mt-1 text-xl font-semibold">{staffed} people</p>
            </div>
            <div>
              <p className="text-xs text-muted">Roster shared</p>
              <p className="mt-1 text-xl font-semibold">
                {roster.filter((shift) => shift.is_published).length} / {roster.length} shifts
              </p>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-lg bg-[#123f4a] p-5 text-white shadow-[0_6px_20px_rgba(18,63,74,0.12)] sm:p-6">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-white/10" aria-hidden="true" />
          <div className="relative flex items-center gap-2 text-[#a9e3df]">
            <Sparkles size={18} aria-hidden="true" />
            <h2 className="text-base font-semibold text-white">Butterbox AI Copilot</h2>
          </div>
          <p className="relative mt-2 inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            Concept preview · not yet available
          </p>
          <p className="relative mt-2 text-sm leading-6 text-white/80">
            AI recommendations are a planned capability. Nothing below is generated or connected yet.
          </p>
          <div className="relative mt-5 space-y-0 divide-y divide-white/10">
            <div className="flex gap-3 py-3 first:pt-0">
              <ChartNoAxesColumnIncreasing className="mt-0.5 shrink-0 text-[#76d7e0]" size={17} aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Demand forecast</p>
                <p className="mt-1 text-xs leading-5 text-white/65">Bookings and local weather data are not connected.</p>
              </div>
            </div>
            <div className="flex gap-3 py-3">
              <Coins className="mt-0.5 shrink-0 text-[#f4c36c]" size={17} aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Labour cost insights</p>
                <p className="mt-1 text-xs leading-5 text-white/65">Hourly wage rates are needed to estimate savings.</p>
              </div>
            </div>
            <div className="flex gap-3 py-3 last:pb-0">
              <ShieldCheck className="mt-0.5 shrink-0 text-[#ff9884]" size={17} aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Compliance review</p>
                <p className="mt-1 text-xs leading-5 text-white/65">Add workplace rules to check breaks, hours and conflicts.</p>
              </div>
            </div>
          </div>
          <Link
            href={`/roster?week=${week}#open-shifts`}
            className="relative mt-5 inline-flex items-center gap-2 rounded-md border border-white/20 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Review open shifts <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>

        <section className="rounded-lg border border-line bg-white p-5 shadow-[0_4px_18px_rgba(18,63,74,0.04)] sm:p-6 xl:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Coverage by department</h2>
              <p className="mt-1 text-sm text-muted">Scheduled shifts across your active teams</p>
            </div>
            <UsersRound size={18} className="text-ocean" aria-hidden="true" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(departments ?? []).map((department) => {
              const count = roster.filter(
                (shift) => shift.department_id === department.id,
              ).length;
              const percent = roster.length
                ? Math.round((count / roster.length) * 100)
                : 0;
              return (
                <div key={department.id} className="rounded-lg border border-line/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold">{department.name}</span>
                    <span className="text-sm tabular-nums text-muted">{count}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/60">
                    <div className="h-full rounded-full bg-sea-glass" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted">{count} scheduled shifts</p>
                </div>
              );
            })}
            {(!departments || departments.length === 0) && (
              <p className="rounded-lg bg-soft-sea p-4 text-sm text-muted sm:col-span-2">
                Departments will appear here when they are set up.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
