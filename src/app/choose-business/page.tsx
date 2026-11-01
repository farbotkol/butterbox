import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction, switchBusinessAction } from "@/app/actions";
import { BrandLockup } from "@/components/brand-lockup";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { listBusinessMemberships } from "@/lib/workspace";

type ChooseBusinessPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ChooseBusinessPage({ searchParams }: ChooseBusinessPageProps) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const result = await listBusinessMemberships();
  if (result.status === "anonymous") redirect("/login?message=session-ended");
  if (result.status === "ready" && result.businesses.length === 0) redirect("/setup");
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-cloud px-5 py-12">
      <section aria-labelledby="choose-business-title"
        className="w-full max-w-xl rounded-2xl border border-line bg-white p-6 sm:p-8">
        <BrandLockup />
        <h1 id="choose-business-title" className="mt-7 text-2xl font-semibold">Choose a business</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Choose where you want to work. Pages and forms stay linked to the business they were opened
          for, and every request checks your current access.
        </p>
        {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {params.error === "load"
            ? "We couldn't load your businesses. Check your connection and try again."
            : "That business is no longer available to your account. Choose another business."}
        </p>}
        {result.status !== "ready" ? (
          <p role="alert" className="mt-5 text-sm text-red-800">
            We couldn&apos;t load your businesses. Check your connection and try again.
          </p>
        ) : (
          <ul className="mt-6 space-y-3" aria-label="Your businesses">
            {result.businesses.map((business) => (
              <li key={business.id}>
                <form action={switchBusinessAction}
                  className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
                  <input type="hidden" name="business_id" value={business.id} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{business.name}</p>
                    <p className="text-xs capitalize text-muted">{business.role.replaceAll("_", " ")}</p>
                  </div>
                  <button type="submit" aria-label={`Open ${business.name}`}
                    className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean">
                    Open
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
          <form action={signOutAction}>
            <button type="submit" className="min-h-11 rounded-lg border border-line px-4 py-2 font-semibold">Sign out</button>
          </form>
          <Link href="mailto:support@butterbox.app" className="text-muted underline">Need help?</Link>
        </div>
      </section>
    </main>
  );
}
