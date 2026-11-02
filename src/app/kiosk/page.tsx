import { cookies } from "next/headers";
import { clearKioskAction } from "@/app/kiosk/actions";
import { KioskActivationForm } from "@/components/kiosk-activation-form";
import { KioskDisplay } from "@/components/kiosk-display";
import { isKioskCredential, kioskCookieName } from "@/lib/attendance-kiosk";

export const metadata = { title: "Venue clock kiosk", robots: { index: false, follow: false } };

export default async function KioskPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const activated = isKioskCredential((await cookies()).get(kioskCookieName)?.value);
  return <main className="mx-auto max-w-xl px-5 py-8 text-center">
    <h1 className="text-3xl font-semibold">Venue clock kiosk</h1>
    {activated ? (
      <>
        <KioskDisplay />
        <form action={clearKioskAction} className="mt-8">
          <button type="submit" className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold">
            Remove this device from this browser
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">An owner should also revoke a lost or shared device in kiosk settings.</p>
      </>
    ) : (
      <div className="text-left">
        <p className="mt-4 text-sm leading-6 text-muted">
          Ask an owner for a one-time activation code. Use a guest or managed browser without an owner&apos;s
          account signed in. Activation requires a secure connection.
        </p>
        {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          Activation failed. The code may be invalid, expired or already used; ask an owner for a new one.
        </p>}
        <KioskActivationForm />
      </div>
    )}
  </main>;
}
