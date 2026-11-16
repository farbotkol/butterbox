# Isolated delivery evidence and issue reconciliation

## Status and boundaries

This is repository code and policy; until merged it is not operational and it
does not configure branch protection, enable agent dispatch, modify production
systems or change any database. It is the evidence and post-merge reconciliation slice for issue #75, separate from
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
`checks: read` and `issues: write`. It does not execute a PR-close workflow with
a write-capable token. Its scheduled writer checks out the repository's
protected default branch, `copilot/Development`. Manual recovery reruns a failed
scheduled workflow rather than dispatching a workflow definition from an
arbitrary branch. It uses a non-cancelling concurrency group and scans closed
merged PRs every 30 minutes. The scan is append-only and
idempotent by `(PR number, merge SHA)`. A failed run remains failed and appears
in Actions; a later scheduled/manual sweep retries unfinished work. It does
not push commits, edit archives, add labels or close/reopen issues. A merge is
picked up within 30 minutes; missed event deliveries require no special repair
because the writer reconciles merged PRs from GitHub state on every sweep.

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
Criterion descriptions must match the canonical issue's acceptance checklist
one-for-one; omitted or substituted criteria prevent a complete recommendation.
The validator has no third-party dependency:

```sh
node tools/agent-evidence/evidence.mjs --file docs/agent-work/issues/issue-N/pr-N/attempt-NN.evidence.json --repo farbotkol/butterbox
```

Every PR participating in reconciliation must visibly reference its canonical
issue with `Refs #N` and include these exact HTML markers in its body,
substituting the canonical issue and attempt path. The `Verify / verify` job
checks the visible reference, both attempt files, JSON schema/checksum, and the
exact changed-file list. Agent PRs use reference-only issue links, never
auto-close keywords for partial or documentation-only delivery. CI allows
auto-close only when evidence matches every canonical issue criterion, all pass,
there are no blockers, the PR changes code, and the repository owner approves
the canonical issue association on the exact head; re-run Verify after that
review. Issue closure remains subject to human review. Before writing, it additionally requires an approval by
the repository owner on the exact PR head containing
`Canonical issue approved: #N`, then verifies GitHub's issue timeline
cross-reference. A PR-controlled marker alone cannot redirect comments to an
unrelated issue.

```text
<!-- butterbox-issue: N -->
<!-- butterbox-evidence: docs/agent-work/issues/issue-N/pr-N/attempt-NN.evidence.json -->
```

The JSON stores attempt-level head SHA and may leave `mergeSha` null because that
SHA is not known before the merge. `run.commitSha` identifies the commit tested
by the attempt; the post-merge issue comment records the verified PR head and
merge SHA. The reconciler obtains the merge SHA from GitHub, verifies the
evidence at that exact commit, confirms the PR file list and check runs at the
PR head, then records the merge SHA and gate results in an append-only canonical
issue comment. Evidence is not edited after merge. Compute `markdownSha256` over
the exact UTF-8 bytes of the paired Markdown file before validating.

Status distinctions in each comment are: merge confirmed; `verify` and
`database` pass/fail/missing; evidence valid/missing/invalid; criterion-level
claims; and full-story acceptance pending human review. CI evidence is derived
from GitHub check runs, not trusted from the JSON. Documentation-only, partial,
failed or incomplete evidence cannot report full acceptance. The writer never
closes or reopens issues; avoid auto-close keywords unless a human has verified
all issue acceptance criteria.

## Pre-Verify Copilot PR-description reconciliation

`.github/workflows/reconcile-pr-descriptions.yml` uses `pull_request_target`
on `opened`, `edited`, `synchronize` and `reopened` for PRs targeting
`copilot/Development`. It checks out only the trusted Development branch and
grants only `pull-requests: write` plus read access to issues and contents. The
runtime mutates only open PRs authored by the repository owner, from a
same-repository `copilot/` branch, with a verified GitHub cross-reference to
one open canonical issue. Empty drafts, multiple or malformed issue links,
closed PRs/issues, forks, and other contributors are left untouched.

For an eligible linked PR, the reconciler restores a missing `Refs #N` or
canonical issue marker, and restores the evidence marker only when exactly one
matching JSON/Markdown pair is in the PR's changed files. It removes only a
matching standalone auto-close phrase for that issue; a trailing generated
footer is removed, while a copied/quoted issue line is changed to a reference.
A complete, schema-valid evidence set with every issue criterion passing and an
owner approval on the exact head may retain those phrases; the writer itself
never closes or reopens issues. Missing or invalid evidence remains subject to
the unchanged `check-pr-evidence.mjs` gate.

Every correction is logged by PR and issue number in Actions without logging
body content. Updates occur only when text changes and are serialized per PR.
A hidden per-head marker allows at most two body repairs for the same head;
further reintroductions are logged and left for manual resolution rather than
forming an edited-event loop.
Before a PATCH, the workflow re-reads the PR and skips if its body, timestamp,
head, or eligibility changed, protecting detectable concurrent edits. GitHub's
PR update API does not provide an atomic compare-and-swap for the body, so a
change in the narrow interval between this re-read and PATCH cannot be ruled
out; the workflow preserves the latest fetched text and reports API failures
without writing. A successful body PATCH emits an `edited` event, which starts
a fresh `Verify` run on the sanitized description. An earlier run may already
have failed while reconciliation was in flight; only the later run evaluates
the updated body. If native Copilot appends another footer later, the next
`edited` event retries the idempotent repair. This workflow does not manage
external PRs or guarantee behavior until the policy is merged to
`copilot/Development`.

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

The current `.github/workflows/ci.yml` defines job names `verify` and
`database`. The repository default branch is `copilot/Development`, so the
scheduled recovery workflow will run from the target branch after merge. The
most recent completed successful Verify run on merged governance
PR #141 reported both jobs successful (run
[43144295088](https://github.com/farbotkol/butterbox/actions/runs/43144295088)).
The failure inspected during this task was unrelated PR #85: its database job
timed out in a browser test for offline-claim reconciliation; it is not changed
or claimed fixed here. Local results for this implementation are recorded in
the pull request after focused checks run.
