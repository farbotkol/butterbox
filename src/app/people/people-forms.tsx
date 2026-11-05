import {
  createStaffInvitationAction, linkSharedWorkerAction, resendStaffInvitationAction,
  revokeStaffInvitationAction, saveEmployeeAction, setEmployeeAuthUserAction,
  setEmployeeDepartmentsAction, setEmployeeEligibleRolesAction, setEmployeePrimaryRoleAction,
  unlinkSharedWorkerAction,
} from "@/app/actions";
import { SaveButton } from "@/components/inline-editor";
import type { EmploymentMetadataSnapshot } from "@/lib/employment-rule-metadata";
import type { PendingStaffInvitation } from "@/lib/invitations";
import { serializePeopleFilters, type PeopleFilters } from "@/lib/people-directory";
import type { BusinessMember } from "@/lib/workspace";

export type Employee = {
  id: string;
  name: string;
  email: string | null;
  auth_user_id: string | null;
  department_id: string;
  role_title: string;
  employment_type: string;
  active: boolean;
  profile_revision: number;
};
export type Department = { id: string; name: string; active?: boolean };
export type JobRole = { id: string; name: string; department_id: string; active: boolean };
export type Qualification = { employee_id: string; department_id: string; job_role_id: string; is_primary: boolean };
export type Venue = { id: string; name: string };
export type OtherEmployee = { id: string; name: string; venue_id: string; role_title: string; active: boolean };
export type SharedProfile = {
  employee_id: string; linked_employee_id: string; linked_name: string;
  linked_venue_name: string; linked_active: boolean;
};
export type PeopleFormContext = { businessId: string; venueId: string; filters: PeopleFilters };

function FormContextInputs({ context, employeeId }: { context: PeopleFormContext; employeeId?: string }) {
  return <>
    <input type="hidden" name="business_id" value={context.businessId} />
    <input type="hidden" name="venue_id" value={context.venueId} />
    <input type="hidden" name="people_origin" value={employeeId ? "profile" : "new"} />
    <input type="hidden" name="people_filters" value={serializePeopleFilters(context.filters)} />
    {employeeId && <input type="hidden" name="employee_id" value={employeeId} />}
  </>;
}

function SnapshotInputs({ name, ids }: { name: string; ids: string[] }) {
  return ids.map((id) => <input key={id} type="hidden" name={name} value={id} />);
}

function memberHasEmployeeScope(member: BusinessMember, employee: Employee, venueId: string) {
  if (["owner", "admin"].includes(member.role)) return true;
  if (member.venue_id && member.venue_id !== venueId) return false;
  return member.role === "general_manager" ||
    (["foh_manager", "boh_manager", "department_manager"].includes(member.role) &&
      member.department_id === employee.department_id) ||
    (member.role === "employee" &&
      (member.department_id === null || member.department_id === employee.department_id));
}

export function EmployeeAccountForm({ employee, members, context }: {
  employee: Employee; members: BusinessMember[]; context: PeopleFormContext;
}) {
  const choices = members.filter((member) =>
    memberHasEmployeeScope(member, employee, context.venueId) || member.user_id === employee.auth_user_id);
  return (
    <form action={setEmployeeAuthUserAction} aria-label={`Account for ${employee.name}`}
      className="mt-4 rounded-lg border border-line p-4">
      <FormContextInputs context={context} employeeId={employee.id} />
      <input type="hidden" name="profile_revision" value={employee.profile_revision} />
      <label className="text-sm">Linked business member
        <select name="user_id" defaultValue={employee.auth_user_id ?? ""}
          className="mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink">
          <option value="">No linked account</option>
          {choices.map((member) => (
            <option key={member.user_id} value={member.user_id}
              disabled={!memberHasEmployeeScope(member, employee, context.venueId)}>
              {member.email || member.user_id}{memberHasEmployeeScope(member, employee, context.venueId) ? "" : " (out of scope)"}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-muted">
        Link an existing member to let them view their shifts and manage their own availability.
      </p>
      <SaveButton className="mt-3 min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Save account link</SaveButton>
    </form>
  );
}

export function EmployeeInvitationForm({ employee, invitation, context, departmentActive }: {
  employee: Employee; invitation?: PendingStaffInvitation; context: PeopleFormContext; departmentActive: boolean;
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
            <FormContextInputs context={context} employeeId={employee.id} />
            <input type="hidden" name="invitation_id" value={invitation.id} />
            <SaveButton className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Resend email</SaveButton>
          </form>}
          <form action={revokeStaffInvitationAction} aria-label={`Revoke invitation for ${employee.name}`}>
            <FormContextInputs context={context} employeeId={employee.id} />
            <input type="hidden" name="invitation_id" value={invitation.id} />
            <SaveButton className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Revoke invitation</SaveButton>
          </form>
        </div>
        {!canInvite && <p className="mt-2 text-xs text-muted">
          This profile is not available for acceptance. Revoke the invitation if it is no longer needed.
        </p>}
      </>}
      {canInvite && (!invitation || expired) && <form
        action={createStaffInvitationAction} aria-label={`Invite ${employee.name}`} className="mt-3">
        <FormContextInputs context={context} employeeId={employee.id} />
        <input type="hidden" name="department_id" value={employee.department_id} />
        <label className="block text-sm">Invitation email
          <input type="email" name="email" required maxLength={254} defaultValue={employee.email ?? ""}
            className="mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink" />
        </label>
        <p className="mt-2 text-xs text-muted">
          The recipient verifies their email and chooses their own password. Invitations expire after seven days.
          People who already use Butterbox elsewhere join this business with employee access only.
        </p>
        <SaveButton className="mt-3 min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">
          Send invitation
        </SaveButton>
      </form>}
      {!canInvite && !invitation && <p className="mt-2 text-sm text-muted">
        {employee.auth_user_id ? "This profile already has a linked account." : "Only active staff in active departments can be invited."}
      </p>}
    </section>
  );
}

type EmployeeFormProps = { departments: Department[]; context: PeopleFormContext } & (
  | { employee: Employee; employment: EmploymentMetadataSnapshot; createRequestId?: never }
  | { employee?: never; employment?: never; createRequestId: string }
);

export function EmployeeForm({ employee, departments, context, employment, createRequestId }: EmployeeFormProps) {
  const fieldClass = "mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink";
  return (
    <form action={saveEmployeeAction} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <FormContextInputs context={context} employeeId={employee?.id} />
      <input type="hidden" name="employment_revision" value={employment?.revision ?? 0} />
      {employee && <input type="hidden" name="profile_revision" value={employee.profile_revision} />}
      {createRequestId && <input type="hidden" name="request_id" value={createRequestId} />}
      <input type="hidden" name="active" value={employee?.active === false ? "false" : "true"} />
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
      <div>
        <label className="text-sm">Employment type
          <select name="employment_type" defaultValue={employment?.employment_basis ?? employee?.employment_type ?? "casual"} className={fieldClass}>
            <option value="unknown">Unknown</option>
            <option value="casual">Casual</option>
            <option value="part_time">Part time</option>
            <option value="full_time">Full time</option>
          </select>
        </label>
        <p className="mt-1 text-xs text-muted">
          This profile label is not an award classification. Changing it for an existing profile records a basis effective today.
        </p>
      </div>
      <SaveButton className="min-h-11 rounded-lg bg-ocean px-4 py-3 font-semibold text-white">
        {employee ? "Save employee" : "Add employee"}
      </SaveButton>
    </form>
  );
}

export function EmployeeLifecycleForm({ employee, context, employment }: {
  employee: Employee; context: PeopleFormContext; employment: EmploymentMetadataSnapshot;
}) {
  return <form action={saveEmployeeAction} aria-label={`${employee.active ? "Archive" : "Reactivate"} ${employee.name}`}
    className="mt-4 rounded-lg border border-line p-4">
    <FormContextInputs context={context} employeeId={employee.id} />
    <input type="hidden" name="department_id" value={employee.department_id} />
    <input type="hidden" name="name" value={employee.name} />
    <input type="hidden" name="email" value={employee.email ?? ""} />
    <input type="hidden" name="role_title" value={employee.role_title} />
    <input type="hidden" name="employment_type" value={employment.employment_basis ?? employee.employment_type} />
    <input type="hidden" name="employment_revision" value={employment.revision} />
    <input type="hidden" name="profile_revision" value={employee.profile_revision} />
    <input type="hidden" name="active" value={employee.active ? "false" : "true"} />
    <p className="text-sm text-muted">
      {employee.active
        ? "Archiving prevents new roster assignments. Existing shifts, timesheets and history remain."
        : "Reactivation makes this person available for eligible new roster assignments. Existing history remains."}
    </p>
    <label className="mt-3 flex items-start gap-2 text-sm">
      <input type="checkbox" name="confirmed" value="yes" required className="mt-1 h-4 w-4" />
      I confirm this status change.
    </label>
    <SaveButton className="mt-3 min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold">
      {employee.active ? "Confirm archive" : "Confirm reactivation"}
    </SaveButton>
  </form>;
}

export function DepartmentMembershipForm({ employee, departments, linkedIds, context }: {
  employee: Employee; departments: Department[]; linkedIds: string[]; context: PeopleFormContext;
}) {
  const choices = departments.filter((department) => department.active || linkedIds.includes(department.id));
  return (
    <form action={setEmployeeDepartmentsAction} aria-label={`Departments for ${employee.name}`} className="mt-4 rounded-lg border border-line p-4">
      <FormContextInputs context={context} employeeId={employee.id} />
      <SnapshotInputs name="expected_department_ids" ids={linkedIds} />
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
      <SaveButton className="mt-3 min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Save departments</SaveButton>
    </form>
  );
}

export function EligibleRolesForm({ employee, department, roles, qualifications, context }: {
  employee: Employee; department: Department; roles: JobRole[];
  qualifications: Qualification[]; context: PeopleFormContext;
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
      <FormContextInputs context={context} employeeId={employee.id} />
      <SnapshotInputs name="expected_job_role_ids" ids={selectedIds} />
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
      <SaveButton className="mt-3 min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Save eligible roles</SaveButton>
    </form>
  );
}

export function PrimaryRoleForm({ employee, departments, roles, qualifications, context }: {
  employee: Employee; departments: Department[]; roles: JobRole[];
  qualifications: Qualification[]; context: PeopleFormContext;
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
      <FormContextInputs context={context} employeeId={employee.id} />
      <input type="hidden" name="profile_revision" value={employee.profile_revision} />
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
      <SaveButton className="mt-3 min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Set primary role</SaveButton>
    </form>
  );
}

export function SharedWorkersSection({ employee, otherEmployees, sharedProfiles, venues, venue, context }: {
  employee: Employee; otherEmployees: OtherEmployee[]; sharedProfiles: SharedProfile[];
  venues: Venue[]; venue: Venue; context: PeopleFormContext;
}) {
  const linkedProfiles = sharedProfiles.filter((profile) => profile.employee_id === employee.id);
  return (
    <section aria-label="Shared staff across venues" className="mt-6 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">Shared staff across venues</h2>
      <p className="mt-2 text-sm text-muted">
        Link profiles only after confirming they belong to the same person. Links help detect overlapping
        shifts; they do not link accounts or grant access to another venue.
      </p>
      {otherEmployees.length ? (
        <form action={linkSharedWorkerAction} aria-label="Link shared staff" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormContextInputs context={context} employeeId={employee.id} />
          <SnapshotInputs name="expected_linked_ids" ids={linkedProfiles.map((profile) => profile.linked_employee_id)} />
          <p className="break-words text-sm">Profile in {venue.name}: <strong>{employee.name}</strong></p>
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
          <SaveButton className="min-h-11 justify-self-start rounded-lg border border-line px-4 py-2 text-sm font-semibold">Link profiles</SaveButton>
        </form>
      ) : <p className="mt-4 text-sm text-muted">Profiles in this venue and another venue are needed to create a link.</p>}
      <h3 className="mt-5 text-sm font-semibold">Links for the displayed team</h3>
      {linkedProfiles.length ? <ul className="mt-2 space-y-4">
        <li className="rounded-lg border border-line p-3 text-sm">
          <p className="break-words font-semibold">{employee.name} — {employee.id}</p>
          <ul className="mt-1">
            {linkedProfiles.map((profile) => (
              <li key={profile.linked_employee_id} className="break-words">
                {profile.linked_name} — {profile.linked_venue_name} — {profile.linked_employee_id}
                {profile.linked_active ? "" : " (archived)"}
              </li>
            ))}
          </ul>
          <form action={unlinkSharedWorkerAction} aria-label={`Unlink ${employee.name} ${employee.id}`} className="mt-3">
            <FormContextInputs context={context} employeeId={employee.id} />
            <SnapshotInputs name="expected_linked_ids" ids={linkedProfiles.map((profile) => profile.linked_employee_id)} />
            <label className="flex items-start gap-2">
              <input type="checkbox" name="confirmed" value="yes" required className="mt-1" />
              Remove this profile from all its linked venues.
            </label>
            <SaveButton className="mt-2 min-h-11 rounded-lg border border-line px-4 py-2 font-semibold">Unlink profile</SaveButton>
          </form>
        </li>
      </ul> : <p className="mt-2 text-sm text-muted">No linked profiles in the displayed team.</p>}
    </section>
  );
}
