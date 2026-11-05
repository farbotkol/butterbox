import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAiFixtures } from "../src/lib/ai-evaluation.ts";
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
