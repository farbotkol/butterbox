"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto max-w-lg p-8">
    <h1 className="text-2xl font-semibold">We couldn’t load your workspace</h1>
    <p className="my-4">Please try again. If this continues, ask your administrator to check the database configuration and permissions.</p>
    <button onClick={reset} className="rounded bg-emerald-950 px-4 py-2 text-white">Try again</button>
  </main>;
}
