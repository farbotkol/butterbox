import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveVenuePricing, venuePricingTiers } from "../src/lib/venue-pricing.ts";

test("venue pricing uses the approved AUD tiers and inclusive worker boundaries", () => {
  const boundaries = [
    [1, "Free", 0], [3, "Free", 0],
    [4, "Starter", 15], [15, "Starter", 15],
    [16, "Pro", 25], [30, "Pro", 25],
    [31, "Plus", 45], [60, "Plus", 45],
    [61, "Growth", 69], [100, "Growth", 69],
    [101, "Scale", 99], [200, "Scale", 99],
    [201, "Enterprise", null],
  ];

  for (const [workerCount, name, monthlyPriceAud] of boundaries) {
    const result = resolveVenuePricing(workerCount);
    assert.equal(result.status, "resolved");
    assert.equal(result.workerCount, workerCount);
    assert.equal(result.tier.name, name);
    assert.equal(result.tier.monthlyPriceAud, monthlyPriceAud);
  }
  assert.equal(venuePricingTiers.at(-1).pricing, "custom");
});

test("venue counts are resolved independently, including workers shared across venues", () => {
  const tenWorkerVenue = resolveVenuePricing(10);
  const twentyFiveWorkerVenue = resolveVenuePricing(25);

  assert.equal(tenWorkerVenue.status, "resolved");
  assert.equal(tenWorkerVenue.tier.monthlyPriceAud, 15);
  assert.equal(twentyFiveWorkerVenue.status, "resolved");
  assert.equal(twentyFiveWorkerVenue.tier.monthlyPriceAud, 25);
});

test("an empty venue awaits the owner decision instead of receiving the Free tier", () => {
  assert.deepEqual(resolveVenuePricing(0), {
    status: "awaiting_pricing_decision",
    workerCount: 0,
  });
});

test("invalid worker counts are rejected", () => {
  for (const count of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, null, "10"]) {
    assert.throws(() => resolveVenuePricing(count), RangeError);
  }
});
