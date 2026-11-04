# QuickBooks integration discovery

**Reviewed:** 2026-11-04
**Story:** BB-PAY-007 — QuickBooks discovery and adapter
**Decision:** Product discovery is complete. QuickBooks is not a supported
Butterbox payroll adapter; do not mark it available or imply payroll delivery.

## Verified product distinctions

1. Intuit's [Australian QuickBooks Payroll timesheet tutorial](https://quickbooks.intuit.com/au/advisor-resource-centre/create-time-sheets/)
   documents employees using EH Work to add and submit timesheets, with work
   type, work award, location, date, start/end times, breaks and notes. This
   documents entry in that product workflow; it does not document importing
   Butterbox data.
2. Intuit's [QuickBooks Online developer reference for `TimeActivity`](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/timeactivity)
   is in the Accounting API documentation hierarchy. The reference page
   rendered only its JavaScript shell during review, so no further API behavior
   is inferred. Its existence does not establish an Australian QuickBooks
   Payroll timesheet import or compatibility with Butterbox exports.
3. Intuit's [US QuickBooks Time CSV help](https://quickbooks.intuit.com/learn-support/en-us/help-article/time-tracking/export-import-time-data-quickbooks-time/L1f77o0jJ_US_en_US)
   describes historical time-data CSV import/export for QuickBooks Time. It is
   a distinct product and a US help page; it is not evidence of support for
   Australian QuickBooks Payroll.

## Butterbox status and gate

The QuickBooks option in payroll employee mapping is a destination label only.
The screen states that mapping is not an authenticated provider connection and
that no payroll is sent. The generic payroll CSV contains no external payroll
IDs. There is no verified QuickBooks Payroll connection, OAuth configuration,
provider-specific export/import or end-to-end integration test. Keep any
QuickBooks adapter unavailable until the product path, account eligibility,
authorization, field mapping, safe retry/reconciliation behavior and isolated
provider test company are established and integration-tested.

## Acceptance evidence

- **PAY007-01:** Product workflows and the boundaries of available evidence
  are documented above and in the role-based User Guide.
- **PAY007-02:** No adapter is represented as available; no integration test
  or provider connection is claimed. The availability gate is preserved.

No showcase, database, credentials, or customer data were changed.
