"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { saveVenueSettingsAction } from "@/app/actions";
import { FeedbackNotice } from "@/components/feedback";
import {
  venueSettingsSaveButtonState,
  venueSettingsFields,
  type VenueSettingsErrors,
  type VenueSettingsField,
  type VenueSettingsSaveState,
  type VenueSettingsValues,
} from "@/lib/venue-settings";

const initialState: VenueSettingsSaveState = { status: "idle" };
const fieldClass = "mt-2 block w-full rounded-lg border border-line bg-white p-3 text-ink";
const SettingsErrorsContext = createContext<{
  errors: VenueSettingsErrors;
  values: VenueSettingsValues;
  updateValue: (field: VenueSettingsField, value: string) => void;
} | null>(null);

export function VenueSettingsControl({
  name, label, options, type = "select", min, max, step, disabled = false, describedBy,
}: {
  name: VenueSettingsField;
  label: string;
  options?: { value: string; label: string }[];
  type?: "select" | "number";
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  describedBy?: string;
}) {
  const settings = useContext(SettingsErrorsContext);
  if (!settings) throw new Error("Venue settings controls must be inside the settings form.");
  const { errors, values, updateValue } = settings;
  const error = errors[name];
  const errorId = `venue-settings-${name}-error`;
  const description = [describedBy, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <label className="text-sm">{label}
      {type === "select" ? (
        <>
          <select id={`venue-settings-${name}`} name={disabled ? undefined : name} value={values[name]}
            disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={description}
            onChange={(event) => updateValue(name, event.currentTarget.value)}
            className={fieldClass}>
            {options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {disabled && <input type="hidden" name={name} value={values[name]} />}
        </>
      ) : (
        <input id={`venue-settings-${name}`} name={name} type="number" min={min} max={max} step={step}
          value={values[name]} onChange={(event) => updateValue(name, event.currentTarget.value)}
          disabled={disabled} aria-invalid={error ? true : undefined}
          aria-describedby={description} className={fieldClass} />
      )}
      {error && <span id={errorId} role="alert" className="mt-1 block text-sm text-red-800">{error}</span>}
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
  const [values, setValues] = useState(initialValues);
  const [responseVisible, setResponseVisible] = useState(true);
  const submitLocked = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = venueSettingsFields.some((field) => values[field] !== initialValues[field]);
  const showResponse = responseVisible && !pending;
  const errors = showResponse ? state.errors ?? {} : {};
  const button = venueSettingsSaveButtonState(dirty, pending, saveAvailable);

  function updateValue(field: VenueSettingsField, value: string) {
    setValues({ ...values, [field]: value });
  }

  useEffect(() => {
    if (!pending) submitLocked.current = false;
  }, [pending]);

  useEffect(() => {
    if (state.status !== "saved" && state.status !== "partial") return;
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
    const followForm = (event: Event) => {
      if (event.target === formRef.current || !(event.target instanceof HTMLFormElement)) return;
      if (!window.confirm("Discard your unsaved changes and leave this page?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    document.addEventListener("submit", followForm, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
      document.removeEventListener("submit", followForm, true);
    };
  }, [dirty]);

  return (
    <SettingsErrorsContext.Provider value={{ errors, values, updateValue }}>
      <form ref={formRef} action={action} noValidate aria-label="Venue settings"
        onChangeCapture={() => setResponseVisible(false)}
        onSubmitCapture={(event) => {
          if (submitLocked.current || pending || !dirty || !saveAvailable) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          submitLocked.current = true;
          setResponseVisible(true);
        }}>
        <input type="hidden" name="business_id" value={businessId} />
        <input type="hidden" name="venue_id" value={venueId} />
        <input type="hidden" name="revision" value={revision} />
        <input type="hidden" name="pending_id" value={pendingId ?? ""} />
        <input type="hidden" name="request_id" value={requestId} />
        {state.status === "error" && showResponse && (
          <FeedbackNotice kind="error" className="mt-5 p-4">
            {state.message ?? "We couldn't save the venue settings. Review the errors and try again."}
            {errors.form ? ` ${errors.form}` : ""}
          </FeedbackNotice>
        )}
        {state.status === "partial" && showResponse && (
          <FeedbackNotice kind="warning" className="mt-5 p-4">
            {state.message}{errors.form ? ` ${errors.form}` : ""}
          </FeedbackNotice>
        )}
        {state.status === "saved" && showResponse && (
          <FeedbackNotice kind="success" className="mt-5 p-4">
            All changed venue settings were saved.
          </FeedbackNotice>
        )}
        {state.status === "unchanged" && showResponse && (
          <FeedbackNotice kind="info" className="mt-5 p-4">
            No venue settings needed saving.
          </FeedbackNotice>
        )}
        {children}
        {!saveAvailable && (
          <FeedbackNotice kind="error" className="mt-5 p-4">
            Settings could not be loaded safely. Reload before editing or saving.
          </FeedbackNotice>
        )}
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-end">
          <button type="submit" disabled={button.disabled}
            className="min-h-11 w-full rounded-lg bg-ocean px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto">
            {button.label}
          </button>
        </div>
      </form>
    </SettingsErrorsContext.Provider>
  );
}
