import { parseBusinessId } from "./business-selection.ts";
import { parsePageNumber } from "./paginated-rows.ts";

export type PeopleSort = "name" | "department" | "role" | "status";
export type PeopleStatus = "all" | "active" | "archived";
export type PeopleFilters = {
  q: string;
  department: string;
  role: string;
  status: PeopleStatus;
  sort: PeopleSort;
  page: number;
};

type FilterInput = Partial<Record<keyof PeopleFilters, unknown>>;
const filterKeys = ["q", "department", "role", "status", "sort", "page"] as const;

export function parsePeopleFilters(input: FilterInput): PeopleFilters | null {
  const q = input.q === undefined ? "" : input.q;
  const department = input.department === undefined ? "" : input.department;
  const role = input.role === undefined ? "" : input.role;
  const status = input.status === undefined ? "all" : input.status;
  const sort = input.sort === undefined ? "name" : input.sort;
  const page = parsePageNumber(input.page);
  if (typeof q !== "string" || q.length > 100 || /[\u0000-\u001f\u007f]/.test(q) ||
    typeof role !== "string" || role.length > 80 || /[\u0000-\u001f\u007f]/.test(role) ||
    typeof department !== "string" || (department !== "" && typeof parseBusinessId(department) !== "string") ||
    (status !== "all" && status !== "active" && status !== "archived") ||
    (sort !== "name" && sort !== "department" && sort !== "role" && sort !== "status") ||
    page === null) return null;
  return {
    q: q.trim(), department: department.toLowerCase(), role: role.trim(), status, sort, page,
  };
}

export function serializePeopleFilters(filters: PeopleFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.department) params.set("department", filters.department);
  if (filters.role) params.set("role", filters.role);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.sort !== "name") params.set("sort", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  return params.toString();
}

export function parsePeopleFilterContext(value: unknown): PeopleFilters | null {
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
  return parsePeopleFilters(input);
}

export function peopleHref(
  businessId: string,
  venueId: string,
  filters: PeopleFilters,
  employeeId?: string,
): string {
  const params = new URLSearchParams(serializePeopleFilters(filters));
  params.set("business", businessId);
  params.set("venue", venueId);
  const path = employeeId ? `/people/${encodeURIComponent(employeeId)}` : "/people";
  return `${path}?${params}`;
}
