import { parseBusinessId } from "./business-selection.ts";

export function singleFormString(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

export function parseBusinessVenueContext(formData: FormData) {
  const businessId = parseBusinessId(singleFormString(formData, "business_id"));
  const venueId = parseBusinessId(singleFormString(formData, "venue_id"));
  return businessId && venueId ? { businessId, venueId } : null;
}
