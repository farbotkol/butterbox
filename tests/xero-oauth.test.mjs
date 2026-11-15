import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createXeroAuthorizationUrl, createXeroOAuthStateCookie, decryptXeroTokenSet,
  encryptXeroTokenSet, exchangeXeroAuthorizationCode, fetchXeroTenants,
  loadXeroOAuthConfig, refreshXeroTokenSet, revokeXeroToken, verifyXeroOAuthStateCookie,
  XERO_CONNECTIONS_URL, XERO_REVOCATION_URL, XERO_SCOPES, XERO_TOKEN_URL, XeroOAuthError,
} from "../src/lib/xero-oauth.ts";
import { getXeroAccessToken } from "../src/lib/xero-token-manager.ts";

const businessId = "b7700000-0000-4000-8000-000000000001";
const otherBusinessId = "b7700000-0000-4000-8000-000000000002";
const userId = "a7700000-0000-4000-8000-000000000001";
const grantId = "c7700000-0000-4000-8000-000000000001";
const config = loadXeroOAuthConfig({
  XERO_CLIENT_ID: "synthetic-client-id",
  XERO_CLIENT_SECRET: "synthetic-client-secret",
  XERO_REDIRECT_URI: "https://butterbox.example/api/xero/oauth/callback",
  XERO_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
});
const tokens = {
  accessToken: "synthetic-access-token",
  refreshToken: "synthetic-refresh-token",
  expiresAt: "2026-11-15T05:00:00.000Z",
  scopes: [...XERO_SCOPES],
};

function tokenResponse(overrides = {}) {
  return new Response(JSON.stringify({
    token_type: "Bearer",
    access_token: "new-access-token",
    refresh_token: "new-refresh-token",
    expires_in: 1800,
    scope: XERO_SCOPES.join(" "),
    ...overrides,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("Xero configuration requires server secrets and a fixed HTTPS callback URI", () => {
  assert.equal(config.redirectUri, "https://butterbox.example/api/xero/oauth/callback");
  assert.throws(() => loadXeroOAuthConfig({
    XERO_CLIENT_ID: "client", XERO_CLIENT_SECRET: "secret",
    XERO_REDIRECT_URI: "https://butterbox.example/callback?next=/",
    XERO_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  }), (error) => error instanceof XeroOAuthError && error.code === "configuration");
  assert.throws(() => loadXeroOAuthConfig({
    XERO_CLIENT_ID: "client", XERO_CLIENT_SECRET: "secret",
    XERO_REDIRECT_URI: "http://butterbox.example/api/xero/oauth/callback",
    XERO_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  }), (error) => error instanceof XeroOAuthError && error.code === "configuration");
});

test("authorization requests use the exact callback URI and least-required AU Payroll scopes", () => {
  const url = new URL(createXeroAuthorizationUrl(config, "one-time-state"));
  assert.equal(url.origin + url.pathname, "https://login.xero.com/identity/connect/authorize");
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.deepEqual(url.searchParams.get("scope").split(" "), [...XERO_SCOPES]);
  assert.equal(url.searchParams.get("state"), "one-time-state");
});

test("OAuth state is signed, browser-bound, time-limited, and tenant-specific", () => {
  const now = Date.now();
  const state = {
    state: "single-use-state",
    businessId,
    userId,
    redirectUri: config.redirectUri,
    issuedAt: now,
  };
  const cookie = createXeroOAuthStateCookie(config, state);
  assert.deepEqual(verifyXeroOAuthStateCookie(config, cookie, state.state, now), state);
  assert.equal(verifyXeroOAuthStateCookie(config, cookie, "other-state", now), null);
  assert.equal(verifyXeroOAuthStateCookie(config, `${cookie}tampered`, state.state, now), null);
  assert.equal(verifyXeroOAuthStateCookie(config, cookie, state.state, now + 601_000), null);
  assert.equal(verifyXeroOAuthStateCookie(config, cookie, state.state, now - 31_000), null);
});

test("AES-GCM token storage authenticates both business and grant identities", () => {
  const encrypted = encryptXeroTokenSet(config, businessId, grantId, tokens);
  assert.deepEqual(decryptXeroTokenSet(config, businessId, grantId, encrypted), tokens);
  assert.throws(() => decryptXeroTokenSet(config, otherBusinessId, grantId, encrypted),
    (error) => error instanceof XeroOAuthError && error.code === "invalid_response");
  assert.throws(() => decryptXeroTokenSet(config, businessId,
    "c7700000-0000-4000-8000-000000000002", encrypted),
  (error) => error instanceof XeroOAuthError && error.code === "invalid_response");
  const envelope = JSON.parse(encrypted);
  envelope.ciphertext = `${envelope.ciphertext.slice(0, -4)}AAAA`;
  assert.throws(() => decryptXeroTokenSet(config, businessId, grantId, JSON.stringify(envelope)),
    (error) => error instanceof XeroOAuthError && error.code === "invalid_response");
});

test("authorization-code exchange uses the server-side client and validates granted scopes", async () => {
  let request;
  const result = await exchangeXeroAuthorizationCode(config, "synthetic-code", async (url, options) => {
    request = { url, options };
    return tokenResponse();
  });
  assert.equal(request.url, XERO_TOKEN_URL);
  assert.equal(request.options.method, "POST");
  assert.match(request.options.headers.Authorization, /^Basic /);
  assert.equal(request.options.body.get("grant_type"), "authorization_code");
  assert.equal(request.options.body.get("code"), "synthetic-code");
  assert.equal(request.options.body.get("redirect_uri"), config.redirectUri);
  assert.deepEqual(result.scopes, [...XERO_SCOPES]);
  await assert.rejects(exchangeXeroAuthorizationCode(config, "code", async () =>
    tokenResponse({ scope: "offline_access" })),
  (error) => error instanceof XeroOAuthError && error.code === "invalid_response");
});

test("refresh persists rotated credentials and classifies revoked or denied access safely", async () => {
  let request;
  const refreshed = await refreshXeroTokenSet(config, tokens, async (url, options) => {
    request = { url, options };
    return tokenResponse();
  });
  assert.equal(request.url, XERO_TOKEN_URL);
  assert.equal(request.options.body.get("grant_type"), "refresh_token");
  assert.equal(refreshed.refreshToken, "new-refresh-token");
  await assert.rejects(refreshXeroTokenSet(config, tokens, async () => new Response(null, { status: 400 })),
    (error) => error instanceof XeroOAuthError && error.code === "reauthorization");
  await assert.rejects(refreshXeroTokenSet(config, tokens, async () => new Response(null, { status: 401 })),
    (error) => error instanceof XeroOAuthError && error.code === "configuration");
  await assert.rejects(refreshXeroTokenSet(config, tokens, async () => new Response(null, { status: 403 })),
    (error) => error instanceof XeroOAuthError && error.code === "provider");
});

test("Xero organization discovery and token revocation use bounded server-only requests", async () => {
  const tenantId = "d7700000-0000-4000-8000-000000000001";
  let request;
  const tenants = await fetchXeroTenants(tokens.accessToken, async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify([{
      tenantId, tenantName: "Synthetic Demo", tenantType: "ORGANISATION",
    }]), { status: 200 });
  });
  assert.equal(request.url, XERO_CONNECTIONS_URL);
  assert.equal(request.options.headers.Authorization, "Bearer " + tokens.accessToken);
  assert.deepEqual(tenants, [{ tenantId, tenantName: "Synthetic Demo", tenantType: "ORGANISATION" }]);
  await assert.rejects(fetchXeroTenants(tokens.accessToken, async () => new Response(null, { status: 403 })),
    (error) => error instanceof XeroOAuthError && error.code === "permission");

  const revoked = await revokeXeroToken(config, tokens.refreshToken, async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 200 });
  });
  assert.equal(revoked, undefined);
  assert.equal(request.url, XERO_REVOCATION_URL);
  assert.equal(request.options.body.get("token"), tokens.refreshToken);
  assert.equal(request.options.body.get("token_type_hint"), "refresh_token");
});

test("expired Xero tokens are refreshed under a lock and the rotated token set is encrypted", async () => {
  const expired = { ...tokens, expiresAt: "2020-01-01T00:00:00.000Z" };
  let record = {
    grantId,
    encryptedTokens: encryptXeroTokenSet(config, businessId, grantId, expired),
    expiresAt: expired.expiresAt,
    scopes: expired.scopes,
    status: "active",
  };
  const calls = [];
  const repository = {
    async load() { calls.push("load"); return record; },
    async claim(_business, _tenant, lockId) {
      calls.push("claim");
      this.lockId = lockId;
      return { ...record, acquired: true };
    },
    async save(_business, _grant, lockId, encryptedTokens, expiresAt, scopes) {
      assert.equal(lockId, this.lockId);
      calls.push("save");
      record = { ...record, encryptedTokens, expiresAt, scopes };
      return true;
    },
    async release() { calls.push("release"); },
  };
  const accessToken = await getXeroAccessToken(
    config, repository, businessId, "d7700000-0000-4000-8000-000000000001",
    async () => tokenResponse(), Date.now(),
  );
  assert.equal(accessToken, "new-access-token");
  assert.deepEqual(calls, ["load", "claim", "save"]);
  const stored = decryptXeroTokenSet(config, businessId, grantId, record.encryptedTokens);
  assert.equal(stored.refreshToken, "new-refresh-token");
  assert.equal(stored.accessToken, accessToken);
});

test("valid tokens bypass refresh and a competing refresh lock fails closed", async () => {
  const current = { ...tokens, expiresAt: new Date(Date.now() + 600_000).toISOString() };
  const record = {
    grantId,
    encryptedTokens: encryptXeroTokenSet(config, businessId, grantId, current),
    expiresAt: current.expiresAt,
    scopes: current.scopes,
    status: "active",
  };
  let claims = 0;
  const repository = {
    async load() { return record; },
    async claim() { claims += 1; return { ...record, acquired: false }; },
    async save() { assert.fail("a valid token must not be refreshed"); },
    async release() {},
  };
  assert.equal(await getXeroAccessToken(config, repository, businessId,
    "d7700000-0000-4000-8000-000000000001", async () => assert.fail("no request"), Date.now()),
  current.accessToken);
  assert.equal(claims, 0);

  const expired = { ...tokens, expiresAt: "2020-01-01T00:00:00.000Z" };
  const expiredRecord = {
    ...record,
    expiresAt: expired.expiresAt,
    encryptedTokens: encryptXeroTokenSet(config, businessId, grantId, expired),
  };
  const lockedRepository = {
    async load() { return expiredRecord; },
    async claim() { return { ...expiredRecord, acquired: false }; },
    async save() { assert.fail("a competing refresh must not overwrite tokens"); },
    async release() {},
  };
  await assert.rejects(getXeroAccessToken(config, lockedRepository, businessId,
    "d7700000-0000-4000-8000-000000000001", async () => assert.fail("refresh lock is held"), Date.now()),
  (error) => error instanceof XeroOAuthError && error.code === "provider");
});

test("invalid refresh credentials are marked for owner reauthorization", async () => {
  const expired = { ...tokens, expiresAt: "2020-01-01T00:00:00.000Z" };
  const record = {
    grantId,
    encryptedTokens: encryptXeroTokenSet(config, businessId, grantId, expired),
    expiresAt: expired.expiresAt,
    scopes: expired.scopes,
    status: "active",
  };
  let released;
  const repository = {
    async load() { return record; },
    async claim(_business, _tenant, lockId) { return { ...record, lockId, acquired: true }; },
    async save() { assert.fail("a revoked token must not be persisted"); },
    async release(_business, _grant, _lock, reauthorizationRequired) { released = reauthorizationRequired; },
  };
  await assert.rejects(getXeroAccessToken(config, repository, businessId,
    "d7700000-0000-4000-8000-000000000001",
    async () => new Response(null, { status: 400 }), Date.now()),
  (error) => error instanceof XeroOAuthError && error.code === "reauthorization");
  assert.equal(released, true);
});

test("a rotated refresh token that cannot be persisted requires reauthorization", async () => {
  const expired = { ...tokens, expiresAt: "2020-01-01T00:00:00.000Z" };
  const record = {
    grantId,
    encryptedTokens: encryptXeroTokenSet(config, businessId, grantId, expired),
    expiresAt: expired.expiresAt,
    scopes: expired.scopes,
    status: "active",
  };
  let reauthorizationRequired = false;
  const repository = {
    async load() { return record; },
    async claim(_business, _tenant, lockId) { return { ...record, lockId, acquired: true }; },
    async save() { throw new Error("database unavailable"); },
    async release(_business, _grant, _lock, requiresReauthorization) {
      reauthorizationRequired = requiresReauthorization;
    },
  };
  await assert.rejects(getXeroAccessToken(config, repository, businessId,
    "d7700000-0000-4000-8000-000000000001", async () => tokenResponse(), Date.now()),
  (error) => error instanceof XeroOAuthError && error.code === "provider");
  assert.equal(reauthorizationRequired, true);
});
