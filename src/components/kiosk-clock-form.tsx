"use client";

import Link from "next/link";
import { clockWithKioskAction } from "@/app/actions";
import { ClockLocationForm } from "@/components/clock-location-form";
import { useKioskFragment } from "@/hooks/use-kiosk-fragment";
import type { AttendanceState, ClockOption } from "@/lib/attendance";
import { withBusiness } from "@/lib/business-selection";

export function KioskClockForm({ businessId, venueId, venueName, state, options, geofenceEnabled, requestId }: {
  businessId: string;
  venueId: string;
  venueName: string;
  state: AttendanceState;
  options: ClockOption[];
  geofenceEnabled: boolean;
  requestId: string;
}) {
  const fragment = useKioskFragment("q");
  const attendanceUrl = withBusiness(`/attendance?venue=${encodeURIComponent(venueId)}`, businessId);
  if (fragment.status === "loading") return <p role="status" className="mt-5 text-sm text-muted">Checking the scanned code...</p>;
  if (fragment.status !== "valid") return <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
    No valid kiosk code was found. Sign in on your own phone and scan a fresh code at the venue.
  </p>;
  if (state.state === "needs_review") return <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
    An earlier attendance session needs review. Ask an owner for help.
  </p>;
  if (state.state === "clocked_in" && state.venue_id !== venueId) return <p role="alert"
    className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
    Your open session is at {state.venue_name}. Use that venue&apos;s kiosk or{" "}
    <Link href={attendanceUrl} className="font-semibold underline">open attendance</Link>.
  </p>;
  if (state.state === "clocked_in" && state.active_break) return <p role="alert"
    className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
    End your current break in <Link href={attendanceUrl} className="font-semibold underline">attendance</Link>,
    then scan a fresh code to clock out.
  </p>;
  if (state.state === "clocked_out" && options.length === 0) return <p role="alert"
    className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
    No active employee profile is linked to your account at this venue. Ask an owner to check your access.
  </p>;
  const optionValue = (option: ClockOption) => `${option.employee_id}:${option.department_id}`;
  return <ClockLocationForm action={clockWithKioskAction} enabled={geofenceEnabled}
    className="mt-5 rounded-xl border border-line bg-white p-5">
    <input type="hidden" name="business_id" value={businessId} />
    <input type="hidden" name="venue_id" value={venueId} />
    <input type="hidden" name="request_id" value={requestId} />
    <input type="hidden" name="qr_code" value={fragment.value} />
    {state.state === "clocked_in" ? (
      <>
        <input type="hidden" name="event_type" value="clock_out" />
        <input type="hidden" name="session_id" value={state.session_id} />
        <h2 className="font-semibold">Clock out from {state.venue_name}</h2>
        <p className="mt-2 text-sm text-muted">{state.department_name}</p>
        <button type="submit" className="mt-4 min-h-11 rounded-lg bg-ocean px-5 py-3 font-semibold text-white">
          Confirm QR clock out
        </button>
      </>
    ) : (
      <>
        <input type="hidden" name="event_type" value="clock_in" />
        <h2 className="font-semibold">Clock in at {venueName}</h2>
        {options.length === 1 ? (
          <>
            <input type="hidden" name="clock_option" value={optionValue(options[0])} />
            <p className="mt-2 text-sm text-muted">{options[0].employee_name} · {options[0].department_name}</p>
          </>
        ) : (
          <label className="mt-3 block text-sm">Employee and department
            <select name="clock_option" required defaultValue=""
              className="mt-2 block w-full max-w-md rounded-lg border border-line bg-white p-3">
              <option value="" disabled>Choose your employee and department</option>
              {options.map((option) => <option key={optionValue(option)} value={optionValue(option)}>
                {option.employee_name} · {option.department_name}
              </option>)}
            </select>
          </label>
        )}
        <button type="submit" className="mt-4 min-h-11 rounded-lg bg-ocean px-5 py-3 font-semibold text-white">
          Confirm QR clock in
        </button>
      </>
    )}
    <p className="mt-3 text-sm text-muted">The server records your clock time. Codes expire and can be used once.</p>
  </ClockLocationForm>;
}
