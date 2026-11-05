type PreferenceInputs = {
  preferredWeeklyHours: string;
  notifyScheduleEmail: string;
  notifyLeaveEmail: string;
};

export function parseEmployeePreferences(inputs: PreferenceInputs) {
  const hours = inputs.preferredWeeklyHours.trim();
  const preferredWeeklyHours = hours === "" ? null : Number(hours);
  if ((hours !== "" && !/^\d{1,3}(?:\.\d{1,2})?$/.test(hours)) ||
    (preferredWeeklyHours !== null && (
      preferredWeeklyHours > 168 || !Number.isInteger(preferredWeeklyHours * 4)
    )) ||
    !["true", "false"].includes(inputs.notifyScheduleEmail) ||
    !["true", "false"].includes(inputs.notifyLeaveEmail)) {
    return { valid: false as const };
  }
  return {
    valid: true as const,
    preferredWeeklyHours,
    notifyScheduleEmail: inputs.notifyScheduleEmail === "true",
    notifyLeaveEmail: inputs.notifyLeaveEmail === "true",
  };
}
