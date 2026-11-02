"use client";

import { useActionState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createAttendanceKioskAction } from "@/app/attendance/kiosks/actions";
import type { KioskSetupState } from "@/lib/attendance-kiosk";

const initialState: KioskSetupState = { error: null, activationCode: null, expiresAt: null };
const subscribe = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => "";

export function KioskSetupForm({ businessId, venueId }: { businessId: string; venueId: string }) {
  const [state, action, pending] = useActionState(createAttendanceKioskAction, initialState);
  const origin = useSyncExternalStore(subscribe, browserOrigin, serverOrigin);
  const activationUrl = state.activationCode && origin
    ? `${origin}/kiosk#${new URLSearchParams({ activate: state.activationCode })}` : null;

  return (
    <section aria-label="Create kiosk device" className="mt-6 rounded-xl border border-line bg-white p-5">
      <h2 className="text-lg font-semibold">Create a kiosk device</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Use a separate guest or managed browser on the venue device, without an owner&apos;s signed-in
        account. The activation code is shown once and expires in 15 minutes.
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="business_id" value={businessId} />
        <input type="hidden" name="venue_id" value={venueId} />
        <label className="text-sm">Device name
          <input name="name" required maxLength={60} autoComplete="off"
            className="mt-2 block w-full rounded-lg border border-line bg-white p-3" />
        </label>
        <button type="submit" disabled={pending}
          className="min-h-11 rounded-lg bg-ocean px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Creating device..." : "Create activation code"}
        </button>
      </form>
      {state.error && <p role="alert" className="mt-4 text-sm text-red-800">{state.error}</p>}
      {state.activationCode && state.expiresAt && (
        <div role="status" className="mt-5 rounded-lg border border-sea-glass bg-soft-sea p-4">
          <h3 className="font-semibold">Activate the venue device</h3>
          <p className="mt-2 text-sm">
            On the venue device, scan this setup QR or open <strong>/kiosk</strong> and enter the
            code below. Keep it private; it can activate one device before{" "}
            <time dateTime={state.expiresAt}>{new Date(state.expiresAt).toISOString()}</time> (UTC).
          </p>
          {activationUrl && (
            <div className="mt-4 inline-block max-w-full bg-white p-2">
              <QRCodeSVG value={activationUrl} size={224} marginSize={4}
                title="One-time kiosk activation QR code" style={{ maxWidth: "100%", height: "auto" }} />
            </div>
          )}
          <p className="mt-3 text-sm font-semibold">One-time activation code</p>
          <code className="mt-1 block break-all rounded bg-white p-3 text-xs select-all">{state.activationCode}</code>
          <p className="mt-2 text-sm">This code will not be shown again if you leave this page.</p>
        </div>
      )}
    </section>
  );
}
