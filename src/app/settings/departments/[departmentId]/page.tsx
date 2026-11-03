import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { departmentHref, parseDepartmentFilters } from "@/lib/department-directory";
import { isPayrollUuid } from "@/lib/generic-payroll-exports";
import { readAllPages } from "@/lib/paginated-rows";
import { DepartmentFeedback } from "../department-feedback";
import { DepartmentDetails, RoleCreate, type DepartmentRecord, type JobRoleRecord } from "../department-forms";
import { requireDepartmentWorkspace, type DepartmentSearch } from "../department-workspace";

export default async function DepartmentPage({ params, searchParams }: {
  params: Promise<{ departmentId: string }>; searchParams: Promise<DepartmentSearch>;
}) {
  const [{ departmentId }, search] = await Promise.all([params, searchParams]);
  if (!isPayrollUuid(departmentId)) notFound();
  const initial = await requireDepartmentWorkspace(search);
  const filters = parseDepartmentFilters(search);
  if (!filters) {
    console.error("Invalid department detail directory context.");
    redirect(`/settings/departments?business=${encodeURIComponent(initial.business.id)}&error=filter`);
  }
  const response = await initial.supabase.from("departments").select("id, name, active, venue_id")
    .eq("business_id", initial.business.id).eq("id", departmentId).maybeSingle();
  if (response.error) {
    console.error("Could not load department details.", response.error);
    throw new Error("Department details could not be loaded.");
  }
  if (!response.data || (search.venue && search.venue !== response.data.venue_id)) notFound();
  const department: DepartmentRecord = response.data;
  const workspace = department.venue_id === initial.venue.id ? initial
    : await requireDepartmentWorkspace({ ...search, venue: department.venue_id });
  const businessId = workspace.business.id;
  const venueId = workspace.venue.id;
  const roles = await readAllPages((from, to) => workspace.supabase.from("job_roles")
    .select("id, name, active, department_id, restrict_auto_assignment, restrict_manual_assignment", { count: "exact" })
    .eq("business_id", businessId).eq("venue_id", venueId).eq("department_id", department.id)
    .order("name").order("id").range(from, to), (role) => role.id);
  if (roles.error) console.error("Could not load department roles.", roles.error);
  const canManageDepartment = ["owner", "admin", "general_manager"].includes(workspace.membership.role);
  const context = { businessId, venueId, filters };

  return <AppShell businessName={workspace.business.name} businessId={businessId} businessCount={workspace.businesses.length}
    venueName={workspace.venue.name} email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <Link href={departmentHref(businessId, venueId, filters)} className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
      Back to departments
    </Link>
    <h1 className="mt-2 break-words text-3xl font-semibold [overflow-wrap:anywhere]">{department.name}</h1>
    <p className="mt-2 text-sm text-muted">{department.active ? "Active department" : "Inactive department"}</p>
    <DepartmentFeedback error={search.error} saved={search.saved} />
    <DepartmentDetails context={context} department={department} canManage={canManageDepartment} />
    <section aria-label="Job roles" className="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">Job roles</h2>
      <p className="mt-2 text-sm text-muted">Open one role to edit its details and assignment restrictions.</p>
      {roles.error ? <p role="alert" className="mt-3 text-sm text-red-800">We couldn&apos;t load job roles. Refresh and try again.</p>
        : roles.data?.length ? <ul className="mt-3 divide-y divide-line">
          {roles.data.map((role: JobRoleRecord) => <li key={role.id} className="py-3">
            <Link href={departmentHref(businessId, venueId, filters, department.id, role.id)}
              className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocean">
              <span className="min-w-0 break-words font-semibold text-ocean [overflow-wrap:anywhere]">{role.name}</span>
              <span className="text-sm text-muted">{role.active ? "Active" : "Inactive"}
                <span aria-hidden="true"> · </span>Manage role <span aria-hidden="true">→</span></span>
            </Link>
            <p className="text-sm text-muted">
              Automatic: {role.restrict_auto_assignment ? "qualified workers only"
                : role.restrict_manual_assignment ? "qualified workers only (manual restriction)" : "any linked worker"}.
              {" "}Manual: {role.restrict_manual_assignment ? "qualified workers only" : "any linked worker"}.
            </p>
          </li>)}
        </ul> : <p className="mt-3 text-sm text-muted">No job roles have been added to this department.</p>}
      {!roles.error && <RoleCreate context={context} department={department} />}
    </section>
  </AppShell>;
}
