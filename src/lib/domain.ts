import { z } from "zod";

export type AccessRole = "owner" | "general_manager" | "department_manager" | "employee";
export type Permission = "manage_roster" | "publish_roster" | "manage_employees";
export interface Session {
  userId: string;
  businessId: string;
  employeeId: string | null;
  displayName: string;
  role: AccessRole;
  venueIds: string[];
  departmentIds: string[];
  permissions: Permission[];
}
export interface Venue {
  id: string;
  business_id: string;
  name: string;
  timezone: string;
}
export interface Department { id: string; venue_id: string; name: string }
export interface JobRole { id: string; department_id: string; name: string }
export interface Employee {
  id: string;
  business_id: string;
  user_id: string | null;
  display_name: string;
  department_ids: string[];
  role_ids: string[];
}
export interface Shift {
  id: string;
  business_id: string;
  venue_id: string;
  department_id: string;
  role_id: string;
  employee_id: string | null;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  status: "draft" | "published";
  version: number;
}
export interface Workspace {
  business: { id: string; name: string };
  venues: Venue[];
  departments: Department[];
  jobRoles: JobRole[];
  employees: Employee[];
  shifts: Shift[];
}
export interface AppData extends Workspace { session: Session; demo: boolean }
export type ActionResult = { error?: string; success?: string };

export const shiftSchema = z.object({
  id: z.guid().optional(),
  version: z.number().int().positive().optional(),
  venue_id: z.guid(),
  department_id: z.guid(),
  role_id: z.guid(),
  employee_id: z.guid().nullable(),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  break_minutes: z.number().int().min(0).max(480),
}).superRefine((shift, ctx) => {
  const duration = (Date.parse(shift.ends_at) - Date.parse(shift.starts_at)) / 60000;
  if (duration <= 0 || duration > 24 * 60)
    ctx.addIssue({ code: "custom", message: "Shifts must have a positive duration of no more than 24 hours." });
  if (shift.break_minutes >= duration)
    ctx.addIssue({ code: "custom", message: "Scheduled breaks must be shorter than the shift." });
  if (Boolean(shift.id) !== Boolean(shift.version))
    ctx.addIssue({ code: "custom", message: "Editing requires the current shift version." });
});
export type ShiftInput = z.infer<typeof shiftSchema>;

export function canManage(session: Session, department: Department): boolean {
  return session.permissions.includes("manage_roster") &&
    (session.role === "owner" || (
      session.venueIds.includes(department.venue_id) &&
      (session.role === "general_manager" || session.departmentIds.includes(department.id))
    ));
}

export function validateShift(session: Session, data: Workspace, input: ShiftInput): void {
  const department = data.departments.find(d => d.id === input.department_id);
  if (!department || department.venue_id !== input.venue_id || !canManage(session, department))
    throw new Error("You cannot manage this department.");
  if (!data.jobRoles.some(r => r.id === input.role_id && r.department_id === department.id))
    throw new Error("Choose a role in this department.");
  if (input.employee_id) {
    const employee = data.employees.find(e => e.id === input.employee_id);
    if (!employee || !employee.department_ids.includes(department.id) ||
        !employee.role_ids.includes(input.role_id))
      throw new Error("This employee is not eligible for the selected department and role.");
    if (data.shifts.some(s => s.id !== input.id && s.employee_id === input.employee_id &&
        Date.parse(s.starts_at) < Date.parse(input.ends_at) &&
        Date.parse(s.ends_at) > Date.parse(input.starts_at)))
      throw new Error("This employee already has an overlapping shift.");
  }
}

export function scheduledHours(shifts: Shift[]): number {
  return shifts.reduce((sum, s) =>
    sum + (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 3600000 - s.break_minutes / 60, 0);
}
