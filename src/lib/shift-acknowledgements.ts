import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllPages } from "./paginated-rows.ts";

type Acknowledgement = { shift_id: string; acknowledged_at: string | null };

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
  const ids = [...new Set(shiftIds)];
  const statuses = new Map<string, string | null>();
  for (let offset = 0; offset < ids.length; offset += 1000) {
    const batch = ids.slice(offset, offset + 1000);
    const { data, error } = await readAllPages<Acknowledgement>((from, to) => supabase.rpc("list_shift_acknowledgements", {
      p_business_id: businessId,
      p_venue_id: venueId,
      p_shift_ids: batch,
    }, { count: "exact" }).order("shift_id").range(from, to),
    (row) => row && typeof row.shift_id === "string" ? row.shift_id : "");
    const result = error ? null : parseShiftAcknowledgements(data, batch);
    if (!result) {
      console.error("Could not load shift acknowledgement status.", {
        code: error?.code,
        message: error?.message ?? "The server returned incomplete or invalid acknowledgement status.",
      });
      return null;
    }
    for (const [shiftId, acknowledgedAt] of result) statuses.set(shiftId, acknowledgedAt);
  }
  return statuses;
}
