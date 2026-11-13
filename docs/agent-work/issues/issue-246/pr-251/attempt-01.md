# Issue #246 / PR #251 / attempt 01

## Scope
Fix false invalid-component metadata errors produced by Playwright `.spec.mjs` filenames in active PR conflict detection. The actual path and component conflict guard remains enabled.

## Implementation
- `tools/agent-controller/component-coordination.mjs`: strip both `.test.<ext>` and `.spec.<ext>` suffixes, and sanitize remaining invalid identifier characters.
- `tests/component-coordination.test.mjs`: regression assertions for auth/showcase Playwright specs, an ordinary Node unit-test file and shared test helpers.

## Status
Partial remediation for issue #246. PR #250's `check` failed due to PR #85's test spec file names being mapped to invalid component tokens. Static source inspection identified the mismatch. CI run and reviewer approval are pending; no claim that tests have executed or passed.

## Safety and constraints
No bypass of actual-path, SQL-object, or overlapping-component checks; no removal or retargeting of PR #85. No production deployment or automatic merge. The trusted Development workflow uses its own base script until this fix is merged through review.
