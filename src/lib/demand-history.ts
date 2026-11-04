import { Temporal } from "@js-temporal/polyfill";
import { CsvError, parse } from "csv-parse/sync";
import { validTimezone } from "./attendance.ts";
import { parseBusinessId } from "./business-selection.ts";
import { parseBusinessVenueContext, singleFormString } from "./form-data.ts";

export const MAX_DEMAND_FILE_BYTES = 500_000;
export const MAX_DEMAND_RECORDS = 1000;
export const DEMAND_PAGE_SIZE = 25;

export type DemandKind = "sales" | "bookings";
export type DemandRecordInput = { source_record_id: string; occurred_at: string; value: string };
export type DemandImport = {
  id: string;
  event_type: DemandKind;
  source_name: string;
  venue_timezone: string;
  actor_id: string;
  entry_count: number;
  occurred_at: string;
};
export type DemandRecord = {
  id: string;
  source_record_id: string;
  original_occurred_at: string;
  original_value: string;
};

const sourcePattern = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/;
const recordIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const timePattern = /^(?!0000|9999)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const salesPattern = /^\d{1,9}(?:\.\d{1,2})?$/;
const bookingsPattern = /^\d{1,6}$/;

export class DemandImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemandImportError";
  }
}

function isId(value: unknown): value is string {
  return typeof parseBusinessId(value) === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function kind(value: unknown): value is DemandKind {
  return value === "sales" || value === "bookings";
}

function validValue(value: string, eventType: DemandKind): boolean {
  return eventType === "sales" ? salesPattern.test(value) :
    bookingsPattern.test(value) && Number(value) >= 1;
}

function validLocalTimestamp(value: string, timezone: string): boolean {
  if (!timePattern.test(value)) return false;
  try {
    const instant = Temporal.Instant.from(value);
    const local = Temporal.PlainDateTime.from(value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, ""));
    return Temporal.PlainDateTime.compare(instant.toZonedDateTimeISO(timezone).toPlainDateTime(), local) === 0;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function validStoredTimestamp(value: string): boolean {
  if (!timePattern.test(value)) return false;
  try {
    Temporal.Instant.from(value);
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function parseDemandImportForm(formData: FormData) {
  const context = parseBusinessVenueContext(formData);
  const eventType = singleFormString(formData, "event_type");
  const sourceName = singleFormString(formData, "source_name")?.trim();
  const timezone = singleFormString(formData, "venue_timezone");
  const requestId = parseBusinessId(singleFormString(formData, "request_id"));
  const files = formData.getAll("file");
  if (!context || !kind(eventType) || !sourceName || !sourcePattern.test(sourceName) ||
    !timezone || !validTimezone(timezone) || !requestId ||
    files.length !== 1 || !(files[0] instanceof File)) return null;
  return { ...context, eventType, sourceName, timezone, requestId, file: files[0] };
}

export function parseDemandCsv(text: string, eventType: DemandKind, timezone: string): DemandRecordInput[] {
  if (!validTimezone(timezone)) throw new DemandImportError("The venue timezone is invalid and must be corrected before importing history.");
  if (Buffer.byteLength(text, "utf8") > MAX_DEMAND_FILE_BYTES) {
    throw new DemandImportError("The file is larger than 500,000 bytes. Split it into smaller files.");
  }
  let rows: string[][];
  try {
    rows = parse(text, { bom: true, max_record_size: 2048 });
  } catch (error) {
    if (error instanceof CsvError) {
      throw new DemandImportError("The file is not a valid three-column CSV. Check quotes, blank lines and column counts.");
    }
    throw error;
  }
  const valueColumn = eventType === "sales" ? "sales_amount_aud" : "guest_count";
  if (!rows.length || rows[0].length !== 3 ||
    rows[0][0] !== "source_record_id" || rows[0][1] !== "occurred_at" || rows[0][2] !== valueColumn) {
    throw new DemandImportError(`Use exactly the columns source_record_id,occurred_at,${valueColumn} in that order. Do not include customer details.`);
  }
  if (rows.length < 2 || rows.length > MAX_DEMAND_RECORDS + 1) {
    throw new DemandImportError("The file must contain 1 to 1,000 records, plus the header.");
  }
  const ids = new Set<string>();
  return rows.slice(1).map(([sourceRecordId, occurredAt, value], index) => {
    const label = `Record ${index + 1}`;
    if (!recordIdPattern.test(sourceRecordId)) {
      throw new DemandImportError(`${label} needs a non-identifying source ID using letters, numbers, . _ : or - (up to 128 characters).`);
    }
    if (ids.has(sourceRecordId)) {
      throw new DemandImportError(`${label} repeats a source record ID in this file.`);
    }
    ids.add(sourceRecordId);
    if (!validLocalTimestamp(occurredAt, timezone)) {
      throw new DemandImportError(`${label} needs a valid timestamp with an offset matching ${timezone} at that time.`);
    }
    if (!validValue(value, eventType)) {
      throw new DemandImportError(eventType === "sales"
        ? `${label} needs a non-negative AUD amount with up to nine digits before and two digits after the decimal point.`
        : `${label} needs a whole guest count from 1 to 999,999.`);
    }
    return { source_record_id: sourceRecordId, occurred_at: occurredAt, value };
  });
}

export function parseDemandImports(value: unknown): DemandImport[] | null {
  if (!Array.isArray(value) || value.length > DEMAND_PAGE_SIZE + 1) return null;
  const ids = new Set<string>();
  const result: DemandImport[] = [];
  for (const row of value) {
    if (!isRecord(row) || !isId(row.id) || ids.has(row.id) || !kind(row.event_type) ||
      typeof row.source_name !== "string" || !sourcePattern.test(row.source_name) ||
      typeof row.venue_timezone !== "string" || !validTimezone(row.venue_timezone) ||
      !isId(row.actor_id) || typeof row.entry_count !== "number" ||
      !Number.isInteger(row.entry_count) || row.entry_count < 1 || row.entry_count > MAX_DEMAND_RECORDS ||
      !isInstant(row.occurred_at)) return null;
    ids.add(row.id);
    result.push({
      id: row.id, event_type: row.event_type, source_name: row.source_name,
      venue_timezone: row.venue_timezone, actor_id: row.actor_id,
      entry_count: row.entry_count, occurred_at: row.occurred_at,
    });
  }
  return result;
}

export function parseDemandRecords(value: unknown, eventType: DemandKind, timezone: string): DemandRecord[] | null {
  if (!validTimezone(timezone) || !Array.isArray(value) || value.length > DEMAND_PAGE_SIZE + 1) return null;
  const ids = new Set<string>();
  const result: DemandRecord[] = [];
  for (const row of value) {
    if (!isRecord(row) || !isId(row.id) || ids.has(row.id) ||
      typeof row.source_record_id !== "string" || !recordIdPattern.test(row.source_record_id) ||
      typeof row.original_occurred_at !== "string" || !validStoredTimestamp(row.original_occurred_at) ||
      typeof row.original_value !== "string" || !validValue(row.original_value, eventType)) return null;
    ids.add(row.id);
    result.push({
      id: row.id, source_record_id: row.source_record_id,
      original_occurred_at: row.original_occurred_at, original_value: row.original_value,
    });
  }
  return result;
}

export function parseDemandPage(value: unknown): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d{0,3}$/.test(value)) return null;
  return Number(value);
}

export function demandHistoryHref(
  businessId: string, venueId: string, options: { importId?: string; page?: number; saved?: boolean } = {},
): string {
  const params = new URLSearchParams({ business: businessId, venue: venueId });
  if (options.importId) params.set("import", options.importId);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  if (options.saved) params.set("saved", "1");
  return `/reports/demand-history?${params}`;
}
