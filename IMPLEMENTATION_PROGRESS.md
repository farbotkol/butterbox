# Implementation progress

## Execution summary

- Total stories: **87**. Verified Done: **17**. In Progress: **6**.
  Blocked: **1**. Not started (Backlog): **63**.
- Done: BB-FOUND-002, BB-FOUND-003, BB-FOUND-004, BB-ORG-001, BB-ORG-002, BB-ORG-003,
  BB-ORG-004,   BB-PEOPLE-001, BB-PEOPLE-002, BB-PEOPLE-003, BB-PEOPLE-004, BB-PEOPLE-005,
  BB-PEOPLE-006, BB-ROSTER-001, BB-ROSTER-002, BB-ROSTER-003 and BB-ROSTER-006.
- The latest serialized Node run passed **47 tests**, with two integration
  tests skipped in that invocation and subsequently passed against the isolated
  project. After a clean isolated database reset, the full pgTAP regression
  passed **708/708 assertions across 18 files**, including 53 conflict-policy,
  51 availability-exception, 57 employee-preference, 78 draft-editing,
  37 manual-assignment and 28 linked-roster authorization assertions. The
  authenticated two-tenant integration and ordered leave, assignment,
  publication and policy-change races passed.
- Production compile, explicit TypeScript, generate and full ESLint passed.
  The **complete production Chromium regression passed 25/25 scenarios**
  (one process per scenario, low-memory mode). Its temporary app servers stopped,
  and the new disposable browser fixtures were removed.
- An offline, network-disabled, redacted Gitleaks scan of the pending feature
  changes and new files found no leaks.
- The historical local checkpoint-ref credential blocker described below remains
  unresolved; no credential values or checkpoint refs were modified.
- Earlier browser renderer/context failures and a signup runner process exit
  were observed under host memory pressure. Both full Chromium and headless
  shell were tried. The successful isolated-scenario run preserves each live
  permission transition and recovery-before-expiry coverage. Temporary app
  servers are stopped by the runner.
- The new exception scenario was split into two shorter isolated scenarios
  without removing assertions after its context closed in the full run. A
  subsequent focused runner was terminated by SIGTERM before finishing, and
  a later lint process also exited 143. The isolated gateway remains healthy
  and those fixtures were cleaned up. Host pressure was elevated; no cgroup
  OOM or PID-limit events were recorded, so the cause is not established.
- A later focused production run passed the automatic-role scenario and the
  split date-block/approval scenario. The new manual-role scenario exposed a
  form-reset defect, and the split rejection/cancellation scenario timed out
  while loading the availability page, before reaching its assertions.
  At that point host load was elevated and Linux pressure metrics showed very
  high I/O and memory contention; the exact timeout cause remains unconfirmed.
  The isolated gateway stayed healthy and the runner stopped its app server.
- A rebuilt focused run verified the rejected create form now retains its
  inputs, then exposed a second defect: editing the newly created open shift
  reused the blank creation form because their React keys were identical. The
  editor key now distinguishes creation and editing. A subsequent rebuilt
  automated run lost its browser context before the assertion.
- A separate interactive production-browser check passed the editor fix:
  creation reset, immediate editing loaded the saved role and times, assigning
  the worker changed the open count, and the stored role, employee and
  venue-local timestamps were verified directly in the disposable database.
  The same check exercised automatic-only compatibility, manual qualification
  errors and retained input, open shifts, grandfathered edits, qualified
  manual/automatic assignment and unqualified automatic rejection. Its
  diagnostic account and business were removed and their absence verified.
- The subsequent focused production-browser run passed all four scenarios:
  manual role restrictions, new-open-shift editing, leave rejection and
  cancellation, and draft editing. Split production compile, explicit
  TypeScript, generate and full lint passed; 15 focused unit tests and an
  offline redacted scan of the pending diff also passed. The subsequent complete
  20-scenario production-browser regression passed against the disposable stack.
- Employee preference storage, self-service, manager visibility and protected
  change history are implemented. All 57 focused database assertions, the
  two preference-validation unit tests and the focused production-browser
  acceptance scenario pass, including concurrent preference updates. The
  complete 21-scenario browser regression also passed, and its temporary app
  servers have stopped.
- Previous fix-up validation: the complete then-current production-browser regression
  passed **23/23 scenarios**, including automatic availability selection,
  rejected-form input retention, immediate open-shift editing, live permission
  transitions, leave decisions, conflict warnings and mobile schedules.
  The split production compile, explicit TypeScript check and generate passed.
  A fresh full lint and serialized Node run passed **45 tests**; two integration
  tests were skipped in that invocation and then both ran separately and passed.
  The disposable SQL regression passed **655/655 assertions across 17 files**,
  the authenticated tenant/edit/assignment regression passed, and the ordered
  leave-approval/automatic-assignment race test passed.
  The earlier automatic-availability browser failure was resolved by waiting
  for each saved shift's redirect before filling the next form, rather than
  relying on an unchanged success message. No assertions were removed.
  The runner stopped its temporary app servers; production was not modified.

## Current story

- **BB-ROSTER-007 — Conflict detection** remains In Progress. Owner-configured
  venue rules now control manual unavailable assignments and publication of
  unavailable, overlapping or over-24-hour shifts. Changes are audited, default
  to warnings, and are validated server-side; generic scoped overlap messages
  do not reveal another department's shifts. The focused 53-assertion SQL
  test, ordered concurrency cases and production-browser scenarios pass.
  Explicit shared-worker identity and cross-venue overlap detection remain.
- **BB-ROSTER-008 — Publish and notify** remains In Progress. Configured local
  blockers prevent publication atomically, and concurrent conflicting edits
  return an explicit retry. Published version history and employee
  notifications remain unimplemented.
- **BB-ROSTER-010 — Simple employee roster** now has a personal mobile schedule;
  it remains In Progress because required shift acknowledgements depend on the
  unfinished publication/versioning workflow.
- **BB-ROSTER-003 — Unassigned open shift** is Done: all four criteria are
  covered below. Role and availability restrictions are opt-in to preserve
  existing venue behaviour; active membership and overlap checks always apply.

### BB-ORG-002 — Configure venue and geofence (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ORG-002.1 Latitude, longitude and radius save with validation | Owners can configure or clear all three values per venue; coordinates are limited to six meaningful decimal places and radius to 1–10,000 metres. SQL constraints and an owner-only RPC enforce the same bounds. | Two parsing unit tests, 60 isolated pgTAP assertions and production Chromium verify valid saves, clear, no-op, boundaries, invalid/partial input, two venues and tenant/role isolation. | Pass |
| ORG-002.2 Location permission implications are explained | The form explains that future location-based clocking may require device/browser permission and that denial or inaccurate GPS can prevent verification; it explicitly says clocking and enforcement are not implemented. | Production Chromium verifies both the permission guidance and the implementation limitation on the owner screen, including a 375px layout. | Pass |
| ORG-002.3 All changes are audited | A protected trigger records actor or maintenance role, actual time, tenant, venue and old/new values for configured inserts, updates and clearing; unchanged values do not create events. Owners can see recent history. | pgTAP verifies actor/time/values, direct-write denial, privileged update/insert capture and tenant/role restrictions. Production Chromium verifies visible history and a serialized old/new chain under concurrent authenticated updates. | Pass |

Files: `supabase/migrations/20261101180000_venue_geofence.sql`,
`supabase/tests/database/venue_geofence.test.sql`, `src/lib/venue-geofence.ts`,
`tests/venue-geofence.test.mjs`, `src/app/actions.ts`,
`src/app/settings/organisation/page.tsx`, `tests/e2e/auth.spec.mjs` and README.
The migration has been applied only to the disposable test database. The
complete isolated database regression passed 617/617 assertions, the
authenticated two-tenant/concurrency regression passed, all 45 serialized
Node tests passed (one separately run integration skipped in that invocation),
full lint and split production compile/typecheck/generate passed, and the
geofence plus two organisation browser scenarios passed. Clock-in and location
enforcement remain separate unfinished stories.

### BB-PEOPLE-004 — Submit availability exceptions (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| PEOPLE-004.1 Date exceptions override recurring patterns | An employee can block inclusive local dates; approved leave also replaces recurring intervals for the whole day. Pending, rejected and cancelled leave does not override the pattern. | Unit tests cover overrides, unsubmitted patterns and inclusive boundaries; production Chromium verifies date blocks and approved multi-day leave replace otherwise available hours. | Pass |
| PEOPLE-004.2 Pending and approved leave are visually distinguished | The roster displays separately labelled, differently styled pending and approved leave alongside unavailable periods. | Production Chromium verifies pending leave retains recurring gaps, approved leave becomes unavailable all day, and cancellation restores the recurring display. | Pass |
| PEOPLE-004.3 Employees can see request status | The availability page lists pending, approved, rejected and cancelled requests; scoped managers review pending requests and can explicitly cancel approved leave. | Production Chromium exercises submit, approval, rejection and cancellation. The 51-assertion pgTAP suite verifies tenant/department scope, direct-write denial, shared staff, unlinking and transitions; concurrent approval/cancellation leaves exactly one winner. | Pass |

Files: `supabase/migrations/20261101140000_availability_exceptions.sql`,
`supabase/tests/database/availability_exceptions.test.sql`,
`src/lib/availability.ts`, `tests/availability.test.mjs`,
`src/app/availability/page.tsx`, `src/components/availability-editor.tsx`,
`src/app/actions.ts`, `src/app/roster/page.tsx`, `tests/e2e/auth.spec.mjs`
and README. The migration is applied only to the disposable test database.
All 20 production-browser regression scenarios passed, including both split
exception scenarios; the 51-assertion database test and approval/cancellation
race also passed. Blocks and approved leave are still indicators, not
assignment/publication blockers; conflict enforcement belongs to the
unfinished roster stories.

### BB-PEOPLE-005 — Set preferred hours and contact (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| PEOPLE-005.1 Preferences are separate from contractual restrictions | A separate table and employee self-service store optional weekly hours and schedule/leave email choices without changing employment details or roster eligibility. | Input-validation unit tests, 57 database assertions and a production-browser save/update/invalid-input scenario pass; employment type remains unchanged. | Pass |
| PEOPLE-005.2 Eligible managers can view preferences | The migration reuses availability visibility scope; eligible managers can view preferences on People. | Database tests cover self, department managers, shared staff and two tenants; production Chromium verifies owner visibility and API denial for an unrelated manager and tenant. | Pass |
| PEOPLE-005.3 Updates are logged | Every actual change stores the authenticated actor, time and old/new values in a protected history table; no-op saves do not create events. | Database tests reject direct history writes, check timestamps and values, and production-browser/API tests verify actor and a serialized history chain under concurrent updates. | Pass |

Files: `supabase/migrations/20261101160000_employee_preferences.sql`,
`supabase/tests/database/employee_preferences.test.sql`,
`src/lib/employee-preferences.ts`, `tests/employee-preferences.test.mjs`,
`src/app/actions.ts`, `src/app/availability/page.tsx`, `src/app/people/page.tsx`,
`tests/e2e/auth.spec.mjs` and README. The migration is applied only to the
disposable database. Preferences are not yet connected to notifications, which
remain an unfinished story. All 21 complete production-browser regression
scenarios passed after the focused acceptance tests.

### BB-ROSTER-003 — Unassigned open shift (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-003.1 Employee is optional | Draft creation and editing support an unassigned worker. | Existing production-browser draft-editing scenario creates and edits open shifts; focused manual-policy SQL also creates open shifts. Pass. | Pass |
| ROSTER-003.2 Open shifts are clearly styled | The roster has a separate amber open-shifts section and needs-cover labels. | Existing production-browser roster scenario checks the open-shifts section and label. Pass. | Pass |
| ROSTER-003.3 Count updates | The roster counts assigned and open shifts and shows an open-to-fill total. | Existing production-browser roster/draft-editing scenarios and manual-policy SQL verify the count changes. Pass. | Pass |
| ROSTER-003.4 Eligibility rules apply when assigning | Active, linked staff and non-overlap are always enforced; configured manual role and venue availability restrictions also apply to filling open shifts. Automatic selection checks submitted availability, date blocks and approved leave. Unknown availability and pending leave are not treated as unavailable. | 37 manual-role, 38 automatic-availability and 53 conflict-policy assertions pass, including a rejected open-shift assignment and unchanged open count. Production Chromium verifies retained input and rejected unavailable assignments; authenticated ordered leave/assignment and policy/assignment races pass in both orders. | Pass |

Files: `supabase/migrations/20261101150000_manual_assignment_eligibility.sql`,
`supabase/tests/database/manual_assignment_eligibility.test.sql`,
`supabase/migrations/20261101190000_auto_assignment_availability.sql`,
`supabase/tests/database/auto_assignment_availability.test.sql`,
`supabase/migrations/20261101200000_roster_conflict_policies.sql`,
`supabase/tests/database/roster_conflict_policies.test.sql`,
`tests/auto-assignment-concurrency.integration.test.mjs`,
`src/app/settings/organisation/page.tsx`, `src/app/actions.ts`,
`src/components/shift-editor.tsx`, `tests/tenant-isolation.integration.test.mjs`,
`tests/e2e/auth.spec.mjs` and README. The new migration is applied only to the
disposable test database. Matching uses the configured role's current name;
unrelated free-text shift titles do not inherit its restriction.

### BB-ROSTER-007 — Conflict detection (In Progress)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-007.1 Detect cross-department/cross-venue overlap, unavailable dates and invalid times | Existing database checks reject overlapping assignments to one venue-bound employee and invalid new shift times. Roster labels identify submitted unavailable periods, active date blocks, approved leave, legacy shifts exceeding 24 hours and same-worker overlap across departments. | Database and concurrency tests cover assignment rejection; transition-aware unit tests cover DST and boundaries. A 24-assertion database test and focused production-browser scenario verify scoped overlap detection and warning labels. Cross-venue identity/overlap is not implemented. | In Progress |
| ROSTER-007.2 Issues identify affected shifts | Availability and duration warnings are attached to each visible affected shift. The overlap lookup returns only shift IDs the viewer can manage and does not disclose a hidden conflicting shift's details. | Availability labels pass unit and production-browser checks, including pending versus approved leave, an overnight next-week block, unrelated-manager/tenant isolation and 1,011 availability intervals. The overlap SQL test and focused owner/scoped-manager browser scenario pass. | In Progress |
| ROSTER-007.3 Blocking rules are configurable | Owners can independently choose venue rules for manual unavailability and publication unavailability, overlap and excessive duration. Real changes are protected and audited; defaults are advisory. | 53 focused pgTAP assertions cover defaults, independent settings, audit, cross-tenant/role denial, affected shifts and atomic publication; production Chromium verifies owner configuration, mobile layout, denied managers, errors and resolving blockers; ordered policy races pass. | Pass |

Current files: `src/lib/shift-conflicts.ts`, `src/lib/paginated-rows.ts`,
`src/app/roster/page.tsx`, `tests/shift-conflicts.test.mjs`,
`tests/paginated-rows.test.mjs`, `tests/e2e/auth.spec.mjs`,
`supabase/migrations/20261101170000_roster_overlap_conflicts.sql`,
`supabase/tests/database/roster_overlap_conflicts.test.sql`,
`supabase/migrations/20261101200000_roster_conflict_policies.sql`,
`supabase/tests/database/roster_conflict_policies.test.sql`,
`src/lib/conflict-policy.ts`, `tests/conflict-policy.test.mjs`, the dependency
manifest/lockfile and README. Enforcement is opt-in; new same-profile overlaps
remain blocked by existing rules.

### BB-ROSTER-008 — Publish and notify (In Progress)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-008.1 Draft changes stay private until publication | RLS restricts drafts to authorized managers and the personal schedule reads only published assignments. | Existing two-tenant/scoped SQL and production-browser schedule tests passed in the 708-assertion and 25-scenario regressions. | Pass |
| ROSTER-008.2 Published version is recorded | Publication currently updates shift state and timestamp only. | No version history has been implemented or verified. | In Progress |
| ROSTER-008.3 Impacted employees are notified once | Notification delivery is not implemented. | Not tested; not implemented. | In Progress |
| ROSTER-008.4 Unresolved blockers prevent publishing | Configured venue availability, overlap and duration blockers atomically reject publication; concurrent roster changes return a retry. | 53 focused SQL assertions, authenticated ordered races and production-browser resolution of each local blocker pass. Cross-venue conflicts remain unsupported. | In Progress |

### BB-ROSTER-001 — Weekly people-by-day roster (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-001.1 Group by department; show venue-local dates, role and times | Grouped rows show each department's shifts, including visible historical assignments. A scoped roster lookup preserves employees' own secondary-department shifts without broadening management access. | Three grouping unit tests and 28 linked-roster SQL assertions pass. Authenticated requests to the standalone server verify grouped role/time/date markup, archived history and manager/employee scope. | Pass |
| ROSTER-001.2 Week navigation and responsive overflow | Week links retain the selected department; the grid has a horizontal mobile scroller. | Date/DST unit tests, authenticated next-week HTTP checks and production Chromium next/previous navigation and actual 375px horizontal scrolling pass. | Pass |

Files: `src/app/roster/page.tsx`, `src/lib/roster-groups.ts`,
`tests/roster-groups.test.mjs`, `tests/e2e/auth.spec.mjs`,
`supabase/migrations/20261101110000_linked_roster_departments.sql`,
`supabase/tests/database/linked_roster_departments.test.sql` and README.
The migration has been applied only to the disposable test database. It also
revokes own-shift access when membership is removed or no longer covers the
employee profile; managers do not acquire authority over personally linked
secondary departments.

### BB-ROSTER-002 — Create and edit shift (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-002.1 Form supports venue, department, role, worker, dates, start/end and break | Permission-filtered venue selector and controlled create/edit form; scoped create/edit RPCs; venue-local time and DST handling. | Production Chromium creates and edits assigned and open drafts, checks all fields, changes venue and verifies the stored timezone. 78 isolated SQL assertions cover authorization, validation, DST and sub-minute timestamps; a separate production Chromium test verifies microseconds survive an unchanged-time edit. Pass. | Pass |
| ROSTER-002.2 Errors are inline | Form associates validation and server-side conflict errors with fields and retains input. | Production Chromium triggers missing role/start, invalid break and overlapping employee errors, verifies inline messages and preserved values. Pass. | Pass |
| ROSTER-002.3 Successful save updates grid | Revalidated roster and redirect preserve venue, department, week and collapsed state; creation form resets after success. Published shifts remain protected. | Production Chromium creates, edits and assigns shifts, verifies rendered cards, stored values, reset behavior and scope denial. Authenticated concurrent edit/create/auto-assignment HTTP cases pass. | Pass |

Files: `src/components/shift-editor.tsx`, `src/app/roster/page.tsx`,
`src/app/actions.ts`, `src/lib/shift-form.ts`, `src/lib/dates.ts`,
`src/lib/workspace.ts`, `src/lib/roster-view.ts`,
`supabase/migrations/20261101120000_edit_draft_shifts.sql`,
`supabase/migrations/20261101130000_consistent_shift_creation.sql`,
`supabase/tests/database/edit_draft_shifts.test.sql`,
`tests/shift-form.test.mjs`, `tests/dates.test.mjs`,
`tests/tenant-isolation.integration.test.mjs`, `tests/e2e/auth.spec.mjs`
and README. The migrations were applied only to the disposable test database.
Manual assignment checks active linked employees, overlap and any enabled role
restriction, but does not yet enforce availability.

### BB-ROSTER-010 — Simple employee roster (In Progress)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-010.1 Only published assigned shifts appear | `/my-schedule` queries only scheduled, published shifts for employee profiles linked to the signed-in user and selected venue, with RLS still authoritative. | Production Chromium and authenticated Supabase requests verify own primary/secondary-department shifts, exclude drafts, unassigned shifts, other workers and another tenant; a manager with wider RLS still sees only their own personal shifts. Anonymous access and an unlinked account are also checked. Pass. | Pass |
| ROSTER-010.2 Venue-local time and location display clearly | Next-shift card and seven-day mobile schedule show venue-local dates/times, venue name/address and timezone; overnight overlaps appear in the week. | Three unit tests cover grouping, week boundaries and DST. Production Chromium at 375px verifies next shift, overnight overlap, local time, address, navigation and no page-level horizontal overflow. Pass. | Pass |
| ROSTER-010.3 Updates visible and acknowledged when required | Refresh fetches current published data; the UI explicitly states acknowledgements are not yet available. | Production Chromium publishes a draft through the scoped owner RPC and verifies it appears after refresh. Acknowledgement requirements and versioning are not implemented. | In Progress |

Files: `src/app/my-schedule/page.tsx`, `src/app/my-schedule/loading.tsx`,
`src/lib/employee-schedule.ts`, `tests/employee-schedule.test.mjs`,
`src/components/main-navigation.tsx`, `tests/e2e/auth.spec.mjs`, `tsconfig.json`
and README. TypeScript permits `.ts` import extensions so Node's native
type-stripping unit runner can load the shared date helpers without another
dependency. The new route uses existing RLS and adds no database migration.

### BB-ROSTER-006 — Filter and collapse departments (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-006.1 FOH/BOH filtering and collapsing | Server-rendered, keyboard-operable department buttons use `aria-expanded` and hide their rows; the filter retains permitted departments. | Three state unit tests, authenticated HTTP requests and production Chromium verify filtering, collapse/expand buttons and independent groups. | Pass |
| ROSTER-006.2 Permission scope takes precedence | Collapse IDs are filtered against departments available to the caller; existing RLS and narrowly scoped personal-roster lookup limit underlying data and controls. | Linked-roster pgTAP suite and manager/employee HTTP checks pass, including forged collapsed IDs and denied secondary editing. | Pass |
| ROSTER-006.3 State persists while navigating | Week links, filter and disclosure forms, and shift/publish/delete redirects preserve the selected department and collapsed IDs. | Unit tests and authenticated HTTP checks verify week navigation, filtering and a successful shift save retain state. | Pass |

Files: `src/lib/roster-view.ts`, `tests/roster-view.test.mjs`,
`src/app/roster/page.tsx`, `src/app/actions.ts`, `tests/e2e/auth.spec.mjs`
and README. The targeted browser test passed collapse/expand, week/filter
navigation, shift save, forbidden IDs and manager/employee scopes.

### BB-PEOPLE-003 — Set recurring availability (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| PEOPLE-003.1 Save multiple weekly intervals | Owner-controlled member/profile linking; employee-only `set_employee_recurring_availability` RPC; `/availability` editor; explicit distinction between an unsubmitted and an empty pattern. | 53 availability pgTAP assertions and production Chromium scenario save two Monday intervals, check persistence, deny other employees and exercise an empty week. Pass. | Pass |
| PEOPLE-003.2 Handle overnight intervals | Venue-local weekday/minute intervals interpret an end at or before the start as the next day; the roster computes cyclic weekly coverage. | pgTAP stores Sunday 22:00–02:00; unit tests verify overnight/week rollover and 24-hour ranges; production Chromium shows Sunday and Monday boundaries. Pass. | Pass |
| PEOPLE-003.3 Show unavailable periods | RLS-scoped roster indicators display the complement of saved intervals; unsubmitted availability is labelled unknown. | Production Chromium verifies Monday's three gaps, Tuesday's full-day unavailability, Sunday overnight coverage and a separate unsubmitted worker. Pass. | Pass |

Files: `20261101100000_recurring_availability.sql`,
`recurring_availability.test.sql`, `src/lib/availability.ts`, its unit test,
`src/app/availability/page.tsx`, `src/components/availability-editor.tsx`,
People, roster, navigation, workspace types, actions, README and browser tests.
The migration has been applied only to the disposable test database.
Only owners link existing members; invitations are not yet implemented.
Managers can view scoped availability but cannot edit it. Availability is an
indicator only and does not yet constrain shift assignments or leave.

### BB-PEOPLE-002 — Manage skills and eligible roles (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| PEOPLE-002.1 Multiple roles per employee | Scoped `employee_job_roles` links, qualification editor and role filter. | 45-assertion eligibility pgTAP suite and production Chromium scenario save two roles and filter by a secondary role. Pass. | Pass |
| PEOPLE-002.2 Set a primary role | `set_employee_primary_role` and People primary-role form preserve exactly one structured primary role. | pgTAP and Chromium set and change a primary role, validate its profile title and prevent accidental removal. Pass. | Pass |
| PEOPLE-002.3 Exclude unqualified automatic assignments for restricted roles | Opt-in role restriction and `save_shift_auto_assign` validate role qualification and overlapping shifts under locks. | pgTAP and Chromium reject an unqualified employee, select a qualified employee and verify only one overlapping concurrent request succeeds. Pass. | Pass |

Files: `supabase/migrations/20261101090000_employee_role_eligibility.sql`,
`supabase/tests/database/employee_role_eligibility.test.sql`, `src/app/actions.ts`,
People, roster, organisation settings, `tests/e2e/auth.spec.mjs`, the browser
runner and README. The role migration has only been applied to the disposable
database. Existing free-text titles are not assumed to be verified
qualifications. Automatic assignment now also checks submitted availability,
date blocks and approved leave.

The full current production-browser regression passed all 16 scenarios. Each
permission role transition has its own test process, retaining the previous
role, live signed-in session and scope assertions. Signup/recovery and
recovered-session expiry were separated while retaining real recovery before
the two-tab expiry check. Earlier renderer/context failures occurred under
host memory pressure; the cause was not established.

## Completed authentication and setup

### BB-FOUND-002 — Register and sign in (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| 002.1 Verified accounts can authenticate | Signup uses the configured callback and exchanges confirmation codes. | Live Chromium with isolated Supabase/Mailpit verifies signup, emailed confirmation, login and redirect to setup. Pass. | Pass |
| 002.2 Wrong credentials have non-enumerating errors | Sign-in uses one generic error; reset uses generic confirmation. | Live browser compares unknown, unverified and wrong-password errors; unknown and registered reset responses match. Pass. | Pass |
| 002.3 Session expiry and logout work across tabs | Session-end notification and visibility refresh; sign-out failures are explicit. | Live browser checks cross-tab logout and a revoked expired session in two tabs. Pass. Expected invalid-refresh-token logs occur during expiry. | Pass |
| 002.4 Password reset completes | Recovery exchanges callback code, updates password, then signs out. | Real Mailpit link, password update, old-password denial and new-password login all pass. | Pass |

### BB-ORG-001 — Create business and first venue (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ORG-001.1 Setup collects business name, venue name, address and timezone | Setup UI/actions and `20261101040000_resumable_business_setup.sql`. | Isolated pgTAP verifies storage/validation; live browser submits all four fields and verifies stored address/timezone. Pass. | Pass |
| ORG-001.2 Ownership is established securely | Authenticated, serialized, atomic setup RPC. | pgTAP checks ownership, anonymous/repeated setup denial; live browser verifies owner membership. Pass. | Pass |
| ORG-001.3 Incomplete setup can be resumed | User-scoped RLS-protected persistent setup draft. | pgTAP checks isolation and cleanup; browser resumes partial setup in a separate context, including sample-data preference. Pass. | Pass |

The setup migration has been applied only to the disposable test database;
existing development and deployed databases still need the normal reviewed
migration process.

## Completed and verified

### BB-ORG-004 — Delegate departmental management (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ORG-004.1 Managers edit only assigned departments | Existing `can_manage_department` scoping on save/delete/publish; department-scoped roster filter; People shows linked staff from other departments as read-only. | pgTAP: FOH manager cannot add BOH shifts or publish BOH, and sees only FOH shifts; BOH manager likewise. Browser: each manager's filter lists only their department, a forced BOH URL falls back to FOH, BOH shift hidden from FOH manager, BOH manager cannot edit a FOH-primary profile. Pass. | Pass |
| ORG-004.2 Owner has consolidated view | All-departments roster labels each shift card with its department. | pgTAP: owner and venue GM see shifts in both departments. Browser: owner's all-departments view shows the BOH shift labelled "Back of House" plus the FOH open shift and combined counts. Pass. | Pass |
| ORG-004.3 Staff can belong to multiple departments | `20261101080000_multi_department_staff.sql`: `employee_departments` (backfilled; primary synced by trigger), owner/admin/GM `set_employee_departments` RPC, link-based `save_shift`, RLS for linked managers and own published shifts; shift FK relaxed to employee/business/venue. People membership form and roster linked staff. | pgTAP (25): primary auto-link, retained primary, venue/inactive/permission/cross-tenant denial, cross-department rostering and overlap detection, unlink keeps history. Browser: owner adds BOH, link stored, BOH manager rosters shared worker. Pass. | Pass |

Files: migration, `multi_department.test.sql`, `src/app/actions.ts`, People,
roster and `tests/e2e/auth.spec.mjs`. The shift-to-employee foreign key no
longer requires the shift department to equal the primary department;
`save_shift` enforces eligibility through the link table instead. Defects
fixed during testing: the old composite FK blocked secondary-department shifts,
and link-table RLS hid an employee's own secondary-department shifts. A
security-definer helper now handles that visibility check.

### BB-ORG-003 — Create departments and job roles (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ORG-003.1 FOH and BOH can be seeded | Existing `create_business` seeding, unchanged. | `department_roles.test.sql` asserts both departments and their roles are seeded for a new business. Pass. | Pass |
| ORG-003.2 Custom departments and roles can be created and deactivated | `20261101070000_department_role_management.sql`: `active` flags, `save_department`/`save_job_role` RPCs (owner/admin/GM for departments; department managers for their roles), duplicate/blank validation; `/settings/organisation` page, server actions, navigation link. | pgTAP covers create, rename, deactivate, reactivate, duplicates, cross-business/GM-venue/FOH-manager/employee/anonymous denial. Browser creates "Events", rejects a duplicate, adds and deactivates a role, renames and deactivates the department; employee page access denied. Pass. | Pass |
| ORG-003.3 Existing shifts retain historical references | Deactivation only flips flags; triggers block new shifts/active staff in inactive departments or roles while leaving existing rows; roster labels inactive departments and hides add-shift; People excludes inactive departments for new staff. | pgTAP verifies retained and renamed shift history plus new-shift/staff denial. Browser saves a shift through the UI, deactivates, and verifies the identical shift row, inactive roster notice and no add-shift or new-staff option. Pass. | Pass |

Files: migration, SQL test, `src/app/settings/organisation/page.tsx`,
`src/app/actions.ts`, roster, People, navigation and `tests/e2e/auth.spec.mjs`.
Fixed during testing: the inactive badge lacked a text separator, which gave
the heading the accessible name "FunctionsInactive". Shift roles are free text,
so inactive-role enforcement matches by name, case-insensitively. Publishing is
hidden for inactive departments.

### BB-PEOPLE-006 — View team directory (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| PEOPLE-006.1 Search and filters work | People GET form, name search, venue/department/role/status filters; selections checked against accessible records. | Production browser searches case-insensitively and combines role/department/archive filters; active no-match and venue switching pass. | Pass |
| PEOPLE-006.2 Personal data restricted by role | Scoped database reads and manager-only page/action/navigation; no client-only authorization. | Browser verifies GM/FOH/BOH see only permitted worker profiles/venue options, rejects forbidden venue, and denies employee page access. Existing 50 permission pgTAP assertions and two-tenant HTTP regression pass. | Pass |
| PEOPLE-006.3 Inactive staff cannot be newly rostered by default | Archive flag, roster active filter and save_shift eligibility check. | SQL archive/new-shift denial and live browser archived-worker exclusion pass. Historical shift remains. | Pass |

Files: `src/app/people/page.tsx`, save action, extended browser test and README.
Latest standard `npm run build` passes, including TypeScript. All 8 unit tests,
lint, 128 SQL assertions, authenticated two-tenant HTTP regression and both
production browser scenarios pass (21.9s).

### BB-PEOPLE-001 — Maintain employee profiles (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| PEOPLE-001.1 Name, preferred contact, employment type and status maintained | `20261101060000_employee_profiles.sql`, `src/app/people/page.tsx`, save action. | 18 new pgTAP assertions verify create/edit/archive/reactivate and normalized contact; live browser creates/edits/archives and verifies stored fields. Pass. | Pass |
| PEOPLE-001.2 Validation and tenant access enforced | Scoped RPC, existing RLS and immutable tenant association. | pgTAP rejects blank names, malformed email, invalid employment type, other tenant/department, employee and anonymous writes. Browser denies employee page/navigation. Pass. | Pass |
| PEOPLE-001.3 Archived staff history persists | Archive updates active flag only; no delete RPC, historical department preserved. | pgTAP and live browser retain original shift after archive; new assignment is denied in SQL and archived worker absent from roster dropdown. Pass. | Pass |

Profile migration applied only to disposable database. Added employee SQL test,
People page/navigation and server action; extended browser scenario. Latest
checks: lint and 8 unit tests pass; 128 SQL assertions pass; production
compile/typecheck/generate pass; both live browser scenarios pass (21.1s).

### BB-FOUND-004 — Business and venue permissions (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| 004.1 Permissions scoped to business, venue and department | `20261101050000_scoped_membership_permissions.sql`, permission assignment RPC and `src/app/settings/permissions/page.tsx`. | 50 permission pgTAP assertions pass across two businesses/three venues; live browser assigns owner, GM, FOH, BOH and employee and verifies stored scopes and visible departments. | Pass |
| 004.2 Server denies unauthorized actions | Scoped RLS/RPCs, last-owner safeguard, owner-only assignment action/page. | pgTAP covers direct writes, self-promotion, wrong venue/department, outside business and anonymous denial. Browser denies nonowner page access. Pass. | Pass |
| 004.3 UI hides forbidden controls without relying on hiding for security | Role-gated navigation and roster controls; explicit filter submit. | Live browser verifies permission link only for owners and no employee save/publish controls; manager departments remain scoped. Server denial independently tested. Pass. | Pass |

Files changed for this slice: scoped migration and SQL test, workspace membership
selection, permissions page, actions, navigation/app shell, roster filter and
`tests/e2e/auth.spec.mjs`. Production compile, explicit TypeScript check and
generate phases pass. Both browser scenarios pass (23.3s).

### BB-FOUND-003 — Tenant isolation (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| 003.1 Tenant-owned records have an immutable business association | `supabase/migrations/20261101030000_immutable_business_associations.sql` guards all six business-scoped tables; user profiles are global identities, not business-owned records. | `tenant_isolation.test.sql` exercises every guard, including a previously movable membership and a same-business update. Six tests failed before the migration; all pass afterward. | Pass |
| 003.2 RLS and API reject cross-tenant reads and writes | Existing RLS and permission-checked RPCs plus immutable-ID triggers. | pgTAP tests reads, direct writes, RPC denial and valid own-tenant operations; `tests/tenant-isolation.integration.test.mjs` verifies authenticated HTTP reads and writes in both directions. Both pass. | Pass |
| 003.3 Automated tests cover two distinct businesses | `supabase/tests/database/tenant_isolation.test.sql`, `tests/tenant-isolation.integration.test.mjs`. | 32 new pgTAP assertions and one authenticated HTTP integration test pass with two businesses; the existing 9 pgTAP assertions also pass. | Pass |

The migration has been applied **only** to the disposable test database. Apply
it through the normal reviewed migration process before using it in another
environment. HTTP test fixtures were removed and their absence verified.

## Blocked stories

### BB-FOUND-001 — Create production-ready application (Blocked)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| 001.1 Clean checkout installs and builds with documented commands | `README.md`, lockfile and `Dockerfile`. | A separate clean checkout successfully ran `npm ci`, `npm test` and `npm run build`; the container also installed and built from scratch. | Pass |
| 001.2 Environment variables have safe examples | `.env.example`, `.gitignore`, `.dockerignore` and `README.md`. | Example values are empty; a redacted Gitleaks scan of the clean checkout found no leaks. | Pass |
| 001.3 A deployment runs a health check | `src/app/api/health/route.ts`, `src/proxy.ts`, `Dockerfile` and `.github/workflows/ci.yml`. | A built container became healthy as UID 1000; `GET` returned 200 and `no-store`, `POST` returned 405, and the home page returned 200. | Pass |
| 001.4 No secrets are committed | `.gitignore` excludes local environment and Supabase CLI state. | Gitleaks found no leaks on the current branch or in the clean checkout. A scan of **all local refs** nevertheless found four Supabase key/token findings in an earlier local checkpoint commit, not reachable from the current branch. | Blocked |

Credential owners must assess/rotate any affected keys and decide how to handle
the local checkpoint history. This session did not rewrite or delete those
refs, and no secret values were printed. GitHub CI has been configured but has
not yet run remotely.

## Test environment and outcomes

- Supabase CLI 2.122.0 runs in a separate temporary project on ports
  55421/55422. The existing Butterbox stack was not modified. SQL fixtures are
  rolled back and HTTP fixtures are cleaned up. Following interrupted reset and
  migration attempts under host pressure, the disposable schema was restored
  transactionally with `psql`; later migration-history rows have empty
  `statements` arrays. The locally applied preference migration was subsequently
  amended transactionally for actual change timestamps, so its stored CLI
  statement text also predates that amendment. A future normal reset should
  rebuild standard CLI history from the current migration files.
- Serialized Node unit run: 45 passed, one HTTP integration explicitly
  skipped without disposable settings. The isolated database regression
  passed 655/655 pgTAP assertions and the separately configured two-tenant
  HTTP integration passed with restricted-assignment race cases.
- Production split compile, explicit TypeScript, generate and lint passed.
  The previous 16-scenario production-browser regression and the original
  focused date-exception scenario passed. A later 17-scenario regression failed
  because that browser context closed; the other 16 passed. In a newer focused
  run, the split date-block scenario passed but the rejection/cancellation
  scenario timed out during page navigation. The manual-role and editor fixes
  subsequently passed an interactive production-browser check with persisted
  data verified, followed by four passing targeted automated scenarios and all
  20 complete production-browser regression scenarios. Host resource pressure
  was elevated during earlier failures, but their exact cause is not established.
- PEOPLE-005's focused database and production-browser tests pass, as do all
  21 complete production-browser regression scenarios.
- After the new advisory conflict labels, all 43 serialized Node unit tests
  pass, and the separately configured two-tenant concurrency integration passes.
  Focused production Chromium passes the original availability and preference
  regressions and the new 1,011-interval pagination/conflict scenario; all 21
  complete production-browser scenarios also pass. Full lint and split
  production compile, TypeScript and generate pass.
- A network-disabled, redacted Gitleaks scan of both the pending tracked diff
  and new files found no leaks; `npm audit --omit=dev` reported zero production
  dependency vulnerabilities after adding Temporal.
- After adding scoped overlap reporting, all 24 focused pgTAP assertions and
  the complete 557-assertion isolated database regression pass. The first
  focused run found that the existing `can_view_venue` helper alone did not
  validate a venue/business pair for owners; the new RPC now validates the
  pair explicitly. The corrected migration was reapplied through local
  migration-history repair only in the disposable project.
- The test helper rejects missing disposable confirmation and non-local URLs.
- `npm audit --omit=dev` reported no production dependency vulnerabilities;
  `npm ci` reported 16 moderate development-dependency advisories.

## Outstanding defects and technical decisions

- The health endpoint is liveness only; it does not assert Supabase readiness.
- Build separate images per environment: Next.js embeds `NEXT_PUBLIC_` values
  at build time. Never use a secret/service-role key in those values.
- Stories are marked Done only after every acceptance criterion is verified.
- The repository instructions checkpoint `08fac01` was pushed to the requested
  feature branch. This conflict-policy checkpoint builds on it; inspect Git
  status and the remote SHA during recovery rather than relying on older notes.
- Cross-venue identity/overlap, publication versioning, employee notification
  and acknowledgement remain incomplete. The historical credential findings
  still require owner assessment and any approved rotation/history handling.

## Next story

- Continue **BB-ROSTER-008** with an immutable published-version record and
  exactly-once employee notification workflow, preserving draft privacy,
  tenant/department authorization and atomic blocker checks. Then implement
  acknowledgements for BB-ROSTER-010 and explicit shared-worker identity and
  cross-venue overlap detection for BB-ORG-005/BB-ROSTER-007.
- Migrations through `20261101200000` are applied only to the isolated stack.
  The pre-existing Butterbox development stack and production were not changed.
- Isolated workdir:
  `/home/codespace/.copilot/session-state/7476d757-d2b0-401f-90ff-d6ab4307efc9/files/butterbox-acceptance`.
  Next invocation can start its Supabase project again with the pinned CLI.
  Browser helpers create/remove fixtures and stop their app server automatically.
- Known environment workaround: sequential `--split-build` with
  `BUTTERBOX_TEST_LOW_MEMORY=yes`; use the existing session browser library
  directory in `LD_LIBRARY_PATH` if Chromium reports missing system libraries.
  `BUTTERBOX_TEST_SUPABASE_CLI` accepts the cached native CLI path.
- No background execution or scheduling is promised after this session ends.
