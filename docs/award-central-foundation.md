# Butterbox Award Central — foundation architecture

**Scope:** BB-PAYRULES-002 central library foundations and the source-capture
boundary for BB-PAYRULES-017. This is intentionally not an award interpreter,
a live rule publisher, or a payroll calculation service.

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
Only trusted schema operators may write drafts; this is not yet a production
publication authorisation model. The DDL guard prevents mutation of approved
versions and allows active versions only to be superseded, never rewritten.

## Testing and rollout

`supabase/tests/database/award_central_foundation.test.sql` (47 assertions)
covers schema, provenance, source immutability, SQL grants, the review-gated
activation lifecycle, in-place rewrite and deletion rejection, supersession
immutability and authenticated read access limited to active versions.
`tests/award-central-source-snapshots.integration.test.mjs` exercises the
service-role writer through PostgREST against an explicitly disposable local
Supabase stack; it is skipped unless the `BUTTERBOX_TEST_*` disposable-database
variables are set. Existing attendance, timesheet, payroll and Xero modules
are unchanged. Do not deploy the migrations or represent the foundation as
payroll-ready until integration review completes.

The Award Central migrations are numbered `20261102200000` and
`20261102210000`, after the roadmap branch's latest migration
(`20261102190000_canonical_payroll_records.sql`). The foundation migration was
previously `20261102080000`, which duplicated the attendance offline-claims
version and prevented any clean migration replay; it was renumbered before
being applied to any shared environment.

## Current acceptance evidence

| Criterion | Evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| BB-PAYRULES-002.1 | One shared, untenanted instrument/version library; versions are effective-dated, enter as drafts and are immutable once approved, active or superseded; authenticated users read only active versions. | pgTAP `award_central_foundation.test.sql` 47/47 on a disposable replay, including active-only authenticated reads, rejected in-place rewrite/delete and immutable superseded versions. | Pass |
| BB-PAYRULES-002.2 | Lifecycle states, source URL/hash/snapshot, clause references and evidence JSON exist; drafts cannot bypass review. | pgTAP 47/47. Mandatory validation evidence and clause-level rate provenance before publication are not enforced yet (BB-PAYRULES-020/021). | Blocked |
| BB-PAYRULES-002.3 | Customer write grants are revoked; customers cannot supersede, activate or edit central versions. | pgTAP 47/47 (authenticated update rejected with 42501). Tenant-owned award configuration does not exist yet, so cross-tenant configuration isolation is untested (BB-PAYRULES-001/003). | Blocked |
| BB-PAYRULES-002.4 | No calculation service or result-provenance record exists yet. | No calculation test exists; depends on BB-PAYRULES-004 onwards. | Blocked |
| BB-PAYRULES-002.5 | Tenant-specific agreement rulesets are not implemented. | No agreement isolation test exists. | Blocked |
| BB-PAYRULES-017.1 | A bounded official-host HTTP acquisition interface exists, but no provider endpoint schema, credentials or document parser is configured. | Mocked transport tests passed; no live Fair Work Commission API or award document was fetched. | Blocked |
| BB-PAYRULES-017.2 | Snapshot schema and service-role writer retain original bytes, URL, retrieval time, source revision, effective dates, variation references and a database-computed content hash. | Node 6/6 plus the disposable-stack integration test 1/1 (original bytes and hash round-trip, duplicate rejected with 23505, rewrite and customer read/insert rejected with 42501). Not yet exercised with live FWC content (017.1). | Blocked |
| BB-PAYRULES-017.3 | Known MAPD applicability, entitlement, agreement, variation-monitoring and full-clause gaps are mandatory unresolved metadata. | Node 6/6 and pgTAP (MAPD row without gaps rejected with 23514). | Pass |
| BB-PAYRULES-017.4 | Failed, redirected, empty, oversized and invalid-date acquisitions reject; acquired sources are always staged. | Node 6/6 and pgTAP (`status` is constrained to `staged`); no activation path is provided. | Pass |

Session validation (feature branch): full disposable migration replay
succeeded; full pgTAP suite 41 files with all non-Award files passing and the
Award Central file 47/47; Node suite 130 tests (113 passed, 17 environment-
dependent skipped, 0 failed); TypeScript passed; ESLint passed. Production
builds are terminated externally (SIGTERM from outside the container) under
host memory pressure and remain unverified.
