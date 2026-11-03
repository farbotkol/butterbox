"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  browserSessionIdentity, offlineContextKey, offlineShellAssets, offlineShellCache, sealOfflineContext, sessionEventKey,
} from "../../public/offline-attendance-shared.mjs";
import { parseClockOptions, type ClockOption } from "@/lib/attendance";
import { readAllPages } from "@/lib/paginated-rows";
import { supabaseAuthCookieName, supabaseAuthCookieOptions } from "@/lib/showcase";

async function waitForOfflineController(registration: ServiceWorkerRegistration) {
  const active = registration.active;
  if (!active || new URL(active.scriptURL).pathname !== "/attendance-offline-sw.js") {
    throw new Error("The offline page could not be activated.");
  }
  const worker = active;
  await new Promise<void>((resolve, reject) => {
    function finish(error?: Error) {
      clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("controllerchange", check);
      worker.removeEventListener("statechange", check);
      if (error) reject(error); else resolve();
    }
    function check() {
      const current = registration.active;
      if (current?.state === "activated" &&
        navigator.serviceWorker.controller?.scriptURL === current.scriptURL) finish();
    }
    const timeout = setTimeout(() => finish(new Error("The offline page could not take control. Try again online.")), 15_000);
    navigator.serviceWorker.addEventListener("controllerchange", check);
    worker.addEventListener("statechange", check);
    check();
  });
}

export function OfflineReopenSetup({ url, anonKey, actorId, businessId, venueId }: {
  url: string; anonKey: string; actorId: string; businessId: string; venueId: string;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inProgress = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    function sessionChanged(event: StorageEvent) {
      if (event.key === sessionEventKey && event.newValue) generation.current += 1;
    }
    function sameTabSessionChanged() {
      generation.current += 1;
    }
    window.addEventListener("storage", sessionChanged);
    window.addEventListener(sessionEventKey, sameTabSessionChanged);
    return () => {
      generation.current += 1;
      window.removeEventListener("storage", sessionChanged);
      window.removeEventListener(sessionEventKey, sameTabSessionChanged);
    };
  }, []);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inProgress.current) return;
    const expectedGeneration = generation.current;
    inProgress.current = true;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (!navigator.onLine || !("serviceWorker" in navigator) || !("caches" in window) || !crypto.subtle) {
        throw new Error("Offline preparation requires a connection and supported secure device storage.");
      }
      if (passphrase.length < 12 || passphrase.length > 128 || passphrase !== confirmation) {
        throw new Error("Enter matching offline passphrases of 12 to 128 characters.");
      }
      const client = createBrowserClient(url, anonKey, { cookieOptions: supabaseAuthCookieOptions() });
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user || user.id !== actorId) {
        throw new Error("The account session changed. Sign in again before preparing offline attendance.");
      }
      const result = await readAllPages<ClockOption>((from, to) => client.rpc("list_my_clock_options", {
        p_business_id: businessId, p_venue_id: venueId,
      }, { count: "exact" }).order("employee_id").order("department_id").range(from, to),
      (option) => option && typeof option.employee_id === "string" && typeof option.department_id === "string"
        ? `${option.employee_id}:${option.department_id}` : "");
      const options = parseClockOptions(result.data);
      if (result.error || !options?.length) {
        throw new Error("No current employee and department are available. Refresh and check your access.");
      }
      const registration = await navigator.serviceWorker.register("/attendance-offline-sw.js", {
        scope: "/", updateViaCache: "none",
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("The offline page could not be prepared in time.")), 15_000);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      await waitForOfflineController(registration);
      const cache = await caches.open(offlineShellCache);
      const assets = await Promise.all(offlineShellAssets.map((asset) => cache.match(asset)));
      if (assets.some((asset) => !asset)) throw new Error("The offline page is incomplete. Try again online.");
      const verified = await client.auth.getUser();
      if (verified.error || verified.data.user?.id !== actorId || generation.current !== expectedGeneration) {
        throw new Error("The account session changed. Sign in again before preparing offline attendance.");
      }
      const authCookieName = supabaseAuthCookieName(url);
      const identity = browserSessionIdentity(document.cookie, authCookieName);
      if (!identity || identity.actorId !== actorId) {
        throw new Error("This browser cannot verify the current session for offline reopening.");
      }
      const envelope = await sealOfflineContext({
        actorId, businessId, venueId, options, sessionId: identity.sessionId, authCookieName,
      }, passphrase);
      const currentIdentity = browserSessionIdentity(document.cookie, authCookieName);
      if (generation.current !== expectedGeneration || currentIdentity?.actorId !== actorId ||
        currentIdentity.sessionId !== identity.sessionId) {
        throw new Error("The account session changed. Sign in again before preparing offline attendance.");
      }
      try {
        sessionStorage.setItem(offlineContextKey, envelope);
      } catch (caught) {
        if (caught instanceof DOMException) {
          throw new Error("Offline preparation could not be stored. Check device storage and try again.");
        }
        throw caught;
      }
      setPassphrase("");
      setConfirmation("");
      setMessage("Offline reopening is prepared for this venue in this tab. Remember your offline passphrase.");
    } catch (caught) {
      console.error("Could not prepare offline attendance reopening.", caught);
      setError(caught instanceof Error ? caught.message : "Offline preparation failed. Try again while online.");
    } finally {
      inProgress.current = false;
      setBusy(false);
    }
  }

  function removePreparation() {
    try {
      sessionStorage.removeItem(offlineContextKey);
      setMessage("Offline reopening was removed from this tab. Pending claims remain on this device.");
      setError("");
    } catch (caught) {
      console.error("Could not remove offline attendance preparation.", caught);
      setError("The offline preparation could not be removed from this tab.");
    }
  }

  return <details className="mt-4 rounded-lg border border-line p-4 text-sm">
    <summary className="cursor-pointer font-semibold">Prepare this tab for offline reopening</summary>
    <p className="mt-3 text-muted">
      While signed in and online, choose an offline passphrase to reopen attendance in this tab if the
      network fails. This encrypts the saved employee and venue scope; pending device claims themselves
      are not encrypted. Use a private device or separate browser profile. A different browser session
      cannot unlock it; sign-out removes the preparation. Access changes cannot be checked while offline.
      Closing this tab can remove the preparation. Server access and the same account are still required
      to upload claims.
    </p>
    <form onSubmit={prepare} className="mt-3 space-y-3">
      <label className="block">
        Offline passphrase
        <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required
          value={passphrase} onChange={(event) => setPassphrase(event.target.value)}
          className="mt-1 block w-full max-w-md rounded-lg border border-line p-2" />
      </label>
      <label className="block">
        Confirm offline passphrase
        <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required
          value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
          className="mt-1 block w-full max-w-md rounded-lg border border-line p-2" />
      </label>
      <p className="text-muted">Use 12 to 128 characters and do not reuse your account password.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy}
          className="min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white disabled:opacity-50">
          Prepare offline reopening
        </button>
        <button type="button" disabled={busy} onClick={removePreparation}
          className="min-h-11 rounded-lg border border-line px-4 py-2 font-semibold disabled:opacity-50">
          Remove offline preparation
        </button>
      </div>
    </form>
    {message && <p role="status" className="mt-3 text-ocean">{message}</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
  </details>;
}
