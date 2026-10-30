import { ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction, signUpAction } from "@/app/actions";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

const errors: Record<string, string> = {
  credentials: "We couldn't sign you in. Check your email and password.",
  signup: "We couldn't create your account. Use a valid email and a password of at least 10 characters.",
  setup: "Add the Supabase settings in .env.local before signing in.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/");
  }

  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f0] px-5 py-12">
      <div className="grid w-full max-w-[980px] overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(27,52,40,0.12)] md:grid-cols-[0.95fr_1.05fr]">
        <section className="flex flex-col justify-between bg-[#173d32] p-8 text-white sm:p-11">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4d56d] text-lg font-black text-[#173d32]">
              b
            </span>
            <span className="text-xl font-semibold tracking-tight">butterbox</span>
          </Link>
          <div className="my-12 max-w-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#f4d56d]">
              Made for hospitality
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-[44px]">
              Great shifts start with a clear plan.
            </h1>
            <p className="mt-5 max-w-xs leading-7 text-white/70">
              A calmer way to plan the week, look after your team and keep your
              venue moving.
            </p>
          </div>
          <p className="text-xs text-white/45">A little more ease in every shift.</p>
        </section>

        <section className="p-7 sm:p-11">
          <div className="mb-8 flex h-11 w-11 items-center justify-center rounded-xl bg-[#f1f3eb] text-[#173d32]">
            <LockKeyhole size={20} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Welcome to Butterbox</h2>
          <p className="mt-2 text-sm leading-6 text-[#747d77]">
            Sign in to your venue, or create an account to set one up.
          </p>

          {params.error && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {errors[params.error] ?? "Something went wrong. Please try again."}
            </p>
          )}
          {params.message === "confirm" && (
            <p className="mt-5 rounded-xl border border-[#d9e7d9] bg-[#f1f7f0] px-4 py-3 text-sm text-[#24543e]">
              Check your inbox to confirm your email, then sign in.
            </p>
          )}
          {!configured && (
            <p className="mt-5 rounded-xl border border-[#eadcae] bg-[#fff9e6] px-4 py-3 text-sm leading-6 text-[#6b5615]">
              Authentication is not connected yet. Copy <code>.env.example</code>{" "}
              to <code>.env.local</code> and add your Supabase project URL and
              anon key to enable sign-in.
            </p>
          )}

          <form action={signInAction} className="mt-7 space-y-4">
            <label className="block text-sm font-medium">
              Email address
              <input
                autoComplete="email"
                className="mt-2 block w-full rounded-xl border border-[#dfe3da] bg-white px-4 py-3 outline-none transition focus:border-[#173d32] focus:ring-2 focus:ring-[#173d32]/10"
                disabled={!configured}
                name="email"
                placeholder="you@yourcafe.com.au"
                required
                type="email"
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                autoComplete="current-password"
                className="mt-2 block w-full rounded-xl border border-[#dfe3da] bg-white px-4 py-3 outline-none transition focus:border-[#173d32] focus:ring-2 focus:ring-[#173d32]/10"
                disabled={!configured}
                name="password"
                required
                type="password"
              />
            </label>
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#173d32] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#225643] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!configured}
              type="submit"
            >
              Sign in <ArrowRight size={17} aria-hidden="true" />
            </button>
          </form>

          <div className="my-7 flex items-center gap-3 text-xs text-[#8a928c]">
            <span className="h-px flex-1 bg-[#e6e8df]" />
            NEW TO BUTTERBOX
            <span className="h-px flex-1 bg-[#e6e8df]" />
          </div>
          <form action={signUpAction} className="space-y-4">
            <label className="block text-sm font-medium">
              Email address
              <input
                autoComplete="email"
                className="mt-2 block w-full rounded-xl border border-[#dfe3da] bg-white px-4 py-3 outline-none transition focus:border-[#173d32] focus:ring-2 focus:ring-[#173d32]/10"
                disabled={!configured}
                name="email"
                placeholder="you@yourcafe.com.au"
                required
                type="email"
              />
            </label>
            <label className="block text-sm font-medium">
              Create a password
              <input
                autoComplete="new-password"
                className="mt-2 block w-full rounded-xl border border-[#dfe3da] bg-white px-4 py-3 outline-none transition focus:border-[#173d32] focus:ring-2 focus:ring-[#173d32]/10"
                disabled={!configured}
                minLength={10}
                name="password"
                placeholder="At least 10 characters"
                required
                type="password"
              />
            </label>
            <p className="text-xs leading-5 text-[#747d77]">
              New accounts become business owners when they set up their first
              venue.
            </p>
            <button
              className="w-full rounded-xl border border-[#dfe3da] px-5 py-3 text-sm font-semibold text-[#173d32] transition hover:bg-[#f7f8f3] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!configured}
              type="submit"
            >
              Create account
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
