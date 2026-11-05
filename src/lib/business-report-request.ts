import { parseBusinessId } from "./business-selection.ts";
import { timesheetWeek } from "./weekly-timesheet.ts";
import type { BusinessReportType } from "./business-report-export.ts";

export type BusinessReportRequest = Readonly<{
  businessId: string;
  venueId: string;
  weekStart: string;
  reportType: BusinessReportType;
}>;

const formKeys = ["business", "venue", "week", "type"] as const;
const maxFormBytes = 4096;

export function validBusinessReportOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || !host || (fetchSite !== null && fetchSite !== "same-origin") ||
      (protocol !== "http" && protocol !== "https")) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === `${protocol}:` && parsed.host.toLowerCase() === host.trim().toLowerCase() &&
      !parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash;
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

export function parseBusinessReportParams(params: URLSearchParams): BusinessReportRequest | null {
  if ([...params.keys()].some((key) => !formKeys.some((expected) => expected === key)) ||
      formKeys.some((key) => params.getAll(key).length !== 1)) return null;
  const businessId = parseBusinessId(params.get("business"));
  const venueId = parseBusinessId(params.get("venue"));
  const date = params.get("week");
  const weekStart = date ? timesheetWeek(date, "UTC") : null;
  const reportType = params.get("type");
  if (typeof businessId !== "string" || typeof venueId !== "string" || weekStart === null || weekStart < "0001-01-08" ||
      (reportType !== "roster" && reportType !== "attendance")) return null;
  return { businessId, venueId, weekStart, reportType };
}

export async function readBusinessReportForm(request: Request): Promise<
  | Readonly<{ ok: true; value: BusinessReportRequest }>
  | Readonly<{ ok: false; status: 400 | 413 | 415 }>
> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") return { ok: false, status: 415 };
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) return { ok: false, status: 400 };
  if (length !== null && Number(length) > maxFormBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const bytes = new Uint8Array(maxFormBytes);
  let used = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (used + chunk.value.byteLength > maxFormBytes) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    bytes.set(chunk.value, used);
    used += chunk.value.byteLength;
  }
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, used));
  } catch (error) {
    if (error instanceof TypeError) return { ok: false, status: 400 };
    throw error;
  }
  const value = parseBusinessReportParams(new URLSearchParams(body));
  return value ? { ok: true, value } : { ok: false, status: 400 };
}
