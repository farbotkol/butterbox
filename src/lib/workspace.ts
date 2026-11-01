import { isEndedSession } from "@/lib/auth-errors";
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

export async function getWorkspace(venueId?: string) {
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

  const { data: memberships, error: membershipError } = await supabase
    .from("business_memberships")
    .select("business_id, role, venue_id, department_id")
    .eq("user_id", user.id)
    .limit(2);

  if (membershipError) {
    return { status: "error" as const, user, message: membershipError.message };
  }

  if (memberships && memberships.length > 1) {
    return {
      status: "error" as const,
      reason: "multiple_memberships" as const,
      user,
      message: "Business switching is not yet available for this account.",
    };
  }

  const membership = memberships?.[0] as Membership | undefined;
  if (!membership) {
    return { status: "needs_setup" as const, user, supabase };
  }

  const venueQuery = supabase
    .from("venues")
    .select("id, name, timezone")
    .eq("business_id", membership.business_id);
  const selectedVenueQuery = venueId ? venueQuery.eq("id", venueId) : venueQuery;
  const [{ data: business, error: businessError }, { data: venues, error: venueError }] =
    await Promise.all([
      supabase
        .from("businesses")
        .select("id, name")
        .eq("id", membership.business_id)
        .single(),
      selectedVenueQuery.order("created_at").limit(1),
    ]);

  if (businessError || venueError || !business || !venues?.[0]) {
    return {
      status: "error" as const,
      user,
      message: businessError?.message ?? venueError?.message ??
        (venueId ? "The selected venue is unavailable." : "No venue is configured."),
    };
  }

  return {
    status: "ready" as const,
    supabase,
    user,
    membership,
    business,
    venue: venues[0] as { id: string; name: string; timezone: string },
  };
}
