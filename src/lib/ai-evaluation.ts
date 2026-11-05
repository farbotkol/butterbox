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
