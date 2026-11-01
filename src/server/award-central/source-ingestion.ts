// Keep source acquisition in trusted server-side workers; never expose provider headers to clients.
import { createHash } from "node:crypto";

export const MAX_AWARD_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAPD_SOURCE_COVERAGE_GAPS = [
  "award_or_classification_applicability",
  "employee_entitlement_applicability",
  "enterprise_agreement_applicability",
  "award_variation_change_monitoring",
  "full_award_clause_interpretation",
] as const;
const REQUEST_TIMEOUT_MS = 20_000;
const ALLOWED_SOURCE_HOSTS = new Set([
  "api.fwc.gov.au",
  "developer.fwc.gov.au",
  "fwc.gov.au",
  "www.fwc.gov.au",
  "legislation.gov.au",
  "www.legislation.gov.au",
]);
const SENSITIVE_QUERY_PARAMETER = /^(?:api[_-]?key|access[_-]?token|code|sig|subscription[_-]?key|token)$/i;

export type AwardSourceKind = "pay_database_api" | "award_instrument" | "variation_notice";

export type AwardSourceMetadata = {
  sourceIdentity: string;
  sourceKind: AwardSourceKind;
  retrievedAt: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  sourceRevision: string | null;
  variationReferences: string[];
  fieldsPresent: string[];
  unresolvedFields: string[];
};

export type AwardSourceSnapshot = AwardSourceMetadata & {
  sourceUrl: string;
  contentType: string;
  content: Uint8Array;
  sha256: string;
  status: "staged";
};

export type AwardSourceFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function parseOfficialSourceUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Award source URL is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    !ALLOWED_SOURCE_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.href.length > 2048 ||
    [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_PARAMETER.test(key))
  ) {
    throw new Error("Award source URL must be an approved official HTTPS URL without embedded credentials.");
  }
  return url;
}

function validateMetadata(metadata: AwardSourceMetadata): void {
  if (
    !metadata.sourceIdentity.trim() ||
    metadata.sourceIdentity !== metadata.sourceIdentity.trim() ||
    metadata.sourceIdentity.length > 300
  ) {
    throw new Error("Award source identity is invalid.");
  }
  if (!["pay_database_api", "award_instrument", "variation_notice"].includes(metadata.sourceKind)) {
    throw new Error("Award source kind is unsupported.");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(metadata.retrievedAt) ||
    !Number.isFinite(Date.parse(metadata.retrievedAt))
  ) {
    throw new Error("Award source retrieval time must include an explicit timezone.");
  }
  for (const [label, value] of [
    ["effective from", metadata.effectiveFrom],
    ["effective until", metadata.effectiveUntil],
  ] as const) {
    if (value !== null && !isCalendarDate(value)) {
      throw new Error(`Award source ${label} date is invalid.`);
    }
  }
  if (
    metadata.effectiveFrom &&
    metadata.effectiveUntil &&
    metadata.effectiveUntil < metadata.effectiveFrom
  ) {
    throw new Error("Award source effective dates are reversed.");
  }
  if (metadata.sourceRevision !== null && (
    !metadata.sourceRevision.trim() ||
    metadata.sourceRevision !== metadata.sourceRevision.trim() ||
    metadata.sourceRevision.length > 120
  )) {
    throw new Error("Award source revision is invalid.");
  }
  for (const fieldList of [metadata.variationReferences, metadata.fieldsPresent, metadata.unresolvedFields]) {
    if (
      !Array.isArray(fieldList) ||
      fieldList.some((item) => typeof item !== "string" || !item.trim() || item.length > 300) ||
      new Set(fieldList).size !== fieldList.length
    ) {
      throw new Error("Award source field and variation metadata must contain unique, non-empty strings.");
    }
  }
  if (metadata.fieldsPresent.some((field) => metadata.unresolvedFields.includes(field))) {
    throw new Error("Award source fields cannot be both present and unresolved.");
  }
  if (
    metadata.sourceKind === "pay_database_api" &&
    MAPD_SOURCE_COVERAGE_GAPS.some((gap) => !metadata.unresolvedFields.includes(gap))
  ) {
    throw new Error("MAPD snapshots must retain the documented API coverage limitations.");
  }
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_AWARD_SOURCE_BYTES) {
      throw new Error("Award source exceeds the maximum permitted size.");
    }
  }

  if (!response.body) throw new Error("Award source response has no content.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AWARD_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error("Award source exceeds the maximum permitted size.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Award source exceeds the maximum permitted size.") {
      throw error;
    }
    throw new Error("Award source response could not be read.");
  } finally {
    reader.releaseLock();
  }

  if (size === 0) throw new Error("Award source response has no content.");
  const content = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return content;
}

export async function acquireAwardSource(
  urlValue: string,
  metadata: AwardSourceMetadata,
  options: { fetcher?: AwardSourceFetcher; headers?: HeadersInit } = {},
): Promise<AwardSourceSnapshot> {
  const url = parseOfficialSourceUrl(urlValue);
  validateMetadata(metadata);

  const response = await (options.fetcher ?? fetch)(url, {
    method: "GET",
    headers: options.headers,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error("Award source redirects are not followed.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Award source request failed with HTTP ${response.status}.`);
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(contentType)) {
    await response.body?.cancel();
    throw new Error("Award source response has no valid content type.");
  }

  const content = await readBoundedBody(response);
  return {
    ...metadata,
    sourceUrl: url.href,
    contentType,
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
    status: "staged",
  };
}
