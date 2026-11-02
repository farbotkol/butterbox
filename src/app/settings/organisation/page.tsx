import { redirect } from "next/navigation";
import {
  saveDepartmentAction,
  saveJobRoleAction,
  saveRosterPublicationModeAction,
  saveVenueConflictPolicyAction,
  saveVenueGeofenceAction,
  setVenueClockGeofenceAction,
  setJobRoleAutoRestrictionAction,
  setJobRoleManualRestrictionAction,
} from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import type { ConflictPolicyValues } from "@/lib/conflict-policy";
import { parseRosterPublicationMode, parseRosterPublicationModeEvents } from "@/lib/roster-review";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { withBusiness } from "@/lib/business-selection";
import { getWorkspace } from "@/lib/workspace";

type Department = { id: string; name: string; active: boolean };
type JobRole = {
  id: string;
  name: string;
  active: boolean;
  department_id: string;
  restrict_auto_assignment: boolean;
  restrict_manual_assignment: boolean;
};
type GeofenceValues = { latitude: number | null; longitude: number | null; radius_meters: number | null };
type GeofenceEvent = {
  id: string;
  actor_id: string | null;
  actor_type: string;
  old_values: GeofenceValues;
  new_values: GeofenceValues;
  created_at: string;
};
type ClockLocationPolicyEvent = {
  id: string;
  actor_id: string | null;
  actor_type: string;
  old_enabled: boolean;
  new_enabled: boolean;
  created_at: string;
};
type ConflictPolicyEvent = {
  id: string;
  actor_id: string | null;
  actor_type: string;
  old_values: ConflictPolicyValues;
  new_values: ConflictPolicyValues;
  created_at: string;
};

const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];
const departmentManagerRoles = ["owner", "admin", "general_manager"];

const errorMessages: Record<string, string> = {
  duplicate: "That name is already used here. Choose a different name.",
  permission: "You don't have permission to make that change.",
  inactive: "Reactivate the department before adding or reactivating its roles.",
  filter: "That venue is not available to you.",
  geofence: "Enter latitude from -90 to 90, longitude from -180 to 180 (up to six decimal places), and a whole-number radius from 1 to 10,000 metres; or clear all three.",
  "location-required": "Configure a venue location before enabling verification, and disable verification before removing it.",
  "location-policy": "Select whether clock location verification is enabled.",
  "conflict-policy": "Select a valid option for each roster conflict rule and try again.",
  "roster-mode": "We couldn't save the roster publication setting. Choose a valid option and try again.",
  save: "We couldn't save that change. Check the name and try again.",
};

const fieldClass = "mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink";

function formatGeofence(values: GeofenceValues) {
  if (values.latitude === null) return "Not configured";
  return `${values.latitude}, ${values.longitude}; ${values.radius_meters} m`;
}

function formatConflictPolicy(values: ConflictPolicyValues) {
  const setting = (blocked: boolean) => blocked ? "block" : "warn";
  return `Manual availability: ${setting(values.manual_unavailability)}; publication availability: ${setting(values.publish_unavailability)}; overlaps: ${setting(values.publish_overlap)}; long shifts: ${setting(values.publish_long_shift)}`;
}

function ConflictPolicySelect({ name, label, blocked, blockLabel }: {
  name: keyof ConflictPolicyValues; label: string; blocked: boolean; blockLabel: string;
}) {
  return (
    <label className="text-sm">{label}
      <select name={name} defaultValue={String(blocked)} className={fieldClass}>
        <option value="false">Warn only</option>
        <option value="true">{blockLabel}</option>
      </select>
    </label>
  );
}

function StatusSelect({ active, label }: { active: boolean; label: string }) {
  return (
    <label className="text-sm">{label}
      <select name="active" defaultValue={active ? "true" : "false"} className={fieldClass}>
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </select>
    </label>
  );
}

export default async function OrganisationPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; saved?: string; venue?: string; business?: string }> }) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(undefined, { businessId: params.business, venueHint: params.venue, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") redirect("/?error=workspace");
  if (!managerRoles.includes(workspace.membership.role)) redirect(withBusiness("/?error=permission", workspace.business.id));

  const venues = await workspace.supabase.from("venues")
    .select("id, name, geofence_latitude, geofence_longitude, geofence_radius_meters, clock_geofence_enabled, block_manual_unavailability, block_publish_unavailability, block_publish_overlap, block_publish_long_shift, roster_publication_mode")
    .eq("business_id", workspace.business.id).order("name");
  const selectedVenue = venues.data?.find((venue) => venue.id === (params.venue ?? workspace.venue.id));
  if (!venues.error && !selectedVenue) redirect(withBusiness("/settings/organisation?error=filter", workspace.business.id));
  const venueId = selectedVenue?.id ?? workspace.venue.id;

  const canManageGeofence = workspace.membership.role === "owner";
  const [departments, roles, geofenceHistory, locationPolicyHistory, conflictHistory, rosterModeHistory] = await Promise.all([
    workspace.supabase.from("departments").select("id, name, active")
      .eq("venue_id", venueId).order("name"),
    workspace.supabase.from("job_roles").select("id, name, active, department_id, restrict_auto_assignment, restrict_manual_assignment")
      .eq("venue_id", venueId).order("name"),
    canManageGeofence
      ? workspace.supabase.from("venue_geofence_events")
        .select("id, actor_id, actor_type, old_values, new_values, created_at")
        .eq("business_id", workspace.business.id).eq("venue_id", venueId)
        .order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
    canManageGeofence
      ? workspace.supabase.from("venue_clock_location_events")
        .select("id, actor_id, actor_type, old_enabled, new_enabled, created_at")
        .eq("business_id", workspace.business.id).eq("venue_id", venueId)
        .order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
    canManageGeofence
      ? workspace.supabase.from("venue_conflict_policy_events")
        .select("id, actor_id, actor_type, old_values, new_values, created_at")
        .eq("business_id", workspace.business.id).eq("venue_id", venueId)
        .order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
    canManageGeofence
      ? workspace.supabase.from("roster_publication_mode_events")
        .select("id, actor_id, old_mode, new_mode, created_at")
        .eq("business_id", workspace.business.id).eq("venue_id", venueId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const loadError = venues.error || departments.error || roles.error;
  if (loadError) console.error("Could not load departments and roles.", { code: loadError.code, message: loadError.message });
  if (geofenceHistory.error) {
    console.error("Could not load venue geofence history.", {
      code: geofenceHistory.error.code, message: geofenceHistory.error.message,
    });
  }
  if (conflictHistory.error) {
    console.error("Could not load roster conflict policy history.", {
      code: conflictHistory.error.code, message: conflictHistory.error.message,
    });
  }
  if (locationPolicyHistory.error) {
    console.error("Could not load clock location policy history.", {
      code: locationPolicyHistory.error.code, message: locationPolicyHistory.error.message,
    });
  }
  const rosterMode = parseRosterPublicationMode(selectedVenue?.roster_publication_mode);
  const rosterModeEvents = parseRosterPublicationModeEvents(rosterModeHistory.data);
  if (canManageGeofence && (!rosterMode || rosterModeHistory.error || !rosterModeEvents)) {
    console.error("Could not load roster publication settings or history.", {
      code: rosterModeHistory.error?.code,
      message: rosterModeHistory.error?.message ?? "The server returned invalid publication settings or history.",
    });
  }
  const departmentRows: Department[] = departments.data ?? [];
  const roleRows: JobRole[] = roles.data ?? [];
  const geofenceEvents: GeofenceEvent[] = geofenceHistory.data ?? [];
  const locationPolicyEvents: ClockLocationPolicyEvent[] = locationPolicyHistory.data ?? [];
  const conflictEvents: ConflictPolicyEvent[] = conflictHistory.data ?? [];
  const canManageDepartments = departmentManagerRoles.includes(workspace.membership.role);

  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length} venueName={selectedVenue?.name ?? workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <h1 className="text-3xl font-semibold">Departments and roles</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Front of House and Back of House are created with every venue. Add custom departments and job roles,
        or mark them inactive to stop new staff and shifts using them. Deactivating never deletes anything:
        existing shifts and staff keep their original department and role. Automatic and manual
        qualification restrictions are configured separately. Restricting manual assignment also
        restricts automatic selection for that role.
      </p>

      {(venues.data?.length ?? 0) > 1 && (
        <form action="/settings/organisation" className="mt-5 flex items-end gap-3">
          <input type="hidden" name="business" value={workspace.business.id} />
          <label className="text-sm">Venue
            <select name="venue" defaultValue={venueId} className={fieldClass}>
              {venues.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-lg border border-line px-4 py-3 text-sm font-semibold">Show venue</button>
        </form>
      )}

      {params.error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">
          {errorMessages[params.error] ?? errorMessages.save}
        </p>
      )}
      {params.saved && (
        <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-ocean">
          {params.saved === "role" ? "Job role saved."
            : params.saved === "restriction" ? "Automatic assignment setting saved."
              : params.saved === "manual-restriction" ? "Manual assignment setting saved."
                : params.saved === "geofence" ? "Venue location saved."
                : params.saved === "location-policy" ? "Clock location setting saved."
                : params.saved === "conflict-policy" ? "Roster conflict rules saved."
                : params.saved === "roster-mode" ? "Roster publication setting saved."
                : "Department saved."}
        </p>
      )}

      {loadError ? (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">We could not load departments. Try again.</p>
      ) : (
        <>
          {canManageGeofence && selectedVenue && (
            <section aria-label="Roster publication settings" className="mt-6 rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">Roster publication settings</h2>
              <p id="roster-mode-help" className="mt-3 text-sm leading-6 text-muted">
                Direct publication is the default. With approval required, a manager submits a private snapshot
                and a different authorised owner, administrator or general manager approves or rejects it.
                Changing this setting does not publish drafts and makes existing pending reviews stale.
              </p>
              {rosterMode ? (
                <form action={saveRosterPublicationModeAction} aria-label="Configure roster publication"
                  aria-describedby="roster-mode-help" className="mt-4 grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="business_id" value={workspace.business.id} />
                  <input type="hidden" name="venue_id" value={venueId} />
                  <label className="text-sm">Publication mode
                    <select name="mode" defaultValue={rosterMode} className={fieldClass}>
                      <option value="direct">Direct publication</option>
                      <option value="approval">Approval required</option>
                    </select>
                  </label>
                  <button type="submit" className="self-end justify-self-start rounded-lg bg-ocean px-4 py-3 font-semibold text-white">
                    Save publication setting
                  </button>
                </form>
              ) : (
                <p role="alert" className="mt-3 text-sm text-red-800">
                  We couldn&apos;t load the publication setting. Reload before making changes.
                </p>
              )}
              <h3 className="mt-5 text-sm font-semibold">Recent publication setting changes</h3>
              {rosterModeHistory.error || !rosterModeEvents ? (
                <p role="alert" className="mt-2 text-sm text-red-800">We couldn&apos;t load publication setting history.</p>
              ) : rosterModeEvents.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No publication setting changes yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {rosterModeEvents.map((event) => (
                    <li key={event.id} className="break-words">
                      <time dateTime={event.created_at}>{new Date(event.created_at).toISOString()}</time>
                      {" | "}{event.actor_id ? `User ${event.actor_id}` : "Database"}
                      {" | "}{event.old_mode === "direct" ? "Direct publication" : "Approval required"}
                      {" to "}{event.new_mode === "direct" ? "Direct publication" : "Approval required"}
                    </li>
                  ))}
                </ul>
              )}
              {rosterModeEvents?.length === 10 && <p className="mt-2 text-xs text-muted">Showing the 10 most recent changes.</p>}
            </section>
          )}
          {canManageGeofence && selectedVenue && (
            <section aria-label="Roster conflict rules" className="mt-6 rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">Roster conflict rules</h2>
              <p id="conflict-policy-help" className="mt-3 text-sm leading-6 text-muted">
                Rules apply to this venue. New assignments reject overlaps for the same venue profile.
                Cross-venue overlaps are detected when an owner explicitly links a worker&apos;s profiles;
                automatic selection avoids them and publication follows the overlap rule below.
                Unsubmitted availability is unknown; pending leave does not block a shift. Existing
                assignments are not changed when a rule is enabled. Availability for assigned shifts
                longer than 24 hours cannot be verified and is blocked when publication requires
                available workers.
              </p>
              <form action={saveVenueConflictPolicyAction} aria-label="Configure roster conflict rules"
                aria-describedby="conflict-policy-help" className="mt-4 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="venue_id" value={venueId} />
                <ConflictPolicySelect name="manual_unavailability" label="Manual assignment with unavailable worker"
                  blocked={selectedVenue.block_manual_unavailability} blockLabel="Block assignment" />
                <ConflictPolicySelect name="publish_unavailability" label="Publish with unavailable worker"
                  blocked={selectedVenue.block_publish_unavailability} blockLabel="Block publication" />
                <ConflictPolicySelect name="publish_overlap" label="Publish with overlapping shifts"
                  blocked={selectedVenue.block_publish_overlap} blockLabel="Block publication" />
                <ConflictPolicySelect name="publish_long_shift" label="Publish a shift longer than 24 hours"
                  blocked={selectedVenue.block_publish_long_shift} blockLabel="Block publication" />
                <button type="submit" className="justify-self-start rounded-lg bg-ocean px-4 py-3 font-semibold text-white">
                  Save roster conflict rules
                </button>
              </form>
              <h3 className="mt-5 text-sm font-semibold">Recent rule changes</h3>
              {conflictHistory.error ? (
                <p role="alert" className="mt-2 text-sm text-red-800">We could not load rule history. Try again.</p>
              ) : conflictEvents.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No rule changes yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {conflictEvents.map((event) => (
                    <li key={event.id} className="break-words">
                      <time dateTime={event.created_at}>{new Date(event.created_at).toISOString()}</time>
                      {" | "}{event.actor_id ? `User ${event.actor_id}` : event.actor_type}
                      {" | "}{formatConflictPolicy(event.old_values)} to {formatConflictPolicy(event.new_values)}
                    </li>
                  ))}
                </ul>
              )}
              {conflictEvents.length === 10 && <p className="mt-2 text-xs text-muted">Showing the 10 most recent changes.</p>}
            </section>
          )}
          {canManageGeofence && selectedVenue && (
            <section aria-label="Venue location and geofence" className="mt-6 rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">Venue location and geofence</h2>
              <p id="geofence-help" className="mt-3 text-sm leading-6 text-muted">
                Enter coordinates to six decimal places and a radius from 1 to 10,000 metres.
                Clear all three fields to remove the location after disabling verification.
                Location verification is optional and is off until an owner enables it.
                Staff may need to allow location access at clock-in and clock-out. A denied,
                unavailable, inaccurate or outside location is flagged for review without stopping
                the clock event. Verification requires the reported accuracy area to fit within the
                radius. Device-reported location can be spoofed, and raw coordinates are not retained.
              </p>
              <form action={saveVenueGeofenceAction} aria-label="Configure venue geofence"
                aria-describedby="geofence-help" className="mt-4 grid gap-4 sm:grid-cols-3">
                <input type="hidden" name="venue_id" value={venueId} />
                <label className="text-sm">Latitude
                  <input name="latitude" type="number" min="-90" max="90" step="0.000001"
                    defaultValue={selectedVenue.geofence_latitude ?? ""} className={fieldClass} />
                </label>
                <label className="text-sm">Longitude
                  <input name="longitude" type="number" min="-180" max="180" step="0.000001"
                    defaultValue={selectedVenue.geofence_longitude ?? ""} className={fieldClass} />
                </label>
                <label className="text-sm">Radius in metres
                  <input name="radius_meters" type="number" min="1" max="10000" step="1"
                    defaultValue={selectedVenue.geofence_radius_meters ?? ""} className={fieldClass} />
                </label>
                <button type="submit" className="justify-self-start rounded-lg bg-ocean px-4 py-3 font-semibold text-white">
                  Save venue location
                </button>
              </form>
              <form action={setVenueClockGeofenceAction} aria-label="Configure clock location verification"
                aria-describedby="geofence-help" className="mt-5">
                <input type="hidden" name="venue_id" value={venueId} />
                <label className="block max-w-md text-sm">Clock location verification
                  <select name="enabled" defaultValue={String(selectedVenue.clock_geofence_enabled)} className={fieldClass}>
                    <option value="false">Off</option>
                    <option value="true">On</option>
                  </select>
                </label>
                <button type="submit" className="mt-4 rounded-lg bg-ocean px-4 py-3 font-semibold text-white">
                  Save clock location setting
                </button>
              </form>
              <h3 className="mt-5 text-sm font-semibold">Recent clock location setting changes</h3>
              {locationPolicyHistory.error ? (
                <p role="alert" className="mt-2 text-sm text-red-800">We could not load clock location history. Try again.</p>
              ) : locationPolicyEvents.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No clock location setting changes yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {locationPolicyEvents.map((event) => (
                    <li key={event.id} className="break-words">
                      <time dateTime={event.created_at}>{new Date(event.created_at).toISOString()}</time>
                      {" | "}{event.actor_id ? `User ${event.actor_id}` : event.actor_type}
                      {" | "}{event.old_enabled ? "On" : "Off"} to {event.new_enabled ? "On" : "Off"}
                    </li>
                  ))}
                </ul>
              )}
              {locationPolicyEvents.length === 10 && <p className="mt-2 text-xs text-muted">Showing the 10 most recent changes.</p>}
              <h3 className="mt-5 text-sm font-semibold">Recent location changes</h3>
              {geofenceHistory.error ? (
                <p role="alert" className="mt-2 text-sm text-red-800">We could not load location history. Try again.</p>
              ) : geofenceEvents.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No location changes yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {geofenceEvents.map((event) => (
                    <li key={event.id} className="break-words">
                      <time dateTime={event.created_at}>{new Date(event.created_at).toISOString()}</time>
                      {" | "}{event.actor_id ? `User ${event.actor_id}` : event.actor_type}
                      {" | "}{formatGeofence(event.old_values)} to {formatGeofence(event.new_values)}
                    </li>
                  ))}
                </ul>
              )}
              {geofenceEvents.length === 10 && <p className="mt-2 text-xs text-muted">Showing the 10 most recent changes.</p>}
            </section>
          )}
          {canManageDepartments && (
            <section aria-label="Add department" className="mt-6 rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">Add department</h2>
              <form action={saveDepartmentAction} className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
                <input type="hidden" name="venue_id" value={venueId} />
                <input type="hidden" name="active" value="true" />
                <label className="text-sm">Department name
                  <input name="name" required maxLength={80} className={fieldClass} />
                </label>
                <button type="submit" className="self-end rounded-lg bg-ocean px-4 py-3 font-semibold text-white">Add department</button>
              </form>
            </section>
          )}

          <div className="mt-6 space-y-4">
            {departmentRows.map((department) => (
              <section key={department.id} aria-label={`Department ${department.name}`}
                className="rounded-xl border border-line bg-white p-5">
                <h2 className="font-semibold">
                  {department.name}
                  {!department.active && <>{" "}<span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Inactive</span></>}
                </h2>
                {canManageDepartments && (
                  <form action={saveDepartmentAction} className="mt-4 grid gap-4 sm:grid-cols-3">
                    <input type="hidden" name="venue_id" value={venueId} />
                    <input type="hidden" name="department_id" value={department.id} />
                    <label className="text-sm">Department name
                      <input name="name" required maxLength={80} defaultValue={department.name} className={fieldClass} />
                    </label>
                    <StatusSelect active={department.active} label="Department status" />
                    <button type="submit" className="self-end rounded-lg border border-line px-4 py-3 font-semibold">Save department</button>
                  </form>
                )}

                <h3 className="mt-5 text-sm font-semibold text-muted">Job roles</h3>
                <ul className="mt-2 space-y-3">
                  {roleRows.filter((role) => role.department_id === department.id).map((role) => (
                    <li key={role.id} aria-label={`Job role ${role.name}`}>
                      <form action={saveJobRoleAction} className="grid gap-3 sm:grid-cols-3">
                        <input type="hidden" name="venue_id" value={venueId} />
                        <input type="hidden" name="department_id" value={department.id} />
                        <input type="hidden" name="job_role_id" value={role.id} />
                        <label className="text-sm">Role name
                          <input name="name" required maxLength={80} defaultValue={role.name} className={fieldClass} />
                        </label>
                        <StatusSelect active={role.active} label="Role status" />
                        <button type="submit" className="self-end rounded-lg border border-line px-4 py-3 text-sm font-semibold">Save role</button>
                      </form>
                      <form action={setJobRoleAutoRestrictionAction} className="mt-3 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="venue_id" value={venueId} />
                        <input type="hidden" name="job_role_id" value={role.id} />
                        <label className="text-sm">Automatic assignment
                          <select name="restricted" defaultValue={String(role.restrict_auto_assignment)} className={fieldClass}>
                            <option value="false">
                              {role.restrict_manual_assignment ? "Follow manual restriction (qualified only)" : "Any linked worker"}
                            </option>
                            <option value="true">Qualified workers only</option>
                          </select>
                        </label>
                        <button type="submit" className="rounded-lg border border-line px-4 py-3 text-sm font-semibold">Save restriction</button>
                      </form>
                      <form action={setJobRoleManualRestrictionAction} className="mt-3 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="venue_id" value={venueId} />
                        <input type="hidden" name="job_role_id" value={role.id} />
                        <label className="text-sm">Manual assignment
                          <select name="restricted" defaultValue={String(role.restrict_manual_assignment)} className={fieldClass}>
                            <option value="false">Any linked worker</option>
                            <option value="true">Qualified workers only</option>
                          </select>
                        </label>
                        <button type="submit" className="rounded-lg border border-line px-4 py-3 text-sm font-semibold">Save manual restriction</button>
                      </form>
                    </li>
                  ))}
                </ul>
                {department.active && (
                  <form action={saveJobRoleAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="venue_id" value={venueId} />
                    <input type="hidden" name="department_id" value={department.id} />
                    <input type="hidden" name="active" value="true" />
                    <label className="text-sm">New role name
                      <input name="name" required maxLength={80} className={fieldClass} />
                    </label>
                    <button type="submit" className="self-end rounded-lg bg-ocean px-4 py-3 text-sm font-semibold text-white">Add role</button>
                  </form>
                )}
              </section>
            ))}
            {departmentRows.length === 0 && (
              <p className="rounded-lg border border-line bg-white p-4 text-sm text-muted">No departments are available to you at this venue.</p>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
