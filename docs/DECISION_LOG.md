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

---

## DEC-002 — Venue roster week start and notification channel defaults

- **Date recorded:** 2026-11-02
- **Related story:** `BB-ORG-006 — Business configuration`
- **Related dependency:** `BB-COMMS-003 — Email and push delivery` (plus future SMS and WhatsApp channel delivery/integration work)
- **Decision owner:** Butterbox product owner
- **Status:** Product direction confirmed; delivery integrations and channel-specific governance pending

### Confirmed product decisions

1. **Roster week start is configurable per venue**, defaulting to **Monday**. A business with multiple venues may choose different roster display starts for each venue.
2. **Changes are prospective only.** Never rewrite immutable published roster versions, historic timesheets, payroll periods or already finalized calculations merely because the venue changes its preferred week start. Roster display-week configuration is distinct from payroll-period boundaries.
3. **Essential operational notifications are enabled in-app by default**, with tenant and user permissions enforced. Essential events include relevant roster publication/changes, shift offer/swap outcomes, approval decisions and attendance correction outcomes, where supported.
4. **Email, push, SMS and WhatsApp are additional OPTIONAL delivery channels**, not mandatory or automatically enabled by the venue's essential in-app default. Make the channel architecture extensible without falsely claiming a channel is available before its provider and workflow are implemented.
5. Optional channels require explicit, appropriately recorded recipient choices and consent or other verified lawful basis where relevant; honor opt-outs, verified contact/address ownership, per-channel delivery preferences, safety/privacy, message sensitivity, quiet hours where applicable, local messaging rules and provider policies. Do not assume WhatsApp/SMS can be sent solely because a mobile phone is on file.

### Implementation instructions — Main Roadmap Agent

**Venue week-start controls:**

- Add an owner-authorized, audited week-start setting to each venue (ISO day-of-week 1–7, Monday default) with clear help text distinguishing the display week from payroll week/period definitions.
- Apply the setting to future roster navigation, week labels, date-range selection and appropriate venue-specific planning displays. Preserve stable dates and timezone behavior (including DST); never silently alter historic shift timestamps, published snapshots or payroll boundary semantics.
- A change should take effect prospectively using a documented effective-date or equivalent versioned configuration, and should not re-interpret historic documents. If an existing workflow cannot honor the chosen start safely, clearly prevent that action or retain the prior semantics with an explanation rather than silently migrating history.
- Use one canonical, server-validated definition of display-week calculation; tenant and venue scope must be enforced in database/API operations, not just UI.

**Notification settings and delivery:**

- Define a channel-neutral event taxonomy and a durable notification/outbox model with in-app delivery as the default for essential events. Distinguish essential operational notices from optional reminders and marketing/promotional messages.
- Retain required in-app notices even when a recipient disables optional external channels. Expose understandable per-channel employee preferences and venue defaults without allowing a venue to override a recipient's legally required opt-out or consent choice.
- Prepare optional provider adapters for email, push, SMS and WhatsApp with separate feature flags/capabilities, delivery state, deduplication/idempotency, retries, auditable event history and safe redaction. Do not activate a channel until credentials, provider contracts, consent and deliverability tests have been approved.
- For SMS and WhatsApp, explicitly consider Australian Spam Act / ACMA and Privacy Act requirements where applicable, sender identification, unsubscribe rules for commercial messages, WhatsApp Business opt-in and approved template/conversation rules, international number formats, costs and messaging-provider rate limits. Classify each event correctly rather than treating every notification as marketing.
- Preserve tenant isolation and authorized recipient scope; avoid putting sensitive employment/pay information in lock-screen, SMS or WhatsApp message bodies. Prefer a short, privacy-conscious notice linking to authenticated Butterbox detail.

**Verification:**

- Test default Monday, alternate per-venue starts, multi-venue timezone isolation, week navigation across year boundaries/DST, prospective config change and unchanged historical published rosters/timesheets/payroll periods.
- Test authorization, audit, tenant separation, employee preferences and opt-outs, channel eligibility, required in-app delivery, external-provider disabled/unavailable states, idempotency, retries and race conditions. Use targeted pgTAP, Node, authenticated integration and browser checks; broader regression before release.
- Keep `BB-ORG-006` **Blocked / Partially Complete** until accepted week-start transition semantics and notification criteria are implemented and tested; do not mark email, push, SMS or WhatsApp delivered without live end-to-end evidence.

### Final owner decisions — 2026-11-02

The product owner has additionally confirmed the following details, which supersede any earlier ambiguity in this entry:

1. **Roster week start affects planning and display only.** A venue's selected week start controls its roster calendar/navigation and planning presentation. **Payroll-period boundaries remain independently defined and unchanged.** Do not silently change publication version boundaries or historic published records when the setting changes. Apply new display preferences prospectively.
2. **Optional notification control uses venue defaults plus employee preferences and consent.** Owners manage channel availability and suggested defaults per venue; each employee controls their own optional delivery channels. A venue default never overrides missing consent or an opt-out. In-app essential operational notices remain on.
3. **Quiet hours:** Defer routine **external-channel** notifications until the permitted delivery window. A narrowly classified **urgent operational** event may bypass quiet hours **only through channels enabled and lawfully permitted for that recipient**. No blanket urgency override of consent, unsubscribe or provider rules. In-app event creation is not delayed by external quiet hours.

Implement a central event urgency classification, timezone-aware quiet-hour scheduling, queueing, idempotent delivery and auditability. Define initial quiet-hour clock times and the explicit list of urgent event types through separately recorded configuration/launch decisions; do not invent them as settled policy. If channel delivery is not configured, preserve the in-app notification and show external delivery as unavailable/pending, not sent.

### Remaining dependencies and open questions

1. **`BB-COMMS-003`:** External email/push delivery not yet completed; decide whether week-start controls and essential in-app defaults can be accepted independently before the full story is closed.
2. **SMS/WhatsApp integrations:** Provider selection, budgets, onboarding, credentials, sender registrations, verified opt-in/opt-out and end-to-end test identities are not yet approved. Track these as separately estimated follow-on work, not silently folded into completed COMMS-003.
3. **Business/product details:** Confirm whether venue defaults for optional channels are exposed in the initial release, what optional notification categories can be configured, and desired quiet-hour policy. The choice of optional channel does not itself authorize sending.
4. **Payroll periods:** Keep existing Monday-aligned payroll-period behavior unless separately approved for change; any future adjustable payroll periods need dedicated impact assessment and migration design.

### Record provenance

Recorded after the product owner's explicit instruction: *“For Butterbox DEC-002 / BB-ORG-006, my roster week configuration choice is configurable by venue, Monday default, prospective changes. My notification choice is essential in-app on by default and optional email/push. Additional requirements: SMS AND WhatsApp Are additional options.”*

---

## DEC-003 — Isolated demonstration business and clean customer conversion

- **Date recorded:** 2026-11-02
- **Related story:** `BB-SAAS-003 — Tenant onboarding and support`
- **Decision owner:** Butterbox product owner
- **Status:** Product direction approved; production isolation and legacy-data verification outstanding

### Confirmed product decision

1. Butterbox will offer **a dedicated, clearly labeled, isolated demo business** for demonstration and evaluation. Demo/sample records must not be inserted into genuine customer operating businesses.
2. When a demo prospect becomes a paying customer, they **start with a completely clean real business** using the standard onboarding flow. **No demo data or configuration is migrated** to the production customer tenant: no example employees, rosters, timesheets, payroll records, approvals, roles, venue settings or other simulated records.
3. The existence of a demo must never auto-enable sample-data generation for real tenants. Existing sample-data behavior is disabled by default, and only explicitly authorized demonstration operations may create demo records.
4. Demo data must be visibly marked as fictional and must never be processed as genuine attendance, payroll, employment compliance evidence, production reports or messages to real workers.

### Main Roadmap Agent implementation instructions

- Establish and document an **isolated demo boundary**. Prefer a separately configured demonstration deployment/database/project, with different credentials, integrations and storage from live customer production. A specially labeled tenant alone is not sufficient proof of hard environmental isolation. If hosting isolation is not yet available, retain fail-closed disabled status rather than implying deployment is ready.
- Restrict demo creation, resets and access to authorized users. Tag demo records and environments explicitly; guard all API, onboarding, invitation, reporting, job, payroll, outbound notification, export and integration paths against accidental production use.
- Hard-disable real payroll exports, live worker invitations and any external email/SMS/push/WhatsApp delivery in the demo unless a deliberately isolated test provider/recipient configuration is in place. Use synthetic people and test credentials only.
- In production, default sample generation **off** with server/database enforcement, not merely a hidden button. Remove or constrain any operator override that could enable sample insertion into live customer tenants without the approved isolation controls.
- On conversion, create a **new clean real tenant** through normal business → venue → staff → shift → publish onboarding. Do not copy the demo business, its configurations or any records; establish fresh permissions and tenant identity. No demo-tenant foreign keys, derived records or artifacts should remain linked to the new tenant.
- Make demo status prominent in the UI and any exports; record audited demo provisioning/reset/deletion and clean real-tenant creation.
- Keep the existing onboarding checklist and inline help functioning for genuine new tenants.

### Acceptance and evidence required

Run focused tests in disposable/authorized environments for:

1. Distinct demo vs production project/database, credentials and storage boundaries; no shared write path.
2. Two-tenant authorization/RLS and scoped demonstration access.
3. Attempted sample insertion into live customer businesses, including privileged paths and direct API access: deny by default.
4. Demo signup/invitation and external provider paths: no real outbound delivery, payroll or financial processing.
5. Demo-to-paid conversion creating a fresh, blank operational tenant; assert zero demo employees, roles, configuration, shifts, attendance, timesheets, payroll records and links are copied.
6. Concurrent/retried conversion, idempotent provisioning and recovery from partial failures.
7. Onboarding checklist and help remaining usable; visible demo labels and accessible UI.
8. Existing production historical-data assessment: check whether any sample data was already inserted. Do not assume an empty historical state or perform unapproved deletion; document findings and safely quarantine/remediate under owner authorization.

### Remaining verification blockers

- **Production access/owner authorization:** No verified production environment inventory or evidence that historic sample/demo records are absent. A scoped, read-only assessment is required before claiming clean production separation.
- **Demo infrastructure:** Confirm provisioning, credentials, permissions, storage, integration keys and an actual separate demo environment. Do not copy production datasets or secrets into demo.
- **Operational safeguards:** Demonstrate that privileged operator controls cannot bypass sample restrictions or route outbound effects into real providers.
- **Migration/conversion acceptance:** Prove new real customers start with an entirely clean tenant and no sample configuration copied.

These are operational and technical proof requirements, not further open product-preference questions. Maintain `BB-SAAS-003` as **Blocked / Partially Complete** until the full acceptance criteria and production-isolation evidence pass. Continue unrelated ready roadmap work.

### Record provenance

Recorded after the product owner's explicit direction: *“For Butterbox DEC-003 / BB-SAAS-003, I choose a dedicated isolated demo business. When converting to a paying customer, start with a completely clean real business.”*
