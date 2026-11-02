# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:38 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-005 — Privacy and retention policy`
- **Acceptance criteria:** Point-in-time location by default; document visibility and retention; provide employee access and correction; preserve required employment records.
- **Phase:** Planning
- **Current activity:** Inspecting existing attendance location, employee access/correction and record-retention behavior before defining the missing work.
- **Progress since previous report:** BB-RULES-001 passed all three criteria; feature commit `43ab17e9b03927f83db530a30f97df20cd58efd6` was pushed and its remote SHA matched. A network-disabled staged credential scan found no leaks.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** No BB-RULES-005 tests have run in this story yet. For the completed metadata story, seven affected pgTAP files passed **282/282** on acceptance, replay passed **98/98**, the upgrade fixture passed **5/5**, race/tenant integration passed **1/1**, targeted Node tests passed **13/13**, and four browser scenarios, lint, TypeScript and the split build passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Retention requirements and tenant-deletion behavior need investigation; no legal compliance or production backup retention is assumed. The legacy employment-type field can become stale when a future metadata event takes effect. Broader regression is required for workstream merge or release.
- **Failing tests:** None in the final BB-RULES-001 selected runs. BB-RULES-005 has not yet been tested.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Trace location collection, employee-visible records and corrections, immutable timekeeping and deletion/retention controls; implement any safe missing slice.
- **Latest development commit:** `43ab17e9b03927f83db530a30f97df20cd58efd6`
- **Push outcome:** Feature commit `43ab17e9b03927f83db530a30f97df20cd58efd6` was pushed; the remote SHA matched.
- **Backlog:** 109 total; 46 Done, 1 In Progress, 4 Blocked, 58 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.
