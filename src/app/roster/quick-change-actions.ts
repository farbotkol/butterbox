"use server";

import { revalidatePath } from "next/cache";
import {
  isQuickChangeUuid,
  parseQuickChangeInput,
  parseQuickChangePreview,
  quickChangeFailure,
  quickChangePreviewPayload,
  type QuickChangeInput,
  type QuickChangePreview,
  type QuickChangeResult,
} from "@/lib/roster-quick-changes";
import { getWorkspace } from "@/lib/workspace";

function rpcArguments(input: QuickChangeInput) {
  return {
    p_business_id: input.businessId,
    p_venue_id: input.venueId,
    p_department_id: input.departmentId,
    p_shift_id: input.shiftId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_week_start: input.weekStart,
    p_target_date: input.targetDate,
    p_target_employee_id: input.targetEmployeeId,
    p_operation: input.operation,
  };
}

export async function previewQuickChangeAction(value: unknown): Promise<QuickChangeResult<QuickChangePreview>> {
  const input = parseQuickChangeInput(value);
  if (!input) {
    console.error("Invalid roster quick-change preview context.");
    return { ok: false, error: "The roster context is invalid. Reload before trying again." };
  }
  const workspace = await getWorkspace(input.venueId, { businessId: input.businessId });
  if (workspace.status === "anonymous") return { ok: false, error: "Your session ended. Sign in and reload the roster." };
  if (workspace.status !== "ready") {
    console.error("Could not load the roster workspace for preview.", {
      message: workspace.status === "error" ? workspace.message : "Workspace setup is required.",
    });
    return { ok: false, error: "The selected business or venue is unavailable. Reload the roster." };
  }
  const { data, error } = await workspace.supabase.rpc("preview_roster_shift_change", rpcArguments(input));
  if (error) {
    console.error("Roster quick-change preview failed.", { code: error.code, message: error.message });
    return { ok: false, error: quickChangeFailure(error.message) };
  }
  const preview = parseQuickChangePreview(data, input);
  if (!preview) {
    console.error("Roster quick-change preview returned an invalid result.");
    return { ok: false, error: "We couldn't verify the preview. Reload the roster before trying again." };
  }
  return { ok: true, value: preview };
}

export async function applyQuickChangeAction(
  value: unknown, requestId: unknown, previewValue: unknown,
): Promise<QuickChangeResult<string>> {
  const input = parseQuickChangeInput(value);
  const preview = input ? parseQuickChangePreview(previewValue, input) : null;
  if (!input || !isQuickChangeUuid(requestId) || !preview || preview.blocking.length) {
    console.error("Invalid roster quick-change request.");
    return { ok: false, error: "The roster context is invalid. Reload before trying again." };
  }
  const workspace = await getWorkspace(input.venueId, { businessId: input.businessId });
  if (workspace.status === "anonymous") return { ok: false, error: "Your session ended. Sign in and reload the roster." };
  if (workspace.status !== "ready") {
    console.error("Could not load the roster workspace for a quick change.", {
      message: workspace.status === "error" ? workspace.message : "Workspace setup is required.",
    });
    return { ok: false, error: "The selected business or venue is unavailable. Reload the roster." };
  }
  const { data, error } = await workspace.supabase.rpc("apply_roster_shift_change", {
    ...rpcArguments(input), p_expected_preview: quickChangePreviewPayload(preview), p_request_id: requestId,
  });
  if (error) {
    console.error("Roster quick change failed.", { code: error.code, message: error.message });
    return { ok: false, error: quickChangeFailure(error.message), uncertain: error.code !== "P0001" };
  }
  if (!isQuickChangeUuid(data)) {
    console.error("Roster quick change returned an invalid receipt.");
    return { ok: false, error: quickChangeFailure(undefined), uncertain: true };
  }
  revalidatePath("/roster");
  return { ok: true, value: data };
}

export async function undoQuickChangeAction(
  businessId: unknown, venueId: unknown, changeId: unknown, requestId: unknown,
): Promise<QuickChangeResult<string>> {
  if (!isQuickChangeUuid(businessId) || !isQuickChangeUuid(venueId) ||
    !isQuickChangeUuid(changeId) || !isQuickChangeUuid(requestId)) {
    console.error("Invalid roster quick-change undo request.");
    return { ok: false, error: "The roster context is invalid. Reload before trying again." };
  }
  const workspace = await getWorkspace(venueId, { businessId });
  if (workspace.status === "anonymous") return { ok: false, error: "Your session ended. Sign in and reload the roster." };
  if (workspace.status !== "ready") {
    console.error("Could not load the roster workspace for undo.", {
      message: workspace.status === "error" ? workspace.message : "Workspace setup is required.",
    });
    return { ok: false, error: "The selected business or venue is unavailable. Reload the roster." };
  }
  const { data, error } = await workspace.supabase.rpc("undo_roster_shift_change", {
    p_business_id: businessId, p_venue_id: venueId, p_change_id: changeId, p_request_id: requestId,
  });
  if (error) {
    console.error("Roster quick-change undo failed.", { code: error.code, message: error.message });
    return { ok: false, error: quickChangeFailure(error.message), uncertain: error.code !== "P0001" };
  }
  if (!isQuickChangeUuid(data) || data.toLowerCase() !== changeId.toLowerCase()) {
    console.error("Roster quick-change undo returned an invalid receipt.");
    return { ok: false, error: quickChangeFailure(undefined), uncertain: true };
  }
  revalidatePath("/roster");
  return { ok: true, value: data };
}
