import { addDays, localMidnightAsUtc } from "./dates.ts";

export type RosterTimelineTick = { position: number; label: string };

type RosterDayTimeline = {
  startsAt: number;
  endsAt: number;
  durationMinutes: number;
  ticks: RosterTimelineTick[];
};

const dayTimelineCache = new Map<string, RosterDayTimeline>();

function localHourAsUtc(date: string, hour: number, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const represented = Date.UTC(
      Number(values.year), Number(values.month) - 1, Number(values.day),
      Number(values.hour), Number(values.minute), Number(values.second),
    );
    guess += target - represented;
  }
  return guess;
}

export function rosterDayTimeline(date: string, timezone: string) {
  const cacheKey = `${timezone}:${date}`;
  const cached = dayTimelineCache.get(cacheKey);
  if (cached) return cached;

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
  const ticks: RosterTimelineTick[] = [{ position: 0, label: "00:00" }];
  for (const hour of [6, 12, 18]) {
    const instant = localHourAsUtc(date, hour, timezone);
    if (instant < startsAt || instant >= endsAt) continue;
    const label = formatter.format(new Date(instant));
    ticks.push({
      position: ((instant - startsAt) / (endsAt - startsAt)) * 100,
      label,
    });
  }
  ticks.push({ position: 100, label: "24:00" });

  const result = { startsAt, endsAt, durationMinutes, ticks };
  if (dayTimelineCache.size >= 400) {
    const oldest = dayTimelineCache.keys().next().value;
    if (oldest) dayTimelineCache.delete(oldest);
  }
  dayTimelineCache.set(cacheKey, result);
  return result;
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
