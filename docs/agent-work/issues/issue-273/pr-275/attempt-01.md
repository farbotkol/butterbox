# Issue #273 / PR #275 / attempt 01

## Status
- **Observed:** 2026-11-16 21:40 UTC.
- **Phase:** Implementation is present; disposable database/browser verification and live deployment acceptance remain blocked.
- **Issue / PR:** [#273](https://github.com/farbotkol/butterbox/issues/273) / [#275](https://github.com/farbotkol/butterbox/pull/275), targeting `copilot/Development`.
- **Application commit tested by CI:** `1801a9467a807b90e4717146f4b6c5f02d419aac`; a pgTAP dollar-quote syntax correction is included in this evidence update and awaits CI rerun.

## Scope and finding
This PR contains the gated onboarding sample-team path, an owner-only existing-venue Demo Data page/action, tagged synthetic FOH/BOH records, database authorization and provenance safeguards, and operator/user documentation. The hosted development Supabase project has not been independently verified or activated. No hosted database was changed.

Owner follow-up commits `6177831` and `1801a94` made the employee protection trigger functions read the restricted provenance table through locked-down `SECURITY DEFINER` functions and added pgTAP coverage for ordinary service-role employee updates and blocking a synthetic employee account link. CI then found malformed dollar quoting in that regression test at line 283; the pgTAP query strings have been corrected, but the correction has not yet been rerun.

## Acceptance evidence
| Criterion | Evidence and result | Status |
| --- | --- | --- |
| Authorized development owner can choose sample team during new onboarding and can later load fictional demo data into an existing development workspace. | Setup and Settings → Demo Data implementation is present in `src/app/setup/page.tsx`, `src/app/settings/demo-data/page.tsx`, and the server action. Local navigation and environment-policy tests pass. Disposable DB/browser checks and visible hosted-owner acceptance are not yet confirmed. | Blocked |
| Same controls remain inoperative for production, unidentified or shared customer databases, including via direct API invocation. | Application requires explicit environment/project settings; database RPC requires matching database approval and owner authorization. The hosted project remains unverified. Latest Verify did not reach tests because the evidence pair was absent. | Blocked |
| Seed/reseed preserves real data and tenant boundaries; fictional provenance and counts are visible; repeats produce no duplicates. | Migration implements synthetic provenance, clean-venue checks, idempotent loading, counts and tenant authorization. In database run [#43961540531](https://github.com/farbotkol/butterbox/actions/runs/43961540531), all 42 pgTAP assertions passed but the test process failed because malformed SQL quoting at line 283 prevented TAP plan output. The query quoting is corrected; it awaits rerun. | Blocked |
| No outbound invitations, messages or payroll execution, including Xero, are triggered by demo records. | Migration guards synthetic employee linking, invitations and payroll mapping and excludes demo attendance from payroll inputs. Owner-added pgTAP coverage reaches all assertions, including synthetic account-link rejection, but malformed quoting in the final `service_role` regression made the test process fail. No external provider was used. | Blocked |
| Targeted and required CI pass; the completed PR documents deployment verification and operator activation steps. | README and User Guide activation/limitations guidance is present, but project isolation/live activation is unverified. Verify run [#43961540531](https://github.com/farbotkol/butterbox/actions/runs/43961540531) failed its evidence-pair check before test/lint/build. Its database job failed on the malformed SQL quote; browser and tenant-isolation jobs were skipped. Required checks are not green. | Blocked |

## Tests and checks
- `node --test --experimental-strip-types tests/demo-data-environment.test.mjs tests/navigation.test.mjs` — passed, 7/7.
- `node --test --experimental-strip-types tests/demo-data-environment.test.mjs tests/navigation.test.mjs` — passed, 7/7.
- `npm run test:ci:local -- --runner host` — blocked before database setup because Supabase CLI 2.122.0 was unavailable in the local environment.
- [Verify #43961540531](https://github.com/farbotkol/butterbox/actions/runs/43961540531): failed because both PR-specific evidence files were missing; test/lint/build were skipped. Its database job ran pgTAP, then failed on a malformed SQL quote at line 283; all 42 assertions passed but TAP reported no plan.
- [Fast database candidate #43961498061](https://github.com/farbotkol/butterbox/actions/runs/43961498061): its database smoke job failed on the same SQL quoting issue, before tenant-isolation and browser steps.
- PR coordination [#43961541729](https://github.com/farbotkol/butterbox/actions/runs/43961541729) failed with `Cannot read properties of undefined (reading 'replaceAll')`; this appears in the coordination checker and is not evidence that feature checks passed.
- Secret scanning on the earlier implementation found no secrets. No live deployment or database was modified.

## Blockers and limitations
- Verify the actual development Supabase project's isolation and obtain operator approval before enabling the hosted loader.
- The malformed pgTAP SQL quote is corrected in this working tree, but required database and browser checks have not rerun on this correction.
- Authenticated tenant-isolation and browser regression were skipped after database failure.
- Required GitHub checks have not passed. The PR remains draft and issue #273 remains open pending visible owner verification on the development app.
- **Documentation: updated** — README operator activation guidance and User Guide onboarding/loader wording.

## Next action
Re-run CI to verify the SQL quote correction, then confirm pgTAP, tenant-isolation and browser regressions pass. Verify the isolated hosted development environment with the owner before activation. Do not close issue #273 from this attempt.
