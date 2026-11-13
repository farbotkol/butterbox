# Issue #246 · PR #247 · attempt 01

## Scope and status
Partial repair of PR coordination source checkout. The `pull_request_target` coordination workflow now checks out the current trusted `copilot/Development` revision, instead of an event-pinned historical base commit. It must never check out the untrusted PR head for executing policy scripts.

## Evidence and verification
- `.github/workflows/pr-coordination.yml`: modified checkout `ref` from the original base SHA expression to `copilot/Development`. The `GH_TOKEN` read-only permissions and coordinator invocation remain unchanged.
- Prior PR #242 run failed with `MODULE_NOT_FOUND` at `tools/agent-controller/check-pr-coordination.mjs`. The script is present on current Development. The old event base commit can lack it.
- This change only addresses stale checkout behavior. It does not claim that the separate browser tests have passed or that the full issue #246 acceptance criteria are met.
- GitHub Actions CI and security review on this draft PR are pending. No CI gate disabled, no production changes, and no automatic merge.
- Documentation: workflow comment explains why a trusted branch is required; no user-facing documentation changed.
