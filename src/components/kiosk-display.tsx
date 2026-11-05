"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { parseKioskDisplayResponse } from "@/lib/attendance-kiosk";

type Display = { url: string; venueName: string; deadline: number };

export function KioskDisplay() {
  const [display, setDisplay] = useState<Display | null>(null);
  const [message, setMessage] = useState("Connecting to the kiosk...");
  const [now, setNow] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const controller = new AbortController();
    async function refresh() {
      const started = performance.now();
      try {
        const response = await fetch("/kiosk/code", {
          method: "POST", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) {
          if (stopped) return;
          console.error("Kiosk code request failed.", { status: response.status });
          setDisplay(null);
          setMessage(response.status === 401
            ? "This device has expired or been revoked. Ask an owner to activate it again."
            : "The kiosk is unavailable. Checking the connection...");
        } else {
          const code = parseKioskDisplayResponse(await response.json());
          const deadline = code ? started + Date.parse(code.expiresAt) - Date.parse(code.serverAt) : 0;
          if (!code || deadline <= performance.now()) {
            if (stopped) return;
            console.error("Kiosk returned an invalid or expired display code.");
            setDisplay(null);
            setMessage("The kiosk code is unavailable. Checking the connection...");
          } else if (!stopped) {
            const query = new URLSearchParams({ business: code.businessId, venue: code.venueId });
            const fragment = new URLSearchParams({ q: code.qrCode });
            setDisplay({
              url: `${window.location.origin}/attendance/qr?${query}#${fragment}`,
              venueName: code.venueName,
              deadline,
            });
            setMessage("");
          }
        }
      } catch (error) {
        if (stopped) return;
        console.error("Could not reach the kiosk service.", error);
        setDisplay(null);
        setMessage("The kiosk is offline. Checking the connection...");
      }
      if (!stopped) timer = window.setTimeout(refresh, 2500);
    }
    void refresh();
    return () => {
      stopped = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = display ? Math.max(0, Math.ceil((display.deadline - now) / 1000)) : 0;
  return <section aria-label="Venue clock QR" className="mt-6">
    {display && seconds > 0 ? (
      <>
        <p className="text-lg font-semibold">{display.venueName}</p>
        <div className="mt-4 inline-block max-w-full rounded-xl bg-white p-3">
          <QRCodeSVG value={display.url} size={320} marginSize={4}
            title="Scan this one-use venue clock QR code" style={{ maxWidth: "100%", height: "auto" }} />
        </div>
        <p className="mt-3 text-sm">Code refreshes after use or in {seconds} seconds.</p>
      </>
    ) : <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
      {message || "Refreshing the kiosk code..."}
    </p>}
    <p className="mt-4 text-sm leading-6 text-muted">
      Sign in to Butterbox on your own phone first, then scan and confirm your clock. Each code works
      once. If you cannot scan, use the regular attendance screen on your own device.
    </p>
  </section>;
}
