"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { shiftSchema, type ActionResult, type ShiftInput } from "@/lib/domain";
import { demoEnabled, getDemoStore } from "@/lib/demo-store";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { getSession, requireSession } from "@/lib/workspace";

function refresh() {
  for (const path of ["/", "/roster", "/team"]) revalidatePath(path);
}

function databaseError(error: { code?: string }): ActionResult {
  if (error.code === "23P01") return { error: "This employee already has an overlapping shift." };
  if (error.code === "42501") return { error: "You do not have permission for this action." };
  if (error.code === "40001") return { error: "This shift changed. Refresh and try again." };
  return { error: "The change could not be saved. Check eligibility, dates and permissions, then refresh." };
}

export async function loginAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({
    email: z.email().max(254),
    password: z.string().min(1).max(256),
  }).safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter a valid email address and password." };
  if (demoEnabled()) {
    const token = getDemoStore().login(parsed.data.email.toLowerCase(), parsed.data.password);
    if (!token) return { error: "Unable to sign in. Check your details or try again later." };
    (await cookies()).set("butterbox-demo", token, {
      httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 8 * 3600,
    });
  } else {
    if (!supabaseConfigured()) return { error: "Configure Supabase, or enable local demo mode. See the README." };
    const { error } = await (await supabase()).auth.signInWithPassword(parsed.data);
    if (error) return { error: "Unable to sign in. Check your details or try again later." };
    if (!await getSession()) redirect("/setup");
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  if (demoEnabled()) {
    const jar = await cookies();
    const token = jar.get("butterbox-demo")?.value;
    if (token) getDemoStore().logout(token);
    jar.delete("butterbox-demo");
  } else if (supabaseConfigured()) await (await supabase()).auth.signOut();
  redirect("/login");
}

export async function saveShiftAction(raw: ShiftInput): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = shiftSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid shift." };
  if (demoEnabled()) {
    try { getDemoStore().saveShift(session, parsed.data); }
    catch (error) { return { error: error instanceof Error ? error.message : "Unable to save shift." }; }
  } else {
    const { error } = await (await supabase()).rpc("save_shift", { p_input: parsed.data });
    if (error) return databaseError(error);
  }
  refresh();
  return { success: "Draft shift saved." };
}

export async function deleteShiftAction(id: string, version: number): Promise<ActionResult> {
  const session = await requireSession();
  if (!z.guid().safeParse(id).success || !z.number().int().positive().safeParse(version).success)
    return { error: "Invalid shift." };
  if (demoEnabled()) {
    try { getDemoStore().deleteShift(session, id, version); }
    catch (error) { return { error: error instanceof Error ? error.message : "Unable to delete shift." }; }
  } else {
    const { error } = await (await supabase()).rpc("delete_shift", { p_id: id, p_version: version });
    if (error) return databaseError(error);
  }
  refresh();
  return { success: "Draft shift deleted." };
}

export async function publishRosterAction(raw: {
  venueId: string; departmentId: string; weekStart: string; weekEnd: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = z.object({
    venueId: z.guid(), departmentId: z.guid(),
    weekStart: z.iso.datetime({ offset: true }), weekEnd: z.iso.datetime({ offset: true }),
  }).safeParse(raw);
  if (!parsed.success) return { error: "Choose a valid department and week." };
  const { venueId, departmentId, weekStart, weekEnd } = parsed.data;
  const duration = Date.parse(weekEnd) - Date.parse(weekStart);
  if (duration <= 0 || duration > 8 * 86400000) return { error: "Choose a valid roster week." };
  if (demoEnabled()) {
    try { getDemoStore().publish(session, venueId, departmentId, weekStart, weekEnd); }
    catch (error) { return { error: error instanceof Error ? error.message : "Unable to publish roster." }; }
  } else {
    const { error } = await (await supabase()).rpc("publish_roster", {
      p_venue_id: venueId, p_department_id: departmentId, p_week_start: weekStart, p_week_end: weekEnd,
    });
    if (error) return databaseError(error);
  }
  refresh();
  return { success: "Roster published. Employees can now view these shifts." };
}

export async function bootstrapAction(): Promise<ActionResult> {
  if (demoEnabled() || !supabaseConfigured()) return { error: "Configure Supabase first." };
  const db = await supabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { error } = await db.rpc("bootstrap_demo_business");
  if (error) return { error: "Unable to create the sample business. Check that migrations are applied." };
  redirect("/");
}
