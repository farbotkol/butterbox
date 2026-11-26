import { parseVenueGeofence } from "./venue-geofence.ts";

export type VenueSettingsValues = {
  weekday: string;
  mode: string;
  manual_unavailability: string;
  publish_unavailability: string;
  publish_overlap: string;
  publish_long_shift: string;
  latitude: string;
  longitude: string;
  radius_meters: string;
  enabled: string;
};

export type VenueSettingsField = keyof VenueSettingsValues;
export type VenueSettingsSection =
  | "planningWeek"
  | "publicationMode"
  | "conflictPolicy"
  | "venueLocation"
  | "clockVerification";

export type VenueSettingsErrors = Partial<Record<VenueSettingsField | "form", string>>;
export type VenueSettingsSaveState = {
  status: "idle" | "saved" | "unchanged" | "error" | "partial";
  message?: string;
  errors?: VenueSettingsErrors;
  savedSections?: VenueSettingsSection[];
};

export const venueSettingsFields: VenueSettingsField[] = [
  "weekday", "mode", "manual_unavailability", "publish_unavailability", "publish_overlap",
  "publish_long_shift", "latitude", "longitude", "radius_meters", "enabled",
];

export const venueSettingsSectionFields: Record<VenueSettingsSection, VenueSettingsField[]> = {
  planningWeek: ["weekday"],
  publicationMode: ["mode"],
  conflictPolicy: [
    "manual_unavailability", "publish_unavailability", "publish_overlap", "publish_long_shift",
  ],
  venueLocation: ["latitude", "longitude", "radius_meters"],
  clockVerification: ["enabled"],
};

function sameSettingValue(field: VenueSettingsField, current: string, desired: string) {
  if ((field === "latitude" || field === "longitude" || field === "radius_meters") &&
    current.trim() && desired.trim()) {
    return Number(current) === Number(desired);
  }
  return current === desired;
}

export function parseVenueSettingsForm(formData: FormData): VenueSettingsValues | null {
  const entries = Object.fromEntries(venueSettingsFields.map((field) => {
    const values = formData.getAll(field);
    return [field, values.length === 1 && typeof values[0] === "string" ? values[0] : null];
  }));
  if (Object.values(entries).some((value) => value === null)) return null;
  return entries as VenueSettingsValues;
}

export function changedVenueSettingsSections(
  current: VenueSettingsValues,
  desired: VenueSettingsValues,
): VenueSettingsSection[] {
  return (Object.keys(venueSettingsSectionFields) as VenueSettingsSection[])
    .filter((section) => venueSettingsSectionFields[section]
      .some((field) => !sameSettingValue(field, current[field], desired[field])));
}

export function venueSettingsSaveOrder(
  current: VenueSettingsValues,
  desired: VenueSettingsValues,
): VenueSettingsSection[] {
  const changed = changedVenueSettingsSections(current, desired);
  const locationOrder: VenueSettingsSection[] = current.enabled === "true" && desired.enabled === "false"
    ? ["clockVerification", "venueLocation"]
    : ["venueLocation", "clockVerification"];
  return [
    ...(["planningWeek", "publicationMode", "conflictPolicy"] as const).filter((section) => changed.includes(section)),
    ...locationOrder.filter((section) => changed.includes(section)),
  ];
}

export function mergeSavedVenueSettings(
  baseline: VenueSettingsValues,
  submitted: VenueSettingsValues,
  savedSections: VenueSettingsSection[],
): VenueSettingsValues {
  const next = { ...baseline };
  for (const section of savedSections) {
    for (const field of venueSettingsSectionFields[section]) next[field] = submitted[field];
  }
  return next;
}

function validCoordinate(value: string, limit: number) {
  if (!value || value.length > 32 || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return false;
  const fraction = value.split(".")[1]?.replace(/0+$/, "") ?? "";
  const parsed = Number(value);
  return fraction.length <= 6 && Number.isFinite(parsed) && Math.abs(parsed) <= limit;
}

function validRadius(value: string) {
  return /^\d{1,5}$/.test(value) && Number(value) >= 1 && Number(value) <= 10000;
}

export function validateVenueSettings(values: VenueSettingsValues): VenueSettingsErrors {
  const errors: VenueSettingsErrors = {};
  if (!/^[1-7]$/.test(values.weekday)) errors.weekday = "Choose a planning week start from Monday to Sunday.";
  if (values.mode !== "direct" && values.mode !== "approval") {
    errors.mode = "Choose direct publication or approval required.";
  }
  for (const field of [
    "manual_unavailability", "publish_unavailability", "publish_overlap", "publish_long_shift",
  ] as const) {
    if (values[field] !== "true" && values[field] !== "false") {
      errors[field] = "Choose whether this rule warns or blocks.";
    }
  }
  if (values.enabled !== "true" && values.enabled !== "false") {
    errors.enabled = "Choose whether clock location verification is on or off.";
  }

  const allLocationFieldsBlank = !values.latitude.trim() && !values.longitude.trim() && !values.radius_meters.trim();
  if (!allLocationFieldsBlank) {
    if (!validCoordinate(values.latitude.trim(), 90)) {
      errors.latitude = "Enter a latitude from -90 to 90 with no more than six decimal places.";
    }
    if (!validCoordinate(values.longitude.trim(), 180)) {
      errors.longitude = "Enter a longitude from -180 to 180 with no more than six decimal places.";
    }
    if (!validRadius(values.radius_meters.trim())) {
      errors.radius_meters = "Enter a whole-number radius from 1 to 10,000 metres.";
    }
  }
  if (Object.keys(errors).length === 0) {
    const geofence = parseVenueGeofence({
      latitude: values.latitude, longitude: values.longitude, radiusMeters: values.radius_meters,
    });
    if (!geofence.valid) {
      errors.form = "Enter a valid venue location, or clear all three location fields.";
    } else if (values.enabled === "true" && geofence.latitude === null) {
      errors.enabled = "A venue location is required while clock location verification is on. Configure a location or turn verification off.";
    }
  }
  return errors;
}

export function venueSettingsSaveButtonState(dirty: boolean, pending: boolean, saveAvailable = true) {
  return {
    disabled: !dirty || pending || !saveAvailable,
    label: pending ? "Saving..." : "Save changes",
  };
}

export async function runVenueSettingsOperations(
  order: VenueSettingsSection[],
  save: (section: VenueSettingsSection) => Promise<string | null>,
) {
  const savedSections: VenueSettingsSection[] = [];
  for (const section of order) {
    let error: string | null;
    try {
      error = await save(section);
    } catch {
      error = "save";
    }
    if (error) return { savedSections, failedSection: section, error };
    savedSections.push(section);
  }
  return { savedSections, failedSection: null, error: null };
}
