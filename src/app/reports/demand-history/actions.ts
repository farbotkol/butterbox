"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseBusinessId } from "@/lib/business-selection";
import {
  DemandImportError, demandHistoryHref, MAX_DEMAND_FILE_BYTES, parseDemandCsv, parseDemandImportForm,
} from "@/lib/demand-history";
import { getWorkspace } from "@/lib/workspace";

export type DemandImportState = { error?: string };

export async function importDemandHistoryAction(
  _previous: DemandImportState, formData: FormData,
): Promise<DemandImportState> {
  const input = parseDemandImportForm(formData);
  if (!input) {
    console.error("Invalid demand history import details.");
    return { error: "Check the selected venue, history type, source name and CSV file. Nothing was imported." };
  }
  const workspace = await getWorkspace(input.venueId, { businessId: input.businessId });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready" || workspace.membership.role !== "owner") {
    console.error("Demand history import access denied.");
    return { error: "Only a business owner can import history for an accessible venue. Nothing was imported." };
  }
  if (input.timezone !== workspace.venue.timezone) {
    console.error("Demand history venue timezone changed.");
    return { error: "The venue timezone changed. Reload the page and check the timestamps before importing." };
  }
  if (input.file.size === 0 || input.file.size > MAX_DEMAND_FILE_BYTES) {
    return { error: "Choose a non-empty CSV file no larger than 500,000 bytes. Nothing was imported." };
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await input.file.arrayBuffer();
  } catch (error) {
    console.error("Could not read demand history file.", { message: error instanceof Error ? error.message : "Unknown error" });
    return { error: "The file could not be read. Select it again and retry; nothing was imported." };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return { error: "The file must be encoded as UTF-8. Nothing was imported." };
  }
  let rows;
  try {
    rows = parseDemandCsv(text, input.eventType, input.timezone);
  } catch (error) {
    if (!(error instanceof DemandImportError)) throw error;
    return { error: `${error.message} Nothing was imported.` };
  }
  const { data, error } = await workspace.supabase.rpc("import_demand_history", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    p_event_type: input.eventType, p_source_name: input.sourceName,
    p_venue_timezone: input.timezone, p_request_id: input.requestId, p_rows: rows,
  });
  const importId = parseBusinessId(data);
  if (error || !importId) {
    console.error("Could not confirm demand history import.", {
      code: error?.code, message: error?.message ?? "Invalid import receipt.",
    });
    const messages: Record<string, string> = {
      "Permission denied": "Your owner or venue access changed. Nothing was imported.",
      "Venue timezone changed or is invalid": "The venue timezone changed or is invalid. Reload and check the timestamps.",
      "Duplicate source record IDs in file": "A source record ID appears more than once in this file. Nothing was imported.",
      "Source record IDs already imported; nothing was saved":
        "At least one source record ID has already been imported for this venue, type and source. Nothing was imported.",
      "Request identifier already used":
        "This request was already used for different content. Check import history, then reload before a new upload.",
    };
    const timezoneMismatch = error?.message?.match(/^Timestamp timezone mismatch in record ([0-9]+)$/);
    const invalidRecord = error?.message?.match(/^Invalid (?:timestamp in record|value in record|record) ([0-9]+)$/);
    const detail = error?.message && messages[error.message] || (timezoneMismatch
      ? `Record ${timezoneMismatch[1]} has an offset that does not match the venue timezone. Nothing was imported.`
      : invalidRecord ? `Record ${invalidRecord[1]} is invalid. Check its ID, timestamp and value; nothing was imported.` : null);
    return { error: detail || "We could not confirm the import. Check import history before retrying the same file." };
  }
  revalidatePath("/reports/demand-history");
  redirect(demandHistoryHref(workspace.business.id, workspace.venue.id, { importId, saved: true }));
}
