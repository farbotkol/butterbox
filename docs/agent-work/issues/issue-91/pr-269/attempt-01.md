# Issue 91, PR 269: Xero mapping destination bridge

## Scope
Partial delivery of Issue #91. Authorised Xero organisations automatically become
mapping destinations through an idempotent database trigger and an existing-tenant
backfill. Existing destination mappings are preserved. Owners can navigate from
the Xero connection to employee mappings; manual Xero destination creation is
removed from the generic destination form.

## Acceptance
- AC-1 (organisations auto-linked): implementation prepared, database test extended;
  pending hosted CI validation and deployment.
- AC-2 (employee mapping): existing audited manual workflow reused. Automatic Xero
  employee lookup is NOT implemented in this PR.
- AC-3 (Xero timesheets submission): BLOCKED, intentionally not implemented.
  Additional OAuth read permissions, employee verification, calendars, earnings
  rate mapping, preflight, explicit owner approval, idempotency, duplicate
  reconciliation and demonstration on a non-production account remain required.

## Verification
Changes have been committed to a draft branch; no local test run, full CI pass,
database deployment or Xero provider write has been performed. Verify the pgTAP
assertions and required GitHub status checks before review/merge. Database
migration and production rollout must use the existing gated deployment process.

## Changed files
- supabase/migrations/20261116150000_xero_connected_payroll_destinations.sql
- supabase/tests/database/xero_oauth_connections.test.sql
- src/app/settings/payroll/new/page.tsx
- src/app/settings/payroll/xero/page.tsx
- docs/xero-payroll-delivery.md
- docs/agent-work/issues/issue-91/pr-269/attempt-01.md
- docs/agent-work/issues/issue-91/pr-269/attempt-01.evidence.json
