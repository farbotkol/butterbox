"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";

type Capture = {
  status: "position" | "permission_denied" | "unavailable" | "timeout" | "unsupported";
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
};

function requestLocation(): Promise<Capture> {
  if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== "function") {
    return Promise.resolve({ status: "unsupported" });
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve({ status: "timeout" }), 10000);
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          window.clearTimeout(timer);
          resolve({
            status: "position", latitude: position.coords.latitude,
            longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy,
          });
        },
        (error) => {
          window.clearTimeout(timer);
          resolve({
            status: error.code === 1 ? "permission_denied" : error.code === 3 ? "timeout" : "unavailable",
          });
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
      );
    } catch (error) {
      if (error instanceof DOMException || error instanceof TypeError) {
        window.clearTimeout(timer);
        resolve({ status: "unavailable" });
      } else {
        throw error;
      }
    }
  });
}

export function ClockLocationForm({ action, enabled, children, className }: {
  action: (formData: FormData) => Promise<void>;
  enabled: boolean;
  children: ReactNode;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const capturing = useRef(false);
  const ready = useRef(false);
  const [locating, setLocating] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    if (ready.current) {
      ready.current = false;
      return;
    }
    if (capturing.current) {
      event.preventDefault();
      return;
    }
    if (!enabled) return;
    event.preventDefault();
    capturing.current = true;
    setLocating(true);
    const location = await requestLocation();
    const form = formRef.current;
    if (form) {
      const values = {
        location_status: location.status,
        location_latitude: location.latitude?.toString() ?? "",
        location_longitude: location.longitude?.toString() ?? "",
        location_accuracy_meters: location.accuracyMeters?.toString() ?? "",
      };
      for (const [name, value] of Object.entries(values)) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement) {
          input.value = value;
        } else {
          console.error("Could not attach the clock location result; the event will require review.");
        }
      }
      if (form.reportValidity()) {
        ready.current = true;
        form.requestSubmit();
      }
    }
    capturing.current = false;
    setLocating(false);
  }

  return (
    <form ref={formRef} action={action} onSubmit={submit} className={className}>
      <input type="hidden" name="location_status" defaultValue="not_provided" />
      <input type="hidden" name="location_latitude" defaultValue="" />
      <input type="hidden" name="location_longitude" defaultValue="" />
      <input type="hidden" name="location_accuracy_meters" defaultValue="" />
      {children}
      {locating && <p role="status" className="mt-3 text-sm text-muted">Checking location before recording your clock event...</p>}
    </form>
  );
}
