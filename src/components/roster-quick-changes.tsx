"use client";

import {
  createContext, useContext, useEffect, useRef, useState, useTransition,
  type DragEvent, type ReactNode,
} from "react";
import {
  applyQuickChangeAction, previewQuickChangeAction, undoQuickChangeAction,
} from "@/app/roster/quick-change-actions";
import { formatDay, formatTime, getVenueDate } from "@/lib/dates";
import {
  quickChangeBlockingMessages, quickChangePreviewPayload, quickChangeWarningMessage,
  type QuickChangeInput, type QuickChangeOperation, type QuickChangePreview,
} from "@/lib/roster-quick-changes";

export type QuickShiftSource = {
  id: string;
  departmentId: string;
  employeeId: string | null;
  label: string;
  date: string;
  updatedAt: string;
  isPublished: boolean;
};
export type QuickShiftWorker = { id: string; name: string; departmentId: string };

type Selection = {
  source: QuickShiftSource;
  targetDate: string;
  targetEmployeeId: string | null;
  operation: QuickChangeOperation;
  requestId: string;
};
type UndoReceipt = {
  id: string; requestId: string; operation: QuickChangeOperation; departmentId: string;
};
type QuickChangeContextValue = {
  dragging: QuickShiftSource | null;
  busy: boolean;
  beginDrag: (source: QuickShiftSource) => void;
  endDrag: () => void;
  open: (source: QuickShiftSource, target?: { date: string; employeeId: string }) => void;
};

const QuickChangeContext = createContext<QuickChangeContextValue | null>(null);

function useQuickChange() {
  const context = useContext(QuickChangeContext);
  if (!context) throw new Error("Quick shift controls require a roster quick-change provider.");
  return context;
}

export function RosterQuickChangeProvider({
  businessId, venueId, week, timezone, days, workers, children,
}: {
  businessId: string;
  venueId: string;
  week: string;
  timezone: string;
  days: string[];
  workers: QuickShiftWorker[];
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [preview, setPreview] = useState<QuickChangePreview | null>(null);
  const [undo, setUndo] = useState<UndoReceipt | null>(null);
  const [dragging, setDragging] = useState<QuickShiftSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<"apply" | "undo" | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const selectedShiftId = selection?.source.id;

  useEffect(() => {
    if (selectedShiftId) headingRef.current?.focus();
  }, [selectedShiftId]);

  useEffect(() => {
    if (notice) statusRef.current?.focus();
  }, [notice]);

  function inputFor(value: Selection): QuickChangeInput {
    return {
      businessId, venueId, departmentId: value.source.departmentId, shiftId: value.source.id,
      expectedUpdatedAt: value.source.updatedAt, weekStart: week, targetDate: value.targetDate,
      targetEmployeeId: value.targetEmployeeId, operation: value.operation,
    };
  }

  function requestPreview(value: Selection) {
    setError(null);
    setPreview(null);
    startTransition(async () => {
      try {
        const result = await previewQuickChangeAction(inputFor(value));
        if (result.ok) setPreview(result.value);
        else setError(result.error);
      } catch (cause) {
        console.error("Roster quick-change preview request failed.", cause);
        setError("We couldn't load the preview. Check your connection and try again.");
      }
    });
  }

  function open(source: QuickShiftSource, target?: { date: string; employeeId: string }) {
    if (pending || uncertain) return;
    const currentWorkerEligible = workers.some((worker) =>
      worker.id === source.employeeId && worker.departmentId === source.departmentId);
    const next: Selection = {
      source,
      targetDate: target?.date ?? source.date,
      targetEmployeeId: target?.employeeId ?? (currentWorkerEligible ? source.employeeId : null),
      operation: source.isPublished ? "duplicate" : "move",
      requestId: crypto.randomUUID(),
    };
    setDragging(null);
    setSelection(next);
    setPreview(null);
    setError(null);
    setNotice(null);
    if (target) requestPreview(next);
  }

  function updateSelection(change: Partial<Pick<Selection, "targetDate" | "targetEmployeeId" | "operation">>) {
    if (!selection || pending || uncertain) return;
    setSelection({ ...selection, ...change, requestId: crypto.randomUUID() });
    setPreview(null);
    setError(null);
  }

  function apply() {
    if (!selection || !preview || preview.blocking.length || pending || uncertain === "undo") return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyQuickChangeAction(
          inputFor(selection), selection.requestId, quickChangePreviewPayload(preview),
        );
        if (!result.ok) {
          setError(result.error);
          setUncertain(result.uncertain ? "apply" : null);
          return;
        }
        setUndo({
          id: result.value, requestId: crypto.randomUUID(), operation: selection.operation,
          departmentId: selection.source.departmentId,
        });
        setSelection(null);
        setPreview(null);
        setUncertain(null);
        setNotice(selection.operation === "move"
          ? "Draft shift moved. You can undo this change while the shift remains unchanged."
          : "Draft duplicate created. You can undo this change while the draft remains unchanged.");
      } catch (cause) {
        console.error("Roster quick-change request failed.", cause);
        setError("We couldn't confirm the result. Retry this same request or reload the roster before making another change.");
        setUncertain("apply");
      }
    });
  }

  function undoChange() {
    if (!undo || pending || uncertain === "apply") return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await undoQuickChangeAction(businessId, venueId, undo.id, undo.requestId);
        if (!result.ok) {
          setError(result.error);
          setUncertain(result.uncertain ? "undo" : null);
          return;
        }
        setUndo(null);
        setSelection(null);
        setPreview(null);
        setUncertain(null);
        setNotice(undo.operation === "move" ? "Draft shift move undone." : "Draft duplicate removed.");
      } catch (cause) {
        console.error("Roster quick-change undo request failed.", cause);
        setError("We couldn't confirm the undo. Retry this same request or reload the roster before making another change.");
        setUncertain("undo");
      }
    });
  }

  const availableWorkers = selection
    ? workers.filter((worker) => worker.departmentId === selection.source.departmentId)
    : [];
  const startDay = preview ? getVenueDate(preview.startsAt, timezone) : "";
  const endDay = preview ? getVenueDate(preview.endsAt, timezone) : "";
  const reloadQuery = new URLSearchParams({
    business: businessId, venue: venueId, week,
    department: selection?.source.departmentId ?? undo?.departmentId ?? "",
  });

  return (
    <QuickChangeContext.Provider value={{
      dragging, busy: pending || uncertain !== null,
      beginDrag: setDragging, endDrag: () => setDragging(null), open,
    }}>
      <p id="quick-shift-instructions" className="sr-only">
        Drag this control onto a team member and day, or activate it to select the destination with a keyboard.
        A preview appears before any change is applied.
      </p>
      {(selection || undo || notice || error) && (
        <section aria-label="Quick shift change" data-roster-editor={selection ? true : undefined}
          className="mt-6 rounded-lg border border-ocean/25 bg-white p-4 shadow-sm">
          {selection && (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold focus:outline-2 focus:outline-ocean">
                Quick shift change
              </h2>
              <p className="mt-1 text-sm text-muted">{selection.source.label}</p>
              {selection.source.isPublished && (
                <p className="mt-1 text-sm text-muted">Published shifts can only be duplicated as drafts.</p>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="quick-change-operation" className="block text-sm font-medium">Action</label>
                  <select id="quick-change-operation" value={selection.operation} disabled={pending || !!uncertain}
                    onChange={(event) => updateSelection({
                      operation: event.target.value === "duplicate" ? "duplicate" : "move",
                    })}
                    className="mt-1 min-h-11 rounded-lg border border-line bg-white px-3 text-sm disabled:opacity-60">
                    <option value="move" disabled={selection.source.isPublished}>Move draft</option>
                    <option value="duplicate">Duplicate as draft</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="quick-change-date" className="block text-sm font-medium">Target day</label>
                  <select id="quick-change-date" value={selection.targetDate} disabled={pending || !!uncertain}
                    onChange={(event) => updateSelection({ targetDate: event.target.value })}
                    className="mt-1 min-h-11 rounded-lg border border-line bg-white px-3 text-sm disabled:opacity-60">
                    {days.map((day) => <option key={day} value={day}>{formatDay(day)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="quick-change-worker" className="block text-sm font-medium">Target team member</label>
                  <select id="quick-change-worker" value={selection.targetEmployeeId ?? ""}
                    disabled={pending || !!uncertain}
                    onChange={(event) => updateSelection({ targetEmployeeId: event.target.value || null })}
                    className="mt-1 min-h-11 max-w-full rounded-lg border border-line bg-white px-3 text-sm disabled:opacity-60">
                    <option value="">Open shift</option>
                    {availableWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
                  </select>
                </div>
                <button type="button" disabled={pending || !!uncertain}
                  onClick={() => requestPreview(selection)}
                  className="min-h-11 rounded-lg border border-ocean px-4 text-sm font-semibold text-ocean disabled:opacity-60">
                  {pending && !preview ? "Checking..." : "Preview change"}
                </button>
                <button type="button" disabled={pending || !!uncertain}
                  onClick={() => { setSelection(null); setPreview(null); setError(null); }}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-muted disabled:opacity-60">
                  Cancel
                </button>
              </div>
              {preview && (
                <div aria-label="Shift change preview" aria-live="polite" className="mt-4 rounded-lg bg-cloud p-3 text-sm">
                  <p className="font-semibold">
                    {preview.operation === "move" ? "Move" : "Duplicate"} {preview.roleTitle} to{" "}
                    {preview.targetEmployeeName ?? "an open shift"} on {formatDay(preview.targetDate)}
                  </p>
                  <p className="mt-1">
                    <time dateTime={preview.startsAt}>{formatDay(startDay)} {formatTime(preview.startsAt, timezone)}</time>
                    {" - "}
                    <time dateTime={preview.endsAt}>
                      {endDay !== startDay && `${formatDay(endDay)} `}{formatTime(preview.endsAt, timezone)}
                    </time>
                    {" "}({timezone.replaceAll("_", " ")}).
                  </p>
                  {preview.blocking.map((reason) => (
                    <p key={reason} role="alert" className="mt-2 font-semibold text-red-800">
                      {quickChangeBlockingMessages[reason]}
                    </p>
                  ))}
                  {preview.warnings.map((reason) => (
                    <p key={reason} className="mt-2 font-semibold text-amber-900">
                      {quickChangeWarningMessage(reason, preview)}
                    </p>
                  ))}
                  <button type="button" onClick={apply}
                    disabled={pending || preview.blocking.length > 0 || uncertain === "undo"}
                    className="mt-3 min-h-11 rounded-lg bg-ocean px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {pending ? "Applying..." : uncertain === "apply" ? "Retry same request"
                      : preview.operation === "move" ? "Apply move" : "Create draft duplicate"}
                  </button>
                </div>
              )}
            </>
          )}
          {notice && (
            <div ref={statusRef} role="status" tabIndex={-1} className="mt-2 text-sm font-semibold text-ocean">
              {notice}
            </div>
          )}
          {undo && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={undoChange} disabled={pending || uncertain === "apply"}
                className="min-h-11 rounded-lg border border-ocean px-4 text-sm font-semibold text-ocean disabled:opacity-60">
                {pending ? "Working..." : uncertain === "undo" ? "Retry undo" : "Undo last quick change"}
              </button>
              <button type="button" disabled={pending || !!uncertain}
                onClick={() => { setUndo(null); setNotice(null); setError(null); }}
                className="min-h-11 rounded-lg px-3 text-sm font-semibold text-muted disabled:opacity-60">
                Dismiss undo
              </button>
            </div>
          )}
          {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {uncertain && (
            <p className="mt-2 text-sm text-muted">
              Retry the same request above, or{" "}
              <a className="font-semibold underline" href={`/roster?${reloadQuery}`}>reload the roster</a> and check the result.
            </p>
          )}
        </section>
      )}
      {children}
    </QuickChangeContext.Provider>
  );
}

export function QuickShiftHandle({ source }: { source: QuickShiftSource }) {
  const context = useQuickChange();
  function onDragStart(event: DragEvent<HTMLButtonElement>) {
    if (context.busy) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = source.isPublished ? "copy" : "copyMove";
    event.dataTransfer.setData("application/x-butterbox-roster-shift", source.id);
    context.beginDrag(source);
  }
  return (
    <button type="button" draggable={!context.busy} disabled={context.busy}
      onDragStart={onDragStart} onDragEnd={context.endDrag} onClick={() => context.open(source)}
      aria-describedby="quick-shift-instructions" aria-label={`Move or duplicate ${source.label}`}
      title="Drag to a team member and day, or activate to choose a destination"
      className="min-h-11 rounded border border-ocean/25 bg-white px-2 text-[10px] font-semibold text-ocean hover:bg-soft-sea focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean disabled:opacity-60">
      Move or duplicate
    </button>
  );
}

export function QuickShiftDropTarget({
  departmentId, employeeId, date, enabled, children,
}: {
  departmentId: string;
  employeeId: string;
  date: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const context = useQuickChange();
  const canDrop = enabled && !context.busy && context.dragging?.departmentId === departmentId;
  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!canDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = context.dragging?.isPublished ? "copy" : "move";
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!canDrop || !context.dragging ||
      event.dataTransfer.getData("application/x-butterbox-roster-shift") !== context.dragging.id) return;
    event.preventDefault();
    context.open(context.dragging, { date, employeeId });
  }
  return (
    <div onDragOver={onDragOver} onDrop={onDrop}
      className={`min-h-12 space-y-1.5 rounded ${canDrop ? "outline-2 outline-offset-2 outline-ocean/40" : ""}`}>
      {children}
    </div>
  );
}
