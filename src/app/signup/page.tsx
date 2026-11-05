import { ArrowRight, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signUpAction } from "@/app/actions";
import { AuthLayout } from "@/components/auth-layout";
import { PasswordInput } from "@/components/password-input";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/server";

type SignupPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
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
    <AuthLayout>
      <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl bg-soft-sea text-ocean">
        <UserRoundPlus size={20} aria-hidden="true" />
      </div>
      <h2 className="font-display text-[28px] font-semibold leading-tight text-ocean">Create your account</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Start with your venue and bring your team together.
      </p>

      {params.error && (
        <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {params.error === "setup"
          ? "Add the Supabase settings and application site URL in .env.local before creating an account."
            : "We couldn't create your account. Use a valid email and a password of at least 10 characters."}
        </p>
      )}
      {!configured && (
        <p className="mt-5 rounded-lg border border-sand bg-soft-sand px-4 py-3 text-sm leading-6 text-ocean">
          Authentication is not connected yet. Add your Supabase project URL and anon key in <code>.env.local</code> to continue.
        </p>
      )}

      <form action={signUpAction} className="mt-7 space-y-5">
        <label className="block text-sm font-medium text-ink" htmlFor="email">
          Email address
          <input
            autoComplete="email"
            className="mt-2 block min-h-12 w-full rounded-lg border border-line bg-white px-4 py-3 text-base outline-none transition placeholder:text-muted/55 focus:border-ocean focus:ring-4 focus:ring-ocean/10 disabled:cursor-not-allowed disabled:bg-cloud"
            disabled={!configured}
            id="email"
            name="email"
            placeholder="you@yourcafe.com.au"
            required
            type="email"
          />
        </label>
        <label className="block text-sm font-medium text-ink" htmlFor="password">
          Create a password
          <PasswordInput autoComplete="new-password" id="password" minLength={10} name="password" placeholder="At least 10 characters" />
        </label>
        <p className="text-xs leading-5 text-muted">
          New accounts become business owners when they set up their first venue.
        </p>
        <button
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-ocean px-5 py-3 text-sm font-semibold text-white transition hover:bg-ocean/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!configured}
          type="submit"
        >
          Create account <ArrowRight size={17} aria-hidden="true" />
        </button>
      </form>
      <p className="mt-7 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ocean underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}