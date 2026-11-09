export const venuePricingTiers = [
  { name: "Free", minimumWorkers: 1, maximumWorkers: 3, monthlyPriceAud: 0, pricing: "fixed" },
  { name: "Starter", minimumWorkers: 4, maximumWorkers: 15, monthlyPriceAud: 15, pricing: "fixed" },
  { name: "Pro", minimumWorkers: 16, maximumWorkers: 30, monthlyPriceAud: 25, pricing: "fixed" },
  { name: "Plus", minimumWorkers: 31, maximumWorkers: 60, monthlyPriceAud: 45, pricing: "fixed" },
  { name: "Growth", minimumWorkers: 61, maximumWorkers: 100, monthlyPriceAud: 69, pricing: "fixed" },
  { name: "Scale", minimumWorkers: 101, maximumWorkers: 200, monthlyPriceAud: 99, pricing: "fixed" },
  { name: "Enterprise", minimumWorkers: 201, maximumWorkers: null, monthlyPriceAud: null, pricing: "custom" },
] as const;

export type VenuePricingResolution =
  | { status: "awaiting_pricing_decision"; workerCount: 0 }
  | {
    status: "resolved";
    workerCount: number;
    tier: (typeof venuePricingTiers)[number];
  };

export function resolveVenuePricing(workerCount: number): VenuePricingResolution {
  if (!Number.isSafeInteger(workerCount) || workerCount < 0) {
    throw new RangeError("Active worker count must be a non-negative safe integer.");
  }
  if (workerCount === 0) {
    return { status: "awaiting_pricing_decision", workerCount: 0 };
  }

  const tier = venuePricingTiers.find(({ minimumWorkers, maximumWorkers }) =>
    workerCount >= minimumWorkers && (maximumWorkers === null || workerCount <= maximumWorkers),
  );
  if (!tier) throw new RangeError("Active worker count is outside the supported range.");

  return { status: "resolved", workerCount, tier };
}
