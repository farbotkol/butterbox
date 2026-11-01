# Butterbox Systems — Master Product Backlog v1.0

**Product:** Multi-tenant Australian hospitality workforce SaaS  
**Brand:** Butterbox Systems — *Less admin. More good days.*  
**Target:** Independent cafés/restaurants with FOH/BOH departments and variable casual pools  
**Architecture:** Next.js + Supabase PostgreSQL/Auth/RLS, server-side domain services, durable background jobs, configurable payroll adapters  
**Status:** Proposed requirements; not a representation of implemented features or regulatory certification.

## Backlog use and rules

- **P0:** pilot-critical; **P1:** sellable product; **P2:** intelligent differentiation or scale.
- Each story is a vertical slice; create a separate GitHub issue or PR with its story ID, acceptance checklist and tests.
- Deliver the smallest functional increment, demo it with fictional staff, verify permissions, test failure paths, and only then mark Done.
- **Definition of Ready:** scope known, role and tenant permissions defined, dependencies identified, acceptance criteria testable, UI states specified.
- **Definition of Done:** acceptance criteria pass; server-side access checks and tenant-isolation coverage where applicable; unit/integration/E2E tests for critical flow; accessible mobile and desktop states; observability/audit; docs; successful build; actual evidence attached to PR.
- Australian award, leave, privacy, minimum-engagement and payroll obligations require product-specific legal/payroll review before claiming compliance. AI must never unilaterally alter paid hours, cancel published shifts, assign staff or send payroll data.

## UX principles and reference screen states

1. **Owner/manager roster:** calm light-first workspace; staff down left and days across top; FOH/BOH collapsible; a single Add Shift action and explicit Publish; details appear in a drawer only when selected.
2. **Employee home:** next shift, Clock In/Out, break, open shifts and notices; one primary action; no spreadsheet squeezed onto mobile.
3. **AI assistance:** unobtrusive Ask Butterbox entry and suggestion chips; AI proposes diffs; Review shows why and impact; Apply performs a fresh server-side permission/conflict check; Undo where safe.
4. **Empty/error/loading:** distinguish empty roster, no eligible staff, offline pending clock event, permissions failure and successful publication.
5. **Visual system:** Cloud `#FAF9F6`, Ocean `#123F4A`, Sea Glass `#83B9BC`, Sand `#F1E7D5`, Sun `#F4BC59`; accessible contrast; minimal clutter.

## Release gates

- **Pilot release:** P0 features that form an end-to-end story: owner setup → invite employees → roster → publish → clock → correct → approve → export verified CSV.
- **Market release:** P1 items with open-shift fulfilment, communications, subscription entitlements, validated payroll provider connection(s), safe AI suggestions if proven useful.
- **Intelligence release:** P2 demand forecasting, optimised staffing, comprehensive award-rule validation, reporting and extended adapters.

## Story catalogue


## Epic FOUND — Platform, identity and multi-tenancy (P0)


### BB-FOUND-001 — Create production-ready application [P0]

**User story:** As a product owner, I want reproducible development, staging and production setups so changes deploy safely.

**Acceptance criteria**

1. A clean checkout installs and builds with documented commands.
2. Environment variables have safe examples.
3. A deployment runs a health check.
4. No secrets are committed.


### BB-FOUND-002 — Register and sign in [P0]

**User story:** As a user, I want secure registration, sign-in, sign-out and password reset so I can access Butterbox.

**Acceptance criteria**

1. Verified accounts can authenticate.
2. Wrong credentials have non-enumerating errors.
3. Session expiry and logout work across tabs.
4. Password reset completes.


### BB-FOUND-003 — Tenant isolation [P0]

**User story:** As a business owner, I want my business data inaccessible to other customers.

**Acceptance criteria**

1. Each tenant-owned record has immutable business association.
2. RLS and API checks reject cross-tenant read/write.
3. Automated tests cover two distinct businesses.


### BB-FOUND-004 — Business and venue permissions [P0]

**User story:** As an owner, I want to assign owner, general manager, FOH manager, BOH manager and employee permissions.

**Acceptance criteria**

1. Permissions are scoped to assigned business, venue and department.
2. Server denies unauthorised actions.
3. UI hides forbidden controls without relying on hiding for security.


### BB-FOUND-005 — Invite and onboard users [P0]

**User story:** As a manager, I want to invite staff by email without creating their passwords.

**Acceptance criteria**

1. Invite expires and cannot be reused.
2. Invited user joins only intended business/venue.
3. Duplicate and revoked invitations are handled.
4. Audit entry is stored.


### BB-FOUND-006 — Switch between business memberships [P1]

**User story:** As a user who works at different businesses, I want to change my active business safely.

**Acceptance criteria**

1. Switch shows only active memberships.
2. API checks each request independently of UI selection.
3. No data leaks across tabs or cached pages.


### BB-FOUND-007 — Audit sensitive actions [P0]

**User story:** As an owner, I want an audit trail for changes affecting staffing and pay.

**Acceptance criteria**

1. Actor, tenant, timestamp, old/new values and reason where applicable are recorded.
2. Authorised viewers can filter audit history.
3. Records cannot be modified by ordinary users.


### BB-FOUND-008 — Resilience and operations [P0]

**User story:** As an operator, I want monitoring, backups and recoverability.

**Acceptance criteria**

1. Health and error metrics exist.
2. Restore procedure is rehearsed in staging.
3. Retryable actions are idempotent.
4. Backup retention is documented.


## Epic ORG — Business, venues and departments (P0)


### BB-ORG-001 — Create business and first venue [P0]

**User story:** As a new owner, I want a guided setup for my business and first café.

**Acceptance criteria**

1. Setup collects business name, venue name, address and timezone.
2. Ownership is established securely.
3. Incomplete setup can be resumed.


### BB-ORG-002 — Configure venue and geofence [P0]

**User story:** As an owner, I want to set the venue location and clocking radius.

**Acceptance criteria**

1. Latitude/longitude and radius save with validation.
2. Location permission implications are explained.
3. All changes are audited.


### BB-ORG-003 — Create departments and job roles [P0]

**User story:** As an owner, I want FOH/BOH departments and custom roles.

**Acceptance criteria**

1. FOH and BOH can be seeded.
2. Custom departments and roles can be created and deactivated.
3. Existing shifts retain historical references.


### BB-ORG-004 — Delegate departmental management [P0]

**User story:** As an owner, I want FOH and BOH managers to maintain separate rosters.

**Acceptance criteria**

1. Managers edit only assigned departments.
2. Owner has consolidated view.
3. Staff can belong to multiple departments.


### BB-ORG-005 — Multiple venues [P1]

**User story:** As a group operator, I want to roster employees across several venues.

**Acceptance criteria**

1. Venue selector scopes views.
2. Cross-venue overlap is detected for shared staff.
3. Timesheets retain actual venue attribution.


### BB-ORG-006 — Business configuration [P1]

**User story:** As an owner, I want week start, approval and notification defaults.

**Acceptance criteria**

1. Per-venue overrides are clear.
2. Changes apply prospectively unless explicitly migrated.
3. Audit shows the setting changed.


## Epic PEOPLE — People, roles and availability (P0)


### BB-PEOPLE-001 — Maintain employee profiles [P0]

**User story:** As a manager, I want to add and edit staff details without handling payroll secrets.

**Acceptance criteria**

1. Name, preferred contact, employment type and status can be maintained.
2. Data validation and tenant access are enforced.
3. Archived staff history persists.


### BB-PEOPLE-002 — Manage skills and eligible roles [P0]

**User story:** As a manager, I want to identify qualified baristas, chefs and floor staff.

**Acceptance criteria**

1. Multiple roles per employee are supported.
2. Primary role can be set.
3. Unqualified staff are not auto-assigned to restricted shift roles.


### BB-PEOPLE-003 — Set recurring availability [P0]

**User story:** As an employee, I want to indicate regular days and times I can work.

**Acceptance criteria**

1. Weekly patterns with multiple intervals can be saved.
2. Overnight intervals are handled.
3. The roster shows unavailable periods.


### BB-PEOPLE-004 — Submit availability exceptions [P0]

**User story:** As an employee, I want to block specific dates or request time off.

**Acceptance criteria**

1. Date exceptions override recurring patterns.
2. Pending and approved leave are visually distinguished.
3. Employees can see request status.


### BB-PEOPLE-005 — Set preferred hours and contact [P1]

**User story:** As an employee, I want to specify preferred hours and notification choices.

**Acceptance criteria**

1. Preferences are stored separately from contractual restrictions.
2. Eligible managers can view them.
3. Updates are logged.


### BB-PEOPLE-006 — View team directory [P0]

**User story:** As a manager, I want a searchable team list filtered by venue and role.

**Acceptance criteria**

1. Search and filters work.
2. Personal data is restricted by role.
3. Inactive staff cannot be newly rostered by default.


## Epic ROSTER — Core rostering workspace (P0)


### BB-ROSTER-001 — Weekly people-by-day roster [P0]

**User story:** As a manager, I want one weekly grid showing people against days.

**Acceptance criteria**

1. Rows group by department, columns show venue-local dates, shifts show role and start/end.
2. Week navigation and responsive overflow work.


### BB-ROSTER-002 — Create and edit shift [P0]

**User story:** As a department manager, I want to create shifts quickly.

**Acceptance criteria**

1. Shift form supports venue, department, role, worker, dates, start/end and break.
2. Errors are inline.
3. Successful save updates grid.


### BB-ROSTER-003 — Unassigned open shift [P0]

**User story:** As a manager, I want to create an unfilled shift.

**Acceptance criteria**

1. Employee is optional.
2. Open shifts are clearly styled.
3. Count updates.
4. Eligibility rules apply when assigning.


### BB-ROSTER-004 — Copy week and roster template [P0]

**User story:** As a manager, I want to reuse a previous roster.

**Acceptance criteria**

1. Copy creates editable drafts for new dates.
2. Approved leave, overlaps and availability are revalidated.
3. No notifications sent until publishing.


### BB-ROSTER-005 — Drag and drop roster changes [P1]

**User story:** As a manager, I want to move or duplicate shifts without opening a form.

**Acceptance criteria**

1. Preview indicates target dates/worker.
2. Conflicts block or warn appropriately.
3. Keyboard-accessible alternative exists.
4. Undo is offered.


### BB-ROSTER-006 — Filter and collapse departments [P0]

**User story:** As a manager, I want an uncluttered roster for my department.

**Acceptance criteria**

1. FOH/BOH filters and collapsing work.
2. Permission scope always takes precedence.
3. State persists while navigating.


### BB-ROSTER-007 — Conflict detection [P0]

**User story:** As a manager, I want to spot overlapping shifts and unavailable employees before publication.

**Acceptance criteria**

1. Cross-department and cross-venue overlap, unavailable dates and invalid times are detected.
2. Issues identify affected shifts.
3. Blocking rules are configurable.


### BB-ROSTER-008 — Publish and notify [P0]

**User story:** As an owner or authorised manager, I want to publish a roster explicitly.

**Acceptance criteria**

1. Draft changes remain private until publication.
2. Published version is recorded.
3. Impacted employees are notified once.
4. Unresolved blockers prevent publishing.


### BB-ROSTER-009 — Roster approval workflow [P1]

**User story:** As an owner, I want optional review before department rosters go live.

**Acceptance criteria**

1. Owner may enable direct or approval publication.
2. Reviewer sees changes.
3. Approval/rejection is audited and scoped.


### BB-ROSTER-010 — Simple employee roster [P0]

**User story:** As an employee, I want to see my next shift and weekly schedule on mobile.

**Acceptance criteria**

1. Only published assigned shifts appear.
2. Venue-local time and location display clearly.
3. Shift updates are visible and acknowledged when required.


### BB-ROSTER-011 — Roster keyboard productivity [P2]

**User story:** As a frequent scheduler, I want search, shortcuts and undo.

**Acceptance criteria**

1. Documented shortcuts do not interfere with accessibility.
2. Destructive actions have undo or confirmation.
3. Shortcuts work in tested browsers.


## Epic ATTEND — Attendance, geofence and QR (P0)


### BB-ATTEND-001 — Clock in and out [P0]

**User story:** As an employee, I want one-tap start and finish recording.

**Acceptance criteria**

1. Server assigns canonical timestamp.
2. Valid state transitions are enforced.
3. Repeated requests do not create duplicate events.
4. Employee sees current state.


### BB-ATTEND-002 — Clock breaks [P0]

**User story:** As an employee, I want to start and end breaks accurately.

**Acceptance criteria**

1. Break transitions are validated.
2. Multiple breaks are supported.
3. Paid/unpaid classification is retained.
4. No assumed break is silently deducted.


### BB-ATTEND-003 — Location verification [P0]

**User story:** As an owner, I want optional geofence verification for clock events.

**Acceptance criteria**

1. Browser requests location only at clock event.
2. Server verifies distance and accuracy.
3. Failure creates reviewable exception without deleting time worked.


### BB-ATTEND-004 — Rotating QR kiosk [P1]

**User story:** As an owner, I want short-lived QR codes displayed on a venue device.

**Acceptance criteria**

1. QR is venue-bound, signed and expires.
2. Replay is denied.
3. Access to kiosk display is controlled.
4. Clocks are validated server-side.


### BB-ATTEND-005 — Time capture fallback [P0]

**User story:** As an employee, I want to record attendance even when location permission or the network fails.

**Acceptance criteria**

1. Fallback shows clear pending/exception status.
2. Data is reconciled safely on reconnect or by manager.
3. Original claimed time and confirmed server time are retained.


### BB-ATTEND-006 — Late, missing and no-show alerts [P1]

**User story:** As a manager, I want to identify attendance exceptions.

**Acceptance criteria**

1. Threshold is configurable.
2. Duplicate alerts are suppressed.
3. Acknowledgement and resolution are auditable.
4. Unpublished shifts are excluded.


### BB-ATTEND-007 — Attendance corrections [P0]

**User story:** As a manager, I want to correct a mistaken time without overwriting original events.

**Acceptance criteria**

1. Adjustment records old/new/reason/actor.
2. Employee can see correction.
3. Approvals or locks constrain editing.
4. Recalculation is consistent.


## Epic TIME — Timesheets and approvals (P0)


### BB-TIME-001 — Compute worked time [P0]

**User story:** As a payroll approver, I want worked time calculated from actual events.

**Acceptance criteria**

1. Cross-midnight shifts and timezone changes are tested.
2. Actual breaks are applied.
3. Rounding policy is explicit and non-destructive.
4. Exceptions are flagged.


### BB-TIME-002 — Weekly timesheet review [P0]

**User story:** As a manager, I want to review planned versus actual attendance.

**Acceptance criteria**

1. Employee, venue and period filters work.
2. Discrepancies are visible.
3. Bulk actions exclude invalid records.
4. Source events can be inspected.


### BB-TIME-003 — Employee correction request [P0]

**User story:** As an employee, I want to request a fix for missed clocking.

**Acceptance criteria**

1. Request records proposed time and reason.
2. Manager can approve/reject with explanation.
3. Original records remain unchanged.


### BB-TIME-004 — Department approval [P0]

**User story:** As a FOH/BOH manager, I want to approve only my department time.

**Acceptance criteria**

1. Approval scope is server-enforced.
2. Multiple department shifts are attributed correctly.
3. Rejected entries return for correction.


### BB-TIME-005 — Finalise payroll period [P0]

**User story:** As an owner, I want to lock approved periods before export.

**Acceptance criteria**

1. Only authorised roles can finalise.
2. Outstanding exceptions are surfaced.
3. Reopening requires reason and logs an event.


### BB-TIME-006 — Timesheet export traceability [P0]

**User story:** As a payroll approver, I want to know which hours were exported.

**Acceptance criteria**

1. Each exported entry links to batch and version.
2. Amended previously exported entries trigger explicit reconciliation.
3. Duplicates are prevented.


## Epic PAY — Payroll exports and integrations (P0/P1)


### BB-PAY-001 — Canonical payroll record [P0]

**User story:** As a developer, I want one validated payroll timesheet representation.

**Acceptance criteria**

1. Schema includes worker mapping, venue, date, hours, breaks, codes and approval/version.
2. Malformed records fail clearly.
3. Provider adapters never mutate source timesheets.


### BB-PAY-002 — Generic CSV export [P0]

**User story:** As an owner, I want to download approved hours as CSV.

**Acceptance criteria**

1. Columns and date/time formats are documented.
2. Only approved records included.
3. File formula injection is mitigated.
4. Export is logged.


### BB-PAY-003 — Payroll employee mapping [P0]

**User story:** As an owner, I want to map Butterbox staff to payroll IDs.

**Acceptance criteria**

1. Mapping is unique per connection and employee.
2. Missing mappings block provider export.
3. Worker IDs are not inferred from names.


### BB-PAY-004 — Xero Payroll adapter [P1]

**User story:** As an owner, I want to send approved timesheets to supported Xero Payroll accounts.

**Acceptance criteria**

1. Current AU endpoints/scopes confirmed.
2. OAuth refresh and permission failure handled.
3. Sandbox end-to-end test validates mapping, retries and duplicate prevention.


### BB-PAY-005 — MYOB adapter [P2]

**User story:** As an owner, I want to connect a supported MYOB payroll product.

**Acceptance criteria**

1. Target MYOB products documented.
2. Auth and field mapping validated.
3. Unsupported products receive accurate guidance rather than false promises.


### BB-PAY-006 — Employment Hero adapter [P2]

**User story:** As an owner, I want to export to Employment Hero Payroll when API access is supported.

**Acceptance criteria**

1. Account eligibility and access confirmed.
2. Mapping validated.
3. Errors and retries surfaced.
4. No unapproved records sent.


### BB-PAY-007 — QuickBooks discovery and adapter [P2]

**User story:** As a product owner, I want to distinguish accounting time activities from Australian payroll imports.

**Acceptance criteria**

1. Supported destination product and workflow documented before build.
2. Adapter only marked available after integration tests.


### BB-PAY-008 — Reliable payroll delivery [P1]

**User story:** As a payroll approver, I want to retry a failed submission without double-paying or duplicating hours.

**Acceptance criteria**

1. Idempotency key tied to export/version.
2. Retries have backoff and bounded attempts.
3. Audit and reconciliation UI show external status.


## Epic SHIFTS — Open shifts, offers and swaps (P1)


### BB-SHIFTS-001 — Offer open shift [P1]

**User story:** As a manager, I want to invite eligible staff to an uncovered shift.

**Acceptance criteria**

1. Eligibility checks venue, role, availability and conflicts.
2. Selected audience and send are auditable.
3. Shift remains open until confirmed.


### BB-SHIFTS-002 — Respond to shift offer [P1]

**User story:** As an employee, I want to accept or decline from my phone.

**Acceptance criteria**

1. Employee only sees eligible published offers.
2. Response is timestamped.
3. Expired offers cannot be accepted.


### BB-SHIFTS-003 — Assign claim transactionally [P1]

**User story:** As a manager, I want only one person confirmed to a shift.

**Acceptance criteria**

1. Concurrent claims cannot assign multiple employees.
2. Confirmation checks latest availability.
3. Losers receive clear status.


### BB-SHIFTS-004 — Request shift swap [P1]

**User story:** As an employee, I want to request a swap with a qualified colleague.

**Acceptance criteria**

1. Both sides confirm.
2. Eligibility and overlaps recheck at approval.
3. Manager can reject with reason.
4. Notifications are sent.


### BB-SHIFTS-005 — Scenario-driven staffing change [P1]

**User story:** As a manager, I want a guided weather, rush, sickness or early-finish workflow.

**Acceptance criteria**

1. Workflow creates proposed changes.
2. Applicable employment restrictions are surfaced.
3. Staff responses and manager confirmation are recorded.
4. No automatic cancellation.


## Epic COMMS — Messaging and notification (P1)


### BB-COMMS-001 — Send announcements [P1]

**User story:** As a manager, I want to send business, venue or department notices.

**Acceptance criteria**

1. Recipients scoped by permission.
2. Published notice is auditable.
3. Employees can view history.
4. Required acknowledgements are tracked.


### BB-COMMS-002 — In-app notification centre [P1]

**User story:** As an employee, I want a focused list of work-related updates.

**Acceptance criteria**

1. Shift changes, offers and approvals show unread/read state.
2. Deep links open the correct authorised item.
3. Repeated events deduplicate.


### BB-COMMS-003 — Email and push delivery [P1]

**User story:** As an employee, I want important changes delivered even when I am not online.

**Acceptance criteria**

1. Consent/preferences respected.
2. Delivery is queued with retry and logs.
3. Failures do not block roster publication.
4. Unsupported push devices have fallback.


### BB-COMMS-004 — Contextual shift conversation [P2]

**User story:** As a manager and employee, I want a discussion linked to a specific shift.

**Acceptance criteria**

1. Only authorised participants can read/write.
2. Messages are ordered and retained.
3. No private details leak via notification previews.


## Epic AI — AI rostering assistant and safe actions (P1/P2)


### BB-AI-001 — Natural-language roster requests [P2]

**User story:** As a manager, I want to ask Butterbox to build or adjust a roster in everyday language.

**Acceptance criteria**

1. AI parses request into a typed draft proposal.
2. Asks clarifying question on ambiguity.
3. Never modifies roster solely from model output.


### BB-AI-002 — Explain recommendations [P1]

**User story:** As a manager, I want an understandable explanation of why a shift is suggested.

**Acceptance criteria**

1. Each recommendation shows relevant inputs, assumptions, constraints and estimated impact.
2. Unavailable data is stated.
3. Explanation links to proposed changes.


### BB-AI-003 — Suggested staff replacements [P1]

**User story:** As a manager, I want ranked eligible replacements when someone is unavailable.

**Acceptance criteria**

1. Only permitted workers included.
2. Rank uses declared constraints.
3. Protected attributes excluded.
4. Manager confirms assignment.


### BB-AI-004 — AI action review and apply [P1]

**User story:** As a manager, I want to preview, accept or dismiss suggestions.

**Acceptance criteria**

1. Diff of proposed changes appears before confirmation.
2. Server revalidates latest roster and policy.
3. Audit records proposal, actor, result and reversal.


### BB-AI-005 — Fill open shifts assistant [P1]

**User story:** As a manager, I want AI to propose candidates for unfilled shifts.

**Acceptance criteria**

1. Recommendations consider skills, availability, overlaps and hours.
2. Alternatives provided.
3. No offers sent without manager approval.


### BB-AI-006 — Safe conversational permissions [P1]

**User story:** As an owner, I want the assistant to respect venue and department access.

**Acceptance criteria**

1. Retrieval is tenant-scoped server-side.
2. Prompt injection cannot grant actions.
3. Assistant cannot reveal restricted employee data.
4. Denied intents fail safely.


### BB-AI-007 — AI quality controls [P1]

**User story:** As a product owner, I want to monitor hallucinations, latency and spend.

**Acceptance criteria**

1. Offline eval set covers ambiguous and adversarial asks.
2. Requests are logged with privacy minimisation.
3. Token/cost budgets and circuit breakers enforced.


### BB-AI-008 — Optional assistant opt-out [P2]

**User story:** As an owner, I want to enable or disable AI features and control data use.

**Acceptance criteria**

1. Per-business feature switch is enforceable.
2. Provider data processing terms documented.
3. Disabling AI does not affect ordinary rostering.


## Epic FORECAST — Demand forecasting and optimisation (P2)


### BB-FORECAST-001 — Historical demand ingestion [P2]

**User story:** As an owner, I want to connect or upload sales and booking history.

**Acceptance criteria**

1. Import validates timezone, missing values and duplicates.
2. Source provenance is displayed.
3. Import never overrides raw records silently.


### BB-FORECAST-002 — Weather-aware demand outlook [P2]

**User story:** As a manager, I want weather considered when planning labour.

**Acceptance criteria**

1. Weather source and update time shown.
2. Forecast is venue-local.
3. Missing weather gracefully falls back to baseline.


### BB-FORECAST-003 — Staffing demand forecast [P2]

**User story:** As a manager, I want expected staffing needs by daypart and role.

**Acceptance criteria**

1. Forecast includes confidence/uncertainty and past accuracy.
2. Test against held-out history.
3. No unsupported precision claims.


### BB-FORECAST-004 — Cost-aware roster options [P2]

**User story:** As an owner, I want alternative staffing plans within a configurable budget.

**Acceptance criteria**

1. Shows hours, estimated cost and coverage impacts per option.
2. Hard constraints enforced.
3. Cost estimates labelled distinct from payroll calculations.


### BB-FORECAST-005 — Forecast accuracy dashboard [P2]

**User story:** As an owner, I want to compare predictions with realised demand.

**Acceptance criteria**

1. MAE/WAPE or suitable metrics reported by venue/daypart.
2. Model version tracked.
3. Drift and sparse-data limitations surfaced.


## Epic RULES — Employment safeguards and compliance (P0/P2)


### BB-RULES-001 — Employment rule metadata [P0]

**User story:** As an owner, I want employment classification and applicable rules recorded.

**Acceptance criteria**

1. Employment basis and award/contract references can be maintained.
2. Unknown classification stays explicit.
3. Changes are effective-dated.


### BB-RULES-002 — Minimum engagement and break warnings [P1]

**User story:** As a manager, I want warning checks before publishing.

**Acceptance criteria**

1. Only validated configured rules are evaluated.
2. Rule source/version and affected shift shown.
3. Warning never claims full compliance certification.


### BB-RULES-003 — Award interpretation engine [P2]

**User story:** As an owner, I want tested award-aware checks tailored to applicable employees.

**Acceptance criteria**

1. Rules for selected awards are versioned with effective dates.
2. Counsel/payroll SME validates fixtures.
3. Tests cover weekends, penalties, breaks and edge cases.


### BB-RULES-004 — Roster change safeguards [P1]

**User story:** As a manager, I want cancellation and change notices to respect configured requirements.

**Acceptance criteria**

1. Affected workers, timing and potential minimum engagement shown.
2. Manager must acknowledge unresolved warnings.
3. No unilateral automatic cancellation.


### BB-RULES-005 — Privacy and retention policy [P0]

**User story:** As a worker, I want my location and time records used and retained appropriately.

**Acceptance criteria**

1. Only point-in-time location captured by default.
2. Visibility and retention documented.
3. Employee access and correction process exists.
4. Required employment records preserved.


## Epic REPORT — Reporting and analytics (P2)


### BB-REPORT-001 — Hours and labour dashboard [P2]

**User story:** As an owner, I want scheduled vs actual hours by venue and department.

**Acceptance criteria**

1. Filtering works.
2. Metrics have definitions.
3. Totals reconcile with approved timesheets.
4. Cost estimates distinguished from actual payroll.


### BB-REPORT-002 — Overtime and exceptions report [P2]

**User story:** As a manager, I want high-risk patterns highlighted.

**Acceptance criteria**

1. Overlaps, excessive hours and missing clock events summarised.
2. Drill down shows source.
3. No inference of award breaches without verified rules.


### BB-REPORT-003 — Export business reports [P2]

**User story:** As an owner, I want CSV reports for rostering and attendance.

**Acceptance criteria**

1. Exports respect tenant permissions and chosen period.
2. Sensitive fields excluded unless explicitly allowed.
3. Generated event is audited.


## Epic SAAS — Subscriptions, operations and scale (P1/P2)


### BB-SAAS-001 — Venue-based plans [P1]

**User story:** As a customer, I want straightforward per-venue subscriptions instead of per-person charges.

**Acceptance criteria**

1. Starter/Pro/Plus entitlements stored centrally.
2. Venue counts billed correctly.
3. Inactive users do not trigger per-employee fee.


### BB-SAAS-002 — Self-service subscription [P2]

**User story:** As a business owner, I want to start, change or cancel a plan.

**Acceptance criteria**

1. Payment provider webhook is verified and idempotent.
2. Billing state syncs reliably.
3. Downgrade never silently deletes customer records.


### BB-SAAS-003 — Tenant onboarding and support [P1]

**User story:** As a new café owner, I want a guided path to first published roster.

**Acceptance criteria**

1. Onboarding checklist progresses business→venue→staff→shift→publish.
2. Seeded demo data is isolated from production.
3. Inline help covers common tasks.


### BB-SAAS-004 — Performance and accessibility [P0]

**User story:** As a user, I want the roster responsive and usable on phones.

**Acceptance criteria**

1. Core pages pass WCAG-oriented checks, keyboard controls and screen-reader smoke tests.
2. Defined benchmark tested with 25 employees/7 days.
3. Loading and error states are clear.


### BB-SAAS-005 — Operational customer support [P2]

**User story:** As a support agent, I want safe diagnostics without unrestricted employee access.

**Acceptance criteria**

1. Support access uses explicit scoped grant/impersonation audit.
2. Secrets and sensitive values are masked.
3. Access expires automatically.


## Recommended first 12 feature builds

1. **BB-FOUND-001** project and environment skeleton.
2. **BB-FOUND-002** secure login and session management.
3. **BB-FOUND-003** cross-tenant isolation and automated denial tests.
4. **BB-FOUND-004** scoped permissions.
5. **BB-ORG-001** owner-guided business and venue creation.
6. **BB-ORG-003** FOH/BOH and role configuration.
7. **BB-PEOPLE-001** employee profile CRUD.
8. **BB-PEOPLE-003** recurring employee availability.
9. **BB-ROSTER-001** weekly people-by-day grid.
10. **BB-ROSTER-002** create/edit shift with tests.
11. **BB-ROSTER-007** scheduling conflict detection.
12. **BB-ROSTER-008** publish roster and employee view.

After these, deliver attendance → timesheets → CSV as one pilot end-to-end path. A feature is not Done because an AI generated code: demonstrate the working behaviour and test it.

## Reusable GitHub Copilot / coding-agent task template

> Implement **[STORY ID] — [TITLE]** in `farbotkol/butterbox`. Inspect the repository and identify relevant existing patterns. First write a short plan including schema, security/tenant isolation, UI states, APIs and tests. Implement only this story and any necessary small dependencies. Follow Butterbox's light-first brand tokens. Do not rewrite unrelated modules. For each acceptance criterion, add or update tests and show how it was verified. Include loading, empty, error, permission-denied and mobile states where relevant. Run lint, typecheck, tests and build; report commands and outcomes truthfully. Deliver a concise changed-file summary and any migrations or manual setup. Do not claim completion where credentials, infrastructure or external API access are missing.

## Story refinement checklist

For every story, clarify before build: (1) target persona; (2) business/venue/department scope; (3) source of truth; (4) happy path; (5) failure and concurrency; (6) permissions; (7) notification and audit events; (8) compliance dependencies; (9) metrics; (10) mobile presentation.
