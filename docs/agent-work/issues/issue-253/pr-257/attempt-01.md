# Issue #253 / PR #257: roster browser stabilization evidence

## Scope
- Updated the roster timeline add-shift accessible name to include its visible text.
- Aligned Playwright roster tests with the current collapsible manual editor, separate scheduling guidance disclosure, venue switching, and roster headings.
- Preserved assertions for permissions, availability, conflict policy, keyboard accessibility, mobile behavior and publication outcomes.
- Retained focused runner batching for up to 20 test locations per invocation; removed temporary push triggers and hard-coded test selections.

## Verification
- GitHub Actions focused run 43501880692 passed all 23 originally failing browser scenarios (20 + 3) on commit dff7449ccfce41ca3be4967b85947d2c81ba1b10.
- Earlier single-scenario run 43500888986 passed the final weekly roster scenario.
- No assertion was removed and no timeout was increased.
- The complete regression suite (including the 85 previously passing browser scenarios), required database verification, and required Verify checks remain pending against the PR head.

## Decision and limitations
- This is a partial delivery pending full CI and repository owner review.
- Do not close issue #253 or merge until complete acceptance criteria are met.
- This evidence reflects observed results, not an assertion of production deployment or completion.
