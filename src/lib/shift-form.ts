export type ShiftField = "form" | "role" | "employee" | "start" | "end" | "break";
export type ShiftFormValues = {
  role: string;
  employee: string;
  start: string;
  end: string;
  break: string;
};
export type ShiftFormState = {
  errors: Partial<Record<ShiftField, string>>;
  values?: ShiftFormValues;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isLocalDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(`${value}:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 16) === value;
}

export function validateShiftForm(values: ShiftFormValues, editing: boolean): ShiftFormState {
  const errors: ShiftFormState["errors"] = {};
  if (!values.role.trim() || values.role.trim().length > 80) {
    errors.role = "Enter a role of up to 80 characters.";
  }
  if (values.employee && !uuid.test(values.employee) && !(values.employee === "auto" && !editing)) {
    errors.employee = "Choose an available team member or an open shift.";
  }
  if (!isLocalDateTime(values.start)) errors.start = "Enter a valid start date and time.";
  if (!isLocalDateTime(values.end)) {
    errors.end = "Enter a valid end date and time.";
  } else if (!errors.start && values.end.slice(0, 10) < values.start.slice(0, 10)) {
    errors.end = "The end date cannot be before the start date.";
  }
  const breakMinutes = values.break === "" ? 0 : Number(values.break);
  if ((values.break !== "" && !/^\d+$/.test(values.break)) ||
    !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 240) {
    errors.break = "Enter a whole number from 0 to 240 minutes.";
  }
  return { errors };
}
