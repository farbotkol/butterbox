# Issue #271 / PR #272 / attempt 01

## Status
- **Observed:** 2026-11-16 08:02:03 UTC.
- **Phase:** Implementation and focused tests complete; required CI and canonical PR evidence are blocked.
- **Issue / PR:** [#271](https://github.com/farbotkol/butterbox/issues/271) / [#272](https://github.com/farbotkol/butterbox/pull/272), targeting `copilot/Development`.
- **Implementation commit:** `5a680ffd9f852e713e2981a8e53449b365b0be5e`; pushed through the progress tool.

## Scope and implementation
- PR-vs-PR blocking now uses exact changed paths and concrete database ownership. Broad component overlaps are emitted as advisory output.
- Evidence paths under `issue-N/pr-M/` map to PR-specific ownership. Invalid peer component metadata is advisory unless it declares database ownership; invalid file paths and candidate metadata remain fail-closed.
- Empty non-draft candidates remain invalid; unrelated empty non-draft PRs are reported as advisory. Shared test paths recommend combined validation where safe.
- Added actionable conflict/advisory messages and recovery guidance in `tools/agent-controller/README.md` and `docs/github-issues-workflow.md`.
- The workflow and required gates were not changed. `pull_request_target` still checks out trusted Development policy; merge-group selection still compares against the queued head SHA.

## Acceptance evidence
| Criterion | Evidence and result | Status |
| --- | --- | --- |
| Distinct UI files in the same application area coordinate concurrently | `tests/component-coordination.test.mjs`: same `application:settings`, distinct paths produce an advisory and no hard conflict. | Pass |
| Distinct tests in the same suite coordinate concurrently | Same `test:auth`, distinct paths produce an advisory and no hard conflict. | Pass |
| Evidence for the same issue is independent per PR | `issue-91/pr-271` and `issue-91/pr-269` paths map separately and do not conflict. | Pass |
| Empty draft, malformed own PR, and empty non-draft behavior | Empty draft is non-blocking; invalid own component metadata and own empty non-draft PR fail. Malformed unrelated metadata is classified; malformed database ownership remains fail-closed. | Pass |
| Shared file/SQL object and unreadable migration safety | Exact shared path and shared SQL object cases remain hard conflicts; invalid file paths and database-ownership metadata fail closed. No end-to-end unreadable GitHub migration-blob failure was induced locally; the existing trusted checker rejects unreadable blobs. | Blocked |
| Fresh PR metadata and current/queued SHA behavior | `tests/pr-coordination-trusted-checkout.test.mjs` covers fresh PR metadata, current trusted Development checkout, and comparison against `merge_group.head_sha`. | Pass |
| Historical false-conflict patterns and true conflicts | Focused tests cover `.spec.mjs` ownership, empty drafts, oversized Xero SQL ownership, category-only overlaps, exact paths, and shared SQL objects. | Pass |
| Two independent PRs plus successful real required checks | PR #269 coordination run [#43827156334](https://github.com/farbotkol/butterbox/actions/runs/43827156334) and PR #272 run [#43827691424](https://github.com/farbotkol/butterbox/actions/runs/43827691424) both passed while both PRs were open. These checks used the still-trusted base policy, not the unmerged policy change. PR #272 `verify` [#43827695017](https://github.com/farbotkol/butterbox/actions/runs/43827695017) failed at the PR-reference contract; its database job remained in progress at the recorded time. PR #269's verify also failed its evidence validation and its database job remained in progress. Therefore real required-check acceptance is not established. | Blocked |

## Tests and checks
- `node --test tests/component-coordination.test.mjs tests/pr-coordination-trusted-checkout.test.mjs` — **23/23 passed**.
- `npm run lint -- tools/agent-controller/component-coordination.mjs tools/agent-controller/check-pr-coordination.mjs tests/component-coordination.test.mjs tests/pr-coordination-trusted-checkout.test.mjs` — passed.
- `node --check` on both changed controller modules and `git diff --check` — passed.
- CodeQL was requested after the implementation commit; the tool reported that no analyzable code changes were detected and performed no analysis.
- GitHub PR coordination checks passed for #269 and #272. The PR #272 `verify` workflow failed because its generated body lacks `Refs #271` and the matching issue marker. The database job was still running when recorded.

## Blockers and limitations
- PR #272 remains a draft and its current body still contains the generated `Fixes #271` suffix, without the required `Refs #271`, `<!-- butterbox-issue: 271 -->`, and evidence marker lines. The available progress operation did not edit the PR body; no PR-body editing operation is available in this task. No merge or issue closure was performed.
- The canonical issue uses `## Tests / acceptance criteria` with plain bullets. The existing evidence checker parses a distinct `## Acceptance criteria` checklist format; this compatibility issue is not changed here because it would modify the existing required evidence gate.
- No merge-group event or updated trusted-policy run after this PR merges was observed. Required `verify` and `database` checks have not both passed.
- No automatic merge, production deployment, or live database operation was performed.
- **Documentation: updated** in the controller README and GitHub issue workflow guide. **User Guide: not applicable** — this is development tooling and does not change a user-facing workflow.

## Next action
Owner/reviewer must correct the PR description and resolve the evidence-checker format mismatch, then rerun the required checks and validate the changed policy on a current trusted Development/merge-group run. Keep the issue open and PR draft until those gates and the concurrent-check acceptance are verified.
