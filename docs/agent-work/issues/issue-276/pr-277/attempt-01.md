# Attempt 01

- Issue: #276
- Pull request: #277, targeting `copilot/Development`
- Implementation commit: `e96ba8b46a429e8d5498c3728955170bbd6ae0eb`
- Recommendation: Partial; the PR must remain a draft.

## Acceptance criteria

- **AC1 — Blocked:** Add Person and primary-department employee-profile forms now support optional mobile entry, editing and removal. The added browser test did not reach Playwright locally: the Next.js build stopped because Google Fonts could not be fetched. UI interaction remains unverified.
- **AC2 — Pass:** Client and server normalization covers Australian `04` input, syntactic international E.164, empty input and malformed values. The employee column is nullable for existing records. Unit and database assertions passed.
- **AC3 — Pass:** Checked RPCs and existing row-level policies were exercised for owner access, an out-of-scope manager, a linked employee and a separate business. Audit assertions confirm mobile values are excluded.
- **AC4 — Pass:** Saving is contact-data-only; no SMS, Twilio, notification or invitation delivery was added. UI and guide distinguish storage from consent and verification. Consent source/time, independent verification and opt-out enforcement are documented as dependent SMS work.
- **AC5 — Blocked:** Unit/help tests and 18 focused pgTAP assertions passed, and the guide/help are updated. The local browser test could not execute, and the full local database runner image could not build because DNS resolution for `www.postgresql.org` failed. GitHub checks were still running or blocked by PR metadata when recorded.

## Verification

- `node --experimental-strip-types --test tests/help.test.mjs tests/employee-mobile.test.mjs tests/people-directory.test.mjs` — passed, 26 tests.
- `npx tsc --noEmit` — passed.
- `npm run lint -- src/app/actions.ts src/app/people/people-forms.tsx 'src/app/people/[employeeId]/page.tsx' src/app/people/people-feedback.tsx src/lib/employee-mobile.ts tests/employee-mobile.test.mjs tests/help.test.mjs tests/e2e/auth.spec.mjs` — passed.
- `psql` against the verified disposable `butterbox-citest` database, executing `supabase/tests/database/employee_mobile_contacts.test.sql` — passed, 18 pgTAP assertions.
- `npm run test:auth:focused -- --grep 'employee profiles and filtered team directory' --runner host` — blocked before Playwright; Next.js could not fetch Google Fonts in this environment.
- `node scripts/test-env.mjs run db --runner container` — migrations, including the new migration, applied; runner image build then failed because `www.postgresql.org` did not resolve. The focused SQL file was run separately with `psql`.
- GitHub run `43953793967` on the implementation commit: `verify` failed because the PR body lacks the canonical issue reference and marker; `database` was in progress at capture. This is a PR-description blocker, not a feature-test result.

## Decisions and limitations

- No SMS-consent, ownership-verification or opt-out state was added; these remain explicit prerequisites for any separately approved SMS delivery work.
- International validation is syntactic E.164 validation and does not determine carrier assignment or number ownership.
- Profile display and editing remain in the existing primary-department management scope; linked workers retain their existing self-read access.
- The PR description still needs an authorized update to include the required reference/evidence markers and remove auto-close wording. Do not mark the PR ready or merge it until this is corrected and the required checks pass.
