"use client";

import "./globals.css";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-AU">
      <body>
        <title>Something went wrong — Butterbox Systems</title>
        <main className="flex min-h-screen items-center justify-center bg-cloud px-5 py-12">
          <div role="alert" className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              Butterbox couldn&apos;t load. If you were saving a change, check whether it appears before trying again.
            </p>
            <button type="button" onClick={() => retry()}
              className="mt-5 min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
