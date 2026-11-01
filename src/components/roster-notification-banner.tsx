import Link from "next/link";

export function RosterNotificationBanner({ count, venueId }: {
  count: number | null;
  venueId: string;
}) {
  if (count === null) {
    return (
      <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
        We couldn&apos;t check your roster updates. Reload to try again.
      </p>
    );
  }
  if (count === 0) return null;
  return (
    <section aria-label="Unread roster updates"
      className="mt-5 rounded-xl border border-sea-glass/50 bg-soft-sea px-4 py-3 text-sm text-ink">
      You have {count} unread roster {count === 1 ? "update" : "updates"}.{" "}
      <Link href={`/notifications?${new URLSearchParams({ venue: venueId })}`}
        className="font-semibold text-ocean underline">
        View notifications
      </Link>
    </section>
  );
}
