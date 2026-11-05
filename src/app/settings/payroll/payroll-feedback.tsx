const errors: Record<string, string> = {
  invalid: "Choose valid IDs and enter a reason. Account and employee IDs must be 255 characters or fewer.",
  permission: "The selected employee or destination is unavailable, or your payroll access has changed.",
  venue: "The selected venue is unavailable. Check your access and try again.",
  filter: "The directory filters are unavailable. Reset them and try again.",
  confirm: "Confirm the destination and, when removing an ID, confirm the removal before saving.",
  duplicate: "This payroll employee ID is already assigned to another employee in this destination.",
  stale: "The mapping changed or already has that value. Review the refreshed entry before saving.",
  "connection-exists": "This payroll account already has a destination with different details. Select the existing destination.",
  retry: "The request was already used. Review the refreshed mapping before saving.",
  save: "We couldn't confirm the mapping change. Refresh and check it before retrying.",
};

export function PayrollFeedback({ error, saved }: { error: unknown; saved: unknown }) {
  return <>
    {typeof error === "string" && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">
      {Object.hasOwn(errors, error) ? errors[error] : errors.save}
    </p>}
    {typeof saved === "string" && ["connection", "mapping", "removed"].includes(saved) &&
      <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-ocean">
        {saved === "connection" ? "Payroll mapping destination created. No provider has been connected."
          : saved === "removed" ? "Payroll employee mapping removed with an audit record."
            : "Payroll employee mapping saved with an audit record."}
      </p>}
  </>;
}
