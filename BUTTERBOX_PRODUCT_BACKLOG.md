# Butterbox Systems — Master Product Backlog v1.0

**Product:** Multi-tenant Australian hospitality workforce SaaS  
**Brand:** Butterbox Systems — *Less admin. More good days.*  
**Target:** Independent cafés/restaurants with FOH/BOH departments and variable casual pools  
**Architecture:** Next.js + Supabase PostgreSQL/Auth/RLS, server-side domain services, durable background jobs, configurable payroll adapters  
**Status:** Proposed requirements; not a representation of implemented features or regulatory certification.


## Epic UXFIX — Post-showcase usability improvements (owner-prioritised)

**Purpose:** Capture owner-observed usability gaps discovered during the complete Butterbox showcase review, without reopening or reclassifying accepted Showcase P0 delivery stories. UXFIX stories are incrementally added as the owner submits consolidated feedback. UXFIX-001 is the **first** story, selected as the **next UX focus**; it is not an instruction to interrupt or overwrite unrelated agent work in progress.

**State:** UX backlog; not yet implemented. **Priority:** P1 (next owner-prioritised UX improvement). **Epic ID prefix:** `BB-UXFIX-###`.

### BB-UXFIX-001 — Redesign People Directory and Employee Profile (list/detail/edit UX) [P1]

**Problem / observed gap**

The existing `/people` route already supports employee search and filters, but it renders every returned employee as a full stack of forms (work preferences, account link, invitation, dated employment metadata link, personal profile, departments, eligible roles and primary role). In a venue with a normal-sized team this creates a very long page, makes discovery and comparison difficult and requires users to scan through editing controls just to find or verify a team member. The owner considers the functional foundation delivered but the list/detail interaction design incomplete. Existing `/people/[id]/employment` routes and established business logic must be preserved.

**User story**

As a hospitality owner or authorised manager, **I want to find a team member in a clean, searchable directory, open a readable employee profile and edit only the details I choose**, so managing a team is fast and understandable on desktop and mobile without losing the existing controls, permissions or data.

**Personas and scope**

- Owner/admin: venue/team directory and all permitted employee management actions, including owner-gated account linking, invitations, roles, departments and shared-worker controls as currently authorised.
- General/department manager: see and edit only the records/fields permitted by existing business, venue and FOH/BOH department rules. No broadened access.
- Employee/self-service: no new access to other employee records is created. Existing employee-facing routes remain unchanged.
- Multi-venue/business: current selected business, venue, department and worker-sharing boundaries remain enforced server-side and by RLS.

**Expected UX / interaction design**

1. **Directory first.** `/people` opens a compact **People** directory, not hundreds of profile forms. Keep a strong Butterbox header (“Your people”), a primary **Add person** action and meaningful count indicators (e.g. active people and invitations awaiting action), calculated from actual permitted data. Never infer counts from a filtered page without clarifying the scope.
2. **Discoverability.** Provide a prominent search for name and, where authorized, email or role; filter by venue, department, role, active/archived and optionally invitation state. Include clear filters/reset, result count, applied-filter feedback, keyboard submit and stable URL/bookmark state. Preserve existing query scoping and validation. Sorting by name, department, role and status should be predictable.
3. **Desktop list.** Use a readable table-like list with initials/avatar fallback, name, department, primary role, employment type where available, account/invitation state, active/archived state and one clear **View profile** action. Show only information authorized for the viewer. Rows should be easy to scan; no full nested forms. Do not treat the free-text job title as an eligible role.
4. **Mobile directory.** Provide intentionally designed touch-friendly compact person rows/cards (not a shrunk eight-column table). Preserve search, filters, actions and status labels. Test narrow devices and long names/emails without horizontal page overflow.
5. **Employee profile route.** Selecting a person opens a canonical employee-specific detail URL such as `/people/[employeeId]` (route shape to be validated against existing `/people/[id]/employment`). A **Back to people** link returns to the prior directory context, including search/filters/venue where safe; bookmarks and refresh work. Invalid, archived, deleted, out-of-scope and cross-tenant IDs return appropriate states without leaking employee details.
6. **Read-first header and overview.** Show identity/initials, name, primary role, department, current employment basis/type if known, active/archived and linked-account/invitation status. Overview presents permitted contact and primary assignment fields as readable label/value pairs with “Not provided” rather than fake sample data. No sensitive payroll secrets or unverified compliance statements.
7. **Focused sections.** Separate **Overview**, **Employment**, **Roles & departments**, and **Account & invitations** as accessible tabs/sections; consider **Shared worker profiles** and **Work preferences** as contextual sections when relevant. Preserve dated employment metadata and its existing specialist page/link, qualifications/eligible roles, primary role rules, multiple department membership, shared profile links, account linking, invitation controls and preference explanations. Expose only sections/actions actually available to the current user. Prefer a section URL/query/hash state when it improves deep linking.
8. **View → Edit → Save/Cancel.** Default to read-only profile. **Edit** enables only the fields in that section; **Save** persists via the existing validated server action(s), and **Cancel** restores the last saved data without a write. Clearly distinguish unsaved edits, a pending save, validation errors, successful saves, denied permissions and stale/concurrent edits. Prevent accidental double submission and provide confirmation before abandoning changes. Reuse existing server-side authorization; never accept an optimistic UI update as proof of persistence.
9. **Add person.** Keep a visible **Add person** flow with concise initial fields and appropriate validation. On success, navigate to the new employee profile with a clear confirmation. Do not invent mandatory employee attributes, new entitlement rules or collection of payroll/bank details. A permission-denied user cannot see or invoke actions they are not authorized for.
10. **Lifecycle and permissions.** Archive/reactivate must be clearly distinct from deleting a record; confirm the consequences and preserve shift/timesheet/audit history. Retain restrictions preventing archived workers being newly rostered by default, restrictions on inactive departments/roles, invitation resend/revoke rules and privilege boundaries. Public synthetic showcase restrictions (such as disabled outbound invitation email) must still be respected. Do not leak cross-venue/private records through search, summary counts, previews or direct URLs.
11. **Visual language.** Match the owner-preferred light Butterbox Coastal Wave interface: warm cream, charcoal, fresh coastal teal, **selective butter-yellow** highlights and clear status colours. Strong typographic hierarchy, restrained corners and visual density suitable for everyday operations. Avoid giant vertical form stacks and unnecessary cards; keep familiar AppShell navigation, labels, contextual Help and accessible feedback.
12. **Loading, failure and scale.** Provide meaningful loading/skeleton, empty directory, no search results, error/retry, unsupported action and denied-access states. Avoid loading/editing every employee form in a single render. Use bounded, paginated or otherwise scalable data fetching; verify tenant/department scoping in every query and mutation. Do not regress shared-worker or dated employment edge cases.

**Acceptance tests / definition of Done**

- **Functional journey (owner):** From `/people`, search/filter/sort → open an employee → inspect overview → edit name/contact/primary role using permitted controls → Save → refresh confirms persistence → Cancel leaves data unchanged → return to preserved directory filters.
- **Lifecycle and admin journeys:** Add new employee, archive/reactivate and review history; account link and invitation permitted/disabled states; role eligibility and department membership rules; dated employment metadata navigation; shared-worker links where applicable. Verify every existing profile action remains reachable and correct, even if its form moves.
- **Access control:** Test owner/admin/GM/FOH manager/BOH manager and employee/unprivileged accounts, two businesses and two venues. Verify server/RLS enforcement against direct URL, tampered POST/action requests, unauthorised field updates, cross-venue search/count leaks and archived/invalid IDs.
- **Visual and accessibility:** Production-build browser tests at **375, 390, 768, 1024 and 1440 px** for list, filtered/empty list, profile read mode, edit mode, validation and modal/confirmation states. No uncontrolled overflow. Keyboard-only search, list navigation, tabs, form use, focus restoration, live errors and semantic headings/labels work; automated axe checks report no relevant serious/critical findings. Reduced motion respected.
- **Reliability:** Existing People domain tests pass, plus tests for filter persistence, save/cancel, stale update handling, invitation safety and explicit archive behavior. Run changed-file lint, TypeScript, unit/integration, relevant database authorization tests and production build. Document real failures and any untested pathways.
- **Documentation:** Update the user guide/contextual help with screenshots only from verified app states. Provide before/after evidence and owner-review screenshots at desktop and mobile; do not close story solely on an unconnected mockup.
- **Safety:** The existing isolated showcase at port 3137 and temporary public synthetic preview must not be reset, reseeded, redeployed or exposed differently as part of this UX story without separate authorization. No live payroll, emails, production data or security changes.

**Dependencies:** BB-PEOPLE-001; BB-PEOPLE-002; BB-PEOPLE-006; BB-ORG-004 (existing features to preserve, not reimplement).

**Explicit exclusions:** Awards/pay-rate calculations; payroll secrets; redesigning unrelated roster/timesheet screens; replacing Supabase security model; changing employee classification policy; claiming production clearance. Example names in design mockups are fictional, not application data.

**Implementation guidance:** Keep this an app UX refactor of `src/app/people/page.tsx` and associated focused components/routes. Reuse existing server actions and query/authorization patterns where correct. Refactor large components into tested modules; do not recreate business rules in client-side JavaScript. Do not treat the conceptual chat prototype as implemented functionality.

**Priority decision:** Owner nominated UXFIX as the next area of product focus after the accepted internal showcase. Further UXFIX stories will be added later; do not assume this first story covers the whole usability review.


### BB-UXFIX-002 — Departments & Roles directory and detail management [P1]

**Problem / observed gap**

The existing \`/settings/organisation\` screen includes venue settings, departments, roles and rule settings together. Each department displays editable department fields, repeated job-role forms and separate automatic/manual restriction forms. As departments and roles grow, there is no efficient list → inspect → edit journey. This is the same underlying list/detail/edit flaw observed in People, compounded by mixing organisational setup with venue-level settings.

**User story**

As an authorised hospitality owner or manager, **I want to find a department, review its assigned roles and restrictions, and change only the item I select**, so I can maintain my venue's structure without navigating a long page of exposed configuration forms.

**Expected UX / acceptance criteria**

1. **Separation of concerns.** Retain the existing organisation and venue settings capabilities, but create a clear **Departments & Roles** workspace or distinct navigation section within Organisation Settings. Roster planning week, publication mode, conflict rules and geofence/location settings remain available in logical, labelled settings sections; do not lose or silently alter them.
2. **Directory-first overview.** Show current business/venue scope and a compact department list with name, active/inactive status, role count and associated worker count *only where reliably supported and permitted*. Include optional search, active/inactive filter, predictable sorting, zero-result feedback and a prominent **Add department**. Counts must be accurate and permission-scoped; omit unverified metrics.
3. **Detail view.** Selecting a department opens a focused detail route/panel preserving the selected venue and a safe Back to departments link. Read-only summary displays name, status, job roles and whether manual/automatic assignment restrictions apply. Do not render a stack of editable forms for all departments on the default overview.
4. **Focused editing.** **Edit department** exposes name and active status only on request. **Manage role** opens a focused form for one selected role; provide an Add role action. Save, Cancel and validation feedback are clear, and no unrelated role is accidentally modified. Handle invalid/stale records and changes made in another session.
5. **Role qualifications and restrictions.** Preserve both existing *manual* and *automatic* restriction controls, their distinct semantics and any qualification checks. Do not silently equate role name with qualification. Clearly explain what “qualified workers only” means for shift assignment; preserve blocking/warning logic rather than moving business rules to the client.
6. **Department/role lifecycle.** Activation/deactivation uses an explicit confirmation explaining impact on new staffing/shift assignments while preserving historical employee and shift references. Inactive departments/roles cannot be inadvertently selected for new work. Existing history and archived choices remain appropriately visible.
7. **Authorization and multi-venue safety.** Apply the current owner/admin/manager permissions, business/venue/department boundaries and Supabase RLS, including direct link and tampered mutation tests. A user with read-only access sees no actionable edit controls, and forged requests cannot bypass scope.
8. **Mobile, empty and error states.** Directory remains usable at narrow widths using compact rows, accessible filters and sufficiently sized actions. Provide states for no departments, no roles, filtered-empty, loading/error, expired record and permission denial. Maintain accessible labels, keyboard focus and contextual Help.
9. **Shared visual pattern.** Reuse the Butterbox UXFIX-001 list/detail/edit interaction pattern and approved Coastal Wave palette—cream/charcoal, teal actions, selective yellow highlights—without a new inconsistent UI system. Keep forms compact, purpose-specific and accessible.

**Functional acceptance scenarios**

- Owner selects venue → searches departments → opens FOH → views active roles and restrictions without any forms open → edits one role → saves → refreshes → sees persisted update → returns to the same venue/filter.
- Owner adds a role, sets independent manual/automatic qualification restrictions and confirms they affect rostering exactly as before; cancels a draft without persistence.
- Inactivate/reactivate a department or role with explicit confirmation; existing staff/shift references remain unchanged; ineligible new assignment is still rejected.
- Department manager and general manager can only see/edit their authorized scope; attempt to access another venue's detail URL or forge a save is denied server-side.
- Preview at 375, 390, 768, 1024 and 1440px; keyboard/screen-reader navigation, focus and axe checks pass; no uncontrolled horizontal overflow. Run appropriate existing role, roster, qualification and settings tests plus lint, types and production build.

**Code / integration touchpoints:** \`src/app/settings/organisation/page.tsx\`, existing \`saveDepartmentAction\`, \`saveJobRoleAction\`, \`setJobRoleAutoRestrictionAction\` and \`setJobRoleManualRestrictionAction\`, existing venue/role authorization and roster restrictions. Prefer composable components and routes over a single oversized page.

**Dependencies:** BB-ORG-003; BB-ORG-004; BB-PEOPLE-002. **Status:** Backlog. **Priority:** P1, owner-prioritised Wave 1, proposed second in sequence. **Exclusions:** No alteration of rostering rules, historical records, or employment legislation.

### BB-UXFIX-003 — Business Permissions directory and focused access editing [P1]

**Problem / observed gap**

The existing \`/settings/permissions\` screen renders each business member as a separate card containing editable role, venue and department dropdowns plus a Save Permissions button. This makes it difficult to compare who has access, find a particular member, or distinguish inspection from a potentially high-impact permission change.

**User story**

As a business owner or authorised administrator, **I want a clear access directory that shows each person's current business role and scope, with deliberate edit-and-confirm actions**, so permissions remain understandable, auditable and difficult to change accidentally.

**Expected UX / acceptance criteria**

1. **Access directory by default.** Replace the repeated edit forms with a searchable, sortable, compact member table (mobile: accessible row layout). Display member email/identity, role, business, venue scope, department scope and a concise **View / Edit access** action. Use accurate current data; avoid exposing emails to unauthorized roles.
2. **Find and compare.** Offer search for permitted member identities and filters for role, venue and department, including a useful result count, an All/clear filter and clear distinction between global and scoped access. Sorting must remain stable and URL state should preserve filtering where appropriate.
3. **Focused view and edit.** Selecting a member opens a read-only access summary, followed by an explicit Edit Permissions action. Role, venue and department selections appear only in edit mode, with clear Save/Cancel, unsaved-change warning, pending/success/error and stale-data handling. No editable forms are rendered for unselected members.
4. **Role-aware controls.** Preserve existing server-side semantics for owner, general manager, FOH/BOH manager, employee and any supported legacy roles. Choices dynamically explain required/optional venue and department scope for each role without permitting invalid combinations; unrecognized legacy roles are not silently rewritten.
5. **High-impact confirmation.** Before changing an owner or expanding/restricting a member's scope, display a plain-English before/after summary of the role and affected venue/department. Preserve the “at least one owner” safeguard; last-owner demotion must remain blocked even under concurrent requests. Never imply a UI confirmation replaces server authorization.
6. **No privilege escalation.** Only authorized users can inspect/manage business membership; cross-business and out-of-scope member IDs must not disclose data. Direct URL and forged POST/action attempts must be rejected by server checks and RLS. Do not broaden existing role permissions as a side effect of the UX change.
7. **Auditability.** Retain the existing \`assignMemberRoleAction\` business mutation and audit trail. On success, refresh/revalidate access and show persisted result; on failure, show actionable but non-sensitive feedback. Do not create a fake role history or promise approvals the backend does not support.
8. **Responsive and accessible.** Proper table semantics on desktop, readable mobile layout with wrapped emails, touch-sized actions, keyboard and screen-reader usability, clear focus changes, no overflow. Distinguish empty business/member list, no search matches, loading/errors and denied access.
9. **Design consistency.** Reuse the People/Departments directory → detail → edit patterns, light Butterbox typography and Coastal Wave brand palette. A permissions screen should make access relationships immediately legible, not feel like a collection of configuration cards.

**Functional acceptance scenarios**

- Owner finds a named member → views current role/venue/department → edits the scope → reviews before/after confirmation → saves → refresh confirms persisted scoped role and audit record → navigates back to prior filters.
- Cancel/edit-switch and invalid role/scope combinations do not write. Last-owner demotion is denied even with racing requests.
- General manager, department manager and employee cannot escalate permissions; direct URL, forged action and two-business isolation tests confirm enforcement.
- Desktop/table and 375/390/768/1024/1440px mobile responsive tests, keyboard/axe checks, lint, TypeScript, relevant auth/RLS/integration and production build pass.

**Code / integration touchpoints:** \`src/app/settings/permissions/page.tsx\`, existing \`assignMemberRoleAction\`, business-member membership and role/venue/department authorization. Reuse security rules; do not add general-purpose new roles or membership invitations in this story.

**Dependencies:** BB-ORG-004; BB-ORG-005 if multi-venue scenarios are exercised; BB-PEOPLE-001 for identity context. **Status:** Backlog. **Priority:** P1, owner-prioritised Wave 1, proposed third in sequence. **Exclusions:** New permissions framework, role hierarchy changes, public signup or auth-system redesign.

### BB-UXFIX-004 — Payroll Employee Mapping directory and contextual mapping editor [P1]

**Problem / observed gap**

The existing \`/settings/payroll\` screen selects a payroll destination and then renders each employee's mapping as a separate editable form (external payroll ID, required change reason and Save button). Adding a destination shares the same page. This is lengthy for a normal venue and makes it hard to identify missing, duplicated, or recently updated mappings.

**User story**

As an authorised payroll/operations administrator, **I want to select a payroll destination, see all relevant employee mappings in one scannable list, and edit a single mapping safely**, so I can prepare consistent external payroll IDs without accidentally changing the wrong person or implying a live payroll connection.

**Expected UX / acceptance criteria**

1. **Destination-first navigation.** Preserve the existing business/venue scope and list of provider destinations. A clear **Payroll mappings** workspace shows the currently selected destination, provider label and permitted account metadata, plus a separate **Add destination** flow. Adding a destination must not imply that payroll credentials or a provider connection have been established.
2. **Mapping directory.** For the selected destination, render a compact, searchable employee table (mobile: readable rows) with name, Butterbox identity, external payroll employee ID where authorized, **Mapped / Missing** status and one **View / Edit mapping** action. Support status filters, count of mapped/missing employees and stable sorting without leaking cross-venue/business records.
3. **Focused edit mode.** Open one employee mapping in an accessible detail panel/drawer/page with a read-only summary. **Edit mapping** shows current destination, employee identity, payroll ID and required reason for change, with Cancel/Save, validation, saved feedback and stale revision handling. Do not render a Save form under every row.
4. **Sensitive change clarity.** A mapping may be cleared by blanking the external ID only through an explicit, confirmed remove/unmap action. Explain that unmapping blocks provider-ready records for that employee, while preserving historical audit/reconciliation. Confirm destination identity before saving to prevent mapping an employee against the wrong provider or account.
5. **Integrity and concurrency.** Preserve unique external employee ID per destination, case sensitivity, the existing revision/stale-save guard and current mapping audit record. Validation errors identify the affected selected row without revealing unrelated people; duplicate IDs and racing writes cannot be accepted merely because the client view is stale.
6. **Permission and isolation.** Maintain current owner/admin authorization and tenant/venue boundaries. A user without access cannot list, view or mutate mappings; IDs and destination metadata do not leak through URL manipulation, search, detail pages or summaries. Existing server actions and RLS remain authoritative.
7. **Provider readiness honesty.** Do not add live provider sync, bank/pay-rate fields, payroll submission, export or reconciliation behavior to this story. Existing destination records are *mapping configuration*, not a verified payroll integration. Preserve all existing warnings and restrictions.
8. **States and responsiveness.** Handle zero destinations, no employees, missing mappings, filtered-empty, saving, conflict, permission denial and provider-disabled conditions. Preserve search/selection safely across navigation; responsive at 375/390/768/1024/1440px, accessible keyboard/focus/axe and clear labels.
9. **Reuse the UXFIX visual system.** Follow the same Butterbox directory → detail → edit language as People, Departments and Permissions: warm cream, charcoal, coastal teal, restrained butter-yellow highlights. Keep data readable and avoid repetitive form-card stacks.

**Functional acceptance scenarios**

- Authorized owner selects a destination → filters Missing mappings → opens a worker → enters external payroll ID and reason → saves → refresh confirms persistence and audit entry → returns with prior filters.
- Owner intentionally clears a mapping after confirmation; appropriate warning about blocked provider-ready records is shown, no live payroll action triggered.
- Duplicate external ID, wrong tenant/venue, stale revision, malformed input and concurrent edit are rejected; error and recovery path are clear.
- Unprivileged and cross-business callers cannot read destination IDs or submit mapping actions. Existing mapping and payroll export tests remain green; focused UI, a11y, lint, TypeScript and build checks pass.

**Code / integration touchpoints:** \`src/app/settings/payroll/page.tsx\`, existing \`savePayrollMappingAction\`, provider destination and employee mapping query/helpers, mapping revision/audit constraints. Coordinate with existing generic payroll CSV separation, but do not modify its calculation or submission pipeline.

**Dependencies:** BB-PAY-001 (generic payroll data/export foundation); BB-PEOPLE-001. **Status:** Backlog. **Priority:** P1, owner-prioritised Wave 1, proposed fourth in sequence. **Exclusions:** Provider API integration, Xero/Dayforce adapter work, payslip/payment execution, award interpretation and employment-law certification.

### UXFIX Wave 1 — shared Definition of Done

These four owner-prioritised stories form **Wave 1: list / detail / contextual edit**. They are independent implementation stories, not a single enormous screen rewrite. Implement BB-UXFIX-001 first to establish reusable patterns, then 002 → 003 → 004 unless owner priorities or real dependencies change.

1. Every existing action remains available from an appropriate authorized location, without weakening validation, audit history, concurrent-write protections or RLS; reference the original source routes/actions before extracting components.
2. For each story demonstrate **list → selected detail → intentional edit → Save/Cancel → persisted read-back → back to retained list context**, plus create/archive/permission-specific flows.
3. Reuse tested layout primitives and Butterbox brand tokens; do not fork four unrelated design systems or copy forms into a generic dashboard.
4. Verify keyboard, screen reader, axe, reduced-motion, mobile/desktop, loading, empty, error and access-denied states. Run focused database/auth integration tests, component/unit checks, lint, types and production build.
5. Preserve the owner-accepted private showcase at port 3137 and existing public synthetic preview: no reset/reseed/redeploy or security/public-exposure changes without explicit approval. UXFIX story evidence is new and separate from completed P0 milestone evidence.
6. Owner will submit more UXFIX observations later. These four stories do not imply approval of all other screens and do not close independently until their acceptance evidence is recorded.


## Epic DEMO — First internal Showcase MVP (P0 milestone)

**Milestone intent:** This is an internal, repeatable, interactive **product-review showcase**, not a production-go-live MVP. Reviewers must experience the existing application through safe synthetic data. The demo must not use production customer data or send real payroll/outbound messages. Future-vision concepts must be clearly distinguished from functioning features.

| ID | Story | Showcase priority | Status | Dependencies |
|---|---|---|---|---|
| BB-DEMO-001 | Isolated synthetic showcase café | P0 | Done | — |
| BB-DEMO-002 | Guided owner, manager and employee showcase journeys | P0 | Done | BB-DEMO-001 |
| BB-DEMO-003 | Showcase UI, navigation and mobile polish | P0 | Done | BB-BRAND-002; BB-DEMO-002 |
| BB-DEMO-004 | Repeatable showcase acceptance and reset | P0 | Blocked | BB-DEMO-001; BB-DEMO-002; BB-DEMO-003 |
| BB-DEMO-005 | Clearly labeled future-vision concept previews | P2 | Backlog | BB-DEMO-002 |

### Story acceptance requirements

**BB-DEMO-001 — Isolated synthetic showcase café.** Dedicated positively verified isolated demo environment; 12–15 fictional staff members, FOH/BOH roles and realistic availability, rosters, attendance, corrections and approved time/payroll CSV samples. Repeatable, resettable fixtures, no real data, live messaging or payroll, and no seeding unidentified or production environments. This provides a specific implementation slice of the separate broader SAAS-003 demo-isolation work and does not make SAAS-003 fully Done.

**BB-DEMO-002 — Guided owner, manager and employee showcase journeys.** Reproducible walkthroughs and scoped review accounts for setup, staff, roster, open shifts, attendance, timesheets and payroll preparation. Include real navigation and negative/permission paths; clearly label missing features.

**BB-DEMO-003 — Showcase UI, navigation and mobile polish.** Review real deployed application routes with approved logo, consistent UI design and accessible responsive behavior, correcting the highest-impact issues. Do not represent illustrative marketing imagery as real app screenshots.

**BB-DEMO-004 — Repeatable showcase acceptance and reset.** Restricted, stable reviewer access; verified reset; automated core journey smoke checks and tenant isolation; documentation of review accounts, failure modes and known gaps; record owner review. Not authorization for production release or paid infrastructure.

**BB-DEMO-005 — Clearly labeled future-vision concept previews (optional).** Optional AI, forecasting and Award Central concepts may use illustrative synthetic data but must be identified as concepts; do not imply verified employment entitlements or functioning production AI.

### Showcase priority overlay — applies to every row in BACKLOG_INDEX.csv

The CSV retains the existing `Priority` column for the full product and adds `Showcase_Priority` as the **first-showcase scheduling axis**. Neither changes the factual `Status`. Every story, including Done and Blocked, receives a value.

- **P0 — Showcase-essential:** Features and foundations needed to demonstrate the owner-to-employee-to-payroll journey, safe synthetic demo data, navigation, identity, core branding, and a simple hours dashboard.
- **P1 — Valuable showcase enhancement:** Helpful but not essential at first review, e.g. late/no-show alerts, optional warnings, extended help and extra UI productivity.
- **P2 — Later demonstration/marketing enhancements:** Optional AI concept, forecasting, extended communications or campaign assets; may be considered after the core demo.
- **P3 — Post-showcase / production milestone:** SaaS billing, live payroll adapters, operational resilience, real award-calculation and compliance signoff, and other features that do not need to ship for the internal review.

**Selection rule:** Complete and safely checkpoint the active BB-ATTEND-006 work before major reprioritization, unless blocked. Then tackle **ready, not-Done P0 showcase stories** and their required dependencies, prioritizing BB-DEMO-001/002, BB-REPORT-001, approved brand assets and BB-DEMO-003/004. P0 foundational stories already Done need not be rebuilt. A Blocked P0 item stays blocked until explicitly cleared. A P1 in-progress feature may be completed rather than abandoned when the safe finishing cost is small.

**First-showcase exit gate:** A positively identified isolated demo with synthetic café data, working owner/manager/employee journeys on mobile and desktop, understandable planned-vs-worked hours, consistent approved branding, safe repeatable reset and passing targeted smoke tests. These gates do **not** signify production readiness, independent award validation, actual payroll transmission, approved retention practices, paid subscription operations or live marketing integrations.


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



## Epic PAYRULES — Butterbox Award Central: Australian Award Intelligence and Gross Pay Interpretation (P0/P1)

**Architecture:** Butterbox centrally owns, validates, versions and publishes one shared library of approved Australian Modern Award interpretations. All customers reference the same immutable, effective-dated approved award versions; customers cannot edit or override central award logic. Customer-specific employee arrangements, classifications, contracts, over-award rates and Xero mappings remain tenant-scoped. Separately reviewed enterprise agreements and exceptions may use isolated tenant-specific rulesets. AI may ingest and propose but never activate award rules. Deterministic execution, expert verification and governed publication are mandatory. Employers confirm applicable employment arrangements and remain responsible for correct employee pay; Xero initially owns official payroll rates and processes payments.

### BB-PAYRULES-001 — Award and employment agreement assignment [P0]

**User story:** As a business owner, I want to assign the correct award or agreement and employment conditions to each worker so their pay is interpreted against the right rules.

**Acceptance criteria**

1. Select an approved central award version or supported separately reviewed agreement; capture classification, employment basis, location and effective dates.
2. Store customer-specific assignments under tenant RLS; clients cannot edit centrally published award logic.
3. Preserve history and flag missing or unresolved instrument, classification or agreement details; block unsupported payroll interpretation.
4. Show the customer's confirmation and source of each employee arrangement.

**Dependencies:** BB-RULES-001;BB-PEOPLE-001

### BB-PAYRULES-002 — Central versioned award rule and rate library [P0]

**User story:** As a Butterbox compliance administrator, I want one shared centrally managed library so every customer uses the same validated interpretation for the applicable award version.

**Acceptance criteria**

1. Butterbox owns shared award definitions; approved versions are immutable, effective-dated and available read-only to authorised tenants without duplicating rules per tenant.
2. Rules include authoritative sources, clause citations, rate provenance, validation evidence and lifecycle states: draft, review, approved, active and superseded.
3. Customer administrators cannot edit, replace, activate or override shared award interpretations; cross-tenant configuration and data remain isolated.
4. An approved central award version is referenced by identifier in each calculation, enabling reproducible historical results.
5. Support separately scoped and independently validated client-specific agreements without changing the central modern-award library.

**Dependencies:** BB-PAYRULES-017;BB-RULES-003

### BB-PAYRULES-003 — Employee classification and official pay-rate mapping [P0]

**User story:** As a payroll administrator, I want employee classifications and reference rates mapped to Xero so award calculations and payroll can be reconciled.

**Acceptance criteria**

1. Maintain tenant-specific employee classifications, employment type, agreed conditions, over-award rates and effective dates.
2. Map classifications to approved shared award rates without copying or editing shared rule definitions.
3. Keep Xero the initial source of official configured payroll rates; flag missing and below-minimum or discrepant configurations for review.
4. Restrict mappings and sensitive rate data to authorised personnel and retain change history.

**Dependencies:** BB-PAYRULES-001;BB-PAYRULES-002;BB-PAY-003

### BB-PAYRULES-004 — Approved timesheet segmentation and ordinary hours [P0]

**User story:** As a payroll approver, I want approved worked time split deterministically into pay intervals so hours map to appropriate award categories.

**Acceptance criteria**

1. Use approved immutable timekeeping inputs and applicable worker/venue timezone.
2. Segment across midnight, weekday and entitlement boundaries including DST and paid/unpaid breaks.
3. Reconcile segment totals against worked time with no overlapping or duplicated time.
4. Record source event and approved central rule-version identifiers; flag missing information.

**Dependencies:** BB-TIME-001;BB-TIME-004;BB-PAYRULES-002

### BB-PAYRULES-005 — Weekend and public-holiday penalties [P0]

**User story:** As a payroll approver, I want the correct approved penalty category assigned to each worked interval.

**Acceptance criteria**

1. Apply reviewed instrument-specific weekend, public-holiday and casual-loading rules with effective dates.
2. Determine relevant state or local public holidays and segment cross-midnight shifts correctly.
3. Evaluate interactions and precedence without blindly stacking multipliers.
4. Maintain independent golden tests and explain the exact clause and rule version used.

**Dependencies:** BB-PAYRULES-004;BB-PAYRULES-013

### BB-PAYRULES-006 — Overtime and cumulative-hours interpretation [P0]

**User story:** As a payroll approver, I want relevant cumulative hours and overtime thresholds evaluated across shifts.

**Acceptance criteria**

1. Apply validated daily, weekly, consecutive-day and agreement-related thresholds only where supported.
2. Account for linked workers and multiple venues without disclosing other tenants' confidential schedules.
3. Distinguish penalty and overtime categories without double counting.
4. Test threshold boundaries, changed contracts, cross-midnight shifts and concurrency.

**Dependencies:** BB-PAYRULES-004;BB-PAYRULES-005

### BB-PAYRULES-007 — Breaks, minimum engagements and split-shift rules [P0]

**User story:** As a manager, I want validated break and minimum-engagement conditions reflected in interpreted pay and warnings.

**Acceptance criteria**

1. Evaluate approved minimum paid engagements, paid/unpaid breaks and split-shift conditions.
2. Use actual recorded break facts; never invent a break or imply a warning is proof of compliance.
3. Show payment components, warnings and award clause citations independently.
4. Block payroll approval on unresolved critical conditions under the approved policy.

**Dependencies:** BB-ATTEND-002;BB-RULES-002;BB-PAYRULES-004

### BB-PAYRULES-008 — Allowances and higher-duty entitlements [P1]

**User story:** As a payroll approver, I want supported allowances and higher-duty assignments included with evidence.

**Acceptance criteria**

1. Support validated automatic conditions and authorised evidence-backed manual allowance records.
2. Resolve effective-dated higher-duty and classification conditions without altering ordinary employee records.
3. Map each allowance to a supported Xero pay item or a review exception.
4. Audit fact entry, approval, calculation and corrections.

**Dependencies:** BB-PAYRULES-002;BB-PAYRULES-003

### BB-PAYRULES-009 — Explainable gross pay interpretation [P0]

**User story:** As a business owner, I want an itemised gross-pay estimate with reasons so I can inspect how hours were interpreted.

**Acceptance criteria**

1. Calculate deterministically with centrally approved rule versions and tenant-specific employment configurations.
2. Explain category, hours, multiplier, reference rate, amount, rule clause and effective date for each component.
3. Retain immutable input snapshots and version identifiers for reproduction and audit.
4. Label estimates separately from Xero's official gross pay and block unsupported or unapproved interpretations.

**Dependencies:** BB-PAYRULES-004;BB-PAYRULES-005;BB-PAYRULES-006;BB-PAYRULES-007

### BB-PAYRULES-010 — Xero earnings-rate mapping and reconciliation [P0]

**User story:** As a payroll administrator, I want interpreted components mapped to the correct Xero earnings rates.

**Acceptance criteria**

1. Map pay categories to supported Xero EarningsRateID values per tenant payroll connection.
2. Verify configured Xero rates and pay categories against expected award references and employee arrangements.
3. Prevent unmapped or mismatched components from silently exporting.
4. Require explicit permission to create or change Xero rates; do not silently replace its official configuration.

**Dependencies:** BB-PAY-003;BB-PAY-004;BB-PAYRULES-009

### BB-PAYRULES-011 — Interpretation exceptions and payroll approval gate [P0]

**User story:** As a payroll approver, I want critical award or mapping exceptions resolved before payroll export.

**Acceptance criteria**

1. Flag unsupported instruments, stale/unapproved central rules, missing classification, rate mismatches and ambiguous conditions.
2. Enforce server-side export blocks and approval scope for unresolved critical exceptions.
3. Record reviewer decision, rationale, input versions and payroll-period lock state.
4. Expose employee-level details only to authorised tenant users.

**Dependencies:** BB-TIME-005;BB-PAYRULES-009;BB-PAYRULES-010

### BB-PAYRULES-012 — Historical recalculations and auditable adjustments [P0]

**User story:** As an auditor, I want earlier entitlements reproduced and corrected without mutating original results.

**Acceptance criteria**

1. Reproduce historical output from exact original source facts, tenant configuration and central award versions.
2. Propose adjustments when source facts or rules are corrected, displaying old/new differences.
3. Preserve immutable exports and approval audit; avoid duplicate adjustment payments.
4. Require authorised review before generating new export versions.

**Dependencies:** BB-TIME-006;BB-PAYRULES-009;BB-PAYRULES-011

### BB-PAYRULES-013 — Independent award calculation regression evidence [P0]

**User story:** As a product owner, I want independently validated reference scenarios before any award is enabled for payroll.

**Acceptance criteria**

1. Maintain expert-reviewed golden cases for penalties, overtime, allowances, breaks, holidays, classifications and interactions.
2. Test DST, midnight, minimum engagement, cumulative hours and effective-date boundaries.
3. Fail publication on missing mandatory coverage, contradictory evidence or unresolved critical cases.
4. Record reviewer, test provenance, coverage limitations and signoff; never claim government certification without one.

**Dependencies:** BB-PAYRULES-019;BB-PAYRULES-020

### BB-PAYRULES-014 — Pre-publication roster labour cost estimates [P1]

**User story:** As a venue manager, I want estimated award-aware labour costs before I publish a roster.

**Acceptance criteria**

1. Estimate using planned shifts, shared approved award rules and tenant employment settings.
2. Break down cost by venue, department, day, role and worker within permissions.
3. Show missing-data assumptions and differentiate forecast from earned/paid amounts.
4. Recalculate on roster edits without changing official timesheets or pay.

**Dependencies:** BB-ROSTER-008;BB-PAYRULES-009

### BB-PAYRULES-015 — Actual-versus-rostered labour cost analytics [P1]

**User story:** As an owner, I want to understand labour-cost differences between roster estimates and worked time.

**Acceptance criteria**

1. Compare versions of planned cost and interpreted approved worked-time cost.
2. Explain variances from hours, penalties, allowances and classification changes.
3. Reconcile to auditable source events and calculation versions.
4. Scope employee financial drill-down by tenant and role.

**Dependencies:** BB-PAYRULES-014;BB-PAYRULES-009;BB-REPORT-001

### BB-PAYRULES-016 — Central award regulatory maintenance and client impact [P0]

**User story:** As a Butterbox compliance administrator, I want one governed update process for supported awards.

**Acceptance criteria**

1. Detect authoritative rule or rate changes centrally and retain publication/effective dates.
2. Compute impact previews across affected tenant configurations without exposing one tenant's data to another.
3. Run regression and specialist approval before controlled activation of shared versions.
4. Notify affected customers of changed rates, mappings, classifications or actions required; prevent silent unapproved changes.
5. Maintain safe rollback, historical versions, review deadlines and unsupported/stale coverage alerts.

**Dependencies:** BB-PAYRULES-017;BB-PAYRULES-021

### BB-PAYRULES-017 — Official Fair Work award and rate data ingestion [P0]

**User story:** As a compliance administrator, I want official award rates and instruments acquired into a central staging library.

**Acceptance criteria**

1. Integrate supported Fair Work Commission Modern Awards Pay Database API information and authoritative consolidated award documents.
2. Retain source URL, retrieval timestamp, content hash, effective date, variation history and data provenance.
3. Identify fields not supplied by the rate API and gaps requiring reading full clauses.
4. Reject ambiguous or unavailable source data without activating payroll interpretations.

**Dependencies:** Official source and access assessment.

### BB-PAYRULES-018 — AI award clause interpretation with evidence [P0]

**User story:** As a compliance analyst, I want AI to propose the meaning and applicability of award clauses from official material.

**Acceptance criteria**

1. Extract conditions, rates, classifications, exclusions, precedence and dependencies with exact source references.
2. Store model/prompt version and confidence or uncertainty; highlight ambiguities and competing interpretations.
3. Keep all AI output central and draft-only, never direct client-specific executable overrides.
4. Protect against source-document prompt injection and provide traceable review evidence.

**Dependencies:** BB-PAYRULES-017

### BB-PAYRULES-019 — AI typed pay-rule proposal generation [P0]

**User story:** As a compliance analyst, I want AI findings expressed in a constrained deterministic rules format.

**Acceptance criteria**

1. Generate schema-validated central draft rule proposals referencing source clauses and effective periods.
2. Reject unsupported syntax, unverifiable assumptions and circular/conflicting rule dependencies.
3. Do not execute draft AI rules in live calculations, update tenant payroll settings or publish automatically.
4. Retain diffs and provenance between source interpretation and proposed structured rule.

**Dependencies:** BB-PAYRULES-018;BB-PAYRULES-002

### BB-PAYRULES-020 — Automated validation and rule-conflict detection [P0]

**User story:** As a compliance analyst, I want proposed award interpretations tested and contradictions surfaced.

**Acceptance criteria**

1. Validate proposed structured rules against official rate data and source document clauses.
2. Identify missing conditions, overlaps, precedence errors and conflicting rates.
3. Generate candidate tests, but evaluate them against independently reviewed expected results rather than self-validating AI output.
4. Block publication until required evidence, approval and golden cases pass.

**Dependencies:** BB-PAYRULES-019;BB-PAYRULES-013

### BB-PAYRULES-021 — Independent specialist approval and shared rule publication [P0]

**User story:** As a Butterbox compliance owner, I want controlled central publication of independently validated award interpretations.

**Acceptance criteria**

1. Require qualified specialist approval separate from AI proposal creation and record segregation-of-duties evidence.
2. Store immutable reviewer identity, decision, scope, supporting test outputs, sources and approved version.
3. Publish to one shared centrally managed, tenant-read-only award library, not copied editable tenant rulebooks.
4. Support scheduled effective dates, rollback through new versions and customer impact notices.
5. Restrict enterprise agreement and client-specific exception approvals to their own tenant-scoped reviewed rulesets.

**Dependencies:** BB-PAYRULES-020;BB-PAYRULES-013

### BB-PAYRULES-022 — Award change monitoring and AI impact analysis [P1]

**User story:** As a Butterbox compliance administrator, I want AI-assisted monitoring and impact previews for updated awards.

**Acceptance criteria**

1. Monitor authoritative award amendments and rates for content changes and effective dates.
2. Propose source-cited clause and structured-rule diffs, including affected approved versions and tenant configurations.
3. Generate customer-impact summaries with strict tenant isolation and prioritised action lists.
4. Require specialist approval and completed regression tests before any new shared version becomes active.
5. Alert when monitoring or sources fail so stale rules are not silently represented as current.

**Dependencies:** BB-PAYRULES-016;BB-PAYRULES-021

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


## Epic DOC — User guidance and contextual help (P1)

The canonical help content is maintained in `docs/USER_GUIDE.md` and any task-specific Markdown/MDX content in the repository. The customer-facing experience should be rendered as accessible, searchable HTML **inside the Next.js Butterbox application**, not maintained as a separate hand-coded HTML copy. Content must match implemented capabilities and permitted roles. Do not publish claims that an unverified or blocked workflow is available.

### BB-DOC-001 — Validate and expand the role-based user guide (P1)

**As** an owner, manager, employee or payroll administrator, **I want** trustworthy task-by-task instructions that match the current application.

**Acceptance criteria**
1. Every currently Done user-facing feature has an owner/manager/employee/payroll guide entry, or a documented reason it needs none.
2. Relevant screens, actual navigation/button labels, business/venue role limitations and failure/recovery paths are verified against the implementation.
3. Mobile-friendly screenshots or walkthrough illustrations are included only if captured/verified against the actual UI; never fabricate screen evidence.
4. Future, blocked and production-unavailable functionality is clearly marked; privacy, awards and payroll guidance does not overclaim regulatory compliance.

### BB-DOC-002 — Searchable in-app HTML help center (P1)

**As** a Butterbox user, **I want** to find relevant guidance without leaving the application.

**Acceptance criteria**
1. Accessible responsive Help Center renders repository-maintained Markdown/MDX as safe HTML, with task/role categories for onboarding, people, rosters, attendance, timesheets and payroll.
2. Keyword search and internal navigation return accurate task content, clear empty results and working routes without leaking cross-tenant/role-restricted content.
3. Help pages display only supported feature instructions appropriate to role, and distinguish unavailable capabilities from working ones.
4. Rendered content is sanitized/controlled, headings and navigation are keyboard/screen-reader friendly, and mobile/browser acceptance checks pass.

### BB-DOC-003 — Contextual help and documentation upkeep (P1)

**As** a user, **I want** relevant guidance accessible at the moment I need it; **as** a product owner, **I want** guidance kept accurate with each release.

**Acceptance criteria**
1. Core onboarding, roster, attendance, timesheet and payroll workflows expose contextual Help links to the appropriate guide section.
2. Documentation changes are included in the Definition of Done for all user-visible features and reviewed whenever relevant screens, permissions or flows change.
3. Help content has a review/version history; broken internal links, stale feature labels and accessibility regressions are caught by lightweight automated checks.
4. Screenshots and in-app help are verified against actual application behavior; optional AI assistance is not represented as available until separately implemented and tested.

## Epic BRAND — Brand identity and asset library (P2)

Plan a consistent and accessible Butterbox identity across the product,
website and marketing materials. Operational product functionality remains
the higher priority. `branding/README.md` catalogs the assets. The owner approved
the Coastal Wave logo **design direction**
(`branding/originals/butterbox-approved-logo.png`). The traced logo system and
`branding/BRAND_GUIDELINES.md` are drafts awaiting the owner's final visual
review. The concept photography binaries are still missing, and no campaign is
represented as approved. Each deliverable requires appropriate asset-rights
checks and owner review; these stories do not authorize publishing, ad spend
or production deployment.

### BB-BRAND-001 — Organize and govern brand assets [P2]

**User story:** As a product owner, I want an organized asset library with traceable provenance and approval.

**Acceptance criteria**

1. Inventory source files and derivatives with descriptive names, intended use, version and ownership.
2. Record provenance, license/permission, reviewer and approval state; distinguish missing, draft and approved assets.
3. Document contribution, storage, release and replacement procedures without including customer data or secrets.
4. Verify that every advertised library item exists or is explicitly marked missing.

### BB-BRAND-002 — Create approved logo variants [P2]

**User story:** As a product owner, I want consistent logo variants for digital and print use.

**Acceptance criteria**

1. Produce editable standalone vector masters and documented horizontal, stacked, mark-only, light, dark and monochrome variants where appropriate.
2. Record owner approval and rights; do not treat a rasterized concept-board crop as an approved master.
3. Document clear space, minimum sizes, background usage and prohibited alterations.
4. Verify legibility at intended small and large sizes and retain suitable source/export formats.

**Dependencies:** BB-BRAND-001

### BB-BRAND-003 — Publish brand guidelines [P2]

**User story:** As a designer, I want an approved visual and written identity guide.

**Acceptance criteria**

1. Document approved logo use, color palette, typography and licensing, voice and imagery principles.
2. Provide practical digital and print examples, including incorrect usage and accessibility guidance.
3. Verify contrast for documented interface text combinations and record owner approval and version history.
4. Keep concept-only or unapproved styling explicitly labeled.

**Dependencies:** BB-BRAND-002

### BB-BRAND-004 — Prepare homepage imagery [P2]

**User story:** As a prospective customer, I want accurate and accessible website imagery.

**Acceptance criteria**

1. Select approved, rights-cleared imagery and clearly distinguish illustrations from actual application screenshots.
2. Provide appropriately sized responsive sources and optimized formats without removing the originals.
3. Supply meaningful alternative text for informative images and empty alt text for decorative images.
4. Verify mobile/desktop presentation and loading behavior before deployment.

**Dependencies:** BB-BRAND-001;BB-BRAND-003

### BB-BRAND-005 — Prepare login artwork [P2]

**User story:** As a user, I want a welcoming and accessible sign-in experience.

**Acceptance criteria**

1. Use approved, rights-cleared artwork without obscuring or changing the authentication workflow.
2. Support mobile, desktop and low-bandwidth presentation with appropriate image optimization.
3. Verify contrast, keyboard access and suitable alternative-text treatment.
4. Record the approved source and test the actual login screen before deployment.

**Dependencies:** BB-BRAND-001;BB-BRAND-003

### BB-BRAND-006 — Create reusable marketing visuals [P2]

**User story:** As a marketer, I want reusable and truthful visual templates.

**Acceptance criteria**

1. Supply approved editable templates and exports for agreed common formats.
2. Use rights-cleared assets and distinguish illustrations from real product evidence.
3. Verify accessible color and text legibility; substantiate product claims.
4. Preserve source files, versions and approval history in the asset library.

**Dependencies:** BB-BRAND-001;BB-BRAND-003

### BB-BRAND-007 — Prepare Google Ads creative [P2]

**User story:** As a marketer, I want approved advertising assets sized for supported placements.

**Acceptance criteria**

1. Prepare editable and exported variants for selected supported placements.
2. Review readability, rights, truthful claims and applicable platform policies.
3. Record owner approval and intended campaign use before publishing.
4. Do not create a campaign, enable billing or incur spend without separate authorization.

**Dependencies:** BB-BRAND-006

### BB-BRAND-008 — Prepare social media templates [P2]

**User story:** As a marketer, I want consistent accessible social media materials.

**Acceptance criteria**

1. Provide editable templates and appropriately sized exports for selected platforms.
2. Include accessible copy and alternative-text guidance.
3. Review rights, factual accuracy and owner approval before publication.
4. Keep source versions and platform-specific limitations in the asset library.

**Dependencies:** BB-BRAND-006

### BB-BRAND-009 — Prepare branded email templates [P2]

**User story:** As a recipient, I want accessible and trustworthy Butterbox emails.

**Acceptance criteria**

1. Provide responsive HTML and plain-text templates using approved, rights-cleared assets.
2. Distinguish transactional and marketing messages and document applicable consent and opt-out requirements.
3. Verify readable rendering, alternative text and links in representative email clients.
4. Record approval without implying that an email provider or delivery channel is operational.

**Dependencies:** BB-BRAND-003;BB-BRAND-006

### BB-BRAND-010 — Prepare sales materials [P2]

**User story:** As a sales representative, I want accurate and consistent product materials.

**Acceptance criteria**

1. Provide approved editable presentation and one-page templates with appropriate export formats.
2. Verify feature, availability and compliance claims against actual evidence; label illustrations.
3. Record rights, version, reviewer and approval before distribution.
4. Keep materials accessible and maintain their sources in the asset library.

**Dependencies:** BB-BRAND-003;BB-BRAND-006

## Reusable GitHub Copilot / coding-agent task template

> Implement **[STORY ID] — [TITLE]** in `farbotkol/butterbox`. Inspect the repository and identify relevant existing patterns. First write a short plan including schema, security/tenant isolation, UI states, APIs and tests. Implement only this story and any necessary small dependencies. Follow Butterbox's light-first brand tokens. Do not rewrite unrelated modules. For each acceptance criterion, add or update tests and show how it was verified. Include loading, empty, error, permission-denied and mobile states where relevant. Run lint, typecheck, tests and build; report commands and outcomes truthfully. Deliver a concise changed-file summary and any migrations or manual setup. Do not claim completion where credentials, infrastructure or external API access are missing.

## Story refinement checklist

For every story, clarify before build: (1) target persona; (2) business/venue/department scope; (3) source of truth; (4) happy path; (5) failure and concurrency; (6) permissions; (7) notification and audit events; (8) compliance dependencies; (9) metrics; (10) mobile presentation.
