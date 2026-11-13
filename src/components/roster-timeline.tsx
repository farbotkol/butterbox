import Link from "next/link";
import { formatTime } from "@/lib/dates";
import { rosterDayTimeline, rosterShiftTimelinePosition } from "@/lib/roster-timetable";

type TimelineShift = {
  id: string;
  roleTitle: string;
  startsAt: string;
  endsAt: string;
  isPublished: boolean;
};

type CreateSlot = { start: string; href: string };

export function RosterTimelineCell({
  date,
  timezone,
  shifts,
  createSlots = [],
}: {
  date: string;
  timezone: string;
  shifts: TimelineShift[];
  createSlots?: CreateSlot[];
}) {
  const day = rosterDayTimeline(date, timezone);
  if (!day) return null;

  const ticks = day.ticks.filter((tick) => tick.label !== "24:00");
  const availableSlots = createSlots.filter((slot) => {
    const tickIndex = ticks.findIndex((tick) => tick.label === `${slot.start.slice(0, 2)}:00`);
    const tick = ticks[tickIndex];
    const nextTick = day.ticks[tickIndex + 1];
    if (!tick || !nextTick) return false;
    const slotStart = day.startsAt + ((tick.position / 100) * (day.endsAt - day.startsAt));
    const slotEnd = day.startsAt + ((nextTick.position / 100) * (day.endsAt - day.startsAt));
    return !shifts.some((shift) =>
      Date.parse(shift.startsAt) < slotEnd && Date.parse(shift.endsAt) > slotStart,
    );
  });
  return (
    <div role="group" aria-label={`${date} venue-local shift timeline`}
      className="relative h-48 overflow-hidden rounded-md border border-line/70 bg-white">
      {day.ticks.map((tick) => (
        <div key={`${tick.position}:${tick.label}`} aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 z-10 border-t border-line/70 ${
            tick.position === 100 ? "bottom-0" : ""
          }`}
          style={tick.position === 100 ? undefined : { top: `${tick.position}%` }}>
          <span className={`absolute left-0 bg-white px-0.5 text-[9px] leading-3 text-muted ${
            tick.position === 100 ? "bottom-0 -translate-y-full" : "top-0 -translate-y-1/2"
          }`}>
            {tick.label}
          </span>
        </div>
      ))}
      {availableSlots.map((slot, index) => {
        const tickIndex = ticks.findIndex((tick) => tick.label === `${slot.start.slice(0, 2)}:00`);
        const nextTick = day.ticks[tickIndex + 1];
        const tick = ticks[tickIndex];
        if (!tick || !nextTick) return null;
        return (
          <Link key={slot.start} href={slot.href} prefetch={false}
            aria-label={`Add at ${slot.start}, add a shift on ${date}`}
            style={{
              top: `${tick.position}%`,
              height: `${nextTick.position - tick.position}%`,
            }}
            className={`absolute left-10 right-1 z-0 flex min-h-11 items-center justify-center rounded px-1 text-[10px] font-semibold text-ocean underline-offset-2 hover:bg-soft-sea focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-ocean ${
              index % 2 === 0 ? "bg-cloud/70" : "bg-white"
            }`}>
            Add at {slot.start}
          </Link>
        );
      })}
      {shifts.map((shift) => {
        const position = rosterShiftTimelinePosition(shift.startsAt, shift.endsAt, date, timezone);
        if (!position) return null;
        const starts = formatTime(shift.startsAt, timezone);
        const ends = formatTime(shift.endsAt, timezone);
        const status = shift.isPublished ? "Published" : "Draft";
        const label = `${position.continuesFromPreviousDay ? "Continued from previous day, " : ""}${shift.roleTitle}, ${starts} to ${ends}${position.continuesPastMidnight ? ", continues after midnight" : ""}, ${status}`;
        return (
          <div key={shift.id} role="img" aria-label={label} title={label}
            style={{ top: `${position.top}%`, height: `${position.height}%` }}
            className={`absolute left-10 right-1 z-20 overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-[9px] leading-3 ${
              shift.isPublished
                ? "border-teal-700 bg-teal-50 text-teal-950"
                : "border-sky-700 bg-sky-50 text-sky-950"
            }`}>
            <span className="block font-semibold">{position.continuesFromPreviousDay ? "↳ " : ""}{starts}–{ends}{position.continuesPastMidnight ? " +" : ""}</span>
            <span className="block truncate">{shift.roleTitle} · {status}</span>
          </div>
        );
      })}
    </div>
  );
}
