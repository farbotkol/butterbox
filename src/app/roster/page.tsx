import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
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
    departments.find((department) => department.id === params.department)?.id ??
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
  const employeeNames = new Map(
    employees.map((employee) => [employee.id, employee.name]),
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
          <p className="text-sm font-medium text-[#747d77]">Rostering</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[34px]">
            Weekly roster
          </h1>
          <p className="mt-2 text-[#747d77]">
            Build a balanced week for your FOH and BOH teams.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e6e8df] bg-white p-2 sm:justify-start">
          <Link
            href={`/roster?week=${previousWeek}${selectedDepartment ? `&department=${selectedDepartment}` : ""}`}
            aria-label="Previous week"
            className="rounded-lg p-2 text-[#53625a] hover:bg-[#f1f3eb]"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div className="min-w-[155px] text-center text-sm font-semibold">
            {weekLabel}
          </div>
          <Link
            href={`/roster?week=${nextWeek}${selectedDepartment ? `&department=${selectedDepartment}` : ""}`}
            aria-label="Next week"
            className="rounded-lg p-2 text-[#53625a] hover:bg-[#f1f3eb]"
          >
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form action="/roster" className="flex items-center gap-2">
          <input type="hidden" name="week" value={week} />
          <label htmlFor="department-filter" className="text-sm text-[#747d77]">
            Department
          </label>
          <select
            className="rounded-lg border border-[#e0e4da] bg-white px-3 py-2 text-sm font-medium outline-none focus:border-[#173d32]"
            defaultValue={selectedDepartment ?? ""}
            id="department-filter"
            name="department"
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </form>
        <div className="flex items-center gap-2 text-sm text-[#747d77]">
          <UsersRound size={17} aria-hidden="true" />
          <span>
            {visibleShifts.filter((shift) => shift.employee_id).length} assigned
            <span className="mx-2 text-[#c2c7bf]">·</span>
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
              : "bg-[#edf6ed] text-[#24543e]"
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
        <section className="mt-5 rounded-2xl border border-[#e6e8df] bg-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eff4ec] text-[#285c43]">
                <Plus size={19} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold">Add a shift</h2>
                <p className="mt-0.5 text-xs text-[#747d77]">
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
                className="inline-flex items-center gap-2 rounded-xl border border-[#dce4da] px-4 py-2.5 text-sm font-semibold text-[#285c43] transition hover:bg-[#f4f7f1]"
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
            <label className="text-xs font-medium text-[#647169]">
              Role
              <input
                className="mt-1.5 block w-full rounded-lg border border-[#e0e4da] px-3 py-2.5 text-sm text-[#1d2723] outline-none focus:border-[#173d32]"
                maxLength={80}
                name="role_title"
                placeholder="Barista"
                required
              />
            </label>
            <label className="text-xs font-medium text-[#647169]">
              Team member
              <select
                className="mt-1.5 block w-full rounded-lg border border-[#e0e4da] bg-white px-3 py-2.5 text-sm text-[#1d2723] outline-none focus:border-[#173d32]"
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
            <label className="text-xs font-medium text-[#647169]">
              Starts
              <input
                className="mt-1.5 block w-full min-w-0 rounded-lg border border-[#e0e4da] px-2.5 py-2.5 text-sm text-[#1d2723] outline-none focus:border-[#173d32]"
                defaultValue={weekInput(week, 8)}
                name="start"
                required
                type="datetime-local"
              />
            </label>
            <label className="text-xs font-medium text-[#647169]">
              Ends
              <input
                className="mt-1.5 block w-full min-w-0 rounded-lg border border-[#e0e4da] px-2.5 py-2.5 text-sm text-[#1d2723] outline-none focus:border-[#173d32]"
                defaultValue={weekInput(week, 16)}
                name="end"
                required
                type="datetime-local"
              />
            </label>
            <label className="text-xs font-medium text-[#647169]">
              Break (mins)
              <input
                className="mt-1.5 block w-full rounded-lg border border-[#e0e4da] px-3 py-2.5 text-sm text-[#1d2723] outline-none focus:border-[#173d32]"
                defaultValue={30}
                max={240}
                min={0}
                name="break_minutes"
                type="number"
              />
            </label>
            <div className="flex items-end">
              <button
                className="w-full rounded-lg bg-[#173d32] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#225643]"
                type="submit"
              >
                Save draft shift
              </button>
            </div>
          </form>
        </section>
      )}

      {!canManage && (
        <p className="mt-5 rounded-xl border border-[#e6e8df] bg-white p-4 text-sm text-[#747d77]">
          This roster is view-only. Contact your manager if you need a change.
        </p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {days.map((date) => {
          const dayShifts = visibleShifts.filter(
            (shift) => getVenueDate(shift.starts_at, workspace.venue.timezone) === date,
          );
          return (
            <section
              key={date}
              className="min-h-[205px] overflow-hidden rounded-2xl border border-[#e6e8df] bg-white"
            >
              <header className="flex items-center justify-between border-b border-[#edf0e9] px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">{formatDay(date)}</h2>
                  <p className="mt-0.5 text-xs text-[#8a928c]">
                    {dayShifts.length} {dayShifts.length === 1 ? "shift" : "shifts"}
                  </p>
                </div>
                <CalendarDays size={17} className="text-[#8a928c]" aria-hidden="true" />
              </header>
              <div className="space-y-2 p-3">
                {dayShifts.map((shift) => {
                  const departmentName =
                    departments.find((department) => department.id === shift.department_id)
                      ?.name ?? "Team";
                  const employeeName = shift.employee_id
                    ? employeeNames.get(shift.employee_id) ?? "Team member"
                    : "Open shift";
                  return (
                    <article
                      key={shift.id}
                      className={`rounded-xl border p-3 ${
                        shift.employee_id
                          ? "border-[#e8ece4] bg-[#fbfcf8]"
                          : "border-dashed border-[#d8c77d] bg-[#fff9e6]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{employeeName}</p>
                          <p className="mt-1 truncate text-xs text-[#747d77]">
                            {shift.role_title} · {departmentName}
                          </p>
                        </div>
                        {canManage && !shift.is_published && (
                          <form action={deleteShiftAction}>
                            <input name="shift_id" type="hidden" value={shift.id} />
                            <input name="week" type="hidden" value={week} />
                            <button
                              className="rounded-md p-1 text-[#8a928c] hover:bg-white hover:text-red-700"
                              aria-label={`Delete ${employeeName} shift`}
                              title="Delete draft shift"
                              type="submit"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </form>
                        )}
                      </div>
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#53625a]">
                        <Clock3 size={14} aria-hidden="true" />
                        {formatTime(shift.starts_at, workspace.venue.timezone)} –{" "}
                        {formatTime(shift.ends_at, workspace.venue.timezone)}
                        {shift.break_minutes > 0 && (
                          <span className="ml-auto text-[#8a928c]">
                            {shift.break_minutes}m break
                          </span>
                        )}
                      </p>
                      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#8a928c]">
                        {shift.is_published ? "Published" : "Draft"}
                      </p>
                    </article>
                  );
                })}
                {dayShifts.length === 0 && (
                  <p className="py-7 text-center text-xs text-[#a0a69f]">
                    No shifts planned
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
