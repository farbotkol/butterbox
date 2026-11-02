# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:00 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SHIFTS-004 — Request shift swap`
- **Phase:** Debugging
- **Current activity:** Rerunning the focused serialized production-browser scenario after correcting its fixture.
- **Progress since previous report:** The split production compile, TypeScript check and generate succeeded. The first browser attempt stopped in fixture setup because two bulk-inserted shifts omitted the non-null `requires_acknowledgement` field. The fixture now supplies `false` explicitly; that correction has not yet been rerun. BB-SHIFTS-004 criteria are both employee confirmations, eligibility/conflict recheck on approval, manager rejection with reason, and notifications.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** On the migrated isolated project, pgTAP passed **345/345 assertions** across swap (58), acknowledgement (59), publication versions (47), publication notifications (77), open offers (78) and shared-worker conflicts (26). The authenticated race integration passed **1/1**, including cross-tenant/BOH denial, two concurrent approvals, new acknowledgement and linked-venue conflicts. Four targeted Node files passed **14/14**; changed-file ESLint, TypeScript and split production build passed. The focused browser run failed in setup before exercising the UI; the fixture correction awaits rerun.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** The new UI and notification links have not yet been exercised in a browser; the new browser scenario and production build are next. The database and integration results do not by themselves establish end-to-end acceptance. Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003.
- **Failing tests:** The focused browser test failed in fixture setup due to the missing non-null field; the corrected fixture has not yet been rerun. The earlier uncorrected database run failed as recorded in `IMPLEMENTATION_PROGRESS.md`.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Reuse the already-built production app for the corrected isolated browser scenario, fix any failures, then verify every criterion and record the results.
- **Latest development commit:** `9ec5e6f033e8e95e1d17624beb7c7f5d38321604`
- **Push outcome:** Documentation checkpoint `88c7f471df1e26161a9845fd5baedeba3cb64fef` was pushed and its remote SHA matched. The migration, interfaces and tests are uncommitted and have not been pushed.
- **Backlog:** 109 total; 44 Done, 1 In Progress, 4 Blocked, 60 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
