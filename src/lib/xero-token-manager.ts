import { randomUUID } from "node:crypto";
import {
  decryptXeroTokenSet, encryptXeroTokenSet, refreshXeroTokenSet,
  type XeroOAuthConfig, XeroOAuthError,
} from "./xero-oauth.ts";

export type XeroTokenRecord = {
  grantId: string;
  encryptedTokens: string;
  expiresAt: string;
  scopes: string[];
  status: "active" | "reauthorization_required" | "revocation_pending";
};

export type XeroRefreshClaim = XeroTokenRecord & { acquired: boolean };

export type XeroTokenRepository = {
  load(businessId: string, tenantId: string): Promise<XeroTokenRecord | null>;
  claim(businessId: string, tenantId: string, lockId: string): Promise<XeroRefreshClaim | null>;
  save(
    businessId: string,
    grantId: string,
    lockId: string,
    encryptedTokens: string,
    expiresAt: string,
    scopes: string[],
  ): Promise<boolean>;
  release(businessId: string, grantId: string, lockId: string, reauthorizationRequired: boolean): Promise<void>;
};

export async function getXeroAccessToken(
  config: XeroOAuthConfig,
  repository: XeroTokenRepository,
  businessId: string,
  tenantId: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<string> {
  const record = await repository.load(businessId, tenantId);
  if (!record) throw new XeroOAuthError("permission");
  if (record.status === "reauthorization_required") throw new XeroOAuthError("reauthorization");
  if (record.status !== "active") throw new XeroOAuthError("provider");
  const tokens = decryptXeroTokenSet(config, businessId, record.grantId, record.encryptedTokens);
  const expiry = Date.parse(tokens.expiresAt);
  if (!Number.isFinite(expiry)) throw new XeroOAuthError("invalid_response");
  if (expiry > now + 60_000) return tokens.accessToken;

  const lockId = randomUUID();
  const claim = await repository.claim(businessId, tenantId, lockId);
  if (!claim) throw new XeroOAuthError("provider");
  if (!claim.acquired) {
    if (claim.status === "reauthorization_required") throw new XeroOAuthError("reauthorization");
    const updated = await repository.load(businessId, tenantId);
    if (updated?.status === "active") {
      const current = decryptXeroTokenSet(config, businessId, updated.grantId, updated.encryptedTokens);
      if (Date.parse(current.expiresAt) > now + 30_000) return current.accessToken;
    }
    throw new XeroOAuthError("provider");
  }

  let reauthorizationRequired = false;
  try {
    const current = decryptXeroTokenSet(config, businessId, claim.grantId, claim.encryptedTokens);
    if (claim.status !== "active") {
      throw new XeroOAuthError(claim.status === "reauthorization_required" ? "reauthorization" : "provider");
    }
    if (Date.parse(current.expiresAt) > now + 60_000) {
      const saved = await repository.save(
        businessId, claim.grantId, lockId, claim.encryptedTokens, claim.expiresAt, claim.scopes,
      );
      if (!saved) throw new XeroOAuthError("provider");
      return current.accessToken;
    }
    const refreshed = await refreshXeroTokenSet(config, current, fetcher);
    if (refreshed.refreshToken === current.refreshToken) {
      reauthorizationRequired = true;
      throw new XeroOAuthError("reauthorization");
    }
    reauthorizationRequired = true;
    const encryptedTokens = encryptXeroTokenSet(config, businessId, claim.grantId, refreshed);
    const saved = await repository.save(
      businessId, claim.grantId, lockId, encryptedTokens, refreshed.expiresAt, refreshed.scopes,
    );
    if (!saved) {
      throw new XeroOAuthError("provider");
    }
    reauthorizationRequired = false;
    return refreshed.accessToken;
  } catch (error) {
    reauthorizationRequired = reauthorizationRequired ||
      (error instanceof XeroOAuthError && error.code === "reauthorization");
    const failure = error instanceof XeroOAuthError ? error : new XeroOAuthError("provider");
    try {
      await repository.release(businessId, claim.grantId, lockId, reauthorizationRequired);
    } catch {
      // The database lease expires if the process cannot release it.
    }
    throw failure;
  }
}
