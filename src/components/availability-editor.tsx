"use client";

import { useState } from "react";
import { saveRecurringAvailabilityAction } from "@/app/actions";
import { formatWallTime, type AvailabilityInterval } from "@/lib/availability";

type Interval = AvailabilityInterval & { id: string };

const weekdays = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];
const fieldClass = "mt-1 block w-full rounded-lg border border-line bg-white p-2 text-ink";

export function AvailabilityEditor({
  employeeId,
  employeeName,
  venueId,
  initialIntervals,
  submitted,
}: {
  employeeId: string;
  employeeName: string;
  venueId: string;
  initialIntervals: Interval[];
  submitted: boolean;
}) {
  const [intervals, setIntervals] = useState(initialIntervals);

  return (
    <form action={saveRecurringAvailabilityAction} aria-label={`Recurring availability for ${employeeName}`}
      className="mt-4 space-y-4">
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="venue_id" value={venueId} />
      <p className="text-sm text-muted">
        {submitted ? "Your last saved pattern is shown below." : "No availability has been submitted yet."}
        {" "}A time range ending at or before its start continues into the next day;
        equal times mean 24 hours.
      </p>
      {intervals.map((interval, index) => (
        <div key={interval.id} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-4">
          <label className="text-sm">Day
            <select name="weekday" aria-label={`Day for interval ${index + 1}`}
              defaultValue={interval.weekday} className={fieldClass}>
              {weekdays.map((day, dayIndex) => <option key={day} value={dayIndex + 1}>{day}</option>)}
            </select>
          </label>
          <label className="text-sm">Available from
            <input name="start" type="time" required aria-label={`Start for interval ${index + 1}`}
              defaultValue={formatWallTime(interval.start_minute)} className={fieldClass} />
          </label>
          <label className="text-sm">Available until
            <input name="end" type="time" required aria-label={`End for interval ${index + 1}`}
              defaultValue={formatWallTime(interval.end_minute)} className={fieldClass} />
          </label>
          <button type="button" onClick={() => setIntervals((current) => current.filter((item) => item.id !== interval.id))}
            aria-label={`Remove interval ${index + 1}`}
            className="self-end rounded-lg border border-line px-3 py-2 text-sm font-semibold">
            Remove
          </button>
        </div>
      ))}
      {intervals.length === 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm_empty" value="yes" required className="mt-1" />
          I am unavailable all week. Saving an empty pattern is different from not submitting one.
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={intervals.length >= 56}
          onClick={() => setIntervals((current) => [...current, {
            id: crypto.randomUUID(), weekday: 1, start_minute: 540, end_minute: 1020,
          }])}
          className="rounded-lg border border-line px-4 py-2 font-semibold disabled:opacity-50">
          Add interval
        </button>
        <button type="submit" className="rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
          Save availability
        </button>
      </div>
      <p className="text-xs text-muted">You can add up to 56 intervals. Overlapping ranges are combined on the roster.</p>
    </form>
  );
}
