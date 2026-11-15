import "server-only";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createXeroAuthorizationUrl, createXeroOAuthStateCookie, isXeroUuid,
  loadXeroOAuthConfig, XERO_STATE_COOKIE, XERO_STATE_MAX_AGE_SECONDS, XeroOAuthError,
} from "@/lib/xero-oauth";
import { getXeroAdminWorkspace } from "@/lib/xero-workspace";

function responseError(request: NextRequest, error: string, businessId?: string) {
  const url = new URL("/settings/payroll/xero", request.url);
  if (businessId) url.searchParams.set("business", businessId);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303, headers: {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse("Invalid request", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const businesses = formData.getAll("business");
  const businessId = businesses.length === 1 && typeof businesses[0] === "string"
    ? businesses[0].toLowerCase() : "";
  if (!isXeroUuid(businessId)) return responseError(request, "invalid");

  const workspace = await getXeroAdminWorkspace(businessId);
  if (!workspace) return responseError(request, "permission", businessId);

  let config;
  try {
    config = loadXeroOAuthConfig();
  } catch (error) {
    return responseError(request,
      error instanceof XeroOAuthError && error.code === "configuration" ? "configuration" : "connect",
      businessId);
  }

  const state = randomBytes(32).toString("base64url");
  const issuedAt = Date.now();
  const stateCookie = createXeroOAuthStateCookie(config, {
    state,
    businessId,
    userId: workspace.user.id,
    redirectUri: config.redirectUri,
    issuedAt,
  });
  const response = NextResponse.redirect(createXeroAuthorizationUrl(config, state), { status: 303 });
  response.cookies.set(XERO_STATE_COOKIE, stateCookie, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/xero/oauth/callback",
    maxAge: XERO_STATE_MAX_AGE_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
