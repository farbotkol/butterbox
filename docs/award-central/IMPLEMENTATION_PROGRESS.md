# Award Central implementation progress

## Current checkpoint - 2026-11-02 03:43 UTC

This report belongs only to `feature/award-central-foundation`. Latest
committed feature HEAD is `b7f15383e54b111e169d7067a791bb171e645d9d`, and the
remote feature ref matches. It includes a merge of roadmap commit
`024d79f663398a7fb75f1f4dbcb5c3155dbf87fd`. The roadmap branch has since
advanced to `9bac44f9b196a72eaf47bdcd53609c5bffbc7f65`; this later target has
not been merged or tested here. A small backlog/report checkpoint is being
prepared for this branch.

PR #3 is open and Draft, with base `copilot/finish-roadmap-for-app` at
`024d79f`; its latest GitHub metadata reports `mergeable_state: dirty`, so it
must remain Draft and must not be merged. The workstream owns only BB-PAYRULES;
the latest Core statuses remain unchanged. Current `BACKLOG_INDEX.csv` has
109 unique stories: 38 Done, 4 In Progress, 4 Blocked and 63 Backlog. Award
Central stories 002 and 013 are In Progress; 017 is Blocked; none is Done.

The combined feature branch has 50 SQL migrations with unique version
filenames. Do not silently replay a renumbered Award Central migration against
an environment whose migration history records its former version. No merge is
currently in progress. Merged testing evidence further below is specific to
the exact merge commit and tests named; it does not establish acceptance
against the newer `9bac44f` roadmap tip.

## BB-PAYRULES-013 branch-only coverage correction - 2026-11-02

The new migration
`supabase/migrations/20261103000500_award_central_regression_verified_coverage.sql`
updates the privileged draft-issues report so an area counts as represented
only when its candidate is unresolved-free, fingerprints the current draft,
has at least one separately staged expected output, and has no contradictory
expected outputs. This prevents a proposed, unresolved or stale scenario from
appearing to satisfy the evidence-coverage summary. The existing unconditional
publication block remains in force. This does not create verified golden
cases, execute a deterministic calculation, authenticate expert reviewers or
enable publication.

The modified focused pgTAP file passed **60/60** in a transaction against
disposable local Supabase project `butterbox-award-merged-validation-202611`
(database port 56432; API port 56431; Docker project label matched). The
migration, test fixtures and temporary pgTAP extension were rolled back; the
database migration ledger stayed at 49 and the test UUID was absent afterward.
This validates the function against the existing merged schema, but is not a
clean 50-migration replay or testing against the current roadmap tip `9bac44f`.
No application/unit tests were relevant to this SQL-only correction. Full
merged-target integration, TypeScript, ESLint, production build and browser
checks remain unverified for the current roadmap tip.

**013.3 remains Blocked:** the draft issue report now reflects missing
candidate-quality requirements, while publication remains fail-closed. Actual
independently reviewed expected results, trusted test execution, verified
reviewer identity and a usable publication gate are not present.

## Branch scope and merge recovery - historical checkpoints

This report belongs only to `feature/award-central-foundation`. Core's
implementation status and historical validation remain in
[the root report](../../IMPLEMENTATION_PROGRESS.md). No Award Central story
is Done. The local merge validation below is not release acceptance.

The first merge joined Award Central checkpoint
`1c51ca71544c5dfe1ce48d007a53603c873c343b` with roadmap checkpoint
`540ed3f3e650f83e3a17c6dfe88bbfc2702e812f`. A follow-on merge incorporates
roadmap checkpoint `024d79f663398a7fb75f1f4dbcb5c3155dbf87fd`. The combined
tracker retains all 109 stories: 38 Done, 4 In Progress, 4 Blocked and
63 Backlog. All Core statuses and the Award Central status overlay below
are retained.

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

For the follow-on merge with `024d79f`, the same 49 migrations were present
on the disposable database. Targeted pgTAP passed the updated roster
notification suite 77/77 and the Award Central foundation, member-read and
regression suites 48/48, 19/19 and 59/59. The Node unit run passed 142 tests
with 21 integration tests skipped. A full pgTAP rerun and targeted ESLint
were interrupted by SIGTERM; full authenticated integration, TypeScript,
ESLint, production build and browser checks remain outstanding for this merge.

The merge commit `49f8048` was later followed by branch-only reporting commits
and merge commit `5abd50d`. The remote feature ref matched `5abd50d` at the
current checkpoint. The roadmap branch subsequently advanced beyond the
merged `024d79f` to `9bac44f`; repeat the relevant integration checks against
that actual target before release. Do not merge PR #3.

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
| 013.3 | Every new approval, activation and draft supersession remains blocked. The draft report now counts coverage only for a current-fingerprint, resolved candidate with non-conflicting staged expectations. | Regression pgTAP 60/60 in a rolled-back transaction. Actual calculation execution, verified reviewer identity and golden results are not present; merged testing against current roadmap tip is outstanding. | Blocked |
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
