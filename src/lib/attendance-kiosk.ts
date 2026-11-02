import { parseBusinessId } from "./business-selection.ts";

export const kioskCookieName = "__Secure-bb_kiosk";
export const kioskCookiePath = "/kiosk";

const credentialPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][0-9a-f]{64}$/;

export type KioskSetupState = {
  error: string | null;
  activationCode: string | null;
  expiresAt: string | null;
};

export type Kiosk = {
  kioskId: string;
  name: string;
  createdAt: string;
  activatedAt: string | null;
  sessionExpiresAt: string | null;
  revokedAt: string | null;
};

export type KioskDisplayCode = {
  qrCode: string;
  businessId: string;
  venueId: string;
  venueName: string;
  expiresAt: string;
  serverAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function optionalTimestamp(value: unknown): value is string | null {
  return value === null || timestamp(value);
}

export function isKioskCredential(value: unknown): value is string {
  return typeof value === "string" && credentialPattern.test(value);
}

export function singleFormString(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

export function parseKioskContext(formData: FormData) {
  const businessId = parseBusinessId(singleFormString(formData, "business_id"));
  const venueId = parseBusinessId(singleFormString(formData, "venue_id"));
  return businessId && venueId ? { businessId, venueId } : null;
}

export function parseKioskCreation(value: unknown) {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  const kioskId = parseBusinessId(row.kiosk_id);
  if (!kioskId || !isKioskCredential(row.activation_code) ||
    !row.activation_code.startsWith(`${kioskId}.`) || !timestamp(row.activation_expires_at)) return null;
  return { kioskId, activationCode: row.activation_code, expiresAt: row.activation_expires_at };
}

export function parseKioskActivation(value: unknown) {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  if (!isKioskCredential(row.session_code) || !timestamp(row.session_expires_at)) return null;
  return { sessionCode: row.session_code, expiresAt: row.session_expires_at };
}

export function parseKioskDisplay(value: unknown): KioskDisplayCode | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  const businessId = parseBusinessId(row.business_id);
  const venueId = parseBusinessId(row.venue_id);
  if (!businessId || !venueId || !isKioskCredential(row.qr_code) ||
    typeof row.venue_name !== "string" || !row.venue_name.trim() ||
    !timestamp(row.expires_at) || !timestamp(row.server_at)) return null;
  const lifetime = Date.parse(row.expires_at) - Date.parse(row.server_at);
  if (lifetime <= 0 || lifetime > 45_000) return null;
  return {
    qrCode: row.qr_code, businessId, venueId, venueName: row.venue_name,
    expiresAt: row.expires_at, serverAt: row.server_at,
  };
}

export function parseKioskDisplayResponse(value: unknown): KioskDisplayCode | null {
  if (!isRecord(value)) return null;
  return parseKioskDisplay([{
    qr_code: value.qrCode, business_id: value.businessId, venue_id: value.venueId,
    venue_name: value.venueName, expires_at: value.expiresAt, server_at: value.serverAt,
  }]);
}

export function parseKioskList(value: unknown): Kiosk[] | null {
  if (!Array.isArray(value)) return null;
  const result: Kiosk[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isRecord(row)) return null;
    const kioskId = parseBusinessId(row.kiosk_id);
    if (!kioskId || seen.has(kioskId) || typeof row.name !== "string" || !row.name.trim() ||
      row.name.length > 60 || !timestamp(row.created_at) || !optionalTimestamp(row.activated_at) ||
      !optionalTimestamp(row.session_expires_at) || !optionalTimestamp(row.revoked_at)) return null;
    seen.add(kioskId);
    result.push({
      kioskId, name: row.name, createdAt: row.created_at, activatedAt: row.activated_at,
      sessionExpiresAt: row.session_expires_at, revokedAt: row.revoked_at,
    });
  }
  return result;
}
