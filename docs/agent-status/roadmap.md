# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 08:59 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SHIFTS-004 — Request shift swap`
- **Phase:** Testing
- **Current activity:** Preparing the serialized production-browser test and build for employee consent, scoped review, rejection, notifications and mobile accessibility.
- **Progress since previous report:** Applied the new forward-only migration through the CLI only to the verified disposable `butterbox-acceptance` project (API 55421, DB 55422); the committed swap migration remains unchanged. Added an authenticated two-manager approval race and linked-worker scheduling races in both directions. Added an unrun browser scenario covering the full swap workflow. BB-SHIFTS-004 criteria are both employee confirmations, eligibility/conflict recheck on approval, manager rejection with reason, and notifications.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** On the migrated isolated project, pgTAP passed **345/345 assertions** across swap (58), acknowledgement (59), publication versions (47), publication notifications (77), open offers (78) and shared-worker conflicts (26). The authenticated race integration passed **1/1**, including cross-tenant/BOH denial, two concurrent approvals, new acknowledgement and linked-venue conflicts. Four targeted Node files passed **14/14**; changed-file ESLint and TypeScript passed. The earlier uncorrected swap run failed as recorded in `IMPLEMENTATION_PROGRESS.md`.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** The new UI and notification links have not yet been exercised in a browser; the new browser scenario and production build are next. The database and integration results do not by themselves establish end-to-end acceptance. Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003.
- **Failing tests:** None in the corrected, rolled-back swap pgTAP run. The earlier uncorrected run failed as recorded in `IMPLEMENTATION_PROGRESS.md`.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Run the isolated low-memory production build and focused browser scenario, fix failures, then verify every criterion and record the results.
- **Latest development commit:** `9ec5e6f033e8e95e1d17624beb7c7f5d38321604`
- **Push outcome:** Documentation checkpoint `3662cfec9f135b3613ad9c3cffd13d06ffffba3d` was pushed and its remote SHA matched. The migration, interfaces and tests are uncommitted and have not been pushed.
- **Backlog:** 109 total; 44 Done, 1 In Progress, 4 Blocked, 60 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
