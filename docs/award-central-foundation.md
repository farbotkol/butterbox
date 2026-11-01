# Butterbox Award Central — foundation architecture

**Scope:** Initial schema foundation for BB-PAYRULES-002. It is intentionally not an
award interpreter, a live rule publisher, or a payroll calculation service.

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

## Source and AI integration contracts (design, not implemented)

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

## Security boundaries

Authenticated users can read instrument names and **active** shared versions;
they cannot read unpublished version content or mutate either table. Anonymous
users have no access. RLS and table grants jointly enforce the boundary.
Only trusted schema operators may write drafts; this is not yet a production
publication authorisation model. The DDL guard prevents mutation of approved
versions and allows active versions only to be superseded, never rewritten.

## Testing and rollout

`supabase/tests/database/award_central_foundation.test.sql` provides pgTAP
schema and SQL grant checks. Before merging, run a clean disposable migration
replay, full pgTAP suite and authenticated read/write security tests for an
actual pair of business memberships. Existing attendance, timesheet and Xero
modules are unchanged. **No database tests have been executed by this
GitHub-only contributor.** Do not deploy the migration or represent the
foundation as payroll-ready until integration review completes.
