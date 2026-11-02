# Butterbox Product Decision Log

This log records owner product directions separately from implementation completion and legal/operational approvals. Decisions here do not override acceptance tests, security gates, or statutory advice.

## DEC-001 — Customer exit, employment record export and controlled deletion

- **Date recorded:** 2026-11-02
- **Related story:** `BB-RULES-005 — Privacy and retention policy`
- **Decision owner:** Butterbox product owner
- **Status:** Product direction confirmed; durations proposed; legal/operational approval pending
- **Scope:** Australian café customers, tenant cancellation, access to historical employment records, export and deletion

### Confirmed product decision

Use a **café-owned exported records** model after subscription cancellation. Butterbox should provide a secure, comprehensive portable export, a defined post-subscription retrieval period, and controlled deletion of eligible customer data after that period. The café/employer remains responsible for its own applicable long-term employment recordkeeping obligations. Do not assume Butterbox must host every cancelled customer's records for seven years.

Operational account closure and loss of access must **not** directly cascade-delete protected employment records. Preserve records while export, retention, legal-hold and deletion eligibility checks remain unresolved. Customer and employee access, export, archive status and permanent deletion are distinct operations.

### Proposed implementation defaults — not yet individually confirmed

These dates are **proposals awaiting explicit owner confirmation**, measured from the effective subscription end date, not the initial cancellation request:

1. Normal service through the paid subscription end date.
2. **60 days** of authorized-owner, read-only historical access and secure export after subscription expiry (proposed to be included without an additional fee; commercial detail not yet confirmed).
3. Retrieval access ends at day 60, with warnings at 30, 7 and 1 days before access ends, subject to verified notification delivery or operator follow-up.
4. **Target day 90** for eligible data deletion, not a guaranteed unconditional purge.

Deletion must **fail closed** if export availability/handover, acknowledgment, applicable preservation requirements, legal hold, recovery controls or approval is unresolved. An unsuccessful download is not sufficient evidence of successful handover. Missing acknowledgment or failed notification requires escalation, not automatic destruction.

### Export scope and customer experience

Provide tenant-scoped human-readable **CSV** and structured **JSON** records, as appropriate, including:

- Employee profiles, employment status and effective-dated classification/award/contract references.
- Clock-in/out records, breaks, attendance corrections and approval evidence.
- Timesheets, worked hours, approval and payroll-period history.
- Published rosters, relevant versions and shift history.
- Payroll export batches, mappings and reconciliation details held by Butterbox.
- Relevant audit evidence (actors, timestamps, changes, reasons and identifiers).

Add a manifest containing schema version, date coverage, counts and SHA-256 checksums. Explicitly disclose data that Butterbox does **not** hold, such as records retained exclusively by external payroll providers. Generate large exports asynchronously, use authorization-controlled short-lived retrieval links, and log export generation, download and customer acknowledgment separately.

### Engineering guardrails and acceptance

- Prevent privileged or ordinary business deletion from bypassing preservation and policy checks; do not enable live permanent deletion merely because a database cascade exists.
- Isolate exports and deletion to the correct tenant; preserve shared user identities and other tenants' records.
- Enforce read-only access server-side, not only by hiding controls.
- Provide audited, idempotent, resumable, scoped deletion/de-identification; legal holds and uncertain retention status block execution.
- Govern storage objects, derived data, provider copies and backups with documented retention and expiration. Never destroy a shared backup in a way that affects another tenant.
- Verify cancellation transitions, access control, multi-tenant isolation, portable export completeness/checksums, concurrency, retries, interrupted deletion, legal holds, failed acknowledgment, notification failures and protected-record preservation with targeted database, authenticated integration, Node and browser tests in disposable environments.
- Keep `BB-RULES-005` **Blocked / Partially Complete** until preservation requirements, legal review and operational controls meet the actual acceptance criteria. Other independently ready roadmap stories can proceed.

### Outstanding approvals / follow-up

1. **Owner:** Confirm whether the proposed 60-day read-only window, 90-day deletion target and no-extra-fee retrieval are the final commercial policy.
2. **Australian legal/privacy reviewer:** Confirm applicable Fair Work, tax, privacy and other retention obligations, controller/service-provider responsibilities, exceptions, customer terms, notices and lawful deletion schedule. Seven-year employment-record retention is generally an employer obligation, not a blanket authorization for Butterbox to erase all records after day 90.
3. **Operations/security:** Approve legal-hold workflow, backup expiration and hosted recovery, deletion authority, evidence retention, incident recovery and support escalation.
4. **Roadmap Agent:** Implement non-destructive cancellation, read-only archive, export and policy controls first. Keep destructive production deletion disabled until above approvals are recorded.

### Record provenance

Recorded following the product owner's explicit request: *“For Butterbox BB-RULES-005, I prefer café-owned exported records with a defined retrieval period and controlled deletion after cancellation.”* The 60/90-day timeline and detailed implementation safeguards were recommended afterward but have not yet been separately approved by the owner.
