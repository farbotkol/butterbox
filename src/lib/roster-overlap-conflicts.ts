import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllPages } from "./paginated-rows.ts";

type Overlap = { shift_id: string };
type QueryError = { code: string; message: string };

export async function rosterOverlapConflicts(
  supabase: SupabaseClient,
  businessId: string,
  venueId: string,
  shiftIds: readonly string[],
): Promise<{ data: Overlap[] | null; error: QueryError | null }> {
  const ids = [...new Set(shiftIds)];
  const conflicts: Overlap[] = [];
  for (let offset = 0; offset < ids.length; offset += 1000) {
    const batch = ids.slice(offset, offset + 1000);
    const expected = new Set(batch);
    const result = await readAllPages<Overlap>((from, to) => supabase.rpc("list_roster_overlap_conflicts", {
      p_business_id: businessId,
      p_venue_id: venueId,
      p_shift_ids: batch,
    }, { count: "exact" }).order("shift_id").range(from, to),
    (row) => row && typeof row.shift_id === "string" ? row.shift_id : "");
    if (result.error) return result;
    if (!result.data || result.data.some((row) =>
      !row || typeof row.shift_id !== "string" || !expected.has(row.shift_id))) {
      return {
        data: null,
        error: { code: "invalid_result", message: "The server returned an invalid overlap result." },
      };
    }
    conflicts.push(...result.data);
  }
  return { data: conflicts, error: null };
}
