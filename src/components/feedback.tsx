"use client";

import {
  useEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref,
} from "react";
import { useFormStatus } from "react-dom";

const noticeClasses = {
  error: "rounded-lg bg-red-50 text-red-800",
  warning: "rounded-lg bg-amber-50 text-amber-950",
  success: "rounded-lg bg-soft-sea text-ocean",
  info: "rounded-lg bg-cloud text-ink",
};

export function FeedbackNotice({ kind, className = "", focusRef, tabIndex, children }: {
  kind: keyof typeof noticeClasses;
  className?: string;
  focusRef?: Ref<HTMLParagraphElement>;
  tabIndex?: number;
  children: ReactNode;
}) {
  return (
    <p ref={focusRef} tabIndex={tabIndex} role={kind === "error" || kind === "warning" ? "alert" : "status"}
      className={`${noticeClasses[kind]} ${className}`}>
      {children}
    </p>
  );
}

export function FieldError({ id, className = "", children }: {
  id: string;
  className?: string;
  children?: ReactNode;
}) {
  if (!children) return null;
  return <span id={id} role="alert" className={`text-red-800 ${className}`}>{children}</span>;
}

export function PendingButton({
  pending, pendingLabel = "Saving...", children, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean; pendingLabel?: string }) {
  const formStatus = useFormStatus();
  const isPending = pending ?? formStatus.pending;
  return (
    <button {...props} type={props.type ?? "submit"} disabled={props.disabled || isPending}
      aria-busy={isPending || undefined}>
      {isPending ? pendingLabel : children}
    </button>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-cloud motion-reduce:animate-none ${className}`} />;
}

export function FocusManagedDrawer({ labelledBy, closeDisabled = false, onClose, children }: {
  labelledBy: string;
  closeDisabled?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const drawer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const returnFocus = document.activeElement;
    drawer.current?.querySelector<HTMLElement>("[data-drawer-initial-focus]")?.focus();
    return () => {
      if (returnFocus instanceof HTMLElement) {
        requestAnimationFrame(() => {
          if (returnFocus.isConnected) returnFocus.focus();
        });
      }
    };
  }, []);

  function manageKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!closeDisabled) onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(drawer.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) {
      event.preventDefault();
      drawer.current?.focus();
      return;
    }

    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (activeIndex === -1) {
      event.preventDefault();
      (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus();
    } else if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
      event.preventDefault();
      focusable[0]?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-ink/40">
      <div ref={drawer} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}
        onKeyDown={manageKeyboard}
        className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-line bg-white p-4 shadow-xl sm:p-6">
        {children}
      </div>
    </div>
  );
}
