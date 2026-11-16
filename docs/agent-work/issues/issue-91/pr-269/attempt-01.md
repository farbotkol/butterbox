# Issue #91 / PR #269 / attempt 01

## Scope

PR #269 creates an idempotent payroll mapping destination from an authorized
Xero tenant UUID, backfills existing connected tenants, removes Xero from
manual destination creation, and links connected organizations to their exact
mapping destination. It does not synchronize Xero employees or submit payroll.

This follow-up replaces the obsolete manual-Xero browser setup with a synthetic
connected-tenant flow. It verifies destination creation and navigation,
preserves audited employee mappings through reauthorization, and retains manual
destination creation coverage for MYOB. The corrected reauthorization assertion
compares the same projected mapping fields on both sides.

## Acceptance evidence

| Criterion | Status | Evidence |
|---|---|---|
| Current AU endpoints/scopes confirmed | Pass | Prior merged PR #262 evidence records AU Payroll v2 `POST /Timesheets` and the `payroll.timesheets` scope against the Xero OpenAPI contract. The current delivery document links official endpoint and scope references. |
| OAuth refresh and permission failure handled | Pass | Prior merged PR #262 evidence records mocked refresh, token rotation, revocation, provider permission errors, and refresh-lock coverage. This follow-up additionally verifies same-tenant reauthorization preserves the destination and mapped employee IDs. |
| sandbox end-to-end test validates mapping, retries and duplicate prevention. | Blocked | Hosted full browser and database runs passed synthetic mapping and reauthorization idempotency coverage. No authorized Xero Payroll sandbox submission or provider retry/remote duplicate test was performed; this PR enables no Xero API writes. |

**Documentation: updated** — `docs/xero-payroll-delivery.md` describes the
implemented mapping destination and the still-required Xero Payroll sandbox,
retry, and duplicate-prevention verification. This follow-up changes test and
evidence files only; no new user-facing workflow was introduced.

## Verification

### Corrected source/test commit

- Tested commit: `e951b137070be6fd9fe008dbdfa35cc3d051c006`.
- Required Verify run
  [43827159056](https://github.com/farbotkol/butterbox/actions/runs/43827159056):
  the `database` job passed disposable Supabase startup, all database/pgTAP
  assertions, tenant isolation, and the complete authenticated browser suite:
  **108 passed, 1 skipped, 0 failed**.
- Advisory change-aware run
  [43827158966](https://github.com/farbotkol/butterbox/actions/runs/43827158966)
  selected its conservative full-suite fallback and passed **108 tests, 1
  skipped, 0 failed or flaky**.
- Fast database candidate
  [43827159011](https://github.com/farbotkol/butterbox/actions/runs/43827159011)
  passed migration/pgTAP assertions, authenticated tenant isolation, and the
  critical browser smoke.
- The `verify` job in run 43827159056 stopped at the pre-existing malformed
  evidence gate before running `npm test`, lint, or build. This attempt repairs
  that evidence pair; fresh Verify results must be checked after this commit.

### Test iteration and local checks

- Initial full browser runs on `eebdca2` found one test-only mismatch:
  **107 passed, 1 skipped, 1 failed**. The RPC included `employee_name`, while
  the pre-reauthorization snapshot projected only employee ID, external ID, and
  revision. The comparison now projects the same fields on both sides.
- `node --experimental-strip-types --test tests/*.test.mjs` — **408 passed,
  36 skipped, 0 failed** on the preceding E2E-only head.
- Repository ESLint and `npx tsc --noEmit` passed on the preceding head.
- `node --check tests/e2e/auth.spec.mjs`, `npx eslint
  tests/e2e/auth.spec.mjs`, and `git diff --check` passed after the assertion
  correction.
- `npm run test:auth:focused -- --test tests/e2e/auth.spec.mjs:12718` could not
  start locally because the pinned Supabase CLI 2.122.0 is unavailable; the
  hosted full-suite runs completed successfully instead.
- Local `npm run build` could not fetch the existing Inter and Poppins fonts in
  this network-restricted environment. The current Verify workflow stopped
  before its build step at evidence validation.

## Remaining limitations

- No Xero payroll sandbox, real employee synchronization, payroll submission,
  provider retry, or remote duplicate-prevention behavior was exercised.
- No production migration or deployment was performed.
- PR #269 remains draft. Do not treat this partial mapping delivery as full
  completion of the sandbox payroll acceptance criterion.
