# Issue #283 / PR #284 / attempt 01

## Scope
Safely widen eligibility for Copilot-authored Development PRs, report actionable exclusion and required-check states, and preserve native GitHub merge gates. This is a partial implementation attempt; no branch rules, production settings, data, or deployments were changed.

## Diagnosis
- The previous Phase 2 policy allowed only PRs #34/#39 or Copilot-authored PRs created at/after `2026-11-07T01:30:00Z`. PRs #34 and #39 are closed and merged; GitHub metadata identifies `farbotkol`, not Copilot, as their author. Both had successful `verify` and `database` check runs and were merged by `github-actions[bot]`. They were explicit pilot exceptions, not evidence that general Copilot eligibility or review requirements had been proven.
- The open-PR query for `copilot/Development` returned only PR #284 at the time checked. It is a draft authored by `farbotkol`, not a Copilot-authored PR. It is therefore not evidence of an eligible PR needing human merge.
- The scheduled Phase 2 run [44584405419](https://github.com/farbotkol/butterbox/actions/runs/44584405419) completed successfully but did not demonstrate a merge. Its log contains no candidate evaluation or auto-merge request.
- The first policy workflow run on this PR failed because its existing write-capable job had no checkout for the new policy module (`MODULE_NOT_FOUND`). The workflow now runs policy tests in a read-only PR job and only runs the write-capable merge job against checked-out `copilot/Development`. The PR policy test passed in [run 44638102848](https://github.com/farbotkol/butterbox/actions/runs/44638102848); the merge job was skipped for the pull-request event.
- Verify [run 44638102933](https://github.com/farbotkol/butterbox/actions/runs/44638102933) failed at the existing PR evidence guard because the PR body did not yet include its attempt-specific JSON evidence marker. This is not a policy-test failure. `database` was still running when this attempt was recorded.
- Actions logs show the Phase 2 job token had `contents: write`, `pull-requests: write`, `actions: write`, and `checks: read`; the observed policy failure occurred before a merge API request, so token permission sufficiency for an actual merge remains unproven. The Copilot CLI repair auth workflow documents that auth is not proven for this personally owned repository; this issue did not run its PR #33 auth smoke test.
- The GitHub read surfaces available here did not expose the live Development ruleset. PR review queries for #34/#39 returned no review submissions or review-comment threads at the time queried; that does not establish historical approvals or the ruleset’s current requirements. The owner must inspect the ruleset directly.

## Safe policy and owner action
- A candidate must be open, non-draft, authored by the Copilot account, target exactly `copilot/Development`, use a same-repository `copilot/` head branch, have a head SHA, and have complete metadata showing no outstanding reviewer/team requests. Creation date is not a criterion. Missing or mismatched metadata is rejected with a reason.
- `verify` and `database` remain mandatory and are checked against the latest GitHub Actions runs on the exact head. Missing, pending, and failed checks now have distinct log messages. Stale-branch update and exact-head revalidation remain in place.
- The workflow requests only GitHub-native squash auto-merge. It does not mark drafts ready, bypass protections, force-push, or modify branch rules. GitHub remains responsible for configured approval, conflict, and conversation-resolution requirements.
- **Owner-only action:** inspect the ruleset applying to `copilot/Development`. If fully autonomous merging is explicitly approved, configure zero required human approvals for that branch only while keeping `verify`, `database`, and unresolved-conversation protections mandatory. Do not grant bypass or change Production protections. No ruleset change was made here.

## Acceptance evidence
- **AC-1 — Pass (automated):** tests show a Copilot PR dated before the old cutoff and a future-dated Copilot PR are considered by the same safe predicate; forked, mismatched and untrusted cases are rejected.
- **AC-2 — Pass (automated):** unit tests assert actionable reasons for wrong author, target, fork, head namespace, draft status, pending review requests and incomplete metadata; workflow logs distinguish missing, pending and failed required checks.
- **AC-3 — Pass (reviewed and tested):** `verify` and `database` remain required in the merge loop; squash-only native auto-merge, stale-HEAD checks, and no draft promotion or administrative bypass remain.
- **AC-4 — Blocked (runtime):** PR #284 targets `copilot/Development` and runs are linked above and in this PR. Required CI on the current evidence-complete head and a real eligible auto-merge have not been demonstrated; no auto-merge success is claimed.
- **AC-5 — Pass (scope):** this work is running in PR #284; no second coding task or repair agent was dispatched. Copilot CLI repair authentication remains unproven and is not claimed.

## Verification
- `node --test tests/phase2-automerge-policy.test.mjs` — passed, 4 tests.
- `npm run lint -- tools/phase2-automerge-policy.mjs tests/phase2-automerge-policy.test.mjs` — passed.
- `bash -n` on the embedded merge-job shell — passed.
- `git diff --check` — passed.
- PR policy check [44638102848](https://github.com/farbotkol/butterbox/actions/runs/44638102848) — passed; merge job skipped for the pull-request event.
- Verify [44638102933](https://github.com/farbotkol/butterbox/actions/runs/44638102933) — failed at the missing attempt-specific JSON marker; database was pending at record time.
- Secret scan — no secrets detected.
- CodeQL Actions analysis — 0 alerts.
- Documentation: not applicable (backend-only workflow and policy; no user-facing behavior changed).

## Blockers and limitations
- Live Development ruleset approvals and conversation-resolution settings remain unverified; the repository owner must inspect them and decide whether zero required human approvals are approved.
- Neither a general Copilot-authored candidate nor a successful native auto-merge was observed. Required CI on the evidence-complete PR head must pass before any merge request can be considered.
- Copilot CLI authentication for CI repair in a personal repository remains unproven; no repair or automatic recovery is claimed.

## Recommendation
Partial; keep the issue and PR open pending evidence-marker reconciliation, required CI, owner ruleset verification, review, and a future safe demonstration.
