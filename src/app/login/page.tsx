import { ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/actions";
import { AuthLayout } from "@/components/auth-layout";
import { FeedbackNotice, PendingButton } from "@/components/feedback";
import { PasswordInput } from "@/components/password-input";
import { AnnounceSessionEnd } from "@/components/session-sync";
import { isPublicShowcase } from "@/lib/showcase";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

const errors: Record<string, string> = {
  credentials: "We couldn't sign you in. Check your email and password.",
  setup: "Add the Supabase settings in .env.local before signing in.",
  signout: "We couldn't sign you out. Your session may still be active; return to your workspace and try again.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const configured = isSupabaseConfigured();
  const publicShowcase = isPublicShowcase();
  const params = await searchParams;
  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && params.error !== "signout") redirect("/");
  }

  return (
    <AuthLayout>
      {(params.message === "signed-out" ||
        params.message === "password-updated" ||
        params.message === "session-ended") && (
        <AnnounceSessionEnd />
      )}
      <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl bg-soft-sea text-ocean">
        <LockKeyhole size={20} aria-hidden="true" />
      </div>
      <h2 className="font-display text-[28px] font-semibold leading-tight text-ocean">Welcome to Butterbox</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Your team, rosters and timesheets, all in one place.
      </p>

      {publicShowcase && (
        <FeedbackNotice kind="info" className="mt-5 border border-sand bg-soft-sand p-4 text-sm text-ocean">
          This public demo uses pre-provisioned fictional accounts. Sign-up, password changes and
          recovery, and email invitations are unavailable; contact the demo operator for access.
        </FeedbackNotice>
      )}
      {params.error && (
        <FeedbackNotice kind="error" className="mt-5 border border-red-200 px-4 py-3 text-sm">
          {errors[params.error] ?? "Something went wrong. Please try again."}
        </FeedbackNotice>
      )}
      {params.error === "signout" && (
        <Link href="/" className="mt-3 inline-block text-sm font-semibold text-ocean underline-offset-4 hover:underline">
          Return to workspace
        </Link>
      )}
      {params.message === "confirm" && (
        <FeedbackNotice kind="success" className="mt-5 border border-sea-glass/50 px-4 py-3 text-sm">
          Check your inbox to confirm your email, then sign in.
        </FeedbackNotice>
      )}
      {params.message === "reset" && (
        <FeedbackNotice kind="success" className="mt-5 border border-sea-glass/50 px-4 py-3 text-sm">
          If your account is registered, a password reset email is on its way.
        </FeedbackNotice>
      )}
      {params.message === "password-updated" && (
        <FeedbackNotice kind="success" className="mt-5 border border-sea-glass/50 px-4 py-3 text-sm">
          Your password has been updated. Sign in with your new password.
        </FeedbackNotice>
      )}
      {params.message === "signed-out" && (
        <FeedbackNotice kind="success" className="mt-5 border border-sea-glass/50 px-4 py-3 text-sm">
          You&apos;ve signed out.
        </FeedbackNotice>
      )}
      {params.message === "qr-sign-in" && (
        <FeedbackNotice kind="info" className="mt-5 border border-sea-glass/50 px-4 py-3 text-sm">
          Sign in on your own device, then scan a fresh venue kiosk code.
        </FeedbackNotice>
      )}
      {!configured && (
        <p className="mt-5 rounded-lg border border-sand bg-soft-sand px-4 py-3 text-sm leading-6 text-ocean">
          Authentication is not connected yet. Copy <code>.env.example</code> to <code>.env.local</code> and add your Supabase project URL and anon key.
        </p>
      )}

      <form action={signInAction} className="mt-7 space-y-5">
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
          <span className="flex items-center justify-between gap-3">
            Password
            {!publicShowcase && <Link href="/forgot-password" className="text-xs font-medium text-ocean underline-offset-4 hover:underline">
              Forgot password?
            </Link>}
          </span>
          <PasswordInput autoComplete="current-password" id="password" name="password" />
        </label>
        <PendingButton
          type="submit"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-ocean px-5 py-3 text-sm font-semibold text-white transition hover:bg-ocean/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!configured}
          pendingLabel="Signing in..."
        >
          Sign in <ArrowRight size={17} aria-hidden="true" />
        </PendingButton>
      </form>

      {!publicShowcase && <>
        <div className="my-7 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />
          NEW TO BUTTERBOX
          <span className="h-px flex-1 bg-line" />
        </div>
        <Link
          className="flex min-h-12 w-full items-center justify-center rounded-lg border border-ocean/35 bg-white px-5 py-3 text-sm font-semibold text-ocean transition hover:bg-soft-sea focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean"
          href="/signup"
        >
          Create account
        </Link>
      </>}
    </AuthLayout>
  );
}