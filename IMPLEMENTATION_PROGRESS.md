# Implementation progress

## Execution summary

- Total stories: **109** (the owner's merged PR #2 added 22 Award Central
  BB-PAYRULES stories). Verified Done: **48**. In Progress: **0**.
  Blocked: **6**. Not started (Backlog): **55**.
- BB-SAAS-003 (tenant onboarding) remains **Blocked**. A partial DEC-003
  safeguard now fails closed for sample setup and the historical seed helpers,
  even after attempts to enable the old policy. An upgrade from an enabled
  policy preserved the existing synthetic records in rollback-only tests.
  The migration is applied only to `butterbox-acceptance`; a real isolated
  demo, outbound controls, historical production assessment and clean demo
  conversion remain unverified. Focused pgTAP passed **102/102**, upgrade
  rehearsals **16/16** on each of two disposable projects, authenticated
  integrations **3/3**, and three targeted production-browser scenarios
  passed. Changed-file lint, TypeScript and split production build passed.
  Full Node, pgTAP, integration and browser suites were intentionally deferred;
  broader migration and cross-tenant regression is required at release.
  Partial safeguard commit `b45439e8d23a6d2257684fe7fe7ba6eeadbf5825` was
  pushed and its remote SHA matched.
- BB-ROSTER-005 (drag and drop roster changes) is Done. Managers can preview
  and apply scoped moves or draft duplicates by drag or keyboard, with guarded
  undo. Quick-change pgTAP passed **56/56** on the disposable acceptance
  project and **56/56** in a rolled-back fresh replay; six neighbouring files
  passed **300/300**. Two authenticated concurrency integrations, **10/10**
  Node tests and **5/5** targeted production-browser scenarios passed.
  Changed-file ESLint, TypeScript and the split production build passed.
  Full suites were intentionally deferred. Feature commit
  `2549475af5de0930f54b2b2ccf6f5ef81dc91003` was pushed in merge checkpoint
  `7abb5ad31fb5a93440970ecb4b9b81443fc540b2`, whose remote SHA matched.
  See the criterion evidence below.
- BB-ROSTER-009 (roster approval) is Done. A venue owner can retain direct
  publication or require a different scoped owner, administrator or general
  manager to review an immutable snapshot. The requester can withdraw;
  rejection requires a reason. Approval publishes only reviewed shifts after
  rechecking the current settings and publication blockers. Focused pgTAP
  passed **67/67** on each isolated project; seven affected publication,
  conflict, tenant and audit files passed **290/290**. One authenticated
  concurrency integration, **17/17** Node tests, and **5/5** targeted
  production-browser scenarios passed, including mobile axe, cross-tenant
  scope, notifications and acknowledgement. Changed-file ESLint, TypeScript
  and the split production build passed. Full suites were intentionally
  deferred. Feature commit `6fbdde15f41131ce15236bf20468b6ede23cd372`
  was pushed and its remote SHA matched; see the criterion evidence below.
- BB-ORG-006 (business configuration) is **Blocked**. Roster approval mode
  works per venue. Owner decision DEC-002 confirms prospective per-venue
  display-week starts, Monday payroll boundaries and essential in-app
  defaults. As of 2026-11-02 12:07 UTC, an **uncommitted and incompletely
  verified** prospective planning-week slice contains a versioned database
  setting, a canonical venue-local period resolver, an owner settings form
  and a separate read-only planning view. It deliberately keeps the existing
  editable roster and publication/payroll boundaries Monday-based. A rolled-back
  database preflight passed **55/55** assertions, focused Node tests passed
  **5/5**, and changed-file ESLint and TypeScript passed. The migration is not
  applied; authenticated concurrency, applied-migration regressions, production
  build and browser/accessibility verification remain outstanding. Optional
  external channels require the undelivered
  BB-COMMS-003 capability, consent and provider approval. Final DEC-002
  directs employee opt-outs, essential in-app notices and timezone-aware
  external quiet hours; the initial hours and urgent event list remain open.
  No historical periods have been reinterpreted.
- BB-RULES-005 (privacy and retention) has a verified partial implementation
  and is **Blocked**, not Done. Point-in-time location, visibility and
  self-service history/correction passed focused database and browser tests.
  A new tested migration rejects business deletion and truncation, including
  privileged attempts, but has only been applied to the disposable acceptance
  project. Owner decision `docs/DECISION_LOG.md` confirms a non-destructive,
  café-owned export model, but privileged child/storage operations, proposed
  durations, legal requirements and operational recovery remain unverified.
  Partial feature commit
  `a98b1ad18abc69cf12f442e9a38db26028b46a58` was pushed and its remote SHA
  matched. See the criterion table below.
- BB-RULES-001 (employment rule metadata) is Done. Scoped dated history
  preserves unknown classifications and independently maintained award and
  contract references. Focused database tests passed **282/282** on acceptance,
  **98/98** on replay and **5/5** on an upgrade fixture; the authenticated
  race/tenant integration, **13/13** Node tests and four production-browser
  scenarios passed. Changed-file lint, TypeScript and the split production
  build passed. Full suites were intentionally deferred. Feature commit
  `43ab17e9b03927f83db530a30f97df20cd58efd6` was pushed and its remote SHA
  matched. See criterion evidence below.
- BB-SHIFTS-004 (shift swaps) is Done. Both employees consent, scoped managers
  review, and approval rechecks eligibility and conflicts before recording
  new publication snapshots and in-app outcomes. The affected pgTAP files
  passed 354 assertions in total (67 swap and 287 neighbouring assertions);
  the 67 swap assertions also passed on a separate fresh-replay project.
  The race/tenant integration, 14 unit tests and five targeted production
  browser scenarios passed, as did changed-file lint, TypeScript and the
  production build. Full suites were intentionally deferred. Feature commit
  `de39307dcfed4b121ee8417d93622b408c0a86c9` was pushed and its remote SHA
  matched.
- BB-SHIFTS-001/002/003 (open-shift offers, responses and transactional
  confirmation) are Done under the targeted testing policy: 78 open-offer
  pgTAP assertions plus five neighbouring rostering suites, one lock-gated
  concurrency/tenant integration, five Node tests, and four production-browser
  scenarios (one new, three neighbouring) with a production build. No full
  regression was run for this story; see the story section for deferred suites.
- BB-FOUND-008 (resilience and operations) has a verified partial checkpoint
  and is **Blocked**, not Done: an explicitly authorised isolated hosted
  staging project and backup destination are unavailable. DEC-005 sets
  unverified objectives of 15-minute RPO, four-hour RTO, seven-day PITR and
  30-day daily backups, with hosted rehearsal deferred to the mandatory
  pre-production gate. Implemented readiness,
  process-scoped health/error counters, protected operator metrics and a
  backup/recovery runbook. Final regression passed **2,121/2,121** pgTAP
  assertions across 46 files after a clean 47-migration replay, **19/19**
  authenticated integrations, **146** Node tests (19 integrations skipped
  and run separately), ESLint, TypeScript, split production build and
  **57/57** serialized browser scenarios. A real hanging HTTP dependency
  was aborted within the tested three-second deadline tolerance.
  No staging restore, retained hosted backups or external alert delivery
  is claimed. Disk stayed above 29 GiB free.
- BB-FOUND-007 (sensitive action audit) is Done. A clean isolated replay of
  46 migrations passed **2,116/2,116** pgTAP assertions across 45 files,
  including 31 audit assertions. All **19/19** authenticated integrations,
  **139** Node tests (19 integrations skipped in that invocation), full ESLint,
  TypeScript, split production compile/generate and **56/56** serialized
  production-browser scenarios passed. Disk stayed above 29 GiB free.
- BB-SAAS-004 (performance and accessibility) is Done. Axe WCAG-oriented,
  keyboard and accessible-landmark/status smoke checks pass across signed-out,
  owner and mobile employee core pages. The final production 25-worker/7-day
  benchmark passed: roster median **890 ms** (budget 3,000 ms), publish
  **828 ms** (5,000 ms), mobile schedule median **373 ms** (2,000 ms).
  Full serialized browser regression **55/55**, Node **136** passed
  (19 integrations skipped in the unit-only invocation), ESLint, TypeScript
  and split production compile/generate passed. No database or authorisation
  changes; prior 2,085-assertion pgTAP and 19-integration results remain the
  database baseline, not newly executed results. Disk remained above 29 GiB.
- BB-ROSTER-008 (publish and notify) is Done. With invitations available, a
  publication to an uninvited worker stays pending. The worker receives exactly
  one unread in-app update after accepting, and the manager warning links to
  People to invite them. Email/push delivery remains BB-COMMS-003. Regressions:
  **2,085/2,085** pgTAP assertions (77 notification assertions), **136** Node
  tests, ESLint, TypeScript and **52/52** production-browser scenarios,
  including the split production build. No migration or integration-relevant
  code changed after the 19/19 integration run.
- BB-FOUND-005 (invitations) is Done. Verified existing members of another
  business can now accept a scoped invitation; they gain only an employee
  membership for the invited venue and department and keep their other
  memberships. A clean isolated replay of all 45 migrations passed
  **2,077/2,077** pgTAP assertions across 44 files (71 invitation
  assertions). All **19/19** authenticated integrations passed, plus **136**
  Node tests with 19 integration tests skipped in that invocation. ESLint,
  TypeScript, the split production build and **51/51** serialized
  production-browser scenarios also passed.
- BB-FOUND-006 (business switching) is Done: explicit per-request business
  selection, a membership-only chooser and per-tab pinning. Regressions:
  **136** Node tests (19 integration tests skipped in that invocation),
  **19/19** authenticated integrations including the new per-business
  authorisation/revocation test, **50/50** serialized production-browser
  scenarios, ESLint, TypeScript and the split production build. No SQL changed,
  so pgTAP was not rerun for this checkpoint.
- Done: BB-FOUND-002, BB-FOUND-003, BB-FOUND-004, BB-FOUND-005, BB-FOUND-006, BB-FOUND-007, BB-ORG-001, BB-ORG-002, BB-ORG-003,
  BB-ORG-004, BB-ORG-005, BB-PEOPLE-001, BB-PEOPLE-002, BB-PEOPLE-003, BB-PEOPLE-004, BB-PEOPLE-005,
  BB-PEOPLE-006, BB-ROSTER-001, BB-ROSTER-002, BB-ROSTER-003, BB-ROSTER-004, BB-ROSTER-006,
  BB-ROSTER-007, BB-ROSTER-008, BB-ROSTER-010, BB-ATTEND-001, BB-ATTEND-002, BB-ATTEND-003,
  BB-ATTEND-005, BB-ATTEND-007, BB-TIME-001, BB-TIME-002, BB-TIME-003, BB-TIME-004 and
  BB-TIME-005, BB-TIME-006, BB-PAY-001, BB-PAY-002, BB-PAY-003,
  BB-SHIFTS-001, BB-SHIFTS-002, BB-SHIFTS-003, BB-SHIFTS-004, BB-COMMS-002,
  BB-RULES-001 and BB-SAAS-004.
- BB-ORG-005's remaining approval/export attribution criterion is now verified,
  without recreating the existing venue workflow. The authenticated integration
  finalises and exports Sydney and Perth separately for linked worker profiles;
  the production browser downloads the Perth CSV and excludes the other
  venue's sessions and profile. Final regressions passed **2,072/2,072**
  pgTAP assertions across 44 files, **18/18** authenticated integrations,
  **131** Node tests, ESLint, TypeScript, split production compile/generate
  and **50/50** serialized production-browser scenarios. The 18 integrations
  skipped in the Node-only invocation passed separately. Disposable fixtures
  were removed and temporary app servers stopped; disk remained above 30 GiB.
- BB-PAY-003 was committed and pushed as
  `17d91e22d32df0ea989c58c2f413c4c5e2afc094`; the remote SHA matched.
- BB-PAY-004 is Blocked by missing secure OAuth and explicitly authorised
  isolated Australian payroll organisation access. No provider delivery or
  sandbox acceptance is claimed. Next ready prerequisite: BB-FOUND-006.
- BB-PAY-003's final clean 44-migration disposable replay passed
  **2,072/2,072** pgTAP assertions across 44 files, including 29 mapping
  assertions. All **18/18** authenticated integrations, **131** Node tests,
  ESLint, TypeScript and split production compile/generate passed. The 18
  integrations skipped in the Node-only run passed separately. All **50/50**
  serialized production-browser scenarios passed, including explicit mapping
  of two employees with identical names and mobile layout. Free disk remained
  above 30 GiB.
- BB-PAY-002 and BB-TIME-006's final clean 43-migration disposable replay
  passed **2,043/2,043** pgTAP assertions across 43 files, including 64
  export-ledger assertions. All **18/18** authenticated tenant/concurrency
  integrations, **128** Node tests, full ESLint, TypeScript and the split
  production build passed. The 18 integrations skipped in the Node-only run
  passed separately. All **49/49** serialized production-browser scenarios
  passed on the final schema. Free disk remained above 31 GiB; no cache,
  database, volume or worktree deletion was needed.
- BB-PAY-001's final 42-migration disposable replay passed **1,979/1,979**
  pgTAP assertions across 42 files, including 45 canonical-record assertions.
  An independent real pre-migration finalisation rehearsal passed **11/11**
  assertions after applying the new migration. All **18/18** authenticated
  tenant/concurrency integrations and **121** serialized Node tests passed;
  the 18 integrations skipped in the Node-only run were run separately. Full
  ESLint, TypeScript and split production compile/generate passed. The full
  **48/48** low-memory browser regression passed before the final timezone
  lock; a rebuilt focused payroll scenario passed against the final schema.
  The disposable users and businesses were removed, the test server stopped and
  free disk remained at approximately 32 GB.
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
- The open-session checkpoint was committed as `6ef780a` and pushed to the
  requested branch; its remote SHA matched.
- BB-ATTEND-005 now also lets a scoped manager explicitly report a historical
  open break's end and atomically complete the offline clock-out. The break's
  original classification and start remain unchanged; the reported end,
  manager, reason and decision are immutable and employee-visible. Work time
  flags both the reported break and offline source. A clean isolated replay
  passed **1,677/1,677 pgTAP assertions across 36 files**, including 63 new
  break-resolution checks. All 13 authenticated integrations, 88 serialized
  Node tests, full ESLint, TypeScript, split production build and five focused
  production-browser scenarios passed. The Node-only run skipped those 13
  integrations, which passed separately. The first new browser run found an
  ambiguous test label; its locator was made exact and the rebuilt scenario
  passed without removing assertions. Disposable fixtures were removed, the
  sample policy remained disabled, and the temporary app server stopped.
  Offline page reopening is still incomplete.
- The break-resolution checkpoint was committed as `f6eff54` and pushed to the
  requested branch; the remote SHA matched.
- BB-TIME-002 now has a scoped, read-only weekly review of published assigned
  shifts and recorded attendance, including employee/venue/week filters,
  discrepancies and original/effective source events. A fresh isolated replay
  passed **1,723/1,723 pgTAP assertions across 37 files**, including 46 new
  weekly-review assertions. All **14 authenticated integrations**, **94
  serialized Node tests**, full ESLint, TypeScript, split production build and
  both focused production-browser scenarios passed. The Node-only run skipped
  those 14 integrations, which passed separately. Initial browser runs exposed
  fixture, label and test-locator problems; these were corrected without
  removing acceptance assertions. A timed-out run left isolated test fixtures,
  which were identified and removed; the final project has no users or
  businesses, the sample policy is disabled and the app server has stopped.
  At that checkpoint, bulk actions were unimplemented and the story remained
  In Progress.
- The read-only weekly-review checkpoint was committed as `be53603` and pushed
  to the requested development branch; the remote SHA matched. Its subsequent
  bulk-lock completion replayed all migrations in the empty isolated project
  and passed **1,774/1,774 pgTAP assertions across 38 files**, including **51
  focused bulk-lock assertions**. All **15 authenticated integrations**, **97
  serialized Node tests**, full ESLint, TypeScript, split production build and
  the rebuilt production-browser weekly scenario passed. The Node-only run
  skipped those 15 integrations, which passed separately. The browser verified
  stale-selection rejection, invalid-record exclusion even after a tampered
  checkbox, protected receipts, lock history and a 375-pixel manager workflow.
  Fixtures were removed, the sample policy remained disabled and the app server
  stopped. BB-TIME-002 is Done; edit locks are not payroll approvals. The final
  completion was committed as `feaea04` and pushed to the requested branch;
  its remote SHA matched.
- BB-ATTEND-005's completed offline-reopening slice passed **101 serialized
  Node tests** and all **15 separately configured authenticated integrations**.
  Full ESLint, TypeScript and split production compile/generate passed. Five
  focused production-browser scenarios passed, covering offline claims,
  account changes, logout, invitation switching and manager reconciliation.
  The rebuilt final offline scenario also passed at 375 pixels, including a
  preparation/session-change race, wrong passphrase and venue, injected
  selection, missing cached asset, storage failures and reconnect/receipt.
  Earlier test attempts exposed a deliberately protected table accessed with
  the wrong test role and an IndexedDB test mock that removed the native
  property; both fixtures were corrected without weakening assertions.
  The latest complete database regression remains the prior
  **1,774/1,774 pgTAP assertions across 38 files**; this slice changes no
  database schema or server RPC. Disposable fixtures were removed, the sample
  policy remained disabled and the temporary app server stopped.
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

## BB-SHIFTS-004 — Acceptance evidence

| Criterion | Implementation evidence | Runtime verification and actual result | Status |
| --- | --- | --- | --- |
| 004.1 Both sides confirm | A recipient explicitly proposes their own shift; the requester confirms that exact proposal before review. Requests are account-linked and employees cannot act as one another. | `shift_swaps.test.sql` **67/67** on acceptance and fresh-replay projects; authenticated race/tenant integration **1/1**; focused desktop/mobile production-browser scenario **1/1**. | Pass |
| 004.2 Eligibility and overlaps are rechecked at approval | Scoped approval locks relevant shifts and workers and rechecks roles, availability, linked-venue overlaps, current assignments and consent. The two exchanged shifts are excluded only from each other's overlap checks. | Swap pgTAP **67/67**, including invalid/stale, cross-tenant and department denials; race integration **1/1**, including simultaneous approvals and linked-worker scheduling races in both directions; focused browser **1/1**, including changed availability. | Pass |
| 004.3 Manager can reject with a reason | The scoped manager review RPC requires a nonblank reason for rejection, records the actor and reason, and leaves assignments unchanged. | Swap pgTAP **67/67**, including missing reason, retained decision, unchanged assignments and manager-scope denial; focused browser **1/1**. | Pass |
| 004.4 Notifications are sent | In-app notifications are account-scoped, deduplicated and link to the request; both employees receive approval or rejection outcomes. | Swap pgTAP **67/67**, including both-recipient approval/rejection assertions; focused browser **1/1** verified both employees' read states and deep links. | Pass |

- **Additional publication and acknowledgement evidence:** the swap pgTAP
  suite verifies new assignee acknowledgements, including a shift returned to
  its previous employee and an exchange across two roster weeks. The focused
  browser verifies reassignment and a new acknowledgement. Neighbouring
  pgTAP files passed **287/287** assertions: acknowledgements 59, publication
  versions 47, publication notifications 77, open offers 78 and shared-worker
  conflicts 26. Four neighbouring serialized production-browser scenarios
  passed: publication notifications, acknowledgements, open-shift offers and
  core accessibility.
- **Other selected checks and results:** Four relevant Node files passed
  **14/14**. The authenticated race integration passed **1/1**. Changed-file
  ESLint, TypeScript, `git diff --check` and the split production
  compile/generate passed. The suite ran against the identified disposable
  `butterbox-acceptance` project (DB port 55422); the swap migrations and
  expanded swap suite also passed on `butterbox-fresh-migration-check`
  (DB port 56422). The fresh-replay project's older Auth schema prevented its
  notification fixture from starting; that neighbouring suite passed on the
  acceptance project.
- **Resolved test failures:** An initial approval-lock failure was fixed with
  the forward migration. A browser fixture missing a required field and an
  alert locator that also matched the route announcer were corrected without
  removing assertions. The tracked ESLint cache was restored unchanged and a
  session-local cache was used thereafter.
- **Files:** `supabase/migrations/20261103060000_shift_swap_approval_locks.sql`,
  `supabase/tests/database/shift_swaps.test.sql`, the `shift-swaps` page and
  helper, server actions, schedule/roster/notification pages and banner,
  swap unit and concurrency tests, the targeted browser scenario, integration
  runner, and `README.md`. The earlier
  `20261103050000_shift_swap_requests.sql` migration remains intact.
- **Deferred and risks:** Full pgTAP, Node, authenticated integration and
  browser suites were not run for this story. Broader regression remains
  necessary when merging workstreams or preparing a release. Existing
  open-shift offers do not gain retroactive notifications. Email/push delivery
  remains BB-COMMS-003; no external delivery is claimed.

## BB-RULES-001 — Acceptance evidence

| Criterion | Implementation evidence | Runtime verification and actual result | Status |
| --- | --- | --- | --- |
| RULES-001.1 Maintain employment basis and award/contract references | Scoped managers record basis, classification and independent references in append-only events; People and the dated editor expose the current values and history. Profile edits preserve references. | Metadata pgTAP **49/49** including field validation and scoped writes; authenticated two-tenant/race integration **1/1**; mobile production-browser scenario **1/1** exercises edits, audit and role restrictions. | Pass |
| RULES-001.2 Unknown classification stays explicit | Null classification is shown as Unknown; legacy employment type and role are never inferred as a classification or historical dated fact. | Metadata pgTAP **49/49**, focused Node validation tests and the mobile browser scenario verify unknown values, including existing legacy profiles. | Pass |
| RULES-001.3 Changes are effective-dated | Venue-local dates select the applicable event; same-date corrections append revisions and future entries remain inactive until due. Optimistic revisions reject stale editor and profile submissions. | Metadata pgTAP **49/49** covers dates and corrections; authenticated lock-gated integration **1/1** covers concurrent edits, retries and revocation; focused Node date tests and production browser **1/1** verify history, future entries and stale forms. | Pass |

- **Additional selected checks:** Employee profiles, preferences, role
  eligibility, business permissions, tenant isolation and audit pgTAP plus
  metadata passed **282/282** on the isolated acceptance project; metadata,
  profiles and audit passed **98/98** on a separate replay project. A
  rolled-back upgrade fixture with existing history passed **5/5**. Four
  relevant Node files passed **13/13**. The production split
  compile/generate, changed-file ESLint, TypeScript and `git diff --check`
  passed. Three neighbouring serialized browser scenarios passed for the
  People directory, protected audit and core accessibility; the metadata
  scenario also passed, including maximum-length current and historical text
  at 375px. Tests were selected for changed database objects, profile
  compatibility, authorisation, audit and the new route.
- **Resolved failures:** An employee-deletion audit regression was fixed with
  forward migration `20261103080000`; the affected suites were rerun. A
  maximum-length mobile overflow assertion initially failed; wrapping was
  added and the production build and expanded browser scenario passed. An
  uppercase UUID route initially failed to match canonical database IDs;
  normalization now passes both unit and browser coverage.
  VS Code test discovery did not identify these `node:test` files, so the
  repository's Node runner was used directly.
- **Files:** Migrations `20261103070000_employment_rule_metadata.sql` and
  `20261103080000_retain_employment_metadata_history.sql`, the metadata pgTAP
  and concurrency tests, People and employment pages, server actions,
  employment metadata and audit helpers, Node and browser tests, integration
  runner and `README.md`.
- **Deferred and risks:** Full pgTAP, Node, authenticated integration and
  browser suites were not run; broader regression is needed at a workstream
  merge or release checkpoint. A legacy profile's employment type is not an
  inferred dated fact. Future events can make that legacy physical field
  stale; consumers must use the date-aware metadata, not the cache. References
  are unverified customer inputs and do not establish award or payroll
  compliance. The separate Award Central workstream remains isolated.

## BB-RULES-005 — Acceptance evidence (Blocked)

| Criterion | Implementation evidence | Runtime verification and actual result | Status |
| --- | --- | --- | --- |
| RULES-005.1 Only point-in-time location captured by default | Venue verification is off by default. When enabled, only a clock-in/out requests one position; retained checks store outcomes, distance, accuracy and radius, not raw device coordinates. | Location and history pgTAP passed **71/71** and **22/22** respectively on acceptance. The production-browser location scenario verified disabled and enabled clocks, breaks and permission failures; instrumentation observed no continuous `watchPosition` calls. The history page also made no location request or watch. | Pass |
| RULES-005.2 Visibility and retention documented | `README.md` and the employee history page identify scoped employee/manager/operator visibility, the absence of automatic expiry, the business-deletion guard, remaining privileged-operation risk and unverified hosted retention. They explicitly avoid a compliance guarantee. | The rebuilt mobile production-browser history scenario **1/1** verified the updated disclosure; history pgTAP **22/22** verified personal, manager, cross-tenant and revoked access. The retention statement describes the guarded version, not an approved legal policy. | Pass |
| RULES-005.3 Employee access and correction process exists | A paginated self-only RPC and page show original and effective times, source, breaks and retained location checks, with links to existing attributable correction requests and decisions. A forward migration requires the employee profile to remain linked even for managers. | History pgTAP **22/22** on acceptance and replay; focused mobile production-browser scenario **1/1** verified 54 events across two pages, correction detail and links, invalid page, colleague/manager/tenant isolation, profile unlinking, no horizontal overflow and axe checks. Employee-request and manager-correction browser regressions both passed. | Pass |
| RULES-005.4 Required employment records preserved | Migration `20261103130000_business_record_preservation.sql` rejects business `DELETE` and `TRUNCATE`, including service-role and privileged SQL attempts, without a test bypass. Individual original attendance and correction events remain protected from ordinary edits/deletion. | The focused preservation pgTAP passed **17/17** on acceptance and in a rolled-back replay; the authenticated deletion/clock race passed across two tenants and preserved the original event. This does not protect all privileged child-table, DDL, storage or backup operations, establish the required legal period, provide portable export or prove hosted recovery. | Blocked |

- **Preservation safeguard checks:** The shared deletion-policy change warranted
  broader regression. All **2,483/2,483** pgTAP assertions passed across
  **53** rolled-back files on the disposable acceptance project; after
  strengthening preservation assertions, the seven changed files passed
  **359/359** again. The serialized authenticated runner passed **25/25**,
  its default derived-container path passed **2/2**, and an explicitly
  mismatched container was rejected. The separate replay passed **17/17**
  inside a rolled-back transaction without changing its ledger or leaving the
  temporary Auth helper. The signup, eight affected workflow and six
  permission/geofence browser scenarios passed; after the disclosure change,
  a rebuilt production history scenario passed **1/1**. Changed-file ESLint,
  TypeScript and the split production compile/generate build passed.
- **Safeguard scope and deferred work:** The migration was applied and
  recorded only in `butterbox-acceptance` (API 55421, DB 55422); no live
  database was changed. Synthetic businesses remain in the disposable project
  while their test users are removed. A full Node suite and full browser suite
  were intentionally deferred; broader regression remains appropriate for a
  release or workstream merge. Hosted backup/restore, a café-owned export,
  legal retention durations and the remaining privileged deletion paths are
  not verified. Do not mark the story Done.

- **Additional selected checks:** Seven affected pgTAP files passed **410/410**
  assertions before the final access fix. After that fix, history, corrections
  and tenant isolation passed **137/137** on acceptance; history passed
  **22/22** on replay. The earlier history, corrections and location replay
  passed **174/174**. Replay lacks `auth.jwt()`, so the identical acceptance
  helper was supplied only inside each rolled-back test transaction and
  confirmed absent afterward. Four Node files passed **12/12**. Six focused
  production-browser scenarios passed, including history, location,
  correction requests, manager corrections, clocking and audit. The split
  production build, changed-file ESLint, TypeScript and `git diff --check`
  passed. The history scenario initially failed because one bulk-insert fixture
  omitted a non-null field; it was corrected and rerun. A new manager-unlink
  assertion first failed **1/22**, exposing the access gap; forward migration
  `20261103100000` fixed it and both pgTAP and browser tests passed.
- **Files:** Migrations `20261103090000_personal_attendance_history.sql` and
  `20261103100000_personal_history_linked_profiles.sql`, the personal-history
  pgTAP and Node tests, attendance history and clock pages, pagination/location
  and audit helpers, browser tests and `README.md`.
- **Deferred and risks:** Full pgTAP, Node, authenticated integration and
  browser suites were intentionally not run; broader regression is needed at
  workstream merge or release. The owner has confirmed the non-destructive
  direction in `docs/DECISION_LOG.md`, but employment-record durations and
  legal requirements remain unapproved, and operational recovery remains
  unverified. No live records were altered and legal or payroll compliance
  is not claimed.

## Current story

- **BB-FOUND-001 — Create production-ready application** remains Blocked on
  historical credential findings. DEC-004 authorizes a read-only, redacted
  assessment and classification; no credential rotation, privileged access
  test or history modification is authorized. At 11:34 UTC, an offline scan of
  accessible local refs identified four historical candidates, including two
  with privileged characteristics. The evidence suggests a local development
  origin, but signature validity, current use, remote exposure and production
  connection are unverified. Assessment is paused for private owner/security
  review under DEC-004. No credential was used, changed or reproduced.
- **BB-SAAS-003 — Tenant onboarding and support** remains Blocked for full
  acceptance. The independent DEC-003 fail-closed safeguard is implemented
  and verified only in the isolated disposable project. Commit
  `b45439e8d23a6d2257684fe7fe7ba6eeadbf5825` was pushed and verified. This
  work does not imply credential-remediation approval or evidence that
  security review occurred.
- **BB-ORG-006 — Business configuration** is the current independent work:
  verify the uncommitted prospective per-venue planning-week slice under
  DEC-002. Approval mode already exists; external notification dependencies
  remain Blocked and must not be activated. The new database migration has
  only been tested in rollback; preserve historical publication, payroll and
  timesheet boundaries. Next verify disposable project identity and disk,
  apply the migration there, then run focused database, authenticated race
  and production-browser tests.
- **BB-RULES-005 — Privacy and retention policy** remains Blocked for full
  acceptance. Its verified partial business-deletion safeguard was committed
  as `89738f8e24561dc1481252ae15c073e709a5aeb4` and pushed in merge
  `205004f9da812c0c981814849f481f34913d6818`; the remote SHA matched. Do not
  enable permanent deletion or assume proposed employment-record periods are
  approved.
- As of 2026-11-02 11:05 UTC, an uncommitted forward migration rejects
  business DELETE and TRUNCATE without a test-only bypass. It passed **17/17**
  focused pgTAP assertions inside a rolled-back transaction and is not applied.
  The first run's deferred-constraint setup and expected trigger-function
  SQLSTATE were corrected and rerun. Existing pgTAP assertions and many
  authenticated/browser fixture teardowns expect business deletion to succeed;
  adapt them to the new preservation behavior without weakening security or
  pretending retained synthetic fixtures were deleted. Then run affected
  broader regression in the verified disposable project. The guard alone does
  not prove complete record preservation, approved retention or hosted recovery.
- At 11:10 UTC the draft guard and affected assertions passed **557/557**
  pgTAP checks across 11 files in individually rolled-back transactions.
  One initial break-count expectation was corrected from two to three
  business-wide records and rerun. Test teardown now checks that synthetic
  businesses are preserved rather than bypassing the guard; authenticated
  and browser cleanup still require runtime verification. Changed-file lint
  and TypeScript passed. The migration remains unapplied and uncommitted.
- At 11:14 UTC the additive guard had been applied and recorded only in the
  verified `butterbox-acceptance` project (API 55421, DB 55422). Its
  retention-aware teardown passed **24/24** authenticated integration
  scenarios and **1/1** signup browser scenario; synthetic businesses remain
  in that disposable project, while test user accounts were removed. The
  first broad pgTAP attempt exposed global counts that included retained
  fixtures; after scoping counts to the relevant test session or tenant, the
  offline-session, payroll-mapping and notification files passed **47/47**,
  **30/30** and **77/77**. The full pgTAP rerun, a deletion/clock race,
  additional browser coverage, replay and final lint/TypeScript remain pending.
- At 11:15 UTC the owner's final DEC-002 clarification was fetched and
  fast-forwarded as `fb0bb857f34fd282d58905e4579489ac672bddc6`, preserving
  uncommitted retention work. Display-week changes must not silently alter
  payroll or publication boundaries; venue defaults cannot override employee
  consent, and urgent external notices may bypass quiet hours only through
  eligible channels.
- At 11:22 UTC a lock-gated HTTP race passed: a privileged business deletion
  was rejected while a worker clocked in, cross-tenant access remained denied,
  both businesses remained, and the original event survived clock-out. A
  rolled-back replay of the quick-change and preservation migrations passed
  **17/17** preservation assertions; the replay ledger and temporary Auth
  helper were unchanged afterward. An initial browser run failed because the
  session-only diagnostic runner omitted the required disposable database
  container. It left 32 synthetic Auth users, verified by project, timestamp
  and test address and removed using normal Auth teardown; protected businesses
  were not deleted. Browser setup now verifies the container before fixtures
  are created. With the correct container, **8/8** affected browser scenarios
  passed; changed-file ESLint and TypeScript also passed. The full database
  rerun remains pending.
- At 11:29 UTC the full **53-file, 2,483-assertion** database regression,
  strengthened **359-assertion** rerun, **25/25** authenticated integrations,
  **2/2** default-runner tests and mismatched-container rejection passed.
  Six additional browser permission/geofence scenarios passed after correcting
  their retained-business expectations. The rebuilt production history
  disclosure passed **1/1**; split build, TypeScript and changed-file ESLint
  passed. The test project contained no Auth users and remained above 28 GiB
  free; its synthetic businesses and disabled demo policy remain.
- Owner decision DEC-003 was fetched and merged without rewriting history in
  `83e7ec412f6a3dbce63003c03ad97e840b85457c`, pushed and verified. It
  requires hard-isolated demonstrations and a clean, uncopied paid tenant;
  the current operator-enabled sample policy is insufficient. After completing
  the retention checkpoint, investigate fail-closed sample protection before
  other optional configuration work.
- At 11:31 UTC owner decisions DEC-004 and DEC-005 were merged and pushed with
  the preservation feature in `205004f9da812c0c981814849f481f34913d6818`.
  Credential assessment is authorized read-only; rotations and history changes
  need separate approval. Recovery objectives are approved as targets only;
  actual hosted configuration and restoration remain unverified.
- At 11:34 UTC a network-disabled, redacted scan of accessible local Git refs
  returned four historical candidate findings, two with privileged
  characteristics. No finding was observed in the current branch's reachable
  refs; this is not proof that other copies or unadvertised refs are absent.
  Candidate validity and current exposure were not tested. Assessment and
  unrelated development are paused for owner/security review as required by
  DEC-004; no secrets, key changes, privileged-access tests or history
  changes were made. The redacted classifications were presented privately;
  the owner/security decision remains outstanding.
- At 11:38 UTC, after the user's subsequent request to continue, independent
  DEC-003 demo-safety work resumed in the verified disposable environment.
  Credential assessment remains paused pending owner/security review, and
  no credential access, rotation or history changes are authorized.
- At 11:53 UTC the forward migration `20261103140000` had been applied and
  recorded only in `butterbox-acceptance` (API 55421, DB 55422). The old
  policy, guarded helper and historical unchecked helper reject sample
  generation, and setup explicitly rejects submitted sample fields. Existing
  saved preferences are disclosed instead of silently applied. The targeted
  results are recorded in the SAAS-003 criterion table below. An initial
  replay role-switch error and an ambiguous browser alert locator were fixed
  and their affected tests passed on rerun. No Auth users remained; synthetic
  protected businesses remain in the disposable project and the sample
  policy was disabled. Disk remained above 28 GiB.

## Recently completed story

- **BB-ROSTER-005 — Drag and drop roster changes** is Done. The source and
  preview are rechecked when applying; new warnings require another preview.
  Published shifts can be duplicated as drafts but not moved. Actor-scoped,
  idempotent undo refuses changed or published results. Review still checks its
  immutable snapshot. The additive migration was applied and recorded only in
  the verified disposable acceptance project.

  | Criterion | Implementation evidence | Test and actual result | Status |
  | --- | --- | --- | --- |
  | ROSTER-005.1 — preview shows target date and worker | Scoped preview RPC and roster quick-change panel | Focused pgTAP and parser assertions plus browser drag/preview passed | Pass |
  | ROSTER-005.2 — conflicts block or warn appropriately | Preview and apply recheck overlaps, eligibility, availability and venue policy | Focused pgTAP, authenticated races and browser warning/block scenarios passed; six neighbouring database files passed 300/300 | Pass |
  | ROSTER-005.3 — keyboard-accessible alternative | Selectable action, target day and worker in the quick-change panel | Keyboard, mobile and axe browser checks passed; changed-file lint and TypeScript passed | Pass |
  | ROSTER-005.4 — undo is offered | Actor-scoped, idempotent undo rejects changed snapshots | Focused pgTAP and race assertions, including publication safety, and browser move/duplicate undo passed | Pass |

  - **Changed files:** `supabase/migrations/20261103120000_roster_quick_changes.sql`,
    `supabase/tests/database/roster_quick_changes.test.sql`,
    `src/lib/roster-quick-changes.ts`, `src/app/roster/quick-change-actions.ts`,
    `src/components/roster-quick-changes.tsx`, `src/app/roster/page.tsx`,
    `tests/roster-quick-changes.test.mjs`,
    `tests/roster-quick-changes-concurrency.integration.test.mjs`,
    `tests/e2e/auth.spec.mjs`, `README.md` and the tracking files.
  - **Selected tests and rationale:** **56/56** quick-change pgTAP assertions
    on the applied acceptance migration cover authorisation, tenant scope,
    stale previews, conflicts, idempotency, undo and clock transitions;
    **300/300** assertions across approval, publication, overlap, conflict
    policy and tenant-isolation files cover direct dependencies. A separate
    disposable replay passed **56/56** with the migration and a temporary Auth
    helper inside a rolled-back transaction. Two authenticated concurrency
    integrations and **10/10** related Node tests passed. The focused browser
    scenario plus four neighbouring approval, mobile roster, acknowledgement
    and copy scenarios passed **5/5**. Changed-file ESLint, TypeScript and
    the split production compile/generate passed. The built-in test discovery
    did not identify Node's test format; the repository's Node runner passed.
  - **Failures resolved:** The first pgTAP attempt exposed an immutable undo
    trigger error. Browser attempts exposed a missing fixture boolean and a
    serious accessible-name mismatch. All were fixed and rerun. The first
    replay attempt lacked permission to create the temporary Auth helper;
    the helper was created by the disposable project's administrative role
    before switching to the normal migration role, and rollback was verified.
  - **Deferred and risks:** Full database, Node, integration and browser
    suites were intentionally not run. Broader regression remains required at
    workstream merge or release. Feature commit
    `2549475af5de0930f54b2b2ccf6f5ef81dc91003` was pushed through merge
    checkpoint `7abb5ad31fb5a93440970ecb4b9b81443fc540b2`; its remote SHA
    matched. The first push was rejected because the owner had concurrently
    added DEC-001; both histories were merged without rewriting either.

## Earlier completed story

- **BB-ROSTER-009 — Roster approval workflow** is Done. Direct publication
  remains the default. Owners can require review per venue; scoped managers
  submit an immutable snapshot, a different scoped owner, administrator or
  general manager approves or rejects, and requesters can withdraw. Rejection
  requires a reason. Stale settings or changed submitted shifts prevent
  approval; later drafts are not published inadvertently. Publication keeps
  existing conflict checks, versioning, notifications and acknowledgement.
  Settings and decisions are audited. This supplies the approval workflow
  needed for the broader `BB-ORG-006` configuration story.

  | Criterion | Implementation evidence | Actual verification | Status |
  | --- | --- | --- | --- |
  | ROSTER-009.1 — owner selects direct or approval | Venue mode and owner RPC in `20261103110000_roster_approval_workflow.sql`; owner settings/action and protected history | 67/67 focused pgTAP on each isolated project; mobile browser verified both modes, separate venue default, invalid input and manager restriction | Pass |
  | ROSTER-009.2 — reviewer sees changes | Immutable scoped shift snapshots, strict response parser and `roster-review-panel.tsx` | Focused pgTAP and authenticated integration verified stale snapshots and later drafts; mobile browser showed worker, role, time, break and acknowledgement without publishing the later draft | Pass |
  | ROSTER-009.3 — approval/rejection is scoped and audited | Scoped transactional decision RPCs, immutable records, audit labels and manager forms | Focused pgTAP; one authenticated two-tenant concurrency/revocation integration; mobile browser verified independent approval, rejection reason, owner audit, withdrawal, notification and acknowledgement | Pass |

  - **Changed files:** `supabase/migrations/20261103110000_roster_approval_workflow.sql`,
    `supabase/tests/database/roster_approvals.test.sql`,
    `src/app/actions.ts`, `src/app/roster/page.tsx`,
    `src/app/settings/organisation/page.tsx`,
    `src/components/roster-review-panel.tsx`, `src/lib/roster-review.ts`,
    `src/lib/sensitive-action-audit.ts`, and the focused Node, integration,
    audit and browser tests.
  - **Selected tests and results:** Roster review **67/67** pgTAP on
    `butterbox-acceptance` and **67/67** on `butterbox-fresh-migration-check`;
    seven affected publication/conflict/tenant/audit pgTAP files **290/290**;
    one authenticated race integration; **17/17** targeted Node tests;
    five serial production-browser scenarios including mobile WCAG checks;
    changed-file ESLint, TypeScript, split production compile/generate and
    `git diff --check` all passed. Disk remained above 28 GiB.
  - **Resolved failures:** The first acceptance fixture stopped after 50 passes
    due to an unauthorized direct recipient-table query; the corrected
    employee-scoped check passed. Two replay setup attempts failed before
    assertions due to a missing SQL terminator and Auth-schema privileges;
    the correctly privileged temporary helper was rolled back and verified
    absent. The first browser run exposed an acknowledgement button's
    accessible-name mismatch; the control was fixed and axe passed. A later
    invalid-input browser assertion was narrowed to the actual alert rather
    than Next.js's route announcer and passed on rerun.
  - **Deferred and risks:** Full pgTAP, Node, authenticated integration and
    browser suites were intentionally not run. Broader regression remains
    necessary for workstream merge or release. Independent reviewer approval
    is a documented design choice; an owner-only venue can withdraw and use
    direct mode or grant a suitable second reviewer. Feature commit
    `6fbdde15f41131ce15236bf20468b6ede23cd372` was pushed and the remote
    SHA matched.
- **BB-RULES-005 — Privacy and retention policy** is Blocked as detailed
  above; the verified access and visibility changes have been pushed. Week
  boundaries are currently baked into roster publications and payroll
  snapshots; do not silently reinterpret history.
- **BB-RULES-001 — Employment rule metadata** is Done and pushed as
  `43ab17e9b03927f83db530a30f97df20cd58efd6`.
- **BB-SHIFTS-004 — Request shift swap** is Done. Feature commit
  `de39307dcfed4b121ee8417d93622b408c0a86c9` was pushed and the remote SHA
  matched. The recovered migration and initial test had
  already been pushed as `9ec5e6f033e8e95e1d17624beb7c7f5d38321604`.
  The first isolated run had 23 passing and 10 failing assertions before an
  SQL error: approval called nonexistent or incorrectly signed locking
  helpers. A forward-only migration corrected the shared-worker and employee
  lock order; the original migration was preserved. Employee and manager UI,
  account-scoped notifications, publication/acknowledgement handling and
  tests are now implemented and verified as detailed below.
- **BB-COMMS-002 — In-app notification centre** is Done. It now combines
  roster-publication updates with per-recipient shift-offer and claim-outcome
  notifications. The targeted checks passed; see the criterion evidence below.
  Commit `47bfab03a81bbea5ab9dedd732f77ab0c3bc6a4f` was pushed and its remote
  SHA matched.
- **BB-SHIFTS-001/002/003 — Open-shift offers** are Done (evidence below).
  The offer workflow is the source for BB-COMMS-002's offer and claim-outcome
  notifications.
- **BB-FOUND-007 — Audit sensitive actions** is Done (evidence below).
  Commit `012e07ccb54cd99331d0b861b6a2e9fb40288390` was pushed and its remote
  SHA matched.
- **BB-FOUND-008 — Resilience and operations** has verified monitoring
  implementation and is Blocked on authorised hosted staging restore/backup
  access. See the criterion table and exact recovery steps below.
  The offer open/response/confirmation workflow (BB-SHIFTS-001/002/003) is
  complete and supplied the prerequisite for BB-COMMS-002 notifications.
- **BB-SAAS-004 — Performance and accessibility** is Done. BB-COMMS-002 now
  covers roster-publication updates and shift-offer/claim-outcome notifications;
  email and push remain deferred to BB-COMMS-003.
- **BB-FOUND-005 — Invite and onboard users** is Done (evidence below). The
  former cross-business rejection was removed by a new migration now that
  BB-FOUND-006 resolves the business per request. Manager-page permission
  redirects now keep the business context, so multi-business users see the
  intended business instead of the chooser. Committed as
  `540ed3f3e650f83e3a17c6dfe88bbfc2702e812f`; the remote SHA matched.
- **BB-ROSTER-008 — Publish and notify** is Done. The final open criterion
  (ROSTER-008.3) is verified for invited staff. In-app delivery is the
  notification channel; email/push belongs to BB-COMMS-003.
- **BB-FOUND-006 — Switch between business memberships** is Done (evidence
  below), committed as `92f4841d21c89b4bfbf3e3c5d7bbf678aac70bc3`; the remote
  SHA matched.
- **BB-ORG-005 — Multiple venues** is Done. All three criteria are verified:
  scoped venue selection, shared-worker overlap detection and actual venue
  attribution through timesheet approval, finalisation and CSV export.
  Only tests and tracking changed in this checkpoint; the existing payroll
  implementation already preserved attribution. Next implementation:
  **BB-FOUND-006 — Switch between business memberships**.
- **BB-PAY-004 — Xero Payroll adapter** is Blocked. Configuration-key presence
  checks found no `XERO_` keys in runtime, repository environment files or
  Codespace shared secrets; no values were printed. No explicitly authorised
  isolated Australian payroll organisation is available. Official OpenAPI
  confirms the Payroll AU v2 `/Timesheets` endpoint and POST
  `payroll.timesheets` scope, not working OAuth refresh or sandbox delivery.
  The provider-ready mapping gate remains closed to actual sending.
- **BB-PAY-003 — Payroll employee mapping** is Done. Owner/admin
  setup creates business-wide mapping destinations, not authenticated provider
  connections. Explicit case-sensitive employee IDs are unique per destination;
  versioned saves/removals append attributed audit events. Provider-ready
  records use detached canonical records, refuse incomplete mappings and
  serialize with mapping edits. All criteria and final clean replay/regressions
  passed (evidence below). No provider is connected or enabled by this feature.
  BB-PAY-004 requires external access and is Blocked; continue independent
  foundation work rather than claiming delivery works.
- **BB-PAY-002 — Generic CSV export** and **BB-TIME-006 — Timesheet export
  traceability** are Done (criterion evidence below). Immutable scoped batches
  contain approved finalised records, protect spreadsheet cells and never
  automatically export a previously exported session again. Amended hours
  require explicit manual reconciliation with a reason and confirmation of
  any necessary external adjustment. Final-schema verification includes the
  employee-name race and reconciliation-reason boundaries, including BOM
  whitespace and non-BMP characters. BB-PAY-003 is now complete.
  No external payroll access or award compliance is
  implied by a generic CSV download. Verified checkpoint `109df0b` was pushed;
  the remote SHA matched `109df0b3c1a576569d3a569e3f41020e3e9a07de`.
- **BB-PAY-001 — Canonical payroll record** is Done (verification below).
  Its verified checkpoint is `90f29fd`, pushed to the development branch.
- **BB-TIME-005 — Finalise payroll period** is Done (verification below).
  Canonical records, generic CSV, export traceability and employee mapping
  have now been completed before Xero (BB-PAY-004).
  The new BB-PAYRULES award stories depend on
  BB-RULES-001/003 and should follow reliable export.
- **BB-TIME-004 — Department approval** is Done.
- **BB-TIME-003 — Employee correction request** is Done. It was recovered
  from pushed checkpoint commits after the Codespace upgrade (8 CPU, 31 GiB
  RAM, 63 GB disk) and verified on a clean isolated replay.
- **BB-ATTEND-005 — Time capture fallback** is Done. Immutable,
  explicitly unverified offline claims retain the device time and server
  receipt time. The attendance page queues claims and retries idempotently after
  reconnecting as the same account. A scoped manager can match or correct a
  finished event, reject a claim, or confirm a matching pair as an explicitly
  offline-sourced finished session. Decisions and reopenings are immutable and
  employee-visible; no break is assumed. A manager can also complete a matching
  open server session with an offline clock-out, explicitly recording a
  manager-reported end for an open break when confirmed with the employee.
  A prepared tab can reopen a generic offline shell with its scope encrypted
  and tied to the browser session. Session changes hide the fallback and
  sign-out clears the preparation. Access revocation cannot be checked while
  disconnected, pending claims remain unencrypted, and closing the tab can
  remove the preparation.
- **BB-ATTEND-007 — Attendance corrections** is Done. Scoped corrections and
  edit-lock transitions are immutable, attributed and visible to permitted
  users; corrected work time, daylight-saving handling, precision, linked-worker
  overlap and concurrent account relinking are verified below.
- **BB-FOUND-005 — Invite and onboard users** is now Done (see above). Earlier
  checkpoint notes: the committed
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
- **BB-SAAS-003 — Tenant onboarding and support** is Blocked. The owner
  checklist, contextual help and fail-closed sample safeguard are implemented
  and tested in the disposable environment. Production isolation and
  historical sample records have not been assessed, and no separate demo
  deployment or conversion has been verified. Privileged direct table writes
  or schema changes can bypass this partial safeguard; it does not establish
  the hard-isolation requirements of DEC-003.
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
- **BB-ORG-005 — Multiple venues** is Done: scoped selection, cross-venue
  conflicts and approval/export attribution are verified in the final
  2,072-assertion, 18-integration and 50-browser-scenario regressions.
- **BB-ROSTER-008 — Publish and notify** is now Done (see the Current story
  section). Earlier checkpoint notes: configured local
  and cross-venue blockers prevent publication atomically, and concurrent conflicting edits
  return an explicit retry. Numbered versions, complete protected snapshots and
  a scoped manager history are verified. In-app publication updates now reach
  linked employees once per account/version; profiles without a linked account,
  eligible membership or department link remain pending and managers are
  warned. Email/push delivery and onboarding remain unfinished.
- **BB-COMMS-002 — In-app notification centre** is Done. Roster publications,
  shift offers and manager claim outcomes have scoped unread/read state,
  authorised deep links and deduplicated events.
- **BB-ROSTER-010 — Simple employee roster** is Done. Authorised managers can
  require acknowledgement for assigned drafts, and the linked employee can
  acknowledge the published snapshot from their mobile schedule. All three
  criteria and the full database/browser regressions passed.
- **BB-ROSTER-003 — Unassigned open shift** is Done: all four criteria are
  covered below. Role and availability restrictions are opt-in to preserve
  existing venue behaviour; active membership and overlap checks always apply.

### BB-SHIFTS-001/002/003 — Open-shift offers, responses and confirmation (Done)

Design: an accept is a *claim*; the shift stays open until an authorised
manager confirms one claim, which rechecks the latest eligibility under locks.
Offers apply only to published, upcoming open shifts (the existing published
shift protections stay in force; confirmation is the only sanctioned
post-publish assignment and does not create a new publication version).
Offer and recipient rows are the append-only audit trail; actor ids are plain
UUIDs (like `sensitive_action_audit`) so audit history survives account removal.

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| SHIFTS-001.1 Eligibility checks venue, role, availability and conflicts | `shift_offer_ineligibility` checks active venue/department membership, active and qualified role, `employee_available_for_shift` and `shared_worker_has_overlap`; `list_shift_offer_candidates` shows reasons; `create_shift_offer` rejects any ineligible selection. Roster UI disables ineligible candidates with the reason. | pgTAP passed each ineligibility reason and rejection. Browser: overlapping worker shown disabled as "Already rostered at this time"; eligible worker preselected. | Pass |
| SHIFTS-001.2 Selected audience and send are auditable | `shift_offers` (creator, `clock_timestamp` send, expiry) and `shift_offer_recipients` (invited audience); `protect_shift_offer_history` makes identity, audience, responses and outcomes immutable; select-only RLS for scoped managers. | pgTAP passed audit rows, immutability, out-of-scope FOH/BOH denial and cross-tenant reads. Integration: outsider and employee sends denied; concurrent sends create exactly one open offer. | Pass |
| SHIFTS-001.3 Shift remains open until confirmed | Claims do not touch `shifts.employee_id`; only `confirm_shift_offer_claim` assigns. | pgTAP and integration: shift unassigned after two claims. Browser: shift remains under Open shifts until Confirm. | Pass |
| SHIFTS-002.1 Employee only sees eligible published offers | Security-definer `list_my_shift_offers` returns only the caller's own linked recipient rows for open, unexpired offers on still-open published shifts where they remain eligible (plus answered/outcome history). | pgTAP passed uninvited-employee, other-tenant, other-recipient, expired and withdrawn exclusions, plus an invited employee who becomes unavailable after the send no longer seeing the offer and being refused on accept ("You are no longer eligible for this shift"). Browser: non-invited worker sees no offers section; invited worker sees the offer at 375px without overflow. | Pass |
| SHIFTS-002.2 Response is timestamped | `respond_shift_offer` records `responded_at` (server clock) and `responded_by`; a single response only. | pgTAP passed timestamps and second-response refusal. Browser verified accepted response, actor and timestamp in the database and status text. | Pass |
| SHIFTS-002.3 Expired offers cannot be accepted | Expiry must be future and no later than shift start; acceptance after expiry, withdrawal, fill or start is refused. | pgTAP passed expired and withdrawn acceptance refusals and invalid responses, plus a still-pending recipient of a filled offer: they see `filled`/`closed` with no respond action, accept and decline are both refused ("Shift offer is no longer available"), and their row stays unanswered with the assignment unchanged. | Pass |
| SHIFTS-003.1 Concurrent claims cannot assign multiple employees | Confirmation takes shared-link, membership, shared-worker and employee locks, then offer/shift/employee row locks; partial unique index allows one open offer per shift. | Integration held the offer row lock while two managers confirmed different claimants; both waited, then exactly one returned `confirmed` and the other "Shift offer has already been filled"; the shift has one employee. | Pass |
| SHIFTS-003.2 Confirmation checks latest availability | Eligibility is re-evaluated after locking; an ineligible claimant receives outcome `unavailable` and the shift stays open. | pgTAP passed claimant made unavailable after claiming → `unavailable`, shift still open, another claimant confirmable. | Pass |
| SHIFTS-003.3 Losers receive clear status | Outcomes: claimant `confirmed`, other accepted `not_selected`, others `closed`; shown on My schedule as "Confirmed — this shift is yours", "Filled by another team member", "Not confirmed — you are no longer available" or "Offer closed". | Integration verified winner/loser outcomes through the employee RPC; browser verified the winner's confirmed status and weekly schedule entry. | Pass |

Files: `supabase/migrations/20261103030000_open_shift_offers.sql`,
`supabase/tests/database/open_shift_offers.test.sql`, `src/lib/shift-offers.ts`,
`src/app/actions.ts`, `src/app/roster/page.tsx`, `src/app/my-schedule/page.tsx`,
`tests/shift-offers.test.mjs`, `tests/shift-offers-concurrency.integration.test.mjs`,
`scripts/test-tenant-isolation.mjs`, `tests/e2e/auth.spec.mjs` and tracking files.

Tests selected (targeted policy) and actual results, all on the isolated
`butterbox-acceptance` project (API 55421, DB 55422):
- pgTAP `open_shift_offers` **78/78** (58 original, 10 filled-offer/
  re-evaluated-eligibility assertions, and 10 notification, read-scope and
  repeated-event assertions); neighbouring rostering suites
  `shift_acknowledgements` 59, `roster_publication_versions` 47,
  `manual_assignment_eligibility` 37, `roster_conflict_policies` 53,
  `shared_worker_conflicts` 26 — all pass (shared shift/eligibility objects).
- Integration `shift-offers-concurrency` **1/1** (HTTP tenant/role denial,
  concurrent send, lock-gated concurrent confirmation, loser status).
- Node `tests/shift-offers.test.mjs` **5/5**; `tsc --noEmit` clean; ESLint on
  changed files clean.
- Browser (low-memory, split production build succeeded): new offer scenario
  **1/1**; neighbouring roster/my-schedule scenarios (acknowledgements, roster
  copy, WCAG/keyboard smoke) **3/3**.

Intentionally deferred: full pgTAP suite, other integrations, other Node tests
and remaining browser scenarios. This change adds a narrow recipient-scoped
notification RPC and does not change shared authorization helpers. A fresh
replay of all migrations and the directly affected notification suites passed.
Broader regression is recommended at the next release-candidate checkpoint.

### BB-FOUND-007 — Audit sensitive actions (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| FOUND-007.1 Actor, tenant, timestamp, old/new values and applicable reason | Atomic AFTER triggers on 33 staffing, permissions, roster, attendance and payroll tables append allowlisted scalar snapshots to `sensitive_action_audit`. Database changes without `auth.uid()` are explicitly distinguished from user actions. No-op projected updates and rolled-back failures create no duplicate success events. Existing domain records are preserved; earlier events are not backfilled. | 31 pgTAP assertions passed real employee create/update, actor/time/business, before/after values, payroll reopen reason, failed mutations, no-op saves, source deletion, future-field exclusion and tenant deletion. Authenticated integration verified one audit row per committed payroll transition across concurrent retries. Production browser verified before/after profile values, actor, timestamp, reason and database-service attribution. | Pass |
| FOUND-007.2 Authorised viewers filter audit history | Owner-only RLS and server page checks; explicit business context; validated category, operation, actor UUID and UTC date bounds; deterministic timestamp/ID ordering and 50-row pagination. Invalid filters show an alert without querying or displaying results. | Three Node tests passed filter/row validation and trigger/label parity. Production Chromium verified combined filters yielding one profile update, two payroll transitions, 52 insert records over two pages, invalid filters, owner revocation/tenant RLS in SQL, manager redirect, outside-owner unavailable state, mobile no-overflow and zero axe findings. | Pass |
| FOUND-007.3 Ordinary users cannot modify audit records | No application insert/update/delete grants, no service-role access, protected trigger functions, append-only mutation guard including privileged writes. Only whole-business cascade deletion follows the established lifecycle. | pgTAP passed anonymous/employee/department-manager/cross-tenant read restrictions, owner insert/update/delete refusals, privileged update/delete refusals and revoked-owner access. Authenticated browser/API test verified owner update refused with 42501. Source deletion preserved history; tenant deletion removed only its own records. | Pass |

Files: `supabase/migrations/20261103010000_sensitive_action_audit.sql`,
`supabase/tests/database/sensitive_action_audit.test.sql`,
`src/lib/sensitive-action-audit.ts`, `src/app/settings/audit/page.tsx`,
`src/components/main-navigation.tsx`, `tests/sensitive-action-audit.test.mjs`,
`tests/payroll-period-finalisation.integration.test.mjs`,
`tests/e2e/auth.spec.mjs`, `README.md` and tracking files.
The clean isolated 46-migration replay passed; database regression
**2,116 assertions / 45 files**, authenticated integrations **19/19**,
Node **139 passed** (19 integration skips run separately), ESLint, TypeScript,
split production build and **56/56** browser scenarios all passed.
An initial unscoped `supabase test db` invocation also selected two legacy
migration-rehearsal scripts that intentionally require a pre-canonical schema;
it failed their prerequisites. Reran the complete transactional suite using
the explicit `supabase/tests/database` directory, without modifying or
weakening either migration rehearsal. Disk stayed above 29 GiB free.
The audit begins at installation and is not a historical backfill. Redacted
fields are deliberately excluded; free-text reasons and names remain sensitive.

### BB-SAAS-004 — Performance and accessibility (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| SAAS-004.1 Core pages pass WCAG-oriented checks, keyboard controls and screen-reader smoke tests | Added a keyboard-visible skip link and focusable main landmark, corrected low-contrast brand/dashboard text and CSS link colour precedence, and preserved visible accessible brand names. Exact axe dependency is test-only. | Production Chromium ran axe WCAG 2.0/2.1 A/AA and 2.2 AA checks on login, signup, reset request, 11 owner pages and five employee pages at 375px. No violations; document language/title, one main landmark and one h1 verified. Keyboard-only sign-in, skip-to-main, roster publication and notification read passed; mobile employee pages have no horizontal page scroll. These are automated accessibility-tree/live-region smoke checks, not a manual assistive-device study or compliance certification. | Pass |
| SAAS-004.2 Defined benchmark tested with 25 employees/7 days | Documented production-build budgets and seeded 25 workers with seven drafts each, verifying all 175 drafts, publication persistence and the employee's seven shifts. | Final full regression measured roster loads [993, 890, 771] ms (median 890 <= 3,000), publish 828 <= 5,000 ms, mobile schedule loads [400, 368, 373] ms (median 373 <= 2,000). Mobile schedule excludes other employees. | Pass |
| SAAS-004.3 Loading and error states are clear | Main navigation uses Next's `useLinkStatus` to announce a pending transition without replacing server-rendered forms. Root and global error boundaries give safe messages and retry; missing-page UI provides a dashboard link. Root page errors focus their heading and show only a reference digest, never raw exception text. | Production browser held a real RSC navigation and verified the loading status appears and clears. Simulated a 500 action response, verified focused/axe-clean error UI and unchanged draft, removed the failure and retried successfully to publish. Signed-out and signed-in unknown URLs returned 404 with accessible recovery. | Pass |

Files: `src/components/app-shell.tsx`, `src/components/main-navigation.tsx`,
`src/components/auth-layout.tsx`, `src/components/brand-lockup.tsx`,
`src/app/globals.css`, `src/app/page.tsx`, `src/app/error.tsx`,
`src/app/global-error.tsx`, `src/app/not-found.tsx`,
`tests/e2e/auth.spec.mjs`, dependency manifests, `README.md` and tracking.
The first full run passed 50/55: a proposed root `loading.tsx` caused
server-streamed forms to remain hidden without JavaScript, and five existing
workflows timed out. A Playwright API trace isolated the no-JavaScript roster
form lookup. Removed the root loading boundary and used the documented
navigation pending hook instead; idle links expose no status role. All eight
affected/new scenarios then passed, followed by the full **55/55** production
regression. No legitimate assertions were removed or weakened. Node **136**
passed with 19 separately configured integrations skipped in this unit-only
run; full ESLint, TypeScript and split production build passed. No SQL or
server authorisation changed, so no database reset or new pgTAP/integration
run was required for this UI-only checkpoint. Free disk remained above 29 GiB;
no volumes, databases, worktrees or caches were deleted.

### BB-FOUND-006 — Switch between business memberships (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| FOUND-006.1 Switch shows only active memberships | `/choose-business` and `switchBusinessAction` list and accept only businesses with a current `business_memberships` row for the caller (RLS-scoped); the sidebar link appears only with more than one membership. | Browser: chooser listed exactly the two member businesses, never the outside business; after revocation it listed one and hid the revoked business. Integration: RLS returns only member businesses and memberships. | Pass |
| FOUND-006.2 API checks each request independently of UI selection | `getWorkspace` re-reads memberships per request and resolves the business only from explicit context (URL `business`, form `business_id`, requested venue); conflicting, invalid, revoked and outside values fail closed. Mutations never read the preference cookie. RPCs authorise the role held in the targeted business. | Unit: 5 selection tests. Integration: owner rights in one business were denied in an employee-only and an outside business, and with mismatched venues; revocation took effect for the same token. Browser: a stale form submitted after revocation created no employee; conflicting, invalid and outside business URLs showed "Workspace unavailable". | Pass |
| FOUND-006.3 No data leaks across tabs or cached pages | Navigation and post-action redirects stay pinned to the tab's business; forms carry their venue/business; pages are dynamic and `no-store`; sign-out deletes the preference cookie. | Browser: tab 1 stayed on business A after tab 2 switched to B, and its form created the employee only in A; `/people` returned `Cache-Control` containing `no-store`; the preference cookie was absent after sign-out. | Pass |

Files: `src/lib/business-selection.ts`, `src/lib/workspace.ts`,
`src/app/choose-business/page.tsx`, `src/app/actions.ts`,
`src/components/app-shell.tsx`, `src/components/main-navigation.tsx`, all
workspace pages (business parameter), `tests/business-selection.test.mjs`,
`tests/business-switching.integration.test.mjs`,
`scripts/test-tenant-isolation.mjs`, `tests/e2e/auth.spec.mjs` (the former
fail-closed scenario was replaced by a stricter switching scenario covering
the same stale-form and cross-page protections) and `README.md`.
Decision: the HTTP-only `bb_business` preference cookie is only a default for
pages opened without context; it is never authorisation and never used by
mutations.

### BB-FOUND-005 — Invite and onboard users (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| FOUND-005.1 Invitation expires and cannot be reused | Database-time expiry and atomic acceptance reject expired or already-consumed invitations. | The 66-assertion invitation pgTAP suite and authenticated acceptance races passed; production Chromium showed expired invitations cannot be accepted. | Pass |
| FOUND-005.2 Recipient joins only the intended business and venue | Verified email acceptance links the intended employee and creates only its scoped membership. An existing same-business member retains their role and scope. An existing member of another business (`20261103000000_cross_business_invitations.sql`) gains only an employee membership for the invited venue and department, keeping their other memberships. Acceptance then opens the invited business explicitly. | 71 pgTAP assertions verified the new scoped membership, the unchanged other-business membership, the employee link, no access to another department and no reuse. The authenticated integration covered concurrent cross-business acceptance, a setup/acceptance race, refused invitation creation and owned-business visibility. Separate-browser Chromium covered intended scope and unrelated-user denial. A new Chromium scenario had an existing owner accept, open the invited business, get refused manager pages and switch back without seeing the invited profile. All passed. | Pass |
| FOUND-005.3 Duplicates and revocation are handled | Unique pending indexes and transaction locks prevent duplicate employee/email invitations; managers can resend or revoke; expired invitations can be replaced. | pgTAP and concurrent duplicate/revocation tests passed; Chromium verified resend preserves one pending invitation and revoked links cannot be accepted. | Pass |
| FOUND-005.4 Audit entry is stored | Protected append-only events record invitation creation and status changes with tenant, department, actor and time. | pgTAP verified scoped access and mutation protection; authenticated and browser tests confirmed creation and acceptance actors. | Pass |

Files: `supabase/migrations/20261102070000_staff_invitations.sql`,
`supabase/migrations/20261103000000_cross_business_invitations.sql`,
`supabase/tests/database/staff_invitations.test.sql`,
`tests/staff-invitations.integration.test.mjs`, `scripts/test-tenant-isolation.mjs`,
`src/app/actions.ts`, `src/app/people/page.tsx`, `src/app/invitations/[id]/page.tsx`,
`src/components/invitation-session.tsx`, `src/lib/invitations.ts`,
`src/lib/auth-urls.ts`, `src/lib/workspace.ts`, `src/app/page.tsx`,
`src/app/setup/page.tsx`, `tests/invitations.test.mjs`,
`tests/auth-urls.test.mjs`, `tests/e2e/auth.spec.mjs` and `README.md`. The
cross-business completion also changed the permission redirects in
`src/app/work-time/page.tsx`, `src/app/timesheets/page.tsx` and
`src/app/settings/{permissions,payroll,organisation}/page.tsx` to keep the
business context.
The recipient refresh token is exchanged in an isolated client, and the
resulting session is verified against the invitation before an existing
browser session can be replaced. This rejects mismatched access and refresh
tokens. Email delivery and redirect allowlists must be configured separately
in each deployed environment.

### BB-SAAS-003 — Tenant onboarding and support (Blocked)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| SAAS-003.1 Checklist progresses business, venue, staff, shift and publication | Owner-only progress RPC and dashboard checklist use real records, with tenant and role checks. | The updated **42/42** onboarding pgTAP assertions and targeted production Chromium checklist scenario passed, including successive steps, archived staff, owner-only access and cross-tenant isolation. | Pass |
| SAAS-003.2 Seeded demo data is isolated from production | Migration `20261103140000` disables the old policy, rejects operator policy enablement and both seed helpers, and preserves existing records. Setup and server actions reject sample requests; previously saved preferences are disclosed. The safeguard is applied only in the disposable test project. | Four affected pgTAP files passed **102/102**, including authorization and tenant checks. An enabled-policy upgrade preserved synthetic business, venue, department, employee, role and shift records **16/16** on each of two rolled-back projects. Three authenticated setup, tenant and invitation-race integrations passed. The mobile browser scenario passed forged form requests, clean setup and WCAG checks. Actual production configuration, historical data, separate demo infrastructure, outbound controls and clean conversion remain unverified. | Blocked |
| SAAS-003.3 Inline help covers common tasks | The checklist explains business and venue setup, staff, draft shifts and publishing, with links to the relevant pages. | Targeted production Chromium followed the departments help link and exercised the staff, shift and publication workflow. The earlier 37-scenario regression also passed. | Pass |

**Selected verification:** The onboarding, workspace RLS, business setup
and tenant-isolation pgTAP files cover the changed policy and its direct
dependencies. The upgrade fixture checks migration compatibility and legacy
record preservation. Authenticated integrations cover privileged enablement,
concurrent setup, invitations and two-tenant isolation. Serialized production
Chromium covered signup/recovery, the owner checklist/help and the mobile
sample-disabled flow; the signup and mobile scenarios were rebuilt and rerun
after the final server-action refinement. Changed-file ESLint, TypeScript and
the split production build passed. Full pgTAP, Node, integration and browser
suites were intentionally deferred. Broader migration and cross-tenant
regression is required at release or when the demo architecture is implemented.

Files: `supabase/migrations/20261102060000_onboarding_and_demo_isolation.sql`,
`supabase/migrations/20261103140000_disable_unisolated_demo_seed.sql`,
`supabase/tests/migration-upgrade/demo_seed_fail_closed.test.sql`,
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

### BB-PAY-001 — Canonical payroll record (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| PAY-001.1 Schema includes worker mapping, venue, date, hours, breaks, codes and approval/version | The finalisation transaction captures immutable tenant-associated details alongside each approved `payroll_period_entries` row. Version 1 records contain the Butterbox employee ID, explicitly null provider mapping and pay codes, venue/department/timezone, local date, exact corrected event times, elapsed/worked/paid seconds, individual paid/unpaid breaks, approval revision and finalisation ID/sequence. Venue timezone is locked and checked against the period before a snapshot is inserted. Only a scoped full-venue payroll manager may call the preview RPC. | 45/45 canonical pgTAP assertions passed, covering exact corrected microseconds, Sydney's overnight DST transition, break classifications and totals, approval/version, empty weeks, scoped denial, immutable old versions, cross-tenant association and stale/incomplete periods. The authenticated integration passed owner/GM access, FOH/employee/other-tenant denial, direct-table denial, and both orders of the venue-timezone/finalisation race. Production Chromium verified the owner preview and mobile layout, FOH denial and removal after reopening. | Pass |
| PAY-001.2 Malformed records fail clearly | `validateCanonicalPayrollRecord` checks exact shapes, IDs, timezone/local date and week bounds, timestamp precision, break order/provenance, integer-microsecond totals, approved revisions, provider mapping and pay-code totals. Collection validation rejects duplicate, incomplete, cross-tenant or mixed-version rows. The RPC and UI explicitly reject stale and incomplete snapshots. | All 7 canonical Node tests passed, including malformed fields, mismatched totals, duplicate and cross-tenant rows, stale versions, DST and invalid mapping/codes. The 45 pgTAP assertions passed invalid input and stale/incomplete snapshot cases. A genuine pre-migration finalisation was created before applying the migration: all 11 legacy assertions passed, including the clear missing-details error, reasoned reopen/refinalise and preservation of original entries and events. | Pass |
| PAY-001.3 Provider adapters never mutate source timesheets | The provider-preparation boundary has no database write capability, requires an explicit matching employee mapping and assigned codes, and returns a detached deeply frozen validated record. Attendance events, approvals and finalisation snapshots remain immutable; a provider-specific integration is not yet implemented and must use and retest this boundary. | The provider-boundary unit tests passed mutation attempts, detached nested records, explicit mapping, missing/mismatched IDs and pay-code validation. The authenticated integration prepared a real finalised record, rejected mutation of its copy and re-read the unchanged persisted record. Database and legacy tests confirmed original attendance and historical snapshots remain unchanged. | Pass |

Files: `supabase/migrations/20261102190000_canonical_payroll_records.sql`,
`supabase/tests/database/canonical_payroll_records.test.sql`,
`supabase/tests/migrations/canonical_payroll_legacy_setup.sql`,
`supabase/tests/migrations/canonical_payroll_legacy_verify.sql`,
`src/lib/canonical-payroll.ts`, `src/app/timesheets/page.tsx`,
`tests/canonical-payroll.test.mjs`,
`tests/payroll-period-finalisation.integration.test.mjs`,
`tests/e2e/auth.spec.mjs`, `README.md` and the backlog/progress files.
The full test counts and final browser rerun are recorded in the execution
summary above.

Decisions and limits: older finalisations without detailed snapshots are not
reconstructed from live data; an authorised manager must reopen with a reason,
review and finalise again. Seconds retain microsecond precision, while display
durations round. Provider mappings and codes are unassigned, not inferred.
The preview is not an export, Xero integration or award calculation. A future
export must atomically recheck the finalisation, exceptions, mapping and
reconciliation under appropriate locks.

### BB-PAY-003 — Payroll employee mapping (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| PAY-003.1 Mapping unique per connection and employee | Business-scoped mapping destinations have immutable provider/account identity. One mapping per destination/employee and one employee per external ID are enforced by constraints and the owner/admin-only RPC. Saves/removals require a reason, expected revision and idempotent request; changes append immutable audit events. Destinations are mapping setup, not OAuth authentication or an enabled adapter. | 29-assertion pgTAP suite passed uniqueness, independent destinations, role/tenant denials, invalid IDs, request retries, stale edits, removals and audit immutability. Authenticated integration passed eight competing edits with one winner and six retries returning one audit receipt. Production Chromium verified owner setup, duplicate-ID refusal, successful distinct IDs and removal with incremented revisions. Passed. | Pass |
| PAY-003.2 Missing mappings block provider export | `list_provider_payroll_records` is the adapter input boundary: full-venue authorization, current finalisation/exceptions and destination tenant are checked, then mapping reads serialize with edits. It refuses to return any records if any employee is unmapped. Generic CSV remains provider-neutral. No external adapter is enabled by mapping setup. | pgTAP verified missing/partial mappings, removal and a different destination each refuse all provider-ready records. Authenticated integration verified an in-flight mapping removal blocks the provider read until commit, then it fails with `Missing payroll employee mappings`. Complete reads returned two validated records for the exact explicit connection; employees, FOH and outsiders were denied. Passed. | Pass |
| PAY-003.3 Worker IDs not inferred from names | The UI requires explicit case-sensitive IDs next to stable Butterbox employee UUIDs. The adapter boundary joins only by employee/connection IDs and attaches mapping metadata to detached canonical records, leaving original attendance, snapshots and CSV unchanged. | pgTAP verified two identical names produce their separately entered payroll IDs and original snapshots retain null provider mapping. Production Chromium verified saving one same-name employee leaves the other unmapped, and after saving both, removing one preserves the other's explicit ID. Unit tests passed input, revision and malformed/duplicate-response checks. Passed. | Pass |

Files: `supabase/migrations/20261102210000_payroll_employee_mapping.sql`,
`supabase/tests/database/payroll_employee_mapping.test.sql`,
`src/lib/payroll-mapping.ts`, `src/app/settings/payroll/page.tsx`,
`src/app/actions.ts`, `src/app/timesheets/page.tsx`,
`tests/payroll-mapping.test.mjs`,
`tests/payroll-period-finalisation.integration.test.mjs`,
`tests/e2e/auth.spec.mjs`, `README.md` and the backlog/progress files.

Verification: clean replay of all 44 migrations on the identity/port-verified
disposable project; **2,072/2,072** database assertions across 44 files;
**18/18** authenticated integrations; **131** Node tests (18 integrations
skipped only in that invocation and run separately); full ESLint, TypeScript,
split production compile/generate and **50/50** production-browser scenarios.
The first focused browser run exposed a provider select whose implicit label
included option text; an explicit label/control association fixed it, and
the rebuilt focused and complete regressions passed without dropping assertions.
Owner/admin management is intentionally business-wide; full-venue GMs can read
mapped provider-ready records but cannot change business-wide destinations.
No provider credentials are stored or external payroll calls made. A future
adapter must snapshot the mapping used in its immutable delivery record and
pass its own sandbox acceptance; this story does not claim Xero delivery.
Temporary browser servers stopped, fixtures were cleaned up and free disk
stayed above 30 GiB. Main development and production databases were untouched.

### BB-PAY-002 — Generic CSV export (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| PAY-002.1 Columns and date/time formats documented | README specifies all 22 columns, UTF-8 BOM, quoted CRLF CSV, venue-local work dates, UTC clock timestamps, exact decimal seconds and half-up hours rounded to six places. Stable employee UUIDs are explicit; display names are not payroll mappings. | Node tests checked exact headers, timestamp/date values, escaping and decimal rounding, including large and sub-second values. Production Chromium downloaded the actual attachment and verified its headers, identifiers, times and hours. Both passed. | Pass |
| PAY-002.2 Only approved records included | Batch creation and each download recheck full-venue authority, current finalisation, complete canonical snapshots, timezone and unresolved exceptions. The authenticated route validates every paginated record and rechecks the batch before responding with private/no-store headers. | 64-assertion export pgTAP suite passed unfinished/reopened/stale-period, pending-exception, employee, FOH, cross-tenant and direct-table denials. Authenticated integration passed finalisation/reopening, revocation, timezone, claim submission/review and employee-name races. Production Chromium verified owner download, FOH/outsider refusals, reopened batch refusal and late-request refusal. | Pass |
| PAY-002.3 Formula injection mitigated | Every cell is quoted and embedded quotes doubled. Formula-like prefixes, including whitespace/control/bidi-prefixed formulas, receive an apostrophe. | Node tests verified dangerous prefixes, quoted names and line breaks. Production Chromium verified the formula-like employee name in the downloaded CSV is neutralised. Passed. | Pass |
| PAY-002.4 Export logged | Preparing the file creates an immutable attributed batch and per-session records linked to its finalisation/version. Scoped history retains entries after reopening; preparing a batch is not represented as proof of browser download or external import. | pgTAP passed append-only and access checks. Integration verified repeated/competing preparation returns one batch. Production Chromium verified the prepared batch, actual download and persistent audit detail after reopening. Passed. | Pass |

### BB-TIME-006 — Timesheet export traceability (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| TIME-006.1 Each entry links to batch and version | Immutable export entries reference a batch, finalisation and session, retaining the validated canonical record, approval ID/revision and payroll version. CSV and manager history expose these links. | pgTAP verified the stored snapshot and IDs. Node tests rejected incomplete, duplicate, malformed and incorrectly scoped rows. Production Chromium verified downloaded IDs/version and historical per-session detail. Passed. | Pass |
| TIME-006.2 Amended entries trigger explicit reconciliation | Payroll-fact changes against the last exported/reconciled baseline block preparation/download. An authorised manager reviews before/after records, submits the exact review hash, a reason and explicit confirmation of any adjustment outside Butterbox. Reconciliation appends immutable records; it never silently rewrites source time or emits an adjustment payment. | pgTAP passed missing confirmation/reason, stale hash, idempotency, changed time, cross-week movement, history and reason boundary tests (including 500 UTF-16 units). Production Chromium verified changed-hours review, refusal before reconciliation, recorded reason/confirmation, and before/after historical values. Passed. | Pass |
| TIME-006.3 Duplicates prevented | A business/session uniqueness constraint and serialized batch preparation prevent re-export across requests, versions and weeks. Only new sessions enter later batches; reconciliation never automatically resends paid hours. | pgTAP verified repeated requests and cross-week movement cannot create duplicate exports. Authenticated integration passed competing preparations. Production Chromium verified only the new session is downloaded after reconciliation and the original session remains in its first batch. Passed. | Pass |

Files: `supabase/migrations/20261102200000_generic_payroll_exports.sql`,
`supabase/tests/database/generic_payroll_exports.test.sql`,
`src/lib/generic-payroll-exports.ts`,
`src/app/timesheets/payroll-export/route.ts`, `src/app/timesheets/page.tsx`,
`src/app/actions.ts`, `src/app/attendance/page.tsx`,
`src/components/offline-attendance.tsx`, `src/lib/offline-attendance.ts`,
`tests/generic-payroll-exports.test.mjs`,
`tests/payroll-period-finalisation.integration.test.mjs`,
`tests/e2e/auth.spec.mjs`, `README.md` and the backlog/progress files.

Final verification: clean replay of all 43 migrations on the explicitly
verified disposable `butterbox-acceptance` project (API 55421, DB 55422);
**2,043/2,043** database assertions across 43 files (64 export assertions);
**18/18** authenticated integrations; **128** Node tests (18 integrations
skipped only in that invocation and run separately); full ESLint, TypeScript,
split production compile/generate and **49/49** production-browser scenarios.
Temporary browser servers stopped and disposable users/businesses were removed.
Disk remained above 31 GiB. Main development/production databases were not
modified by this work.

Defects fixed during verification: CSV rounding test expectation independently
checked against decimal arithmetic; browser scenario restored to top-level
registration; details-state test respects navigation preserving the open state;
claim/export lock ordering corrected and tested against timezone updates;
immutable captured employee names validated after insertion so a concurrent
profile edit cannot create an undownloadable committed batch; SQL reason
validation aligned with the UI's UTF-16 length limit. No legitimate assertions
were removed. Generic CSV cannot prevent someone manually importing a downloaded
file twice into an external system; the UI and README warn about that limitation.

### BB-TIME-005 — Finalise payroll period (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| TIME-005.1 Only authorised roles can finalise | `finalise_payroll_period` and `reopen_payroll_period` validate the venue week, lock the caller's membership and require an owner, admin or general manager who can view the venue and manages every department in it. An exclusive per-period advisory lock and idempotent request IDs serialize decisions. The event and entry tables are append-only, readable only under RLS, and have no direct grants for writes. | 57-assertion pgTAP suite passed anonymous, employee, cross-tenant, department-manager and other-venue GM refusals, invalid input, non-Monday and not-yet-ended weeks, idempotent and conflicting retries, double finalisation and immutability. The authenticated integration passed FOH/employee/outsider HTTP refusals and 8 competing owner/GM finalisations with exactly one winner. Production Chromium verified the FOH manager's read-only panel (no buttons, mobile width), FOH API refusal and the outside owner's unavailable page. | Pass |
| TIME-005.2 Outstanding exceptions are surfaced | `list_payroll_period_exceptions` reports pending, returned, resubmitted and outdated approvals, incomplete attendance, unreviewed location exceptions, and offline claims or employee time requests awaiting review. Department managers see only their departments. Finalising recomputes the list under the period lock and refuses while any remain. The **Payroll period** panel lists them and disables finalising. | pgTAP verified each exception code (including a geofence `review` check), resolution by approval, clock-out, location review and claim rejection, and that a request submitted after finalisation is surfaced. The integration verified that a finalisation waiting behind an in-flight unlock sees the outdated approval and is refused. Production Chromium verified three listed exceptions, the disabled button and the server error when the disabled control was forced. | Pass |
| TIME-005.3 Reopening requires a reason and logs an event | Reopening requires a trimmed reason of 1–500 characters and a currently finalised period, and appends an attributed `reopened` event. Earlier snapshots are retained. While finalised, BEFORE INSERT guards on attendance events, breaks, corrections, edit-lock events, location checks and reviews, and timesheet decisions refuse changes to any session or target time in the week, including privileged writes. Writers take shared period locks so they serialize with finalisation. | pgTAP verified the reason requirement, trimming, idempotency, the not-finalised refusal, history order, preserved snapshots, unlock after reopen and refusal of corrections that move time into a finalised week. The integration verified that an unlock waiting on a committed finalisation is refused, a rolled-back finalisation does not block it, and six idempotent reopen retries return one event. Production Chromium verified a stale **Work time** unlock refused with the payroll message, the missing-reason error, reopening with a reason, and history showing both events to the owner and FOH manager. | Pass |

Files: `supabase/migrations/20261102180000_payroll_period_finalisation.sql`,
`supabase/tests/database/payroll_period_finalisation.test.sql`,
`src/lib/payroll-periods.ts`, `src/app/actions.ts`,
`src/app/timesheets/page.tsx`, `src/app/work-time/page.tsx`,
`src/app/attendance/page.tsx`, `tests/payroll-periods.test.mjs`,
`tests/payroll-period-finalisation.integration.test.mjs`,
`scripts/test-tenant-isolation.mjs`, `tests/e2e/auth.spec.mjs`, `README.md`
and the backlog/progress files. A clean isolated replay of 41 migrations passed
**1,934/1,934** pgTAP assertions across 41 files. **18/18** authenticated
integrations passed, as did 114 Node tests (18 integrations skipped in that
run and run separately), full ESLint, TypeScript and the production build. The
focused browser scenarios passed 4/4 and the complete serialized low-memory
regression passed **48/48**. Disk stayed at 32 GB free. One validation command
mistakenly ran `supabase test db` against the main development stack because a
guard had a wrong container name. pgTAP files run inside `begin`/`rollback`, and
afterwards there were no open transactions and its migration history was
unchanged.

Assumptions:

- A payroll period is a venue-local Monday-to-Sunday week, using the same
  session-week rule as weekly review.
- An empty week can be finalised.
- Requests received after finalisation are recorded and surfaced; applying them
  requires reopening.
- Finalising snapshots worked and paid seconds; it does not export payroll or
  interpret awards.

### BB-TIME-004 — Department approval (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| TIME-004.1 Approval scope is server-enforced | `decide_attendance_timesheet` locks the membership and session, re-checks department scope (FOH/BOH managers only their department; owners/GMs all), the reviewed revision and an idempotent request ID. Employees, other tenants and managers deciding their own attendance are refused (owners excepted). Approval requires complete attendance and locks the session; decisions are immutable and attributed, and the service role has no table access. | 50-assertion pgTAP suite passed anon/employee/cross-tenant/out-of-department denials, validation, stale revisions, retries, self-approval, immutability and cascade. The authenticated integration passed HTTP scope, 8 duplicate retries, 6 competing approvals (exactly one wins), a correction committed while an approval waited, and mid-flight membership revocation. Production Chromium verified out-of-department and cross-tenant API refusals, the self-owned notice without controls, a stale-revision error and the outside owner's unavailable page. | Pass |
| TIME-004.2 Multiple department shifts are attributed correctly | Approvals are per session, attributed to the session's recorded department. `list_weekly_timesheet_approvals` returns only sessions in departments the caller manages, and the page verifies every approval matches a visible session and department. | pgTAP and integration verified a multi-department worker's FOH and BOH sessions are decided only by their own managers. Production Chromium verified the owner's attribution map, FOH and BOH managers each seeing and approving only their department's session, and the decision history recording each department manager as actor. | Pass |
| TIME-004.3 Rejected entries return for correction | Returning requires a reason (max 500 characters) and an unlocked session; it leaves the entry correctable and is shown to the employee under **Timesheet decisions** on Attendance. A later correction marks it **Corrected after return** for re-approval; corrections after approval are blocked until unlocked, and an owner unlock or change marks the approval outdated. | pgTAP verified return, correct, resubmitted, re-approve and outdated-after-unlock. Production Chromium verified the missing-reason server error, return with reason, the employee seeing status and reason at mobile width, owner correction to resubmitted, re-approval with a note, and the correction-after-approval refusal. | Pass |

Files: `supabase/migrations/20261102170000_timesheet_department_approvals.sql`,
`supabase/tests/database/timesheet_department_approvals.test.sql`,
`src/lib/timesheet-approvals.ts`, `src/app/actions.ts`,
`src/app/timesheets/page.tsx`, `src/app/attendance/page.tsx`,
`tests/timesheet-approvals.test.mjs`,
`tests/timesheet-approvals.integration.test.mjs`,
`scripts/test-tenant-isolation.mjs`, `tests/e2e/auth.spec.mjs`, `README.md`
and the backlog/progress files. A clean isolated replay of 40 migrations passed
**1,877/1,877** pgTAP assertions across 40 files; 17/17 authenticated
integrations, 107 Node tests (17 integrations skipped in that run and run
separately), ESLint, TypeScript and the split production build passed. The
first serialized browser regression passed 46/47. The failing scenario, the
pre-existing venue conflict-rules test, was intermittent (it failed 1 of 3
isolated reruns). Its unchanged-save step accepted the "saved" message left by
the previous save, so a late navigation could discard the injected invalid
option. The test now reloads, asserts that no status is shown and that the
values were saved before resubmitting. No assertion was removed. It passed
5/5 focused runs, and the complete regression then passed **47/47**. Disk stayed
at 32 GB free. Assumptions: owners may decide their own attendance; approval
is a department sign-off, not payroll finalisation or award compliance.

### BB-TIME-003 — Employee correction request (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| TIME-003.1 Request records proposed time and reason | A linked employee submits a missed clock-in or clock-out with a venue-local proposed time (microseconds retained; DST gaps/repeats require explicit handling; future and infinite times rejected) and a required reason of at most 500 characters. The immutable request records actor, server receipt time and idempotent request ID, and creates no clock event. | 53-assertion pgTAP suite passed validation, colleague/actor impersonation, cross-tenant and cross-department denials, retries and immutability. The authenticated concurrency test passed retries, decisions and scope changes. Production Chromium passed submission, DST/future errors, microsecond time and the employee's own request history. | Pass |
| TIME-003.2 Manager can approve/reject with explanation | A scoped FOH/BOH manager approves by applying an attributed correction, completing an open session or creating a session from a matching pair, or rejects; every decision requires an explanation, rechecks stale times and edit locks, and is immutable and employee-visible. Employees cannot decide their own requests. | pgTAP verified scoped approval and rejection, stale-time and edit-lock refusal, retries, BOH/FOH and out-of-scope denial and employee visibility. Production Chromium verified approve, mismatched-time error, reject, open-session completion, pair creation and employee-visible explanations. | Pass |
| TIME-003.3 Original records remain unchanged | Approvals append corrections or new events labelled `employee_request`; original events and requests are never updated. Requested times are flagged as unverified in Work time and weekly review. | pgTAP verified unchanged originals, true sources, flagged recalculation and immutable requests/decisions. Production Chromium compared original timestamps before and after decisions and verified the Work time and timesheet flags. | Pass |

Files: `supabase/migrations/20261102160000_employee_correction_requests.sql`,
`supabase/tests/database/employee_correction_requests.test.sql`,
`src/app/attendance/page.tsx`, `src/app/actions.ts`,
`src/components/offline-claim-review.tsx`, `src/lib/offline-attendance.ts`,
`src/lib/weekly-timesheet.ts`, `src/lib/worked-time.ts`,
`tests/employee-correction-requests.integration.test.mjs`, unit tests,
`tests/e2e/auth.spec.mjs`, `scripts/test-tenant-isolation.mjs`, `README.md`
and the backlog/progress files. The clean isolated replay of 39 migrations passed
**1,827/1,827** pgTAP assertions; 16/16 authenticated integrations, 101 Node tests,
ESLint, TypeScript and the split production build passed. The serialized
production-browser regression passed 45/46; the failing clock scenario's
unscoped locator matched the new request section's correct "no linked profile"
message, so it now asserts the message in both regions, and the rebuilt
scenario passed (46/46 overall).

### BB-TIME-002 — Weekly timesheet review (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| TIME-002.1 Employee, venue and period filters work | The manager page and scoped RPCs select a venue, venue-local Monday-to-Sunday week and optional employee. Records remain separated by department; scoped historical workers with records remain selectable. Invalid or inaccessible filters display an error. | 46 focused pgTAP assertions passed, covering tenant, venue, FOH/BOH, employee filters and Sydney's daylight-saving week boundaries. The authenticated HTTP test passed cross-tenant, employee, venue and revoked-membership denials. Production Chromium passed all three filters, invalid input and a 375-pixel historical-worker scenario. | Pass |
| TIME-002.2 Discrepancies are visible | Employee/department cards show published scheduled spans, recorded elapsed totals, missing or invalid sessions, differing counts and exact-duration differences. Incomplete sessions never produce a full-match claim. | Six weekly-helper unit tests passed, including microsecond differences and incomplete results; pgTAP passed actual-break, corrected-clock and invalid-session cases. Production Chromium showed the differing span, missing clock-out and unverified offline source. | Pass |
| TIME-002.3 Bulk actions exclude invalid records | Managers select at most 100 complete, unlocked sessions and give a reason; the database independently excludes invalid/already-locked sessions, rechecks tenant/venue/department/employee/week scope, rejects changed valid sessions and records immutable actor, request, outcome and lock events. Identical retries return the stored receipt. This is an edit lock, not payroll approval; nonfatal location and source warnings remain visible. | 51 focused pgTAP assertions passed invalid/open/newly-invalid cases, mixed selections, bounded and malformed input, scope, stale/atomic rollback, immutable audit, retries and receipt access. Authenticated tests passed simultaneous retries, competing locks/corrections, location reviews, linked workers and membership revocation. Production Chromium verified a stale selection, tampered invalid checkbox excluded on the server, real receipt/history and a mobile scoped manager. | Pass |
| TIME-002.4 Source events can be inspected | Scoped source-event RPC and page show original and effective timestamps, event type, break classification and offline/manager-reported provenance, with a link to correction and edit-lock history. Source rows and worked-time rows carry the same immutable-event revision; mismatched snapshots fail closed. | pgTAP verified original/corrected microseconds, break classification, offline provenance, matching revisions and tenant/department isolation. Unit tests rejected differing revisions or lock states. Authenticated HTTP and production Chromium verified source visibility and role restrictions, including mobile. | Pass |

Files: `supabase/migrations/20261102140000_weekly_timesheet_review.sql`,
`supabase/migrations/20261102150000_weekly_timesheet_bulk_locks.sql`,
`supabase/tests/database/weekly_timesheet_review.test.sql`,
`supabase/tests/database/weekly_timesheet_bulk_locks.test.sql`,
`src/app/timesheets/page.tsx`, `src/app/actions.ts`, `src/lib/weekly-timesheet.ts`,
`src/components/main-navigation.tsx`, `tests/weekly-timesheet.test.mjs`,
`tests/weekly-timesheet.integration.test.mjs`,
`tests/weekly-timesheet-bulk-locks.integration.test.mjs`, `tests/e2e/auth.spec.mjs`,
`scripts/test-tenant-isolation.mjs`, `README.md` and the backlog/progress files.
The final isolated migration replay passed 1,774 pgTAP assertions in 38 files;
15 authenticated integrations, 97 Node tests, full ESLint, TypeScript, split
production build and the rebuilt weekly browser scenario passed. Earlier
read-only acceptance included two focused browser scenarios. An initial
bulk-lock integration fixture attempted to duplicate an automatically-created
location check and omitted a bulk-insert default; the fixture was corrected
and both focused and full integration runs passed. Period attribution
uses the venue's current timezone and the corrected clock-in, then clock-out or
session creation time. Overnight records remain in their starting week. Planned
span is before unclassified scheduled breaks and is compared with elapsed,
not paid, time; neither matching totals nor edit locks constitute approval.

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

### BB-ATTEND-005 — Time capture fallback (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ATTEND-005.1 Pending or exception status | Location failures produce a recorded server event and visible review status. An already-open or prepared-and-reloaded offline page shows queued claims; submitted claims are unverified and awaiting review. Missing offline assets, storage failures and upload failures are explicit, including distinguishing a saved claim from a failed status refresh. | BB-ATTEND-003 location and no-JavaScript checks passed. Production Chromium verified offline reload, queued claims, missing assets, quota and IndexedDB failures, failed upload, reconnect, and pending/review labels; the final offline shell was checked at 375 pixels without horizontal overflow. | Pass |
| ATTEND-005.2 Safe reconciliation | Only four public shell assets are cached without credentials. A passphrase-encrypted, session-bound scope controls reopening; already-open and reopened fallbacks hide on account changes. Claims upload only for the verified original account and permitted scope. Scoped managers can match/correct events, reject claims, create an unverified session, or complete an open session with an explicitly confirmed break end. Decisions and reopenings are attributed. | The 48 claim, 44 review, 47 pair, 40 mixed-session and 63 break-resolution pgTAP assertions passed, including overlap, locks, immutability and rollback. Fifteen authenticated integrations passed, including concurrent claim, review and permission changes. Production Chromium verified offline reload/reconnect, exact credential-free cache contents, wrong passphrase/venue, tampered selection, preparation and account-change race, cross-tenant isolation, logout and manager reconciliation. | Pass |
| ATTEND-005.3 Claimed and confirmed times | The immutable claim retains the untrusted device time and a separate server-generated receipt time. The latter confirms receipt, not that the claimed attendance was true. | pgTAP verified original time, server time and immutable records. Production Chromium captured offline claims, compared each received row with device storage, and checked both timestamps in employee and scoped manager views. | Pass |

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
`supabase/migrations/20261102130000_offline_claim_break_resolution.sql`,
`supabase/tests/database/offline_claim_break_resolution.test.sql`,
`src/lib/worked-time.ts`, `tests/worked-time.test.mjs`,
`tests/e2e/auth.spec.mjs`, `scripts/test-tenant-isolation.mjs` and `README.md`.
The reopening slice also changes `public/attendance-offline-sw.js`,
`public/offline-attendance.html`, `public/offline-attendance.css`,
`public/offline-attendance-app.mjs`, `public/offline-attendance-shared.mjs`,
`public/offline-attendance-shared.d.mts`, `src/components/offline-reopen-setup.tsx`,
`src/components/session-sync.tsx`, `src/components/invitation-session.tsx`,
`src/lib/session-notifications.ts` and `tests/offline-reopening.test.mjs`.
After a clean migration replay, an initial default pgTAP invocation failed
because the disposable workdir contained outdated test copies, including a
test predating the default-off demo policy. The current repository suite passed;
the disposable copies were then synchronized and the standard command also
passed all 1,400 assertions. No tests were removed or weakened.
The final reopening slice passed 101 Node tests, 15 separately configured
authenticated integrations, full lint, TypeScript, split production build and
the focused production-browser scenarios described above. The browser-session
check is not offline authentication: revocation cannot be observed while
disconnected. The encrypted preparation is tab-scoped and may disappear when
the tab closes; pending device claims themselves are not encrypted.

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

### BB-ORG-005 — Multiple venues (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ORG-005.1 Venue selector scopes views | Roster and people views select only permitted venues; requests are checked server-side. | Scoped permission pgTAP and authenticated browser role/venue scenarios passed in the full 953-assertion and 29-scenario regressions. | Pass |
| ORG-005.2 Detect shared-staff cross-venue overlap | Owners explicitly confirm profile links; generic overlap results contain only manageable shift IDs. Automatic assignment and configured publication blocking use the same linked-worker identity. | 44 shared-profile and 26 conflict pgTAP assertions, authenticated link/assignment/publication races, and the shared-worker and 1,001-shift browser scenarios passed. | Pass |
| ORG-005.3 Timesheets retain actual venue attribution | Attendance, weekly review, approvals, venue-specific finalisations, canonical records and export ledger retain the actual venue, timezone, department and employment profile rather than a linked home profile. | Extended weekly HTTP integration finalises and exports Sydney (28,800 paid seconds) and Perth (7,200) separately, checks exact session sets and denies wrong-venue batch access. Production Chromium switches to Perth, approves/finalises and downloads a real CSV containing the actual venue/department/profile/session and excluding primary-venue records. All 18 integrations, 50 browser scenarios and 2,072 pgTAP assertions passed. | Pass |

Files changed for final acceptance: `tests/weekly-timesheet.integration.test.mjs`,
`tests/e2e/auth.spec.mjs`, `BACKLOG_INDEX.csv`, `IMPLEMENTATION_PROGRESS.md`.
No schema or application changes were needed. The first focused browser run
tried to click a download inside collapsed export history and timed out;
opening the disclosure as a user would fixed the test without weakening any
assertion. Rebuilt focused and full regressions passed. Final evidence in the
session files: `multivenue-final-{pgtap,integrations,unit,eslint,typescript,browser}.log`.

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

### BB-ROSTER-008 — Publish and notify (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| ROSTER-008.1 Draft changes stay private until publication | RLS restricts drafts to authorized managers and the personal schedule reads only published assignments. | Existing two-tenant/scoped SQL and production-browser schedule tests passed in the 708-assertion and 25-scenario regressions. | Pass |
| ROSTER-008.2 Published version is recorded | Each successful publication atomically creates a per-department/week version and complete shift snapshot, with actor and venue-local context. Managers see their scoped history; no-op and blocked publications create no version. Pre-existing publications are not retroactively fabricated. | 47 focused pgTAP assertions pass for snapshots, immutability, permissions, no-op and blocked cases; simultaneous publication integration produces ordered complete snapshots; production Chromium verifies history and two versions. | Pass |
| ROSTER-008.3 Impacted employees are notified once | Each new publication creates one in-app update per affected account, deduplicating multiple shifts and profiles. Unlinked profiles retain a pending update. Managers see inaccessible-profile counts, with a link to People to send a staff invitation (BB-FOUND-005). In-app delivery is the notification channel; email/push is BB-COMMS-003. | 77 isolated SQL assertions cover deduplication, later linking by owner or invitation acceptance, revoked access, tenant/role scope, no-op/blocked publication and read state. Concurrent publication and duplicate reads pass. Production Chromium verifies mobile notices, read state, pending linking and own-schedule deep links. A new Chromium scenario publishes to an uninvited worker, follows the warning link to invite them, accepts the emailed invitation on mobile and sees exactly one unread update that opens the schedule; the warning then clears. | Pass |
| ROSTER-008.4 Unresolved blockers prevent publishing | Configured venue availability, local/cross-venue overlap and duration blockers atomically reject publication; concurrent roster changes return a retry. | 53 policy and 26 shared-worker SQL assertions, authenticated ordered races and production-browser resolution of local and cross-venue blockers passed. | Pass |

Files for the version slice: `supabase/migrations/20261101210000_roster_publication_versions.sql`,
`supabase/tests/database/roster_publication_versions.test.sql`,
`tests/auto-assignment-concurrency.integration.test.mjs`,
`src/app/roster/page.tsx`, `tests/e2e/auth.spec.mjs` and `README.md`.
Migration applied only to the isolated test project.

Completion files: `supabase/tests/database/roster_publication_notifications.test.sql`,
`src/app/roster/page.tsx`, `tests/e2e/auth.spec.mjs` and `README.md` (no migration).

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

### BB-COMMS-002 — In-app notification centre (Done)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| COMMS-002.1 Shift changes, offers and approvals show unread/read state | Existing roster-publication notifications remain intact. New recipient-scoped notifications are created for each shift offer and each manager-recorded claim outcome (confirmed, unavailable, not selected or closed); reads are account-scoped. | Isolated `open_shift_offers` pgTAP passed **78/78** on both the acceptance database and a clean migration replay. `roster_publication_notifications` passed **77/77** on the acceptance database. Production Chromium verified the offer and approved-claim unread states. | Pass |
| COMMS-002.2 Deep links open the correct authorised item | Roster notices open the employee's venue-local schedule; offer/outcome notices open the offer section for the employee's venue-local week. Both read RPCs re-check the linked employee and venue scope. | Two targeted production Chromium scenarios passed: offer/approval notification links on mobile and the existing publication-notification flow. pgTAP verified uninvited and cross-tenant list/read denial. | Pass |
| COMMS-002.3 Repeated events deduplicate | Unique offer/employee/event keys and `ON CONFLICT DO NOTHING` prevent duplicate offer or outcome notices; read records are unique per notification/account. | pgTAP replays an offer event and confirms the recipient event count remains unchanged; the full 78-assertion offer suite passed. Publication deduplication remains covered by its existing SQL suite. | Pass |

Targeted files changed for this checkpoint: `supabase/migrations/20261103040000_shift_offer_notifications.sql`,
`supabase/tests/database/open_shift_offers.test.sql`, `src/app/actions.ts`,
`src/app/notifications/page.tsx`, `src/components/roster-notification-banner.tsx`,
`src/lib/roster-notifications.ts`, `tests/e2e/auth.spec.mjs` and `README.md`,
plus backlog/status tracking. Validation: `open_shift_offers` 78/78 on the
acceptance and clean-replay databases; `roster_publication_notifications` 77/77
on the acceptance database; two targeted production-browser scenarios and
`tests/roster-notifications.test.mjs` 2/2 passed; `npx tsc --noEmit`,
changed-file ESLint, production build and `git diff --check` passed. The
clean-replay roster notification test was not compatible with that
test container's older `auth.users` fixture (`email_confirmed_at` is absent);
the same suite passed on the established acceptance database. Full Node,
integration, pgTAP and browser suites were deferred.

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

### BB-FOUND-008 — Resilience and operations (Blocked; verified partial checkpoint)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| FOUND-008.1 Health and error metrics exist | Existing uncached liveness remains compatible. New `/api/ready` performs a data-free, security-invoker database RPC through PostgREST with a three-second timeout and generic 503 on failure. `/api/metrics` requires a server-only operator bearer token and exports process-scoped health/error counters. Next's request-error instrumentation emits fixed-field events without error messages, request URLs, headers or tenant identifiers. Proxy bypass applies only to these operational routes; metrics authorises independently of customer sessions. | Seven new Node tests passed token/configuration checks, error-hook attribution, immutable metric snapshots, redaction, dependency failures, response shapes and an actual hanging local HTTP server aborted at the deadline (2.5–6 second scheduling tolerance). Five pgTAP assertions verified anonymous/authenticated readiness, no elevated privileges or table access. Production Chromium verified healthy readiness, controlled anon RPC revocation yielding generic 503 while liveness stayed healthy, permission restoration/recovery, failure-counter increments and wrong/missing operator-token 401 responses. | Pass |
| FOUND-008.2 Restore procedure rehearsed in staging | README documents an explicit target-ID gate, synthetic two-tenant fixture checks, immutable attendance/payroll/export checks and measured RPO/RTO evidence. Local clean migration replay is deliberately not treated as backup restoration or hosted staging acceptance. | No authorised isolated hosted staging project, restore permission or backup destination is identified. No staging/production restore was attempted. Provision these securely, approve the target and proposed policy, then execute the README rehearsal and record real timestamps/checksums/results. | Blocked |
| FOUND-008.3 Retryable actions are idempotent | Existing scoped request-ID/revision and immutable ledger mechanisms remain unchanged; monitoring probes are read-only apart from process-local diagnostic counters. Metrics retrieval has no business-data side effects. | All 19 authenticated tenant/concurrency integration suites passed on the final schema, covering duplicate clock/break requests, corrections, claims, approvals, finalisation/export/mapping and invitation/business scopes. Readiness failure/recovery leaves source business records untouched. | Pass |
| FOUND-008.4 Backup retention documented | README distinguishes a proposed 35-day encrypted daily recovery window from statutory/live record retention, documents 24-hour RPO/four-hour RTO targets as unverified, identifies hosted-plan retention gaps and separate Storage/configuration recovery. It requires owner approval and operator provisioning before pilot use. | Documentation reviewed against official Supabase backup guidance: hosted daily retention is plan-dependent, Storage object contents are excluded and custom-role passwords may require re-provisioning. No actual hosted retention configuration or expired-backup deletion was verified. | Pass (documentation only) |

Files: `.env.example`, `.github/workflows/ci.yml`, `README.md`,
`src/lib/operations.ts`, `src/instrumentation.ts`,
`src/app/api/health/route.ts`, `src/app/api/ready/route.ts`,
`src/app/api/metrics/route.ts`, `src/proxy.ts`,
`supabase/migrations/20261103020000_application_readiness.sql`,
`supabase/tests/database/application_readiness.test.sql`,
`tests/operations.test.mjs`, `scripts/test-auth.mjs`,
`tests/e2e/auth.spec.mjs` and tracking files.
CI/database documentation now explicitly select `supabase/tests/database`,
not the pre-migration legacy rehearsal scripts. The browser runner generates
an ephemeral operator token separately from customer credentials.
Final validation: 47-migration clean replay, **2,121 assertions / 46 files**,
**19/19 integrations**, **146 Node tests**, full lint, TypeScript,
split production compile/generate and **57/57 browser scenarios** passed.
Counters are per-process and reset on restart; no durable multi-replica
collector, hosted alert delivery, backup provisioning or staging restore is
claimed. No volumes, databases, worktrees or build caches were deleted for
space; free disk remained above 29 GiB.

### BB-PAY-004 — Xero Payroll adapter (Blocked)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| PAY-004.1 Current AU endpoints/scopes confirmed | The official Xero OpenAPI source lists Payroll AU v2, `/Timesheets`, POST `payroll.timesheets` and the GET timesheet scopes. Complete OAuth consent/refresh requirements still need verification against the intended test organisation. | Retrieved the official YAML, not just generated search prose. No configured OAuth client or explicitly isolated AU payroll organisation is available, so no live API verification is claimed. | Blocked |
| PAY-004.2 OAuth refresh and permission failure handled | No authenticated adapter or token storage/refresh workflow is implemented; generic mapping destinations deliberately do not connect providers. | No runtime acceptance executed. Secure OAuth client configuration and authorised test-organisation access are missing. | Blocked |
| PAY-004.3 Sandbox end-to-end validates mapping, retries and duplicate prevention | Existing canonical records and explicit mapping gate are verified prerequisites, not proof of provider delivery. Future delivery must persist the exact mapping used in an immutable delivery record. | No Xero sandbox export executed. Do not send live payroll or assume the ordinary demo company supports AU payroll testing. | Blocked |

Official contract consulted:
https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/master/xero-payroll-au-v2.yaml
(reported version 19.1.0; server `https://api.xero.com/payroll.xro/2.0`).
Configuration presence checks only found no `XERO_` keys in runtime,
repository environment files or Codespace shared secrets. No values were
printed. Resume after an owner securely provisions OAuth access and identifies
an explicitly isolated AU payroll organisation authorised for testing.
Continue BB-FOUND-006 independently while this access is missing.

### BB-FOUND-001 — Create production-ready application (Blocked)

| Criterion | Implementation evidence | Test and actual result | Status |
| --- | --- | --- | --- |
| 001.1 Clean checkout installs and builds with documented commands | `README.md`, lockfile and `Dockerfile`. | A separate clean checkout successfully ran `npm ci`, `npm test` and `npm run build`; the container also installed and built from scratch. | Pass |
| 001.2 Environment variables have safe examples | `.env.example`, `.gitignore`, `.dockerignore` and `README.md`. | Example values are empty; a redacted Gitleaks scan of the clean checkout found no leaks. | Pass |
| 001.3 A deployment runs a health check | `src/app/api/health/route.ts`, `src/proxy.ts`, `Dockerfile` and `.github/workflows/ci.yml`. | A built container became healthy as UID 1000; `GET` returned 200 and `no-store`, `POST` returned 405, and the home page returned 200. | Pass |
| 001.4 No secrets are committed | `.gitignore` excludes local environment and Supabase CLI state. | Gitleaks found no leaks on the current branch or in the clean checkout. A network-disabled scan of accessible local refs found four historical candidates in a checkpoint outside the current branch, including two with privileged characteristics. Validity, current use and other copies remain unverified; private owner review is required. | Blocked |

Credential owners must assess the candidates and separately authorize any
rotation and history handling. This session did not use candidate credentials,
rewrite or delete refs, or print secret values. GitHub CI has been configured
but has not yet run remotely.

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

- `/api/health` is liveness only; `/api/ready` checks a live data-free RPC,
  and `/api/metrics` exposes protected process-scoped counters. These do not
  establish every migration, Auth-service/email availability, external payroll
  delivery, durable alerting or backup recoverability.
- Build separate images per environment: Next.js embeds `NEXT_PUBLIC_` values
  at build time. Never use a secret/service-role key in those values.
- Stories are marked Done only after every acceptance criterion is verified.
- The repository instructions checkpoint `08fac01` was pushed to the requested
  feature branch. This conflict-policy checkpoint builds on it; inspect Git
  status and the remote SHA during recovery rather than relying on older notes.
- Provider payroll delivery and email/push
  notification remain incomplete. The historical credential
  findings still require owner assessment and any approved rotation/history
  handling.
- Attendance edit locks are not timesheet approvals. Payroll period
  finalisation (BB-TIME-005) is the gate for export, and exports should read the
  immutable `payroll_period_entries` snapshot rather than live attendance.
  Original and correction timestamps retain microseconds, while displayed
  durations round only for presentation.

## Testing policy (owner-directed, 2026-11-02)

- Default verification is now targeted and change-focused (see `AGENTS.md`).
  Full pgTAP, integration, browser, Node and build runs are reserved for
  risk-based triggers such as shared authorisation, migration compatibility,
  payroll foundations, workstream merges and release signoff.
- Each story records the tests selected and why, actual results, tests
  deferred, remaining risks and any later broader regression needed.
- Last full regression baseline: `b4bfd02`, with 2,121/2,121 pgTAP
  assertions, 19/19 integrations, 146 Node tests and 57/57 browser scenarios.

## Next story

- Await private owner/security review before resuming the **BB-FOUND-001**
  credential assessment. Do not use a candidate credential for access, rotate
  it or alter history without the required separate authorization.
- Keep **BB-SAAS-003 — Tenant onboarding and support** Blocked until separate
  demo infrastructure, safe outbound controls, a production historical-data
  assessment and clean conversion are actually verified; do not alter live
  records or bypass the fail-closed safeguard.
- Next inspect the directed prospective venue-week portion of
  **BB-ORG-006** under DEC-002, followed by
  **BB-ATTEND-004 — Rotating QR kiosk**. Keep ORG-006 Blocked until its
  complete criteria and external-channel dependencies are verified. Preserve
  existing immutable periods and do not silently reinterpret history.
- Resume hosted **BB-FOUND-008** validation only after the owner identifies and authorises an
  isolated hosted staging project and securely provisions backup/restore
  access. Rehearse the DEC-005 recovery targets using the README procedure and
  record actual results. Do not run destructive tests
  against shared development or production and do not claim local replay as
  a successful staging restore.
  **BB-PAY-004 — Xero Payroll adapter** is Blocked pending secure OAuth
  client/test-organisation access. Generic CSV and mapping destinations do
  not enable provider delivery.
  Cross-business invitations and per-request switching are complete.
- The latest payroll migrations have been tested only on the isolated stack. The
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
