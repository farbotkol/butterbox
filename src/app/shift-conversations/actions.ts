"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseBusinessId } from "@/lib/business-selection";
import { parseShiftMessageInput, shiftConversationHref } from "@/lib/shift-conversations";
import { getWorkspace } from "@/lib/workspace";

export type ShiftMessageState = { error?: string };

export async function sendShiftMessageAction(
  _previous: ShiftMessageState, formData: FormData,
): Promise<ShiftMessageState> {
  const input = parseShiftMessageInput(formData);
  if (!input) {
    console.error("Invalid shift conversation message.");
    return { error: "Enter a message of up to 2,000 characters, then check the selected shift and try again." };
  }
  const workspace = await getWorkspace(input.venueId, { businessId: input.businessId });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") {
    console.error("Shift conversation workspace unavailable.");
    return { error: "Your business or venue access could not be verified. No message was sent." };
  }
  const { data, error } = await workspace.supabase.rpc("send_shift_conversation_message", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
    p_shift_id: input.shiftId, p_employee_id: input.employeeId,
    p_participant_user_id: input.participantId, p_expected_shift_updated_at: input.updatedAt,
    p_body: input.body, p_request_id: input.requestId, p_expected_department_id: input.departmentId,
  });
  const conversationId = parseBusinessId(data);
  if (error || !conversationId) {
    console.error("Could not confirm shift conversation message.", {
      code: error?.code, message: error?.message ?? "Invalid message receipt.",
    });
    const messages: Record<string, string> = {
      "Shift or participant changed; reload the conversation":
        "The shift, department or linked participant changed. Reload the conversation before sending.",
      "Shift participant is no longer available":
        "The assigned participant or department is no longer available. Reload the conversation.",
      "Conversation unavailable or permission denied":
        "You no longer have permission for this conversation, or the shift is unavailable.",
      "Permission denied": "Your business or venue access could not be verified. No message was sent.",
      "Request identifier already used":
        "This request was already used for different content. Check the conversation history before starting another message.",
    };
    return { error: error?.message && messages[error.message] ? messages[error.message] :
      "We could not confirm delivery. Check the conversation history before retrying this same message." };
  }
  revalidatePath("/shift-conversations");
  redirect(`${shiftConversationHref(workspace.business.id, workspace.venue.id, { conversationId })}&sent=1`);
}
