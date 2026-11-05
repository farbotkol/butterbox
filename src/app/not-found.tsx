import Link from "next/link";
import { BrandLockup } from "@/components/brand-lockup";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cloud px-5 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 sm:p-8">
        <BrandLockup />
        <h1 className="mt-7 text-xl font-semibold text-ink">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          This page doesn&apos;t exist or is no longer available to your account.
        </p>
        <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
