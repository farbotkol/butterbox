import assert from "node:assert/strict";
import { test } from "node:test";
import {
  payrollDeliveryIdempotencyKey, payrollDeliveryRetryDelayMs, PayrollDeliveryPolicyError,
} from "../src/lib/payroll-delivery-policy.ts";

const batchId = "97400000-0000-4000-8000-000000000001";
const finalisationId = "77400000-0000-4000-8000-000000000001";
const policy = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 5000 };

test("delivery idempotency key is stable for an immutable batch and finalisation", () => {
  const key = payrollDeliveryIdempotencyKey(batchId, finalisationId);
  assert.equal(key, payrollDeliveryIdempotencyKey(batchId.toUpperCase(), finalisationId));
  assert.notEqual(key, payrollDeliveryIdempotencyKey(
    "97400000-0000-4000-8000-000000000002", finalisationId,
  ));
  assert.notEqual(key, payrollDeliveryIdempotencyKey(
    batchId, "77400000-0000-4000-8000-000000000002",
  ));
  assert.match(key, /^butterbox-payroll-v1-[0-9a-f]{64}$/);
  assert.throws(() => payrollDeliveryIdempotencyKey("batch", finalisationId), PayrollDeliveryPolicyError);
});

test("transient failures use capped exponential backoff and stop at the attempt limit", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((attempt) =>
    payrollDeliveryRetryDelayMs("transient", attempt, policy)), [1000, 2000, 4000, 5000, null]);
});

test("permanent and unknown failures never schedule an automatic retry", () => {
  assert.equal(payrollDeliveryRetryDelayMs("permanent", 1, policy), null);
  assert.equal(payrollDeliveryRetryDelayMs("unknown", 1, policy), null);
  assert.equal(payrollDeliveryRetryDelayMs("transient", 1, {
    maxAttempts: 1, baseDelayMs: 1000, maxDelayMs: 1000,
  }), null);
});

test("retry planning rejects invalid attempts, unbounded policies and unknown failure kinds", () => {
  for (const [failure, attempt, retryPolicy] of [
    ["other", 1, policy],
    ["transient", 1, null],
    ["transient", 0, policy],
    ["transient", 6, policy],
    ["transient", 1, { ...policy, maxAttempts: 11 }],
    ["transient", 1, { ...policy, baseDelayMs: 0 }],
    ["transient", 1, { ...policy, maxDelayMs: 999 }],
    ["transient", 1, { ...policy, maxDelayMs: 86_400_001 }],
  ]) {
    assert.throws(() => payrollDeliveryRetryDelayMs(failure, attempt, retryPolicy), PayrollDeliveryPolicyError);
  }
});
