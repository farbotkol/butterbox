import { redirect } from "next/navigation";
import { assignMemberRoleAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace, type BusinessMember } from "@/lib/workspace";

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; business?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(undefined, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") redirect("/?error=workspace");
  if (workspace.membership.role !== "owner") redirect("/?error=permission");

  const [members, venues, departments] = await Promise.all([
    workspace.supabase.rpc("list_business_members", { p_business_id: workspace.business.id }),
    workspace.supabase.from("venues").select("id, name").eq("business_id", workspace.business.id).order("name"),
    workspace.supabase.from("departments").select("id, name, venue_id").eq("business_id", workspace.business.id).order("name"),
  ]);
  const loadError = members.error || venues.error || departments.error;
  if (loadError) console.error("Could not load business permissions.", loadError);
  const memberRows: BusinessMember[] = members.data ?? [];

  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length} venueName={workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <h1 className="text-3xl font-semibold">Business permissions</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Owners have business-wide access. General managers manage one venue.
        FOH and BOH managers manage an assigned department; employees see their own published shifts.
        Choose no venue or department for owners, a venue only for general managers,
        and both a venue and department for other roles. At least one owner must remain.
      </p>
      {params.error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">
          {params.error === "last-owner"
            ? "A business must retain an owner. Assign another owner before changing your role."
            : "Role assignment failed. Check the role, venue and department scope and try again."}
        </p>
      )}
      {params.saved && <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-ocean">Permissions updated.</p>}
      {loadError ? (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">We could not load permissions. Try again.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {memberRows.map((member) => (
            <section key={member.user_id} aria-label={`Permissions for ${member.email}`}
              className="rounded-xl border border-line bg-white p-5">
              <h2 className="break-all font-semibold">{member.email}</h2>
              <form action={assignMemberRoleAction} className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <input type="hidden" name="business_id" value={workspace.business.id} />
                <input type="hidden" name="user_id" value={member.user_id} />
                <label className="text-sm">Role
                  <select name="role" defaultValue={member.role} className="mt-2 block w-full rounded-lg border border-line p-3">
                    <option value="owner">Owner</option>
                    <option value="general_manager">General manager</option>
                    <option value="foh_manager">FOH manager</option>
                    <option value="boh_manager">BOH manager</option>
                    <option value="employee">Employee</option>
                    {!["owner", "general_manager", "foh_manager", "boh_manager", "employee"].includes(member.role) &&
                      <option value={member.role} disabled>{member.role.replaceAll("_", " ")} (legacy)</option>}
                  </select>
                </label>
                <label className="text-sm">Venue
                  <select name="venue_id" defaultValue={member.venue_id ?? ""} className="mt-2 block w-full rounded-lg border border-line p-3">
                    <option value="">No venue scope</option>
                    {venues.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                  </select>
                </label>
                <label className="text-sm">Department
                  <select name="department_id" defaultValue={member.department_id ?? ""} className="mt-2 block w-full rounded-lg border border-line p-3">
                    <option value="">No department scope</option>
                    {departments.data?.map((department) => <option key={department.id} value={department.id}>
                      {venues.data?.find((venue) => venue.id === department.venue_id)?.name} / {department.name}
                    </option>)}
                  </select>
                </label>
                <button type="submit" className="self-end rounded-lg bg-ocean px-4 py-3 font-semibold text-white">Save permissions</button>
              </form>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
