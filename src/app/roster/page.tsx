import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Plus,
  Send,
  Trash2,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  deleteShiftAction,
  publishRosterAction,
  saveShiftAction,
} from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  addDays,
  formatDay,
  formatTime,
  getVenueDate,
  getWeekStart,
  localMidnightAsUtc,
  getWorkspace,
} from "@/lib/workspace";

type RosterPageProps = {
  searchParams: Promise<{
    week?: string;
    department?: string;
    error?: string;
    saved?: string;
    deleted?: string;
    published?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid: "Check the shift details and try again.",
  overlap: "That employee already has a shift during this time.",
  permission: "You don't have permission to change that department's roster.",
  save: "We couldn't save that shift. Check the date, employee and role.",
  delete: "We couldn't delete that shift. Published shifts cannot be deleted.",
  publish: "We couldn't publish this roster. Check your permissions and try again.",
};

function isManager(role: string) {
  return ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"].includes(role);
}

function weekInput(date: string, hour: number) {
  return `${date}T${String(hour).padStart(2, "0")}:00`;
}

export default async function RosterPage({ searchParams }: RosterPageProps) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") redirect("/?error=workspace");

  const params = await searchParams;
  const week = getWeekStart(params.week, workspace.venue.timezone);
  const weekEnd = addDays(week, 7);
  const startAt = localMidnightAsUtc(week, workspace.venue.timezone);
  const endAt = localMidnightAsUtc(weekEnd, workspace.venue.timezone);
  const [{ data: departmentRows }, { data: employeeRows }] = await Promise.all([
    workspace.supabase
      .from("departments")
      .select("id, name")
      .eq("venue_id", workspace.venue.id)
      .order("name"),
    workspace.supabase
      .from("employees")
      .select("id, name, department_id, role_title")
      .eq("venue_id", workspace.venue.id)
      .eq("active", true)
      .order("name"),
  ]);
  let departments = departmentRows ?? [];
  if (workspace.membership.department_id) {
    departments = departments.filter(
      (department) => department.id === workspace.membership.department_id,
    );
  }
  const selectedDepartment =
    params.department === "all"
      ? undefined
      : departments.find((department) => department.id === params.department)?.id ??
        departments[0]?.id;

  const { data: shifts } = await workspace.supabase
    .from("shifts")
    .select(
      "id, department_id, employee_id, role_title, starts_at, ends_at, break_minutes, is_published",
    )
    .eq("venue_id", workspace.venue.id)
    .eq("status", "scheduled")
    .gte("starts_at", startAt)
    .lt("starts_at", endAt)
    .order("starts_at");

  const visibleShifts = (shifts ?? []).filter(
    (shift) => !selectedDepartment || shift.department_id === selectedDepartment,
  );
  const employees = (employeeRows ?? []).filter(
    (employee) => !selectedDepartment || employee.department_id === selectedDepartment,
  );
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const canManage = isManager(workspace.membership.role);
  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const previousWeek = addDays(week, -7);
  const nextWeek = addDays(week, 7);
  const weekLabel = `${formatDay(week)} – ${formatDay(addDays(week, 6))}`;

  return (
    <AppShell
      businessName={workspace.business.name}
      email={workspace.user.email ?? ""}
      role={workspace.membership.role}
      venueName={workspace.venue.name}
    >
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-muted">Rostering</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-[34px]">
            Weekly roster
          </h1>
          <p className="mt-2 text-muted">
            Build a balanced week for your FOH and BOH teams.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-2 sm:justify-start">
          <Link
            href={`/roster?week=${previousWeek}${selectedDepartment ? `&department=${selectedDepartment}` : ""}`}
            aria-label="Previous week"
            className="rounded-lg p-2 text-muted hover:bg-soft-sea"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div className="min-w-[155px] text-center text-sm font-semibold">
            {weekLabel}
          </div>
          <Link
            href={`/roster?week=${nextWeek}${selectedDepartment ? `&department=${selectedDepartment}` : ""}`}
            aria-label="Next week"
            className="rounded-lg p-2 text-muted hover:bg-soft-sea"
          >
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form action="/roster" className="flex items-center gap-2">
          <input type="hidden" name="week" value={week} />
          <label htmlFor="department-filter" className="text-sm text-muted">
            Department
          </label>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-ocean"
            defaultValue={selectedDepartment ?? (departments.length > 1 ? "all" : "")}
            id="department-filter"
            name="department"
          >
            {departments.length > 1 && <option value="all">All departments</option>}
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </form>
        <div className="flex items-center gap-2 text-sm text-muted">
          <UsersRound size={17} aria-hidden="true" />
          <span>
            {visibleShifts.filter((shift) => shift.employee_id).length} assigned
            <span className="mx-2 text-muted/40">·</span>
            {visibleShifts.filter((shift) => !shift.employee_id).length} open
          </span>
        </div>
      </div>

      {(errorMessage || params.saved || params.deleted || params.published) && (
        <p
          role={errorMessage ? "alert" : "status"}
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            errorMessage
              ? "bg-red-50 text-red-800"
              : "bg-soft-sea text-ocean"
          }`}
        >
          {errorMessage ??
            (params.saved
              ? "Shift saved to the draft roster."
              : params.deleted
                ? "Draft shift removed."
                : `${selectedDepartment ? departments.find((item) => item.id === selectedDepartment)?.name : "Roster"} roster published.`)}
        </p>
      )}

      {canManage && selectedDepartment && (
        <section className="mt-5 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-soft-sea text-ocean">
                <Plus size={19} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold">Add a shift</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Times use {workspace.venue.timezone.replaceAll("_", " ")} local time.
                </p>
              </div>
            </div>
            <form action={publishRosterAction}>
              <input name="week" type="hidden" value={week} />
              <input
                name="department_id"
                type="hidden"
                value={selectedDepartment}
              />
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-sea-glass/50 px-4 py-2.5 text-sm font-semibold text-ocean transition hover:bg-soft-sea"
                type="submit"
              >
                <Send size={16} aria-hidden="true" />
                Publish this department
              </button>
            </form>
          </div>
          <form action={saveShiftAction} className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <input name="week" type="hidden" value={week} />
            <input
              name="department_id"
              type="hidden"
              value={selectedDepartment}
            />
            <label className="text-xs font-medium text-muted">
              Role
              <input
                className="mt-1.5 block w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:border-ocean"
                maxLength={80}
                name="role_title"
                placeholder="Barista"
                required
              />
            </label>
            <label className="text-xs font-medium text-muted">
              Team member
              <select
                className="mt-1.5 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-ocean"
                defaultValue=""
                name="employee_id"
              >
                <option value="">Open shift</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} · {employee.role_title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted">
              Starts
              <input
                className="mt-1.5 block w-full min-w-0 rounded-lg border border-line px-2.5 py-2.5 text-sm text-ink outline-none focus:border-ocean"
                defaultValue={weekInput(week, 8)}
                name="start"
                required
                type="datetime-local"
              />
            </label>
            <label className="text-xs font-medium text-muted">
              Ends
              <input
                className="mt-1.5 block w-full min-w-0 rounded-lg border border-line px-2.5 py-2.5 text-sm text-ink outline-none focus:border-ocean"
                defaultValue={weekInput(week, 16)}
                name="end"
                required
                type="datetime-local"
              />
            </label>
            <label className="text-xs font-medium text-muted">
              Break (mins)
              <input
                className="mt-1.5 block w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:border-ocean"
                defaultValue={30}
                max={240}
                min={0}
                name="break_minutes"
                type="number"
              />
            </label>
            <div className="flex items-end">
              <button
                className="w-full rounded-lg bg-ocean px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean/90"
                type="submit"
              >
                Save draft shift
              </button>
            </div>
          </form>
        </section>
      )}

      {canManage && !selectedDepartment && departments.length > 1 && (
        <p className="mt-5 rounded-lg border border-line bg-white px-4 py-3 text-sm text-muted">
          Choose a department to add shifts or publish its roster.
        </p>
      )}

      {!canManage && (
        <p className="mt-5 rounded-xl border border-line bg-white p-4 text-sm text-muted">
          This roster is view-only. Contact your manager if you need a change.
        </p>
      )}

      <section className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-[0_4px_18px_rgba(18,63,74,0.04)]">
        <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Team roster</h2>
            <p className="mt-1 text-xs text-muted">
              Shifts by team member and day · times shown in venue local time
            </p>
          </div>
          <CalendarDays size={18} className="text-muted" aria-hidden="true" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="bg-[#eff7f6]">
                <th className="sticky left-0 z-10 min-w-48 border-b border-r border-line bg-[#eff7f6] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ocean/75">
                  Team member
                </th>
                {days.map((date) => {
                  const dayShifts = visibleShifts.filter(
                    (shift) => getVenueDate(shift.starts_at, workspace.venue.timezone) === date,
                  );
                  return (
                    <th key={date} className="min-w-28 border-b border-line px-3 py-3 align-top">
                      <span className="block text-xs font-semibold text-ink">{formatDay(date)}</span>
                      <span className="mt-1 block text-[11px] font-normal text-muted">
                        {dayShifts.length} {dayShifts.length === 1 ? "shift" : "shifts"}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-b border-line/70 last:border-0">
                  <th className="sticky left-0 z-10 border-r border-line bg-white px-4 py-3 align-top">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {employee.name}
                    </span>
                    <span className="mt-1 block truncate text-xs font-normal text-muted">
                      {employee.role_title}
                    </span>
                  </th>
                  {days.map((date) => {
                    const employeeShifts = visibleShifts.filter(
                      (shift) =>
                        shift.employee_id === employee.id &&
                        getVenueDate(shift.starts_at, workspace.venue.timezone) === date,
                    );
                    return (
                      <td key={date} className="border-r border-line/60 px-2 py-2 align-top last:border-r-0">
                        <div className="space-y-1.5">
                          {employeeShifts.map((shift) => (
                            <article
                              key={shift.id}
                              className={`rounded-md border px-2 py-2 ${shift.is_published ? "border-teal-200 bg-[#eaf7f4]" : "border-sky-200 bg-[#eef6fb]"}`}
                            >
                              <p className="text-[11px] font-semibold leading-4 text-ink">
                                {formatTime(shift.starts_at, workspace.venue.timezone)} –{" "}
                                {formatTime(shift.ends_at, workspace.venue.timezone)}
                              </p>
                              <p className="mt-1 truncate text-[10px] text-muted">
                                {shift.role_title}
                              </p>
                              <div className="mt-1 flex items-center justify-between gap-1">
                                <span className={`text-[9px] font-semibold ${shift.is_published ? "text-teal-800" : "text-sky-800"}`}>
                                  {shift.is_published ? "Published" : "Draft"}
                                </span>
                                {canManage && !shift.is_published && (
                                  <form action={deleteShiftAction}>
                                    <input name="shift_id" type="hidden" value={shift.id} />
                                    <input name="week" type="hidden" value={week} />
                                    <button
                                      className="rounded p-1 text-muted/70 hover:bg-white hover:text-red-700"
                                      aria-label={`Delete ${employee.name} shift`}
                                      title="Delete draft shift"
                                      type="submit"
                                    >
                                      <Trash2 size={12} aria-hidden="true" />
                                    </button>
                                  </form>
                                )}
                              </div>
                            </article>
                          ))}
                          {employeeShifts.length === 0 && (
                            <span className="block px-2 py-3 text-center text-[11px] text-muted/50">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted">
                    Add active team members to build a weekly roster.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-amber-200 bg-[#fffaf0] shadow-[0_4px_18px_rgba(18,63,74,0.035)]" id="open-shifts">
        <div className="flex items-center justify-between border-b border-amber-100 bg-[#fff7e8] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Open shifts</h2>
            <p className="mt-1 text-xs text-muted">
              Unassigned coverage for this week
            </p>
          </div>
          <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {visibleShifts.filter((shift) => !shift.employee_id).length} to fill
          </span>
        </div>
        {visibleShifts.some((shift) => !shift.employee_id) ? (
          <div className="divide-y divide-line/70">
            {visibleShifts
              .filter((shift) => !shift.employee_id)
              .map((shift) => (
                <div key={shift.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold">{shift.role_title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {departments.find((department) => department.id === shift.department_id)?.name ?? "Team"}
                      {" · "}{formatDay(getVenueDate(shift.starts_at, workspace.venue.timezone))}
                      {" · "}{formatTime(shift.starts_at, workspace.venue.timezone)} –{" "}
                      {formatTime(shift.ends_at, workspace.venue.timezone)}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-amber-800">Needs cover</span>
                </div>
              ))}
          </div>
        ) : (
          <p className="px-5 py-5 text-sm text-muted">No unassigned shifts this week.</p>
        )}
      </section>
    </AppShell>
  );
}
