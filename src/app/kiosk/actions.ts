"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  isKioskCredential, kioskCookieName, kioskCookiePath, parseKioskActivation, singleFormString,
} from "@/lib/attendance-kiosk";
import { createKioskClient } from "@/lib/supabase/kiosk";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function activateKioskAction(formData: FormData) {
  const activationCode = singleFormString(formData, "activation_code")?.trim();
  if (!isKioskCredential(activationCode) || !isSupabaseConfigured()) {
    console.error("Invalid kiosk activation request or missing configuration.");
    redirect("/kiosk?error=activation");
  }
  const { data, error } = await createKioskClient().rpc("activate_attendance_kiosk", {
    p_activation_code: activationCode,
  });
  const receipt = parseKioskActivation(data);
  if (error || !receipt || Date.parse(receipt.expiresAt) <= Date.now()) {
    console.error("Kiosk activation failed.", { code: error?.code });
    redirect("/kiosk?error=activation");
  }
  (await cookies()).set(kioskCookieName, receipt.sessionCode, {
    httpOnly: true, secure: true, sameSite: "strict", path: kioskCookiePath,
    expires: new Date(receipt.expiresAt),
  });
  redirect("/kiosk");
}

export async function clearKioskAction() {
  (await cookies()).set(kioskCookieName, "", {
    httpOnly: true, secure: true, sameSite: "strict", path: kioskCookiePath, maxAge: 0,
  });
  redirect("/kiosk");
}
