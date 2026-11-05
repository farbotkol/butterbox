const errors: Record<string, string> = {
  "last-owner": "A business must retain an owner. Assign another owner before changing this role.",
  stale: "These permissions changed while you were editing. Review the current access before trying again.",
  permission: "You don't have permission to change this access.",
  missing: "That member is no longer available in this business.",
  confirm: "Review and confirm the permission change before saving.",
  scope: "Choose a supported role and a valid venue and department scope.",
  filter: "Those directory filters are unavailable. Reset the filters and try again.",
  save: "We couldn't confirm the permission change. Check the current access before trying again.",
};

export function PermissionsFeedback({ error, saved }: { error?: string; saved?: string }) {
  if (saved && saved !== "1") console.error("Invalid permission success message.");
  return <>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      {Object.hasOwn(errors, error) ? errors[error] : errors.save}
    </p>}
    {saved === "1" && <p role="status" className="mt-5 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
      Permissions updated.
    </p>}
  </>;
}
