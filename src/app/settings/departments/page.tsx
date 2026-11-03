import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { departmentHref, parseDepartmentFilters } from "@/lib/department-directory";
import { helpHref } from "@/lib/help";
import { readAllPages } from "@/lib/paginated-rows";
import { DepartmentFeedback } from "./department-feedback";
import { DepartmentCreate } from "./department-forms";
import { requireDepartmentWorkspace, type DepartmentSearch } from "./department-workspace";

const pageSize = 30;
const fieldClass = "mt-2 block w-full min-w-0 rounded-lg border border-line bg-white p-3 text-ink";

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<DepartmentSearch> }) {
  const search = await searchParams;
  const workspace = await requireDepartmentWorkspace(search);
  const filters = parseDepartmentFilters(search);
  const businessId = workspace.business.id;
  const venueId = workspace.venue.id;
  const canManageDepartments = ["owner", "admin", "general_manager"].includes(workspace.membership.role);
  const [venues, departments, roles] = await Promise.all([
    readAllPages((from, to) => workspace.supabase.from("venues").select("id, name", { count: "exact" })
      .eq("business_id", businessId).order("name").order("id").range(from, to), (venue) => venue.id),
    filters ? readAllPages((from, to) => workspace.supabase.from("departments")
      .select("id, name, active, venue_id", { count: "exact" })
      .eq("business_id", businessId).eq("venue_id", venueId).order("name").order("id").range(from, to),
    (department) => department.id) : Promise.resolve({ data: [], error: null }),
    filters ? readAllPages((from, to) => workspace.supabase.from("job_roles")
      .select("id, department_id, active", { count: "exact" })
      .eq("business_id", businessId).eq("venue_id", venueId).order("id").range(from, to),
    (role) => role.id) : Promise.resolve({ data: [], error: null }),
  ]);
  const loadError = venues.error || departments.error || roles.error;
  if (loadError) console.error("Could not load the department directory.", loadError);
  if (!filters) console.error("Invalid department directory filters.");
  const counts = new Map<string, { active: number; total: number }>();
  for (const role of roles.data ?? []) {
    const count = counts.get(role.department_id) ?? { active: 0, total: 0 };
    count.total++;
    if (role.active) count.active++;
    counts.set(role.department_id, count);
  }
  const rows = filters ? (departments.data ?? []).filter((department) =>
    (!filters.q || department.name.toLocaleLowerCase("en-AU").includes(filters.q.toLocaleLowerCase("en-AU"))) &&
    (filters.status === "all" || department.active === (filters.status === "active")))
    .sort((a, b) => {
      const byStatus = Number(b.active) - Number(a.active);
      const byRoles = (counts.get(b.id)?.active ?? 0) - (counts.get(a.id)?.active ?? 0);
      return (filters.sort === "status" ? byStatus : filters.sort === "roles" ? byRoles : 0) ||
        a.name.localeCompare(b.name, "en-AU", { sensitivity: "base" }) || a.id.localeCompare(b.id);
    }) : [];
  const visible = filters ? rows.slice((filters.page - 1) * pageSize, filters.page * pageSize) : [];
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const context = filters ? { businessId, venueId, filters } : null;

  return <AppShell businessName={workspace.business.name} businessId={businessId} businessCount={workspace.businesses.length}
    venueName={workspace.venue.name} email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold">Departments and roles</h1>
        <p className="mt-2 text-sm text-muted">Find a department, then open it to manage its roles.</p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm font-semibold text-ocean">
        <Link href={`${helpHref("people", businessId)}#departments-and-roles`} className="min-h-11 content-center underline">
          Department help
        </Link>
        {workspace.membership.role === "owner" && <Link
          href={`/settings/organisation?${new URLSearchParams({ business: businessId, venue: venueId })}`}
          className="min-h-11 content-center underline">Venue settings</Link>}
      </div>
    </div>
    <DepartmentFeedback error={search.error ?? (!filters ? "filter" : undefined)} saved={search.saved} />
    {!filters ? <Link href={`/settings/departments?${new URLSearchParams({ business: businessId, venue: venueId })}`}
      className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">Reset filters</Link>
      : loadError ? <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
        We couldn&apos;t load departments and roles. Refresh and check your access.
      </p> : <>
        {canManageDepartments && context && <DepartmentCreate context={context} />}
        <form action="/settings/departments" aria-label="Filter departments" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <input type="hidden" name="business" value={businessId} />
          <label className="text-sm">Venue
            <select name="venue" defaultValue={venueId} className={fieldClass}>
              {venues.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Search departments
            <input name="q" maxLength={100} defaultValue={filters.q} className={fieldClass} />
          </label>
          <label className="text-sm">Status
            <select name="status" defaultValue={filters.status} className={fieldClass}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="text-sm">Sort by
            <select name="sort" defaultValue={filters.sort} className={fieldClass}>
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="roles">Active roles</option>
            </select>
          </label>
          <button type="submit" className="min-h-11 self-end rounded-lg bg-ocean px-4 py-3 text-sm font-semibold text-white">
            Show departments
          </button>
        </form>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Departments</h2>
          <p role="status" className="text-sm text-muted">{rows.length} {rows.length === 1 ? "department" : "departments"}</p>
        </div>
        {visible.length > 0 ? <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
          {visible.map((department) => {
            const count = counts.get(department.id) ?? { active: 0, total: 0 };
            return <li key={department.id}>
              <Link href={departmentHref(businessId, venueId, filters, department.id)}
                className="flex min-h-16 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocean">
                <span className="min-w-0 break-words font-semibold text-ocean [overflow-wrap:anywhere]">{department.name}</span>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  <span>{department.active ? "Active" : "Inactive"}</span>
                  <span>{count.active} active {count.active === 1 ? "role" : "roles"} ({count.total} total)</span>
                  <span>View <span aria-hidden="true">→</span></span>
                </span>
              </Link>
            </li>;
          })}
        </ul> : <p className="mt-3 rounded-lg border border-line bg-white p-4 text-sm text-muted">
          {rows.length > 0 ? "No departments on this page. Return to the first page."
            : filters.q || filters.status !== "all" ? "No departments match these filters."
              : "No departments are available to you at this venue."}
        </p>}
        {(pages > 1 || filters.page > 1) && <nav aria-label="Department pages" className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          {filters.page > 1 && <Link href={departmentHref(businessId, venueId, { ...filters, page: filters.page > pages ? 1 : filters.page - 1 })}
            className="min-h-11 content-center font-semibold text-ocean underline">Previous</Link>}
          <span>Page {filters.page} of {pages}</span>
          {filters.page < pages && <Link href={departmentHref(businessId, venueId, { ...filters, page: filters.page + 1 })}
            className="min-h-11 content-center font-semibold text-ocean underline">Next</Link>}
        </nav>}
      </>}
  </AppShell>;
}
