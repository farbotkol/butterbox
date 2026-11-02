import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultOfferExpiry,
  hasShiftStarted,
  localDateTimeAsUtc,
  offerFailureCode,
  parseMyShiftOffers,
  parseOfferCandidates,
  responseFailureCode,
} from "../src/lib/shift-offers.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("offer candidates require distinct employees and known ineligibility reasons", () => {
  assert.deepEqual(parseOfferCandidates([
    { employee_id: id(1), employee_name: "Ann", ineligibility: null },
    { employee_id: id(2), employee_name: "Cat", ineligibility: "availability" },
  ]), [
    { employee_id: id(1), employee_name: "Ann", ineligibility: null },
    { employee_id: id(2), employee_name: "Cat", ineligibility: "availability" },
  ]);
  assert.equal(parseOfferCandidates([
    { employee_id: id(1), employee_name: "Ann", ineligibility: null },
    { employee_id: id(1), employee_name: "Ann", ineligibility: null },
  ]), null);
  assert.equal(parseOfferCandidates([{ employee_id: id(1), employee_name: "Ann", ineligibility: "tired" }]), null);
  assert.equal(parseOfferCandidates([{ employee_id: "x", employee_name: "Ann", ineligibility: null }]), null);
  assert.equal(parseOfferCandidates({}), null);
});

test("personal offers reject malformed status, timestamps and outcomes", () => {
  const offer = {
    offer_id: id(1), shift_id: id(2), department_name: "FOH", role_title: "Barista",
    starts_at: "2032-04-05T09:00:00+00:00", ends_at: "2032-04-05T13:00:00+00:00", break_minutes: 30,
    expires_at: "2032-04-04T09:00:00+00:00", offer_status: "open", response: "pending",
    responded_at: null, outcome: null, can_respond: true,
  };
  assert.deepEqual(parseMyShiftOffers([offer]), [offer]);
  assert.equal(parseMyShiftOffers([{ ...offer, response: "maybe" }]), null);
  assert.equal(parseMyShiftOffers([{ ...offer, outcome: "won" }]), null);
  assert.equal(parseMyShiftOffers([{ ...offer, responded_at: "not a date" }]), null);
  assert.equal(parseMyShiftOffers([{ ...offer, can_respond: "yes" }]), null);
  assert.equal(parseMyShiftOffers([{ ...offer, break_minutes: 1.5 }]), null);
  assert.equal(parseMyShiftOffers(null), null);
});

test("offer expiry converts venue-local time and rejects daylight-saving gaps", () => {
  assert.equal(localDateTimeAsUtc("2032-04-05T09:30", "UTC"), "2032-04-05T09:30:00.000Z");
  assert.equal(localDateTimeAsUtc("2032-01-10T09:00", "Australia/Sydney"), "2032-01-09T22:00:00.000Z");
  assert.equal(localDateTimeAsUtc("2032-07-10T09:00", "Australia/Sydney"), "2032-07-09T23:00:00.000Z");
  // Sydney clocks jump from 02:00 to 03:00 on 3 October 2032.
  assert.equal(localDateTimeAsUtc("2032-10-03T02:30", "Australia/Sydney"), null);
  assert.equal(localDateTimeAsUtc("2032-13-01T09:00", "UTC"), null);
  assert.equal(localDateTimeAsUtc("tomorrow", "UTC"), null);
  assert.equal(localDateTimeAsUtc("2032-04-05T09:30", "Not/AZone"), null);
});

test("default expiry is 24 hours ahead but at least an hour before the shift", () => {
  const now = Date.parse("2032-04-01T00:00:30Z");
  assert.equal(defaultOfferExpiry("2032-04-05T09:00:00Z", now), "2032-04-02T00:00:00.000Z");
  assert.equal(defaultOfferExpiry("2032-04-01T10:00:00Z", now), "2032-04-01T09:00:00.000Z");
  assert.equal(defaultOfferExpiry("2032-04-01T00:30:00Z", now), "2032-04-01T00:29:00.000Z");
  assert.equal(hasShiftStarted("2032-04-01T00:00:30Z", now), true);
  assert.equal(hasShiftStarted("2032-04-01T00:00:31Z", now), false);
});

test("database failures map to specific user-facing codes", () => {
  assert.equal(offerFailureCode("Employee is not eligible for this offer"), "offer-ineligible");
  assert.equal(offerFailureCode("Shift offer has already been filled"), "offer-filled");
  assert.equal(offerFailureCode("Shift has already started"), "offer-closed");
  assert.equal(offerFailureCode("Permission denied"), "offer");
  assert.equal(responseFailureCode("Shift offer has expired"), "offer-expired");
  assert.equal(responseFailureCode("Shift offer already answered"), "offer-answered");
  assert.equal(responseFailureCode(undefined), "offer");
});
