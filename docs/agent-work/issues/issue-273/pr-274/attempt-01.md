# Issue #273 / PR #274 / attempt 01

## Status
- **Observed:** 2026-11-16 19:44 UTC.
- **Phase:** Blocked pending sequencing with issue #86; this attempt documents the Verify failure only.
- **Issue / PR:** [#273](https://github.com/farbotkol/butterbox/issues/273) / [#274](https://github.com/farbotkol/butterbox/pull/274), targeting `copilot/Development`.
- **Commit tested by the failed run:** `955a33901e97a93edae1d2e280d30b93c45877ff`.

## Scope and finding
This attempt adds only the required attempt-specific evidence pair. It does not implement demo-data loading or change application behavior. The failed [Verify run #43942058489](https://github.com/farbotkol/butterbox/actions/runs/43942058489) validated the repository's existing evidence, then failed because PR #274's referenced JSON evidence and paired Markdown file were absent. The subsequent PR-specific checks, tests, lint, and build were skipped.

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
- `node tools/agent-evidence/validate-all.mjs` — to be run locally against the evidence pair.
- `node --test tests/agent-evidence.test.mjs` — to be run as the focused evidence regression.
- [Verify #43942058489](https://github.com/farbotkol/butterbox/actions/runs/43942058489): failed in “Validate this PR's issue evidence and references” with `PR must add both its JSON evidence and paired Markdown file`. Its subsequent test, lint, and build steps were skipped.
- Database job in run #43942058489: the database tests and tenant-isolation step passed, then the job was cancelled during browser installation. This is not a complete database check.

## Blockers and limitations
- Resolve sequencing between issues #273 and #86 before implementing the overlapping demo-data workflow.
- Required Verify and database checks have not both passed for this attempt.
- No feature behavior, permissions, isolation, external side effects, or deployment steps were tested.
- **Documentation: not applicable** — this attempt changes no user-facing feature or workflow.

## Next action
Resolve the issue #86 sequencing blocker. Keep PR #274 in draft until implementation and all applicable acceptance criteria and required checks are verified.
