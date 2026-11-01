import { Temporal } from "@js-temporal/polyfill";
import {
  availabilityForDate,
  type AvailabilityException,
  type AvailabilityInterval,
} from "./availability.ts";

export type ShiftConflict =
  | "invalid-duration"
  | "overlapping-shift"
  | "blocked-date"
  | "approved-leave"
  | "recurring-availability";

const nanosecondsPerMinute = 60 * 1_000_000_000;
const nanosecondsPerDay = 24 * 60 * nanosecondsPerMinute;

function wallTimeNanoseconds(value: Temporal.PlainDateTime) {
  return ((value.hour * 60 + value.minute) * 60 + value.second) * 1_000_000_000 +
    value.millisecond * 1_000_000 + value.microsecond * 1_000 + value.nanosecond;
}

export function shiftConflicts({
  startsAt,
  endsAt,
  timezone,
  intervals,
  exceptions,
}: {
  startsAt: string;
  endsAt: string;
  timezone: string;
  intervals: AvailabilityInterval[] | null;
  exceptions: AvailabilityException[];
}): ShiftConflict[] {
  let start = Temporal.Instant.from(startsAt);
  const end = Temporal.Instant.from(endsAt);
  const duration = end.epochNanoseconds - start.epochNanoseconds;
  if (duration <= BigInt(0)) throw new RangeError("Shift end must be after its start.");
  if (duration > BigInt(nanosecondsPerDay)) return ["invalid-duration"];

  const conflicts = new Set<ShiftConflict>();
  while (Temporal.Instant.compare(start, end) < 0) {
    const startZoned = start.toZonedDateTimeISO(timezone);
    const transition = startZoned.getTimeZoneTransition("next")?.toInstant();
    const segmentEnd = transition && Temporal.Instant.compare(transition, end) < 0
      ? transition : end;
    let localStart = startZoned.toPlainDateTime();
    const localEnd = Temporal.Instant.fromEpochNanoseconds(
      segmentEnd.epochNanoseconds - BigInt(1),
    ).toZonedDateTimeISO(timezone).toPlainDateTime().add({ nanoseconds: 1 });

    while (Temporal.PlainDateTime.compare(localStart, localEnd) < 0) {
      const date = localStart.toPlainDate();
      const midnight = date.add({ days: 1 }).toPlainDateTime();
      const localStop = Temporal.PlainDateTime.compare(localEnd, midnight) < 0
        ? localEnd : midnight;
      const startTime = wallTimeNanoseconds(localStart);
      const endTime = localStop.equals(midnight)
        ? nanosecondsPerDay : wallTimeNanoseconds(localStop);
      const availability = availabilityForDate(date.toString(), intervals, exceptions);

      if (availability.blocked) conflicts.add("blocked-date");
      if (availability.approvedLeave) conflicts.add("approved-leave");
      if (!availability.blocked && !availability.approvedLeave &&
        availability.unavailable?.some((period) =>
          startTime < period.end * nanosecondsPerMinute &&
          endTime > period.start * nanosecondsPerMinute)) {
        conflicts.add("recurring-availability");
      }
      localStart = localStop;
    }
    start = segmentEnd;
  }

  return (["blocked-date", "approved-leave", "recurring-availability"] as const)
    .filter((conflict) => conflicts.has(conflict));
}
