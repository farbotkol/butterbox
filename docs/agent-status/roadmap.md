# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 08:53 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SHIFTS-004 — Request shift swap`
- **Phase:** Coding
- **Current activity:** Preparing isolated integration, concurrency and production-browser verification of the new swap interfaces.
- **Progress since previous report:** Implemented uncommitted employee request, reciprocal proposal and confirmation screens; scoped manager approval and rejection with a reason; and notification-centre read/deep-link handling. Added a scoped response-profile RPC so a multi-profile employee can only propose shifts belonging to the intended profile. The committed swap migration remains unchanged. BB-SHIFTS-004 criteria are both employee confirmations, eligibility/conflict recheck on approval, manager rejection with reason, and notifications.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Expanded `shift_swaps.test.sql` passed **58/58 assertions** with the correction and response-profile RPC temporarily applied inside a rolled-back transaction on the identified disposable `butterbox-acceptance` database (API 55421, DB 55422). The earlier run without the fix had 23 passes and 10 failures before aborting. Four targeted Node files passed **14/14 tests**; changed-file ESLint and TypeScript passed. The new migration has not yet been permanently applied to the test project.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** The new UI, notification links and cross-workflow concurrency have not yet been exercised in a browser or authenticated integration; neighbouring acknowledgement and publication regressions remain. The 58-assertion database result is not end-to-end acceptance. Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003.
- **Failing tests:** None in the corrected, rolled-back swap pgTAP run. The earlier uncorrected run failed as recorded in `IMPLEMENTATION_PROGRESS.md`.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Apply the new migration only to the verified disposable acceptance project, run targeted publication/notification regressions, and implement authenticated race and mobile-browser tests.
- **Latest development commit:** `9ec5e6f033e8e95e1d17624beb7c7f5d38321604`
- **Push outcome:** Documentation checkpoint `c46bb241c3e0f315f71baf705ac101dde8344a8d` was pushed and its remote SHA matched. The new migration, interfaces and tests are uncommitted and have not been pushed.
- **Backlog:** 109 total; 44 Done, 1 In Progress, 4 Blocked, 60 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
