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

---

## DEC-004 — Historical credential exposure: assessment before rotation

- **Date recorded:** 2026-11-02
- **Related story:** `BB-FOUND-001 — Create production-ready application`
- **Decision owner:** Butterbox product owner
- **Status:** Assessment and classification authorized; remediation/rotation requires separate explicit approval

### Confirmed decision

The Main Roadmap Agent is authorized to **inventory, assess and classify suspected historical Supabase credential exposure** in the repository and accessible development checkpoint refs. **No credential rotation or other secret changes are authorized at this stage.** The agent must deliver a redacted findings report and proposed remediation actions for owner approval before changing credentials.

The known report concerns historical keys in local Git checkpoint refs despite a clean current branch/checkout scan. This does **not** yet establish that a privileged, active or production secret was exposed. Determine key type, environment, historical locations, likely scope of access, revocation status where safely verifiable, and the relevant uncertainty.

### Agent authority and safety boundaries

**Authorized now:**
- Read-only examination of the Main Roadmap Git history, accessible local checkpoint refs, current checked-out files and available repository metadata/secret-scanning alerts.
- Non-invasive classification of candidate values as expected-public/publishable, local development, privileged server-side/service role, database credential, signing secret or unknown.
- Use offline/redacted fingerprinting to correlate duplicates; record file paths, commit/ref references and abbreviated hashes only. Never expose secret values, tokens, private keys, or credential-bearing URLs in commits, prompts, issue comments, logs, status files or report output.
- Review gitignore patterns, secret-handling documentation and secret-scanning safeguards; propose corrective changes, but do not create new secret-containing artifacts.
- Produce a concise risk-ranked inventory and credential-dependency/rotation plan with explicit owner decision points. If an active privileged secret is suspected, report promptly through a private approved channel without reproducing it.

**Not authorized without further owner approval:**
- Rotating, revoking, regenerating, replacing, testing live privileged access with, or modifying **any** credential (including development/staging credentials).
- Editing production infrastructure, modifying databases/customer records, changing Supabase project security settings or configuring new remote secrets.
- Rewriting/removing Git history, deleting refs/branches/tags, force-pushing, deleting repositories or projects, or performing destructive cleanups.
- Sharing findings containing actual credential strings in public GitHub or other external channels.
- Penetration testing, trying credentials against remote endpoints, or performing privileged access tests beyond authorized read-only metadata review.

If a high-severity, apparently valid privileged credential is found, **stop and escalate immediately** for expedited owner approval; do not wait for ordinary story completion or take unilateral action.

### Deliverables for owner review

A redacted report with one row per distinct finding:
- Non-secret finding ID and type/classification.
- Environment and likely privilege scope (production, staging, local, unknown).
- Repository location, relevant commit or local ref and duplicate count without secret value.
- Exposure/access surface (e.g. branch, checkpoint ref) and evidence basis.
- Confidence, possible impact and severity, with uncertainty clearly noted.
- Proposed rotation/revocation and dependency-update sequence **without executing it**.
- Whether history remediation is justified after rotation and what it would affect across Core and Award Central branches.

Record what was *not* assessed (unavailable refs, private infra, unknown key validity). Mark checks as verified only where actually supported by evidence; do not claim clean history just because HEAD is clean.

### Completion and next steps

1. Run the authorized **read-only** inventory and classification.
2. Submit redacted findings and recommended remediation order to the owner.
3. Request separate explicit owner approval for any credential rotation, secret-store updates or Git history operation.
4. After approval and execution, independently verify that affected credentials were revoked, replacement-dependent integrations work, secret scanning is in place and no unresolved privileged exposure remains.
5. Keep `BB-FOUND-001` **Blocked** until required remediation and acceptance evidence pass. Continue unrelated ready stories safely.

### Record provenance

Recorded after owner instruction: *“For Butterbox DEC-004 / BB-FOUND-001, I choose assessment and classification first, with separate approval before any credential rotation. Record this decision in the Main Roadmap GitHub decision log, specify the agent's safety boundaries and next steps.”*

---

## DEC-005 — Backup retention and disaster recovery release gate

- **Date recorded:** 2026-11-02
- **Related story:** `BB-FOUND-008 — Resilience and operations`
- **Decision owner:** Butterbox product owner
- **Status:** Recovery and retention targets approved as objectives; hosted validation deferred to pre-production; story remains Blocked

### Confirmed decision and targets

The owner elects to **defer a hosted backup-restoration/disaster-recovery rehearsal until pre-production**, rather than provisioning and paying for an isolated staging restore target immediately. This postpones verification; it is **not** an exception to the production release gate.

Proposed operational objectives, **not measured capabilities or contractual commitments**:

- **RPO: 15 minutes** — target maximum recoverable data-loss window.
- **RTO: 4 hours** — target time to restore usable service.
- **PITR recovery window: 7 days**.
- **Daily backup retention: 30 days**.

All targets require validation of the selected Supabase plan, backup/PITR availability, retention implementation, cost, restore permissions and actual measured recovery performance. Do not claim a 15-minute RPO from daily backups alone; determine whether supported continuous recovery/PITR and operational procedures can meet it. If plan capabilities or costs do not support the targets, escalate with alternatives and obtain a revised owner decision. Never describe targets as already achieved.

Database backups are operational recovery artifacts, **not substitutes for employee-record retention or customer exit exports** under DEC-001. Apply least privilege, encryption, monitored job failures, lifecycle expiration, tenant/privacy safeguards and evidence of backup integrity. Coordinate backup expiry and retention exceptions with the separately reviewed privacy/legal schedule.

### Permitted agent work during development

1. Maintain the existing health/readiness, protected metrics, idempotent retry and backup/recovery runbook work.
2. Document the target restore architecture, prerequisites, environment separation, access roles, dependency configuration, plan cost assumptions, recovery ordering, verification queries and incident escalation.
3. Execute **non-destructive local/disposable** clean migration replay and synthetic fixture backup/restore checks, including tenant/RLS authorization, audit history, timestamp/timezone consistency, attendance/timesheet integrity and prevention of duplicate payroll exports after retry.
4. Add risk-based automated tests and instrumentation to measure restore steps, detect backup failures and validate recovery-state integrity. Clearly label local and mocked evidence as *not a hosted disaster recovery rehearsal*.
5. Record what remains unverified without waiting to continue independently ready Roadmap stories.

Do **not** create or incur costs for hosted staging, activate/alter production backup plans, copy production customer data, restore into production, rotate credentials, remove retention safeguards or run destructive recovery operations without separate explicit owner authorization. Never restore onto a shared or unidentified database. All destructive local testing must verify an explicitly disposable target.

### Mandatory pre-production release gate

Before production activation or declaring disaster recovery ready, an authorized operator must:

1. Identify and authorize an **isolated hosted staging restore destination** and a genuine configured backup/PITR source. Verify project identity, environment, permissions and whether data is synthetic or adequately protected.
2. Verify actual backup scheduling, PITR window, daily retention period, storage/provider charges, encryption, access restrictions, alerts and backup expiration behavior.
3. Rehearse restoring an actual backup/PITR point to the isolated destination **without overwriting production or another tenant's environment**.
4. Measure achieved **RPO and RTO** end to end and compare with the 15-minute / 4-hour objectives. Document restore-point timestamps, incident start, restoration milestones, total elapsed time, integrity checks and any deviations.
5. Confirm application restart/connectivity, authentication, tenant isolation, RLS, audit history, employee records, attendance, finalized payroll periods, reconciled exports and idempotency after recovery.
6. Validate operational runbook reproducibility, monitoring/alerting, failure handling and independent review of evidence.
7. Obtain owner approval of the tested recovery model and any residual risks; if objectives are not met, remediate/retest or explicitly revise the decision before launch.

**Release status:** `BB-FOUND-008` remains **Blocked / Partially Complete** until hosted rehearsal and all acceptance evidence pass. A local database replay alone cannot close the story. A production go-live must not be represented as meeting these RPO/RTO or retention targets without the verification above.

### Dependencies and future authorization

- Supabase plan/pricing and hosted backup/PITR support (to be checked near pre-production).
- Owner-approved staging project, backup source and suitably protected restore target.
- Credential/access provision and observability for test operations.
- Legal/privacy review of backup retention/expiration relative to employee record retention and DEC-001.

### Record provenance

Recorded after explicit owner instruction: *“Finalize Butterbox DEC-005: Hosted disaster recovery rehearsal is deferred until pre-production. Recovery objectives: 15-minute RPO and 4-hour RTO. Backup retention target: 7 days PITR plus 30 days daily backups. These are targets subject to Supabase plan capability, cost and verification.”*


---

## 2026-11-04 — Owner-approved roadmap unblocking decisions

**Record:** [Full implementation handoff](agent-handoffs/2026-11-04-owner-decisions.md). **Decision status:** Approved for development; no implementation/test completion asserted.

- **Venue-based subscriptions:** Every tier includes every feature. Charge **per location**, based on that location's workers: Free 1–3 ($0, unlimited duration), Starter 4–15 ($15), Pro 16–30 ($25), Plus 31–60 ($45), Growth 61–100 ($69), Scale 101–200 ($99), Enterprise 201+ (custom), AUD per venue per month. Workers assigned to two venues count in both. Free live use is distinct from synthetic-data showcase. Verify treatment of zero-worker venues and counting lifecycle before enforcement.
- **AI:** Provider-independent architecture; start manager workflows, support employee read-only assistance afterward. Local development Mac may run Ollama with Qwen3.5 9B primary and Gemma 4 12B comparison after verifying actual tags/resources/licences. Keep business rules and permission checks deterministic, benchmark on synthetic data; no production AI approval.
- **Award Central:** MVP rules content restricted to Restaurant Industry and Hospitality Industry (General) awards, while retaining a generic reusable, versioned deterministic rule framework. Independently validate AI-suggested drafts before activation; no automatic compliance claim.
- **Xero:** New Butterbox developer account requires owner registration/consent. Agent may implement adapter, OAuth scaffolding and mock tests now; verify Australian Payroll demo/API support before claiming integration access. Live integration remains gated.
- **Local Supabase:** Mac Docker/local Supabase is the intended development substrate. P0: introduce separate disposable project `butterbox-agent-test` with independently verified containers, volumes, ports and fail-closed destructive-operation guards; do not modify existing development or showcase resources. Only after verified isolation may database-dependent stories resume.

**Execution:** See linked handoff for complete acceptance criteria, safeguards, testing and workstream ownership. Existing `AGENTS.md` safety requirements take precedence for destructive operations and release gates.
