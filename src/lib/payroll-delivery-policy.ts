import { createHash } from "node:crypto";

export type PayrollDeliveryFailureKind = "transient" | "permanent" | "unknown";

export type PayrollDeliveryRetryPolicy = Readonly<{
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}>;

export class PayrollDeliveryPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollDeliveryPolicyError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maximumAttempts = 10;
const maximumDelayMs = 24 * 60 * 60 * 1000;

export function payrollDeliveryIdempotencyKey(batchId: string, finalisationId: string): string {
  if (!uuidPattern.test(batchId) || !uuidPattern.test(finalisationId)) {
    throw new PayrollDeliveryPolicyError("A valid immutable export batch and finalisation are required.");
  }
  const identity = `v1\u0000${batchId.toLowerCase()}\u0000${finalisationId.toLowerCase()}`;
  const fingerprint = createHash("sha256").update(identity).digest("hex");
  return `butterbox-payroll-v1-${fingerprint}`;
}

export function payrollDeliveryRetryDelayMs(
  failureKind: PayrollDeliveryFailureKind,
  failedAttempt: number,
  policy: PayrollDeliveryRetryPolicy,
): number | null {
  if ((failureKind !== "transient" && failureKind !== "permanent" && failureKind !== "unknown") ||
    typeof policy !== "object" || policy === null || Array.isArray(policy) ||
    !Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 ||
    policy.maxAttempts > maximumAttempts ||
    !Number.isSafeInteger(policy.baseDelayMs) || policy.baseDelayMs < 1 ||
    !Number.isSafeInteger(policy.maxDelayMs) || policy.maxDelayMs < policy.baseDelayMs ||
    policy.maxDelayMs > maximumDelayMs ||
    !Number.isSafeInteger(failedAttempt) || failedAttempt < 1 ||
    failedAttempt > policy.maxAttempts) {
    throw new PayrollDeliveryPolicyError("Invalid payroll delivery retry policy or attempt.");
  }
  if (failureKind !== "transient" || failedAttempt === policy.maxAttempts) return null;
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (failedAttempt - 1));
}
