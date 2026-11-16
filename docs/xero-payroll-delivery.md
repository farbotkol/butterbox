# Xero connection → payroll delivery

## Implemented in this change (mapping destination)
- When an owner/admin selects a Xero OAuth organisation, the database creates one
  payroll mapping destination, with `account_id` set to the Xero tenant UUID from
  the authenticated grant. A form cannot supply or replace that ID.
- Existing connected organisations, including a connected Demo Company (AU), are
  backfilled when the migration is deployed.
- The unique (business_id, provider, account_id) constraint and ON CONFLICT make
  reconnects idempotent, preserving any existing mappings and user-entered names.
- In the UI Xero destinations are no longer manually created. Users follow
  Connect a Xero organisation and Manage employee mappings.
- No data is posted to Xero. A mapping destination is not proof of payroll access.

## Existing functionality reused
- Employee-to-provider ID mappings already exist in the payroll directory, with
  owner/admin permissions, audit history, duplicate checks and finalisation gates.
- Canonical payroll records and provider-specific records already exist. They
  are inputs to future adapters, not a verified Xero timesheet payload.

## Required before actual employee synchronisation and payroll submission
1. Request the minimum necessary additional Xero OAuth scopes
   (`payroll.employees.read`, `payroll.settings.read`) and explicitly
   reauthorise existing connections. Do not silently broaden OAuth permissions.
2. Read employees and verify exact EmployeeID against the connected tenant;
   provide a human-confirmed mapping review for identical names, inactive
   workers, missing employees and multi-venue workers.
3. Read the AU payroll calendars, earnings rates and payroll setup entitlement.
   Confirm the selected calendar, earnings rate and per-day units with the owner.
4. Use Xero Payroll AU Timesheets **2.0**, not deprecated v1. Implement a
   deterministic dry-run/preview with validation of completed payroll periods,
   local dates, breaks/approved hours, rounding, mapped worker identities,
   calendar boundaries, earnings rates and existing remote timesheets.
5. Write draft timesheets only after an explicit owner confirmation for a
   specific tenant and period. Build a durable tenant+period+employee idempotency
   ledger, per-record results and retries that query Xero first to avoid a
   duplicate after timeouts. Do not auto-approve or auto-submit pay runs.
6. Verify Australian Demo Company payroll API access read-only before sending,
   then conduct an owner-approved isolated test with synthetic data.
   No real wages, employee personal data, or live submission should be used
   until payroll reconciliation and rollback procedures are approved.

Reference: https://developer.xero.com/documentation/api/payrollau/timesheets
Reference: https://developer.xero.com/documentation/guides/oauth2/scopes/

## Deployment and validation
- This is a draft PR. Run the required database, verify and coordination checks.
- The migration must be applied using the established Development migration
  workflow after CI has passed and the PR has been reviewed.
- Verify the connected Xero tenant appears as one destination in Payroll and
  reconnecting does not duplicate it. Check an existing destination's mappings
  remain intact. Confirm no Xero API write requests are made.
- Actual database migration, test execution and production deployment have NOT
  been performed by this change.
