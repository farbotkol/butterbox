# Award Central implementation progress

## Branch scope and merge recovery - 2026-11-02

This report belongs only to `feature/award-central-foundation`. Core's
implementation status and historical validation remain in
[the root report](../../IMPLEMENTATION_PROGRESS.md). No Award Central story
is Done. The local merge validation below is not release acceptance.

The merge joins Award Central checkpoint `1c51ca71544c5dfe1ce48d007a53603c873c343b`
with roadmap checkpoint `540ed3f3e650f83e3a17c6dfe88bbfc2702e812f`.
The combined tracker retains all 109 stories: 37 Done, 5 In Progress,
4 Blocked and 63 Backlog. All Core statuses and the Award Central status
overlay below are retained.

The following checkpoint is preserved as historical evidence from `49d36b6`.
The later preservation commit `1c51ca7` also contains the member-read migration,
database tests, authenticated integration test and legacy/concurrency fixtures.
Those later changes are covered by the local merge tests below, not by the
historical checkpoint results.

Current Award Central migration filenames are:

- `20261103000100_award_central_foundation.sql`
- `20261103000200_award_central_source_snapshots.sql`
- `20261103000300_award_central_regression_evidence.sql`
- `20261103000400_award_central_member_reads.sql`

The first three were already renumbered in `1c51ca7` to follow Core's migrations.
This merge does not remove, rename or rewrite any migration from either parent.
Older timestamps below identify the historical checkpoint, not additional files
to apply. Earlier isolated test applications are not a deployment ledger:
before applying to any existing environment, inspect its migration history and
explicitly reconcile any recorded older Award Central versions. Do not silently
replay renamed migrations against a database where the old versions were applied.

## Local merge validation - 2026-11-02

The local merge commit `49f80481ad1713a485a3f55df2d8243fa40a1a9d` was tested
with a disposable Supabase project on separate local ports:

- All 49 migrations replayed with unique versions; the database suite passed
  47 files / 2,203 assertions, including foundation 48/48, member reads
  19/19 and regression evidence 59/59.
- Award Central post-gate, member legacy, member concurrency and regression
  concurrency rehearsals passed 10/10, 14/14, 8/8 and 9/9. The concurrency
  fixtures used `supabase_admin` on the disposable database for
  `dblink_connect_u`; no application-role grant was added.
- The canonical-payroll legacy migration rehearsal passed 11/11 with the
  Award Central migrations applied afterwards.
- The Award Central source-staging and two-business member-read HTTP
  integration tests passed, as did a targeted payroll-period integration
  test. The full database-backed Node run was interrupted externally and is
  not a suite pass. The Node unit run passed 142 tests, with 21 integration
  tests skipped.
- Award Central TypeScript and ESLint checks passed. Full TypeScript, full
  ESLint, and both Turbopack and webpack production build attempts were
  interrupted by SIGTERM under host memory pressure. Production-browser
  tests were not run.

The feature branch was subsequently verified on the remote at merge commit
`49f8048`; this validation report is a later checkpoint. The available
GitHub credential in this session was rejected, so later local commits still
need an authenticated push. PR #3 was confirmed open and draft. The roadmap
branch subsequently advanced beyond `540ed3f` to `024d79f`; these results do
not cover that newer revision. Repeat outstanding checks and validation
against the actual integration target before release. Do not merge PR #3.

## Current Award Central story status

These statuses describe `feature/award-central-foundation` only, not the
roadmap branch or `main`. Repeat the merged checks against the actual
integration target before treating these results as release acceptance.

| Story | Feature-branch status | Current evidence and remaining work |
| --- | --- | --- |
| BB-PAYRULES-002 | In Progress | Shared versioned tables, source linkage and membership-gated reads exist; new publication fails closed. Governed publication, calculation provenance and separately scoped agreements remain incomplete. |
| BB-PAYRULES-013 | In Progress | Immutable draft candidates and separately staged expectations retain source and version fingerprints; a privileged draft report identifies gaps and conflicts. No authenticated specialist signoff, independently established golden cases, deterministic runner or verified coverage evaluation exists. |
| BB-PAYRULES-017 | Blocked | Original source bytes, hashes and known API limitations can be staged; live FWC access, source-specific parsing and ambiguity handling remain unverified. |

### Criterion-level evidence

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| 002.1 | Shared effective-dated versions, immutable existing publications and membership-gated reads; new publication is blocked. | Merged foundation pgTAP 48/48, member-read pgTAP 19/19, legacy rehearsals 10/10 and 14/14, membership concurrency 8/8, and the two-business HTTP test passed. Governed publication remains unavailable. | Blocked |
| 002.2 | Draft lifecycle, source references and declared evidence fields exist. | Foundation pgTAP 48/48; authenticated specialist approval and mandatory validation evidence remain unimplemented. | Blocked |
| 002.3 | Customer write grants are revoked. | Foundation pgTAP 48/48; tenant-specific award configuration and its isolation tests are not yet implemented. | Blocked |
| 002.4 | No calculation-result provenance exists yet. | No calculation service or historical-reproduction test exists. | Blocked |
| 002.5 | Tenant-specific agreement rulesets are not implemented. | No agreement isolation test exists. | Blocked |
| 013.1 | Central append-only draft scenarios and separately entered proposed expectations. | Regression pgTAP 59/59; no verified experts or golden calculations exist. | Blocked |
| 013.2 | Coverage labels include DST, midnight, minimum engagement, cumulative hours and effective dates. | Regression pgTAP 59/59; actual award-boundary calculations are not implemented. | Blocked |
| 013.3 | Every new approval, activation and draft supersession is blocked; a privileged draft report flags missing categories, conflicting expectations, unresolved and stale cases. | Foundation pgTAP 48/48 and regression pgTAP 59/59; no usable gate based on verified coverage and actual execution results exists. | Blocked |
| 013.4 | Immutable rows record source, claimed preparer/reviewer, limitations and a content fingerprint. | Regression pgTAP 59/59 and concurrency rehearsal 9/9; identity, qualification, test-run provenance and signoff are not verified. No government certification is claimed. | Blocked |
| 017.1 | Official-host acquisition interface only. | Mocked Node tests passed; live FWC endpoints and award-document parsing remain unverified. | Blocked |
| 017.2 | Immutable source snapshots retain bytes, hash, dates and provenance. | Merged disposable-stack integration passed 1/1; live official sources have not been tested. | Blocked |
| 017.3 | Mandatory MAPD coverage-gap metadata. | Source Node tests 6/6 and the merged database gap assertion passed. | Pass |
| 017.4 | Invalid, unavailable, oversized and redirected acquisitions reject; sources remain staged. | Source Node tests 6/6; source-specific ambiguity detection is not implemented. | Blocked |

## Historical feature-branch checkpoint - 2026-11-01

This checkpoint was based on `ca88f93` and is retained for recovery history.
Its results are separate from the local merge validation above.

**Files at this checkpoint:** `supabase/migrations/20261102220000_award_central_regression_evidence.sql`
(now `supabase/migrations/20261103000300_award_central_regression_evidence.sql`),
`supabase/tests/database/award_central_foundation.test.sql`,
`supabase/tests/database/award_central_regression_evidence.test.sql`,
`tests/fixtures/award-central-pre-gate.sql`,
`tests/fixtures/award-central-post-gate.test.sql`,
`tests/fixtures/award-central-concurrency.test.sql`, and
`docs/award-central-foundation.md`.

**Validation and limitations:** On a verified disposable, locally bound
Supabase PostgreSQL container, the three Award Central migrations replayed;
the foundation suite passed 48/48, regression evidence suite 59/59,
pre-upgrade/upgrade legacy rehearsal 10/10, and concurrent edit/duplicate
rehearsal 9/9. The feature-branch Node suite passed 113 tests with 18
integration tests skipped using the low-memory single-process runner.
Those historical authenticated-role checks used synthetic JWT identities, not
the later tenant-membership fixtures. A previous temporary merge of `ca88f93` with
roadmap commit `90f29fd` passed 43 database files / 2,026 assertions and 146
Node tests, but did **not** contain the new regression migration and must be
repeated for the current changes. At that checkpoint, the full local Supabase
stack could not be started reliably under host memory pressure; its
full-stack integration, merged testing, full ESLint, TypeScript and production
build are not verified for this checkpoint; attempted full checks were
interrupted by external process termination.
Feature-branch push was blocked by unavailable GitHub credentials.

**Decision and exact next action:** Keep all publication transitions blocked
until real independently established expected results, trusted deterministic
test execution, coverage/conflict checks and authenticated specialist approval
exist. Push this validation checkpoint when credentials are available,
complete the outstanding full checks, and validate against the current roadmap
integration target while continuing safe BB-PAYRULES-013 prerequisites and
tenant-scoped BB-PAYRULES-001/003 foundations. Never use staged evidence as
payroll results or represent it as award certification.
