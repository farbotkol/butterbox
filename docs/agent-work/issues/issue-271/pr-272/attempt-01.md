# Issue #271 / PR #272 / attempt 01

## Status
- **Observed:** 2026-11-16 09:27:38 UTC.
- **Phase:** Implementation and focused tests complete; required CI and PR readiness remain blocked.
- **Issue / PR:** [#271](https://github.com/farbotkol/butterbox/issues/271) / [#272](https://github.com/farbotkol/butterbox/pull/272), targeting `copilot/Development`.
- **Implementation commit:** `5a680ffd9f852e713e2981a8e53449b365b0be5e`; pushed through the progress tool.

## Scope and implementation
- PR-vs-PR blocking now uses exact changed paths and concrete database ownership. Broad component overlaps are emitted as advisory output.
- Evidence paths under `issue-N/pr-M/` map to PR-specific ownership. Invalid peer component metadata is advisory unless it declares database ownership; invalid file paths and candidate metadata remain fail-closed.
- Empty non-draft candidates remain invalid; unrelated empty non-draft PRs are reported as advisory. Shared test paths recommend combined validation where safe.
- Added actionable conflict/advisory messages and recovery guidance in `tools/agent-controller/README.md` and `docs/github-issues-workflow.md`.
- Updated the evidence parser to recognize Issue #271's canonical `Tests / acceptance criteria` plain-bullet section, retaining exact text and count validation.
- The workflow and required gates were not changed. `pull_request_target` still checks out trusted Development policy; merge-group selection still compares against the queued head SHA.

## Acceptance evidence
| Criterion | Evidence and result | Status |
| --- | --- | --- |
| Two PRs changing distinct UI files within the same application area can both pass coordination. | `tests/component-coordination.test.mjs`: same `application:settings`, distinct paths produce an advisory and no hard conflict. | Pass |
| Two PRs changing distinct tests in the same suite can both pass coordination. | Same `test:auth`, distinct paths produce an advisory and no hard conflict. | Pass |
| Two PRs with distinct evidence paths for the same parent issue can both pass coordination. | `issue-91/pr-271` and `issue-91/pr-269` paths map separately and do not conflict. | Pass |
| Empty draft PR remains non-blocking; malformed own PR fails; empty non-draft PR remains invalid. | Empty draft is non-blocking; invalid own component metadata and own empty non-draft PR fail. Malformed unrelated metadata is classified; malformed database ownership remains fail-closed. | Pass |
| Same changed file and same SQL object still trigger concrete hard conflicts; unreadable migrations fail safely. | Exact shared path and shared SQL object cases remain hard conflicts; invalid file paths and database-ownership metadata fail closed. No end-to-end unreadable GitHub migration-blob failure was induced locally; the trusted checker rejects unreadable blobs. | Blocked |
| Fresh PR metadata and SHA are used; stale historical PR base SHA cannot reintroduce the old policy. | `tests/pr-coordination-trusted-checkout.test.mjs` covers fresh PR metadata, current trusted Development checkout, and comparison against `merge_group.head_sha`. | Pass |
| Tests reproduce past false-conflict patterns from #251, #264 and #267 plus positive true-conflict cases. | Focused tests cover `.spec.mjs` ownership, empty drafts, oversized Xero SQL ownership, category-only overlaps, exact paths, shared SQL objects, and trusted checkout/queued SHA behavior. | Pass |
| Demonstrate two independent Copilot PRs passing coordination concurrently, then pass real required checks; report results with links. | PR #269 [coordination #43827156334](https://github.com/farbotkol/butterbox/actions/runs/43827156334) and PR #272 [coordination #43828143232](https://github.com/farbotkol/butterbox/actions/runs/43828143232) passed while both were open, but used the still-trusted base policy. On head `6d1544c`, [Verify #43828505266](https://github.com/farbotkol/butterbox/actions/runs/43828505266) failed issue evidence parsing and [database #43828505266](https://github.com/farbotkol/butterbox/actions/runs/43828505266) failed disposable Supabase startup before tests. Updated-policy and required-check acceptance are not established. | Blocked |
| No automatic merge or production deploy in this issue. Submit a small reviewed PR against `copilot/Development`. | No merge or production deploy occurred; PR #272 is still a draft and has not been reviewed. | Blocked |

## Tests and checks
- `node --test tests/component-coordination.test.mjs tests/pr-coordination-trusted-checkout.test.mjs` — **23/23 passed**.
- `node --test tests/agent-evidence.test.mjs` — **11/11 passed**, including the canonical Issue #271 plain-bullet acceptance format.
- `node --test tests/agent-evidence.test.mjs tests/component-coordination.test.mjs tests/pr-coordination-trusted-checkout.test.mjs` — **34/34 passed**.
- `npm run lint -- tools/agent-evidence/evidence.mjs tests/agent-evidence.test.mjs` — passed.
- `npm run lint -- tools/agent-controller/component-coordination.mjs tools/agent-controller/check-pr-coordination.mjs tests/component-coordination.test.mjs tests/pr-coordination-trusted-checkout.test.mjs` — passed.
- `node --check` on both changed controller modules and `git diff --check` — passed.
- CodeQL was requested after the implementation commit; the tool reported that no analyzable code changes were detected and performed no analysis.
- GitHub PR coordination checks passed for #269 and #272 against the still-trusted base policy. On head `6d1544c`, the latest `verify` run validated all 16 delivery files but failed because the evidence criteria count did not match the canonical Issue #271 checklist. The latest `database` job failed at disposable Supabase startup; no database, tenant-isolation, or browser tests executed.

## Blockers and limitations
- PR #272 remains a draft and its body contains the generated `Fixes #271` suffix; that auto-close keyword must be removed because this is still partial work. The available browser session is unauthenticated, so I cannot edit the PR description.
- The database job suppressed its startup diagnostic into a runner-temporary file that was not uploaded, so the exact startup cause is unavailable. The job failed before tests ran.
- No merge-group event or updated trusted-policy run after this PR merges was observed. Required `verify` and `database` checks have not both passed.
- No automatic merge, production deployment, or live database operation was performed.
- **Documentation: updated** in the controller README and GitHub issue workflow guide. **User Guide: not applicable** — this is development tooling and does not change a user-facing workflow.

## Next action
Owner/reviewer must correct the PR description and resolve the evidence-checker format mismatch, then rerun the required checks and validate the changed policy on a current trusted Development/merge-group run. Keep the issue open and PR draft until those gates and the concurrent-check acceptance are verified.
