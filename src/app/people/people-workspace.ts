import { redirect } from "next/navigation";
import { parseBusinessId, withBusiness } from "@/lib/business-selection";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

export type PeopleSearch = {
  error?: string; saved?: string; venue?: string; business?: string;
  department?: string; role?: string; q?: string; status?: string; sort?: string; page?: string;
};

export async function requirePeopleWorkspace(search: PeopleSearch) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const workspace = await getWorkspace(undefined, {
    businessId: search.business, venueHint: search.venue, page: true,
  });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the People workspace.", { message: workspace.message });
    redirect("/?error=workspace");
  }
  if (!["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"]
    .includes(workspace.membership.role)) {
    redirect(withBusiness("/?error=permission", workspace.business.id));
  }
  if (search.venue !== undefined && parseBusinessId(search.venue) !== workspace.venue.id) {
    console.error("People requested an unavailable venue.");
    redirect(withBusiness("/people?error=filter", workspace.business.id));
  }
  return workspace;
}
