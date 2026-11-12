# Issue #241 · PR #242 · attempt 01

## Scope and status

Partial delivery of an interactive weekly roster timetable. The table now has
venue-local time-scaled shift blocks, separate assigned/open-shift lanes, free
time-slot links into the existing authorized shift editor, and a one-day view
for narrow screens. Existing shift save, preview/confirm move, review and
publish flows were preserved. No database or production changes were made.

Recommendation: **partial**. The first-time-manager flow has a focused
Playwright test and guide steps, but the browser test did not start because the
isolated test runner could not resolve Supabase CLI 2.122.0. The production
build also could not fetch the existing Inter and Poppins fonts. Direct time
resizing, fine-grained hourly shortcuts, tablet/browser acceptance and the
full-story verification remain incomplete.

## Acceptance evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| AC-1: Weekly schedule clearly shows staff assignments and time-based shift blocks; visually understandable without reading extensive instructions. | Not tested | `src/components/roster-timeline.tsx` renders time-scaled draft/published blocks; `src/app/roster/page.tsx` groups staff and open shifts. The browser did not render the route. |
| AC-2: A manager can create a draft shift by interacting with an empty schedule area, with selected staff/date/time pre-populated and a reliable keyboard/touch alternative. | Blocked | `rosterCreateShiftHref()` carries date, time and employee; `tests/e2e/auth.spec.mjs` contains a keyboard-activation workflow. The Playwright runner stopped before the test began, so the end-to-end behavior is not accepted. |
| AC-3: Manager can reassign/move and edit a draft shift using direct visual controls, with preview, validation, clear error state and no silent mutation of published work. | Not tested | Existing draft edit and preview/confirm move flows were preserved. This change does not add direct time resizing; browser validation of move/edit and stale-data behavior was unavailable. |
| AC-4: Clear, prominent draft/review/publish status and primary next action; existing safety/permission gates preserved. | Not tested | Existing review/publish forms and server actions were not changed; timeline blocks label Draft/Published. The route and permission paths were not exercised in a browser. |
| AC-5: Desktop, tablet and phone usage works, with tested keyboard and touch equivalents; accessible labels and focus handling. | Blocked | A one-day filter and labeled, keyboard-focusable slot links were added. The new Playwright case uses a phone viewport and activates a slot with Enter, but did not run; tablet, touch input and accessibility scan remain unverified. |
| AC-6: Existing roster-related regression tests pass, plus new targeted interaction tests for add/move/edit, timezones/DST, overlaps, permissions, stale edits, overnight shifts, and large schedules. | Blocked | 29 focused roster unit/policy tests passed, including DST day lengths, repeated hours, overnight continuation and existing roster policy coverage. The authenticated add/edit/publish walkthrough and broader concurrency, permission, stale-edit and large-schedule browser coverage did not run. |
| AC-7: Include at least one documented *first-time manager* acceptance walkthrough: create shift, assign person, correct time, publish; record steps/screenshots or verifiable Playwright evidence and any unresolved usability limitations. | Blocked | The steps and current six-hour slot/overnight limitations are documented in `docs/USER_GUIDE.md`; `tests/e2e/auth.spec.mjs` provides the test source, but its runtime was blocked and no screenshot or completed-walkthrough evidence exists. |
| AC-8: No production deployment or database changes without separate authorisation; PR targets `copilot/Development`, passing required Verify/Database checks and code review. | Blocked | No production or database changes were made and PR #242 targets `copilot/Development`. The Verify job failed at PR-evidence validation because the PR body lacked issue/evidence markers. The Database job was still in progress at this record; review remains pending. |

Documentation: **updated** — `docs/USER_GUIDE.md` describes the tested code paths, shortcut limits and manual/overnight fallback. The end-to-end manager walkthrough is documented, but its runtime acceptance is blocked.

## Verification

- Focused roster tests — **29 passed, 0 failed**:
  `node --experimental-strip-types --test tests/roster-timetable.test.mjs tests/roster-view.test.mjs tests/roster-overlap-conflicts.test.mjs tests/roster-quick-changes.test.mjs tests/roster-review.test.mjs tests/roster-planning.test.mjs tests/roster-groups.test.mjs tests/roster-copy.test.mjs`
- ESLint on changed TypeScript and test files — passed.
- `npx tsc --noEmit` — passed.
- Authenticated Playwright manager walkthrough — **blocked before test execution**: the runner could not resolve Supabase CLI 2.122.0. The isolated `butterbox-citest` project was stopped (API `127.0.0.1:59421`, database port `59422`).
- `npm run build` — **blocked**: Next.js could not fetch the pre-existing Inter and Poppins Google Fonts from `fonts.googleapis.com`.
- Secret scan — no secrets detected in changed files.
- CodeQL JavaScript review — zero alerts.
- PR #242 Verify run [43316628345](https://github.com/farbotkol/butterbox/actions/runs/43316628345): the `verify` job failed because the PR body did not contain `Refs #241` and the matching canonical issue marker. The `database` job remained in progress; its database and tenant-isolation steps passed, while browser authentication was still running.
- Managed-file guard — passed.

## Limitations and blockers

- This is not the complete requested redesign: no resize handles were added; create shortcuts offer only 00:00, 06:00, 12:00 and 18:00; direct moves still use the existing preview/confirm workflow.
- Mobile/day view, tablet layout, keyboard focus, touch input, concurrent edits and large-roster rendering need runtime browser verification.
- Browser acceptance is blocked on the test runner's pinned Supabase CLI; the production build is blocked on external font fetches.
- The PR description needs `Refs #241` and canonical issue/evidence markers. It also still contains `Fixes #241` despite this partial delivery; that auto-close keyword must be removed before merge. The available GitHub MCP tools expose PR reading but not PR-body editing.
- Issue #241 remains open for owner acceptance; Verify/Database and review gates are not confirmed passing.
