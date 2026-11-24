# Autonomous post-launch Development drift recovery

Status: **partial implementation, not enabled**. This change introduces a fail-closed evidence classifier and regression tests. It does **not** bypass the pinned-base guard, promote PR #319, release lease #305, or launch an agent.

## Problem
The acceptance handoff currently demands `current Development SHA === lease.baseSha`. A later, independently valid controller change can therefore strand a completed Copilot task even when the task's PR only adds the approved proof artifact.

## Required end-to-end behavior before enabling
1. Read the exact active lease, issue and Copilot task; confirm completed child sessions, exact PR artifact and absence of competing writers. Never mutate the lease's original base SHA.
2. Compare the pinned commit to the current Development tip. Require a complete forward-only ancestry proof. Reject divergence, unverified comparison results, renames or changes touching the approved proof path.
3. Re-fetch the PR's exact head, approved proof bytes and changed-file scope. Require GitHub's mergeability check against the **current** Development tip and valid protected CI for the exact head. Fail closed on unknown, dirty or stale mergeability. Do not waive branch-protection rules.
4. Recheck approval, live lease identity, Development tip and task/session snapshot immediately before **every** mutation. Repair missing PR metadata in a distinct run, then promote, merge and reconcile in later runs.
5. At merge time, record the current validated parent SHA as independently verified handoff evidence while retaining the original pinned SHA for historical provenance. On the next scheduled run, independently validate the bot squash commit's actual parent, its full ancestry from the original lease base and the exact proof blob before issue closure and lease release.
6. Treat uncertain API responses, missing pages, changed branches, failed checks, competing writers or ambiguous merge records as hard stops. Never silently retry mutations against changed evidence.
7. Make retries idempotent. Emit diagnostic markers for drift detected, drift evidence validated, drift rejected, PR ready, merge confirmed, issue reconciled and lease released, without leaking secrets.

## Acceptance tests needed before merge
- Original pinned base works without the drift path.
- A nonoverlapping valid Development advancement can complete a draft-to-merge-to-reconciliation sequence over scheduled runs.
- Branch divergence, changes to the proof path, incomplete compare responses, API errors, pending or failed CI, conflicting writers and moving tips cause no mutation.
- Repeated controller runs never duplicate merges, issue closure or lease release.
- Existing pre-dispatch recovery and metadata-repair tests remain passing.

**Current scope:** the helper only distinguishes unchanged, blocked, and candidate evidence. Candidate expressly does not permit mutation. Integrate and test the full protocol above before changing the production handoff.
