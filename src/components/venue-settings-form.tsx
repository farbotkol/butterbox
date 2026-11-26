"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { saveVenueSettingsAction } from "@/app/actions";
import {
  mergeSavedVenueSettings,
  venueSettingsSaveButtonState,
  type VenueSettingsErrors,
  type VenueSettingsField,
  type VenueSettingsSaveState,
  type VenueSettingsValues,
} from "@/lib/venue-settings";

const initialState: VenueSettingsSaveState = { status: "idle" };
const fieldClass = "mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink";
const SettingsErrorsContext = createContext<VenueSettingsErrors>({});

function readFormValues(form: HTMLFormElement): VenueSettingsValues {
  const data = new FormData(form);
  const get = (name: VenueSettingsField) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    weekday: get("weekday"),
    mode: get("mode"),
    manual_unavailability: get("manual_unavailability"),
    publish_unavailability: get("publish_unavailability"),
    publish_overlap: get("publish_overlap"),
    publish_long_shift: get("publish_long_shift"),
    latitude: get("latitude"),
    longitude: get("longitude"),
    radius_meters: get("radius_meters"),
    enabled: get("enabled"),
  };
}

export function VenueSettingsControl({
  name, label, value, options, type = "select", min, max, step, disabled = false, describedBy,
}: {
  name: VenueSettingsField;
  label: string;
  value: string;
  options?: { value: string; label: string }[];
  type?: "select" | "number";
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  describedBy?: string;
}) {
  const errors = useContext(SettingsErrorsContext);
  const error = errors[name];
  const errorId = `venue-settings-${name}-error`;
  const description = [describedBy, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <label className="text-sm">{label}
      {type === "select" ? (
        <>
          <select id={`venue-settings-${name}`} name={disabled ? undefined : name} defaultValue={value}
            disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={description}
            className={fieldClass}>
            {options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {disabled && <input type="hidden" name={name} value={value} />}
        </>
      ) : (
        <input id={`venue-settings-${name}`} name={name} type="number" min={min} max={max} step={step}
          defaultValue={value} disabled={disabled} aria-invalid={error ? true : undefined}
          aria-describedby={description} className={fieldClass} />
      )}
      {error && <span id={errorId} className="mt-1 block text-sm text-red-800">{error}</span>}
    </label>
  );
}

export function VenueSettingsForm({
  businessId, venueId, revision, pendingId, requestId, initialValues, saveAvailable = true, children,
}: {
  businessId: string;
  venueId: string;
  revision: number;
  pendingId: string | null;
  requestId: string;
  initialValues: VenueSettingsValues;
  saveAvailable?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveVenueSettingsAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef(initialValues);
  const submittedValues = useRef<VenueSettingsValues | null>(null);
  const [dirty, setDirty] = useState(false);
  const [responseVisible, setResponseVisible] = useState(true);
  const [submitLocked, setSubmitLocked] = useState(false);
  const errors = responseVisible ? state.errors ?? {} : {};
  const button = venueSettingsSaveButtonState(dirty, pending, saveAvailable);

  function updateDirty(form = formRef.current) {
    if (form) {
      const current = readFormValues(form);
      setDirty(Object.keys(current).some((key) =>
        current[key as VenueSettingsField] !== baseline.current[key as VenueSettingsField]));
    }
  }

  useEffect(() => {
    baseline.current = initialValues;
    updateDirty();
  }, [initialValues]);

  useEffect(() => {
    if (!pending) setSubmitLocked(false);
  }, [pending]);

  useEffect(() => {
    if (state.status !== "saved" && state.status !== "partial") return;
    const submitted = submittedValues.current;
    if (submitted && state.savedSections?.length) {
      baseline.current = mergeSavedVenueSettings(baseline.current, submitted, state.savedSections);
    }
    setResponseVisible(true);
    router.refresh();
  }, [router, state]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const followLink = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!link || link.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm("Discard your unsaved changes and leave this page?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
    };
  }, [dirty]);

  return (
    <SettingsErrorsContext.Provider value={errors}>
      <form ref={formRef} action={action} noValidate aria-label="Venue settings"
        onChangeCapture={() => {
          setResponseVisible(false);
          updateDirty();
        }}
        onSubmitCapture={(event) => {
          if (submitLocked || pending || !dirty || !saveAvailable) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          submittedValues.current = formRef.current ? readFormValues(formRef.current) : null;
          setSubmitLocked(true);
        }}>
        <input type="hidden" name="business_id" value={businessId} />
        <input type="hidden" name="venue_id" value={venueId} />
        <input type="hidden" name="revision" value={revision} />
        <input type="hidden" name="pending_id" value={pendingId ?? ""} />
        <input type="hidden" name="request_id" value={requestId} />
        {state.status === "error" && responseVisible && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">
            {state.message ?? "We couldn't save the venue settings. Review the errors and try again."}
            {errors.form ? ` ${errors.form}` : ""}
          </p>
        )}
        {state.status === "partial" && responseVisible && (
          <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-4 text-amber-950">
            {state.message}{errors.form ? ` ${errors.form}` : ""}
          </p>
        )}
        {state.status === "saved" && responseVisible && (
          <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-ocean">
            All changed venue settings were saved.
          </p>
        )}
        {state.status === "unchanged" && responseVisible && (
          <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-ocean">
            No venue settings needed saving.
          </p>
        )}
        {children}
        {!saveAvailable && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">
            Settings could not be loaded safely. Reload before editing or saving.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-end">
          <button type="submit" disabled={button.disabled || submitLocked}
            className="min-h-11 w-full rounded-lg bg-ocean px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto">
            {button.label}
          </button>
        </div>
      </form>
    </SettingsErrorsContext.Provider>
  );
}
