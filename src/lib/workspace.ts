import { isEndedSession } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";
export {
  addDays,
  formatDay,
  formatTime,
  getVenueDate,
  getWeekStart,
  localMidnightAsUtc,
} from "@/lib/dates";

export type Membership = {
  business_id: string;
  role: string;
  department_id: string | null;
};

export async function getWorkspace() {
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
    .select("business_id, role, department_id")
    .eq("user_id", user.id)
    .limit(1);

  if (membershipError) {
    return { status: "error" as const, user, message: membershipError.message };
  }

  const membership = memberships?.[0] as Membership | undefined;
  if (!membership) {
    return { status: "needs_setup" as const, user, supabase };
  }

  const [{ data: business, error: businessError }, { data: venues }] =
    await Promise.all([
      supabase
        .from("businesses")
        .select("id, name")
        .eq("id", membership.business_id)
        .single(),
      supabase
        .from("venues")
        .select("id, name, timezone")
        .eq("business_id", membership.business_id)
        .order("created_at")
        .limit(1),
    ]);

  if (businessError || !business || !venues?.[0]) {
    return {
      status: "error" as const,
      user,
      message: businessError?.message ?? "No venue is configured.",
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
