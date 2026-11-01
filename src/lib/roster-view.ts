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
): string {
  const params = new URLSearchParams({ week });
  if (venue) params.set("venue", venue);
  if (department) params.set("department", department);
  for (const id of collapsed) params.append("collapsed", id);
  return `/roster?${params.toString()}`;
}
