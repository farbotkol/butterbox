"use server";

import { redirect } from "next/navigation";
import { authCallbackUrl } from "@/lib/auth-urls";
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

  const emailRedirectTo = authCallbackUrl(process.env.NEXT_PUBLIC_SITE_URL, "/setup");
  if (!emailRedirectTo) redirect("/signup?error=setup");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });
  if (error) redirect("/signup?error=signup");
  if (!data.session) redirect("/login?message=confirm");
  redirect("/setup");
}

export async function resetPasswordAction(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/forgot-password?error=setup");

  const email = text(formData, "email", 254).toLowerCase();
  if (!email) redirect("/forgot-password?error=reset");

  const redirectTo = authCallbackUrl(
    process.env.NEXT_PUBLIC_SITE_URL,
    "/reset-password",
  );
  if (!redirectTo) redirect("/forgot-password?error=setup");

  const supabase = await createClient();
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

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) redirect("/reset-password?error=signout");
  redirect("/login?message=password-updated");
}

export async function signOutAction() {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) redirect("/login?error=signout");
  redirect("/login?message=signed-out");
}

export async function assignMemberRoleAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  if (workspace.membership.role !== "owner") redirect("/?error=permission");

  const { error } = await workspace.supabase.rpc("assign_business_member_role", {
    p_business_id: workspace.business.id,
    p_user_id: text(formData, "user_id", 36),
    p_role: text(formData, "role", 32),
    p_venue_id: text(formData, "venue_id", 36) || null,
    p_department_id: text(formData, "department_id", 36) || null,
  });
  if (error) {
    console.error("Role assignment failed.", { code: error.code, message: error.message });
    const code = error.message === "A business must retain an owner" ? "last-owner" : "scope";
    redirect(`/settings/permissions?error=${code}`);
  }
  redirect("/settings/permissions?saved=1");
}

export async function saveEmployeeAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  const venueId = text(formData, "venue_id", 36);
  const destination = `/people?venue=${encodeURIComponent(venueId || workspace.venue.id)}`;

  const active = formData.get("active");
  if (active !== "true" && active !== "false") {
    console.error("Invalid employee status submitted.");
    redirect(`${destination}&error=save`);
  }
  const { error } = await workspace.supabase.rpc("save_employee_profile", {
    p_business_id: workspace.business.id,
    p_department_id: text(formData, "department_id", 36),
    p_employee_id: text(formData, "employee_id", 36) || null,
    p_name: text(formData, "name", 100),
    p_email: text(formData, "email", 254),
    p_role_title: text(formData, "role_title", 80),
    p_employment_type: text(formData, "employment_type", 16),
    p_active: active === "true",
  });
  if (error) {
    console.error("Employee profile save failed.", { code: error.code, message: error.message });
    redirect(`${destination}&error=${error.message === "Permission denied" ? "permission" : "save"}`);
  }
  redirect(`${destination}&saved=1`);
}

const organisationErrors: Record<string, string> = {
  "Permission denied": "permission",
  "Department name already exists": "duplicate",
  "Job role name already exists": "duplicate",
  "Department is inactive": "inactive",
};

function activeFlag(formData: FormData) {
  const active = formData.get("active");
  return active === "true" ? true : active === "false" ? false : null;
}

export async function saveDepartmentAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  const venueId = text(formData, "venue_id", 36) || workspace.venue.id;
  const destination = `/settings/organisation?venue=${encodeURIComponent(venueId)}`;
  const active = activeFlag(formData);
  if (active === null) redirect(`${destination}&error=save`);

  const { error } = await workspace.supabase.rpc("save_department", {
    p_business_id: workspace.business.id,
    p_venue_id: venueId,
    p_department_id: text(formData, "department_id", 36) || null,
    p_name: text(formData, "name", 80),
    p_active: active,
  });
  if (error) {
    console.error("Department save failed.", { code: error.code, message: error.message });
    redirect(`${destination}&error=${organisationErrors[error.message] ?? "save"}`);
  }
  redirect(`${destination}&saved=department`);
}

export async function saveJobRoleAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  const venueId = text(formData, "venue_id", 36) || workspace.venue.id;
  const destination = `/settings/organisation?venue=${encodeURIComponent(venueId)}`;
  const active = activeFlag(formData);
  if (active === null) redirect(`${destination}&error=save`);

  const { error } = await workspace.supabase.rpc("save_job_role", {
    p_business_id: workspace.business.id,
    p_department_id: text(formData, "department_id", 36),
    p_job_role_id: text(formData, "job_role_id", 36) || null,
    p_name: text(formData, "name", 80),
    p_active: active,
  });
  if (error) {
    console.error("Job role save failed.", { code: error.code, message: error.message });
    redirect(`${destination}&error=${organisationErrors[error.message] ?? "save"}`);
  }
  redirect(`${destination}&saved=role`);
}

export async function saveBusinessDraftAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "needs_setup") redirect("/");

  const timezone = text(formData, "timezone", 64);
  if (!timezone) redirect("/setup?error=draft");

  const { error } = await workspace.supabase.from("business_setup_drafts").upsert({
    user_id: workspace.user.id,
    business_name: text(formData, "business_name", 100),
    venue_name: text(formData, "venue_name", 100),
    venue_address: text(formData, "venue_address", 200),
    timezone,
    include_sample_data: formData.get("sample_data") === "on",
  });
  if (error) redirect("/setup?error=draft");
  redirect("/setup?saved=1");
}

export async function createBusinessAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "needs_setup") redirect("/");

  const businessName = text(formData, "business_name", 100);
  const venueName = text(formData, "venue_name", 100);
  const venueAddress = text(formData, "venue_address", 200);
  const timezone = text(formData, "timezone", 64);
  const includeSampleData = formData.get("sample_data") === "on";

  if (!businessName || !venueName || !venueAddress || !timezone) {
    redirect("/setup?error=required");
  }

  const { error } = await workspace.supabase.rpc("complete_initial_setup", {
    p_business_name: businessName,
    p_venue_name: venueName,
    p_venue_address: venueAddress,
    p_timezone: timezone,
    p_include_sample_data: includeSampleData,
  });
  if (error) redirect("/setup?error=create");
  redirect("/");
}

export async function saveShiftAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
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
      : error.message.includes("inactive")
        ? "inactive"
        : error.message.includes("permission")
          ? "permission"
          : "save";
    redirect(`/roster?week=${encodeURIComponent(week)}&error=${code}`);
  }
  redirect(`/roster?week=${encodeURIComponent(week)}&saved=1`);
}

export async function deleteShiftAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
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
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
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
