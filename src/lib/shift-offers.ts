import type { SupabaseClient } from "@supabase/supabase-js";
import { formatLocalDateTime } from "./dates.ts";
import { readAllPages } from "./paginated-rows.ts";

export type OfferIneligibility = "venue" | "department" | "role" | "availability" | "conflict" | "shift_unavailable";
export type OfferCandidate = { employee_id: string; employee_name: string; ineligibility: OfferIneligibility | null };
export type OfferResponse = "pending" | "accepted" | "declined";
export type OfferOutcome = "confirmed" | "not_selected" | "unavailable" | "closed";
export type MyShiftOffer = {
  offer_id: string; shift_id: string; department_name: string; role_title: string;
  starts_at: string; ends_at: string; break_minutes: number; expires_at: string;
  offer_status: "open" | "filled" | "withdrawn"; response: OfferResponse;
  responded_at: string | null; outcome: OfferOutcome | null; can_respond: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INELIGIBILITY = new Set(["venue", "department", "role", "availability", "conflict", "shift_unavailable"]);
const RESPONSES = new Set(["pending", "accepted", "declined"]);
const OUTCOMES = new Set(["confirmed", "not_selected", "unavailable", "closed"]);
const STATUSES = new Set(["open", "filled", "withdrawn"]);

const isTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

export const ineligibilityLabels: Record<OfferIneligibility, string> = {
  venue: "Not active at this venue",
  department: "Not in this department",
  role: "Not qualified for this role",
  availability: "Unavailable",
  conflict: "Already rostered at this time",
  shift_unavailable: "Shift unavailable",
};

export const responseLabels: Record<OfferResponse, string> = {
  pending: "Awaiting response",
  accepted: "Claimed",
  declined: "Declined",
};

export const outcomeLabels: Record<OfferOutcome, string> = {
  confirmed: "Confirmed — this shift is yours",
  not_selected: "Filled by another team member",
  unavailable: "Not confirmed — you are no longer available",
  closed: "Offer closed",
};

export function parseOfferCandidates(data: unknown): OfferCandidate[] | null {
  if (!Array.isArray(data)) return null;
  const seen = new Set<string>();
  const result: OfferCandidate[] = [];
  for (const value of data) {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (typeof row.employee_id !== "string" || !UUID.test(row.employee_id) || seen.has(row.employee_id) ||
      typeof row.employee_name !== "string" ||
      (row.ineligibility !== null && (typeof row.ineligibility !== "string" || !INELIGIBILITY.has(row.ineligibility)))) {
      return null;
    }
    seen.add(row.employee_id);
    result.push({
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      ineligibility: row.ineligibility as OfferIneligibility | null,
    });
  }
  return result;
}

export function parseMyShiftOffers(data: unknown): MyShiftOffer[] | null {
  if (!Array.isArray(data)) return null;
  const result: MyShiftOffer[] = [];
  for (const value of data) {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (typeof row.offer_id !== "string" || !UUID.test(row.offer_id) ||
      typeof row.shift_id !== "string" || !UUID.test(row.shift_id) ||
      typeof row.department_name !== "string" || typeof row.role_title !== "string" ||
      !isTime(row.starts_at) || !isTime(row.ends_at) || !isTime(row.expires_at) ||
      !Number.isInteger(row.break_minutes) ||
      typeof row.offer_status !== "string" || !STATUSES.has(row.offer_status) ||
      typeof row.response !== "string" || !RESPONSES.has(row.response) ||
      (row.responded_at !== null && !isTime(row.responded_at)) ||
      (row.outcome !== null && (typeof row.outcome !== "string" || !OUTCOMES.has(row.outcome))) ||
      typeof row.can_respond !== "boolean") {
      return null;
    }
    result.push(row as unknown as MyShiftOffer);
  }
  return result;
}

/** Converts a venue-local `YYYY-MM-DDTHH:mm` value to UTC, rejecting DST gaps. */
export function localDateTimeAsUtc(value: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(target)) return null;
  let guess = target;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const local = formatLocalDateTime(new Date(guess).toISOString(), timezone);
      const represented = Date.parse(`${local}:00Z`);
      guess += target - represented;
    }
  } catch {
    return null;
  }
  const iso = new Date(guess).toISOString();
  return formatLocalDateTime(iso, timezone) === value ? iso : null;
}

export function hasShiftStarted(startsAt: string, now = Date.now()) {
  return Date.parse(startsAt) <= now;
}

/** Defaults to 24 hours from now, but never later than one hour before the shift. */
export function defaultOfferExpiry(startsAt: string, now = Date.now()) {
  const start = Date.parse(startsAt);
  const latest = start - 60 * 60 * 1000;
  const preferred = now + 24 * 60 * 60 * 1000;
  const chosen = Math.min(preferred, latest > now ? latest : start - 60 * 1000);
  return new Date(Math.floor(chosen / 60000) * 60000).toISOString();
}

export function offerFailureCode(message: string | undefined) {
  switch (message) {
    case "Employee is not eligible for this offer": return "offer-ineligible";
    case "This shift already has an open offer": return "offer-exists";
    case "Only upcoming published open shifts can be offered": return "offer-shift";
    case "Offer expiry must be in the future and before the shift starts": return "offer-expiry";
    case "Invalid offer audience": return "offer-audience";
    case "Shift offer has already been filled": return "offer-filled";
    case "Shift offer is no longer open":
    case "Shift is no longer open":
    case "Shift has already started": return "offer-closed";
    case "Only an accepted claim can be confirmed": return "offer-claim";
    case "Roster changed while scheduling; please try again": return "offer-retry";
    default: return "offer";
  }
}

export function responseFailureCode(message: string | undefined) {
  switch (message) {
    case "Shift offer has expired": return "offer-expired";
    case "Shift offer already answered": return "offer-answered";
    case "Shift offer is no longer available": return "offer-unavailable";
    case "You are no longer eligible for this shift": return "offer-ineligible";
    default: return "offer";
  }
}

export type ManagedOfferRecipient = {
  employee_id: string; response: OfferResponse; responded_at: string | null; outcome: OfferOutcome | null;
};
export type ManagedShiftOffer = { id: string; created_at: string; expires_at: string; recipients: ManagedOfferRecipient[] };
export type RosterShiftOffers = {
  offers: Map<string, ManagedShiftOffer>;
  candidates: Map<string, OfferCandidate[]>;
};

export const MAX_OFFERABLE_SHIFTS = 50;

export async function loadRosterShiftOffers(
  supabase: SupabaseClient,
  businessId: string,
  venueId: string,
  shiftIds: readonly string[],
): Promise<RosterShiftOffers | null> {
  const ids = [...new Set(shiftIds)].slice(0, MAX_OFFERABLE_SHIFTS);
  const result: RosterShiftOffers = { offers: new Map(), candidates: new Map() };
  if (ids.length === 0) return result;
  const offerResult = await supabase.from("shift_offers")
    .select("id, shift_id, created_at, expires_at")
    .eq("business_id", businessId).eq("venue_id", venueId).eq("status", "open").in("shift_id", ids);
  if (offerResult.error || !Array.isArray(offerResult.data)) {
    console.error("Could not load open shift offers.", { code: offerResult.error?.code, message: offerResult.error?.message });
    return null;
  }
  const offerIds = offerResult.data.map((offer) => offer.id as string);
  const recipientResult = offerIds.length
    ? await supabase.from("shift_offer_recipients")
      .select("offer_id, employee_id, response, responded_at, outcome")
      .in("offer_id", offerIds).order("invited_at").order("employee_id")
    : { data: [], error: null };
  if (recipientResult.error || !Array.isArray(recipientResult.data)) {
    console.error("Could not load shift offer recipients.", {
      code: recipientResult.error?.code, message: recipientResult.error?.message,
    });
    return null;
  }
  for (const offer of offerResult.data) {
    result.offers.set(offer.shift_id as string, {
      id: offer.id as string,
      created_at: offer.created_at as string,
      expires_at: offer.expires_at as string,
      recipients: recipientResult.data.filter((row) => row.offer_id === offer.id) as ManagedOfferRecipient[],
    });
  }
  const unoffered = ids.filter((id) => !result.offers.has(id));
  const candidateResults = await Promise.all(unoffered.map((shiftId) =>
    readAllPages<OfferCandidate>((from, to) => supabase.rpc("list_shift_offer_candidates", {
      p_business_id: businessId, p_venue_id: venueId, p_shift_id: shiftId,
    }, { count: "exact" }).order("employee_name").order("employee_id").range(from, to),
    (candidate) => candidate.employee_id),
  ));
  for (const [index, response] of candidateResults.entries()) {
    const candidates = response.error ? null : parseOfferCandidates(response.data);
    if (!candidates) {
      console.error("Could not load shift offer candidates.", {
        code: response.error?.code,
        message: response.error?.message ?? "The server returned an invalid candidate snapshot.",
      });
      return null;
    }
    result.candidates.set(unoffered[index], candidates);
  }
  return result;
}
