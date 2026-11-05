"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string"
    ? error.digest : undefined;

  useEffect(() => {
    console.error("A page could not be displayed.", { digest });
    heading.current?.focus();
  }, [digest]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-cloud px-5 py-12">
      <div role="alert" className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 sm:p-8">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold text-ink outline-none">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          We couldn&apos;t display this page. If you were saving a change, check whether it
          appears before trying again.
        </p>
        {digest && <p className="mt-2 text-xs text-muted">Reference: {digest}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => retry()}
            className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">
            Try again
          </button>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ocean">
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
