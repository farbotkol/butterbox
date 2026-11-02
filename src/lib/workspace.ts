import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isEndedSession } from "@/lib/auth-errors";
import {
  BUSINESS_PREFERENCE_COOKIE, parseBusinessId, selectBusinessMembership,
} from "@/lib/business-selection";
import { createClient } from "@/lib/supabase/server";
export {
  addDays,
  formatDay,
  formatLocalDateTime,
  formatTime,
  getVenueDate,
  getWeekStart,
  localMidnightAsUtc,
} from "@/lib/dates";

export type Membership = {
  business_id: string;
  role: string;
  venue_id: string | null;
  department_id: string | null;
};

export type BusinessMember = {
  user_id: string;
  email: string;
  role: string;
  venue_id: string | null;
  department_id: string | null;
};

export type WorkspaceBusiness = { id: string; name: string; role: string };

export type WorkspaceOptions = {
  // Explicit business from the URL (`business`) or a submitted form (`business_id`).
  businessId?: unknown;
  // Pages only: derive the business from a visible venue filter without requiring it.
  venueHint?: unknown;
  // Pages may fall back to the non-authoritative preference cookie and the chooser.
  page?: boolean;
};

const MEMBERSHIP_LIMIT = 200;

export async function getWorkspace(venueId?: string, options: WorkspaceOptions = {}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError && !isEndedSession(authError)) {
    return { status: "error" as const, message: authError.message };
  }

  if (!user) {
    return { status: "anonymous" as const };
  }

  // Every request re-reads the caller's current memberships; UI selection is never trusted.
  const { data: membershipRows, error: membershipError } = await supabase
    .from("business_memberships")
    .select("business_id, role, venue_id, department_id")
    .eq("user_id", user.id)
    .order("created_at")
    .order("business_id")
    .limit(MEMBERSHIP_LIMIT + 1);

  if (membershipError) {
    return { status: "error" as const, user, message: membershipError.message };
  }
  if ((membershipRows?.length ?? 0) > MEMBERSHIP_LIMIT) {
    return { status: "error" as const, user, message: "Too many business memberships to load safely." };
  }
  const memberships = (membershipRows ?? []) as Membership[];

  const requestedBusiness = parseBusinessId(options.businessId);
  const strictVenue = venueId === undefined ? undefined : parseBusinessId(venueId);
  const hintVenue = strictVenue === undefined && options.page ? parseBusinessId(options.venueHint) : undefined;
  const contextVenueId = strictVenue ?? (typeof hintVenue === "string" ? hintVenue : undefined);
  let contextVenue: { id: string; name: string; timezone: string; business_id: string } | null = null;
  if (strictVenue === null) {
    return { status: "error" as const, user, reason: "business_unavailable" as const,
      message: "The selected venue is unavailable." };
  }
  if (contextVenueId && memberships.length > 0) {
    const { data, error } = await supabase
      .from("venues")
      .select("id, name, timezone, business_id")
      .eq("id", contextVenueId)
      .maybeSingle();
    if (error) return { status: "error" as const, user, message: error.message };
    contextVenue = data;
    if (!contextVenue && strictVenue) {
      return { status: "error" as const, user, reason: "business_unavailable" as const,
        message: "The selected venue is unavailable." };
    }
  }

  const preference = options.page
    ? (await cookies()).get(BUSINESS_PREFERENCE_COOKIE)?.value
    : undefined;
  const selection = selectBusinessMembership({
    memberships,
    requested: [requestedBusiness, contextVenue?.business_id],
    preference,
  });

  if (selection.kind === "none") {
    if (requestedBusiness !== undefined || strictVenue) {
      return { status: "error" as const, user, reason: "business_unavailable" as const,
        message: "The selected business is unavailable." };
    }
    return { status: "needs_setup" as const, user, supabase };
  }
  if (selection.kind === "forbidden") {
    return { status: "error" as const, user, reason: "business_unavailable" as const,
      message: "The selected business is unavailable for this account." };
  }
  if (selection.kind === "choose") {
    if (options.page) redirect("/choose-business");
    return { status: "error" as const, user, reason: "business_required" as const,
      message: "Choose a business before continuing." };
  }

  const membership = selection.membership;
  const venueQuery = supabase
    .from("venues")
    .select("id, name, timezone")
    .eq("business_id", membership.business_id);
  const selectedVenueId = strictVenue ??
    (contextVenue?.business_id === membership.business_id ? contextVenue.id : undefined);
  const selectedVenueQuery = selectedVenueId ? venueQuery.eq("id", selectedVenueId) : venueQuery;
  const [{ data: businessRows, error: businessError }, { data: venues, error: venueError }] =
    await Promise.all([
      supabase
        .from("businesses")
        .select("id, name")
        .in("id", memberships.map((item) => item.business_id))
        .order("name")
        .order("id"),
      selectedVenueQuery.order("created_at").limit(1),
    ]);
  const business = businessRows?.find((item) => item.id === membership.business_id);

  if (businessError || venueError || !business || !venues?.[0]) {
    return {
      status: "error" as const,
      user,
      message: businessError?.message ?? venueError?.message ??
        (venueId ? "The selected venue is unavailable." : "No venue is configured."),
    };
  }

  const roles = new Map(memberships.map((item) => [item.business_id, item.role]));
  const businesses: WorkspaceBusiness[] = (businessRows ?? []).flatMap((item) => {
    const role = roles.get(item.id);
    return role ? [{ id: item.id, name: item.name, role }] : [];
  });

  return {
    status: "ready" as const,
    supabase,
    user,
    membership,
    business: business as { id: string; name: string },
    businesses,
    venue: venues[0] as { id: string; name: string; timezone: string },
  };
}

export async function listBusinessMemberships() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && !isEndedSession(authError)) return { status: "error" as const };
  if (!user) return { status: "anonymous" as const };
  const { data: memberships, error } = await supabase
    .from("business_memberships")
    .select("business_id, role")
    .eq("user_id", user.id)
    .limit(MEMBERSHIP_LIMIT + 1);
  if (error || (memberships?.length ?? 0) > MEMBERSHIP_LIMIT) return { status: "error" as const };
  if (!memberships?.length) return { status: "ready" as const, user, businesses: [] as WorkspaceBusiness[] };
  const { data: businessRows, error: businessError } = await supabase
    .from("businesses")
    .select("id, name")
    .in("id", memberships.map((item) => item.business_id))
    .order("name")
    .order("id");
  if (businessError) return { status: "error" as const };
  const roles = new Map(memberships.map((item) => [item.business_id, item.role as string]));
  return {
    status: "ready" as const,
    user,
    businesses: (businessRows ?? []).flatMap((item) => {
      const role = roles.get(item.id);
      return role ? [{ id: item.id as string, name: item.name as string, role }] : [];
    }),
  };
}
