import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createPublicGateway, publicShowcaseOrigin } from "../scripts/showcase-public-gateway.mjs";

const origin = "https://0123456789abcdef.abcdefghijkl.opentunnel.xyz";
const host = new URL(origin).host;

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function request(port, { path = "/", method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      host: "127.0.0.1", port, path, method, headers: { Host: host, ...headers },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString(),
      }));
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

async function fixture(t, options = {}) {
  const upstream = http.createServer((request, response) => {
    if (request.url === "/outside") {
      response.writeHead(302, { Location: "//other.example/unsafe" }).end();
      return;
    }
    if (request.url === "/inside") {
      response.writeHead(302, { Location: "/login" }).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Set-Cookie": ["session=test; Path=/; SameSite=Lax", "other=test; Path=/; Secure"],
      "X-Powered-By": "example",
    });
    response.end(JSON.stringify(request.headers));
  });
  const upstreamPort = await listen(upstream);
  const gateway = createPublicGateway({ origin, upstreamPort, ...options });
  const port = await listen(gateway);
  t.after(async () => { await close(gateway); await close(upstream); });
  return port;
}

test("public origin must be the dedicated HTTPS OpenTunnel route", () => {
  assert.equal(publicShowcaseOrigin(origin), origin);
  for (const bad of [
    "", "http://0123456789abcdef.abcdefghijkl.opentunnel.xyz", "https://example.com",
    `${origin}/people`, `${origin}?x=1`, `${origin}#x`, `${origin}:8443`,
    "https://user:pass@0123456789abcdef.abcdefghijkl.opentunnel.xyz",
    "https://0123456789abcdef.abcdefghijkl.opentunnel.xyz.example.com",
  ]) assert.throws(() => publicShowcaseOrigin(bad), /public showcase|dedicated/i);
});

test("gateway fixes forwarding headers and secures response cookies", async (t) => {
  const port = await fixture(t);
  const result = await request(port, { headers: {
    "X-Forwarded-Host": "attacker.example", "X-Forwarded-Proto": "http",
    "X-Forwarded-For": "203.0.113.1", "X-Real-IP": "203.0.113.2",
    "X-Middleware-Subrequest": "middleware", Forwarded: "host=attacker.example",
  } });
  assert.equal(result.status, 200);
  const sent = JSON.parse(result.body);
  assert.equal(sent.host, host);
  assert.equal(sent["x-forwarded-host"], host);
  assert.equal(sent["x-forwarded-proto"], "https");
  assert.equal(sent["x-forwarded-port"], "443");
  for (const name of ["x-forwarded-for", "x-real-ip", "x-middleware-subrequest", "forwarded"]) {
    assert.equal(sent[name], undefined);
  }
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(result.headers["referrer-policy"], "no-referrer");
  assert.equal(result.headers["x-powered-by"], undefined);
  assert.ok(result.headers["set-cookie"].every((cookie) => /(?:^|;)\s*secure(?:;|$)/i.test(cookie)));
  assert.equal(result.headers["set-cookie"][1].match(/secure/gi).length, 1);
});

test("gateway blocks private services, misleading email routes, spoofed hosts and origins", async (t) => {
  const port = await fixture(t);
  for (const path of [
    "/api/health", "/api/metrics", "/api/ready", "/auth/v1/admin/users",
    "/rest/v1/businesses", "/storage/v1/object", "/signup", "/forgot-password",
    "/reset-password", "/invitations/123",
  ]) assert.equal((await request(port, { path })).status, 404, path);
  for (const path of ["/%61pi/health", "/api%2fmetrics", "/%252e%252e/api/ready"]) {
    assert.ok([400, 404].includes((await request(port, { path })).status), path);
  }
  assert.equal((await request(port, { headers: { Host: "127.0.0.1:3000" } })).status, 421);
  assert.equal((await request(port, { method: "DELETE" })).status, 405);
  assert.equal((await request(port, { method: "POST" })).status, 403);
  assert.equal((await request(port, { method: "POST", headers: { Origin: "https://attacker.example" } })).status, 403);
  assert.equal((await request(port, { method: "POST", headers: { Origin: origin } })).status, 200);
});

test("gateway limits public mutations and request body size", async (t) => {
  const port = await fixture(t, { postLimit: 1, now: () => 1 });
  assert.equal((await request(port, { method: "POST", headers: { Origin: origin } })).status, 200);
  const limited = await request(port, { method: "POST", headers: { Origin: origin } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["retry-after"], "60");
  const oversized = await request(port, { headers: { "Content-Length": "1048577" } });
  assert.equal(oversized.status, 413);
});

test("gateway blocks off-origin redirects but preserves relative redirects", async (t) => {
  const port = await fixture(t);
  assert.equal((await request(port, { path: "/outside" })).status, 502);
  const inside = await request(port, { path: "/inside" });
  assert.equal(inside.status, 302);
  assert.equal(inside.headers.location, "/login");
});
