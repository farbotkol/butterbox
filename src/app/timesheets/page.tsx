import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  bulkLockWeeklyAttendanceAction, decidePayrollPeriodAction, decideTimesheetAction,
  prepareGenericPayrollExportAction, reconcileGenericPayrollExportAction,
} from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { correctionEventLabels } from "@/lib/attendance-corrections";
import {
  PayrollRecordValidationError, validateCanonicalPayrollRows,
  type CanonicalPayrollRecord, type CanonicalPayrollScope,
} from "@/lib/canonical-payroll";
import { addDays, formatDay } from "@/lib/dates";
import {
  isPayrollUuid, validateGenericPayrollHistory, validateGenericPayrollHistoryEntries, validateGenericPayrollReview,
  type GenericPayrollHistoryEntry, type GenericPayrollHistoryEvent, type GenericPayrollReview,
} from "@/lib/generic-payroll-exports";
import { readAllPages } from "@/lib/paginated-rows";
import {
  parsePayrollPeriod, parsePayrollPeriodEvents, parsePayrollPeriodExceptions, payrollActorLabel,
  payrollExceptionLabels, payrollPeriodStatusLabels,
} from "@/lib/payroll-periods";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  parseTimesheetApprovals, timesheetApprovalLabels, timesheetApprovalsWithinSessions,
  type TimesheetApproval,
} from "@/lib/timesheet-approvals";
import {
  groupWeeklyTimesheets, parseStoredBulkLockReceipt, parseTimesheetEditEvents, parseTimesheetEditTime,
  parseTimesheetEmployeeFilter, parseTimesheetEmployees, parseTimesheetPlannedShifts,
  timesheetEditSourcesMatch, timesheetEmployeeOptions, timesheetWeek, weeklyTimesheetNotices,
  type TimesheetEditEvent, type TimesheetEditTime, type TimesheetEmployee, type TimesheetPlannedShift,
  type TimesheetSourceEvent,
} from "@/lib/weekly-timesheet";
import { formatWorkedDuration, workTimeExceptionLabels } from "@/lib/worked-time";
import { getWorkspace } from "@/lib/workspace";
import { withBusiness } from "@/lib/business-selection";

const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];
const errors: Record<string, string> = {
  "bulk-invalid": "Select between 1 and 100 available sessions and enter a reason of up to 500 characters.",
  "bulk-venue": "The selected venue is unavailable. Check your access and try again.",
  "bulk-stale": "Attendance changed. Review the refreshed sessions before locking them.",
  "bulk-scope": "Some selected attendance is unavailable or your access changed. Refresh and review your scope.",
  "bulk-retry": "This request was already used for a different selection. Review the refreshed sessions and try again.",
  "bulk-save": "We couldn't confirm the edit locks. Check their history before retrying.",
  "decision-invalid": "The approval request was invalid. Refresh the timesheet and try again.",
  "return-invalid": "Enter a reason of up to 500 characters before returning time for correction.",
  "decision-stale": "Attendance or its approval changed. Review the refreshed entry before deciding again.",
  "decision-scope": "This attendance is unavailable or outside your department scope. Refresh and review your access.",
  "decision-retry": "This request was already used for a different decision. Review the refreshed entry and try again.",
  "decision-self": "You cannot approve or return your own attendance. Ask another manager or the owner.",
  "decision-incomplete": "Incomplete or invalid attendance cannot be approved. Return it for correction instead.",
  "decision-locked": "Locked attendance must be unlocked by an owner or general manager before it can be returned.",
  "decision-save": "We couldn't confirm the timesheet decision. Check the entry before retrying.",
  "period-invalid": "The payroll period request was invalid. Notes must be 500 characters or fewer.",
  "period-reason": "Enter a reason of up to 500 characters before reopening the payroll period.",
  "period-permission": "Only an owner, admin or general manager with access to every department in this venue can finalise or reopen payroll.",
  "period-not-ended": "This payroll period has not ended yet. Finalise it after the week closes.",
  "period-exceptions": "Resolve every outstanding exception before finalising this payroll period.",
  "period-stale": "The payroll period changed. Review its refreshed status and history before trying again.",
  "period-retry": "This request was already used for a different payroll period action. Review the refreshed period and try again.",
  "period-finalised": "This payroll period is finalised. Reopen it with a reason before changing, approving or locking attendance.",
  "period-save": "We couldn't confirm the payroll period change. Check its history before retrying.",
  "export-invalid": "The payroll export request was invalid. Refresh the period and try again.",
  "export-permission": "Only an owner, admin or general manager with access to every department in this venue can export payroll.",
  "export-stale": "Payroll or the reconciliation review changed. Refresh and review it again before proceeding.",
  "export-exceptions": "Resolve every outstanding payroll exception before preparing or downloading an export.",
  "export-reconciliation": "Review and reconcile previously exported changes before preparing another export.",
  "export-reconcile-invalid": "Enter a reason of up to 500 characters and confirm that you handled the changes externally.",
  "export-empty": "There are no new approved sessions available for export.",
  "export-name": "An employee name is blank or too long for export. Correct the employee profile, then try again.",
  "export-retry": "This request was already used for a different payroll action. Refresh and review before retrying.",
  "export-save": "We couldn't confirm the payroll action. Check the export history before retrying.",
};
const periodMessages: Record<string, string> = {
  finalised: "Payroll period finalised. Attendance in this week cannot change until it is reopened.",
  reopened: "Payroll period reopened. The previous finalisation and your reason remain in its history.",
};
const decidedMessages: Record<string, string> = {
  approved: "Timesheet entry approved for your department and locked against corrections.",
  rejected: "Timesheet entry returned to the employee for correction.",
};
const sourceLabels: Record<TimesheetSourceEvent["source"], string> = {
  server_clock: "Server clock event",
  offline_claim: "Unverified offline claim",
  manager_reported: "Manager-reported break end",
  employee_request: "Unverified employee-requested time",
};

function formatClockTime(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone, timeZoneName: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

function totalDuration(values: number[]): string {
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number.isSafeInteger(Math.round(total * 1_000_000)) ? formatWorkedDuration(total) : "Unavailable";
}

export default async function TimesheetsPage({ searchParams }: {
  searchParams: Promise<{ business?: string;
    venue?: string; week?: string; employee?: string; error?: string; receipt?: string; decided?: string;
    period?: string; export_batch?: string; export_reconciliation?: string;
  }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login?error=setup");
  const params = await searchParams;
  const workspace = await getWorkspace(params.venue, { businessId: params.business, page: true });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "needs_setup") redirect("/setup");
  if (workspace.status === "error") {
    console.error("Could not load the timesheet workspace.", { message: workspace.message });
    return <main className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8">
      <h1 className="text-xl font-semibold">Timesheets unavailable</h1>
      <p role="alert" className="mt-3 text-sm text-muted">
        We couldn&apos;t load the selected venue. Check your access and connection, then try again.
      </p>
      <Link href="/timesheets" className="mt-4 inline-block text-sm font-semibold text-ocean">
        Return to an available venue
      </Link>
    </main>;
  }
  if (!managerRoles.includes(workspace.membership.role)) redirect(withBusiness("/?error=permission", workspace.business.id));

  const week = timesheetWeek(params.week, workspace.venue.timezone);
  const employee = parseTimesheetEmployeeFilter(params.employee);
  const validFilters = week !== null && employee !== undefined;
  const receiptRequested = params.receipt !== undefined;
  const receiptId = receiptRequested ? parseTimesheetEmployeeFilter(params.receipt) : null;
  const [
    venuesResult, employeesResult, plannedResult, actualResult, eventsResult, receiptResult, approvalsResult,
    periodResult, periodExceptionsResult, periodEventsResult,
  ] = await Promise.all([
    readAllPages<TimesheetEmployee>((from, to) => workspace.supabase.from("venues")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
      .order("name").order("id").range(from, to), (row) => row && typeof row.id === "string" ? row.id : ""),
    readAllPages<TimesheetEmployee>((from, to) => workspace.supabase.from("employees")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
      .eq("venue_id", workspace.venue.id).order("name").order("id").range(from, to),
    (row) => row && typeof row.id === "string" ? row.id : ""),
    validFilters
      ? readAllPages<TimesheetPlannedShift>((from, to) => workspace.supabase.rpc("list_weekly_planned_shifts", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week, p_employee_id: employee,
      }, { count: "exact" }).order("starts_at").order("shift_id").range(from, to),
      (row) => row && typeof row.shift_id === "string" ? row.shift_id : "")
      : Promise.resolve({ data: [], error: null }),
    validFilters
      ? readAllPages<TimesheetEditTime>((from, to) => workspace.supabase.rpc("list_weekly_worked_time_for_edit", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week, p_employee_id: employee,
      }, { count: "exact" }).order("clocked_in_at", { nullsFirst: true }).order("session_id").range(from, to),
      (row) => row && typeof row.session_id === "string" ? row.session_id : "")
      : Promise.resolve({ data: [], error: null }),
    validFilters
      ? readAllPages<TimesheetEditEvent>((from, to) => workspace.supabase.rpc("list_weekly_timesheet_events_for_edit", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week, p_employee_id: employee,
      }, { count: "exact" }).order("session_id").order("original_at").order("event_id").range(from, to),
      (row) => row && typeof row.event_id === "string" ? row.event_id : "")
      : Promise.resolve({ data: [], error: null }),
    validFilters && receiptId
      ? workspace.supabase.rpc("get_weekly_bulk_lock_receipt", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_batch_id: receiptId,
      })
      : Promise.resolve({ data: null, error: null }),
    validFilters
      ? readAllPages<TimesheetApproval>((from, to) => workspace.supabase.rpc("list_weekly_timesheet_approvals", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week, p_employee_id: employee,
      }, { count: "exact" }).order("session_id").range(from, to),
      (row) => row && typeof row.session_id === "string" ? row.session_id : "")
      : Promise.resolve({ data: [], error: null }),
    week
      ? workspace.supabase.rpc("get_payroll_period", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
      })
      : Promise.resolve({ data: null, error: null }),
    week
      ? readAllPages<Record<string, unknown>>((from, to) => workspace.supabase.rpc("list_payroll_period_exceptions", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
      }, { count: "exact" }).order("occurred_at", { nullsFirst: true }).order("exception_code")
        .order("session_id").order("claim_id").range(from, to),
      (row) => `${String(row.session_id ?? row.claim_id)}:${String(row.exception_code)}`)
      : Promise.resolve({ data: [], error: null }),
    week
      ? readAllPages<Record<string, unknown>>((from, to) => workspace.supabase.rpc("list_payroll_period_events", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
      }, { count: "exact" }).order("created_at", { ascending: false }).order("event_id").range(from, to),
      (row) => String(row.event_id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  const period = parsePayrollPeriod(periodResult.data);
  const periodExceptions = parsePayrollPeriodExceptions(periodExceptionsResult.data);
  const periodEvents = parsePayrollPeriodEvents(periodEventsResult.data);
  const periodError = week !== null && Boolean(periodResult.error || periodExceptionsResult.error ||
    periodEventsResult.error || !period || !periodExceptions || !periodEvents ||
    (period.eventId !== null && periodEvents[0]?.eventId.toLowerCase() !== period.eventId.toLowerCase()));
  if (periodError) {
    console.error("Could not load the payroll period.", {
      code: periodResult.error?.code ?? periodExceptionsResult.error?.code ?? periodEventsResult.error?.code,
      message: periodResult.error?.message ?? periodExceptionsResult.error?.message ??
        periodEventsResult.error?.message ?? "The server returned an inconsistent payroll period.",
    });
  }
  // Fail closed: if the period cannot be read, attendance controls stay unavailable.
  const periodFinalised = week !== null && (periodError || period?.status === "finalised");
  const canonicalScope: CanonicalPayrollScope | null = week && !periodError && period?.canFinalise &&
    period.status === "finalised" && period.eventId && period.sessionCount !== null
    ? {
      businessId: workspace.business.id, venueId: workspace.venue.id, weekStart: week,
      finalisationId: period.eventId, sessionCount: period.sessionCount,
    }
    : null;
  const canonicalResult = canonicalScope
    ? await readAllPages<{ session_id: string; record: unknown }>((from, to) =>
      workspace.supabase.rpc("list_canonical_payroll_records", {
        p_business_id: canonicalScope.businessId, p_venue_id: canonicalScope.venueId,
        p_week_start: canonicalScope.weekStart, p_finalisation_id: canonicalScope.finalisationId,
      }, { count: "exact" }).order("session_id").range(from, to),
    (row) => row && typeof row.session_id === "string" ? row.session_id : "")
    : null;
  let canonicalRecords: readonly CanonicalPayrollRecord[] | null = null;
  let canonicalError: string | null = null;
  if (canonicalScope && canonicalResult) {
    if (canonicalResult.error) {
      console.error("Could not load canonical payroll records.", {
        code: canonicalResult.error.code, message: canonicalResult.error.message,
      });
      canonicalError = canonicalResult.error.message ===
        "Finalised period lacks complete payroll details; reopen and finalise it again"
        ? "The finalised period lacks complete payroll details. Reopen it with a reason, review the entries and finalise it again."
        : "We couldn't load the finalised payroll records. Refresh the period and check your access.";
    } else {
      try {
        canonicalRecords = validateCanonicalPayrollRows(canonicalResult.data, canonicalScope);
      } catch (error) {
        if (!(error instanceof PayrollRecordValidationError)) throw error;
        console.error("The server returned invalid canonical payroll records.", { message: error.message });
        canonicalError = "The finalised payroll records are inconsistent. Refresh and contact support before using them.";
      }
    }
  }
  const [exportHistoryResult, exportHistoryEntriesResult, exportReviewResult] = await Promise.all([
    week && !periodError && period?.canFinalise
      ? readAllPages<Record<string, unknown>>((from, to) => workspace.supabase.rpc(
        "list_generic_payroll_export_history", {
          p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
        }, { count: "exact" },
      ).order("created_at", { ascending: false }).order("id").range(from, to), (row) => String(row.id))
      : Promise.resolve(null),
    week && !periodError && period?.canFinalise
      ? readAllPages<Record<string, unknown>>((from, to) => workspace.supabase.rpc(
        "list_generic_payroll_export_history_entries", {
          p_business_id: workspace.business.id, p_venue_id: workspace.venue.id, p_week_start: week,
        }, { count: "exact" },
      ).order("event_id").order("session_id").range(from, to),
      (row) => `${String(row.event_id)}:${String(row.session_id)}`)
      : Promise.resolve(null),
    canonicalScope && canonicalRecords && periodExceptions?.length === 0
      ? workspace.supabase.rpc("get_generic_payroll_export_review", {
        p_business_id: canonicalScope.businessId, p_venue_id: canonicalScope.venueId,
        p_week_start: canonicalScope.weekStart, p_finalisation_id: canonicalScope.finalisationId,
      })
      : Promise.resolve(null),
  ]);
  let exportHistory: readonly GenericPayrollHistoryEvent[] | null = null;
  let exportHistoryEntries: readonly GenericPayrollHistoryEntry[] | null = null;
  let exportReview: GenericPayrollReview | null = null;
  let exportError: string | null = null;
  if (exportHistoryResult || exportHistoryEntriesResult || exportReviewResult) {
    try {
      if (exportHistoryResult && exportHistoryEntriesResult && week) {
        if (exportHistoryResult.error) throw new PayrollRecordValidationError(exportHistoryResult.error.message);
        if (exportHistoryEntriesResult.error) {
          throw new PayrollRecordValidationError(exportHistoryEntriesResult.error.message);
        }
        exportHistory = validateGenericPayrollHistory(exportHistoryResult.data);
        exportHistoryEntries = validateGenericPayrollHistoryEntries(exportHistoryEntriesResult.data, exportHistory, {
          businessId: workspace.business.id, venueId: workspace.venue.id, weekStart: week,
        });
      }
      if (exportReviewResult && canonicalScope && canonicalRecords) {
        if (exportReviewResult.error) throw new PayrollRecordValidationError(exportReviewResult.error.message);
        exportReview = validateGenericPayrollReview(exportReviewResult.data, canonicalScope, canonicalRecords);
      }
    } catch (error) {
      if (!(error instanceof PayrollRecordValidationError)) throw error;
      console.error("Could not verify the payroll export review or history.", { message: error.message });
      exportError = "We couldn't verify the payroll export review or history. Refresh and check your access before proceeding.";
      exportHistory = null;
      exportHistoryEntries = null;
      exportReview = null;
    }
  }
  const batchReceipt = isPayrollUuid(params.export_batch)
    ? exportHistory?.find((event) => event.kind === "batch" &&
      event.id.toLowerCase() === params.export_batch?.toLowerCase()) : null;
  const reconciliationReceipt = isPayrollUuid(params.export_reconciliation)
    ? exportHistory?.find((event) => event.kind === "reconciliation" &&
      event.id.toLowerCase() === params.export_reconciliation?.toLowerCase()) : null;
  const exportReceiptError = (params.export_batch !== undefined && !batchReceipt) ||
    (params.export_reconciliation !== undefined && !reconciliationReceipt);
  if (exportReceiptError) console.error("Could not verify the payroll export receipt.");
  const venues = parseTimesheetEmployees(venuesResult.data);
  const currentEmployees = parseTimesheetEmployees(employeesResult.data);
  const planned = parseTimesheetPlannedShifts(plannedResult.data);
  const actual = parseTimesheetEditTime(actualResult.data);
  const events = parseTimesheetEditEvents(eventsResult.data);
  const receipt = parseStoredBulkLockReceipt(receiptResult.data);
  const approvals = parseTimesheetApprovals(approvalsResult.data);
  const approvalsBySession = new Map((approvals ?? []).map((row) => [row.session_id.toLowerCase(), row]));
  const receiptError = receiptRequested && (!receipt || receipt.weekStart !== week ||
    receipt.employeeId?.toLowerCase() !== employee?.toLowerCase());
  const employees = currentEmployees && planned && actual
    ? timesheetEmployeeOptions(currentEmployees, planned, actual) : null;
  const employeeAvailable = employee === null || (employee !== undefined &&
    employees?.some((item) => item.id.toLowerCase() === employee.toLowerCase()));
  const groups = planned && actual ? groupWeeklyTimesheets(planned, actual) : null;
  const eventsConsistent = actual && events && timesheetEditSourcesMatch(actual, events);
  const approvalsConsistent = actual && approvals && timesheetApprovalsWithinSessions(actual, approvals);
  const dataError = Boolean(venuesResult.error || employeesResult.error || plannedResult.error || actualResult.error ||
    eventsResult.error || approvalsResult.error || !venues || !employees || !planned || !actual || !events || !groups ||
    !eventsConsistent || !approvalsConsistent);
  if (dataError) {
    console.error("Could not load the weekly timesheet.", {
      code: venuesResult.error?.code ?? employeesResult.error?.code ?? plannedResult.error?.code ??
        actualResult.error?.code ?? eventsResult.error?.code ?? approvalsResult.error?.code,
      message: venuesResult.error?.message ?? employeesResult.error?.message ?? plannedResult.error?.message ??
        actualResult.error?.message ?? eventsResult.error?.message ?? approvalsResult.error?.message ??
        "The server returned inconsistent timesheet data.",
    });
  }
  if (receiptError) {
    console.error("Could not verify the weekly attendance lock receipt.", {
      code: receiptResult.error?.code,
      message: receiptResult.error?.message ?? "The receipt or its filters are invalid.",
    });
  }
  const actionError = typeof params.error === "string"
    ? (Object.hasOwn(errors, params.error) ? errors[params.error] : "The attendance action could not be completed.")
    : null;
  const decidedMessage = typeof params.decided === "string" && Object.hasOwn(decidedMessages, params.decided)
    ? decidedMessages[params.decided] : null;
  const periodMessage = typeof params.period === "string" && Object.hasOwn(periodMessages, params.period)
    ? periodMessages[params.period] : null;
  const periodHidden = (action: "finalised" | "reopened") => <>
    <input type="hidden" name="venue_id" value={workspace.venue.id} />
    <input type="hidden" name="week" value={week ?? ""} />
    <input type="hidden" name="employee_id" value={employee ?? ""} />
    <input type="hidden" name="request_id" value={randomUUID()} />
    <input type="hidden" name="period_action" value={action} />
  </>;
  const exportHidden = () => <>
    <input type="hidden" name="venue_id" value={workspace.venue.id} />
    <input type="hidden" name="week" value={week ?? ""} />
    <input type="hidden" name="employee_id" value={employee ?? ""} />
    <input type="hidden" name="finalisation_id" value={canonicalScope?.finalisationId ?? ""} />
    <input type="hidden" name="request_id" value={randomUUID()} />
  </>;
  const decisionHidden = (sessionId: string, revision: string, decision: "approved" | "rejected") => <>
    <input type="hidden" name="venue_id" value={workspace.venue.id} />
    <input type="hidden" name="week" value={week ?? ""} />
    <input type="hidden" name="employee_id" value={employee ?? ""} />
    <input type="hidden" name="request_id" value={randomUUID()} />
    <input type="hidden" name="session_id" value={sessionId} />
    <input type="hidden" name="revision" value={revision} />
    <input type="hidden" name="decision" value={decision} />
  </>;

  return <AppShell businessName={workspace.business.name} businessId={workspace.business.id} businessCount={workspace.businesses.length} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <div>
      <p className="text-sm font-medium text-muted">Attendance</p>
      <h1 className="mt-2 text-3xl font-semibold">Weekly timesheet review</h1>
      <p className="mt-2 text-sm text-muted">
        Compare published shifts with recorded attendance, then approve or return entries for the departments you manage.
      </p>
    </div>
    <form action="/timesheets" className="mt-5 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-4 sm:items-end">
      <div>
        <label htmlFor="timesheet-venue" className="block text-sm">Venue</label>
        <select id="timesheet-venue" name="venue" defaultValue={workspace.venue.id}
          className="mt-1 block w-full rounded-lg border border-line bg-white p-2 text-sm">
          {(venues ?? []).map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="timesheet-week" className="block text-sm">Week containing date</label>
        <input id="timesheet-week" type="date" name="week" defaultValue={week ?? ""}
          className="mt-1 block w-full rounded-lg border border-line bg-white p-2 text-sm" />
      </div>
      <div>
        <label htmlFor="timesheet-employee" className="block text-sm">Employee</label>
        <select id="timesheet-employee" name="employee" defaultValue={employeeAvailable && employee ? employee : ""}
          className="mt-1 block w-full rounded-lg border border-line bg-white p-2 text-sm">
          <option value="">All employees</option>
          {(employees ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">
        Apply filters
      </button>
    </form>
    <p className="mt-4 text-sm leading-6 text-muted">
      Weeks use the venue&apos;s current timezone. A published shift belongs to the week it starts; a session
      belongs to the week of its corrected clock-in, or its clock-out or creation time if clock-in is missing.
      Overnight records are not split between weeks. Scheduled span is before planned breaks and is compared
      with recorded elapsed time, not paid time. Matching totals do not pair shifts with sessions or approve payroll.
      Each session is approved by a manager of its own department. Approval locks it against corrections; if an owner
      or general manager later unlocks or changes it, it must be approved again. Returned entries stay correctable and
      are shown to the employee with your reason. Approval is not payroll finalisation: an owner, admin or general
      manager with access to every department finalises the whole venue week separately, after it ends and every
      exception is resolved. Butterbox does not verify award or payroll compliance.
    </p>
    {!validFilters && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      Enter a valid date and choose an available employee before reviewing this week.
    </p>}
    {validFilters && !employeeAvailable && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      The selected employee is unavailable in this venue or your scope. Choose another employee or all employees.
    </p>}
    {dataError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      We couldn&apos;t load a consistent timesheet. Refresh and check your access before reviewing it.
    </p>}
    {actionError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">{actionError}</p>}
    {decidedMessage && !actionError && <p role="status" className="mt-4 rounded-lg bg-green-50 p-4 text-sm text-green-900">
      {decidedMessage}
    </p>}
    {periodMessage && !actionError && <p role="status" className="mt-4 rounded-lg bg-green-50 p-4 text-sm text-green-900">
      {periodMessage}
    </p>}
    {receiptError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      We couldn&apos;t verify the edit-lock result. Check the attendance history before retrying.
    </p>}
    {receiptRequested && !receiptError && receipt && <p role="status" className="mt-4 rounded-lg bg-green-50 p-4 text-sm text-green-900">
      Edit-lock result: {receipt.lockedCount} locked, {receipt.invalidCount} incomplete or invalid excluded,{" "}
      {receipt.alreadyLockedCount} already locked. This is not payroll approval.
    </p>}
    {week && <h2 className="mt-6 text-lg font-semibold">
      {formatDay(week)} to {formatDay(addDays(week, 6))} · {workspace.venue.timezone}
    </h2>}
    {week && <section id="payroll-period" aria-labelledby="payroll-period-heading"
      className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">
      <h2 id="payroll-period-heading" className="text-base font-semibold">Payroll period</h2>
      {["owner", "admin"].includes(workspace.membership.role) &&
        <Link href={`/settings/payroll?venue=${workspace.venue.id}`}
          className="mt-2 inline-block font-semibold text-ocean">Manage payroll employee mapping</Link>}
      {periodError || !period || !periodExceptions || !periodEvents
        ? <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-red-800">
          We couldn&apos;t load this payroll period. Attendance changes are unavailable until it loads; refresh and
          check your access.
        </p>
        : <>
          <p className="mt-2 font-semibold">{payrollPeriodStatusLabels[period.status]}</p>
          <p className="mt-1 text-muted">
            Venue week <time dateTime={period.periodStartsAt}>{formatClockTime(period.periodStartsAt, workspace.venue.timezone)}</time>
            {" "}to <time dateTime={period.periodEndsAt}>{formatClockTime(period.periodEndsAt, workspace.venue.timezone)}</time>
            {" "}(all employees and departments in this venue).
          </p>
          {period.status === "finalised" && period.decidedAt && period.actorRole && <p className="mt-1">
            Finalised by {payrollActorLabel(period.actorRole, Boolean(period.actorIsSelf))} on{" "}
            <time dateTime={period.decidedAt}>{formatClockTime(period.decidedAt, workspace.venue.timezone)}</time>:{" "}
            {period.sessionCount} sessions, worked {formatWorkedDuration(period.workedSeconds ?? 0)}, paid{" "}
            {formatWorkedDuration(period.paidSeconds ?? 0)}. Attendance in this week cannot change until it is reopened.
          </p>}
          <h3 className="mt-3 font-semibold">Outstanding exceptions ({periodExceptions.length})</h3>
          {!period.canFinalise && <p className="mt-1 text-muted">
            Shown for the departments you manage. Only an owner, admin or general manager with access to every
            department can finalise or reopen this period.
          </p>}
          {periodExceptions.length === 0 ? <p className="mt-1 text-muted">No outstanding exceptions in your scope.</p>
            : <ul aria-label="Outstanding payroll exceptions" className="mt-2 space-y-1 text-amber-900">
              {periodExceptions.map((item) => <li key={`${item.sessionId ?? item.claimId}:${item.code}`}>
                {item.employeeName} · {item.departmentName} · {payrollExceptionLabels[item.code]}
                {item.occurredAt && <> · <time dateTime={item.occurredAt}>
                  {formatClockTime(item.occurredAt, workspace.venue.timezone)}</time></>}
              </li>)}
            </ul>}
          {period.canFinalise && period.status !== "finalised" && <form action={decidePayrollPeriodAction} className="mt-3">
            {periodHidden("finalised")}
            <label htmlFor="payroll-finalise-note" className="block font-medium">Finalisation note (optional)</label>
            <input id="payroll-finalise-note" name="reason" maxLength={500}
              className="mt-1 block w-full rounded-lg border border-line p-2" />
            {!period.periodEnded && <p className="mt-2 text-muted">This week has not ended yet.</p>}
            <button type="submit" disabled={!period.periodEnded || periodExceptions.length > 0}
              className="mt-2 min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              Finalise payroll period
            </button>
          </form>}
          {period.canFinalise && period.status === "finalised" && <form action={decidePayrollPeriodAction} className="mt-3">
            {periodHidden("reopened")}
            <label htmlFor="payroll-reopen-reason" className="block font-medium">Reason for reopening</label>
            <input id="payroll-reopen-reason" name="reason" required maxLength={500}
              className="mt-1 block w-full rounded-lg border border-line p-2" />
            <button type="submit"
              className="mt-2 min-h-11 rounded-lg border border-line bg-white px-4 py-2 font-semibold">
              Reopen payroll period
            </button>
          </form>}
          {canonicalError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-800">
            {canonicalError}
          </p>}
          {canonicalRecords && <details className="mt-3">
            <summary className="cursor-pointer font-semibold">
              Finalised payroll records ({canonicalRecords.length})
            </summary>
            <p className="mt-2 text-muted">
              This whole-venue snapshot is not filtered by employee. Provider employee mappings and pay codes are
              not assigned yet; this preview is not an export or an award calculation.
              {periodExceptions.length > 0 && " Resolve the outstanding exceptions before exporting."}
            </p>
            {canonicalRecords.length === 0 ? <p className="mt-2 text-muted">No attendance in this period.</p>
              : <ul aria-label="Finalised payroll records" className="mt-2 space-y-2">
                {canonicalRecords.map((record) => {
                  const employeeName = currentEmployees?.find((item) =>
                    item.id.toLowerCase() === record.worker.employeeId.toLowerCase())?.name;
                  return <li key={record.sessionId} className="rounded-lg border border-line p-3">
                    <p className="font-semibold">{employeeName ?? `Employee ${record.worker.employeeId}`}
                      {" "}· {formatDay(record.workDate)}</p>
                    <p className="mt-1">
                      <time dateTime={record.attendance.clockInAt}>
                        {formatClockTime(record.attendance.clockInAt, record.venue.timezone)}
                      </time>{" "}to{" "}
                      <time dateTime={record.attendance.clockOutAt}>
                        {formatClockTime(record.attendance.clockOutAt, record.venue.timezone)}
                      </time>
                    </p>
                    <p className="mt-1 text-muted">
                      Worked {formatWorkedDuration(Number(record.hours.worked))} · paid{" "}
                      {formatWorkedDuration(Number(record.hours.paid))} · paid breaks{" "}
                      {formatWorkedDuration(Number(record.hours.paidBreak))} · unpaid breaks{" "}
                      {formatWorkedDuration(Number(record.hours.unpaidBreak))}
                    </p>
                    <p className="mt-1 text-muted">
                      {record.breaks.length} recorded {record.breaks.length === 1 ? "break" : "breaks"} ·
                      {" "}department-approved · payroll version {record.period.version}
                    </p>
                  </li>;
                })}
              </ul>}
            <p className="mt-2 text-muted">Displayed durations are rounded; the snapshot retains exact seconds.</p>
          </details>}
          {period.canFinalise && <section aria-labelledby="payroll-export-heading" className="mt-4 border-t border-line pt-4">
            <h3 id="payroll-export-heading" className="font-semibold">Generic payroll CSV</h3>
            <p className="mt-2 text-muted">
              This whole-venue export includes only approved, finalised sessions that have never been exported.
              Employee filters do not limit it. It is not an award calculation and contains no external payroll IDs.
            </p>
            <p className="mt-2 rounded-lg bg-amber-50 p-3 text-amber-950">
              Preparing a batch records the approved hours but does not confirm a download or payroll import.
              Re-downloading and importing the same batch again may pay people twice. Check your payroll system first.
            </p>
            {exportError && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-red-800">{exportError}</p>}
            {exportReceiptError && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-red-800">
              We couldn&apos;t verify the payroll action receipt. Check the export history before retrying.
            </p>}
            {batchReceipt && !exportReceiptError && <p role="status" className="mt-2 rounded-lg bg-green-50 p-3 text-green-900">
              Batch {batchReceipt.id} is recorded for {batchReceipt.entryCount} approved{" "}
              {batchReceipt.entryCount === 1 ? "session" : "sessions"}. Confirm any import separately in your payroll system.
            </p>}
            {reconciliationReceipt && !exportReceiptError && <p role="status" className="mt-2 rounded-lg bg-green-50 p-3 text-green-900">
              The manual reconciliation is recorded. Previously exported sessions will not be emitted again.
            </p>}
            {period.status !== "finalised" && <p className="mt-2 text-muted">
              Finalise the week before preparing or downloading its current batch.
            </p>}
            {period.status === "finalised" && periodExceptions.length > 0 && <p className="mt-2 text-amber-900">
              Resolve outstanding exceptions before preparing or downloading a batch.
            </p>}
            {exportReview && exportHistory && <>
              {exportReview.changes.length > 0
                ? <>
                  <h4 className="mt-3 font-semibold">Previously exported changes need reconciliation</h4>
                  <p className="mt-1 text-muted">
                    Review each before and after record and make any necessary adjustment in the external payroll
                    system. Butterbox does not create or send that adjustment; these sessions will not be exported again.
                  </p>
                  <ul aria-label="Payroll changes requiring reconciliation" className="mt-2 space-y-3">
                    {exportReview.changes.map((change) => <li key={change.sessionId} className="rounded-lg border border-line p-3">
                      <p className="font-semibold">{change.employeeName} · session {change.sessionId}</p>
                      {([["Previous", change.previous], ["Current", change.current]] as const).map(([label, record]) =>
                        <div key={label} className="mt-2">
                          <p className="font-medium">{label}</p>
                          {record ? <p className="break-words text-muted">
                            {record.workDate} · employee {record.worker.employeeId} · department {record.venue.departmentId} ·{" "}
                            {record.attendance.clockInAt} to {record.attendance.clockOutAt} · worked {record.hours.worked} seconds ·{" "}
                            paid {record.hours.paid} seconds · paid breaks {record.hours.paidBreak} seconds · unpaid breaks{" "}
                            {record.hours.unpaidBreak} seconds
                          </p> : <p className="text-muted">Not present in this finalised period.</p>}
                        </div>)}
                      <details className="mt-2">
                        <summary className="cursor-pointer font-medium">Full before and after records</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-2 text-xs">
                          {JSON.stringify({ previous: change.previous, current: change.current }, null, 2)}
                        </pre>
                      </details>
                    </li>)}
                  </ul>
                  <form action={reconcileGenericPayrollExportAction} className="mt-3">
                    {exportHidden()}
                    <input type="hidden" name="review_hash" value={exportReview.reviewHash} />
                    <label htmlFor="payroll-reconciliation-reason" className="block font-medium">Reconciliation reason</label>
                    <input id="payroll-reconciliation-reason" name="reason" required maxLength={500}
                      className="mt-1 block w-full rounded-lg border border-line p-2" />
                    <label className="mt-3 flex items-start gap-2">
                      <input type="checkbox" name="confirmed" value="yes" required className="mt-1" />
                      <span>I reviewed all changes and handled any necessary adjustment in the external payroll system.</span>
                    </label>
                    <button type="submit"
                      className="mt-3 min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
                      Record manual reconciliation
                    </button>
                  </form>
                </>
                : exportReview.newCount > 0
                  ? <form action={prepareGenericPayrollExportAction} className="mt-3">
                    {exportHidden()}
                    <p>{exportReview.newCount} new approved {exportReview.newCount === 1 ? "session" : "sessions"} available.</p>
                    <button type="submit"
                      className="mt-2 min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
                      Prepare payroll CSV
                    </button>
                  </form>
                  : <p className="mt-3 text-muted">No new approved sessions are available for export.</p>}
            </>}
            {exportHistory && exportHistoryEntries && exportHistory.length > 0 && <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Payroll export history ({exportHistory.length})</summary>
              <ol aria-label="Payroll export history" className="mt-2 space-y-2">
                {exportHistory.map((event) => <li key={event.id} className="rounded-lg border border-line p-3">
                  <p className="font-semibold">
                    {event.kind === "batch" ? "Batch prepared" : "Manually reconciled"} by{" "}
                    {payrollActorLabel(event.actorRole, event.actorIsSelf)} on{" "}
                    <time dateTime={event.createdAt}>{formatClockTime(event.createdAt, workspace.venue.timezone)}</time>
                  </p>
                  <p className="mt-1 break-all">
                    {event.entryCount} {event.entryCount === 1 ? "session" : "sessions"} · {event.kind} {event.id}
                    {" "}· finalisation {event.finalisationId}
                  </p>
                  {event.reason && <p className="mt-1 break-words">Reason: {event.reason}</p>}
                  <ul aria-label={`Entries for ${event.kind} ${event.id}`} className="mt-2 space-y-2">
                    {exportHistoryEntries.filter((entry) => entry.eventId.toLowerCase() === event.id.toLowerCase())
                      .map((entry) => <li key={entry.sessionId} className="rounded-lg bg-slate-50 p-2">
                        <p className="break-all font-medium">{entry.employeeName} · session {entry.sessionId}</p>
                        {(event.kind === "batch"
                          ? [["Exported", entry.current]] as const
                          : [["Previous", entry.previous], ["Reconciled", entry.current]] as const
                        ).map(([label, record]) => <p key={label} className="mt-1 break-words text-muted">
                          {label}: {record ? <>
                            {record.workDate} · employee {record.worker.employeeId} · worked {record.hours.worked} seconds ·{" "}
                            paid {record.hours.paid} seconds · finalisation version {record.period.version}
                          </> : "Not present in the finalised period."}
                        </p>)}
                        <details className="mt-1">
                          <summary className="cursor-pointer font-medium">Full audit records</summary>
                          <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-white p-2 text-xs">
                            {JSON.stringify({ previous: entry.previous, current: entry.current }, null, 2)}
                          </pre>
                        </details>
                      </li>)}
                  </ul>
                  {event.kind === "batch" && exportReview?.changes.length === 0 &&
                    canonicalScope?.finalisationId.toLowerCase() === event.finalisationId.toLowerCase() &&
                    <a href={`/timesheets/payroll-export?${new URLSearchParams({
                      venue: workspace.venue.id, batch: event.id,
                    })}`} className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-line px-3 font-semibold text-ocean">
                      Download payroll CSV
                    </a>}
                </li>)}
              </ol>
            </details>}
          </section>}
          {periodEvents.length > 0 && <details className="mt-3">
            <summary className="cursor-pointer font-semibold">Payroll period history ({periodEvents.length})</summary>
            <ol aria-label="Payroll period history" className="mt-2 space-y-2">
              {periodEvents.map((event) => <li key={event.eventId} className="rounded-lg border border-line p-2">
                <p className="font-semibold">
                  {event.action === "finalised" ? "Finalised" : "Reopened"} by{" "}
                  {payrollActorLabel(event.actorRole, event.actorIsSelf)} on{" "}
                  <time dateTime={event.createdAt}>{formatClockTime(event.createdAt, workspace.venue.timezone)}</time>
                </p>
                {event.action === "finalised" && <p className="mt-1">
                  {event.sessionCount} sessions · worked {formatWorkedDuration(event.workedSeconds)} · paid{" "}
                  {formatWorkedDuration(event.paidSeconds)}
                </p>}
                {event.reason && <p className="mt-1">
                  {event.action === "reopened" ? "Reason" : "Note"}: {event.reason}
                </p>}
              </li>)}
            </ol>
          </details>}
        </>}
    </section>}
    {validFilters && employeeAvailable && !dataError && groups && (
      <form action={bulkLockWeeklyAttendanceAction} className="mt-4">
        <input type="hidden" name="venue_id" value={workspace.venue.id} />
        <input type="hidden" name="week" value={week ?? ""} />
        <input type="hidden" name="employee_id" value={employee ?? ""} />
        <input type="hidden" name="request_id" value={randomUUID()} />
        <div className="rounded-xl border border-line bg-white p-4 text-sm">
          <h2 className="font-semibold">Lock selected sessions against corrections</h2>
          <p className="mt-2 text-muted">
            Select up to 100 complete, unlocked sessions and enter a reason. Incomplete or invalid sessions
            cannot be selected and are checked again by the server. Review any location and source warnings
            before locking. This action is not payroll approval.
          </p>
          <label htmlFor="bulk-lock-reason" className="mt-3 block font-medium">Reason for edit lock</label>
          {periodFinalised && <p className="mt-2 text-amber-900">
            Unavailable while the payroll period is finalised or cannot be confirmed.
          </p>}
          <input id="bulk-lock-reason" name="reason" required maxLength={500} disabled={periodFinalised}
            className="mt-1 block w-full rounded-lg border border-line p-2" />
          <button type="submit" disabled={periodFinalised ||
            !actual?.some((row) => row.worked_seconds !== null && !row.edit_locked)}
            className="mt-3 min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            Lock selected sessions
          </button>
        </div>
        <section aria-label="Weekly planned and actual time" className="mt-4">
        {groups.length === 0 ? <p className="rounded-xl border border-line bg-white p-5 text-sm text-muted">
          No published shifts or attendance sessions in your scope for these filters.
        </p> : <ul className="space-y-4">
          {groups.map((group) => {
            const notices = weeklyTimesheetNotices(group);
            const complete = group.actual.filter((row) => row.elapsed_seconds !== null);
            return <li key={`${group.employeeId}:${group.departmentId}`} className="rounded-xl border border-line bg-white p-5 text-sm">
              <h3 className="text-base font-semibold">{group.employeeName} · {group.departmentName}</h3>
              <p className="mt-2 text-muted">
                Scheduled span: {totalDuration(group.planned.map((row) => row.scheduled_seconds))} ·{" "}
                Recorded elapsed: {totalDuration(complete.map((row) => row.elapsed_seconds ?? 0))}
              </p>
              <ul aria-label="Review notices" className="mt-3 space-y-1 text-amber-900">
                {notices.map((notice) => <li key={notice}>{notice}</li>)}
              </ul>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <h4 className="font-semibold">Published shifts</h4>
                  {group.planned.length === 0 ? <p className="mt-2 text-muted">None in this week.</p>
                    : <ul className="mt-2 space-y-2">
                      {group.planned.map((shift) => <li key={shift.shift_id} className="rounded-lg border border-line p-3">
                        <p><time dateTime={shift.starts_at}>{formatClockTime(shift.starts_at, workspace.venue.timezone)}</time>
                          {" "}to{" "}<time dateTime={shift.ends_at}>{formatClockTime(shift.ends_at, workspace.venue.timezone)}</time>
                        </p>
                        <p className="mt-1 text-muted">Scheduled span {formatWorkedDuration(shift.scheduled_seconds)} ·{" "}
                          planned break {shift.break_minutes} min, classification not specified
                        </p>
                      </li>)}
                    </ul>}
                </div>
                <div>
                  <h4 className="font-semibold">Attendance sessions</h4>
                  {group.actual.length === 0 ? <p className="mt-2 text-muted">None in this week.</p>
                    : <ul className="mt-2 space-y-2">
                      {group.actual.map((row) => {
                        const sessionEvents = events?.filter((event) => event.session_id === row.session_id) ?? [];
                        const workTimeHref = `/work-time?${new URLSearchParams({ venue: workspace.venue.id })}` +
                          `#attendance-session-${row.session_id}`;
                        return <li key={row.session_id} id={`timesheet-session-${row.session_id}`}
                          className="rounded-lg border border-line p-3">
                          <label className="mb-3 flex items-start gap-2 font-semibold">
                            <input type="checkbox" name="selection" value={`${row.session_id}:${row.edit_revision}`}
                              disabled={periodFinalised || row.worked_seconds === null || row.edit_locked} className="mt-1" />
                            <span>{row.worked_seconds === null ? "Incomplete or invalid; cannot be locked"
                              : row.edit_locked ? "Already locked against corrections" : "Select session for edit lock"}</span>
                          </label>
                          <p>Clock in: {row.clocked_in_at
                            ? <time dateTime={row.clocked_in_at}>{formatClockTime(row.clocked_in_at, row.venue_timezone)}</time>
                            : "Missing"}</p>
                          <p className="mt-1">Clock out: {row.clocked_out_at
                            ? <time dateTime={row.clocked_out_at}>{formatClockTime(row.clocked_out_at, row.venue_timezone)}</time>
                            : "Missing"}</p>
                          <p className="mt-1 text-muted">Elapsed: {row.elapsed_seconds === null
                            ? "Unavailable" : formatWorkedDuration(row.elapsed_seconds)} · Paid: {row.paid_seconds === null
                              ? "Unavailable" : formatWorkedDuration(row.paid_seconds)}</p>
                          {(() => {
                            const approval = approvalsBySession.get(row.session_id.toLowerCase());
                            if (!approval) return <p className="mt-2 text-muted">Outside your department approval scope.</p>;
                            const canApprove = !periodFinalised && !approval.self_owned && approval.status !== "approved" &&
                              row.worked_seconds !== null;
                            const canReturn = !periodFinalised && !approval.self_owned && approval.status !== "returned" &&
                              !row.edit_locked;
                            return <div role="group" aria-label="Department approval"
                              className="mt-3 rounded-lg border border-line bg-slate-50 p-3">
                              <p className="font-semibold">{timesheetApprovalLabels[approval.status]}</p>
                              {approval.reason && <p className="mt-1">
                                {approval.decision === "rejected" ? "Reason returned" : "Approval note"}: {approval.reason}
                              </p>}
                              {approval.self_owned && <p className="mt-1 text-muted">
                                Another manager or the owner must decide your own attendance.
                              </p>}
                              {canApprove && <div className="mt-2">
                                <label htmlFor={`approve-note-${row.session_id}`} className="block">Approval note (optional)</label>
                                <input id={`approve-note-${row.session_id}`} name="reason" maxLength={500}
                                  form={`approve-${row.session_id}`} className="mt-1 block w-full rounded-lg border border-line bg-white p-2" />
                                <button type="submit" form={`approve-${row.session_id}`}
                                  className="mt-2 min-h-11 rounded-lg bg-ocean px-4 py-2 font-semibold text-white">
                                  Approve time
                                </button>
                              </div>}
                              {periodFinalised && <p className="mt-2 text-muted">
                                Decisions are unavailable while the payroll period is finalised or cannot be confirmed.
                              </p>}
                              {!periodFinalised && !approval.self_owned && approval.status !== "approved" &&
                                row.worked_seconds === null &&
                                <p className="mt-2 text-amber-900">Incomplete or invalid; return it for correction.</p>}
                              {canReturn && <div className="mt-3">
                                <label htmlFor={`return-reason-${row.session_id}`} className="block">Reason for returning</label>
                                <input id={`return-reason-${row.session_id}`} name="reason" maxLength={500} required
                                  form={`return-${row.session_id}`} className="mt-1 block w-full rounded-lg border border-line bg-white p-2" />
                                <button type="submit" form={`return-${row.session_id}`}
                                  className="mt-2 min-h-11 rounded-lg border border-line bg-white px-4 py-2 font-semibold">
                                  Return for correction
                                </button>
                              </div>}
                              {!periodFinalised && !approval.self_owned && approval.status !== "returned" &&
                                row.edit_locked && <p className="mt-2 text-muted">
                                Locked; an owner or general manager must unlock it before it can be returned.
                              </p>}
                            </div>;
                          })()}
                          {row.exceptions.length > 0 && <p className="mt-2 text-amber-900">
                            Exceptions: {row.exceptions.map((exception) => workTimeExceptionLabels[exception]).join("; ")}
                          </p>}
                          <details className="mt-3">
                            <summary className="cursor-pointer font-semibold">Inspect source events</summary>
                            {sessionEvents.length === 0 ? <p className="mt-2 text-muted">No original events are available.</p>
                              : <ul className="mt-2 space-y-2">
                                {sessionEvents.map((event) => <li key={event.event_id} className="rounded-lg border border-line p-2">
                                  <p className="font-semibold">{correctionEventLabels[event.event_type]}
                                    {event.classification && ` · ${event.classification} break`} · {sourceLabels[event.source]}
                                  </p>
                                  <p className="mt-1">Original: {event.original_at}</p>
                                  <p className="mt-1">Effective: {event.effective_at}</p>
                                </li>)}
                              </ul>}
                            <Link href={workTimeHref} className="mt-3 inline-block font-semibold text-ocean">
                              Open correction and edit-lock history
                            </Link>
                          </details>
                        </li>;
                      })}
                    </ul>}
                </div>
              </div>
            </li>;
          })}
        </ul>}
        </section>
      </form>
    )}
    {validFilters && employeeAvailable && !dataError && actual?.map((row) => {
      const approval = approvalsBySession.get(row.session_id.toLowerCase());
      if (!approval || approval.self_owned) return null;
      return <div key={row.session_id} hidden>
        <form id={`approve-${row.session_id}`} action={decideTimesheetAction}>
          {decisionHidden(row.session_id, row.edit_revision, "approved")}
        </form>
        <form id={`return-${row.session_id}`} action={decideTimesheetAction}>
          {decisionHidden(row.session_id, row.edit_revision, "rejected")}
        </form>
      </div>;
    })}
  </AppShell>;
}
