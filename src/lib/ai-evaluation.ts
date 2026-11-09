import {
  isValidAiRequestContext,
  parseAiProposalResponse,
  type AiProposalStatus,
  type AiRequestContext,
} from "./ai-governance.ts";

export const aiEvaluationCategories = [
  "valid",
  "ambiguous",
  "prompt_injection",
  "malicious_input",
  "missing_context",
  "unauthorized_action",
] as const;

export type AiEvaluationCategory = (typeof aiEvaluationCategories)[number];
export type AiEvaluationExpectation = AiProposalStatus | "reject";

export type AiEvaluationFixture = {
  id: string;
  category: AiEvaluationCategory;
  request: AiRequestContext;
  expected: AiEvaluationExpectation;
  response: unknown;
};

export type AiEvaluationResult = {
  id: string;
  category: AiEvaluationCategory;
  expected: AiEvaluationExpectation;
  actual: AiEvaluationExpectation;
  passed: boolean;
};

export type AiEvaluationUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type AiEvaluationAdapterResult = {
  response: unknown;
  usage?: AiEvaluationUsage;
};

export type AiEvaluationAdapter = (
  fixture: AiEvaluationFixture,
  options: { signal: AbortSignal },
) => AiEvaluationAdapterResult | Promise<AiEvaluationAdapterResult>;

export type AiEvaluationRunOutcome =
  | "passed"
  | "failed"
  | "timeout"
  | "error"
  | "request_budget_exhausted"
  | "usage_budget_exhausted"
  | "usage_budget_exceeded"
  | "usage_unavailable";

export type AiEvaluationRunResult = {
  caseId: string;
  outcome: AiEvaluationRunOutcome;
  durationMs: number;
};

export type AiEvaluationRunReport = {
  cases: AiEvaluationRunResult[];
  usage: AiEvaluationUsage | "unavailable";
};

export type AiEvaluationRunOptions = {
  maxRequests: number;
  maxTokens: number;
  deadlineMs: number;
};

const isValidLimit = (value: number) => Number.isSafeInteger(value) && value >= 0;

const isValidUsage = (usage: unknown): usage is AiEvaluationUsage =>
  typeof usage === "object" && usage !== null &&
  "inputTokens" in usage && isValidLimit(usage.inputTokens as number) &&
  "outputTokens" in usage && isValidLimit(usage.outputTokens as number);

const elapsedMs = (startedAt: number) => Math.max(0, Math.round(performance.now() - startedAt));

export function evaluateAiFixtures(
  fixtures: readonly AiEvaluationFixture[],
): AiEvaluationResult[] {
  const ids = new Set<string>();
  return fixtures.map((fixture) => {
    if (!fixture || typeof fixture.id !== "string" || !fixture.id.trim() || ids.has(fixture.id) ||
      !aiEvaluationCategories.includes(fixture.category) ||
      !["proposal", "clarification", "refusal", "reject"].includes(fixture.expected) ||
      !isValidAiRequestContext(fixture.request)) {
      throw new Error("Invalid AI evaluation fixture.");
    }
    ids.add(fixture.id);
    const parsed = parseAiProposalResponse(fixture.response, fixture.request);
    const actual = parsed?.status ?? "reject";
    return {
      id: fixture.id,
      category: fixture.category,
      expected: fixture.expected,
      actual,
      passed: actual === fixture.expected,
    };
  });
}

export async function runAiEvaluation(
  fixtures: readonly AiEvaluationFixture[],
  adapter: AiEvaluationAdapter,
  options: AiEvaluationRunOptions,
): Promise<AiEvaluationRunReport> {
  if (!options || !isValidLimit(options.maxRequests) || !isValidLimit(options.maxTokens) ||
    !Number.isFinite(options.deadlineMs) || options.deadlineMs <= 0 ||
    typeof adapter !== "function") {
    throw new Error("Invalid AI evaluation limits or adapter.");
  }
  evaluateAiFixtures(fixtures);

  const runStartedAt = performance.now();
  const deadlineAt = runStartedAt + options.deadlineMs;
  let requests = 0;
  let usageAvailable = true;
  const usage: AiEvaluationUsage = { inputTokens: 0, outputTokens: 0 };
  const cases: AiEvaluationRunResult[] = [];

  for (const fixture of fixtures) {
    const remainingMs = deadlineAt - performance.now();
    if (requests >= options.maxRequests) {
      cases.push({ caseId: fixture.id, outcome: "request_budget_exhausted", durationMs: 0 });
      continue;
    }
    if (!usageAvailable) {
      cases.push({ caseId: fixture.id, outcome: "usage_unavailable", durationMs: 0 });
      continue;
    }
    if (usage.inputTokens + usage.outputTokens >= options.maxTokens) {
      cases.push({ caseId: fixture.id, outcome: "usage_budget_exhausted", durationMs: 0 });
      continue;
    }
    if (remainingMs <= 0) {
      cases.push({ caseId: fixture.id, outcome: "timeout", durationMs: 0 });
      continue;
    }

    requests += 1;
    const startedAt = performance.now();
    const controller = new AbortController();
    const result = await new Promise<
      | { kind: "response"; value: AiEvaluationAdapterResult }
      | { kind: "error" }
      | { kind: "timeout" }
    >((resolve) => {
      const timer = setTimeout(() => {
        controller.abort();
        resolve({ kind: "timeout" });
      }, remainingMs);
      Promise.resolve()
        .then(() => adapter(fixture, { signal: controller.signal }))
        .then(
          (value) => resolve({ kind: "response", value }),
          () => resolve({ kind: "error" }),
        )
        .finally(() => clearTimeout(timer));
    });
    const durationMs = elapsedMs(startedAt);

    if (result.kind === "timeout" ||
      (result.kind === "response" && performance.now() > deadlineAt)) {
      controller.abort();
      usageAvailable = false;
      cases.push({ caseId: fixture.id, outcome: "timeout", durationMs });
      continue;
    }
    if (result.kind === "error") {
      usageAvailable = false;
      cases.push({ caseId: fixture.id, outcome: "error", durationMs });
      continue;
    }
    if (typeof result.value !== "object" || result.value === null || !("response" in result.value)) {
      usageAvailable = false;
      cases.push({ caseId: fixture.id, outcome: "error", durationMs });
      continue;
    }

    const parsed = parseAiProposalResponse(result.value.response, fixture.request);
    let outcome: AiEvaluationRunOutcome =
      (parsed?.status ?? "reject") === fixture.expected ? "passed" : "failed";
    if (!isValidUsage(result.value.usage)) {
      usageAvailable = false;
    } else {
      usage.inputTokens += result.value.usage.inputTokens;
      usage.outputTokens += result.value.usage.outputTokens;
      const totalUsage = usage.inputTokens + usage.outputTokens;
      if (!Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens) ||
        !Number.isSafeInteger(totalUsage)) {
        usageAvailable = false;
      } else if (totalUsage > options.maxTokens) {
        outcome = "usage_budget_exceeded";
      }
    }
    cases.push({ caseId: fixture.id, outcome, durationMs });
  }

  return {
    cases,
    usage: usageAvailable ? usage : "unavailable",
  };
}
