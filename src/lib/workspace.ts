import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AppData, Employee, Permission, Session, Shift } from "./domain";
import { demoEnabled, getDemoStore } from "./demo-store";
import { supabase, supabaseConfigured } from "./supabase";

export async function getSession(): Promise<Session | null> {
  if (demoEnabled()) {
    const token = (await cookies()).get("butterbox-demo")?.value;
    return token ? getDemoStore().session(token) : null;
  }
  if (!supabaseConfigured()) return null;
  const db = await supabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: memberships, error } = await db.from("business_memberships").select("*").eq("user_id", user.id).order("created_at").limit(1);
  if (error) throw new Error("Unable to load membership. Check database migrations.");
  const membership = memberships?.[0];
  if (!membership) return null;
  const [profile, venues, departments, employee, permissions] = await Promise.all([
    db.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle(),
    db.from("venue_memberships").select("venue_id").eq("user_id", user.id).eq("business_id", membership.business_id),
    db.from("department_memberships").select("department_id").eq("user_id", user.id).eq("business_id", membership.business_id),
    db.from("employees").select("id,display_name").eq("user_id", user.id).eq("business_id", membership.business_id).maybeSingle(),
    db.from("role_permissions").select("permission").eq("business_id", membership.business_id).eq("role", membership.role),
  ]);
  if ([profile, venues, departments, employee, permissions].some(result => result.error))
    throw new Error("Unable to load account permissions.");
  return {
    userId: user.id, businessId: membership.business_id, role: membership.role,
    displayName: profile.data?.display_name ?? employee.data?.display_name ?? "Team member",
    employeeId: employee.data?.id ?? null,
    venueIds: venues.data?.map(v => v.venue_id) ?? [],
    departmentIds: departments.data?.map(d => d.department_id) ?? [],
    permissions: membership.role === "owner" ? ["manage_roster", "publish_roster", "manage_employees"] :
      (permissions.data?.map(p => p.permission) ?? []) as Permission[],
  };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

async function loadShifts(db: Awaited<ReturnType<typeof supabase>>, businessId: string) {
  const shifts: Shift[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await db.from("shifts").select("*").eq("business_id", businessId)
      .order("starts_at").order("id").range(offset, offset + 499);
    if (result.error) return { data: null, error: result.error };
    shifts.push(...result.data);
    if (result.data.length < 500) return { data: shifts, error: null };
  }
}

export async function getAppData(): Promise<AppData> {
  const session = await requireSession();
  if (demoEnabled()) return { ...getDemoStore().workspace(session), session, demo: true };
  const db = await supabase();
  const [business, venues, departments, roles, employees, assignments, shifts] = await Promise.all([
    db.from("businesses").select("id,name").eq("id", session.businessId).single(),
    db.from("venues").select("*").eq("business_id", session.businessId),
    db.from("departments").select("*").eq("business_id", session.businessId),
    db.from("job_roles").select("*").eq("business_id", session.businessId),
    db.from("employees").select("id,business_id,user_id,display_name").eq("business_id", session.businessId),
    db.from("employee_department_roles").select("employee_id,department_id,role_id").eq("business_id", session.businessId),
    loadShifts(db, session.businessId),
  ]);
  if ([business, venues, departments, roles, employees, assignments, shifts].some(r => r.error) || !business.data)
    throw new Error("Unable to load workspace. Check database setup and permissions.");
  const members: Employee[] = (employees.data ?? []).map(e => ({
    ...e,
    department_ids: [...new Set((assignments.data ?? []).filter(a => a.employee_id === e.id).map(a => a.department_id))],
    role_ids: [...new Set((assignments.data ?? []).filter(a => a.employee_id === e.id).map(a => a.role_id))],
  }));
  return {
    business: business.data, venues: venues.data ?? [], departments: departments.data ?? [],
    jobRoles: roles.data ?? [], employees: members, shifts: shifts.data ?? [], session, demo: false,
  };
}
