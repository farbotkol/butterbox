import { isPayrollUuid } from "./generic-payroll-exports.ts";

export const payrollProviders = {
  xero: "Xero", myob: "MYOB", employment_hero: "Employment Hero", quickbooks: "QuickBooks",
} as const;
export type PayrollProvider = keyof typeof payrollProviders;
export type PayrollMappingConnection = {
  id: string; provider: PayrollProvider; account_id: string; name: string;
};
export type PayrollEmployeeMapping = {
  employee_id: string; employee_name: string; external_employee_id: string | null; revision: number;
};

export function isPayrollProvider(value: unknown): value is PayrollProvider {
  return typeof value === "string" && Object.hasOwn(payrollProviders, value);
}

export function payrollMappingText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= limit && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
}

export function payrollMappingRevision(value: unknown): number | null {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,9})$/.test(value)) return null;
  const revision = Number(value);
  return revision < 2147483647 ? revision : null;
}

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePayrollConnections(value: unknown): PayrollMappingConnection[] | null {
  if (!Array.isArray(value)) return null;
  const result: PayrollMappingConnection[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRow(row) || !isPayrollUuid(row.id) || !isPayrollProvider(row.provider) ||
      payrollMappingText(row.name, 100) !== row.name || payrollMappingText(row.account_id, 255) !== row.account_id ||
      typeof row.name !== "string" || typeof row.account_id !== "string" || seen.has(row.id.toLowerCase())) return null;
    seen.add(row.id.toLowerCase());
    result.push({ id: row.id, provider: row.provider, name: row.name, account_id: row.account_id });
  }
  return result;
}

export function parsePayrollEmployeeMappings(value: unknown): PayrollEmployeeMapping[] | null {
  if (!Array.isArray(value)) return null;
  const result: PayrollEmployeeMapping[] = [];
  const employees = new Set<string>();
  const externalIds = new Set<string>();
  for (const row of value) {
    if (!isRow(row) || !isPayrollUuid(row.employee_id) || typeof row.employee_name !== "string" ||
      typeof row.revision !== "number" || !Number.isInteger(row.revision) || row.revision < 0 ||
      row.revision > 2147483647 || (row.external_employee_id !== null &&
        (typeof row.external_employee_id !== "string" ||
          payrollMappingText(row.external_employee_id, 255) !== row.external_employee_id)) ||
      (row.revision === 0 && row.external_employee_id !== null) ||
      employees.has(row.employee_id.toLowerCase()) ||
      (typeof row.external_employee_id === "string" && externalIds.has(row.external_employee_id))) return null;
    employees.add(row.employee_id.toLowerCase());
    if (typeof row.external_employee_id === "string") externalIds.add(row.external_employee_id);
    result.push({
      employee_id: row.employee_id, employee_name: row.employee_name,
      external_employee_id: row.external_employee_id as string | null, revision: row.revision,
    });
  }
  return result;
}

export function payrollMappingFailure(message: string | undefined): string {
  switch (message) {
    case "Permission denied":
    case "Employee unavailable or permission denied":
    case "Payroll connection unavailable or permission denied": return "permission";
    case "Payroll employee ID is already mapped to another employee": return "duplicate";
    case "Payroll mapping changed; refresh before saving":
    case "Payroll mapping is already in that state": return "stale";
    case "Payroll connection already exists with different details": return "connection-exists";
    case "Invalid payroll connection":
    case "Invalid payroll employee mapping": return "invalid";
    case "Request identifier already used": return "retry";
    default: return "save";
  }
}
