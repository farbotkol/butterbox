import type { OfferCandidate } from "./shift-offers.ts";

export type SuggestionRole = { id: string; department_id: string; name: string };
export type SuggestionRoleAssignment = { employee_id: string; department_id: string; job_role_id: string };
export type SuggestionShift = {
  employee_id: string | null;
  department_id: string;
  starts_at: string;
  ends_at: string;
};
export type ShiftOfferSuggestion = {
  employeeId: string;
  employeeName: string;
  roleMatch: "recorded" | "not_recorded" | "not_configured";
  hasAvailabilityPattern: boolean;
  scheduledSeconds: number;
};

export function suggestShiftOfferCandidates({
  candidates,
  departmentId,
  roleTitle,
  roles,
  assignments,
  shifts,
  patternEmployees,
}: {
  candidates: readonly OfferCandidate[];
  departmentId: string;
  roleTitle: string;
  roles: readonly SuggestionRole[];
  assignments: readonly SuggestionRoleAssignment[] | null;
  shifts: readonly SuggestionShift[];
  patternEmployees: ReadonlySet<string>;
}): ShiftOfferSuggestion[] | null {
  if (assignments === null) return null;
  const eligible = candidates.filter((candidate) => candidate.ineligibility === null);
  const eligibleIds = new Set(eligible.map((candidate) => candidate.employee_id));
  const roleIds = new Set(roles.filter((role) =>
    role.department_id === departmentId && role.name.toLowerCase() === roleTitle.trim().toLowerCase(),
  ).map((role) => role.id));
  const matchingEmployees = new Set(assignments.filter((assignment) =>
    assignment.department_id === departmentId && roleIds.has(assignment.job_role_id),
  ).map((assignment) => assignment.employee_id));
  const scheduledMilliseconds = new Map<string, number>();

  for (const shift of shifts) {
    if (shift.department_id !== departmentId || !shift.employee_id || !eligibleIds.has(shift.employee_id)) continue;
    const duration = Date.parse(shift.ends_at) - Date.parse(shift.starts_at);
    const total = (scheduledMilliseconds.get(shift.employee_id) ?? 0) + duration;
    if (!Number.isSafeInteger(duration) || duration <= 0 || !Number.isSafeInteger(total)) return null;
    scheduledMilliseconds.set(shift.employee_id, total);
  }

  const suggestions: ShiftOfferSuggestion[] = eligible.map((candidate) => ({
    employeeId: candidate.employee_id,
    employeeName: candidate.employee_name,
    roleMatch: roleIds.size === 0 ? "not_configured"
      : matchingEmployees.has(candidate.employee_id) ? "recorded" : "not_recorded",
    hasAvailabilityPattern: patternEmployees.has(candidate.employee_id),
    scheduledSeconds: (scheduledMilliseconds.get(candidate.employee_id) ?? 0) / 1000,
  }));
  return suggestions.sort((left, right) =>
    Number(right.roleMatch === "recorded") - Number(left.roleMatch === "recorded") ||
    left.scheduledSeconds - right.scheduledSeconds ||
    left.employeeId.localeCompare(right.employeeId),
  );
}
