import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  saveRosterPublicationModeAction,
  saveVenueRosterWeekAction,
  saveVenueConflictPolicyAction,
  saveVenueGeofenceAction,
  setVenueClockGeofenceAction,
} from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import type { ConflictPolicyValues } from "@/lib/conflict-policy";
import { parseRosterWeekEvents, parseRosterWeekSettings, rosterWeekdays } from "@/lib/roster-planning";
import { parseRosterPublicationMode, parseRosterPublicationModeEvents } from "@/lib/roster-review";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { withBusiness } from "@/lib/business-selection";
import { getWorkspace } from "@/lib/workspace";

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

const errorMessages: Record<string, string> = {
  duplicate: "That name is already used here. Choose a different name.",
  permission: "You don't have permission to make that change.",
  inactive: "Reactivate the department before saving an active role.",
  filter: "That venue is not available to you.",
  geofence: "Enter latitude from -90 to 90, longitude from -180 to 180 (up to six decimal places), and a whole-number radius from 1 to 10,000 metres; or clear all three.",
  "location-required": "Configure a venue location before enabling verification, and disable verification before removing it.",
  "location-policy": "Select whether clock location verification is enabled.",
  "conflict-policy": "Select a valid option for each roster conflict rule and try again.",
  "roster-mode": "We couldn't save the roster publication setting. Choose a valid option and try again.",
  "roster-week": "We couldn't confirm the roster planning week setting. Reload and check it before trying again.",
  "roster-week-stale": "The roster planning week setting changed. Reload and review it before saving again.",
  "roster-week-transition": "The planning transition has already started. Wait until the scheduled start date before changing it.",
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
  const [
    geofenceHistory, locationPolicyHistory, conflictHistory, rosterModeHistory,
    rosterWeekSettings, rosterWeekHistory,
  ] = await Promise.all([
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
    canManageGeofence
      ? workspace.supabase.rpc("get_venue_roster_week_settings", {
        p_business_id: workspace.business.id, p_venue_id: venueId,
      })
      : Promise.resolve({ data: [], error: null }),
    canManageGeofence
      ? workspace.supabase.from("venue_roster_week_events")
        .select("id, actor_id, revision, action, previous_weekday, weekday, effective_on, supersedes, recorded_at")
        .eq("business_id", workspace.business.id).eq("venue_id", venueId)
        .order("revision", { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const loadError = venues.error;
  if (loadError) console.error("Could not load venue settings.", { code: loadError.code, message: loadError.message });
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
  const rosterWeek = parseRosterWeekSettings(rosterWeekSettings.data);
  const rosterWeekEvents = parseRosterWeekEvents(rosterWeekHistory.data);
  if (canManageGeofence && (!rosterMode || rosterModeHistory.error || !rosterModeEvents)) {
    console.error("Could not load roster publication settings or history.", {
      code: rosterModeHistory.error?.code,
      message: rosterModeHistory.error?.message ?? "The server returned invalid publication settings or history.",
    });
  }
  if (canManageGeofence && (!rosterWeek || rosterWeekSettings.error || rosterWeekHistory.error || !rosterWeekEvents)) {
    console.error("Could not load roster planning settings or history.", {
      code: rosterWeekSettings.error?.code ?? rosterWeekHistory.error?.code,
      message: rosterWeekSettings.error?.message ?? rosterWeekHistory.error?.message
        ?? "The server returned invalid planning settings or history.",
    });
  }
  const geofenceEvents: GeofenceEvent[] = geofenceHistory.data ?? [];
  const locationPolicyEvents: ClockLocationPolicyEvent[] = locationPolicyHistory.data ?? [];
  const conflictEvents: ConflictPolicyEvent[] = conflictHistory.data ?? [];

  return (
    <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length} venueId={venueId} venueName={selectedVenue?.name ?? workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <h1 className="text-3xl font-semibold">Venue settings</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Configure the selected venue&apos;s planning, publication, conflict and clock-location settings.
        These settings can be changed by the business owner.
      </p>
      <Link href={`/settings/departments?${new URLSearchParams({ business: workspace.business.id, venue: venueId })}`}
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Open departments and roles
      </Link>

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
                : params.saved === "roster-week" ? "Roster planning week setting saved. Check its effective date below."
                : params.saved === "roster-week-unchanged" ? "The roster planning week setting was already selected."
                : "Department saved."}
        </p>
      )}

      {loadError ? (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">We could not load venue settings. Try again.</p>
      ) : (
        <>
          {canManageGeofence && selectedVenue && (
            <section aria-label="Roster planning week settings" className="mt-6 rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">Roster planning week</h2>
              <p id="roster-week-help" className="mt-3 text-sm leading-6 text-muted">
                The planning view uses this venue&apos;s local dates. Changes take effect after the current
                planning week; the transition may have fewer than seven days so no dates are skipped.
                Once a transition period begins, its pending change cannot be cancelled or replaced
                until the new start takes effect.
                The editing roster, publication versions, timesheets and payroll periods keep their
                existing Monday-based boundaries. Past records are not changed.
              </p>
              {rosterWeek ? (
                <>
                  <p className="mt-3 text-sm">
                    Current planning start: <strong>{rosterWeekdays[rosterWeek.current_weekday - 1]}</strong>.
                    {rosterWeek.pending_weekday && rosterWeek.pending_effective_on && (
                      <> Scheduled: <strong>{rosterWeekdays[rosterWeek.pending_weekday - 1]}</strong>
                        {" "}from <time dateTime={rosterWeek.pending_effective_on}>{rosterWeek.pending_effective_on}</time>.</>
                    )}
                  </p>
                  <form action={saveVenueRosterWeekAction} aria-label="Configure roster planning week"
                    aria-describedby="roster-week-help" className="mt-4 grid gap-4 sm:grid-cols-2">
                    <input type="hidden" name="business_id" value={workspace.business.id} />
                    <input type="hidden" name="venue_id" value={venueId} />
                    <input type="hidden" name="revision" value={rosterWeek.revision} />
                    <input type="hidden" name="pending_id" value={rosterWeek.pending_id ?? ""} />
                    <input type="hidden" name="request_id" value={randomUUID()} />
                    <label className="text-sm">Planning week starts on
                      <select name="weekday" defaultValue={String(rosterWeek.pending_weekday ?? rosterWeek.current_weekday)}
                        disabled={rosterWeek.pending_locked} className={fieldClass}>
                        {rosterWeekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}
                      </select>
                    </label>
                    <button type="submit" disabled={rosterWeek.pending_locked}
                      className="self-end justify-self-start rounded-lg bg-ocean px-4 py-3 font-semibold text-white disabled:opacity-50">
                      Save planning week
                    </button>
                  </form>
                  {rosterWeek.pending_locked ? (
                    <p role="status" className="mt-2 text-sm text-muted">
                      This transition has started. Wait for the scheduled date before changing the planning start again.
                    </p>
                  ) : rosterWeek.pending_weekday && (
                    <p className="mt-2 text-sm text-muted">To cancel the pending change, select the current planning start and save.</p>
                  )}
                  <Link href={`/roster/planning?${new URLSearchParams({ business: workspace.business.id, venue: venueId })}`}
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
                    Open venue planning view
                  </Link>
                </>
              ) : (
                <p role="alert" className="mt-3 text-sm text-red-800">
                  We couldn&apos;t load the planning week setting. Reload before making changes.
                </p>
              )}
              <h3 className="mt-5 text-sm font-semibold">Recent planning week changes</h3>
              {rosterWeekHistory.error || !rosterWeekEvents ? (
                <p role="alert" className="mt-2 text-sm text-red-800">We couldn&apos;t load planning week history.</p>
              ) : rosterWeekEvents.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No planning week changes yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {rosterWeekEvents.map((event) => (
                    <li key={event.id} className="break-words">
                      <time dateTime={event.recorded_at}>{new Date(event.recorded_at).toISOString()}</time>
                      {" | "}User {event.actor_id}{" | "}
                      {event.action === "cancelled" ? "Cancelled pending change" : "Scheduled change"}
                      {": "}{rosterWeekdays[event.previous_weekday - 1]} to {rosterWeekdays[event.weekday - 1]}
                      {" | "}effective <time dateTime={event.effective_on}>{event.effective_on}</time>
                    </li>
                  ))}
                </ul>
              )}
              {rosterWeekEvents?.length === 10 && <p className="mt-2 text-xs text-muted">Showing the 10 most recent changes.</p>}
            </section>
          )}
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
          {!canManageGeofence && <p className="mt-6 text-sm text-muted">
            Only the business owner can change these venue settings.
          </p>}
        </>
      )}
    </AppShell>
  );
}
