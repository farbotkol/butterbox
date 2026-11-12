# Issue #238 · PR #239 · attempt 01

## Scope and status

Completed the Issues-first evidence and reconciliation implementation for task
issue [#238](https://github.com/farbotkol/butterbox/issues/238) in
[PR #239](https://github.com/farbotkol/butterbox/pull/239). Code verification
ran against commit
[`841933c65022001dee988abc8479d65ead0d111d`](https://github.com/farbotkol/butterbox/commit/841933c65022001dee988abc8479d65ead0d111d).
The PR head will include this evidence pair; the reconciler records its final
head and merge SHA after merge.

Recommendation: **partial**. The implementation and focused verification are
complete, but rollout is blocked on the current draft PR #85 editing centrally
managed archive/status files and on repository-owner review of this PR's
canonical issue binding. The repository branch is protected; exact required
check rules are not exposed by the available read API. No production service,
database, or live GitHub issue write was exercised.

## Acceptance evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| AC-1: New evidence schema + validator + examples and tests. | Pass | Version 1 schema, strict validator, checksummed Markdown example; focused tests passed. |
| AC-2: Verified scoped-file CI enforcement protects shared archives/status files. | Pass | `Verify / verify` validates changed paths; trusted-base guard checks prior and renamed paths; owner-reviewed exception is covered by synthetic tests. |
| AC-3: Deterministic GitHub Issues-first post-merge single-writer reconciliation with missed-event recovery. | Pass | Scheduled protected-branch sweep confirms merge/CI/evidence, serializes writes, and recovers missed events; API behavior is exercised with synthetic fixtures. |
| AC-4: Full story not closed from a partial PR; merged/CI/accepted statuses distinguished. | Pass | Partial/documentation-only fixtures remain unaccepted; the writer never closes or reopens issues. |
| AC-5: Parallel merge, failure/retry, idempotency and tampering fixtures pass. | Pass | `node --test tests/agent-evidence.test.mjs`: 11 passed, 0 failed. |
| AC-6: Confirm actual `verify` and `database` gates; never weaken branch protection. | Pass | `.github/workflows/ci.yml` retains both jobs; merged PR #141 run [43144295088](https://github.com/farbotkol/butterbox/actions/runs/43144295088) passed `verify` and `database`; GitHub reports `copilot/Development` protected. No protection settings were changed. |
| AC-7: PR targets `copilot/Development` and reports changed files, exact tests and remaining blockers. | Pass | PR #239 targets `copilot/Development`; its checklist will list the exact changed files, test commands and pending owner/PR sequencing blockers. |

The exact required-check ruleset was not readable through the available
repository API; administrators should verify the required check names before
relying on the new standalone guard. Existing application/database workflows
were not broadened or weakened.

## Tests and audit

- `node --test tests/agent-evidence.test.mjs` — **11 passed**.
- `npm run lint -- tools/agent-evidence/evidence.mjs tools/agent-evidence/reconcile.mjs tools/agent-evidence/validate-all.mjs tools/agent-evidence/check-managed-files.mjs tools/agent-evidence/check-pr-evidence.mjs tests/agent-evidence.test.mjs` — passed.
- `node tools/agent-evidence/validate-all.mjs` — validated the synthetic example.
- Evidence CLI, Node syntax checks, workflow YAML parsing and `git diff --check` — passed.
- `Verify` run [43182536515](https://github.com/farbotkol/butterbox/actions/runs/43182536515) failed before this attempt pair and PR markers were added. Its metadata-check failure is recorded in JSON; a new run is required for the completed PR head. The current PR `verify`/`database` state is not asserted here.
- Documentation: **updated** for setup, permissions, rollback and recovery; end-user guide **not applicable** because this changes developer tooling only.
- Deferred: live comment-writing/API validation and full database job completion; no database code changed.

The reconciler requires an exact-head repository-owner review with
`Canonical issue approved: #238` before it comments on the canonical issue.
