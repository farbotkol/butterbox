import { redirect } from "next/navigation";
import Link from "next/link";
import { createBusinessAction } from "@/app/actions";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

type SetupPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SetupPage({ searchParams }: SetupPageProps) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const workspace = await getWorkspace();
  if (workspace.status === "anonymous") redirect("/login");
  if (workspace.status === "ready") redirect("/");
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f0] px-5 py-12">
      <section className="w-full max-w-[600px] rounded-[26px] bg-white p-7 shadow-[0_18px_60px_rgba(27,52,40,0.1)] sm:p-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4d56d] text-lg font-black text-[#173d32]">
            b
          </span>
          <span className="text-xl font-semibold tracking-tight">butterbox</span>
        </Link>
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7a22]">
          Let&apos;s get your venue ready
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Set up your workspace
        </h1>
        <p className="mt-3 leading-7 text-[#747d77]">
          You&apos;ll be the business owner. Add your first venue and start with
          a clean roster or a fictional sample team.
        </p>
        {params.error && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {params.error === "create"
              ? "We couldn't create your workspace. Check the venue details and try again."
              : "Business name, venue name and timezone are required."}
          </p>
        )}
        {workspace.status === "error" && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            We couldn&apos;t load your account. Check your Supabase migration and
            try again.
          </p>
        )}
        <form action={createBusinessAction} className="mt-7 space-y-5">
          <label className="block text-sm font-medium">
            Business name
            <input
              className="mt-2 block w-full rounded-xl border border-[#dfe3da] px-4 py-3 outline-none focus:border-[#173d32] focus:ring-2 focus:ring-[#173d32]/10"
              maxLength={100}
              name="business_name"
              placeholder="The Corner Café"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            First venue
            <input
              className="mt-2 block w-full rounded-xl border border-[#dfe3da] px-4 py-3 outline-none focus:border-[#173d32] focus:ring-2 focus:ring-[#173d32]/10"
              maxLength={100}
              name="venue_name"
              placeholder="Surry Hills"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Venue timezone
            <select
              className="mt-2 block w-full rounded-xl border border-[#dfe3da] bg-white px-4 py-3 outline-none focus:border-[#173d32] focus:ring-2 focus:ring-[#173d32]/10"
              defaultValue="Australia/Sydney"
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
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e6e8df] bg-[#fbfbf8] p-4">
            <input
              className="mt-1 accent-[#173d32]"
              defaultChecked
              name="sample_data"
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-semibold">Add a sample team</span>
              <span className="mt-1 block text-xs leading-5 text-[#747d77]">
                Adds 24 fictional staff and a draft FOH/BOH roster for this week.
                You can delete the sample shifts before publishing.
              </span>
            </span>
          </label>
          <button
            className="w-full rounded-xl bg-[#173d32] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#225643]"
            type="submit"
          >
            Create workspace
          </button>
        </form>
      </section>
    </main>
  );
}
