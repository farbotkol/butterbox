import {
  saveDepartmentAction, saveJobRoleAction, setJobRoleAutoRestrictionAction, setJobRoleManualRestrictionAction,
} from "@/app/actions";
import { InlineEditor, SaveButton } from "@/components/inline-editor";
import { serializeDepartmentFilters, type DepartmentFilters } from "@/lib/department-directory";

export type DepartmentRecord = { id: string; name: string; active: boolean; venue_id: string };
export type JobRoleRecord = {
  id: string; name: string; active: boolean; department_id: string;
  restrict_auto_assignment: boolean; restrict_manual_assignment: boolean;
};
export type DepartmentContext = { businessId: string; venueId: string; filters: DepartmentFilters };

const fieldClass = "mt-2 block w-full min-w-0 rounded-lg border border-line bg-white p-3 text-ink";
const saveClass = "min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white";

function ContextFields({ context, origin, departmentId, roleId }: {
  context: DepartmentContext; origin: "list" | "department" | "role"; departmentId?: string; roleId?: string;
}) {
  return <>
    <input type="hidden" name="business_id" value={context.businessId} />
    <input type="hidden" name="venue_id" value={context.venueId} />
    <input type="hidden" name="department_origin" value={origin} />
    <input type="hidden" name="department_filters" value={serializeDepartmentFilters(context.filters)} />
    {departmentId && <input type="hidden" name="department_id" value={departmentId} />}
    {roleId && <input type="hidden" name="job_role_id" value={roleId} />}
  </>;
}

function SnapshotFields({ record }: { record: { name: string; active: boolean } }) {
  return <>
    <input type="hidden" name="expected_name" value={record.name} />
    <input type="hidden" name="expected_active" value={String(record.active)} />
  </>;
}

export function DepartmentCreate({ context }: { context: DepartmentContext }) {
  return <section aria-label="Add department" className="mt-6 border-t border-line pt-5">
    <InlineEditor label="Add department" read={<p className="text-sm text-muted">
      Create a department for this venue.
    </p>} editor={<form action={saveDepartmentAction} aria-label="Create department" className="mt-3 max-w-lg space-y-3">
      <ContextFields context={context} origin="list" />
      <input type="hidden" name="active" value="true" />
      <label className="block text-sm">Department name
        <input name="name" required maxLength={80} className={fieldClass} />
      </label>
      <SaveButton className={saveClass}>Create department</SaveButton>
    </form>} />
  </section>;
}

export function DepartmentDetails({ context, department, canManage }: {
  context: DepartmentContext; department: DepartmentRecord; canManage: boolean;
}) {
  return <section aria-label="Department details" className="mt-6 rounded-xl border border-line bg-white p-5">
    <h2 className="font-semibold">Department details</h2>
    {canManage ? <InlineEditor label="Edit department details" read={<dl className="mt-3 grid min-w-0 gap-2 text-sm [overflow-wrap:anywhere]">
      <div className="min-w-0"><dt className="inline text-muted">Name: </dt><dd className="inline font-medium">{department.name}</dd></div>
      <div><dt className="inline text-muted">Status: </dt><dd className="inline">{department.active ? "Active" : "Inactive"}</dd></div>
    </dl>} editor={<form action={saveDepartmentAction} aria-label="Edit department details" className="mt-3 max-w-lg space-y-3">
      <ContextFields context={context} origin="department" departmentId={department.id} />
      <SnapshotFields record={department} />
      <input type="hidden" name="active" value={String(department.active)} />
      <label className="block text-sm">Department name
        <input name="name" required maxLength={80} defaultValue={department.name} className={fieldClass} />
      </label>
      <SaveButton className={saveClass}>Save department</SaveButton>
    </form>} /> : <dl className="mt-3 grid min-w-0 gap-2 text-sm [overflow-wrap:anywhere]">
      <div className="min-w-0"><dt className="inline text-muted">Name: </dt><dd className="inline font-medium">{department.name}</dd></div>
      <div><dt className="inline text-muted">Status: </dt><dd className="inline">{department.active ? "Active" : "Inactive"}</dd></div>
    </dl>}
    {canManage && <div className="mt-5 border-t border-line pt-4">
      <InlineEditor label={department.active ? "Deactivate department" : "Reactivate department"}
        read={<p className="text-sm text-muted">Status changes never delete existing staff or shift history.</p>}
        editor={<form action={saveDepartmentAction} aria-label="Confirm department status change" className="mt-3 space-y-3">
          <ContextFields context={context} origin="department" departmentId={department.id} />
          <SnapshotFields record={department} />
          <input type="hidden" name="name" value={department.name} />
          <input type="hidden" name="active" value={String(!department.active)} />
          <p className="text-sm">
            {department.active
              ? "Deactivating prevents new staff and shifts using this department. Existing staff and shifts remain in the history."
              : "Reactivating makes this department available for new staff and shifts again."}
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm_lifecycle" value="true" required className="mt-1" />
            <span>I confirm this department status change.</span>
          </label>
          <SaveButton className={saveClass}>{department.active ? "Confirm deactivation" : "Confirm reactivation"}</SaveButton>
        </form>} />
    </div>}
  </section>;
}

export function RoleCreate({ context, department }: { context: DepartmentContext; department: DepartmentRecord }) {
  if (!department.active) return <p className="mt-4 text-sm text-muted">Reactivate this department before adding a role.</p>;
  return <div className="mt-5 border-t border-line pt-4">
    <InlineEditor label="Add role" read={<p className="text-sm text-muted">Add a role to this department.</p>}
      editor={<form action={saveJobRoleAction} aria-label="Create job role" className="mt-3 max-w-lg space-y-3">
        <ContextFields context={context} origin="department" departmentId={department.id} />
        <input type="hidden" name="active" value="true" />
        <label className="block text-sm">Role name
          <input name="name" required maxLength={80} className={fieldClass} />
        </label>
        <SaveButton className={saveClass}>Create role</SaveButton>
      </form>} />
  </div>;
}

function RestrictionSnapshot({ role }: { role: JobRoleRecord }) {
  return <>
    <SnapshotFields record={role} />
    <input type="hidden" name="expected_auto" value={String(role.restrict_auto_assignment)} />
    <input type="hidden" name="expected_manual" value={String(role.restrict_manual_assignment)} />
  </>;
}

export function RoleDetails({ context, department, role }: {
  context: DepartmentContext; department: DepartmentRecord; role: JobRoleRecord;
}) {
  const automatic = role.restrict_auto_assignment ? "Qualified workers only"
    : role.restrict_manual_assignment ? "Follows manual restriction (qualified workers only)" : "Any linked worker";
  return <>
    <section aria-label="Role details" className="mt-6 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">Role details</h2>
      {!department.active && role.active && <p className="mt-2 text-sm text-muted">
        Reactivate this department before saving changes to this active role.
      </p>}
      <InlineEditor label="Edit role details" read={<dl className="mt-3 grid min-w-0 gap-2 text-sm [overflow-wrap:anywhere]">
        <div className="min-w-0"><dt className="inline text-muted">Name: </dt><dd className="inline font-medium">{role.name}</dd></div>
        <div><dt className="inline text-muted">Status: </dt><dd className="inline">{role.active ? "Active" : "Inactive"}</dd></div>
      </dl>} editor={<form action={saveJobRoleAction} aria-label="Edit role details" className="mt-3 max-w-lg space-y-3">
        <ContextFields context={context} origin="role" departmentId={department.id} roleId={role.id} />
        <SnapshotFields record={role} />
        <input type="hidden" name="active" value={String(role.active)} />
        <label className="block text-sm">Role name
          <input name="name" required maxLength={80} defaultValue={role.name} className={fieldClass} />
        </label>
        <p className="text-sm text-muted">Existing shifts retain their recorded role name.</p>
        <SaveButton className={saveClass}>Save role</SaveButton>
      </form>} />
      <div className="mt-5 border-t border-line pt-4">
        {!department.active && !role.active
          ? <p className="text-sm text-muted">Reactivate this department before reactivating the role.</p>
          : <InlineEditor label={role.active ? "Deactivate role" : "Reactivate role"}
            read={<p className="text-sm text-muted">Status changes do not delete existing shifts or staff qualifications.</p>}
            editor={<form action={saveJobRoleAction} aria-label="Confirm role status change" className="mt-3 space-y-3">
              <ContextFields context={context} origin="role" departmentId={department.id} roleId={role.id} />
              <SnapshotFields record={role} />
              <input type="hidden" name="name" value={role.name} />
              <input type="hidden" name="active" value={String(!role.active)} />
              <p className="text-sm">{role.active
                ? "Deactivating prevents new shifts and qualifications using this role. Existing shifts and qualifications remain."
                : "Reactivating makes this role available for new shifts and qualifications again."}</p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirm_lifecycle" value="true" required className="mt-1" />
                <span>I confirm this role status change.</span>
              </label>
              <SaveButton className={saveClass}>{role.active ? "Confirm deactivation" : "Confirm reactivation"}</SaveButton>
            </form>} />}
      </div>
    </section>
    <section aria-label="Assignment restrictions" className="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">Assignment restrictions</h2>
      <p className="mt-2 text-sm text-muted">
        Qualified workers are staff assigned this role in their employee profile. Automatic and manual
        settings are separate; restricting manual assignment also restricts automatic selection.
        Automatic selection still checks availability, conflicts and other roster rules. Existing assignments are not changed.
      </p>
      <div className="mt-4">
        <h3 className="text-sm font-semibold">Automatic assignment</h3>
        <InlineEditor label="Edit automatic assignment" read={<p className="mt-1 text-sm">{automatic}</p>}
          editor={<form action={setJobRoleAutoRestrictionAction} aria-label="Edit automatic assignment"
            className="mt-3 max-w-lg space-y-3">
            <ContextFields context={context} origin="role" departmentId={department.id} roleId={role.id} />
            <RestrictionSnapshot role={role} />
            <label className="block text-sm">Automatic assignment
              <select name="restricted" defaultValue={String(role.restrict_auto_assignment)} className={fieldClass}>
                <option value="false">{role.restrict_manual_assignment
                  ? "Follow manual restriction (qualified workers only)" : "Any linked worker"}</option>
                <option value="true">Qualified workers only</option>
              </select>
            </label>
            <SaveButton className={saveClass}>Save automatic assignment</SaveButton>
          </form>} />
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Manual assignment</h3>
        <InlineEditor label="Edit manual assignment" read={<p className="mt-1 text-sm">
          {role.restrict_manual_assignment ? "Qualified workers only" : "Any linked worker"}
        </p>} editor={<form action={setJobRoleManualRestrictionAction} aria-label="Edit manual assignment"
          className="mt-3 max-w-lg space-y-3">
          <ContextFields context={context} origin="role" departmentId={department.id} roleId={role.id} />
          <RestrictionSnapshot role={role} />
          <label className="block text-sm">Manual assignment
            <select name="restricted" defaultValue={String(role.restrict_manual_assignment)} className={fieldClass}>
              <option value="false">Any linked worker</option>
              <option value="true">Qualified workers only</option>
            </select>
          </label>
          <SaveButton className={saveClass}>Save manual assignment</SaveButton>
        </form>} />
      </div>
    </section>
  </>;
}
