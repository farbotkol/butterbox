"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageAnnouncements, parseAnnouncementInput } from "@/lib/announcements";
import { parseBusinessId } from "@/lib/business-selection";
import { parseBusinessVenueContext, singleFormString } from "@/lib/form-data";
import { getWorkspace } from "@/lib/workspace";

export type AnnouncementFormState = { error?: string };

export async function publishAnnouncementAction(
  _previous: AnnouncementFormState, formData: FormData,
): Promise<AnnouncementFormState> {
  const context = parseBusinessVenueContext(formData);
  const input = parseAnnouncementInput(formData);
  if (!context || !input) {
    console.error("Invalid announcement publication input.");
    return { error: "Enter a title (up to 120 characters), message (up to 4000), valid audience and confirmation. Choose a department only for a department notice." };
  }
  const workspace = await getWorkspace(context.venueId, { businessId: context.businessId });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready" || !canManageAnnouncements(workspace.membership.role)) {
    console.error("Announcement publication permission unavailable.");
    return { error: "Your announcement access could not be verified. Refresh and check your business and venue." };
  }
  const { data, error } = await workspace.supabase.rpc("publish_announcement", {
    p_business_id: workspace.business.id, p_venue_id: input.scope === "business" ? null : workspace.venue.id,
    p_department_id: input.departmentId, p_title: input.title, p_body: input.body,
    p_requires_acknowledgement: input.requiresAcknowledgement, p_request_id: input.requestId,
  });
  const announcementId = parseBusinessId(data);
  if (error || !announcementId) {
    console.error("Could not confirm announcement publication.", {
      code: error?.code, message: error?.message ?? "Invalid publication receipt.",
    });
    const messages: Record<string, string> = {
      "Permission denied": "You cannot publish to that audience. Department managers must select their permitted department.",
      "No linked active recipients in this audience": "There are no linked active staff with access in this audience. No notice was published.",
      "Request identifier already used": "This request was already published with other content. Review history, then refresh before creating a new notice.",
      "Announcement department is inactive": "That department is inactive. Choose an active permitted department.",
    };
    return { error: error?.message && messages[error.message] ? messages[error.message] :
      "We could not confirm publication. Check published history before retrying this same request; do not create a duplicate." };
  }
  revalidatePath("/announcements");
  revalidatePath("/notifications");
  redirect(`/announcements?${new URLSearchParams({
    business: workspace.business.id, venue: workspace.venue.id, saved: "published",
  })}#published-${announcementId}`);
}

export async function acknowledgeAnnouncementAction(formData: FormData) {
  const context = parseBusinessVenueContext(formData);
  const recipientId = parseBusinessId(singleFormString(formData, "recipient_id"));
  if (!context || !recipientId || singleFormString(formData, "confirm") !== "yes") {
    console.error("Invalid announcement acknowledgement.");
    redirect("/announcements?error=acknowledge");
  }
  const destination = `/announcements?${new URLSearchParams({
    business: context.businessId, venue: context.venueId,
  })}`;
  const workspace = await getWorkspace(context.venueId, { businessId: context.businessId });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready") {
    console.error("Announcement acknowledgement workspace unavailable.");
    redirect(`${destination}&error=acknowledge`);
  }
  const { data, error } = await workspace.supabase.rpc("acknowledge_announcement", {
    p_business_id: workspace.business.id, p_recipient_id: recipientId,
  });
  if (error || !parseBusinessId(data)) {
    console.error("Could not confirm announcement acknowledgement.", {
      code: error?.code, message: error?.message ?? "Invalid acknowledgement receipt.",
    });
    redirect(`${destination}&error=acknowledge#notice-${recipientId}`);
  }
  revalidatePath("/announcements");
  revalidatePath("/notifications");
  redirect(`${destination}&saved=acknowledged#notice-${recipientId}`);
}
