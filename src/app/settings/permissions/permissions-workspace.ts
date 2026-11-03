import { redirect } from "next/navigation";
import { withBusiness } from "@/lib/business-selection";
import { readAllPages } from "@/lib/paginated-rows";
import type { PermissionsMember } from "@/lib/permissions-directory";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

export type PermissionsSearch = {
  business?: string; q?: string; role?: string; venue?: string; department?: string;
  sort?: string; page?: string; error?: string; saved?: string;
};
export type PermissionVenue = { id: string; name: string };
export type PermissionDepartment = { id: string; name: string; venue_id: string };

export async function requirePermissionsWorkspace(search: PermissionsSearch) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const workspace = await getWorkspace(undefined, { businessId: search.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the permissions workspace.", { message: workspace.message });
    redirect("/?error=workspace");
  }
  if (workspace.membership.role !== "owner") {
    redirect(withBusiness("/?error=permission", workspace.business.id));
  }
  return workspace;
}

export async function loadPermissionsData(workspace: Awaited<ReturnType<typeof requirePermissionsWorkspace>>) {
  const businessId = workspace.business.id;
  const [members, venues, departments] = await Promise.all([
    readAllPages<PermissionsMember>((from, to) => workspace.supabase
      .rpc("list_business_members_for_permissions", { p_business_id: businessId }, { count: "exact" })
      .range(from, to), (member) => member.user_id),
    readAllPages<PermissionVenue>((from, to) => workspace.supabase.from("venues")
      .select("id, name", { count: "exact" }).eq("business_id", businessId)
      .order("name").order("id").range(from, to), (venue) => venue.id),
    readAllPages<PermissionDepartment>((from, to) => workspace.supabase.from("departments")
      .select("id, name, venue_id", { count: "exact" }).eq("business_id", businessId)
      .order("name").order("id").range(from, to), (department) => department.id),
  ]);
  const error = members.error ?? venues.error ?? departments.error;
  if (error || !members.data || !venues.data || !departments.data) {
    console.error("Could not load business permissions.", error);
    throw new Error("Business permissions could not be loaded.");
  }
  return { members: members.data, venues: venues.data, departments: departments.data };
}
