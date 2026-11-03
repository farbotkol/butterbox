import { parsePageNumber } from "./paginated-rows.ts";

export type DepartmentFilters = {
  q: string;
  status: "all" | "active" | "inactive";
  sort: "name" | "status" | "roles";
  page: number;
};

type FilterInput = Partial<Record<keyof DepartmentFilters, unknown>>;
const filterKeys = ["q", "status", "sort", "page"] as const;

export function parseDepartmentFilters(input: FilterInput): DepartmentFilters | null {
  const q = input.q === undefined ? "" : input.q;
  const status = input.status === undefined ? "all" : input.status;
  const sort = input.sort === undefined ? "name" : input.sort;
  const page = parsePageNumber(input.page);
  if (typeof q !== "string" || q.length > 100 || /[\u0000-\u001f\u007f]/.test(q) ||
    (status !== "all" && status !== "active" && status !== "inactive") ||
    (sort !== "name" && sort !== "status" && sort !== "roles") || page === null) return null;
  return { q: q.trim(), status, sort, page };
}

export function serializeDepartmentFilters(filters: DepartmentFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.sort !== "name") params.set("sort", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  return params.toString();
}

export function parseDepartmentFilterContext(value: unknown): DepartmentFilters | null {
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
  return parseDepartmentFilters(input);
}

export function departmentHref(
  businessId: string,
  venueId: string,
  filters: DepartmentFilters,
  departmentId?: string,
  roleId?: string,
): string {
  const params = new URLSearchParams(serializeDepartmentFilters(filters));
  params.set("business", businessId);
  params.set("venue", venueId);
  let path = "/settings/departments";
  if (departmentId) path += `/${encodeURIComponent(departmentId)}`;
  if (roleId) path += `/roles/${encodeURIComponent(roleId)}`;
  return `${path}?${params}`;
}
