import { redirect } from "next/navigation";
import { withBusiness } from "@/lib/business-selection";
import { isPayrollUuid } from "@/lib/generic-payroll-exports";
import { readAllPages } from "@/lib/paginated-rows";
import {
  parsePayrollConnections, parsePayrollEmployeeMappings,
  type PayrollEmployeeMapping, type PayrollMappingConnection,
} from "@/lib/payroll-mapping";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

type SearchValue = string | string[] | undefined;
export type PayrollSearch = {
  business?: SearchValue; venue?: SearchValue; connection?: SearchValue;
  q?: SearchValue; status?: SearchValue; sort?: SearchValue; page?: SearchValue;
  error?: SearchValue; saved?: SearchValue;
};
export type PayrollWorkspace = Extract<Awaited<ReturnType<typeof getWorkspace>>, { status: "ready" }>;

export async function requirePayrollWorkspace(search: PayrollSearch): Promise<PayrollWorkspace | null> {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  if ((search.business !== undefined && !isPayrollUuid(search.business)) ||
    (search.venue !== undefined && !isPayrollUuid(search.venue))) {
    console.error("Invalid payroll business or venue context.");
    return null;
  }
  const workspace = await getWorkspace(search.venue, { businessId: search.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load payroll mappings.", { message: workspace.message });
    return null;
  }
  if (!["owner", "admin"].includes(workspace.membership.role)) {
    redirect(withBusiness("/?error=permission", workspace.business.id));
  }
  return workspace;
}

export async function loadPayrollConnections(workspace: PayrollWorkspace): Promise<PayrollMappingConnection[]> {
  const result = await readAllPages<PayrollMappingConnection>((from, to) => workspace.supabase
    .rpc("list_payroll_mapping_connections", { p_business_id: workspace.business.id }, { count: "exact" })
    .order("name").order("id").range(from, to), (connection) => connection.id);
  const connections = parsePayrollConnections(result.data);
  if (result.error || !connections) {
    console.error("Could not load payroll destinations.", result.error ?? { message: "Invalid destination data." });
    throw new Error("Payroll destinations could not be loaded.");
  }
  return connections;
}

export function selectPayrollConnection(
  connections: readonly PayrollMappingConnection[], requested: unknown,
): PayrollMappingConnection | undefined {
  if (requested === undefined) return connections[0];
  if (!isPayrollUuid(requested)) return undefined;
  return connections.find((connection) => connection.id.toLowerCase() === requested.toLowerCase());
}

export async function loadPayrollMappings(
  workspace: PayrollWorkspace, connection: PayrollMappingConnection,
): Promise<PayrollEmployeeMapping[]> {
  const result = await readAllPages<PayrollEmployeeMapping>((from, to) => workspace.supabase
    .rpc("list_payroll_employee_mappings", {
      p_business_id: workspace.business.id, p_connection_id: connection.id, p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("employee_name").order("employee_id").range(from, to),
  (mapping) => mapping.employee_id);
  const mappings = parsePayrollEmployeeMappings(result.data);
  if (result.error || !mappings) {
    console.error("Could not load payroll employee mappings.", result.error ?? { message: "Invalid mapping data." });
    throw new Error("Payroll employee mappings could not be loaded.");
  }
  return mappings;
}
