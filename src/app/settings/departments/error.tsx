"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function DepartmentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    console.error("Could not display departments and roles.", { digest: error.digest });
    heading.current?.focus();
  }, [error.digest]);
  return <main className="mx-auto max-w-lg p-6">
    <div role="alert" className="rounded-xl border border-line bg-white p-6">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">Departments unavailable</h1>
      <p className="mt-3 text-sm">We couldn&apos;t display this page. If you were saving, check the record before trying again.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={retry} className="min-h-11 rounded-lg border border-line px-4 font-semibold">
          Try again
        </button>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
          Go to dashboard
        </Link>
      </div>
    </div>
  </main>;
}
