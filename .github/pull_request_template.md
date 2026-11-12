# Butterbox pull request checklist

> Replace N with the canonical GitHub issue number, M with the actual pull request
> number, and XX with the two-digit evidence attempt. Remove this guidance text
> and the example placeholders before requesting review. Do not put the actual
> markers inside a fenced code block.

## Scope and verification

- What this PR changes:
- Acceptance criteria passed / blocked:
- Tests actually run and their outcomes:
- Known blockers and deferred checks:
- Documentation: updated / not applicable (reason):

## Canonical issue and evidence (required for Verify)

Refs #N
<!-- butterbox-issue: N -->
<!-- butterbox-evidence: docs/agent-work/issues/issue-N/pr-M/attempt-XX.evidence.json -->

Upload the matching `docs/agent-work/issues/issue-N/pr-M/attempt-XX.md`
and `.evidence.json` files as part of this PR. Validate against the canonical
issue acceptance checklist and the current PR file list. The issue number must
match in the reference, marker, evidence path, and JSON. The PR number must match
the path and JSON.

**Partial, draft and documentation-only work:** Do not use `Fixes #N`,
`Closes #N` or `Resolves #N`. Copilot may add `Fixes` automatically;
replace it with `Refs` before CI. Closing keywords are permitted only when
all canonical criteria are demonstrably complete, no blockers remain and the
repository owner has approved the exact PR head. Green CI alone does not close
an issue.

Do not disable or bypass the evidence checks to make a PR green.
