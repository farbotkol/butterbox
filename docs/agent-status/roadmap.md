# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 08:47 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-SHIFTS-004 — Request shift swap`
- **Phase:** Coding
- **Current activity:** Building employee and manager swap interfaces, notification integration and concurrency coverage after repairing the approval lock order.
- **Progress since previous report:** A new, uncommitted forward-only migration corrects the recovered approval lock calls and aligns them with existing shared-worker and scheduling locks. The committed swap migration is unchanged. BB-SHIFTS-004 criteria are both employee confirmations, eligibility/conflict recheck on approval, manager rejection with reason, and notifications.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** `shift_swaps.test.sql` passed **53/53 assertions** with the new function temporarily applied inside a rolled-back transaction on the identified disposable `butterbox-acceptance` database (API 55421, DB 55422). The earlier run without the fix had 23 passes and 10 failures before aborting. The new migration has not yet been permanently applied to the test project. The existing suite was selected to exercise consent, permissions, eligibility, reassignment, publication, acknowledgement and notifications.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** No swap UI or cross-workflow concurrency test is complete yet; acknowledgement and publication workflows still require neighbouring targeted regression. The 53-assertion database result is not end-to-end acceptance. Existing open-shift offers do not receive retroactive notices. Email/push delivery remains BB-COMMS-003.
- **Failing tests:** None in the corrected, rolled-back swap pgTAP run. The earlier uncorrected run failed as recorded in `IMPLEMENTATION_PROGRESS.md`.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Build participant, manager and notification interfaces; add concurrency, cross-tenant and browser verification; apply the correction safely to the disposable test project.
- **Latest development commit:** `9ec5e6f033e8e95e1d17624beb7c7f5d38321604`
- **Push outcome:** Recovery documentation checkpoint `f6a127d07ebfc1691e9d753be85e54966f9ce13a` was pushed and its remote SHA matched. The new migration is uncommitted and has not been pushed.
- **Backlog:** 109 total; 44 Done, 1 In Progress, 4 Blocked, 60 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
