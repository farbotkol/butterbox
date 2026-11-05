import {
  correctionEventLabels, type AttendanceCorrection,
} from "@/lib/attendance-corrections";

function formatted(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, timeZoneName: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

export function AttendanceCorrectionHistory({ corrections, timezone }: {
  corrections: AttendanceCorrection[]; timezone: string;
}) {
  if (!corrections.length) return <p className="mt-3 text-sm text-muted">No attendance corrections in your scope.</p>;
  return <div className="mt-3 space-y-3">
    {corrections.map((correction) => <article key={correction.id} className="rounded-lg border border-line p-4 text-sm">
      <p className="font-semibold">{correction.employee_name} · {correction.department_name} · {correctionEventLabels[correction.event_type]}</p>
      <p className="mt-2">Original: <time dateTime={correction.original_at}>
        {formatted(correction.original_at, timezone)} ({correction.original_at})
      </time></p>
      <p className="mt-1">Previous: <time dateTime={correction.old_at}>
        {formatted(correction.old_at, timezone)} ({correction.old_at})
      </time></p>
      <p className="mt-1">Corrected: <time dateTime={correction.new_at}>
        {formatted(correction.new_at, timezone)} ({correction.new_at})
      </time></p>
      <p className="mt-2">Reason: {correction.reason}</p>
      <p className="mt-1 text-muted">Changed by user {correction.actor_id} at{" "}
        <time dateTime={correction.created_at}>{formatted(correction.created_at, timezone)}</time>
      </p>
    </article>)}
  </div>;
}
