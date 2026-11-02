"use server";

import { createClient as createAuthClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseBreakClassification, parseClockOptionValue, parseClockReceipt } from "@/lib/attendance";
import {
  correctionInstant, correctionLocalWithMicroseconds, isCorrectionTimestamp,
} from "@/lib/attendance-corrections";
import { parseLocationCapture, parseLocationClockReceipt } from "@/lib/attendance-location";
import { authCallbackUrl, invitationEmailUrl } from "@/lib/auth-urls";
import { validExceptionDates } from "@/lib/availability";
import { parseConflictPolicy } from "@/lib/conflict-policy";
import { getWeekStart } from "@/lib/dates";
import { parseEmployeePreferences } from "@/lib/employee-preferences";
import { isPayrollUuid } from "@/lib/generic-payroll-exports";
import {
  isPayrollProvider, payrollMappingFailure, payrollMappingRevision, payrollMappingText,
} from "@/lib/payroll-mapping";
import { isInvitationId, parsePendingStaffInvitation } from "@/lib/invitations";
import {
  attendanceClaimTimezoneChangedMessage, parseOfflineClaimReceipt, parseOfflineMatchOption,
} from "@/lib/offline-attendance";
import { isRosterWeek, rosterCopyError, type RosterCopyState } from "@/lib/roster-copy";
import { validateShiftForm, type ShiftFormState } from "@/lib/shift-form";
import { parseTimesheetDecisionInput } from "@/lib/timesheet-approvals";
import { parsePayrollPeriodInput, payrollFailureReason, payrollFinalisedMessage } from "@/lib/payroll-periods";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { parseVenueGeofence } from "@/lib/venue-geofence";
import {
  parseBulkLockReceipt, parseBulkLockSelections, parseTimesheetEmployeeFilter, timesheetWeek,
} from "@/lib/weekly-timesheet";
import { BUSINESS_PREFERENCE_COOKIE, parseBusinessId, withBusiness } from "@/lib/business-selection";
import { getWorkspace, listBusinessMemberships } from "@/lib/workspace";

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

function businessContext(formData: FormData) {
  const values = formData.getAll("business_id");
  return { businessId: values.length > 1 ? "invalid" : values[0] };
}

function contextVenue(formData: FormData) {
  const values = formData.getAll("venue_id");
  if (values.length === 0 || (values.length === 1 && values[0] === "")) return undefined;
  return values.length === 1 && typeof values[0] === "string" ? values[0] : "invalid";
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
  (await cookies()).delete(BUSINESS_PREFERENCE_COOKIE);
  if (error) redirect("/login?error=signout");
  redirect("/login?message=signed-out");
}

export async function switchBusinessAction(formData: FormData) {
  const values = formData.getAll("business_id");
  const businessId = values.length === 1 ? parseBusinessId(values[0]) : null;
  if (!businessId) {
    console.error("Invalid business selection submitted.");
    redirect("/choose-business?error=business");
  }
  const result = await listBusinessMemberships();
  if (result.status === "anonymous") redirect("/login?message=session-ended");
  if (result.status !== "ready") redirect("/choose-business?error=load");
  // The preference is only a page default; every later request re-validates membership.
  if (!result.businesses.some((business) => business.id === businessId)) {
    console.error("Business selection is not an active membership.");
    redirect("/choose-business?error=business");
  }
  (await cookies()).set(BUSINESS_PREFERENCE_COOKIE, businessId, {
    httpOnly: true, sameSite: "lax", secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
    path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  redirect(withBusiness("/", businessId));
}

async function sendInvitationEmail(email: string, invitationId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const emailRedirectTo = invitationEmailUrl(process.env.NEXT_PUBLIC_SITE_URL, invitationId);
  if (!url || !anonKey || !emailRedirectTo) {
    console.error("Invitation email configuration is incomplete or invalid.");
    return false;
  }
  const auth = createAuthClient(url, anonKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await auth.auth.signInWithOtp({
    email, options: { emailRedirectTo, shouldCreateUser: true },
  });
  if (error) {
    console.error("Could not request an invitation email.", { code: error.code, status: error.status });
    return false;
  }
  return true;
}

export async function createStaffInvitationAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const departmentIds = uuidList(formData, "department_id", 1);
  const employeeIds = uuidList(formData, "employee_id", 1);
  if (venueIds?.length !== 1 || departmentIds?.length !== 1 || employeeIds?.length !== 1) {
    console.error("Invalid invitation scope.");
    redirect("/people?error=invite");
  }
  const destination = `/people?venue=${encodeURIComponent(venueIds[0])}`;
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email || email.length > 254) redirect(`${destination}&error=invite-email`);

  const { data, error } = await workspace.supabase.rpc("create_staff_invitation", {
    p_business_id: workspace.business.id, p_venue_id: venueIds[0],
    p_department_id: departmentIds[0], p_employee_id: employeeIds[0], p_email: email,
  });
  if (error || typeof data !== "string" || !isInvitationId(data)) {
    console.error("Could not create an invitation.", { code: error?.code, message: error?.message });
    const reason = error?.message === "An active invitation already exists" ? "invite-duplicate"
      : error?.message === "Invalid invitation email" ? "invite-email" : "invite";
    redirect(`${destination}&error=${reason}`);
  }
  const sent = await sendInvitationEmail(email, data);
  revalidatePath("/people");
  redirect(`${destination}&${sent ? "saved=invite-sent" : "error=invite-send"}`);
}

async function findManageableInvitation(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const invitationIds = uuidList(formData, "invitation_id", 1);
  if (venueIds?.length !== 1 || invitationIds?.length !== 1) {
    console.error("Invalid invitation selection.");
    redirect("/people?error=invite");
  }
  const destination = `/people?venue=${encodeURIComponent(venueIds[0])}`;
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  const { data, error } = await workspace.supabase.rpc("list_pending_staff_invitations", {
    p_business_id: workspace.business.id, p_venue_id: venueIds[0],
  }).eq("id", invitationIds[0]).maybeSingle();
  const invitation = parsePendingStaffInvitation(data);
  if (error || !invitation) {
    console.error("Could not load the selected invitation.", { code: error?.code, message: error?.message });
    redirect(`${destination}&error=invite`);
  }
  return { workspace, invitation, destination };
}

export async function resendStaffInvitationAction(formData: FormData) {
  const { invitation, destination } = await findManageableInvitation(formData);
  if (invitation.status !== "pending") {
    redirect(`${destination}&error=invite-expired`);
  }
  const sent = await sendInvitationEmail(invitation.email, invitation.id);
  redirect(`${destination}&${sent ? "saved=invite-sent" : "error=invite-send"}`);
}

export async function revokeStaffInvitationAction(formData: FormData) {
  const { workspace, invitation, destination } = await findManageableInvitation(formData);
  const { error } = await workspace.supabase.rpc("revoke_staff_invitation", { p_invitation_id: invitation.id });
  if (error) {
    console.error("Could not revoke an invitation.", { code: error.code, message: error.message });
    redirect(`${destination}&error=invite`);
  }
  revalidatePath("/people");
  redirect(`${destination}&saved=invite-revoked`);
}

export async function acceptStaffInvitationAction(formData: FormData) {
  const rawId = formData.get("invitation_id");
  const invitationId = typeof rawId === "string" ? rawId.trim() : "";
  if (!isInvitationId(invitationId)) {
    console.error("Invalid invitation identifier.");
    redirect("/");
  }
  const destination = `/invitations/${invitationId}`;
  if (!isSupabaseConfigured()) redirect(`${destination}?error=setup`);
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect(`${destination}?error=authentication`);
  const { data, error } = await supabase.rpc("accept_staff_invitation", { p_invitation_id: invitationId });
  if (error) {
    console.error("Could not accept an invitation.", { code: error.code, message: error.message });
    const reason = error.message === "Your existing membership cannot access this department" ? "scope"
      : "unavailable";
    redirect(`${destination}?error=${reason}`);
  }
  revalidatePath("/");
  const businessId = parseBusinessId(typeof data === "string" ? data : undefined);
  redirect(businessId ? `${destination}?accepted=1&business=${businessId}` : `${destination}?accepted=1`);
}

export async function assignMemberRoleAction(formData: FormData) {
  const workspace = await getWorkspace(undefined, businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") redirect("/");
  if (workspace.membership.role !== "owner") redirect(withBusiness("/?error=permission", workspace.business.id));

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
    redirect(withBusiness(`/settings/permissions?error=${code}`, workspace.business.id));
  }
  redirect(withBusiness("/settings/permissions?saved=1", workspace.business.id));
}

export async function saveEmployeeAction(formData: FormData) {
  const workspace = await getWorkspace(contextVenue(formData), businessContext(formData));
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
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
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
      : error.message === "Invalid venue geofence" ? "geofence"
        : error.message === "Configure a venue geofence before enabling location verification" ? "location-required" : "save";
    redirect(`${destination}&error=${code}`);
  }
  revalidatePath("/settings/organisation");
  redirect(`${destination}&saved=geofence`);
}

export async function setVenueClockGeofenceAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const enabled = formData.getAll("enabled");
  if (!venueIds || venueIds.length !== 1 || enabled.length !== 1 ||
    (enabled[0] !== "true" && enabled[0] !== "false")) {
    console.error("Invalid clock location policy submitted.");
    redirect("/settings/organisation?error=location-policy");
  }
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the clock location workspace.", { message: workspace.message });
    redirect("/settings/organisation?error=filter");
  }
  const destination = `/settings/organisation?venue=${encodeURIComponent(workspace.venue.id)}`;
  if (workspace.membership.role !== "owner") redirect(`${destination}&error=permission`);
  const { error } = await workspace.supabase.rpc("set_venue_clock_geofence", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    p_enabled: enabled[0] === "true",
  });
  if (error) {
    console.error("Clock location policy save failed.", { code: error.code, message: error.message });
    const code = error.message === "Permission denied" ? "permission"
      : error.message === "Configure a venue geofence before enabling location verification" ? "location-required"
        : error.message === "Invalid clock location policy" ? "location-policy" : "save";
    redirect(`${destination}&error=${code}`);
  }
  revalidatePath("/settings/organisation");
  revalidatePath("/attendance");
  redirect(`${destination}&saved=location-policy`);
}

export async function saveVenueConflictPolicyAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  if (!venueIds || venueIds.length !== 1) {
    console.error("Invalid venue submitted for conflict policy.");
    redirect("/settings/organisation?error=conflict-policy");
  }
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
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
  const workspace = await getWorkspace(contextVenue(formData), businessContext(formData));
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
  const workspace = await getWorkspace(contextVenue(formData), businessContext(formData));
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
  const workspace = await getWorkspace(contextVenue(formData), businessContext(formData));
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
  const workspace = await getWorkspace(contextVenue(formData), businessContext(formData));
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
  const workspace = await getWorkspace(contextVenue(formData), businessContext(formData));
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
  const workspace = await getWorkspace(contextVenue(formData), businessContext(formData));
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
  const workspace = await getWorkspace(contextVenue(formData), businessContext(formData));
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
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
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
        : error.message === "Profiles belong to different shared workers" ? "shared-groups"
          : error.message === "Cannot link profiles while more than one has an open clock session" ? "shared-clock" : "shared";
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

async function attendanceActionContext(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const requestIds = uuidList(formData, "request_id", 1);
  if (!venueIds || venueIds.length !== 1 || !requestIds || requestIds.length !== 1) {
    console.error("Invalid attendance request.");
    redirect("/attendance?error=invalid");
  }
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the attendance workspace.", { message: workspace.message });
    redirect("/attendance?error=venue");
  }
  return {
    workspace,
    requestId: requestIds[0],
    destination: `/attendance?venue=${encodeURIComponent(workspace.venue.id)}`,
  };
}

async function attendanceSessionActionContext(formData: FormData) {
  const context = await attendanceActionContext(formData);
  const sessions = uuidList(formData, "session_id", 1);
  if (!sessions || sessions.length !== 1) {
    console.error("Invalid attendance session.");
    redirect(`${context.destination}&error=invalid`);
  }
  return { ...context, sessionId: sessions[0] };
}

function attendanceFailureReason(message: string | undefined) {
  if (message?.toLowerCase().includes("permission denied")) return "permission";
  switch (message) {
    case "Already clocked in": return "already-in";
    case "Already clocked out":
    case "Attendance session is not open": return "already-out";
    case "Employee or department is unavailable": return "unavailable";
    case "Request identifier already used": return "reused";
    case "Already on a break": return "already-break";
    case "Break already ended": return "break-ended";
    case "End the open break before clocking out": return "break-open";
    case "Invalid break request":
    case "Invalid clock request": return "invalid";
    case payrollFinalisedMessage: return "period-finalised";
    default: return "save";
  }
}

export async function clockInAction(formData: FormData) {
  const { workspace, requestId, destination } = await attendanceActionContext(formData);
  const values = formData.getAll("clock_option");
  const selection = values.length === 1 ? parseClockOptionValue(values[0]) : null;
  if (!selection) {
    console.error("Invalid attendance employee or department.");
    redirect(`${destination}&error=invalid`);
  }
  const location = parseLocationCapture(formData);
  if (location.status === "invalid") console.warn("Invalid clock location data will be flagged for review.");
  const { data, error } = await workspace.supabase.rpc("clock_in_attendance_with_location", {
    p_business_id: workspace.business.id,
    p_venue_id: workspace.venue.id,
    p_department_id: selection.departmentId,
    p_employee_id: selection.employeeId,
    p_request_id: requestId,
    p_location_status: location.status,
    p_latitude: location.latitude,
    p_longitude: location.longitude,
    p_accuracy_meters: location.accuracyMeters,
  });
  const receipt = parseLocationClockReceipt(data);
  if (error || !receipt) {
    console.error("Clock-in failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid clock receipt.",
    });
    redirect(`${destination}&error=${attendanceFailureReason(error?.message)}`);
  }
  revalidatePath("/attendance");
  const saved = receipt.locationStatus === "review" ? "location-review"
    : receipt.locationStatus === "historical_unverified" ? "location-historical" : "recorded";
  redirect(`${destination}&saved=${saved}`);
}

export async function clockOutAction(formData: FormData) {
  const { workspace, requestId, destination, sessionId } = await attendanceSessionActionContext(formData);
  const location = parseLocationCapture(formData);
  if (location.status === "invalid") console.warn("Invalid clock location data will be flagged for review.");
  const { data, error } = await workspace.supabase.rpc("clock_out_attendance_with_location", {
    p_business_id: workspace.business.id,
    p_session_id: sessionId,
    p_request_id: requestId,
    p_location_status: location.status,
    p_latitude: location.latitude,
    p_longitude: location.longitude,
    p_accuracy_meters: location.accuracyMeters,
  });
  const receipt = parseLocationClockReceipt(data);
  if (error || !receipt || receipt.sessionId.toLowerCase() !== sessionId.toLowerCase()) {
    console.error("Clock-out failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid clock receipt.",
    });
    redirect(`${destination}&error=${attendanceFailureReason(error?.message)}`);
  }
  revalidatePath("/attendance");
  const saved = receipt.locationStatus === "review" ? "location-review"
    : receipt.locationStatus === "historical_unverified" ? "location-historical" : "recorded";
  redirect(`${destination}&saved=${saved}`);
}

export async function reviewAttendanceLocationAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const checkIds = uuidList(formData, "check_id", 1);
  if (!venueIds || venueIds.length !== 1 || !checkIds || checkIds.length !== 1) {
    console.error("Invalid attendance location review.");
    redirect("/attendance?error=review-invalid");
  }
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the attendance review workspace.", { message: workspace.message });
    redirect("/attendance?error=venue");
  }
  const destination = `/attendance?venue=${encodeURIComponent(workspace.venue.id)}`;
  const { data, error } = await workspace.supabase.rpc("review_attendance_location_exception", {
    p_business_id: workspace.business.id, p_check_id: checkIds[0],
  });
  if (error || typeof data !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
    console.error("Attendance location review failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid review receipt.",
    });
    redirect(`${destination}&error=review-save`);
  }
  revalidatePath("/attendance");
  redirect(`${destination}&saved=location-reviewed`);
}

export async function submitAttendanceCorrectionRequestAction(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  const options = formData.getAll("clock_option");
  const eventTypes = formData.getAll("event_type");
  const local = formData.getAll("proposed_local");
  const microseconds = formData.getAll("additional_microseconds");
  const occurrences = formData.getAll("occurrence");
  const reasons = formData.getAll("reason");
  const option = options.length === 1 ? parseClockOptionValue(options[0]) : null;
  if (venues?.length !== 1 || requests?.length !== 1 || !option || eventTypes.length !== 1 ||
    (eventTypes[0] !== "clock_in" && eventTypes[0] !== "clock_out") || local.length !== 1 ||
    microseconds.length !== 1 || occurrences.length !== 1 || reasons.length !== 1 ||
    typeof reasons[0] !== "string" || !reasons[0].trim() || reasons[0].trim().length > 500) {
    console.error("Invalid employee attendance correction request.");
    redirect("/attendance?error=request-invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the correction request workspace.", { message: workspace.message });
    redirect("/attendance?error=venue");
  }
  const destination = `/attendance?venue=${encodeURIComponent(workspace.venue.id)}`;
  const target = correctionInstant(
    correctionLocalWithMicroseconds(local[0], microseconds[0]), workspace.venue.timezone, occurrences[0],
  );
  if (target.status !== "ok") redirect(`${destination}&error=request-${target.status}`);
  const { data, error } = await workspace.supabase.rpc("submit_attendance_correction_request", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    p_department_id: option.departmentId, p_employee_id: option.employeeId,
    p_actor_id: workspace.user.id, p_request_id: requests[0], p_event_type: eventTypes[0],
    p_proposed_at: target.value, p_reason: reasons[0].trim(),
  });
  if (error || !parseOfflineClaimReceipt(data)) {
    console.error("Submitting an attendance correction request failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid request receipt.",
    });
    const failureReasons: Record<string, string> = {
      "Invalid attendance correction request": "request-time",
      "Request identifier already used": "reused",
      "Employee not found or permission denied": "permission",
      "Employee or department is unavailable": "unavailable",
      "Permission denied": "permission",
      [attendanceClaimTimezoneChangedMessage]: "claim-timezone",
    };
    redirect(`${destination}&error=${error?.message && Object.hasOwn(failureReasons, error.message)
      ? failureReasons[error.message] : "request-save"}`);
  }
  revalidatePath("/attendance");
  redirect(`${destination}&saved=request-submitted`);
}

export async function reviewOfflineAttendanceClaimAction(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const claims = uuidList(formData, "claim_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  const decisions = formData.getAll("decision");
  const reasons = formData.getAll("reason");
  const options = formData.getAll("event_option");
  if (venues?.length !== 1 || claims?.length !== 1 || requests?.length !== 1 ||
    decisions.length !== 1 || typeof decisions[0] !== "string" ||
    !["matched", "corrected", "rejected", "reopened"].includes(decisions[0]) ||
    reasons.length !== 1 || typeof reasons[0] !== "string" ||
    !reasons[0].trim() || reasons[0].trim().length > 500) {
    console.error("Invalid offline attendance review.");
    redirect("/attendance?error=claim-invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the offline claim review workspace.", { message: workspace.message });
    redirect("/attendance?error=venue");
  }
  const destination = `/attendance?venue=${encodeURIComponent(workspace.venue.id)}`;
  const needsEvent = decisions[0] === "matched" || decisions[0] === "corrected";
  const option = needsEvent && options.length === 1 ? parseOfflineMatchOption(options[0]) : null;
  if ((needsEvent && !option) || (!needsEvent && options.length !== 0)) {
    console.error("Invalid offline attendance review event.");
    redirect(`${destination}&error=claim-invalid`);
  }
  const { data, error } = await workspace.supabase.rpc("review_attendance_offline_claim", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_claim_id: claims[0],
    p_request_id: requests[0], p_decision: decisions[0], p_event_id: option?.eventId ?? null,
    p_expected_at: option?.expectedAt ?? null, p_reason: reasons[0].trim(),
  });
  if (error || typeof data !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
    console.error("Offline attendance review failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid review receipt.",
    });
    const failureReasons: Record<string, string> = {
      "Claim has already been reviewed": "claim-reviewed",
      "Claim is already awaiting review": "claim-pending",
      "Only an owner or general manager can reopen a claim": "claim-permission",
      "Matching attendance event not found": "claim-match",
      "Only finished sessions can be reconciled": "claim-match",
      "Attendance changed; refresh before reconciling": "claim-stale",
      "Attendance changed; refresh before correcting": "claim-stale",
      "Attendance edits are locked": "claim-locked",
      [payrollFinalisedMessage]: "period-finalised",
      "Corrected attendance overlaps another session": "claim-overlap",
      "Invalid attendance correction time": "claim-time",
      "The event does not match the requested time": "request-mismatch",
      [attendanceClaimTimezoneChangedMessage]: "claim-timezone",
    };
    redirect(`${destination}&error=${error?.message && Object.hasOwn(failureReasons, error.message)
      ? failureReasons[error.message] : "claim-save"}`);
  }
  revalidatePath("/attendance");
  revalidatePath("/work-time");
  redirect(`${destination}&saved=claim-reviewed`);
}

export async function createAttendanceFromOfflineClaimsAction(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const starts = uuidList(formData, "clock_in_claim_id", 1);
  const ends = uuidList(formData, "clock_out_claim_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  const reasons = formData.getAll("reason");
  const confirmations = formData.getAll("acknowledge_unverified");
  if (venues?.length !== 1 || starts?.length !== 1 || ends?.length !== 1 ||
    starts[0] === ends[0] || requests?.length !== 1 || reasons.length !== 1 ||
    typeof reasons[0] !== "string" || !reasons[0].trim() || reasons[0].trim().length > 500 ||
    confirmations.length !== 1 || confirmations[0] !== "yes") {
    console.error("Invalid offline attendance creation request.");
    redirect("/attendance?error=claim-pair-invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the offline attendance workspace.", { message: workspace.message });
    redirect("/attendance?error=venue");
  }
  const destination = `/attendance?venue=${encodeURIComponent(workspace.venue.id)}`;
  const { data, error } = await workspace.supabase.rpc("create_attendance_from_offline_claims", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    p_clock_in_claim_id: starts[0], p_clock_out_claim_id: ends[0], p_request_id: requests[0],
    p_reason: reasons[0].trim(), p_acknowledge_unverified: true,
  });
  if (error || typeof data !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
    console.error("Creating attendance from offline claims failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid session receipt.",
    });
    const failureReasons: Record<string, string> = {
      "Claims must belong to the same worker and department": "claim-pair-invalid",
      "Invalid offline attendance pair": "claim-pair-invalid",
      "Claimed clock times are invalid": "claim-pair-time",
      "A claim already created attendance": "claim-pair-used",
      "A claim has already been reviewed": "claim-pair-used",
      "A claim was already linked to attendance": "claim-pair-used",
      "Claimed attendance overlaps another session": "claim-overlap",
      [payrollFinalisedMessage]: "period-finalised",
      [attendanceClaimTimezoneChangedMessage]: "claim-timezone",
    };
    redirect(`${destination}&error=${error?.message && Object.hasOwn(failureReasons, error.message)
      ? failureReasons[error.message] : "claim-save"}`);
  }
  revalidatePath("/attendance");
  revalidatePath("/work-time");
  redirect(`${destination}&saved=claim-created`);
}

export async function completeAttendanceFromOfflineClaimAction(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const claims = uuidList(formData, "claim_id", 1);
  const sessions = uuidList(formData, "session_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  const reasons = formData.getAll("reason");
  const confirmations = formData.getAll("acknowledge_unverified");
  if (venues?.length !== 1 || claims?.length !== 1 || sessions?.length !== 1 || requests?.length !== 1 ||
    reasons.length !== 1 || typeof reasons[0] !== "string" || !reasons[0].trim() ||
    reasons[0].trim().length > 500 || confirmations.length !== 1 || confirmations[0] !== "yes") {
    console.error("Invalid offline clock-out completion request.");
    redirect("/attendance?error=claim-open-invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the offline clock-out workspace.", { message: workspace.message });
    redirect("/attendance?error=venue");
  }
  const destination = `/attendance?venue=${encodeURIComponent(workspace.venue.id)}`;
  const { data, error } = await workspace.supabase.rpc("complete_attendance_from_offline_claim", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_claim_id: claims[0],
    p_session_id: sessions[0], p_request_id: requests[0], p_reason: reasons[0].trim(),
    p_acknowledge_unverified: true,
  });
  if (error || typeof data !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
    console.error("Completing attendance from an offline claim failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid review receipt.",
    });
    const failureReasons: Record<string, string> = {
      "Invalid offline clock-out review": "claim-open-invalid",
      "Matching open attendance session not found": "claim-open-stale",
      "Claimed clock-out time is invalid": "claim-pair-time",
      "End the open break before clocking out": "claim-open-break",
      "Server clock is earlier than the previous attendance event": "claim-open-order",
      "Attendance edits are locked": "claim-locked",
      [payrollFinalisedMessage]: "period-finalised",
      "Claimed attendance overlaps another session": "claim-overlap",
      "Claim has already been reviewed": "claim-reviewed",
      "A claim was already linked to attendance": "claim-pair-used",
      [attendanceClaimTimezoneChangedMessage]: "claim-timezone",
    };
    redirect(`${destination}&error=${error?.message && Object.hasOwn(failureReasons, error.message)
      ? failureReasons[error.message] : "claim-save"}`);
  }
  revalidatePath("/attendance");
  revalidatePath("/work-time");
  redirect(`${destination}&saved=claim-completed`);
}

export async function completeAttendanceWithOfflineBreakAction(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const claims = uuidList(formData, "claim_id", 1);
  const sessions = uuidList(formData, "session_id", 1);
  const breaks = uuidList(formData, "break_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  const local = formData.getAll("break_end_local");
  const microseconds = formData.getAll("additional_microseconds");
  const occurrences = formData.getAll("occurrence");
  const reasons = formData.getAll("reason");
  const confirmations = formData.getAll("acknowledge_unverified");
  if (venues?.length !== 1 || claims?.length !== 1 || sessions?.length !== 1 ||
    breaks?.length !== 1 || requests?.length !== 1 || local.length !== 1 || microseconds.length !== 1 ||
    occurrences.length !== 1 || reasons.length !== 1 || typeof reasons[0] !== "string" ||
    !reasons[0].trim() || reasons[0].trim().length > 500 ||
    confirmations.length !== 1 || confirmations[0] !== "yes") {
    console.error("Invalid offline break resolution request.");
    redirect("/attendance?error=claim-break-invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the offline break workspace.", { message: workspace.message });
    redirect("/attendance?error=venue");
  }
  const destination = `/attendance?venue=${encodeURIComponent(workspace.venue.id)}`;
  const target = correctionInstant(
    correctionLocalWithMicroseconds(local[0], microseconds[0]), workspace.venue.timezone, occurrences[0],
  );
  if (target.status !== "ok") redirect(`${destination}&error=claim-break-${target.status}`);
  const { data, error } = await workspace.supabase.rpc("complete_attendance_with_offline_break", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_claim_id: claims[0],
    p_session_id: sessions[0], p_break_id: breaks[0], p_request_id: requests[0],
    p_break_ended_at: target.value, p_reason: reasons[0].trim(), p_acknowledge_unverified: true,
  });
  if (error || typeof data !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
    console.error("Resolving an offline attendance break failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid review receipt.",
    });
    const failureReasons: Record<string, string> = {
      "Invalid offline break resolution": "claim-break-invalid",
      "Matching open attendance session not found": "claim-open-stale",
      "Matching open break not found": "claim-break-stale",
      "Reported break time is invalid": "claim-break-time",
      "Another break is open or overlaps": "claim-break-overlap",
      "Claimed clock-out time is invalid": "claim-pair-time",
      "Server clock is earlier than the previous attendance event": "claim-open-order",
      "Attendance edits are locked": "claim-locked",
      [payrollFinalisedMessage]: "period-finalised",
      "Claimed attendance overlaps another session": "claim-overlap",
      "Claim has already been reviewed": "claim-reviewed",
      "A claim was already linked to attendance": "claim-pair-used",
      [attendanceClaimTimezoneChangedMessage]: "claim-timezone",
    };
    redirect(`${destination}&error=${error?.message && Object.hasOwn(failureReasons, error.message)
      ? failureReasons[error.message] : "claim-save"}`);
  }
  revalidatePath("/attendance");
  revalidatePath("/work-time");
  redirect(`${destination}&saved=claim-break-resolved`);
}

async function correctionActionContext(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const sessions = uuidList(formData, "session_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  if (venues?.length !== 1 || sessions?.length !== 1 || requests?.length !== 1) {
    console.error("Invalid attendance correction scope.");
    redirect("/work-time?error=correction-invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the correction workspace.", { message: workspace.message });
    redirect("/work-time?error=correction-venue");
  }
  return {
    workspace, sessionId: sessions[0], requestId: requests[0],
    destination: `/work-time?venue=${encodeURIComponent(workspace.venue.id)}`,
  };
}

function correctionFailureReason(message: string | undefined) {
  switch (message) {
    case "Attendance edits are locked": return "correction-locked";
    case "Attendance changed; refresh before correcting": return "correction-stale";
    case "Corrected attendance overlaps another session": return "correction-overlap";
    case "Only finished sessions can be corrected": return "correction-unfinished";
    case "Invalid attendance correction time": return "correction-time";
    case "Only an owner or general manager can unlock attendance edits": return "unlock-permission";
    case "Incomplete or invalid attendance cannot be locked": return "lock-invalid";
    case "Attendance edit lock is already in that state": return "lock-stale";
    case payrollFinalisedMessage: return "period-finalised";
    default: return "correction-save";
  }
}

export async function correctAttendanceEventAction(formData: FormData) {
  const { workspace, sessionId, requestId, destination } = await correctionActionContext(formData);
  const events = uuidList(formData, "event_id", 1);
  const expected = formData.getAll("expected_at");
  const local = formData.getAll("new_local_time");
  const microseconds = formData.getAll("additional_microseconds");
  const occurrences = formData.getAll("occurrence");
  const reasons = formData.getAll("reason");
  if (events?.length !== 1 || expected.length !== 1 || !isCorrectionTimestamp(expected[0]) ||
    local.length !== 1 || microseconds.length !== 1 || occurrences.length !== 1 || reasons.length !== 1 ||
    typeof reasons[0] !== "string" || !reasons[0].trim() || reasons[0].trim().length > 500) {
    console.error("Invalid attendance correction.");
    redirect(`${destination}&error=correction-invalid`);
  }
  const target = correctionInstant(
    correctionLocalWithMicroseconds(local[0], microseconds[0]), workspace.venue.timezone, occurrences[0],
  );
  if (target.status !== "ok") {
    redirect(`${destination}&error=correction-${target.status}`);
  }
  const { data, error } = await workspace.supabase.rpc("correct_attendance_event", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_session_id: sessionId,
    p_event_id: events[0], p_request_id: requestId, p_expected_at: expected[0],
    p_new_at: target.value, p_reason: reasons[0].trim(),
  });
  if (error || typeof data !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
    console.error("Attendance correction failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid correction receipt.",
    });
    redirect(`${destination}&error=${correctionFailureReason(error?.message)}`);
  }
  revalidatePath("/work-time");
  revalidatePath("/attendance");
  redirect(`${destination}&saved=correction`);
}

export async function setAttendanceEditLockAction(formData: FormData) {
  const { workspace, sessionId, requestId, destination } = await correctionActionContext(formData);
  const states = formData.getAll("locked");
  const reasons = formData.getAll("reason");
  if (states.length !== 1 || (states[0] !== "true" && states[0] !== "false") ||
    reasons.length !== 1 || typeof reasons[0] !== "string" ||
    !reasons[0].trim() || reasons[0].trim().length > 500) {
    console.error("Invalid attendance lock request.");
    redirect(`${destination}&error=correction-invalid`);
  }
  const { data, error } = await workspace.supabase.rpc("set_attendance_edit_lock", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_session_id: sessionId,
    p_request_id: requestId, p_locked: states[0] === "true", p_reason: reasons[0].trim(),
  });
  if (error || typeof data !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
    console.error("Attendance edit lock failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid lock receipt.",
    });
    redirect(`${destination}&error=${correctionFailureReason(error?.message)}`);
  }
  revalidatePath("/work-time");
  revalidatePath("/attendance");
  redirect(`${destination}&saved=${states[0] === "true" ? "locked" : "unlocked"}`);
}

export async function bulkLockWeeklyAttendanceAction(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  if (venues?.length !== 1 || requests?.length !== 1) {
    console.error("Invalid weekly attendance lock scope.");
    redirect("/timesheets?error=bulk-invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the weekly attendance lock workspace.", { message: workspace.message });
    redirect("/timesheets?error=bulk-venue");
  }

  const weeks = formData.getAll("week");
  const employees = formData.getAll("employee_id");
  const reasons = formData.getAll("reason");
  const selections = parseBulkLockSelections(formData.getAll("selection"));
  const week = weeks.length === 1 ? timesheetWeek(weeks[0], workspace.venue.timezone) : null;
  const employee = employees.length === 1 ? parseTimesheetEmployeeFilter(employees[0]) : undefined;
  const query = new URLSearchParams({ venue: workspace.venue.id });
  if (week && weeks[0] === week) query.set("week", week);
  if (employee) query.set("employee", employee);
  const destination = `/timesheets?${query}`;
  if (!week || weeks[0] !== week || employee === undefined || !selections ||
    reasons.length !== 1 || typeof reasons[0] !== "string" ||
    !reasons[0].trim() || reasons[0].trim().length > 500) {
    console.error("Invalid weekly attendance lock request.");
    redirect(`${destination}&error=bulk-invalid`);
  }

  const { data, error } = await workspace.supabase.rpc("bulk_lock_weekly_attendance", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
    p_employee_id: employee, p_request_id: requests[0], p_selections: selections, p_reason: reasons[0].trim(),
  });
  const receipt = parseBulkLockReceipt(data);
  if (error || !receipt ||
    receipt.lockedCount + receipt.invalidCount + receipt.alreadyLockedCount !== selections.length) {
    console.error("Weekly attendance lock failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid bulk lock receipt.",
    });
    const failureReasons: Record<string, string> = {
      "Invalid bulk attendance lock request": "bulk-invalid",
      "Attendance changed; review again": "bulk-stale",
      "Selected attendance changed week or is unavailable": "bulk-stale",
      "Selected attendance not found or permission denied": "bulk-scope",
      "Permission denied": "bulk-scope",
      "Request identifier already used": "bulk-retry",
      [payrollFinalisedMessage]: "period-finalised",
    };
    redirect(`${destination}&error=${error?.message && Object.hasOwn(failureReasons, error.message)
      ? failureReasons[error.message] : "bulk-save"}`);
  }
  revalidatePath("/timesheets");
  revalidatePath("/work-time");
  revalidatePath("/attendance");
  redirect(`${destination}&receipt=${encodeURIComponent(receipt.batchId)}`);
}

export async function decideTimesheetAction(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  const sessions = uuidList(formData, "session_id", 1);
  if (venues?.length !== 1 || requests?.length !== 1 || sessions?.length !== 1) {
    console.error("Invalid timesheet decision scope.");
    redirect("/timesheets?error=decision-invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the timesheet decision workspace.", { message: workspace.message });
    redirect("/timesheets?error=bulk-venue");
  }

  const weeks = formData.getAll("week");
  const employees = formData.getAll("employee_id");
  const revisions = formData.getAll("revision");
  const decisions = formData.getAll("decision");
  const reasons = formData.getAll("reason");
  const week = weeks.length === 1 ? timesheetWeek(weeks[0], workspace.venue.timezone) : null;
  const employee = employees.length === 1 ? parseTimesheetEmployeeFilter(employees[0]) : undefined;
  const query = new URLSearchParams({ venue: workspace.venue.id });
  if (week && weeks[0] === week) query.set("week", week);
  if (employee) query.set("employee", employee);
  const destination = `/timesheets?${query}`;
  const input = decisions.length === 1 && reasons.length <= 1
    ? parseTimesheetDecisionInput(decisions[0], reasons.length === 1 ? reasons[0] : null) : null;
  const revision = revisions.length === 1 && typeof revisions[0] === "string" &&
    /^[0-9a-f]{64}$/.test(revisions[0]) ? revisions[0] : null;
  if (!week || weeks[0] !== week || employee === undefined || !input || !revision) {
    console.error("Invalid timesheet decision request.");
    redirect(`${destination}&error=${decisions[0] === "rejected" ? "return-invalid" : "decision-invalid"}`);
  }

  const { data, error } = await workspace.supabase.rpc("decide_attendance_timesheet", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_session_id: sessions[0],
    p_request_id: requests[0], p_expected_revision: revision, p_decision: input.decision, p_reason: input.reason,
  });
  if (error || typeof data !== "string") {
    console.error("Timesheet decision failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid decision.",
    });
    const failureReasons: Record<string, string> = {
      "Invalid timesheet decision": "decision-invalid",
      "Attendance changed; review again": "decision-stale",
      "Session not found or permission denied": "decision-scope",
      "Permission denied": "decision-scope",
      "Request identifier already used": "decision-retry",
      "You cannot approve or return your own attendance": "decision-self",
      "Timesheet entry is already approved": "decision-stale",
      "Timesheet entry is already returned for correction": "decision-stale",
      "Incomplete or invalid attendance cannot be approved": "decision-incomplete",
      "Unlock attendance before returning it for correction": "decision-locked",
      [payrollFinalisedMessage]: "period-finalised",
    };
    redirect(`${destination}&error=${error?.message && Object.hasOwn(failureReasons, error.message)
      ? failureReasons[error.message] : "decision-save"}#timesheet-session-${sessions[0]}`);
  }
  revalidatePath("/timesheets");
  revalidatePath("/work-time");
  revalidatePath("/attendance");
  redirect(`${destination}&decided=${input.decision}#timesheet-session-${sessions[0]}`);
}

export async function decidePayrollPeriodAction(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  if (venues?.length !== 1 || requests?.length !== 1) {
    console.error("Invalid payroll period scope.");
    redirect("/timesheets?error=period-invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the payroll period workspace.", { message: workspace.message });
    redirect("/timesheets?error=bulk-venue");
  }

  const weeks = formData.getAll("week");
  const employees = formData.getAll("employee_id");
  const actions = formData.getAll("period_action");
  const reasons = formData.getAll("reason");
  const week = weeks.length === 1 ? timesheetWeek(weeks[0], workspace.venue.timezone) : null;
  const employee = employees.length === 1 ? parseTimesheetEmployeeFilter(employees[0]) : undefined;
  const query = new URLSearchParams({ venue: workspace.venue.id });
  if (week && weeks[0] === week) query.set("week", week);
  if (employee) query.set("employee", employee);
  const destination = `/timesheets?${query}`;
  const input = actions.length === 1 && reasons.length <= 1
    ? parsePayrollPeriodInput(actions[0], reasons.length === 1 ? reasons[0] : null) : null;
  if (!week || weeks[0] !== week || employee === undefined || !input) {
    console.error("Invalid payroll period request.");
    redirect(`${destination}&error=${actions[0] === "reopened" ? "period-reason" : "period-invalid"}#payroll-period`);
  }

  const { data, error } = input.action === "finalised"
    ? await workspace.supabase.rpc("finalise_payroll_period", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
      p_request_id: requests[0], p_note: input.reason,
    })
    : await workspace.supabase.rpc("reopen_payroll_period", {
      p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
      p_request_id: requests[0], p_reason: input.reason,
    });
  if (error || typeof data !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
    console.error("Payroll period decision failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid payroll period receipt.",
    });
    redirect(`${destination}&error=${payrollFailureReason(error?.message)}#payroll-period`);
  }
  revalidatePath("/timesheets");
  revalidatePath("/work-time");
  revalidatePath("/attendance");
  redirect(`${destination}&period=${input.action}#payroll-period`);
}

async function payrollExportActionContext(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  const finalisations = uuidList(formData, "finalisation_id", 1);
  if (venues?.length !== 1 || requests?.length !== 1 || finalisations?.length !== 1) {
    console.error("Invalid payroll export scope.");
    redirect("/timesheets?error=export-invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the payroll export workspace.", { message: workspace.message });
    redirect("/timesheets?error=bulk-venue");
  }
  const weeks = formData.getAll("week");
  const employees = formData.getAll("employee_id");
  const week = weeks.length === 1 ? timesheetWeek(weeks[0], workspace.venue.timezone) : null;
  const employee = employees.length === 1 ? parseTimesheetEmployeeFilter(employees[0]) : undefined;
  const query = new URLSearchParams({ venue: workspace.venue.id });
  if (week && weeks[0] === week) query.set("week", week);
  if (employee) query.set("employee", employee);
  const destination = `/timesheets?${query}`;
  if (!week || weeks[0] !== week || employee === undefined) {
    console.error("Invalid payroll export filters.");
    redirect(`${destination}&error=export-invalid#payroll-period`);
  }
  return {
    workspace, week, destination, requestId: requests[0], finalisationId: finalisations[0],
  };
}

function payrollExportFailureReason(message: string | undefined): string {
  const reasons: Record<string, string> = {
    "Permission denied": "export-permission",
    "Payroll period changed; refresh before exporting": "export-stale",
    "Venue timezone changed; reopen and review payroll before exporting": "export-stale",
    "Resolve outstanding payroll exceptions before exporting": "export-exceptions",
    "Previously exported time requires reconciliation": "export-reconciliation",
    "Payroll reconciliation changed; refresh and review again": "export-stale",
    "No payroll reconciliation is required": "export-stale",
    "No new approved sessions are available for export": "export-empty",
    "Employee name is too long or blank; correct the employee profile before preparing payroll": "export-name",
    "Request identifier already used": "export-retry",
    "Invalid payroll reconciliation request": "export-reconcile-invalid",
  };
  return message && Object.hasOwn(reasons, message) ? reasons[message] : "export-save";
}

export async function prepareGenericPayrollExportAction(formData: FormData) {
  const { workspace, week, destination, requestId, finalisationId } = await payrollExportActionContext(formData);
  const { data, error } = await workspace.supabase.rpc("create_generic_payroll_export", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
    p_finalisation_id: finalisationId, p_request_id: requestId,
  });
  if (error || !isPayrollUuid(data)) {
    console.error("Preparing the payroll export failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid batch receipt.",
    });
    redirect(`${destination}&error=${payrollExportFailureReason(error?.message)}#payroll-period`);
  }
  revalidatePath("/timesheets");
  redirect(`${destination}&export_batch=${data}#payroll-period`);
}

export async function reconcileGenericPayrollExportAction(formData: FormData) {
  const { workspace, week, destination, requestId, finalisationId } = await payrollExportActionContext(formData);
  const hashes = formData.getAll("review_hash");
  const reasons = formData.getAll("reason");
  const confirmations = formData.getAll("confirmed");
  const hash = hashes.length === 1 ? hashes[0] : null;
  const reason = reasons.length === 1 && typeof reasons[0] === "string" ? reasons[0].trim() : "";
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash) || reason.length === 0 || reason.length > 500 ||
    confirmations.length !== 1 || confirmations[0] !== "yes") {
    console.error("Invalid payroll reconciliation details.");
    redirect(`${destination}&error=export-reconcile-invalid#payroll-period`);
  }
  const { data, error } = await workspace.supabase.rpc("reconcile_generic_payroll_export", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
    p_finalisation_id: finalisationId, p_request_id: requestId, p_review_hash: hash,
    p_reason: reason, p_confirmed: true,
  });
  if (error || !isPayrollUuid(data)) {
    console.error("Payroll reconciliation failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid reconciliation receipt.",
    });
    redirect(`${destination}&error=${payrollExportFailureReason(error?.message)}#payroll-period`);
  }
  revalidatePath("/timesheets");
  redirect(`${destination}&export_reconciliation=${data}#payroll-period`);
}

export async function savePayrollMappingAction(formData: FormData) {
  const venues = uuidList(formData, "venue_id", 1);
  const connections = uuidList(formData, "connection_id", 1);
  const requests = uuidList(formData, "request_id", 1);
  if (venues?.length !== 1 || connections?.length !== 1 || requests?.length !== 1) {
    console.error("Invalid payroll mapping scope.");
    redirect("/settings/payroll?error=invalid");
  }
  const workspace = await getWorkspace(venues[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load payroll mapping workspace.", { message: workspace.message });
    redirect("/settings/payroll?error=venue");
  }
  const query = new URLSearchParams({ venue: workspace.venue.id, connection: connections[0] });
  const destination = `/settings/payroll?${query}`;
  if (!["owner", "admin"].includes(workspace.membership.role)) {
    console.error("Payroll mapping management denied.");
    redirect(`${destination}&error=permission`);
  }
  const one = (key: string) => {
    const values = formData.getAll(key);
    return values.length === 1 ? values[0] : null;
  };
  const operation = one("operation");
  let result;
  if (operation === "connection") {
    const provider = one("provider");
    const accountId = payrollMappingText(one("account_id"), 255);
    const name = payrollMappingText(one("name"), 100);
    if (!isPayrollProvider(provider) || !accountId || !name) {
      console.error("Invalid payroll mapping connection.");
      redirect(`${destination}&error=invalid`);
    }
    result = await workspace.supabase.rpc("create_payroll_mapping_connection", {
      p_business_id: workspace.business.id, p_connection_id: connections[0],
      p_provider: provider, p_account_id: accountId, p_name: name,
    });
  } else {
    const employees = uuidList(formData, "employee_id", 1);
    const revision = payrollMappingRevision(one("revision"));
    const reason = payrollMappingText(one("reason"), 500);
    const external = one("external_employee_id");
    const externalId = typeof external === "string" && external.trim() === "" ? null
      : payrollMappingText(external, 255);
    if (operation !== "mapping" || employees?.length !== 1 || revision === null || !reason ||
      typeof external !== "string" || (external.trim() !== "" && externalId === null)) {
      console.error("Invalid payroll employee mapping.");
      redirect(`${destination}&error=invalid`);
    }
    result = await workspace.supabase.rpc("set_payroll_employee_mapping", {
      p_business_id: workspace.business.id, p_connection_id: connections[0], p_employee_id: employees[0],
      p_expected_revision: revision, p_external_employee_id: externalId, p_reason: reason, p_request_id: requests[0],
    });
  }
  if (result.error || !isPayrollUuid(result.data)) {
    console.error("Payroll mapping save failed.", {
      code: result.error?.code, message: result.error?.message ?? "Invalid mapping receipt.",
    });
    redirect(`${destination}&error=${payrollMappingFailure(result.error?.message)}`);
  }
  revalidatePath("/settings/payroll");
  revalidatePath("/timesheets");
  if (operation === "connection") query.set("connection", result.data);
  redirect(`/settings/payroll?${query}&saved=${operation}`);
}

export async function startAttendanceBreakAction(formData: FormData) {
  const { workspace, requestId, destination, sessionId } = await attendanceSessionActionContext(formData);
  const values = formData.getAll("classification");
  const classification = values.length === 1 ? parseBreakClassification(values[0]) : null;
  if (!classification) {
    console.error("Invalid attendance break classification.");
    redirect(`${destination}&error=invalid`);
  }
  const { data, error } = await workspace.supabase.rpc("start_attendance_break", {
    p_business_id: workspace.business.id,
    p_session_id: sessionId,
    p_classification: classification,
    p_request_id: requestId,
  });
  const receipt = parseClockReceipt(data);
  if (error || !receipt || receipt.sessionId.toLowerCase() !== sessionId.toLowerCase()) {
    console.error("Break start failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid break receipt.",
    });
    redirect(`${destination}&error=${attendanceFailureReason(error?.message)}`);
  }
  revalidatePath("/attendance");
  redirect(`${destination}&saved=break-recorded`);
}

export async function endAttendanceBreakAction(formData: FormData) {
  const { workspace, requestId, destination, sessionId } = await attendanceSessionActionContext(formData);
  const breaks = uuidList(formData, "break_id", 1);
  if (!breaks || breaks.length !== 1) {
    console.error("Invalid attendance break.");
    redirect(`${destination}&error=invalid`);
  }
  const { data, error } = await workspace.supabase.rpc("end_attendance_break", {
    p_business_id: workspace.business.id,
    p_session_id: sessionId,
    p_break_id: breaks[0],
    p_request_id: requestId,
  });
  const receipt = parseClockReceipt(data);
  if (error || !receipt || receipt.sessionId.toLowerCase() !== sessionId.toLowerCase()) {
    console.error("Break end failed.", {
      code: error?.code, message: error?.message ?? "The server returned an invalid break receipt.",
    });
    redirect(`${destination}&error=${attendanceFailureReason(error?.message)}`);
  }
  revalidatePath("/attendance");
  redirect(`${destination}&saved=break-recorded`);
}

async function availabilityActionContext(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  if (!venueIds || venueIds.length !== 1) {
    console.error("Invalid availability venue submitted.");
    redirect("/availability?error=invalid");
  }
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
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
  const workspace = await getWorkspace(undefined, businessContext(formData));
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
  const workspace = await getWorkspace(undefined, businessContext(formData));
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
  if (error) {
    console.error("Workspace setup failed.", { code: error.code, message: error.message });
    redirect(error.message === "Sample data is not enabled in this environment"
      ? "/setup?error=sample-disabled" : "/setup?error=create");
  }
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
  const workspace = await getWorkspace(venueIds?.[0], businessContext(formData));
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

export async function copyRosterWeekAction(_previous: RosterCopyState, formData: FormData): Promise<RosterCopyState> {
  const week = text(formData, "week", 11);
  const sourceWeek = text(formData, "source_week", 11);
  const venueIds = uuidList(formData, "venue_id", 1);
  const departmentIds = uuidList(formData, "department_id", 1);
  const requestIds = uuidList(formData, "request_id", 1);
  const state: RosterCopyState = {
    errors: {},
    values: { sourceWeek, requestId: requestIds?.[0] ?? "" },
  };
  if (!venueIds || venueIds.length !== 1 || !departmentIds || departmentIds.length !== 1 ||
    !requestIds || requestIds.length !== 1 || !isRosterWeek(week)) {
    console.error("Invalid roster copy context.");
    state.errors.form = "The roster context is invalid. Reload the page and try again.";
    return state;
  }
  if (!isRosterWeek(sourceWeek)) {
    state.errors.sourceWeek = "Choose a valid Monday for the source week.";
    return state;
  }
  if (sourceWeek === week) {
    state.errors.sourceWeek = "Choose a different source week.";
    return state;
  }
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the roster workspace for copying.", { message: workspace.message });
    state.errors.form = "The selected venue is unavailable. Reload the roster and try again.";
    return state;
  }
  const { data, error } = await workspace.supabase.rpc("copy_roster_week", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    p_department_id: departmentIds[0], p_source_week: sourceWeek,
    p_target_week: week, p_request_id: requestIds[0],
  });
  if (error) {
    console.error("Roster copy failed.", { code: error.code, message: error.message });
    state.errors.form = rosterCopyError(error.code, error.message);
    return state;
  }
  if (typeof data !== "number" || !Number.isSafeInteger(data) || data < 0) {
    console.error("Roster copy returned an invalid result.");
    state.errors.form = rosterCopyError("", "");
    return state;
  }
  redirect(`/roster?week=${encodeURIComponent(week)}&venue=${encodeURIComponent(workspace.venue.id)}&department=${encodeURIComponent(departmentIds[0])}${collapsedRosterQuery(formData)}&copied=${data}`);
}

export async function deleteShiftAction(formData: FormData) {
  const venueIds = uuidList(formData, "venue_id", 1);
  const workspace = await getWorkspace(venueIds?.[0], businessContext(formData));
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
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
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
  const workspace = await getWorkspace(venueIds?.[0], businessContext(formData));
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
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
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
  const workspace = await getWorkspace(venueIds[0], businessContext(formData));
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
