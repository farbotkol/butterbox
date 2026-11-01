import { addDays, getVenueDate, localMidnightAsUtc } from "./dates.ts";

export type EmployeeScheduleShift = {
  id: string;
  role_title: string;
  starts_at: string;
  ends_at: string;
};

export function groupEmployeeSchedule(
  week: string,
  shifts: readonly EmployeeScheduleShift[],
  timezone: string,
) {
  const start = Date.parse(localMidnightAsUtc(week, timezone));
  const end = Date.parse(localMidnightAsUtc(addDays(week, 7), timezone));
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: addDays(week, index),
    shifts: [] as EmployeeScheduleShift[],
  }));
  const byDate = new Map(days.map((day) => [day.date, day]));

  for (const shift of shifts) {
    if (Date.parse(shift.starts_at) >= end || Date.parse(shift.ends_at) <= start) continue;
    const localDate = getVenueDate(shift.starts_at, timezone);
    byDate.get(localDate < week ? week : localDate)?.shifts.push(shift);
  }
  for (const day of days) {
    day.shifts.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id));
  }
  return days;
}
