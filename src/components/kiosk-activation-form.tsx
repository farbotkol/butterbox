"use client";

import { activateKioskAction } from "@/app/kiosk/actions";
import { useKioskFragment } from "@/hooks/use-kiosk-fragment";

export function KioskActivationForm() {
  const fragment = useKioskFragment("activate");

  return <form action={activateKioskAction} className="mt-5 space-y-4">
    {fragment.status === "invalid" && <p role="alert" className="text-sm text-red-800">
      That activation link was invalid. Ask an owner for a new code.
    </p>}
    {fragment.status === "loading" ? <p role="status" className="text-sm text-muted">Preparing activation...</p> : (
      <>
        <label className="block text-sm font-semibold">One-time activation code
          <input type="password" name="activation_code"
            defaultValue={fragment.status === "valid" ? fragment.value : ""}
            required autoComplete="off" spellCheck={false}
            className="mt-2 block min-h-11 w-full rounded-lg border border-line bg-white p-3 font-normal" />
        </label>
        <button type="submit" className="min-h-11 rounded-lg bg-ocean px-5 py-3 font-semibold text-white">
          Activate this device
        </button>
      </>
    )}
  </form>;
}
