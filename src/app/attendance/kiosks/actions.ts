"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseKioskContext, parseKioskCreation, singleFormString, type KioskSetupState,
} from "@/lib/attendance-kiosk";
import { parseBusinessId } from "@/lib/business-selection";
import { getWorkspace } from "@/lib/workspace";

export async function createAttendanceKioskAction(
  _previous: KioskSetupState, formData: FormData,
): Promise<KioskSetupState> {
  const invalid = (error: string): KioskSetupState => ({ error, activationCode: null, expiresAt: null });
  const context = parseKioskContext(formData);
  const name = singleFormString(formData, "name")?.trim();
  if (!context || !name || name.length > 60) {
    console.error("Invalid kiosk creation request.");
    return invalid("Enter a device name of up to 60 characters and try again.");
  }
  const workspace = await getWorkspace(context.venueId, { businessId: context.businessId });
  if (workspace.status === "anonymous") return invalid("Your session ended. Sign in again before creating a device.");
  if (workspace.status !== "ready") {
    console.error("Could not load the kiosk management workspace.");
    return invalid("We couldn't load this venue. Refresh and check your access.");
  }
  if (workspace.membership.role !== "owner") return invalid("Only an owner can create kiosk devices.");
  const { data, error } = await workspace.supabase.rpc("create_attendance_kiosk", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_name: name,
  });
  const receipt = parseKioskCreation(data);
  if (error || !receipt) {
    console.error("Could not create kiosk device.", { code: error?.code });
    return invalid("We couldn't create the device. Refresh and try again.");
  }
  revalidatePath("/attendance/kiosks");
  return { error: null, activationCode: receipt.activationCode, expiresAt: receipt.expiresAt };
}

export async function revokeAttendanceKioskAction(formData: FormData) {
  const context = parseKioskContext(formData);
  const kioskId = parseBusinessId(singleFormString(formData, "kiosk_id"));
  if (!context || !kioskId) {
    console.error("Invalid kiosk revocation request.");
    redirect("/attendance?error=invalid");
  }
  const query = new URLSearchParams({ business: context.businessId, venue: context.venueId });
  const destination = `/attendance/kiosks?${query}`;
  const workspace = await getWorkspace(context.venueId, { businessId: context.businessId });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status !== "ready" || workspace.membership.role !== "owner") {
    console.error("Kiosk revocation access is unavailable.");
    redirect(`${destination}&error=permission`);
  }
  const { data, error } = await workspace.supabase.rpc("revoke_attendance_kiosk", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_kiosk_id: kioskId,
  });
  if (error || parseBusinessId(data) !== kioskId) {
    console.error("Could not revoke kiosk device.", { code: error?.code });
    redirect(`${destination}&error=revoke`);
  }
  revalidatePath("/attendance/kiosks");
  redirect(`${destination}&saved=revoked`);
}
