# Implementation progress

## Execution summary

- Total stories: **87**. Verified Done: **25**. In Progress: **7**.
  Blocked: **2**. Not started (Backlog): **53**.
- Done: BB-FOUND-002, BB-FOUND-003, BB-FOUND-004, BB-ORG-001, BB-ORG-002, BB-ORG-003,
  BB-ORG-004,   BB-PEOPLE-001, BB-PEOPLE-002, BB-PEOPLE-003, BB-PEOPLE-004, BB-PEOPLE-005,
  BB-PEOPLE-006, BB-ROSTER-001, BB-ROSTER-002, BB-ROSTER-003, BB-ROSTER-004, BB-ROSTER-006,
  BB-ROSTER-007, BB-ROSTER-010, BB-ATTEND-001, BB-ATTEND-002, BB-ATTEND-003,
  BB-ATTEND-007 and BB-TIME-001.
- The latest serialized Node run passed **60 tests**, with five integration
  tests skipped in that invocation and subsequently passed separately against
  the isolated project. The complete isolated pgTAP regression passed
  **1,104/1,104 assertions across 25 files**, including 72 clock and 79 break
  assertions. Authenticated two-tenant, linked-worker, attendance and ordered
  concurrency tests passed, including duplicate clock/break requests, competing
  transitions, link/publication ordering and membership revocation.
- Production compile, explicit TypeScript, generate and full ESLint passed.
  All **32/32 production-browser scenarios** passed in serialized, low-memory
  mode. Coverage includes classified breaks, scoped cross-venue workflows and a
  real 1,001-shift roster; the temporary application server stopped.
- Each exact staged checkpoint is checked with a network-disabled, redacted
  Gitleaks scan before committing.
- BB-ATTEND-003's final isolated migration replay and complete repository
  database regression passed **1,175/1,175 assertions across 26 files**,
  including 71 location assertions and the final tenant/venue guard. The
  serialized Node suite passed **66 tests**, including three early worked-time
  unit tests; its six skipped integrations were run separately and all passed.
  Full ESLint, TypeScript and split production compile/generate passed. The
  complete **33/33** production-browser regression passed before the last
  guard and review-error wording change; a rebuilt focused location scenario
  then passed against the final schema, including the review failure path.
  The disposable fixtures and temporary app server were removed.
- BB-ATTEND-003 was committed as `250ad36` and pushed to the requested
  development branch; the remote SHA matched the local checkpoint.
- BB-TIME-001's fresh isolated migration replay and complete pgTAP suite
  passed **1,210/1,210 assertions across 27 files**, including 35 worked-time
  assertions. All six authenticated tenant/concurrency tests passed. The
  serialized Node suite passed **66 tests**, with those six integrations run
  separately. Full ESLint, TypeScript, split production compile/generate and
  the complete **34/34** production-browser scenarios passed. Disposable
  fixtures were removed and the temporary application server stopped.
- BB-TIME-001 was committed as `e9f8325` and pushed to the requested
  development branch; the remote SHA matched the local checkpoint.
- BB-ROSTER-004 passed a clean isolated replay of all 28 migrations and
  **1,257/1,257 pgTAP assertions across 28 files**, including 47 copy
  assertions. All seven authenticated tenant/concurrency tests and 68
  serialized Node unit tests passed; the seven integrations skipped by the
  Node-only invocation passed separately. Full ESLint, TypeScript, split
  production compile/generate and the rebuilt focused copy browser scenario
  passed. The complete **35/35** production-browser regression passed before
  the final clock-change guard and explanatory wording; the rebuilt focused
  scenario exercised the final guard. Disposable users and businesses were
  removed and the temporary application server stopped.
- BB-SAAS-003's checklist and default-off sample policy passed the complete
  isolated regression: **1,286/1,286 pgTAP assertions across 29 files**,
  eight authenticated tenant/concurrency tests, 70 serialized Node tests,
  full ESLint, TypeScript, split production build and **37/37** production
  browser scenarios. The eight integration tests were run separately from the
  Node-only invocation. All disposable users and businesses were removed,
  the sample policy was disabled and the temporary app server stopped.
  Production isolation remains unverified, so the story is Blocked, not Done.
- The BB-SAAS-003 checkpoint was committed as `dd2e01b` and pushed to the
  requested development branch; the remote SHA matched.
- BB-FOUND-005's invitation checkpoint passed **1,352/1,352** isolated
  pgTAP assertions across 30 files, including 66 invitation assertions.
  The serialized Node run passed **74 tests**; its nine separately run
  authenticated integrations cover tenant boundaries and concurrency.
  Full ESLint, TypeScript and split production compile/generate passed.
  All **40/40** production-browser scenarios passed before the final
  refresh-token verification change; the rebuilt three focused scenarios
  subsequently passed against that final change, including deliberately
  mismatched access and refresh tokens. Disposable users and businesses were
  removed, sample policy remained disabled and the temporary app server stopped.
- The invitation checkpoint was committed as `05f001b` and pushed to the
  requested development branch; the remote SHA matched.
- BB-ATTEND-005's offline-claim slice replayed on the isolated stack. All
  **1,400/1,400 pgTAP assertions across 31 files**, including 48 focused
  offline-claim checks, passed. Ten authenticated tenant/concurrency tests
  and 77 serialized Node tests passed; the ten integrations skipped in the
  Node-only run passed separately. Full ESLint, TypeScript and split production
  compile/generate passed. Four focused production-browser scenarios passed,
  including offline capture, upload failure, sign-out/account switch,
  concurrent tab retries, scoped manager visibility and storage failure.
  The offline scenario was rebuilt and passed again after the final UI changes.
  Claims are not reconciled into attendance or payroll; this story remains
  In Progress. The browser test server stopped and disposable fixtures were
  removed.
- The offline-claim checkpoint was committed as `e8f18d6` and pushed to the
  requested development branch; the remote SHA matched.
- BB-ATTEND-007's complete isolated migration replay passed **1,483/1,483**
  pgTAP assertions across 32 files, including 83 correction/lock assertions.
  All 11 authenticated tenant/concurrency tests and 84 serialized Node tests
  passed; the Node-only run skipped those 11 integrations, which passed
  separately. Full ESLint, TypeScript and split production compile/generate
  passed. The rebuilt correction scenario passed on desktop and a 375-pixel
  mobile viewport, and six related attendance/work-time browser scenarios passed.
  The first expanded browser run exposed a test assumption about whether a
  disclosure remained open after navigation; the test was corrected to check
  its actual state and then passed without removing assertions.
- BB-ATTEND-007 was committed as `911197e` and pushed to the requested
  development branch; the remote SHA matched.
- BB-ATTEND-005 now has a further verified reconciliation slice: managers can
  match a claim to an existing finished event without changing it, explicitly
  correct that event to the claimed time, or reject the claim with a reason.
  An authorized owner/admin/general manager can reopen a decision without
  undoing a prior correction. The complete isolated replay passed
  **1,527/1,527 pgTAP assertions across 33 files**, including 44 new
  reconciliation assertions; all 12 authenticated integrations, 86 serialized
  Node tests, full ESLint, TypeScript, split production build and five focused
  production-browser scenarios passed. The Node-only run skipped those 12
  integrations, which passed separately. At that checkpoint, claims with no
  matching finished event could not create attendance.
- The reconciliation checkpoint was committed as `86e3cbf` and pushed to the
  requested branch; the remote SHA matched.
- BB-ATTEND-005 now also supports a manager-confirmed clock-in/clock-out claim
  pair as a finished session. Both events retain their explicitly unverified
  offline source, exact device timestamps, and original claims/receipt times;
  work-time results flag the source and missing break evidence. Review records
  attribute the decision, no breaks are fabricated, and overlapping
  same/linked-worker sessions are rejected. The complete isolated regression
  passed **1,574/1,574 pgTAP assertions across 34 files**, including 47 pair
  assertions; 13 authenticated integrations and 86 serialized Node tests
  passed. The Node-only run skipped those 13 integrations, which passed
  separately. Full ESLint, TypeScript, split production build and five focused
  production-browser scenarios passed, including mobile pair creation and
  employee visibility. At that checkpoint, mixed online/offline sessions and
  offline page reopening remained incomplete.
- The paired-claim checkpoint was committed as `961b280` and pushed to the
  requested branch; the remote SHA matched.
- BB-ATTEND-005 now also lets a scoped manager complete an open server-clocked
  session with an unverified offline clock-out, preserving existing breaks and
  event history. Open breaks, invalid chronology, locks, linked-worker overlap,
  previously linked claims and unauthorized requests are rejected. The complete
  isolated replay passed **1,614/1,614 pgTAP assertions across 35 files**,
  including 40 mixed-session assertions. All 13 authenticated integrations,
  87 serialized Node tests, full ESLint, TypeScript, split production build and
  five focused production-browser scenarios passed. The Node-only run skipped
  those 13 integrations, which passed separately. Offline page reopening and
  resolving historical open breaks remain incomplete. An initial browser run
  exposed an ambiguous alert locator caused by Next.js's route announcer; the
  locator was scoped to the expected error and the rebuilt scenario passed
  without removing assertions.
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

- **BB-ATTEND-005 — Time capture fallback** is In Progress. Immutable,
  explicitly unverified offline claims retain the device time and server
  receipt time. The attendance page queues claims and retries idempotently after
  reconnecting as the same account. A scoped manager can match or correct a
  finished event, reject a claim, or confirm a matching pair as an explicitly
  offline-sourced finished session. Decisions and reopenings are immutable and
  employee-visible; no break is assumed. A manager can also complete a matching
  open server session with an offline clock-out while preserving recorded
  breaks. Historical open-break resolution and reopening the attendance page
  while offline remain incomplete.
- **BB-ATTEND-007 — Attendance corrections** is Done. Scoped corrections and
  edit-lock transitions are immutable, attributed and visible to permitted
  users; corrected work time, daylight-saving handling, precision, linked-worker
  overlap and concurrent account relinking are verified below.
- **BB-FOUND-005 — Invite and onboard users** is In Progress. The committed
  database migration implements scoped, seven-day invitations, verified-email
  acceptance, duplicate and revocation handling, and protected event history.
  A clean isolated replay of all 30 migrations passed **1,352/1,352** pgTAP
  assertions, including 66 invitation assertions, and all nine authenticated
  tenant/concurrency integrations passed. All 40 production-browser scenarios
  passed before the final token-pair safeguard; three rebuilt focused scenarios
  passed afterward, covering separate-browser delivery, password choice,
  resend, expiry, revocation, mismatched tokens and the multi-business guard.
  Existing accounts with another business are explicitly rejected until
  business switching is safe. A local Supabase proof confirmed that an
  implicit-flow email redirect reaches a separate recipient browser with
  session tokens in the URL fragment; no tokens were printed.
- **BB-FOUND-006 — Switch between business memberships** is In Progress. The
  application now fails closed instead of silently choosing the first of
  multiple memberships; a stale-form and cross-page browser scenario passed.
  Actual selection, independent request context and switching remain unimplemented.
- **BB-SAAS-003 — Tenant onboarding and support** is Blocked. The owner
  checklist, contextual help and default-off protected sample policy are
  implemented and tested in the disposable environment. Production isolation
  and whether historical production sample records exist have not been
  verified; the policy can still be enabled deliberately by a database operator.
- Supabase PKCE links initiated in a manager's browser cannot be assumed to
  work in a recipient's separate browser.
- **BB-ROSTER-004 — Copy week and roster template** is Done. A scoped manager
  copies an entire department atomically into private, editable drafts, with
  eligibility rechecks, idempotent retries and safe clock-change handling.
  Commit `de9e805` was pushed to the development branch and its remote SHA
  matched.
- **BB-TIME-001 — Compute worked time** is Done. Scoped calculations and the
  manager work-time page passed all four criteria and the regression checks.
- **BB-ATTEND-003 — Location verification** is Done. Optional per-venue
  verification, event-time capture and scoped exception review passed all
  three criteria and the final regression checks below.
- **BB-ATTEND-002 — Clock breaks** is Done. Immutable paid/unpaid break events,
  scoped transitions, safe retries and mobile controls are verified. The
  first break browser scenario timed out because a nested test locator was
  rooted incorrectly; it was corrected without removing assertions, the
  leftover disposable user was removed, and the focused and full regressions
  passed.
- **BB-ATTEND-001 — Clock in and out** is Done. Employees record immutable,
  server-timestamped, currently unverified clock events with scoped venue and
  department attribution, safe retries and current-state feedback. The full
  database and authenticated integration regressions, production build and
  browser checks passed as detailed below.
- **BB-ROSTER-007 — Conflict detection** is Done. Owner-confirmed links identify
  profiles for the same worker across venues without linking accounts or
  granting access. Scoped warnings identify affected shifts without disclosing
  hidden shifts; automatic assignment avoids cross-venue overlaps, and
  configurable publication blockers cover them. All three criteria and the
  complete regression checks passed.
- **BB-ORG-005 — Multiple venues** remains In Progress: venue selection,
  cross-venue overlap detection and attendance venue attribution are verified,
  but the timesheet workflow is still needed.
- **BB-ROSTER-008 — Publish and notify** remains In Progress. Configured local
  and cross-venue blockers prevent publication atomically, and concurrent conflicting edits
  return an explicit retry. Numbered versions, complete protected snapshots and
  a scoped manager history are verified. In-app publication updates now reach
  linked employees once per account/version; profiles without a linked account,
  eligible membership or department link remain pending and managers are
  warned. Email/push delivery and onboarding remain unfinished.
- **BB-COMMS-002 — In-app notification centre** is In Progress. Roster
  publication updates have unread/read state, authorized schedule links and
  deduplication; offers and approval events are not yet supported.
- **BB-ROSTER-010 — Simple employee roster** is Done. Authorised managers can
  require acknowledgement for assigned drafts, and the linked employee can
  acknowledge the published snapshot from their mobile schedule. All three
  criteria and the full database/browser regressions passed.
- **BB-ROSTER-003 — Unassigned open shift** is Done: all four criteria are
  covered below. Role and availability restrictions are opt-in to preserve
  existing venue behaviour; active membership and overlap checks always apply.

### BB-FOUND-005 — Invite and onboard users (In Progress)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| FOUND-005.1 Invitation expires and cannot be reused | Database-time expiry and atomic acceptance reject expired or already-consumed invitations. | The 66-assertion invitation pgTAP suite and authenticated acceptance races passed; production Chromium showed expired invitations cannot be accepted. | Pass |
| FOUND-005.2 Recipient joins only the intended business and venue | Verified email acceptance links the intended employee and creates only its scoped membership; an existing same-business member retains their role and scope. Existing members of another business are explicitly rejected until safe switching exists. | pgTAP and authenticated cross-tenant/concurrency tests passed; separate-browser Chromium confirmed the intended business, venue and department and denied an unrelated user. The existing-other-business case is intentionally unavailable. | Blocked |
| FOUND-005.3 Duplicates and revocation are handled | Unique pending indexes and transaction locks prevent duplicate employee/email invitations; managers can resend or revoke; expired invitations can be replaced. | pgTAP and concurrent duplicate/revocation tests passed; Chromium verified resend preserves one pending invitation and revoked links cannot be accepted. | Pass |
| FOUND-005.4 Audit entry is stored | Protected append-only events record invitation creation and status changes with tenant, department, actor and time. | pgTAP verified scoped access and mutation protection; authenticated and browser tests confirmed creation and acceptance actors. | Pass |

Files: `supabase/migrations/20261102070000_staff_invitations.sql`,
`supabase/tests/database/staff_invitations.test.sql`,
`tests/staff-invitations.integration.test.mjs`, `scripts/test-tenant-isolation.mjs`,
`src/app/actions.ts`, `src/app/people/page.tsx`, `src/app/invitations/[id]/page.tsx`,
`src/components/invitation-session.tsx`, `src/lib/invitations.ts`,
`src/lib/auth-urls.ts`, `src/lib/workspace.ts`, `src/app/page.tsx`,
`src/app/setup/page.tsx`, `tests/invitations.test.mjs`,
`tests/auth-urls.test.mjs`, `tests/e2e/auth.spec.mjs` and `README.md`.
The recipient refresh token is exchanged in an isolated client, and the
resulting session is verified against the invitation before an existing
browser session can be replaced. This rejects mismatched access and refresh
tokens. Email delivery and redirect allowlists must be configured separately
in each deployed environment.

### BB-SAAS-003 — Tenant onboarding and support (Blocked)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| SAAS-003.1 Checklist progresses business, venue, staff, shift and publication | Owner-only progress RPC and dashboard checklist use real records, with tenant and role checks. | The 29-assertion onboarding pgTAP suite and production Chromium scenario verified successive steps, archived staff, owner-only access and cross-tenant isolation. Both passed. | Pass |
| SAAS-003.2 Seeded demo data is isolated from production | A database policy defaults to disabled; application accounts and the Supabase service role cannot enable it or call the unchecked helper. Explicit opt-in is documented for isolated test databases only. | pgTAP, eight authenticated integrations and Chromium verified default denial, rollback, scoped opt-in and a concurrent disable race in the disposable project. Actual production configuration and historical data were not inspected, and a database operator can deliberately enable the policy. | Blocked |
| SAAS-003.3 Inline help covers common tasks | The checklist explains business and venue setup, staff, draft shifts and publishing, with links to the relevant pages. | Production Chromium followed the departments help link and exercised the staff, shift and publication workflow; the 37-scenario regression passed. | Pass |

Files: `supabase/migrations/20261102060000_onboarding_and_demo_isolation.sql`,
`supabase/tests/database/onboarding_and_demo_isolation.test.sql`,
`supabase/tests/database/workspace_rls.test.sql`, `src/app/page.tsx`,
`src/app/setup/page.tsx`, `src/app/actions.ts`,
`src/components/onboarding-checklist.tsx`, `src/lib/onboarding.ts`,
`tests/onboarding.test.mjs`, `tests/onboarding-demo-policy.integration.test.mjs`,
`tests/e2e/auth.spec.mjs`, `scripts/test-auth.mjs`,
`scripts/test-tenant-isolation.mjs` and `README.md`. A deployment owner must
verify that production remains sample-disabled and assess any pre-existing
sample records without modifying live data without approval.

### BB-ATTEND-001 — Clock in and out (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ATTEND-001.1 Server assigns canonical timestamp | Clock RPCs use PostgreSQL `clock_timestamp()` and reject client-supplied event writes; original events are immutable and carry actual venue, department, employee and actor. | The 72-assertion attendance pgTAP suite verified server time bounds and mutation denial; the mobile browser scenario compared the persisted timestamp with the request time. Both passed. | Pass |
| ATTEND-001.2 Valid state transitions are enforced | Scoped server RPCs require a linked employee, a permitted department and one open session per account or explicitly linked worker; archived workers can finish an existing session. | pgTAP verified valid, invalid, archived and cross-tenant/department paths. Authenticated integration verified concurrent clock requests, linked profiles and access revocation. Both passed. | Pass |
| ATTEND-001.3 Repeated requests do not create duplicate events | Request IDs are unique per business and actor; matching retries return the original event, while conflicting reuse is rejected. | pgTAP checked clock-in/out replay and key misuse. Authenticated integration sent six simultaneous copies of each action and observed one event each. Both passed. | Pass |
| ATTEND-001.4 Employee sees current state | The mobile attendance page shows clocked-out, clocked-in or access-review state. Workers with several permitted departments must explicitly select one. | Production Chromium verified clock-in/out, access removal and recovery, mobile layout and actual cross-venue attribution; a rebuilt scenario verified explicit multi-department selection and persisted attribution. Both passed. | Pass |

Files: `supabase/migrations/20261102010000_attendance_clock_events.sql`,
`supabase/tests/database/attendance_clock_events.test.sql`,
`src/app/attendance/page.tsx`, `src/lib/attendance.ts`, `src/app/actions.ts`,
`src/components/main-navigation.tsx`, `src/app/people/page.tsx`,
`src/app/settings/organisation/page.tsx`, `tests/attendance.test.mjs`,
`tests/attendance-concurrency.integration.test.mjs`,
`tests/shared-worker-concurrency.integration.test.mjs`,
`tests/helpers/disposable-database.mjs`, `tests/e2e/auth.spec.mjs`,
`scripts/test-tenant-isolation.mjs` and `README.md`. The migration was applied
only to the isolated project. At this checkpoint location verification,
corrections and timesheets were not yet implemented; no break is silently
deducted. See BB-ATTEND-003 for the subsequent location work.

### BB-ATTEND-002 — Clock breaks (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ATTEND-002.1 Break transitions are validated | Scoped RPCs serialize against clock-out and permission changes, enforce one open break, reject invalid starts/ends, and require an open break to end before clock-out. Server timestamps cannot move backwards. | The 79-assertion break pgTAP suite passed invalid-transition, permission, retry and clock-rollback cases. Authenticated races and a stale-browser-tab clock-out rejection passed. | Pass |
| ATTEND-002.2 Multiple breaks are supported | Each break has its own immutable record and start/end event pair in the attendance session. | pgTAP and mobile Chromium each recorded and completed two breaks in one session; both passed. Authenticated concurrent competing starts produced one winner. | Pass |
| ATTEND-002.3 Paid/unpaid classification is retained | Employees explicitly choose paid or unpaid; the classification is immutable and tied to the original session and events. | pgTAP verified both classifications, direct-write and privileged mutation denial, access scope and survival after account removal. Chromium confirmed both persisted classifications. All passed. | Pass |
| ATTEND-002.4 No assumed break is silently deducted | Only explicitly started breaks create records; clock-out never inserts or assumes a break, and payroll/timesheet calculations are not yet implemented. | pgTAP and mobile Chromium each clocked a separate session in and out without breaks and found only the two clock events and zero break records. Both passed. | Pass |

Files: `supabase/migrations/20261102020000_attendance_break_events.sql`,
`supabase/tests/database/attendance_break_events.test.sql`,
`src/app/attendance/page.tsx`, `src/app/actions.ts`, `src/lib/attendance.ts`,
`tests/attendance.test.mjs`, `tests/attendance-concurrency.integration.test.mjs`,
`tests/e2e/auth.spec.mjs` and `README.md`. The disposable database was rebuilt
from all migrations; the complete 1,104-assertion database regression, 60 Node
tests, five authenticated integration tests, 32 browser scenarios, full lint,
TypeScript and split production build passed. Payroll calculations, corrections
and timesheets remain unfinished.

### BB-TIME-001 — Compute worked time (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| TIME-001.1 Cross-midnight and timezone changes | Calculations use elapsed instants and retain the actual venue's current display timezone. | The 35-assertion pgTAP suite verified cross-midnight spring-forward, repeated fall-back time and a subsequent venue-timezone change. Production Chromium showed the cross-midnight shift and the correct actual duration. | Pass |
| TIME-001.2 Actual breaks are applied | Explicit paid and unpaid break events are calculated separately; no break is assumed. Worked time excludes both; paid time includes paid breaks. | pgTAP and production Chromium verified a four-hour session with a 15-minute paid and 30-minute unpaid break: 3h 15m worked and 3h 30m paid. No recorded break means zero deduction. | Pass |
| TIME-001.3 Explicit, non-destructive rounding | Source instants and database calculations retain microsecond precision; only displayed durations round to the nearest second. No payroll or award rules are applied. | pgTAP verified exact fractional-second source events and arithmetic; three unit tests verified validation and display rounding. Chromium verified the policy explanation and original event instants. | Pass |
| TIME-001.4 Exceptions are flagged | Incomplete, invalid or overlapping clock/break data withholds totals; historical, pending and reviewed location checks remain visible. Results are scoped to manageable departments and actual venues. | pgTAP verified each implemented flag, role/tenant restrictions and location-review transitions. Production Chromium verified missing clock-out, incomplete break, location review, FOH/BOH separation, venue switching, employee denial and cross-tenant denial. | Pass |

Files: `supabase/migrations/20261102040000_compute_worked_time.sql`,
`supabase/tests/database/worked_time.test.sql`, `src/lib/worked-time.ts`,
`src/lib/attendance.ts`, `src/app/work-time/page.tsx`,
`src/app/attendance/page.tsx`, `src/components/main-navigation.tsx`,
`tests/worked-time.test.mjs`, `tests/e2e/auth.spec.mjs` and `README.md`.
The first two focused browser attempts exposed overlapping paid/unpaid label
locators and Next.js's route announcer; both locators were made exact without
removing assertions. A rebuilt focused run and all 34 full browser scenarios
then passed. At that checkpoint the result was a calculation view, not a payroll approval,
award interpretation, correction or export workflow. Corrections were added
later under BB-ATTEND-007; payroll approval and export are still unavailable.

### BB-ATTEND-007 — Attendance corrections (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ATTEND-007.1 Adjustment records old/new/reason/actor | A scoped manager appends an immutable correction with original event, previous effective and replacement instants, reason, authenticated actor, server time and idempotent request ID. History is ordered by immutable sequence. | The 83-assertion pgTAP suite passed original/old/new/reason/actor, denied direct mutation, retry and stale-write checks. Authenticated concurrency and production Chromium verified simultaneous requests and visible audit history. | Pass |
| ATTEND-007.2 Employee can see correction | The linked employee who recorded an event can read its correction history; managers see only manageable departments. | pgTAP verified the employee's original and corrected time, reason and actor, plus colleague, FOH/BOH and cross-tenant restrictions. Production Chromium verified employee visibility on mobile and denial to a colleague, another department and another business. | Pass |
| ATTEND-007.3 Approvals or locks constrain editing | Valid finished sessions can be locked by a scoped manager; only an owner, admin or appropriately scoped general manager can unlock, with an immutable reason and actor. The manager UI shows lock history and fails closed if concurrently loaded lock states disagree. This is an edit lock, not payroll approval. | pgTAP verified authorized/unauthorized transitions, immutable lock audit and rejected corrections; the authenticated race test verified a concurrent lock prevents a correction. Production Chromium verified locked controls, owner-only unlock, history, scope and mobile layout. | Pass |
| ATTEND-007.4 Recalculation is consistent | Worked time uses the latest correction sequence, actual paid/unpaid breaks and exact instants. Invalid chronology withholds totals; overlapping same/linked-worker sessions are rejected across venues. Local DST gaps and repeated times require explicit handling. | pgTAP verified exact microsecond arithmetic, adjusted breaks, invalid chronology, adjacent/cross-venue overlap and effective-time order. Unit tests passed DST and microsecond validation. Production Chromium verified recalculation, repeated/gap times, overlap rejection and a six-digit correction. Concurrent clock/correction tests passed for both original and relinked accounts. | Pass |

Files: `supabase/migrations/20261102090000_attendance_corrections.sql`,
`supabase/tests/database/attendance_corrections.test.sql`,
`src/lib/attendance-corrections.ts`, `src/app/actions.ts`,
`src/app/work-time/page.tsx`, `src/app/attendance/page.tsx`,
`src/components/attendance-correction-history.tsx`,
`tests/attendance-corrections.test.mjs`,
`tests/attendance-corrections-concurrency.integration.test.mjs`,
`tests/e2e/auth.spec.mjs`, `scripts/test-tenant-isolation.mjs`, `README.md`
and the backlog/progress files. Corrections apply only to existing finished
events; offline claims use the separate reconciliation workflow below.

### BB-ATTEND-005 — Time capture fallback (In Progress)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ATTEND-005.1 Pending or exception status | Location failures produce a recorded server event and visible review status. A page already open offline shows each queued claim and its pending state; submitted claims are labelled unverified and awaiting review. Storage and upload failures are explicit. | BB-ATTEND-003 location and no-JavaScript checks passed. Production Chromium verified two offline claims, a failed upload, storage denial, reconnect, scoped visibility and clear pending/review labels. | Pass |
| ATTEND-005.2 Safe reconciliation | Claims upload only for the verified original account and permitted scope. Managers can match/correct finished events, reject claims, create an unverified session from a claim pair, or complete a matching open server session with an offline clock-out. Decisions and senior-role reopenings are attributed; work time flags the offline source. | The 48 original claim, 44 review, 47 pair and 40 mixed-session pgTAP assertions passed, including linked-worker overlap, existing breaks and correction provenance. Authenticated integrations passed duplicate and competing operations, live-clock races, edit-lock and permission changes. Production Chromium verified all three reconciliation paths, rejected an open break, and checked employee visibility, cross-tenant scope and mobile layout. Historical open breaks cannot yet be corrected through this flow, and the page cannot be opened or reloaded offline. | Fail |
| ATTEND-005.3 Claimed and confirmed times | The immutable claim retains the untrusted device time and a separate server-generated receipt time. The latter confirms receipt, not that the claimed attendance was true. | pgTAP verified original time, server time and immutable records. Production Chromium captured clock-in/out offline, compared both received rows to device storage, and checked both timestamps in the employee and scoped manager views. | Pass |

Files: `supabase/migrations/20261102080000_attendance_offline_claims.sql`,
`supabase/tests/database/attendance_offline_claims.test.sql`,
`src/lib/offline-attendance.ts`, `src/lib/offline-attendance-queue.ts`,
`src/components/offline-attendance.tsx`, `src/app/attendance/page.tsx`,
`tests/offline-attendance.test.mjs`,
`tests/offline-attendance-concurrency.integration.test.mjs`,
`supabase/migrations/20261102100000_offline_claim_reconciliation.sql`,
`supabase/tests/database/offline_claim_reconciliation.test.sql`,
`src/components/offline-claim-review.tsx`,
`tests/offline-claim-reconciliation-concurrency.integration.test.mjs`,
`supabase/migrations/20261102110000_offline_claim_sessions.sql`,
`supabase/tests/database/offline_claim_sessions.test.sql`,
`tests/offline-claim-sessions-concurrency.integration.test.mjs`,
`supabase/migrations/20261102120000_offline_claim_clock_out.sql`,
`supabase/tests/database/offline_claim_clock_out.test.sql`,
`src/lib/worked-time.ts`, `tests/worked-time.test.mjs`,
`tests/e2e/auth.spec.mjs`, `scripts/test-tenant-isolation.mjs` and `README.md`.
After a clean migration replay, an initial default pgTAP invocation failed
because the disposable workdir contained outdated test copies, including a
test predating the default-off demo policy. The current repository suite passed;
the disposable copies were then synchronized and the standard command also
passed all 1,400 assertions. No tests were removed or weakened.

### BB-ATTEND-003 — Location verification (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ATTEND-003.1 Browser requests location only at a clock event | The owner-only per-venue policy defaults off; the clock form requests location on submission only, using the active session's actual venue for clock-out. Breaks and page loads never request it. | Focused production Chromium passed with native geolocation permission: no request on load, disabled clocks or breaks; one per enabled clock; correct policy after switching venues. JavaScript-disabled clocks also recorded explicit exceptions. | Pass |
| ATTEND-003.2 Server verifies distance and accuracy | An atomic event trigger records a separate immutable check. The server requires distance plus reported accuracy to fit the radius; it retains derived distance, accuracy and policy radius, not raw coordinates. Browser-reported coordinates can be spoofed. | 71 focused pgTAP assertions passed inside, outside, accuracy boundaries, invalid positions and policy/tenant permissions, including the final cross-tenant venue guard. Authenticated concurrent policy-change and retry tests passed; Chromium verified inside, outside and inaccurate results. | Pass |
| ATTEND-003.3 Failure creates a reviewable exception without deleting time worked | Denied, unavailable, timed-out, unsupported, missing and invalid positions create scoped, attributable review records without altering original clock events. Legacy RPCs cannot bypass verification; retries reuse the original outcome. | pgTAP, authenticated race tests and production Chromium passed denial, legacy/no-JavaScript, scoped manager review, review failure, FOH/BOH and cross-tenant cases. A disposable upgrade test verified historical events are not backfilled or reverified. | Pass |

Files: `supabase/migrations/20261102030000_attendance_location_verification.sql`,
`supabase/tests/database/attendance_location_verification.test.sql`,
`src/components/clock-location-form.tsx`, `src/lib/attendance-location.ts`,
`src/app/attendance/page.tsx`, `src/app/settings/organisation/page.tsx`,
`src/app/actions.ts`, `tests/attendance-location.test.mjs`,
`tests/attendance-location-concurrency.integration.test.mjs`,
`tests/e2e/auth.spec.mjs`, `scripts/test-tenant-isolation.mjs` and `README.md`.
Focused Node tests, 71 database assertions, authenticated concurrency and the
production-browser scenario passed. The first two browser attempts exposed
ambiguous test locators for Next.js's route announcer and a temporary locating
status; both locators were corrected without removing assertions. The isolated
upgrade test passed before rebuilding the database from the complete migration
chain. The final repository database suite passed 1,175 assertions across 26
files; six authenticated integration tests, 66 serialized Node tests, full
lint, TypeScript, split production build and the focused final-schema browser
scenario passed. The full 33-scenario browser regression passed immediately
before the final tenant/venue safeguard and review-error wording change.

### BB-ORG-005 — Multiple venues (In Progress)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ORG-005.1 Venue selector scopes views | Roster and people views select only permitted venues; requests are checked server-side. | Scoped permission pgTAP and authenticated browser role/venue scenarios passed in the full 953-assertion and 29-scenario regressions. | Pass |
| ORG-005.2 Detect shared-staff cross-venue overlap | Owners explicitly confirm profile links; generic overlap results contain only manageable shift IDs. Automatic assignment and configured publication blocking use the same linked-worker identity. | 44 shared-profile and 26 conflict pgTAP assertions, authenticated link/assignment/publication races, and the shared-worker and 1,001-shift browser scenarios passed. | Pass |
| ORG-005.3 Timesheets retain actual venue attribution | Attendance and work-time calculations preserve the actual venue, but the complete timesheet workflow is not yet implemented. | Work-time attribution passed pgTAP and venue-switching browser tests; timesheet approval and export attribution remain unverified. | In Progress |

### BB-ORG-002 — Configure venue and geofence (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ORG-002.1 Latitude, longitude and radius save with validation | Owners can configure or clear all three values per venue; coordinates are limited to six meaningful decimal places and radius to 1–10,000 metres. SQL constraints and an owner-only RPC enforce the same bounds. | Two parsing unit tests, 60 isolated pgTAP assertions and production Chromium verify valid saves, clear, no-op, boundaries, invalid/partial input, two venues and tenant/role isolation. | Pass |
| ORG-002.2 Location permission implications are explained | The form explains optional verification, event-time permission, failure review, accuracy and the limitations of device-reported location. | The original production Chromium scenario verified permission guidance and mobile layout; the updated location scenario verifies the current opt-in and review behaviour. | Pass |
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
geofence plus two organisation browser scenarios passed. Clock-in and optional
location verification have since been implemented; see BB-ATTEND-003.

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

### BB-ROSTER-004 — Copy week and roster template (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-004.1 Copy creates editable drafts for new dates | A manager selects a source Monday and copies scheduled shifts from one permitted department into the displayed week. The atomic operation preserves assignments, breaks, acknowledgement requirements and local wall times without overwriting existing shifts. | 47 focused pgTAP assertions and production Chromium verified assigned/open drafts, editing, exact historical timestamp precision, a DST offset change, empty source, retries, role and tenant scope, mobile layout and no-JavaScript submission. | Pass |
| ROSTER-004.2 Leave, overlaps and availability are revalidated | Every assigned copy checks target-date approved leave, recurring availability and same/linked-worker overlaps, plus applicable manual role qualifications. Conflicts reject the entire transaction even when manual policy normally warns. Nonexistent times and source or target shifts spanning clock changes are rejected rather than silently changing duration. | pgTAP and Chromium verified leave, availability, overlap and atomic rollback. New database tests covered forward and backward clock changes in both source and target; Chromium verified the explanatory error. Authenticated ordered races verified source edits, leave and availability changes, overlapping shifts, role-policy changes, shared-worker locks, duplicate requests and membership revocation. | Pass |
| ROSTER-004.3 No notifications until publishing | Copies are unpublished and do not create publications or recipients; the existing explicit publication action creates notifications. | pgTAP and production Chromium verified drafts are invisible to the employee, no notification exists before publication, and publication creates the employee's notification and visible schedule. | Pass |

Files: `supabase/migrations/20261102050000_copy_roster_week.sql`,
`supabase/tests/database/copy_roster_week.test.sql`, `src/app/actions.ts`,
`src/app/roster/page.tsx`, `src/components/copy-roster-form.tsx`,
`src/lib/roster-copy.ts`, `tests/roster-copy.test.mjs`,
`tests/roster-copy-concurrency.integration.test.mjs`,
`scripts/test-tenant-isolation.mjs`, `tests/e2e/auth.spec.mjs` and `README.md`.
The first browser fixture failed because a bulk insert omitted explicit
non-null fields; the next attempt's employee-wide locator also matched an
already-published source shift in the next-shift preview. The fixture and
target-week locator were corrected without removing assertions; the focused
scenario then passed. Additional clock-change tests first exposed unintended
duration changes on the previous schema; after fixing the guard, all 47
assertions and the final focused browser scenario passed.

### BB-ROSTER-007 — Conflict detection (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-007.1 Detect cross-department/cross-venue overlap, unavailable dates and invalid times | Shift validation rejects invalid times; submitted unavailable periods, date blocks, approved leave and same-worker overlap are checked. Owners explicitly link worker profiles across venues; matching names do not infer identity. | 44 identity and 26 cross-venue pgTAP assertions, prior cross-department and availability SQL/unit tests, authenticated assignment races, and scoped production-browser acceptance passed. | Pass |
| ROSTER-007.2 Issues identify affected shifts | Availability, duration and generic overlap warnings are attached to affected shifts. The overlap lookup returns only IDs the caller can manage, without disclosing hidden shift details. Checked pagination and batching avoid the API's 1,000-row limit. | Scoped owner/manager and two-tenant SQL/browser scenarios passed; a real 1,001-shift roster and 2,001-ID batching unit test retained the affected warning. | Pass |
| ROSTER-007.3 Blocking rules are configurable | Owners independently choose venue rules for manual unavailability and publication unavailability, overlap and excessive duration. Actual changes are audited; defaults remain advisory. Cross-venue overlaps use the publication overlap setting. | 53 conflict-policy and 26 shared-worker conflict pgTAP assertions, ordered concurrent publication/link tests, and owner/manager browser scenarios verified defaults, atomic blocking and resolution. | Pass |

Current files: `src/lib/shift-conflicts.ts`, `src/lib/paginated-rows.ts`,
`src/app/roster/page.tsx`, `tests/shift-conflicts.test.mjs`,
`tests/paginated-rows.test.mjs`, `tests/e2e/auth.spec.mjs`,
`supabase/migrations/20261101170000_roster_overlap_conflicts.sql`,
`supabase/tests/database/roster_overlap_conflicts.test.sql`,
`supabase/migrations/20261101200000_roster_conflict_policies.sql`,
`supabase/tests/database/roster_conflict_policies.test.sql`,
`src/lib/conflict-policy.ts`, `tests/conflict-policy.test.mjs`,
`supabase/migrations/20261102000000_shared_worker_profiles.sql`,
`supabase/tests/database/shared_worker_profiles.test.sql`,
`supabase/tests/database/shared_worker_conflicts.test.sql`,
`tests/shared-worker-concurrency.integration.test.mjs`,
`src/lib/roster-overlap-conflicts.ts`, `tests/roster-overlap-conflicts.test.mjs`,
`src/lib/shift-acknowledgements.ts`, `tests/shift-acknowledgements.test.mjs`,
`src/app/people/page.tsx`, `src/app/actions.ts`,
`src/app/settings/organisation/page.tsx`, `scripts/test-tenant-isolation.mjs`
and README. Enforcement is opt-in; new same-profile overlaps remain blocked by
existing rules. Link changes and scheduling use coordinated locks; workers are
never matched automatically or granted access by a link.

### BB-ROSTER-008 — Publish and notify (In Progress)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-008.1 Draft changes stay private until publication | RLS restricts drafts to authorized managers and the personal schedule reads only published assignments. | Existing two-tenant/scoped SQL and production-browser schedule tests passed in the 708-assertion and 25-scenario regressions. | Pass |
| ROSTER-008.2 Published version is recorded | Each successful publication atomically creates a per-department/week version and complete shift snapshot, with actor and venue-local context. Managers see their scoped history; no-op and blocked publications create no version. Pre-existing publications are not retroactively fabricated. | 47 focused pgTAP assertions pass for snapshots, immutability, permissions, no-op and blocked cases; simultaneous publication integration produces ordered complete snapshots; production Chromium verifies history and two versions. | Pass |
| ROSTER-008.3 Impacted employees are notified once | Each new publication creates one in-app update per affected account, deduplicating multiple shifts and profiles. Unlinked profiles retain a pending update; managers see inaccessible-profile counts. Email/push and staff invitation are not implemented. | 69 isolated SQL assertions cover deduplication, later linking, revoked access, tenant/role scope, no-op/blocked publication and read state. Concurrent publication and duplicate reads pass. Production Chromium verifies mobile notices, read state, pending linking and own-schedule deep links. | In Progress |
| ROSTER-008.4 Unresolved blockers prevent publishing | Configured venue availability, local/cross-venue overlap and duration blockers atomically reject publication; concurrent roster changes return a retry. | 53 policy and 26 shared-worker SQL assertions, authenticated ordered races and production-browser resolution of local and cross-venue blockers passed. | Pass |

Files for the version slice: `supabase/migrations/20261101210000_roster_publication_versions.sql`,
`supabase/tests/database/roster_publication_versions.test.sql`,
`tests/auto-assignment-concurrency.integration.test.mjs`,
`src/app/roster/page.tsx`, `tests/e2e/auth.spec.mjs` and `README.md`.
Migration applied only to the isolated test project.

Notification slice files: `supabase/migrations/20261101220000_roster_publication_notifications.sql`,
`supabase/tests/database/roster_publication_notifications.test.sql`,
`src/app/notifications/page.tsx`, `src/app/actions.ts`,
`src/app/roster/page.tsx`, `src/app/my-schedule/page.tsx`, `src/app/page.tsx`,
`src/components/main-navigation.tsx`, `src/components/roster-notification-banner.tsx`,
`src/lib/roster-notifications.ts`, `tests/roster-notifications.test.mjs`,
`tests/auto-assignment-concurrency.integration.test.mjs`,
`tests/e2e/auth.spec.mjs` and `README.md`. Read state is scoped to the account
and publication, so linking a second affected profile after a read does not
re-send that publication. Pre-feature versions are explicitly identified rather
than falsely claiming notification delivery.

### BB-COMMS-002 — In-app notification centre (In Progress)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| COMMS-002.1 Shift changes, offers and approvals show unread/read state | New roster publications generate unread notices and idempotent account-scoped reads. Other event types are not yet integrated. | 69 notification SQL assertions and production Chromium pass for publication updates, read state and delayed linking; no offer/approval implementation exists. | In Progress |
| COMMS-002.2 Deep links open the correct authorised item | Publication notices open the linked employee's venue-local weekly schedule; server-side authorization is rechecked when reading and opening. | Production Chromium verifies the correct week and own shifts; SQL and authenticated API tests deny other employees and tenants. Other event types remain unimplemented. | In Progress |
| COMMS-002.3 Repeated events deduplicate | One publication creates one notice per account even for multiple shifts or profiles; late profile links preserve read state. | SQL covers repeated publication, late links and separate accounts; a concurrent two-request read test creates one read record. Other event types remain unimplemented. | In Progress |

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
restriction; the venue can also opt into blocking unavailable assignments.

### BB-ROSTER-010 — Simple employee roster (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-010.1 Only published assigned shifts appear | `/my-schedule` queries only scheduled, published shifts for employee profiles linked to the signed-in user and selected venue, with RLS still authoritative. | Production Chromium and authenticated Supabase requests verify own primary/secondary-department shifts, exclude drafts, unassigned shifts, other workers and another tenant; a manager with wider RLS still sees only their own personal shifts. Anonymous access and an unlinked account are also checked. Pass. | Pass |
| ROSTER-010.2 Venue-local time and location display clearly | Next-shift card and seven-day mobile schedule show venue-local dates/times, venue name/address and timezone; overnight overlaps appear in the week. | Three unit tests cover grouping, week boundaries and DST. Production Chromium at 375px verifies next shift, overnight overlap, local time, address, navigation and no page-level horizontal overflow. Pass. | Pass |
| ROSTER-010.3 Updates visible and acknowledged when required | Refresh and in-app notices show updates. Managers may require acknowledgement on an assigned draft; after publishing the linked employee acknowledges its recorded snapshot, and managers see its status. Existing shifts default to no requirement. A later account link does not inherit another account's acknowledgement. | 59 focused pgTAP assertions and authenticated races cover scope, cross-tenant access, unlink/revocation, missing snapshots, atomic publication and duplicate submissions. Production Chromium at 375px verifies requirement, publication, acknowledgement, later versions and revoked-access errors. | Pass |

Files: `src/app/my-schedule/page.tsx`, `src/app/my-schedule/loading.tsx`,
`src/lib/employee-schedule.ts`, `tests/employee-schedule.test.mjs`,
`src/components/main-navigation.tsx`, `tests/e2e/auth.spec.mjs`, `tsconfig.json`
and README. Acknowledgement files: `src/app/actions.ts`,
`src/app/roster/page.tsx`, `src/lib/shift-acknowledgements.ts`,
`supabase/migrations/20261101230000_shift_acknowledgements.sql`,
`supabase/tests/database/shift_acknowledgements.test.sql`,
`tests/shift-acknowledgements.test.mjs` and
`tests/auto-assignment-concurrency.integration.test.mjs`.
TypeScript permits `.ts` import extensions so Node's native
type-stripping unit runner can load the shared date helpers without another
dependency. The new migration is applied only to the isolated test database.
Acknowledgements assume the existing public API keeps published shifts
immutable. A future published-shift editing workflow must create a new
acknowledgement identity for changed content rather than reusing the old
shift/account record.

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
  rolled back and HTTP fixtures are cleaned up. A clean local-only reset rebuilt
  the isolated schema and migration history through `20261102100000`.
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
- Timesheet venue attribution, employee invitation and email/push notification
  remain incomplete. The historical credential
  findings still require owner assessment and any approved rotation/history
  handling.
- Attendance edit locks are not timesheet approvals; future payroll
  finalisation must explicitly integrate the relevant period and lock rules.
  Original and correction timestamps retain microseconds, while displayed
  durations round only for presentation.

## Next story

- Continue **BB-ATTEND-005 — Time capture fallback**. Design a safe, attributed
  way to resolve historical open breaks without inventing break times or
  weakening chronology, and design/test offline page reopening without caching
  private authenticated responses or exposing another browser account's claims.
  Completing invitations for existing other-business users requires
  **BB-FOUND-006** safe per-request switching. Continue toward corrections,
  timesheet review and approval. Revisit BB-SAAS-003 only after production
  isolation and any historical sample data can be verified safely.
- The new location migration has been tested only on the isolated stack. The
  pre-existing Butterbox development stack and production were not changed.
- Isolated workdir:
  `/home/codespace/.copilot/session-state/7476d757-d2b0-401f-90ff-d6ab4307efc9/files/butterbox-acceptance`.
  Next invocation can start its Supabase project again with the pinned CLI.
  Browser helpers create/remove fixtures and stop their app server automatically.
- Known environment workaround: sequential `--split-build` with
  `BUTTERBOX_TEST_LOW_MEMORY=yes`; use the existing session browser library
  directory in `LD_LIBRARY_PATH` if Chromium reports missing system libraries.
  `BUTTERBOX_TEST_SUPABASE_CLI` accepts the cached native CLI path.
- No background execution or scheduling is promised after this session ends.
