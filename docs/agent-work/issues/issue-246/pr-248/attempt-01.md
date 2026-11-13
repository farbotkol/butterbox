# Issue #246 · PR #248 · attempt 01

## Change
One-line fix in `tools/agent-controller/check-pr-coordination.mjs`: wrap the `gh api` endpoint string as `[endpoint]` for the `runGh` argument-array helper. This prevents `...args` from turning the URL path into individual CLI characters.

## Scope and safety
This pull request changes only the trusted coordination script and its required evidence files. It does not change the `pull_request_target` workflow, weaken any checks, alter permission controls or change application code. It is a narrow bootstrap hotfix. Related PR #247 tracks a separate workflow checkout improvement.

## Validation and limitations
Static inspection confirms that `runGh` spreads its `args` array and that passing `[endpoint]` is consistent with the existing paginated calls. GitHub CI and independent review remain pending. The coordination job running on base code will continue to fail until the fix lands through the protected merge process. The browser/database failures remain separately tracked; no claim is made that issue #246 is fully resolved.

## Release
Do not force merge, bypass protections or deploy production. Review exact changes and verify required checks; if policy blocks approval, escalate to repository administrator under established process.
