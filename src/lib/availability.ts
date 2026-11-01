export type AvailabilityInterval = {
  weekday: number;
  start_minute: number;
  end_minute: number;
};

export type UnavailablePeriod = { start: number; end: number };
export type AvailabilityException = {
  starts_on: string;
  ends_on: string;
  exception_type: string;
  status: string;
};

const minutesPerDay = 24 * 60;
const minutesPerWeek = 7 * minutesPerDay;

export function unavailablePeriods(
  date: string,
  intervals: AvailabilityInterval[],
): UnavailablePeriod[] {
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const dayStart = weekday * minutesPerDay;
  const dayEnd = dayStart + minutesPerDay;
  const available: UnavailablePeriod[] = [];

  for (const interval of intervals) {
    const start = (interval.weekday - 1) * minutesPerDay + interval.start_minute;
    const duration =
      (interval.end_minute - interval.start_minute + minutesPerDay) % minutesPerDay ||
      minutesPerDay;
    for (const offset of [-minutesPerWeek, 0, minutesPerWeek]) {
      const from = Math.max(start + offset, dayStart);
      const to = Math.min(start + offset + duration, dayEnd);
      if (from < to) available.push({ start: from - dayStart, end: to - dayStart });
    }
  }

  available.sort((a, b) => a.start - b.start || a.end - b.end);
  const unavailable: UnavailablePeriod[] = [];
  let cursor = 0;
  for (const period of available) {
    if (period.start > cursor) unavailable.push({ start: cursor, end: period.start });
    cursor = Math.max(cursor, period.end);
  }
  if (cursor < minutesPerDay) unavailable.push({ start: cursor, end: minutesPerDay });
  return unavailable;
}

export function formatWallTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function validExceptionDates(start: string, end: string) {
  function parseDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return NaN;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
      ? date.valueOf()
      : NaN;
  }
  const startTime = parseDate(start);
  const endTime = parseDate(end);
  return Number.isFinite(startTime) && Number.isFinite(endTime) &&
    endTime >= startTime && endTime - startTime <= 365 * 24 * 60 * 60 * 1000;
}

export function availabilityForDate(
  date: string,
  intervals: AvailabilityInterval[] | null,
  exceptions: AvailabilityException[],
) {
  const relevant = exceptions.filter((item) => item.starts_on <= date && date <= item.ends_on);
  const blocked = relevant.some((item) => item.exception_type === "unavailable" && item.status === "active");
  const approvedLeave = relevant.some((item) => item.exception_type === "leave" && item.status === "approved");
  const pendingLeave = relevant.some((item) => item.exception_type === "leave" && item.status === "pending");
  return {
    blocked,
    approvedLeave,
    pendingLeave,
    unavailable: blocked || approvedLeave
      ? [{ start: 0, end: minutesPerDay }]
      : intervals === null ? null : unavailablePeriods(date, intervals),
  };
}
