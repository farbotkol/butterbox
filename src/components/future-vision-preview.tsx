import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { futureVisionConcepts } from "@/lib/future-vision";
import { helpHref } from "@/lib/help";

export function FutureVisionPreview({ businessId, venueId }: { businessId: string; venueId: string }) {
  return (
    <details aria-label="Future concept previews" className="group mt-5 rounded-lg border border-line bg-white shadow-sm">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean">
        <h2 className="text-lg font-semibold text-ink">Explore future concepts</h2>
        <span className="inline-flex items-center gap-2">
          <span className="rounded-full bg-soft-sea px-3 py-1 text-xs font-semibold text-ocean">
            Concept preview · not available
          </span>
          <ChevronDown size={18} aria-hidden="true" className="text-ocean transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-line px-5 pb-5 pt-4">
        <p className="max-w-3xl text-sm leading-6 text-muted">
          These fictional examples are for internal discussion, not working features. They do not use
          your venue&apos;s data, generate recommendations or forecasts, calculate pay or verify compliance.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {futureVisionConcepts.map((concept) => (
            <article key={concept.id} className="min-w-0 rounded-lg border border-line bg-brand-cream p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Concept · not functional</p>
              <h3 className="mt-2 text-base font-semibold text-ink">{concept.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink">{concept.description}</p>
              <p className="mt-3 text-sm leading-6 text-ink">{concept.example}</p>
              <p className="mt-3 text-sm leading-6 text-muted">{concept.limitation}</p>
            </article>
          ))}
        </div>
        <Link href={helpHref("unavailable", businessId, venueId)}
          className="mt-4 inline-flex min-h-11 items-center font-semibold text-ocean underline">
          Help with future concepts
        </Link>
      </div>
    </details>
  );
}
