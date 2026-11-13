# Issue #253 / PR #257: roster browser stabilization evidence

## Scope
- Corrected the roster timeline add-shift accessible name and aligned Playwright selectors with the current roster UI, including manual editor and scheduling guidance disclosures.
- Preserved permission, availability, conflict, accessibility, keyboard, mobile, and publication assertions.
- Retained reusable focused runner batching; removed temporary push hooks and hard-coded test selections.

## Verification
- All 23 originally failing scenarios passed in focused run 43501880692 on commit dff7449ccfce41ca3be4967b85947d2c81ba1b10.
- The additional outdated timetable selector was corrected and passed individually in run 43511436789.
- Full Verify run 43512021449 passed, including `verify` and `database` jobs, on commit 261b9f35465f982f46c51bfd740d1a4d39d7569c.
- Required full browser suite, pgTAP, and tenant isolation passed as part of the database job.
- Focused browser workflow 43512021451 passed on the same commit.
- No assertion was removed and no timeout was increased.

## Outstanding coordination
- PR coordination check 43512014824 failed because draft PR #256 overlaps this stabilization work and reports `invalid_component_metadata`.
- PR #256 has no changed files; no action was taken to close or alter it.
- PR #257 remains draft, unmerged, and undeployed pending coordination and repository owner review.
- No claim is made that the evidence-only follow-up commit has completed another full regression.
