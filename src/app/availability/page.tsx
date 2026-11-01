import Link from "next/link";
import { redirect } from "next/navigation";
import {
  cancelAvailabilityExceptionAction,
  requestAvailabilityExceptionAction,
  reviewLeaveRequestAction,
} from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { AvailabilityEditor } from "@/components/availability-editor";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];
const fieldClass = "mt-1 block w-full rounded-lg border border-line bg-white p-2 text-ink";
const statusLabels: Record<string, string> = {
  active: "Unavailable",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};
const savedMessages: Record<string, string> = {
  recurring: "Availability saved.",
  requested: "Leave request submitted.",
  blocked: "Dates marked unavailable.",
  cancelled: "Availability exception cancelled.",
  approved: "Leave approved.",
  rejected: "Leave rejected.",
};
const errorMessages: Record<string, string> = {
  permission: "You cannot make that change. Ask your owner to check your account link and permissions.",
  invalid: "Check the days and times, or confirm that you are unavailable all week.",
  "exception-invalid": "Choose a valid date range of at most 366 days and an exception type.",
  resolved: "That request has already changed. Refresh the page before trying again.",
  refresh: "Your exception was saved, but its confirmation was unavailable. Refresh before trying again.",
  venue: "That venue is unavailable. Select an accessible venue and try again.",
  save: "Could not save availability. Try again.",
};

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; venue?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue);
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the availability workspace.", { message: workspace.message });
    return (
      <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
        <h1 className="text-xl font-semibold">Availability unavailable</h1>
        <p role="alert" className="mt-3 text-sm text-muted">
          We couldn&apos;t load the selected venue. Check your access and connection, then try again.
        </p>
        <Link href="/availability" className="mt-4 inline-block text-sm font-semibold text-ocean">
          Return to an available venue
        </Link>
      </main>
    );
  }

  const canReview = managerRoles.includes(workspace.membership.role);
  const [venues, employeeResult, exceptions, team] = await Promise.all([
    workspace.supabase.from("venues").select("id, name")
      .eq("business_id", workspace.business.id).order("name"),
    workspace.supabase.from("employees").select("id, name")
      .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id)
      .eq("auth_user_id", workspace.user.id).eq("active", true).order("name"),
    workspace.supabase.from("employee_availability_exceptions")
      .select("id, employee_id, starts_on, ends_on, exception_type, status")
      .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id)
      .order("starts_on", { ascending: false }).order("created_at", { ascending: false }),
    canReview
      ? workspace.supabase.from("employees").select("id, name")
          .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const employees = employeeResult.data ?? [];
  const employeeIds = employees.map((employee) => employee.id);
  const [patterns, intervals] = employeeIds.length
    ? await Promise.all([
        workspace.supabase.from("employee_availability_patterns")
          .select("employee_id").in("employee_id", employeeIds),
        workspace.supabase.from("employee_availability_intervals")
          .select("id, employee_id, weekday, start_minute, end_minute")
          .in("employee_id", employeeIds).order("weekday").order("start_minute"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const loadError = venues.error || employeeResult.error || exceptions.error || team.error ||
    patterns.error || intervals.error;
  if (loadError) console.error("Could not load availability.", { code: loadError.code, message: loadError.message });
  const reviewRequests = (exceptions.data ?? []).filter((item) =>
    item.exception_type === "leave" && (item.status === "pending" || item.status === "approved") &&
    (team.data ?? []).some((employee) => employee.id === item.employee_id));

  return (
    <AppShell businessName={workspace.business.name} venueName={workspace.venue.name}
      email={workspace.user.email ?? ""} role={workspace.membership.role}>
      <h1 className="text-3xl font-semibold">Availability and leave</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Tell your manager when you can work each week. Times use {workspace.venue.timezone.replaceAll("_", " ")} local time.
        Outside your saved intervals you will appear unavailable. Block dates immediately or submit leave for a manager to review.
      </p>
      {(venues.data?.length ?? 0) > 1 && (
        <form action="/availability" className="mt-5 flex items-end gap-3">
          <label className="text-sm">Venue
            <select name="venue" defaultValue={workspace.venue.id} className={fieldClass}>
              {venues.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">
            Show venue
          </button>
        </form>
      )}
      {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">
        {errorMessages[params.error] ?? errorMessages.save}
      </p>}
      {params.saved && savedMessages[params.saved] && (
        <p role="status" className="mt-4 rounded-lg bg-soft-sea p-4 text-ocean">{savedMessages[params.saved]}</p>
      )}
      {loadError ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">Could not load availability. Try again.</p>
      ) : (
        <>
          {employees.length === 0 ? (
            <p className="mt-6 rounded-xl border border-line bg-white p-5 text-sm text-muted">
              No active employee profile is linked to your account at this venue. Ask the business owner to link your existing membership.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {employees.map((employee) => {
                const employeeExceptions = (exceptions.data ?? []).filter((item) => item.employee_id === employee.id);
                return (
                  <section key={employee.id} className="rounded-xl border border-line bg-white p-5">
                    <h2 className="font-semibold">{employee.name}</h2>
                    <h3 className="mt-4 text-sm font-semibold">Recurring availability</h3>
                    <AvailabilityEditor employeeId={employee.id} employeeName={employee.name} venueId={workspace.venue.id}
                      submitted={patterns.data?.some((pattern) => pattern.employee_id === employee.id) ?? false}
                      initialIntervals={(intervals.data ?? []).filter((interval) => interval.employee_id === employee.id)} />
                    <h3 className="mt-6 text-sm font-semibold">Date exceptions</h3>
                    <p className="mt-2 text-sm text-muted">
                      Date blocks and approved leave override your recurring pattern for the whole local day.
                      Pending leave is shown on the roster but does not yet change availability.
                    </p>
                    <form action={requestAvailabilityExceptionAction} aria-label={`Date exception for ${employee.name}`}
                      className="mt-3 grid gap-3 sm:grid-cols-4">
                      <input type="hidden" name="venue_id" value={workspace.venue.id} />
                      <input type="hidden" name="employee_id" value={employee.id} />
                      <label className="text-sm">Type
                        <select name="exception_type" className={fieldClass}>
                          <option value="unavailable">Block dates (unavailable)</option>
                          <option value="leave">Request leave</option>
                        </select>
                      </label>
                      <label className="text-sm">From
                        <input type="date" name="starts_on" required className={fieldClass} />
                      </label>
                      <label className="text-sm">Through
                        <input type="date" name="ends_on" required className={fieldClass} />
                      </label>
                      <button type="submit" className="self-end rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">
                        Save date exception
                      </button>
                    </form>
                    <ul aria-label={`Exceptions for ${employee.name}`} className="mt-4 space-y-2">
                      {employeeExceptions.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm">
                          <span>
                            {item.exception_type === "leave" ? "Leave" : "Date block"}: {item.starts_on}
                            {item.ends_on !== item.starts_on ? ` to ${item.ends_on}` : ""} · {statusLabels[item.status] ?? item.status}
                          </span>
                          {(item.status === "active" || item.status === "pending") && (
                            <form action={cancelAvailabilityExceptionAction}>
                              <input type="hidden" name="venue_id" value={workspace.venue.id} />
                              <input type="hidden" name="exception_id" value={item.id} />
                              <button type="submit" className="rounded-lg border border-line px-3 py-1 font-semibold">Cancel</button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                    {employeeExceptions.length === 0 && <p className="mt-3 text-sm text-muted">No date exceptions submitted.</p>}
                    <p className="mt-3 text-xs text-muted">To change approved leave, ask a manager to cancel its approval.</p>
                  </section>
                );
              })}
            </div>
          )}
          {canReview && (
            <section aria-label="Leave requests to review" className="mt-6 rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">Team leave requests</h2>
              <p className="mt-2 text-sm text-muted">Only requests within your management scope are shown.</p>
              {reviewRequests.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No pending or approved leave at this venue.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {reviewRequests.map((item) => {
                    const name = team.data?.find((employee) => employee.id === item.employee_id)?.name ?? "Team member";
                    return (
                      <li key={item.id} aria-label={`Leave request for ${name} ${item.starts_on}`}
                        className="rounded-lg border border-line p-3 text-sm">
                        <p>{name}: {item.starts_on}{item.ends_on !== item.starts_on ? ` to ${item.ends_on}` : ""} · {statusLabels[item.status] ?? item.status}</p>
                        {item.status === "pending" ? (
                          <form action={reviewLeaveRequestAction} className="mt-2 flex flex-wrap gap-2">
                            <input type="hidden" name="venue_id" value={workspace.venue.id} />
                            <input type="hidden" name="exception_id" value={item.id} />
                            <button name="status" value="approved" type="submit" className="rounded-lg bg-ocean px-3 py-1 font-semibold text-white">Approve</button>
                            <button name="status" value="rejected" type="submit" className="rounded-lg border border-line px-3 py-1 font-semibold">Reject</button>
                          </form>
                        ) : (
                          <details className="mt-2">
                            <summary className="cursor-pointer font-semibold">Change approval</summary>
                            <p className="mt-2 text-muted">Cancelling this approval removes the approved-leave indicator.</p>
                            <form action={reviewLeaveRequestAction} className="mt-2">
                              <input type="hidden" name="venue_id" value={workspace.venue.id} />
                              <input type="hidden" name="exception_id" value={item.id} />
                              <button name="status" value="cancelled" type="submit" className="rounded-lg border border-line px-3 py-1 font-semibold">Confirm cancellation</button>
                            </form>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
