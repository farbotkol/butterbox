const errors: Record<string, string> = {
  duplicate: "That name is already used here. No changes were saved; choose a different name.",
  permission: "You don't have permission to make that change. No changes were saved.",
  inactive: "Reactivate the department before saving an active role. No changes were saved.",
  stale: "This record changed while you were editing. No changes were saved; review the current details before trying again.",
  confirm: "Confirm the status change before saving. No changes were saved.",
  filter: "Those directory filters or that venue are unavailable. Reset the filters and try again.",
  save: "We couldn't confirm that change. Check the name and current record before trying again.",
};

const successes: Record<string, string> = {
  department: "Department saved.",
  role: "Job role saved.",
  restriction: "Automatic assignment setting saved.",
  "manual-restriction": "Manual assignment setting saved.",
};

export function DepartmentFeedback({ error, saved }: { error?: string; saved?: string }) {
  const success = saved ? successes[saved] : undefined;
  if (saved && !success) console.error("Invalid department success message.");
  return <>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      {errors[error] ?? errors.save}
    </p>}
    {success && <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
      {success}
    </p>}
  </>;
}
