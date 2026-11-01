import type { SupabaseClient } from "@supabase/supabase-js";

export function parseShiftAcknowledgements(
  data: unknown,
  shiftIds: readonly string[],
): Map<string, string | null> | null {
  if (!Array.isArray(data)) return null;
  const expected = new Set(shiftIds);
  const result = new Map<string, string | null>();
  for (const value of data) {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (typeof row.shift_id !== "string" || !expected.has(row.shift_id) ||
      result.has(row.shift_id) ||
      (row.acknowledged_at !== null && (typeof row.acknowledged_at !== "string" ||
        Number.isNaN(Date.parse(row.acknowledged_at))))) return null;
    result.set(row.shift_id, row.acknowledged_at);
  }
  return result.size === expected.size ? result : null;
}

export async function shiftAcknowledgements(
  supabase: SupabaseClient,
  businessId: string,
  venueId: string,
  shiftIds: readonly string[],
): Promise<Map<string, string | null> | null> {
  if (shiftIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc("list_shift_acknowledgements", {
    p_business_id: businessId,
    p_venue_id: venueId,
    p_shift_ids: [...new Set(shiftIds)],
  });
  const result = error ? null : parseShiftAcknowledgements(data, shiftIds);
  if (!result) {
    console.error("Could not load shift acknowledgement status.", {
      code: error?.code,
      message: error?.message ?? "The server returned incomplete or invalid acknowledgement status.",
    });
  }
  return result;
}
