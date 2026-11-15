import "server-only";
import { getWorkspace } from "./workspace.ts";

export async function getXeroAdminWorkspace(businessId: string) {
  const workspace = await getWorkspace(undefined, { businessId });
  if (workspace.status !== "ready" || !["owner", "admin"].includes(workspace.membership.role)) return null;
  return workspace;
}
