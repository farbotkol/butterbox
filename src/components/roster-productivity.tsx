"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { rosterShortcut } from "@/lib/roster-view";

export function RosterKeyboardControls() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const handle = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("#main-content") ||
        target.isContentEditable || target.closest("form, input, textarea, select, [role='dialog']") ||
        document.querySelector("[data-roster-editor], [data-roster-confirmation='true']")) return;
      const shortcut = rosterShortcut(event);
      if (!shortcut) return;
      const control = document.getElementById(shortcut === "search" ? "roster-search" : `roster-${shortcut}-week`);
      if (shortcut === "search" && control instanceof HTMLInputElement) {
        event.preventDefault();
        control.focus();
        control.select();
      } else if (control instanceof HTMLAnchorElement) {
        event.preventDefault();
        control.click();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [enabled]);
  return <section aria-labelledby="roster-shortcuts-heading" className="mt-4 rounded-lg border border-line bg-white p-4 text-sm">
    <h2 id="roster-shortcuts-heading" className="font-semibold">Roster keyboard shortcuts</h2>
    <label className="mt-2 flex min-h-11 items-center gap-2">
      <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-5 w-5" />
      Enable roster shortcuts
    </label>
    <p className="mt-1 text-muted">
      Optional: Alt+Shift+Left / Right changes week; Alt+Shift+F focuses team-member search.
      Shortcuts start off, apply only when focus is in the main roster outside forms and editors,
      and do not replace ordinary links or browser Find. Disable if your device or assistive technology uses these keys.
    </p>
  </section>;
}

function DeleteButtons({ label, details, open, setOpen }: {
  label: string; details: string; open: boolean; setOpen: (value: boolean) => void;
}) {
  const { pending } = useFormStatus();
  const confirmationId = useId();
  const descriptionId = useId();
  const startRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);
  return <>
    <button type="button" ref={startRef} disabled={pending} aria-label={label} title="Delete draft shift"
      aria-expanded={open} aria-controls={open ? confirmationId : undefined}
      onClick={() => setOpen(true)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted hover:bg-white hover:text-red-700 disabled:opacity-60">
      <Trash2 size={14} aria-hidden="true" />
    </button>
    <noscript>
      <span className="text-xs text-red-900">JavaScript is required to confirm draft deletion.</span>
    </noscript>
    {open && <div id={confirmationId} className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900">
      <p id={descriptionId}>Permanently delete {details}? There is no deletion undo.</p>
      <button type="submit" ref={confirmRef} disabled={pending} aria-describedby={descriptionId}
        className="mt-2 min-h-11 rounded border border-red-300 bg-white px-3 font-semibold disabled:opacity-60">
        {pending ? "Deleting..." : "Confirm deletion"}
      </button>
      <button type="button" disabled={pending} onClick={() => {
        setOpen(false);
        startRef.current?.focus();
      }} className="mt-2 min-h-11 rounded px-3 font-semibold disabled:opacity-60">Cancel deletion</button>
    </div>}
  </>;
}

export function ConfirmedRosterDelete({ action, label, details, children }: {
  action: (formData: FormData) => void | Promise<void>; label: string; details: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <form action={action} aria-label={label} data-roster-confirmation={open || undefined}
    onSubmit={(event) => { if (!open) event.preventDefault(); }}>
    {children}
    <DeleteButtons label={label} details={details} open={open} setOpen={setOpen} />
  </form>;
}
