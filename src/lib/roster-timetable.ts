import { addDays, localMidnightAsUtc } from "./dates.ts";

export type RosterTimelineTick = { position: number; label: string };

export function rosterDayTimeline(date: string, timezone: string) {
  const startsAt = Date.parse(localMidnightAsUtc(date, timezone));
  const endsAt = Date.parse(localMidnightAsUtc(addDays(date, 1), timezone));
  const durationMinutes = (endsAt - startsAt) / 60_000;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const ticks: RosterTimelineTick[] = [];
  for (let elapsedMinutes = 0; elapsedMinutes < durationMinutes; elapsedMinutes += 1) {
    const instant = new Date(startsAt + elapsedMinutes * 60_000);
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
    if (parts.minute !== "00" || !["00", "06", "12", "18"].includes(parts.hour)) continue;
    const hour = Number(parts.hour);
    ticks.push({
      position: (elapsedMinutes / durationMinutes) * 100,
      label: `${parts.hour}:00`,
    });
    if (hour === 0 && elapsedMinutes > 0) break;
  }
  ticks.push({ position: 100, label: "24:00" });

  return { startsAt, endsAt, durationMinutes, ticks };
}

export function rosterShiftTimelinePosition(
  startsAt: string,
  endsAt: string,
  date: string,
  timezone: string,
) {
  const day = rosterDayTimeline(date, timezone);
  const shiftStart = Date.parse(startsAt);
  const shiftEnd = Date.parse(endsAt);
  if (!day || !Number.isFinite(shiftStart) || !Number.isFinite(shiftEnd) ||
    shiftStart < day.startsAt || shiftStart >= day.endsAt || shiftEnd <= shiftStart) return null;

  const visibleEnd = Math.min(shiftEnd, day.endsAt);
  return {
    top: ((shiftStart - day.startsAt) / (day.endsAt - day.startsAt)) * 100,
    height: ((visibleEnd - shiftStart) / (day.endsAt - day.startsAt)) * 100,
    continuesPastMidnight: shiftEnd > day.endsAt,
  };
}
