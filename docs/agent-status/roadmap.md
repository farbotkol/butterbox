# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:02 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SHIFTS-004 — Request shift swap`
- **Phase:** Testing
- **Current activity:** Running targeted neighbouring browser regressions and reviewing the criterion evidence before story completion.
- **Progress since previous report:** The focused production-browser scenario now passes after correcting the test fixture and scoping an alert locator to the main landmark. It exercised mobile WCAG checks, two employee confirmations, scoped manager review, availability recheck, required rejection reason, notification read/deep links, reassignment, acknowledgement and tenant/department denial. BB-SHIFTS-004 criteria are both employee confirmations, eligibility/conflict recheck on approval, manager rejection with reason, and notifications.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** On the migrated isolated project, pgTAP passed **345/345 assertions** across swap (58), acknowledgement (59), publication versions (47), publication notifications (77), open offers (78) and shared-worker conflicts (26). The authenticated race integration passed **1/1**, including cross-tenant/BOH denial, two concurrent approvals, new acknowledgement and linked-venue conflicts. Four targeted Node files passed **14/14**; changed-file ESLint, TypeScript and split production build passed. The corrected focused production-browser scenario passed **1/1**.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Neighbouring roster, offer, notification and accessibility browser regressions remain to be run. Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003.
- **Failing tests:** None in the latest focused runs. Earlier browser attempts exposed a missing fixture field and an ambiguous alert locator; both were corrected without removing assertions.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Reuse the built production app for affected neighbouring browser scenarios, then verify and record every criterion and commit the feature.
- **Latest development commit:** `9ec5e6f033e8e95e1d17624beb7c7f5d38321604`
- **Push outcome:** Documentation checkpoint `2f5f5fc33e589c37f98539ff0a3a44c22ab11e4e` was pushed and its remote SHA matched. The migration, interfaces and tests are uncommitted and have not been pushed.
- **Backlog:** 109 total; 44 Done, 1 In Progress, 4 Blocked, 60 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
