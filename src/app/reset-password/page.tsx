import Link from "next/link";
import { updatePasswordAction } from "@/app/actions";
import { AuthLayout } from "@/components/auth-layout";
import { PasswordInput } from "@/components/password-input";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/server";

type ResetPasswordPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const configured = isSupabaseConfigured();
  const user = configured
    ? (await (await createClient()).auth.getUser()).data.user
    : null;
  const params = await searchParams;

  return (
    <AuthLayout>
      <h2 className="font-display text-[28px] font-semibold leading-tight text-ocean">Choose a new password</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Use at least 10 characters for your Butterbox account.
      </p>
      {params.error && (
        <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {params.error === "password"
            ? "Your password must be at least 10 characters."
            : "We couldn't update your password. Please try again."}
        </p>
      )}
      {user ? (
        <form action={updatePasswordAction} className="mt-7 space-y-5">
          <label className="block text-sm font-medium text-ink" htmlFor="password">
            New password
            <PasswordInput autoComplete="new-password" id="password" minLength={10} name="password" placeholder="At least 10 characters" />
          </label>
          <button
            className="min-h-12 w-full rounded-lg bg-ocean px-5 py-3 text-sm font-semibold text-white transition hover:bg-ocean/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean"
            type="submit"
          >
            Update password
          </button>
        </form>
      ) : (
        <div className="mt-7 rounded-lg border border-line bg-cloud p-5">
          <p className="text-sm leading-6 text-muted">
            This reset link is no longer active. Request a new one to continue.
          </p>
          <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-ocean underline-offset-4 hover:underline" href="/forgot-password">
            Request another reset link
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}