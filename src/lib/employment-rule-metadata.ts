import { isPayrollUuid } from "./generic-payroll-exports.ts";
import { payrollMappingRevision, payrollMappingText } from "./payroll-mapping.ts";

export const employmentBases = {
  unknown: "Unknown",
  casual: "Casual",
  part_time: "Part time",
  full_time: "Full time",
} as const;
export type EmploymentBasis = keyof typeof employmentBases;

export type EmploymentMetadataSnapshot = {
  employee_id: string;
  employment_basis: EmploymentBasis | null;
  effective_on: string | null;
  revision: number;
};

export type EmploymentMetadataEvent = {
  id: string;
  employee_id: string;
  effective_on: string;
  employment_basis: EmploymentBasis;
  classification: string | null;
  award_reference: string | null;
  contract_reference: string | null;
  revision: number;
  source: "dated_editor" | "profile_edit";
  actor_id: string;
  recorded_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isEmploymentBasis(value: unknown): value is EmploymentBasis {
  return typeof value === "string" && Object.hasOwn(employmentBases, value);
}

export function isEmploymentEffectiveDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" || value > "9999-12-31") return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function optionalText(value: unknown, limit: number): { valid: true; value: string | null } | { valid: false } {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return { valid: false };
  if (!value.trim()) return { valid: true, value: null };
  const text = payrollMappingText(value, limit);
  return text === null ? { valid: false } : { valid: true, value: text };
}

export function parseEmploymentMetadataInput(input: {
  employeeId: unknown; effectiveOn: unknown; employmentBasis: unknown;
  classification: unknown; awardReference: unknown; contractReference: unknown;
  revision: unknown; requestId: unknown;
}) {
  const classification = optionalText(input.classification, 100);
  const awardReference = optionalText(input.awardReference, 255);
  const contractReference = optionalText(input.contractReference, 255);
  const revision = payrollMappingRevision(input.revision);
  if (!isPayrollUuid(input.employeeId) || !isEmploymentEffectiveDate(input.effectiveOn) ||
    !isEmploymentBasis(input.employmentBasis) || !classification.valid ||
    !awardReference.valid || !contractReference.valid || revision === null ||
    !isPayrollUuid(input.requestId)) return null;
  return {
    employeeId: input.employeeId,
    effectiveOn: input.effectiveOn,
    employmentBasis: input.employmentBasis,
    classification: classification.value,
    awardReference: awardReference.value,
    contractReference: contractReference.value,
    revision,
    requestId: input.requestId,
  };
}

function isOptionalStoredText(value: unknown, limit: number): value is string | null {
  return value === null || (typeof value === "string" && payrollMappingText(value, limit) === value);
}

export function parseEmploymentMetadataSnapshots(value: unknown): EmploymentMetadataSnapshot[] | null {
  if (!Array.isArray(value)) return null;
  const result: EmploymentMetadataSnapshot[] = [];
  const employees = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isPayrollUuid(row.employee_id) ||
      typeof row.revision !== "number" || !Number.isInteger(row.revision) ||
      row.revision < 0 || row.revision > 2147483647 ||
      (row.employment_basis !== null && !isEmploymentBasis(row.employment_basis)) ||
      (row.effective_on !== null && !isEmploymentEffectiveDate(row.effective_on)) ||
      (row.employment_basis === null) !== (row.effective_on === null) ||
      (row.employment_basis !== null && row.revision === 0) ||
      employees.has(row.employee_id.toLowerCase())) return null;
    employees.add(row.employee_id.toLowerCase());
    result.push({
      employee_id: row.employee_id,
      employment_basis: row.employment_basis,
      effective_on: row.effective_on,
      revision: row.revision,
    });
  }
  return result;
}

export function parseEmploymentMetadataEvents(value: unknown, employeeId: string): EmploymentMetadataEvent[] | null {
  if (!Array.isArray(value) || !isPayrollUuid(employeeId)) return null;
  const normalizedEmployeeId = employeeId.toLowerCase();
  const result: EmploymentMetadataEvent[] = [];
  const ids = new Set<string>();
  const revisions = new Set<number>();
  for (const row of value) {
    if (!isRecord(row) || !isPayrollUuid(row.id) || !isPayrollUuid(row.employee_id) ||
      row.employee_id.toLowerCase() !== normalizedEmployeeId ||
      !isEmploymentEffectiveDate(row.effective_on) || !isEmploymentBasis(row.employment_basis) ||
      !isOptionalStoredText(row.classification, 100) || !isOptionalStoredText(row.award_reference, 255) ||
      !isOptionalStoredText(row.contract_reference, 255) ||
      typeof row.revision !== "number" || !Number.isInteger(row.revision) ||
      row.revision < 1 || row.revision > 2147483647 ||
      (row.source !== "dated_editor" && row.source !== "profile_edit") || !isPayrollUuid(row.actor_id) ||
      typeof row.recorded_at !== "string" || !Number.isFinite(Date.parse(row.recorded_at)) ||
      ids.has(row.id.toLowerCase()) || revisions.has(row.revision)) return null;
    ids.add(row.id.toLowerCase());
    revisions.add(row.revision);
    result.push({
      id: row.id, employee_id: normalizedEmployeeId, effective_on: row.effective_on,
      employment_basis: row.employment_basis, classification: row.classification,
      award_reference: row.award_reference, contract_reference: row.contract_reference,
      revision: row.revision, source: row.source, actor_id: row.actor_id, recorded_at: row.recorded_at,
    });
  }
  return result;
}

export function currentEmploymentMetadata(events: EmploymentMetadataEvent[], today: string) {
  if (!isEmploymentEffectiveDate(today)) throw new RangeError("Invalid employment metadata date.");
  return events.reduce<EmploymentMetadataEvent | null>((current, event) => {
    if (event.effective_on > today) return current;
    if (!current || event.effective_on > current.effective_on ||
      (event.effective_on === current.effective_on && event.revision > current.revision)) return event;
    return current;
  }, null);
}

export function employmentMetadataFailure(message: string | undefined) {
  switch (message) {
    case "Permission denied":
    case "Employee unavailable or permission denied":
    case "Employee not found in this department": return "permission";
    case "Employment metadata changed; refresh before saving": return "stale";
    case "Invalid employment metadata": return "invalid";
    case "Request identifier already used": return "retry";
    default: return "save";
  }
}
