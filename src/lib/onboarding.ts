export type OnboardingProgress = {
  business_ready: boolean;
  venue_ready: boolean;
  staff_ready: boolean;
  shift_ready: boolean;
  publication_ready: boolean;
};

export function parseOnboardingProgress(value: unknown): OnboardingProgress | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row: unknown = value[0];
  if (typeof row !== "object" || row === null ||
    !("business_ready" in row) || typeof row.business_ready !== "boolean" ||
    !("venue_ready" in row) || typeof row.venue_ready !== "boolean" ||
    !("staff_ready" in row) || typeof row.staff_ready !== "boolean" ||
    !("shift_ready" in row) || typeof row.shift_ready !== "boolean" ||
    !("publication_ready" in row) || typeof row.publication_ready !== "boolean") {
    return null;
  }
  return {
    business_ready: row.business_ready,
    venue_ready: row.venue_ready,
    staff_ready: row.staff_ready,
    shift_ready: row.shift_ready,
    publication_ready: row.publication_ready,
  };
}
