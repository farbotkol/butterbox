import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DiscardKioskFragment } from "@/components/discard-kiosk-fragment";
import { KioskClockForm } from "@/components/kiosk-clock-form";
import { parseAttendanceState, parseClockOptions, type ClockOption } from "@/lib/attendance";
import { parseBusinessId, withBusiness } from "@/lib/business-selection";
import { readAllPages } from "@/lib/paginated-rows";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const errors: Record<string, string> = {
  "qr-used": "That code was already used. Wait for the kiosk to refresh and scan a new code.",
  "qr-expired": "That code has expired or its kiosk is unavailable. Scan a new code.",
  invalid: "That QR clock request was invalid. Scan a new code and try again.",
  permission: "Your employee link or venue access changed. Ask an owner to check it.",
  "already-in": "An attendance session is already open for this account or linked profile.",
  "already-out": "This attendance session has already ended.",
  "break-open": "End your current break before clocking out, then scan a new code.",
  unavailable: "This profile or department is no longer available for a new session.",
  reused: "The clock request was already used. Scan a new code and try again.",
  "period-finalised": "This payroll period is finalised. Ask an authorized manager for help.",
  save: "We couldn't record the QR clock. Check your connection and scan a new code.",
};

export default async function KioskClockPage({ searchParams }: {
  searchParams: Promise<{ business?: string; venue?: string; error?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup#");
  const params = await searchParams;
  const businessId = parseBusinessId(params.business);
  const venueId = parseBusinessId(params.venue);
  if (!businessId || !venueId) return <main className="mx-auto max-w-lg p-8">
    <DiscardKioskFragment />
    <h1 className="text-xl font-semibold">Invalid kiosk link</h1>
    <p role="alert" className="mt-3 text-sm">Sign in on your phone and scan a fresh venue code.</p>
  </main>;
  const workspace = await getWorkspace(venueId, { businessId, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=qr-sign-in#");
  if (workspace.status === "needs_setup") redirect("/setup#");
  if (workspace.status === "error") {
    console.error("Could not load QR clock workspace.", { message: workspace.message });
    return <main className="mx-auto max-w-lg p-8">
      <DiscardKioskFragment />
      <h1 className="text-xl font-semibold">QR clock unavailable</h1>
      <p role="alert" className="mt-3 text-sm">
        This venue is unavailable to your account. Ask an owner to check your access.
      </p>
      <Link href="/attendance" className="mt-4 inline-block text-ocean underline">Open attendance</Link>
    </main>;
  }
  const [venueResult, optionResult, stateResult] = await Promise.all([
    workspace.supabase.from("venues").select("clock_geofence_enabled")
      .eq("id", venueId).eq("business_id", businessId).single(),
    readAllPages<ClockOption>((from, to) => workspace.supabase.rpc("list_my_clock_options", {
      p_business_id: businessId, p_venue_id: venueId,
    }, { count: "exact" }).order("employee_id").order("department_id").range(from, to),
    (option) => option && typeof option.employee_id === "string" && typeof option.department_id === "string"
      ? `${option.employee_id}:${option.department_id}` : ""),
    workspace.supabase.rpc("get_my_attendance_state_with_break", { p_business_id: businessId }).single(),
  ]);
  const options = parseClockOptions(optionResult.data);
  const state = parseAttendanceState(stateResult.data);
  const loadError = venueResult.error || optionResult.error || stateResult.error;
  const geofenceEnabled = venueResult.data?.clock_geofence_enabled;
  if (loadError || !options || !state || typeof geofenceEnabled !== "boolean") {
    console.error("Could not load QR clock options or state.", { code: loadError?.code });
  }
  const attendanceUrl = withBusiness(`/attendance?venue=${encodeURIComponent(venueId)}`, businessId);
  return <AppShell businessName={workspace.business.name} businessId={businessId}
    businessCount={workspace.businesses.length} venueId={workspace.venue.id} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <Link href={attendanceUrl} className="text-sm font-semibold text-ocean underline">Back to attendance</Link>
    <h1 className="mt-3 text-3xl font-semibold">Confirm QR clock</h1>
    <p className="mt-2 text-sm text-muted">Check the venue and confirm your own clock event.</p>
    {params.error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      {Object.hasOwn(errors, params.error) ? errors[params.error] : errors.save}
    </p>}
    {loadError || !options || !state || typeof geofenceEnabled !== "boolean" ? (
      <>
        <DiscardKioskFragment />
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          We couldn&apos;t load your attendance. Check your connection and scan a new code.
        </p>
      </>
    ) : (
      <KioskClockForm businessId={businessId} venueId={venueId} venueName={workspace.venue.name}
        state={state} options={options} geofenceEnabled={geofenceEnabled} requestId={randomUUID()} />
    )}
  </AppShell>;
}
