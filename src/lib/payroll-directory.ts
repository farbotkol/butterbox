import { parsePageNumber } from "./paginated-rows.ts";
import type { PayrollEmployeeMapping } from "./payroll-mapping";

export const PAYROLL_DIRECTORY_PAGE_SIZE = 25;

export type PayrollDirectoryFilters = {
  q: string;
  status: "all" | "mapped" | "missing";
  sort: "name" | "status" | "payroll-id";
  page: number;
};

export const DEFAULT_PAYROLL_FILTERS: PayrollDirectoryFilters = {
  q: "", status: "all", sort: "name", page: 1,
};

type FilterInput = Partial<Record<keyof PayrollDirectoryFilters, unknown>>;
const filterKeys = ["q", "status", "sort", "page"] as const;

export function parsePayrollDirectoryFilters(input: FilterInput): PayrollDirectoryFilters | null {
  const q = input.q === undefined ? "" : input.q;
  const status = input.status === undefined ? "all" : input.status;
  const sort = input.sort === undefined ? "name" : input.sort;
  const page = parsePageNumber(input.page);
  if (typeof q !== "string" || q.length > 100 || /[\u0000-\u001f\u007f]/.test(q) ||
    (status !== "all" && status !== "mapped" && status !== "missing") ||
    (sort !== "name" && sort !== "status" && sort !== "payroll-id") || page === null) return null;
  return { q: q.trim(), status, sort, page };
}

export function serializePayrollDirectoryFilters(filters: PayrollDirectoryFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.sort !== "name") params.set("sort", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  return params.toString();
}

export function parsePayrollDirectoryContext(value: unknown): PayrollDirectoryFilters | null {
  if (typeof value !== "string" || value.length > 1024) return null;
  const params = new URLSearchParams(value);
  for (const key of params.keys()) {
    if (!filterKeys.some((allowed) => allowed === key) || params.getAll(key).length !== 1) return null;
  }
  const input: FilterInput = {};
  for (const key of filterKeys) {
    const item = params.get(key);
    if (item !== null) input[key] = item;
  }
  return parsePayrollDirectoryFilters(input);
}

function payrollParams(
  businessId: string, venueId: string, connectionId: string | undefined, filters: PayrollDirectoryFilters,
): URLSearchParams {
  const params = new URLSearchParams(serializePayrollDirectoryFilters(filters));
  params.set("business", businessId);
  params.set("venue", venueId);
  if (connectionId) params.set("connection", connectionId);
  return params;
}

export function payrollDirectoryHref(
  businessId: string, venueId: string, connectionId: string | undefined, filters: PayrollDirectoryFilters,
): string {
  return `/settings/payroll?${payrollParams(businessId, venueId, connectionId, filters)}`;
}

export function payrollEmployeeHref(
  businessId: string, venueId: string, connectionId: string,
  filters: PayrollDirectoryFilters, employeeId: string,
): string {
  return `/settings/payroll/${encodeURIComponent(employeeId)}?${payrollParams(businessId, venueId, connectionId, filters)}`;
}

export function payrollNewDestinationHref(
  businessId: string, venueId: string, connectionId: string | undefined, filters: PayrollDirectoryFilters,
): string {
  return `/settings/payroll/new?${payrollParams(businessId, venueId, connectionId, filters)}`;
}

export function filterAndSortPayrollMappings(
  mappings: readonly PayrollEmployeeMapping[], filters: PayrollDirectoryFilters,
): PayrollEmployeeMapping[] {
  const search = filters.q.toLocaleLowerCase();
  const label = (mapping: PayrollEmployeeMapping) => mapping.employee_name || "(Unnamed employee)";
  const sortValue = (mapping: PayrollEmployeeMapping) => {
    if (filters.sort === "status") return mapping.external_employee_id === null ? "Missing" : "Mapped";
    if (filters.sort === "payroll-id") return mapping.external_employee_id ?? "";
    return label(mapping);
  };
  return mappings.filter((mapping) => {
    const mapped = mapping.external_employee_id !== null;
    return (!search || `${mapping.employee_name} ${mapping.employee_id} ${mapping.external_employee_id ?? ""}`
      .toLocaleLowerCase().includes(search)) &&
      (filters.status === "all" || (filters.status === "mapped" ? mapped : !mapped));
  }).sort((left, right) =>
    sortValue(left).localeCompare(sortValue(right), undefined, { sensitivity: "base" }) ||
    label(left).localeCompare(label(right), undefined, { sensitivity: "base" }) ||
    left.employee_id.localeCompare(right.employee_id),
  );
}
