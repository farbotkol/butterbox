# Issue #249 / PR #252 / attempt 01

## Scope
Stage A only: add a non-gating fast database smoke candidate, nightly/manual full regression, and a cutover/rollback strategy. Existing required Verify and database checks are untouched.

## Delivered
- .github/workflows/fast-database-candidate.yml: isolated Supabase, pgTAP, tenant isolation, four critical authenticated browser tests, bounded artifacts.
- .github/workflows/full-regression.yml: complete database and auth regression at 15:00 UTC daily or manual exact-SHA release candidate run.
- docs/CI_TEST_STRATEGY.md: timezone behavior, release SHA checks, future change-aware routing, performance measurement, protected cutover and rollback.

## Evidence
The four selected smoke test titles were confirmed to exist in tests/e2e/auth.spec.mjs. Static source inspection only; GitHub Actions run and security review are pending. Existing required jobs and Phase 2 automation remain unchanged. This is partial issue #249 delivery, not complete acceptance or a release authorization.

## Remaining
Measured CI duration, nightly failure alerting, risk-based targeted selection, manual release verification, ruleset changes and production rollout remain open. Do not auto-merge or deploy.
