# Attempt 01

- Issue: #276
- Pull request: #277, targeting `copilot/Development`
- Implementation commit: `e96ba8b46a429e8d5498c3728955170bbd6ae0eb`
- Browser-fix commits: `843924f2fae2d91c2b52b5c2138206da2943db67`, `ae374c71ae36ddceca9c911c920fde2a7b646f26`
- Recommendation: Partial; keep the PR draft and issue open pending owner review.

## Acceptance criteria

- **AC1 — Pass:** Add Person supports optional mobile entry; the employee profile supports editing and removal. The browser test verifies malformed input returns to Add Person with an accessible actionable error and creates no employee. The full browser suite passed on `ae374c7`.
- **AC2 — Pass:** Australian `04` input, syntactic international E.164, empty input and malformed values are covered. The employee column remains nullable for existing records. Unit and database assertions passed.
- **AC3 — Pass:** Checked RPCs and row-level policies were exercised for owner access, an out-of-scope manager, a linked employee and a separate business. Audit assertions confirm mobile values are excluded; CI tenant-isolation checks passed.
- **AC4 — Pass:** Saving is contact-data-only; no SMS, Twilio, notification or invitation delivery was added. UI and guide distinguish storage from consent and verification. Consent source/time, independent verification and opt-out enforcement remain prerequisites for future SMS work.
- **AC5 — Pass:** Focused application/help tests, 18 pgTAP assertions and CI browser/accessibility coverage passed. The full browser suite reports 108 passed, 0 failed, 0 flaky and 1 skipped. The guide and contextual-help coverage are updated.

## Verification

- `node --experimental-strip-types --test tests/help.test.mjs tests/employee-mobile.test.mjs tests/people-directory.test.mjs` — passed, 26 tests.
- `npx tsc --noEmit` — passed.
- `npm run lint -- src/app/actions.ts src/app/people/people-forms.tsx 'src/app/people/[employeeId]/page.tsx' src/app/people/people-feedback.tsx src/lib/employee-mobile.ts tests/employee-mobile.test.mjs tests/help.test.mjs tests/e2e/auth.spec.mjs` — passed.
- `psql` against the verified disposable `butterbox-citest` database, executing `supabase/tests/database/employee_mobile_contacts.test.sql` — passed, 18 pgTAP assertions.
- `npm run lint -- tests/e2e/auth.spec.mjs` and `git diff --check` — passed for the browser-test fixes.
- `npm run test:auth:focused -- --test tests/e2e/auth.spec.mjs:3859 --runner host` — blocked before Playwright because this sandbox did not have the required Supabase CLI 2.122.0.
- GitHub Verify run `43962828303` — passed verify, database and tenant-isolation jobs; all 18 database assertions and the application checks passed.
- GitHub browser run `43962828340` — passed the full auth suite: 108 passed, 0 failed, 0 flaky, 1 skipped. The invalid-mobile test and the keyboard tab-order test both passed.
- Earlier run `43959490272` had 107 browser tests pass and the invalid-mobile case fail because the test omitted the required Job role, so native form validation prevented submission. The test now fills Job role and asserts the `error=mobile` redirect before checking feedback and absence of employee creation.

## Decisions and limitations

- No SMS-consent, ownership-verification or opt-out state was added; these remain explicit prerequisites for any separately approved SMS delivery work.
- International validation is syntactic E.164 validation and does not determine carrier assignment or number ownership.
- Profile display and editing remain in the existing primary-department management scope; linked workers retain their existing self-read access.
- **Documentation: updated** — `docs/USER_GUIDE.md` and contextual-help coverage were updated for the mobile contact feature. The browser-regression fixes do not change user-facing workflow guidance.
- The PR remains a draft and issue #276 remains open pending owner review; no production data or live SMS integrations were touched.
