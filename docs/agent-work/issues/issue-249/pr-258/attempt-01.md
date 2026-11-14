# Issue #249 / PR #258 / attempt 01

## Scope
Stage C trial: advisory change-aware browser validation. Existing required `verify` and `database` checks remain unchanged.

## Delivered
- `.github/workflows/change-aware-browser.yml`: advisory PR workflow for targeted browser tests.
- `scripts/select-change-aware-tests.mjs`: Git changed-file selector with conservative full-suite fallback.
- `tests/change-aware-selection.test.mjs`: automated selector test cases.

## Verification
This is partial issue #249 delivery. Required CI, selection accuracy, and runtime improvements still need confirmation. No claims of completed issue acceptance.

## Remaining
Measure runtime, check that targeted tests exist and cover relevant sensitive areas, validate fail-closed selection, and audit merge protections before promoting this check. Do not auto-merge or deploy.
