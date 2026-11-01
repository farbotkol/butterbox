# Butterbox Award Central — foundation architecture

**Scope:** BB-PAYRULES-002 central library foundations, BB-PAYRULES-017 source
capture, and BB-PAYRULES-013 regression-evidence staging. This is intentionally
not an award interpreter, a live rule publisher, or a payroll calculation service.

## Separation of responsibilities

- **Central catalogue**: `award_central_instruments` and `award_central_versions`
  contain common instrument references, source provenance, effective dates,
  proposed structured rule JSON, and review metadata. There is **no business_id**
  on central tables: every tenant refers to the same authoritative version IDs.
- **Customer configuration (future story BB-PAYRULES-001)**: business, employee,
  classification, engagement terms, higher agreed wages and Xero mappings must
  live in tenant-scoped tables with explicit RLS, never inside the shared rule JSON.
- **Client-specific agreements**: planned separately as scoped and independently
  reviewed instruments; do not copy editable central Modern Award records.
- **Calculation provenance**: future immutable results must reference the exact
  approved central version ID, tenant configuration revision, input attendance/
  timesheet snapshot, engine revision and output audit trail.

## Source acquisition and AI integration

1. Pull structured classification/rate data from available official FWC Modern
   Awards Pay Database endpoints, plus the authoritative award instruments and
   variation notices for employment conditions.
2. Persist source URL, SHA-256 digest, retrieval time, clause references,
   applicable dates and parser/model provenance. Never regard API rates alone
   as complete award interpretation.
3. AI produces a **draft** JSON proposal with explicit source citations and
   unresolved ambiguities. Its output is untrusted; validate schema, source
   integrity and independently established golden payroll scenarios.
4. Only a Butterbox-controlled privileged publication process, with identity
   and segregation-of-duties checks, may approve and activate rules. No
   customer-authenticated user may write central rules.
5. Full signoff, tested source ingestion, publication concurrency safeguards,
   audit events, update detection, coverage registry, tenant impact analysis,
   and historical rollback remain **unimplemented**. Never activate this
   foundation's draft versions for actual pay decisions.

The source-snapshot migration adds an immutable, service-only store for original
source bytes and provenance. SHA-256 is calculated in PostgreSQL from those
bytes; source records retain effective dates, variation references, fields
present and unresolved fields. New award versions must reference the exact
snapshot used to prepare them, and their source URL, hash and retrieval time
must match the snapshot. The TypeScript acquisition boundary only permits
HTTPS requests to the configured Fair Work Commission and Federal Register
hosts, rejects redirects, bounds downloads and always labels results `staged`.
Its Supabase writer stores the original bytes as `bytea` and compares the
database-computed digest before returning a staged snapshot identifier. It
does not parse API records into award rules, infer missing metadata, or publish
versions. The writer must only receive a trusted service-role client in a
server-side worker; no user-facing ingestion route is exposed.

The Fair Work Commission's API documentation states that MAPD data does not
identify the applicable award/classification or entitlements, does not report
subsequent award changes, and must be read alongside the relevant award (which
prevails if inconsistent). The acquisition contract requires each API snapshot
to record these limitations, along with enterprise-agreement scope and the
need for full award-clause interpretation. See the [FWC API terms and
limitations](https://developer.fwc.gov.au/important-information) and [Modern
Awards Pay Database API](https://www.fwc.gov.au/work-conditions/awards/modern-awards-pay-database/modern-awards-pay-database-api).
API use is subject to Fair Work Commission terms and requires provider access
credentials. No live FWC endpoint schema, credential, response, or award-
document parser has been configured or verified in this workspace. Test
payloads are explicitly synthetic validator inputs, not official rates or
source records.

## Security boundaries

Authenticated users can read instrument names and **active** shared versions;
they cannot read unpublished version content or mutate either table. Anonymous
users have no access. RLS and table grants jointly enforce the boundary.
The current catalogue read policy does not establish tenant membership, which
remains an acceptance gap. Only trusted schema operators may write drafts; this
is not yet a production publication authorisation model. The DDL guard prevents
mutation of approved versions and allows existing active versions only to be
superseded, never rewritten.

The regression-evidence migration **blocks every new approval, activation and
supersession from draft or pending review**, even for privileged operators.
Earlier active versions remain readable and may still be superseded. The
unconditional block is intentional: it must not be lifted until the separate
validation, independently authenticated specialist approval and publication
workflow can enforce the required evidence. Staged evidence is never permission
to calculate payroll or activate an award.

## Regression evidence staging

`award_central_regression_candidates` stores immutable central draft scenarios,
their coverage area, source references, declared human or AI origin, model
reference where applicable, and unresolved limitations. The database captures
the exact source snapshot and a SHA-256 fingerprint of the version's relevant
draft content under a row lock; changing the version subsequently makes the
old fingerprint stale. A fingerprint is not a copy of the historical rule
definition, and cannot by itself reproduce an old calculation.

`award_central_regression_expectations` stores expected outputs separately,
with an independently declared preparation method, distinct preparer and
reviewer references, a source snapshot and clause references, and stated
coverage limitations. Distinct conflicting expectations are retained rather
than overwritten. Both tables deny access to customers, anonymous users and
the service role; their only current writer is a trusted database operator.
No AI or ingestion service can write expected outputs through this interface.
Corrections must be recorded as new cases or expectations, not edits.

The privileged `award_central_regression_draft_issues` report lists uncovered
categories, missing or conflicting expectations, unresolved cases and
fingerprints that no longer match the draft version. Category labels indicate
only that a candidate exists, not that its coverage is adequate. An empty
report is **not** a passed test or permission to publish.

The scenario and expected-output JSON are untrusted drafts, not a validated
calculation schema. Referenced identities and sources are declarations, not
authenticated specialist signoff or proof of independence. A real deterministic
test runner, identity and qualification checks, contradiction resolution,
mandatory coverage evaluation, independent golden cases and publication
authorization are still absent. Store only synthetic or centrally authorised
test scenarios, never customer employee data, in these central tables. No
government certification is claimed.

## Testing and rollout

`supabase/tests/database/award_central_foundation.test.sql` (48 assertions)
covers schema, provenance, source immutability, SQL grants and the fail-closed
publication block. `award_central_regression_evidence.test.sql` (59 assertions)
covers evidence provenance, stale fingerprints, claimed-identity separation,
draft coverage/conflict reporting, immutability, and denied role access.
The migration rehearsal uses `tests/fixtures/award-central-pre-gate.sql` before
this migration and `award-central-post-gate.test.sql` afterwards (10 assertions)
to retain the previous active-version read, immutability and supersession
checks without bypassing the new block. `award-central-concurrency.test.sql`
(9 assertions) verifies that concurrent edits and duplicate inserts serialize
correctly. These fixtures write committed synthetic rows and the concurrency
fixture uses privileged local database connections: run them **only** on an
explicitly identified, verified disposable Supabase database.

`tests/award-central-source-snapshots.integration.test.mjs` exercises the
service-role writer through PostgREST against an explicitly disposable local
Supabase stack; it is skipped unless the `BUTTERBOX_TEST_*` disposable-database
variables are set. Existing attendance, timesheet, payroll and Xero modules
are unchanged. Do not deploy the migrations or represent the foundation as
payroll-ready until integration review completes.

The Award Central migrations are numbered `20261102200000`, `20261102210000`
and `20261102220000`, after the roadmap branch's latest migration
(`20261102190000_canonical_payroll_records.sql`). The foundation migration was
previously `20261102080000`, which duplicated the attendance offline-claims
version and prevented any clean migration replay; it was renumbered before
being applied to any shared environment.

## Current acceptance evidence

| Criterion | Evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| BB-PAYRULES-002.1 | One shared, untenanted instrument/version library; versions are effective-dated and published versions are immutable. | Foundation pgTAP 48/48; pre-gate legacy rehearsal 10/10 covers active-only reads and immutability. Tenant membership is not verified by the catalogue read policy, and new publication is blocked. | Blocked |
| BB-PAYRULES-002.2 | Lifecycle fields, source snapshot, clause references and evidence fields exist; publication now fails closed. | Foundation pgTAP 48/48. Mandatory validation evidence and clause-level rate provenance before governed publication are not yet implemented (BB-PAYRULES-020/021). | Blocked |
| BB-PAYRULES-002.3 | Customer write grants are revoked; customers cannot supersede, activate or edit central versions. | Foundation pgTAP 48/48 (authenticated update rejected with 42501). Tenant-owned award configuration does not exist yet, so cross-tenant configuration isolation is untested (BB-PAYRULES-001/003). | Blocked |
| BB-PAYRULES-002.4 | No calculation service or result-provenance record exists yet. | No calculation test exists; depends on BB-PAYRULES-004 onwards. | Blocked |
| BB-PAYRULES-002.5 | Tenant-specific agreement rulesets are not implemented. | No agreement isolation test exists. | Blocked |
| BB-PAYRULES-017.1 | A bounded official-host HTTP acquisition interface exists, but no provider endpoint schema, credentials or document parser is configured. | Mocked transport tests passed; no live Fair Work Commission API or award document was fetched. | Blocked |
| BB-PAYRULES-017.2 | Snapshot schema and service-role writer retain original bytes, URL, retrieval time, source revision, effective dates, variation references and a database-computed content hash. | Node 6/6 plus the disposable-stack integration test 1/1 (original bytes and hash round-trip, duplicate rejected with 23505, rewrite and customer read/insert rejected with 42501). Not yet exercised with live FWC content (017.1). | Blocked |
| BB-PAYRULES-017.3 | Known MAPD applicability, entitlement, agreement, variation-monitoring and full-clause gaps are mandatory unresolved metadata. | Node 6/6 and pgTAP (MAPD row without gaps rejected with 23514). | Pass |
| BB-PAYRULES-017.4 | Failed, redirected, empty, oversized and invalid-date acquisitions reject; acquired sources are always staged. | Node 6/6 and pgTAP (`status` is constrained to `staged`); source-specific ambiguity detection is not implemented. | Blocked |
| BB-PAYRULES-013.1 | Draft central scenarios and separately entered expectations can be staged for the required coverage areas. | Regression pgTAP 59/59. No independently authenticated expert-reviewed golden cases or deterministic runner exist. | Blocked |
| BB-PAYRULES-013.2 | Coverage labels include DST, midnight, minimum engagement, cumulative hours and effective dates. | Regression pgTAP 59/59 verifies staging and rejects unknown categories; actual boundary calculations cannot yet be tested. | Blocked |
| BB-PAYRULES-013.3 | New publication is unconditionally blocked; the draft report flags missing categories, contradictions, unresolved and stale cases. | Foundation pgTAP 48/48 and regression pgTAP 59/59; independently verified coverage, actual test results and a usable publication gate remain unimplemented. | Blocked |
| BB-PAYRULES-013.4 | Source, claimed preparer/reviewer, limitations and a draft-version fingerprint are retained in immutable staging records. | Regression pgTAP 59/59 and concurrency rehearsal 9/9. Specialist identity, test-run provenance and signoff are not yet established; no government certification is claimed. | Blocked |

Feature-branch checkpoint: the three Award Central migrations were replayed on
a verified, disposable Supabase PostgreSQL container; foundation pgTAP 48/48,
regression pgTAP 59/59, legacy rehearsal 10/10 and concurrency rehearsal 9/9
passed. This database-only fallback is not a full-stack Supabase or merged
roadmap test. The previous checkpoint's merge against roadmap commit `90f29fd`
passed 43 database test files / 2,026 assertions and 146 Node tests, but did not
include this regression-evidence migration. **Repeat merged migration replay,
database and integration tests, TypeScript, ESLint and production build before
integration.** Live FWC access and production build remain unverified.
