export type ConflictPolicyValues = {
  manual_unavailability: boolean;
  publish_unavailability: boolean;
  publish_overlap: boolean;
  publish_long_shift: boolean;
};

function booleanField(formData: FormData, name: string) {
  const values = formData.getAll(name);
  if (values.length !== 1) return null;
  return values[0] === "true" ? true : values[0] === "false" ? false : null;
}

export function parseConflictPolicy(formData: FormData): ConflictPolicyValues | null {
  const manual = booleanField(formData, "manual_unavailability");
  const unavailable = booleanField(formData, "publish_unavailability");
  const overlap = booleanField(formData, "publish_overlap");
  const longShift = booleanField(formData, "publish_long_shift");
  if (manual === null || unavailable === null || overlap === null || longShift === null) return null;
  return {
    manual_unavailability: manual,
    publish_unavailability: unavailable,
    publish_overlap: overlap,
    publish_long_shift: longShift,
  };
}
