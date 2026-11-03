import assert from "node:assert/strict";
import { test } from "node:test";
import { createChunks, stringToBase64URL } from "@supabase/ssr";
import { SHOWCASE_AUTH_COOKIE_NAME } from "../src/lib/showcase.ts";
import {
  browserSessionIdentity, listOfflineClaims, openOfflineContext, parseOfflineContext,
  saveOfflineClaim, sealOfflineContext,
} from "../public/offline-attendance-shared.mjs";

const actorId = "af000000-0000-4000-8000-000000000001";
const sessionId = "af000000-0000-4000-8000-000000000002";
const scope = {
  actorId,
  businessId: "af000000-0000-4000-8000-000000000003",
  venueId: "af000000-0000-4000-8000-000000000004",
  sessionId,
  authCookieName: "sb-127-auth-token",
  options: [{
    employee_id: "af000000-0000-4000-8000-000000000005",
    employee_name: "Worker",
    department_id: "af000000-0000-4000-8000-000000000006",
    department_name: "FOH",
  }],
};
const passphrase = "a private offline phrase";

function sessionCookie(payload, padding = "") {
  const token = `header.${stringToBase64URL(JSON.stringify(payload))}.signature`;
  const value = `base64-${stringToBase64URL(JSON.stringify({ access_token: token, padding }))}`;
  return createChunks(scope.authCookieName, value);
}

function cookieText(chunks) {
  return chunks.map((chunk) => `${chunk.name}=${encodeURIComponent(chunk.value)}`).join("; ");
}

test("offline scope accepts only complete, unique scoped employee options", () => {
  assert.deepEqual(parseOfflineContext(scope), scope);
  for (const invalid of [
    null, {}, { ...scope, actorId: "invalid" }, { ...scope, businessId: "" },
    { ...scope, venueId: "" }, { ...scope, sessionId: "" },
    { ...scope, authCookieName: "other-cookie" }, { ...scope, options: [] },
    { ...scope, options: [scope.options[0], scope.options[0]] },
    { ...scope, options: [{ ...scope.options[0], employee_name: " " }] },
    { ...scope, options: [{ ...scope.options[0], department_id: "" }] },
  ]) assert.equal(parseOfflineContext(invalid), null);
});

test("offline preparation encrypts and authenticates scope with a fresh salt and IV", async () => {
  const first = await sealOfflineContext(scope, passphrase);
  const second = await sealOfflineContext(scope, passphrase);
  assert.notEqual(first, second);
  assert.equal(first.includes(scope.options[0].employee_name), false);
  assert.equal(first.includes(actorId), false);
  assert.deepEqual(await openOfflineContext(first, passphrase), scope);
  await assert.rejects(openOfflineContext(first, "a different offline phrase"), /incorrect or .* changed/);
  const envelope = JSON.parse(first);
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  ciphertext[0] ^= 1;
  await assert.rejects(openOfflineContext(JSON.stringify({
    ...envelope, ciphertext: ciphertext.toString("base64"),
  }), passphrase), /incorrect or .* changed/);
  for (const invalid of [
    "", "{}", JSON.stringify({ ...envelope, version: 2 }),
    JSON.stringify({ ...envelope, salt: "invalid!" }),
    JSON.stringify({ ...envelope, iv: Buffer.alloc(13).toString("base64") }),
  ]) await assert.rejects(openOfflineContext(invalid, passphrase), /invalid/);
  await assert.rejects(sealOfflineContext(scope, "short"), /between 12 and 128/);
  await assert.rejects(sealOfflineContext({ ...scope, options: [] }, passphrase), /scope is invalid/);
});

test("session guard reads Supabase cookies without persisting credentials", () => {
  const identity = { actorId, sessionId };
  const payload = { sub: actorId, session_id: sessionId };
  const chunks = sessionCookie(payload, "x".repeat(12_000));
  assert.ok(chunks.length > 1);
  assert.deepEqual(browserSessionIdentity(cookieText(chunks.toReversed()), scope.authCookieName), identity);
  assert.deepEqual(browserSessionIdentity(cookieText(sessionCookie(payload)), scope.authCookieName), identity);
  assert.deepEqual(browserSessionIdentity(cookieText(sessionCookie({ ...payload, exp: 9999 })),
    scope.authCookieName), identity);
  assert.notDeepEqual(browserSessionIdentity(cookieText(sessionCookie({
    ...payload, session_id: scope.businessId,
  })), scope.authCookieName), identity);
  assert.equal(browserSessionIdentity(cookieText(chunks.slice(1)), scope.authCookieName), null);
  assert.equal(browserSessionIdentity(cookieText([...chunks, chunks[0]]), scope.authCookieName), null);
  assert.equal(browserSessionIdentity(`${cookieText(chunks)}; ${cookieText(sessionCookie(payload))}`,
    scope.authCookieName), null);
  assert.equal(browserSessionIdentity(`${scope.authCookieName}=%invalid`, scope.authCookieName), null);
  assert.equal(browserSessionIdentity(cookieText(sessionCookie({ sub: actorId })), scope.authCookieName), null);
  assert.equal(browserSessionIdentity(cookieText(sessionCookie({ ...payload, sub: "invalid" })),
    scope.authCookieName), null);
  assert.equal(browserSessionIdentity(cookieText(chunks), "another-cookie"), null);
  assert.equal(browserSessionIdentity("unrelated=value", scope.authCookieName), null);
});

test("offline session verification accepts the isolated showcase cookie without reading the ordinary session", () => {
  const identity = { actorId, sessionId };
  const chunks = sessionCookie({ sub: actorId, session_id: sessionId }, "x".repeat(12_000))
    .map((chunk) => ({ ...chunk, name: chunk.name.replace(scope.authCookieName, SHOWCASE_AUTH_COOKIE_NAME) }));
  const showcaseScope = { ...scope, authCookieName: SHOWCASE_AUTH_COOKIE_NAME };
  assert.deepEqual(parseOfflineContext(showcaseScope), showcaseScope);
  assert.deepEqual(browserSessionIdentity(cookieText(chunks), SHOWCASE_AUTH_COOKIE_NAME), identity);
  assert.equal(browserSessionIdentity(cookieText(chunks), scope.authCookieName), null);
});

test("offline queue reports invalid claims and unavailable storage", async () => {
  await assert.rejects(saveOfflineClaim({}), /Invalid offline attendance claim/);
  await assert.rejects(listOfflineClaims(actorId, scope.businessId), /Device storage is unavailable/);
});
