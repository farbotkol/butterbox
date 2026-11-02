import { randomUUID } from "node:crypto";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Pencil,
  Plus,
  Send,
  Trash2,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  confirmShiftOfferClaimAction,
  deleteShiftAction,
  publishRosterAction,
  sendShiftOfferAction,
  setShiftAcknowledgementRequirementAction,
  withdrawShiftOfferAction,
} from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { CopyRosterForm } from "@/components/copy-roster-form";
import { ShiftEditor } from "@/components/shift-editor";
import {
  availabilityForDate,
  formatWallTime,
  type AvailabilityException,
  type AvailabilityInterval,
} from "@/lib/availability";
import { readAllPages } from "@/lib/paginated-rows";
import { groupRosterEmployees } from "@/lib/roster-groups";
import { rosterOverlapConflicts } from "@/lib/roster-overlap-conflicts";
import { collapsedRosterDepartments, rosterViewHref, toggleRosterDepartment } from "@/lib/roster-view";
import { shiftAcknowledgements } from "@/lib/shift-acknowledgements";
import { shiftConflicts, type ShiftConflict } from "@/lib/shift-conflicts";
import {
  defaultOfferExpiry,
  hasShiftStarted,
  ineligibilityLabels,
  loadRosterShiftOffers,
  MAX_OFFERABLE_SHIFTS,
  responseLabels,
  type ManagedShiftOffer,
  type OfferCandidate,
} from "@/lib/shift-offers";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  addDays,
  formatDay,
  formatLocalDateTime,
  formatTime,
  getVenueDate,
  getWeekStart,
  localMidnightAsUtc,
  getWorkspace,
} from "@/lib/workspace";

type RosterPageProps = {
  searchParams: Promise<{ business?: string;
    week?: string;
    venue?: string;
    department?: string;
    collapsed?: string | string[];
    error?: string;
    saved?: string;
    deleted?: string;
    published?: string;
    copied?: string;
    ack_requirement?: string;
    edit?: string;
    created?: string;
    offer?: string;
  }>;
};

type PublicationReachability = {
  publication_id: string;
  inaccessible_count: number;
};
type OwnDepartment = { employee_id: string; department_id: string; name: string; active: boolean };

const errorMessages: Record<string, string> = {
  invalid: "Check the shift details and try again.",
  overlap: "That employee already has a shift during this time.",
  permission: "You don't have permission to change that department's roster.",
  save: "We couldn't save that shift. Check the date, employee and role.",
  delete: "We couldn't delete that shift. Published shifts cannot be deleted.",
  publish: "We couldn't publish this roster. Check your permissions and try again.",
  "publish-unavailable": "This roster has unavailable workers. Review the affected shifts before publishing.",
  "publish-overlap": "This roster has overlapping shifts. Review the affected shifts before publishing.",
  "publish-duration": "This roster has shifts longer than 24 hours. Review the affected shifts before publishing.",
  "publish-busy": "The roster is being changed. Wait for the other change to finish, then try publishing again.",
  "publish-unknown": "The server could not confirm the publication result. Reload the roster before trying again.",
  "publish-acknowledgement": "Assign the open shift that requires acknowledgement, or remove its requirement before publishing.",
  acknowledgement: "We couldn't update the acknowledgement requirement. Check the draft, employee and your permissions, then try again.",
  inactive: "That department or job role is inactive. Choose an active one for new shifts.",
  "no-eligible": "No eligible worker is available. Check availability, leave, qualifications and overlapping shifts.",
  offer: "We couldn't update that shift offer. Check your permissions and try again.",
  "offer-audience": "Choose at least one eligible team member to offer the shift to.",
  "offer-expiry": "Choose an offer expiry in the future and before the shift starts.",
  "offer-ineligible": "A selected team member is no longer eligible. Review the list and try again.",
  "offer-exists": "This shift already has an open offer.",
  "offer-shift": "Only upcoming published open shifts can be offered.",
  "offer-filled": "This shift has already been filled by another confirmation.",
  "offer-closed": "This offer is no longer open, or the shift has already started or been filled.",
  "offer-claim": "Only a team member who claimed the shift can be confirmed.",
  "offer-claim-unavailable": "That team member is no longer available or eligible, so they were not confirmed. The shift is still open.",
  "offer-retry": "The roster changed while confirming. Reload and try again.",
  "offer-unknown": "The server could not confirm the result. Reload the roster before trying again.",
};

const offerMessages: Record<string, string> = {
  sent: "Shift offer sent. The shift stays open until you confirm a claim.",
  withdrawn: "Shift offer withdrawn.",
  confirmed: "Claim confirmed and the shift assigned.",
};

type OfferFormContext = { week: string; venueId: string; filterDepartment?: string; collapsed: string[] };

function OfferContextFields({ context }: { context: OfferFormContext }) {
  return (
    <>
      <input type="hidden" name="venue_id" value={context.venueId} />
      <input type="hidden" name="week" value={context.week} />
      {context.filterDepartment && <input type="hidden" name="filter_department" value={context.filterDepartment} />}
      <CollapsedFields departments={context.collapsed} />
    </>
  );
}

function ShiftOfferPanel({ shiftId, label, startsAt, timezone, offer, candidates, employeeNames, context }: {
  shiftId: string; label: string; startsAt: string; timezone: string;
  offer?: ManagedShiftOffer; candidates?: OfferCandidate[];
  employeeNames: Map<string, string>; context: OfferFormContext;
}) {
  const formatStamp = (value: string) => new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
  if (offer) {
    return (
      <section aria-label={`Offer for ${label}`} className="mt-2 rounded-lg border border-amber-200 bg-white p-3 text-xs">
        <p className="font-semibold text-amber-900">
          Offered to {offer.recipients.length} · sent <time dateTime={offer.created_at}>{formatStamp(offer.created_at)}</time>
          {" · "}expires <time dateTime={offer.expires_at}>{formatStamp(offer.expires_at)}</time>
        </p>
        <ul className="mt-2 space-y-1.5">
          {offer.recipients.map((recipient) => {
            const name = employeeNames.get(recipient.employee_id) ?? "Team member";
            return (
              <li key={recipient.employee_id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-ink">{name}</span>{" — "}
                  {recipient.outcome === "unavailable" ? "Not confirmed: unavailable" : responseLabels[recipient.response]}
                  {recipient.responded_at && (
                    <> · <time dateTime={recipient.responded_at}>{formatStamp(recipient.responded_at)}</time></>
                  )}
                </span>
                {recipient.response === "accepted" && !recipient.outcome && (
                  <form action={confirmShiftOfferClaimAction}>
                    <OfferContextFields context={context} />
                    <input type="hidden" name="offer_id" value={offer.id} />
                    <input type="hidden" name="employee_id" value={recipient.employee_id} />
                    <button type="submit" aria-label={`Confirm ${name} for ${label}`}
                      className="rounded bg-ocean px-2 py-1 font-semibold text-white hover:bg-ocean/90">
                      Confirm
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <form action={withdrawShiftOfferAction} className="mt-2">
          <OfferContextFields context={context} />
          <input type="hidden" name="offer_id" value={offer.id} />
          <button type="submit" aria-label={`Withdraw offer for ${label}`}
            className="rounded border border-amber-300 px-2 py-1 font-semibold text-amber-900 hover:bg-amber-50">
            Withdraw offer
          </button>
        </form>
      </section>
    );
  }
  if (!candidates) return null;
  const eligible = candidates.filter((candidate) => !candidate.ineligibility);
  const expiryId = `offer-expiry-${shiftId}`;
  return (
    <details className="mt-2 rounded-lg border border-amber-200 bg-white text-xs">
      <summary className="cursor-pointer px-3 py-2 font-semibold text-amber-900">Offer shift</summary>
      <form action={sendShiftOfferAction} className="space-y-2 px-3 pb-3">
        <OfferContextFields context={context} />
        <input type="hidden" name="shift_id" value={shiftId} />
        <fieldset>
          <legend className="font-semibold text-ink">Invite eligible team members for {label}</legend>
          {candidates.length === 0 && <p className="mt-1 text-muted">No active team members are linked to this department.</p>}
          <ul className="mt-1 space-y-1">
            {candidates.map((candidate) => (
              <li key={candidate.employee_id}>
                <label className={`flex items-center gap-2 ${candidate.ineligibility ? "text-muted" : "text-ink"}`}>
                  <input type="checkbox" name="employee_id" value={candidate.employee_id}
                    disabled={Boolean(candidate.ineligibility)} defaultChecked={!candidate.ineligibility} />
                  <span>{candidate.employee_name}</span>
                  {candidate.ineligibility && <span>· {ineligibilityLabels[candidate.ineligibility]}</span>}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div>
          <label htmlFor={expiryId} className="block font-semibold text-ink">Offer expires</label>
          <input id={expiryId} type="datetime-local" name="expires_at" required
            defaultValue={formatLocalDateTime(defaultOfferExpiry(startsAt), timezone)}
            max={formatLocalDateTime(startsAt, timezone)}
            className="mt-1 rounded border border-line px-2 py-1" />
        </div>
        <button type="submit" disabled={eligible.length === 0}
          className="rounded-lg bg-ocean px-3 py-2 font-semibold text-white hover:bg-ocean/90 disabled:opacity-50">
          Send offer
        </button>
      </form>
    </details>
  );
}

const conflictMessages: Record<ShiftConflict, string> = {
  "invalid-duration": "Shift exceeds 24 hours; review availability manually",
  "overlapping-shift": "Overlaps another shift",
  "blocked-date": "Date blocked",
  "approved-leave": "Approved leave",
  "recurring-availability": "Outside submitted availability",
};

function ConflictNotice({ label, conflicts, open = false }: {
  label: string; conflicts: ShiftConflict[]; open?: boolean;
}) {
  if (conflicts.length === 0) return null;
  return (
    <div role="note" aria-label={label}
      className="mt-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-1 text-[10px] font-medium text-rose-900">
      <span className="block font-semibold">Conflict</span>
      {conflicts.map((conflict) => (
        <span key={conflict} className="block">
          {open && conflict === "invalid-duration" ? "Shift exceeds 24 hours" : conflictMessages[conflict]}
        </span>
      ))}
    </div>
  );
}

function isManager(role: string) {
  return ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"].includes(role);
}

function weekInput(date: string, hour: number) {
  return `${date}T${String(hour).padStart(2, "0")}:00`;
}

function CollapsedFields({ departments }: { departments: readonly string[] }) {
  return departments.map((departmentId) => (
    <input key={departmentId} type="hidden" name="collapsed" value={departmentId} />
  ));
}

function AcknowledgementRequirementControl({
  shiftId, departmentId, required, label, week, venueId, filterDepartment, collapsed,
}: {
  shiftId: string; departmentId: string; required: boolean; label: string;
  week: string; venueId: string; filterDepartment?: string; collapsed: string[];
}) {
  return (
    <form action={setShiftAcknowledgementRequirementAction} className="mt-1">
      <input type="hidden" name="shift_id" value={shiftId} />
      <input type="hidden" name="department_id" value={departmentId} />
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="required" value={String(!required)} />
      {filterDepartment && <input type="hidden" name="filter_department" value={filterDepartment} />}
      <CollapsedFields departments={collapsed} />
      <button type="submit"
        aria-label={`${required ? "Remove acknowledgement requirement for" : "Require acknowledgement for"} ${label}`}
        className="rounded border border-ocean/30 bg-white px-2 py-1 text-[10px] font-semibold text-ocean hover:bg-soft-sea">
        {required ? "Remove requirement" : "Require acknowledgement"}
      </button>
    </form>
  );
}

export default async function RosterPage({ searchParams }: RosterPageProps) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the roster workspace.", { message: workspace.message });
    return (
      <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">Roster unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-muted">
          We couldn&apos;t load the selected venue. Check your access and connection, then try again.
        </p>
        <Link href="/roster" className="mt-4 inline-block text-sm font-semibold text-ocean">
          Return to an available roster
        </Link>
      </main>
    );
  }

  const week = getWeekStart(params.week, workspace.venue.timezone);
  const weekEnd = addDays(week, 7);
  const startAt = localMidnightAsUtc(week, workspace.venue.timezone);
  const endAt = localMidnightAsUtc(weekEnd, workspace.venue.timezone);
  const [venueResult, departmentResult, employeeResult, jobRoleResult, linkResult, ownDepartmentsResult, patternResult, intervalResult, shiftResult] = await Promise.all([
    readAllPages((from, to) => workspace.supabase.from("venues")
      .select("id, name, block_manual_unavailability, block_publish_unavailability, block_publish_overlap, block_publish_long_shift", { count: "exact" })
      .eq("business_id", workspace.business.id).order("created_at").order("id").range(from, to),
    (venue) => venue.id),
    readAllPages((from, to) => workspace.supabase.from("departments")
      .select("id, name, active", { count: "exact" }).eq("venue_id", workspace.venue.id)
      .order("name").order("id").range(from, to), (department) => department.id),
    readAllPages((from, to) => workspace.supabase.from("employees")
      .select("id, name, department_id, role_title, active", { count: "exact" })
      .eq("venue_id", workspace.venue.id).order("name").order("id").range(from, to), (employee) => employee.id),
    readAllPages((from, to) => workspace.supabase.from("job_roles")
      .select("id, name, department_id", { count: "exact" }).eq("venue_id", workspace.venue.id)
      .eq("active", true).order("name").order("id").range(from, to), (role) => role.id),
    readAllPages((from, to) => workspace.supabase.from("employee_departments")
      .select("employee_id, department_id", { count: "exact" }).eq("business_id", workspace.business.id)
      .order("employee_id").order("department_id").range(from, to),
    (link) => `${link.employee_id}:${link.department_id}`),
    readAllPages<OwnDepartment>((from, to) => workspace.supabase.rpc("list_own_linked_roster_departments", {
      p_business_id: workspace.business.id,
      p_venue_id: workspace.venue.id,
    }, { count: "exact" }).order("employee_id").order("department_id").range(from, to),
    (department) => `${department.employee_id}:${department.department_id}`),
    readAllPages((from, to) => workspace.supabase.from("employee_availability_patterns")
      .select("employee_id", { count: "exact" })
      .eq("venue_id", workspace.venue.id).order("employee_id").range(from, to),
      (pattern) => pattern.employee_id),
    readAllPages((from, to) => workspace.supabase.from("employee_availability_intervals")
      .select("id, employee_id, weekday, start_minute, end_minute", { count: "exact" })
      .eq("venue_id", workspace.venue.id).order("id").range(from, to),
      (interval) => interval.id),
    readAllPages((from, to) => workspace.supabase.from("shifts")
      .select("id, department_id, employee_id, role_title, starts_at, ends_at, break_minutes, is_published, requires_acknowledgement", { count: "exact" })
      .eq("venue_id", workspace.venue.id).eq("status", "scheduled")
      .gte("starts_at", startAt).lt("starts_at", endAt).order("starts_at").order("id").range(from, to),
    (shift) => shift.id),
  ]);
  const exceptionDates = [
    week,
    addDays(weekEnd, -1),
    ...(shiftResult.data ?? [])
      .filter((shift) => shift.employee_id &&
        new Date(shift.ends_at).valueOf() - new Date(shift.starts_at).valueOf() <= 24 * 60 * 60 * 1000)
      .map((shift) => getVenueDate(shift.ends_at, workspace.venue.timezone)),
  ].sort();
  // Include overnight shifts and clock changes that cross local date boundaries.
  const [exceptionResult, overlapResult] = await Promise.all([
    readAllPages((from, to) => workspace.supabase
      .from("employee_availability_exceptions")
      .select("id, employee_id, starts_on, ends_on, exception_type, status", { count: "exact" })
      .eq("venue_id", workspace.venue.id)
      .lte("starts_on", addDays(exceptionDates[exceptionDates.length - 1], 2))
      .gte("ends_on", addDays(exceptionDates[0], -2))
      .order("id").range(from, to), (exception) => exception.id),
    rosterOverlapConflicts(workspace.supabase, workspace.business.id, workspace.venue.id,
      (shiftResult.data ?? []).map((shift) => shift.id)),
  ]);
  const departmentRows = departmentResult.data;
  const employeeRows = employeeResult.data;
  const jobRoleRows = jobRoleResult.data;
  const ownDepartments = ownDepartmentsResult.data ?? [];
  const linkRows = [
    ...(linkResult.data ?? []),
    ...ownDepartments.map(({ employee_id, department_id }) => ({ employee_id, department_id })),
  ];
  const departmentMap = new Map((departmentRows ?? []).map((department) => [department.id, department]));
  for (const department of ownDepartments) {
    if (!departmentMap.has(department.department_id)) {
      departmentMap.set(department.department_id, {
        id: department.department_id,
        name: department.name,
        active: department.active,
      });
    }
  }
  const departments = [...departmentMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const defaultDepartment =
    departments.find((department) => department.id === workspace.membership.department_id)?.id ??
    departments[0]?.id;
  const selectedDepartment =
    params.department === "all"
      ? undefined
      : departments.find((department) => department.id === params.department)?.id ??
        defaultDepartment;

  const loadError = venueResult.error || departmentResult.error || employeeResult.error || jobRoleResult.error ||
    linkResult.error || ownDepartmentsResult.error || patternResult.error || intervalResult.error ||
    exceptionResult.error || overlapResult.error || shiftResult.error;
  const currentVenue = venueResult.data?.find((venue) => venue.id === workspace.venue.id);
  if (loadError || !currentVenue) {
    console.error("Could not load the roster.", loadError
      ? { code: loadError.code, message: loadError.message }
      : { message: "The selected venue is no longer available." });
    return (
      <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length} email={workspace.user.email ?? ""}
        role={workspace.membership.role} venueName={workspace.venue.name}>
        <h1 className="text-3xl font-semibold">Weekly roster</h1>
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-800">
          We couldn&apos;t load the roster. Try again before making changes.
        </p>
      </AppShell>
    );
  }
  const shifts = shiftResult.data;

  const visibleShifts = (shifts ?? []).filter(
    (shift) => !selectedDepartment || shift.department_id === selectedDepartment,
  );
  const patternEmployees = new Set((patternResult.data ?? []).map((pattern) => pattern.employee_id));
  const employeeIntervals = new Map<string, AvailabilityInterval[]>();
  for (const interval of intervalResult.data ?? []) {
    const intervals = employeeIntervals.get(interval.employee_id) ?? [];
    intervals.push(interval);
    employeeIntervals.set(interval.employee_id, intervals);
  }
  const employeeExceptions = new Map<string, AvailabilityException[]>();
  for (const exception of exceptionResult.data ?? []) {
    const exceptions = employeeExceptions.get(exception.employee_id) ?? [];
    exceptions.push(exception);
    employeeExceptions.set(exception.employee_id, exceptions);
  }
  const availabilityIntervals = (employeeId: string) => patternEmployees.has(employeeId)
    ? employeeIntervals.get(employeeId) ?? [] : null;
  const overlapRows: { shift_id: string }[] = overlapResult.data ?? [];
  const overlappingShifts = new Set(overlapRows.map((conflict) => conflict.shift_id));
  const conflictsByShift = new Map<string, ShiftConflict[]>();
  for (const shift of visibleShifts) {
    const conflicts = shiftConflicts({
      startsAt: shift.starts_at,
      endsAt: shift.ends_at,
      timezone: workspace.venue.timezone,
      intervals: shift.employee_id ? availabilityIntervals(shift.employee_id) : null,
      exceptions: shift.employee_id ? employeeExceptions.get(shift.employee_id) ?? [] : [],
    });
    if (overlappingShifts.has(shift.id)) conflicts.unshift("overlapping-shift");
    conflictsByShift.set(shift.id, conflicts);
  }
  const employees = (employeeRows ?? []).filter(
    (employee) =>
      employee.active && (!selectedDepartment ||
        (linkRows ?? []).some(
          (link) => link.employee_id === employee.id && link.department_id === selectedDepartment,
        )),
  );
  const rosterGroups = groupRosterEmployees(
    departments.filter((department) => !selectedDepartment || department.id === selectedDepartment),
    employeeRows ?? [],
    linkRows ?? [],
    visibleShifts,
  );
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const canManage = isManager(workspace.membership.role);
  const canManageDepartment = (departmentId: string) => {
    const { role, venue_id: venueId, department_id: departmentIdScope } = workspace.membership;
    if (["owner", "admin"].includes(role)) return true;
    if (venueId && venueId !== workspace.venue.id) return false;
    return role === "general_manager" ||
      (["foh_manager", "boh_manager", "department_manager"].includes(role) &&
        departmentIdScope === departmentId);
  };
  const canManageSelectedDepartment = selectedDepartment
    ? canManageDepartment(selectedDepartment) : false;
  const acknowledgementStatuses = await shiftAcknowledgements(
    workspace.supabase, workspace.business.id, workspace.venue.id,
    visibleShifts.filter((shift) => shift.is_published && shift.requires_acknowledgement)
      .map((shift) => shift.id),
  );
  const [publicationHistory, notificationReachability] = canManageSelectedDepartment && selectedDepartment
    ? await Promise.all([
        readAllPages((from, to) => workspace.supabase.from("roster_publications")
          .select("id, version, published_at, venue_timezone, new_shift_count, shift_count, notifications_recorded", { count: "exact" })
          .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id)
          .eq("department_id", selectedDepartment).eq("week_start", week)
          .order("version", { ascending: false }).range(from, to), (publication) => publication.id),
        readAllPages<PublicationReachability>((from, to) => workspace.supabase.rpc(
          "list_roster_notification_reachability",
          {
            p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
            p_department_id: selectedDepartment, p_week_start: week,
          },
          { count: "exact" },
        ).order("publication_id").range(from, to), (result) => result.publication_id),
      ])
    : [null, null];
  if (publicationHistory?.error) {
    console.error("Could not load roster publication history.", {
      code: publicationHistory.error.code,
      message: publicationHistory.error.message,
    });
  }
  const reachabilityByPublication = new Map(
    (notificationReachability?.data ?? []).map((result) => [result.publication_id, result.inaccessible_count]),
  );
  const incompleteReachability = publicationHistory?.data?.some((publication) => {
    const count = reachabilityByPublication.get(publication.id);
    return count === undefined || !Number.isSafeInteger(count) || count < 0;
  }) ?? false;
  const reachabilityError = notificationReachability?.error || incompleteReachability;
  if (reachabilityError) {
    console.error("Could not load roster notification reachability.", {
      code: notificationReachability?.error?.code,
      message: notificationReachability?.error?.message ?? "The result did not cover every publication.",
    });
  }
  const selectedDepartmentActive =
    departments.find((department) => department.id === selectedDepartment)?.active ?? false;
  const offerableShiftIds = visibleShifts.filter((shift) => !shift.employee_id && shift.is_published &&
    !hasShiftStarted(shift.starts_at) && canManageDepartment(shift.department_id) &&
    departments.find((department) => department.id === shift.department_id)?.active)
    .map((shift) => shift.id).slice(0, MAX_OFFERABLE_SHIFTS);
  const rosterOffers = await loadRosterShiftOffers(
    workspace.supabase, workspace.business.id, workspace.venue.id, offerableShiftIds,
  );
  const employeeNames = new Map((employeeRows ?? []).map((employee) => [employee.id, employee.name]));
  const editingShift = params.edit && selectedDepartment && canManageSelectedDepartment && selectedDepartmentActive
    ? visibleShifts.find((shift) =>
        shift.id === params.edit && shift.department_id === selectedDepartment && !shift.is_published)
    : undefined;
  const unavailableEmployee = editingShift?.employee_id &&
    !employees.some((employee) => employee.id === editingShift.employee_id)
    ? employeeRows?.find((employee) => employee.id === editingShift.employee_id) ?? {
        id: editingShift.employee_id,
        name: "Former team member",
        role_title: "Profile unavailable",
      }
    : undefined;
  const roleSuggestions = (jobRoleRows ?? []).filter(
    (role) => role.department_id === selectedDepartment,
  );
  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const previousWeek = addDays(week, -7);
  const nextWeek = addDays(week, 7);
  const filterDepartment = selectedDepartment ?? (params.department === "all" ? "all" : undefined);
  const collapsed = collapsedRosterDepartments(params.collapsed, departments.map((department) => department.id));
  const weekLabel = `${formatDay(week)} – ${formatDay(addDays(week, 6))}`;
  const copiedCount = params.copied && /^\d+$/.test(params.copied) &&
    Number.isSafeInteger(Number(params.copied)) ? Number(params.copied) : undefined;

  return (
    <AppShell
      businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length}
      email={workspace.user.email ?? ""}
      role={workspace.membership.role}
      venueName={workspace.venue.name}
    >
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-muted">Rostering</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-[34px]">
            Weekly roster
          </h1>
          <p className="mt-2 text-muted">
            Build a balanced week for your FOH and BOH teams.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-2 sm:justify-start">
          <Link
            href={rosterViewHref(previousWeek, filterDepartment, collapsed, workspace.venue.id)}
            aria-label="Previous week"
            className="rounded-lg p-2 text-muted hover:bg-soft-sea"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div className="min-w-[155px] text-center text-sm font-semibold">
            {weekLabel}
          </div>
          <Link
            href={rosterViewHref(nextWeek, filterDepartment, collapsed, workspace.venue.id)}
            aria-label="Next week"
            className="rounded-lg p-2 text-muted hover:bg-soft-sea"
          >
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {(venueResult.data ?? []).length > 1 && (
          <form action="/roster" className="flex items-center gap-2">
            <input type="hidden" name="week" value={week} />
            <label htmlFor="venue-filter" className="text-sm text-muted">Venue</label>
            <select id="venue-filter" name="venue" defaultValue={workspace.venue.id}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-ocean">
              {venueResult.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium">
              Switch venue
            </button>
          </form>
        )}
        <form action="/roster" className="flex items-center gap-2">
          <input type="hidden" name="week" value={week} />
          <input type="hidden" name="venue" value={workspace.venue.id} />
          <CollapsedFields departments={collapsed} />
          <label htmlFor="department-filter" className="text-sm text-muted">
            Department
          </label>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-ocean"
            defaultValue={selectedDepartment ?? (departments.length > 1 ? "all" : "")}
            id="department-filter"
            name="department"
          >
            {departments.length > 1 && <option value="all">All departments</option>}
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}{department.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium">
            Apply filter
          </button>
        </form>
        <div className="flex items-center gap-2 text-sm text-muted">
          <UsersRound size={17} aria-hidden="true" />
          <span>
            {visibleShifts.filter((shift) => shift.employee_id).length} assigned
            <span className="mx-2 text-muted/40">·</span>
            {visibleShifts.filter((shift) => !shift.employee_id).length} open
          </span>
        </div>
      </div>

      {(errorMessage || params.saved || params.deleted || params.published || params.ack_requirement || copiedCount !== undefined ||
        (params.offer && offerMessages[params.offer])) && (
        <p
          role={errorMessage ? "alert" : "status"}
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            errorMessage
              ? "bg-red-50 text-red-800"
              : "bg-soft-sea text-ocean"
          }`}
        >
          {errorMessage ??
            (copiedCount !== undefined
              ? copiedCount === 0 ? "No shifts were found in the selected source week."
                : `${copiedCount} ${copiedCount === 1 ? "shift was" : "shifts were"} copied into this week's draft roster.`
              : params.offer && offerMessages[params.offer]
              ? offerMessages[params.offer]
              : params.ack_requirement
              ? "Acknowledgement requirement updated."
              : params.saved
              ? params.saved === "edited" ? "Draft shift updated." : "Shift saved to the draft roster."
              : params.deleted
                ? "Draft shift removed."
                : params.published === "none"
                  ? "There are no draft shifts to publish."
                : `${selectedDepartment ? departments.find((item) => item.id === selectedDepartment)?.name : "Roster"} roster published.`)}
        </p>
      )}

      {params.edit && !editingShift && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          This draft shift is unavailable or you cannot edit it.
        </p>
      )}

      {!acknowledgementStatuses && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          We couldn&apos;t load acknowledgement status. Reload the roster before following up with employees.
        </p>
      )}

      {canManage && selectedDepartment && !canManageSelectedDepartment && (
        <p role="note" className="mt-5 rounded-xl border border-line bg-white p-4 text-sm text-muted">
          You can view your published shifts in this department, but you cannot change its roster.
        </p>
      )}

      {canManageSelectedDepartment && selectedDepartment && !selectedDepartmentActive && (
        <p role="note" className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This department is inactive. Existing shifts are kept, but new shifts can&apos;t be added.
        </p>
      )}

      {canManageSelectedDepartment && selectedDepartment && selectedDepartmentActive && (
        <section className="mt-5 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-soft-sea text-ocean">
                <Plus size={19} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold">{editingShift ? "Edit draft shift" : "Add a shift"}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {workspace.venue.name} · {departments.find((department) => department.id === selectedDepartment)?.name}.
                  {" "}Times use {workspace.venue.timezone.replaceAll("_", " ")} local time.
                </p>
              </div>
            </div>
            <form action={publishRosterAction}>
              <input name="week" type="hidden" value={week} />
              <input name="venue_id" type="hidden" value={workspace.venue.id} />
              <CollapsedFields departments={collapsed} />
              <input
                name="department_id"
                type="hidden"
                value={selectedDepartment}
              />
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-sea-glass/50 px-4 py-2.5 text-sm font-semibold text-ocean transition hover:bg-soft-sea"
                type="submit"
              >
                <Send size={16} aria-hidden="true" />
                Publish this department
              </button>
            </form>
          </div>
          <ShiftEditor key={`${workspace.venue.id}:${selectedDepartment}:${week}:${editingShift ? `edit:${editingShift.id}` : `new:${params.created ?? ""}`}`}
            week={week} venueId={workspace.venue.id} departmentId={selectedDepartment}
            collapsed={collapsed} employees={employees} unavailableEmployee={unavailableEmployee}
            roleSuggestions={roleSuggestions.map((role) => role.name)} shiftId={editingShift?.id}
            cancelHref={rosterViewHref(week, selectedDepartment, collapsed, workspace.venue.id)}
            initialValues={{
              role: editingShift?.role_title ?? "",
              employee: editingShift?.employee_id ?? "",
              start: editingShift ? formatLocalDateTime(editingShift.starts_at, workspace.venue.timezone) : weekInput(week, 8),
              end: editingShift ? formatLocalDateTime(editingShift.ends_at, workspace.venue.timezone) : weekInput(week, 16),
              break: String(editingShift?.break_minutes ?? 30),
            }} />
        </section>
      )}

      {canManageSelectedDepartment && selectedDepartment && selectedDepartmentActive && (
        <section aria-labelledby="copy-roster-heading" className="mt-5 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 id="copy-roster-heading" className="font-semibold">Copy a previous week</h2>
          <p className="mt-2 text-sm text-muted">
            Copy this department&apos;s scheduled shifts into {weekLabel} as editable private drafts.
            Existing shifts are not replaced. Availability, approved leave, qualifications and overlaps
            are rechecked and block the whole copy if any assigned shift conflicts, even when manual
            assignments normally warn. In-app updates are recorded only when you publish; unlinked
            employees see them once they accept a staff invitation or their accounts are linked.
          </p>
          <CopyRosterForm key={`${workspace.venue.id}:${selectedDepartment}:${week}`}
            week={week} previousWeek={previousWeek} venueId={workspace.venue.id}
            departmentId={selectedDepartment} collapsed={collapsed} requestId={randomUUID()} />
        </section>
      )}

      {canManage && !selectedDepartment && departments.length > 1 && (
        <p className="mt-5 rounded-lg border border-line bg-white px-4 py-3 text-sm text-muted">
          Choose a department to add shifts or publish its roster.
        </p>
      )}

      {!canManage && (
        <p className="mt-5 rounded-xl border border-line bg-white p-4 text-sm text-muted">
          This roster is view-only. Contact your manager if you need a change.
        </p>
      )}

      {canManageSelectedDepartment && publicationHistory && (
        <section aria-labelledby="publication-history-heading"
          className="mt-5 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 id="publication-history-heading" className="font-semibold">Publication history</h2>
          {publicationHistory.error ? (
            <p role="alert" className="mt-2 text-sm text-red-800">
              We couldn&apos;t load publication history. Reload the roster to try again.
            </p>
          ) : publicationHistory.data?.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No recorded publications for this department and week.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {publicationHistory.data?.map((publication) => {
                const inaccessible = reachabilityByPublication.get(publication.id);
                return (
                  <li key={publication.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                    <p>
                      <span className="font-semibold">Version {publication.version}</span>
                      {" · "}
                      {new Intl.DateTimeFormat("en-AU", {
                        timeZone: publication.venue_timezone, day: "numeric", month: "short", year: "numeric",
                        hour: "numeric", minute: "2-digit",
                      }).format(new Date(publication.published_at))}
                      {" · "}
                      {publication.new_shift_count} newly published, {publication.shift_count} total shifts
                    </p>
                    {!publication.notifications_recorded ? (
                      <p className="mt-1 text-xs text-muted">
                        In-app updates were not recorded for this earlier publication.
                      </p>
                    ) : !reachabilityError && inaccessible !== undefined && inaccessible > 0 ? (
                      <p className="mt-1 text-xs font-medium text-amber-900">
                        {inaccessible} affected employee {inaccessible === 1 ? "profile cannot" : "profiles cannot"}
                        {" "}currently see this update. They will see it after accepting a staff invitation or
                        {" "}having their account linked; check their venue and department access.{" "}
                        <Link className="underline"
                          href={`/people?venue=${workspace.venue.id}&department=${selectedDepartment}&business=${workspace.business.id}`}>
                          Invite staff from People
                        </Link>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
          {reachabilityError && (
            <p role="alert" className="mt-3 text-sm text-red-800">
              We couldn&apos;t verify who can access these updates. Reload the roster to try again.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            Versions are recorded when drafts are published. Rosters published before history was introduced
            may not appear.
          </p>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-[0_4px_18px_rgba(18,63,74,0.04)]">
        <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Team roster</h2>
            <p className="mt-1 text-xs text-muted">
              Shifts by team member and day · times shown in venue local time
            </p>
            <p className="mt-1 text-xs text-muted">
              {!currentVenue.block_manual_unavailability && !currentVenue.block_publish_unavailability
                ? "Availability warnings do not block manual assignment or publication."
                : `Manual assignment ${currentVenue.block_manual_unavailability ? "blocks" : "warns about"} unavailable workers; publication ${currentVenue.block_publish_unavailability ? "blocks" : "warns about"} unavailable workers.`}
              {" "}Automatic selection checks submitted availability, date blocks and approved leave.
              New overlaps for the same profile at this venue are rejected. Linked profiles at other venues
              are checked for automatic assignment and displayed as overlap warnings.
              {" "}Publication {currentVenue.block_publish_overlap ? "blocks" : "warns about"} overlapping shifts and
              {" "}{currentVenue.block_publish_long_shift ? "blocks" : "warns about"} shifts longer than 24 hours.
              {currentVenue.block_publish_unavailability && " Assigned shifts longer than 24 hours cannot be verified for availability."}
              {" "}Managers can require acknowledgement for an assigned draft before publishing.
            </p>
          </div>
          <CalendarDays size={18} className="text-muted" aria-hidden="true" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="bg-[#eff7f6]">
                <th className="sticky left-0 z-10 min-w-48 border-b border-r border-line bg-[#eff7f6] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ocean/75">
                  Team member
                </th>
                {days.map((date) => {
                  const dayShifts = visibleShifts.filter(
                    (shift) => getVenueDate(shift.starts_at, workspace.venue.timezone) === date,
                  );
                  return (
                    <th key={date} className="min-w-28 border-b border-line px-3 py-3 align-top">
                      <span className="block text-xs font-semibold text-ink">{formatDay(date)}</span>
                      <span className="mt-1 block text-[11px] font-normal text-muted">
                        {dayShifts.length} {dayShifts.length === 1 ? "shift" : "shifts"}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            {rosterGroups.map(({ department, employees: groupEmployees }) => (
              <tbody key={department.id} aria-label={`Department ${department.name}`}>
                <tr className="bg-cloud">
                  <th colSpan={8} scope="rowgroup" className="border-b border-line px-4 py-2 text-sm font-semibold text-ocean">
                    <form action="/roster">
                      <input type="hidden" name="week" value={week} />
                      <input type="hidden" name="venue" value={workspace.venue.id} />
                      {filterDepartment && <input type="hidden" name="department" value={filterDepartment} />}
                      <CollapsedFields departments={toggleRosterDepartment(collapsed, department.id)} />
                      <button type="submit"
                        aria-label={`${collapsed.includes(department.id) ? "Expand" : "Collapse"} ${department.name}`}
                        aria-expanded={!collapsed.includes(department.id)}
                        aria-controls={groupEmployees.map((employee) => `roster-row-${department.id}-${employee.id}`).join(" ")}
                        className="inline-flex items-center gap-2 rounded py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean">
                        <ChevronDown size={16} aria-hidden="true"
                          className={collapsed.includes(department.id) ? "-rotate-90" : ""} />
                        {department.name}{department.active ? "" : " (inactive)"}
                      </button>
                    </form>
                  </th>
                </tr>
                {groupEmployees.map((employee) => (
                <tr key={employee.id} id={`roster-row-${department.id}-${employee.id}`}
                  hidden={collapsed.includes(department.id)} className="border-b border-line/70 last:border-0">
                  <th className="sticky left-0 z-10 border-r border-line bg-white px-4 py-3 align-top">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {employee.name}{!employee.active && !employee.profileUnavailable ? " (Archived)" : ""}
                    </span>
                    <span className="mt-1 block truncate text-xs font-normal text-muted">
                      {employee.role_title}
                    </span>
                  </th>
                  {days.map((date) => {
                    const employeeShifts = visibleShifts.filter(
                      (shift) =>
                        shift.employee_id === employee.id &&
                        shift.department_id === department.id &&
                        getVenueDate(shift.starts_at, workspace.venue.timezone) === date,
                    );
                    const availability = availabilityForDate(
                      date,
                      availabilityIntervals(employee.id),
                      employeeExceptions.get(employee.id) ?? [],
                    );
                    const unavailable = availability.unavailable;
                    return (
                      <td key={date} className="border-r border-line/60 px-2 py-2 align-top last:border-r-0">
                        <div className="space-y-1.5">
                          {availability.pendingLeave && (
                            <span aria-label={`Pending leave ${employee.name} ${date} in ${department.name}`}
                              className="block rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900">
                              Leave pending
                            </span>
                          )}
                          {availability.approvedLeave && (
                            <span aria-label={`Approved leave ${employee.name} ${date} in ${department.name}`}
                              className="block rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold text-teal-900">
                              Approved leave
                            </span>
                          )}
                          {availability.blocked && (
                            <span aria-label={`Date blocked ${employee.name} ${date} in ${department.name}`}
                              className="block rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-900">
                              Date blocked
                            </span>
                          )}
                          {unavailable === null ? (
                            <span className="block rounded-md bg-slate-50 px-2 py-1 text-[10px] text-muted">
                              {employee.profileUnavailable ? "Availability unavailable" : "Availability not submitted"}
                            </span>
                          ) : unavailable.length > 0 && (
                            <div aria-label={`Unavailable ${employee.name} ${date} in ${department.name}`}
                              className="rounded-md border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] text-rose-800">
                              {unavailable.map((period) => (
                                <span key={`${period.start}-${period.end}`} className="block">
                                  {period.start === 0 && period.end === 1440
                                    ? "Unavailable all day"
                                    : `Unavailable ${formatWallTime(period.start)}–${formatWallTime(period.end)}`}
                                </span>
                              ))}
                            </div>
                          )}
                          {employeeShifts.map((shift) => (
                            <article
                              key={shift.id}
                              className={`rounded-md border px-2 py-2 ${shift.is_published ? "border-teal-200 bg-[#eaf7f4]" : "border-sky-200 bg-[#eef6fb]"}`}
                            >
                              <p className="text-[11px] font-semibold leading-4 text-ink">
                                {formatTime(shift.starts_at, workspace.venue.timezone)} –{" "}
                                {formatTime(shift.ends_at, workspace.venue.timezone)}
                              </p>
                              <p className="mt-1 truncate text-[10px] text-muted">
                                {shift.role_title}
                              </p>
                              {!selectedDepartment && (
                                <p className="truncate text-[10px] font-medium text-ocean">
                                  {departments.find((department) => department.id === shift.department_id)?.name}
                                </p>
                              )}
                              <ConflictNotice
                                label={`Scheduling conflict for ${employee.name}, ${shift.role_title}, ${date} ${formatTime(shift.starts_at, workspace.venue.timezone)}`}
                                conflicts={conflictsByShift.get(shift.id) ?? []} />
                              {shift.requires_acknowledgement && (
                                <p className="mt-1 text-[10px] font-semibold text-ocean">
                                  {!shift.is_published ? "Acknowledgement required"
                                    : !acknowledgementStatuses ? "Acknowledgement status unavailable"
                                      : acknowledgementStatuses.get(shift.id) === null
                                        ? "Awaiting acknowledgement" : "Acknowledged"}
                                </p>
                              )}
                              {canManageDepartment(shift.department_id) && !shift.is_published &&
                                departments.find((item) => item.id === shift.department_id)?.active && (
                                <AcknowledgementRequirementControl shiftId={shift.id} departmentId={shift.department_id}
                                  required={shift.requires_acknowledgement}
                                  label={`${employee.name}, ${shift.role_title}, ${date} ${formatTime(shift.starts_at, workspace.venue.timezone)}`}
                                  week={week} venueId={workspace.venue.id} filterDepartment={filterDepartment}
                                  collapsed={collapsed} />
                              )}
                              <div className="mt-1 flex items-center justify-between gap-1">
                                <span className={`text-[9px] font-semibold ${shift.is_published ? "text-teal-800" : "text-sky-800"}`}>
                                  {shift.is_published ? "Published" : "Draft"}
                                </span>
                                {canManageDepartment(shift.department_id) && !shift.is_published &&
                                  departments.find((item) => item.id === shift.department_id)?.active && (
                                  <Link href={`${rosterViewHref(week, shift.department_id, collapsed, workspace.venue.id)}&edit=${shift.id}`}
                                    aria-label={`Edit ${employee.name} shift`} title="Edit draft shift"
                                    className="rounded p-1 text-muted/70 hover:bg-white hover:text-ocean">
                                    <Pencil size={12} aria-hidden="true" />
                                  </Link>
                                )}
                                {canManageDepartment(shift.department_id) && !shift.is_published && (
                                  <form action={deleteShiftAction}>
                                    <input name="shift_id" type="hidden" value={shift.id} />
                                    <input name="week" type="hidden" value={week} />
                                    <input name="venue_id" type="hidden" value={workspace.venue.id} />
                                    {filterDepartment && <input name="filter_department" type="hidden" value={filterDepartment} />}
                                    <CollapsedFields departments={collapsed} />
                                    <button
                                      className="rounded p-1 text-muted/70 hover:bg-white hover:text-red-700"
                                      aria-label={`Delete ${employee.name} shift`}
                                      title="Delete draft shift"
                                      type="submit"
                                    >
                                      <Trash2 size={12} aria-hidden="true" />
                                    </button>
                                  </form>
                                )}
                              </div>
                            </article>
                          ))}
                          {employeeShifts.length === 0 && unavailable?.length === 0 && (
                            <span className="block px-2 py-3 text-center text-[11px] text-muted/50">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                ))}
              </tbody>
            ))}
            {rosterGroups.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted">
                    Add active team members to build a weekly roster.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-amber-200 bg-[#fffaf0] shadow-[0_4px_18px_rgba(18,63,74,0.035)]" id="open-shifts">
        <div className="flex items-center justify-between border-b border-amber-100 bg-[#fff7e8] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Open shifts</h2>
            <p className="mt-1 text-xs text-muted">
              Unassigned coverage for this week
            </p>
          </div>
          <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {visibleShifts.filter((shift) => !shift.employee_id).length} to fill
          </span>
        </div>
        {visibleShifts.some((shift) => !shift.employee_id) ? (
          <div className="divide-y divide-line/70">
            {visibleShifts
              .filter((shift) => !shift.employee_id)
              .map((shift) => (
                <div key={shift.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold">{shift.role_title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {departments.find((department) => department.id === shift.department_id)?.name ?? "Team"}
                      {" · "}{formatDay(getVenueDate(shift.starts_at, workspace.venue.timezone))}
                      {" · "}{formatTime(shift.starts_at, workspace.venue.timezone)} –{" "}
                      {formatTime(shift.ends_at, workspace.venue.timezone)}
                    </p>
                    <ConflictNotice open
                      label={`Scheduling conflict for open shift ${shift.role_title}, ${getVenueDate(shift.starts_at, workspace.venue.timezone)}`}
                      conflicts={conflictsByShift.get(shift.id) ?? []} />
                    {shift.requires_acknowledgement && (
                      <p className="mt-1 text-xs font-semibold text-amber-900">
                        Acknowledgement required. Assign a worker or remove the requirement before publishing.
                      </p>
                    )}
                    {offerableShiftIds.includes(shift.id) && (rosterOffers ? (
                      <ShiftOfferPanel shiftId={shift.id}
                        label={`open shift ${shift.role_title}, ${getVenueDate(shift.starts_at, workspace.venue.timezone)}`}
                        startsAt={shift.starts_at} timezone={workspace.venue.timezone}
                        offer={rosterOffers.offers.get(shift.id)} candidates={rosterOffers.candidates.get(shift.id)}
                        employeeNames={employeeNames}
                        context={{ week, venueId: workspace.venue.id, filterDepartment, collapsed }} />
                    ) : (
                      <p role="alert" className="mt-1 text-xs font-semibold text-red-800">Shift offer status unavailable.</p>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-amber-800">Needs cover</span>
                    {shift.requires_acknowledgement && canManageDepartment(shift.department_id) && !shift.is_published &&
                      departments.find((item) => item.id === shift.department_id)?.active && (
                      <AcknowledgementRequirementControl shiftId={shift.id} departmentId={shift.department_id}
                        required label={`open shift ${shift.role_title}, ${getVenueDate(shift.starts_at, workspace.venue.timezone)}`}
                        week={week} venueId={workspace.venue.id} filterDepartment={filterDepartment}
                        collapsed={collapsed} />
                    )}
                    {canManageDepartment(shift.department_id) && !shift.is_published &&
                      departments.find((item) => item.id === shift.department_id)?.active && (
                      <Link href={`${rosterViewHref(week, shift.department_id, collapsed, workspace.venue.id)}&edit=${shift.id}`}
                        className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-900">
                        Edit open shift
                      </Link>
                    )}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="px-5 py-5 text-sm text-muted">No unassigned shifts this week.</p>
        )}
      </section>
    </AppShell>
  );
}
