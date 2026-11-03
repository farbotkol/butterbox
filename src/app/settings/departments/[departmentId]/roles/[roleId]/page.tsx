import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { departmentHref, parseDepartmentFilters } from "@/lib/department-directory";
import { isPayrollUuid } from "@/lib/generic-payroll-exports";
import { DepartmentFeedback } from "@/app/settings/departments/department-feedback";
import { RoleDetails, type DepartmentRecord, type JobRoleRecord } from "@/app/settings/departments/department-forms";
import { requireDepartmentWorkspace, type DepartmentSearch } from "@/app/settings/departments/department-workspace";

export default async function JobRolePage({ params, searchParams }: {
  params: Promise<{ departmentId: string; roleId: string }>; searchParams: Promise<DepartmentSearch>;
}) {
  const [{ departmentId, roleId }, search] = await Promise.all([params, searchParams]);
  if (!isPayrollUuid(departmentId) || !isPayrollUuid(roleId)) notFound();
  const initial = await requireDepartmentWorkspace(search);
  const filters = parseDepartmentFilters(search);
  if (!filters) {
    console.error("Invalid job role directory context.");
    redirect(`/settings/departments?business=${encodeURIComponent(initial.business.id)}&error=filter`);
  }
  const [departmentResponse, roleResponse] = await Promise.all([
    initial.supabase.from("departments").select("id, name, active, venue_id")
      .eq("business_id", initial.business.id).eq("id", departmentId).maybeSingle(),
    initial.supabase.from("job_roles")
      .select("id, name, active, department_id, restrict_auto_assignment, restrict_manual_assignment")
      .eq("business_id", initial.business.id).eq("department_id", departmentId).eq("id", roleId).maybeSingle(),
  ]);
  if (departmentResponse.error || roleResponse.error) {
    console.error("Could not load job role details.", departmentResponse.error ?? roleResponse.error);
    throw new Error("Job role details could not be loaded.");
  }
  if (!departmentResponse.data || !roleResponse.data ||
    (search.venue && search.venue !== departmentResponse.data.venue_id)) notFound();
  const department: DepartmentRecord = departmentResponse.data;
  const role: JobRoleRecord = roleResponse.data;
  const workspace = department.venue_id === initial.venue.id ? initial
    : await requireDepartmentWorkspace({ ...search, venue: department.venue_id });
  const context = { businessId: workspace.business.id, venueId: workspace.venue.id, filters };
  return <AppShell businessName={workspace.business.name} businessId={context.businessId}
    businessCount={workspace.businesses.length} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <Link href={departmentHref(context.businessId, context.venueId, filters, department.id)}
      className="inline-flex min-h-11 max-w-full items-center text-sm font-semibold text-ocean underline">
      <span className="min-w-0 [overflow-wrap:anywhere]">Back to {department.name}</span>
    </Link>
    <h1 className="mt-2 break-words text-3xl font-semibold [overflow-wrap:anywhere]">{role.name}</h1>
    <p className="mt-2 text-sm text-muted [overflow-wrap:anywhere]">{department.name} · {role.active ? "Active role" : "Inactive role"}</p>
    <DepartmentFeedback error={search.error} saved={search.saved} />
    <RoleDetails context={context} department={department} role={role} />
  </AppShell>;
}
