"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseClockOptionValue, type ClockOption } from "@/lib/attendance";
import { parseOfflineClaimReceipt, type OfflineAttendanceClaim, type OfflineEventType } from "@/lib/offline-attendance";
import { listOfflineClaims, removeOfflineClaim, saveOfflineClaim } from "@/lib/offline-attendance-queue";

export function OfflineAttendance({ url, anonKey, actorId, businessId, venueId, options }: {
  url: string; anonKey: string; actorId: string; businessId: string; venueId: string; options: ClockOption[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState(
    options.length === 1 ? `${options[0].employee_id}:${options[0].department_id}` : "",
  );
  const [queued, setQueued] = useState<OfflineAttendanceClaim[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const client = useRef<SupabaseClient | null>(null);
  const syncInProgress = useRef(false);
  const syncAgain = useRef(false);
  const recordInProgress = useRef(false);

  const sync = useCallback(async () => {
    if (syncInProgress.current) {
      syncAgain.current = true;
      return;
    }
    syncInProgress.current = true;
    async function flush() {
      const claims = await listOfflineClaims(actorId, businessId);
      setQueued(claims);
      setQueueLoaded(true);
      if (!claims.length || !navigator.onLine) return;
      setSyncing(true);
      setError("");
      if (!client.current) client.current = createBrowserClient(url, anonKey);
      const { data: { user }, error: authError } = await client.current.auth.getUser();
      if (authError || !user || user.id !== actorId) {
        console.error("Could not verify the offline attendance account.", { code: authError?.code });
        setError("The claims remain on this device. Reconnect and sign in as the same account before retrying.");
        return;
      }

      let received = 0;
      let failed = false;
      for (const claim of claims) {
        const { data, error: submissionError } = await client.current.rpc("submit_attendance_offline_claim", {
          p_business_id: claim.businessId, p_venue_id: claim.venueId, p_department_id: claim.departmentId,
          p_employee_id: claim.employeeId, p_actor_id: claim.actorId, p_request_id: claim.requestId,
          p_event_type: claim.eventType, p_claimed_at: claim.claimedAt,
        });
        if (submissionError || !parseOfflineClaimReceipt(data)) {
          console.error("Could not submit an offline attendance claim.", {
            code: submissionError?.code,
            message: submissionError?.message ?? "The server returned an invalid receipt.",
          });
          failed = true;
          continue;
        }
        await removeOfflineClaim(claim.requestId);
        received += 1;
      }
      setQueued(await listOfflineClaims(actorId, businessId));
      if (received) {
        setMessage(`${received} claim${received === 1 ? "" : "s"} received by the server and awaiting manager review.`);
        router.refresh();
      }
      if (failed) setError("Some claims could not be uploaded. They remain on this device; retry or contact your manager.");
    }
    try {
      do {
        syncAgain.current = false;
        await flush();
      } while (syncAgain.current);
    } catch (caught) {
      console.error("Could not use the offline attendance queue.", {
        message: caught instanceof Error ? caught.message : "Unknown device storage error.",
      });
      setError("Device storage or the connection is unavailable. Keep this page open and contact your manager.");
    } finally {
      setSyncing(false);
      syncInProgress.current = false;
    }
  }, [actorId, anonKey, businessId, router, url]);

  useEffect(() => {
    function connectionChanged() {
      setOffline(!navigator.onLine);
      if (navigator.onLine) void sync();
    }
    queueMicrotask(() => {
      setOffline(!navigator.onLine);
      void sync();
    });
    window.addEventListener("online", connectionChanged);
    window.addEventListener("offline", connectionChanged);
    return () => {
      window.removeEventListener("online", connectionChanged);
      window.removeEventListener("offline", connectionChanged);
    };
  }, [sync]);

  async function record(eventType: OfflineEventType) {
    if (recordInProgress.current) return;
    const optionValue = options.length === 1
      ? `${options[0].employee_id}:${options[0].department_id}` : selection;
    const option = parseClockOptionValue(optionValue);
    if (!option || !options.some((item) =>
      item.employee_id === option.employeeId && item.department_id === option.departmentId)) {
      setError("Choose your employee and department before saving a claim.");
      return;
    }
    recordInProgress.current = true;
    setRecording(true);
    setError("");
    try {
      if (typeof crypto.randomUUID !== "function") throw new Error("Secure request identifiers are unavailable.");
      await saveOfflineClaim({
        requestId: crypto.randomUUID(), actorId, businessId, venueId,
        employeeId: option.employeeId, departmentId: option.departmentId,
        eventType, claimedAt: new Date().toISOString(),
      });
      setMessage("Claim saved on this device. Keep it until it is received by the server.");
      await sync();
    } catch (caught) {
      console.error("Could not save an offline attendance claim.", {
        message: caught instanceof Error ? caught.message : "Unknown device storage error.",
      });
      setError("The claim was not saved. Record the time separately and contact your manager.");
    } finally {
      setRecording(false);
      recordInProgress.current = false;
    }
  }

  return (
    <section aria-label="Offline attendance fallback" className="mt-6 rounded-xl border border-line bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Offline attendance fallback</h2>
      <p className="mt-2 text-sm text-muted">
        If clocking fails, save an unverified claim using this device&apos;s clock. It stays on this device
        until uploaded, requires manager review and does not automatically change recorded work time.
        This fallback is available while this attendance page remains open. Clearing browser data before
        upload will lose pending claims.
      </p>
      {options.length > 1 && <label className="mt-4 block text-sm">
        Employee and department for the claim
        <select value={selection} onChange={(event) => setSelection(event.target.value)}
          className="mt-2 block w-full max-w-md rounded-lg border border-line bg-white p-3">
          <option value="">Choose your employee and department</option>
          {options.map((option) => <option key={`${option.employee_id}:${option.department_id}`}
            value={`${option.employee_id}:${option.department_id}`}>
            {option.employee_name} · {option.department_name}
          </option>)}
        </select>
      </label>}
      {options.length === 1 && <p className="mt-3 text-sm text-muted">
        {options[0].employee_name} · {options[0].department_name}
      </p>}
      {options.length ? <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={recording} onClick={() => { void record("clock_in"); }}
          className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">
          Save offline clock in
        </button>
        <button type="button" disabled={recording} onClick={() => { void record("clock_out"); }}
          className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">
          Save offline clock out
        </button>
      </div> : <p className="mt-3 text-sm text-muted">No eligible employee profile is available for a claim.</p>}
      {!queueLoaded ? <p className="mt-4 text-sm text-muted">
        {error ? "Pending claims on this device are unavailable." : "Checking this device for pending claims..."}
      </p> : queued.length || message || syncing ? <p role="status" className="mt-4 text-sm text-muted">
        {queued.length
          ? `${queued.length} claim${queued.length === 1 ? "" : "s"} pending on this device${offline ? " while offline" : ""}.`
          : message}
        {syncing && " Uploading..."}
      </p> : <p className="mt-4 text-sm text-muted">No claims are waiting on this device.</p>}
      {queued.length > 0 && <ul aria-label="Claims pending on this device" className="mt-3 space-y-2 text-sm">
        {queued.map((claim) => <li key={claim.requestId} className="rounded-lg border border-line p-3">
          {claim.eventType === "clock_in" ? "Clock in" : "Clock out"}
          {claim.venueId !== venueId && " · another venue"} ·{" "}
          <time dateTime={claim.claimedAt}>{new Date(claim.claimedAt).toLocaleString("en-AU")}</time>
        </li>)}
      </ul>}
      {queued.length > 0 && <button type="button" disabled={syncing} onClick={() => { void sync(); }}
        className="mt-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">
        Retry upload
      </button>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <noscript><p className="mt-3 text-sm text-red-800">
        Device claims require JavaScript. Record the time separately and contact your manager.
      </p></noscript>
    </section>
  );
}
