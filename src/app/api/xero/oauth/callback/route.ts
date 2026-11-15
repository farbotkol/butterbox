import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  encryptXeroTokenSet, exchangeXeroAuthorizationCode,
  fetchXeroTenants, isXeroUuid, loadXeroOAuthConfig, revokeXeroToken,
  verifyXeroOAuthStateCookie, XERO_STATE_COOKIE, XeroOAuthError,
} from "@/lib/xero-oauth";
import { createClient } from "@/lib/supabase/server";
import { getXeroAdminWorkspace } from "@/lib/xero-workspace";

function finish(
  request: NextRequest,
  error?: string,
  businessId?: string,
  grantId?: string,
) {
  const url = new URL("/settings/payroll/xero", request.url);
  if (businessId) url.searchParams.set("business", businessId);
  if (grantId) url.searchParams.set("grant", grantId);
  if (error) url.searchParams.set("error", error);
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set(XERO_STATE_COOKIE, "", {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/xero/oauth/callback",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function oneParameter(request: NextRequest, name: string) {
  const values = request.nextUrl.searchParams.getAll(name);
  return values.length === 1 ? values[0] : null;
}

export async function GET(request: NextRequest) {
  let config;
  try {
    config = loadXeroOAuthConfig();
  } catch {
    return finish(request, "configuration");
  }

  const state = verifyXeroOAuthStateCookie(
    config,
    request.cookies.get(XERO_STATE_COOKIE)?.value,
    oneParameter(request, "state"),
  );
  const registered = new URL(config.redirectUri);
  if (!state || state.redirectUri !== config.redirectUri ||
    request.nextUrl.origin !== registered.origin || request.nextUrl.pathname !== registered.pathname) {
    return finish(request, "state");
  }

  const codes = request.nextUrl.searchParams.getAll("code");
  const providerErrors = request.nextUrl.searchParams.getAll("error");
  if (providerErrors.length === 1 && providerErrors[0] && codes.length === 0) {
    return finish(request, "cancelled", state.businessId);
  }
  if (codes.length !== 1 || !codes[0] || providerErrors.length !== 0) {
    return finish(request, "callback", state.businessId);
  }

  const workspace = await getXeroAdminWorkspace(state.businessId);
  if (!workspace || workspace.user.id !== state.userId) {
    return finish(request, "permission", state.businessId);
  }

  let tokens;
  try {
    tokens = await exchangeXeroAuthorizationCode(config, codes[0]);
  } catch (error) {
    return finish(request,
      error instanceof XeroOAuthError && error.code === "permission" ? "permission" : "provider",
      state.businessId);
  }
  let organizations;
  try {
    organizations = (await fetchXeroTenants(tokens.accessToken))
      .filter((tenant) => tenant.tenantType === "ORGANISATION");
  } catch (error) {
    try { await revokeXeroToken(config, tokens.refreshToken); } catch { /* No token is stored for this flow. */ }
    return finish(request,
      error instanceof XeroOAuthError && error.code === "permission" ? "permission" : "provider",
      state.businessId);
  }

  if (organizations.length === 0) {
    try { await revokeXeroToken(config, tokens.refreshToken); } catch { /* No eligible organization was returned. */ }
    return finish(request, "organization", state.businessId);
  }

  const supabase = await createClient();
  const grantId = randomUUID();
  const encryptedTokens = encryptXeroTokenSet(config, state.businessId, grantId, tokens);
  const { data, error } = await supabase.rpc("store_xero_oauth_grant", {
    p_business_id: state.businessId,
    p_grant_id: grantId,
    p_encrypted_tokens: encryptedTokens,
    p_expires_at: tokens.expiresAt,
    p_scopes: tokens.scopes,
    p_available_tenants: organizations,
  });
  if (error || !isXeroUuid(data) || data.toLowerCase() !== grantId.toLowerCase()) {
    try { await revokeXeroToken(config, tokens.refreshToken); } catch { /* The token is not retained locally. */ }
    return finish(request, "save", state.businessId);
  }

  return finish(request, undefined, state.businessId, grantId);
}
