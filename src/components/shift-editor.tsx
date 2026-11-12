"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveShiftAction } from "@/app/actions";
import type { ShiftFormState, ShiftFormValues } from "@/lib/shift-form";

type EmployeeOption = { id: string; name: string; role_title: string };
type ShiftEditorProps = {
  week: string;
  venueId: string;
  departmentId: string;
  collapsed: string[];
  employees: EmployeeOption[];
  unavailableEmployee?: EmployeeOption;
  roleSuggestions: string[];
  initialValues: ShiftFormValues;
  shiftId?: string;
  cancelHref: string;
};

const initialState: ShiftFormState = { errors: {} };
const inputClass = "mt-1.5 block w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-ocean";

export function ShiftEditor({
  week,
  venueId,
  departmentId,
  collapsed,
  employees,
  unavailableEmployee,
  roleSuggestions,
  initialValues,
  shiftId,
  cancelHref,
}: ShiftEditorProps) {
  const [state, action, pending] = useActionState(saveShiftAction, initialState);
  const [values, setValues] = useState(state.values ?? initialValues);
  const setField = (field: keyof ShiftFormValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  // A resolved server action otherwise resets the form even when it returns errors.
  return (
    <form id="shift-editor" action={action} noValidate aria-label={shiftId ? "Edit draft shift" : "Add draft shift"}
      onReset={(event) => event.preventDefault()}
      className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <input name="week" type="hidden" value={week} />
      <input name="venue_id" type="hidden" value={venueId} />
      <input name="department_id" type="hidden" value={departmentId} />
      {shiftId && <input name="shift_id" type="hidden" value={shiftId} />}
      {collapsed.map((id) => <input key={id} name="collapsed" type="hidden" value={id} />)}
      {state.errors.form && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2 xl:col-span-6">
          {state.errors.form}
        </p>
      )}
      <p className="text-xs text-muted sm:col-span-2 xl:col-span-6">
        When clocks repeat a time, newly entered times use the later occurrence.
      </p>
      <div className="text-xs font-medium text-muted">
        <label htmlFor="shift-role">Role</label>
        <input id="shift-role" className={inputClass} maxLength={80} name="role_title"
          placeholder="Barista" list="role-suggestions" required value={values.role}
          aria-invalid={state.errors.role ? true : undefined}
          aria-describedby={state.errors.role ? "shift-role-error" : undefined}
          onChange={(event) => setField("role", event.target.value)} />
        <datalist id="role-suggestions">
          {roleSuggestions.map((role) => <option key={role} value={role} />)}
        </datalist>
        {state.errors.role && <p id="shift-role-error" role="alert" className="mt-1 text-red-800">{state.errors.role}</p>}
      </div>
      <div className="text-xs font-medium text-muted">
        <label htmlFor="shift-employee">Team member</label>
        <select id="shift-employee" className={inputClass} name="employee_id" value={values.employee}
          aria-invalid={state.errors.employee ? true : undefined}
          aria-describedby={state.errors.employee ? "shift-employee-help shift-employee-error" : "shift-employee-help"}
          onChange={(event) => setField("employee", event.target.value)}>
          <option value="">Open shift</option>
          {!shiftId && <option value="auto">Automatically choose an eligible worker</option>}
          {unavailableEmployee && (
            <option value={unavailableEmployee.id}>
              {unavailableEmployee.name} · {unavailableEmployee.role_title} (unavailable)
            </option>
          )}
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name} · {employee.role_title}
            </option>
          ))}
        </select>
        <p id="shift-employee-help" className="mt-1 font-normal">
          {shiftId
            ? "Choose an active linked team member or leave this shift open."
            : "Automatic selection checks qualifications, overlaps, submitted availability, date blocks and approved leave. Unsubmitted availability is unknown."}
          {" "}Manual assignment may require qualifications for the selected role.
        </p>
        {state.errors.employee && <p id="shift-employee-error" role="alert" className="mt-1 text-red-800">{state.errors.employee}</p>}
      </div>
      <div className="text-xs font-medium text-muted">
        <label htmlFor="shift-start">Starts</label>
        <input id="shift-start" className={inputClass} name="start" required type="datetime-local"
          value={values.start} aria-invalid={state.errors.start ? true : undefined}
          aria-describedby={state.errors.start ? "shift-start-error" : undefined}
          onChange={(event) => setField("start", event.target.value)} />
        {state.errors.start && <p id="shift-start-error" role="alert" className="mt-1 text-red-800">{state.errors.start}</p>}
      </div>
      <div className="text-xs font-medium text-muted">
        <label htmlFor="shift-end">Ends</label>
        <input id="shift-end" className={inputClass} name="end" required type="datetime-local"
          value={values.end} aria-invalid={state.errors.end ? true : undefined}
          aria-describedby={state.errors.end ? "shift-end-error" : undefined}
          onChange={(event) => setField("end", event.target.value)} />
        {state.errors.end && <p id="shift-end-error" role="alert" className="mt-1 text-red-800">{state.errors.end}</p>}
      </div>
      <div className="text-xs font-medium text-muted">
        <label htmlFor="shift-break">Break (mins)</label>
        <input id="shift-break" className={inputClass} name="break_minutes" type="number" min={0} max={240}
          value={values.break} aria-invalid={state.errors.break ? true : undefined}
          aria-describedby={state.errors.break ? "shift-break-error" : undefined}
          onChange={(event) => setField("break", event.target.value)} />
        {state.errors.break && <p id="shift-break-error" role="alert" className="mt-1 text-red-800">{state.errors.break}</p>}
      </div>
      <div className="flex items-end gap-2">
        {shiftId && <Link href={cancelHref} className="rounded-lg border border-line px-3 py-2.5 text-sm font-semibold">Cancel</Link>}
        <button className="w-full rounded-lg bg-ocean px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean/90 disabled:opacity-60"
          disabled={pending} type="submit">
          {pending ? "Saving..." : shiftId ? "Update draft shift" : "Save draft shift"}
        </button>
      </div>
    </form>
  );
}
