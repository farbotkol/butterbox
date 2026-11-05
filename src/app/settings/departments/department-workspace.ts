import { redirect } from "next/navigation";
import { parseBusinessId, withBusiness } from "@/lib/business-selection";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

export type DepartmentSearch = {
  business?: string; venue?: string; q?: string; status?: string; sort?: string; page?: string;
  error?: string; saved?: string;
};

export async function requireDepartmentWorkspace(search: DepartmentSearch) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const workspace = await getWorkspace(undefined, {
    businessId: search.business, venueHint: search.venue, page: true,
  });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the department workspace.", { message: workspace.message });
    redirect("/?error=workspace");
  }
  if (!["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"]
    .includes(workspace.membership.role)) {
    redirect(withBusiness("/?error=permission", workspace.business.id));
  }
  if (search.venue !== undefined && parseBusinessId(search.venue) !== workspace.venue.id) {
    console.error("Departments requested an unavailable venue.");
    redirect(withBusiness("/settings/departments?error=filter", workspace.business.id));
  }
  return workspace;
}
