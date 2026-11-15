import "server-only";
import {
  loadXeroOAuthConfig, XeroOAuthError,
  type XeroOAuthConfig,
} from "./xero-oauth.ts";
import {
  getXeroAccessToken, type XeroRefreshClaim, type XeroTokenRecord, type XeroTokenRepository,
} from "./xero-token-manager.ts";

type RpcResponse = { data: unknown; error: unknown };
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResponse> };

function oneRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function parseTokenRecord(row: Record<string, unknown> | null): XeroTokenRecord | null {
  if (!row || typeof row.grant_id !== "string" ||
    typeof row.encrypted_tokens !== "string" || typeof row.expires_at !== "string" ||
    !Array.isArray(row.scopes) || row.scopes.some((scope) => typeof scope !== "string") ||
    (row.status !== "active" && row.status !== "reauthorization_required" &&
      row.status !== "revocation_pending")) return null;
  return {
    grantId: row.grant_id,
    encryptedTokens: row.encrypted_tokens,
    expiresAt: row.expires_at,
    scopes: row.scopes as string[],
    status: row.status,
  };
}

function failure(error: unknown): XeroOAuthError {
  const row = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return new XeroOAuthError(row.code === "42501" ? "permission" : "provider");
}

export function xeroConfig(): XeroOAuthConfig {
  return loadXeroOAuthConfig();
}

export function xeroTokenRepository(client: unknown): XeroTokenRepository {
  const rpcClient = client as RpcClient;
  return {
    async load(businessId, tenantId) {
      const { data, error } = await rpcClient.rpc("get_xero_oauth_tenant_grant", {
        p_business_id: businessId,
        p_tenant_id: tenantId,
      });
      if (error) throw failure(error);
      return parseTokenRecord(oneRow(data));
    },
    async claim(businessId, tenantId, lockId) {
      const { data, error } = await rpcClient.rpc("claim_xero_oauth_refresh", {
        p_business_id: businessId,
        p_tenant_id: tenantId,
        p_lock_id: lockId,
      });
      if (error) throw failure(error);
      const row = oneRow(data);
      const tokenRecord = parseTokenRecord(row);
      return tokenRecord && typeof row?.acquired === "boolean"
        ? { ...tokenRecord, acquired: row.acquired } satisfies XeroRefreshClaim
        : null;
    },
    async save(businessId, grantId, lockId, encryptedTokens, expiresAt, scopes) {
      const { data, error } = await rpcClient.rpc("save_xero_oauth_refresh", {
        p_business_id: businessId,
        p_grant_id: grantId,
        p_lock_id: lockId,
        p_encrypted_tokens: encryptedTokens,
        p_expires_at: expiresAt,
        p_scopes: scopes,
      });
      if (error) throw failure(error);
      return data === true;
    },
    async release(businessId, grantId, lockId, reauthorizationRequired) {
      const { error } = await rpcClient.rpc("release_xero_oauth_refresh", {
        p_business_id: businessId,
        p_grant_id: grantId,
        p_lock_id: lockId,
        p_reauthorization_required: reauthorizationRequired,
      });
      if (error) throw failure(error);
    },
  };
}

export function getXeroAccessTokenForTenant(
  client: unknown,
  businessId: string,
  tenantId: string,
): Promise<string> {
  const config = xeroConfig();
  return getXeroAccessToken(config, xeroTokenRepository(client), businessId, tenantId);
}

export async function getXeroTenantGrant(
  client: unknown,
  businessId: string,
  tenantId: string,
): Promise<(XeroTokenRecord & { tenantCount: number }) | null> {
  const rpcClient = client as RpcClient;
  const { data, error } = await rpcClient.rpc("get_xero_oauth_tenant_grant", {
    p_business_id: businessId,
    p_tenant_id: tenantId,
  });
  if (error) throw failure(error);
  const row = oneRow(data);
  const record = parseTokenRecord(row);
  if (!record || typeof row?.tenant_count !== "number" || !Number.isSafeInteger(row.tenant_count)) return null;
  return { ...record, tenantCount: row.tenant_count };
}
