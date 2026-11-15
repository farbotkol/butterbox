# Issue #266 / PR #267 / attempt 01

## Scope
Fix the PR coordination checkout that uses the stale `pull_request_target` event base SHA instead of current trusted Development. Keep privileged policy read-only and never execute code from an untrusted PR head. Preserve merge-group base pinning.

## Change
- `.github/workflows/pr-coordination.yml` now checks out `refs/heads/copilot/Development` for pull-request-target events, retaining the merge-group base SHA for merge queues.
- `tests/pr-coordination-trusted-checkout.test.mjs` adds static safeguards against stale PR event base/head use and verifies read-only permissions and the existing checker remain configured.

## Verification
- Regression test file committed; execution and required GitHub CI pending.
- The active Xero PR #262 and SMS PR #263 remain unmerged; both must add code and canonical evidence before acceptance.
- No security, review, coordination, or database merge gate is disabled.

## Limitations
- Source validation in CI and security review remain outstanding. No automatic merge or production deployment.
