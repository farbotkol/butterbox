import Link from "next/link";
import { redirect } from "next/navigation";
import { revokeAttendanceKioskAction } from "@/app/attendance/kiosks/actions";
import { AppShell } from "@/components/app-shell";
import { KioskSetupForm } from "@/components/kiosk-setup-form";
import { parseKioskList } from "@/lib/attendance-kiosk";
import { withBusiness } from "@/lib/business-selection";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

export default async function AttendanceKiosksPage({ searchParams }: {
  searchParams: Promise<{ business?: string; venue?: string; error?: string; saved?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the kiosk management workspace.", { message: workspace.message });
    return <main className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">Kiosk settings unavailable</h1>
      <p role="alert" className="mt-3 text-sm">Check your venue access and connection, then try again.</p>
      <Link href="/attendance" className="mt-4 inline-block text-ocean underline">Return to attendance</Link>
    </main>;
  }
  const attendanceUrl = withBusiness(`/attendance?venue=${encodeURIComponent(workspace.venue.id)}`, workspace.business.id);
  if (workspace.membership.role !== "owner") {
    return <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
      businessCount={workspace.businesses.length} venueName={workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <h1 className="text-2xl font-semibold">Kiosk settings</h1>
      <p role="alert" className="mt-3 text-sm">Only a business owner can manage kiosk devices.</p>
      <Link href={attendanceUrl} className="mt-4 inline-block text-ocean underline">Return to attendance</Link>
    </AppShell>;
  }
  const { data, error } = await workspace.supabase.rpc("list_attendance_kiosks", {
    p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
  });
  const kiosks = parseKioskList(data);
  if (error || !kiosks) console.error("Could not load kiosk devices.", { code: error?.code });

  return <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
    businessCount={workspace.businesses.length} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <Link href={attendanceUrl} className="text-sm font-semibold text-ocean underline">Back to attendance</Link>
    <h1 className="mt-3 text-3xl font-semibold">Kiosk devices</h1>
    <p className="mt-2 text-sm text-muted">
      Devices are limited to {workspace.venue.name}. Revoke a lost or shared device immediately.
    </p>
    {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      {params.error === "permission" ? "Your owner access changed. Refresh and check your permissions."
        : "We couldn't revoke this device. Refresh and try again."}
    </p>}
    {params.saved === "revoked" && <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
      Device revoked. Its unused QR codes no longer work.
    </p>}
    <KioskSetupForm businessId={workspace.business.id} venueId={workspace.venue.id} />
    <section aria-label="Venue kiosk devices" className="mt-6 rounded-xl border border-line bg-white p-5">
      <h2 className="text-lg font-semibold">Venue devices</h2>
      {error || !kiosks ? <p role="alert" className="mt-3 text-sm text-red-800">
        We couldn&apos;t load kiosk devices. Refresh before managing access.
      </p> : kiosks.length === 0 ? <p className="mt-3 text-sm text-muted">No devices created yet.</p> : (
        <ul className="mt-4 space-y-4">
          {kiosks.map((kiosk) => (
            <li key={kiosk.kioskId} className="rounded-lg border border-line p-4">
              <p className="break-words font-semibold">{kiosk.name}</p>
              <p className="mt-1 text-sm text-muted">
                {kiosk.revokedAt ? "Revoked" : !kiosk.activatedAt ? "Awaiting activation" : "Activated"}
                {kiosk.sessionExpiresAt && !kiosk.revokedAt && (
                  <> · access expires <time dateTime={kiosk.sessionExpiresAt}>
                    {new Date(kiosk.sessionExpiresAt).toLocaleString("en-AU", { timeZone: workspace.venue.timezone })}
                  </time> ({workspace.venue.timezone.replaceAll("_", " ")})</>
                )}
              </p>
              {!kiosk.revokedAt && <form action={revokeAttendanceKioskAction} className="mt-3">
                <input type="hidden" name="business_id" value={workspace.business.id} />
                <input type="hidden" name="venue_id" value={workspace.venue.id} />
                <input type="hidden" name="kiosk_id" value={kiosk.kioskId} />
                <button type="submit" className="min-h-11 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-800">
                  Revoke {kiosk.name}
                </button>
              </form>}
            </li>
          ))}
        </ul>
      )}
    </section>
  </AppShell>;
}
