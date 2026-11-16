# Issue #83 / PR #261 / attempt 01

## Scope and implementation

Fixed only the `EmployeeForm` submit action styling in
`src/app/people/people-forms.tsx`. The primary action now occupies a full-width
grid footer row while remaining content-sized, right-aligned, and top-aligned;
its minimum height matches the existing 44px button size. The shared
`SaveButton`, form action, validation, permissions, and creation behavior are
unchanged.

## Acceptance evidence

| Criterion | Status | Evidence |
|---|---|---|
| Add employee button uses a compact, consistent height rather than stretching to match the adjacent form row. | Pass | The responsive browser case checks a 44–48px button height at 375, 768, 1024, and 1440px. The full browser fallback passed the case. |
| Button is correctly placed and aligned with Cancel on desktop and mobile layouts. | Pass | At all four widths the action is right-aligned in the form footer, with Cancel visible below it and no overlap. |
| No awkward empty button space or oversized dark block remains. | Pass | The same browser assertions check content-sized width and compact height at each viewport. |
| Accessible focus, disabled, loading and submit behavior continue working. | Pass | The action receives keyboard focus; the existing duplicate-submit creation flow remains and passed. People loading/failed-save recovery also passed. `SaveButton` and its pending/disabled behavior were not changed. |
| Visual regression or component tests cover desktop and mobile layouts. | Pass | `employee profiles and filtered team directory` passed with geometry assertions at four mobile, tablet, and desktop widths. |
| Relevant checks pass and PR targets `copilot/Development`; do not auto-merge or deploy. | Blocked | The PR targets `copilot/Development` and remains draft; it was not merged or deployed. Required `database` passed, but `verify` stops at PR-body reference validation before application checks. |

**Documentation: updated** — `/docs/USER_GUIDE.md` now describes the verified
compact, right-aligned footer action and separate Cancel placement.

## Test and CI record

- `npm run lint -- src/app/people/people-forms.tsx tests/e2e/auth.spec.mjs` — passed.
- `npx tsc --noEmit --incremental false` — passed.
- `npm test` — 391 passed, 36 skipped, 0 failed (427 total).
- Advisory change-aware trial on the clean UI-only change (`91ee210`):
  selector mode **focused**; changed file `src/app/people/people-forms.tsx`;
  grep `verified signup|tenant|roster timetable|offline attendance|payroll|permissions UX|employee|people|department|invitation|permissions`.
  The auth-focused run matched 58 cases in `tests/e2e/auth.spec.mjs`: 57 passed,
  1 skipped, 0 failed. Selected-browser execution took 553 seconds (9m13s);
  the conservative full fallback was skipped. Relevant executed cases included
  employee profile creation, People layouts, People failed-save recovery,
  People section editors, department layouts, invitation, permissions, roster,
  attendance, and payroll coverage.
- Advisory change-aware run after the `tests/` change (`9963a8f`): selector mode
  **full**, reason `Shared, security, database, tooling or unknown comparison scope`.
  The focused step was skipped and the conservative full fallback ran
  `tests/e2e/auth.spec.mjs`: 108 passed, 1 skipped, 0 failed or flaky in 892
  seconds (14m52s). The `employee profiles and filtered team directory` case
  passed in 9.5 seconds, including the new responsive assertions and employee
  submission flow. The People loading/failed-save and stale-editor cases passed.
- Required `database` check in Verify run
  [43594509885](https://github.com/farbotkol/butterbox/actions/runs/43594509885):
  passed, including database tests, authenticated tenant isolation, and browser
  authentication tests.
- Required `verify` check in the same run failed at
  [PR evidence validation](https://github.com/farbotkol/butterbox/actions/runs/43594509885/job/132446059759):
  `PR body must include Refs #N and the matching canonical issue marker`.
  The existing generated PR body still lacks the required `Refs #83`,
  `<!-- butterbox-issue: 83 -->`, and attempt-specific evidence marker, and it
  contains auto-close wording. The available session tools do not expose a
  pull-request body editor, so this remains an owner/reviewer action.
- ESLint, TypeScript, unit tests, the advisory full fallback, and `database`
  passed. The application build was deferred because no route, Next.js
  configuration, or server/client boundary changed; Verify stopped before its
  build step at the PR metadata gate.

## Remaining blocker

Update the draft PR body with the exact canonical issue/evidence markers and
remove auto-close keywords while acceptance remains incomplete. Rerun required
`verify` on that PR body. No application, database, production, or deployment
blocker was observed.
