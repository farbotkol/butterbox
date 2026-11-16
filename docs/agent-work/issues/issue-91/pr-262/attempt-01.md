# Issue #91 · PR #262 · attempt 01

## Scope and status

Partial delivery of the owner-authorized first Xero OAuth connection slice.
Implements per-business connect/callback, signed CSRF state, token exchange and
refresh, encrypted token persistence, organization selection, and retryable
revocation/disconnect. No payroll timesheet submission, Award Central work,
production activation, or changes to issue #61 delivery logic are included.

Recommendation: **partial**. The official AU Payroll API endpoint and scopes
were confirmed, and mocked OAuth refresh/permission failure paths are covered.
The authorized Xero Demo Company has not been connected, and its AU Payroll
entitlement remains unverified. No payroll mapping, submission, retry, or
duplicate-prevention sandbox test was run.

## Acceptance evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| AC-1: Current AU endpoints/scopes confirmed | Pass | Xero AU Payroll v2 OpenAPI lists `POST /Timesheets` at `https://api.xero.com/payroll.xro/2.0` with `payroll.timesheets`; OAuth requests `offline_access payroll.timesheets`. |
| AC-2: OAuth refresh and permission failure handled | Pass | Mocked refresh rotation, invalid credentials, provider permission responses, scoped role checks, and cross-business database access checks are implemented and covered. |
| AC-3: sandbox end-to-end test validates mapping, retries and duplicate prevention | Blocked | This authorized slice deliberately does not call Payroll AU or submit timesheets. Demo Company Payroll access, mapping, retries, and duplicate prevention require owner-assisted follow-up. |

Documentation: **updated** — `docs/xero-oauth-setup.md` describes owner/admin
permissions, environment setup, connect/disconnect behavior, OAuth limitations,
and the need to verify Payroll AU entitlement. The shared `docs/USER_GUIDE.md`
was not changed because PR #261 owns that file.

## Verification

- `node --experimental-strip-types --test tests/xero-oauth.test.mjs` —
  **11 passed, 0 failed**.
- Targeted `npx eslint` on changed TypeScript and OAuth test files — **passed**.
- `npx tsc --noEmit --incremental false` — **passed**.
- `npx --yes node@24 scripts/test-env.mjs run db --runner host` against the
  verified disposable `butterbox-citest` project — **69 files, 3,157 tests
  passed**. Reset and test completed; the project was stopped and its lock is
  free.
- The default container database runner could not build its image because the
  environment could not resolve `www.postgresql.org`; the documented trusted
  host runner completed the same isolated database suite successfully.
- `npm run build` — **blocked** because Next.js could not fetch the existing
  Inter and Poppins fonts from Google Fonts.
- Secret scan of all implementation and documentation files — **no secrets
  detected**. Vercel credentials were not read or exposed.
- CodeQL and current-head Verify/Database checks remain pending.
- On the previous source head, GitHub Verify failed because the evidence pair
  was absent. Its Database job had 107 passing tests and one unrelated
  attendance/offline-claim browser test timeout at
  `tests/e2e/auth.spec.mjs:8853`; this result predates the current head.

## Limitations and blockers

- Owner must perform a controlled Demo Company OAuth authorization and confirm
  whether that company exposes Australian Payroll API access.
- The `XERO_REDIRECT_URI` and stable `XERO_TOKEN_ENCRYPTION_KEY` settings still
  need secure provisioning alongside the server-side client credentials.
- This PR does not submit timesheets or verify mapping, payroll retries,
  duplicate prevention, or legal/payroll correctness.
- The PR description still contains GitHub's generated `Fixes #91` suffix.
  Available GitHub tools provide read-only PR access, and browser access to the
  PR failed certificate validation; the owner must remove that suffix and
  replace the stale PR description before Verify can pass.
- The PR remains a draft and issue #91 remains open. No merge or deployment was
  performed.
