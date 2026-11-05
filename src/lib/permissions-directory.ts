import { parseBusinessId } from "./business-selection.ts";
import { parsePageNumber } from "./paginated-rows.ts";
import type { BusinessMember } from "./workspace";

export type PermissionsMember = BusinessMember & { full_name: string };
export const PERMISSIONS_PAGE_SIZE = 25;
export const PERMISSION_ROLES = [
  "owner", "general_manager", "foh_manager", "boh_manager", "employee", "admin", "department_manager",
] as const;

export type PermissionsFilters = {
  q: string;
  role: string;
  venue: string;
  department: string;
  sort: "identity" | "role" | "venue" | "department";
  page: number;
};

type FilterInput = Partial<Record<keyof PermissionsFilters, unknown>>;
const keys = ["q", "role", "venue", "department", "sort", "page"] as const;

function scopeFilter(value: unknown): string | null {
  if (value === undefined || value === "all") return "all";
  if (value === "unscoped") return value;
  return parseBusinessId(value) ?? null;
}

export function parsePermissionsFilters(input: FilterInput): PermissionsFilters | null {
  const q = input.q === undefined ? "" : input.q;
  const role = input.role === undefined ? "all" : input.role;
  const venue = scopeFilter(input.venue);
  const department = scopeFilter(input.department);
  const sort = input.sort === undefined ? "identity" : input.sort;
  const page = parsePageNumber(input.page);
  if (typeof q !== "string" || q.length > 100 || /[\u0000-\u001f\u007f]/.test(q) ||
    typeof role !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(role) ||
    venue === null || department === null ||
    (sort !== "identity" && sort !== "role" && sort !== "venue" && sort !== "department") ||
    page === null) return null;
  return { q: q.trim(), role, venue, department, sort, page };
}

export function serializePermissionsFilters(filters: PermissionsFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.role !== "all") params.set("role", filters.role);
  if (filters.venue !== "all") params.set("venue", filters.venue);
  if (filters.department !== "all") params.set("department", filters.department);
  if (filters.sort !== "identity") params.set("sort", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  return params.toString();
}

export function parsePermissionsFilterContext(value: unknown): PermissionsFilters | null {
  if (typeof value !== "string" || value.length > 1024) return null;
  const params = new URLSearchParams(value);
  for (const key of params.keys()) {
    if (!keys.some((allowed) => allowed === key) || params.getAll(key).length !== 1) return null;
  }
  const input: FilterInput = {};
  for (const key of keys) {
    const item = params.get(key);
    if (item !== null) input[key] = item;
  }
  return parsePermissionsFilters(input);
}

export function permissionsHref(businessId: string, filters: PermissionsFilters, userId?: string, contextVenueId?: string): string {
  const params = new URLSearchParams(serializePermissionsFilters(filters));
  params.set("business", businessId);
  if (contextVenueId) params.set("contextVenue", contextVenueId);
  const path = userId ? `/settings/permissions/${encodeURIComponent(userId)}` : "/settings/permissions";
  return `${path}?${params}`;
}

export function permissionRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    owner: "Owner",
    general_manager: "General manager",
    foh_manager: "FOH manager",
    boh_manager: "BOH manager",
    employee: "Employee",
    admin: "Administrator (legacy)",
    department_manager: "Department manager (legacy)",
  };
  return Object.hasOwn(labels, role) ? labels[role] : `${role.replaceAll("_", " ")} (legacy)`;
}

export function permissionScopeLabel(
  id: string | null, options: readonly { id: string; name: string }[], kind: "venue" | "department",
) {
  if (!id) return `No ${kind} restriction`;
  return options.find((option) => option.id === id)?.name ?? `Unavailable ${kind}`;
}

export function permissionsFiltersAvailable(
  filters: PermissionsFilters,
  roles: readonly string[],
  venues: readonly { id: string }[],
  departments: readonly { id: string }[],
): boolean {
  const availableScope = (value: string, options: readonly { id: string }[]) =>
    value === "all" || value === "unscoped" || options.some((option) => option.id === value);
  return (filters.role === "all" || roles.includes(filters.role)) &&
    availableScope(filters.venue, venues) && availableScope(filters.department, departments);
}

export function filterAndSortPermissions(
  members: readonly PermissionsMember[],
  filters: PermissionsFilters,
  venues: readonly { id: string; name: string }[],
  departments: readonly { id: string; name: string }[],
): PermissionsMember[] {
  const search = filters.q.toLocaleLowerCase();
  const matchesScope = (filter: string, value: string | null) =>
    filter === "all" || (filter === "unscoped" ? value === null : filter === value);
  const identity = (member: PermissionsMember) => member.full_name || member.email;
  const sortValue = (member: PermissionsMember) => {
    if (filters.sort === "role") return permissionRoleLabel(member.role);
    if (filters.sort === "venue") return permissionScopeLabel(member.venue_id, venues, "venue");
    if (filters.sort === "department") return permissionScopeLabel(member.department_id, departments, "department");
    return identity(member);
  };
  return members.filter((member) =>
    (!search || `${member.full_name} ${member.email}`.toLocaleLowerCase().includes(search)) &&
    (filters.role === "all" || member.role === filters.role) &&
    matchesScope(filters.venue, member.venue_id) &&
    matchesScope(filters.department, member.department_id),
  ).sort((left, right) =>
    sortValue(left).localeCompare(sortValue(right), undefined, { sensitivity: "base" }) ||
    identity(left).localeCompare(identity(right), undefined, { sensitivity: "base" }) ||
    left.email.localeCompare(right.email, undefined, { sensitivity: "base" }) ||
    left.user_id.localeCompare(right.user_id),
  );
}
