import { redirect } from "next/navigation";
import { saveEmployeeAction, setEmployeeDepartmentsAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

type Employee = {
  id: string;
  name: string;
  email: string | null;
  department_id: string;
  role_title: string;
  employment_type: string;
  active: boolean;
};
type Department = { id: string; name: string; active?: boolean };

function EmployeeForm({ employee, departments, venueId }: { employee?: Employee; departments: Department[]; venueId: string }) {
  const fieldClass = "mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink";
  return (
    <form action={saveEmployeeAction} className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <input type="hidden" name="venue_id" value={venueId} />
      {employee && <input type="hidden" name="employee_id" value={employee.id} />}
      <label className="text-sm">Name
        <input name="name" required maxLength={100} defaultValue={employee?.name} className={fieldClass} />
      </label>
      <label className="text-sm">Preferred contact email
        <input name="email" type="email" maxLength={254} defaultValue={employee?.email ?? ""} className={fieldClass} />
      </label>
      <label className="text-sm">Department
        <select name="department_id" required defaultValue={employee?.department_id ?? departments[0]?.id} className={fieldClass}>
          {departments.filter((department) => !employee || department.id === employee.department_id)
            .map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </label>
      <label className="text-sm">Job role
        <input name="role_title" required maxLength={80} defaultValue={employee?.role_title} className={fieldClass} />
      </label>
      <label className="text-sm">Employment type
        <select name="employment_type" defaultValue={employee?.employment_type ?? "casual"} className={fieldClass}>
          <option value="casual">Casual</option>
          <option value="part_time">Part time</option>
          <option value="full_time">Full time</option>
        </select>
      </label>
      <label className="text-sm">Status
        <select name="active" defaultValue={employee?.active === false ? "false" : "true"} className={fieldClass}>
          <option value="true">Active</option>
          <option value="false">Archived</option>
        </select>
      </label>
      <button type="submit" className="rounded-lg bg-ocean px-4 py-3 font-semibold text-white">
        {employee ? "Save employee" : "Add employee"}
      </button>
    </form>
  );
}

function DepartmentMembershipForm({ employee, departments, linkedIds, venueId }: {
  employee: Employee; departments: Department[]; linkedIds: string[]; venueId: string;
}) {
  const choices = departments.filter((department) => department.active || linkedIds.includes(department.id));
  return (
    <form action={setEmployeeDepartmentsAction} aria-label={`Departments for ${employee.name}`} className="mt-4 rounded-lg border border-line p-4">
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="employee_id" value={employee.id} />
      <input type="hidden" name="department_ids" value={employee.department_id} />
      <fieldset>
        <legend className="text-sm font-semibold">Works in departments</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {choices.map((department) => (
            <label key={department.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="department_ids" value={department.id}
                defaultChecked={linkedIds.includes(department.id)} disabled={department.id === employee.department_id} />
              {department.name}{department.id === employee.department_id ? " (primary)" : ""}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Save departments</button>
    </form>
  );
}

export default async function PeoplePage({
  searchParams,
}: { searchParams: Promise<{ error?: string; saved?: string; venue?: string; department?: string; role?: string; q?: string; status?: string }> }) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") redirect("/?error=workspace");
  if (!["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"].includes(workspace.membership.role)) {
    redirect("/?error=permission");
  }
  const params = await searchParams;
  const venues = await workspace.supabase.from("venues").select("id, name")
    .eq("business_id", workspace.business.id).order("name");
  const selectedVenue = venues.data?.find((venue) => venue.id === (params.venue ?? workspace.venue.id));
  if (!venues.error && !selectedVenue) {
    console.error("Directory requested an unavailable venue.");
    redirect("/people?error=filter");
  }
  const venueId = selectedVenue?.id ?? workspace.venue.id;
  const [departments, roles] = await Promise.all([
    workspace.supabase.from("departments").select("id, name, active").eq("venue_id", venueId).order("name"),
    workspace.supabase.from("employees").select("role_title").eq("venue_id", venueId).order("role_title"),
  ]);
  const roleTitles = [...new Set(roles.data?.map((employee) => employee.role_title) ?? [])];
  if ((!departments.error && params.department && !departments.data?.some((department) => department.id === params.department)) ||
    (!roles.error && params.role && !roleTitles.includes(params.role)) ||
    (params.status && !["all", "active", "archived"].includes(params.status))) {
    console.error("Directory requested an unavailable filter.");
    redirect("/people?error=filter");
  }
  const query = (params.q ?? "").trim().slice(0, 100);
  let employeesQuery = workspace.supabase.from("employees")
    .select("id, name, email, department_id, role_title, employment_type, active")
    .eq("venue_id", venueId).order("name");
  if (params.department) {
    const members = await workspace.supabase.from("employee_departments").select("employee_id")
      .eq("department_id", params.department);
    employeesQuery = employeesQuery.in("id", members.data?.map((member) => member.employee_id) ?? []);
  }
  if (params.role) employeesQuery = employeesQuery.eq("role_title", params.role);
  if (params.status && params.status !== "all") employeesQuery = employeesQuery.eq("active", params.status === "active");
  if (query) employeesQuery = employeesQuery.ilike("name", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
  const employees = await employeesQuery;
  const links = await workspace.supabase.from("employee_departments").select("employee_id, department_id")
    .in("employee_id", employees.data?.map((employee) => employee.id) ?? []);
  const linkedDepartments = (employeeId: string) =>
    links.data?.filter((link) => link.employee_id === employeeId).map((link) => link.department_id) ?? [];
  const departmentName = (id: string) => departments.data?.find((department) => department.id === id)?.name;
  const canAssignDepartments = ["owner", "admin", "general_manager"].includes(workspace.membership.role);
  const loadError = venues.error || departments.error || roles.error || employees.error || links.error;
  if (loadError) console.error("Could not load employee profiles.", loadError);
  return (
    <AppShell businessName={workspace.business.name} venueName={selectedVenue?.name ?? workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <h1 className="text-3xl font-semibold">Employee profiles</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Maintain staff contact and employment details for this venue.
        Archiving removes a worker from new roster assignments without deleting their profile or shift history.
        Existing department associations are retained to preserve historical references.
      </p>
      {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">
        {params.error === "permission" ? "You cannot manage that department." : params.error === "inactive"
          ? "Inactive departments cannot be newly assigned." : params.error === "filter"
          ? "That directory filter is unavailable. Choose a permitted venue, department and role."
          : "Could not save employee. Check the details and try again."}
      </p>}
      {params.saved && <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-ocean">
        {params.saved === "departments" ? "Department membership saved." : "Employee profile saved."}
      </p>}
      {loadError ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">Could not load employee profiles. Try again.</p> : <>
        <form action="/people" aria-label="Directory filters" className="mt-6 grid gap-4 rounded-xl border border-line bg-white p-5 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm">Search team
            <input type="search" name="q" maxLength={100} defaultValue={query} className="mt-2 block w-full rounded-lg border border-line p-3" />
          </label>
          <label className="text-sm">Venue
            <select name="venue" defaultValue={venueId} className="mt-2 block w-full rounded-lg border border-line p-3">
              {venues.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Department
            <select name="department" defaultValue={params.department ?? ""} className="mt-2 block w-full rounded-lg border border-line p-3">
              <option value="">All departments</option>
              {departments.data?.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Role
            <select name="role" defaultValue={params.role ?? ""} className="mt-2 block w-full rounded-lg border border-line p-3">
              <option value="">All roles</option>
              {roleTitles.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label className="text-sm">Status
            <select name="status" defaultValue={params.status ?? "all"} className="mt-2 block w-full rounded-lg border border-line p-3">
              <option value="all">All staff</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button type="submit" className="self-end rounded-lg bg-ocean px-4 py-3 font-semibold text-white">Filter team</button>
        </form>
        {departments.data?.length ? (
          <section aria-label="New employee" className="mt-6 rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">Add employee</h2>
            <EmployeeForm departments={departments.data.filter((department) => department.active)} venueId={venueId} />
          </section>
        ) : <p className="mt-6">No manageable departments are available.</p>}
        <div className="mt-6 space-y-4">
          {employees.data?.map((employee) => <section key={employee.id}
            aria-label={`Employee ${employee.name}`} className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">{employee.name} {employee.active ? "" : "(Archived)"}</h2>
            <p className="mt-1 text-sm text-muted">
              Departments: {linkedDepartments(employee.id).map(departmentName).filter(Boolean).join(", ")}
            </p>
            {departments.data?.some((department) => department.id === employee.department_id) ? <>
              <EmployeeForm employee={employee} departments={departments.data ?? []} venueId={venueId} />
              {canAssignDepartments && <DepartmentMembershipForm employee={employee} departments={departments.data ?? []}
                linkedIds={linkedDepartments(employee.id)} venueId={venueId} />}
            </> : <p className="mt-3 text-sm text-muted">Profile details are managed by this worker&apos;s primary department.</p>}
          </section>)}
          {employees.data?.length === 0 && <p>No employees match these filters.</p>}
        </div>
      </>}
    </AppShell>
  );
}
