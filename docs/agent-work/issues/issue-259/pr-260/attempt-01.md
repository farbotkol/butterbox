# Issue #259 / PR #260 / attempt 01

## Scope and baseline
- Reproduced the four cited locations on the current `copilot/Development` source baseline, commit `1b2ca5cae5b18de8e1685118d92578fb8a9247d9`. The PR head has no changed files relative to that baseline; GitHub tested merge commit `14dac849f3c8411412b7242b48e6198da3463f37`.
- The prior accessible-name correction is present in `src/components/roster-timeline.tsx`: visible text `Add at {slot.start}` is contained in the link's accessible name `Add at {slot.start}, add a shift on {date}`. The existing timetable test checks the full accessible name and keyboard activation.
- No accessibility defect reproduced; no source or test change was made.

## Reproduction and change-aware validation
- Required database job in run 43560856737 passed pgTAP, authenticated tenant-isolation, and the full browser suite: 108 passed, 0 failed, 0 flaky, 1 skipped.
- The relevant current browser tests all passed: roster timetable (line 2001; cited around 2062), venue planning weeks (line 4761; cited around 4876), staff invitations (line 11563; cited around 11639), and core WCAG/keyboard checks (line 11692; cited around 11759).
- Advisory run 43560856698 selected `mode: full` because the PR had zero changed files. Its selected baseline grep was nonempty: `verified signup|tenant|roster timetable|offline attendance|payroll|permissions UX`. The focused step was skipped; the conservative full-suite fallback ran and passed 108 browser tests in 14.1 minutes (14m58s for the fallback step).
- Existing selector tests passed: `node --test tests/change-aware-selection.test.mjs` — 5 passed in 415 ms.
- A local focused attempt reset only the disposable `butterbox-citest` project (API 59421, database 59422), then stopped before Playwright because the build could not fetch Google Fonts. No local browser result is claimed; the isolated GitHub runs above provide the reproduction result. Local artifacts are not committed.

## Gates and disposition
- No workflow, verification, database, or tenant-isolation configuration changed. The required `database` job passed. `verify` failed before its test/build steps because PR #260 lacks the required canonical issue/evidence markers.
- PR #260 is an automatically created draft with no product diff; its body also contains an auto-close reference. Do not merge it. Owner/reviewer action is required to correct the PR reference/evidence contract or close the no-change draft.
- No change to user-visible behavior: **Documentation: not applicable (no product behavior change).**
- Human review remains pending; no merge or deployment was requested or performed.

## Future roster test opportunity
- Expand the timeline slot regression from its representative slot to all empty add-slot links across a full week at desktop and mobile widths. Assert each accessible name contains its visible `Add at HH:MM` text and the venue-local date, then run the existing axe assertion on those views. This is a coverage gap, not a reproduced defect.

## Acceptance criteria
- [x] Reproduction outcome recorded on current development baseline
- [x] Genuine accessibility defect fixed with regression coverage, if still present
- [x] New change-aware selector coverage and timings reported if PR exists
- [x] Required verification, database and tenant-isolation protections unchanged
- [ ] Human review before merge
