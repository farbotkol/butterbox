# Issue #285 / PR #286 / attempt 01

## Scope and current state

This attempt updates the bounded cloud repair workflow, the Development merge-status check, and merged-evidence CI reconciliation. It preserves the legacy full `database` job and nightly regression. No database, production, external integration, deployment, branch-protection, or Mac-listener changes were made. PR #286 remains a draft and does not auto-close parent issue #282.

Dispatch is proven by GitHub Actions run [44673600630](https://github.com/farbotkol/butterbox/actions/runs/44673600630), whose `copilot` job is the active cloud Copilot session for PR #286. No second coding task was started.

## Diagnosis

- The initial Verify run [44673599685](https://github.com/farbotkol/butterbox/actions/runs/44673599685) failed at `check-pr-evidence.mjs`: the PR body lacked the attempt-specific evidence marker. It did **not** fail at `npm test`.
- The repair workflow run [44674502512](https://github.com/farbotkol/butterbox/actions/runs/44674502512) was skipped for that PR event; its guard now additionally requires the `verify` job's `Run npm test` step to fail. No repair or authentication success is inferred from this skipped run.
- Current-head reconciliation [44676874189](https://github.com/farbotkol/butterbox/actions/runs/44676874189) succeeded and inserted the attempt-specific PR-body marker. Earlier reconciliation [44673598880](https://github.com/farbotkol/butterbox/actions/runs/44673598880) failed closed after its 40-minute Verify wait with a sanitized `GitHub/API error`; the raw API details were not logged.
- Verify run [44676878214](https://github.com/farbotkol/butterbox/actions/runs/44676878214), attempt 2 on head `2205b3cbc7d684db404a71e021102bb6767051f6`, failed at the evidence check because JSON criterion 4 used `farbotkol/butterbox#282` instead of the canonical issue wording `parent #282`. `npm test` was skipped, so the repair workflow and exact-permission authentication smoke did not run.
- Current `database-smoke` run [44676878276](https://github.com/farbotkol/butterbox/actions/runs/44676878276) passed. The same Verify run's legacy `database` job remained in progress when checked; it remains configured and was not disabled.
- GitHub's [Copilot CLI Actions documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli-in-actions) requires `copilot-requests: write` and supports Actions `GITHUB_TOKEN` without a stored token. Its [billing documentation](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/copilot-cli-in-github-actions) states that personal-repository usage is billed to the repository owner's Copilot seat. A real, non-destructive smoke test under the repair job's exact permissions remains pending.
- Historical PR #59 includes a `github-actions[bot]` repair commit [74406ff](https://github.com/farbotkol/butterbox/commit/74406ff7fb94b733fbeeaf391c3b0cc685eb0892), followed by successful dispatched Verify run [42532953727](https://github.com/farbotkol/butterbox/actions/runs/42532953727). That is prior evidence, not proof of the current smoke test.
- Historical PR #66's Verify run [42535866805](https://github.com/farbotkol/butterbox/actions/runs/42535866805) failed at the Node test step; the PR has no repair commit. This establishes that a failing test alone did not complete that earlier E2E.
- Live PR checks show `verify` and `database-smoke`; the separate full `database` job remains configured. Phase 2 and evidence reconciliation previously looked for `database`, so they could not reflect the current required smoke check. The mismatch is corrected without removing or skipping the legacy database or nightly checks.
- PR #286 is still a draft and owner-authored. Phase 2 run [44676878223](https://github.com/farbotkol/butterbox/actions/runs/44676878223) passed its policy tests but skipped `merge-ready-development`; evaluating the current PR metadata yields `pull request author must be the Copilot account` (the PR is also draft). The workflow does not mark drafts ready, bypass review/conversation requirements, or merge.

## Acceptance criteria

- [ ] **AC-1 — Blocked:** official docs support the tokenless path, but the exact-permission Actions authentication smoke has not yet run.
- [ ] **AC-2 — Blocked:** no controlled `npm test` assertion failure has yet reached the repair agent; Verify attempt 2 failed at the canonical evidence-text check.
- [ ] **AC-3 — Partial:** `database-smoke` passed, but current-head `verify` failed at the evidence criterion check before tests. Phase 2 skipped auto-merge for the owner-authored draft. The `database` job remains an additional configured check; branch-protection settings were not changed or bypassed.
- [ ] **AC-4 — Blocked:** this PR records the run links, failure cause, and next actions; an issue-level checkpoint on #285 and parent #282 remains to be posted.
- [x] **AC-5 — Pass:** the active cloud session and single-task scope are verified; no second task, production effect, Mac dependency, or exposed secret was observed.

## Implementation and verification

- The repair guard accepts only a completed failed Verify run whose `verify` job failed specifically at `Run npm test`; it still verifies the exact current SHA, open same-repository PR, `copilot/Development` base, and `copilot/` head.
- The first repair attempt runs a no-tool authentication prompt with the repair job's exact token permissions; output and errors are suppressed, and only the expected fixed response is logged as success.
- Attempt count remains configurable to 1–5, defaults to 3, and counts `github-actions[bot]` repair commits. Attempts stop after 12 hours from PR creation with a `PARKED` warning and job summary. The global non-cancelling concurrency group and stale-HEAD/non-force ref updates remain in place.
- A repair commit dispatches both Verify and `database-smoke` on the repaired branch. Phase 2 checks these current statuses while native squash auto-merge and GitHub's review/conversation gates remain authoritative.
- Evidence reconciliation prefers `database-smoke`; legacy `database` evidence remains accepted only for historical runs without the smoke status.
- Focused Node tests, targeted ESLint, workflow YAML parsing, evidence validation, `git diff --check`, and secret scanning passed. CodeQL reported no Actions alerts. Full `npm test` and production build were not run; current CI did not reach `npm test`.
- Documentation: not applicable (backend-only workflow and evidence behavior; no user-facing workflow changed).

## Next actions and limitations

1. Change JSON criterion 4 to the exact canonical text ending `parent #282`, validate the paired evidence, and rerun current-head Verify.
2. Only after the evidence guard passes, run the exact-permission authentication smoke and introduce one harmless assertion fault in an existing `tests/*.test.mjs` file; observe targeted repair, a bot commit, and dispatched required checks or record the exact blocker.
3. Record final run IDs/SHAs and eligibility. Keep PR #286 draft and do not claim auto-merge or parent issue completion unless actual status evidence supports it.
4. Post the final run links, failure explanation, and next action on issues #285 and #282. The available browser session is signed out and the available GitHub write tools do not create issue comments, so these issue checkpoints have not been posted.

Live Development ruleset details were not available from the GitHub read surfaces used here. The owner/reviewer must verify any branch-specific approval and conversation-resolution settings; no protection changes are proposed.
