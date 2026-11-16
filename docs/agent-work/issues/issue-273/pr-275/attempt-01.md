# Issue #273 / PR #275 / attempt 01

## Status
- **Observed:** 2026-11-16 21:49 UTC.
- **Phase:** Implementation is present; disposable database/browser verification and live deployment acceptance remain blocked.
- **Issue / PR:** [#273](https://github.com/farbotkol/butterbox/issues/273) / [#275](https://github.com/farbotkol/butterbox/pull/275), targeting `copilot/Development`.
- **Latest CI head:** `61eee8d28f71f62599b48e5be21b51c7b6ac1535`; fast database and browser smoke checks passed. Full Verify failed on the missing audit-source label, now fixed locally; a new Verify run awaits this update.

## Scope and finding
This PR contains the gated onboarding sample-team path, an owner-only existing-venue Demo Data page/action, tagged synthetic FOH/BOH records, database authorization and provenance safeguards, and operator/user documentation. The hosted development Supabase project has not been independently verified or activated. No hosted database was changed.

Owner follow-up commits `6177831` and `1801a94` made the employee protection trigger functions read the restricted provenance table through locked-down `SECURITY DEFINER` functions and added pgTAP coverage for ordinary service-role employee updates and blocking a synthetic employee account link. CI then found malformed dollar quoting in that regression test at line 283; the pgTAP query strings have been corrected, but the correction has not yet been rerun.

The next Verify run validated the evidence pair, then `npm test` found the new audited source `workspace_demo_data_loads` missing from the audit UI label map. Added the label in `src/lib/sensitive-action-audit.ts`. The focused audit/environment/navigation tests pass (10/10); full `npm test` now passes (454 tests: 418 passed, 36 skipped for disposable-database prerequisites); lint and TypeScript checks pass. The documentation contract test exposed a missing 1.15 review-history row, which has been added; `tests/help.test.mjs` passes 19/19. Fast database candidate run [#43962627856](https://github.com/farbotkol/butterbox/actions/runs/43962627856) passed migration/pgTAP, authenticated cross-tenant isolation, and all four critical browser smoke tests (not demo-flow acceptance). The full Verify run's database/browser job is still running.

## Acceptance evidence
| Criterion | Evidence and result | Status |
| --- | --- | --- |
| Authorized development owner can choose sample team during new onboarding and can later load fictional demo data into an existing development workspace. | Setup and Settings → Demo Data implementation is present in `src/app/setup/page.tsx`, `src/app/settings/demo-data/page.tsx`, and the server action. Local navigation and environment-policy tests pass. Disposable DB/browser checks and visible hosted-owner acceptance are not yet confirmed. | Blocked |
| Same controls remain inoperative for production, unidentified or shared customer databases, including via direct API invocation. | Application requires explicit environment/project settings; database RPC requires matching database approval and owner authorization. The hosted project remains unverified. The latest Verify run validates the evidence pair but the general test step failed on the audit-source label, now fixed. | Blocked |
| Seed/reseed preserves real data and tenant boundaries; fictional provenance and counts are visible; repeats produce no duplicates. | Migration implements synthetic provenance, clean-venue checks, idempotent loading, counts and tenant authorization. Fast database candidate run [#43962627856](https://github.com/farbotkol/butterbox/actions/runs/43962627856) passed database migration/pgTAP and authenticated cross-tenant isolation. Full Verify database/browser job remains in progress. | Blocked |
| No outbound invitations, messages or payroll execution, including Xero, are triggered by demo records. | Migration guards synthetic employee linking, invitations and payroll mapping and excludes demo attendance from payroll inputs. Fast database candidate pgTAP passed, including service-role update and synthetic-account-link regression coverage; critical browser smoke tests also passed. No external provider was used. | Blocked |
| Targeted and required CI pass; the completed PR documents deployment verification and operator activation steps. | README and User Guide activation/limitations guidance is present, including the 1.15 review-history row, but project isolation/live activation is unverified. Verify run [#43962627983](https://github.com/farbotkol/butterbox/actions/runs/43962627983) validated the evidence pair but failed `npm test` because `workspace_demo_data_loads` lacked an audit label. The label is fixed and local full tests, lint, and TypeScript pass; a new full Verify run awaits this commit. | Blocked |

## Tests and checks
- `node --test --experimental-strip-types tests/sensitive-action-audit.test.mjs tests/demo-data-environment.test.mjs tests/navigation.test.mjs` — passed, 10/10 after adding the missing audit source label.
- `npm test` — passed, 454 tests total: 418 passed, 36 skipped (tests requiring explicitly configured disposable database containers), 0 failed.
- `npm run lint -- src/lib/sensitive-action-audit.ts` and `npx tsc --noEmit` — passed.
- `node --test --experimental-strip-types tests/help.test.mjs` — passed, 19/19 after adding the missing User Guide review-history row.
- `npm run test:ci:local -- --runner host` — blocked before database setup because Supabase CLI 2.122.0 was unavailable in the local environment.
- [Verify #43961540531](https://github.com/farbotkol/butterbox/actions/runs/43961540531): failed because the evidence pair was missing; its database job failed on malformed quoting at line 283 after 42 assertions passed. The quote is corrected in this branch.
- [Verify #43962627983](https://github.com/farbotkol/butterbox/actions/runs/43962627983): evidence validation passed; `npm test` then failed because the new audit table source was missing a user-facing audit label. Added the label and its focused test passes; lint/build were skipped.
- [Fast database candidate #43962627856](https://github.com/farbotkol/butterbox/actions/runs/43962627856): disposable database migration/pgTAP, authenticated cross-tenant isolation, and all four critical browser smoke tests passed.
- [Verify #43962627983 database/browser job](https://github.com/farbotkol/butterbox/actions/runs/43962627983): migration/pgTAP and authenticated tenant-isolation passed; browser tests were still in progress at evidence capture.
- PR coordination [#43961541729](https://github.com/farbotkol/butterbox/actions/runs/43961541729) failed with `Cannot read properties of undefined (reading 'replaceAll')`; this appears in the coordination checker and is not evidence that feature checks passed.
- Secret scanning on the earlier implementation found no secrets. No live deployment or database was modified.

## Blockers and limitations
- Verify the actual development Supabase project's isolation and obtain operator approval before enabling the hosted loader.
- The malformed pgTAP SQL quote is verified by the passing fast database candidate. The audit-source label and guide-history fixes pass local full tests, lint and TypeScript, but await full Verify on the updated head.
- The full Verify browser regression remains in progress; the separate fast candidate's critical browser smoke tests passed.
- Required GitHub checks have not passed. The PR remains draft and issue #273 remains open pending visible owner verification on the development app.
- **Documentation: updated** — README operator activation guidance and User Guide onboarding/loader wording.

## Next action
Run full Verify on the updated head and complete its database/browser jobs. Verify the isolated hosted development environment with the owner before activation. Do not close issue #273 from this attempt.
