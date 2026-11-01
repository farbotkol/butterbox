"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { isEndedSession } from "@/lib/auth-errors";
import { parseInvitationPreview } from "@/lib/invitations";
import { announceSessionChange } from "@/lib/session-notifications";

type Phase = "idle" | "checking" | "confirm" | "applying" | "check-error" | "apply-error" | "link-error";
type Tokens = { access_token: string; refresh_token: string };

export function InvitationSession({ url, anonKey, invitationId }: {
  url: string; anonKey: string; invitationId: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [invitedAccount, setInvitedAccount] = useState<{ email: string; business: string } | null>(null);
  const tokens = useRef<Tokens | null>(null);
  const started = useRef(false);
  const client = useRef<SupabaseClient | null>(null);

  function authClient() {
    if (!client.current) {
      client.current = createBrowserClient(url, anonKey, {
        isSingleton: false, auth: { detectSessionInUrl: false, autoRefreshToken: false },
      });
    }
    return client.current;
  }

  async function applySession() {
    if (!tokens.current) return;
    setPhase("applying");
    const { error } = await authClient().auth.setSession(tokens.current);
    if (error) {
      console.error("Could not establish the invitation session.", { code: error.code, status: error.status });
      setPhase("apply-error");
      return;
    }
    tokens.current = null;
    announceSessionChange();
    window.location.replace(`${window.location.pathname}${window.location.search}`);
  }

  async function checkSession() {
    setPhase("checking");
    if (!tokens.current) {
      setPhase("link-error");
      return;
    }
    const candidate = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: { session }, error: refreshError } = await candidate.auth.refreshSession({
      refresh_token: tokens.current.refresh_token,
    });
    if (refreshError || !session) {
      if (refreshError && refreshError.status !== 400 && refreshError.status !== 401 &&
          refreshError.status !== 403) {
        console.error("Could not verify the invitation token.", {
          code: refreshError.code, status: refreshError.status,
        });
        setPhase("check-error");
      } else {
        setPhase("link-error");
      }
      return;
    }
    tokens.current = { access_token: session.access_token, refresh_token: session.refresh_token };
    const { data: { user: invitedUser }, error: invitedError } =
      await candidate.auth.getUser();
    if (invitedError || !invitedUser?.email) {
      if (invitedError && invitedError.status !== 400 && invitedError.status !== 401 &&
          invitedError.status !== 403) {
        console.error("Could not verify the invitation account.", {
          code: invitedError.code, status: invitedError.status,
        });
        setPhase("check-error");
      } else {
        setPhase("link-error");
      }
      return;
    }
    const { data, error: previewError } = await candidate.rpc("get_staff_invitation", {
      p_invitation_id: invitationId,
    });
    if (previewError) {
      console.error("Could not verify the invitation details.", { code: previewError.code });
      setPhase("check-error");
      return;
    }
    const preview = parseInvitationPreview(data);
    if (!preview) {
      setPhase("link-error");
      return;
    }
    setInvitedAccount({ email: invitedUser.email, business: preview.business_name });
    const { data: { user }, error } = await authClient().auth.getUser();
    if (error && !isEndedSession(error)) {
      console.error("Could not check the current invitation session.", { code: error.code, status: error.status });
      setPhase("check-error");
      return;
    }
    if (user) {
      setPhase("confirm");
      return;
    }
    await applySession();
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (!fragment.has("access_token") && !fragment.has("refresh_token") && !fragment.has("error")) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    if (!accessToken || !refreshToken || fragment.has("error")) {
      queueMicrotask(() => setPhase("link-error"));
      return;
    }
    tokens.current = { access_token: accessToken, refresh_token: refreshToken };
    queueMicrotask(() => { void checkSession(); });
  });

  if (phase === "idle") return null;
  if (phase === "checking" || phase === "applying") {
    return <p role="status" className="mt-4 text-sm text-muted">Verifying your invitation email...</p>;
  }
  if (phase === "confirm") {
    return <div className="mt-4 rounded-lg border border-sand bg-soft-sand p-4 text-sm">
      <p>You are already signed in. Continuing will switch this browser to {invitedAccount?.email},
        the account invited to {invitedAccount?.business}.</p>
      <button type="button" onClick={() => { void applySession(); }}
        className="mt-3 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
        Continue with invitation email
      </button>
    </div>;
  }
  return <div role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
    <p>{phase === "link-error"
      ? "This email link is invalid or expired. Ask your manager to send another invitation email."
      : "We couldn't verify the invitation session. Check your connection and try again."}</p>
    {phase !== "link-error" && <button type="button"
      onClick={() => { void (phase === "check-error" ? checkSession() : applySession()); }}
      className="mt-3 rounded-lg border border-red-300 px-4 py-2 font-semibold">
      Try again
    </button>}
  </div>;
}
