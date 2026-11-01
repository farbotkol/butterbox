import { redirect } from "next/navigation";
import Link from "next/link";
import { createBusinessAction, saveBusinessDraftAction } from "@/app/actions";
import { BrandLockup } from "@/components/brand-lockup";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

type SetupPageProps = {
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function SetupPage({ searchParams }: SetupPageProps) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "ready") redirect("/");
  if (workspace.status === "error" && "reason" in workspace &&
    workspace.reason === "multiple_memberships") redirect("/");
  const params = await searchParams;
  const [draftResult, demoResult] =
    workspace.status === "needs_setup"
      ? await Promise.all([workspace.supabase
          .from("business_setup_drafts")
          .select("business_name, venue_name, venue_address, timezone, include_sample_data")
          .eq("user_id", workspace.user.id)
          .maybeSingle(), workspace.supabase.rpc("demo_seed_enabled")])
      : [null, null];
  const draft = draftResult?.data;
  const demoEnabled = demoResult?.data === true;
  if (demoResult && (demoResult.error || typeof demoResult.data !== "boolean")) {
    console.error("Could not load the sample-data policy.", {
      code: demoResult.error?.code,
      message: demoResult.error?.message ?? "The server returned an invalid sample-data policy.",
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cloud px-5 py-12">
      <section className="w-full max-w-[600px] rounded-[26px] bg-white p-7 shadow-[0_18px_60px_rgba(27,52,40,0.1)] sm:p-10">
        <Link href="/" className="flex items-center gap-3">
          <BrandLockup />
        </Link>
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-ocean">
          Let&apos;s get your venue ready
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          Set up your workspace
        </h1>
        <p className="mt-3 leading-7 text-muted">
          You&apos;ll be the business owner. Add your first venue and start with
          a clean roster.
        </p>
        {params.error && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {params.error === "create"
              ? "We couldn't create your workspace. Check the venue details and try again."
              : params.error === "sample-disabled"
                ? "Sample data is unavailable in this environment. Create a clean workspace instead."
                : params.error === "draft"
                  ? "We couldn't save your setup progress. Please try again."
                  : "Business name, venue name, address and timezone are required."}
          </p>
        )}
        {params.saved && (
          <p role="status" className="mt-5 rounded-xl bg-soft-sea px-4 py-3 text-sm text-ocean">
            Setup progress saved. You can return to it later.
          </p>
        )}
        {workspace.status === "error" && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            We couldn&apos;t load your account. Check your Supabase migration and
            try again.
          </p>
        )}
        {draftResult?.error && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            We couldn&apos;t load your saved setup progress. Please try again.
          </p>
        )}
        {demoResult && (demoResult.error || typeof demoResult.data !== "boolean") && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            We couldn&apos;t check whether sample data is available. You can create a clean workspace.
          </p>
        )}
        <form action={createBusinessAction} className="mt-7 space-y-5">
          <label className="block text-sm font-medium">
            Business name
            <input
              className="mt-2 block w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/10"
              defaultValue={draft?.business_name ?? ""}
              maxLength={100}
              name="business_name"
              placeholder="The Corner Café"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            First venue
            <input
              className="mt-2 block w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/10"
              defaultValue={draft?.venue_name ?? ""}
              maxLength={100}
              name="venue_name"
              placeholder="Surry Hills"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Venue address
            <input
              autoComplete="street-address"
              className="mt-2 block w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/10"
              defaultValue={draft?.venue_address ?? ""}
              maxLength={200}
              name="venue_address"
              placeholder="10 Example Street, Sydney NSW"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Venue timezone
            <select
              className="mt-2 block w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/10"
              defaultValue={draft?.timezone ?? "Australia/Sydney"}
              name="timezone"
              required
            >
              <option value="Australia/Sydney">Sydney, NSW</option>
              <option value="Australia/Melbourne">Melbourne, VIC</option>
              <option value="Australia/Brisbane">Brisbane, QLD</option>
              <option value="Australia/Adelaide">Adelaide, SA</option>
              <option value="Australia/Perth">Perth, WA</option>
              <option value="Australia/Hobart">Hobart, TAS</option>
              <option value="Australia/Darwin">Darwin, NT</option>
              <option value="Australia/Canberra">Canberra, ACT</option>
            </select>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-line bg-cloud p-4">
            <input
              className="mt-1 accent-ocean"
              defaultChecked={demoEnabled && (draft?.include_sample_data ?? false)}
              disabled={!demoEnabled}
              name="sample_data"
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-semibold">Add a sample team</span>
              <span className="mt-1 block text-xs leading-5 text-muted">
                {demoEnabled
                  ? "Adds 24 fictional staff and a draft FOH/BOH roster for this week. Use only in an isolated test environment."
                  : "Fictional samples are available only in explicitly enabled, isolated test environments."}
              </span>
            </span>
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              className="w-full rounded-xl bg-ocean px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-ocean/90"
              type="submit"
            >
              Create workspace
            </button>
            <button
              className="w-full rounded-xl border border-line px-5 py-3.5 text-sm font-semibold text-ocean transition hover:bg-cloud"
              formAction={saveBusinessDraftAction}
              formNoValidate
              type="submit"
            >
              Save progress
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
