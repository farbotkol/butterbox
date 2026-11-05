import type { SupabaseClient } from "@supabase/supabase-js";

export async function unreadRosterNotificationCount(
  supabase: SupabaseClient,
  businessId: string,
  venueId: string,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("unread_roster_notification_count", {
    p_business_id: businessId,
    p_venue_id: venueId,
  });
  if (error || typeof data !== "number" || !Number.isSafeInteger(data) || data < 0) {
    console.error("Could not load unread work notifications.", {
      code: error?.code,
      message: error?.message ?? "The server returned an invalid unread count.",
    });
    return null;
  }
  return data;
}
