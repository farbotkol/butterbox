# Payroll delivery foundation

## PAY-DELIVERY-001 — Foundation Ready, not a delivery feature

`src/lib/payroll-delivery-policy.ts` provides a provider-neutral deterministic
idempotency key derived from the immutable payroll export batch and its
finalisation, plus a bounded exponential retry-delay calculation. The key is
stable across attempts for the same export/finalisation and changes when either
identity changes. The retry helper schedules only failures explicitly
classified by an adapter as transient; permanent and unknown failures stop.
Attempt count and delay bounds are explicit inputs, with validation and a
24-hour maximum delay. No provider-specific error is classified by this module.

The existing export batch and finalisation are immutable and the export-creation
request is already idempotent. That protects generation of the local CSV batch;
it does **not** make external delivery idempotent.

This slice does not persist attempts, create an outbox, send a request, verify a
provider receipt, write delivery audit events, reconcile external payroll
status or expose a user interface. No provider sandbox or disposable database
was used. Therefore BB-PAY-008 remains Backlog: durable duplicate prevention,
provider-specific retry safety and audit/reconciliation UI still require
implementation and end-to-end verification with an authorised isolated
provider account.

No User Guide update is applicable until an actual delivery workflow is
available. No payroll was sent, and no payroll or award-calculation correctness
is claimed.
