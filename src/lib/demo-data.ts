import type { SupabaseClient } from "@supabase/supabase-js";
import { demoDataProjectRef } from "@/lib/demo-data-environment";

export async function workspaceDemoDataApproved(supabase: SupabaseClient): Promise<boolean> {
  const projectRef = demoDataProjectRef(process.env);
  if (!projectRef) return false;
  try {
    const { data, error } = await supabase.rpc("workspace_demo_data_environment_enabled", {
      p_project_ref: projectRef,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
