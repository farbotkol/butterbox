export const BUSINESS_PREFERENCE_COOKIE = "bb_business";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseBusinessId(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !uuidPattern.test(value)) return null;
  return value.toLowerCase();
}

export type BusinessSelectionInput<T extends { business_id: string }> = {
  memberships: readonly T[];
  // Explicit request context: URL `business`, form `business_id`, or the business owning a requested venue.
  requested: readonly (string | null | undefined)[];
  // Non-authoritative UI preference; pages only. Never pass it for mutations.
  preference?: string | null;
};

export type BusinessSelection<T> =
  | { kind: "selected"; membership: T }
  | { kind: "choose" }
  | { kind: "forbidden" }
  | { kind: "none" };

export function selectBusinessMembership<T extends { business_id: string }>(
  { memberships, requested, preference }: BusinessSelectionInput<T>,
): BusinessSelection<T> {
  if (requested.some((value) => value === null)) return { kind: "forbidden" };
  const explicit = [...new Set(requested.filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase()))];
  if (explicit.length > 1) return { kind: "forbidden" };
  const find = (businessId: string) =>
    memberships.find((membership) => membership.business_id.toLowerCase() === businessId);
  if (explicit.length === 1) {
    const membership = find(explicit[0]);
    return membership ? { kind: "selected", membership } : { kind: "forbidden" };
  }
  if (memberships.length === 0) return { kind: "none" };
  if (memberships.length === 1) return { kind: "selected", membership: memberships[0] };
  const preferred = typeof preference === "string" ? find(preference.toLowerCase()) : undefined;
  return preferred ? { kind: "selected", membership: preferred } : { kind: "choose" };
}

export function withBusiness(path: string, businessId: string) {
  const [base, hash] = path.split("#", 2);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}business=${encodeURIComponent(businessId)}${hash === undefined ? "" : `#${hash}`}`;
}
