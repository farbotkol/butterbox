import type { ClockOption } from "../src/lib/attendance";
import type { OfflineAttendanceClaim } from "../src/lib/offline-attendance";

export type OfflineContext = {
  actorId: string;
  businessId: string;
  venueId: string;
  sessionId: string;
  authCookieName: string;
  options: ClockOption[];
};

export const offlineContextKey: string;
export const sessionEventKey: string;
export const offlineShellCache: string;
export const offlineShellAssets: string[];
export function parseOfflineAttendanceClaim(value: unknown): OfflineAttendanceClaim | null;
export function parseOfflineContext(value: unknown): OfflineContext | null;
export function browserSessionIdentity(
  cookies: string, cookieName: string,
): { actorId: string; sessionId: string } | null;
export function sealOfflineContext(context: OfflineContext, passphrase: string): Promise<string>;
export function openOfflineContext(envelope: string, passphrase: string): Promise<OfflineContext>;
export function saveOfflineClaim(claim: OfflineAttendanceClaim): Promise<void>;
export function removeOfflineClaim(requestId: string): Promise<void>;
export function listOfflineClaims(actorId: string, businessId: string): Promise<OfflineAttendanceClaim[]>;
