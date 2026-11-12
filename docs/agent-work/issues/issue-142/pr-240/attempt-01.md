# Issue #142 · PR #240 · attempt 01

## Scope and status

Implemented component-aware issue dispatch reservations, active-run recovery,
actual-file and SQL-object overlap checking, a trusted pull-request/merge-group
coordination workflow, focused tests and operator documentation.

Recommendation: **partial**. The controller and checks are implemented, but
the required coordination check and merge queue are not enforced because
repository ruleset changes require owner approval. No production deployment,
repository settings change, live issue write or database migration was made.
The current PR remains draft and targets `copilot/Development`.

The PR body now has the canonical issue and evidence markers, but the available
PR tooling leaves an automatic `Fixes #142` suffix. Since AC-4 and AC-7 remain
blocked, the evidence guard must reject auto-closure. A fresh `verify` run is
required after adding this evidence pair; the last observed run failed before
the body markers were added.

## Acceptance evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| AC-1: Two disjoint issues can run concurrently without sharing work areas. | Pass | Reservations are component-scoped, and the bounded queue test verifies disjoint work can execute concurrently. |
| AC-2: Two overlapping issues cannot be dispatched concurrently even under racing requests. | Pass | Serialized reservation writes make a conflicting race lose; disjoint reservations still succeed. |
| AC-3: Existing active PR retains ownership and blocks conflicting new work until integrated or safely abandoned. | Pass | Lease recovery renews active-PR reservations and retains ownership on GitHub API failure. |
| AC-4: Direct/manual Copilot PRs cannot bypass required coordination at merge time. | Blocked | Trusted PR and merge-group check exists, but owner-approved required-check ruleset and merge-queue configuration are not enabled. |
| AC-5: Shared-file conflicting edits are rejected except for the approved single-writer path. | Pass | Coordination rejects changed-file/component overlaps; existing managed-file and single-writer evidence controls remain intact. |
| AC-6: Failed/expired agent run recovery cannot release a still-active PR. | Pass | Expired leases remain blocking until verified; crash recovery retains active-PR ownership. |
| AC-7: CI and merge queue handle competing updates without losing work or unsafe force pushes. | Blocked | Merge-group overlap checking is implemented, but owner-only ruleset/merge-queue setup is pending. No unsafe force-push path was added. |
| AC-8: Targeted tests cover concurrency, crashes, stale leases, overlaps, shared migrations and direct assignment bypass. | Pass | The focused coordination tests cover these cases; controller preflight tests cover active direct PRs and assignment/dependency checks. |
| AC-9: User-facing operation and recovery documented. | Pass | Controller README and GitHub Issues workflow document reservations, recovery, merge queue and owner-only ruleset setup. |

## Tests and audit

- `node --experimental-strip-types --test tests/component-coordination.test.mjs tests/agent-evidence.test.mjs` — **24 passed**.
- `node --test --test-name-pattern='pre-dispatch PR scan rejects|autonomous preflight requires' tools/agent-controller/listener.test.mjs` — **2 passed**.
- Targeted ESLint on changed controller and coordination files — passed.
- Node syntax, workflow YAML, component JSON and `git diff --check` validation — passed.
- Full controller suite was not rerun: an earlier attempt encountered the sandbox's `safe.bareRepository=explicit` restriction and a platform-specific `mac_only_controller` test. Relevant focused tests passed.
- CI run [43197820354](https://github.com/farbotkol/butterbox/actions/runs/43197820354): `verify` failed at issue/evidence metadata validation because the body lacked canonical markers at that time. The `database` job was cancelled before database tests after the verify failure. The body markers were subsequently added; a new head check is required.
- Documentation: **updated** for controller operation and recovery; end-user guide **not applicable** because this change is developer/controller tooling only.

### Changed files

- `.github/workflows/pr-coordination.yml`
- `docs/agent-work/issues/issue-142/pr-240/attempt-01.evidence.json`
- `docs/agent-work/issues/issue-142/pr-240/attempt-01.md`
- `docs/github-issues-workflow.md`
- `tests/component-coordination.test.mjs`
- `tools/agent-controller/README.md`
- `tools/agent-controller/REQUIREMENTS.md`
- `tools/agent-controller/check-pr-coordination.mjs`
- `tools/agent-controller/component-coordination.mjs`
- `tools/agent-controller/components.json`
- `tools/agent-controller/config.example.json`
- `tools/agent-controller/listener.mjs`
- `tools/agent-controller/listener.test.mjs`

## Limitations and blockers

- Required branch-protection checks and merge queue remain owner configuration; the introducing workflow cannot run its trusted base-branch version until merged.
- The controller reservation store is private to the existing single listener instance, not a cross-host distributed lock. The account-wide listener lock prevents a second listener using the same state directory.
- The automatic `Fixes #142` suffix conflicts with partial evidence and must be removed through an authorized PR-body edit before `verify` can pass; the available PR tools cannot remove it.
- The issue remains open; this partial delivery does not establish production readiness or authorize unattended dispatch.
