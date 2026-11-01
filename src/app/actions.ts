"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authCallbackUrl } from "@/lib/auth-urls";
import { validExceptionDates } from "@/lib/availability";
import { parseConflictPolicy } from "@/lib/conflict-policy";
import { getWeekStart } from "@/lib/dates";
import { parseEmployeePreferences } from "@/lib/employee-preferences";
import { validateShiftForm, type ShiftFormState } from "@/lib/shift-form";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { parseVenueGeofence } from "@/lib/venue-geofence";
import { getWorkspace } from "@/lib/workspace";

function text(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function secret(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function uuidList(formData: FormData, key: string, maxCount: number) {
  const values = formData.getAll(key);
  if (values.length > maxCount) return null;
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return null;
    }
    result.push(value);
  }
  return result;
}

function collapsedRosterQuery(formData: FormData) {
  const departments = uuidList(formData, "collapsed", 1000);
  if (!departments) {
    console.error("Invalid collapsed roster department state.");
    return "";
  }
  const params = new URLSearchParams();
  for (const department of departments) params.append("collapsed", department);
  const query = params.toString();
  return query ? `&${query}` : "";
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

export async function saveVenueGeofenceAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  if (!venueIds || venueIds.length !== 1) {
    console.error("Invalid venue submitted for geofence configuration.");
    redirect("/settings/organisation?error=geofence");
  }
  const workspace = await getWorkspace(venueIds[0]);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the geofence workspace.", { message: workspace.message });
    redirect("/settings/organisation?error=filter");
  }
  const destination = `/settings/organisation?venue=${encodeURIComponent(workspace.venue.id)}`;
  if (workspace.membership.role !== "owner") redirect(`${destination}&error=permission`);

  const latitude = formData.getAll("latitude");
  const longitude = formData.getAll("longitude");
  const radiusMeters = formData.getAll("radius_meters");
  if (latitude.length !== 1 || typeof latitude[0] !== "string" ||
    longitude.length !== 1 || typeof longitude[0] !== "string" ||
    radiusMeters.length !== 1 || typeof radiusMeters[0] !== "string") {
    console.error("Invalid venue geofence submitted.");
    redirect(`${destination}&error=geofence`);
  }
  const geofence = parseVenueGeofence({
    latitude: latitude[0], longitude: longitude[0], radiusMeters: radiusMeters[0],
  });
  if (!geofence.valid) {
    console.error("Invalid venue geofence submitted.");
    redirect(`${destination}&error=geofence`);
  }
  const { error } = await workspace.supabase.rpc("save_venue_geofence", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_latitude: geofence.latitude,
    p_longitude: geofence.longitude,
    p_radius_meters: geofence.radiusMeters,
  });
  if (error) {
    console.error("Venue geofence save failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission"
      : error.message === "Invalid venue geofence" ? "geofence" : "save";
    redirect(`${destination}&error=${code}`);
  }
  revalidatePath("/settings/organisation");
  redirect(`${destination}&saved=geofence`);
}

export async function saveVenueConflictPolicyAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  if (!venueIds || venueIds.length !== 1) {
    console.error("Invalid venue submitted for conflict policy.");
    redirect("/settings/organisation?error=conflict-policy");
  }
  const workspace = await getWorkspace(venueIds[0]);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the conflict policy workspace.", { message: workspace.message });
    redirect("/settings/organisation?error=filter");
  }
  const destination = `/settings/organisation?venue=${encodeURIComponent(workspace.venue.id)}`;
  if (workspace.membership.role !== "owner") redirect(`${destination}&error=permission`);
  const policy = parseConflictPolicy(formData);
  if (!policy) {
    console.error("Invalid venue conflict policy submitted.");
    redirect(`${destination}&error=conflict-policy`);
  }
  const { error } = await workspace.supabase.rpc("save_venue_conflict_policy", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_block_manual_unavailability: policy.manual_unavailability,
    p_block_publish_unavailability: policy.publish_unavailability,
    p_block_publish_overlap: policy.publish_overlap,
    p_block_publish_long_shift: policy.publish_long_shift,
  });
  if (error) {
    console.error("Venue conflict policy save failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission"
      : error.message === "Invalid conflict policy" ? "conflict-policy" : "save";
    redirect(`${destination}&error=${code}`);
  }
  revalidatePath("/settings/organisation");
  revalidatePath("/roster");
  redirect(`${destination}&saved=conflict-policy`);
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

async function setJobRoleRestriction(formData: FormData, mode: "automatic" | "manual") {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  const venueId = text(formData, "venue_id", 36) || workspace.venue.id;
  const destination = `/settings/organisation?venue=${encodeURIComponent(venueId)}`;
  const restricted = formData.get("restricted");
  if (restricted !== "true" && restricted !== "false") {
    console.error("Invalid role restriction submitted.");
    redirect(`${destination}&error=save`);
  }
  const { error } = await workspace.supabase.rpc(
    mode === "automatic" ? "set_job_role_auto_restriction" : "set_job_role_manual_restriction", {
      p_business_id: workspace.business.id,
      p_job_role_id: text(formData, "job_role_id", 36),
      p_restricted: restricted === "true",
    });
  if (error) {
    console.error("Role restriction save failed.", { code: error.code, message: error.message });
    redirect(`${destination}&error=${error.message === "Permission denied" ? "permission" : "save"}`);
  }
  redirect(`${destination}&saved=${mode === "automatic" ? "restriction" : "manual-restriction"}`);
}

export async function setJobRoleAutoRestrictionAction(formData: FormData) {
  await setJobRoleRestriction(formData, "automatic");
}

export async function setJobRoleManualRestrictionAction(formData: FormData) {
  await setJobRoleRestriction(formData, "manual");
}

export async function setEmployeeDepartmentsAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  const venueId = text(formData, "venue_id", 36) || workspace.venue.id;
  const destination = `/people?venue=${encodeURIComponent(venueId)}`;
  const departmentIds = uuidList(formData, "department_ids", 200);
  if (!departmentIds) {
    console.error("Invalid employee department list submitted.");
    redirect(`${destination}&error=save`);
  }

  const { error } = await workspace.supabase.rpc("set_employee_departments", {
    p_business_id: workspace.business.id,
    p_employee_id: text(formData, "employee_id", 36),
    p_department_ids: departmentIds,
  });
  if (error) {
    console.error("Department membership save failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission"
      : error.message === "Choose another primary role before removing its department" ? "primary-department"
      : error.message === "Department is inactive" ? "inactive" : "save";
    redirect(`${destination}&error=${code}`);
  }
  redirect(`${destination}&saved=departments`);
}

export async function setEmployeeEligibleRolesAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  const venueId = text(formData, "venue_id", 36) || workspace.venue.id;
  const destination = `/people?venue=${encodeURIComponent(venueId)}`;
  const roleIds = uuidList(formData, "job_role_ids", 200);
  if (!roleIds) {
    console.error("Invalid employee role list submitted.");
    redirect(`${destination}&error=roles`);
  }
  const { error } = await workspace.supabase.rpc("set_employee_eligible_roles", {
    p_business_id: workspace.business.id,
    p_employee_id: text(formData, "employee_id", 36),
    p_department_id: text(formData, "department_id", 36),
    p_job_role_ids: roleIds,
  });
  if (error) {
    console.error("Eligible roles save failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission"
      : error.message === "Choose another primary role before removing it" ? "primary" : "roles";
    redirect(`${destination}&error=${code}`);
  }
  redirect(`${destination}&saved=roles`);
}

export async function setEmployeePrimaryRoleAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  const venueId = text(formData, "venue_id", 36) || workspace.venue.id;
  const destination = `/people?venue=${encodeURIComponent(venueId)}`;
  const { error } = await workspace.supabase.rpc("set_employee_primary_role", {
    p_business_id: workspace.business.id,
    p_employee_id: text(formData, "employee_id", 36),
    p_job_role_id: text(formData, "job_role_id", 36),
  });
  if (error) {
    console.error("Primary role save failed.", { code: error.code, message: error.message });
    redirect(`${destination}&error=${error.message === "Permission denied" ? "permission" : "roles"}`);
  }
  redirect(`${destination}&saved=primary`);
}

export async function setEmployeeAuthUserAction(formData: FormData) {
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  const venueId = text(formData, "venue_id", 36) || workspace.venue.id;
  const destination = `/people?venue=${encodeURIComponent(venueId)}`;
  const employeeIds = uuidList(formData, "employee_id", 1);
  const userValues = formData.getAll("user_id");
  const userId = userValues[0];
  const userIds = userValues.length === 1 && userId === ""
    ? [] : uuidList(formData, "user_id", 1);
  if (!employeeIds || employeeIds.length !== 1 || !userIds ||
    (userId !== "" && userIds.length !== 1)) {
    console.error("Invalid employee account link submitted.");
    redirect(`${destination}&error=account`);
  }

  const { error } = await workspace.supabase.rpc("set_employee_auth_user", {
    p_business_id: workspace.business.id,
    p_employee_id: employeeIds[0],
    p_user_id: userIds[0] ?? null,
  });
  if (error) {
    console.error("Employee account link failed.", { code: error.code, message: error.message });
    redirect(`${destination}&error=${error.message === "Permission denied" ? "permission" : "account"}`);
  }
  redirect(`${destination}&saved=account`);
}

async function sharedWorkerActionContext(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  if (!venueIds || venueIds.length !== 1) {
    console.error("Invalid shared-worker venue submitted.");
    redirect("/people?error=shared");
  }
  const workspace = await getWorkspace(venueIds[0]);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the shared-worker workspace.", { message: workspace.message });
    redirect("/people?error=filter");
  }
  const destination = `/people?venue=${encodeURIComponent(workspace.venue.id)}`;
  if (workspace.membership.role !== "owner") redirect(`${destination}&error=permission`);
  const employeeIds = uuidList(formData, "employee_id", 1);
  const confirmation = formData.getAll("confirmed");
  if (!employeeIds || employeeIds.length !== 1 ||
    confirmation.length !== 1 || confirmation[0] !== "yes") {
    console.error("Invalid or unconfirmed shared-worker change.");
    redirect(`${destination}&error=shared-confirm`);
  }
  return { workspace, destination, employeeId: employeeIds[0] };
}

export async function linkSharedWorkerAction(formData: FormData) {
  const { workspace, destination, employeeId } = await sharedWorkerActionContext(formData);
  const otherIds = uuidList(formData, "other_employee_id", 1);
  if (!otherIds || otherIds.length !== 1) {
    console.error("Invalid shared-worker profile submitted.");
    redirect(`${destination}&error=shared`);
  }
  const { error } = await workspace.supabase.rpc("link_shared_worker_profiles", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_employee_id: employeeId,
    p_other_employee_id: otherIds[0],
  });
  if (error) {
    console.error("Shared-worker link failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission"
      : error.message === "A profile from this venue is already linked" ? "shared-venue"
        : error.message === "Profiles belong to different shared workers" ? "shared-groups" : "shared";
    redirect(`${destination}&error=${code}`);
  }
  revalidatePath("/roster");
  redirect(`${destination}&saved=shared-link`);
}

export async function unlinkSharedWorkerAction(formData: FormData) {
  const { workspace, destination, employeeId } = await sharedWorkerActionContext(formData);
  const { error } = await workspace.supabase.rpc("unlink_shared_worker_profile", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_employee_id: employeeId,
  });
  if (error) {
    console.error("Shared-worker unlink failed.", { code: error.code, message: error.message });
    redirect(`${destination}&error=${error.message === "Permission denied" ? "permission" : "shared"}`);
  }
  revalidatePath("/roster");
  redirect(`${destination}&saved=shared-unlink`);
}

async function availabilityActionContext(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  if (!venueIds || venueIds.length !== 1) {
    console.error("Invalid availability venue submitted.");
    redirect("/availability?error=invalid");
  }
  const workspace = await getWorkspace(venueIds[0]);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the availability workspace.", { message: workspace.message });
    redirect("/availability?error=venue");
  }
  return {
    workspace,
    destination: `/availability?venue=${encodeURIComponent(workspace.venue.id)}`,
  };
}

export async function saveEmployeePreferencesAction(formData: FormData) {
  const { workspace, destination } = await availabilityActionContext(formData);
  const employeeIds = uuidList(formData, "employee_id", 1);
  const preferredWeeklyHours = formData.get("preferred_weekly_hours");
  const notifyScheduleEmail = formData.get("notify_schedule_email");
  const notifyLeaveEmail = formData.get("notify_leave_email");
  if (!employeeIds || employeeIds.length !== 1 ||
    typeof preferredWeeklyHours !== "string" ||
    typeof notifyScheduleEmail !== "string" || typeof notifyLeaveEmail !== "string") {
    console.error("Invalid employee preferences submitted.");
    redirect(`${destination}&error=preferences-invalid`);
  }
  const preferences = parseEmployeePreferences({
    preferredWeeklyHours, notifyScheduleEmail, notifyLeaveEmail,
  });
  if (!preferences.valid) {
    console.error("Invalid employee preferences submitted.");
    redirect(`${destination}&error=preferences-invalid`);
  }

  const { error } = await workspace.supabase.rpc("save_employee_preferences", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_employee_id: employeeIds[0],
    p_preferred_weekly_hours: preferences.preferredWeeklyHours,
    p_notify_schedule_email: preferences.notifyScheduleEmail,
    p_notify_leave_email: preferences.notifyLeaveEmail,
  });
  if (error) {
    console.error("Employee preferences save failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission"
      : error.message === "Invalid employee preferences" ? "preferences-invalid" : "save";
    redirect(`${destination}&error=${code}`);
  }
  revalidatePath("/people");
  redirect(`${destination}&saved=preferences`);
}

export async function saveRecurringAvailabilityAction(formData: FormData) {
  const { workspace, destination } = await availabilityActionContext(formData);

  const employeeIds = uuidList(formData, "employee_id", 1);
  const weekdays = formData.getAll("weekday");
  const starts = formData.getAll("start");
  const ends = formData.getAll("end");
  if (!employeeIds || employeeIds.length !== 1 || weekdays.length > 56 ||
    weekdays.length !== starts.length || weekdays.length !== ends.length ||
    (weekdays.length === 0 && formData.get("confirm_empty") !== "yes")) {
    console.error("Invalid availability form submitted.");
    redirect(`${destination}&error=invalid`);
  }

  const intervals: { weekday: number; start: string; end: string }[] = [];
  for (let index = 0; index < weekdays.length; index += 1) {
    const weekday = weekdays[index];
    const start = starts[index];
    const end = ends[index];
    if (typeof weekday !== "string" || !/^[1-7]$/.test(weekday) ||
      typeof start !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
      typeof end !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) {
      console.error("Invalid availability interval submitted.");
      redirect(`${destination}&error=invalid`);
    }
    intervals.push({ weekday: Number(weekday), start, end });
  }

  const { error } = await workspace.supabase.rpc("set_employee_recurring_availability", {
    p_business_id: workspace.business.id,
    p_employee_id: employeeIds[0],
    p_intervals: intervals,
  });
  if (error) {
    console.error("Recurring availability save failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission" : "save";
    redirect(`${destination}&error=${code}`);
  }
  revalidatePath("/roster");
  redirect(`${destination}&saved=recurring`);
}

export async function requestAvailabilityExceptionAction(formData: FormData) {
  const { workspace, destination } = await availabilityActionContext(formData);
  const employeeIds = uuidList(formData, "employee_id", 1);
  const startsOn = formData.get("starts_on");
  const endsOn = formData.get("ends_on");
  const exceptionType = formData.get("exception_type");
  if (!employeeIds || employeeIds.length !== 1 ||
    typeof startsOn !== "string" || typeof endsOn !== "string" ||
    !validExceptionDates(startsOn, endsOn) ||
    (exceptionType !== "unavailable" && exceptionType !== "leave")) {
    console.error("Invalid availability exception submitted.");
    redirect(`${destination}&error=exception-invalid`);
  }
  const { data, error } = await workspace.supabase.rpc("request_availability_exception", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_employee_id: employeeIds[0],
    p_starts_on: startsOn,
    p_ends_on: endsOn,
    p_exception_type: exceptionType,
  });
  if (error) {
    console.error("Availability exception save failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission"
      : error.message === "Invalid availability exception" ? "exception-invalid" : "save";
    redirect(`${destination}&error=${code}`);
  }
  if (typeof data !== "string") {
    console.error("Availability exception saved without a returned identifier.");
    redirect(`${destination}&error=refresh`);
  }
  revalidatePath("/roster");
  redirect(`${destination}&saved=${exceptionType === "leave" ? "requested" : "blocked"}`);
}

export async function cancelAvailabilityExceptionAction(formData: FormData) {
  const { workspace, destination } = await availabilityActionContext(formData);
  const ids = uuidList(formData, "exception_id", 1);
  if (!ids || ids.length !== 1) {
    console.error("Invalid availability exception identifier submitted.");
    redirect(`${destination}&error=exception-invalid`);
  }
  const { error } = await workspace.supabase.rpc("cancel_availability_exception", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_exception_id: ids[0],
  });
  if (error) {
    console.error("Availability exception cancellation failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission"
      : error.message === "Availability exception can no longer be cancelled" ? "resolved" : "save";
    redirect(`${destination}&error=${code}`);
  }
  revalidatePath("/roster");
  redirect(`${destination}&saved=cancelled`);
}

export async function reviewLeaveRequestAction(formData: FormData) {
  const { workspace, destination } = await availabilityActionContext(formData);
  const ids = uuidList(formData, "exception_id", 1);
  const status = formData.get("status");
  if (!ids || ids.length !== 1 ||
    (status !== "approved" && status !== "rejected" && status !== "cancelled")) {
    console.error("Invalid leave decision submitted.");
    redirect(`${destination}&error=exception-invalid`);
  }
  const { error } = await workspace.supabase.rpc("review_leave_request", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_exception_id: ids[0],
    p_status: status,
  });
  if (error) {
    console.error("Leave review failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission"
      : error.message === "Leave request can no longer be changed" ? "resolved" : "save";
    redirect(`${destination}&error=${code}`);
  }
  revalidatePath("/roster");
  redirect(`${destination}&saved=${status}`);
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

export async function saveShiftAction(_previous: ShiftFormState, formData: FormData): Promise<ShiftFormState> {
  const week = text(formData, "week", 10);
  const venueIds = uuidList(formData, "venue_id", 1);
  const departmentIds = uuidList(formData, "department_id", 1);
  const shiftIds = uuidList(formData, "shift_id", 1);
  const editing = Boolean(shiftIds?.length);
  const values = {
    role: text(formData, "role_title", 1000),
    employee: text(formData, "employee_id", 100),
    start: text(formData, "start", 64),
    end: text(formData, "end", 64),
    break: text(formData, "break_minutes", 100),
  };
  const state = { ...validateShiftForm(values, editing), values };
  const workspace = await getWorkspace(venueIds?.[0]);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the roster workspace.", { message: workspace.message });
    return { ...state, errors: { ...state.errors, form: "The selected venue is unavailable. Reload the roster and try again." } };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) ||
    !venueIds || venueIds.length !== 1 || !departmentIds || departmentIds.length !== 1 || !shiftIds) {
    return { ...state, errors: { ...state.errors, form: "The roster context is invalid. Reload the page and try again." } };
  }
  if (Object.keys(state.errors).length > 0) return state;
  const departmentId = departmentIds[0];

  const shiftDetails = {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_department_id: departmentId,
    p_role_title: values.role.trim(),
    p_start_local: values.start.replace("T", " "),
    p_end_local: values.end.replace("T", " "),
    p_break_minutes: Number(values.break || 0),
  };
  const result = editing
    ? await workspace.supabase.rpc("update_draft_shift", {
        ...shiftDetails,
        p_shift_id: shiftIds[0],
        p_employee_id: values.employee || null,
      })
    : values.employee === "auto"
      ? await workspace.supabase.rpc("save_shift_auto_assign", shiftDetails)
      : await workspace.supabase.rpc("save_shift", { ...shiftDetails, p_employee_id: values.employee || null });

  if (result.error) {
    console.error("Shift save failed.", { code: result.error.code, message: result.error.message });
    const message = result.error.message.toLowerCase();
    if (message.includes("no eligible employee")) {
      state.errors.employee = "No eligible worker is available. Check availability, leave, qualifications and overlapping shifts.";
    } else if (message.includes("overlap")) {
      state.errors.employee = "That employee already has a shift during this time.";
    } else if (message.includes("employee is not eligible")) {
      state.errors.employee = "Choose an active team member linked to this department, or an open shift.";
    } else if (message.includes("employee is not qualified")) {
      state.errors.employee = "Choose a worker qualified for this role, or leave the shift open.";
    } else if (message.includes("employee is unavailable")) {
      state.errors.employee = "That worker is unavailable. Choose another team member or leave the shift open.";
    } else if (message.includes("start time does not exist")) {
      state.errors.start = "This local time does not exist because the clocks change. Choose another start time.";
    } else if (message.includes("end time does not exist")) {
      state.errors.end = "This local time does not exist because the clocks change. Choose another end time.";
    } else if (message.includes("end date cannot be before")) {
      state.errors.end = "The end date cannot be before the start date.";
    } else if (message.includes("duration")) {
      state.errors.end = "A shift must end after it starts and last no longer than 24 hours.";
    } else if (message.includes("published")) {
      state.errors.form = "Published shifts cannot be edited.";
    } else if (message.includes("roster changed while scheduling")) {
      state.errors.form = "The roster changed while you were scheduling. Please try again.";
    } else if (message.includes("inactive")) {
      state.errors.form = "That department or job role is inactive. Choose an active one for changes.";
    } else if (message.includes("permission") || message.includes("shift not found")) {
      state.errors.form = "You cannot edit this department's shift, or it is no longer available.";
    } else {
      state.errors.form = "We couldn't save that shift. Check the date, team member and role.";
    }
    return state;
  }
  if (!editing && typeof result.data !== "string") {
    console.error("Shift was saved but the server did not return its identifier.");
    state.errors.form = "Your shift was saved, but the roster could not refresh. Reload before trying again.";
    return state;
  }
  const savedWeek = getWeekStart(values.start.slice(0, 10), workspace.venue.timezone);
  const created = !editing && typeof result.data === "string"
    ? `&created=${encodeURIComponent(result.data)}` : "";
  redirect(`/roster?week=${encodeURIComponent(savedWeek)}&venue=${encodeURIComponent(workspace.venue.id)}&department=${encodeURIComponent(departmentId)}${collapsedRosterQuery(formData)}&saved=${editing ? "edited" : "1"}${created}`);
}

export async function deleteShiftAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const workspace = await getWorkspace(venueIds?.[0]);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the roster workspace for deletion.", { message: workspace.message });
    redirect("/roster?error=delete");
  }
  if (!venueIds || venueIds.length !== 1) redirect("/roster?error=delete");

  const shiftId = text(formData, "shift_id", 36);
  const week = text(formData, "week", 10);
  const filterDepartment = text(formData, "filter_department", 36);
  if (!shiftId || !/^\d{4}-\d{2}-\d{2}$/.test(week)) redirect("/roster");

  const { error } = await workspace.supabase.rpc("delete_shift", {
    p_shift_id: shiftId,
  });
  redirect(
    `/roster?week=${encodeURIComponent(week)}&venue=${encodeURIComponent(workspace.venue.id)}${filterDepartment ? `&department=${encodeURIComponent(filterDepartment)}` : ""}${collapsedRosterQuery(formData)}&${error ? "error=delete" : "deleted=1"}`,
  );
}

export async function setShiftAcknowledgementRequirementAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const departmentIds = uuidList(formData, "department_id", 1);
  const shiftIds = uuidList(formData, "shift_id", 1);
  const week = text(formData, "week", 10);
  const required = text(formData, "required", 5);
  const filterDepartment = text(formData, "filter_department", 36);
  if (!venueIds || venueIds.length !== 1 || !departmentIds || departmentIds.length !== 1 ||
    !shiftIds || shiftIds.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(week) ||
    !["true", "false"].includes(required)) {
    console.error("Invalid shift acknowledgement requirement request.");
    redirect("/roster?error=acknowledgement");
  }
  const workspace = await getWorkspace(venueIds[0]);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the roster workspace for acknowledgement requirements.", { message: workspace.message });
    redirect("/roster?error=acknowledgement");
  }
  const destination = `/roster?week=${encodeURIComponent(week)}&venue=${encodeURIComponent(workspace.venue.id)}${filterDepartment ? `&department=${encodeURIComponent(filterDepartment)}` : ""}${collapsedRosterQuery(formData)}`;
  if (getWeekStart(week, workspace.venue.timezone) !== week) {
    console.error("Invalid roster week for an acknowledgement requirement.");
    redirect(`${destination}&error=acknowledgement`);
  }
  const { error } = await workspace.supabase.rpc("set_shift_acknowledgement_requirement", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_department_id: departmentIds[0],
    p_shift_id: shiftIds[0],
    p_required: required === "true",
  });
  if (error) {
    console.error("Could not update the shift acknowledgement requirement.", { code: error.code, message: error.message });
    redirect(`${destination}&error=acknowledgement`);
  }
  revalidatePath("/roster");
  redirect(`${destination}&ack_requirement=updated`);
}

export async function publishRosterAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const workspace = await getWorkspace(venueIds?.[0]);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the roster workspace for publication.", { message: workspace.message });
    redirect("/roster?error=publish");
  }
  if (!venueIds || venueIds.length !== 1) redirect("/roster?error=publish");

  const departmentId = text(formData, "department_id", 36);
  const week = text(formData, "week", 10);
  if (!departmentId || !/^\d{4}-\d{2}-\d{2}$/.test(week)) redirect("/roster");

  const { data, error } = await workspace.supabase.rpc("publish_roster", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_department_id: departmentId,
    p_week_start: week,
  });
  const destination = `/roster?week=${encodeURIComponent(week)}&venue=${encodeURIComponent(workspace.venue.id)}&department=${encodeURIComponent(departmentId)}${collapsedRosterQuery(formData)}`;
  if (error) {
    console.error("Roster publication failed.", { code: error.code, message: error.message });
    const code = error.message === "Roster has unavailable employees" ? "publish-unavailable"
      : error.message === "Roster has overlapping shifts" ? "publish-overlap"
        : error.message === "Roster has shifts longer than 24 hours" ? "publish-duration"
          : error.message === "Roster changed while publishing; please try again" ? "publish-busy"
            : error.message === "Assign or remove the acknowledgement requirement before publication" ? "publish-acknowledgement"
            : "publish";
    redirect(`${destination}&error=${code}`);
  }
  if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
    console.error("Roster publication returned an invalid result.");
    redirect(`${destination}&error=publish-unknown`);
  }
  redirect(`${destination}&published=${data === 0 ? "none" : "1"}`);
}

export async function acknowledgeShiftAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const shiftIds = uuidList(formData, "shift_id", 1);
  const week = text(formData, "week", 10);
  if (!venueIds || venueIds.length !== 1 || !shiftIds || shiftIds.length !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    console.error("Invalid shift acknowledgement request.");
    redirect("/my-schedule?error=acknowledgement");
  }
  const workspace = await getWorkspace(venueIds[0]);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the schedule workspace for acknowledgement.", { message: workspace.message });
    redirect("/my-schedule?error=acknowledgement");
  }
  const destination = `/my-schedule?${new URLSearchParams({ week, venue: workspace.venue.id })}`;
  if (getWeekStart(week, workspace.venue.timezone) !== week) {
    console.error("Invalid schedule week for acknowledgement.");
    redirect(`${destination}&error=acknowledgement`);
  }
  const { data, error } = await workspace.supabase.rpc("acknowledge_shift", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_shift_id: shiftIds[0],
  });
  if (error || typeof data !== "string" || Number.isNaN(Date.parse(data))) {
    console.error("Could not confirm shift acknowledgement.", {
      code: error?.code,
      message: error?.message ?? "The server returned an invalid acknowledgement time.",
    });
    redirect(`${destination}&error=${error ? "acknowledgement" : "ack-unknown"}`);
  }
  revalidatePath("/my-schedule");
  revalidatePath("/roster");
  redirect(`${destination}&acknowledged=1`);
}

export async function markRosterNotificationReadAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const publicationIds = uuidList(formData, "publication_id", 1);
  const operation = text(formData, "operation", 10);
  if (!venueIds || venueIds.length !== 1 || !publicationIds || publicationIds.length !== 1 ||
    !["read", "open"].includes(operation)) {
    console.error("Invalid notification read request.");
    redirect("/notifications?error=read");
  }
  const workspace = await getWorkspace(venueIds[0]);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the notifications workspace for reading.", { message: workspace.message });
    redirect("/notifications?error=read");
  }
  const destination = `/notifications?${new URLSearchParams({ venue: workspace.venue.id })}`;
  const { data, error } = await workspace.supabase.rpc("mark_roster_notification_read", {
    p_publication_id: publicationIds[0],
  });
  const result = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (error || !result || result.venue_id !== workspace.venue.id ||
    typeof result.week_start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(result.week_start)) {
    console.error("Could not mark roster notification read.", {
      code: error?.code,
      message: error?.message ?? "The server returned an invalid notification target.",
    });
    redirect(`${destination}&error=read`);
  }
  revalidatePath("/notifications");
  revalidatePath("/my-schedule");
  revalidatePath("/");
  if (operation === "open") {
    redirect(`/my-schedule?${new URLSearchParams({ week: result.week_start, venue: result.venue_id })}`);
  }
  redirect(`${destination}&saved=read`);
}
