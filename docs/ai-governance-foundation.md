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
results contain case IDs, categories and pass/fail states only; request text
and response content are not included in the report. Tests supply hard-coded
mock responses; no model, network, personal data or provider credentials are
used.

### Acceptance evidence

- Typed request and response contracts, strict allow-list parsing and offline
  mock-fixture evaluation are independently testable and classified
  **Foundation Ready**.
- The server-side tenant/role authorization path and a persisted per-business
  default-off switch are not implemented in this slice. They require a
  positively verified isolated database for migration and security tests.
- Privacy-minimal durable request logs, usage budgets, timeout enforcement and
  a deployment-safe circuit breaker are also pending. The fixture evaluator
  does not measure a model or establish model safety.
- No live provider is connected; no roster changes can be applied from these
  proposals. This does not complete BB-AI-006, BB-AI-007 or BB-AI-008.
