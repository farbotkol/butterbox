import http from "node:http";

const maximumBodyBytes = 1_048_576;
const unavailablePaths = [
  "/api", "/auth", "/rest", "/storage", "/realtime", "/signup", "/forgot-password",
  "/reset-password", "/invitations",
];

export function publicShowcaseOrigin(value) {
  if (typeof value !== "string" || !URL.canParse(value)) {
    throw new Error("Provide the HTTPS origin of the dedicated OpenTunnel showcase route.");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash ||
      !/^[a-f0-9]{16}\.[a-z2-7]{12}\.opentunnel\.xyz$/.test(url.hostname)) {
    throw new Error("The public showcase origin must be a dedicated random OpenTunnel HTTPS route.");
  }
  return url.origin;
}

function reply(response, status, message, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "close",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(`${message}\n`);
}

function requestPath(value) {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;
  const rawPath = value.split("?", 1)[0];
  if (/\\|%(?:2e|2f|5c|25)/i.test(rawPath)) return null;
  try {
    return new URL(decodeURIComponent(rawPath), "http://127.0.0.1").pathname;
  } catch {
    return null;
  }
}

function forwardedHeaders(request, host) {
  const headers = { ...request.headers };
  const connectionHeaders = (headers.connection ?? "").split(",").map((name) => name.trim().toLowerCase());
  for (const name of Object.keys(headers)) {
    if (connectionHeaders.includes(name) || name === "connection" || name === "forwarded" ||
        name === "host" || name === "proxy-authorization" || name === "transfer-encoding" ||
        name === "upgrade" || name === "x-real-ip" || name === "cf-connecting-ip" ||
        name === "true-client-ip" || name.startsWith("x-forwarded-") || name.startsWith("x-middleware-")) {
      delete headers[name];
    }
  }
  headers.host = host;
  headers["x-forwarded-host"] = host;
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-port"] = "443";
  return headers;
}

export function createPublicGateway({ origin, upstreamPort = 3141, postLimit = 60, now = Date.now }) {
  const publicOrigin = publicShowcaseOrigin(origin);
  const host = new URL(publicOrigin).host;
  const agent = new http.Agent({ keepAlive: true, maxSockets: 32 });
  let posts = [];
  const server = http.createServer({ maxHeaderSize: 16_384 }, (request, response) => {
    const hosts = request.headersDistinct.host ?? [];
    if (hosts.length !== 1 || ![host, `${host}:443`].includes(hosts[0].toLowerCase())) {
      console.error("Public showcase gateway rejected an unexpected host.");
      reply(response, 421, "This showcase is not available at that host.");
      return;
    }
    if (!["GET", "HEAD", "POST"].includes(request.method ?? "")) {
      console.error("Public showcase gateway rejected an unsupported method.");
      reply(response, 405, "This request method is unavailable.", { Allow: "GET, HEAD, POST" });
      return;
    }
    const pathname = requestPath(request.url);
    if (!pathname) {
      console.error("Public showcase gateway rejected an invalid path.");
      reply(response, 400, "Invalid request path.");
      return;
    }
    if (unavailablePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
      reply(response, 404, "This service is unavailable in the public demo.");
      return;
    }
    if (request.method === "POST") {
      if (request.headers.origin !== publicOrigin) {
        console.error("Public showcase gateway rejected a cross-origin request.");
        reply(response, 403, "The request origin is not allowed.");
        return;
      }
      const current = now();
      posts = posts.filter((time) => current - time < 60_000);
      if (posts.length >= postLimit) {
        console.error("Public showcase gateway rate limit reached.");
        reply(response, 429, "Too many demo requests. Try again shortly.", { "Retry-After": "60" });
        return;
      }
      posts.push(current);
    }
    const contentLength = request.headers["content-length"];
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maximumBodyBytes)) {
      console.error("Public showcase gateway rejected an oversized request.");
      reply(response, 413, "The request is too large.");
      return;
    }

    const upstream = http.request({
      host: "127.0.0.1", port: upstreamPort, method: request.method, path: request.url,
      headers: forwardedHeaders(request, host), agent, timeout: 60_000,
    }, (incoming) => {
      const location = incoming.headers.location;
      if (location && (!URL.canParse(location, publicOrigin) ||
          new URL(location, publicOrigin).origin !== publicOrigin)) {
        console.error("Public showcase gateway blocked an external redirect.");
        incoming.resume();
        reply(response, 502, "The demo returned an unavailable destination.");
        return;
      }
      const headers = {
        ...incoming.headers,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "x-robots-tag": "noindex, nofollow, noarchive",
      };
      delete headers["x-powered-by"];
      if (headers["set-cookie"]) {
        headers["set-cookie"] = headers["set-cookie"].map((cookie) =>
          /(?:^|;)\s*secure(?:;|$)/i.test(cookie) ? cookie : `${cookie}; Secure`);
      }
      response.writeHead(incoming.statusCode ?? 502, headers);
      incoming.pipe(response);
    });
    upstream.on("timeout", () => upstream.destroy(new Error("Showcase upstream timed out.")));
    upstream.on("error", (error) => {
      if (response.writableEnded) return;
      console.error("Public showcase gateway could not reach the application.", { code: error.code });
      if (!response.headersSent) reply(response, 502, "The demo is temporarily unavailable.");
      else response.destroy();
    });
    let received = 0;
    request.on("data", (chunk) => {
      received += chunk.length;
      if (received > maximumBodyBytes && !response.writableEnded) {
        console.error("Public showcase gateway rejected an oversized streamed request.");
        request.unpipe(upstream);
        upstream.destroy();
        reply(response, 413, "The request is too large.");
      }
    });
    request.on("aborted", () => upstream.destroy());
    request.pipe(upstream);
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.maxConnections = 100;
  server.on("upgrade", (_request, socket) => socket.destroy());
  server.on("clientError", (_error, socket) => {
    console.error("Public showcase gateway rejected a malformed request.");
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });
  server.on("close", () => agent.destroy());
  return server;
}
