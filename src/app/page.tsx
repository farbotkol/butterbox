import { ArrowUpRight, CalendarClock, CircleAlert, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  addDays,
  formatDay,
  getWeekStart,
  localMidnightAsUtc,
  getWorkspace,
} from "@/lib/workspace";

type HomePageProps = {
  searchParams: Promise<{ week?: string }>;
};

function SetupNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-sm sm:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f4d56d] text-xl font-black text-[#173d32]">
          b
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7a22]">
          First, connect your workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Welcome to Butterbox</h1>
        <p className="mt-3 leading-7 text-[#747d77]">
          Add your Supabase project settings to enable secure sign-in and
          persistent venue data. The setup guide walks through the local
          database and environment configuration.
        </p>
        <Link
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#173d32] px-5 py-3 text-sm font-semibold text-white hover:bg-[#225643]"
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
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof UsersRound;
}) {
  return (
    <section className="rounded-2xl border border-[#e6e8df] bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[#747d77]">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eff4ec] text-[#285c43]">
          <Icon size={19} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-xs text-[#8a928c]">{note}</p>
    </section>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    return (
      <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">Workspace unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-[#747d77]">
          Check that the database migration has been applied and that your
          account has a business membership.
        </p>
      </main>
    );
  }

  const params = await searchParams;
  const week = getWeekStart(params.week, workspace.venue.timezone);
  const weekEnd = addDays(week, 7);
  const startAt = localMidnightAsUtc(week, workspace.venue.timezone);
  const endAt = localMidnightAsUtc(weekEnd, workspace.venue.timezone);

  const [
    { data: shifts },
    { data: employees },
    { data: departments },
  ] = await Promise.all([
    workspace.supabase
      .from("shifts")
      .select("id, employee_id, department_id, starts_at, ends_at, is_published")
      .eq("venue_id", workspace.venue.id)
      .eq("status", "scheduled")
      .gte("starts_at", startAt)
      .lt("starts_at", endAt),
    workspace.supabase
      .from("employees")
      .select("id, active")
      .eq("venue_id", workspace.venue.id)
      .eq("active", true),
    workspace.supabase
      .from("departments")
      .select("id, name")
      .eq("venue_id", workspace.venue.id)
      .order("name"),
  ]);

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

  return (
    <AppShell
      businessName={workspace.business.name}
      email={workspace.user.email ?? ""}
      role={workspace.membership.role}
      venueName={workspace.venue.name}
    >
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#747d77]">{weekLabel}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[34px]">
            Good to see you
          </h1>
          <p className="mt-2 text-[#747d77]">
            Here&apos;s the shape of your team&apos;s week.
          </p>
        </div>
        <Link
          href={`/roster?week=${week}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#173d32] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#225643]"
        >
          Open weekly roster <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={UsersRound}
          label="Staff on this week"
          note={`${employees?.length ?? 0} active in this venue`}
          value={String(staffed)}
        />
        <MetricCard
          icon={CalendarClock}
          label="Scheduled hours"
          note="Based on the current draft and published roster"
          value={`${hours} hrs`}
        />
        <MetricCard
          icon={CircleAlert}
          label="Open shifts"
          note="Unassigned shifts that need cover"
          value={String(openCount)}
        />
        <MetricCard
          icon={CalendarClock}
          label="Published"
          note={`${roster.filter((shift) => shift.is_published).length} of ${roster.length} shifts shared`}
          value={
            roster.length > 0 && roster.every((shift) => shift.is_published)
              ? "Ready"
              : "In draft"
          }
        />
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-2xl border border-[#e6e8df] bg-white p-6 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Staffing at a glance</h2>
              <p className="mt-1 text-sm text-[#747d77]">{weekLabel}</p>
            </div>
            <Link href={`/roster?week=${week}`} className="text-sm font-semibold text-[#285c43] hover:underline">
              View roster
            </Link>
          </div>
          <div className="mt-6 space-y-5">
            {(departments ?? []).map((department) => {
              const count = roster.filter(
                (shift) => shift.department_id === department.id,
              ).length;
              const percent = roster.length
                ? Math.round((count / roster.length) * 100)
                : 0;
              return (
                <div key={department.id}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-medium">{department.name}</span>
                    <span className="text-[#747d77]">{count} shifts</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#f0f1eb]">
                    <div
                      className="h-full rounded-full bg-[#3e7959]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(!departments || departments.length === 0) && (
              <p className="rounded-xl bg-[#f7f8f3] p-4 text-sm text-[#747d77]">
                Departments will appear here when they are set up.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#e6e8df] bg-[#fff9e6] p-6 sm:p-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4d56d] text-[#173d32]">
            <CircleAlert size={19} aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-lg font-semibold">A good week starts here</h2>
          <p className="mt-2 text-sm leading-6 text-[#6e6958]">
            Keep an eye on uncovered shifts and publish the roster when your
            team is ready. Published shifts are visible to staff.
          </p>
          <Link
            href={`/roster?week=${week}`}
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#173d32] hover:underline"
          >
            Plan this week <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
