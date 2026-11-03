"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SaveButton({ children, className }: { children: ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
    {pending ? "Saving..." : children}
  </button>;
}

export function InlineEditor({ label, read, editor, initialEditing = false }: {
  label: string;
  read: ReactNode;
  editor: ReactNode;
  initialEditing?: boolean;
}) {
  const [editing, setEditing] = useState(initialEditing);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const submitted = useRef(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const discardButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) discardButton.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (!editing || !dirty || submitting) return;
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
  }, [dirty, editing, submitting]);

  function closeEditor() {
    setEditing(false);
    setDirty(false);
    setConfirming(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }

  return <div onChangeCapture={() => { if (editing) setDirty(true); }}
    onSubmitCapture={(event) => {
      if (submitted.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      submitted.current = true;
      setSubmitting(true);
    }}>
    {!editing ? <>
      {read}
      <button type="button" ref={editButton} onClick={() => {
        submitted.current = false;
        setSubmitting(false);
        setEditing(true);
      }} className="mt-3 min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ocean">
        {label}
      </button>
    </> : <>
      <p className="mt-3 text-sm text-muted" role="status">Editing. Changes are not saved yet.</p>
      {editor}
      {!confirming ? <button type="button" disabled={submitting} onClick={() => {
        if (dirty) setConfirming(true);
        else closeEditor();
      }} className="mt-3 min-h-11 rounded-lg px-4 py-2 text-sm font-semibold text-ocean">
        Cancel
      </button> : <div role="group" aria-label="Discard unsaved changes" className="mt-3 rounded-lg border border-line bg-cloud p-3">
        <p className="text-sm">Discard these unsaved changes?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" ref={discardButton} onClick={closeEditor}
            className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold">
            Discard changes
          </button>
          <button type="button" onClick={() => setConfirming(false)}
            className="min-h-11 rounded-lg px-4 py-2 text-sm font-semibold text-ocean">
            Keep editing
          </button>
        </div>
      </div>}
    </>}
  </div>;
}
