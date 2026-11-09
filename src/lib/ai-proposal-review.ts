import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isValidAiRequestContext, parseAiProposalResponse,
  type AiProposalResponse, type AiRequestContext,
} from "./ai-governance.ts";

type ReviewScope = Omit<AiRequestContext, "allowedShiftIds" | "eligibleEmployeeIds">;

export type AiProposalReviewResult =
  | { status: "denied"; message: string }
  | { status: "review_required"; proposal: AiProposalResponse };

export function deniedAiProposalReview(): AiProposalReviewResult {
  return { status: "denied", message: "This proposal cannot be reviewed. No changes were made." };
}

function parseReviewScope(value: unknown): ReviewScope | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = ["feature", "businessId", "venueId", "departmentId", "requestText"];
  if (Object.keys(value).length !== keys.length ||
    !Object.keys(value).every((key) => keys.includes(key))) return null;
  const context = { ...value, allowedShiftIds: [], eligibleEmployeeIds: [] };
  if (!isValidAiRequestContext(context)) return null;
  return context;
}

async function authorizeScope(supabase: SupabaseClient, scope: ReviewScope): Promise<string | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  // Memberships are deleted on revocation; no caller-provided identity or cached role is used.
  const { data: membership, error: membershipError } = await supabase
    .from("business_memberships")
    .select("business_id")
    .eq("user_id", user.id)
    .eq("business_id", scope.businessId)
    .maybeSingle();
  if (membershipError || !membership) return null;

  const { data: permitted, error: permissionError } = await supabase.rpc("can_manage_department", {
    p_business_id: scope.businessId,
    p_department_id: scope.departmentId,
  });
  if (permissionError || permitted !== true) return null;

  const { data: department, error: departmentError } = await supabase
    .from("departments")
    .select("id")
    .eq("business_id", scope.businessId)
    .eq("venue_id", scope.venueId)
    .eq("id", scope.departmentId)
    .eq("active", true)
    .maybeSingle();
  return departmentError || !department ? null : user.id;
}

// Internal service: the server action supplies a cookie-authenticated, RLS-bound client.
export async function reviewAiProposal(
  supabase: SupabaseClient,
  request: unknown,
  response: unknown,
): Promise<AiProposalReviewResult> {
  try {
    const scope = parseReviewScope(request);
    if (!scope) return deniedAiProposalReview();
    const userId = await authorizeScope(supabase, scope);
    if (!userId) return deniedAiProposalReview();

    const [shifts, employees] = await Promise.all([
      supabase.from("shifts")
        .select("id")
        .eq("business_id", scope.businessId)
        .eq("venue_id", scope.venueId)
        .eq("department_id", scope.departmentId)
        .eq("status", "scheduled")
        .eq("is_published", false)
        .limit(201),
      supabase.from("employee_departments")
        .select("employee_id, employees!inner(id)")
        .eq("business_id", scope.businessId)
        .eq("department_id", scope.departmentId)
        .eq("employees.business_id", scope.businessId)
        .eq("employees.venue_id", scope.venueId)
        .eq("employees.active", true)
        .limit(501),
    ]);
    if (shifts.error || employees.error || !shifts.data || !employees.data ||
      shifts.data.length > 200 || employees.data.length > 500) return deniedAiProposalReview();

    const proposal = parseAiProposalResponse(response, {
      ...scope,
      allowedShiftIds: shifts.data.map((shift) => shift.id),
      eligibleEmployeeIds: employees.data.map((employee) => employee.employee_id),
    });
    if (!proposal || await authorizeScope(supabase, scope) !== userId) return deniedAiProposalReview();

    // Untrusted prose is never exposed: it could contain restricted details or approval claims.
    return {
      status: "review_required",
      proposal: {
        ...proposal,
        summary: proposal.status === "proposal"
          ? "Draft assignments require authorized manager review. No changes were made."
          : "No assignments proposed. No changes were made.",
        ...(proposal.status === "clarification"
          ? { clarification: "Clarify the requested draft assignments within your permitted scope." }
          : {}),
      },
    };
  } catch {
    return deniedAiProposalReview();
  }
}
