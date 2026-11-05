import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isKioskCredential, parseKioskActivation, parseKioskContext, parseKioskCreation,
  parseKioskDisplay, parseKioskDisplayResponse, parseKioskList, singleFormString,
} from "../src/lib/attendance-kiosk.ts";

const business = "a0000000-0000-4000-8000-000000000001";
const venue = "b0000000-0000-4000-8000-000000000001";
const kiosk = "c0000000-0000-4000-8000-000000000001";
const credential = `${kiosk}.${"a".repeat(64)}`;
const now = "2026-01-01T10:00:00Z";
const later = "2026-01-01T10:00:45Z";

test("kiosk credentials are bounded, lowercase and exactly formed", () => {
  assert.equal(isKioskCredential(credential), true);
  for (const value of [null, "", credential.toUpperCase(), `${credential}x`,
    `${kiosk}.${"g".repeat(64)}`, `${kiosk}.${"a".repeat(63)}`]) {
    assert.equal(isKioskCredential(value), false);
  }
});

test("kiosk forms reject missing, repeated and invalid tenant scope", () => {
  const form = new FormData();
  form.set("business_id", business);
  form.set("venue_id", venue);
  assert.deepEqual(parseKioskContext(form), { businessId: business, venueId: venue });
  assert.equal(singleFormString(form, "venue_id"), venue);
  form.append("venue_id", venue);
  assert.equal(parseKioskContext(form), null);
  assert.equal(singleFormString(form, "venue_id"), null);
  form.set("venue_id", "not-a-uuid");
  assert.equal(parseKioskContext(form), null);
});

test("one-time activation receipts are validated and bound to the returned device", () => {
  const row = { kiosk_id: kiosk, activation_code: credential, activation_expires_at: later };
  assert.deepEqual(parseKioskCreation([row]), { kioskId: kiosk, activationCode: credential, expiresAt: later });
  assert.equal(parseKioskCreation([{ ...row, kiosk_id: venue }]), null);
  assert.equal(parseKioskCreation([{ ...row, activation_expires_at: "invalid" }]), null);
  assert.equal(parseKioskCreation([row, row]), null);
  assert.deepEqual(parseKioskActivation([{ session_code: credential, session_expires_at: later }]),
    { sessionCode: credential, expiresAt: later });
  assert.equal(parseKioskActivation([{ session_code: credential, session_expires_at: null }]), null);
});

test("display response retains only a valid, short-lived, scoped code", () => {
  const row = {
    qr_code: credential, business_id: business, venue_id: venue,
    venue_name: "Test venue", expires_at: later, server_at: now, secret: "not returned",
  };
  const expected = {
    qrCode: credential, businessId: business, venueId: venue,
    venueName: "Test venue", expiresAt: later, serverAt: now,
  };
  assert.deepEqual(parseKioskDisplay([row]), expected);
  assert.deepEqual(parseKioskDisplayResponse(expected), expected);
  assert.equal(parseKioskDisplay([{ ...row, expires_at: now }]), null);
  assert.equal(parseKioskDisplay([{ ...row, expires_at: "2026-01-01T10:00:46Z" }]), null);
  assert.equal(parseKioskDisplay([{ ...row, business_id: "bad" }]), null);
  assert.equal(parseKioskDisplay([{ ...row, venue_name: " " }]), null);
  assert.equal(parseKioskDisplayResponse({ ...expected, qrCode: "invalid" }), null);
});

test("owner lists reject duplicate or malformed devices without returning secret fields", () => {
  const row = {
    kiosk_id: kiosk, name: "Counter", created_at: now, activated_at: now,
    session_expires_at: later, revoked_at: null, signing_key: "not returned",
  };
  assert.deepEqual(parseKioskList([row]), [{
    kioskId: kiosk, name: "Counter", createdAt: now, activatedAt: now,
    sessionExpiresAt: later, revokedAt: null,
  }]);
  assert.equal(parseKioskList([row, row]), null);
  assert.equal(parseKioskList([{ ...row, revoked_at: "invalid" }]), null);
  assert.equal(parseKioskList([{ ...row, name: "" }]), null);
});
