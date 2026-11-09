# AI governance foundation — Foundation Ready slice

## AI-GOV-001: typed draft proposals and offline response evaluation

**Linked parent stories:** BB-AI-006 (scope-safe responses) and BB-AI-007
(offline evaluation). Both parent story statuses remain `Backlog`.

This model-neutral slice defines a bounded roster request context and a
strictly parsed `assign_shift` proposal. A response must match the supplied
business, venue, department, shift and eligible-employee allow-lists. Unknown
fields, unsupported action kinds, duplicate shifts, malformed text, and
out-of-scope identifiers are rejected. The result remains proposal data; the
module contains no roster mutation or action-application function.

The offline fixture suite covers a valid scoped proposal, ambiguity,
prompt-injection-style privilege escalation, malformed output, insufficient
context, unauthorized employees and cross-tenant response scope. Evaluation
results from the original fixture evaluator contain case IDs, categories,
expected and actual statuses, and pass/fail states; request text and response
content are not included. Tests supply hard-coded mock responses; no model,
network, personal data or provider credentials are used.

### Acceptance evidence

- Typed request and response contracts, strict allow-list parsing and offline
  mock-fixture evaluation are independently testable and classified
  **Foundation Ready**.
- AI-GOV-001 itself has no server-side authorization. Issue #68 adds the
  separate review boundary below; a persisted per-business default-off switch
  and isolated database acceptance remain pending.
- Privacy-minimal durable request logs, usage budgets, timeout enforcement and
  a deployment-safe circuit breaker are also pending. The fixture evaluator
  does not measure a model or establish model safety.
- No live provider is connected; no roster changes can be applied from these
  proposals. This does not complete BB-AI-006, BB-AI-007 or BB-AI-008.

## BB-AI-007: bounded offline adapter evaluation

`runAiEvaluation` adds a provider-neutral evaluation path around the same
scoped response parser. The adapter is explicitly supplied by the caller; the
runner itself does not select a model or make network requests. The adapter
receives only a case ID and request, not the expected outcome or canned fixture
response. Its required limits are a maximum adapter request count, a maximum
aggregate input-plus-output token count, and a whole-run deadline in
milliseconds. Calls are sequential. Once a request or measured usage limit is
exhausted, later cases are reported without invoking the adapter. If a call
exceeds the usage budget, that case reports `usage_budget_exceeded`;
subsequent calls are not made.

The deadline aborts the adapter signal and late responses are discarded. When
usage is absent, invalid, or unknown after a timeout/error, the report marks
aggregate usage `unavailable` and does not make further calls because the usage
budget can no longer be enforced. Reports contain only case IDs, outcomes,
durations, and aggregate token usage (or `unavailable`); prompt text, model
responses, adapter errors and worker details are excluded. This remains an
offline fake-adapter control, not durable production logging, a production
circuit breaker, or evidence of model quality or award correctness.

## Issue #68: authenticated proposal review boundary

`src/app/assistant/actions.ts` exports `reviewAiProposalAction(request, response)`.
It creates the existing cookie-authenticated Supabase client on the server;
callers cannot supply a client, user, role, membership or allow-lists.
`src/lib/ai-proposal-review.ts` implements the independently testable service.
The request accepts exactly `feature`, `businessId`, `venueId`, `departmentId`
and bounded `requestText`. Scope IDs are untrusted selectors, not permissions.

Before retrieving shift or employee IDs, each invocation:

1. Authenticates with `auth.getUser()` and rereads that user's membership for
   the selected business. Revocation is membership deletion in the current schema.
2. Calls the existing `can_manage_department` RPC, which enforces owner/admin
   access, general-manager venue scope, and FOH/BOH/department-manager assignment.
   Employee and unknown roles cannot review assignment proposals.
3. Resolves an active department using the complete business/venue/department
   tuple. Even an owner cannot combine IDs from unrelated scopes.
4. Retrieves only scheduled, unpublished shift IDs in that scope and active
   employee IDs joined through current `employee_departments` assignments in
   the same business and venue. Home department alone is not the eligibility rule.
   More than 200 shifts or 500 employee links fails closed, rather than enlarging
   the existing parser's bounds.
5. Passes those server-retrieved allow-lists to the unchanged strict proposal
   parser. One invalid action rejects the entire response.
6. Repeats authentication, membership, management permission and active
   department checks before returning; the authenticated user must be unchanged.

Success is `review_required`, never execution or approval. Only validated
proposal IDs and fixed server-authored summary/clarification text are returned.
Prompt/model prose is neither an instruction source nor exposed as an employee
detail or a claim that approval occurred. Unsupported tools, unknown fields,
scope changes and IDs outside the allow-lists deny. All failures return the same
non-revealing `denied` message, without database diagnostics or echoed input.
No roster write, approval RPC, provider call or new schema is involved.

### Observed verification and remaining limitations

`node --experimental-strip-types --test tests/ai-governance.test.mjs tests/ai-proposal-review.test.mjs`
passed **16/16** on 9 November 2026 UTC. The tests execute the real Supabase query
builder with synthetic HTTP responses, checking scoped minimal queries, each
manager role, employee/anonymous denials, forged scope and IDs, changed/revoked
membership between and during calls, inactive resources, unknown actions,
injection-style escalation/disclosure/approval attempts and safe output text.
Targeted ESLint and repository TypeScript passed. Production build was attempted
but blocked by Google Fonts downloads for existing Inter/Poppins fonts.

These are deterministic service/transport tests, **not** PostgreSQL/RLS,
cookie-authentication or browser runtime acceptance. No verified disposable
database was used; authenticated integration remains a pre-rollout gate.
Separate reads cannot promise a transactionally atomic snapshot. A review result
is not a reusable authorization token: future display/review must invoke this
boundary again, and any future apply workflow must reauthorize and revalidate
latest membership, roster, worker eligibility and approval within its write
transaction. Scope eligibility here is not availability, overlap, qualification
or award/pay validation. Natural-language injection detection/model safety,
an assistant UI, retrieval of employee details, audit persistence, default-off
switches, budgets and actual model evaluation remain outside this slice.

**Documentation: updated. User Guide: not applicable** — backend-only contract,
with no user-visible assistant workflow, external delivery or provider integration.
BB-AI-006 remains **Backlog** pending its broader runtime acceptance.
