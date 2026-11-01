import { redirect } from "next/navigation";
import { saveDepartmentAction, saveJobRoleAction, setJobRoleAutoRestrictionAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

type Department = { id: string; name: string; active: boolean };
type JobRole = {
  id: string;
  name: string;
  active: boolean;
  department_id: string;
  restrict_auto_assignment: boolean;
};

const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];
const departmentManagerRoles = ["owner", "admin", "general_manager"];

const errorMessages: Record<string, string> = {
  duplicate: "That name is already used here. Choose a different name.",
  permission: "You don't have permission to make that change.",
  inactive: "Reactivate the department before adding or reactivating its roles.",
  filter: "That venue is not available to you.",
  save: "We couldn't save that change. Check the name and try again.",
};

const fieldClass = "mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink";

function StatusSelect({ active, label }: { active: boolean; label: string }) {
  return (
    <label className="text-sm">{label}
      <select name="active" defaultValue={active ? "true" : "false"} className={fieldClass}>
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </select>
    </label>
  );
}

export default async function OrganisationPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; saved?: string; venue?: string }> }) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") redirect("/?error=workspace");
  if (!managerRoles.includes(workspace.membership.role)) redirect("/?error=permission");

  const params = await searchParams;
  const venues = await workspace.supabase.from("venues").select("id, name")
    .eq("business_id", workspace.business.id).order("name");
  const selectedVenue = venues.data?.find((venue) => venue.id === (params.venue ?? workspace.venue.id));
  if (!venues.error && !selectedVenue) redirect("/settings/organisation?error=filter");
  const venueId = selectedVenue?.id ?? workspace.venue.id;

  const [departments, roles] = await Promise.all([
    workspace.supabase.from("departments").select("id, name, active")
      .eq("venue_id", venueId).order("name"),
    workspace.supabase.from("job_roles").select("id, name, active, department_id, restrict_auto_assignment")
      .eq("venue_id", venueId).order("name"),
  ]);
  const loadError = venues.error || departments.error || roles.error;
  if (loadError) console.error("Could not load departments and roles.", { code: loadError.code, message: loadError.message });
  const departmentRows: Department[] = departments.data ?? [];
  const roleRows: JobRole[] = roles.data ?? [];
  const canManageDepartments = departmentManagerRoles.includes(workspace.membership.role);

  return (
    <AppShell businessName={workspace.business.name} venueName={selectedVenue?.name ?? workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <h1 className="text-3xl font-semibold">Departments and roles</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Front of House and Back of House are created with every venue. Add custom departments and job roles,
        or mark them inactive to stop new staff and shifts using them. Deactivating never deletes anything:
        existing shifts and staff keep their original department and role. Restricting automatic assignment
        requires an explicitly qualified worker; manual assignment remains available.
      </p>

      {(venues.data?.length ?? 0) > 1 && (
        <form action="/settings/organisation" className="mt-5 flex items-end gap-3">
          <label className="text-sm">Venue
            <select name="venue" defaultValue={venueId} className={fieldClass}>
              {venues.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-lg border border-line px-4 py-3 text-sm font-semibold">Show venue</button>
        </form>
      )}

      {params.error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">
          {errorMessages[params.error] ?? errorMessages.save}
        </p>
      )}
      {params.saved && (
        <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-ocean">
          {params.saved === "role" ? "Job role saved."
            : params.saved === "restriction" ? "Automatic assignment setting saved."
              : "Department saved."}
        </p>
      )}

      {loadError ? (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">We could not load departments. Try again.</p>
      ) : (
        <>
          {canManageDepartments && (
            <section aria-label="Add department" className="mt-6 rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">Add department</h2>
              <form action={saveDepartmentAction} className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
                <input type="hidden" name="venue_id" value={venueId} />
                <input type="hidden" name="active" value="true" />
                <label className="text-sm">Department name
                  <input name="name" required maxLength={80} className={fieldClass} />
                </label>
                <button type="submit" className="self-end rounded-lg bg-ocean px-4 py-3 font-semibold text-white">Add department</button>
              </form>
            </section>
          )}

          <div className="mt-6 space-y-4">
            {departmentRows.map((department) => (
              <section key={department.id} aria-label={`Department ${department.name}`}
                className="rounded-xl border border-line bg-white p-5">
                <h2 className="font-semibold">
                  {department.name}
                  {!department.active && <>{" "}<span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Inactive</span></>}
                </h2>
                {canManageDepartments && (
                  <form action={saveDepartmentAction} className="mt-4 grid gap-4 sm:grid-cols-3">
                    <input type="hidden" name="venue_id" value={venueId} />
                    <input type="hidden" name="department_id" value={department.id} />
                    <label className="text-sm">Department name
                      <input name="name" required maxLength={80} defaultValue={department.name} className={fieldClass} />
                    </label>
                    <StatusSelect active={department.active} label="Department status" />
                    <button type="submit" className="self-end rounded-lg border border-line px-4 py-3 font-semibold">Save department</button>
                  </form>
                )}

                <h3 className="mt-5 text-sm font-semibold text-muted">Job roles</h3>
                <ul className="mt-2 space-y-3">
                  {roleRows.filter((role) => role.department_id === department.id).map((role) => (
                    <li key={role.id} aria-label={`Job role ${role.name}`}>
                      <form action={saveJobRoleAction} className="grid gap-3 sm:grid-cols-3">
                        <input type="hidden" name="venue_id" value={venueId} />
                        <input type="hidden" name="department_id" value={department.id} />
                        <input type="hidden" name="job_role_id" value={role.id} />
                        <label className="text-sm">Role name
                          <input name="name" required maxLength={80} defaultValue={role.name} className={fieldClass} />
                        </label>
                        <StatusSelect active={role.active} label="Role status" />
                        <button type="submit" className="self-end rounded-lg border border-line px-4 py-3 text-sm font-semibold">Save role</button>
                      </form>
                      <form action={setJobRoleAutoRestrictionAction} className="mt-3 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="venue_id" value={venueId} />
                        <input type="hidden" name="job_role_id" value={role.id} />
                        <label className="text-sm">Automatic assignment
                          <select name="restricted" defaultValue={String(role.restrict_auto_assignment)} className={fieldClass}>
                            <option value="false">Any linked worker</option>
                            <option value="true">Qualified workers only</option>
                          </select>
                        </label>
                        <button type="submit" className="rounded-lg border border-line px-4 py-3 text-sm font-semibold">Save restriction</button>
                      </form>
                    </li>
                  ))}
                </ul>
                {department.active && (
                  <form action={saveJobRoleAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="venue_id" value={venueId} />
                    <input type="hidden" name="department_id" value={department.id} />
                    <input type="hidden" name="active" value="true" />
                    <label className="text-sm">New role name
                      <input name="name" required maxLength={80} className={fieldClass} />
                    </label>
                    <button type="submit" className="self-end rounded-lg bg-ocean px-4 py-3 text-sm font-semibold text-white">Add role</button>
                  </form>
                )}
              </section>
            ))}
            {departmentRows.length === 0 && (
              <p className="rounded-lg border border-line bg-white p-4 text-sm text-muted">No departments are available to you at this venue.</p>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
