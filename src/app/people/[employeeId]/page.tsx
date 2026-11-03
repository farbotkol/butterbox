import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InlineEditor } from "@/components/inline-editor";
import {
  employmentBases, isEmploymentBasis, parseEmploymentMetadataSnapshots,
} from "@/lib/employment-rule-metadata";
import { isPayrollUuid } from "@/lib/generic-payroll-exports";
import { helpHref } from "@/lib/help";
import type { PendingStaffInvitation } from "@/lib/invitations";
import { readAllPages } from "@/lib/paginated-rows";
import { parsePeopleFilters, peopleHref } from "@/lib/people-directory";
import { isPublicShowcase } from "@/lib/showcase";
import type { BusinessMember } from "@/lib/workspace";
import {
  DepartmentMembershipForm, EligibleRolesForm, EmployeeAccountForm, EmployeeForm, EmployeeInvitationForm,
  EmployeeLifecycleForm, PrimaryRoleForm, SharedWorkersSection, type Employee, type SharedProfile,
} from "../people-forms";
import { PeopleFeedback } from "../people-feedback";
import { requirePeopleWorkspace, type PeopleSearch } from "../people-workspace";

type Preference = {
  employee_id: string; preferred_weekly_hours: number | null;
  notify_schedule_email: boolean; notify_leave_email: boolean;
};

function personInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? "").join("").toUpperCase();
}

export default async function PersonPage({
  params, searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<PeopleSearch>;
}) {
  const [{ employeeId }, search] = await Promise.all([params, searchParams]);
  if (!isPayrollUuid(employeeId)) notFound();
  const initialWorkspace = await requirePeopleWorkspace(search);
  const filters = parsePeopleFilters(search);
  if (!filters) {
    console.error("Invalid People profile directory context.");
    redirect(`/people?business=${encodeURIComponent(initialWorkspace.business.id)}&error=filter`);
  }
  const employeeResponse = await initialWorkspace.supabase.from("employees")
    .select("id, name, email, auth_user_id, department_id, venue_id, role_title, employment_type, active, profile_revision")
    .eq("business_id", initialWorkspace.business.id).eq("id", employeeId).maybeSingle();
  if (employeeResponse.error) {
    console.error("Could not load the employee profile.", employeeResponse.error);
    return <AppShell businessName={initialWorkspace.business.name} businessId={initialWorkspace.business.id}
      businessCount={initialWorkspace.businesses.length} venueName={initialWorkspace.venue.name}
      email={initialWorkspace.user.email ?? ""} role={initialWorkspace.membership.role}>
      <h1 className="text-2xl font-semibold">Profile unavailable</h1>
      <p role="alert" className="mt-4 text-sm">Could not load this profile. Refresh and check your access.</p>
    </AppShell>;
  }
  if (!employeeResponse.data || (search.venue && search.venue !== employeeResponse.data.venue_id)) notFound();
  const employee: Employee = employeeResponse.data;
  if (!Number.isSafeInteger(employee.profile_revision) || employee.profile_revision < 0 ||
    !isEmploymentBasis(employee.employment_type)) {
    console.error("The employee profile contains an invalid revision or employment type.");
    throw new Error("The employee profile could not be displayed safely.");
  }
  const workspace = employeeResponse.data.venue_id === initialWorkspace.venue.id ? initialWorkspace
    : await requirePeopleWorkspace({ ...search, venue: employeeResponse.data.venue_id });
  const venueId = workspace.venue.id;
  const businessId = workspace.business.id;
  const [departments, roles, links, qualifications, preference, invitations, metadata, members, otherEmployees, sharedProfiles] =
    await Promise.all([
      readAllPages((from, to) => workspace.supabase.from("departments")
        .select("id, name, active", { count: "exact" }).eq("business_id", businessId).eq("venue_id", venueId)
        .order("name").order("id").range(from, to), (department) => department.id),
      readAllPages((from, to) => workspace.supabase.from("job_roles")
        .select("id, name, department_id, active", { count: "exact" }).eq("business_id", businessId).eq("venue_id", venueId)
        .order("name").order("id").range(from, to), (role) => role.id),
      readAllPages((from, to) => workspace.supabase.from("employee_departments")
        .select("employee_id, department_id", { count: "exact" }).eq("employee_id", employee.id)
        .eq("business_id", businessId).order("department_id").range(from, to), (link) => link.department_id),
      readAllPages((from, to) => workspace.supabase.from("employee_job_roles")
        .select("employee_id, department_id, job_role_id, is_primary", { count: "exact" })
        .eq("employee_id", employee.id).eq("business_id", businessId)
        .order("job_role_id").range(from, to), (qualification) => qualification.job_role_id),
      workspace.supabase.from("employee_preferences")
        .select("employee_id, preferred_weekly_hours, notify_schedule_email, notify_leave_email")
        .eq("business_id", businessId).eq("employee_id", employee.id).maybeSingle(),
      workspace.supabase.rpc("list_pending_staff_invitations", {
        p_business_id: businessId, p_venue_id: venueId,
      }).eq("employee_id", employee.id),
      workspace.supabase.rpc("list_current_employee_employment_metadata", {
        p_business_id: businessId, p_venue_id: venueId,
      }).eq("employee_id", employee.id),
      workspace.membership.role === "owner"
        ? readAllPages<BusinessMember>((from, to) => workspace.supabase.rpc("list_business_members", {
          p_business_id: businessId,
        }, { count: "exact" }).order("user_id").range(from, to), (member) => member.user_id)
        : Promise.resolve({ data: [], error: null }),
      workspace.membership.role === "owner"
        ? readAllPages((from, to) => workspace.supabase.from("employees")
          .select("id, name, venue_id, role_title, active", { count: "exact" })
          .eq("business_id", businessId).neq("venue_id", venueId).order("name").order("id").range(from, to),
        (person) => person.id)
        : Promise.resolve({ data: [], error: null }),
      workspace.membership.role === "owner"
        ? readAllPages<SharedProfile>((from, to) => workspace.supabase.rpc("list_shared_worker_profiles", {
          p_business_id: businessId, p_venue_id: venueId,
        }, { count: "exact" }).eq("employee_id", employee.id).order("linked_employee_id").range(from, to),
        (profile) => `${profile.employee_id}:${profile.linked_employee_id}`)
        : Promise.resolve({ data: [], error: null }),
    ]);
  const snapshots = parseEmploymentMetadataSnapshots(metadata.data);
  const canManagePrimary = Boolean(departments.data?.some((department) => department.id === employee.department_id));
  const employment = snapshots?.find((snapshot) => snapshot.employee_id === employee.id);
  const invalidMetadata = !snapshots || (canManagePrimary && !employment);
  const loadError = departments.error || roles.error || links.error || qualifications.error || preference.error ||
    invitations.error || metadata.error || members.error || otherEmployees.error || sharedProfiles.error;
  if (loadError || invalidMetadata) console.error("Could not load employee profile sections.", {
    code: loadError?.code, message: loadError?.message ?? "Employment metadata was incomplete or invalid.",
  });
  const profileHref = peopleHref(businessId, venueId, filters, employee.id);
  const [profilePath, profileQuery] = profileHref.split("?", 2);
  const employmentHref = `${profilePath}/employment?${profileQuery}`;
  const context = { businessId, venueId, filters };
  const linkedIds = links.data?.map((link) => link.department_id) ?? [];
  const primaryDepartment = departments.data?.find((department) => department.id === employee.department_id);
  const primaryQualification = qualifications.data?.find((qualification) => qualification.is_primary);
  const primaryRole = roles.data?.find((role) => role.id === primaryQualification?.job_role_id);
  const employeePreference: Preference | null = preference.data;
  const invitation: PendingStaffInvitation | undefined = invitations.data?.[0];
  const canAssignDepartments = ["owner", "admin", "general_manager"].includes(workspace.membership.role);
  const venues = await readAllPages((from, to) => workspace.supabase.from("venues")
    .select("id, name", { count: "exact" }).eq("business_id", businessId)
    .order("name").order("id").range(from, to), (venue) => venue.id);
  if (venues.error) console.error("Could not load shared-worker venues.", venues.error);
  const renderKey = randomUUID();

  return <AppShell businessName={workspace.business.name} businessId={businessId} businessCount={workspace.businesses.length}
    venueName={workspace.venue.name} email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <Link href={peopleHref(businessId, venueId, filters)} className="text-sm font-semibold text-ocean underline">
      Back to people
    </Link>
    <header className="mt-4 flex flex-wrap items-center gap-4">
      <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-soft-sea text-lg font-semibold text-ocean">
        {personInitials(employee.name)}
      </span>
      <div className="min-w-0">
        <h1 className="break-words text-3xl font-semibold">{employee.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {employee.active ? "Active" : "Archived"} · {primaryDepartment?.name ?? "Primary department managed elsewhere"}
          {" · "}Primary role: {primaryRole?.name ?? "Not set or unavailable"}
          {canManagePrimary && employment && ` · ${employment.employment_basis
            ? employmentBases[employment.employment_basis]
            : isEmploymentBasis(employee.employment_type) ? employmentBases[employee.employment_type] : "Unavailable"}`}
          {canManagePrimary && (employee.auth_user_id ? " · Account linked"
            : invitation ? ` · Invitation ${invitation.status}` : " · Not invited")}
        </p>
      </div>
    </header>
    <PeopleFeedback error={search.error} saved={search.saved} />
    {loadError || invalidMetadata || venues.error ? <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      Could not load a consistent employee profile. Refresh and check your access.
    </p> : <>
      <nav aria-label="Profile sections" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ocean">
        <a href="#overview" className="min-h-11 py-3 underline">Overview</a>
        <a href="#employment" className="min-h-11 py-3 underline">Employment</a>
        <a href="#roles" className="min-h-11 py-3 underline">Roles &amp; departments</a>
        {canManagePrimary && <a href="#account" className="min-h-11 py-3 underline">Account &amp; invitations</a>}
      </nav>
      <section id="overview" aria-labelledby="overview-heading" className="mt-4 rounded-xl border border-line bg-white p-5">
        <h2 id="overview-heading" className="text-lg font-semibold">Overview</h2>
        {canManagePrimary && employment ? <InlineEditor key={`overview-${renderKey}`} label="Edit overview"
          read={<dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Name</dt><dd className="break-words">{employee.name}</dd></div>
            <div><dt className="text-muted">Preferred contact email</dt><dd className="break-all">{employee.email || "Not provided"}</dd></div>
            <div><dt className="text-muted">Job title</dt><dd className="break-words">{employee.role_title}</dd></div>
            <div><dt className="text-muted">Primary department</dt><dd>{primaryDepartment?.name ?? "Unavailable"}</dd></div>
          </dl>}
          editor={<EmployeeForm employee={employee} departments={departments.data ?? []} context={context} employment={employment} />} />
          : <p className="mt-3 text-sm text-muted">Contact and primary profile details are managed by this person&apos;s primary department.</p>}
      </section>
      <section id="employment" aria-labelledby="employment-heading" className="mt-4 rounded-xl border border-line bg-white p-5">
        <h2 id="employment-heading" className="text-lg font-semibold">Employment</h2>
        {canManagePrimary && employment ? <>
          <p className="mt-3 text-sm">
            Employment basis: {employment.employment_basis ? employmentBases[employment.employment_basis]
              : isEmploymentBasis(employee.employment_type) ? employmentBases[employee.employment_type] : "Unavailable"}.
          </p>
          <p className="mt-2 text-sm text-muted">
            {employment.employment_basis
              ? `Current dated details apply from ${employment.effective_on}.`
              : "No current dated employment details are recorded; classification is unknown."}
          </p>
          <Link href={employmentHref} className="mt-3 inline-block min-h-11 py-3 text-sm font-semibold text-ocean underline">
            Review employment metadata
          </Link>
          <InlineEditor key={`status-${renderKey}`} label={employee.active ? "Archive person" : "Reactivate person"}
            read={<p className="text-sm">Status: {employee.active ? "Active" : "Archived"}</p>}
            editor={<EmployeeLifecycleForm employee={employee} context={context} employment={employment} />} />
        </> : <p className="mt-3 text-sm text-muted">Employment details are managed by this person&apos;s primary department.</p>}
      </section>
      <section id="roles" aria-labelledby="roles-heading" className="mt-4 rounded-xl border border-line bg-white p-5">
        <h2 id="roles-heading" className="text-lg font-semibold">Roles &amp; departments</h2>
        <p className="mt-2 text-sm text-muted">A job title does not establish a role qualification.</p>
        <div className="mt-4 border-t border-line pt-4">
          {canAssignDepartments && canManagePrimary ? <InlineEditor key={`departments-${renderKey}`} label="Edit departments"
            read={<p className="text-sm">Departments: {departments.data?.filter((department) => linkedIds.includes(department.id))
              .map((department) => department.name).join(", ") || "None visible"}</p>}
            editor={<DepartmentMembershipForm employee={employee} departments={departments.data ?? []}
              linkedIds={linkedIds} context={context} />} />
            : <p className="text-sm">Visible departments: {departments.data?.filter((department) => linkedIds.includes(department.id))
              .map((department) => department.name).join(", ") || "None visible"}</p>}
        </div>
        {departments.data?.filter((department) => linkedIds.includes(department.id)).map((department) => {
          const eligible = qualifications.data?.filter((item) => item.department_id === department.id) ?? [];
          const visibleRoles = roles.data?.filter((role) => eligible.some((item) => item.job_role_id === role.id)) ?? [];
          const canEdit = roles.data?.some((role) => role.department_id === department.id &&
            ((role.active && department.active) || eligible.some((item) => item.job_role_id === role.id)));
          const read = <p className="text-sm">Qualified roles in {department.name}: {visibleRoles.map((role) => role.name).join(", ") || "None"}</p>;
          return <div key={department.id} className="mt-4 border-t border-line pt-4">
            {canEdit ? <InlineEditor key={`eligible-${department.id}-${renderKey}`} label={`Edit qualified roles in ${department.name}`}
              read={read} editor={<EligibleRolesForm employee={employee} department={department}
                roles={roles.data ?? []} qualifications={qualifications.data ?? []} context={context} />} /> : read}
          </div>;
        })}
        <div className="mt-4 border-t border-line pt-4">
          {canManagePrimary && roles.data?.some((role) => role.active &&
            departments.data?.some((department) => department.id === role.department_id && department.active) &&
            qualifications.data?.some((qualification) => qualification.job_role_id === role.id))
            ? <InlineEditor key={`primary-${renderKey}`} label="Edit primary role"
              read={<p className="text-sm">Primary qualified role: {primaryRole?.name ?? "Not set or unavailable"}</p>}
              editor={<PrimaryRoleForm employee={employee} departments={departments.data ?? []}
                roles={roles.data ?? []} qualifications={qualifications.data ?? []} context={context} />} />
            : <p className="text-sm">Primary qualified role: {primaryRole?.name ?? "Not set or unavailable"}</p>}
        </div>
      </section>
      {canManagePrimary && <section id="account" aria-labelledby="account-heading" className="mt-4 rounded-xl border border-line bg-white p-5">
        <h2 id="account-heading" className="text-lg font-semibold">Account &amp; invitations</h2>
        {workspace.membership.role === "owner" ? <InlineEditor key={`account-${renderKey}`} label="Edit account link"
          read={<p className="mt-3 text-sm">{employee.auth_user_id ? "Account linked." : "No linked account."}</p>}
          editor={<EmployeeAccountForm employee={employee} members={members.data ?? []} context={context} />} />
          : <p className="mt-3 text-sm">{employee.auth_user_id ? "Account linked." : "No linked account."} Only an owner can change account links.</p>}
        {isPublicShowcase() ? <p className="mt-4 text-sm text-muted">Email invitations are unavailable in the public demo.</p>
          : <InlineEditor key={`invitation-${renderKey}`} label="Manage invitation"
            read={<p className="mt-4 break-words text-sm">{invitation
              ? `${invitation.status === "expired" ? "Expired" : "Pending"} invitation: ${invitation.email}.`
              : "No pending invitation."}</p>}
            editor={<EmployeeInvitationForm employee={employee} invitation={invitation} context={context}
              departmentActive={Boolean(primaryDepartment?.active)} />} />}
      </section>}
      <section aria-labelledby="preferences-heading" className="mt-4 rounded-xl border border-line bg-white p-5 text-sm">
        <h2 id="preferences-heading" className="text-lg font-semibold">Work preferences</h2>
        {employeePreference ? <div className="mt-3">
          <p>Preferred weekly hours: {employeePreference.preferred_weekly_hours ?? "Not specified"}</p>
          <p>Schedule emails: {employeePreference.notify_schedule_email ? "Yes" : "No"}</p>
          <p>Leave decision emails: {employeePreference.notify_leave_email ? "Yes" : "No"}</p>
        </div> : <p className="mt-3 text-muted">No preferences submitted.</p>}
        <p className="mt-2 text-xs text-muted">Preferences are not contractual limits. Email delivery is not yet available.</p>
      </section>
      {workspace.membership.role === "owner" && <section aria-labelledby="shared-heading" className="mt-4 rounded-xl border border-line bg-white p-5">
        <h2 id="shared-heading" className="text-lg font-semibold">Shared worker profiles</h2>
        <InlineEditor key={`shared-${renderKey}`} label="Manage shared profiles"
          read={sharedProfiles.data?.length ? <ul className="mt-3 text-sm">
            {sharedProfiles.data.map((profile) => <li key={profile.linked_employee_id} className="break-words">
              {profile.linked_name} — {profile.linked_venue_name}{profile.linked_active ? "" : " (archived)"}
            </li>)}
          </ul> : <p className="mt-3 text-sm text-muted">No linked profiles.</p>}
          editor={<SharedWorkersSection employee={employee} otherEmployees={otherEmployees.data ?? []}
            sharedProfiles={sharedProfiles.data ?? []} venues={venues.data ?? []} venue={workspace.venue} context={context} />} />
      </section>}
      <Link href={helpHref("people", businessId)} className="mt-6 inline-block text-sm font-semibold text-ocean underline">
        Help with managing people
      </Link>
    </>}
  </AppShell>;
}
