# Issue #285 / PR #286 / attempt 01

## Scope and current state

This attempt updates the bounded cloud repair workflow, the Development merge-status check, and merged-evidence CI reconciliation. It preserves the legacy full `database` job and nightly regression. No database, production, external integration, deployment, branch-protection, or Mac-listener changes were made. PR #286 remains a draft and does not auto-close parent issue #282.

Dispatch is proven by GitHub Actions run [44673600630](https://github.com/farbotkol/butterbox/actions/runs/44673600630), whose `copilot` job is the active cloud Copilot session for PR #286. No second coding task was started.

## Diagnosis

- The initial Verify run [44673599685](https://github.com/farbotkol/butterbox/actions/runs/44673599685) failed at `check-pr-evidence.mjs`: the PR body lacked the attempt-specific evidence marker. It did **not** fail at `npm test`.
- The repair workflow run [44674502512](https://github.com/farbotkol/butterbox/actions/runs/44674502512) was skipped for that PR event; its guard now additionally requires the `verify` job's `Run npm test` step to fail. No repair or authentication success is inferred from this skipped run.
- GitHub's [Copilot CLI Actions documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli-in-actions) requires `copilot-requests: write` and supports Actions `GITHUB_TOKEN` without a stored token. Its [billing documentation](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/copilot-cli-in-github-actions) states that personal-repository usage is billed to the repository owner's Copilot seat. A real, non-destructive smoke test under the repair job's exact permissions remains pending.
- Historical PR #59 includes a `github-actions[bot]` repair commit [74406ff](https://github.com/farbotkol/butterbox/commit/74406ff7fb94b733fbeeaf391c3b0cc685eb0892), followed by successful dispatched Verify run [42532953727](https://github.com/farbotkol/butterbox/actions/runs/42532953727). That is prior evidence, not proof of the current smoke test.
- Historical PR #66's Verify run [42535866805](https://github.com/farbotkol/butterbox/actions/runs/42535866805) failed at the Node test step; the PR has no repair commit. This establishes that a failing test alone did not complete that earlier E2E.
- Live PR checks show `verify` and `database-smoke`; the separate full `database` job remains configured. Phase 2 and evidence reconciliation previously looked for `database`, so they could not reflect the current required smoke check. The mismatch is corrected without removing or skipping the legacy database or nightly checks.
- PR #286 is still a draft, authored by the repository owner, and does not currently qualify for auto-merge. The Phase 2 PR-event run is read-only; it does not mark drafts ready, bypass review/conversation requirements, or merge.

## Acceptance criteria

- [ ] **AC-1 — Blocked:** official docs support the tokenless path, but the exact-permission Actions authentication smoke has not yet run.
- [ ] **AC-2 — Blocked:** no controlled `npm test` assertion failure has yet reached the repair agent; the observed initial Verify failure was the evidence marker.
- [ ] **AC-3 — Partial:** Phase 2/evidence code now targets `verify` + `database-smoke`; current-head green Verify, auto-merge eligibility, and the final check mismatch are pending.
- [ ] **AC-4 — Blocked:** this PR records the run links, failure cause, and next actions; an issue-level checkpoint on #285 and parent #282 remains to be posted.
- [x] **AC-5 — Pass:** the active cloud session and single-task scope are verified; no second task, production effect, Mac dependency, or exposed secret was observed.

## Implementation and verification

- The repair guard accepts only a completed failed Verify run whose `verify` job failed specifically at `Run npm test`; it still verifies the exact current SHA, open same-repository PR, `copilot/Development` base, and `copilot/` head.
- The first repair attempt runs a no-tool authentication prompt with the repair job's exact token permissions; output and errors are suppressed, and only the expected fixed response is logged as success.
- Attempt count remains configurable to 1–5, defaults to 3, and counts `github-actions[bot]` repair commits. Attempts stop after 12 hours from PR creation with a `PARKED` warning and job summary. The global non-cancelling concurrency group and stale-HEAD/non-force ref updates remain in place.
- A repair commit dispatches both Verify and `database-smoke` on the repaired branch. Phase 2 checks these current statuses while native squash auto-merge and GitHub's review/conversation gates remain authoritative.
- Evidence reconciliation prefers `database-smoke`; legacy `database` evidence remains accepted only for historical runs without the smoke status.
- Focused Node tests and targeted ESLint passed on the implementation before the latest one-time smoke-step placement adjustment; rerun after evidence is committed. Workflow YAML parsed with `js-yaml`. Full `npm test` and production build were not run.
- Documentation: not applicable (backend-only workflow and evidence behavior; no user-facing workflow changed).

## Next actions and limitations

1. Commit the paired attempt evidence so PR-description reconciliation can add the required marker; verify the exact-head Verify and `database-smoke` checks.
2. Introduce one harmless assertion fault in an existing `tests/*.test.mjs` file and observe the authentication smoke, targeted repair, bot commit, and dispatched required checks.
3. Record exact final run IDs/SHAs and determine Phase 2 eligibility. Keep PR #286 draft and do not claim auto-merge or parent issue completion unless actual status evidence supports it.
4. Post the final run links, failure explanation, and next action on issues #285 and #282.

Live Development ruleset details were not available from the GitHub read surfaces used here. The owner/reviewer must verify any branch-specific approval and conversation-resolution settings; no protection changes are proposed.
