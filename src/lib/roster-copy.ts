export type RosterCopyState = {
  errors: { sourceWeek?: string; form?: string };
  values?: { sourceWeek: string; requestId: string };
};

export function isRosterWeek(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}

export function rosterCopyError(code: string, message: string): string {
  if (code === "P0001") {
    switch (message) {
      case "An employee is unavailable for a copied shift":
        return "A worker is unavailable or has approved leave in the target week. No shifts were copied.";
      case "A copied shift overlaps an existing shift":
      case "Employee has an overlapping shift":
        return "A copied shift overlaps an existing shift. No shifts were copied.";
      case "Employee is not qualified for this role":
        return "A worker is no longer qualified for a copied role. No shifts were copied.";
      case "Employee is not eligible for this department":
        return "A worker is no longer active or eligible for this department. No shifts were copied.";
      case "Roster changed while copying; please try again":
      case "Roster changed while scheduling; please try again":
        return "The roster is being changed. Wait for the other change to finish, then try again.";
      case "A source shift crosses a clock change and cannot be copied safely":
      case "A copied shift crosses a clock change and cannot be copied safely":
        return "A source or copied shift crosses a clock change. Create that shift manually instead.";
      case "Invalid shift duration":
      case "Invalid availability comparison":
      case "Invalid shift details":
        return "A source shift has invalid details or lasts longer than 24 hours. No shifts were copied.";
      case "Job role is inactive":
        return "A copied job role is inactive. Reactivate it or create the shifts manually.";
      case "Assign or remove the acknowledgement requirement before copying":
        return "A source open shift requires acknowledgement. Assign a worker or remove that requirement before copying.";
      case "Start time does not exist in venue timezone":
      case "End time does not exist in venue timezone":
        return "A copied time does not exist when the clocks change. Choose another week or create the shifts manually.";
      case "Request identifier already used":
        return "This copy request was already used for different dates. Reload the roster before starting a new copy.";
      case "Permission denied":
      case "Venue or active department not found":
        return "You cannot copy this department's roster, or the department is no longer active.";
    }
  }
  return "We couldn't confirm the copy result. Retry this same request, or reload the target roster before starting another copy.";
}
