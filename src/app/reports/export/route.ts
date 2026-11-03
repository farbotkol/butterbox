import {
  BusinessReportValidationError, businessReportCsv, validateBusinessReport,
} from "@/lib/business-report-export";
import { readBusinessReportForm, validBusinessReportOrigin } from "@/lib/business-report-request";
import { isShowcase } from "@/lib/showcase";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function unavailable(status: 400 | 401 | 403 | 404 | 413 | 415 | 422 | 500 | 503): Response {
  const message = {
    400: "Choose one valid business, venue, date and report type, then try again.",
    401: "Sign in before generating a business report.",
    403: "This request was denied. Use the report form while signed in as the business owner.",
    404: "The selected business or venue is unavailable. Check your access and try again.",
    413: "The report request is too large. Return to the report form and try again.",
    415: "The report request is not a supported form. Return to the report form and try again.",
    422: "The report exceeds 10,000 rows. Choose another venue or week.",
    500: "The report could not be generated safely. Refresh the report and try again.",
    503: "Business reports are temporarily unavailable. Try again later.",
  }[status];
  return new Response(message, {
    status, headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSupabaseConfigured()) return unavailable(503);
  if (!validBusinessReportOrigin(request)) return unavailable(403);
  const form = await readBusinessReportForm(request);
  if (!form.ok) return unavailable(form.status);

  const { businessId, venueId, weekStart, reportType } = form.value;
  const workspace = await getWorkspace(venueId, { businessId });
  if (workspace.status === "anonymous") return unavailable(401);
  if (workspace.status !== "ready") {
    if (workspace.status === "error") console.error("Could not verify the business report workspace.", {
      message: workspace.message,
    });
    return unavailable(404);
  }
  if (workspace.membership.role !== "owner") return unavailable(403);

  const result = await workspace.supabase.rpc("generate_business_report_export", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    p_week_start: weekStart, p_report_type: reportType,
  });
  if (result.error) {
    console.error("Could not generate the business report.", {
      code: result.error.code, message: result.error.message,
    });
    if (result.error.message === "Permission denied") return unavailable(403);
    if (result.error.message === "Invalid timesheet week") return unavailable(400);
    if (result.error.message === "Report exceeds the 10000-row limit; choose another venue or week") {
      return unavailable(422);
    }
    return unavailable(500);
  }
  try {
    const report = validateBusinessReport(result.data, {
      businessId: workspace.business.id, venueId: workspace.venue.id, venueName: workspace.venue.name,
      venueTimezone: workspace.venue.timezone, weekStart, reportType,
    });
    const simulationOnly = isShowcase();
    return new Response(businessReportCsv(report, simulationOnly), {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${simulationOnly ? "SIMULATION_ONLY-" : ""}butterbox-${reportType}-${weekStart}-${report.eventId}.csv"`,
      },
    });
  } catch (error) {
    if (!(error instanceof BusinessReportValidationError)) throw error;
    console.error("The business report contained inconsistent data.", { message: error.message });
    return unavailable(500);
  }
}
