import { parseBusinessId } from "./business-selection.ts";
import { isEmploymentEffectiveDate } from "./employment-rule-metadata.ts";
import { isRosterWeek } from "./roster-copy.ts";

const blockingReasons = [
  "unchanged", "acknowledgement", "inactive-role", "qualification", "overlap", "unavailable",
] as const;
const warningReasons = ["linked-overlap", "unavailable"] as const;

export type QuickChangeOperation = "move" | "duplicate";
export type QuickChangeBlocking = typeof blockingReasons[number];
export type QuickChangeWarning = typeof warningReasons[number];
export type QuickChangeInput = {
  businessId: string;
  venueId: string;
  departmentId: string;
  shiftId: string;
  expectedUpdatedAt: string;
  weekStart: string;
  targetDate: string;
  targetEmployeeId: string | null;
  operation: QuickChangeOperation;
};
export type QuickChangePreview = {
  operation: QuickChangeOperation;
  targetDate: string;
  targetEmployeeId: string | null;
  targetEmployeeName: string | null;
  roleTitle: string;
  startsAt: string;
  endsAt: string;
  blocking: QuickChangeBlocking[];
  warnings: QuickChangeWarning[];
  publishBlocksOverlap: boolean;
  publishBlocksUnavailability: boolean;
};
export type QuickChangeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; uncertain?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isQuickChangeUuid(value: unknown): value is string {
  return typeof value === "string" && Boolean(parseBusinessId(value));
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 &&
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
}

function isOperation(value: unknown): value is QuickChangeOperation {
  return value === "move" || value === "duplicate";
}

function parseReasons<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  if (!Array.isArray(value)) return null;
  const result: T[] = [];
  for (const item of value) {
    const reason = allowed.find((option) => option === item);
    if (!reason || result.includes(reason)) return null;
    result.push(reason);
  }
  return result;
}

export function parseQuickChangeInput(value: unknown): QuickChangeInput | null {
  if (!isRecord(value) || !isQuickChangeUuid(value.businessId) || !isQuickChangeUuid(value.venueId) ||
    !isQuickChangeUuid(value.departmentId) || !isQuickChangeUuid(value.shiftId) ||
    !isTimestamp(value.expectedUpdatedAt) || typeof value.weekStart !== "string" ||
    !isRosterWeek(value.weekStart) || !isEmploymentEffectiveDate(value.weekStart) ||
    !isEmploymentEffectiveDate(value.targetDate) ||
    (value.targetEmployeeId !== null && !isQuickChangeUuid(value.targetEmployeeId)) ||
    !isOperation(value.operation)) return null;
  const dayOffset = (Date.parse(`${value.targetDate}T00:00:00Z`) -
    Date.parse(`${value.weekStart}T00:00:00Z`)) / 86_400_000;
  if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > 6) return null;
  return {
    businessId: value.businessId,
    venueId: value.venueId,
    departmentId: value.departmentId,
    shiftId: value.shiftId,
    expectedUpdatedAt: value.expectedUpdatedAt,
    weekStart: value.weekStart,
    targetDate: value.targetDate,
    targetEmployeeId: value.targetEmployeeId,
    operation: value.operation,
  };
}

export function parseQuickChangePreview(value: unknown, input: QuickChangeInput): QuickChangePreview | null {
  if (!isRecord(value) || value.operation !== input.operation || value.target_date !== input.targetDate ||
    (value.target_employee_id === null ? input.targetEmployeeId !== null
      : !isQuickChangeUuid(value.target_employee_id) || !input.targetEmployeeId ||
        value.target_employee_id.toLowerCase() !== input.targetEmployeeId.toLowerCase()) ||
    (value.target_employee_id === null ? value.target_employee_name !== null
      : typeof value.target_employee_name !== "string" || !value.target_employee_name.trim()) ||
    typeof value.role_title !== "string" || !value.role_title.trim() || value.role_title.length > 80 ||
    !isTimestamp(value.starts_at) || !isTimestamp(value.ends_at) ||
    Date.parse(value.ends_at) <= Date.parse(value.starts_at) ||
    typeof value.publish_blocks_overlap !== "boolean" ||
    typeof value.publish_blocks_unavailability !== "boolean") return null;
  const blocking = parseReasons(value.blocking, blockingReasons);
  const warnings = parseReasons(value.warnings, warningReasons);
  if (!blocking || !warnings) return null;
  return {
    operation: input.operation,
    targetDate: input.targetDate,
    targetEmployeeId: input.targetEmployeeId,
    targetEmployeeName: typeof value.target_employee_name === "string" ? value.target_employee_name : null,
    roleTitle: value.role_title,
    startsAt: value.starts_at,
    endsAt: value.ends_at,
    blocking,
    warnings,
    publishBlocksOverlap: value.publish_blocks_overlap,
    publishBlocksUnavailability: value.publish_blocks_unavailability,
  };
}

export function quickChangePreviewPayload(preview: QuickChangePreview) {
  return {
    operation: preview.operation,
    target_date: preview.targetDate,
    target_employee_id: preview.targetEmployeeId,
    target_employee_name: preview.targetEmployeeName,
    role_title: preview.roleTitle,
    starts_at: preview.startsAt,
    ends_at: preview.endsAt,
    blocking: preview.blocking,
    warnings: preview.warnings,
    publish_blocks_overlap: preview.publishBlocksOverlap,
    publish_blocks_unavailability: preview.publishBlocksUnavailability,
  };
}

export const quickChangeBlockingMessages: Record<QuickChangeBlocking, string> = {
  unchanged: "Choose a different day or team member for a move.",
  acknowledgement: "Assign a team member or remove the acknowledgement requirement first.",
  "inactive-role": "This role is inactive. Reactivate it before duplicating the shift.",
  qualification: "The selected team member is not qualified for this role.",
  overlap: "The selected team member already has a shift at this time.",
  unavailable: "The selected team member is unavailable or has approved leave.",
};

export function quickChangeWarningMessage(reason: QuickChangeWarning, preview: QuickChangePreview): string {
  if (reason === "linked-overlap") {
    return `This team member has an overlapping shift at another linked venue. Publication ${
      preview.publishBlocksOverlap ? "will be blocked" : "will warn"
    } while the conflict remains.`;
  }
  return `This team member is unavailable or has approved leave. Publication ${
    preview.publishBlocksUnavailability ? "will be blocked" : "will warn"
  } while the conflict remains.`;
}

export function quickChangeFailure(message: string | undefined): string {
  if (message?.startsWith("Shift change blocked: ")) {
    const reason = blockingReasons.find((item) => message === `Shift change blocked: ${item}`);
    if (reason) return quickChangeBlockingMessages[reason];
  }
  switch (message) {
    case "Permission denied":
    case "Venue or active department not found":
    case "Shift not found":
      return "You cannot change this shift, or it is no longer available. Reload the roster.";
    case "Employee is not eligible for this department":
      return "Choose an active team member linked to this department.";
    case "Employee is not qualified for this role":
      return quickChangeBlockingMessages.qualification;
    case "Employee has an overlapping shift":
      return quickChangeBlockingMessages.overlap;
    case "Employee is unavailable for this shift":
      return quickChangeBlockingMessages.unavailable;
    case "Published shifts cannot be edited":
      return "Published shifts cannot be moved. Duplicate this shift as a draft instead.";
    case "Shift changed; reload the roster":
    case "Shift changed since the quick change":
    case "Shift is not in this roster week":
      return "The shift changed since this action began. Reload the roster before trying again.";
    case "Shift preview changed; preview again":
      return "The destination or its conflicts changed. Preview the change again before applying.";
    case "Roster changed while scheduling; please try again":
      return "The roster is being changed. Wait for the other change to finish, then retry.";
    case "Request identifier already used":
      return "This request was already used for a different change. Reload before starting another.";
    case "Shift change was already undone":
      return "This change was already undone. Reload the roster to see the current shifts.";
    case "Shift crosses a clock change and cannot be moved safely":
    case "Target shift crosses a clock change and cannot be moved safely":
    case "Shift time cannot be duplicated safely across a clock change":
    case "Shift time cannot be changed safely across a clock change":
    case "Previous shift time cannot be restored safely across a clock change":
    case "Start time does not exist in venue timezone":
    case "End time does not exist in venue timezone":
      return "This time cannot be changed safely across a clock change. Use the shift editor instead.";
    case "Job role is inactive":
      return quickChangeBlockingMessages["inactive-role"];
    default:
      return "We couldn't confirm the result. Retry this same request or reload the roster before making another change.";
  }
}
