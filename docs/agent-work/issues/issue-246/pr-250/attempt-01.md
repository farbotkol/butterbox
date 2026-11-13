# Issue #246 / PR #250 / attempt 01

## Scope
This is a follow-up to PR #247 based on updated Development after PR #248 repaired the trusted GitHub API argument handling. Change the `pull_request_target` coordination checkout to use current trusted `copilot/Development` instead of a PR-event-pinned historical base SHA. Never execute untrusted PR code in the privileged coordination workflow.

## Status
Partial issue delivery. Existing coordination policy, token permissions and fail-closed SQL/file overlap enforcement remain enabled. Check run and security review are pending. This does not address separate database/browser test failures.

## Evidence
- Workflow checkout ref in `.github/workflows/pr-coordination.yml` changed to `copilot/Development`.
- PR #248 merged the earlier `gh api` argument hotfix.
- PR #247's old event retained base commit `ccf3c59`, causing its coordination check to execute the broken script despite that merge. PR #250 starts from current Development to avoid stale base.
- No production deployment, auto-merge or guard bypass is authorized.
