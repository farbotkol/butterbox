export function collapsedRosterDepartments(
  value: string | string[] | undefined,
  permittedDepartmentIds: readonly string[],
): string[] {
  const permitted = new Set(permittedDepartmentIds);
  const requested = typeof value === "string" ? [value] : value ?? [];
  return [...new Set(requested.filter((id) => permitted.has(id)))];
}

export function toggleRosterDepartment(collapsed: readonly string[], departmentId: string): string[] {
  return collapsed.includes(departmentId)
    ? collapsed.filter((id) => id !== departmentId)
    : [...collapsed, departmentId];
}

export function rosterViewHref(
  week: string,
  department: string | undefined,
  collapsed: readonly string[],
  venue?: string,
  query?: string,
  business?: string,
): string {
  const params = new URLSearchParams({ week });
  if (venue) params.set("venue", venue);
  if (department) params.set("department", department);
  for (const id of collapsed) params.append("collapsed", id);
  if (query) params.set("q", query);
  if (business) params.set("business", business);
  return `/roster?${params.toString()}`;
}

export function rosterSearchQuery(value: string | string[] | undefined): string | null {
  return value === undefined ? "" : typeof value === "string" && value.length <= 100 ? value.trim() : null;
}

export function matchesRosterSearch(name: string, query: string): boolean {
  return name.toLocaleLowerCase("en-AU").includes(query.toLocaleLowerCase("en-AU"));
}

export function rosterShortcut(event: {
  key: string; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean;
  repeat: boolean; defaultPrevented: boolean;
}): "previous" | "next" | "search" | null {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.repeat || event.defaultPrevented) return null;
  if (event.key === "ArrowLeft") return "previous";
  if (event.key === "ArrowRight") return "next";
  return event.key.toLowerCase() === "f" ? "search" : null;
}
