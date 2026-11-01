import { NextResponse, type NextRequest } from "next/server";
import { safeAuthRedirect } from "@/lib/auth-urls";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return new NextResponse(null, {
        status: 303,
        headers: {
          Location: safeAuthRedirect(requestedNext),
          "Cache-Control": "no-store",
        },
      });
    }
  }

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/forgot-password?error=link",
      "Cache-Control": "no-store",
    },
  });
}