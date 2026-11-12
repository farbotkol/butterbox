# Isolated delivery evidence and issue reconciliation

## Status and boundaries

This is repository code and policy; it does not configure branch protection,
enable agent dispatch, modify production systems or change any database. It is
the evidence and post-merge reconciliation slice for issue #75, separate from
issue #142's component reservations, dispatch queue and PR-overlap controls.
GitHub Issues remain the live work and acceptance record. The CSV/Markdown
backlog and shared status files remain historical references.

The `Verify / verify` job runs the evidence validator and managed-file guard.
The separate `Managed file guard / guard` check runs under `pull_request_target`
using code checked out from the trusted base SHA; it does not execute PR code and
has read-only permissions. `Verify / database` remains unchanged. Both guards protect
`BACKLOG_INDEX.csv`, `BUTTERBOX_PRODUCT_BACKLOG.md`,
`IMPLEMENTATION_PROGRESS.md` and `docs/agent-status/**`. A governance exception
requires the PR label `agent-evidence-governance-exception`, a `Managed-file
exception: #N` reference in the PR body, and an approval review by `farbotkol`
on the exact head SHA whose review text says `Managed-file exception approved:
#N`. CI logs the approved issue, head and file list. Re-run the failed `Verify`
check after adding the owner approval; changed commits invalidate the approval.

The post-merge workflow has only `contents: read`, `pull-requests: read`,
`checks: read` and `issues: write`. It listens for merges into
`copilot/Development`, uses a non-cancelling concurrency group, and scans closed
merged PRs every 30 minutes plus on manual dispatch. The scan is append-only and
idempotent by `(PR number, merge SHA)`. A failed run remains failed and appears
in Actions; a later scheduled/manual sweep retries unfinished work. It does
not push commits, edit archives, add labels or close/reopen issues.

## Evidence format and PR markers

Each issue/PR/attempt has paired, immutable files:

```text
docs/agent-work/issues/issue-N/pr-N/attempt-NN.md
docs/agent-work/issues/issue-N/pr-N/attempt-NN.evidence.json
```

`tools/agent-evidence/evidence.schema.json` is the versioned contract.
`tools/agent-evidence/evidence.mjs` validates version, IDs, SHA references,
changed-file lists, criterion statuses and links; rejects unknown fields,
secret-like values and personal email addresses; and pairs Markdown with JSON.
The validator has no third-party dependency:

```sh
node tools/agent-evidence/evidence.mjs --file docs/agent-work/issues/issue-N/pr-N/attempt-NN.evidence.json --repo farbotkol/butterbox
```

Every PR participating in reconciliation must include these exact HTML markers
in its body, substituting the canonical issue and attempt path:

```text
<!-- butterbox-issue: N -->
<!-- butterbox-evidence: docs/agent-work/issues/issue-N/pr-N/attempt-NN.evidence.json -->
```

The JSON stores attempt-level head SHA and may leave `mergeSha` null because that
SHA is not known before the merge. The reconciler obtains the merge SHA from
GitHub, verifies the evidence at that exact commit, confirms the PR file list
and check runs at the PR head, then records the merge SHA and gate results in an
append-only canonical issue comment. Evidence is not edited after merge.

Status distinctions in each comment are: merge confirmed; `verify` and
`database` pass/fail/missing; evidence valid/missing/invalid; criterion-level
claims; and full-story acceptance pending human review. CI evidence is derived
from GitHub check runs, not trusted from the JSON. Documentation-only, partial,
failed or incomplete evidence cannot report full acceptance. The writer never
closes or reopens issues; avoid auto-close keywords unless a human has verified
all issue acceptance criteria.

## Recovery and rollback

1. If the `Reconcile merged issue evidence` workflow fails, inspect the run
   logs, correct the underlying workflow/evidence/API issue, then use
   **Re-run jobs** or `workflow_dispatch`. Reconciliation for one PR cannot
   cancel an in-progress run. A retry checks the issue comment marker before
   writing, so a comment already created before a later failure is not duplicated.
2. The scheduled scan revisits merged PRs and recovers missing or failed webhook
   deliveries. It revalidates merge target, evidence, file list, actual check
   runs and existing audit markers each time. It does not interpret agent claims
   or PR titles as acceptance.
3. To roll back, revert the workflow/code in an ordinary reviewed PR. Existing
   issue comments remain immutable audit history; do not delete or rewrite them.
   The workflow never writes shared archives or performs other remote mutations.
4.    Repository administrators must require `Managed file guard / guard` in
   branch-protection/rulesets for managed-file enforcement to be a merge barrier.
   This implementation cannot inspect or change branch-protection/ruleset settings
   and makes no claim that the setting is currently required. It does not weaken
   existing `verify` or `database` jobs.

## Verification evidence

The current `.github/workflows/ci.yml` defines required job names `verify` and
`database`. The most recent completed successful Verify run on merged governance
PR #141 reported both jobs successful (run
[43144295088](https://github.com/farbotkol/butterbox/actions/runs/43144295088)).
The failure inspected during this task was unrelated PR #85: its database job
timed out in a browser test for offline-claim reconciliation; it is not changed
or claimed fixed here. Local results for this implementation are recorded in
the pull request after focused checks run.
