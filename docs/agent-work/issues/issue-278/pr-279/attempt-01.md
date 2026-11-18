# Issue #278 / PR #279 / attempt 01

## Scope
Runtime reconciliation for generated PR auto-close language, canonical marker generation, and safe Verify reruns. This is a partial implementation attempt; no production systems or database state were changed.

## Delivered
- Trusted reconciliation is restricted to open, same-repository Copilot PRs targeting `copilot/Development` with a verified link to one open issue.
- Repairs preserve authored text, restore canonical markers only from trustworthy GitHub metadata and actual evidence files, and neutralize unsafe close phrases.
- Successful body repairs request a rerun of the matching Verify run. Evidence and managed-file gates read current PR metadata and reject a changed head.
- The controller adds the actual PR-specific evidence path after creation and preserves a recovered PR's existing body.
- Operator documentation covers permission scope, audit output, bounded repair behavior, API race limits and the need for a live post-merge demonstration.

## Acceptance evidence
- **AC-1 — Pass (automated):** the partial-footer regression proves the auto-close footer is removed and a matching Verify rerun is requested; the workflow logs PR and issue IDs without body content.
- **AC-2 — Pass (automated):** controller and reconciliation tests cover canonical marker generation/restoration, while missing evidence is never fabricated and the unchanged validator remains a hard gate.
- **AC-3 — Pass (automated):** tests cover repeated footer repairs, idempotency, ambiguous links, unauthorized PRs, concurrent edits, API/rate-limit failures and Verify-run matching.
- **AC-4 — Pass (reviewed):** Verify, database, managed-file, tenant-isolation and merge gates were not weakened. The observed Verify run stopped at the still-missing canonical markers.
- **AC-5 — Blocked:** the trusted workflow is not active until this PR is merged; a fresh Copilot draft and later description rewrite have not been demonstrated.

## Verification
- `node --test tests/agent-evidence-pr-description.test.mjs tests/agent-evidence.test.mjs` — passed, 31 tests.
- `npm run lint -- tools/agent-evidence/reconcile-pr-description.mjs tools/agent-evidence/check-pr-evidence.mjs tools/agent-evidence/check-managed-files.mjs tests/agent-evidence-pr-description.test.mjs` — passed.
- `node --test --test-name-pattern='evidence marker|adopted PR' tools/agent-controller/listener.test.mjs` — passed, 1 focused test.
- `node --check` on the reconciliation and both evidence-guard scripts — passed.
- `git diff --check` — passed.
- CodeQL Actions analysis — 0 alerts.
- Verify run [43963202317](https://github.com/farbotkol/butterbox/actions/runs/43963202317) failed at the evidence-reference gate because the current PR body lacks top-level canonical markers; later Verify steps did not run. Database was still in progress when recorded.
- Documentation: updated (`docs/agent-evidence-reconciliation.md`, `tools/agent-controller/README.md`).

## Blockers and limitations
- A real Copilot draft/update demonstration requires this trusted workflow to be active on `copilot/Development`.
- The current remote PR body has not yet been replaced with the canonical template body; Verify therefore remains blocked independently of the local test results.
- GitHub's PR body update API has no compare-and-swap. The reconciler re-reads immediately before PATCH, but a narrow concurrent-update race remains documented.
- The repository's PR coordination check also failed with `Cannot read properties of undefined (reading 'replaceAll')`; this is separate from the evidence gate and was not changed here.

## Recommendation
Partial; keep the issue open and PR draft pending a compliant body, required CI, review, and live workflow demonstration.
