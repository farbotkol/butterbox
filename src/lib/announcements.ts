import { parseBusinessId } from "./business-selection.ts";
import { singleFormString } from "./form-data.ts";

export function canManageAnnouncements(role: string): boolean {
  return ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"].includes(role);
}

export function parseAnnouncementInput(formData: FormData) {
  const title = singleFormString(formData, "title")?.trim();
  const body = singleFormString(formData, "body")?.trim();
  const scope = singleFormString(formData, "scope");
  const department = singleFormString(formData, "department_id");
  const acknowledgement = singleFormString(formData, "acknowledgement");
  const requestId = parseBusinessId(singleFormString(formData, "request_id"));
  if (!title || title.length > 120 || !body || body.length > 4000 || !requestId ||
    !["business", "venue", "department"].includes(scope ?? "") ||
    !["required", "optional"].includes(acknowledgement ?? "") ||
    singleFormString(formData, "confirm") !== "yes" ||
    department === null || (scope === "department" ? !parseBusinessId(department) : department !== "")) return null;
  return {
    title, body, scope, departmentId: scope === "department" ? department : null,
    requiresAcknowledgement: acknowledgement === "required", requestId,
  };
}

type AnnouncementContent = {
  announcement_id: string; title: string; body: string; published_at: string; requires_acknowledgement: boolean;
};
export type MyAnnouncement = AnnouncementContent & {
  recipient_id: string; acknowledged_at: string | null; venue_id: string; department_id: string;
};
export type PublishedAnnouncement = AnnouncementContent & {
  venue_id: string | null; department_id: string | null; recipient_count: number; acknowledged_count: number;
};
export type AnnouncementReceipt = { recipient_id: string; employee_name: string; acknowledged_at: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function content(value: Record<string, unknown>): value is Record<string, unknown> & AnnouncementContent {
  return typeof value.announcement_id === "string" && Boolean(parseBusinessId(value.announcement_id)) &&
    typeof value.title === "string" && value.title.trim().length > 0 && value.title.length <= 120 &&
    typeof value.body === "string" && value.body.trim().length > 0 && value.body.length <= 4000 &&
    timestamp(value.published_at) && typeof value.requires_acknowledgement === "boolean";
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && Boolean(parseBusinessId(value));
}

export function parseMyAnnouncements(value: unknown): MyAnnouncement[] | null {
  if (!Array.isArray(value)) return null;
  const result: MyAnnouncement[] = [];
  for (const row of value) {
    if (!isRecord(row) || !content(row) || !uuid(row.recipient_id) || !uuid(row.venue_id) || !uuid(row.department_id) ||
      (row.acknowledged_at !== null && (!row.requires_acknowledgement || !timestamp(row.acknowledged_at))) ||
      result.some((item) => item.recipient_id === row.recipient_id)) return null;
    result.push({
      announcement_id: row.announcement_id, recipient_id: row.recipient_id, title: row.title, body: row.body,
      published_at: row.published_at, requires_acknowledgement: row.requires_acknowledgement,
      acknowledged_at: row.acknowledged_at, venue_id: row.venue_id, department_id: row.department_id,
    });
  }
  return result;
}

export function parsePublishedAnnouncements(value: unknown): PublishedAnnouncement[] | null {
  if (!Array.isArray(value)) return null;
  const result: PublishedAnnouncement[] = [];
  for (const row of value) {
    if (!isRecord(row) || !content(row) || (row.venue_id !== null && !uuid(row.venue_id)) ||
      (row.department_id !== null && (!uuid(row.department_id) || row.venue_id === null)) ||
      typeof row.recipient_count !== "number" || !Number.isSafeInteger(row.recipient_count) || row.recipient_count < 1 ||
      typeof row.acknowledged_count !== "number" || !Number.isSafeInteger(row.acknowledged_count) ||
      row.acknowledged_count < 0 || row.acknowledged_count > row.recipient_count ||
      (!row.requires_acknowledgement && row.acknowledged_count !== 0) ||
      result.some((item) => item.announcement_id === row.announcement_id)) return null;
    result.push({
      announcement_id: row.announcement_id, title: row.title, body: row.body, published_at: row.published_at,
      requires_acknowledgement: row.requires_acknowledgement, venue_id: row.venue_id, department_id: row.department_id,
      recipient_count: row.recipient_count, acknowledged_count: row.acknowledged_count,
    });
  }
  return result;
}

export function parseAnnouncementReceipts(value: unknown): AnnouncementReceipt[] | null {
  if (!Array.isArray(value)) return null;
  const result: AnnouncementReceipt[] = [];
  for (const row of value) {
    if (!isRecord(row) || !uuid(row.recipient_id) || typeof row.employee_name !== "string" || !row.employee_name.trim() ||
      (row.acknowledged_at !== null && !timestamp(row.acknowledged_at)) ||
      result.some((item) => item.recipient_id === row.recipient_id)) return null;
    result.push({ recipient_id: row.recipient_id, employee_name: row.employee_name, acknowledged_at: row.acknowledged_at });
  }
  return result;
}
