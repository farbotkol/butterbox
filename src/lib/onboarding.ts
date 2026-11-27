export type OnboardingProgress = {
  business_ready: boolean;
  venue_ready: boolean;
  staff_ready: boolean;
  shift_ready: boolean;
  publication_ready: boolean;
};

export function canViewOnboardingProgress(role: string): boolean {
  return role === "owner";
}

export function getOnboardingProgress(
  result: { data: unknown; error: unknown } | null,
): OnboardingProgress | null {
  if (!result || result.error) return null;
  return parseOnboardingProgress(result.data);
}

export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  return progress.business_ready && progress.venue_ready && progress.staff_ready &&
    progress.shift_ready && progress.publication_ready;
}

export type OnboardingDashboardState =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "incomplete"; progress: OnboardingProgress }
  | { status: "complete"; progress: OnboardingProgress };

// `undefined` means the progress request has not resolved yet; `null` means it produced no result.
export function getOnboardingDashboardState(
  role: string,
  result: { data: unknown; error: unknown } | null | undefined,
): OnboardingDashboardState {
  if (!canViewOnboardingProgress(role)) return { status: "unavailable" };
  if (result === undefined) return { status: "loading" };
  const progress = getOnboardingProgress(result);
  if (!progress) return { status: "error" };
  return isOnboardingComplete(progress)
    ? { status: "complete", progress }
    : { status: "incomplete", progress };
}

// Only a loading placeholder, an incomplete checklist or an error notice occupies space on the dashboard.
export function getOnboardingSection(state: OnboardingDashboardState): "loading" | "checklist" | "error" | "none" {
  if (state.status === "loading") return "loading";
  if (state.status === "incomplete") return "checklist";
  return state.status === "error" ? "error" : "none";
}

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
