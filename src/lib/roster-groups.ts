export type RosterDepartment = { id: string; name: string; active: boolean };
export type RosterEmployee = {
  id: string;
  name: string;
  department_id: string;
  role_title: string;
  active: boolean;
  profileUnavailable?: boolean;
};
export type RosterDepartmentLink = { employee_id: string; department_id: string };
export type RosterShiftAssignment = { employee_id: string | null; department_id: string };

export function groupRosterEmployees(
  departments: RosterDepartment[],
  employees: RosterEmployee[],
  links: RosterDepartmentLink[],
  shifts: RosterShiftAssignment[],
) {
  const knownEmployees = new Set(employees.map((employee) => employee.id));

  return departments.map((department) => {
    const linked = new Set(links.filter((link) => link.department_id === department.id)
      .map((link) => link.employee_id));
    const assigned = new Set(shifts.flatMap((shift) =>
      shift.department_id === department.id && shift.employee_id ? [shift.employee_id] : []));
    const members = employees.filter((employee) =>
      assigned.has(employee.id) || (employee.active && linked.has(employee.id)));
    const unavailableProfiles = [...assigned].filter((id) => !knownEmployees.has(id)).map((id) => ({
      id,
      name: "Former team member",
      department_id: department.id,
      role_title: "Profile unavailable",
      active: false,
      profileUnavailable: true,
    }));

    return { department, employees: [...members, ...unavailableProfiles] };
  }).filter((group) => group.employees.length > 0);
}
