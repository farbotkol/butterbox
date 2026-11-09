import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAiFixtures, runAiEvaluation } from "../src/lib/ai-evaluation.ts";
import { isValidAiRequestContext, parseAiProposalResponse } from "../src/lib/ai-governance.ts";
import { aiEvaluationFixtures } from "./fixtures/ai-evaluation.mjs";

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const context = {
  feature: "roster_request",
  businessId: id(1),
  venueId: id(2),
  departmentId: id(3),
  requestText: "Cover the selected shift.",
  allowedShiftIds: [id(4)],
  eligibleEmployeeIds: [id(5)],
};
const proposal = {
  status: "proposal",
  feature: "roster_request",
  businessId: id(1),
  venueId: id(2),
  departmentId: id(3),
  summary: "Propose the eligible employee for the selected shift.",
  actions: [{ kind: "assign_shift", shiftId: id(4), employeeId: id(5) }],
};

test("valid request contexts require bounded text and structurally valid scope", () => {
  assert.equal(isValidAiRequestContext(context), true);
  assert.equal(isValidAiRequestContext({ ...context, requestText: " " }), false);
  assert.equal(isValidAiRequestContext({ ...context, requestText: "x".repeat(2001) }), false);
  assert.equal(isValidAiRequestContext({ ...context, businessId: "not-a-uuid" }), false);
  assert.equal(isValidAiRequestContext({ ...context, allowedShiftIds: Array(201).fill(id(4)) }), false);
  assert.equal(isValidAiRequestContext({ ...context, role: "owner" }), false);
});

test("proposals must match the request scope and server-provided allow-lists", () => {
  assert.deepEqual(parseAiProposalResponse(proposal, context), proposal);
  assert.equal(parseAiProposalResponse({ ...proposal, businessId: id(99) }, context), null);
  assert.equal(parseAiProposalResponse({ ...proposal, venueId: id(99) }, context), null);
  assert.equal(parseAiProposalResponse({ ...proposal, departmentId: id(99) }, context), null);
  assert.equal(parseAiProposalResponse({
    ...proposal, actions: [{ ...proposal.actions[0], shiftId: id(99) }],
  }, context), null);
  assert.equal(parseAiProposalResponse({
    ...proposal, actions: [{ ...proposal.actions[0], employeeId: id(99) }],
  }, context), null);
});

test("unknown fields, duplicate shifts and action-like output are rejected", () => {
  assert.equal(parseAiProposalResponse({ ...proposal, role: "owner" }, context), null);
  assert.equal(parseAiProposalResponse({ ...proposal, apply: true }, context), null);
  assert.equal(parseAiProposalResponse({
    ...proposal,
    actions: [proposal.actions[0], proposal.actions[0]],
  }, context), null);
  assert.equal(parseAiProposalResponse({
    ...proposal,
    actions: [{ ...proposal.actions[0], kind: "delete_business" }],
  }, context), null);
});

test("clarifications and refusals cannot contain proposed actions", () => {
  assert.equal(parseAiProposalResponse({
    ...proposal,
    status: "clarification",
    actions: [],
    clarification: "Which shift should be considered?",
  }, context)?.status, "clarification");
  assert.equal(parseAiProposalResponse({
    ...proposal,
    status: "refusal",
    actions: [],
  }, context)?.status, "refusal");
  assert.equal(parseAiProposalResponse({
    ...proposal,
    status: "clarification",
    clarification: "Which shift?",
  }, context), null);
});

test("response text is bounded and rejects control characters", () => {
  assert.equal(parseAiProposalResponse({ ...proposal, summary: "x".repeat(501) }, context), null);
  assert.equal(parseAiProposalResponse({ ...proposal, summary: "unsafe\u0000text" }, context), null);
  assert.equal(parseAiProposalResponse({
    ...proposal,
    status: "clarification",
    actions: [],
    clarification: "\u0001",
  }, context), null);
});

test("offline evaluation uses only supplied fixtures and reports metadata without request or output text", () => {
  const results = evaluateAiFixtures(aiEvaluationFixtures);
  assert.equal(results.length, aiEvaluationFixtures.length);
  assert.ok(results.every((result) => result.passed));
  assert.deepEqual(results.map(({ id: caseId, actual }) => [caseId, actual]), [
    ["valid-scoped-proposal", "proposal"],
    ["ambiguous-request", "clarification"],
    ["role-escalation-in-output", "reject"],
    ["malformed-untrusted-output", "reject"],
    ["insufficient-scope", "reject"],
    ["out-of-scope-employee", "reject"],
    ["cross-tenant-response", "reject"],
    ["refusal-has-no-actions", "refusal"],
  ]);
  assert.ok(results.every((result) => !("requestText" in result) && !("response" in result)));
});

test("offline evaluation rejects duplicate case identifiers and invalid contexts", () => {
  assert.throws(() => evaluateAiFixtures([
    aiEvaluationFixtures[0],
    { ...aiEvaluationFixtures[1], id: aiEvaluationFixtures[0].id },
  ]), /Invalid AI evaluation fixture/);
  assert.throws(() => evaluateAiFixtures([
    { ...aiEvaluationFixtures[0], request: { ...context, businessId: "invalid" } },
  ]), /Invalid AI evaluation fixture/);
});

test("offline adapter evaluation returns a scoped result and aggregate usage", async () => {
  const report = await runAiEvaluation(
    aiEvaluationFixtures.slice(0, 1),
    async (fixture) => ({ response: fixture.response, usage: { inputTokens: 2, outputTokens: 3 } }),
    { maxRequests: 1, maxTokens: 5, deadlineMs: 1000 },
  );

  assert.deepEqual(report.cases.map(({ caseId, outcome }) => [caseId, outcome]), [
    ["valid-scoped-proposal", "passed"],
  ]);
  assert.ok(report.cases[0].durationMs >= 0);
  assert.deepEqual(report.usage, { inputTokens: 2, outputTokens: 3 });
});

test("offline adapter evaluation rejects exhausted request and usage budgets before calling", async () => {
  let requestCalls = 0;
  const requestLimited = await runAiEvaluation(
    aiEvaluationFixtures.slice(0, 2),
    async (fixture) => {
      requestCalls += 1;
      return { response: fixture.response, usage: { inputTokens: 1, outputTokens: 1 } };
    },
    { maxRequests: 1, maxTokens: 10, deadlineMs: 1000 },
  );
  assert.deepEqual(requestLimited.cases.map(({ outcome }) => outcome), [
    "passed", "request_budget_exhausted",
  ]);
  assert.equal(requestCalls, 1);

  let usageCalls = 0;
  const usageLimited = await runAiEvaluation(
    aiEvaluationFixtures.slice(0, 2),
    async (fixture) => {
      usageCalls += 1;
      return { response: fixture.response, usage: { inputTokens: 1, outputTokens: 2 } };
    },
    { maxRequests: 2, maxTokens: 3, deadlineMs: 1000 },
  );
  assert.deepEqual(usageLimited.cases.map(({ outcome }) => outcome), [
    "passed", "usage_budget_exhausted",
  ]);
  assert.equal(usageCalls, 1);
  assert.deepEqual(usageLimited.usage, { inputTokens: 1, outputTokens: 2 });
});

test("offline adapter evaluation marks missing usage unavailable and blocks later requests", async () => {
  let calls = 0;
  const report = await runAiEvaluation(
    aiEvaluationFixtures.slice(0, 2),
    async (fixture) => {
      calls += 1;
      return { response: fixture.response };
    },
    { maxRequests: 2, maxTokens: 10, deadlineMs: 1000 },
  );

  assert.deepEqual(report.cases.map(({ outcome }) => outcome), ["passed", "usage_unavailable"]);
  assert.equal(calls, 1);
  assert.equal(report.usage, "unavailable");
});

test("offline adapter evaluation times out and discards late responses", async () => {
  let resolveLateResponse;
  let signal;
  const lateResponse = new Promise((resolve) => {
    resolveLateResponse = resolve;
  });
  const report = await runAiEvaluation(
    aiEvaluationFixtures.slice(0, 1),
    (_fixture, options) => {
      signal = options.signal;
      return lateResponse;
    },
    { maxRequests: 1, maxTokens: 10, deadlineMs: 10 },
  );

  assert.equal(report.cases[0].outcome, "timeout");
  assert.equal(signal.aborted, true);
  assert.equal(report.usage, "unavailable");
  resolveLateResponse({
    response: { ...proposal, summary: "late private model response" },
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  await Promise.resolve();
  assert.equal(report.cases[0].outcome, "timeout");
  assert.equal(JSON.stringify(report).includes("late private model response"), false);
});

test("offline adapter reports contain only case IDs, outcomes, durations, and aggregate usage", async () => {
  const fixture = {
    ...aiEvaluationFixtures[0],
    request: { ...aiEvaluationFixtures[0].request, requestText: "PRIVATE_PROMPT" },
    response: { ...proposal, summary: "PRIVATE_MODEL_RESPONSE for PRIVATE_WORKER" },
  };
  const failingFixture = { ...aiEvaluationFixtures[0], id: "private-error-case" };
  const report = await runAiEvaluation(
    [fixture, failingFixture],
    async (caseFixture) => {
      if (caseFixture.id === "private-error-case") throw new Error("PRIVATE_ERROR_DETAILS");
      return { response: caseFixture.response, usage: { inputTokens: 2, outputTokens: 3 } };
    },
    { maxRequests: 2, maxTokens: 10, deadlineMs: 1000 },
  );
  const serialized = JSON.stringify(report);

  assert.deepEqual(Object.keys(report).sort(), ["cases", "usage"]);
  assert.deepEqual(Object.keys(report.cases[0]).sort(), ["caseId", "durationMs", "outcome"]);
  assert.equal(report.cases[1].outcome, "error");
  assert.equal(report.usage, "unavailable");
  assert.equal(serialized.includes("PRIVATE_PROMPT"), false);
  assert.equal(serialized.includes("PRIVATE_MODEL_RESPONSE"), false);
  assert.equal(serialized.includes("PRIVATE_WORKER"), false);
  assert.equal(serialized.includes("PRIVATE_ERROR_DETAILS"), false);
});
