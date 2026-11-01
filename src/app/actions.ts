"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

function text(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function secret(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

export async function signInAction(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");

  const email = text(formData, "email", 254).toLowerCase();
  const password = secret(formData, "password", 128);
  if (!email || !password) redirect("/login?error=credentials");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=credentials");
  redirect("/");
}

export async function signUpAction(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/signup?error=setup");

  const email = text(formData, "email", 254).toLowerCase();
  const password = secret(formData, "password", 128);
  if (!email || password.length < 10) redirect("/signup?error=signup");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) redirect("/signup?error=signup");
  if (!data.session) redirect("/login?message=confirm");
  redirect("/setup");
}

export async function resetPasswordAction(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/forgot-password?error=setup");

  const email = text(formData, "email", 254).toLowerCase();
  if (!email) redirect("/forgot-password?error=reset");

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin");
  if (!origin) redirect("/forgot-password?error=setup");

  const supabase = await createClient();
  const redirectTo = new URL(
    "/auth/callback?next=/reset-password",
    origin,
  ).toString();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) redirect("/forgot-password?error=reset");
  redirect("/forgot-password?message=sent");
}

export async function updatePasswordAction(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");

  const password = secret(formData, "password", 128);
  if (password.length < 10) redirect("/reset-password?error=password");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=link");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=update");
  redirect("/login?message=password-updated");
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function createBusinessAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login");
  if (workspace.status !== "needs_setup") redirect("/");

  const businessName = text(formData, "business_name", 100);
  const venueName = text(formData, "venue_name", 100);
  const timezone = text(formData, "timezone", 64);
  const includeSampleData = formData.get("sample_data") === "on";

  if (!businessName || !venueName || !timezone) {
    redirect("/setup?error=required");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_business", {
    p_business_name: businessName,
    p_venue_name: venueName,
    p_timezone: timezone,
    p_include_sample_data: includeSampleData,
  });
  if (error) redirect("/setup?error=create");
  redirect("/");
}

export async function saveShiftAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login");
  if (workspace.status !== "ready") redirect("/");

  const week = text(formData, "week", 10);
  const departmentId = text(formData, "department_id", 36);
  const employeeId = text(formData, "employee_id", 36) || null;
  const roleTitle = text(formData, "role_title", 80);
  const start = text(formData, "start", 16);
  const end = text(formData, "end", 16);
  const breakMinutes = Number(text(formData, "break_minutes", 3) || 0);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(week) ||
    !departmentId ||
    !roleTitle ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end) ||
    !Number.isInteger(breakMinutes) ||
    breakMinutes < 0 ||
    breakMinutes > 240
  ) {
    redirect(`/roster?week=${encodeURIComponent(week)}&error=invalid`);
  }

  const { error } = await workspace.supabase.rpc("save_shift", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_department_id: departmentId,
    p_employee_id: employeeId,
    p_role_title: roleTitle,
    p_start_local: start.replace("T", " "),
    p_end_local: end.replace("T", " "),
    p_break_minutes: breakMinutes,
  });

  if (error) {
    const code = error.message.includes("overlap")
      ? "overlap"
      : error.message.includes("permission")
        ? "permission"
        : "save";
    redirect(`/roster?week=${encodeURIComponent(week)}&error=${code}`);
  }
  redirect(`/roster?week=${encodeURIComponent(week)}&saved=1`);
}

export async function deleteShiftAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login");
  if (workspace.status !== "ready") redirect("/");

  const shiftId = text(formData, "shift_id", 36);
  const week = text(formData, "week", 10);
  if (!shiftId || !/^\d{4}-\d{2}-\d{2}$/.test(week)) redirect("/roster");

  const { error } = await workspace.supabase.rpc("delete_shift", {
    p_shift_id: shiftId,
  });
  redirect(
    `/roster?week=${encodeURIComponent(week)}&${error ? "error=delete" : "deleted=1"}`,
  );
}

export async function publishRosterAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login");
  if (workspace.status !== "ready") redirect("/");

  const departmentId = text(formData, "department_id", 36);
  const week = text(formData, "week", 10);
  if (!departmentId || !/^\d{4}-\d{2}-\d{2}$/.test(week)) redirect("/roster");

  const { error } = await workspace.supabase.rpc("publish_roster", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_department_id: departmentId,
    p_week_start: week,
  });
  redirect(
    `/roster?week=${encodeURIComponent(week)}&${error ? "error=publish" : "published=1"}`,
  );
}
