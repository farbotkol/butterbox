import { cookies } from "next/headers";
import { isKioskCredential, kioskCookieName, parseKioskDisplay } from "@/lib/attendance-kiosk";
import { createKioskClient } from "@/lib/supabase/kiosk";
import { isSupabaseConfigured } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };

export async function POST() {
  const sessionCode = (await cookies()).get(kioskCookieName)?.value;
  if (!isKioskCredential(sessionCode) || !isSupabaseConfigured()) {
    return Response.json({ error: "Kiosk is unavailable." }, { status: 401, headers });
  }
  const { data, error } = await createKioskClient().rpc("issue_attendance_kiosk_code", {
    p_session_code: sessionCode,
  });
  const code = parseKioskDisplay(data);
  if (error || !code) {
    console.error("Kiosk code issuance failed.", { code: error?.code });
    const status = error?.message === "Kiosk is unavailable" ? 401 : 503;
    return Response.json({ error: "Kiosk is unavailable." }, { status, headers });
  }
  return Response.json(code, { headers });
}
