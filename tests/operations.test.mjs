import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  applicationReady, operationalMetrics, operationsAccess, recordProbe, recordRequestError,
} from "../src/lib/operations.ts";
import { GET as readiness } from "../src/app/api/ready/route.ts";
import { GET as metrics } from "../src/app/api/metrics/route.ts";
import { onRequestError } from "../src/instrumentation.ts";

function environment(t, values) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("operator access fails closed and never accepts cookies, query strings or malformed tokens", () => {
  const token = randomBytes(32).toString("base64url");
  assert.equal(operationsAccess(null, undefined), "unconfigured");
  assert.equal(operationsAccess(`Bearer ${token}`, "short"), "unconfigured");
  assert.equal(operationsAccess(null, token), "unauthorised");
  assert.equal(operationsAccess(`Basic ${token}`, token), "unauthorised");
  assert.equal(operationsAccess(`Bearer ${token} `, token), "unauthorised");
  assert.equal(operationsAccess(`Bearer ${token.slice(1)}`, token), "unauthorised");
  assert.equal(operationsAccess(`Bearer ${token}`, token), "authorised");
});

test("metrics are process-scoped snapshots and request-error logs exclude request and error details", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const before = operationalMetrics();
  recordProbe("liveness", true);
  recordProbe("readiness", false);
  recordRequestError("action");
  recordRequestError("invalid-category");
  environment(t, { NEXT_RUNTIME: "nodejs" });
  await onRequestError(new Error("private customer error"), {
    path: "/?secret=private-query", method: "POST", headers: { authorization: "private-token" },
  }, { routeType: "render" });
  const after = operationalMetrics();
  assert.equal(after.scope, "process");
  assert.equal(after.requestErrors.render, before.requestErrors.render + 1);
  assert.equal(after.requestErrors.action, before.requestErrors.action + 1);
  assert.equal(after.requestErrors.unknown, before.requestErrors.unknown + 1);
  assert.equal(after.probes.liveness.passed, before.probes.liveness.passed + 1);
  assert.equal(after.probes.readiness.failed, before.probes.readiness.failed + 1);
  assert.ok(Number.isFinite(Date.parse(after.lastErrorAt)));
  assert.doesNotMatch(JSON.stringify(logs), /private/);
  after.requestErrors.action = -10;
  after.probes.readiness.failed = -10;
  assert.notEqual(operationalMetrics().requestErrors.action, -10);
  assert.notEqual(operationalMetrics().probes.readiness.failed, -10);
});

test("readiness runs a bounded uncached database RPC without following redirects", async (t) => {
  t.mock.method(console, "error");
  let observed;
  const fetcher = async (url, options) => {
    observed = { url: String(url), options };
    return Response.json(true);
  };
  assert.equal(await applicationReady("http://127.0.0.1:55421", "fixture-key", fetcher), true);
  assert.equal(observed.url, "http://127.0.0.1:55421/rest/v1/rpc/check_application_readiness");
  assert.equal(observed.options.method, "POST");
  assert.equal(observed.options.headers.apikey, "fixture-key");
  assert.equal(observed.options.body, "{}");
  assert.equal(observed.options.cache, "no-store");
  assert.equal(observed.options.redirect, "error");
  assert.ok(observed.options.signal instanceof AbortSignal);
  assert.equal(await applicationReady(undefined, "fixture-key", fetcher), false);
  assert.equal(await applicationReady("not-a-url", "fixture-key", fetcher), false);
  assert.equal(await applicationReady("file:///etc/passwd", "fixture-key", fetcher), false);
  assert.equal(await applicationReady("https://user:password@example.test", "fixture-key", fetcher), false);
});

test("readiness explicitly fails on network, timeout, non-JSON, permissions and malformed RPC responses", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const attempts = [
    async () => { throw new Error("sensitive dependency address"); },
    async () => { throw new DOMException("private timeout details", "TimeoutError"); },
    async () => new Response("private gateway error", { status: 503 }),
    async () => new Response("private auth error", { status: 401 }),
    async () => new Response("<html>private error</html>"),
    async () => Response.json({ status: "ok" }),
    async () => Response.json(false),
  ];
  for (const fetcher of attempts) {
    assert.equal(await applicationReady("https://example.test", "fixture-key", fetcher), false);
  }
  assert.equal(logs.length, attempts.length);
  assert.doesNotMatch(JSON.stringify(logs), /private|sensitive dependency/);
});

test("a real unresponsive dependency is aborted by the three-second readiness deadline", { timeout: 10_000 }, async (t) => {
  t.mock.method(console, "error", () => {});
  const server = createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const started = performance.now();
  assert.equal(await applicationReady(`http://127.0.0.1:${server.address().port}`, "fixture-key"), false);
  const elapsed = performance.now() - started;
  assert.ok(elapsed >= 2_500 && elapsed < 6_000, `readiness deadline took ${elapsed} ms`);
});

test("readiness route uses runtime configuration and exposes no dependency details", async (t) => {
  t.mock.method(console, "error");
  t.mock.method(console, "info");
  environment(t, {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key",
  });
  const dependency = t.mock.method(globalThis, "fetch", async () => Response.json(true));
  const healthy = await readiness();
  assert.equal(healthy.status, 200);
  assert.equal(healthy.headers.get("cache-control"), "no-store");
  assert.deepEqual(await healthy.json(), { status: "ok" });
  dependency.mock.mockImplementation(async () => new Response("private provider failure", { status: 500 }));
  const unavailable = await readiness();
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { status: "unavailable" });
});

test("metrics route requires a server-only token even for signed-in sessions and never caches", async (t) => {
  t.mock.method(console, "error");
  const token = randomBytes(32).toString("base64url");
  environment(t, { BUTTERBOX_OPERATIONS_TOKEN: "" });
  const unconfigured = metrics(new Request("http://localhost/api/metrics"));
  assert.equal(unconfigured.status, 503);
  process.env.BUTTERBOX_OPERATIONS_TOKEN = token;
  const unauthorised = metrics(new Request(`http://localhost/api/metrics?token=${token}`, {
    headers: { cookie: "signed-in-fixture" },
  }));
  assert.equal(unauthorised.status, 401);
  assert.equal(unauthorised.headers.get("www-authenticate"), "Bearer");
  const permitted = metrics(new Request("http://localhost/api/metrics", {
    headers: { authorization: `Bearer ${token}` },
  }));
  assert.equal(permitted.status, 200);
  assert.equal(permitted.headers.get("cache-control"), "no-store");
  const result = await permitted.json();
  assert.equal(result.scope, "process");
  assert.ok(result.probes.readiness);
  assert.ok(result.requestErrors);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token));
});
