import Link from "next/link";
import { resetPasswordAction } from "@/app/actions";
import { AuthLayout } from "@/components/auth-layout";
import { isSupabaseConfigured } from "@/lib/supabase/server";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const configured = isSupabaseConfigured();
  const params = await searchParams;

  return (
    <AuthLayout>
      <h2 className="font-display text-[28px] font-semibold leading-tight text-ocean">Reset your password</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Enter the email address on your account and we&apos;ll send a reset link.
      </p>
      {params.error && (
        <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {params.error === "setup"
          ? "Add the Supabase settings and application site URL in .env.local before requesting a reset."
            : params.error === "link"
              ? "That reset link has expired. Request a new one to continue."
              : "We couldn't send the reset email. Please try again."}
        </p>
      )}
      {params.message === "sent" && (
        <p role="status" className="mt-5 rounded-lg border border-sea-glass/50 bg-soft-sea px-4 py-3 text-sm text-ocean">
          If an account is registered with that address, a password reset email is on its way.
        </p>
      )}
      <form action={resetPasswordAction} className="mt-7 space-y-5">
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
        <button
          className="min-h-12 w-full rounded-lg bg-ocean px-5 py-3 text-sm font-semibold text-white transition hover:bg-ocean/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!configured}
          type="submit"
        >
          Send reset link
        </button>
      </form>
      <p className="mt-7 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-ocean underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}