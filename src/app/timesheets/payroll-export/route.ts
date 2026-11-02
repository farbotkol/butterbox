import { PayrollRecordValidationError } from "@/lib/canonical-payroll";
import {
  genericPayrollCsv, isPayrollUuid, validateGenericPayrollBatch, validateGenericPayrollEntries,
} from "@/lib/generic-payroll-exports";
import { readAllPages } from "@/lib/paginated-rows";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function unavailable(status: number): Response {
  return new Response(
    status === 401 ? "Sign in before downloading payroll." :
      "The payroll batch is unavailable or has changed. Refresh the timesheet and check your access.",
    { status, headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" } },
  );
}

export async function GET(request: Request): Promise<Response> {
  if (!isSupabaseConfigured()) return unavailable(503);
  const search = new URL(request.url).searchParams;
  const venues = search.getAll("venue");
  const batches = search.getAll("batch");
  if (venues.length !== 1 || batches.length !== 1 ||
    !isPayrollUuid(venues[0]) || !isPayrollUuid(batches[0])) return unavailable(400);

  const workspace = await getWorkspace(venues[0]);
  if (workspace.status === "anonymous") return unavailable(401);
  if (workspace.status !== "ready") return unavailable(404);
  const args = {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_batch_id: batches[0],
  };
  const metadata = await workspace.supabase.rpc("get_generic_payroll_batch", args);
  if (metadata.error) {
    console.error("Could not verify the payroll export batch.", {
      code: metadata.error.code, message: metadata.error.message,
    });
    return unavailable(metadata.error.message === "Permission denied" ||
      metadata.error.message === "Payroll batch unavailable or permission denied" ? 404 : 409);
  }
  try {
    const batch = validateGenericPayrollBatch(metadata.data, batches[0]);
    const result = await readAllPages<{ session_id: string; employee_name: string; record: unknown }>((from, to) =>
      workspace.supabase.rpc("list_generic_payroll_batch_entries", args, { count: "exact" })
        .order("session_id").range(from, to),
    (row) => row && typeof row.session_id === "string" ? row.session_id.toLowerCase() : "");
    if (result.error) {
      console.error("Could not load the complete payroll export.", {
        code: result.error.code, message: result.error.message,
      });
      return unavailable(409);
    }
    const entries = validateGenericPayrollEntries(result.data, {
      businessId: workspace.business.id, venueId: workspace.venue.id, weekStart: batch.weekStart,
      finalisationId: batch.finalisationId, sessionCount: batch.sessionCount,
    });
    const recheck = await workspace.supabase.rpc("get_generic_payroll_batch", args);
    if (recheck.error) {
      console.error("Payroll export changed while it was loading.", {
        code: recheck.error.code, message: recheck.error.message,
      });
      return unavailable(409);
    }
    const checkedBatch = validateGenericPayrollBatch(recheck.data, batches[0]);
    if (checkedBatch.weekStart !== batch.weekStart || checkedBatch.finalisationId !== batch.finalisationId ||
      checkedBatch.sessionCount !== batch.sessionCount || checkedBatch.createdAt !== batch.createdAt) {
      throw new PayrollRecordValidationError("batch: metadata changed while loading");
    }
    return new Response(genericPayrollCsv(batch.id, entries), {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="butterbox-hours-${batch.weekStart}-${batch.id}.csv"`,
      },
    });
  } catch (error) {
    if (!(error instanceof PayrollRecordValidationError)) throw error;
    console.error("The payroll export contained inconsistent records.", { message: error.message });
    return unavailable(500);
  }
}
