# Butterbox pull request checklist

## Scope and verification

- What this PR changes:
- Related GitHub issue (ordinary link or issue number, if applicable):
- Acceptance criteria passed / blocked:
- Tests actually run and their outcomes:
- Known blockers and deferred checks:
- Documentation: updated / not applicable (reason):

## Issue closure

Use normal GitHub issue links for traceability. Special HTML issue/evidence
markers and attempt-specific JSON/Markdown attachments are not required for
the Verify workflow.

GitHub may automatically close an issue when closing keywords such as
`Fixes #N` are used and the pull request merges into the default branch.
Prefer `Refs #N` for partial work. Check the issue acceptance criteria before
intentionally closing it. Wording alone must not cause CI to fail.

Keep all required code, database, security, review and branch-protection checks.
