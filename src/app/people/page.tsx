import { redirect } from "next/navigation";
import {
  createStaffInvitationAction,
  linkSharedWorkerAction,
  resendStaffInvitationAction,
  revokeStaffInvitationAction,
  saveEmployeeAction,
  setEmployeeAuthUserAction,
  setEmployeeDepartmentsAction,
  setEmployeeEligibleRolesAction,
  setEmployeePrimaryRoleAction,
  unlinkSharedWorkerAction,
} from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import type { PendingStaffInvitation } from "@/lib/invitations";
import { readAllPages } from "@/lib/paginated-rows";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace, type BusinessMember } from "@/lib/workspace";

type Employee = {
  id: string;
  name: string;
  email: string | null;
  auth_user_id: string | null;
  department_id: string;
  role_title: string;
  employment_type: string;
  active: boolean;
};
type Department = { id: string; name: string; active?: boolean };
type JobRole = { id: string; name: string; department_id: string; active: boolean };
type Qualification = { employee_id: string; department_id: string; job_role_id: string; is_primary: boolean };
type Venue = { id: string; name: string };
type OtherEmployee = { id: string; name: string; venue_id: string; role_title: string; active: boolean };
type SharedProfile = {
  employee_id: string; linked_employee_id: string; linked_name: string;
  linked_venue_name: string; linked_active: boolean;
};

function memberHasEmployeeScope(member: BusinessMember, employee: Employee, venueId: string) {
  if (["owner", "admin"].includes(member.role)) return true;
  if (member.venue_id && member.venue_id !== venueId) return false;
  return member.role === "general_manager" ||
    (["foh_manager", "boh_manager", "department_manager"].includes(member.role) &&
      member.department_id === employee.department_id) ||
    (member.role === "employee" &&
      (member.department_id === null || member.department_id === employee.department_id));
}

function EmployeeAccountForm({ employee, members, venueId }: {
  employee: Employee; members: BusinessMember[]; venueId: string;
}) {
  const choices = members.filter((member) =>
    memberHasEmployeeScope(member, employee, venueId) || member.user_id === employee.auth_user_id);
  return (
    <form action={setEmployeeAuthUserAction} aria-label={`Account for ${employee.name}`}
      className="mt-4 rounded-lg border border-line p-4">
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="employee_id" value={employee.id} />
      <label className="text-sm">Linked business member
        <select name="user_id" defaultValue={employee.auth_user_id ?? ""}
          className="mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink">
          <option value="">No linked account</option>
          {choices.map((member) => (
            <option key={member.user_id} value={member.user_id}
              disabled={!memberHasEmployeeScope(member, employee, venueId)}>
              {member.email || member.user_id}{memberHasEmployeeScope(member, employee, venueId) ? "" : " (out of scope)"}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-muted">
        Link an existing member to let them view their shifts and manage their own availability.
      </p>
      <button type="submit" className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Save account link</button>
    </form>
  );
}

function EmployeeInvitationForm({ employee, invitation, venueId, departmentActive }: {
  employee: Employee; invitation?: PendingStaffInvitation; venueId: string; departmentActive: boolean;
}) {
  const expired = invitation?.status === "expired";
  const canInvite = employee.active && !employee.auth_user_id && departmentActive;
  return (
    <section aria-label={`Invitation for ${employee.name}`} className="mt-4 rounded-lg border border-line p-4">
      <h3 className="text-sm font-semibold">Staff invitation</h3>
      {invitation && <>
        <p className="mt-2 text-sm text-muted">
          {expired ? "Expired invitation" : "Pending invitation"}: {invitation.email}.
          {!expired && ` Expires ${new Date(invitation.expires_at).toUTCString()}.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {!expired && canInvite && <form action={resendStaffInvitationAction} aria-label={`Resend invitation for ${employee.name}`}>
            <input type="hidden" name="venue_id" value={venueId} />
            <input type="hidden" name="invitation_id" value={invitation.id} />
            <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Resend email</button>
          </form>}
          <form action={revokeStaffInvitationAction} aria-label={`Revoke invitation for ${employee.name}`}>
            <input type="hidden" name="venue_id" value={venueId} />
            <input type="hidden" name="invitation_id" value={invitation.id} />
            <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Revoke invitation</button>
          </form>
        </div>
        {!canInvite && <p className="mt-2 text-xs text-muted">
          This profile is not available for acceptance. Revoke the invitation if it is no longer needed.
        </p>}
      </>}
      {canInvite && (!invitation || expired) && <form
        action={createStaffInvitationAction} aria-label={`Invite ${employee.name}`} className="mt-3">
        <input type="hidden" name="venue_id" value={venueId} />
        <input type="hidden" name="department_id" value={employee.department_id} />
        <input type="hidden" name="employee_id" value={employee.id} />
        <label className="block text-sm">Invitation email
          <input type="email" name="email" required maxLength={254} defaultValue={employee.email ?? ""}
            className="mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink" />
        </label>
        <p className="mt-2 text-xs text-muted">
          The recipient verifies their email and chooses their own password. Invitations expire after seven days.
          Accounts already linked to another business cannot join until business switching is available.
        </p>
        <button type="submit" className="mt-3 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">
          Send invitation
        </button>
      </form>}
      {!canInvite && !invitation && <p className="mt-2 text-sm text-muted">
        {employee.auth_user_id ? "This profile already has a linked account." : "Only active staff in active departments can be invited."}
      </p>}
    </section>
  );
}

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
      <p className="mt-2 text-xs text-muted">
        Removing a department also removes its qualified roles. Choose a new primary role first if needed.
      </p>
      <button type="submit" className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Save departments</button>
    </form>
  );
}

function EligibleRolesForm({ employee, department, roles, qualifications, venueId }: {
  employee: Employee; department: Department; roles: JobRole[];
  qualifications: Qualification[]; venueId: string;
}) {
  const selectedIds = qualifications
    .filter((item) => item.employee_id === employee.id && item.department_id === department.id)
    .map((item) => item.job_role_id);
  const choices = roles.filter((role) => role.department_id === department.id &&
    ((role.active && department.active) || selectedIds.includes(role.id)));
  if (!choices.length) return null;
  return (
    <form action={setEmployeeEligibleRolesAction} aria-label={`Eligible roles for ${employee.name} in ${department.name}`}
      className="mt-4 rounded-lg border border-line p-4">
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="employee_id" value={employee.id} />
      <input type="hidden" name="department_id" value={department.id} />
      <fieldset>
        <legend className="text-sm font-semibold">Qualified roles in {department.name}</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {choices.map((role) => (
            <label key={role.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="job_role_ids" value={role.id}
                defaultChecked={selectedIds.includes(role.id)} />
              {role.name}{role.active && department.active ? "" : " (inactive)"}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Save eligible roles</button>
    </form>
  );
}

function PrimaryRoleForm({ employee, departments, roles, qualifications, venueId }: {
  employee: Employee; departments: Department[]; roles: JobRole[];
  qualifications: Qualification[]; venueId: string;
}) {
  const employeeRoles = qualifications.filter((item) => item.employee_id === employee.id);
  const choices = roles.filter((role) => role.active &&
    departments.some((department) => department.id === role.department_id && department.active) &&
    employeeRoles.some((item) => item.job_role_id === role.id));
  if (!choices.length) return null;
  const primaryId = employeeRoles.find((item) => item.is_primary)?.job_role_id;
  return (
    <form action={setEmployeePrimaryRoleAction} aria-label={`Primary role for ${employee.name}`}
      className="mt-4 rounded-lg border border-line p-4">
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="employee_id" value={employee.id} />
      <label className="text-sm">Primary qualified role
        <select name="job_role_id" required defaultValue={choices.some((role) => role.id === primaryId) ? primaryId : ""}
          className="mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink">
          <option value="" disabled>Choose a qualified role</option>
          {choices.map((role) => (
            <option key={role.id} value={role.id}>
              {departments.find((department) => department.id === role.department_id)?.name} — {role.name}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-muted">
        Changing the profile&apos;s job title manually clears a different primary qualified role.
      </p>
      <button type="submit" className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Set primary role</button>
    </form>
  );
}

function SharedWorkersSection({ employees, otherEmployees, sharedProfiles, venues, venue }: {
  employees: Employee[]; otherEmployees: OtherEmployee[]; sharedProfiles: SharedProfile[];
  venues: Venue[]; venue: Venue;
}) {
  const linkedEmployees = employees.filter((employee) =>
    sharedProfiles.some((profile) => profile.employee_id === employee.id));
  return (
    <section aria-label="Shared staff across venues" className="mt-6 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">Shared staff across venues</h2>
      <p className="mt-2 text-sm text-muted">
        Link profiles only after confirming they belong to the same person. Links help detect overlapping
        shifts; they do not link accounts or grant access to another venue.
      </p>
      {employees.length && otherEmployees.length ? (
        <form action={linkSharedWorkerAction} aria-label="Link shared staff" className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="venue_id" value={venue.id} />
          <label className="text-sm">Profile in {venue.name}
            <select name="employee_id" required defaultValue="" className="mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink">
              <option value="" disabled>Choose a profile</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>
                {employee.name} — {employee.role_title} — {employee.id}{employee.active ? "" : " (archived)"}
              </option>)}
            </select>
          </label>
          <label className="text-sm">Profile at another venue
            <select name="other_employee_id" required defaultValue="" className="mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink">
              <option value="" disabled>Choose a profile</option>
              {otherEmployees.map((employee) => <option key={employee.id} value={employee.id}>
                {employee.name} — {venues.find((item) => item.id === employee.venue_id)?.name ?? employee.venue_id}
                {" "}— {employee.role_title} — {employee.id}{employee.active ? "" : " (archived)"}
              </option>)}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="confirmed" value="yes" required className="mt-1" />
            I have confirmed that these profiles belong to the same person.
          </label>
          <button type="submit" className="justify-self-start rounded-lg border border-line px-4 py-2 text-sm font-semibold">Link profiles</button>
        </form>
      ) : <p className="mt-4 text-sm text-muted">Profiles in this venue and another venue are needed to create a link.</p>}
      <h3 className="mt-5 text-sm font-semibold">Links for the displayed team</h3>
      {linkedEmployees.length ? <ul className="mt-2 space-y-4">
        {linkedEmployees.map((employee) => <li key={employee.id} className="rounded-lg border border-line p-3 text-sm">
          <p className="break-words font-semibold">{employee.name} — {employee.id}</p>
          <ul className="mt-1">
            {sharedProfiles.filter((profile) => profile.employee_id === employee.id).map((profile) => (
              <li key={profile.linked_employee_id} className="break-words">
                {profile.linked_name} — {profile.linked_venue_name} — {profile.linked_employee_id}
                {profile.linked_active ? "" : " (archived)"}
              </li>
            ))}
          </ul>
          <form action={unlinkSharedWorkerAction} aria-label={`Unlink ${employee.name} ${employee.id}`} className="mt-3">
            <input type="hidden" name="venue_id" value={venue.id} />
            <input type="hidden" name="employee_id" value={employee.id} />
            <label className="flex items-start gap-2">
              <input type="checkbox" name="confirmed" value="yes" required className="mt-1" />
              Remove this profile from all its linked venues.
            </label>
            <button type="submit" className="mt-2 rounded-lg border border-line px-4 py-2 font-semibold">Unlink profile</button>
          </form>
        </li>)}
      </ul> : <p className="mt-2 text-sm text-muted">No linked profiles in the displayed team.</p>}
    </section>
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
  const venues = await readAllPages((from, to) => workspace.supabase.from("venues")
    .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
    .order("name").order("id").range(from, to), (venue) => venue.id);
  const selectedVenue = venues.data?.find((venue) => venue.id === (params.venue ?? workspace.venue.id));
  if (!venues.error && !selectedVenue) {
    console.error("Directory requested an unavailable venue.");
    redirect("/people?error=filter");
  }
  const venueId = selectedVenue?.id ?? workspace.venue.id;
  const [departments, profileRoles, jobRoles, qualifications, preferences, members, invitations] = await Promise.all([
    workspace.supabase.from("departments").select("id, name, active").eq("venue_id", venueId).order("name"),
    workspace.supabase.from("employees").select("role_title").eq("venue_id", venueId).order("role_title"),
    workspace.supabase.from("job_roles").select("id, name, department_id, active").eq("venue_id", venueId).order("name"),
    workspace.supabase.from("employee_job_roles").select("employee_id, department_id, job_role_id, is_primary").eq("venue_id", venueId),
    workspace.supabase.from("employee_preferences")
      .select("employee_id, preferred_weekly_hours, notify_schedule_email, notify_leave_email")
      .eq("business_id", workspace.business.id).eq("venue_id", venueId),
    workspace.membership.role === "owner"
      ? workspace.supabase.rpc("list_business_members", { p_business_id: workspace.business.id })
      : Promise.resolve({ data: [], error: null }),
    readAllPages<PendingStaffInvitation>((from, to) => workspace.supabase.rpc("list_pending_staff_invitations", {
      p_business_id: workspace.business.id, p_venue_id: venueId,
    }, { count: "exact" })
      .order("id").range(from, to), (invitation) => invitation.id),
  ]);
  const roleTitles = [...new Set([
    ...(profileRoles.data?.map((employee) => employee.role_title) ?? []),
    ...(jobRoles.data?.map((role) => role.name) ?? []),
  ])].sort();
  if ((!departments.error && params.department && !departments.data?.some((department) => department.id === params.department)) ||
    (!profileRoles.error && !jobRoles.error && params.role && !roleTitles.includes(params.role)) ||
    (params.status && !["all", "active", "archived"].includes(params.status))) {
    console.error("Directory requested an unavailable filter.");
    redirect("/people?error=filter");
  }
  const query = (params.q ?? "").trim().slice(0, 100);
  let employeesQuery = workspace.supabase.from("employees")
    .select("id, name, email, auth_user_id, department_id, role_title, employment_type, active")
    .eq("venue_id", venueId).order("name");
  let filterError: { code: string; message: string } | null = null;
  if (params.department) {
    const members = await workspace.supabase.from("employee_departments").select("employee_id")
      .eq("department_id", params.department);
    filterError = members.error;
    employeesQuery = employeesQuery.in("id", members.data?.map((member) => member.employee_id) ?? []);
  }
  if (params.role) {
    const primaryMatches = await workspace.supabase.from("employees").select("id")
      .eq("venue_id", venueId).eq("role_title", params.role);
    filterError ??= primaryMatches.error;
    const matchingRoles = new Set(jobRoles.data?.filter((role) => role.name === params.role).map((role) => role.id) ?? []);
    const matchingEmployees = qualifications.data?.filter((item) => matchingRoles.has(item.job_role_id))
      .map((item) => item.employee_id) ?? [];
    employeesQuery = employeesQuery.in("id", [...new Set([
      ...(primaryMatches.data?.map((employee) => employee.id) ?? []),
      ...matchingEmployees,
    ])]);
  }
  if (params.status && params.status !== "all") employeesQuery = employeesQuery.eq("active", params.status === "active");
  if (query) employeesQuery = employeesQuery.ilike("name", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
  const employees = await employeesQuery;
  const [links, otherEmployees, sharedProfiles] = await Promise.all([
    workspace.supabase.from("employee_departments").select("employee_id, department_id")
      .in("employee_id", employees.data?.map((employee) => employee.id) ?? []),
    workspace.membership.role === "owner"
      ? readAllPages((from, to) => workspace.supabase.from("employees")
        .select("id, name, venue_id, role_title, active", { count: "exact" })
        .eq("business_id", workspace.business.id).neq("venue_id", venueId)
        .order("name").order("id").range(from, to), (employee) => employee.id)
      : Promise.resolve({ data: [], error: null }),
    workspace.membership.role === "owner"
      ? readAllPages<SharedProfile>((from, to) => workspace.supabase.rpc("list_shared_worker_profiles", {
        p_business_id: workspace.business.id, p_venue_id: venueId,
      }, { count: "exact" }).order("employee_id").order("linked_employee_id").range(from, to),
      (profile) => `${profile.employee_id}:${profile.linked_employee_id}`)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const linkedDepartments = (employeeId: string) =>
    links.data?.filter((link) => link.employee_id === employeeId).map((link) => link.department_id) ?? [];
  const departmentName = (id: string) => departments.data?.find((department) => department.id === id)?.name;
  const canAssignDepartments = ["owner", "admin", "general_manager"].includes(workspace.membership.role);
  const loadError = venues.error || departments.error || profileRoles.error || jobRoles.error ||
    qualifications.error || preferences.error || members.error || filterError || employees.error || links.error ||
    otherEmployees.error || sharedProfiles.error || invitations.error;
  if (loadError) console.error("Could not load employee profiles.", { code: loadError.code, message: loadError.message });
  return (
    <AppShell businessName={workspace.business.name} venueName={selectedVenue?.name ?? workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <h1 className="text-3xl font-semibold">Employee profiles</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Maintain staff contact and employment details for this venue.
        Archiving removes a worker from new roster assignments without deleting their profile or shift history.
        Existing department associations are retained to preserve historical references.
        Set qualified roles explicitly; a matching free-text job title does not establish a qualification.
      </p>
      {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">
        {params.error === "permission" ? "You cannot manage that department." : params.error === "primary-department"
          ? "Choose another primary role before removing its department." : params.error === "primary"
          ? "Choose another primary role before removing that qualification." : params.error === "roles"
            ? "Could not save roles. Choose active roles in the worker's linked departments." : params.error === "inactive"
          ? "Inactive departments cannot be newly assigned." : params.error === "account"
          ? "Could not link that account. Choose a business member in this worker's venue and department who is not already linked there."
          : params.error === "shared-confirm" ? "Confirm the shared-profile change before saving."
          : params.error === "shared-venue" ? "This worker already has a linked profile at that venue."
          : params.error === "shared-groups" ? "These profiles belong to different shared workers. Unlink the incorrect profiles before linking them."
          : params.error === "shared-clock" ? "Finish at least one open clock session before linking these profiles."
          : params.error === "shared" ? "Could not change the shared-worker link. Check the profiles and try again."
          : params.error === "invite-duplicate" ? "An active invitation already exists. Resend or revoke it before creating another."
          : params.error === "invite-email" ? "Enter a valid invitation email address."
          : params.error === "invite-send" ? "The invitation was saved, but its email could not be requested. Check your email configuration or try Resend email later."
          : params.error === "invite-expired" ? "That invitation has expired. Send a new invitation instead."
          : params.error === "invite" ? "Could not change the invitation. Check your access and the employee's status, then try again."
          : params.error === "filter"
          ? "That directory filter is unavailable. Choose a permitted venue, department and role."
          : "Could not save employee. Check the details and try again."}
      </p>}
      {params.saved && <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-ocean">
        {params.saved === "departments" ? "Department membership saved."
          : params.saved === "roles" ? "Eligible roles saved."
            : params.saved === "primary" ? "Primary role saved."
              : params.saved === "account" ? "Account link saved."
                : params.saved === "invite-sent" ? "Invitation email requested. The recipient should check their inbox."
                  : params.saved === "invite-revoked" ? "Invitation revoked."
                : params.saved === "shared-link" ? "Shared-worker profiles linked."
                  : params.saved === "shared-unlink" ? "Shared-worker profile unlinked." : "Employee profile saved."}
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
        {departments.data?.some((department) => department.active) ? (
          <section aria-label="New employee" className="mt-6 rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">Add employee</h2>
            <EmployeeForm departments={departments.data.filter((department) => department.active)} venueId={venueId} />
          </section>
        ) : <p className="mt-6">No manageable departments are available.</p>}
        {workspace.membership.role === "owner" && selectedVenue && (
          <SharedWorkersSection employees={employees.data ?? []} otherEmployees={otherEmployees.data ?? []}
            sharedProfiles={sharedProfiles.data ?? []} venues={venues.data ?? []} venue={selectedVenue} />
        )}
        <div className="mt-6 space-y-4">
          {employees.data?.map((employee) => {
            const employeePreferences = preferences.data?.find((item) => item.employee_id === employee.id);
            return (
              <section key={employee.id}
                aria-label={`Employee ${employee.name}`} className="rounded-xl border border-line bg-white p-5">
                <h2 className="font-semibold">{employee.name} {employee.active ? "" : "(Archived)"}</h2>
                <p className="mt-1 text-sm text-muted">
                  Departments: {linkedDepartments(employee.id).map(departmentName).filter(Boolean).join(", ")}
                </p>
                <section aria-label={`Work preferences for ${employee.name}`} className="mt-4 rounded-lg border border-line p-4 text-sm">
                  <h3 className="font-semibold">Work preferences</h3>
                  {employeePreferences ? <>
                    <p className="mt-2">
                      Preferred weekly hours: {employeePreferences.preferred_weekly_hours ?? "Not specified"}
                    </p>
                    <p>Schedule emails: {employeePreferences.notify_schedule_email ? "Yes" : "No"}</p>
                    <p>Leave decision emails: {employeePreferences.notify_leave_email ? "Yes" : "No"}</p>
                  </> : <p className="mt-2 text-muted">No preferences submitted.</p>}
                  <p className="mt-2 text-xs text-muted">Preferences are not contractual limits. Email delivery is not yet available.</p>
                </section>
                {workspace.membership.role === "owner" && (
                  <EmployeeAccountForm employee={employee} members={members.data ?? []} venueId={venueId} />
                )}
                {departments.data?.some((department) => department.id === employee.department_id) && (
                  <EmployeeInvitationForm employee={employee} venueId={venueId}
                    departmentActive={Boolean(departments.data.find((department) => department.id === employee.department_id)?.active)}
                    invitation={invitations.data?.find((invitation) => invitation.employee_id === employee.id)} />
                )}
                {departments.data?.some((department) => department.id === employee.department_id) ? <>
                  <EmployeeForm employee={employee} departments={departments.data ?? []} venueId={venueId} />
                  {canAssignDepartments && <DepartmentMembershipForm employee={employee} departments={departments.data ?? []}
                    linkedIds={linkedDepartments(employee.id)} venueId={venueId} />}
                </> : <p className="mt-3 text-sm text-muted">Profile details are managed by this worker&apos;s primary department.</p>}
                {departments.data?.filter((department) => linkedDepartments(employee.id).includes(department.id))
                  .map((department) => (
                    <EligibleRolesForm key={department.id} employee={employee} department={department}
                      roles={jobRoles.data ?? []} qualifications={qualifications.data ?? []} venueId={venueId} />
                  ))}
                {departments.data?.some((department) => department.id === employee.department_id) && (
                  <PrimaryRoleForm employee={employee} departments={departments.data ?? []}
                    roles={jobRoles.data ?? []} qualifications={qualifications.data ?? []} venueId={venueId} />
                )}
              </section>
            );
          })}
          {employees.data?.length === 0 && <p>No employees match these filters.</p>}
        </div>
      </>}
    </AppShell>
  );
}
