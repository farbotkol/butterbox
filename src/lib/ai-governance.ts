export const aiFeatures = [
  "roster_request",
  "recommendation_explanation",
  "staff_replacement",
  "open_shift_candidates",
] as const;

export type AiFeature = (typeof aiFeatures)[number];
export type AiProposalStatus = "proposal" | "clarification" | "refusal";

export type AiRequestContext = {
  feature: AiFeature;
  businessId: string;
  venueId: string;
  departmentId: string;
  requestText: string;
  allowedShiftIds: readonly string[];
  eligibleEmployeeIds: readonly string[];
};

export type ProposedShiftAssignment = {
  kind: "assign_shift";
  shiftId: string;
  employeeId: string;
};

export type AiProposalResponse = {
  status: AiProposalStatus;
  feature: AiFeature;
  businessId: string;
  venueId: string;
  departmentId: string;
  summary: string;
  actions: ProposedShiftAssignment[];
  clarification?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedFeatures = new Set<string>(aiFeatures);
const allowedStatuses = new Set<string>(["proposal", "clarification", "refusal"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isSafeText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isValidAiRequestContext(value: unknown): value is AiRequestContext {
  if (!isRecord(value) || !hasExactKeys(value, [
    "feature", "businessId", "venueId", "departmentId", "requestText",
    "allowedShiftIds", "eligibleEmployeeIds",
  ]) || typeof value.feature !== "string" || !allowedFeatures.has(value.feature) ||
    typeof value.businessId !== "string" || !uuidPattern.test(value.businessId) ||
    typeof value.venueId !== "string" || !uuidPattern.test(value.venueId) ||
    typeof value.departmentId !== "string" || !uuidPattern.test(value.departmentId) ||
    !isSafeText(value.requestText, 2_000) ||
    !Array.isArray(value.allowedShiftIds) || value.allowedShiftIds.length > 200 ||
    !value.allowedShiftIds.every((id) => typeof id === "string" && uuidPattern.test(id)) ||
    !Array.isArray(value.eligibleEmployeeIds) || value.eligibleEmployeeIds.length > 500 ||
    !value.eligibleEmployeeIds.every((id) => typeof id === "string" && uuidPattern.test(id))) {
    return false;
  }
  return true;
}

export function parseAiProposalResponse(
  value: unknown,
  context: AiRequestContext,
): AiProposalResponse | null {
  if (!isValidAiRequestContext(context) || !isRecord(value)) return null;
  const keys = Object.hasOwn(value, "clarification")
    ? ["status", "feature", "businessId", "venueId", "departmentId", "summary", "actions", "clarification"]
    : ["status", "feature", "businessId", "venueId", "departmentId", "summary", "actions"];
  if (!hasExactKeys(value, keys) ||
    typeof value.status !== "string" || !allowedStatuses.has(value.status) ||
    value.feature !== context.feature ||
    value.businessId !== context.businessId ||
    value.venueId !== context.venueId ||
    value.departmentId !== context.departmentId ||
    !isSafeText(value.summary, 500) ||
    !Array.isArray(value.actions) || value.actions.length > 20) {
    return null;
  }

  const actions: ProposedShiftAssignment[] = [];
  const usedShifts = new Set<string>();
  for (const action of value.actions) {
    if (!isRecord(action) || !hasExactKeys(action, ["kind", "shiftId", "employeeId"]) ||
      action.kind !== "assign_shift" ||
      typeof action.shiftId !== "string" || !uuidPattern.test(action.shiftId) ||
      typeof action.employeeId !== "string" || !uuidPattern.test(action.employeeId) ||
      !context.allowedShiftIds.includes(action.shiftId) ||
      !context.eligibleEmployeeIds.includes(action.employeeId) ||
      usedShifts.has(action.shiftId)) {
      return null;
    }
    usedShifts.add(action.shiftId);
    actions.push({ kind: "assign_shift", shiftId: action.shiftId, employeeId: action.employeeId });
  }

  if (value.status === "proposal") {
    if (actions.length === 0 || Object.hasOwn(value, "clarification")) return null;
  } else if (actions.length > 0) {
    return null;
  }

  if (value.status === "clarification") {
    if (!isSafeText(value.clarification, 500)) return null;
  } else if (Object.hasOwn(value, "clarification")) {
    return null;
  }

  return {
    status: value.status as AiProposalStatus,
    feature: context.feature,
    businessId: context.businessId,
    venueId: context.venueId,
    departmentId: context.departmentId,
    summary: value.summary,
    actions,
    ...(value.status === "clarification" ? { clarification: value.clarification as string } : {}),
  };
}
