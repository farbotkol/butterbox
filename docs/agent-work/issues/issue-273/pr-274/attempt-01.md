# Issue #273 / PR #274 / attempt 01

## Status
- **Observed:** 2026-11-16 19:48 UTC.
- **Phase:** Blocked pending sequencing with issue #86; repaired the issue-evidence criterion parser and documented the Verify failures.
- **Issue / PR:** [#273](https://github.com/farbotkol/butterbox/issues/273) / [#274](https://github.com/farbotkol/butterbox/pull/274), targeting `copilot/Development`.
- **Commit tested by the latest failed run:** `733babe082627cf64826e388c32307ecccf0dfa6`.

## Scope and finding
This attempt adds the required attempt-specific evidence pair and fixes the evidence parser so plain bullets under an `Acceptance criteria` heading are counted alongside checkboxes. A regression test covers mixed plain and checked bullets. No demo-data loading or application behavior is implemented.

The first failed [Verify run #43942058489](https://github.com/farbotkol/butterbox/actions/runs/43942058489) found the evidence pair missing. After adding it, [Verify run #43943053945](https://github.com/farbotkol/butterbox/actions/runs/43943053945) found that the canonical issue uses five plain bullets under `Acceptance criteria`, while the parser only recognized checkboxes under that heading. The parser fix and regression test are locally verified; a new GitHub run is needed to verify the fix.

Issue #273 overlaps the active demo-data work in [issue #86](https://github.com/farbotkol/butterbox/issues/86). No feature work or acceptance criteria can be claimed until sequencing is resolved. PR #274 remains a draft.

## Acceptance evidence
| Criterion | Evidence and result | Status |
| --- | --- | --- |
| Authorized development owner can choose sample team during new onboarding and can later load fictional demo data into an existing development workspace. | No feature implementation was made; sequencing with issue #86 remains unresolved. | Blocked |
| Same controls remain inoperative for production, unidentified or shared customer databases, including via direct API invocation. | No implementation or authorization tests were made in this attempt. | Blocked |
| Seed/reseed preserves real data and tenant boundaries; fictional provenance and counts are visible; repeats produce no duplicates. | No implementation or data-safety tests were made in this attempt. | Blocked |
| No outbound invitations, messages or payroll execution, including Xero, are triggered by demo records. | No demo-data workflow was implemented or tested. | Blocked |
| Targeted and required CI pass; the completed PR documents deployment verification and operator activation steps. | The cited Verify run failed before tests/lint/build; the database job was cancelled during browser setup. Required checks are not complete, and deployment documentation was not implemented. | Blocked |

## Tests and checks
- `node --test tests/agent-evidence.test.mjs` — passed, 11/11 tests; includes the plain-bullet acceptance regression.
- `npm run lint -- tools/agent-evidence/evidence.mjs tests/agent-evidence.test.mjs` — not run successfully yet; ESLint is not installed in the initial sandbox.
- [Verify #43942058489](https://github.com/farbotkol/butterbox/actions/runs/43942058489): failed because the attempt-specific evidence pair was absent; subsequent test, lint, and build steps were skipped.
- [Verify #43943053945](https://github.com/farbotkol/butterbox/actions/runs/43943053945): failed because the parser found zero canonical criteria in the plain-bullet checklist; subsequent test, lint, and build steps were skipped.
- Database job in run #43942058489: the database tests and tenant-isolation step passed, then the job was cancelled during browser installation. This is not a complete database check.

## Blockers and limitations
- Resolve sequencing between issues #273 and #86 before implementing the overlapping demo-data workflow.
- Required Verify and database checks have not both passed for this attempt.
- The parser fix has not yet been exercised in a GitHub Verify run.
- No feature behavior, permissions, isolation, external side effects, or deployment steps were tested.
- **Documentation: not applicable** — this attempt changes no user-facing feature or workflow.

## Next action
Resolve the issue #86 sequencing blocker. Keep PR #274 in draft until implementation and all applicable acceptance criteria and required checks are verified.
