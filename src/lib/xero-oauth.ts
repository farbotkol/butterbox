import {
  createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual,
} from "node:crypto";

export const XERO_AUTHORIZATION_URL = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_REVOCATION_URL = "https://identity.xero.com/connect/revocation";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
export const XERO_SCOPES = ["offline_access", "payroll.timesheets"] as const;
export const XERO_STATE_COOKIE = "butterbox_xero_oauth_state";
export const XERO_STATE_MAX_AGE_SECONDS = 600;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secretLimit = 12_000;

export type XeroOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: Buffer;
};

export type XeroTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
};

export type XeroTenant = {
  tenantId: string;
  tenantName: string;
  tenantType: string;
};

export class XeroOAuthError extends Error {
  readonly code: "configuration" | "permission" | "reauthorization" | "provider" | "invalid_response";

  constructor(code: XeroOAuthError["code"]) {
    super(code);
    this.name = "XeroOAuthError";
    this.code = code;
  }
}

function boundedString(value: unknown, limit = secretLimit): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit;
}

export function isXeroUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function loadXeroOAuthConfig(env: NodeJS.ProcessEnv = process.env): XeroOAuthConfig {
  const { XERO_CLIENT_ID: clientId, XERO_CLIENT_SECRET: clientSecret,
    XERO_REDIRECT_URI: redirectUri, XERO_TOKEN_ENCRYPTION_KEY: encodedKey } = env;
  if (!boundedString(clientId, 512) || !boundedString(clientSecret, 4096) ||
    !boundedString(redirectUri, 2048) || !boundedString(encodedKey, 128)) {
    throw new XeroOAuthError("configuration");
  }

  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new XeroOAuthError("configuration");
  }
  const localHttp = redirect.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
  if ((!localHttp && redirect.protocol !== "https:") || redirect.username || redirect.password ||
    redirect.search || redirect.hash || !redirect.pathname.endsWith("/api/xero/oauth/callback")) {
    throw new XeroOAuthError("configuration");
  }

  let encryptionKey: Buffer;
  try {
    encryptionKey = Buffer.from(encodedKey, "base64");
  } catch {
    throw new XeroOAuthError("configuration");
  }
  if (encryptionKey.length !== 32 || encryptionKey.toString("base64") !== encodedKey) {
    throw new XeroOAuthError("configuration");
  }

  return { clientId, clientSecret, redirectUri: redirect.href, encryptionKey };
}

function deriveKey(config: XeroOAuthConfig, info: string, context = ""): Buffer {
  const salt = Buffer.from(context || "butterbox-xero-oauth-v1");
  return Buffer.from(
    hkdfSync("sha256", config.encryptionKey, salt, Buffer.from(info), 32),
  );
}

export function createXeroAuthorizationUrl(config: XeroOAuthConfig, state: string): string {
  if (!boundedString(state, 128)) throw new XeroOAuthError("invalid_response");
  const url = new URL(XERO_AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", XERO_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.href;
}

export type XeroOAuthState = {
  state: string;
  businessId: string;
  userId: string;
  redirectUri: string;
  issuedAt: number;
};

export function createXeroOAuthStateCookie(
  config: XeroOAuthConfig,
  state: XeroOAuthState,
): string {
  if (!isXeroUuid(state.businessId) || !isXeroUuid(state.userId) ||
    !boundedString(state.state, 128) || state.redirectUri !== config.redirectUri ||
    !Number.isSafeInteger(state.issuedAt)) {
    throw new XeroOAuthError("invalid_response");
  }
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", deriveKey(config, "state-signing")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyXeroOAuthStateCookie(
  config: XeroOAuthConfig,
  cookie: string | undefined,
  returnedState: string | null,
  now = Date.now(),
): XeroOAuthState | null {
  if (!cookie || cookie.length > 2048 || !boundedString(returnedState, 128)) return null;
  const [payload, signature, extra] = cookie.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", deriveKey(config, "state-signing")).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as XeroOAuthState;
    if (!isXeroUuid(state.businessId) || !isXeroUuid(state.userId) ||
      !boundedString(state.state, 128) || state.state !== returnedState ||
      !boundedString(state.redirectUri, 2048) || !Number.isSafeInteger(state.issuedAt) ||
      state.issuedAt > now + 30_000 || now - state.issuedAt > XERO_STATE_MAX_AGE_SECONDS * 1000) return null;
    return state;
  } catch {
    return null;
  }
}

function tokenAad(businessId: string, grantId: string): Buffer {
  if (!isXeroUuid(businessId) || !isXeroUuid(grantId)) throw new XeroOAuthError("invalid_response");
  return Buffer.from(`butterbox-xero-oauth-v1:${businessId.toLowerCase()}:${grantId.toLowerCase()}`);
}

export function encryptXeroTokenSet(
  config: XeroOAuthConfig,
  businessId: string,
  grantId: string,
  tokens: XeroTokenSet,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveKey(config, "token-encryption", businessId.toLowerCase()),
    iv,
  );
  cipher.setAAD(tokenAad(businessId, grantId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

export function decryptXeroTokenSet(
  config: XeroOAuthConfig,
  businessId: string,
  grantId: string,
  encrypted: string,
): XeroTokenSet {
  try {
    if (!boundedString(encrypted, 24_000)) throw new Error();
    const envelope = JSON.parse(encrypted) as Record<string, unknown>;
    if (envelope.version !== 1 || !boundedString(envelope.iv, 64) ||
      !boundedString(envelope.tag, 64) || !boundedString(envelope.ciphertext, 20_000)) throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(config, "token-encryption", businessId.toLowerCase()),
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAAD(tokenAad(businessId, grantId));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const tokens = JSON.parse(plaintext) as Record<string, unknown>;
    if (!boundedString(tokens.accessToken) || !boundedString(tokens.refreshToken) ||
      !boundedString(tokens.expiresAt, 64) || !Array.isArray(tokens.scopes) ||
      tokens.scopes.some((scope) => !boundedString(scope, 100))) throw new Error();
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes as string[],
    };
  } catch {
    throw new XeroOAuthError("invalid_response");
  }
}

function tokenScopes(value: unknown, fallback?: string[]): string[] {
  if (typeof value !== "string") return fallback ?? [];
  return [...new Set(value.split(/\s+/).filter((scope) => /^[a-z][a-z0-9._:-]{0,99}$/i.test(scope)))].sort();
}

async function tokenRequest(
  config: XeroOAuthConfig,
  body: URLSearchParams,
  fetcher: typeof fetch,
  previousScopes?: string[],
): Promise<XeroTokenSet> {
  let response: Response;
  try {
    response = await fetcher(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new XeroOAuthError("provider");
  }
  if (!response.ok) {
    throw new XeroOAuthError(response.status === 401
      ? "configuration" : response.status === 400 ? "reauthorization" : "provider");
  }
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    data = parsed as Record<string, unknown>;
  } catch {
    throw new XeroOAuthError("invalid_response");
  }
  const scopes = tokenScopes(data.scope, previousScopes);
  if (data.token_type !== "Bearer" || !boundedString(data.access_token) ||
    !boundedString(data.refresh_token) || typeof data.expires_in !== "number" ||
    !Number.isSafeInteger(data.expires_in) || data.expires_in < 1 || data.expires_in > 86_400 ||
    !XERO_SCOPES.every((scope) => scopes.includes(scope))) {
    throw new XeroOAuthError("invalid_response");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scopes,
  };
}

export function exchangeXeroAuthorizationCode(
  config: XeroOAuthConfig,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<XeroTokenSet> {
  if (!boundedString(code, 2048)) return Promise.reject(new XeroOAuthError("invalid_response"));
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  return tokenRequest(config, body, fetcher);
}

export function refreshXeroTokenSet(
  config: XeroOAuthConfig,
  tokens: XeroTokenSet,
  fetcher: typeof fetch = fetch,
): Promise<XeroTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
  });
  return tokenRequest(config, body, fetcher, tokens.scopes);
}

export async function revokeXeroToken(
  config: XeroOAuthConfig,
  refreshToken: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!boundedString(refreshToken)) throw new XeroOAuthError("invalid_response");
  let response: Response;
  try {
    response = await fetcher(XERO_REVOCATION_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new XeroOAuthError("provider");
  }
  if (!response.ok) throw new XeroOAuthError(response.status === 401 ? "reauthorization" : "provider");
}

export async function fetchXeroTenants(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<XeroTenant[]> {
  if (!boundedString(accessToken)) throw new XeroOAuthError("invalid_response");
  let response: Response;
  try {
    response = await fetcher(XERO_CONNECTIONS_URL, {
      headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new XeroOAuthError("provider");
  }
  if (!response.ok) {
    throw new XeroOAuthError(response.status === 401 ? "reauthorization" :
      response.status === 403 ? "permission" : "provider");
  }
  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    throw new XeroOAuthError("invalid_response");
  }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) {
    throw new XeroOAuthError("invalid_response");
  }
  const tenants: XeroTenant[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new XeroOAuthError("invalid_response");
    const tenant = row as Record<string, unknown>;
    if (!isXeroUuid(tenant.tenantId) || !boundedString(tenant.tenantName, 255) ||
      !boundedString(tenant.tenantType, 100)) throw new XeroOAuthError("invalid_response");
    tenants.push({
      tenantId: tenant.tenantId.toLowerCase(),
      tenantName: tenant.tenantName.trim(),
      tenantType: tenant.tenantType.trim(),
    });
  }
  if (new Set(tenants.map((tenant) => tenant.tenantId)).size !== tenants.length) {
    throw new XeroOAuthError("invalid_response");
  }
  return tenants;
}
