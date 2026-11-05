const errors: Record<string, string> = {
  permission: "You cannot manage that department or employee.",
  "primary-department": "Choose another primary role before removing its department.",
  primary: "Choose another primary role before removing that qualification.",
  roles: "Could not save roles. Choose active roles in the worker's linked departments.",
  inactive: "Inactive departments cannot be newly assigned.",
  account: "Could not link that account. Choose an eligible, unlinked business member.",
  "shared-confirm": "Confirm the shared-profile change before saving.",
  "shared-venue": "This worker already has a linked profile at that venue.",
  "shared-groups": "These profiles belong to different shared workers. Unlink the incorrect profiles first.",
  "shared-clock": "Finish at least one open clock session before linking these profiles.",
  shared: "Could not change the shared-worker link. Check the profiles and try again.",
  "invite-disabled": "Email invitations are unavailable in the public demo.",
  "invite-duplicate": "An active invitation already exists. Resend or revoke it before creating another.",
  "invite-email": "Enter a valid invitation email address.",
  "invite-send": "The invitation was saved, but its email could not be requested. Check your email configuration or try Resend email later.",
  "invite-expired": "That invitation has expired. Send a new invitation instead.",
  invite: "Could not change the invitation. Check your access and the employee's status, then try again.",
  "employment-stale": "Employment metadata changed. Refresh and review the current details before saving.",
  "profile-stale": "This profile changed while you were editing. Review the current details before trying again.",
  "section-stale": "This section changed while you were editing. Review the current details before trying again.",
  "lifecycle-confirm": "Confirm the status change before saving.",
  "employment-invalid": "Could not save employment metadata. Check all dates and details and try again.",
  filter: "That directory filter is unavailable. Choose a permitted venue, department and role.",
  save: "Could not save the employee. Check the details and try again.",
};

const successes: Record<string, string> = {
  "1": "Employee profile saved.",
  created: "Person added.",
  archived: "Person archived. Existing history is preserved.",
  reactivated: "Person reactivated.",
  departments: "Department membership saved.",
  roles: "Eligible roles saved.",
  primary: "Primary role saved.",
  account: "Account link saved.",
  "invite-sent": "Invitation email requested. The recipient should check their inbox.",
  "invite-revoked": "Invitation revoked.",
  "shared-link": "Shared-worker profiles linked.",
  "shared-unlink": "Shared-worker profile unlinked.",
};

export function PeopleFeedback({ error, saved }: { error?: string; saved?: string }) {
  return <>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      {errors[error] ?? errors.save}
    </p>}
    {saved && <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-sm text-ocean">
      {successes[saved] ?? successes["1"]}
    </p>}
  </>;
}
