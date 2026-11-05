import Link from "next/link";
import { acceptStaffInvitationAction, signOutAction } from "@/app/actions";
import { BrandLockup } from "@/components/brand-lockup";
import { InvitationSession } from "@/components/invitation-session";
import { isEndedSession } from "@/lib/auth-errors";
import { parseBusinessId, withBusiness } from "@/lib/business-selection";
import { isInvitationId, parseInvitationPreview } from "@/lib/invitations";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

type InvitationPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; business?: string }>;
};

export default async function InvitationPage({ params, searchParams }: InvitationPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const configured = isSupabaseConfigured();
  const validId = isInvitationId(id);
  const supabase = configured ? await createClient() : null;
  const auth = supabase ? await supabase.auth.getUser() : null;
  const authError = auth?.error && !isEndedSession(auth.error) ? auth.error : null;
  const user = auth?.data.user;
  const result = supabase && user && validId
    ? await supabase.rpc("get_staff_invitation", { p_invitation_id: id })
    : null;
  const preview = result ? parseInvitationPreview(result.data) : null;
  const invalidResult = result && !result.error && !preview &&
    (!Array.isArray(result.data) || result.data.length !== 0);
  if (authError || result?.error || invalidResult) {
    console.error("Could not load an invitation.", {
      code: authError?.code ?? result?.error?.code,
      message: authError?.message ?? result?.error?.message ?? "The server returned invalid invitation data.",
    });
  }
  const invitedBusiness = parseBusinessId(query.business);
  const unavailable = !configured || !validId || authError || result?.error || invalidResult;

  return (
    <main className="flex min-h-screen items-center justify-center bg-cloud px-5 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-line bg-white p-6 sm:p-8">
        <BrandLockup />
        <h1 className="mt-7 text-2xl font-semibold">Your staff invitation</h1>
        {configured && validId && <InvitationSession
          url={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
          anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
          invitationId={id}
        />}
        <noscript><p className="mt-4 text-sm text-red-800">
          JavaScript is required to verify the invitation email on this device.
        </p></noscript>
        {query.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {query.error === "scope"
            ? "Your existing membership cannot access this venue or department. Ask your manager for help."
            : query.error === "authentication"
              ? "Your session ended. Ask your manager to send the invitation email again."
              : "This invitation could not be accepted. Ask your manager for help."}
        </p>}
        {unavailable ? (
          <p role="alert" className="mt-5 text-sm text-red-800">
            We couldn&apos;t load this invitation. Check your connection or ask your manager for a new email.
          </p>
        ) : !user ? (
          <p className="mt-5 text-sm leading-6 text-muted">
            Open the latest invitation email on this device to verify your email address and continue.
          </p>
        ) : !preview ? (
          <div className="mt-5 text-sm leading-6 text-muted">
            <p>This invitation is unavailable for the signed-in email. Open the latest invitation email or ask your manager for help.</p>
            <form action={signOutAction} className="mt-4">
              <button type="submit" className="rounded-lg border border-line px-4 py-2 font-semibold">Sign out</button>
            </form>
          </div>
        ) : (
          <div className="mt-5 space-y-4 text-sm leading-6">
            <p>
              <span className="font-semibold">{preview.business_name}</span> invited {preview.employee_name} to
              {" "}{preview.venue_name} / {preview.department_name}.
            </p>
            {preview.status === "pending" ? <>
              <p className="text-muted">This invitation expires {new Date(preview.expires_at).toUTCString()}.</p>
              <form action={acceptStaffInvitationAction}>
                <input type="hidden" name="invitation_id" value={id} />
                <button type="submit" className="rounded-lg bg-ocean px-4 py-3 font-semibold text-white">
                  Accept invitation
                </button>
              </form>
            </> : preview.status === "accepted" ? <>
              <p role="status" className="rounded-lg bg-soft-sea p-4 text-ocean">Your invitation has been accepted.</p>
              <p className="text-muted">
                You can choose your own password for future sign-ins, or continue to your workspace.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/reset-password" className="font-semibold text-ocean underline">Choose a password</Link>
                <Link href={invitedBusiness ? withBusiness("/", invitedBusiness) : "/"} className="font-semibold text-ocean underline">
                  Open workspace
                </Link>
              </div>
            </> : <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">
              This invitation is {preview.status}. Ask your manager for a new invitation.
            </p>}
          </div>
        )}
      </div>
    </main>
  );
}
