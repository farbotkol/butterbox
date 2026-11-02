import { createHash, timingSafeEqual } from "node:crypto";

type ErrorCategory = "render" | "route" | "action" | "proxy" | "unknown";
type Probe = "liveness" | "readiness";
type Metrics = {
  startedAt: string;
  requestErrors: Record<ErrorCategory, number>;
  probes: Record<Probe, { passed: number; failed: number }>;
  lastErrorAt: string | null;
};

const processState = globalThis as typeof globalThis & { butterboxOperations?: Metrics };

function metrics(): Metrics {
  return processState.butterboxOperations ??= {
    startedAt: new Date().toISOString(),
    requestErrors: { render: 0, route: 0, action: 0, proxy: 0, unknown: 0 },
    probes: { liveness: { passed: 0, failed: 0 }, readiness: { passed: 0, failed: 0 } },
    lastErrorAt: null,
  };
}

export function recordRequestError(category: string) {
  const state = metrics();
  const key: ErrorCategory = Object.hasOwn(state.requestErrors, category) ? category as ErrorCategory : "unknown";
  state.requestErrors[key] += 1;
  state.lastErrorAt = new Date().toISOString();
  console.error(JSON.stringify({
    event: "butterbox_request_error", category: key, occurredAt: state.lastErrorAt,
  }));
}

export function recordProbe(probe: Probe, passed: boolean) {
  const state = metrics();
  state.probes[probe][passed ? "passed" : "failed"] += 1;
  if (probe === "readiness") {
    const event = JSON.stringify({
      event: "butterbox_readiness", status: passed ? "ok" : "unavailable", occurredAt: new Date().toISOString(),
    });
    if (passed) console.info(event);
    else console.error(event);
  }
}

export function operationalMetrics() {
  const state = metrics();
  return {
    version: 1,
    scope: "process",
    startedAt: state.startedAt,
    observedAt: new Date().toISOString(),
    requestErrors: { ...state.requestErrors },
    probes: {
      liveness: { ...state.probes.liveness },
      readiness: { ...state.probes.readiness },
    },
    lastErrorAt: state.lastErrorAt,
  };
}

export function operationsAccess(authorization: string | null, expected: string | undefined) {
  if (!expected || expected.length < 32) return "unconfigured";
  if (!authorization?.startsWith("Bearer ")) return "unauthorised";
  const provided = authorization.slice(7);
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(provided), hash(expected)) ? "authorised" : "unauthorised";
}

export async function applicationReady(
  url: string | undefined,
  key: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!url || !key) {
    console.error("Application readiness failed.", { code: "configuration_missing" });
    return false;
  }
  try {
    const endpoint = new URL("/rest/v1/rpc/check_application_readiness", url);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      console.error("Application readiness failed.", { code: "configuration_invalid" });
      return false;
    }
    const result = await fetcher(endpoint, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
      redirect: "error",
    });
    if (!result.ok || await result.json() !== true) {
      console.error("Application readiness failed.", { code: "dependency_unavailable" });
      return false;
    }
    return true;
  } catch {
    // Error messages may contain dependency URLs or credentials; only emit a fixed code.
    console.error("Application readiness failed.", { code: "dependency_request_failed" });
    return false;
  }
}
